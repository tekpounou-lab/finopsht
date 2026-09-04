import { db } from "../../lib/firebase";
import { doc, getDoc, setDoc, getDocs, collection, query, where } from "firebase/firestore";
import { Employee, LedgerTransaction, PayrollCycle, EmployeeSalesSummary } from "../../types";
import { SalesAggregator } from "./SalesAggregator";
import { CommissionEngine } from "../CommissionEngine";

export const EmployeeSalesSummaryService = {
  /**
   * Generates or fetches an EmployeeSalesSummary for a specific employee & payroll cycle.
   * If an existing frozen summary exists, it returns the frozen state to preserve SSOT.
   */
  async generateOrFetchSummary(params: {
    businessId: string;
    cycle: PayrollCycle;
    employee: Employee;
    transactions: LedgerTransaction[];
    contract?: any;
    activePlans?: any[];
  }): Promise<EmployeeSalesSummary> {
    const { businessId, cycle, employee, transactions, contract, activePlans = [] } = params;
    const summaryId = `ess_${businessId}_${cycle.id}_${employee.id}`;

    // 1. Check if frozen summary already exists in Firestore
    try {
      const snapRef = doc(db, "employee_sales_summary", summaryId);
      const snap = await getDoc(snapRef);
      if (snap.exists()) {
        const existing = snap.data() as EmployeeSalesSummary;
        if (existing.is_frozen) {
          return existing;
        }
      }
    } catch (e) {
      console.warn("Could not check employee_sales_summary from Firestore, computing dynamically:", e);
    }

    const startDate = cycle.startDate || cycle.start_date || "2000-01-01";
    const endDate = cycle.endDate || cycle.end_date || "3000-12-31";

    // 2. Fetch Eligible Transactions (Unclaimed or claimed by THIS summary ID)
    const eligibleTxs = SalesAggregator.getEligibleTransactions(
      employee.id,
      transactions,
      startDate,
      endDate,
      employee.email,
      summaryId
    );
    const includedTransactionIds = eligibleTxs.map(t => t.id);

    // 3. Calculate Commissions Transaction-by-Transaction to support effective-dated rates
    const salesByDept: Record<string, { departmentId: string; salesAmount: number; transactionCount: number }> = {};
    let totalCommission = 0;
    
    // Store the fallback/current rate for the summary metadata
    const currentRateDecimal = CommissionEngine.resolveCommissionRate(employee, contract);

    eligibleTxs.forEach(t => {
      const deptId = t.departmentId || t.department_id || "unassigned";
      const amt = t.amount || (t.amount_cents ? t.amount_cents / 100 : 0);
      
      if (!salesByDept[deptId]) {
        salesByDept[deptId] = { departmentId: deptId, salesAmount: 0, transactionCount: 0 };
      }
      salesByDept[deptId].salesAmount += amt;
      salesByDept[deptId].transactionCount += 1;

      // Temporal rate resolution based on the exact sale date
      const txDate = t.date ? t.date.split('T')[0] : startDate;
      const temporalRate = CommissionEngine.resolveCommissionRate(employee, contract, txDate);
      
      const commResult = CommissionEngine.calculateTransactionCommission(
        amt,
        t.category || "REVENUE",
        deptId,
        activePlans,
        (employee as any).commissionPlanId || (employee as any).commission_plan_id,
        temporalRate
      );
      
      totalCommission += commResult.commissionAmount;
    });

    const grossSales = Object.values(salesByDept).reduce((sum, s) => sum + s.salesAmount, 0);
    const transactionCount = eligibleTxs.length;

    const isFrozen = cycle.status === "LOCKED" || cycle.status === "PAID";

    const summary: EmployeeSalesSummary = {
      id: summaryId,
      business_id: businessId,
      payroll_cycle_id: cycle.id,
      employee_id: employee.id,
      employee_email: employee.email,
      included_transaction_ids: includedTransactionIds,
      gross_sales: Number(grossSales.toFixed(2)),
      transaction_count: transactionCount,
      department_breakdown: salesByDept,
      commission_rate: currentRateDecimal,
      calculated_commission: Number(totalCommission.toFixed(2)),
      generated_at: new Date().toISOString(),
      is_frozen: isFrozen
    };

    // Save summary asynchronously to Firestore
    try {
      await setDoc(doc(db, "employee_sales_summary", summaryId), summary);
      
      // If cycle is frozen, we should ideally mark these specific transactions as claimed in the Ledger.
      // In this version, we will assume a separate job or the LedgerRepository updates `commission_claimed`.
      // The `included_transaction_ids` allows us to securely know which ones to mark.
    } catch (e) {
      console.warn("Failed saving employee_sales_summary to Firestore:", e);
    }

    return summary;
  },

  /**
   * Batch fetches sales summaries for all employees in a cycle
   */
  async getCycleSalesSummaries(businessId: string, cycleId: string): Promise<EmployeeSalesSummary[]> {
    try {
      const q = query(
        collection(db, "employee_sales_summary"),
        where("business_id", "==", businessId),
        where("payroll_cycle_id", "==", cycleId)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data() as EmployeeSalesSummary);
    } catch {
      return [];
    }
  }
};
