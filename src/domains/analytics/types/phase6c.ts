/**
 * FINOPS ERP v4.0 — PHASE 6C CONTRACT v1.0
 * Pure Types & Status Definitions for Attendance Costing,
 * Workforce Reconciliation & Capacity Intelligence.
 */

export type ValueStatus = "VALUE" | "ZERO" | "NO_DATA" | "NOT_SCHEDULED" | "UNDEFINED";

export interface MetricValue<T = number> {
  status: ValueStatus;
  value: T | null;
  formatted?: string;
  unit?: string;
  metadata?: Record<string, any>;
}

export type AttendanceAnomalyType =
  | "PENDING_VERIFICATION"
  | "NEGATIVE_DURATION"
  | "MISSING_CHECK_OUT"
  | "OVERLAPPING_SESSION";

export interface AttendanceAnomalyItem {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  type: AttendanceAnomalyType;
  description: string;
  rawRecord: any;
}

export type DimensionResolution = "RESOLVED" | "UNRESOLVED";

/**
 * Bloc A — Attendance Reconciliation
 */
export interface AttendanceReconciliationKPIs {
  scheduledHours: MetricValue<number>;     // H_plan
  workedHours: MetricValue<number>;        // H_travaillées
  varianceHours: MetricValue<number>;      // V = real - planned
  potentialOvertime: MetricValue<number>;  // H_HS_pot = MAX(0, real - planned)
  authorizedOvertime: MetricValue<number>; // H_HS_auth = MAX(0, real - planned) WHERE explicit authorization
  payrollOvertimeHours: MetricValue<number>; // H_HS_paie from SEALED payroll_records
  absenceCount: MetricValue<number>;       // N_absences = COUNT(status === ABSENT)
  absenceHours: MetricValue<number>;       // H_absences = SUM(plannedHours WHERE status === ABSENT)
  absenceRate: MetricValue<number>;        // (H_absences / H_plan) * 100 or NOT_SCHEDULED
  latenessCount: MetricValue<number>;      // COUNT(status === LATE or late_minutes > 0)
  lateMinutes: MetricValue<number>;        // SUM(late_minutes)
  anomaliesCount: MetricValue<number>;     // COUNT(anomalies)
  anomalies: AttendanceAnomalyItem[];
}

/**
 * Bloc B — Attendance Costing
 */
export interface AttendanceCostingKPIs {
  payrollOvertimeCost: MetricValue<number>;             // From SEALED payroll_records overtimePayout / overtime_cents
  actualPayrollCost: MetricValue<number>;               // Gross + Employer charges from SEALED payroll_records
  analyticalLaborRate: MetricValue<number>;             // ActualPayrollCost / H_plan or ActualPayrollCost / H_travaillées
  analyticalLaborRateDenominator: "PLANNED_HOURS" | "WORKED_HOURS" | "NONE";
  attendanceAttributedLaborCost: MetricValue<number>;   // H_travaillées * AnalyticalLaborRate
  currency: string;
}

/**
 * Bloc C — Capacity Intelligence
 */
export interface CapacityIntelligenceKPIs {
  plannedCapacity: MetricValue<number>;    // Cap_plan = H_plan
  availableCapacity: MetricValue<number>;  // Cap_disponible = MAX(0, Cap_plan - H_absences)
  capacityUtilization: MetricValue<number>; // (H_travaillées / Cap_disponible) * 100 or NOT_SCHEDULED
  underCapacity: MetricValue<number>;      // MAX(0, Cap_disponible - H_travaillées)
  overload: MetricValue<number>;           // MAX(0, H_travaillées - Cap_disponible)
}

/**
 * Bloc D — Workforce Economics
 */
export interface WorkforceEconomicsKPIs {
  certifiedGLRevenue: MetricValue<number>; // CA_GL from ledger_transactions
  revenuePerWorkedHour: MetricValue<number>; // CA_GL / H_travaillées or 0 if CA_GL=0 or UNDEFINED
  operationalProductivity: MetricValue<number>; // CA_GL / ActualPayrollCost or NO_DATA
  hcRoi: MetricValue<number>;              // ((CA_GL - ActualPayrollCost) / ActualPayrollCost) * 100 or NO_DATA
  currency: string;
}

/**
 * Complete Phase 6C 25-KPI Output Data Contract
 */
export interface Phase6CKPIDataset {
  businessId: string;
  startDate: string;
  endDate: string;
  currency: string;
  accountingMode: "ACCRUAL" | "CASH";
  
  reconciliation: AttendanceReconciliationKPIs;
  costing: AttendanceCostingKPIs;
  capacity: CapacityIntelligenceKPIs;
  economics: WorkforceEconomicsKPIs;

  byDepartment: Record<string, Phase6CDepartmentMetric>;
  byBranch: Record<string, Phase6CBranchMetric>;
  byEmployee: Record<string, Phase6CEmployeeMetric>;

  unresolved: {
    departmentCount: number;
    branchCount: number;
    hoursCount: number;
  };
}

export interface Phase6CDepartmentMetric {
  departmentId: string;
  departmentName: string;
  resolution: DimensionResolution;
  reconciliation: AttendanceReconciliationKPIs;
  costing: AttendanceCostingKPIs;
  capacity: CapacityIntelligenceKPIs;
  economics: WorkforceEconomicsKPIs;
}

export interface Phase6CBranchMetric {
  branchId: string;
  branchName: string;
  resolution: DimensionResolution;
  reconciliation: AttendanceReconciliationKPIs;
  costing: AttendanceCostingKPIs;
  capacity: CapacityIntelligenceKPIs;
  economics: WorkforceEconomicsKPIs;
}

export interface Phase6CEmployeeMetric {
  employeeId: string;
  employeeName: string;
  departmentId: string;
  departmentName: string;
  branchId: string;
  branchName: string;
  resolution: DimensionResolution;
  reconciliation: AttendanceReconciliationKPIs;
  costing: AttendanceCostingKPIs;
  capacity: CapacityIntelligenceKPIs;
  economics: WorkforceEconomicsKPIs;
}
