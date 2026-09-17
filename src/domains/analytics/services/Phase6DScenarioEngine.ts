/**
 * FINOPS ERP v4.0 — PHASE 6D
 * In-Memory What-If Scenario Simulation Engine
 *
 * SPECIFICATION: PHASE 6D CONTRACT v1.0 (Frozen)
 * Zero Firestore writes. Pure in-memory transforms.
 */

import {
  Phase6DForecastDataset,
  Phase6DScenarioResult,
  ScenarioHeadcountInput,
  ScenarioShiftDurationInput,
  ScenarioAbsenceStressInput,
  ScenarioBudgetCapInput,
} from "../types/phase6d";

export class Phase6DScenarioEngine {
  /**
   * S-01: Headcount Adjustment (+/- N employees)
   * Formula:
   *   Delta H = Delta N * standardHoursPerCycle
   *   Simulated H = Baseline Available Hours + Delta H
   * Strict Guard:
   *   If standardHoursPerCycle is missing -> NO_DATA / BLOCKED
   *   If standardHoursPerCycle === 0 -> UNDEFINED / BLOCKED
   */
  public static simulateHeadcount(
    baseline: Phase6DForecastDataset,
    input: ScenarioHeadcountInput,
    standardHoursPerCycle?: number | null
  ): Phase6DScenarioResult {
    if (standardHoursPerCycle === undefined || standardHoursPerCycle === null) {
      return {
        scenarioId: "S-01",
        scenarioName: "Ajustement d'Effectif (Headcount)",
        state: "NO_DATA",
        baselineValue: baseline.projectedAvailableCapacity.value,
        simulatedValue: null,
        deltaValue: null,
        unit: "h",
        explanation: "Simulation bloquée : standardHoursPerCycle non configuré dans la politique de paie.",
        reason: "No implicit default hours permitted.",
      };
    }

    if (standardHoursPerCycle === 0) {
      return {
        scenarioId: "S-01",
        scenarioName: "Ajustement d'Effectif (Headcount)",
        state: "UNDEFINED",
        baselineValue: baseline.projectedAvailableCapacity.value,
        simulatedValue: null,
        deltaValue: null,
        unit: "h",
        explanation: "Simulation bloquée : standardHoursPerCycle configuré à 0.",
        reason: "Division / multiplication by zero policy.",
      };
    }

    const baseVal = baseline.projectedAvailableCapacity.value;
    if (baseVal === null) {
      return {
        scenarioId: "S-01",
        scenarioName: "Ajustement d'Effectif (Headcount)",
        state: "NO_DATA",
        baselineValue: null,
        simulatedValue: null,
        deltaValue: null,
        unit: "h",
        explanation: "Capacité disponible de référence indisponible.",
      };
    }

    const deltaHours = input.deltaEmployees * standardHoursPerCycle;
    const simulatedVal = Math.max(0, baseVal + deltaHours);

    return {
      scenarioId: "S-01",
      scenarioName: "Ajustement d'Effectif (Headcount)",
      state: "VALUE",
      baselineValue: baseVal,
      simulatedValue: Math.round(simulatedVal * 100) / 100,
      deltaValue: Math.round(deltaHours * 100) / 100,
      unit: "h",
      explanation: `Variation de ${input.deltaEmployees > 0 ? "+" : ""}${input.deltaEmployees} employé(s) (${deltaHours > 0 ? "+" : ""}${deltaHours} h basé sur ${standardHoursPerCycle} h/cycle).`,
    };
  }

  /**
   * S-02: Shift Duration Adjustment (+/- Delta h per shift)
   * Formula:
   *   Delta H = Total Planned Shifts * Delta h
   *   Simulated H = Baseline Planned Hours + Delta H
   */
  public static simulateShiftDuration(
    baseline: Phase6DForecastDataset,
    input: ScenarioShiftDurationInput,
    plannedShiftsCount: number
  ): Phase6DScenarioResult {
    const baseVal = baseline.plannedCapacity.value;
    if (baseVal === null) {
      return {
        scenarioId: "S-02",
        scenarioName: "Ajustement de Durée de Shift",
        state: "NOT_SCHEDULED",
        baselineValue: null,
        simulatedValue: null,
        deltaValue: null,
        unit: "h",
        explanation: "Aucun shift planifié de référence.",
      };
    }

    const deltaHours = plannedShiftsCount * input.deltaHoursPerShift;
    const simulatedVal = Math.max(0, baseVal + deltaHours);

    return {
      scenarioId: "S-02",
      scenarioName: "Ajustement de Durée de Shift",
      state: "VALUE",
      baselineValue: baseVal,
      simulatedValue: Math.round(simulatedVal * 100) / 100,
      deltaValue: Math.round(deltaHours * 100) / 100,
      unit: "h",
      explanation: `Ajustement de ${input.deltaHoursPerShift > 0 ? "+" : ""}${input.deltaHoursPerShift} h sur ${plannedShiftsCount} shifts.`,
    };
  }

