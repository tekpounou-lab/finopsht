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
          const s = new Date(customRange.startDate);
          const e = new Date(customRange.endDate);
          const now = new Date();
          const defS = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
          const defE = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime();

          const sTime = isNaN(s.getTime()) ? defS : s.getTime();
          const eTime = isNaN(e.getTime()) ? defE : e.getTime();
          
          currentStart.setTime(sTime);
          currentEnd.setTime(eTime);

          const duration = currentEnd.getTime() - currentStart.getTime();
          prevStart.setTime(currentStart.getTime() - (isNaN(duration) ? 30 * 86400000 : duration) - 86400000);
          prevEnd.setTime(currentStart.getTime() - 86400000);
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
    businessSettings?: any
  ): AnalyticsSnapshot {
    const isSocialTaxEnabled = businessSettings?.payroll?.taxes?.enabled !== undefined
      ? Boolean(businessSettings.payroll.taxes.enabled)
      : (businessSettings?.payroll?.enable_social_taxes !== undefined
          ? Boolean(businessSettings.payroll.enable_social_taxes)
          : false);

    // 1. Resolve date boundaries
    const { current, previous } = this.getPeriodRanges(period, customRange);

    const normalizeDateStr = (rawDate: any): string => {
      if (!rawDate) return "";
      if (typeof rawDate === "string") return rawDate.split("T")[0];
      if (typeof rawDate === "number") return new Date(rawDate).toISOString().split("T")[0];
      if (rawDate instanceof Date) return rawDate.toISOString().split("T")[0];
      if (rawDate?.toDate && typeof rawDate.toDate === "function") {
        return rawDate.toDate().toISOString().split("T")[0];
      }
      if (rawDate?.seconds) {
        return new Date(rawDate.seconds * 1000).toISOString().split("T")[0];
      }
      return String(rawDate).split("T")[0];
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

    // 2. Filter collections for current and previous period
    const curTxs = transactions.filter(
      (t) => matchesBusiness(t) && t.status !== "REVERSED" && isInPeriod(t.date, current)
    );
    const prevTxs = transactions.filter(
      (t) => matchesBusiness(t) && t.status !== "REVERSED" && isInPeriod(t.date, previous)
    );

    const curAttendance = attendanceLogs.filter(
      (a) => matchesBusiness(a) && isInPeriod(a.date, current)
    );
    const prevAttendance = attendanceLogs.filter(
      (a) => matchesBusiness(a) && isInPeriod(a.date, previous)
    );

    // Filter payroll records
    const getPayrollDate = (p: PayrollRecord) => p.generated_at || p.updated_at || (p as any).paymentDate || new Date().toISOString().split("T")[0];
    const curPayroll = payrollRecords.filter(
      (p) => matchesBusiness(p) && isInPeriod(getPayrollDate(p), current)
    );
    const prevPayroll = payrollRecords.filter(
      (p) => matchesBusiness(p) && isInPeriod(getPayrollDate(p), previous)
    );

    // Business scope active operational staff (excludes OWNER / SUPER_ADMIN)
    const matchedEmployees = filterOperationalEmployees(employees.filter((e) => matchesBusiness(e)));
    const activeEmployees = matchedEmployees.length > 0 ? matchedEmployees : filterOperationalEmployees(employees);

    // 3. Financial KPI Calculations

    const sumRevenue = (txs: LedgerTransaction[]) =>
      txs.filter((t) => t.type === "INCOME").reduce((sum, t) => sum + t.amount, 0);
      
    const sumQuickBooksRevenue = (txs: LedgerTransaction[]) =>
      txs.filter((t) => t.type === "INCOME" && t.source === "CSV_IMPORT").reduce((sum, t) => sum + t.amount, 0);

    
    const sumExpenses = (txs: LedgerTransaction[]) =>
      txs.filter((t) => {
        // Accruals (PAYROLL type) are the canonical P&L expense for payroll
        // They include Net Salary + Employee Taxes + Employer Taxes + Recoveries
        if (t.type === "PAYROLL") return true;
        
        // Operational expenses (EXPENSE type)
        if (t.type === "EXPENSE") {
          // IMPORTANT: Exclude payroll disbursements (linked to a cycle) to prevent double counting
          // These are liability settlements (Balance Sheet), not P&L expenses.
          if (t.metadata?.payrollCycleId || t.metadata?.payroll_cycle_id) return false;
          
          // Also exclude manual expenses that are categorized as Payroll to avoid double counting with PAYROLL accruals
          const cat = (t.category || "").toLowerCase();
          const desc = (t.description || "").toLowerCase();
          if (cat.includes("paie") || cat.includes("payroll") || desc.includes("salaire") || desc.includes("payroll")) {
            // Only exclude if we already have PAYROLL accruals in this period (handled by caller or refined below)
            // For now, we trust the PAYROLL type as the SSOT for payroll expenses.
            return false;
          }
          
          return true;
        }
        
        // Other P&L relevant types
        // Note: BONUS and PENALTY are usually already included in the PAYROLL accrual.
        // We only include them if they are independent of the payroll cycle.
        if (t.type === "BONUS" || t.type === "COMPENSATION") {
          if (t.metadata?.payrollCycleId || t.metadata?.payroll_cycle_id) return false;
          return true;
        }

        if (t.type === "PENALTY") {
           if (t.metadata?.payrollCycleId || t.metadata?.payroll_cycle_id) return false;
           return true;
        }
        
        // ADVANCE is a Balance Sheet movement (Receivable), NOT a P&L expense.
        return false;
      }).reduce((sum, t) => sum + (t.type === "PENALTY" ? -t.amount : t.amount), 0);

    const curRevVal = sumRevenue(curTxs);
    const prevRevVal = sumRevenue(prevTxs);
    const revenue = this.compareValues(curRevVal, prevRevVal);
    
    const curQbVal = sumQuickBooksRevenue(curTxs);
    const prevQbVal = sumQuickBooksRevenue(prevTxs);
    const quickbooksSalesRevenue = this.compareValues(curQbVal, prevQbVal);

    const curExpVal = sumExpenses(curTxs);
    const prevExpVal = sumExpenses(prevTxs);
    const expenses = this.compareValues(curExpVal, prevExpVal, true);

    const profit = this.compareValues(curRevVal - curExpVal, prevRevVal - prevExpVal);

    // Cash on hand: Cumulative sum of INCOME minus EXPENSES/PAYROLL and ADVANCES
    // Since cash on hand is a running total, we calculate it across all transactions up to current.endDate
    const allTxsUpToCurrent = transactions.filter(
      (t) => t.business_id === businessId && t.status !== "REVERSED" && t.date.split("T")[0] <= current.endDate
    );
    const allTxsUpToPrevious = transactions.filter(
      (t) => t.business_id === businessId && t.status !== "REVERSED" && t.date.split("T")[0] <= previous.endDate
    );

    const calculateTotalCash = (txs: LedgerTransaction[]) => {
      let rev = 0;
      let exp = 0;
      let adv = 0;
      txs.forEach((t) => {
        // Only count actual cash movements
        if (t.payment_method === "NON_CASH") return;
        
        if (t.type === "INCOME") rev += t.amount;
        else if (t.type === "EXPENSE" || t.type === "PAYROLL") exp += t.amount;
        else if (t.type === "ADVANCE") adv += t.amount;
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
    // Active staff: employees with contracts active, or simply filtered
    const curStaffCount = activeEmployees.length;
    const activeStaff = this.compareValues(curStaffCount, curStaffCount); // steady representation

    // Attendance calculations
    const computeAttendanceKPIs = (attendance: AttendanceRecord[], staffCount: number = curStaffCount) => {
      const totalHours = attendance.reduce((sum, r) => sum + (r.realHours || 0), 0);
      const expectedHours = staffCount * AnalyticsEngine.getExpectedWorkingHours(current.startDate, current.endDate);
      const total = attendance.length;
      const lates = attendance.filter((a) => a.status === "LATE").length;
      const absents = attendance.filter((a) => a.status === "ABSENT").length;

      return {
        attendanceRate: expectedHours > 0 ? Math.max(0, Math.min(100, Math.round((totalHours / expectedHours) * 100))) : 0,
        latenessRate: total > 0 ? Math.max(0, Math.min(100, Math.round((lates / total) * 100))) : 0,
        absenceRate: total > 0 ? Math.max(0, Math.min(100, Math.round((absents / total) * 100))) : 0,
        avgHours: total > 0 ? Number((totalHours / total).toFixed(1)) : 0.0,
      };
    };

    const curAttStats = computeAttendanceKPIs(curAttendance);
    const prevAttStats = computeAttendanceKPIs(prevAttendance);

    const attendanceRate = this.compareValues(curAttStats.attendanceRate, prevAttStats.attendanceRate);
    const latenessRate = this.compareValues(curAttStats.latenessRate, prevAttStats.latenessRate, true);
    const absenceRate = this.compareValues(curAttStats.absenceRate, prevAttStats.absenceRate, true);
    const avgHoursWorked = this.compareValues(curAttStats.avgHours, prevAttStats.avgHours);

    // Payroll cost comparison
    const sumPayrollDetails = (payrolls: PayrollRecord[], txs: LedgerTransaction[]) => {
      // 1. Try prioritization of bookkeeping (accruals)
      // We sum all PAYROLL type transactions which represent the total company exposure
      const ledgerSum = txs.filter((t) => t.type === "PAYROLL").reduce((sum, t) => sum + t.amount, 0);
      
      // 2. Logic to prevent partial ledger data from overriding complete HR records
      // If we have ledger data but it's significantly lower than the number of payroll records,
      // it might mean bookkeeping is incomplete for this period.
      const dbSum = payrolls.reduce(
        (sum, pr) => {
          // Skip excluded records or those with no net pay (invalid for cost calculation)
          if (pr.isExcluded || (pr.net_salary_cents !== undefined && pr.net_salary_cents <= 0)) {
            return sum;
          }

          const gross = pr.grossSalary || (pr.gross_salary_cents ? pr.gross_salary_cents / 100 : 0);
          const erCnss = isSocialTaxEnabled
            ? ((pr.cnss_employer_cents ? pr.cnss_employer_cents / 100 : 0) || (pr.cnssDeduction || 0))
            : 0;
          const erOfatma = isSocialTaxEnabled
            ? (pr.ofatma_employer_cents ? pr.ofatma_employer_cents / 100 : 0)
            : 0;
          const penalties = (pr.penalties_cents ? pr.penalties_cents / 100 : 0);
          
          // Total cost = Adjusted Gross (Gross - Penalties) + Employer Taxes (if enabled)
          return sum + (gross - penalties) + erCnss + erOfatma;
        },
        0
      );

      // If ledger exists and is substantial (at least 50% of DB sum or we have multiple txs), trust it.
      if (ledgerSum > 0 && (ledgerSum > dbSum * 0.5 || txs.filter(t => t.type === "PAYROLL").length > 2)) {
        return ledgerSum;
      }

      return dbSum > 0 ? dbSum : ledgerSum;
    };

    const curPayrollCost = sumPayrollDetails(curPayroll, curTxs);
    const prevPayrollCost = sumPayrollDetails(prevPayroll, prevTxs);
    const payrollCost = this.compareValues(curPayrollCost, prevPayrollCost, true);

    // Advances exposure (pending advances in period)
    const curAdvances = curTxs.filter((t) => t.type === "ADVANCE").reduce((sum, t) => sum + t.amount, 0);
    const prevAdvances = prevTxs.filter((t) => t.type === "ADVANCE").reduce((sum, t) => sum + t.amount, 0);
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

        const rev = brCurTxs.filter((t) => t.type === "INCOME").reduce((sum, t) => sum + t.amount, 0);
        const exp = brCurTxs
          .filter((t) => {
            if (t.type === "PAYROLL") return true;
            if (t.type === "EXPENSE") {
              if (t.metadata?.payrollCycleId) return false;
              return true;
            }
            return false;
          })
          .reduce((sum, t) => sum + t.amount, 0);

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

    // 6. Segment breakdown (Departments)
    const departmentPerformance: DepartmentPerformance[] = departments
      .filter((d) => !businessId || d.business_id === businessId || (d as any).businessId === businessId)
      .map((dept) => {
        const deptEmployees = activeEmployees.filter((e) => e.departmentId === dept.id || (e as any).department_id === dept.id);
        const deptEmpIds = new Set(deptEmployees.map((e) => e.id));

        const deptCurTxs = curTxs.filter(
          (t) => t.departmentId === dept.id || (t as any).department_id === dept.id || (t.employeeId && deptEmpIds.has(t.employeeId)) || ((t as any).employee_id && deptEmpIds.has((t as any).employee_id))
        );
        const deptAttendance = curAttendance.filter((a) => deptEmpIds.has(a.employeeId || (a as any).employee_id));

        const exp = deptCurTxs
          .filter((t) => {
            if (t.type === "PAYROLL") return true;
            if (t.type === "EXPENSE") {
              if (t.metadata?.payrollCycleId) return false;
              return true;
            }
            return false;
          })
          .reduce((sum, t) => sum + (t.amount || (t.amount_cents ? t.amount_cents / 100 : 0)), 0);

        const attStats = computeAttendanceKPIs(deptAttendance, deptEmployees.length);

        return {
          departmentId: dept.id,
          departmentName: dept.name,
          expenses: exp,
          employeeCount: deptEmployees.length,
          attendanceRate: attStats.attendanceRate,
          averageHours: attStats.avgHours,
        };
      });

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

      const overtimeHours = overtimeLogs.reduce((sum, a) => sum + Math.max(0, (a.realHours || 0) - (a.plannedHours || 8)), 0);
      const totalHours = empAttendance.reduce((sum, a) => sum + (a.realHours || 0), 0);
      const mustWorkHours = AnalyticsEngine.getExpectedWorkingHours(current.startDate, current.endDate);

      const hasWorked = totalHours > 0 || totalDays > 0 || commissions > 0;

      const latenessScore = totalDays > 0 ? (lates / totalDays) * 100 : 0;
      const attendanceConsistencyScore = mustWorkHours > 0 ? Math.min(100, (totalHours / mustWorkHours) * 100) : 0;
      const hourRatio = mustWorkHours > 0 ? (totalHours / mustWorkHours) * 100 : 0;

      const commissionBonus = Math.min(20, (commissions / (emp.baseSalary || 1)) * 100);
      const productivityIndex = hasWorked
        ? Math.max(0, Math.min(100, hourRatio - latenessScore * 0.5 + commissionBonus))
        : 0;

      const netPaid = latestPayroll?.netPaid || (latestPayroll?.net_salary_cents ? latestPayroll.net_salary_cents / 100 : (emp.baseSalary || 0) + commissions);

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
        baseSalary: emp.baseSalary || 0,
        commissions,
        netPaid,
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

    // Build dynamic trends based on actual transactions, attendance, and payroll records
    const monthsSet = new Set<string>();
    
    // Extract months from transactions
    curTxs.forEach((tx) => {
      const d = new Date(tx.date);
      if (!isNaN(d.getTime())) {
        monthsSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
    });

    // Extract months from payrolls
    payrollRecords.forEach((pr) => {
      const dateStr = pr.generated_at || pr.updated_at;
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          monthsSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        }
      }
    });

    // If no months found, default to the current month and previous month
    if (monthsSet.size === 0) {
      const now = new Date();
      monthsSet.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      monthsSet.add(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`);
    }

    // Sort months ascending
    const sortedMonths = Array.from(monthsSet).sort();

    const monthNamesFr = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
    const monthNamesHt = ["Janv", "Fevr", "Mas", "Avr", "Me", "Jen", "Jiyè", "Out", "Sept", "Okt", "Nov", "Des"];

    
    const expenseBreakdown = Object.entries(
      curTxs
        .filter(t => t.type === 'EXPENSE')
        .reduce((acc, t) => {
          const cat = t.category || 'Autres';
          acc[cat] = (acc[cat] || 0) + t.amount;
          return acc;
        }, {} as Record<string, number>)
    ).map(([name, value]) => ({ name, value }));

    const historicalTrends: TrendPoint[] = sortedMonths.map((monthStr) => {
      const [yearStr, monthNumStr] = monthStr.split("-");
      const year = parseInt(yearStr, 10);
      const monthIdx = parseInt(monthNumStr, 10) - 1; // 0-indexed

      const matchPayrolls = payrollRecords.filter((p) => {
        const dateStr = p.generated_at || p.updated_at;
        if (!dateStr) return false;
        const d = new Date(dateStr);
        return d.getMonth() === monthIdx && d.getFullYear() === year;
      });

      const matchAttendance = attendanceLogs.filter((a) => {
        if (!a.date) return false;
        const parts = a.date.split("-");
        return parts.length === 3 && parseInt(parts[1], 10) - 1 === monthIdx && parseInt(parts[0], 10) === year;
      });

      const matchTransactions = curTxs.filter((tx) => {
        const d = new Date(tx.date);
        return d.getMonth() === monthIdx && d.getFullYear() === year;
      });

      let gross = matchPayrolls.reduce((sum, p) => sum + p.grossSalary, 0);
      let net = matchPayrolls.reduce((sum, p) => sum + p.netPaid, 0);
      
      // If payrollRecords are empty, use transaction type PAYROLL
      if (gross === 0) {
        gross = matchTransactions.filter(t => t.type === "PAYROLL").reduce((sum, t) => sum + t.amount, 0);
        net = gross; // approximation if missing
      }

      let staff = new Set([
        ...matchPayrolls.map((p) => p.employeeId),
        ...matchAttendance.map((a) => a.employeeId)
      ]).size;

      // If no attendance or payroll links found, count active employees in the system
      if (staff === 0) {
        staff = employees.filter(e => e.status !== "TERMINATED").length;
      }

      const scans = matchAttendance.length;
      const sumHrs = matchAttendance.reduce((sum, a) => sum + (a.realHours || 0), 0);
      const hours = matchAttendance.length > 0 ? parseFloat((sumHrs / matchAttendance.length).toFixed(1)) : 8.0;

      const key = monthNamesFr[monthIdx] || "Jan";
      const label = language === "ht" ? (monthNamesHt[monthIdx] || "Janv") : (monthNamesFr[monthIdx] || "Jan");

      return {
        key,
        label,
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
