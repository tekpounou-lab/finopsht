import { ExecutiveScoreEngine } from "./ExecutiveScoreEngine";
import {
  toDateOnly,
  matchesDateFilter,
  resolveAnalyticsTxDate,
  resolveAnalyticsAttendanceDate,
  resolveAnalyticsPayrollDate,
} from "../../../utils/dateNormalization";
import { ReferenceResolver } from "../../../services/ReferenceResolver";
import {
  Employee,
  LedgerTransaction,
  AttendanceRecord,
  PayrollRecord,
  Branch,
  Department,
  EmployeeContract,
  EmployeeDepartmentActivity,
  PayrollCycle,
} from "../../../types";
import { filterOperationalEmployees, isOperationalEmployee } from "../../../services/workforce/EmployeeEligibilityService";
import { WorkforceProfitabilityEngine } from "./WorkforceProfitabilityEngine";
import { TaxPolicyEngine } from "../../../services/payroll/TaxPolicyEngine";
import { CashBasisEngine as CanonicalCashEngine } from "../../cash/engine/CashBasisEngine";
import {
  AnalyticsPeriod,
  AnalyticsSnapshot,
  KPIComparison,
  BranchPerformance,
  DepartmentPerformance,
  EmployeeScorecard,
  TrendPoint,
  Anomaly,
  ShortTermForecast,
} from "../types";

export interface DateRange {
  startDate: string;
  endDate: string;
}

/**
 * Determines whether a transaction is payroll-related (to prevent double-counting in operational expenses).
 */
export function isPayrollRelatedTransaction(tx: LedgerTransaction | any): boolean {
  if (!tx) return false;
  const typeUpper = (tx.type || "").toUpperCase();
  if (typeUpper === "PAYROLL") return true;
  if (typeUpper === "ADVANCE") return true;
  if (typeUpper === "TRANSFER" || typeUpper === "EXCHANGE") return true;

  if (
    tx.metadata?.payrollCycleId ||
    tx.metadata?.payroll_cycle_id ||
    (tx as any).payrollCycleId ||
    (tx as any).payroll_cycle_id
  ) {
    return true;
  }

  const cat = (tx.category || "").toLowerCase();
  const desc = (tx.description || "").toLowerCase();
  const memo = (tx.memo || "").toLowerCase();

  const payrollKeywords = [
    "paie",
    "payroll",
    "salaire",
    "salaires",
    "virement salaires",
    "remuneration",
    "rémunération",
    "appointement",
    "net pay",
    "gross pay",
    "masse salariale",
  ];

  for (const kw of payrollKeywords) {
    if (cat.includes(kw) || desc.includes(kw) || memo.includes(kw)) {
      return true;
    }
  }

  return false;
}

/**
 * Pure calculation helpers for the FinOps Analytics Engine.
 */
