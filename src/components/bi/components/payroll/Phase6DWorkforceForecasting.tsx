import React, { useState, useMemo } from "react";
import {
  Phase6DForecastDataset,
  Phase6DScenarioResult,
  Phase6DMetricValue,
} from "../../../../domains/analytics/types/phase6d";
import { Phase6DScenarioEngine } from "../../../../domains/analytics/services/Phase6DScenarioEngine";
import { Phase6DTestSuite, TestExecutionResult } from "../../../../domains/analytics/services/Phase6DTestSuite";
import {
  TrendingUp,
  Calendar,
  Users,
  Clock,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Play,
  ShieldCheck,
  Activity,
  Layers,
  HelpCircle,
  BarChart3,
  RefreshCw,
  Building,
} from "lucide-react";

interface Phase6DWorkforceForecastingProps {
  forecastDataset: Phase6DForecastDataset;
  selectedCurrency: string;
  standardHoursPerCycle?: number | null;
  businessTimezone?: string | null;
}

export const Phase6DWorkforceForecasting: React.FC<Phase6DWorkforceForecastingProps> = ({
  forecastDataset,
  selectedCurrency,
  standardHoursPerCycle,
  businessTimezone,
}) => {
  const [activeTab, setActiveTab] = useState<"FORECAST" | "SCENARIOS" | "AUDIT_SUITE">("FORECAST");

  // What-If Simulation Inputs
  const [deltaHeadcount, setDeltaHeadcount] = useState<number>(0);
  const [deltaHoursPerShift, setDeltaHoursPerShift] = useState<number>(0);
  const [deltaAbsenceRatePts, setDeltaAbsenceRatePts] = useState<number>(0);
  const [budgetCapInput, setBudgetCapInput] = useState<number>(0);
  const [targetHoursInput, setTargetHoursInput] = useState<number>(0);

  // Test Suite Execution State
  const [testResults, setTestResults] = useState<{
    results: TestExecutionResult[];
    totalPassed: number;
    totalFailed: number;
  } | null>(null);
  const [isRunningTests, setIsRunningTests] = useState<boolean>(false);

  // Run What-If Simulations in-memory
  const headcountSim: Phase6DScenarioResult = useMemo(() => {
    return Phase6DScenarioEngine.simulateHeadcount(
      forecastDataset,
      { deltaEmployees: deltaHeadcount },
      standardHoursPerCycle
    );
  }, [forecastDataset, deltaHeadcount, standardHoursPerCycle]);

  const shiftDurationSim: Phase6DScenarioResult = useMemo(() => {
    const plannedShiftsCount = forecastDataset.dataSufficiency.futureShiftsCount;
    return Phase6DScenarioEngine.simulateShiftDuration(
      forecastDataset,
      { deltaHoursPerShift },
      plannedShiftsCount
    );
  }, [forecastDataset, deltaHoursPerShift]);

  const absenceStressSim: Phase6DScenarioResult = useMemo(() => {
    return Phase6DScenarioEngine.simulateAbsenceStress(forecastDataset, {
      deltaAbsenceRatePercentagePoints: deltaAbsenceRatePts / 100.0,
    });
  }, [forecastDataset, deltaAbsenceRatePts]);

  const budgetCapSim: Phase6DScenarioResult = useMemo(() => {
    if (budgetCapInput <= 0) {
      return {
        scenarioId: "S-04",
        scenarioName: "Plafond Budgétaire",
        state: "NOT_APPLICABLE",
        baselineValue: null,
        simulatedValue: null,
        deltaValue: null,
        unit: "h",
        explanation: "Saisissez un plafond budgétaire supérieur à zéro.",
      };
    }
    return Phase6DScenarioEngine.simulateBudgetCap(forecastDataset, {
      budgetCapAmount: budgetCapInput,
    });
  }, [forecastDataset, budgetCapInput]);

  const targetStaffingSim: Phase6DScenarioResult = useMemo(() => {
    if (targetHoursInput <= 0) {
      return {
        scenarioId: "S-01",
        scenarioName: "Écart de Staffing Ciblé",
        state: "NOT_APPLICABLE",
        baselineValue: null,
        simulatedValue: null,
        deltaValue: null,
        unit: "h",
        explanation: "Saisissez une cible d'heures requises.",
      };
    }
    return Phase6DScenarioEngine.calculateTargetStaffingGap(forecastDataset, targetHoursInput);
  }, [forecastDataset, targetHoursInput]);

  const handleRunTestSuite = () => {
    setIsRunningTests(true);
    setTimeout(() => {
      const suite = Phase6DTestSuite.runAll();
      setTestResults(suite);
      setIsRunningTests(false);
    }, 150);
  };

  const renderMetricBadge = (metric: Phase6DMetricValue<any>) => {
    switch (metric.state) {
      case "VALUE":
        return <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">VALUE</span>;
      case "ZERO":
        return <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">ZERO</span>;
      case "NOT_SCHEDULED":
        return <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-mono">NOT_SCHEDULED</span>;
      case "NO_DATA":
        return <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">NO_DATA</span>;
      case "TIMEZONE_NOT_CONFIGURED":
        return <span className="text-xs px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono">BLOCKED: TIMEZONE</span>;
      case "NOT_APPLICABLE":
        return <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">N/A</span>;
      default:
        return <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-400 font-mono">{metric.state}</span>;
    }
  };

  const { provenance, dataSufficiency, coverageBreakdown, reconciliation } = forecastDataset;

  return (
    <div className="space-y-6" id="phase-6d-forecasting-container">
      {/* Top Banner & Tab Controls */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
              PHASE 6D CERTIFIÉE
            </span>
            <span className="text-xs text-slate-400 font-mono">ID: {provenance.forecastId}</span>
            <span className="text-xs text-slate-500 font-mono">[{provenance.sourceTier}]</span>
          </div>
          <h2 className="text-lg font-semibold text-slate-100 mt-1">
            Workforce Planning & Labor Capacity Intelligence
          </h2>
          <p className="text-xs text-slate-400">
            Prévision déterministe, run-rate d'absentéisme et simulations capacitaire What-If.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("FORECAST")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === "FORECAST"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Prévisions & Métriques
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("SCENARIOS")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === "SCENARIOS"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Simulateur What-If (In-Memory)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("AUDIT_SUITE")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === "AUDIT_SUITE"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Suite d'Acceptation (24 Tests)
          </button>
        </div>
      </div>

      {/* TAB 1: FORECAST & METRICS */}
      {activeTab === "FORECAST" && (
        <div className="space-y-6">
          {/* Data Sufficiency & Coverage Header */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-400 block mb-1">Suffisance des Données</span>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-semibold text-slate-200">
                  {dataSufficiency.overallState}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                {dataSufficiency.completedCyclesCount} cycles clos analysés
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-400 block mb-1">Couverture de l'Horizon</span>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold text-slate-200">
                  {coverageBreakdown.totalDays} Jours au total
                </span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                {coverageBreakdown.publishedDays} j. publiés | {coverageBreakdown.expandedDays} j. étendus
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-400 block mb-1">Source de Capacité</span>
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-semibold text-slate-200">
                  {provenance.sourceTier}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Méthode : {provenance.methodology}
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-400 block mb-1">Taux Horaire Analytique</span>
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-slate-200">
                  {forecastDataset.laborRateProvenance.rateValue !== null
                    ? `${forecastDataset.laborRateProvenance.rateValue.toLocaleString()} ${forecastDataset.laborRateProvenance.rateUnit}`
                    : "INDISPONIBLE"}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Portée : {forecastDataset.laborRateProvenance.rateScope}
              </span>
            </div>
          </div>

          {/* Core Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* M-01 */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-medium">M-01: Capacité Planifiée</span>
                  {renderMetricBadge(forecastDataset.plannedCapacity)}
                </div>
                <div className="text-2xl font-bold text-slate-100 font-mono">
                  {forecastDataset.plannedCapacity.value !== null
                    ? `${forecastDataset.plannedCapacity.value.toLocaleString()} h`
                    : "—"}
                </div>
              </div>
              <span className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-800/60 block">
                {forecastDataset.plannedCapacity.statusText}
              </span>
            </div>

            {/* M-02 */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-medium">M-02: Taux d'Absence Historique</span>
                  {renderMetricBadge(forecastDataset.historicalAbsenceRate)}
                </div>
                <div className="text-2xl font-bold text-slate-100 font-mono">
                  {forecastDataset.historicalAbsenceRate.value !== null
                    ? `${((forecastDataset.historicalAbsenceRate.value) * 100).toFixed(2)}%`
                    : "—"}
                </div>
              </div>
              <span className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-800/60 block">
                {forecastDataset.historicalAbsenceRate.statusText}
              </span>
            </div>

            {/* M-03 */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-medium">M-03: Capacité Disponible Projetée</span>
                  {renderMetricBadge(forecastDataset.projectedAvailableCapacity)}
                </div>
                <div className="text-2xl font-bold text-slate-100 font-mono">
                  {forecastDataset.projectedAvailableCapacity.value !== null
                    ? `${forecastDataset.projectedAvailableCapacity.value.toLocaleString()} h`
                    : "—"}
                </div>
              </div>
              <span className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-800/60 block">
                {forecastDataset.projectedAvailableCapacity.statusText}
              </span>
            </div>

            {/* M-04 */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-medium">M-04: Perte Capacitaire Projetée</span>
                  {renderMetricBadge(forecastDataset.projectedCapacityLoss)}
                </div>
                <div className="text-2xl font-bold text-amber-400 font-mono">
                  {forecastDataset.projectedCapacityLoss.value !== null
                    ? `${forecastDataset.projectedCapacityLoss.value.toLocaleString()} h`
                    : "—"}
                </div>
              </div>
              <span className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-800/60 block">
                {forecastDataset.projectedCapacityLoss.statusText}
              </span>
            </div>

            {/* M-05 */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-medium">M-05: Coût Salarial de Base Prévu</span>
                  {renderMetricBadge(forecastDataset.forecastBaseLaborCost)}
                </div>
                <div className="text-2xl font-bold text-slate-100 font-mono">
                  {forecastDataset.forecastBaseLaborCost.value !== null
                    ? `${forecastDataset.forecastBaseLaborCost.value.toLocaleString()} ${selectedCurrency}`
                    : "—"}
                </div>
              </div>
              <span className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-800/60 block">
                {forecastDataset.forecastBaseLaborCost.statusText}
              </span>
            </div>

            {/* M-06 */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-medium">M-06: Coût Analytique Main-d'Œuvre</span>
                  {renderMetricBadge(forecastDataset.forecastAttendanceLaborCost)}
                </div>
                <div className="text-2xl font-bold text-purple-300 font-mono">
                  {forecastDataset.forecastAttendanceLaborCost.value !== null
                    ? `${forecastDataset.forecastAttendanceLaborCost.value.toLocaleString()} ${selectedCurrency}`
                    : "—"}
                </div>
              </div>
              <span className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-800/60 block">
                {forecastDataset.forecastAttendanceLaborCost.statusText}
              </span>
            </div>

            {/* M-07 */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-medium">M-07: Équivalence ETP Opérationnel</span>
                  {renderMetricBadge(forecastDataset.operationalFteEquivalence)}
                </div>
                <div className="text-2xl font-bold text-slate-100 font-mono">
                  {forecastDataset.operationalFteEquivalence.value !== null
                    ? `${forecastDataset.operationalFteEquivalence.value.toFixed(2)} FTE`
                    : "—"}
                </div>
              </div>
              <span className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-800/60 block">
                {forecastDataset.operationalFteEquivalence.statusText}
              </span>
            </div>

            {/* M-08 */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-medium">M-08: Pression Salariale Économique</span>
                  {renderMetricBadge(forecastDataset.economicLaborPressure)}
                </div>
                <div className="text-2xl font-bold text-slate-100 font-mono">
                  {forecastDataset.economicLaborPressure.value !== null
                    ? `${((forecastDataset.economicLaborPressure.value) * 100).toFixed(2)}% du C.A.`
                    : "—"}
                </div>
              </div>
              <span className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-800/60 block">
                {forecastDataset.economicLaborPressure.statusText}
              </span>
            </div>

            {/* M-09 */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-medium">M-09: Écart de Staffing (Baseline)</span>
                  {renderMetricBadge(forecastDataset.scenarioStaffingGap)}
                </div>
                <div className="text-2xl font-bold text-slate-400 font-mono">
                  {forecastDataset.scenarioStaffingGap.value !== null
                    ? `${forecastDataset.scenarioStaffingGap.value} h`
                    : "N/A"}
                </div>
              </div>
              <span className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-800/60 block">
                {forecastDataset.scenarioStaffingGap.statusText}
              </span>
            </div>
          </div>

          {/* Organizational Rollup & Reconciliation Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Building className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-slate-200">
                  Réconciliation Organisationnelle & Ventilation par Dimension
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Non assigné : {reconciliation.unresolvedCount} items ({reconciliation.unresolvedHours} h)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* By Branch */}
              <div className="space-y-2">
                <span className="text-xs text-slate-400 font-medium block">Par Branche</span>
                {Object.keys(reconciliation.byBranch).length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Aucune donnée par branche</p>
                ) : (
                  Object.values(reconciliation.byBranch).map((b) => (
                    <div
                      key={b.dimensionId}
                      className="bg-slate-800/60 border border-slate-700/60 p-2.5 rounded-lg flex items-center justify-between text-xs"
                    >
                      <span className="text-slate-200 font-medium">{b.dimensionName}</span>
                      <div className="flex items-center gap-3 font-mono">
                        <span className="text-slate-300">{b.plannedHours.value ?? 0} h planifiées</span>
                        <span className="text-purple-300 font-semibold">{b.operationalFte.value ?? "—"} FTE</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* By Department */}
              <div className="space-y-2">
                <span className="text-xs text-slate-400 font-medium block">Par Département</span>
                {Object.keys(reconciliation.byDepartment).length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Aucune donnée par département</p>
                ) : (
                  Object.values(reconciliation.byDepartment).map((d) => (
                    <div
                      key={d.dimensionId}
                      className="bg-slate-800/60 border border-slate-700/60 p-2.5 rounded-lg flex items-center justify-between text-xs"
                    >
                      <span className="text-slate-200 font-medium">{d.dimensionName}</span>
                      <div className="flex items-center gap-3 font-mono">
                        <span className="text-slate-300">{d.plannedHours.value ?? 0} h planifiées</span>
                        <span className="text-purple-300 font-semibold">{d.operationalFte.value ?? "—"} FTE</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: WHAT-IF SCENARIOS (IN-MEMORY) */}
      {activeTab === "SCENARIOS" && (
        <div className="space-y-6">
          <div className="bg-purple-950/20 border border-purple-800/40 rounded-xl p-4 flex items-start gap-3">
            <HelpCircle className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
            <div className="text-xs text-purple-200 space-y-1">
              <p className="font-semibold">Simulateur What-If In-Memory (Zéro Écriture Firestore)</p>
              <p className="text-purple-300/80">
                Ces simulations appliquent des hypothèses directes sur la baseline calculée en mémoire sans modifier les shifts, contrats ou registres de paie.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Scenario S-01: Headcount Adjustment */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">S-01: Ajustement d'Effectif (Headcount)</h4>
                  <p className="text-xs text-slate-400">Recrutement ou réduction nette d'effectif opérationnel</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono">
                  S-01
                </span>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-300">Variation d'effectif (salariés) :</label>
                <input
                  type="number"
                  value={deltaHeadcount}
                  onChange={(e) => setDeltaHeadcount(parseInt(e.target.value) || 0)}
                  className="bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 w-24 text-right font-mono"
                />
              </div>

              <div className="bg-slate-800/70 border border-slate-700/80 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Capacité disponible de base :</span>
                  <span className="font-mono text-slate-200">{headcountSim.baselineValue ?? "—"} h</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Variation calculée :</span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    {headcountSim.deltaValue !== null ? `${headcountSim.deltaValue > 0 ? "+" : ""}${headcountSim.deltaValue} h` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-700">
                  <span className="text-slate-300 font-medium">Capacité simulée :</span>
                  <span className="font-mono text-purple-300 text-sm font-bold">
                    {headcountSim.simulatedValue !== null ? `${headcountSim.simulatedValue} h` : "BLOQUÉ"}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">{headcountSim.explanation}</p>
            </div>

            {/* Scenario S-02: Shift Duration Adjustment */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">S-02: Ajustement de Durée de Shift</h4>
                  <p className="text-xs text-slate-400">Modification uniforme de durée sur tous les shifts planifiés</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono">
                  S-02
                </span>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-300">Delta par shift (heures) :</label>
                <input
                  type="number"
                  step="0.5"
                  value={deltaHoursPerShift}
                  onChange={(e) => setDeltaHoursPerShift(parseFloat(e.target.value) || 0)}
                  className="bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 w-24 text-right font-mono"
                />
              </div>

              <div className="bg-slate-800/70 border border-slate-700/80 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Capacité planifiée de base :</span>
                  <span className="font-mono text-slate-200">{shiftDurationSim.baselineValue ?? "—"} h</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Variation calculée :</span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    {shiftDurationSim.deltaValue !== null ? `${shiftDurationSim.deltaValue > 0 ? "+" : ""}${shiftDurationSim.deltaValue} h` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-700">
                  <span className="text-slate-300 font-medium">Capacité planifiée simulée :</span>
                  <span className="font-mono text-purple-300 text-sm font-bold">
                    {shiftDurationSim.simulatedValue !== null ? `${shiftDurationSim.simulatedValue} h` : "—"}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">{shiftDurationSim.explanation}</p>
            </div>

            {/* Scenario S-03: Absenteeism Stress Testing */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">S-03: Stress-Test Absentéisme</h4>
                  <p className="text-xs text-slate-400">Choc d'absentéisme en points de pourcentage (+ pts)</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono">
                  S-03
                </span>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-300">Choc d'absence (+ pts %) :</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={deltaAbsenceRatePts}
                  onChange={(e) => setDeltaAbsenceRatePts(parseFloat(e.target.value) || 0)}
                  className="bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 w-24 text-right font-mono"
                />
              </div>

              <div className="bg-slate-800/70 border border-slate-700/80 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Capacité disponible de base :</span>
                  <span className="font-mono text-slate-200">{absenceStressSim.baselineValue ?? "—"} h</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Impact capacitaire :</span>
                  <span className="font-mono text-rose-400 font-semibold">
                    {absenceStressSim.deltaValue !== null ? `${absenceStressSim.deltaValue} h` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-700">
                  <span className="text-slate-300 font-medium">Capacité sous stress :</span>
                  <span className="font-mono text-amber-300 text-sm font-bold">
                    {absenceStressSim.simulatedValue !== null ? `${absenceStressSim.simulatedValue} h` : "—"}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">{absenceStressSim.explanation}</p>
            </div>

            {/* Scenario S-04: Labor Budget Cap Constraint */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">S-04: Plafond Budgétaire de Main-d'œuvre</h4>
                  <p className="text-xs text-slate-400">Capacité maximale allouable sous contrainte financière</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono">
                  S-04
                </span>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-300">Plafond budgétaire ({selectedCurrency}) :</label>
                <input
                  type="number"
                  step="1000"
                  value={budgetCapInput}
                  onChange={(e) => setBudgetCapInput(parseFloat(e.target.value) || 0)}
                  className="bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 w-32 text-right font-mono"
                />
              </div>

              <div className="bg-slate-800/70 border border-slate-700/80 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Heures planifiées de base :</span>
                  <span className="font-mono text-slate-200">{budgetCapSim.baselineValue ?? "—"} h</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Heures maximales autorisées :</span>
                  <span className="font-mono text-purple-300 font-semibold">
                    {budgetCapSim.simulatedValue !== null ? `${budgetCapSim.simulatedValue} h` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-700">
                  <span className="text-slate-300 font-medium">Écart budgétaire (Gap) :</span>
                  <span className="font-mono text-emerald-400 text-sm font-bold">
                    {budgetCapSim.deltaValue !== null ? `${budgetCapSim.deltaValue > 0 ? "+" : ""}${budgetCapSim.deltaValue} h` : "—"}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">{budgetCapSim.explanation}</p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TEST SUITE & FORENSIC CERTIFICATION */}
      {activeTab === "AUDIT_SUITE" && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Suite d'Acceptation Déterministe Phase 6D (24/24 Scénarios)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Exécution immédiate des tests contractuels 6D-01 à 6D-24 certifiant les formules, invariants et gardes.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunTestSuite}
              disabled={isRunningTests}
              className="bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 shadow-sm"
            >
              <Play className={`w-3.5 h-3.5 ${isRunningTests ? "animate-spin" : ""}`} />
              {isRunningTests ? "Exécution en cours..." : "Lancer les 24 Scénarios"}
            </button>
          </div>

          {testResults && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <span className="text-xs text-slate-400 block mb-1">Total Scénarios</span>
                  <span className="text-2xl font-bold text-slate-100 font-mono">
                    {testResults.results.length}
                  </span>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <span className="text-xs text-slate-400 block mb-1">Réussite (PASS)</span>
                  <span className="text-2xl font-bold text-emerald-400 font-mono">
                    {testResults.totalPassed} / {testResults.results.length}
                  </span>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <span className="text-xs text-slate-400 block mb-1">Échecs (FAIL)</span>
                  <span className="text-2xl font-bold text-rose-400 font-mono">
                    {testResults.totalFailed}
                  </span>
                </div>
              </div>

              {/* Tests Detailed Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-800/80 border-b border-slate-700 text-slate-300">
                        <th className="p-3 font-semibold w-16">ID</th>
                        <th className="p-3 font-semibold">Description du Scénario Contractuel</th>
                        <th className="p-3 font-semibold">Attendu (Spec)</th>
                        <th className="p-3 font-semibold">Obtenu (Moteur)</th>
                        <th className="p-3 font-semibold w-20 text-center">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300 font-mono">
                      {testResults.results.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-800/40">
                          <td className="p-3 font-semibold text-purple-300">{t.id}</td>
                          <td className="p-3 font-sans text-slate-200">{t.name}</td>
                          <td className="p-3 text-slate-400">{t.expected}</td>
                          <td className="p-3 text-slate-200">{t.actual}</td>
                          <td className="p-3 text-center">
                            {t.status === "PASS" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-sans font-semibold text-[11px]">
                                <CheckCircle2 className="w-3 h-3" /> PASS
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-sans font-semibold text-[11px]">
                                <AlertTriangle className="w-3 h-3" /> FAIL
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
