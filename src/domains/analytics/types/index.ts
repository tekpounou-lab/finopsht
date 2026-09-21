import { Role } from "../../../types";
import { WorkforceProfitabilitySnapshot } from "./workforceProfitability";

export * from "./workforceProfitability";
export * from "./phase6c";
export * from "./phase6d";
export * from "./phase7";

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
  payrollCost?: number;
  nonPayrollExpenses?: number;
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
  payrollCost?: number;
  nonPayrollExpenses?: number;
  employeeCount: number;
  attendanceRate: number;
  averageHours: number;
  revenue?: number;
  margin?: number;
}

export interface PayrollAggregates {
  payrollPaid: number;
  commissionsPaid: number;
  cnssContributions: number;
  cnsContributions: number;
  employerChargesSocials: number;
  totalEmploymentCost: number;
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
  payrollCost?: number;
  underperformanceSignal: boolean;
  salesVolume?: number;
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

/**
 * DEF-9B-04: Short-term Net Operating Projection (Résultat d'exploitation projeté).
 * Note: This metric projects net accounting operating result based on current net profit
 * and daily operating expense burn rate (Profit - Daily Burn * Days).
 * It is NOT physical cash runway.
 */
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
  operationalExpenses: KPIComparison;
  totalExpenses?: KPIComparison;
  profit: KPIComparison;
  /**
   * DEF-9B-02: Canonical Net Cash Flow (Variation de trésorerie)
   * Net Cash Flow = Total Settled Inflows - Total Settled Outflows
   * Derived canonically from CashBasisEngine.
   */
  netCashFlow?: KPIComparison;
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
  hrROI?: number;
  payrollAggregates?: PayrollAggregates;
  isSocialTaxEnabled?: boolean;
  workforceProfitability?: WorkforceProfitabilitySnapshot;
}
