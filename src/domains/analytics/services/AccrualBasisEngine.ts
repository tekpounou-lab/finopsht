import { AccrualBasisSnapshot, DepartmentPerformance, EmployeeScorecard } from "../../../types/accrual-basis";
import { LedgerTransaction, PayrollRecord, Employee, PayrollCycle } from "../../../types";
import type { Invoice } from "../../../types/crm";
import type { CashSettlement } from "../../../types/cash-basis";
import { resolveAnalyticsTxDate, resolveAnalyticsPayrollDate, toDateOnly } from "../../../utils/dateNormalization";
import { TaxPolicyEngine } from "../../../services/payroll/TaxPolicyEngine";
import { NormalizedAmountResolver, type NormalizationContext } from "../utils/NormalizedAmountResolver";
import { isPayrollRelatedTransaction } from "./AnalyticsEngine";
import { CashBasisEngine as CanonicalCashEngine } from "../../cash/engine/CashBasisEngine";
import { isEffectiveCashMovement } from "../../cash/types/NormalizedCashMovement";

export interface AccrualBasisOptions {
  businessSettings?: any;
  payrollCycles?: PayrollCycle[];
  normalizationContext?: NormalizationContext;
  invoices?: Invoice[];
  cashSettlements?: CashSettlement[];
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
    const normalizationContext = options?.normalizationContext;

    const effectiveSettings = options?.businessSettings ?? (filters as any)?.businessSettings;
    const isSocialTaxEnabled =
      effectiveSettings !== undefined
        ? TaxPolicyEngine.isSocialTaxEnabled(effectiveSettings)
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

    const matchesTxDimension = (tx: LedgerTransaction): boolean => {
      const bId = tx.business_id || tx.businessId;
      if (!bId || bId !== businessId) return false;

      const txEmpId = tx.employeeId || (tx as any).employee_id;
      const txBranch = tx.branchId || (tx as any).branch_id || (tx as any).cost_center_id || (txEmpId ? empBranchMap.get(txEmpId) : undefined);
      const txDept = tx.departmentId || (tx as any).department_id || (tx as any).department || (txEmpId ? empDeptMap.get(txEmpId) : undefined);

      if (branchId && (!txBranch || txBranch !== branchId)) return false;
      if (departmentId && (!txDept || txDept !== departmentId)) return false;
      if (employeeId && (!txEmpId || txEmpId !== employeeId)) return false;
      if (transactionType && tx.type !== transactionType && (tx as any).category !== transactionType) return false;
      return true;
    };

