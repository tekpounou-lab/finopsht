import { db } from "../../lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { LedgerTransaction, PayrollRecord, Employee, AttendanceRecord } from "../../types";

export interface FinancialMetric {
  value: number;
  currency: "HTG";
  previousPeriod: number;
  trend: number;
}

export interface MonthlyTrend {
  month: string; // e.g. "2026-05"
  revenue: number;
  expenses: number;
  profit: number;
}

export interface EmployeeStats {
  totalEmployees: number;
  activeStaff: number;
  avgHoursWorked: number;
  attendanceRate: number;
}

export interface AnalyticsFilters {
  branchId?: string;
  departmentId?: string;
  startDate?: string;
  endDate?: string;
}

// Helper to determine previous period date range of same length
export function getPreviousPeriodRange(startDateStr: string, endDateStr: string) {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    const now = new Date();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    return { 
      startDate: prevMonthStart.toISOString().split("T")[0], 
      endDate: prevMonthEnd.toISOString().split("T")[0] 
    };
  }

  const durationMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 86400000); // 1 day before start
  const prevStart = new Date(prevEnd.getTime() - durationMs);

  return {
    startDate: prevStart.toISOString().split("T")[0],
    endDate: prevEnd.toISOString().split("T")[0]
  };
}

// Helper to calculate percentage trend safely
export function calculateTrend(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous) / previous) * 100);
}

// Global data fetching helper to ensure multi-tenancy and optimize querying without composite index issues
async function fetchFilteredData(
  businessId: string,
  filters: AnalyticsFilters
) {
  if (!businessId) throw new Error("Security Violation: business_id is required for data trace audit.");

  // Base dates
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  const currentStart = filters.startDate || defaultStart;
  const currentEnd = filters.endDate || defaultEnd;
  const { startDate: prevStart, endDate: prevEnd } = getPreviousPeriodRange(currentStart, currentEnd);

  // 1. Fetch Transactions
  const txRef = collection(db, "ledger_transactions");
  const qTx = query(txRef, where("business_id", "==", businessId));
  const snapTx = await getDocs(qTx);
  const allTxs: LedgerTransaction[] = [];
  snapTx.forEach((doc) => {
    allTxs.push({ id: doc.id, ...doc.data() } as LedgerTransaction);
  });

  // 2. Fetch Payrolls
  const payRef = collection(db, "payroll_records");
  const qPay = query(payRef, where("business_id", "==", businessId));
  const snapPay = await getDocs(qPay);
  const allPayrolls: PayrollRecord[] = [];
  snapPay.forEach((doc) => {
    allPayrolls.push({ id: doc.id, ...doc.data() } as PayrollRecord);
  });

  // 3. Fetch Employees
  const empRef = collection(db, "employees");
  const qEmp = query(empRef, where("business_id", "==", businessId));
  const snapEmp = await getDocs(qEmp);
  const allEmployees: Employee[] = [];
  snapEmp.forEach((doc) => {
    allEmployees.push({ id: doc.id, ...doc.data() } as Employee);
  });

  // 4. Fetch Attendance
  const attRef = collection(db, "attendance_logs");
  const qAtt = query(attRef, where("business_id", "==", businessId));
  const snapAtt = await getDocs(qAtt);
  const allAttendance: AttendanceRecord[] = [];
  snapAtt.forEach((doc) => {
    allAttendance.push({ id: doc.id, ...doc.data() } as AttendanceRecord);
  });

  // Filters mapping helper in-memory to prevent missing Firestore index failures at runtime
  const applyFilters = (txs: LedgerTransaction[], start: string, end: string) => {
    return txs.filter((tx) => {
      if (tx.status === "REVERSED") return false;
      if (tx.date < start || tx.date > end) return false;
      if (filters.branchId && filters.branchId !== "ALL" && tx.branchId !== filters.branchId) return false;
      
      if (filters.departmentId && filters.departmentId !== "ALL") {
        if (tx.departmentId) {
          if (tx.departmentId !== filters.departmentId) return false;
        } else if (tx.employeeId) {
          const emp = allEmployees.find((e) => e.id === tx.employeeId);
          if (!emp || emp.departmentId !== filters.departmentId) return false;
        } else {
          return false;
        }
      }
      return true;
    });
  };

  const applyPayrollFilters = (payrolls: PayrollRecord[], start: string, end: string) => {
    return payrolls.filter((pay) => {
      const payDate = pay.generated_at || pay.updated_at || new Date().toISOString().split("T")[0];
      if (payDate < start || payDate > end) return false;
      
      const emp = allEmployees.find((e) => e.id === pay.employeeId);
      if (filters.branchId && filters.branchId !== "ALL") {
        const branchMatch = pay.branch_id === filters.branchId || emp?.branchId === filters.branchId;
        if (!branchMatch) return false;
      }
      if (filters.departmentId && filters.departmentId !== "ALL") {
        const deptMatch = pay.department_id === filters.departmentId || emp?.departmentId === filters.departmentId;
        if (!deptMatch) return false;
      }
      return true;
    });
  };

  const applyEmployeeFilters = (emps: Employee[]) => {
    return emps.filter((emp) => {
      if (filters.branchId && filters.branchId !== "ALL" && emp.branchId !== filters.branchId) return false;
      if (filters.departmentId && filters.departmentId !== "ALL" && emp.departmentId !== filters.departmentId) return false;
      return true;
    });
  };

  const applyAttendanceFilters = (atts: AttendanceRecord[], start: string, end: string) => {
    return atts.filter((att) => {
      if (att.date < start || att.date > end) return false;
      if (filters.branchId && filters.branchId !== "ALL" && att.branchId !== filters.branchId) return false;
      
      const emp = allEmployees.find((e) => e.id === att.employeeId);
      if (filters.departmentId && filters.departmentId !== "ALL" && emp?.departmentId !== filters.departmentId) return false;
      return true;
    });
  };

  return {
    currentTransactions: applyFilters(allTxs, currentStart, currentEnd),
    previousTransactions: applyFilters(allTxs, prevStart, prevEnd),
    currentPayrolls: applyPayrollFilters(allPayrolls, currentStart, currentEnd),
    previousPayrolls: applyPayrollFilters(allPayrolls, prevStart, prevEnd),
    filteredEmployees: applyEmployeeFilters(allEmployees),
    currentAttendance: applyAttendanceFilters(allAttendance, currentStart, currentEnd),
    previousAttendance: applyAttendanceFilters(allAttendance, prevStart, prevEnd),
    allTransactions: allTxs // running total usage
  };
}

