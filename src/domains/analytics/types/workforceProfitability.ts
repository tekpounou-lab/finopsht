export interface EmployeeFinancialMetrics {
  monthlySalary: number;
  employerContributions: number; // CNSS 6% + OFATMA 2%
  benefitsCost: number; // Bonuses, allowances, extras
  totalEmploymentCost: number;
  payrollCostTrend: "UP" | "DOWN" | "STABLE";
  avgCostPerDay: number;
  avgCostPerHour: number;
}

export interface EmployeeAttendanceMetrics {
  attendanceRate: number; // %
  lateArrivals: number;
  absenceRate: number; // %
  unauthorizedAbsences: number;
  leaveDays: number;
  overtimeHours: number;
  expectedHours: number;
  workedHours: number;
  productivityHours: number;
}

export interface EmployeeOperationalMetrics {
  tasksCompleted: number;
  projectsAssigned: number;
  projectsCompleted: number;
  salesGenerated: number;
  invoicesProcessed: number;
  customersServed: number;
  transactionsProcessed: number;
  unitsProduced: number;
  revenueGenerated: number;
  grossProfitGenerated: number;
}

export interface EmployeeEfficiencyMetrics {
  revenuePerHour: number;
  revenuePerDay: number;
  revenuePerPayrollDollar: number;
  costPerOutput: number;
  outputPerHour: number;
  productivityScore: number; // 0-100
  efficiencyScore: number; // 0-100
  performanceScore: number; // 0-100
  utilizationRate: number; // %
}

export interface EmployeeProfitabilityMetrics {
  employeeCost: number;
  employeeRevenue: number;
  employeeGrossMargin: number;
  roi: number; // %
  profitContribution: number;
  netValueCreated: number;
  profitabilityIndex: number;
  profitabilityLabel: "Excellent" | "Good" | "Needs Attention" | "Critical";
}

export interface EmployeeHealthScore {
  score: number; // 0-100
  label: "Excellent" | "Good" | "Needs Attention" | "Critical";
  badgeColor: string;
  attendanceScore: number;
  performanceScore: number;
  productivityScore: number;
  profitabilityScore: number;
  complianceScore: number;
  qualityScore: number;
}

export interface EmployeeProfitabilityRecord {
  employeeId: string;
  employeeName: string;
  email: string;
  role: string;
  departmentId: string;
  departmentName: string;
  branchId: string;
  branchName: string;
  avatarUrl?: string;
  employmentType: string;
  status: string;

  financial: EmployeeFinancialMetrics;
  attendance: EmployeeAttendanceMetrics;
  operational: EmployeeOperationalMetrics;
  efficiency: EmployeeEfficiencyMetrics;
  profitability: EmployeeProfitabilityMetrics;
  healthScore: EmployeeHealthScore;

  crossDepartmentAttribution?: Record<string, { departmentName: string; revenue: number; percentage: number }>;

  productivityTrend: Array<{ date: string; score: number }>;
  attendanceTrend: Array<{ date: string; rate: number }>;
  payrollVsRevenueTrend: Array<{ date: string; cost: number; revenue: number }>;
}

export interface DepartmentProfitabilityRecord {
  departmentId: string;
  departmentName: string;
  managerName: string;
  totalEmployees: number;
  totalPayrollCost: number;
  revenueGenerated: number;
  grossMargin: number;
  departmentProfit: number;
  averageProductivity: number;
  averageAttendance: number;
  averagePerformance: number;
  averageSalary: number;
  averageRevenuePerEmployee: number;
  averageCostPerEmployee: number;
  departmentProfitabilityScore: number; // 0-100
  trend: "UP" | "DOWN" | "STABLE";
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

  employeeBreakdown: Array<{ id: string; name: string; cost: number; revenue: number; profit: number }>;
  costVsRevenueHistory: Array<{ period: string; cost: number; revenue: number; profit: number }>;
}

export interface WorkforceRankings {
  topPerformingEmployees: EmployeeProfitabilityRecord[];
  topPerformingDepartments: DepartmentProfitabilityRecord[];
  mostProfitableEmployees: EmployeeProfitabilityRecord[];
  mostProfitableDepartments: DepartmentProfitabilityRecord[];
  mostImprovedEmployees: EmployeeProfitabilityRecord[];
  highestAttendanceEmployees: EmployeeProfitabilityRecord[];
  highestProductivityEmployees: EmployeeProfitabilityRecord[];
  highestRevenueEmployees: EmployeeProfitabilityRecord[];
  highestRoiEmployees: EmployeeProfitabilityRecord[];
  lowestCostPerRevenueEmployees: EmployeeProfitabilityRecord[];
  highestRiskEmployees: EmployeeProfitabilityRecord[];
  highestRiskDepartments: DepartmentProfitabilityRecord[];
}

export interface WorkforceAdvisorRecommendation {
  id: string;
  type:
    | "INCREASE_STAFFING"
    | "REDUCE_OVERTIME"
    | "PROVIDE_TRAINING"
    | "REVIEW_SCHEDULES"
    | "REWARD_HIGH_PERFORMERS"
    | "REASSIGN_RESOURCES"
    | "REVIEW_WORKLOAD"
    | "ADJUST_BUDGET"
    | "INVESTIGATE_ATTENDANCE"
    | "PROMOTE_EMPLOYEE"
    | "CREATE_PIP"
    | "OPTIMIZE_STAFFING";
  title: string;
  description: string;
  metricsReference: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  targetType: "EMPLOYEE" | "DEPARTMENT";
  targetId: string;
  targetName: string;
}

export interface WorkforceAdvisorInsight {
  id: string;
  severity: "SUCCESS" | "WARNING" | "INFO" | "CRITICAL";
  message: string;
  metricProof: string;
  category: "PROFITABILITY" | "ATTENDANCE" | "PRODUCTIVITY" | "COST_OVERRUN";
}

export interface WorkforceExecutiveSummary {
  headline: string;
  currentWorkforceHealthScore: number;
  currentWorkforceHealthLabel: "Excellent" | "Good" | "Needs Attention" | "Critical";
  totalWorkforceCost: number;
  totalWorkforceRevenue: number;
  totalNetValueCreated: number;
  overallRoi: number;
  operationalRisksCount: number;
  keyOpportunitiesCount: number;
  recommendedActionsCount: number;
  priorityLevel: "HIGH" | "MEDIUM" | "LOW";
  confidenceScore: number;
  dataAvailabilityStatus: "COMPLETE" | "PARTIAL" | "INSUFFICIENT";
  dataAvailabilityMessage?: string;
  insights: WorkforceAdvisorInsight[];
  recommendations: WorkforceAdvisorRecommendation[];
}

export interface WorkforceProfitabilitySnapshot {
  generatedAt: string;
  businessId: string;
  period: string;
  employees: EmployeeProfitabilityRecord[];
  departments: DepartmentProfitabilityRecord[];
  rankings: WorkforceRankings;
  executiveSummary: WorkforceExecutiveSummary;
}
