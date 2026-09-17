/**
 * FINOPS ERP v4.0 — PHASE 7
 * Workforce Operational Productivity & Labor Unit Economics Intelligence Types
 * 
 * SPECIFICATION: PHASE 7 CONTRACT v1.0 (Frozen & Reconciled)
 * SSOT: Immutable deterministic typing, tenant isolation, zero synthetic mock data.
 */

export type Phase7MetricState =
  | "VALUE"
  | "ZERO"
  | "NO_DATA"
  | "UNDEFINED"
  | "BLOCKED"
  | "TIMEZONE_NOT_CONFIGURED";

export interface Phase7MetricValue<T = number> {
  metricId: string;
  name: string;
  state: Phase7MetricState;
  value: T | null;
  unit: string;
  currency?: "HTG" | "USD";
  formatted: string;
  statusText?: string;
  reason?: string;
}

export type RevenueAttributionTier =
  | "EMPLOYEE_ID"
  | "EMPLOYEE_EMAIL"
  | "OPERATIONAL_DEPARTMENT"
  | "BRANCH"
  | "UNASSIGNED";

export interface AttributedRevenueItem {
  transactionId: string;
  amountCents: number;
  amount: number;
  currency: "HTG" | "USD";
  date: string;
  attributionTier: RevenueAttributionTier;
  resolvedEmployeeId?: string;
  resolvedEmployeeName?: string;
  homeDepartmentId?: string;
  operationalDepartmentId?: string;
  operationalDepartmentName?: string;
  branchId?: string;
  branchName?: string;
}

export interface DepartmentLaborEconomicsRecord {
  departmentId: string;
  departmentName: string;
  branchId?: string;
  attributedRevenueCents: number;
  attributedRevenue: number;
  directLaborCostCents: number;
  directLaborCost: number;
  netLaborMargin: number;
  workedHours: number;
  revenuePerHour: number | null;
  unitLaborCostRatio: number | null;
  returnOnLaborInvestment: number | null;
  productivity: number | null;
  laborProductivityIndex: Phase7MetricValue<number>;
  state: Phase7MetricState;
}

export interface EmployeeLaborEconomicsRecord {
  employeeId: string;
  employeeName: string;
  homeDepartmentId?: string;
  operationalDepartmentId?: string;
  branchId?: string;
  attributedRevenueCents: number;
  attributedRevenue: number;
  directLaborCostCents: number;
  directLaborCost: number;
  netLaborMargin: number;
  workedHours: number;
  revenuePerHour: number | null;
  unitLaborCostRatio: number | null;
  returnOnLaborInvestment: number | null;
  state: Phase7MetricState;
}

export interface Phase7MetricsCollection {
  m01_attributedRevenue: Phase7MetricValue<number>;
  m02_directLaborCost: Phase7MetricValue<number>;
  m03_netLaborMargin: Phase7MetricValue<number>;
  m04_revenuePerHour: Phase7MetricValue<number>;
  m05_unitLaborCostRatio: Phase7MetricValue<number>;
  m06_returnOnLaborInvestment: Phase7MetricValue<number>;
  m07_departmentRevenueBreakdown: Record<string, Phase7MetricValue<number>>;
  m08_departmentProductivityIndices: Record<string, Phase7MetricValue<number>>;
}

export interface Phase7ReconciliationSummary {
  totalEligibleGLRevenueCents: number;
  totalAttributedRevenueCents: number;
  unassignedRevenueCents: number;
  varianceCents: number;
  isBalanced: boolean;
}

export interface Phase7Provenance {
  engineVersion: "4.0.0-phase7";
  deterministicHash: string;
  datasetId: string;
  eligibleTransactionCount: number;
  sealedPayrollRecordCount: number;
  totalWorkedHours: number;
  businessTimezone?: string | null;
}

export interface Phase7Dataset {
  datasetId: string;
  businessId: string;
  periodStart: string;
  periodEnd: string;
  targetCurrency: "HTG" | "USD";
  metrics: Phase7MetricsCollection;
  byDepartment: DepartmentLaborEconomicsRecord[];
  byEmployee: EmployeeLaborEconomicsRecord[];
  attributedItems: AttributedRevenueItem[];
  unassignedRevenue: {
    amountCents: number;
    amount: number;
    count: number;
  };
  reconciliation: Phase7ReconciliationSummary;
  provenance: Phase7Provenance;
}

export interface Phase7EngineParams {
  businessId: string;
  businessTimezone?: string | null;
  startDate: string;
  endDate: string;
  targetCurrency: "HTG" | "USD";
  transactions?: any[];
  payrollRecords?: any[];
  employees?: any[];
  departments?: any[];
  branches?: any[];
  workedHoursByEmployee?: Record<string, number>;
  totalWorkedHours?: number;
  historicalCertifiedFxRate?: number | null;
}
