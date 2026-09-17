/**
 * FINOPS ERP v4.0 — PHASE 6D
 * Types, DTOs & Contracts for Workforce Planning, Forecasting & Labor Capacity Intelligence
 *
 * SPECIFICATION: PHASE 6D CONTRACT v1.0 (Frozen)
 * Zero writes, analytical only, tenant-isolated.
 */

export type Phase6DValueStatus =
  | "VALUE"
  | "ZERO"
  | "NO_DATA"
  | "NOT_SCHEDULED"
  | "COLD_START"
  | "INSUFFICIENT_HISTORY"
  | "UNDEFINED"
  | "UNRESOLVED"
  | "ANOMALY"
  | "TIMEZONE_NOT_CONFIGURED"
  | "NOT_APPLICABLE"
  | "BLOCKED";

export type ForecastMethodology =
  | "TIER_1_PUBLISHED"
  | "TIER_2_EXPANDED"
  | "SMA_2"
  | "SMA_4"
  | "WMA_3"
  | "MIXED"
  | "NOT_SCHEDULED";

export type CapacitySourceTier =
  | "PUBLISHED_SHIFTS"
  | "EXPANDED_ASSIGNMENTS"
  | "HISTORICAL_RUN_RATE"
  | "SCENARIO_INPUT"
  | "MIXED"
  | "NOT_SCHEDULED";

export type DataSufficiencyState =
  | "DATA_SUFFICIENT"
  | "DATA_LIMITED"
  | "COLD_START"
  | "INSUFFICIENT_HISTORY";

export interface Phase6DMetricValue<T = number> {
  metricId: string;
  name: string;
  state: Phase6DValueStatus;
  value: T | null;
  unit: string;
  currency?: string;
  dimension?: string;
  provenance?: CapacitySourceTier | string;
  statusText?: string;
  reason?: string;
}

export interface LaborRateProvenance {
  rateValue: number | null;
  rateUnit: string;
  rateScope: "DEPARTMENT" | "GLOBAL_FALLBACK" | "NONE";
  rateSourceCycles: number;
  rateSourceCurrency: string;
  rateSourceDepartmentId?: string;
}

export interface CoverageBreakdown {
  totalDays: number;
  publishedDays: number;
  expandedDays: number;
  runRateDays: number;
  unscheduledDays: number;
}

export interface DataSufficiencyProfile {
  overallState: DataSufficiencyState;
  completedCyclesCount: number;
  futureShiftsCount: number;
  metricEligibility: {
    plannedCapacity: boolean;
    projectedAbsenceRate: boolean;
    costForecast: boolean;
    trendModel: boolean;
  };
}

export interface Phase6DForecastProvenance {
  contractVersion: "PHASE_6D_CONTRACT_v1.0";
  engineVersion: "1.0.0";
  forecastId: string;
  businessId: string;
  horizonStart: string;
  horizonEnd: string;
  currency: string;
  accountingMode: "ACCRUAL";
  methodology: ForecastMethodology;
  sourceTier: CapacitySourceTier;
  dataSufficiency: DataSufficiencyState;
  historicalCyclesUsed: number;
}

export interface DimensionCapacityReconciliation {
  dimensionId: string;
  dimensionName: string;
  dimensionType: "EMPLOYEE" | "DEPARTMENT" | "BRANCH" | "GLOBAL";
  plannedHours: Phase6DMetricValue<number>;
  projectedAvailableHours: Phase6DMetricValue<number>;
  capacityLossHours: Phase6DMetricValue<number>;
  operationalFte: Phase6DMetricValue<number>;
  forecastAttendanceCost: Phase6DMetricValue<number>;
}

export interface Phase6DForecastDataset {
  provenance: Phase6DForecastProvenance;
  dataSufficiency: DataSufficiencyProfile;
  coverageBreakdown: CoverageBreakdown;
  
  // M-01 to M-09 Core Metrics
  plannedCapacity: Phase6DMetricValue<number>;          // M-01
  historicalAbsenceRate: Phase6DMetricValue<number>;    // M-02
  projectedAvailableCapacity: Phase6DMetricValue<number>;// M-03
  projectedCapacityLoss: Phase6DMetricValue<number>;     // M-04
  forecastBaseLaborCost: Phase6DMetricValue<number>;     // M-05
  forecastAttendanceLaborCost: Phase6DMetricValue<number>;// M-06
  operationalFteEquivalence: Phase6DMetricValue<number>;// M-07
  economicLaborPressure: Phase6DMetricValue<number>;    // M-08
  scenarioStaffingGap: Phase6DMetricValue<number>;      // M-09

  laborRateProvenance: LaborRateProvenance;

  // Organizational Rollups
  reconciliation: {
    global: DimensionCapacityReconciliation;
    byBranch: Record<string, DimensionCapacityReconciliation>;
    byDepartment: Record<string, DimensionCapacityReconciliation>;
    unresolvedCount: number;
    unresolvedHours: number;
  };
}

// Scenario Types (S-01 to S-04)
export interface ScenarioHeadcountInput {
  deltaEmployees: number; // e.g. +2 or -1
}

export interface ScenarioShiftDurationInput {
  deltaHoursPerShift: number; // e.g. +0.5h
}

export interface ScenarioAbsenceStressInput {
  deltaAbsenceRatePercentagePoints: number; // e.g. +0.10 for +10% pts
}

export interface ScenarioBudgetCapInput {
  budgetCapAmount: number; // e.g. 50000 HTG
}

export interface Phase6DScenarioResult {
  scenarioId: "S-01" | "S-02" | "S-03" | "S-04";
  scenarioName: string;
  state: Phase6DValueStatus;
  baselineValue: number | null;
  simulatedValue: number | null;
  deltaValue: number | null;
  unit: string;
  currency?: string;
  explanation: string;
  reason?: string;
}
