import { Role } from "../../../types";
import { WorkforceProfitabilitySnapshot } from "./workforceProfitability";

export * from "./workforceProfitability";

export type AnalyticsPeriod =
  | "TODAY"
  | "YESTERDAY"
  | "THIS_WEEK"
  | "LAST_WEEK"
  | "FORTNIGHT"
  | "PREVIOUS_FORTNIGHT"
  | "MONTH"
  | "PREVIOUS_MONTH"
  | "QUARTER"
  | "PREVIOUS_QUARTER"
  | "YEAR"
  | "PREVIOUS_YEAR"
  | "CUSTOM";

export interface KPIComparison {
  currentValue: number;
  previousValue: number;
  difference: number;
  differencePercentage: number;
  trend: "UP" | "DOWN" | "STABLE";
  direction: "UP" | "DOWN" | "NEUTRAL";
}

export interface BranchPerformance {
  branchId: string;
  branchName: string;
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
  attendanceRate: number;
  employeeCount: number;
  efficiencyScore: number;
}

export interface DepartmentPerformance {
  departmentId: string;
  departmentName: string;
  expenses: number;
  employeeCount: number;
  attendanceRate: number;
  averageHours: number;
}

export interface EmployeeScorecard {
  employeeId: string;
  employeeName: string;
  branchId: string;
  departmentId: string;
  attendanceConsistencyScore: number;
  latenessScore: number;
  productivityIndex: number;
  overtimeHours: number;
  totalHours: number;
  baseSalary: number;
  commissions: number;
  netPaid: number;
  underperformanceSignal: boolean;
}

export interface TrendPoint {
  key: string;
  label: string;
  gross: number;
  net: number;
  staff: number;
  scans: number;
  hours: number;
}

export interface ShortTermForecast {
  forecast7Days: number;
  forecast15Days: number;
  forecast30Days: number;
}

export interface Anomaly {
  txId?: string;
  employeeId?: string;
  description: string;
  severity: "LOW" | "HIGH";
}

export interface AnalyticsSnapshot {
  period: AnalyticsPeriod;
  customRange?: { startDate: string; endDate: string };
  generatedAt: string;
  
  // Financial KPIs
  revenue: KPIComparison;
  quickbooksSalesRevenue: KPIComparison;
  expenses: KPIComparison;
  profit: KPIComparison;
  cashOnHand: KPIComparison;
  burnRate: KPIComparison;
  
  // HR & Payroll KPIs
  payrollCost: KPIComparison;
  activeStaff: KPIComparison;
  attendanceRate: KPIComparison;
  latenessRate: KPIComparison;
  absenceRate: KPIComparison;
  avgHoursWorked: KPIComparison;
  advanceExposure: KPIComparison;
  commissionsPaid: KPIComparison;
  
  // Breakdown & Lists
  branchPerformance: BranchPerformance[];
  departmentPerformance: DepartmentPerformance[];
  employeeScorecards: EmployeeScorecard[];
  historicalTrends: TrendPoint[];
  expenseBreakdown: { name: string; value: number }[];
  forecast: ShortTermForecast;
  anomalies: Anomaly[];
  businessHealthScore: number;
  profitMargin: number;
  payrollCostRatio: number;
  workforceProfitability?: WorkforceProfitabilitySnapshot;
}
