import { collection, query, where, getDocs, setDoc, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { ReferenceResolver } from "../ReferenceResolver";
import { Employee, LedgerTransaction, Department, EmployeeDepartmentActivity, PayrollRecord } from "../../types";
import { TransactionDeduplicationService } from "../analytics/TransactionDeduplicationService";

export class EmployeeOperationalAttributionService {
  /**
   * Rebuilds the employee_department_activity collection completely for a business
   * strictly from GL Transactions (where type is INCOME or matching sales category).
   * NO Employee.department_id is used. Everything is based on GL transactional attribution.
   */
  public static async rebuildAttributions(
    businessId: string,
    employees: Employee[],
    transactions: LedgerTransaction[],
    departments: Department[],
    payrollRecords: PayrollRecord[] = []
  ): Promise<EmployeeDepartmentActivity[]> {
    console.log(`[EmployeeOperationalAttributionService] Rebuilding operational attributions for ${businessId}...`);

    // 1. Filter GL transactions for this business and exclude reversed
    const businessTxs = transactions.filter(
      (t) => (!t.business_id || t.business_id === businessId) && t.status !== "REVERSED"
    );

    // Filter income/sales
    const salesTxs = businessTxs.filter((t) => {
      const typeUpper = (t.type || "").toUpperCase();
      const catUpper = (t.category || "").toUpperCase();
      return (
        typeUpper === "INCOME" ||
        typeUpper === "SALES" ||
        typeUpper === "REVENUE" ||
        catUpper === "REVENUE" ||
        catUpper === "SALES" ||
        catUpper === "VENTES" ||
        catUpper === "INCOME"
      );
    });

    // 2. Map of aggregates keyed by `${employee_id}_${department_id}`
    const aggregates: Record<string, EmployeeDepartmentActivity> = {};

    for (const tx of salesTxs) {
      // 2a. Deduplication check using TransactionDeduplicationService
      const fingerprint = TransactionDeduplicationService.generateTransactionFingerprint(tx);
      const isDuplicate = await TransactionDeduplicationService.isTransactionDuplicate(businessId, fingerprint);
      if (isDuplicate) {
        console.warn(`[EmployeeOperationalAttributionService] Duplicate transaction skipped: ${tx.id || fingerprint}`);
        continue;
      }

      // Resolve employee strictly using Employee Resolver (ReferenceResolver)
      const queryEmp = tx.employeeId || tx.employee_id || tx.employee_email || tx.employeeName || tx.employee_name;
      const queryEmpStr = queryEmp ? String(queryEmp) : "";
      
      const { employee: resolvedEmp, confidence, matches } = ReferenceResolver.resolveEmployeeWithConfidence(queryEmpStr, employees);

      if (!resolvedEmp) {
        continue; // Skip if we cannot resolve the employee
      }

      // Flag if confidence is less than 80%
      if (confidence < 0.8) {
        try {
          const docRef = doc(collection(db, "analytics_anomalies"));
          await setDoc(docRef, {
            id: docRef.id,
            businessId,
            business_id: businessId,
            transactionId: tx.id || "",
            type: "LOW_CONFIDENCE_RESOLVER",
            description: `Employee resolution confidence is low (${Math.round(confidence * 100)}%) for query "${queryEmpStr}". Matches: ${matches.map(m => m.name).join(", ")}`,
            suggestedFix: `Manually review and reassign transaction to the correct employee`,
            createdAt: new Date().toISOString()
          });
        } catch (e) {
          console.error("[EmployeeOperationalAttributionService] Error logging anomaly:", e);
        }
      }

      // Resolve department strictly using resolveDepartment
      const queryDept = tx.departmentId || tx.department_id || tx.department_code || tx.department_name;
      const resolvedDept = ReferenceResolver.resolveDepartment(departments, queryDept);

      if (!resolvedDept) {
        continue; // Skip if we cannot resolve the operational department
      }

      const empId = resolvedEmp.id;
      const deptId = resolvedDept.id;
      const key = `${empId}_${deptId}`;

      const dateStr = tx.date ? new Date(tx.date).toISOString() : new Date().toISOString();
      const amount = tx.amount || (tx.amount_cents ? tx.amount_cents / 100 : 0);

      // Determine commission for this transaction (metadata commission, or fallback to employee rate)
      let comm = (tx.metadata as any)?.commission_calculated || 0;
      if (!comm) {
        const commRate = resolvedEmp.commissionRate ?? resolvedEmp.commission_rate ?? 5; // default 5%
        comm = amount * (commRate / 100);
      }

      if (!aggregates[key]) {
        aggregates[key] = {
          id: key,
          business_id: businessId,
          businessId: businessId,
          employee_id: empId,
          employeeId: empId,
          employeeName: resolvedEmp.name,
          department_id: deptId,
          departmentId: deptId,
          department_name: resolvedDept.name,
          departmentName: resolvedDept.name,
          branch_id: resolvedDept.branch_id || resolvedEmp.branchId || "main",
          branchId: resolvedDept.branch_id || resolvedEmp.branchId || "main",
          branchName: resolvedDept.branch_id || resolvedEmp.branchId || "Main Branch",
          first_sale_at: dateStr,
          last_sale_at: dateStr,
          sales_count: 0,
          salesAmount: 0,
          sales_amount: 0,
          commission_amount: 0,
          commissionAmount: 0,
          serviceHours: 0,
          last_payroll_cycle: "",
          lastPayrollCycle: "",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      const current = aggregates[key];
      current.sales_count += 1;
      current.sales_amount += amount;
      current.salesAmount = current.sales_amount;
      current.commission_amount += comm;
      current.commissionAmount = current.commission_amount;

      if (new Date(dateStr) < new Date(current.first_sale_at)) {
        current.first_sale_at = dateStr;
      }
      if (new Date(dateStr) > new Date(current.last_sale_at)) {
        current.last_sale_at = dateStr;
      }

      // Mark transaction processed with fingerprint
      await TransactionDeduplicationService.markTransactionProcessed(businessId, tx.id || fingerprint, fingerprint);
    }

    // 3. Resolve last payroll cycle for each aggregate if payrollRecords are available
    for (const key of Object.keys(aggregates)) {
      const agg = aggregates[key];
      const empPayrolls = payrollRecords.filter(
        (p) => p.employeeId === agg.employee_id || p.employee_id === agg.employee_id
      );
      if (empPayrolls.length > 0) {
        // Sort by generation date or cycle ID descending to find last
        const sortedPayrolls = [...empPayrolls].sort((a, b) => {
          const dateA = a.generated_at || "";
          const dateB = b.generated_at || "";
          return dateB.localeCompare(dateA);
        });
        agg.last_payroll_cycle = sortedPayrolls[0].cycleId;
      }
    }

    // 4. Save aggregates to the employee_department_activity collection in Firestore
    const results = Object.values(aggregates);
    for (const agg of results) {
      const docRef = doc(db, "employee_department_activity", agg.id!);
      await setDoc(docRef, agg, { merge: true });
    }

    console.log(`[EmployeeOperationalAttributionService] Successfully rebuilt and saved ${results.length} operational attributions.`);
    return results;
  }

  /**
   * Fetches all employee department activity records for a given business.
   */
  public static async fetchAttributions(businessId: string): Promise<EmployeeDepartmentActivity[]> {
    try {
      const q = query(
        collection(db, "employee_department_activity"),
        where("business_id", "==", businessId)
      );
      const snap = await getDocs(q);
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as EmployeeDepartmentActivity));
    } catch (error) {
      console.error("[EmployeeOperationalAttributionService] Error fetching attributions:", error);
      return [];
    }
  }
}
