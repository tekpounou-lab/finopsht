/**
 * FINOPS ERP v4.0 — PHASE 6D
 * Pure Deterministic Forecasting Engine
 *
 * SPECIFICATION: PHASE 6D CONTRACT v1.0 (Frozen)
 * NO FALLBACKS. NO HARDCODED HOURS. NO MUTATIONS. DETERMINISTIC HASH.
 */

import {
  Phase6DForecastDataset,
  Phase6DMetricValue,
  LaborRateProvenance,
  CoverageBreakdown,
  DataSufficiencyProfile,
  Phase6DForecastProvenance,
  DimensionCapacityReconciliation,
  ForecastMethodology,
  CapacitySourceTier,
  DataSufficiencyState,
} from "../types/phase6d";

export interface ShiftInput {
  id: string;
  employeeId: string;
  departmentId?: string;
  branchId?: string;
  date: string; // YYYY-MM-DD
  plannedHours: number;
  status: string; // "PUBLISHED", "CANCELLED", etc.
  void?: boolean;
  business_id: string;
}

export interface AssignmentInput {
  id: string;
  employeeId: string;
  departmentId?: string;
  branchId?: string;
  templateId?: string;
  workingDays: number[]; // 0=Sunday, 1=Monday, ..., 6=Saturday
  templateDurationHours: number;
  startDate?: string;
  endDate?: string;
  status: "ACTIVE" | "INACTIVE";
  business_id: string;
}

export interface AttendanceHistoryRecord {
  id: string;
  date: string;
  employeeId: string;
  departmentId?: string;
  branchId?: string;
  plannedHours: number;
  realHours: number;
  status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
  cycleId: string;
  business_id: string;
}

export interface CompletedCycleInput {
  cycleId: string;
  startDate: string;
  endDate: string;
  status: "SEALED" | "LOCKED";
  totalPlannedHours: number;
  totalAbsentHours: number;
  totalPayrollCost: number; // Historical blended cost in cycle currency
  currency: string;
}

export interface EmployeeContractInput {
  id: string;
  employeeId: string;
  departmentId?: string;
  branchId?: string;
  salaryBaseHtg?: number;
  salaryBaseUsd?: number;
  currency: string; // "HTG" | "USD"
  payRegime: "FIXED" | "COMMISSION" | "HYBRID";
  status: "ACTIVE" | "TERMINATED" | "SUSPENDED";
  hireDate: string; // YYYY-MM-DD
  terminationDate?: string | null;
  business_id: string;
}

export interface PolicyInput {
  standardHoursPerCycle?: number;
  frequency?: string;
  currency?: string;
}

export interface HistoricalRevenueInput {
  totalCertifiedIncome: number;
  currency: string;
  cyclesCount: number;
}

export interface ForecastEngineParams {
  businessId: string;
  businessTimezone?: string | null;
  horizonStart: string; // YYYY-MM-DD
  horizonEnd: string;   // YYYY-MM-DD
  targetCurrency: "HTG" | "USD";
  methodology?: ForecastMethodology; // default SMA_2
  shifts: ShiftInput[];
  assignments?: AssignmentInput[];
  attendanceHistory?: AttendanceHistoryRecord[];
  completedCycles?: CompletedCycleInput[];
  contracts?: EmployeeContractInput[];
  policy?: PolicyInput | null;
  historicalRevenue?: HistoricalRevenueInput | null;
  certifiedHistoricalLaborRate?: {
    globalRate: number | null;
    departmentRates?: Record<string, number>;
    cyclesCount: number;
    currency: string;
  } | null;
}

/**
 * Deterministic hash generator (excluding timestamp)
 */
function computeDeterministicForecastId(params: {
  businessId: string;
  businessTimezone?: string | null;
  horizonStart: string;
  horizonEnd: string;
  targetCurrency: string;
  methodology: string;
  shiftsDigest: string;
  contractsDigest: string;
  standardHours: number | null;
}): string {
  const raw = [
    "6D.1.0",
    params.businessId,
    params.businessTimezone ?? "NO_TZ",
    params.horizonStart,
    params.horizonEnd,
    params.targetCurrency,
    params.methodology,
    String(params.standardHours),
    params.shiftsDigest,
    params.contractsDigest,
  ].join("|");

  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return "F6D-" + Math.abs(hash).toString(16).padStart(8, "0").toUpperCase();
}

/**
 * Helper to generate dates in horizon [start, end]
 */
function getDatesInHorizon(startStr: string, endStr: string): string[] {
  const dates: string[] = [];
  const curr = new Date(startStr + "T00:00:00Z");
  const end = new Date(endStr + "T00:00:00Z");
  if (isNaN(curr.getTime()) || isNaN(end.getTime()) || curr > end) {
    return [];
  }
  while (curr <= end) {
    dates.push(curr.toISOString().split("T")[0]);
    curr.setUTCDate(curr.getUTCDate() + 1);
  }
  return dates;
}

