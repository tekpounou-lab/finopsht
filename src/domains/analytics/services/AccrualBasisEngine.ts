import { AccrualBasisSnapshot, DepartmentPerformance, EmployeeScorecard } from "../../../types/accrual-basis";
import { LedgerTransaction, PayrollRecord, Employee } from "../../../types";
import { resolveAnalyticsTxDate } from "../../../utils/dateNormalization";

export class AccrualBasisEngine {
  static async generateSnapshot(
    businessId: string,
    filters: Record<string, any>,
    ledgerTransactions: LedgerTransaction[] = [],
    payrollRecords: PayrollRecord[] = [],
    employees: Employee[] = []
  ): Promise<AccrualBasisSnapshot> {
    const startDate = filters.startDate || "";
    const endDate = filters.endDate || "";

    // Filter transactions by businessId, date range, and valid status
    const filteredTx = ledgerTransactions.filter((tx) => {
      const bId = tx.business_id || tx.businessId;
      if (!bId || bId !== businessId) return false;
      
      const d = resolveAnalyticsTxDate(tx, false);
      if (d) {
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
      }
      return true;
    });

    let revenueRecognized = 0;
    let expensesAccrued = 0;
    let cashRevenue = 0;
    let cashExpenses = 0;
    let cashPayroll = 0;
    let accountsReceivable = 0;
    let accountsPayable = 0;
    let cashBalance = 0;

    filteredTx.forEach((tx) => {
      // Exclude reversed, voided, or cancelled transactions from financial accumulation
      const statusUpper = (tx.status || "").toUpperCase();
      if (
        statusUpper === "REVERSED" ||
        statusUpper === "VOID" ||
        statusUpper === "VOIDED" ||
        statusUpper === "CANCELLED" ||
        (tx as any).is_reversed
      ) {
        return;
      }

      const amt =
        typeof tx.amount === "number" && !isNaN(tx.amount) && tx.amount !== 0 ? Math.abs(tx.amount) :
        typeof (tx as any).amount_htg === "number" && !isNaN((tx as any).amount_htg) && (tx as any).amount_htg !== 0 ? Math.abs((tx as any).amount_htg) :
        typeof (tx as any).amountHtg === "number" && !isNaN((tx as any).amountHtg) && (tx as any).amountHtg !== 0 ? Math.abs((tx as any).amountHtg) :
        typeof tx.amount_cents === "number" && !isNaN(tx.amount_cents) && tx.amount_cents !== 0 ? Math.abs(tx.amount_cents) / 100 :
        typeof (tx as any).amountCents === "number" && !isNaN((tx as any).amountCents) && (tx as any).amountCents !== 0 ? Math.abs((tx as any).amountCents) / 100 :
        typeof (tx as any).credit === "number" && !isNaN((tx as any).credit) && (tx as any).credit > 0 ? (tx as any).credit :
        typeof (tx as any).total === "number" && !isNaN((tx as any).total) && (tx as any).total !== 0 ? Math.abs((tx as any).total) : 0;

      const txType = (tx.type || "").toUpperCase();
      const catUpper = String(tx.category || (tx as any).category_name || "").toUpperCase();
      const creditAcc = String(tx.credit_account || (tx as any).creditAccount || "").toUpperCase();

      const isIncome =
        ["INCOME", "REVENUE", "SALES", "VENTE", "VENTES", "CREDIT"].includes(txType) ||
        catUpper.includes("INCOME") || catUpper.includes("REVENUE") || catUpper.includes("VENTE") || catUpper.includes("RECETTE") || catUpper.includes("SALES") ||
        creditAcc.startsWith("4") || creditAcc.startsWith("7") ||
        (typeof (tx as any).credit === "number" && (tx as any).credit > 0 && !(tx as any).debit && txType !== "EXPENSE" && txType !== "PAYROLL");

      const isExpense = txType === "EXPENSE" || catUpper.includes("OPEX") || catUpper.includes("EXPENSE") || catUpper.includes("RENT");
      const isPayrollTx = txType === "PAYROLL" || catUpper.includes("PAYROLL");

      if (isIncome) {
        revenueRecognized += amt;
        if (tx.debit_account?.includes("CASH") || tx.debit_account?.includes("BANK") || tx.debit_account === "1000_CASH" || tx.debit_account === "1010_BANK") {
          cashRevenue += amt;
        }
      }

      if (isExpense && !isPayrollTx) {
        expensesAccrued += amt;
        if (tx.credit_account?.includes("CASH") || tx.credit_account?.includes("BANK") || tx.credit_account === "1000_CASH" || tx.credit_account === "1010_BANK") {
          cashExpenses += amt;
        }
      }

      if (isPayrollTx) {
        if (tx.credit_account?.includes("CASH") || tx.credit_account?.includes("BANK") || tx.credit_account === "1000_CASH" || tx.credit_account === "1010_BANK") {
          cashPayroll += amt;
        }
      }

      // Track asset/liability balance components
      if (tx.debit_account?.includes("RECEIVABLES") || tx.debit_account === "1200_ACCOUNTS_RECEIVABLE") {
        accountsReceivable += amt;
      }
      if (tx.credit_account?.includes("RECEIVABLES") || tx.credit_account === "1200_ACCOUNTS_RECEIVABLE") {
        accountsReceivable -= amt;
      }
      if (tx.credit_account?.includes("PAYABLE") || tx.credit_account === "2000_ACCOUNTS_PAYABLE") {
        accountsPayable += amt;
      }
      if (tx.debit_account?.includes("PAYABLE") || tx.debit_account === "2000_ACCOUNTS_PAYABLE") {
        accountsPayable -= amt;
      }
      if (tx.debit_account?.includes("CASH") || tx.debit_account?.includes("BANK") || tx.debit_account === "1010_BANK") {
        cashBalance += amt;
      }
      if (tx.credit_account?.includes("CASH") || tx.credit_account?.includes("BANK") || tx.credit_account === "1010_BANK") {
        cashBalance -= amt;
      }
    });

    // Payroll accrued calculation strictly from payroll subledger
    let grossSalary = 0;
    let employerContributions = 0;
    let commissions = 0;
    let bonuses = 0;
    let payrollPaid = 0;

    const filteredPayroll = payrollRecords.filter((pr) => {
      const bId = pr.business_id || (pr as any).businessId;
      if (!bId || bId !== businessId) return false;
      if (pr.isExcluded) return false;
      const d = (pr.period_end || pr.endDate || pr.created_at || "").split("T")[0];
      if (d) {
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
      }
      return true;
    });

    filteredPayroll.forEach((pr) => {
      const g = pr.gross_salary_cents ? pr.gross_salary_cents / 100 : (pr.grossSalary || pr.baseSalary || 0);
      const erCnss = pr.cnss_employer_cents ? pr.cnss_employer_cents / 100 : 0;
      const erOfatma = pr.ofatma_employer_cents ? pr.ofatma_employer_cents / 100 : 0;
      const eTaxes = (erCnss + erOfatma) > 0 ? (erCnss + erOfatma) : ((pr as any).employerTaxes !== undefined ? (pr as any).employerTaxes : 0);
      const netP = pr.net_salary_cents ? pr.net_salary_cents / 100 : (pr.netPaid || 0);

      grossSalary += g;
      employerContributions += eTaxes;
      commissions += pr.commissions || (pr.commission_cents ? pr.commission_cents / 100 : 0);
      bonuses += (pr.bonuses_cents ? pr.bonuses_cents / 100 : ((pr as any).bonuses || 0));
      if (pr.status === "PAID" || pr.status === "SEALED" || pr.status === "APPROVED" || pr.status === "VALIDATED") {
        payrollPaid += netP;
      }
    });

    const payrollTotal = grossSalary + employerContributions + commissions + bonuses;
    const payrollPayable = Math.max(0, payrollTotal - payrollPaid);

    const netIncome = revenueRecognized - expensesAccrued - payrollTotal;
    const grossMargin = revenueRecognized > 0 ? Math.round(((revenueRecognized - expensesAccrued) / revenueRecognized) * 100) : 0;
    const operatingMargin = revenueRecognized > 0 ? Math.round((netIncome / revenueRecognized) * 100) : 0;
    
    // DEF-9C-05: Remediate EBITDA aliasing.
    // True EBITDA requires adding back Interest, Taxes, Depreciation, and Amortization.
    // In the current FINOPS General Ledger, depreciation and amortization accounts are not tracked
    // in operational subledgers. Aliasing netIncome to EBITDA is misleading.
    // Canonical metric is operatingResult (Résultat net d'exploitation).
    const operatingResult = netIncome;
    /** @deprecated DEF-9C-05: EBITDA is not calculated due to absence of D&A subledgers. Use operatingResult instead. */
    const ebitda = undefined;

    const workingCapital = {
      accountsReceivable: Math.max(0, accountsReceivable),
      accountsPayable: Math.max(0, accountsPayable),
      cash: cashBalance,
      total: cashBalance + Math.max(0, accountsReceivable) - Math.max(0, accountsPayable)
    };

    // Department performance dynamic calculation
    const departmentMap = new Map<string, DepartmentPerformance>();
    filteredPayroll.forEach((pr) => {
      const deptId = pr.department_id || (pr as any).departmentId || "unassigned";
      const deptName = (pr as any).departmentName || deptId;
      const existing = departmentMap.get(deptId) || {
        departmentId: deptId,
        departmentName: deptName,
        revenue: 0,
        expenses: 0,
        payroll: 0,
        netIncome: 0,
        margin: 0
      };
      const g = pr.gross_salary_cents ? pr.gross_salary_cents / 100 : (pr.grossSalary || pr.baseSalary || 0);
      const erCnss = pr.cnss_employer_cents ? pr.cnss_employer_cents / 100 : 0;
      const erOfatma = pr.ofatma_employer_cents ? pr.ofatma_employer_cents / 100 : 0;
      const eTaxes = (erCnss + erOfatma) > 0 ? (erCnss + erOfatma) : ((pr as any).employerTaxes !== undefined ? (pr as any).employerTaxes : 0);
      existing.payroll += (g + eTaxes);
      departmentMap.set(deptId, existing);
    });

    const byDepartment: DepartmentPerformance[] = Array.from(departmentMap.values()).map((dept) => {
      dept.netIncome = dept.revenue - dept.expenses - dept.payroll;
      dept.margin = dept.revenue > 0 ? Math.round((dept.netIncome / dept.revenue) * 100) : 0;
      return dept;
    });

    // Employee Scorecard dynamic calculation
    const byEmployee: EmployeeScorecard[] = employees.map((emp) => {
      const empPayroll = filteredPayroll.filter((pr) => pr.employee_id === emp.id || pr.employeeId === emp.id);
      let empGross = 0;
      let empEmployer = 0;
      let empComm = 0;
      empPayroll.forEach((pr) => {
        const g = pr.gross_salary_cents ? pr.gross_salary_cents / 100 : (pr.grossSalary || pr.baseSalary || 0);
        const erCnss = pr.cnss_employer_cents ? pr.cnss_employer_cents / 100 : 0;
        const erOfatma = pr.ofatma_employer_cents ? pr.ofatma_employer_cents / 100 : 0;
        const eTaxes = (erCnss + erOfatma) > 0 ? (erCnss + erOfatma) : ((pr as any).employerTaxes !== undefined ? (pr as any).employerTaxes : 0);
        empGross += g;
        empEmployer += eTaxes;
        empComm += pr.commissions || (pr.commission_cents ? pr.commission_cents / 100 : 0);
      });
      const totalCost = empGross + empEmployer + empComm;
      return {
        employeeId: emp.id,
        employeeName: emp.name || emp.displayName || emp.id,
        grossSalary: empGross,
        employerContributions: empEmployer,
        commissions: empComm,
        totalCost,
        productivityScore: empPayroll.length > 0 ? 100 : 0
      };
    });

    return {
      period: { startDate, endDate },
      revenueRecognized,
      expensesAccrued,
      payrollAccrued: {
        grossSalary,
        employerContributions,
        commissions,
        bonuses,
        total: payrollTotal,
        paid: payrollPaid,
        payable: payrollPayable
      },
      netIncome,
      operatingResult,
      grossMargin,
      operatingMargin,
      ebitda,
      workingCapital,
      byDepartment,
      byEmployee,
      reconciliation: {
        cashRevenue,
        accrualRevenue: revenueRecognized,
        varianceRevenue: revenueRecognized - cashRevenue,
        cashPayroll,
        accrualPayroll: payrollTotal,
        variancePayroll: payrollTotal - cashPayroll,
        cashExpenses,
        accrualExpenses: expensesAccrued,
        varianceExpenses: expensesAccrued - cashExpenses
      }
    };
  }
}