export class AnalyticsEngine {
  /**
   * Computes current and previous date boundaries for a given AnalyticsPeriod.
   */
  static getPeriodRanges(
    period: AnalyticsPeriod,
    customRange?: { startDate: string; endDate: string },
    referenceDate: Date = new Date() // Anchored to system local date
  ): { current: DateRange; previous: DateRange } {
    const formatDate = (d: Date) => {
      if (!d || isNaN(d.getTime())) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const currentStart = new Date(referenceDate);
    const currentEnd = new Date(referenceDate);
    const prevStart = new Date(referenceDate);
    const prevEnd = new Date(referenceDate);

    switch (period) {
      case "TODAY":
        currentStart.setHours(0, 0, 0, 0);
        currentEnd.setHours(23, 59, 59, 999);
        prevStart.setDate(prevStart.getDate() - 1);
        prevStart.setHours(0, 0, 0, 0);
        prevEnd.setDate(prevEnd.getDate() - 1);
        prevEnd.setHours(23, 59, 59, 999);
        break;

      case "YESTERDAY":
        currentStart.setDate(currentStart.getDate() - 1);
        currentStart.setHours(0, 0, 0, 0);
        currentEnd.setDate(currentEnd.getDate() - 1);
        currentEnd.setHours(23, 59, 59, 999);
        prevStart.setDate(prevStart.getDate() - 2);
        prevStart.setHours(0, 0, 0, 0);
        prevEnd.setDate(prevEnd.getDate() - 2);
        prevEnd.setHours(23, 59, 59, 999);
        break;

      case "THIS_WEEK": {
        const day = currentStart.getDay();
        const diff = currentStart.getDate() - day + (day === 0 ? -6 : 1); // Monday
        currentStart.setDate(diff);
        currentStart.setHours(0, 0, 0, 0);
        currentEnd.setHours(23, 59, 59, 999);

        prevStart.setDate(currentStart.getDate() - 7);
        prevStart.setHours(0, 0, 0, 0);
        prevEnd.setDate(currentStart.getDate() - 1);
        prevEnd.setHours(23, 59, 59, 999);
        break;
      }

      case "LAST_WEEK": {
        const day = currentStart.getDay();
        const diff = currentStart.getDate() - day + (day === 0 ? -6 : 1) - 7;
        currentStart.setDate(diff);
        currentStart.setHours(0, 0, 0, 0);
        currentEnd.setDate(currentStart.getDate() + 6);
        currentEnd.setHours(23, 59, 59, 999);

        prevStart.setDate(currentStart.getDate() - 7);
        prevStart.setHours(0, 0, 0, 0);
        prevEnd.setDate(currentStart.getDate() - 1);
        prevEnd.setHours(23, 59, 59, 999);
        break;
      }

      case "FORTNIGHT":
        currentStart.setDate(currentStart.getDate() - 13);
        currentStart.setHours(0, 0, 0, 0);
        currentEnd.setHours(23, 59, 59, 999);

        prevStart.setDate(currentStart.getDate() - 14);
        prevStart.setHours(0, 0, 0, 0);
        prevEnd.setDate(currentStart.getDate() - 1);
        prevEnd.setHours(23, 59, 59, 999);
        break;

      case "PREVIOUS_FORTNIGHT":
        currentStart.setDate(currentStart.getDate() - 27);
        currentStart.setHours(0, 0, 0, 0);
        currentEnd.setDate(currentStart.getDate() - 14);
        currentEnd.setHours(23, 59, 59, 999);

        prevStart.setDate(currentStart.getDate() - 14);
        prevStart.setHours(0, 0, 0, 0);
        prevEnd.setDate(currentStart.getDate() - 1);
        prevEnd.setHours(23, 59, 59, 999);
        break;

      case "MONTH":
      default:
        currentStart.setDate(1);
        currentStart.setHours(0, 0, 0, 0);
        currentEnd.setMonth(currentEnd.getMonth() + 1, 0);
        currentEnd.setHours(23, 59, 59, 999);
        prevStart.setMonth(prevStart.getMonth() - 1, 1);
        prevStart.setHours(0, 0, 0, 0);
        prevEnd.setMonth(prevEnd.getMonth(), 0); // last day
        prevEnd.setHours(23, 59, 59, 999);
        break;
      case "PREVIOUS_MONTH":
        currentStart.setMonth(currentStart.getMonth() - 1, 1);
        currentStart.setHours(0, 0, 0, 0);
        currentEnd.setMonth(currentEnd.getMonth(), 0);
        currentEnd.setHours(23, 59, 59, 999);
        prevStart.setMonth(prevStart.getMonth() - 2, 1);
        prevStart.setHours(0, 0, 0, 0);
        prevEnd.setMonth(prevEnd.getMonth() - 1, 0);
        prevEnd.setHours(23, 59, 59, 999);
        break;

      case "QUARTER": {
        const q = Math.floor(currentStart.getMonth() / 3);
        currentStart.setMonth(q * 3, 1);
        currentStart.setHours(0, 0, 0, 0);
        currentEnd.setMonth(q * 3 + 3, 0);
        currentEnd.setHours(23, 59, 59, 999);
        prevStart.setMonth(currentStart.getMonth() - 3, 1);
        prevStart.setHours(0, 0, 0, 0);
        prevEnd.setMonth(currentStart.getMonth(), 0);
        prevEnd.setHours(23, 59, 59, 999);
        break;
      }

      case "PREVIOUS_QUARTER": {
        const q = Math.floor(currentStart.getMonth() / 3) - 1;
        currentStart.setMonth(q * 3, 1);
        currentStart.setHours(0, 0, 0, 0);
        currentEnd.setMonth(currentStart.getMonth() + 3, 0);
        currentEnd.setHours(23, 59, 59, 999);

        prevStart.setMonth(currentStart.getMonth() - 3, 1);
        prevStart.setHours(0, 0, 0, 0);
        prevEnd.setMonth(currentStart.getMonth(), 0);
        prevEnd.setHours(23, 59, 59, 999);
        break;
      }

      case "YEAR":
        currentStart.setMonth(0, 1);
        currentStart.setHours(0, 0, 0, 0);
        currentEnd.setHours(23, 59, 59, 999);

        prevStart.setFullYear(prevStart.getFullYear() - 1, 0, 1);
        prevStart.setHours(0, 0, 0, 0);
        prevEnd.setFullYear(prevEnd.getFullYear() - 1, 11, 31);
        prevEnd.setHours(23, 59, 59, 999);
        break;

      case "PREVIOUS_YEAR":
        currentStart.setFullYear(currentStart.getFullYear() - 1, 0, 1);
        currentStart.setHours(0, 0, 0, 0);
        currentEnd.setFullYear(currentEnd.getFullYear() - 1, 11, 31);
        currentEnd.setHours(23, 59, 59, 999);

        prevStart.setFullYear(currentStart.getFullYear() - 2, 0, 1);
        prevStart.setHours(0, 0, 0, 0);
        prevEnd.setFullYear(prevEnd.getFullYear() - 2, 11, 31);
        prevEnd.setHours(23, 59, 59, 999);
        break;

      case "CUSTOM":
        if (customRange && customRange.startDate && customRange.endDate) {
          const cleanStart = String(customRange.startDate).split("T")[0];
          const cleanEnd = String(customRange.endDate).split("T")[0];
          const s = new Date(cleanStart + "T00:00:00");
          const e = new Date(cleanEnd + "T23:59:59");
          const duration = Math.max(86400000, (isNaN(e.getTime()) ? 0 : e.getTime()) - (isNaN(s.getTime()) ? 0 : s.getTime()));
          const prevE = new Date((isNaN(s.getTime()) ? Date.now() : s.getTime()) - 86400000);
          const prevS = new Date(prevE.getTime() - duration + 86400000);

          return {
            current: { startDate: cleanStart, endDate: cleanEnd },
            previous: {
              startDate: prevS.toISOString().split("T")[0],
              endDate: prevE.toISOString().split("T")[0],
            },
          };
        } else {
          // Fallback to current calendar month default range if CUSTOM filter is chosen with no payload
          const now = new Date();
          const fallbackStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const fallbackEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
          currentStart.setTime(fallbackStart.getTime());
          currentEnd.setTime(fallbackEnd.getTime());
          prevStart.setTime(fallbackStart.getTime() - 31 * 86400000);
          prevEnd.setTime(fallbackStart.getTime() - 86400000);
        }
        break;
    }

    return {
      current: { startDate: formatDate(currentStart), endDate: formatDate(currentEnd) },
      previous: { startDate: formatDate(prevStart), endDate: formatDate(prevEnd) },
    };
  }

  /**
   * Helper to compute expected work hours for a specific date range.
   * Reads standardQuinzaineHours from business_settings (default: 96h).
   */
  static getExpectedWorkingHours(
    startDateStr: string,
    endDateStr: string,
    baseDailyHours = 8,
    standardQuinzaineHours = 96
  ): number {
    try {
      const start = new Date(startDateStr);
      const end = new Date(endDateStr);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return standardQuinzaineHours;

      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      // Quinzaine (13 to 17 days) -> exact standardQuinzaineHours (e.g. 96h)
      if (diffDays >= 13 && diffDays <= 17) {
        return standardQuinzaineHours;
      }
      // Month (28 to 32 days) -> 2 * standardQuinzaineHours (e.g. 192h)
      if (diffDays >= 28 && diffDays <= 32) {
        return standardQuinzaineHours * 2;
      }

      // Proportional by working days (Mon-Sat typical in Haiti operational calendar)
      let workingDays = 0;
      const cur = new Date(start);
      let guard = 0;
      while (cur <= end && guard < 1000) {
        guard++;
        const dayOfWeek = cur.getDay();
        if (dayOfWeek !== 0) { // Mon-Sat
          workingDays++;
        }
        cur.setDate(cur.getDate() + 1);
      }
      const standardWorkingDaysInQuinzaine = 12;
      return Number(((workingDays / standardWorkingDaysInQuinzaine) * standardQuinzaineHours).toFixed(1));
    } catch {
      return standardQuinzaineHours;
    }
  }

  /**
   * Helper to calculate cycle proration factor for sub-period custom date ranges.
   */
  static getRecordProrationFactor(
    pr: any,
    range: DateRange,
    cycleMap?: Map<string, PayrollCycle>
  ): number {
    if (!range || !range.startDate || !range.endDate) return 1;

    const cycleId = pr.cycleId || pr.payroll_cycle_id;
    const cycle = cycleId && cycleMap ? cycleMap.get(cycleId) : undefined;

    let pStart = pr.period_start || (pr as any).periodStart || (pr as any).startDate || cycle?.startDate || (cycle as any)?.start_date;
    let pEnd = pr.period_end || (pr as any).periodEnd || (pr as any).endDate || cycle?.endDate || (cycle as any)?.end_date;

    if (!pStart && !pEnd && cycleId) {
      const dateMatch = cycleId.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
      if (dateMatch) {
        pStart = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
        const dt = new Date(pStart);
        const endDt = new Date(dt.getFullYear(), dt.getMonth() + 1, 0);
        pEnd = endDt.toISOString().split("T")[0];
      }
    }

    if (!pStart && !pEnd) return 1;

    const recStartStr = toDateOnly(pStart);
    const recEndStr = toDateOnly(pEnd);
    if (!recStartStr || !recEndStr) return 1;

    const dStart = new Date(recStartStr).getTime();
    const dEnd = new Date(recEndStr).getTime();
    const rStart = new Date(range.startDate).getTime();
    const rEnd = new Date(range.endDate).getTime();

    if (isNaN(dStart) || isNaN(dEnd) || isNaN(rStart) || isNaN(rEnd)) return 1;

    const totalCycleDays = Math.max(1, Math.round((dEnd - dStart) / 86400000) + 1);
    const overlapStart = rStart > dStart ? rStart : dStart;
    const overlapEnd = rEnd < dEnd ? rEnd : dEnd;

    if (overlapStart > overlapEnd) return 0;
    const overlapDays = Math.max(1, Math.round((overlapEnd - overlapStart) / 86400000) + 1);

    if (overlapDays >= totalCycleDays) return 1;
    return overlapDays / totalCycleDays;
  }

  static isPayrollRelatedTransaction = isPayrollRelatedTransaction;

  /**
   * Computes operational expenses from General Ledger transactions.
   * If includePayrollTransactions is true (default), includes all GL expense and payroll transactions.
   * Formula: EXPENSE + PAYROLL/SALARY + BONUS + COMPENSATION - PENALTY.
   */
  static computeOperationalExpenses(
    txs: LedgerTransaction[],
    range?: DateRange,
    businessId?: string,
    includePayrollTransactions: boolean = false
  ): number {
    const validTxs = (txs || []).filter((t) => {
      if (businessId && t.business_id && t.business_id !== businessId && (t as any).businessId !== businessId) {
        return false;
      }
      const statusUpper = (t.status || "").toUpperCase();
      if (statusUpper === "REVERSED" || statusUpper === "VOID" || statusUpper === "CANCELLED") {
        return false;
      }
      if (range && range.startDate && range.endDate) {
        const rawDate =
          t.date ||
          (t as any).transaction_date ||
          (t as any).transactionDate ||
          (t as any).effectiveAccountingDate ||
          (t as any).effective_date ||
          (t as any).date_str ||
          (t as any).dateStr ||
          (t as any).created_at ||
          (t as any).createdAt;
        const txDate = toDateOnly(rawDate);
        if (!txDate || txDate < range.startDate || txDate > range.endDate) {
          return false;
        }
      }

      const typeUpper = (t.type || "").toUpperCase();
      if (typeUpper === "INCOME" || typeUpper === "TRANSFER" || typeUpper === "EXCHANGE" || typeUpper === "ADVANCE" || typeUpper === "REVENUE" || typeUpper === "SALES" || typeUpper === "VENTE" || typeUpper === "VENTES") {
        return false;
      }

      // Anti-doublon: Exclude payroll-related transactions ONLY IF explicitly requested
      if (!includePayrollTransactions && isPayrollRelatedTransaction(t)) {
        return false;
      }

      return true;
    });

    const getAmount = (t: LedgerTransaction): number => {
      if (!t) return 0;
      if (typeof t.amount === "number" && !isNaN(t.amount) && t.amount !== 0) return Math.abs(t.amount);
      if (typeof (t as any).amount_htg === "number" && !isNaN((t as any).amount_htg) && (t as any).amount_htg !== 0) return Math.abs((t as any).amount_htg);
      if (typeof (t as any).amountHtg === "number" && !isNaN((t as any).amountHtg) && (t as any).amountHtg !== 0) return Math.abs((t as any).amountHtg);
      if (typeof (t as any).amount_cents === "number" && !isNaN((t as any).amount_cents) && (t as any).amount_cents !== 0) return Math.abs((t as any).amount_cents) / 100;
      if (typeof (t as any).amountCents === "number" && !isNaN((t as any).amountCents) && (t as any).amountCents !== 0) return Math.abs((t as any).amountCents) / 100;
      if (typeof (t as any).total === "number" && !isNaN((t as any).total) && (t as any).total !== 0) return Math.abs((t as any).total);
      if (typeof (t as any).debit === "number" && !isNaN((t as any).debit) && (t as any).debit > 0) return (t as any).debit;
      if (typeof (t as any).credit === "number" && !isNaN((t as any).credit) && (t as any).credit > 0) return (t as any).credit;
      if (typeof (t as any).debit_cents === "number" && !isNaN((t as any).debit_cents) && (t as any).debit_cents > 0) return (t as any).debit_cents / 100;
      if (typeof (t as any).credit_cents === "number" && !isNaN((t as any).credit_cents) && (t as any).credit_cents > 0) return (t as any).credit_cents / 100;
      return 0;
    };

    return validTxs.reduce((sum, t) => {
      const typeUpper = (t.type || "").toUpperCase();
      const amt = getAmount(t);
      if (typeUpper === "PENALTY") {
        return sum - amt;
      }
      return sum + amt;
    }, 0);
  }

  /**
   * Computes total payroll cost exclusively from sealed / validated payroll_records with proration.
   * Total Employment Cost = Prorated Gross Salary + Prorated Employer Contributions.
   * NEVER falls back to General Ledger transactions.
   */
  static computePayrollCost(
    payrolls: PayrollRecord[],
    range: DateRange,
    isSocialTaxEnabled: boolean = true,
    cycleMap?: Map<string, PayrollCycle>
  ): number {
    return (payrolls || []).reduce((sum, pr: any) => {
      const statusUpper = (pr.status || "").toUpperCase();
      if (statusUpper === "CANCELLED" || statusUpper === "VOID" || statusUpper === "REJECTED" || pr.isExcluded) {
        return sum;
      }

      const factor = AnalyticsEngine.getRecordProrationFactor(pr, range, cycleMap);
      if (factor <= 0) return sum;

      const rawGross =
        (pr.gross_salary_cents !== undefined && pr.gross_salary_cents !== null ? pr.gross_salary_cents / 100 : undefined) ??
        pr.grossSalary ??
        pr.grossSalaryHtg ??
        pr.gross ??
        pr.baseSalary ??
        0;

      // Employer taxes (ONA / OFATMA)
      let employerTaxes = 0;
      if (isSocialTaxEnabled) {
        if (pr.employer_contributions_cents !== undefined && pr.employer_contributions_cents !== null) {
          employerTaxes = pr.employer_contributions_cents / 100;
        } else {
          const erCnss = (pr.cnss_employer_cents ? pr.cnss_employer_cents / 100 : 0) || pr.onaEmployer || (pr.cnssDeduction || 0) || 0;
          const erOfatma = (pr.ofatma_employer_cents ? pr.ofatma_employer_cents / 100 : 0) || (pr.cns_employer_cents ? pr.cns_employer_cents / 100 : 0) || pr.ofatmaEmployer || (pr.cnsDeduction || 0) || 0;
          employerTaxes = erCnss + erOfatma;
        }
      }

      return sum + (rawGross + employerTaxes) * factor;
    }, 0);
  }

  /**
   * Computes the Payroll Ratio (Masse salariale / Chiffre d'affaires).
   * @param totalPayrollCost Total employment cost
   * @param totalRevenue Total revenue
   * @returns Percentage (e.g. 42.4)
   */
  static computePayrollRatio(totalPayrollCost: number, totalRevenue: number): number {
    if (!totalRevenue || totalRevenue <= 0) return 0;
    return Number(((totalPayrollCost / totalRevenue) * 100).toFixed(1));
  }

  /**
   * Computes the HR ROI (Chiffre d'affaires / Coût total de l'emploi).
   * @param totalRevenue Total revenue
   * @param totalEmploymentCost Total employment cost
   * @returns Multiplier ratio (e.g. 2.2)
   */
  static computeHRROI(totalRevenue: number, totalEmploymentCost: number): number {
    if (!totalEmploymentCost || totalEmploymentCost <= 0) return 0;
    return Number((totalRevenue / totalEmploymentCost).toFixed(2));
  }

  /**
   * Helper to build structured KPI comparisons.
   */
  static compareValues(
    current: number,
    previous: number,
    directionInverted: boolean = false
  ): KPIComparison {
    const difference = current - previous;
    const differencePercentage =
      previous !== 0 ? parseFloat(((difference / Math.abs(previous)) * 100).toFixed(1)) : 0;

    let trend: "UP" | "DOWN" | "STABLE" = "STABLE";
    if (difference > 0.01) trend = "UP";
    else if (difference < -0.01) trend = "DOWN";

    let direction: "UP" | "DOWN" | "NEUTRAL" = "NEUTRAL";
    if (trend === "UP") {
      direction = directionInverted ? "DOWN" : "UP";
    } else if (trend === "DOWN") {
      direction = directionInverted ? "UP" : "DOWN";
    }

    return {
      currentValue: parseFloat(current.toFixed(1)),
      previousValue: parseFloat(previous.toFixed(1)),
      difference: parseFloat(difference.toFixed(1)),
      differencePercentage,
      trend,
      direction,
    };
  }

  /**
   * Generates a fully calculated, immutable AnalyticsSnapshot.
   * Supports options object or positional arguments.
   */
  static generateSnapshot(
    periodOrOptions: AnalyticsPeriod | {
      period: AnalyticsPeriod;
      customRange?: { startDate: string; endDate: string };
      employees?: Employee[];
      transactions?: LedgerTransaction[];
      attendanceLogs?: AttendanceRecord[];
      payrollRecords?: PayrollRecord[];
      branches?: Branch[];
      departments?: Department[];
      contracts?: EmployeeContract[];
      businessId: string;
      language?: "fr" | "ht" | "en";
      activities?: EmployeeDepartmentActivity[];
      businessSettings?: any;
      payrollCycles?: PayrollCycle[];
      referenceDate?: Date;
      accountingMode?: "CASH" | "ACCRUAL";
    },
    customRange?: { startDate: string; endDate: string } | undefined,
    employees?: Employee[],
    transactions?: LedgerTransaction[],
    attendanceLogs?: AttendanceRecord[],
    payrollRecords?: PayrollRecord[],
    branches?: Branch[],
    departments?: Department[],
    contracts?: EmployeeContract[],
    businessId?: string,
    language: "fr" | "ht" | "en" = "fr",
    activities?: EmployeeDepartmentActivity[],
    businessSettings?: any,
    payrollCycles?: PayrollCycle[],
    referenceDate?: Date
  ): AnalyticsSnapshot {
    let period: AnalyticsPeriod;
    let actualCustomRange = customRange;
    let actualEmployees = employees || [];
    let actualTxs = transactions || [];
    let actualAttendance = attendanceLogs || [];
    let actualPayroll = payrollRecords || [];
    let actualBranches = branches || [];
    let actualDepts = departments || [];
    let actualContracts = contracts || [];
    let actualBizId = businessId || "";
    let actualLang = language;
    let actualActivities = activities;
    let actualSettings = businessSettings;
    let actualCycles = payrollCycles;
    let actualRefDate = referenceDate;
    let actualAccountingMode: "CASH" | "ACCRUAL" = "ACCRUAL";

    if (typeof periodOrOptions === "object" && periodOrOptions !== null) {
      const opts = periodOrOptions;
      period = opts.period;
      actualCustomRange = opts.customRange;
      actualEmployees = opts.employees || [];
      actualTxs = opts.transactions || [];
      actualAttendance = opts.attendanceLogs || [];
      actualPayroll = opts.payrollRecords || [];
      actualBranches = opts.branches || [];
      actualDepts = opts.departments || [];
      actualContracts = opts.contracts || [];
      actualBizId = opts.businessId || "";
      actualLang = opts.language || "fr";
      actualActivities = opts.activities;
      actualSettings = opts.businessSettings;
      actualCycles = opts.payrollCycles;
      actualRefDate = opts.referenceDate;
      actualAccountingMode = opts.accountingMode || "ACCRUAL";
    } else {
      period = periodOrOptions as AnalyticsPeriod;
    }

    console.debug("[AnalyticsEngine.generateSnapshot] Starting SSOT snapshot calculation with parameters:", {
      period,
      customRange: actualCustomRange,
      businessId: actualBizId,
      language: actualLang,
      referenceDate: actualRefDate,
      counts: {
        rawEmployees: actualEmployees?.length || 0,
        rawTransactions: actualTxs?.length || 0,
        rawAttendance: actualAttendance?.length || 0,
        rawPayroll: actualPayroll?.length || 0,
        branches: actualBranches?.length || 0,
        departments: actualDepts?.length || 0,
      }
    });

    const isSocialTaxEnabled = TaxPolicyEngine.isSocialTaxEnabled(actualSettings);

    // 1. Resolve date boundaries deterministically using anchored referenceDate
    const { current, previous } = this.getPeriodRanges(period, actualCustomRange, actualRefDate);

    const normalizeDateStr = (rawDate: any): string => toDateOnly(rawDate);

    const getTxDate = (t: any): string => {
      return resolveAnalyticsTxDate(t, actualAccountingMode === "CASH");
    };

    const getAttendanceDate = (a: any): string => {
      return resolveAnalyticsAttendanceDate(a);
    };

    const isInPeriod = (rawDate: any, range: DateRange) => {
      const dateOnly = normalizeDateStr(rawDate);
      if (!dateOnly) return false;
      return dateOnly >= range.startDate && dateOnly <= range.endDate;
    };

    const matchesBusiness = (item: any) => {
      if (!actualBizId) return true;
      const bId = item?.business_id || item?.businessId;
      return !bId || bId === actualBizId;
    };

    // Build cycle map for accurate cycle-to-period matching
    const cycleMap = new Map<string, PayrollCycle>();
    if (actualCycles) {
      actualCycles.forEach((c) => {
        if (c.id) cycleMap.set(c.id, c);
      });
    }

    const isPayrollInPeriod = (p: PayrollRecord, range: DateRange): boolean => {
      const cycleId = p.cycleId || p.payroll_cycle_id;
      const cycle = cycleId ? cycleMap.get(cycleId) : undefined;

      // 1. Check if explicit payment date falls in range
      const paymentDate = (p as any).paymentDate || (p as any).effectiveAccountingDate;
      if (paymentDate) {
        const normPayment = normalizeDateStr(paymentDate);
        if (normPayment && normPayment >= range.startDate && normPayment <= range.endDate) {
          return true;
        }
      }

      // 2. Check work period overlap
      let pStart = p.period_start || (p as any).periodStart || (p as any).startDate || cycle?.startDate || (cycle as any)?.start_date;
      let pEnd = p.period_end || (p as any).periodEnd || (p as any).endDate || cycle?.endDate || (cycle as any)?.end_date;

      if (!pStart && !pEnd && cycleId) {
        const dateMatch = cycleId.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
        if (dateMatch) {
          pStart = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
          pEnd = pStart;
        }
      }

      if (!pStart && !pEnd) {
        pStart = (p as any).generated_at || (p as any).createdAt || p.created_at;
        pEnd = pStart;
      }

      if (pStart || pEnd) {
        const startStr = normalizeDateStr(pStart || pEnd);
        const endStr = normalizeDateStr(pEnd || pStart);
        if (startStr && endStr) {
          // Range overlap: recStart <= range.endDate && recEnd >= range.startDate
          return !(endStr < range.startDate || startStr > range.endDate);
        }
      }

      return false;
    };

    // 2. Filter collections for current and previous period
    const curTxs = actualTxs.filter(
      (t) => matchesBusiness(t) && t.status !== "REVERSED" && isInPeriod(getTxDate(t), current)
    );
    const prevTxs = actualTxs.filter(
      (t) => matchesBusiness(t) && t.status !== "REVERSED" && isInPeriod(getTxDate(t), previous)
    );

    const curAttendance = actualAttendance.filter(
      (a) => matchesBusiness(a) && isInPeriod(getAttendanceDate(a), current)
    );
    const prevAttendance = actualAttendance.filter(
      (a) => matchesBusiness(a) && isInPeriod(getAttendanceDate(a), previous)
    );

    // Filter payroll records with cycle-aware date matching
    const curPayroll = actualPayroll.filter(
      (p) => matchesBusiness(p) && isPayrollInPeriod(p, current)
    );
    const prevPayroll = actualPayroll.filter(
      (p) => matchesBusiness(p) && isPayrollInPeriod(p, previous)
    );

    // Business scope active operational staff (excludes OWNER / SUPER_ADMIN)
    const matchedEmployees = filterOperationalEmployees(actualEmployees.filter((e) => matchesBusiness(e)));
    const activeEmployees = matchedEmployees.length > 0 ? matchedEmployees : filterOperationalEmployees(actualEmployees);

    console.debug("[AnalyticsEngine.generateSnapshot] Filtered collections breakdown:", {
      currentRange: current,
      previousRange: previous,
      transactions: {
        rawTotal: actualTxs?.length || 0,
        currentInPeriod: curTxs.length,
        previousInPeriod: prevTxs.length,
      },
      attendance: {
        rawTotal: actualAttendance?.length || 0,
        currentInPeriod: curAttendance.length,
        previousInPeriod: prevAttendance.length,
      },
      payroll: {
        rawTotal: actualPayroll?.length || 0,
        currentInPeriod: curPayroll.length,
        previousInPeriod: prevPayroll.length,
      },
      activeOperationalEmployees: activeEmployees.length,
    });

    // 3. Financial KPI Calculations
    const getTxAmount = (t: LedgerTransaction): number => {
      if (!t) return 0;
      if (typeof t.amount === "number" && !isNaN(t.amount) && t.amount !== 0) return Math.abs(t.amount);
      if (typeof (t as any).amount_htg === "number" && !isNaN((t as any).amount_htg) && (t as any).amount_htg !== 0) return Math.abs((t as any).amount_htg);
      if (typeof (t as any).amountHtg === "number" && !isNaN((t as any).amountHtg) && (t as any).amountHtg !== 0) return Math.abs((t as any).amountHtg);
      if (typeof (t as any).amount_cents === "number" && !isNaN((t as any).amount_cents) && (t as any).amount_cents !== 0) return Math.abs((t as any).amount_cents) / 100;
      if (typeof (t as any).amountCents === "number" && !isNaN((t as any).amountCents) && (t as any).amountCents !== 0) return Math.abs((t as any).amountCents) / 100;
      if (typeof (t as any).total === "number" && !isNaN((t as any).total) && (t as any).total !== 0) return Math.abs((t as any).total);
      if (typeof (t as any).credit === "number" && (t as any).credit > 0) return (t as any).credit;
      if (typeof (t as any).debit === "number" && (t as any).debit > 0) return (t as any).debit;
      if (typeof (t as any).credit_cents === "number" && (t as any).credit_cents > 0) return (t as any).credit_cents / 100;
      if (typeof (t as any).debit_cents === "number" && (t as any).debit_cents > 0) return (t as any).debit_cents / 100;
      return 0;
    };

    const isIncomeTx = (t: LedgerTransaction): boolean => {
      if (!t) return false;
      const statusUpper = (t.status || "").toUpperCase();
      if (
        statusUpper === "REVERSED" ||
        statusUpper === "VOID" ||
        statusUpper === "VOIDED" ||
        statusUpper === "CANCELLED" ||
        (t as any).is_reversed
      ) {
        return false;
      }
      const typeUpper = (t.type || "").toUpperCase();
      if (typeUpper === "INCOME" || typeUpper === "REVENUE" || typeUpper === "SALES" || typeUpper === "VENTE" || typeUpper === "VENTES" || typeUpper === "CREDIT") return true;
      const catUpper = (t.category || (t as any).category_name || (t as any).categoryName || "").toUpperCase();
      if (catUpper.includes("INCOME") || catUpper.includes("REVENUE") || catUpper.includes("VENTE") || catUpper.includes("RECETTE") || catUpper.includes("SALES")) return true;
      const creditAcc = ((t as any).credit_account || (t as any).creditAccount || "").toString().toUpperCase();
      if (creditAcc.startsWith("4") || creditAcc.startsWith("7")) return true;
      if (typeof (t as any).credit === "number" && (t as any).credit > 0 && !(t as any).debit && typeUpper !== "EXPENSE" && typeUpper !== "PAYROLL") return true;
      return false;
    };

    // Helper to calculate cycle proration factor for sub-period custom date ranges
    const getRecordProrationFactor = (pr: any, range: DateRange): number => {
      if (!range || !range.startDate || !range.endDate) return 1;

      const cycleId = pr.cycleId || pr.payroll_cycle_id;
      const cycle = cycleId ? cycleMap.get(cycleId) : undefined;

      let pStart = pr.period_start || (pr as any).periodStart || (pr as any).startDate || cycle?.startDate || (cycle as any)?.start_date;
      let pEnd = pr.period_end || (pr as any).periodEnd || (pr as any).endDate || cycle?.endDate || (cycle as any)?.end_date;

      if (!pStart && !pEnd && cycleId) {
        const dateMatch = cycleId.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
        if (dateMatch) {
          pStart = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
          const dt = new Date(pStart);
          const endDt = new Date(dt.getFullYear(), dt.getMonth() + 1, 0);
          pEnd = endDt.toISOString().split("T")[0];
        }
      }

      if (!pStart || !pEnd) return 1;

      const recStartStr = normalizeDateStr(pStart);
      const recEndStr = normalizeDateStr(pEnd);
      if (!recStartStr || !recEndStr) return 1;

      const dStart = new Date(recStartStr).getTime();
      const dEnd = new Date(recEndStr).getTime();
      const rStart = new Date(range.startDate).getTime();
      const rEnd = new Date(range.endDate).getTime();

      if (isNaN(dStart) || isNaN(dEnd) || isNaN(rStart) || isNaN(rEnd)) return 1;

      const totalCycleDays = Math.max(1, Math.round((dEnd - dStart) / 86400000) + 1);
      const overlapStart = rStart > dStart ? rStart : dStart;
      const overlapEnd = rEnd < dEnd ? rEnd : dEnd;

      if (overlapStart > overlapEnd) return 0;
      const overlapDays = Math.max(1, Math.round((overlapEnd - overlapStart) / 86400000) + 1);

      if (overlapDays >= totalCycleDays) return 1;
      return overlapDays / totalCycleDays;
    };

    // Revenue Calculation & Instrumentation (Mode-Aware SSOT)
    const calculateTotalRevenue = (payrolls: PayrollRecord[], txs: LedgerTransaction[], range: DateRange) => {
      if (actualAccountingMode === "CASH") {
        const cashStatement = CanonicalCashEngine.executePipeline(
          {
            payrollRecords: payrolls,
            ledgerTransactions: txs,
          },
          {
            businessId: actualBizId,
            startDate: range.startDate,
            endDate: range.endDate,
          }
        );
        return cashStatement.totalInflow;
      }

      const glIncomeSum = txs
        .filter((t) => isIncomeTx(t))
        .reduce((sum, t) => sum + getTxAmount(t), 0);

      // DEF-9B-05: Strict Revenue Semantics.
      // Accounting revenue MUST strictly originate from posted GL Income (or cash inflows in cash mode).
      // Operational employee sales (sales_cents on payroll records) represent commercial attribution
      // for commissions and workforce productivity, NOT general ledger recognized company revenue.
      // Therefore, if glIncomeSum is 0, accounting revenue is 0.00 (NO FALLBACK to payroll sales).
      return glIncomeSum;
    };

    const sumQuickBooksRevenue = (txs: LedgerTransaction[]) =>
      txs
        .filter(
          (t) =>
            t.type === "INCOME" &&
            (t.source === "CSV_IMPORT" || (t as any).importedFrom === "QUICKBOOKS") &&
            t.status !== "REVERSED" &&
            (t.status as any) !== "VOID"
        )
        .reduce((sum, t) => sum + getTxAmount(t), 0);

    const rawIncomeTxs = curTxs.filter((t) => t.type === "INCOME");
    const totalIncomeBeforeStatusFilter = rawIncomeTxs.reduce((sum, t) => sum + getTxAmount(t), 0);

    const curRevVal = calculateTotalRevenue(curPayroll, curTxs, current);
    const prevRevVal = calculateTotalRevenue(prevPayroll, prevTxs, previous);
    const revenue = this.compareValues(curRevVal, prevRevVal);

    console.debug("[KPI:Revenue] Pipeline step breakdown:", {
      filterParameters: {
        business_id: actualBizId,
        startDate: current.startDate,
        endDate: current.endDate,
        branchesCount: actualBranches?.length || 0,
        departmentsCount: actualDepts?.length || 0,
      },
      incomeTransactionsRecovered: rawIncomeTxs.length,
      totalSumBeforeStatusExclusion: totalIncomeBeforeStatusFilter,
      finalValidTransactionsCount: curTxs.filter((t) => t.type === "INCOME" && t.status !== "REVERSED" && (t.status as any) !== "VOID" && (t.status as any) !== "CANCELLED").length,
      finalRevenueSum: curRevVal,
    });
    
    const curQbVal = sumQuickBooksRevenue(curTxs);
    const prevQbVal = sumQuickBooksRevenue(prevTxs);
    const quickbooksSalesRevenue = this.compareValues(curQbVal, prevQbVal);

    const standardQuinzaineHours =
      businessSettings?.standardQuinzaineHours ||
      businessSettings?.standardHours ||
      businessSettings?.payroll_policies?.standardQuinzaineHours ||
      businessSettings?.payrollPolicies?.standardQuinzaineHours ||
      96;

    // GL Expenses: includes ALL expense and payroll transactions in General Ledger (GL)
    const curGlExpenses = AnalyticsEngine.computeOperationalExpenses(curTxs, current, businessId, true);
    const prevGlExpenses = AnalyticsEngine.computeOperationalExpenses(prevTxs, previous, businessId, true);

    const curNonPayrollExp = AnalyticsEngine.computeOperationalExpenses(curTxs, current, businessId, false);
    const prevNonPayrollExp = AnalyticsEngine.computeOperationalExpenses(prevTxs, previous, businessId, false);

    const sumExpenses = (txs: LedgerTransaction[]) => AnalyticsEngine.computeOperationalExpenses(txs, current, businessId, true);
    const sumNonPayrollExpenses = (txs: LedgerTransaction[]) => AnalyticsEngine.computeOperationalExpenses(txs, current, businessId, false);

    // Payroll cost: EXCLUSIVELY from sealed / validated payroll_records with proration (SSOT)
    const curPayrollCost = AnalyticsEngine.computePayrollCost(curPayroll, current, isSocialTaxEnabled, cycleMap);
    const prevPayrollCost = AnalyticsEngine.computePayrollCost(prevPayroll, previous, isSocialTaxEnabled, cycleMap);
    const payrollCost = this.compareValues(curPayrollCost, prevPayrollCost, true);

    const sumPayrollDetails = (payrolls: PayrollRecord[], txs: LedgerTransaction[], range: DateRange) =>
      AnalyticsEngine.computePayrollCost(payrolls, range, isSocialTaxEnabled, cycleMap);

    // Detailed instrumentation for Expenses & Payroll
    const cycleLogDetails: any[] = [];
    let grossBeforeProration = 0;
    let grossAfterProration = 0;
    let totalTaxesAmount = 0;

    curPayroll.forEach((pr: any) => {
      const factor = AnalyticsEngine.getRecordProrationFactor(pr, current, cycleMap);
      const cycleId = pr.cycleId || pr.payroll_cycle_id;
      const cycle = cycleId ? cycleMap.get(cycleId) : undefined;
      let pStart = pr.period_start || (pr as any).periodStart || (pr as any).startDate || cycle?.startDate || (cycle as any)?.start_date;
      let pEnd = pr.period_end || (pr as any).periodEnd || (pr as any).endDate || cycle?.endDate || (cycle as any)?.end_date;

      const rawGross =
        (pr.gross_salary_cents !== undefined && pr.gross_salary_cents !== null ? pr.gross_salary_cents / 100 : undefined) ??
        pr.grossSalary ??
        pr.grossSalaryHtg ??
        pr.gross ??
        pr.baseSalary ??
        0;
      const proratedGross = rawGross * factor;

      const erCnss = isSocialTaxEnabled ? (((pr.cnss_employer_cents ? pr.cnss_employer_cents / 100 : 0) || pr.onaEmployer || (pr.cnssDeduction || 0)) * factor) : 0;
      const erOfatma = isSocialTaxEnabled ? (((pr.ofatma_employer_cents ? pr.ofatma_employer_cents / 100 : 0) || (pr.cns_employer_cents ? pr.cns_employer_cents / 100 : 0) || pr.ofatmaEmployer || (pr.cnsDeduction || 0)) * factor) : 0;
      const taxSum = erCnss + erOfatma;

      grossBeforeProration += rawGross;
      grossAfterProration += proratedGross;
      totalTaxesAmount += taxSum;

      cycleLogDetails.push({
        recordId: pr.id,
        cycleId,
        startDate: pStart,
        endDate: pEnd,
        prorationFactor: factor,
        rawGross,
        proratedGross,
        taxes: isSocialTaxEnabled ? taxSum : 0,
      });
    });

    // Explicit GL vs Payroll Subledger Reconciliation
    const curGlPayrollExp = curTxs
      .filter((t) => isPayrollRelatedTransaction(t) && t.status !== "REVERSED" && (t.status as any) !== "VOID")
      .reduce((sum, t) => sum + getTxAmount(t), 0);
    const prevGlPayrollExp = prevTxs
      .filter((t) => isPayrollRelatedTransaction(t) && t.status !== "REVERSED" && (t.status as any) !== "VOID")
      .reduce((sum, t) => sum + getTxAmount(t), 0);

    const curPayrollVariance = Math.abs(curGlPayrollExp - curPayrollCost);
    const curPayrollReconciliationStatus = (curGlPayrollExp === 0 && curPayrollCost === 0)
      ? "NO_PAYROLL"
      : (curPayrollVariance < 0.01 ? "RECONCILED" : "UNRECONCILED");

    // Total operational expenses: Non-payroll GL expenses + GL payroll (if posted) or Payroll Subledger cost (if GL not posted)
    const accrualCurExpenses = curNonPayrollExp + (curGlPayrollExp > 0 ? curGlPayrollExp : curPayrollCost);
    const accrualPrevExpenses = prevNonPayrollExp + (prevGlPayrollExp > 0 ? prevGlPayrollExp : prevPayrollCost);

    const curCashStatement = CanonicalCashEngine.executePipeline(
      {
        payrollRecords: curPayroll,
        ledgerTransactions: curTxs,
      },
      {
        businessId: actualBizId,
        startDate: current.startDate,
        endDate: current.endDate,
      }
    );

    const prevCashStatement = CanonicalCashEngine.executePipeline(
      {
        payrollRecords: prevPayroll,
        ledgerTransactions: prevTxs,
      },
      {
        businessId: actualBizId,
        startDate: previous.startDate,
        endDate: previous.endDate,
      }
    );

    const totalCurExpenses = actualAccountingMode === "CASH" ? curCashStatement.totalOutflow : accrualCurExpenses;
    const totalPrevExpenses = actualAccountingMode === "CASH" ? prevCashStatement.totalOutflow : accrualPrevExpenses;

    console.debug("[KPI:Expenses] Pipeline step breakdown:", {
      expenseTransactionsCount: curTxs.filter((t) => t.type !== "INCOME" && t.status !== "REVERSED" && (t.status as any) !== "VOID" && (t.status as any) !== "CANCELLED").length,
      glExpensesSum: curGlExpenses,
      nonPayrollGlExpensesSum: curNonPayrollExp,
      payrollCyclesOverlappingCount: cycleLogDetails.length,
      cyclesBreakdown: cycleLogDetails,
      grossPayrollBeforeProration: grossBeforeProration,
      proratedGrossPayroll: grossAfterProration,
      enableTaxes: isSocialTaxEnabled,
      socialTaxesAmount: isSocialTaxEnabled ? totalTaxesAmount : 0,
      totalPayrollCostProrated: curPayrollCost,
      finalExpensesSum: totalCurExpenses,
    });

    const expenses = this.compareValues(totalCurExpenses, totalPrevExpenses, true);
    const operationalExpenses = expenses;
    const totalExpenses = expenses;
    
    // Profit Calculation & Instrumentation (Revenue GL - Total Expenses GL/Payroll)
    const curProfitVal = curRevVal - totalCurExpenses;
    const prevProfitVal = prevRevVal - totalPrevExpenses;
    const profit = this.compareValues(curProfitVal, prevProfitVal);

    console.debug("[KPI:Profit] Final Profit Calculation:", {
      revenue: curRevVal,
      expenses: totalCurExpenses,
      profitResult: curProfitVal,
    });

    // DEF-9B-06: CashOnHand Lineage & Limitation.
    // Lineage: Cumulative running sum of all cash-settled General Ledger transactions (INCOME - EXPENSE/PAYROLL - ADVANCE)
    // up to the period end date.
    // Limitation: This represents GL Cash Balance across all accounts. It does NOT perform automatic physical
    // drawer reconciliation against individual till counts or branch safes (which reside in the operational Cash Management subledger).
    const allTxsUpToCurrent = actualTxs.filter((t) => {
      if (t.status === "REVERSED" || (t.status as any) === "VOID" || (t.status as any) === "CANCELLED") return false;
      if (actualBizId && t.business_id !== actualBizId && (t as any).businessId !== actualBizId) return false;
      const txDate = getTxDate(t);
      if (!txDate) return false; // Undated transactions MUST NEVER leak into historical running balance
      return txDate <= current.endDate;
    });

    const allTxsUpToPrevious = actualTxs.filter((t) => {
      if (t.status === "REVERSED" || (t.status as any) === "VOID" || (t.status as any) === "CANCELLED") return false;
      if (actualBizId && t.business_id !== actualBizId && (t as any).businessId !== actualBizId) return false;
      const txDate = getTxDate(t);
      if (!txDate) return false; // Undated transactions MUST NEVER leak into historical running balance
      return txDate <= previous.endDate;
    });

    const calculateTotalCash = (txs: LedgerTransaction[]) => {
      let rev = 0;
      let exp = 0;
      let adv = 0;
      txs.forEach((t) => {
        if (t.status === "REVERSED" || (t.status as any) === "VOID" || (t.status as any) === "CANCELLED") return;
        // Only count actual cash movements
        if (t.payment_method === "NON_CASH" || (t as any).paymentMethod === "NON_CASH") return;
        
        const amt = getTxAmount(t);
        if (t.type === "INCOME") rev += amt;
        else if (t.type === "EXPENSE" || t.type === "PAYROLL") exp += amt;
        else if (t.type === "ADVANCE") adv += amt;
      });
      return rev - exp - adv;
    };

    const cashOnHand = this.compareValues(
      calculateTotalCash(allTxsUpToCurrent),
      calculateTotalCash(allTxsUpToPrevious)
    );

    // DEF-9B-02: Canonical Net Cash Flow (Variation de Trésorerie)
    // Derived canonically from CashBasisEngine: Total Settled Inflows - Total Settled Outflows
    const netCashFlow = this.compareValues(
      curCashStatement.netCashFlow,
      prevCashStatement.netCashFlow
    );

    // Burn Rate (expenses per day)
    const getDays = (range: DateRange) => {
      const d1 = new Date(range.startDate);
      const d2 = new Date(range.endDate);
      const diff = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1);
      return diff;
    };
    const curDays = getDays(current);
    const prevDays = getDays(previous);
    const burnRate = this.compareValues(totalCurExpenses / curDays, totalPrevExpenses / prevDays, true);

    // 4. Workforce, Payroll & Attendance KPIs
    const getAttendanceHours = (r: AttendanceRecord | any): number => {
      if (!r) return 0;
      if (typeof r.realHours === "number" && !isNaN(r.realHours) && r.realHours > 0) return r.realHours;
      if (typeof r.hoursWorked === "number" && !isNaN(r.hoursWorked) && r.hoursWorked > 0) return r.hoursWorked;
      if (typeof r.hours_worked === "number" && !isNaN(r.hours_worked) && r.hours_worked > 0) return r.hours_worked;
      if (typeof r.totalHours === "number" && !isNaN(r.totalHours) && r.totalHours > 0) return r.totalHours;
      if (typeof r.workedHours === "number" && !isNaN(r.workedHours) && r.workedHours > 0) return r.workedHours;
      if (typeof r.totalMinutes === "number" && !isNaN(r.totalMinutes) && r.totalMinutes > 0) return Number((r.totalMinutes / 60).toFixed(2));
      
      if (r.checkIn && r.checkOut && typeof r.checkIn === "string" && typeof r.checkOut === "string") {
        const [h1, m1] = r.checkIn.split(":").map(Number);
        const [h2, m2] = r.checkOut.split(":").map(Number);
        if (!isNaN(h1) && !isNaN(h2)) {
          const mins1 = h1 * 60 + (m1 || 0);
          const mins2 = h2 * 60 + (m2 || 0);
          if (mins2 > mins1) return Number(((mins2 - mins1) / 60).toFixed(2));
        }
      }

      const st = String(r.status || "").toUpperCase();
      if (st !== "ABSENT" && st !== "CANCELLED" && st !== "VOID") {
        if (typeof r.plannedHours === "number" && r.plannedHours > 0) return r.plannedHours;
        return 8;
      }

      return 0;
    };

    // Active staff: distinct employees who have worked and have at least ONE day of presence in attendance logs for the period
    const curActiveEmpIds = new Set(
      curAttendance
        .filter((a) => (a.status as string) !== "ABSENT" && (a.status as string) !== "CANCELLED" && (a.status as string) !== "VOID" && (a.status as string) !== "REJECTED")
        .map((a) => a.employeeId || (a as any).employee_id)
        .filter(Boolean)
    );
    const prevActiveEmpIds = new Set(
      prevAttendance
        .filter((a) => (a.status as string) !== "ABSENT" && (a.status as string) !== "CANCELLED" && (a.status as string) !== "VOID" && (a.status as string) !== "REJECTED")
        .map((a) => a.employeeId || (a as any).employee_id)
        .filter(Boolean)
    );

    const curActiveStaffCount = curActiveEmpIds.size;
    const prevActiveStaffCount = prevActiveEmpIds.size;
    const activeStaff = this.compareValues(curActiveStaffCount, prevActiveStaffCount);

    // Attendance calculations (Dynamic SSOT: Worked Hours / Expected Hours)
    // Expected hours read from business settings (standardQuinzaineHours, default 96h)
    // Retards et absences ne sont pas appliqués en pénalités soustractives directes
    const computeAttendanceKPIs = (attendance: AttendanceRecord[], staffCount: number = curActiveStaffCount || activeEmployees.length, payrolls: PayrollRecord[] = curPayroll, range: DateRange = current) => {
      const expectedHoursPerEmployee = AnalyticsEngine.getExpectedWorkingHours(range.startDate, range.endDate, 8, standardQuinzaineHours);
      const empCount = staffCount > 0 ? staffCount : (activeEmployees.length > 0 ? activeEmployees.length : 1);
      const expectedTotalHours = empCount * expectedHoursPerEmployee;

      // 1. Worked hours from payroll_records if present (prorated), else attendance records
      let workedHoursSum = 0;
      const validPayrolls = (payrolls || []).filter((p: any) => !p.isExcluded && p.status !== "CANCELLED" && p.status !== "VOID" && p.status !== "REJECTED");
      const payrollWorkedHours = validPayrolls.reduce((sum, pr: any) => {
        const factor = AnalyticsEngine.getRecordProrationFactor(pr, range, cycleMap);
        const hrs = pr.workedHours ?? pr.worked_hours ?? (pr.worked_minutes ? pr.worked_minutes / 60 : 0);
        return sum + (hrs * factor);
      }, 0);

      const presentRecords = attendance.filter((a) => (a.status as string) !== "ABSENT" && (a.status as string) !== "CANCELLED" && (a.status as string) !== "VOID" && (a.status as string) !== "REJECTED");
      const attendanceWorkedHours = presentRecords.reduce((sum, r) => sum + getAttendanceHours(r), 0);

      // Prioritize pointage / attendance records (module pointage et présences) as primary SSOT for attendance rate
      if (attendanceWorkedHours > 0 || presentRecords.length > 0) {
        workedHoursSum = attendanceWorkedHours;
      } else if (payrollWorkedHours > 0) {
        workedHoursSum = payrollWorkedHours;
      }

      const total = attendance.length;
      const lates = attendance.filter((a) => a.status === "LATE").length;
      const absents = attendance.filter((a) => a.status === "ABSENT").length;

      // Pure ratio: Worked Hours / Expected Hours (capped at 100%)
      let attRate = 0;
      if (expectedTotalHours > 0 && workedHoursSum > 0) {
        attRate = Math.min(100, Math.max(0, parseFloat(((workedHoursSum / expectedTotalHours) * 100).toFixed(1))));
      } else if (total > 0 && presentRecords.length > 0) {
        attRate = Math.min(100, Math.max(0, Math.round((presentRecords.length / total) * 100)));
      }

      const explicitAbsenceRate = total > 0 ? Math.round((absents / total) * 100) : 0;
      const hoursDeficitAbsenceRate = Math.max(0, 100 - attRate);
      const computedAbsenceRate = Math.max(0, Math.min(100, Math.max(explicitAbsenceRate, hoursDeficitAbsenceRate)));

      console.debug("[KPI:Attendance] Pipeline step breakdown:", {
        filterParameters: {
          business_id: businessId,
          startDate: range.startDate,
          endDate: range.endDate,
          branchesCount: branches?.length || 0,
          departmentsCount: departments?.length || 0,
          standardQuinzaineHours,
        },
        activeOperationalEmployeesCount: empCount,
        actualWorkedHoursSum: workedHoursSum,
        expectedHoursPerEmployee,
        expectedTotalHours,
        computedAttendanceRate: attRate,
      });

      return {
        attendanceRate: attRate,
        latenessRate: total > 0 ? Math.max(0, Math.min(100, Math.round((lates / total) * 100))) : 0,
        absenceRate: computedAbsenceRate,
        avgHours: total > 0 ? Number((workedHoursSum / total).toFixed(1)) : 0.0,
      };
    };

    const curAttStats = computeAttendanceKPIs(curAttendance, curActiveStaffCount || activeEmployees.length, curPayroll, current);
    const prevAttStats = computeAttendanceKPIs(prevAttendance, prevActiveStaffCount || activeEmployees.length, prevPayroll, previous);

    const attendanceRate = this.compareValues(curAttStats.attendanceRate, prevAttStats.attendanceRate);
    const latenessRate = this.compareValues(curAttStats.latenessRate, prevAttStats.latenessRate, true);
    const absenceRate = this.compareValues(curAttStats.absenceRate, prevAttStats.absenceRate, true);
    const avgHoursWorked = this.compareValues(curAttStats.avgHours, prevAttStats.avgHours);

    // Advances exposure (pending advances in period)
    const curAdvances = curTxs
      .filter((t) => t.type === "ADVANCE" && t.status !== "REVERSED" && (t.status as any) !== "VOID" && (t.status as any) !== "CANCELLED")
      .reduce((sum, t) => sum + getTxAmount(t), 0);
    const prevAdvances = prevTxs
      .filter((t) => t.type === "ADVANCE" && t.status !== "REVERSED" && (t.status as any) !== "VOID" && (t.status as any) !== "CANCELLED")
      .reduce((sum, t) => sum + getTxAmount(t), 0);
    const advanceExposure = this.compareValues(curAdvances, prevAdvances, true);

    // Helper to evaluate commissions for a payroll record exclusively from payroll_records (SSOT)
    // NEVER recalculates from GL transactions or sales volume
    const getRecordCommissions = (p: PayrollRecord) => {
      if (p.commission_cents !== undefined && p.commission_cents !== null) {
        return p.commission_cents / 100;
      }
      return p.commissions || (p as any).commissionsHtg || (p as any).commissionAmount || (p as any).commission || 0;
    };

    // Commissions paid across period exclusively from sealed / validated payroll records
    const getCommissionsSum = (payrolls: PayrollRecord[], range: DateRange) => {
      return (payrolls || []).reduce((sum, p: any) => {
        if (p.isExcluded || p.status === "CANCELLED" || p.status === "VOID" || p.status === "REJECTED") return sum;
        const factor = AnalyticsEngine.getRecordProrationFactor(p, range, cycleMap);
        return sum + (getRecordCommissions(p) * factor);
      }, 0);
    };

    const curComms = getCommissionsSum(curPayroll, current);
    const prevComms = getCommissionsSum(prevPayroll, previous);
    const commissionsPaid = this.compareValues(curComms, prevComms);

    // 5. Segment breakdown (Branches)
    const branchPerformance: BranchPerformance[] = (actualBranches || [])
      .filter((b) => !actualBizId || !b.business_id || b.business_id === actualBizId || (b as any).businessId === actualBizId)
      .map((br) => {
        const brEmployees = activeEmployees.filter((e) => (e.branchId || (e as any).branch_id) === br.id);
        const brAttendance = curAttendance.filter((a) => (a.branchId || (a as any).branch_id) === br.id);
        const brTxs = curTxs.filter((t) => (t.branchId || (t as any).branch_id) === br.id);
        const brPayrolls = curPayroll.filter((p) => {
          const emp = activeEmployees.find((e) => e.id === (p.employeeId || p.employee_id));
          return (p.branch_id || (p as any).branchId || emp?.branchId || (emp as any)?.branch_id) === br.id;
        });

        const brSalesFromPayroll = brPayrolls.reduce((sum, pr: any) => {
          const factor = getRecordProrationFactor(pr, current);
          if (factor <= 0) return sum;
          const s = (pr.sales_cents ? pr.sales_cents / 100 : (pr.salesHtg || pr.salesVolume || pr.sales_gl || pr.sales || 0));
          return sum + (s * factor);
        }, 0);

        const brNonEmpGlIncome = brTxs.filter((t) => {
          if (t.status === "REVERSED" || (t.status as any) === "VOID" || (t.status as any) === "CANCELLED") return false;
          if (t.type !== "INCOME") return false;
          if (brSalesFromPayroll > 0 && (t.employeeId || (t as any).employee_id)) return false;
          return true;
        }).reduce((sum, t) => sum + getTxAmount(t), 0);

        const brRev = brSalesFromPayroll + brNonEmpGlIncome;
        const brPayrollCost = sumPayrollDetails(brPayrolls, brTxs, current);
        const brNonPayrollExp = sumNonPayrollExpenses(brTxs);

        const brExpenses = brPayrollCost + brNonPayrollExp;
        const brProfit = brRev - brExpenses;
        const brMargin = brRev > 0 ? (brProfit / brRev) * 100 : 0;

        const attStats = computeAttendanceKPIs(brAttendance, brEmployees.length);
        const attRate = attStats.attendanceRate;

        const efficiencyScore = Math.max(
          10,
          Math.min(
            100,
            attRate * 0.4 + (brMargin > 0 ? Math.min(60, brMargin) : 10) + brEmployees.length * 2
          )
        );

        return {
          branchId: br.id,
          branchName: br.name,
          revenue: parseFloat(brRev.toFixed(2)),
          expenses: parseFloat(brExpenses.toFixed(2)),
          payrollCost: parseFloat(brPayrollCost.toFixed(2)),
          nonPayrollExpenses: parseFloat(brNonPayrollExp.toFixed(2)),
          profit: parseFloat(brProfit.toFixed(2)),
          margin: parseFloat(brMargin.toFixed(2)),
          attendanceRate: attRate,
          employeeCount: brEmployees.length,
          efficiencyScore: Math.round(efficiencyScore),
        };
      });

    // 6. Segment breakdown (Departments & Cost Centers)
    const deptMap = new Map<string, { 
      name: string; 
      payrollCost: number; 
      nonPayrollExp: number; 
      salesFromPayroll: number;
      glIncome: number;
      empCount: number; 
      attList: AttendanceRecord[] 
    }>();
    
    // Helper to resolve department using ReferenceResolver / DepartmentAliasEngine SSOT
    const resolveDeptObj = (query: string | undefined | null): Department | undefined => {
      if (!query) return undefined;
      return ReferenceResolver.resolveDepartment(actualDepts || [], query);
    };

    // Initialize with registered departments
    (actualDepts || [])
      .filter((d) => !actualBizId || !d.business_id || d.business_id === actualBizId || (d as any).businessId === actualBizId)
      .forEach((dept) => {
        const deptEmployees = activeEmployees.filter((e) => {
          const empDeptRaw = e.departmentId || (e as any).department_id || (e as any).department_name;
          if (!empDeptRaw) return false;
          const resolved = resolveDeptObj(empDeptRaw);
          return resolved ? resolved.id === dept.id : empDeptRaw === dept.id;
        });

        deptMap.set(dept.id, {
          name: dept.name,
          payrollCost: 0,
          nonPayrollExp: 0,
          salesFromPayroll: 0,
          glIncome: 0,
          empCount: deptEmployees.length,
          attList: [],
        });
      });

    // Attribute payroll expenses & sales to departments
    curPayroll.forEach((p: any) => {
      const statusUpper = (p.status || "").toUpperCase();
      if (statusUpper === "CANCELLED" || statusUpper === "VOID" || statusUpper === "REJECTED" || p.isExcluded) {
        return;
      }

      const pEmail = (p.employee_email || p.employeeEmail || p.email || "").toLowerCase().trim();
      const emp = activeEmployees.find(
        (e) => e.id === (p.employeeId || p.employee_id) || (pEmail && e.email && e.email.toLowerCase().trim() === pEmail)
      );
      const rawDeptStr = p.department_id || (p as any).departmentId || p.department_name || emp?.departmentId || (emp as any)?.department_id;
      const resolvedDept = resolveDeptObj(rawDeptStr);
      const deptId = resolvedDept ? resolvedDept.id : (rawDeptStr || "general");

      const factor = AnalyticsEngine.getRecordProrationFactor(p, current, cycleMap);
      if (factor <= 0) return;

      const rawGross = (p.gross_salary_cents !== undefined && p.gross_salary_cents !== null ? p.gross_salary_cents / 100 : undefined) ?? p.grossSalary ?? p.grossSalaryHtg ?? p.gross ?? p.baseSalary ?? 0;
      let erTaxes = 0;
      if (isSocialTaxEnabled) {
        if (p.employer_contributions_cents !== undefined && p.employer_contributions_cents !== null) {
          erTaxes = p.employer_contributions_cents / 100;
        } else {
          const erCnss = (p.cnss_employer_cents ? p.cnss_employer_cents / 100 : 0) || p.onaEmployer || (p.cnssDeduction || 0) || 0;
          const erOfatma = (p.ofatma_employer_cents ? p.ofatma_employer_cents / 100 : 0) || (p.cns_employer_cents ? p.cns_employer_cents / 100 : 0) || p.ofatmaEmployer || (p.cnsDeduction || 0) || 0;
          erTaxes = erCnss + erOfatma;
        }
      }
      const pCost = (rawGross + erTaxes) * factor;

      const pSales = (p.sales_cents ? p.sales_cents / 100 : (p.salesHtg || p.salesVolume || p.sales_gl || p.sales || 0)) * factor;

      if (!deptMap.has(deptId)) {
        deptMap.set(deptId, {
          name: resolvedDept?.name || (deptId === "general" ? "Administration Générale" : deptId),
          payrollCost: 0,
          nonPayrollExp: 0,
          salesFromPayroll: 0,
          glIncome: 0,
          empCount: 0,
          attList: [],
        });
      }
      const entry = deptMap.get(deptId)!;
      entry.payrollCost += pCost;
      entry.salesFromPayroll += pSales;
    });

    // Attribute transaction expenses & income to departments
    curTxs
      .filter((t) => t.status !== "REVERSED" && (t.status as any) !== "VOID" && (t.status as any) !== "CANCELLED")
      .forEach((t) => {
        const tEmail = (t.employee_email || (t as any).employeeEmail || (t as any).email || "").toLowerCase().trim();
        const emp = activeEmployees.find(
          (e) =>
            (t.employeeId && e.id === t.employeeId) ||
            ((t as any).employee_id && e.id === (t as any).employee_id) ||
            (tEmail && e.email && e.email.toLowerCase().trim() === tEmail)
        );

        const rawDeptStr = t.departmentId || (t as any).department_id || (t as any).department_name || (t as any).department_code || emp?.departmentId || (emp as any)?.department_id;
        const resolvedDept = resolveDeptObj(rawDeptStr);
        const deptId = resolvedDept ? resolvedDept.id : (rawDeptStr || (t.category ? t.category : "general"));
        const deptName = resolvedDept?.name || (deptId === "general" ? "Frais Généraux" : deptId);
        const tAmount = getTxAmount(t);

        if (!deptMap.has(deptId)) {
          deptMap.set(deptId, {
            name: deptName,
            payrollCost: 0,
            nonPayrollExp: 0,
            salesFromPayroll: 0,
            glIncome: 0,
            empCount: 0,
            attList: [],
          });
        }
        const entry = deptMap.get(deptId)!;

        if (t.type === "INCOME") {
          if (!t.employeeId && !(t as any).employee_id && !tEmail) {
            entry.glIncome += tAmount;
          } else if (entry.salesFromPayroll === 0) {
            entry.glIncome += tAmount;
          }
        } else if (!AnalyticsEngine.isPayrollRelatedTransaction(t)) {
          // EXCLUSION STRICTE : Ne jamais mélanger les écritures de paie avec les dépenses d'exploitation
          if (t.type === "EXPENSE" || t.type === "BONUS" || t.type === "COMPENSATION" || (t.type as any) === "PENALTY") {
            entry.nonPayrollExp += tAmount;
          }
        }
      });

    // Attribute attendance
    curAttendance.forEach((a) => {
      const aEmail = ((a as any).employee_email || (a as any).email || "").toLowerCase().trim();
      const emp = activeEmployees.find(
        (e) => e.id === (a.employeeId || (a as any).employee_id) || (aEmail && e.email && e.email.toLowerCase().trim() === aEmail)
      );
      const rawDeptStr = a.departmentId || (a as any).department_id || emp?.departmentId || (emp as any)?.department_id;
      const resolvedDept = resolveDeptObj(rawDeptStr);
      const deptId = resolvedDept ? resolvedDept.id : rawDeptStr;
      if (deptId && deptMap.has(deptId)) {
        deptMap.get(deptId)!.attList.push(a);
      }
    });

    const departmentPerformance: DepartmentPerformance[] = Array.from(deptMap.entries()).map(([deptId, data]) => {
      const attStats = computeAttendanceKPIs(data.attList, data.empCount || 1);
      const rev = data.salesFromPayroll + data.glIncome;
      const exp = data.payrollCost + data.nonPayrollExp;
      const margin = rev > 0 ? Math.round(((rev - exp) / rev) * 100) : 0;

      return {
        departmentId: deptId,
        departmentName: data.name,
        expenses: parseFloat(exp.toFixed(2)),
        payrollCost: parseFloat(data.payrollCost.toFixed(2)),
        nonPayrollExpenses: parseFloat(data.nonPayrollExp.toFixed(2)),
        revenue: parseFloat(rev.toFixed(2)),
        margin,
        employeeCount: data.empCount,
        attendanceRate: attStats.attendanceRate,
        averageHours: attStats.avgHours,
      };
    }).sort((a, b) => b.expenses - a.expenses);

    // 7. Individual scorecards (Employees)
    const employeeScorecards: EmployeeScorecard[] = activeEmployees.map((emp) => {
      const empAttendance = curAttendance.filter((a) => a.employeeId === emp.id || (a as any).employee_id === emp.id);
      const empCurPayrolls = curPayroll.filter((p) => p.employeeId === emp.id || p.employee_id === emp.id);
      const relevantPayrolls = empCurPayrolls;

      const empEmail = emp.email ? emp.email.toLowerCase().trim() : "";
      const empTxs = curTxs.filter(
        (t) =>
          t.employeeId === emp.id ||
          (t as any).employee_id === emp.id ||
          (empEmail &&
            (((t as any).employee_email && (t as any).employee_email.toLowerCase().trim() === empEmail) ||
              ((t as any).employeeEmail && (t as any).employeeEmail.toLowerCase().trim() === empEmail) ||
              ((t as any).email && (t as any).email.toLowerCase().trim() === empEmail)))
      );

      let commissions = 0;
      if (relevantPayrolls.length > 0) {
        commissions = relevantPayrolls.reduce((sum, p) => {
          const factor = AnalyticsEngine.getRecordProrationFactor(p, current, cycleMap);
          return sum + (getRecordCommissions(p) * factor);
        }, 0);
      }

      let empSalesVolume = 0;
      if (relevantPayrolls.length > 0) {
        empSalesVolume = relevantPayrolls.reduce((sum: number, p: any) => {
          const factor = AnalyticsEngine.getRecordProrationFactor(p, current, cycleMap);
          const sales = (p.sales_cents ? p.sales_cents / 100 : (p.salesHtg || p.salesVolume || p.sales_gl || 0));
          return sum + (sales * factor);
        }, 0);
      }
      if (empSalesVolume === 0 && empTxs.length > 0) {
        empSalesVolume = empTxs
          .filter((t) => (t.type || "").toUpperCase() === "INCOME" && (t.status || "").toUpperCase() !== "VOIDED")
          .reduce((sum, t) => sum + (t.amount || 0), 0);
      }

      const latestPayroll = relevantPayrolls[0];
      const totalDays = empAttendance.length;
      const lates = empAttendance.filter((a) => a.status === "LATE").length;
      const absents = empAttendance.filter((a) => a.status === "ABSENT").length;
      const overtimeLogs = empAttendance.filter((a) => a.status === "OVERTIME");

      const presentRecords = empAttendance.filter((a) => a.status !== "ABSENT" || getAttendanceHours(a) > 0);
      const overtimeHours = overtimeLogs.reduce((sum, a) => sum + Math.max(0, getAttendanceHours(a) - (a.plannedHours || 8)), 0);
      let totalHours = presentRecords.reduce((sum, a) => sum + getAttendanceHours(a), 0);
      if (totalHours === 0 && relevantPayrolls.length > 0) {
        totalHours = relevantPayrolls.reduce((sum, p: any) => {
          const factor = AnalyticsEngine.getRecordProrationFactor(p, current, cycleMap);
          const hrs = (p.workedHours ?? (p.worked_minutes ? p.worked_minutes / 60 : (p.hours || 0)));
          return sum + (hrs * factor);
        }, 0);
      }
      const mustWorkHours = AnalyticsEngine.getExpectedWorkingHours(current.startDate, current.endDate, 8, standardQuinzaineHours);

      const hasWorked = (presentRecords.length > 0 && totalHours > 0) || totalHours > 0 || commissions > 0 || empSalesVolume > 0;

      const latenessScore = totalDays > 0 ? (lates / totalDays) * 100 : 0;
      const attendanceConsistencyScore = mustWorkHours > 0 ? Math.min(100, Math.round((totalHours / mustWorkHours) * 100)) : 100;
      const hourRatio = mustWorkHours > 0 ? (totalHours / mustWorkHours) * 100 : 0;

      const commissionBonus = Math.min(20, (commissions / (emp.baseSalary || 1)) * 100);
      const productivityIndex = hasWorked
        ? Math.max(0, Math.min(100, Math.round(attendanceConsistencyScore + commissionBonus)))
        : 0;

      const empBaseSalary = emp.baseSalary 
        ?? (emp as any).base_salary 
        ?? ((emp as any).base_salary_cents ? (emp as any).base_salary_cents / 100 : 0)
        ?? ((emp as any).monthly_salary_cents ? (emp as any).monthly_salary_cents / 200 : 0)
        ?? (relevantPayrolls[0]?.baseSalary || (relevantPayrolls[0]?.base_salary_cents ? relevantPayrolls[0].base_salary_cents / 100 : 0));

      const totalBaseSalary = relevantPayrolls.length > 0
        ? relevantPayrolls.reduce((sum, p) => sum + (p.baseSalary || (p.base_salary_cents ? p.base_salary_cents / 100 : empBaseSalary)), 0)
        : (hasWorked ? empBaseSalary : 0);

      const totalNetPaid = relevantPayrolls.length > 0
        ? relevantPayrolls.reduce((sum, p) => sum + (p.netPaid || (p.net_salary_cents ? p.net_salary_cents / 100 : 0)), 0)
        : (hasWorked ? (empBaseSalary + commissions) : 0);

      const empPayrollCost = sumPayrollDetails(relevantPayrolls, empTxs, current);
      const underperformanceSignal = hasWorked && (latenessScore > 20 || attendanceConsistencyScore < 80);

      const resolvedDeptObj = resolveDeptObj(emp.departmentId || (emp as any).department_id);

      return {
        employeeId: emp.id,
        employeeName: emp.name,
        branchId: emp.branchId || (emp as any).branch_id,
        departmentId: resolvedDeptObj ? resolvedDeptObj.id : (emp.departmentId || (emp as any).department_id),
        attendanceConsistencyScore: Math.round(attendanceConsistencyScore),
        latenessScore: Math.round(latenessScore),
        productivityIndex: Math.round(productivityIndex),
        overtimeHours: parseFloat(overtimeHours.toFixed(1)),
        totalHours: parseFloat(totalHours.toFixed(1)),
        baseSalary: totalBaseSalary,
        commissions,
        netPaid: totalNetPaid,
        payrollCost: parseFloat(empPayrollCost.toFixed(2)),
        underperformanceSignal,
        salesVolume: empSalesVolume,
      };
    });

    // Sort employeeScorecards: Active/Worked personnel first, ranked by productivity & hours worked
    employeeScorecards.sort((a, b) => {
      const aWorked = a.totalHours > 0 || a.commissions > 0;
      const bWorked = b.totalHours > 0 || b.commissions > 0;
      if (aWorked !== bWorked) return aWorked ? -1 : 1;
      if (b.productivityIndex !== a.productivityIndex) {
        return b.productivityIndex - a.productivityIndex;
      }
      return b.totalHours - a.totalHours;
    });

    // 8. Forecast Engine
    const forecast: ShortTermForecast = {
      forecast7Days: profit.currentValue - burnRate.currentValue * 7,
      forecast15Days: profit.currentValue - burnRate.currentValue * 15,
      forecast30Days: profit.currentValue - burnRate.currentValue * 30,
    };

    // 9. Static or dynamic trends mapping
    const getLabelFr = (key: string): string => {
      const labels: Record<string, string> = {
        Jan: "Janvier",
        Feb: "Février",
        Mar: "Mars",
        Apr: "Avril",
        May: "Mai",
        Jun: "Juin",
        Jul: "Juillet",
      };
      return labels[key] || key;
    };

    const getLabelHt = (key: string): string => {
      const labels: Record<string, string> = {
        Jan: "Janvye",
        Feb: "Fevriye",
        Mar: "Mas",
        Apr: "Avril",
        May: "Me",
        Jun: "Jen",
        Jul: "Jiyè",
      };
      return labels[key] || key;
    };

    const monthNamesFr = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
    const monthNamesHt = ["Janv", "Fevr", "Mas", "Avr", "Me", "Jen", "Jiyè", "Out", "Sept", "Okt", "Nov", "Des"];

    const expenseBreakdown = Object.entries(
      curTxs
        .filter(t => t.type === 'EXPENSE' && t.status !== "REVERSED" && (t.status as any) !== "VOID")
        .reduce((acc, t) => {
          const cat = t.category || 'Autres';
          acc[cat] = (acc[cat] || 0) + getTxAmount(t);
          return acc;
        }, {} as Record<string, number>)
    ).map(([name, value]) => ({ name, value }));

    // Generate period-scoped buckets strictly matching current.startDate and current.endDate
    interface TrendBucket {
      key: string;
      label: string;
      startDate: string;
      endDate: string;
    }

    const sParts = current.startDate.split("-").map(p => parseInt(p, 10));
    const eParts = current.endDate.split("-").map(p => parseInt(p, 10));
    const sDate = new Date(sParts[0], (sParts[1] || 1) - 1, sParts[2] || 1);
    const eDate = new Date(eParts[0], (eParts[1] || 1) - 1, eParts[2] || 1);
    const diffDays = Math.max(1, Math.round((eDate.getTime() - sDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    const buckets: TrendBucket[] = [];

    if (diffDays <= 31) {
      // Granularity: Day by day across the selected range (e.g. 1 Juil - 15 Juil)
      const cur = new Date(sDate);
      while (cur <= eDate) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, "0");
        const d = String(cur.getDate()).padStart(2, "0");
        const dateStr = `${y}-${m}-${d}`;
        const dayNum = cur.getDate();
        const mIdx = cur.getMonth();
        const mShort = language === "ht" ? (monthNamesHt[mIdx] || "Janv") : (monthNamesFr[mIdx] || "Jan");
        buckets.push({
          key: dateStr,
          label: `${dayNum} ${mShort}`,
          startDate: dateStr,
          endDate: dateStr,
        });
        cur.setDate(cur.getDate() + 1);
      }
    } else if (diffDays <= 92) {
      // Granularity: Week by week intervals
      let cur = new Date(sDate);
      let weekNum = 1;
      while (cur <= eDate) {
        const wStart = new Date(cur);
        const wEnd = new Date(cur);
        wEnd.setDate(wEnd.getDate() + 6);
        if (wEnd > eDate) {
          wEnd.setTime(eDate.getTime());
        }
        const sY = wStart.getFullYear();
        const sM = String(wStart.getMonth() + 1).padStart(2, "0");
        const sD = String(wStart.getDate()).padStart(2, "0");
        const eY = wEnd.getFullYear();
        const eM = String(wEnd.getMonth() + 1).padStart(2, "0");
        const eD = String(wEnd.getDate()).padStart(2, "0");
        buckets.push({
          key: `week_${weekNum}`,
          label: `Sem ${weekNum} (${sD}/${sM}-${eD}/${eM})`,
          startDate: `${sY}-${sM}-${sD}`,
          endDate: `${eY}-${eM}-${eD}`,
        });
        weekNum++;
        cur.setDate(cur.getDate() + 7);
      }
    } else {
      // Granularity: Month by month intervals
      let cur = new Date(sDate.getFullYear(), sDate.getMonth(), 1);
      while (cur <= eDate) {
        const y = cur.getFullYear();
        const mIdx = cur.getMonth();
        const mStr = String(mIdx + 1).padStart(2, "0");
        const lastDay = new Date(y, mIdx + 1, 0).getDate();
        const startStr = `${y}-${mStr}-01`;
        const endStr = `${y}-${mStr}-${String(lastDay).padStart(2, "0")}`;
        const label = language === "ht" ? `${monthNamesHt[mIdx]} ${y}` : `${monthNamesFr[mIdx]} ${y}`;
        buckets.push({
          key: `${y}-${mStr}`,
          label,
          startDate: startStr,
          endDate: endStr,
        });
        cur.setMonth(cur.getMonth() + 1);
      }
    }

    const historicalTrends: TrendPoint[] = buckets.map((b) => {
      const bucketRange: DateRange = { startDate: b.startDate, endDate: b.endDate };

      const matchPayrolls = (actualPayroll || []).filter((p) => {
        return matchesBusiness(p) && (p.status as any) !== "REJECTED" && (p.status as any) !== "VOID" && isPayrollInPeriod(p, bucketRange);
      });

      const matchAttendance = (actualAttendance || []).filter((a) => {
        const aDate = getAttendanceDate(a);
        if (!aDate) return false;
        return aDate >= b.startDate && aDate <= b.endDate;
      });

      const matchTransactions = (actualTxs || []).filter((tx) => {
        if (tx.status === "REVERSED" || (tx.status as any) === "VOID" || (tx.status as any) === "CANCELLED") return false;
        if (actualBizId && tx.business_id !== actualBizId && (tx as any).businessId !== actualBizId) return false;
        const txDate = getTxDate(tx);
        if (!txDate) return false;
        return txDate >= b.startDate && txDate <= b.endDate;
      });

      // True Gross Revenue strictly in bucket
      const gross = matchTransactions
        .filter((t) => t.type === "INCOME")
        .reduce((sum, t) => sum + getTxAmount(t), 0);

      // True Operational Expenses strictly in bucket
      const opExpenses = matchTransactions
        .filter((t) => t.type === "EXPENSE" || t.type === "BONUS" || t.type === "COMPENSATION")
        .reduce((sum, t) => sum + getTxAmount(t), 0);

      // Prorated or exact payroll in bucket
      let payrollInBucket = 0;
      const bucketPayrollTxs = matchTransactions.filter((t) => t.type === "PAYROLL");

      if (bucketPayrollTxs.length > 0) {
        payrollInBucket = bucketPayrollTxs.reduce((sum, t) => sum + getTxAmount(t), 0);
      } else if (matchPayrolls.length > 0) {
        payrollInBucket = matchPayrolls.reduce((sum, p) => {
          const gross = p.grossSalary || ((p as any).gross_salary_cents ? (p as any).gross_salary_cents / 100 : 0) || (p.baseSalary || 0);
          if (gross <= 0) return sum;

          const cycleId = p.cycleId || p.payroll_cycle_id;
          const cycle = cycleId ? cycleMap.get(cycleId) : undefined;
          let pStart = normalizeDateStr(p.period_start || cycle?.startDate || cycle?.start_date || (p as any).generated_at || current.startDate);
          let pEnd = normalizeDateStr(p.period_end || cycle?.endDate || cycle?.end_date || cycle?.effectiveAccountingDate || (p as any).generated_at || current.endDate);

          if (!pStart || !pEnd) {
            return sum + gross / Math.max(1, diffDays);
          }

          const dStart = new Date(pStart);
          const dEnd = new Date(pEnd);
          const totalCycleDays = Math.max(1, Math.round((dEnd.getTime() - dStart.getTime()) / 86400000) + 1);

          const bStart = new Date(b.startDate);
          const bEnd = new Date(b.endDate);
          const oStart = Math.max(dStart.getTime(), bStart.getTime());
          const oEnd = Math.min(dEnd.getTime(), bEnd.getTime());

          if (oStart <= oEnd) {
            const overlapDays = Math.round((oEnd - oStart) / 86400000) + 1;
            return sum + (gross / totalCycleDays) * overlapDays;
          }
          return sum;
        }, 0);
      }

      const totalCosts = opExpenses + payrollInBucket;
      const net = gross - totalCosts;

      let staff = new Set([
        ...matchPayrolls.map((p) => p.employeeId || p.employee_id),
        ...matchAttendance.map((a) => a.employeeId || (a as any).employee_id)
      ]).size;

      if (staff === 0) {
        staff = (actualEmployees || []).filter(e => e.status !== "TERMINATED").length;
      }

      const scans = matchAttendance.length;
      const sumHrs = matchAttendance.reduce((sum, a) => sum + getAttendanceHours(a), 0);
      const hours = matchAttendance.length > 0 ? parseFloat((sumHrs / matchAttendance.length).toFixed(1)) : 0.0;

      return {
        key: b.key,
        label: b.label,
        gross,
        net,
        staff,
        scans,
        hours,
      };
    });

    // 10. Risk & Anomalies Check (Forensic Auditing)
    const anomalies: Anomaly[] = [];

    // Basic expense anomaly
    const avgExpense =
      curTxs.filter((t) => t.type === "EXPENSE").reduce((sum, t, _, arr) => sum + t.amount / (arr.length || 1), 0) || 0;
    curTxs.forEach((tx) => {
      if (tx.type === "EXPENSE" && tx.amount > avgExpense * 3.5) {
        anomalies.push({
          txId: tx.id,
          description: `Unusually high expense detected: ${tx.amount.toLocaleString()} HTG (Expected average ~${Math.round(
            avgExpense
          ).toLocaleString()})`,
          severity: "HIGH",
        });
      }
    });

    // Attendance anomaly (extreme lateness or absent ratios)
    employeeScorecards.forEach((score) => {
      if (score.latenessScore > 25) {
        anomalies.push({
          employeeId: score.employeeId,
          description: `Anomalie d'assiduité détectée pour ${score.employeeName} (${score.latenessScore}% de retards).`,
          severity: "LOW",
        });
      }
    });

    // 11. Compute Workforce Profitability Intelligence Snapshot
    const workforceProfitability = WorkforceProfitabilityEngine.generateWorkforceProfitabilitySnapshot(
      businessId,
      period,
      employees,
      curTxs,
      curAttendance,
      curPayroll,
      departments,
      branches,
      activities,
      current.startDate,
      current.endDate,
      businessSettings
    );

    const profitMargin = revenue.currentValue > 0 ? (profit.currentValue / revenue.currentValue) * 100 : 0;
    const payrollCostRatio = expenses.currentValue > 0 ? (payrollCost.currentValue / expenses.currentValue) * 100 : 0;

    let totalGross = 0;
    let totalCommissions = commissionsPaid.currentValue || 0;

    let totalCnss = 0;
    let totalCns = 0;
    let employerCharges = 0;

    curPayroll.forEach((p: any) => {
      const factor = AnalyticsEngine.getRecordProrationFactor(p, current, cycleMap);
      if (factor <= 0) return;

      const pGross = ((p.gross_salary_cents !== undefined && p.gross_salary_cents !== null ? p.gross_salary_cents / 100 : undefined) ?? p.grossSalary ?? p.grossSalaryHtg ?? p.gross ?? p.baseSalary ?? 0) * factor;
      totalGross += pGross;

      if (isSocialTaxEnabled) {
        const empCnss = ((p.cnss_employee_cents ? p.cnss_employee_cents / 100 : 0) || (p.cnssDeduction || 0) || (p.onaEmployee || 0)) * factor;
        const erCnss = ((p.cnss_employer_cents ? p.cnss_employer_cents / 100 : 0) || (p.onaEmployer || 0)) * factor;
        totalCnss += (empCnss + erCnss);

        const empCns = ((p.cns_employee_cents ? p.cns_employee_cents / 100 : 0) || (p.cnsDeduction || 0) || (p.ofatmaEmployee || 0)) * factor;
        const erCns = ((p.ofatma_employer_cents ? p.ofatma_employer_cents / 100 : 0) || (p.cns_employer_cents ? p.cns_employer_cents / 100 : 0) || (p.ofatmaEmployer || 0)) * factor;
        totalCns += (empCns + erCns);

        employerCharges += (erCnss + erCns);
      }
    });

    const payrollAggregates = {
      payrollPaid: Math.round(totalGross),
      commissionsPaid: Math.round(totalCommissions),
      cnssContributions: Math.round(totalCnss),
      cnsContributions: Math.round(totalCns),
      employerChargesSocials: Math.round(employerCharges),
      totalEmploymentCost: Math.round(payrollCost.currentValue || (totalGross + employerCharges)),
    };

    const hrROI = AnalyticsEngine.computeHRROI(revenue.currentValue, payrollCost.currentValue);
    const payrollCostRatioCalculated = AnalyticsEngine.computePayrollRatio(payrollCost.currentValue, revenue.currentValue);

    const snapshotBase = {
      period,
      customRange,
      generatedAt: new Date().toISOString(),
      revenue,
      quickbooksSalesRevenue,
      expenses,
      operationalExpenses,
      totalExpenses,
      profit,
      netProfit: profit,
      netCashFlow,
      cashOnHand,
      burnRate,
      payrollCost,
      activeStaff,
      attendanceRate,
      latenessRate,
      absenceRate,
      avgHoursWorked,
      advanceExposure,
      commissionsPaid,
      branchPerformance,
      departmentPerformance,
      employeeScorecards,
      historicalTrends,
      expenseBreakdown,
      forecast,
      anomalies,
      workforceProfitability,
      payrollAggregates,
      isSocialTaxEnabled,
      hrROI,
      payrollReconciliation: {
        status: curPayrollReconciliationStatus,
        variance: curPayrollVariance,
        glPayrollCost: curGlPayrollExp,
        subledgerPayrollCost: curPayrollCost
      }
    };

    const hasPeriodData = curTxs.length > 0 || curAttendance.length > 0 || curPayroll.length > 0;
    const scores = ExecutiveScoreEngine.calculateScorecards(snapshotBase as any);
    const businessHealthScore = hasPeriodData && scores.length > 0
      ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
      : 0;

    return {
      ...snapshotBase,
      businessHealthScore,
      profitMargin,
      payrollCostRatio: payrollCostRatioCalculated
    };
  }
}