    // Filter transactions by businessId, structural scope, and accrual date range
    const scopedLedgerTx = ledgerTransactions.filter(matchesTxDimension);
    const filteredTx = scopedLedgerTx.filter((tx) => {
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
    let accountsReceivable = 0;
    let accountsPayable = 0;
    let cashBalance = 0;

    interface EvaluatedTx {
      tx: LedgerTransaction;
      amt: number;
      txType: string;
      isIncome: boolean;
      isExpense: boolean;
      isPayrollTx: boolean;
    }

    const evaluatedTxs: EvaluatedTx[] = [];

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

      let rawAmt = 0;
      let isAlreadyHtg = false;
      if (typeof tx.amount === "number" && !isNaN(tx.amount) && tx.amount !== 0) {
        rawAmt = Math.abs(tx.amount);
      } else if (typeof (tx as any).amount_htg === "number" && !isNaN((tx as any).amount_htg) && (tx as any).amount_htg !== 0) {
        rawAmt = Math.abs((tx as any).amount_htg);
        isAlreadyHtg = true;
      } else if (typeof (tx as any).amountHtg === "number" && !isNaN((tx as any).amountHtg) && (tx as any).amountHtg !== 0) {
        rawAmt = Math.abs((tx as any).amountHtg);
        isAlreadyHtg = true;
      } else if (typeof tx.amount_cents === "number" && !isNaN(tx.amount_cents) && tx.amount_cents !== 0) {
        rawAmt = Math.abs(tx.amount_cents) / 100;
      } else if (typeof (tx as any).amountCents === "number" && !isNaN((tx as any).amountCents) && (tx as any).amountCents !== 0) {
        rawAmt = Math.abs((tx as any).amountCents) / 100;
      } else if (typeof (tx as any).credit === "number" && !isNaN((tx as any).credit) && (tx as any).credit > 0) {
        rawAmt = (tx as any).credit;
      } else if (typeof (tx as any).total === "number" && !isNaN((tx as any).total) && (tx as any).total !== 0) {
        rawAmt = Math.abs((tx as any).total);
      }

      const txCurrency = isAlreadyHtg
        ? "HTG"
        : String(tx.currency || (tx as any).currency_code || (tx as any).currencyCode || "HTG").toUpperCase();
      const txDate = resolveAnalyticsTxDate(tx, false);
      const explicitRate = (tx as any).exchange_rate ?? (tx as any).exchangeRate;
      const amt =
        rawAmt !== 0 && txCurrency !== "HTG"
          ? NormalizedAmountResolver.resolveToHTG(rawAmt, txCurrency, txDate, normalizationContext, "BRH", explicitRate)
          : rawAmt;

      const txType = (tx.type || "").toUpperCase();
      const catUpper = String(tx.category || (tx as any).category_name || "").toUpperCase();
      const descUpper = String(tx.description || (tx as any).memo || "").toUpperCase();
      const creditAcc = String(tx.credit_account || (tx as any).creditAccount || "").trim().toUpperCase();
      const debitAcc = String(tx.debit_account || (tx as any).debitAccount || "").trim().toUpperCase();

      const isTillDiscrepancy =
        txType.includes("TILL_DISCREPANCY") ||
        catUpper.includes("TILL_DISCREPANCY") ||
        catUpper.includes("CASH_SHORTAGE") ||
        catUpper.includes("FLOAT_VARIANCE") ||
        catUpper.includes("CASH_VARIANCE") ||
        descUpper.includes("ÉCART DE CAISSE") ||
        descUpper.includes("ECART DE CAISSE");

      const isEmployeeRepayment =
        catUpper === "PAYROLL_RECOVERY" ||
        catUpper === "REPAYMENT" ||
        catUpper === "RECOUVREMENT";
      const isPayrollTx = isPayrollRelatedTransaction(tx);

      const isNonRevenueType = [
        "EXPENSE",
        "PAYROLL",
        "TRANSFER",
        "EXCHANGE",
        "ADVANCE",
        "PENALTY",
        "BONUS",
        "COMPENSATION",
        "CORRECTION",
        "ADJUSTMENT",
        "REFUND",
      ].includes(txType);

      const isNonRevenueCreditAcc = Boolean(
        creditAcc &&
          (/^[256]\d*/.test(creditAcc) ||
            /^411\d*/.test(creditAcc) ||
            /^4[2-9]\d*/.test(creditAcc) ||
            creditAcc.includes("PAYROLL") ||
            creditAcc.includes("SALAIRE") ||
            creditAcc.includes("ONA") ||
            creditAcc.includes("OFATMA") ||
            creditAcc.includes("CLEARING") ||
            creditAcc.includes("PAYABLE") ||
            creditAcc.includes("TAX") ||
            creditAcc.includes("CLIENT"))
      );

      const isRevenueCat =
        !catUpper.includes("COST") &&
        !catUpper.includes("COMMISSION") &&
        !catUpper.includes("EXPENSE") &&
        !catUpper.includes("TAX") &&
        (catUpper.includes("INCOME") ||
          catUpper.includes("REVENUE") ||
          catUpper.includes("VENTE") ||
          catUpper.includes("RECETTE") ||
          catUpper.includes("SALES"));

      const isRevenueCreditAcc = Boolean(
        creditAcc && /^(40\d*|410\d*|41[2-9]\d*|7\d*)/.test(creditAcc)
      );

      const isIncome =
        !(isPayrollTx && !isEmployeeRepayment) &&
        !isTillDiscrepancy &&
        !isNonRevenueType &&
        !isNonRevenueCreditAcc &&
        (["INCOME", "REVENUE", "SALES", "VENTE", "VENTES", "CREDIT"].includes(txType) ||
          isRevenueCat ||
          isRevenueCreditAcc ||
          (typeof (tx as any).credit === "number" && (tx as any).credit > 0 && !(tx as any).debit));

      const isBalanceSheetDebit = Boolean(
        debitAcc && (/^2\d*/.test(debitAcc) || /^10\d*/.test(debitAcc) || /^13\d*/.test(debitAcc))
      );

      const isExpense =
        !isIncome &&
        !isPayrollTx &&
        !isTillDiscrepancy &&
        !isBalanceSheetDebit &&
        ![
          "INCOME",
          "REVENUE",
          "SALES",
          "VENTE",
          "VENTES",
          "CREDIT",
          "TRANSFER",
          "EXCHANGE",
          "ADVANCE",
          "REFUND",
          "CORRECTION",
          "ADJUSTMENT",
        ].includes(txType) &&
        (txType === "EXPENSE" ||
          txType === "PENALTY" ||
          txType === "BONUS" ||
          txType === "COMPENSATION" ||
          catUpper.includes("OPEX") ||
          catUpper.includes("EXPENSE") ||
          catUpper.includes("RENT") ||
          debitAcc.startsWith("5") ||
          debitAcc.startsWith("6") ||
          (txType === "OTHER" && !isRevenueCreditAcc));

      if (isIncome) {
        revenueRecognized += amt;
      }

      if (isExpense && !isPayrollTx) {
        if (txType === "PENALTY") {
          expensesAccrued -= amt;
        } else {
          expensesAccrued += amt;
        }
      }

      evaluatedTxs.push({ tx, amt, txType, isIncome, isExpense, isPayrollTx });

      // Track asset/liability balance components (FX-normalized to HTG)
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

    const scopedPayrollBase = payrollRecords.filter((pr) => {
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
      return true;
    });

    const filteredPayroll = scopedPayrollBase.filter((pr) => {
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

    const resolvePayrollDate = (pr: any, cycle?: PayrollCycle): string => {
      return toDateOnly(
        pr.paidAt ||
          pr.paymentDate ||
          pr.effectiveAccountingDate ||
          pr.period_end ||
          pr.periodEnd ||
          cycle?.endDate ||
          pr.created_at ||
          pr.createdAt
      );
    };

    const normalizePayrollVal = (
      rawVal: number,
      isAlreadyHtg: boolean,
      pr: any,
      cycle: PayrollCycle | undefined,
      normDate: string
    ): number => {
      if (rawVal === 0 || isAlreadyHtg) return rawVal;
      const curr = String(pr.currency || pr.currency_code || pr.currencyCode || cycle?.currency || "HTG").toUpperCase();
      if (curr === "HTG") return rawVal;
      const explicitRate = pr.exchange_rate ?? pr.exchangeRate;
      return NormalizedAmountResolver.resolveToHTG(rawVal, curr, normDate, normalizationContext, "BRH", explicitRate);
    };

    const extractEmployerTax = (pr: any, cycle: PayrollCycle | undefined, normDate: string): number => {
      if (!isSocialTaxEnabled) return 0;
      if (pr.employerContributionsHtg !== undefined && pr.employerContributionsHtg !== null) {
        return Number(pr.employerContributionsHtg) || 0;
      }
      let rawTax = 0;
      if (pr.employer_contributions_cents !== undefined && pr.employer_contributions_cents !== null) {
        rawTax = pr.employer_contributions_cents / 100;
      } else {
        const erCnss = (pr.cnss_employer_cents ? pr.cnss_employer_cents / 100 : 0) || pr.onaEmployer || 0;
        const erOfatma =
          (pr.ofatma_employer_cents ? pr.ofatma_employer_cents / 100 : 0) ||
          (pr.cns_employer_cents ? pr.cns_employer_cents / 100 : 0) ||
          pr.ofatmaEmployer ||
          0;
        if (erCnss + erOfatma > 0) {
          rawTax = erCnss + erOfatma;
        } else if (pr.employerTaxes !== undefined) {
          rawTax = pr.employerTaxes;
        } else if (pr.cnss_employer_cents === undefined && pr.ofatma_employer_cents === undefined) {
          // Only fall back to cnssDeduction/cnsDeduction when explicit cents fields are absent (DEF-9C-08 compatibility)
          rawTax = (pr.cnssDeduction || 0) + (pr.cnsDeduction || 0);
        }
      }
      return normalizePayrollVal(rawTax, false, pr, cycle, normDate);
    };

    const getNormalizedPayrollParts = (pr: any, factor: number) => {
      const cycleId = pr.cycleId || pr.payroll_cycle_id;
      const cycle = cycleId ? cycleMap.get(cycleId) : undefined;
      const normDate = resolvePayrollDate(pr, cycle);

      const isGrossHtg = pr.grossSalaryHtg !== undefined && pr.grossSalaryHtg !== null;
      const rawGross =
        pr.grossSalaryHtg ??
        (pr.gross_salary_cents !== undefined && pr.gross_salary_cents !== null ? pr.gross_salary_cents / 100 : undefined) ??
        pr.grossSalary ??
        pr.baseSalary ??
        0;
      const normGross = normalizePayrollVal(rawGross, isGrossHtg, pr, cycle, normDate) * factor;
      const normEmployerTax = extractEmployerTax(pr, cycle, normDate) * factor;

      const isNetHtg = pr.netPaidHtg !== undefined && pr.netPaidHtg !== null;
      const rawNet =
        pr.netPaidHtg ??
        (pr.net_salary_cents !== undefined && pr.net_salary_cents !== null ? pr.net_salary_cents / 100 : undefined) ??
        (pr.netPaid || pr.netPay || 0);
      const normNet = normalizePayrollVal(rawNet, isNetHtg, pr, cycle, normDate) * factor;

      const isCommHtg = pr.commissionsHtg !== undefined && pr.commissionsHtg !== null;
      const rawComm = pr.commissionsHtg ?? pr.commissions ?? (pr.commission_cents ? pr.commission_cents / 100 : 0);
      const normComm = normalizePayrollVal(rawComm, isCommHtg, pr, cycle, normDate) * factor;

      const isBonHtg = pr.bonusesHtg !== undefined && pr.bonusesHtg !== null;
      const rawBon = pr.bonusesHtg ?? (pr.bonuses_cents ? pr.bonuses_cents / 100 : (pr.bonuses || pr.primes || 0));
      const normBon = normalizePayrollVal(rawBon, isBonHtg, pr, cycle, normDate) * factor;

      return { normGross, normEmployerTax, normNet, normComm, normBon };
    };

    filteredPayroll.forEach((pr) => {
      const factor = (startDate && endDate) ? this.getProrationFactor(pr, startDate, endDate, cycleMap) : 1;
      const parts = getNormalizedPayrollParts(pr, factor);

      grossSalary += parts.normGross;
      employerContributions += parts.normEmployerTax;
      commissions += parts.normComm;
      bonuses += parts.normBon;
      const st = String(pr.status || "").toUpperCase();
      if (st === "PAID" || st === "SEALED" || st === "APPROVED" || st === "VALIDATED") {
        payrollPaid += parts.normNet;
      }
    });

    // SSOT: Total accrued payroll = grossSalary (already inclusive of commissions & bonuses) + employerContributions
    const payrollTotal = grossSalary + employerContributions;
    const payrollPayable = Math.max(0, payrollTotal - payrollPaid);

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

    // Department performance dynamic calculation (Payroll + GL-only departments P1-03)
    const departmentMap = new Map<string, DepartmentPerformance>();
    const ensureDeptEntry = (deptId: string, deptName?: string): DepartmentPerformance => {
      const existing = departmentMap.get(deptId);
      if (existing) return existing;
      const created: DepartmentPerformance = {
        departmentId: deptId,
        departmentName: deptName || deptId,
        revenue: 0,
        expenses: 0,
        payroll: 0,
        netIncome: 0,
        margin: 0
      };
      departmentMap.set(deptId, created);
      return created;
    };

    filteredPayroll.forEach((pr) => {
      const rEmpId = pr.employeeId || pr.employee_id;
      const deptId = pr.department_id || (pr as any).departmentId || (rEmpId ? empDeptMap.get(rEmpId) : undefined) || "unassigned";
      const deptName = (pr as any).departmentName || deptId;
      const existing = ensureDeptEntry(deptId, deptName);
      const factor = (startDate && endDate) ? this.getProrationFactor(pr, startDate, endDate, cycleMap) : 1;
      const parts = getNormalizedPayrollParts(pr, factor);
      existing.payroll += (parts.normGross + parts.normEmployerTax);
    });

    evaluatedTxs.forEach(({ tx, amt, txType, isIncome, isExpense, isPayrollTx }) => {
      if (!isIncome && !(isExpense && !isPayrollTx)) return;
      const txEmpId = tx.employeeId || (tx as any).employee_id;
      const deptId = tx.departmentId || (tx as any).department_id || (tx as any).department || (txEmpId ? empDeptMap.get(txEmpId) : undefined) || "unassigned";
      const deptName = (tx as any).departmentName || deptId;
      const existing = ensureDeptEntry(deptId, deptName);
      if (isIncome) {
        existing.revenue += amt;
      } else if (isExpense && !isPayrollTx) {
        existing.expenses += txType === "PENALTY" ? -amt : amt;
      }
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
        const parts = getNormalizedPayrollParts(pr, factor);
        empGross += parts.normGross;
        empEmployer += parts.normEmployerTax;
        empComm += parts.normComm;
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

    // Canonical Cash Reconciliation (RECON-01) via CashBasisEngine + NormalizedAmountResolver
    const cashScopedInvoices = (options?.invoices || []).filter((inv: any) => {
      const iBizId = inv?.businessId || inv?.business_id;
      if (!iBizId || iBizId !== businessId) return false;
      const iEmpId = inv.employeeId || inv.employee_id || inv.assignedTo;
      const iBranch = inv.branchId || inv.branch_id || inv.cost_center_id || (iEmpId ? empBranchMap.get(iEmpId) : undefined);
      const iDept = inv.departmentId || inv.department_id || (iEmpId ? empDeptMap.get(iEmpId) : undefined);
      if (branchId && (!iBranch || iBranch !== branchId)) return false;
      if (departmentId && (!iDept || iDept !== departmentId)) return false;
      if (employeeId && (!iEmpId || iEmpId !== employeeId)) return false;
      if (transactionType && transactionType !== "INCOME") return false;
      return true;
    });

    const cashScopedSettlements = (options?.cashSettlements || []).filter((cs: any) => {
      const csBizId = cs?.businessId || cs?.business_id;
      if (!csBizId || csBizId !== businessId) return false;
      const csEmpId = cs.employeeId || cs.employee_id;
      const csBranch = cs.branchId || cs.branch_id || (csEmpId ? empBranchMap.get(csEmpId) : undefined);
      const csDept = cs.departmentId || cs.department_id || (csEmpId ? empDeptMap.get(csEmpId) : undefined);
      if (branchId && (!csBranch || csBranch !== branchId)) return false;
      if (departmentId && (!csDept || csDept !== departmentId)) return false;
      if (employeeId && (!csEmpId || csEmpId !== employeeId)) return false;
      return true;
    });

    const cashScopedPayroll = !transactionType || transactionType === "PAYROLL" ? scopedPayrollBase : [];

    const cashMcStatement = CanonicalCashEngine.executeMultiCurrencyPipeline(
      {
        invoices: cashScopedInvoices,
        payrollRecords: cashScopedPayroll,
        payrollCycles: options?.payrollCycles || [],
        ledgerTransactions: scopedLedgerTx,
        cashSettlements: cashScopedSettlements,
      },
      {
        businessId,
        startDate: startDate || "1900-01-01",
        endDate: endDate || "2099-12-31",
      }
    );

    let cashRevenue = 0;
    let cashPayroll = 0;
    let cashExpenses = 0;

    for (const curr of cashMcStatement.currencies) {
      const stmt = cashMcStatement.byCurrency[curr];
      if (!stmt) continue;
      for (const m of stmt.periodMovements) {
        if (!isEffectiveCashMovement(m)) continue;
        const mCurrency = (m.currency || curr || "HTG").toUpperCase();
        const explicitRate = m.metadata?.exchange_rate ?? m.metadata?.exchangeRate;
        const amtHtg =
          mCurrency !== "HTG"
            ? NormalizedAmountResolver.resolveToHTG(m.amount, mCurrency, m.movementDate, normalizationContext, "BRH", explicitRate)
            : m.amount;

        if (m.direction === "INFLOW") {
          cashRevenue += amtHtg;
        } else if (m.direction === "OUTFLOW") {
          if (m.sourceModule === "PAYROLL" || m.movementType === "PAYROLL" || m.movementType === "COMMISSION") {
            cashPayroll += amtHtg;
          } else {
            cashExpenses += amtHtg;
          }
        }
      }
    }

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
