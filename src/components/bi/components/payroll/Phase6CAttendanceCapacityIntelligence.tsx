import React, { useState } from "react";
import { Phase6CKPIDataset } from "../../../../domains/analytics/types/phase6c";
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  DollarSign, 
  TrendingUp, 
  Building2, 
  UserCheck, 
  Layers, 
  ShieldAlert,
  ChevronRight,
  Info
} from "lucide-react";

interface Phase6CAttendanceCapacityIntelligenceProps {
  phase6cDataset: Phase6CKPIDataset;
  selectedCurrency: string;
}

export const Phase6CAttendanceCapacityIntelligence: React.FC<Phase6CAttendanceCapacityIntelligenceProps> = ({
  phase6cDataset,
  selectedCurrency,
}) => {
  const [activeDimension, setActiveDimension] = useState<"GLOBAL" | "DEPARTMENT" | "BRANCH" | "EMPLOYEE" | "ANOMALIES">("GLOBAL");
  const [selectedDeptId, setSelectedDeptId] = useState<string>("");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");

  if (!phase6cDataset) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
        Chargement des métriques Phase 6C...
      </div>
    );
  }

  const { reconciliation, costing, capacity, economics, byDepartment, byBranch, byEmployee } = phase6cDataset;

  // Selected Scope Metrics
  let currentScope = { reconciliation, costing, capacity, economics };
  let scopeLabel = "Entreprise Globale (Consolidé)";

  if (activeDimension === "DEPARTMENT" && selectedDeptId && byDepartment[selectedDeptId]) {
    currentScope = byDepartment[selectedDeptId];
    scopeLabel = `Département : ${byDepartment[selectedDeptId].departmentName}`;
  } else if (activeDimension === "BRANCH" && selectedBranchId && byBranch[selectedBranchId]) {
    currentScope = byBranch[selectedBranchId];
    scopeLabel = `Branche : ${byBranch[selectedBranchId].branchName}`;
  } else if (activeDimension === "EMPLOYEE" && selectedEmpId && byEmployee[selectedEmpId]) {
    currentScope = byEmployee[selectedEmpId];
    scopeLabel = `Salarié : ${byEmployee[selectedEmpId].employeeName}`;
  }

  return (
    <div className="space-y-6" id="phase-6c-intelligence-container">
      {/* Dimension Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => { setActiveDimension("GLOBAL"); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeDimension === "GLOBAL"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Consolidé Global
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveDimension("DEPARTMENT");
              if (!selectedDeptId && Object.keys(byDepartment).length > 0) {
                setSelectedDeptId(Object.keys(byDepartment)[0]);
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeDimension === "DEPARTMENT"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Par Département
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveDimension("BRANCH");
              if (!selectedBranchId && Object.keys(byBranch).length > 0) {
                setSelectedBranchId(Object.keys(byBranch)[0]);
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeDimension === "BRANCH"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Par Branche
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveDimension("EMPLOYEE");
              if (!selectedEmpId && Object.keys(byEmployee).length > 0) {
                setSelectedEmpId(Object.keys(byEmployee)[0]);
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeDimension === "EMPLOYEE"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Par Salarié
          </button>

          <button
            type="button"
            onClick={() => setActiveDimension("ANOMALIES")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeDimension === "ANOMALIES"
                ? "bg-rose-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Anomalies ({reconciliation.anomaliesCount.value || 0})
          </button>
        </div>

        {/* Dimension Selectors */}
        {activeDimension === "DEPARTMENT" && (
          <select
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {Object.entries(byDepartment).map(([id, d]) => (
              <option key={id} value={id}>
                {d.departmentName} {d.resolution === "UNRESOLVED" ? "(UNRESOLVED)" : ""}
              </option>
            ))}
          </select>
        )}

        {activeDimension === "BRANCH" && (
          <select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {Object.entries(byBranch).map(([id, b]) => (
              <option key={id} value={id}>
                {b.branchName} {b.resolution === "UNRESOLVED" ? "(UNRESOLVED)" : ""}
              </option>
            ))}
          </select>
        )}

        {activeDimension === "EMPLOYEE" && (
          <select
            value={selectedEmpId}
            onChange={(e) => setSelectedEmpId(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {Object.entries(byEmployee).map(([id, emp]) => (
              <option key={id} value={id}>
                {emp.employeeName} ({emp.departmentName} - {emp.branchName})
              </option>
            ))}
          </select>
        )}
      </div>

      {activeDimension === "ANOMALIES" ? (
        /* Anomalies Panel */
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                Journal d'Anomalies de Présence & Pointages
              </h3>
              <p className="text-xs text-slate-400">
                Pointages non vérifiés, chevauchements, durées négatives ou sorties manquantes exclus du calcul.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
              {reconciliation.anomaliesCount.value || 0} détectée(s)
            </span>
          </div>

          {reconciliation.anomalies.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-slate-950/60 rounded-lg border border-slate-800">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-300">Aucune anomalie détectée</p>
              <p className="text-[11px] text-slate-500">Tous les pointages et plannings respectent l'intégrité temporelle.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden">
              {reconciliation.anomalies.map((item) => (
                <div key={item.id} className="p-3.5 bg-slate-950/80 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        {item.type}
                      </span>
                      <span className="text-xs font-medium text-slate-200">{item.employeeName}</span>
                      <span className="text-[11px] text-slate-500">({item.date})</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{item.description}</p>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">ID: {item.id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Standard 4-Bloc KPI Dashboard */
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              {scopeLabel}
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              Devise: {selectedCurrency} | Mode: {phase6cDataset.accountingMode}
            </span>
          </div>

          {/* Bloc A — Attendance Reconciliation */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                  BLOC A — Réconciliation Temps & Présence
                </h4>
                <p className="text-[11px] text-slate-400">
                  Comparaison Plannings (shifts) vs Réalité (attendance) vs Paie Scellée
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg">
                <span className="text-[11px] text-slate-400 block">Heures Planifiées (H_plan)</span>
                <span className="text-sm font-bold text-slate-100 mt-1 block">
                  {currentScope.reconciliation.scheduledHours.status === "NOT_SCHEDULED"
                    ? "NOT_SCHEDULED"
                    : currentScope.reconciliation.scheduledHours.formatted}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">shifts SSOT</span>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg">
                <span className="text-[11px] text-slate-400 block">Heures Travaillées</span>
                <span className="text-sm font-bold text-emerald-400 mt-1 block">
                  {currentScope.reconciliation.workedHours.status === "NO_DATA"
                    ? "NO_DATA"
                    : currentScope.reconciliation.workedHours.formatted}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">attendance SSOT</span>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg">
                <span className="text-[11px] text-slate-400 block">Variance (V = Real - Plan)</span>
                <span className={`text-sm font-bold mt-1 block ${
                  (currentScope.reconciliation.varianceHours.value || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}>
                  {currentScope.reconciliation.varianceHours.formatted}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Ecart temporel</span>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg">
                <span className="text-[11px] text-slate-400 block">HS Potentielles</span>
                <span className="text-sm font-bold text-amber-400 mt-1 block">
                  {currentScope.reconciliation.potentialOvertime.formatted}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Max(0, Real - Plan)</span>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg">
                <span className="text-[11px] text-slate-400 block">HS Autorisées</span>
                <span className="text-sm font-bold text-cyan-400 mt-1 block">
                  {currentScope.reconciliation.authorizedOvertime.formatted}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Validation Manager</span>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg">
                <span className="text-[11px] text-slate-400 block">HS Paie Scellée</span>
                <span className="text-sm font-bold text-indigo-400 mt-1 block">
                  {currentScope.reconciliation.payrollOvertimeHours.status === "NO_DATA"
                    ? "NO_DATA"
                    : currentScope.reconciliation.payrollOvertimeHours.formatted}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">payroll_records</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 block">Absences</span>
                  <span className="text-xs font-bold text-slate-200">
                    {currentScope.reconciliation.absenceCount.value || 0} ({currentScope.reconciliation.absenceHours.formatted})
                  </span>
                </div>
                <span className="text-xs font-bold text-rose-400">
                  {currentScope.reconciliation.absenceRate.formatted}
                </span>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 block">Retards Détectés</span>
                  <span className="text-xs font-bold text-slate-200">
                    {currentScope.reconciliation.latenessCount.value || 0} occurrence(s)
                  </span>
                </div>
                <span className="text-xs font-bold text-amber-400">
                  {currentScope.reconciliation.lateMinutes.formatted}
                </span>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 block">Anomalies Pointage</span>
                  <span className="text-xs font-bold text-slate-200">
                    {currentScope.reconciliation.anomaliesCount.value || 0} entrée(s)
                  </span>
                </div>
                <span className="text-xs font-semibold text-slate-400">Exclues</span>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 block">Intégrité Données</span>
                  <span className="text-xs font-bold text-emerald-400">SSOT CERTIFIÉ</span>
                </div>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
            </div>
          </div>

          {/* Bloc B — Attendance Costing */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  BLOC B — Coût Réel du Travail & Taux Analytique
                </h4>
                <p className="text-[11px] text-slate-400">
                  Masse salariale complète (Brut + Charges patronales) rattachée aux heures
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-lg">
                <span className="text-[11px] text-slate-400 block">Masse Salariale Réelle (Brut + Patronal)</span>
                <span className="text-base font-bold text-slate-100 mt-1 block">
                  {currentScope.costing.actualPayrollCost.status === "NO_DATA"
                    ? "NO_DATA"
                    : currentScope.costing.actualPayrollCost.formatted}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">payroll_records scellés</span>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-lg">
                <span className="text-[11px] text-slate-400 block">Coût Heures Sup Paie</span>
                <span className="text-base font-bold text-indigo-400 mt-1 block">
                  {currentScope.costing.payrollOvertimeCost.status === "NO_DATA"
                    ? "NO_DATA"
                    : currentScope.costing.payrollOvertimeCost.formatted}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Paiement effectif</span>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-lg">
                <span className="text-[11px] text-slate-400 block">Taux Horaire Analytique</span>
                <span className="text-base font-bold text-emerald-400 mt-1 block">
                  {currentScope.costing.analyticalLaborRate.status === "NO_DATA"
                    ? "NO_DATA"
                    : currentScope.costing.analyticalLaborRate.formatted}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Dénominateur: {currentScope.costing.analyticalLaborRateDenominator}
                </span>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-lg">
                <span className="text-[11px] text-slate-400 block">Coût Imputé Présence</span>
                <span className="text-base font-bold text-cyan-400 mt-1 block">
                  {currentScope.costing.attendanceAttributedLaborCost.status === "NO_DATA"
                    ? "NO_DATA"
                    : currentScope.costing.attendanceAttributedLaborCost.formatted}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">H_travaillées × Taux</span>
              </div>
            </div>
          </div>

          {/* Bloc C & D — Capacity & Workforce Economics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bloc C — Capacity Intelligence */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  BLOC C — Intelligence de Capacité & Charge
                </h4>
                <p className="text-[11px] text-slate-400">
                  Capacité théorique, disponibilité nette et taux d'utilisation
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg">
                  <span className="text-[11px] text-slate-400 block">Capacité Planifiée</span>
                  <span className="text-sm font-bold text-slate-100 mt-1 block">
                    {currentScope.capacity.plannedCapacity.status === "NOT_SCHEDULED"
                      ? "NOT_SCHEDULED"
                      : currentScope.capacity.plannedCapacity.formatted}
                  </span>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg">
                  <span className="text-[11px] text-slate-400 block">Capacité Disponible</span>
                  <span className="text-sm font-bold text-indigo-400 mt-1 block">
                    {currentScope.capacity.availableCapacity.status === "NOT_SCHEDULED"
                      ? "NOT_SCHEDULED"
                      : currentScope.capacity.availableCapacity.formatted}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">H_plan - H_absences</span>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg">
                  <span className="text-[11px] text-slate-400 block">Taux d'Utilisation</span>
                  <span className="text-sm font-bold text-emerald-400 mt-1 block">
                    {currentScope.capacity.capacityUtilization.status === "NOT_SCHEDULED"
                      ? "NOT_SCHEDULED"
                      : currentScope.capacity.capacityUtilization.formatted}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">H_trav / Cap_dispo</span>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg">
                  <span className="text-[11px] text-slate-400 block">Sous-Capacité / Surcharge</span>
                  <span className="text-sm font-bold text-amber-400 mt-1 block">
                    {(currentScope.capacity.overload.value || 0) > 0
                      ? `Surcharge: ${currentScope.capacity.overload.formatted}`
                      : `Sous-cap: ${currentScope.capacity.underCapacity.formatted}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Bloc D — Workforce Economics */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  BLOC D — Économie du Capital Humain (GL Certified)
                </h4>
                <p className="text-[11px] text-slate-400">
                  Rapprochement Chiffre d'Affaires GL vs Coût RH Réel
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg">
                  <span className="text-[11px] text-slate-400 block">Chiffre d'Affaires GL</span>
                  <span className="text-sm font-bold text-slate-100 mt-1 block">
                    {currentScope.economics.certifiedGLRevenue.status === "NO_DATA"
                      ? "NO_DATA"
                      : currentScope.economics.certifiedGLRevenue.formatted}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">ledger_transactions</span>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg">
                  <span className="text-[11px] text-slate-400 block">CA par Heure Travaillée</span>
                  <span className="text-sm font-bold text-emerald-400 mt-1 block">
                    {currentScope.economics.revenuePerWorkedHour.status === "UNDEFINED"
                      ? "UNDEFINED"
                      : currentScope.economics.revenuePerWorkedHour.formatted}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">CA / H_travaillées</span>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg">
                  <span className="text-[11px] text-slate-400 block">Productivité Opérationnelle</span>
                  <span className="text-sm font-bold text-cyan-400 mt-1 block">
                    {currentScope.economics.operationalProductivity.status === "NO_DATA"
                      ? "NO_DATA"
                      : currentScope.economics.operationalProductivity.formatted}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">CA / Masse Salariale</span>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg">
                  <span className="text-[11px] text-slate-400 block">HC-ROI (%)</span>
                  <span className="text-sm font-bold text-indigo-400 mt-1 block">
                    {currentScope.economics.hcRoi.status === "NO_DATA"
                      ? "NO_DATA"
                      : currentScope.economics.hcRoi.formatted}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">(CA - Coût) / Coût</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
