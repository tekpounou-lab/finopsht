import { Employee, Department, LedgerTransaction } from "../../../types";
import { DepartmentAliasEngine, DepartmentMatchResult } from "./DepartmentAliasEngine";
import { DepartmentAssignmentEngine } from "./DepartmentAssignmentEngine";

export interface DepartmentAuditItem {
  rawDepartmentString: string;
  employeeCount: number;
  transactionCount: number;
  matchResult: DepartmentMatchResult;
  status: "MATCHED" | "REQUIRES_REVIEW" | "UNRESOLVED";
  recommendedTargetDepartmentId?: string;
  recommendedTargetDepartmentName?: string;
}

export interface DepartmentMigrationAuditReport {
  totalEmployeesAudited: number;
  totalTransactionsAudited: number;
  uniqueDepartmentStringsFound: number;
  items: DepartmentAuditItem[];
  matchedCount: number;
  requiresReviewCount: number;
  unresolvedCount: number;
  generatedAt: string;
}

export class DepartmentMigrationAuditService {
  /**
   * Audits existing employee and transaction data against the departments SSOT collection.
   * Generates a comprehensive migration audit report without modifying any data.
   */
  public static generateAuditReport(
    employees: Employee[],
    transactions: LedgerTransaction[],
    departments: Department[]
  ): DepartmentMigrationAuditReport {
    const departmentStringStats = new Map<string, { empCount: number; txCount: number }>();

    // 1. Scan Employees
    for (const emp of employees) {
      const rawDept = emp.departmentId || (emp as any).department_id || (emp as any).department_name;
      if (rawDept) {
        const key = rawDept.trim();
        const stat = departmentStringStats.get(key) || { empCount: 0, txCount: 0 };
        stat.empCount++;
        departmentStringStats.set(key, stat);
      }
    }

    // 2. Scan Transactions
    for (const tx of transactions) {
      const rawDept = tx.departmentId || (tx as any).department_id || (tx as any).department_name;
      if (rawDept) {
        const key = rawDept.trim();
        const stat = departmentStringStats.get(key) || { empCount: 0, txCount: 0 };
        stat.txCount++;
        departmentStringStats.set(key, stat);
      }
    }

    // 3. Process Audit Items
    const items: DepartmentAuditItem[] = [];
    let matchedCount = 0;
    let requiresReviewCount = 0;
    let unresolvedCount = 0;

    departmentStringStats.forEach((stat, rawString) => {
      const match = DepartmentAliasEngine.resolveDepartmentWithDetails(departments, rawString);
      let status: "MATCHED" | "REQUIRES_REVIEW" | "UNRESOLVED" = "UNRESOLVED";

      if (match.department) {
        if (match.confidence === "EXACT_ID" || match.confidence === "EXACT_CODE" || match.confidence === "EXACT_NAME" || match.confidence === "ALIAS_MATCH") {
          status = "MATCHED";
          matchedCount++;
        } else {
          status = "REQUIRES_REVIEW";
          requiresReviewCount++;
        }
      } else {
        status = "UNRESOLVED";
        unresolvedCount++;
      }

      items.push({
        rawDepartmentString: rawString,
        employeeCount: stat.empCount,
        transactionCount: stat.txCount,
        matchResult: match,
        status,
        recommendedTargetDepartmentId: match.department?.id,
        recommendedTargetDepartmentName: match.department?.name
      });
    });

    // Sort items: UNRESOLVED & REQUIRES_REVIEW first, then by count
    items.sort((a, b) => {
      const priority = { UNRESOLVED: 0, REQUIRES_REVIEW: 1, MATCHED: 2 };
      if (priority[a.status] !== priority[b.status]) {
        return priority[a.status] - priority[b.status];
      }
      return (b.employeeCount + b.transactionCount) - (a.employeeCount + a.transactionCount);
    });

    return {
      totalEmployeesAudited: employees.length,
      totalTransactionsAudited: transactions.length,
      uniqueDepartmentStringsFound: items.length,
      items,
      matchedCount,
      requiresReviewCount,
      unresolvedCount,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Applies validated department mappings to historical employee and transaction data.
   * MUST only be called after explicit Owner/Admin confirmation.
   */
  public static applyValidatedMappings(
    employees: Employee[],
    transactions: LedgerTransaction[],
    mappings: Record<string, string> // Map rawDepartmentString -> validated department_id
  ): { updatedEmployees: Employee[]; updatedTransactions: LedgerTransaction[]; migratedEmpCount: number; migratedTxCount: number } {
    let migratedEmpCount = 0;
    let migratedTxCount = 0;

    const updatedEmployees = employees.map(emp => {
      const rawDept = emp.departmentId || (emp as any).department_id;
      if (rawDept && mappings[rawDept]) {
        const targetDeptId = mappings[rawDept];
        migratedEmpCount++;
        return DepartmentAssignmentEngine.setPrimaryDepartment(emp, targetDeptId);
      }
      return emp;
    });

    const updatedTransactions = transactions.map(tx => {
      const rawDept = tx.departmentId || (tx as any).department_id;
      if (rawDept && mappings[rawDept]) {
        migratedTxCount++;
        return {
          ...tx,
          departmentId: mappings[rawDept],
          department_id: mappings[rawDept]
        };
      }
      return tx;
    });

    return {
      updatedEmployees,
      updatedTransactions,
      migratedEmpCount,
      migratedTxCount
    };
  }
}
