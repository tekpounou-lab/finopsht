import { AccrualBasisSnapshot, DepartmentPerformance, EmployeeScorecard } from "../../../types/accrual-basis";
import { LedgerTransaction, PayrollRecord, Employee, PayrollCycle } from "../../../types";
import { resolveAnalyticsTxDate, resolveAnalyticsPayrollDate, toDateOnly } from "../../../utils/dateNormalization";
import { TaxPolicyEngine } from "../../../services/payroll/TaxPolicyEngine";

export interface AccrualBasisOptions {
  businessSettings?: any;
  payrollCycles?: PayrollCycle[];
}

export class AccrualBasisEngine {
  private static getProrationFactor(
    pr: any,
    startDate: string,
    endDate: string,
    cycleMap: Map<string, PayrollCycle>
  ): number {
    if (!startDate || !endDate) return 1;
    const cycleId = pr.cycleId || pr.payroll_cycle_id;
    const cycle = cycleId ? cycleMap.get(cycleId) : undefined;
    const rawStart = pr.period_start || pr.periodStart || pr.startDate || cycle?.startDate || (cycle as any)?.start_date;
    const rawEnd = pr.period_end || pr.periodEnd || pr.endDate || cycle?.endDate || (cycle as any)?.end_date;

    const pStart = toDateOnly(rawStart);
    const pEnd = toDateOnly(rawEnd);
    if (!pStart || !pEnd) {
      const fallback = resolveAnalyticsPayrollDate(pr, false);
      if (!fallback) return 0;
      return fallback >= startDate && fallback <= endDate ? 1 : 0;
    }

    const rStartMs = new Date(startDate + "T00:00:00Z").getTime();
    const rEndMs = new Date(endDate + "T00:00:00Z").getTime();
    const pStartMs = new Date(pStart + "T00:00:00Z").getTime();
    const pEndMs = new Date(pEnd + "T00:00:00Z").getTime();

    if (isNaN(rStartMs) || isNaN(rEndMs) || isNaN(pStartMs) || isNaN(pEndMs)) return 1;
    if (pEndMs < rStartMs || pStartMs > rEndMs) return 0;

    const overlapStart = Math.max(pStartMs, rStartMs);
    const overlapEnd = Math.min(pEndMs, rEndMs);
    const overlapDays = Math.floor((overlapEnd - overlapStart) / 86400000) + 1;
    const totalDays = Math.max(1, Math.floor((pEndMs - pStartMs) / 86400000) + 1);
    return Math.min(1, Math.max(0, overlapDays / totalDays));
  }

