import { Role, Business, Branch, Department, Employee, LedgerTransaction, PayrollRecord, AttendanceRecord, ForensicLog, ERPEvent } from "../../types";
import { RankMetricType, ReportType, BITabType, RadarMetricType } from "./hooks/useBIUIState";

export interface BusinessIntelligenceProps {
  currentRole: Role;
  currentBusiness?: Business;
  currentBranch: Branch | null;
  branches: Branch[];
  departments: Department[];
  employees: Employee[];
  ledgerTransactions: LedgerTransaction[];
  payrollRecords: PayrollRecord[];
  attendanceRecords: AttendanceRecord[];
  forensicLogs: ForensicLog[];
  onAddForensicLog: (log: ForensicLog) => void;
  onAddEvent: (ev: ERPEvent) => void;
  isDashboardEmbed?: boolean;
  isLoading?: boolean;
}

export interface EnrichedDepartmentMetric {
  departmentId: string;
  departmentName: string;
  name?: string;
  employeeCount: number;
  totalStaff?: number;
  averageHours: number;
  avgHours?: number;
  attendanceRate: number;
  productivityScore: number;
  revenue: number;
  expenses: number;
  margin: number;
  formattedRevenue: string;
  formattedExpenses: string;
}

export interface EnrichedBranchMetric {
  branchId: string;
  branchName: string;
  employeeCount: number;
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
  attendanceRate: number;
  efficiencyScore: number;
}

export interface EmployeeScorecard {
  employeeId: string;
  employeeName: string;
  branchId: string;
  departmentId: string;
  totalHours: number;
  plannedHours: number;
  hoursVariance: number;
  baseSalary: number;
  commissions: number;
  attendanceConsistencyScore: number;
  latenessScore: number;
  productivityIndex: number;
  hourlyEfficiencyRatio: number;
  rank: number;
}

export interface PayrollAggregates {
  payrollPaid: number;
  commissionsPaid: number;
  cnssContributions: number;
  cnsContributions: number;
  employerChargesSocials: number;
  totalEmploymentCost: number;
  grossPayroll?: number;
  netPayroll?: number;
  employerTaxes?: number;
  employeeTaxes?: number;
  overtimeCost?: number;
  latePenalties?: number;
  absencePenalties?: number;
  payrollRatio?: number;
  activeEmployeesCount?: number;
}

export type BIDataState = "AVAILABLE" | "ZERO" | "NO_DATA" | "NOT_ELIGIBLE" | "NOT_CALCULATED";

export interface BIPayrollTabProps {
  payrollAggregates?: PayrollAggregates;
  isSocialTaxEnabled: boolean;
  filteredPayrolls?: PayrollRecord[];
  filteredEmployees?: Employee[];
  branches?: Branch[];
  departments?: Department[];
  totalRevenue?: number;
  totalExpenses?: number;
  selectedCurrency?: string;
  formatCurrencyValue?: (val: number) => string;
  formatValueDirectly?: (val: number) => string;
  ledgerTransactions?: LedgerTransaction[];
  isSimplifiedMode?: boolean;
  phase6cDataset?: any;
  phase6dDataset?: any;
  phase7Dataset?: any;
}
