import { ExecutiveScoreEngine } from "./ExecutiveScoreEngine";
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
        return new Date().toISOString().split("T")[0];
      }
      return d.toISOString().split("T")[0];
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
   */
  static getExpectedWorkingHours(startDateStr: string, endDateStr: string, baseDailyHours = 8): number {
    try {
      const start = new Date(startDateStr);
      const end = new Date(endDateStr);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return 160;
      
      let workingDays = 0;
      const cur = new Date(start);
      let guard = 0;
      while (cur <= end && guard < 1000) {
        guard++;
        const dayOfWeek = cur.getDay();
        // 0 is Sunday, 6 is Saturday
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          workingDays++;
        }
        cur.setDate(cur.getDate() + 1);
      }
      if (workingDays === 0) workingDays = 1;
      return workingDays * baseDailyHours;
    } catch {
      return 160;
    }
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
   */
  static generateSnapshot(
    period: AnalyticsPeriod,
    customRange: { startDate: string; endDate: string } | undefined,
    employees: Employee[],
    transactions: LedgerTransaction[],
    attendanceLogs: AttendanceRecord[],
    payrollRecords: PayrollRecord[],
    branches: Branch[],
    departments: Department[],
    contracts: EmployeeContract[],
    businessId: string,
    language: "fr" | "ht" | "en" = "fr",
    activities?: EmployeeDepartmentActivity[],
    businessSettings?: any,
    payrollCycles?: PayrollCycle[]
  ): AnalyticsSnapshot {
    const isSocialTaxEnabled = businessSettings?.payroll_policies?.enableTaxes !== undefined
      ? Boolean(businessSettings.payroll_policies.enableTaxes)
      : (businessSettings?.payrollPolicies?.enableTaxes !== undefined
          ? Boolean(businessSettings.payrollPolicies.enableTaxes)
          : (businessSettings?.tax_config?.enableTaxes !== undefined
              ? Boolean(businessSettings.tax_config.enableTaxes)
              : (businessSettings?.taxConfig?.enableTaxes !== undefined
                  ? Boolean(businessSettings.taxConfig.enableTaxes)
                  : (businessSettings?.payroll?.taxes?.enabled !== undefined
                      ? Boolean(businessSettings.payroll.taxes.enabled)
                      : (businessSettings?.payroll?.enable_social_taxes !== undefined
                          ? Boolean(businessSettings.payroll.enable_social_taxes)
                          : (businessSettings?.payroll?.enableTaxes !== undefined
                              ? Boolean(businessSettings.payroll.enableTaxes)
                              : (businessSettings?.enable_social_taxes !== undefined
                                  ? Boolean(businessSettings.enable_social_taxes)
                                  : (businessSettings?.enableTaxes !== undefined
                                      ? Boolean(businessSettings.enableTaxes)
                                      : false))))))));

    // 1. Resolve date boundaries
    const { current, previous } = this.getPeriodRanges(period, customRange);

    const normalizeDateStr = (rawDate: any): string => {
      if (!rawDate) return "";
      let str = "";
      if (typeof rawDate === "string") {
        str = rawDate.trim().split("T")[0];
      } else if (typeof rawDate === "number") {
        str = new Date(rawDate).toISOString().split("T")[0];
      } else if (rawDate instanceof Date) {
        str = rawDate.toISOString().split("T")[0];
      } else if (rawDate?.toDate && typeof rawDate.toDate === "function") {
        str = rawDate.toDate().toISOString().split("T")[0];
      } else if (rawDate?.seconds) {
        str = new Date(rawDate.seconds * 1000).toISOString().split("T")[0];
      } else {
        str = String(rawDate).split("T")[0];
      }

      if (!str) return "";

      if (str.includes("/")) {
        const parts = str.split("/");
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
          } else {
            return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
          }
        }
      } else if (str.includes("-")) {
        const parts = str.split("-");
        if (parts.length === 3) {
          if (parts[0].length !== 4 && parts[2].length === 4) {
            return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
          }
        }
      }
      return str;
    };

    const getAttendanceDate = (a: any): string => {
      if (!a) return "";
      const raw = a.date || a.date_str || a.dateStr || a.work_date || a.checkInDate || a.checkIn?.deviceDate || a.created_at || a.timestamp || a.checkIn?.timestamp;
      return normalizeDateStr(raw);
    };

    const isInPeriod = (rawDate: any, range: DateRange) => {
      const dateOnly = normalizeDateStr(rawDate);
      if (!dateOnly) return false;
      return dateOnly >= range.startDate && dateOnly <= range.endDate;
    };

    const matchesBusiness = (item: any) => {
      if (!businessId) return true;
      const bId = item?.business_id || item?.businessId;
      return !bId || bId === businessId;
    };

    // Build cycle map for accurate cycle-to-period matching
    const cycleMap = new Map<string, PayrollCycle>();
    if (payrollCycles) {
      payrollCycles.forEach((c) => {
        if (c.id) cycleMap.set(c.id, c);
      });
    }

    const isPayrollInPeriod = (p: PayrollRecord, range: DateRange): boolean => {
      const cycleId = p.cycleId || p.payroll_cycle_id;
      const cycle = cycleId ? cycleMap.get(cycleId) : undefined;

      let pStart = p.period_start || (p as any).periodStart || (p as any).startDate || cycle?.startDate || (cycle as any)?.start_date || (cycle as any)?.periodStart || (cycle as any)?.period_start;
      let pEnd = p.period_end || (p as any).periodEnd || (p as any).endDate || cycle?.endDate || (cycle as any)?.end_date || (cycle as any)?.periodEnd || (cycle as any)?.period_end || (cycle as any)?.effectiveAccountingDate;

      // Extract date token from cycleId if available (e.g. cycle_2026-07-01_2026-07-15)
      if (!pStart && !pEnd && cycleId) {
        const dateMatch = cycleId.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
        if (dateMatch) {
          pStart = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
          pEnd = pStart;
        }
      }

      if (!pStart && !pEnd) {
        pStart = (p as any).generated_at || (p as any).paymentDate || (p as any).createdAt || p.created_at || p.updated_at;
        pEnd = pStart;
      }

      if (pStart || pEnd) {
        const startStr = normalizeDateStr(pStart || pEnd);
        const endStr = normalizeDateStr(pEnd || pStart);
        if (startStr && endStr) {
          return !(endStr < range.startDate || startStr > range.endDate);
        }
      }

      return false;
    };

    // 2. Filter collections for current and previous period
    const curTxs = transactions.filter(
      (t) => matchesBusiness(t) && t.status !== "REVERSED" && isInPeriod(t.date, current)
    );
    const prevTxs = transactions.filter(
      (t) => matchesBusiness(t) && t.status !== "REVERSED" && isInPeriod(t.date, previous)
    );

    const curAttendance = attendanceLogs.filter(
      (a) => matchesBusiness(a) && isInPeriod(getAttendanceDate(a), current)
    );
    const prevAttendance = attendanceLogs.filter(
      (a) => matchesBusiness(a) && isInPeriod(getAttendanceDate(a), previous)
    );

    // Filter payroll records with cycle-aware date matching
    const curPayroll = payrollRecords.filter(
      (p) => matchesBusiness(p) && isPayrollInPeriod(p, current)
    );
    const prevPayroll = payrollRecords.filter(
      (p) => matchesBusiness(p) && isPayrollInPeriod(p, previous)
    );

    // Business scope active operational staff (excludes OWNER / SUPER_ADMIN)
    const matchedEmployees = filterOperationalEmployees(employees.filter((e) => matchesBusiness(e)));
    const activeEmployees = matchedEmployees.length > 0 ? matchedEmployees : filterOperationalEmployees(employees);

    // 3. Financial KPI Calculations
    const getTxAmount = (t: LedgerTransaction): number => {
      if (typeof t.amount === "number" && !isNaN(t.amount)) return t.amount;
      if (typeof (t as any).amount_cents === "number" && !isNaN((t as any).amount_cents)) return (t as any).amount_cents / 100;
      if (typeof (t as any).amountCents === "number" && !isNaN((t as any).amountCents)) return (t as any).amountCents / 100;
      if (typeof (t as any).total === "number" && !isNaN((t as any).total)) return (t as any).total;
      if (typeof (t as any).debit === "number" && (t as any).debit > 0) return (t as any).debit;
      if (typeof (t as any).credit === "number" && (t as any).credit > 0) return (t as any).credit;
      if (typeof (t as any).debit_cents === "number" && (t as any).debit_cents > 0) return (t as any).debit_cents / 100;
      if (typeof (t as any).credit_cents === "number" && (t as any).credit_cents > 0) return (t as any).credit_cents / 100;
      return 0;
    };

    const sumRevenue = (txs: LedgerTransaction[]) =>
      txs
        .filter((t) => t.type === "INCOME" && t.status !== "REVERSED" && (t.status as any) !== "VOID" && (t.status as any) !== "CANCELLED")
        .reduce((sum, t) => sum + getTxAmount(t), 0);
      
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

    const sumExpenses = (txs: LedgerTransaction[]) =>
      txs.filter((t) => {
        if (t.status === "REVERSED" || (t.status as any) === "VOID" || (t.status as any) === "CANCELLED") return false;
        // Accruals (PAYROLL type) are the canonical P&L expense for payroll
        // They include Net Salary + Employee Taxes + Employer Taxes + Recoveries
        if (t.type === "PAYROLL") return true;
        
        // Operational expenses (EXPENSE type)
        if (t.type === "EXPENSE") {
          // Exclude payroll disbursements (linked to a cycle) to prevent double counting
          if (t.metadata?.payrollCycleId || (t as any).metadata?.payroll_cycle_id) return false;
          
          // Also exclude manual expenses that are categorized as Payroll to avoid double counting with PAYROLL accruals
          const cat = (t.category || "").toLowerCase();
          const desc = (t.description || "").toLowerCase();
          if (cat.includes("paie") || cat.includes("payroll") || desc.includes("salaire") || desc.includes("payroll")) {
            return false;
          }
          
          return true;
        }
        
        // Other P&L relevant types
        if (t.type === "BONUS" || t.type === "COMPENSATION") {
          if (t.metadata?.payrollCycleId || (t as any).metadata?.payroll_cycle_id) return false;
          return true;
        }

        if (t.type === "PENALTY") {
           if (t.metadata?.payrollCycleId || (t as any).metadata?.payroll_cycle_id) return false;
           return true;
        }
        
        return false;
      }).reduce((sum, t) => sum + (t.type === "PENALTY" ? -getTxAmount(t) : getTxAmount(t)), 0);

    const curRevVal = sumRevenue(curTxs);
    const prevRevVal = sumRevenue(prevTxs);
    const revenue = this.compareValues(curRevVal, prevRevVal);
    
    const curQbVal = sumQuickBooksRevenue(curTxs);
    const prevQbVal = sumQuickBooksRevenue(prevTxs);
    const quickbooksSalesRevenue = this.compareValues(curQbVal, prevQbVal);

    // Payroll cost calculation helper (SSOT)
    const sumPayrollDetails = (payrolls: PayrollRecord[], txs: LedgerTransaction[]) => {
      // 1. Try prioritization of bookkeeping (accruals)
      // We sum all PAYROLL type transactions which represent the total company exposure
      const ledgerSum = txs
        .filter((t) => t.type === "PAYROLL" && t.status !== "REVERSED" && (t.status as any) !== "VOID" && (t.status as any) !== "CANCELLED")
        .reduce((sum, t) => sum + getTxAmount(t), 0);
      
      // 2. Logic to calculate exact HR records sum (SSOT)
      const dbSum = payrolls.reduce(
        (sum, pr: any) => {
          const gross = pr.grossSalary || (pr.gross_salary_cents ? pr.gross_salary_cents / 100 : 0) || pr.gross || (pr.baseSalary || 0);
          const net = pr.netPaid || pr.netSalary || (pr.net_salary_cents ? pr.net_salary_cents / 100 : 0) || (pr.net_salary || 0);
          // Skip excluded records or records with no positive salary figures
          if (pr.isExcluded || (gross <= 0 && net <= 0)) {
            return sum;
          }

          const erCnss = isSocialTaxEnabled ? ((pr.cnss_employer_cents ? pr.cnss_employer_cents / 100 : 0) || pr.onaEmployer || (pr.cnssDeduction || 0)) : 0;
          const erOfatma = isSocialTaxEnabled ? ((pr.ofatma_employer_cents ? pr.ofatma_employer_cents / 100 : 0) || pr.ofatmaEmployer || (pr.cnsDeduction || 0)) : 0;
          const penalties = (pr.penalties_cents ? pr.penalties_cents / 100 : 0) || (pr.penalties || 0);
          
          // Total cost = Adjusted Gross (Gross - Penalties) + Employer Taxes (if enabled)
          return sum + (gross - penalties) + erCnss + erOfatma;
        },
        0
      );

      // If dbSum is positive from validated HR records, it represents the exact calculated payroll cost (SSOT)
      if (dbSum > 0) {
        return dbSum;
      }

      return ledgerSum;
    };

    const curExpVal = sumExpenses(curTxs);
    const prevExpVal = sumExpenses(prevTxs);

    const curPayrollCost = sumPayrollDetails(curPayroll, curTxs);
    const prevPayrollCost = sumPayrollDetails(prevPayroll, prevTxs);
    const payrollCost = this.compareValues(curPayrollCost, prevPayrollCost, true);

    const hasCurPayrollTx = curTxs.some(t => t.type === "PAYROLL" && t.status !== "REVERSED" && (t.status as any) !== "VOID");
    const totalCurExpenses = curExpVal + (hasCurPayrollTx ? 0 : curPayrollCost);

    const hasPrevPayrollTx = prevTxs.some(t => t.type === "PAYROLL" && t.status !== "REVERSED" && (t.status as any) !== "VOID");
    const totalPrevExpenses = prevExpVal + (hasPrevPayrollTx ? 0 : prevPayrollCost);

    const expenses = this.compareValues(totalCurExpenses, totalPrevExpenses, true);
    const profit = this.compareValues(curRevVal - totalCurExpenses, prevRevVal - totalPrevExpenses);

    // Cash on hand: Cumulative sum of INCOME minus EXPENSES/PAYROLL and ADVANCES
    // Since cash on hand is a running total, we calculate it across all transactions up to current.endDate
    const getTxDateString = (t: LedgerTransaction) => {
      if (!t.date) return "";
      return typeof t.date === "string" ? t.date.split("T")[0] : new Date(t.date).toISOString().split("T")[0];
    };

    const allTxsUpToCurrent = transactions.filter(
      (t) => (t.business_id === businessId || (t as any).businessId === businessId || !businessId) &&
        t.status !== "REVERSED" && (t.status as any) !== "VOID" && (t.status as any) !== "CANCELLED" &&
        (t.date ? getTxDateString(t) <= current.endDate : true)
    );
    const allTxsUpToPrevious = transactions.filter(
      (t) => (t.business_id === businessId || (t as any).businessId === businessId || !businessId) &&
        t.status !== "REVERSED" && (t.status as any) !== "VOID" && (t.status as any) !== "CANCELLED" &&
        (t.date ? getTxDateString(t) <= previous.endDate : true)
    );

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

    // Burn Rate (expenses per day)
    const getDays = (range: DateRange) => {
      const d1 = new Date(range.startDate);
      const d2 = new Date(range.endDate);
      const diff = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1);
      return diff;
    };
    const curDays = getDays(current);
    const prevDays = getDays(previous);
    const burnRate = this.compareValues(curExpVal / curDays, prevExpVal / prevDays, true);

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
        .filter((a) => a.status !== "ABSENT" || getAttendanceHours(a) > 0)
        .map((a) => a.employeeId || (a as any).employee_id)
        .filter(Boolean)
    );
    const prevActiveEmpIds = new Set(
      prevAttendance
        .filter((a) => a.status !== "ABSENT" || getAttendanceHours(a) > 0)
        .map((a) => a.employeeId || (a as any).employee_id)
        .filter(Boolean)
    );

    const curActiveStaffCount = curActiveEmpIds.size;
    const prevActiveStaffCount = prevActiveEmpIds.size;
    const activeStaff = this.compareValues(curActiveStaffCount, prevActiveStaffCount);

    // Attendance calculations
    const computeAttendanceKPIs = (attendance: AttendanceRecord[], staffCount: number = curActiveStaffCount || activeEmployees.length) => {
      const presentRecords = attendance.filter((a) => a.status !== "ABSENT" || getAttendanceHours(a) > 0);
      const totalHours = presentRecords.reduce((sum, r) => sum + getAttendanceHours(r), 0);
      const expectedHoursPerEmployee = AnalyticsEngine.getExpectedWorkingHours(current.startDate, current.endDate);
      const expectedHours = (staffCount > 0 ? staffCount : 1) * expectedHoursPerEmployee;
      const total = attendance.length;
      const lates = attendance.filter((a) => a.status === "LATE").length;
      const absents = attendance.filter((a) => a.status === "ABSENT").length;

      // Realistic attendance rate
      let attRate = 0;
      if (expectedHours > 0 && totalHours > 0) {
        attRate = Math.min(100, Math.max(0, Math.round((totalHours / expectedHours) * 100)));
      } else if (total > 0) {
        const presentCount = presentRecords.length;
        attRate = Math.round((presentCount / total) * 100);
      }

      // Realistic absence rate: either explicitly flagged ABSENT records or hours shortfall
      const explicitAbsenceRate = total > 0 ? Math.round((absents / total) * 100) : 0;
      const hoursDeficitAbsenceRate = Math.max(0, 100 - attRate);
      const computedAbsenceRate = Math.max(0, Math.min(100, Math.max(explicitAbsenceRate, hoursDeficitAbsenceRate)));

      return {
        attendanceRate: attRate,
        latenessRate: total > 0 ? Math.max(0, Math.min(100, Math.round((lates / total) * 100))) : 0,
        absenceRate: computedAbsenceRate,
        avgHours: total > 0 ? Number((totalHours / total).toFixed(1)) : 0.0,
      };
    };

    const curAttStats = computeAttendanceKPIs(curAttendance);
    const prevAttStats = computeAttendanceKPIs(prevAttendance);

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

    // Helper to evaluate commissions for a payroll record or employee
    const getRecordCommissions = (p: PayrollRecord, txs: LedgerTransaction[], empId?: string) => {
      let comm = p.commissions || (p.commission_cents ? p.commission_cents / 100 : 0) || (p as any).commissionsHtg || (p as any).commission || 0;
      if (comm > 0) return comm;

      const id = empId || p.employeeId || p.employee_id;
      if (id) {
        const empTxs = txs.filter((t) => t.employeeId === id || (t as any).employee_id === id);
        const commTxs = empTxs.filter((t) => t.type === "BONUS" || (t.category || "").toUpperCase().includes("COMMISSION") || (t.description || "").toUpperCase().includes("COMMISSION"));
        const commTxsSum = commTxs.reduce((sum, t) => sum + (t.amount || (t.amount_cents ? t.amount_cents / 100 : 0)), 0);
        if (commTxsSum > 0) return commTxsSum;

        const salesTxs = empTxs.filter((t) => t.type === "INCOME");
        const salesSum = salesTxs.reduce((sum, t) => sum + (t.amount || (t.amount_cents ? t.amount_cents / 100 : 0)), 0);
        if (salesSum > 0) {
          return Math.round(salesSum * 0.05);
        }
      }
      return 0;
    };

    // Commissions paid across period
    const getCommissionsSum = (payrolls: PayrollRecord[], txs: LedgerTransaction[]) => {
      let sum = 0;
      payrolls.forEach((p) => {
        sum += getRecordCommissions(p, txs);
      });
      if (sum === 0 && txs.length > 0) {
        const directCommTxs = txs.filter((t) => (t.category || "").toUpperCase().includes("COMMISSION") || (t.description || "").toUpperCase().includes("COMMISSION"));
        sum = directCommTxs.reduce((total, t) => total + (t.amount || (t.amount_cents ? t.amount_cents / 100 : 0)), 0);
      }
      return sum;
    };

    const curComms = getCommissionsSum(curPayroll, curTxs);
    const prevComms = getCommissionsSum(prevPayroll, prevTxs);
    const commissionsPaid = this.compareValues(curComms, prevComms);

    // 5. Segment breakdown (Branches)
    const branchPerformance: BranchPerformance[] = branches
      .filter((b) => b.business_id === businessId)
      .map((br) => {
        const brCurTxs = curTxs.filter((t) => t.branchId === br.id || (t as any).branch_id === br.id);
        const brAttendance = curAttendance.filter((a) => a.branchId === br.id || (a as any).branch_id === br.id);
        const brEmployees = activeEmployees.filter((e) => e.branchId === br.id || (e as any).branch_id === br.id);

        const rev = brCurTxs.filter((t) => t.type === "INCOME" && t.status !== "REVERSED" && (t.status as any) !== "VOID").reduce((sum, t) => sum + getTxAmount(t), 0);
        const directExp = brCurTxs
          .filter((t) => {
            if (t.status === "REVERSED" || (t.status as any) === "VOID" || (t.status as any) === "CANCELLED") return false;
            if (t.type === "PAYROLL") return true;
            if (t.type === "EXPENSE") {
              if (t.metadata?.payrollCycleId || (t as any).metadata?.payroll_cycle_id) return false;
              return true;
            }
            return false;
          })
          .reduce((sum, t) => sum + getTxAmount(t), 0);

        const hasBrPayrollTx = brCurTxs.some(t => t.type === "PAYROLL" && t.status !== "REVERSED" && (t.status as any) !== "VOID");
        const brPayrolls = curPayroll.filter((p) => {
          const emp = activeEmployees.find((e) => e.id === (p.employeeId || p.employee_id));
          return (p.branch_id || (p as any).branchId || emp?.branchId || (emp as any)?.branch_id) === br.id;
        });
        const brPayrollCost = brPayrolls.reduce(
          (sum, p: any) => sum + (p.grossSalary || (p.gross_salary_cents ? p.gross_salary_cents / 100 : 0) || (p.baseSalary || 0)),
          0
        );
        const exp = directExp + (hasBrPayrollTx ? 0 : brPayrollCost);

        const net = rev - exp;
        const margin = rev > 0 ? (net / rev) * 100 : 0;

        const attStats = computeAttendanceKPIs(brAttendance, brEmployees.length);

        // Productivity & attendance indexing
        const attRate = attStats.attendanceRate;
        const efficiencyScore = Math.max(
          10,
          Math.min(
            100,
            attRate * 0.4 + (margin > 0 ? Math.min(60, margin) : 10) + brEmployees.length * 2
          )
        );

        return {
          branchId: br.id,
          branchName: br.name,
          revenue: rev,
          expenses: exp,
          profit: net,
          margin,
          attendanceRate: attRate,
          employeeCount: brEmployees.length,
          efficiencyScore: Math.round(efficiencyScore),
        };
      });

    // 6. Segment breakdown (Departments & Cost Centers)
    const deptMap = new Map<string, { name: string; exp: number; empCount: number; attList: AttendanceRecord[] }>();
    
    // Initialize with registered departments
    departments
      .filter((d) => !businessId || d.business_id === businessId || (d as any).businessId === businessId)
      .forEach((dept) => {
        const deptEmployees = activeEmployees.filter((e) => e.departmentId === dept.id || (e as any).department_id === dept.id);
        deptMap.set(dept.id, {
          name: dept.name,
          exp: 0,
          empCount: deptEmployees.length,
          attList: [],
        });
      });

    // Attribute payroll expenses to departments
    curPayroll.forEach((p) => {
      const emp = activeEmployees.find((e) => e.id === (p.employeeId || p.employee_id));
      const deptId = p.department_id || (p as any).departmentId || emp?.departmentId || (emp as any)?.department_id || "general";
      const pAmount = p.grossSalary || ((p as any).gross_salary_cents ? (p as any).gross_salary_cents / 100 : 0);
      
      if (!deptMap.has(deptId)) {
        deptMap.set(deptId, {
          name: deptId === "general" ? "Administration Générale" : deptId,
          exp: 0,
          empCount: 0,
          attList: [],
        });
      }
      const entry = deptMap.get(deptId)!;
      entry.exp += pAmount;
    });

    // Attribute transaction expenses
    curTxs
      .filter((t) => {
        if (t.status === "REVERSED" || (t.status as any) === "VOID" || (t.status as any) === "CANCELLED") return false;
        if (t.type === "PAYROLL") {
          return curPayroll.length === 0;
        }
        return t.type === "EXPENSE" || t.type === "BONUS" || t.type === "COMPENSATION";
      })
      .forEach((t) => {
        const emp = activeEmployees.find((e) => e.id === (t.employeeId || (t as any).employee_id));
        const deptId = t.departmentId || (t as any).department_id || emp?.departmentId || (emp as any)?.department_id || (t.category ? t.category : "general");
        const tAmount = getTxAmount(t);

        if (!deptMap.has(deptId)) {
          deptMap.set(deptId, {
            name: deptId === "general" ? "Frais Généraux" : deptId,
            exp: 0,
            empCount: 0,
            attList: [],
          });
        }
        const entry = deptMap.get(deptId)!;
        entry.exp += tAmount;
      });

    // Attribute attendance
    curAttendance.forEach((a) => {
      const emp = activeEmployees.find((e) => e.id === (a.employeeId || (a as any).employee_id));
      const deptId = a.departmentId || (a as any).department_id || emp?.departmentId || (emp as any)?.department_id;
      if (deptId && deptMap.has(deptId)) {
        deptMap.get(deptId)!.attList.push(a);
      }
    });

    const departmentPerformance: DepartmentPerformance[] = Array.from(deptMap.entries()).map(([deptId, data]) => {
      const attStats = computeAttendanceKPIs(data.attList, data.empCount || 1);
      return {
        departmentId: deptId,
        departmentName: data.name,
        expenses: parseFloat(data.exp.toFixed(2)),
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

      let commissions = 0;
      if (relevantPayrolls.length > 0) {
        commissions = relevantPayrolls.reduce((sum, p) => sum + getRecordCommissions(p, curTxs, emp.id), 0);
      }

      if (commissions === 0) {
        const empTxs = curTxs.filter((t) => t.employeeId === emp.id || (t as any).employee_id === emp.id);
        const commTxs = empTxs.filter((t) => t.type === "BONUS" || (t.category || "").toUpperCase().includes("COMMISSION") || (t.description || "").toUpperCase().includes("COMMISSION"));
        const commTxsTotal = commTxs.reduce((sum, t) => sum + (t.amount || (t.amount_cents ? t.amount_cents / 100 : 0)), 0);

        if (commTxsTotal > 0) {
          commissions = commTxsTotal;
        } else {
          const empSales = empTxs.filter((t) => t.type === "INCOME");
          const totalSales = empSales.reduce((sum, t) => sum + (t.amount || (t.amount_cents ? t.amount_cents / 100 : 0)), 0);
          const commRate = (emp as any).commissionRate ?? 5;
          if (totalSales > 0) {
            commissions = Math.round(totalSales * (commRate / 100));
          }
        }
      }

      const latestPayroll = relevantPayrolls[0];
      const totalDays = empAttendance.length;
      const lates = empAttendance.filter((a) => a.status === "LATE").length;
      const absents = empAttendance.filter((a) => a.status === "ABSENT").length;
      const overtimeLogs = empAttendance.filter((a) => a.status === "OVERTIME");

      const presentRecords = empAttendance.filter((a) => a.status !== "ABSENT" || getAttendanceHours(a) > 0);
      const overtimeHours = overtimeLogs.reduce((sum, a) => sum + Math.max(0, getAttendanceHours(a) - (a.plannedHours || 8)), 0);
      const totalHours = presentRecords.reduce((sum, a) => sum + getAttendanceHours(a), 0);
      const mustWorkHours = AnalyticsEngine.getExpectedWorkingHours(current.startDate, current.endDate);

      const hasWorked = presentRecords.length > 0 && totalHours > 0;

      const latenessScore = totalDays > 0 ? (lates / totalDays) * 100 : 0;
      const attendanceConsistencyScore = mustWorkHours > 0 ? Math.min(100, (totalHours / mustWorkHours) * 100) : 0;
      const hourRatio = mustWorkHours > 0 ? (totalHours / mustWorkHours) * 100 : 0;

      const commissionBonus = Math.min(20, (commissions / (emp.baseSalary || 1)) * 100);
      const productivityIndex = hasWorked
        ? Math.max(0, Math.min(100, hourRatio - latenessScore * 0.5 + commissionBonus))
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

      const underperformanceSignal = hasWorked && (latenessScore > 20 || attendanceConsistencyScore < 80);

      return {
        employeeId: emp.id,
        employeeName: emp.name,
        branchId: emp.branchId || (emp as any).branch_id,
        departmentId: emp.departmentId || (emp as any).department_id,
        attendanceConsistencyScore: Math.round(attendanceConsistencyScore),
        latenessScore: Math.round(latenessScore),
        productivityIndex: Math.round(productivityIndex),
        overtimeHours: parseFloat(overtimeHours.toFixed(1)),
        totalHours: parseFloat(totalHours.toFixed(1)),
        baseSalary: totalBaseSalary,
        commissions,
        netPaid: totalNetPaid,
        underperformanceSignal,
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

      const matchPayrolls = payrollRecords.filter((p) => {
        return matchesBusiness(p) && (p.status as any) !== "REJECTED" && (p.status as any) !== "VOID" && isPayrollInPeriod(p, bucketRange);
      });

      const matchAttendance = attendanceLogs.filter((a) => {
        const aDate = getAttendanceDate(a);
        if (!aDate) return false;
        return aDate >= b.startDate && aDate <= b.endDate;
      });

      const matchTransactions = transactions.filter((tx) => {
        if (tx.status === "REVERSED" || (tx.status as any) === "VOID" || (tx.status as any) === "CANCELLED") return false;
        if (businessId && tx.business_id !== businessId && (tx as any).businessId !== businessId) return false;
        const txDate = normalizeDateStr(tx.date);
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
        staff = employees.filter(e => e.status !== "TERMINATED").length;
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

    const snapshotBase = {
      period,
      customRange,
      generatedAt: new Date().toISOString(),
      revenue,
      quickbooksSalesRevenue,
      expenses,
      profit,
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
      payrollCostRatio
    };
  }
}
