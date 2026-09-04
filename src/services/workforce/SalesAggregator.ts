import { LedgerTransaction } from "../../types";

export interface DepartmentSalesSummary {
  departmentId: string;
  salesAmount: number;
  transactionCount: number;
}

export class SalesAggregator {
  static getEligibleTransactions(
    employeeId: string,
    transactions: LedgerTransaction[],
    startDate?: string,
    endDate?: string,
    employeeEmail?: string,
    draftSummaryId?: string
  ): LedgerTransaction[] {
    if (!employeeId || !transactions || transactions.length === 0) {
      return [];
    }

    const toDateKey = (rawDate: any): string => {
      if (!rawDate) return "";
      if (typeof rawDate === "string") {
        if (rawDate.includes("T")) return rawDate.split("T")[0];
        if (rawDate.includes(" ")) return rawDate.split(" ")[0];
        return rawDate.trim();
      }
      try {
        return new Date(rawDate).toISOString().split("T")[0];
      } catch {
        return String(rawDate).substring(0, 10);
      }
    };

    const startKey = startDate ? toDateKey(startDate) : "";
    const endKey = endDate ? toDateKey(endDate) : "";

    return transactions.filter((t) => {
      const matchEmpId = (
        t.employeeId === employeeId ||
        (t as any).employee_id === employeeId ||
        t.metadata?.employeeId === employeeId ||
        t.metadata?.employee_id === employeeId
      );

      const matchEmail = employeeEmail ? (
        (t as any).employeeEmail === employeeEmail ||
        (t as any).employee_email === employeeEmail ||
        (t as any).user_email === employeeEmail ||
        (t as any).email === employeeEmail ||
        t.metadata?.employeeEmail === employeeEmail ||
        t.metadata?.employee_email === employeeEmail
      ) : false;

      if (!matchEmpId && !matchEmail) return false;

      if (draftSummaryId) {
        if (t.commission_claimed === true && t.commission_summary_id !== draftSummaryId) {
          return false;
        }
      }

      const categoryUpper = (t.category || "").toUpperCase();
      const typeUpper = (t.type || "").toUpperCase();
      const isRevenue = (
        typeUpper === "INCOME" || 
        typeUpper === "SALES" || 
        typeUpper === "REVENUE" || 
        categoryUpper === "REVENUE" || 
        categoryUpper === "SALES" || 
        categoryUpper === "VENTES" ||
        categoryUpper === "INCOME"
      );

      const isPosted = t.status === "POSTED" || t.status === undefined || t.status === null;

      if (!isRevenue || !isPosted) return false;

      const txDateKey = toDateKey(t.date);
      if (startKey && txDateKey < startKey) return false;
      if (endKey && txDateKey > endKey) return false;

      return true;
    });
  }

  /**
   * Aggregates sales for an employee grouped strictly by department_id.

   * NO string matching, NO department text comparison. Strictly uses department_id.
   * Pipeline: Employee -> employee_id -> GL Transactions -> department_id -> Sales Aggregator
   */
  static aggregateSalesByEmployeeAndDept(
    employeeId: string,
    transactions: LedgerTransaction[],
    startDate?: string,
    endDate?: string,
    employeeEmail?: string,
    draftSummaryId?: string // If provided, only returns transactions that are unclaimed OR claimed by this draft
  ): Record<string, DepartmentSalesSummary> {
    const empSalesTxs = this.getEligibleTransactions(
      employeeId,
      transactions,
      startDate,
      endDate,
      employeeEmail,
      draftSummaryId
    );

    const salesByDept: Record<string, DepartmentSalesSummary> = {};
    empSalesTxs.forEach((t) => {
      // Group strictly by department_id
      const deptId = t.departmentId || t.department_id || "unassigned";
      const amt = t.amount || (t.amount_cents ? t.amount_cents / 100 : 0);
      if (!salesByDept[deptId]) {
        salesByDept[deptId] = {
          departmentId: deptId,
          salesAmount: 0,
          transactionCount: 0,
        };
      }
      salesByDept[deptId].salesAmount += amt;
      salesByDept[deptId].transactionCount += 1;
    });

    return salesByDept;
  }

  /**
   * Returns total sales amount aggregated across all departments for an employee_id.
   */
  static getTotalSalesForEmployee(
    employeeId: string,
    transactions: LedgerTransaction[],
    startDate?: string,
    endDate?: string,
    employeeEmail?: string
  ): number {
    const agg = this.aggregateSalesByEmployeeAndDept(employeeId, transactions, startDate, endDate, employeeEmail);
    return Object.values(agg).reduce((sum, item) => sum + item.salesAmount, 0);
  }
}