export class Phase6DForecastingEngine {
  public static execute(params: ForecastEngineParams): Phase6DForecastDataset {
    const methodology = params.methodology || "SMA_2";

    // 1. Check Timezone Guard (BLOCKER 5)
    if (!params.businessTimezone || params.businessTimezone.trim() === "") {
      const blockedMetric = <T>(id: string, name: string, unit: string): Phase6DMetricValue<T> => ({
        metricId: id,
        name,
        state: "TIMEZONE_NOT_CONFIGURED",
        value: null,
        unit,
        currency: params.targetCurrency,
        statusText: "Bloqué: Fuseau horaire de l'entreprise non configuré",
        reason: "businessTimezone parameter is missing or empty. Timezone fallback is strictly prohibited.",
      });

      const emptyRecon: DimensionCapacityReconciliation = {
        dimensionId: "GLOBAL",
        dimensionName: "Global",
        dimensionType: "GLOBAL",
        plannedHours: blockedMetric("M-01", "Future Planned Capacity", "h"),
        projectedAvailableHours: blockedMetric("M-03", "Projected Available Capacity", "h"),
        capacityLossHours: blockedMetric("M-04", "Projected Capacity Loss", "h"),
        operationalFte: blockedMetric("M-07", "Operational FTE Equivalence", "FTE"),
        forecastAttendanceCost: blockedMetric("M-06", "Forecast Attendance Labor Cost", params.targetCurrency),
      };

      return {
        provenance: {
          contractVersion: "PHASE_6D_CONTRACT_v1.0",
          engineVersion: "1.0.0",
          forecastId: "F6D-BLOCKED-TZ",
          businessId: params.businessId,
          horizonStart: params.horizonStart,
          horizonEnd: params.horizonEnd,
          currency: params.targetCurrency,
          accountingMode: "ACCRUAL",
          methodology,
          sourceTier: "NOT_SCHEDULED",
          dataSufficiency: "INSUFFICIENT_HISTORY",
          historicalCyclesUsed: 0,
        },
        dataSufficiency: {
          overallState: "INSUFFICIENT_HISTORY",
          completedCyclesCount: 0,
          futureShiftsCount: 0,
          metricEligibility: {
            plannedCapacity: false,
            projectedAbsenceRate: false,
            costForecast: false,
            trendModel: false,
          },
        },
        coverageBreakdown: {
          totalDays: 0,
          publishedDays: 0,
          expandedDays: 0,
          runRateDays: 0,
          unscheduledDays: 0,
        },
        plannedCapacity: blockedMetric("M-01", "Future Planned Capacity", "h"),
        historicalAbsenceRate: blockedMetric("M-02", "Historical Absence Rate", "%"),
        projectedAvailableCapacity: blockedMetric("M-03", "Projected Available Capacity", "h"),
        projectedCapacityLoss: blockedMetric("M-04", "Projected Capacity Loss", "h"),
        forecastBaseLaborCost: blockedMetric("M-05", "Forecast Base Labor Cost", params.targetCurrency),
        forecastAttendanceLaborCost: blockedMetric("M-06", "Forecast Attendance Labor Cost", params.targetCurrency),
        operationalFteEquivalence: blockedMetric("M-07", "Operational FTE Equivalence", "FTE"),
        economicLaborPressure: blockedMetric("M-08", "Economic Labor Pressure", "ratio"),
        scenarioStaffingGap: {
          metricId: "M-09",
          name: "Scenario Staffing Gap",
          state: "TIMEZONE_NOT_CONFIGURED",
          value: null,
          unit: "h",
          statusText: "Bloqué: Fuseau horaire non configuré",
        },
        laborRateProvenance: {
          rateValue: null,
          rateUnit: `${params.targetCurrency}/h`,
          rateScope: "NONE",
          rateSourceCycles: 0,
          rateSourceCurrency: params.targetCurrency,
        },
        reconciliation: {
          global: emptyRecon,
          byBranch: {},
          byDepartment: {},
          unresolvedCount: 0,
          unresolvedHours: 0,
        },
      };
    }

    // 2. Tenant isolation filter
    const tenantShifts = (params.shifts || []).filter((s) => s.business_id === params.businessId);
    const tenantAssignments = (params.assignments || []).filter((a) => a.business_id === params.businessId);
    const tenantContracts = (params.contracts || []).filter((c) => c.business_id === params.businessId);
    const completedCycles = (params.completedCycles || []).filter((c) => c.status === "SEALED" || c.status === "LOCKED");

    const horizonDates = getDatesInHorizon(params.horizonStart, params.horizonEnd);
    const totalDays = horizonDates.length;

    // 3. Resolve M-01 (Planned Capacity) Day-by-Day with Tier Precedence
    // Explicit published shifts index by "employeeId_date"
    const publishedShiftIndex = new Set<string>();
    const eligiblePublishedShifts: ShiftInput[] = [];

    for (const shift of tenantShifts) {
      if (
        shift.date >= params.horizonStart &&
        shift.date <= params.horizonEnd &&
        shift.status !== "CANCELLED" &&
        shift.void !== true
      ) {
        eligiblePublishedShifts.push(shift);
        publishedShiftIndex.add(`${shift.employeeId}_${shift.date}`);
      }
    }

    let publishedDaysCount = 0;
    let expandedDaysCount = 0;
    let runRateDaysCount = 0;
    let unscheduledDaysCount = 0;

    interface ResolvedShift {
      employeeId: string;
      departmentId: string;
      branchId: string;
      date: string;
      plannedHours: number;
      tier: CapacitySourceTier;
    }

    const resolvedShifts: ResolvedShift[] = [];

    // First, add all published shifts
    for (const s of eligiblePublishedShifts) {
      resolvedShifts.push({
        employeeId: s.employeeId,
        departmentId: s.departmentId || "UNRESOLVED",
        branchId: s.branchId || "UNRESOLVED",
        date: s.date,
        plannedHours: s.plannedHours,
        tier: "PUBLISHED_SHIFTS",
      });
    }

    // Track dates that had published shifts
    const datesWithPublished = new Set(eligiblePublishedShifts.map((s) => s.date));

    // For dates in horizon, if no published shifts exist, expand assignments
    for (const dStr of horizonDates) {
      if (datesWithPublished.has(dStr)) {
        publishedDaysCount++;
        continue;
      }

      // Check Tier 2: Expanded Assignments
      const dayDate = new Date(dStr + "T00:00:00Z");
      const dayOfWeek = dayDate.getUTCDay(); // 0 to 6

      let dayHadExpansion = false;
      for (const a of tenantAssignments) {
        if (a.status !== "ACTIVE") continue;
        if (a.startDate && dStr < a.startDate) continue;
        if (a.endDate && dStr > a.endDate) continue;

        // Check if employee already has explicit shift on this date (Anti-Duplication Guard)
        if (publishedShiftIndex.has(`${a.employeeId}_${dStr}`)) {
          continue; // Explicit wins over synthetic
        }

        if (a.workingDays.includes(dayOfWeek)) {
          resolvedShifts.push({
            employeeId: a.employeeId,
            departmentId: a.departmentId || "UNRESOLVED",
            branchId: a.branchId || "UNRESOLVED",
            date: dStr,
            plannedHours: a.templateDurationHours,
            tier: "EXPANDED_ASSIGNMENTS",
          });
          dayHadExpansion = true;
        }
      }

      if (dayHadExpansion) {
        expandedDaysCount++;
      } else {
        // Tier 3 or 4
        if (completedCycles.length >= 2) {
          // Tier 3: Historical Run-rate can project for this day
          runRateDaysCount++;
        } else {
          unscheduledDaysCount++;
        }
      }
    }

    // Determine overall sourceTier
    let sourceTier: CapacitySourceTier = "NOT_SCHEDULED";
    let methodologyUsed: ForecastMethodology = methodology;

    if (publishedDaysCount === totalDays && totalDays > 0) {
      sourceTier = "PUBLISHED_SHIFTS";
      methodologyUsed = "TIER_1_PUBLISHED";
    } else if (expandedDaysCount === totalDays && totalDays > 0) {
      sourceTier = "EXPANDED_ASSIGNMENTS";
      methodologyUsed = "TIER_2_EXPANDED";
    } else if (publishedDaysCount > 0 || expandedDaysCount > 0) {
      sourceTier = "MIXED";
      methodologyUsed = "MIXED";
    } else if (runRateDaysCount > 0) {
      sourceTier = "HISTORICAL_RUN_RATE";
    } else {
      sourceTier = "NOT_SCHEDULED";
      methodologyUsed = "NOT_SCHEDULED";
    }

    // Calculate total planned hours
    let totalPlannedHours = 0;
    for (const s of resolvedShifts) {
      totalPlannedHours += s.plannedHours;
    }

    // Handle Tier 3 Pure Run-rate if 0 resolved shifts but run-rate days exist
    if (resolvedShifts.length === 0 && completedCycles.length >= 2) {
      // Execute SMA-2 or WMA-3 on historical cycles
      if (methodology === "WMA_3" && completedCycles.length >= 3) {
        const sorted = [...completedCycles].sort((a, b) => b.endDate.localeCompare(a.endDate));
        const x1 = sorted[0].totalPlannedHours;
        const x2 = sorted[1].totalPlannedHours;
        const x3 = sorted[2].totalPlannedHours;
        totalPlannedHours = 0.5 * x1 + 0.3 * x2 + 0.2 * x3;
        sourceTier = "HISTORICAL_RUN_RATE";
      } else {
        const sorted = [...completedCycles].sort((a, b) => b.endDate.localeCompare(a.endDate));
        const x1 = sorted[0].totalPlannedHours;
        const x2 = sorted[1].totalPlannedHours;
        totalPlannedHours = (x1 + x2) / 2.0;
        sourceTier = "HISTORICAL_RUN_RATE";
      }
    }

    // M-01 Status
    const m01State: Phase6DMetricValue<number> =
      totalDays === 0 || (resolvedShifts.length === 0 && completedCycles.length < 2)
        ? {
            metricId: "M-01",
            name: "Future Planned Capacity",
            state: "NOT_SCHEDULED",
            value: null,
            unit: "h",
            provenance: "NOT_SCHEDULED",
            statusText: "Non planifié: Aucun shift ni assignation pour cet horizon",
          }
        : totalPlannedHours === 0
        ? {
            metricId: "M-01",
            name: "Future Planned Capacity",
            state: "ZERO",
            value: 0.0,
            unit: "h",
            provenance: sourceTier,
            statusText: "0.0 h planifiée",
          }
        : {
            metricId: "M-01",
            name: "Future Planned Capacity",
            state: "VALUE",
            value: Math.round(totalPlannedHours * 100) / 100,
            unit: "h",
            provenance: sourceTier,
            statusText: `${Math.round(totalPlannedHours * 100) / 100} h planifiées`,
          };

    // 4. Resolve M-02 (Historical Absence Rate) — Completed Cycles Only (BLOCKER 2)
    let totalHistPlanned = 0;
    let totalHistAbsent = 0;

    for (const c of completedCycles) {
      totalHistPlanned += c.totalPlannedHours;
      totalHistAbsent += c.totalAbsentHours;
    }

    const m02State: Phase6DMetricValue<number> =
      completedCycles.length === 0
        ? {
            metricId: "M-02",
            name: "Historical Absence Rate",
            state: "NO_DATA",
            value: null,
            unit: "%",
            statusText: "Historique d'absence manquant (0 cycles clos)",
          }
        : totalHistPlanned === 0
        ? {
            metricId: "M-02",
            name: "Historical Absence Rate",
            state: "NOT_SCHEDULED",
            value: null,
            unit: "%",
            statusText: "Aucune heure planifiée dans l'historique",
          }
        : totalHistAbsent === 0
        ? {
            metricId: "M-02",
            name: "Historical Absence Rate",
            state: "ZERO",
            value: 0.0,
            unit: "%",
            statusText: "0.0% d'absence historique",
          }
        : {
            metricId: "M-02",
            name: "Historical Absence Rate",
            state: "VALUE",
            value: Math.round((totalHistAbsent / totalHistPlanned) * 10000) / 10000,
            unit: "%",
            statusText: `${((totalHistAbsent / totalHistPlanned) * 100).toFixed(2)}%`,
          };

    // 5. Resolve M-03 (Projected Available Capacity) — Strict Invariant: NO_DATA ≠ ZERO (BLOCKER 2)
    let m03State: Phase6DMetricValue<number>;
    if (m01State.state === "NOT_SCHEDULED") {
      m03State = {
        metricId: "M-03",
        name: "Projected Available Capacity",
        state: "NOT_SCHEDULED",
        value: null,
        unit: "h",
        statusText: "Non planifié",
      };
    } else if (m01State.state === "ZERO") {
      m03State = {
        metricId: "M-03",
        name: "Projected Available Capacity",
        state: "ZERO",
        value: 0.0,
        unit: "h",
        statusText: "0.0 h disponible",
      };
    } else if (m02State.state === "NO_DATA") {
      // INVARIANT RESTORED: Missing absence rate history yields NO_DATA, NOT 100%
      m03State = {
        metricId: "M-03",
        name: "Projected Available Capacity",
        state: "NO_DATA",
        value: null,
        unit: "h",
        statusText: "Indisponible: Taux d'absence historique inconnu",
        reason: "NO_DATA ≠ ZERO: Cannot assume 0% absence without historical proof",
      };
    } else if (m02State.state === "NOT_SCHEDULED") {
      m03State = {
        metricId: "M-03",
        name: "Projected Available Capacity",
        state: "NOT_SCHEDULED",
        value: null,
        unit: "h",
        statusText: "Base d'absence non planifiée",
      };
    } else {
      const absRate = m02State.value ?? 0.0;
      const planned = m01State.value ?? 0.0;
      const avail = Math.max(0.0, planned * (1.0 - absRate));
      m03State = {
        metricId: "M-03",
        name: "Projected Available Capacity",
        state: "VALUE",
        value: Math.round(avail * 100) / 100,
        unit: "h",
        statusText: `${Math.round(avail * 100) / 100} h disponibles`,
      };
    }

    // 6. Resolve M-04 (Projected Capacity Loss) (BLOCKER 4)
    let m04State: Phase6DMetricValue<number>;
    if (m01State.state === "NOT_SCHEDULED") {
      m04State = {
        metricId: "M-04",
        name: "Projected Capacity Loss",
        state: "NOT_SCHEDULED",
        value: null,
        unit: "h",
        statusText: "Non planifié",
      };
    } else if (m03State.state === "NO_DATA") {
      m04State = {
        metricId: "M-04",
        name: "Projected Capacity Loss",
        state: "NO_DATA",
        value: null,
        unit: "h",
        statusText: "Perte capacitaire indéterminée (Historique manquant)",
      };
    } else if (m01State.state === "ZERO" || m02State.state === "ZERO") {
      m04State = {
        metricId: "M-04",
        name: "Projected Capacity Loss",
        state: "ZERO",
        value: 0.0,
        unit: "h",
        statusText: "0.0 h de perte",
      };
    } else {
      const planned = m01State.value ?? 0.0;
      const avail = m03State.value ?? 0.0;
      const loss = Math.max(0.0, planned - avail);
      m04State = {
        metricId: "M-04",
        name: "Projected Capacity Loss",
        state: "VALUE",
        value: Math.round(loss * 100) / 100,
        unit: "h",
        statusText: `${Math.round(loss * 100) / 100} h perdues par absentéisme`,
      };
    }

    // 7. Resolve M-05 (Forecast Base Labor Cost) — Contract Currency Isolated
    const activeContracts = tenantContracts.filter(
      (c) =>
        c.status === "ACTIVE" &&
        c.hireDate <= params.horizonEnd &&
        (!c.terminationDate || c.terminationDate >= params.horizonStart)
    );

    let totalBaseLaborCost = 0;
    let eligibleContractCount = 0;
    const daysInMonth = 30; // standard commercial cycle divisor

    for (const c of activeContracts) {
      if (c.currency && c.currency !== params.targetCurrency) {
        continue;
      }
      const salary = params.targetCurrency === "USD" ? c.salaryBaseUsd : c.salaryBaseHtg;

      if (c.payRegime === "COMMISSION") {
        // Commission earnings are strictly excluded from base cost forecast (M-05).
        // Only an explicitly defined zero base salary (0) is recognized as an explicit zero base component.
        if (salary === 0) {
          eligibleContractCount++;
        }
        continue;
      }

      if (salary !== undefined && salary !== null) {
        totalBaseLaborCost += salary * (totalDays / daysInMonth);
        eligibleContractCount++;
      }
    }

    const m05State: Phase6DMetricValue<number> =
      eligibleContractCount === 0
        ? {
            metricId: "M-05",
            name: "Forecast Base Labor Cost",
            state: "NO_DATA",
            value: null,
            unit: params.targetCurrency,
            currency: params.targetCurrency,
            statusText: `Aucun contrat actif en ${params.targetCurrency}`,
          }
        : totalBaseLaborCost === 0
        ? {
            metricId: "M-05",
            name: "Forecast Base Labor Cost",
            state: "ZERO",
            value: 0.0,
            unit: params.targetCurrency,
            currency: params.targetCurrency,
            statusText: `0.0 ${params.targetCurrency}`,
          }
        : {
            metricId: "M-05",
            name: "Forecast Base Labor Cost",
            state: "VALUE",
            value: Math.round(totalBaseLaborCost * 100) / 100,
            unit: params.targetCurrency,
            currency: params.targetCurrency,
            statusText: `${(Math.round(totalBaseLaborCost * 100) / 100).toLocaleString()} ${params.targetCurrency}`,
          };

    // 8. Resolve M-06 (Forecast Attendance Labor Cost) & Rate Provenance (BLOCKER 6)
    const histRateInfo = params.certifiedHistoricalLaborRate;
    const rateVal = histRateInfo ? histRateInfo.globalRate : null;
    const rateScope = histRateInfo && histRateInfo.globalRate !== null ? "GLOBAL_FALLBACK" : "NONE";

    const laborRateProvenance: LaborRateProvenance = {
      rateValue: rateVal,
      rateUnit: `${params.targetCurrency}/h`,
      rateScope: rateScope,
      rateSourceCycles: histRateInfo ? histRateInfo.cyclesCount : 0,
      rateSourceCurrency: histRateInfo ? histRateInfo.currency : params.targetCurrency,
    };

    let m06State: Phase6DMetricValue<number>;
    if (m01State.state === "NOT_SCHEDULED") {
      m06State = {
        metricId: "M-06",
        name: "Forecast Attendance Labor Cost",
        state: "NOT_SCHEDULED",
        value: null,
        unit: params.targetCurrency,
        currency: params.targetCurrency,
        statusText: "Non planifié",
      };
    } else if (m01State.state === "ZERO" || rateVal === 0) {
      m06State = {
        metricId: "M-06",
        name: "Forecast Attendance Labor Cost",
        state: "ZERO",
        value: 0.0,
        unit: params.targetCurrency,
        currency: params.targetCurrency,
        statusText: `0.0 ${params.targetCurrency}`,
      };
    } else if (rateVal === null) {
      m06State = {
        metricId: "M-06",
        name: "Forecast Attendance Labor Cost",
        state: "NO_DATA",
        value: null,
        unit: params.targetCurrency,
        currency: params.targetCurrency,
        statusText: "Taux horaire analytique historique indisponible",
      };
    } else {
      const cost = (m01State.value ?? 0) * rateVal;
      m06State = {
        metricId: "M-06",
        name: "Forecast Attendance Labor Cost",
        state: "VALUE",
        value: Math.round(cost * 100) / 100,
        unit: params.targetCurrency,
        currency: params.targetCurrency,
        statusText: `${(Math.round(cost * 100) / 100).toLocaleString()} ${params.targetCurrency}`,
      };
    }

    // 9. Resolve M-07 (Operational FTE Equivalence) — Strict Policy Guard (BLOCKER 1 & 8)
    const stdHours = params.policy ? params.policy.standardHoursPerCycle : undefined;
    let m07State: Phase6DMetricValue<number>;

    if (stdHours === undefined || stdHours === null) {
      m07State = {
        metricId: "M-07",
        name: "Operational FTE Equivalence",
        state: "NO_DATA",
        value: null,
        unit: "FTE",
        statusText: "Bloqué: standardHoursPerCycle non configuré",
        reason: "No implicit default hours (96h/40h) permitted.",
      };
    } else if (stdHours === 0) {
      m07State = {
        metricId: "M-07",
        name: "Operational FTE Equivalence",
        state: "UNDEFINED",
        value: null,
        unit: "FTE",
        statusText: "Bloqué: standardHoursPerCycle configuré à 0",
        reason: "Division by zero guard.",
      };
    } else if (m01State.state === "NOT_SCHEDULED") {
      m07State = {
        metricId: "M-07",
        name: "Operational FTE Equivalence",
        state: "NOT_SCHEDULED",
        value: null,
        unit: "FTE",
        statusText: "Non planifié",
      };
    } else if (m01State.state === "ZERO") {
      m07State = {
        metricId: "M-07",
        name: "Operational FTE Equivalence",
        state: "ZERO",
        value: 0.0,
        unit: "FTE",
        statusText: "0.0 FTE",
      };
    } else {
      const fte = (m01State.value ?? 0) / stdHours;
      m07State = {
        metricId: "M-07",
        name: "Operational FTE Equivalence",
        state: "VALUE",
        value: Math.round(fte * 100) / 100,
        unit: "FTE",
        statusText: `${(Math.round(fte * 100) / 100).toFixed(2)} FTE`,
      };
    }

    // 10. Resolve M-08 (Economic Labor Pressure Index)
    const revInfo = params.historicalRevenue;
    let m08State: Phase6DMetricValue<number>;

    if (m06State.state === "NOT_SCHEDULED") {
      m08State = {
        metricId: "M-08",
        name: "Economic Labor Pressure",
        state: "NOT_SCHEDULED",
        value: null,
        unit: "ratio",
        statusText: "Non planifié",
      };
    } else if (!revInfo || revInfo.totalCertifiedIncome === undefined) {
      m08State = {
        metricId: "M-08",
        name: "Economic Labor Pressure",
        state: "NO_DATA",
        value: null,
        unit: "ratio",
        statusText: "Chiffre d'affaires historique certifié manquant",
      };
    } else if (revInfo.totalCertifiedIncome === 0) {
      m08State = {
        metricId: "M-08",
        name: "Economic Labor Pressure",
        state: "UNDEFINED",
        value: null,
        unit: "ratio",
        statusText: "Indéfini: Chiffre d'affaires historique égal à 0",
      };
    } else if (m06State.state === "ZERO") {
      m08State = {
        metricId: "M-08",
        name: "Economic Labor Pressure",
        state: "ZERO",
        value: 0.0,
        unit: "ratio",
        statusText: "0.0% du C.A.",
      };
    } else if (m06State.state === "VALUE") {
      const ratio = (m06State.value ?? 0) / revInfo.totalCertifiedIncome;
      m08State = {
        metricId: "M-08",
        name: "Economic Labor Pressure",
        state: "VALUE",
        value: Math.round(ratio * 10000) / 10000,
        unit: "ratio",
        statusText: `${((Math.round(ratio * 10000) / 10000) * 100).toFixed(2)}% du C.A.`,
      };
    } else {
      m08State = {
        metricId: "M-08",
        name: "Economic Labor Pressure",
        state: "NO_DATA",
        value: null,
        unit: "ratio",
        statusText: "Données de coût insuffisantes",
      };
    }

    // 11. Resolve M-09 (Scenario Staffing Gap Baseline) — MUST BE NOT_APPLICABLE (BLOCKER 4)
    const m09State: Phase6DMetricValue<number> = {
      metricId: "M-09",
      name: "Scenario Staffing Gap",
      state: "NOT_APPLICABLE",
      value: null,
      unit: "h",
      statusText: "Non applicable en mode baseline (Exige une cible de scénario)",
    };

    // 12. Data Sufficiency Evaluation
    let dataSuffState: DataSufficiencyState = "INSUFFICIENT_HISTORY";
    if (completedCycles.length >= 4) {
      dataSuffState = "DATA_SUFFICIENT";
    } else if (completedCycles.length >= 2) {
      dataSuffState = "DATA_LIMITED";
    } else if (eligiblePublishedShifts.length > 0 || tenantAssignments.length > 0) {
      dataSuffState = "COLD_START";
    } else {
      dataSuffState = "INSUFFICIENT_HISTORY";
    }

    const dataSuffProfile: DataSufficiencyProfile = {
      overallState: dataSuffState,
      completedCyclesCount: completedCycles.length,
      futureShiftsCount: eligiblePublishedShifts.length,
      metricEligibility: {
        plannedCapacity: m01State.state === "VALUE" || m01State.state === "ZERO",
        projectedAbsenceRate: m02State.state === "VALUE" || m02State.state === "ZERO",
        costForecast: m06State.state === "VALUE" || m06State.state === "ZERO",
        trendModel: completedCycles.length >= 3,
      },
    };

    const coverageBreakdown: CoverageBreakdown = {
      totalDays,
      publishedDays: publishedDaysCount,
      expandedDays: expandedDaysCount,
      runRateDays: runRateDaysCount,
      unscheduledDays: unscheduledDaysCount,
    };

    // 13. Organizational Reconciliation (Rollups)
    const byBranch: Record<string, DimensionCapacityReconciliation> = {};
    const byDepartment: Record<string, DimensionCapacityReconciliation> = {};
    let unresolvedCount = 0;
    let unresolvedHours = 0;

    for (const s of resolvedShifts) {
      if (s.branchId === "UNRESOLVED" || s.departmentId === "UNRESOLVED") {
        unresolvedCount++;
        unresolvedHours += s.plannedHours;
      }

      // Rollup by branch
      if (!byBranch[s.branchId]) {
        byBranch[s.branchId] = {
          dimensionId: s.branchId,
          dimensionName: s.branchId === "UNRESOLVED" ? "Non assigné (Branche)" : `Branche ${s.branchId}`,
          dimensionType: "BRANCH",
          plannedHours: { metricId: "M-01", name: "Planned Hours", state: "VALUE", value: 0, unit: "h" },
          projectedAvailableHours: { metricId: "M-03", name: "Available Hours", state: "VALUE", value: 0, unit: "h" },
          capacityLossHours: { metricId: "M-04", name: "Loss Hours", state: "VALUE", value: 0, unit: "h" },
          operationalFte: { metricId: "M-07", name: "FTE", state: "VALUE", value: 0, unit: "FTE" },
          forecastAttendanceCost: { metricId: "M-06", name: "Cost", state: "VALUE", value: 0, unit: params.targetCurrency },
        };
      }
      const bRec = byBranch[s.branchId];
      bRec.plannedHours.value = (bRec.plannedHours.value ?? 0) + s.plannedHours;

      // Rollup by department
      if (!byDepartment[s.departmentId]) {
        byDepartment[s.departmentId] = {
          dimensionId: s.departmentId,
          dimensionName: s.departmentId === "UNRESOLVED" ? "Non assigné (Département)" : `Département ${s.departmentId}`,
          dimensionType: "DEPARTMENT",
          plannedHours: { metricId: "M-01", name: "Planned Hours", state: "VALUE", value: 0, unit: "h" },
          projectedAvailableHours: { metricId: "M-03", name: "Available Hours", state: "VALUE", value: 0, unit: "h" },
          capacityLossHours: { metricId: "M-04", name: "Loss Hours", state: "VALUE", value: 0, unit: "h" },
          operationalFte: { metricId: "M-07", name: "FTE", state: "VALUE", value: 0, unit: "FTE" },
          forecastAttendanceCost: { metricId: "M-06", name: "Cost", state: "VALUE", value: 0, unit: params.targetCurrency },
        };
      }
      const dRec = byDepartment[s.departmentId];
      dRec.plannedHours.value = (dRec.plannedHours.value ?? 0) + s.plannedHours;
    }

    // Finish branch rollups with rates & FTE
    const absRate = m02State.value ?? 0.0;
    for (const bKey of Object.keys(byBranch)) {
      const b = byBranch[bKey];
      const p = b.plannedHours.value ?? 0;
      if (m03State.state === "NO_DATA") {
        b.projectedAvailableHours.state = "NO_DATA";
        b.projectedAvailableHours.value = null;
        b.capacityLossHours.state = "NO_DATA";
        b.capacityLossHours.value = null;
      } else {
        b.projectedAvailableHours.value = Math.round(p * (1.0 - absRate) * 100) / 100;
        b.capacityLossHours.value = Math.round(p * absRate * 100) / 100;
      }
      if (stdHours && stdHours > 0) {
        b.operationalFte.value = Math.round((p / stdHours) * 100) / 100;
      } else {
        b.operationalFte.state = stdHours === 0 ? "UNDEFINED" : "NO_DATA";
        b.operationalFte.value = null;
      }
      if (rateVal !== null) {
        b.forecastAttendanceCost.value = Math.round(p * rateVal * 100) / 100;
      } else {
        b.forecastAttendanceCost.state = "NO_DATA";
        b.forecastAttendanceCost.value = null;
      }
    }

    // Finish department rollups
    for (const dKey of Object.keys(byDepartment)) {
      const d = byDepartment[dKey];
      const p = d.plannedHours.value ?? 0;
      if (m03State.state === "NO_DATA") {
        d.projectedAvailableHours.state = "NO_DATA";
        d.projectedAvailableHours.value = null;
        d.capacityLossHours.state = "NO_DATA";
        d.capacityLossHours.value = null;
      } else {
        d.projectedAvailableHours.value = Math.round(p * (1.0 - absRate) * 100) / 100;
        d.capacityLossHours.value = Math.round(p * absRate * 100) / 100;
      }
      if (stdHours && stdHours > 0) {
        d.operationalFte.value = Math.round((p / stdHours) * 100) / 100;
      } else {
        d.operationalFte.state = stdHours === 0 ? "UNDEFINED" : "NO_DATA";
        d.operationalFte.value = null;
      }
      if (rateVal !== null) {
        d.forecastAttendanceCost.value = Math.round(p * rateVal * 100) / 100;
      } else {
        d.forecastAttendanceCost.state = "NO_DATA";
        d.forecastAttendanceCost.value = null;
      }
    }

    const globalRecon: DimensionCapacityReconciliation = {
      dimensionId: "GLOBAL",
      dimensionName: "Global Organisation",
      dimensionType: "GLOBAL",
      plannedHours: m01State,
      projectedAvailableHours: m03State,
      capacityLossHours: m04State,
      operationalFte: m07State,
      forecastAttendanceCost: m06State,
    };

    // 14. Deterministic Forecast ID (Excludes generatedAt!)
    const shiftsDigest = eligiblePublishedShifts
      .map((s) => `${s.id}:${s.plannedHours}`)
      .sort()
      .join(",");
    const contractsDigest = activeContracts
      .map((c) => `${c.id}:${c.salaryBaseHtg ?? c.salaryBaseUsd ?? 0}`)
      .sort()
      .join(",");

    const forecastId = computeDeterministicForecastId({
      businessId: params.businessId,
      businessTimezone: params.businessTimezone,
      horizonStart: params.horizonStart,
      horizonEnd: params.horizonEnd,
      targetCurrency: params.targetCurrency,
      methodology: methodologyUsed,
      shiftsDigest,
      contractsDigest,
      standardHours: stdHours ?? null,
    });

    const provenance: Phase6DForecastProvenance = {
      contractVersion: "PHASE_6D_CONTRACT_v1.0",
      engineVersion: "1.0.0",
      forecastId,
      businessId: params.businessId,
      horizonStart: params.horizonStart,
      horizonEnd: params.horizonEnd,
      currency: params.targetCurrency,
      accountingMode: "ACCRUAL",
      methodology: methodologyUsed,
      sourceTier,
      dataSufficiency: dataSuffState,
      historicalCyclesUsed: completedCycles.length,
    };

    return {
      provenance,
      dataSufficiency: dataSuffProfile,
      coverageBreakdown,
      plannedCapacity: m01State,
      historicalAbsenceRate: m02State,
      projectedAvailableCapacity: m03State,
      projectedCapacityLoss: m04State,
      forecastBaseLaborCost: m05State,
      forecastAttendanceLaborCost: m06State,
      operationalFteEquivalence: m07State,
      economicLaborPressure: m08State,
      scenarioStaffingGap: m09State,
      laborRateProvenance,
      reconciliation: {
        global: globalRecon,
        byBranch,
        byDepartment,
        unresolvedCount,
        unresolvedHours: Math.round(unresolvedHours * 100) / 100,
      },
    };
  }
}
