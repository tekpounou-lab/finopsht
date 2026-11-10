export type PICPeriod = "all" | "7d" | "30d" | "this_month" | "last_month" | "quarter" | "year" | "custom";

export type PICMetricType = "all" | "payroll" | "workforce" | "revenue" | "attendance";

export interface PICFilters {
  period: PICPeriod;
  startDate: string;
  endDate: string;
  branchId: string;
  departmentId: string;
  metricType: PICMetricType;
  searchQuery: string;
  accountingBasis?: "CASH" | "ACCRUAL";
  presentationMode?: "SIMPLIFIED" | "EXPERT";
}

export interface TillDiscrepancyAlert {
  id: string;
  tillId: string;
  tillName: string;
  branchId?: string;
  branchName?: string;
  tellerName: string;
  discrepancyAmount: number;
  currency: string;
  closedAt: string;
  sessionId: string;
  notes?: string;
}

export interface SimplifiedMetrics {
  totalPayroll: number;
  activeHeadcount: number;
  turnoverRate: number;
  attendanceRate: number | null;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  netCashFlow?: number;
  cashFlowMargin?: number;
  averageHoursWorked: number;
  overtimeHoursTotal: number;
  totalCommissions: number;
  isDataAvailable: boolean;
  totalRecordsCount: number;
  incompleteConfigCount?: number;
}

export interface DepartmentMetricBreakdown {
  departmentId: string;
  departmentName: string;
  headcount: number;
  payroll: number;
  attendanceRate: number | null;
  revenue: number;
  expenses: number;
  netMargin: number;
  commissions: number;
}

export interface BranchMetricBreakdown {
  branchId: string;
  branchName: string;
  headcount: number;
  payroll: number;
  attendanceRate: number | null;
  revenue: number;
  efficiencyScore: number;
}

export interface TrendDataPoint {
  date: string;
  label: string;
  payroll: number;
  revenue: number;
  headcount: number;
  attendanceRate: number | null;
  expenses: number;
}

export interface EmployeePerformanceRanking {
  employeeId: string;
  employeeName: string;
  departmentId: string;
  departmentName: string;
  branchId: string;
  branchName: string;
  totalHours: number;
  attendanceScore: number | null;
  salesVolume: number;
  commission: number;
  productivityIndex: number;
  rank: number;
}

export interface CrossTableMatrixCell {
  departmentId: string;
  departmentName: string;
  branchId: string;
  branchName: string;
  headcount: number;
  payroll: number;
  revenue: number;
  attendanceRate: number | null;
}

export interface ExpertMetrics {
  kpis: SimplifiedMetrics;
  departments: DepartmentMetricBreakdown[];
  branches: BranchMetricBreakdown[];
  trends: TrendDataPoint[];
  employeeRankings: EmployeePerformanceRanking[];
  crossTableMatrix: CrossTableMatrixCell[];
  isDataAvailable: boolean;
  operationalAuditAlerts?: TillDiscrepancyAlert[];
}

export interface RawPerformanceDataSet {
  employees: any[];
  transactions: any[];
  payrollRecords: any[];
  attendanceRecords: any[];
  snapshots: any[];
  branches: any[];
  departments: any[];
}