export const financialAnalyticsService = {
  /**
   * Calculate real-time Revenue
   */
  async getRevenue(businessId: string, filters: AnalyticsFilters): Promise<FinancialMetric> {
    const data = await fetchFilteredData(businessId, filters);
    const currentValue = data.currentTransactions
      .filter((t) => t.type === "INCOME")
      .reduce((sum, t) => sum + t.amount, 0);

    const previousValue = data.previousTransactions
      .filter((t) => t.type === "INCOME")
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      value: currentValue,
      currency: "HTG",
      previousPeriod: previousValue,
      trend: calculateTrend(currentValue, previousValue),
    };
  },

  /**
   * Calculate real-time Operating Expenses
   */
  async getExpenses(businessId: string, filters: AnalyticsFilters): Promise<FinancialMetric> {
    const data = await fetchFilteredData(businessId, filters);
    const sumExp = (txs: LedgerTransaction[]) =>
      txs.filter((t) => {
        if (t.type === "PAYROLL") return true;
        if (t.type === "EXPENSE") {
          // Exclude payroll disbursements (liability settlements)
          if (t.metadata?.payrollCycleId || t.metadata?.payroll_cycle_id) return false;
          return true;
        }
        if (t.type === "BONUS" || t.type === "COMPENSATION") return true;
        if (t.type === "PENALTY") return true;
        return false;
      }).reduce((sum, t) => sum + (t.type === "PENALTY" ? -t.amount : t.amount), 0);

    const currentValue = sumExp(data.currentTransactions);
    const previousValue = sumExp(data.previousTransactions);

    return {
      value: currentValue,
      currency: "HTG",
      previousPeriod: previousValue,
      trend: calculateTrend(currentValue, previousValue),
    };
  },

  /**
   * Calculate real-time Net Profit
   */
  async getNetProfit(businessId: string, filters: AnalyticsFilters): Promise<FinancialMetric> {
    const revenueMetric = await this.getRevenue(businessId, filters);
    const expensesMetric = await this.getExpenses(businessId, filters);
    
    const currentValue = revenueMetric.value - expensesMetric.value;
    const previousValue = revenueMetric.previousPeriod - expensesMetric.previousPeriod;

    return {
      value: currentValue,
      currency: "HTG",
      previousPeriod: previousValue,
      trend: calculateTrend(currentValue, previousValue),
    };
  },

  /**
   * Calculate Net Profit Margin
   */
  async getNetMargin(businessId: string, filters: AnalyticsFilters): Promise<FinancialMetric> {
    const revenueMetric = await this.getRevenue(businessId, filters);
    const profitMetric = await this.getNetProfit(businessId, filters);

    const currentValue = revenueMetric.value > 0 ? (profitMetric.value / revenueMetric.value) * 100 : 0;
    const previousValue = revenueMetric.previousPeriod > 0 ? (profitMetric.previousPeriod / revenueMetric.previousPeriod) * 100 : 0;

    return {
      value: Number(currentValue.toFixed(2)),
      currency: "HTG", // keeping standard format
      previousPeriod: Number(previousValue.toFixed(2)),
      trend: calculateTrend(currentValue, previousValue),
    };
  },

  /**
   * Calculate Cash Balance (cumulative running balance)
   */
  async getCashBalance(businessId: string, filters: AnalyticsFilters): Promise<FinancialMetric> {
    const data = await fetchFilteredData(businessId, filters);
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

    const currentEnd = filters.endDate || defaultEnd;
    const { endDate: prevEnd } = getPreviousPeriodRange(filters.startDate || defaultStart, currentEnd);

    const calculateCash = (txs: LedgerTransaction[], upToDate: string) => {
      let rev = 0;
      let exp = 0;
      let adv = 0;
      txs.forEach((t) => {
        if (t.date <= upToDate) {
          if (t.type === "INCOME") rev += t.amount;
          else if (t.type === "EXPENSE" || t.type === "PAYROLL") exp += t.amount;
          else if (t.type === "ADVANCE") adv += t.amount;
        }
      });
      return rev - exp - adv;
    };

    const currentValue = calculateCash(data.allTransactions, currentEnd);
    const previousValue = calculateCash(data.allTransactions, prevEnd);

    return {
      value: currentValue,
      currency: "HTG",
      previousPeriod: previousValue,
      trend: calculateTrend(currentValue, previousValue),
    };
  },

  /**
   * Calculate real-time Payroll Costs
   */
  async getPayrollCost(businessId: string, filters: AnalyticsFilters): Promise<FinancialMetric> {
    const data = await fetchFilteredData(businessId, filters);

    const sumPayroll = (payrolls: PayrollRecord[], txs: LedgerTransaction[]) => {
      const dbSum = payrolls.reduce(
        (sum, pr) => sum + pr.grossSalary + pr.cnssDeduction + pr.cnsDeduction,
        0
      );
      if (dbSum > 0) return dbSum;
      return txs.filter((t) => t.type === "PAYROLL").reduce((sum, t) => sum + t.amount, 0);
    };

    const currentValue = sumPayroll(data.currentPayrolls, data.currentTransactions);
    const previousValue = sumPayroll(data.previousPayrolls, data.previousTransactions);

    return {
      value: currentValue,
      currency: "HTG",
      previousPeriod: previousValue,
      trend: calculateTrend(currentValue, previousValue),
    };
  },

  /**
   * Calculate Workforce metrics
   */
  async getEmployeeStats(businessId: string, filters: AnalyticsFilters): Promise<EmployeeStats> {
    const data = await fetchFilteredData(businessId, filters);
    const totalEmployees = data.filteredEmployees.length;
    const activeStaff = data.filteredEmployees.filter(e => e.status === "ACTIVE").length;

    const computeAttendanceRate = (attendance: AttendanceRecord[]) => {
      if (attendance.length === 0) return 100;
      const total = attendance.length;
      const present = attendance.filter(a => a.status === "NORMAL" || a.status === "LATE" || a.status === "OVERTIME").length;
      return Math.round((present / total) * 100);
    };

    const computeAvgHours = (attendance: AttendanceRecord[]) => {
      if (attendance.length === 0) return 8.0;
      const totalHours = attendance.reduce((sum, r) => sum + (r.realHours || 0), 0);
      return Number((totalHours / attendance.length).toFixed(1));
    };

    return {
      totalEmployees,
      activeStaff,
      avgHoursWorked: computeAvgHours(data.currentAttendance),
      attendanceRate: computeAttendanceRate(data.currentAttendance)
    };
  },

  /**
   * Build monthly analytical trend
   */
  async getMonthlyFinancialTrend(businessId: string, filters: AnalyticsFilters): Promise<MonthlyTrend[]> {
    const data = await fetchFilteredData(businessId, filters);
    const monthlyData: Record<string, { revenue: number; expenses: number; profit: number }> = {};

    data.allTransactions.forEach((tx) => {
      const date = new Date(tx.date);
      if (isNaN(date.getTime())) return;
      
      const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      // Respect branch filter if applicable
      if (filters.branchId && filters.branchId !== "ALL" && tx.branchId !== filters.branchId) return;

      if (!monthlyData[yearMonth]) {
        monthlyData[yearMonth] = { revenue: 0, expenses: 0, profit: 0 };
      }

      if (tx.type === "INCOME") {
        monthlyData[yearMonth].revenue += tx.amount;
      } else if (tx.type === "EXPENSE" || tx.type === "PAYROLL") {
        monthlyData[yearMonth].expenses += tx.amount;
      }
    });

    // Calculate profits
    Object.keys(monthlyData).forEach((key) => {
      monthlyData[key].profit = monthlyData[key].revenue - monthlyData[key].expenses;
    });

    return Object.keys(monthlyData)
      .sort()
      .map((month) => ({
        month,
        revenue: monthlyData[month].revenue,
        expenses: monthlyData[month].expenses,
        profit: monthlyData[month].profit,
      }));
  }
};
