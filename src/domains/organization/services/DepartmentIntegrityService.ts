import { collection, doc, setDoc, updateDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { Department, Employee, LedgerTransaction } from "../../../types";
import { resolveDepartmentName } from "../../../utils/nameResolvers";

export interface DepartmentIntegrityReport {
  businessId: string;
  missingStandardDepts: Array<{ id: string; name: string; code?: string }>;
  employeesWithInvalidDept: Array<{ employeeId: string; employeeName: string; rawDeptId?: string }>;
  transactionsWithInvalidDept: Array<{ transactionId: string; description: string; amount: number; rawDeptId?: string }>;
  totalViolationsCount: number;
  isIntegrityValid: boolean;
}

export interface IntegrityHealResult {
  success: boolean;
  createdDepartmentsCount: number;
  updatedEmployeesCount: number;
  updatedTransactionsCount: number;
  message: string;
}

/**
 * Standard Canonical Departments required for default enterprise mapping
 */
export const CANONICAL_STANDARD_DEPTS: Array<{ id: string; name: string; code: string }> = [
  { id: "d_admin", name: "Administration & Finance", code: "FIN" },
  { id: "d_oper", name: "Opérations & Logistique", code: "OPS" },
  { id: "d_sales", name: "Ventes & Marketing", code: "MKT" },
  { id: "d_hr", name: "Ressources Humaines", code: "HR" },
  { id: "d_tech", name: "Ingénierie & Technologie", code: "ENG" },
  { id: "d_b_k", name: "Barber Shop & Coiffure", code: "BAR" },
  { id: "d_nail", name: "Nail Studio & Beauté", code: "NAIL" },
  { id: "d_service", name: "Support Client & Service", code: "SUP" },
];

export class DepartmentIntegrityService {
  /**
   * Run an audit of Department Data Integrity across Structure, Employees, and General Ledger (GL)
   */
  public static auditIntegrity(
    businessId: string,
    departments: Department[],
    employees: Employee[],
    transactions: LedgerTransaction[]
  ): DepartmentIntegrityReport {
    const businessDepts = departments.filter((d) => d.business_id === businessId || !d.business_id);
    const existingDeptIds = new Set(businessDepts.map((d) => d.id));
    const existingDeptCodes = new Set(businessDepts.map((d) => (d.code || "").toUpperCase()));

    // 1. Identify missing canonical departments referenced in system
    const missingStandardDepts: Array<{ id: string; name: string; code?: string }> = [];
    for (const canon of CANONICAL_STANDARD_DEPTS) {
      if (!existingDeptIds.has(canon.id) && !existingDeptCodes.has(canon.code)) {
        // Check if any employee or GL tx references this department key or code
        const isReferencedInEmp = employees.some(
          (e) => (e.business_id === businessId || !e.business_id) &&
                 (e.departmentId === canon.id || (e as any).department_id === canon.id ||
                  e.departmentId === canon.code || (e as any).department_id === canon.code)
        );
        const isReferencedInTx = transactions.some(
          (t) => (t.business_id === businessId || !t.business_id) &&
                 (t.departmentId === canon.id || (t as any).department_id === canon.id ||
                  t.departmentId === canon.code || (t as any).department_id === canon.code)
        );

        if (isReferencedInEmp || isReferencedInTx || businessDepts.length === 0) {
          missingStandardDepts.push(canon);
        }
      }
    }

    // 2. Identify Employees with missing or unlinked Department IDs
    const employeesWithInvalidDept: Array<{ employeeId: string; employeeName: string; rawDeptId?: string }> = [];
    const businessEmployees = employees.filter((e) => e.business_id === businessId || !e.business_id);

    for (const emp of businessEmployees) {
      const rawDept = emp.departmentId || (emp as any).department_id;
      if (!rawDept || !existingDeptIds.has(rawDept)) {
        employeesWithInvalidDept.push({
          employeeId: emp.id,
          employeeName: emp.name,
          rawDeptId: rawDept,
        });
      }
    }

    // 3. Identify GL Transactions with missing or unlinked Department IDs
    const transactionsWithInvalidDept: Array<{ transactionId: string; description: string; amount: number; rawDeptId?: string }> = [];
    const businessTxs = transactions.filter((t) => t.business_id === businessId || !t.business_id);

    for (const tx of businessTxs) {
      const rawDept = tx.departmentId || (tx as any).department_id;
      if (!rawDept || !existingDeptIds.has(rawDept)) {
        transactionsWithInvalidDept.push({
          transactionId: tx.id,
          description: tx.description || "Order / Transaction GL",
          amount: tx.amount || 0,
          rawDeptId: rawDept,
        });
      }
    }

    const totalViolationsCount = missingStandardDepts.length + employeesWithInvalidDept.length + transactionsWithInvalidDept.length;

    return {
      businessId,
      missingStandardDepts,
      employeesWithInvalidDept,
      transactionsWithInvalidDept,
      totalViolationsCount,
      isIntegrityValid: totalViolationsCount === 0,
    };
  }

  /**
   * Helper to resolve a raw department key or code to a valid Department doc ID
   */
  public static resolveCanonicalDeptId(
    rawKey: string | undefined,
    availableDepts: Department[]
  ): string {
    if (!rawKey || rawKey.trim().length === 0 || rawKey.toLowerCase() === "unassigned") {
      // Return primary admin department or first available department
      const adminDept = availableDepts.find(
        (d) => d.id === "d_admin" || (d.code && d.code.toUpperCase() === "FIN") || d.name.toLowerCase().includes("admin")
      );
      return adminDept?.id || availableDepts[0]?.id || "d_admin";
    }

    const clean = rawKey.trim();
    const cleanLower = clean.toLowerCase();

    // Direct match by ID
    const directMatch = availableDepts.find((d) => d.id === clean || d.id.toLowerCase() === cleanLower);
    if (directMatch) return directMatch.id;

    // Code match
    const codeMatch = availableDepts.find((d) => d.code && d.code.toUpperCase() === clean.toUpperCase());
    if (codeMatch) return codeMatch.id;

    // Substring / Name match
    const resolvedName = resolveDepartmentName(clean, undefined, availableDepts);
    const nameMatch = availableDepts.find((d) => d.name.toLowerCase() === resolvedName.toLowerCase());
    if (nameMatch) return nameMatch.id;

    // Fallback match to canonical mapping
    if (cleanLower.includes("admin") || cleanLower.includes("fin") || cleanLower === "d1") {
      const target = availableDepts.find((d) => d.id === "d_admin" || d.code === "FIN" || d.name.includes("Admin"));
      if (target) return target.id;
    } else if (cleanLower.includes("eng") || cleanLower.includes("tech") || cleanLower.includes("dev")) {
      const target = availableDepts.find((d) => d.id === "d_tech" || d.code === "ENG" || d.name.includes("Ingénierie"));
      if (target) return target.id;
    } else if (cleanLower.includes("barber") || cleanLower.includes("dbk") || cleanLower.includes("d_b_k")) {
      const target = availableDepts.find((d) => d.id === "d_b_k" || d.code === "BAR" || d.name.includes("Barber"));
      if (target) return target.id;
    }

    return availableDepts[0]?.id || "d_admin";
  }

  /**
   * Auto-heal and normalize data integrity across Structure, Employees, and GL (Ledger Transactions)
   */
  public static async autoHealIntegrity(
    businessId: string,
    departments: Department[],
    employees: Employee[],
    transactions: LedgerTransaction[]
  ): Promise<IntegrityHealResult> {
    try {
      let createdDepartmentsCount = 0;
      let updatedEmployeesCount = 0;
      let updatedTransactionsCount = 0;

      const currentDepts = [...departments.filter((d) => d.business_id === businessId || !d.business_id)];
      const existingDeptIds = new Set(currentDepts.map((d) => d.id));

      // 1. Ensure Standard Canonical Departments exist in Firestore
      for (const canon of CANONICAL_STANDARD_DEPTS) {
        if (!existingDeptIds.has(canon.id)) {
          const newDeptDoc: Department = {
            id: canon.id,
            business_id: businessId,
            name: canon.name,
            code: canon.code,
            is_active: true,
            createdAt: new Date().toISOString(),
          };
          await setDoc(doc(db, "departments", canon.id), newDeptDoc);
          currentDepts.push(newDeptDoc);
          existingDeptIds.add(canon.id);
          createdDepartmentsCount++;
        }
      }

      // If still no departments, create default Administration & Finance
      if (currentDepts.length === 0) {
        const defaultDept: Department = {
          id: "d_admin",
          business_id: businessId,
          name: "Administration & Finance",
          code: "FIN",
          is_active: true,
          createdAt: new Date().toISOString(),
        };
        await setDoc(doc(db, "departments", "d_admin"), defaultDept);
        currentDepts.push(defaultDept);
        existingDeptIds.add("d_admin");
        createdDepartmentsCount++;
      }

      // 2. Normalize Employee department assignments
      const empMap = new Map<string, Employee>();
      for (const emp of employees) {
        if (emp.business_id && emp.business_id !== businessId) continue;
        empMap.set(emp.id, emp);

        const rawDept = emp.departmentId || (emp as any).department_id;
        const targetDeptId = this.resolveCanonicalDeptId(rawDept, currentDepts);

        if (emp.departmentId !== targetDeptId || (emp as any).department_id !== targetDeptId) {
          await updateDoc(doc(db, "employees", emp.id), {
            departmentId: targetDeptId,
            department_id: targetDeptId,
            updatedAt: new Date().toISOString(),
          });
          emp.departmentId = targetDeptId;
          (emp as any).department_id = targetDeptId;
          updatedEmployeesCount++;
        }
      }

      // 3. Normalize GL Transactions department assignments
      for (const tx of transactions) {
        if (tx.business_id && tx.business_id !== businessId) continue;

        let targetDeptId: string | undefined = undefined;

        const rawDept = tx.departmentId || (tx as any).department_id;
        if (rawDept && existingDeptIds.has(rawDept)) {
          targetDeptId = rawDept;
        } else if (tx.employeeId && empMap.has(tx.employeeId)) {
          // Inherit from linked employee
          const linkedEmp = empMap.get(tx.employeeId);
          targetDeptId = linkedEmp?.departmentId || (linkedEmp as any)?.department_id;
        }

        if (!targetDeptId || !existingDeptIds.has(targetDeptId)) {
          targetDeptId = this.resolveCanonicalDeptId(rawDept, currentDepts);
        }

        if (tx.departmentId !== targetDeptId || (tx as any).department_id !== targetDeptId) {
          await updateDoc(doc(db, "ledger_transactions", tx.id), {
            departmentId: targetDeptId,
            department_id: targetDeptId,
            updated_at: new Date().toISOString(),
          });
          tx.departmentId = targetDeptId;
          (tx as any).department_id = targetDeptId;
          updatedTransactionsCount++;
        }
      }

      return {
        success: true,
        createdDepartmentsCount,
        updatedEmployeesCount,
        updatedTransactionsCount,
        message: `Intégrité des données synchronisée avec succès : ${createdDepartmentsCount} départements créés, ${updatedEmployeesCount} employés mis à jour, ${updatedTransactionsCount} ordres GL normalisés.`,
      };
    } catch (error: any) {
      console.error("[DepartmentIntegrityService] Auto-heal failed:", error);
      return {
        success: false,
        createdDepartmentsCount: 0,
        updatedEmployeesCount: 0,
        updatedTransactionsCount: 0,
        message: `Erreur lors de la synchronisation d'intégrité : ${error.message || error}`,
      };
    }
  }

  /**
   * Updates department details and synchronizes all linked employees and GL records
   */
  public static async updateDepartmentAndCascade(
    departmentId: string,
    businessId: string,
    data: { name: string; code?: string },
    employees: Employee[],
    transactions: LedgerTransaction[]
  ): Promise<void> {
    const trimmedName = data.name.trim();
    const trimmedCode = data.code ? data.code.trim().toUpperCase() : undefined;

    // 1. Update department record in Firestore
    await updateDoc(doc(db, "departments", departmentId), {
      name: trimmedName,
      code: trimmedCode,
      updated_at: new Date().toISOString(),
    });

    // 2. Refresh cached employees and transactions referencing this departmentId
    for (const emp of employees) {
      if (emp.departmentId === departmentId || (emp as any).department_id === departmentId) {
        // Ensure departmentId field is set cleanly
        await updateDoc(doc(db, "employees", emp.id), {
          departmentId,
          department_id: departmentId,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    for (const tx of transactions) {
      if (tx.departmentId === departmentId || (tx as any).department_id === departmentId) {
        await updateDoc(doc(db, "ledger_transactions", tx.id), {
          departmentId,
          department_id: departmentId,
          updated_at: new Date().toISOString(),
        });
      }
    }
  }
}