  static async generateSnapshot(
    businessId: string,
    filters: Record<string, any>,
    ledgerTransactions: LedgerTransaction[] = [],
    payrollRecords: PayrollRecord[] = [],
    employees: Employee[] = [],
    options?: AccrualBasisOptions
  ): Promise<AccrualBasisSnapshot> {
    const startDate = filters.startDate || "";
    const endDate = filters.endDate || "";
    const branchId = filters.branchId && filters.branchId !== "ALL" ? filters.branchId : "";
    const departmentId = filters.departmentId && filters.departmentId !== "ALL" ? filters.departmentId : "";
    const employeeId = filters.employeeId && filters.employeeId !== "ALL" ? filters.employeeId : "";
    const transactionType = filters.transactionType && filters.transactionType !== "ALL" ? filters.transactionType : "";

    const isSocialTaxEnabled = options?.businessSettings
      ? TaxPolicyEngine.isSocialTaxEnabled(options.businessSettings)
      : true;

    const cycleMap = new Map<string, PayrollCycle>();
    (options?.payrollCycles || []).forEach((c) => {
      if (c?.id) cycleMap.set(c.id, c);
    });

    const empBranchMap = new Map<string, string>();
    const empDeptMap = new Map<string, string>();
    (employees || []).forEach((e) => {
      if (!e?.id) return;
      const b = e.branchId || (e as any).branch_id;
      const d = e.departmentId || (e as any).department_id;
      if (b) empBranchMap.set(e.id, b);
      if (d) empDeptMap.set(e.id, d);
    });

    // Filter transactions by businessId, structural scope, date range, and valid status
    const filteredTx = ledgerTransactions.filter((tx) => {
      const bId = tx.business_id || tx.businessId;
      if (!bId || bId !== businessId) return false;

      const txEmpId = tx.employeeId || (tx as any).employee_id;
      const txBranch = tx.branchId || (tx as any).branch_id || (tx as any).cost_center_id || (txEmpId ? empBranchMap.get(txEmpId) : undefined);
      const txDept = tx.departmentId || (tx as any).department_id || (tx as any).department || (txEmpId ? empDeptMap.get(txEmpId) : undefined);

      if (branchId && (!txBranch || txBranch !== branchId)) return false;
      if (departmentId && (!txDept || txDept !== departmentId)) return false;
      if (employeeId && (!txEmpId || txEmpId !== employeeId)) return false;
      if (transactionType && tx.type !== transactionType && (tx as any).category !== transactionType) return false;

      const d = resolveAnalyticsTxDate(tx, false);
      if (startDate || endDate) {
        if (!d) return false;
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

      const isExpense = txType === "EXPENSE" || txType === "PENALTY" || catUpper.includes("OPEX") || catUpper.includes("EXPENSE") || catUpper.includes("RENT");
      const isPayrollTx = txType === "PAYROLL" || catUpper.includes("PAYROLL");

      if (isIncome) {
        revenueRecognized += amt;
        if (tx.debit_account?.includes("CASH") || tx.debit_account?.includes("BANK") || tx.debit_account === "1000_CASH" || tx.debit_account === "1010_BANK") {
          cashRevenue += amt;
        }
      }

      if (isExpense && !isPayrollTx) {
        if (txType === "PENALTY") {
          expensesAccrued -= amt;
          if (tx.credit_account?.includes("CASH") || tx.credit_account?.includes("BANK") || tx.credit_account === "1000_CASH" || tx.credit_account === "1010_BANK") {
            cashExpenses -= amt;
          }
        } else {
          expensesAccrued += amt;
          if (tx.credit_account?.includes("CASH") || tx.credit_account?.includes("BANK") || tx.credit_account === "1000_CASH" || tx.credit_account === "1010_BANK") {
            cashExpenses += amt;
          }
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
      const st = String(pr.status || "").toUpperCase();
      if (st === "CANCELLED" || st === "VOID" || st === "REJECTED") return false;

      const rEmpId = pr.employeeId || pr.employee_id;
      const rBranch = pr.branch_id || (pr as any).branchId || (rEmpId ? empBranchMap.get(rEmpId) : undefined);
      const rDept = pr.department_id || (pr as any).departmentId || (rEmpId ? empDeptMap.get(rEmpId) : undefined);

      if (branchId && (!rBranch || rBranch !== branchId)) return false;
      if (departmentId && (!rDept || rDept !== departmentId)) return false;
      if (employeeId && (!rEmpId || rEmpId !== employeeId)) return false;

      if (startDate || endDate) {
        if (startDate && endDate) {
          return this.getProrationFactor(pr, startDate, endDate, cycleMap) > 0;
        }
        const d = resolveAnalyticsPayrollDate(pr, false);
        if (!d) return false;
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
      }
      return true;
    });

    const extractEmployerTax = (pr: any): number => {
      if (!isSocialTaxEnabled) return 0;
      if (pr.employer_contributions_cents !== undefined && pr.employer_contributions_cents !== null) {
        return pr.employer_contributions_cents / 100;
      }
      const erCnss = (pr.cnss_employer_cents ? pr.cnss_employer_cents / 100 : 0) || pr.onaEmployer || 0;
      const erOfatma = (pr.ofatma_employer_cents ? pr.ofatma_employer_cents / 100 : 0) || (pr.cns_employer_cents ? pr.cns_employer_cents / 100 : 0) || pr.ofatmaEmployer || 0;
      if (erCnss + erOfatma > 0) return erCnss + erOfatma;
      if (pr.employerTaxes !== undefined) return pr.employerTaxes;
      // Only fall back to cnssDeduction/cnsDeduction when explicit cents fields are absent (SSOTInvariantMatrix compatibility; DEF-9C-08 has cents === 0)
      if (pr.cnss_employer_cents === undefined && pr.ofatma_employer_cents === undefined) {
        return (pr.cnssDeduction || 0) + (pr.cnsDeduction || 0);
      }
      return 0;
    };

    filteredPayroll.forEach((pr) => {
      const factor = (startDate && endDate) ? this.getProrationFactor(pr, startDate, endDate, cycleMap) : 1;
      const g = (pr.gross_salary_cents ? pr.gross_salary_cents / 100 : ((pr as any).grossSalaryHtg ?? pr.grossSalary ?? pr.baseSalary ?? 0)) * factor;
      const eTaxes = extractEmployerTax(pr) * factor;
      const netP = (pr.net_salary_cents ? pr.net_salary_cents / 100 : (pr.netPaid || (pr as any).netPay || 0)) * factor;

      grossSalary += g;
      employerContributions += eTaxes;
      commissions += (pr.commissions || (pr.commission_cents ? pr.commission_cents / 100 : 0)) * factor;
      bonuses += (pr.bonuses_cents ? pr.bonuses_cents / 100 : ((pr as any).bonuses || pr.primes || 0)) * factor;
      const st = String(pr.status || "").toUpperCase();
      if (st === "PAID" || st === "SEALED" || st === "APPROVED" || st === "VALIDATED") {
        payrollPaid += netP;
      }
    });

    // SSOT: Total accrued payroll = grossSalary (already inclusive of commissions & bonuses) + employerContributions
    const payrollTotal = grossSalary + employerContributions;
    const payrollPayable = Math.max(0, payrollTotal - payrollPaid);
    const effectiveCashPayroll = cashPayroll > 0 ? cashPayroll : payrollPaid;

    const netIncome = revenueRecognized - expensesAccrued - payrollTotal;
    const grossMargin = revenueRecognized > 0 ? Math.round(((revenueRecognized - expensesAccrued) / revenueRecognized) * 100) : 0;
    const operatingMargin = revenueRecognized > 0 ? Math.round((netIncome / revenueRecognized) * 100) : 0;

    // DEF-9C-05: Remediate EBITDA aliasing.
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
      const rEmpId = pr.employeeId || pr.employee_id;
      const deptId = pr.department_id || (pr as any).departmentId || (rEmpId ? empDeptMap.get(rEmpId) : undefined) || "unassigned";
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
      const factor = (startDate && endDate) ? this.getProrationFactor(pr, startDate, endDate, cycleMap) : 1;
      const g = (pr.gross_salary_cents ? pr.gross_salary_cents / 100 : ((pr as any).grossSalaryHtg ?? pr.grossSalary ?? pr.baseSalary ?? 0)) * factor;
      const eTaxes = extractEmployerTax(pr) * factor;
      existing.payroll += (g + eTaxes);
      departmentMap.set(deptId, existing);
    });

    const byDepartment: DepartmentPerformance[] = Array.from(departmentMap.values()).map((dept) => {
      dept.netIncome = dept.revenue - dept.expenses - dept.payroll;
      dept.margin = dept.revenue > 0 ? Math.round((dept.netIncome / dept.revenue) * 100) : 0;
      return dept;
    });

    // Employee Scorecard dynamic calculation scoped to active filters
    const scopedEmployees = employees.filter((emp) => {
      const eBranch = emp.branchId || (emp as any).branch_id;
      const eDept = emp.departmentId || (emp as any).department_id;
      if (branchId && (!eBranch || eBranch !== branchId)) return false;
      if (departmentId && (!eDept || eDept !== departmentId)) return false;
      if (employeeId && emp.id !== employeeId) return false;
      return true;
    });

    const byEmployee: EmployeeScorecard[] = scopedEmployees.map((emp) => {
      const empPayroll = filteredPayroll.filter((pr) => pr.employee_id === emp.id || pr.employeeId === emp.id);
      let empGross = 0;
      let empEmployer = 0;
      let empComm = 0;
      empPayroll.forEach((pr) => {
        const factor = (startDate && endDate) ? this.getProrationFactor(pr, startDate, endDate, cycleMap) : 1;
        const g = (pr.gross_salary_cents ? pr.gross_salary_cents / 100 : ((pr as any).grossSalaryHtg ?? pr.grossSalary ?? pr.baseSalary ?? 0)) * factor;
        const eTaxes = extractEmployerTax(pr) * factor;
        empGross += g;
        empEmployer += eTaxes;
        empComm += (pr.commissions || (pr.commission_cents ? pr.commission_cents / 100 : 0)) * factor;
      });
      const totalCost = empGross + empEmployer;
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
        cashPayroll: effectiveCashPayroll,
        accrualPayroll: payrollTotal,
        variancePayroll: payrollTotal - effectiveCashPayroll,
        cashExpenses,
        accrualExpenses: expensesAccrued,
        varianceExpenses: expensesAccrued - cashExpenses
      }
    };
  }
}