  /**
   * S-03: Absenteeism Stress Testing (Percentage Points addition)
   * Formula:
   *   Stress Rate = min(1.0, max(0.0, Base Rate + Delta Rate Pts))
   *   Simulated Available = Planned Hours * (1.0 - Stress Rate)
   */
  public static simulateAbsenceStress(
    baseline: Phase6DForecastDataset,
    input: ScenarioAbsenceStressInput
  ): Phase6DScenarioResult {
    const plannedVal = baseline.plannedCapacity.value;
    if (plannedVal === null || baseline.historicalAbsenceRate.state === "NO_DATA") {
      return {
        scenarioId: "S-03",
        scenarioName: "Stress Test Absentéisme",
        state: "NO_DATA",
        baselineValue: null,
        simulatedValue: null,
        deltaValue: null,
        unit: "h",
        explanation: "Historique d'absence de référence indisponible.",
      };
    }

    const baseAbsRate = baseline.historicalAbsenceRate.value ?? 0.0;
    const stressRate = Math.min(1.0, Math.max(0.0, baseAbsRate + input.deltaAbsenceRatePercentagePoints));
    const simulatedAvailable = Math.max(0, plannedVal * (1.0 - stressRate));
    const baseAvailable = baseline.projectedAvailableCapacity.value ?? (plannedVal * (1.0 - baseAbsRate));
    const deltaHours = simulatedAvailable - baseAvailable;

    return {
      scenarioId: "S-03",
      scenarioName: "Stress Test Absentéisme",
      state: "VALUE",
      baselineValue: Math.round(baseAvailable * 100) / 100,
      simulatedValue: Math.round(simulatedAvailable * 100) / 100,
      deltaValue: Math.round(deltaHours * 100) / 100,
      unit: "h",
      explanation: `Taux d'absence stressé de ${(baseAbsRate * 100).toFixed(1)}% à ${(stressRate * 100).toFixed(1)}% (+${(input.deltaAbsenceRatePercentagePoints * 100).toFixed(1)} pts).`,
    };
  }

  /**
   * S-04: Labor Budget Cap Constraint
   * Formula:
   *   Max Allocatable Hours = Budget Cap / Analytical Labor Rate
   *   Budget Gap Hours = Planned Hours - Max Allocatable Hours
   */
  public static simulateBudgetCap(
    baseline: Phase6DForecastDataset,
    input: ScenarioBudgetCapInput
  ): Phase6DScenarioResult {
    const rate = baseline.laborRateProvenance.rateValue;
    const curr = baseline.provenance.currency;

    if (rate === null || rate <= 0) {
      return {
        scenarioId: "S-04",
        scenarioName: "Plafond Budgétaire de Main-d'œuvre",
        state: "NO_DATA",
        baselineValue: null,
        simulatedValue: null,
        deltaValue: null,
        unit: "h",
        currency: curr,
        explanation: "Taux horaire analytique certifié indisponible ou nul.",
      };
    }

    const plannedHours = baseline.plannedCapacity.value;
    if (plannedHours === null) {
      return {
        scenarioId: "S-04",
        scenarioName: "Plafond Budgétaire de Main-d'œuvre",
        state: "NOT_SCHEDULED",
        baselineValue: null,
        simulatedValue: null,
        deltaValue: null,
        unit: "h",
        currency: curr,
        explanation: "Aucune heure planifiée de référence.",
      };
    }

    const maxAllocatableHours = input.budgetCapAmount / rate;
    const gapHours = plannedHours - maxAllocatableHours;

    return {
      scenarioId: "S-04",
      scenarioName: "Plafond Budgétaire de Main-d'œuvre",
      state: "VALUE",
      baselineValue: Math.round(plannedHours * 100) / 100,
      simulatedValue: Math.round(maxAllocatableHours * 100) / 100,
      deltaValue: Math.round(gapHours * 100) / 100,
      unit: "h",
      currency: curr,
      explanation: `Plafond de ${input.budgetCapAmount.toLocaleString()} ${curr} permet ${Math.round(maxAllocatableHours)} h (Taux: ${rate} ${curr}/h). Écart: ${gapHours > 0 ? "+" : ""}${Math.round(gapHours)} h (${gapHours > 0 ? "Dépassement" : "Marge"}).`,
    };
  }

  /**
   * M-09: User-Supplied Scenario Target Staffing Gap
   * Formula:
   *   Gap = Target Hours - Available Capacity
   */
  public static calculateTargetStaffingGap(
    baseline: Phase6DForecastDataset,
    targetHours: number
  ): Phase6DScenarioResult {
    const avail = baseline.projectedAvailableCapacity.value;
    if (avail === null) {
      return {
        scenarioId: "S-01",
        scenarioName: "Écart de Staffing Ciblé",
        state: "NO_DATA",
        baselineValue: null,
        simulatedValue: null,
        deltaValue: null,
        unit: "h",
        explanation: "Capacité disponible indisponible pour comparer à la cible.",
      };
    }

    const gap = targetHours - avail;
    return {
      scenarioId: "S-01",
      scenarioName: "Écart de Staffing Ciblé",
      state: "VALUE",
      baselineValue: avail,
      simulatedValue: targetHours,
      deltaValue: Math.round(gap * 100) / 100,
      unit: "h",
      explanation: `Cible de ${targetHours} h vs ${avail} h disponibles. ${gap > 0 ? `Déficit de ${Math.round(gap)} h` : `Excédent de ${Math.round(-gap)} h`}.`,
    };
  }
}
