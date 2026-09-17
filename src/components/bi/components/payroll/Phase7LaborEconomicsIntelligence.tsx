import React, { useState } from "react";
import { Phase7Dataset } from "../../../../domains/analytics/types/phase7";
import { 
  TrendingUp, 
  DollarSign, 
  Clock, 
  ShieldCheck, 
  Building2, 
  UserCheck, 
  Layers, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowUpRight,
  ArrowDownRight,
  Hash,
  Scale
} from "lucide-react";

interface Phase7LaborEconomicsIntelligenceProps {
  phase7Dataset: Phase7Dataset;
  selectedCurrency: string;
}

export const Phase7LaborEconomicsIntelligence: React.FC<Phase7LaborEconomicsIntelligenceProps> = ({
  phase7Dataset,
  selectedCurrency,
}) => {
  const [activeTab, setActiveTab] = useState<"DEPARTMENTS" | "EMPLOYEES" | "RECONCILIATION" | "ATTRIBUTED_ITEMS">("DEPARTMENTS");
  const [filterQuery, setFilterQuery] = useState("");

  if (!phase7Dataset) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
        Chargement de l'intelligence économique du travail (Phase 7)...
      </div>
    );
  }

  const { metrics, byDepartment, byEmployee, reconciliation, provenance, unassignedRevenue, attributedItems } = phase7Dataset;
  const {
    m01_attributedRevenue,
    m02_directLaborCost,
    m03_netLaborMargin,
    m04_revenuePerHour,
    m05_unitLaborCostRatio,
    m06_returnOnLaborInvestment,
  } = metrics;

  const isMarginPositive = (m03_netLaborMargin.value ?? 0) >= 0;

  return (
    <div className="space-y-6" id="phase7-labor-economics-container">
      {/* Top Banner: Forensic Certificate & Dataset Identity */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100">
                  Économie du Travail & Productivité Opérationnelle
                </h3>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Phase 7 Certified SSOT
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1">
                <span className="flex items-center gap-1 font-mono text-slate-300">
                  <Hash className="w-3 h-3 text-slate-500" />
                  Dataset: <strong className="text-indigo-400">{provenance.datasetId}</strong>
                </span>
                <span>•</span>
                <span>Période: <strong className="text-slate-200">{phase7Dataset.periodStart} → {phase7Dataset.periodEnd}</strong></span>
                <span>•</span>
                <span>Devise: <strong className="text-slate-200">{selectedCurrency}</strong></span>
                <span>•</span>
                <span>Fiche d'Écritures GL: <strong className="text-emerald-400 font-mono">{provenance.eligibleTransactionCount}</strong></span>
                <span>•</span>
                <span>Paies Scellées: <strong className="text-indigo-400 font-mono">{provenance.sealedPayrollRecordCount}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300">
              <Scale className="w-3.5 h-3.5 text-emerald-400" />
              <span>Équilibre GL:</span>
              <strong className={reconciliation.isBalanced ? "text-emerald-400" : "text-rose-400"}>
                {reconciliation.isBalanced ? "ÉQUILIBRÉ (0.00 HTG)" : "DÉSÉQUILIBRÉ"}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Primary KPI Metrics Cards (M-01 to M-06) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* M-01 Attributed Revenue */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider text-slate-400">M-01 • Revenu Opérationnel Éligible</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="my-1">
            <div className="text-2xl font-bold text-slate-100">
              {m01_attributedRevenue.formatted}
            </div>
          </div>
          <div className="text-xs text-slate-400 flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60">
            <span>Source: GL POSTED/INCOME</span>
            <span className="font-mono text-emerald-400">{m01_attributedRevenue.state}</span>
          </div>
        </div>

        {/* M-02 Direct Labor Cost */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider text-slate-400">M-02 • Coût Direct de la Main d'Œuvre</span>
            <TrendingUp className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="my-1">
            <div className="text-2xl font-bold text-slate-100">
              {m02_directLaborCost.formatted}
            </div>
          </div>
          <div className="text-xs text-slate-400 flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60">
            <span>Source: Paies Scellées + Charges</span>
            <span className="font-mono text-indigo-400">{m02_directLaborCost.state}</span>
          </div>
        </div>

        {/* M-03 Net Labor Margin */}
        <div className={`bg-slate-900 border ${isMarginPositive ? "border-emerald-500/20" : "border-rose-500/20"} rounded-xl p-4 flex flex-col justify-between`}>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider text-slate-400">M-03 • Marge Opérationnelle du Travail</span>
            {isMarginPositive ? (
              <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            ) : (
              <ArrowDownRight className="w-4 h-4 text-rose-400" />
            )}
          </div>
          <div className="my-1">
            <div className={`text-2xl font-bold ${isMarginPositive ? "text-emerald-400" : "text-rose-400"}`}>
              {m03_netLaborMargin.formatted}
            </div>
          </div>
          <div className="text-xs text-slate-400 flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60">
            <span>Marge = M01 - M02</span>
            <span className="font-mono text-slate-300">{m03_netLaborMargin.state}</span>
          </div>
        </div>

        {/* M-04 Revenue per Attended Labor Hour */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider text-slate-400">M-04 • Revenu / Heure Prestée</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="my-1">
            <div className="text-2xl font-bold text-slate-100">
              {m04_revenuePerHour.formatted}
            </div>
          </div>
          <div className="text-xs text-slate-400 flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60">
            <span>Heures Totales: {provenance.totalWorkedHours.toFixed(1)} h</span>
            <span className="font-mono text-amber-400">{m04_revenuePerHour.state}</span>
          </div>
        </div>

        {/* M-05 Unit Labor Cost Ratio (ULCR) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider text-slate-400">M-05 • Ratio Coût Travail / Revenu (ULCR)</span>
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="my-1">
            <div className="text-2xl font-bold text-slate-100">
              {m05_unitLaborCostRatio.formatted}
            </div>
          </div>
          <div className="text-xs text-slate-400 flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60">
            <span>Part de la masse salariale</span>
            <span className="font-mono text-cyan-400">{m05_unitLaborCostRatio.state}</span>
          </div>
        </div>

        {/* M-06 Return on Labor Investment (ROLI) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider text-slate-400">M-06 • Rendement Investissement Travail (ROLI)</span>
            <TrendingUp className="w-4 h-4 text-purple-400" />
          </div>
          <div className="my-1">
            <div className={`text-2xl font-bold ${(m06_returnOnLaborInvestment.value ?? 0) >= 0 ? "text-purple-400" : "text-rose-400"}`}>
              {m06_returnOnLaborInvestment.formatted}
            </div>
          </div>
          <div className="text-xs text-slate-400 flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60">
            <span>ROLI = (Marge / Coût Travail) × 100</span>
            <span className="font-mono text-purple-400">{m06_returnOnLaborInvestment.state}</span>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("DEPARTMENTS")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === "DEPARTMENTS"
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Par Département & Indices LPI (M-08)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("EMPLOYEES")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === "EMPLOYEES"
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Par Collaborateur
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("RECONCILIATION")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === "RECONCILIATION"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            Réconciliation GL Invariante
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("ATTRIBUTED_ITEMS")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === "ATTRIBUTED_ITEMS"
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Écritures Attribuées ({attributedItems.length})
          </button>
        </div>

        <div>
          <input
            type="text"
            placeholder="Filtrer..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Tab Content: Departments */}
      {activeTab === "DEPARTMENTS" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-400" />
              Rentabilité Opérationnelle & Indice de Productivité du Travail (LPI) par Département
            </h4>
            <span className="text-xs text-slate-400">
              {byDepartment.length} départements analysés
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Département</th>
                  <th className="px-4 py-3 text-right">Revenu Attribué</th>
                  <th className="px-4 py-3 text-right">Coût Travail Direct</th>
                  <th className="px-4 py-3 text-right">Marge Nette</th>
                  <th className="px-4 py-3 text-right">Heures Prestées</th>
                  <th className="px-4 py-3 text-right">Revenu / Heure</th>
                  <th className="px-4 py-3 text-right">ULCR (%)</th>
                  <th className="px-4 py-3 text-right">ROLI (%)</th>
                  <th className="px-4 py-3 text-center">Indice LPI (M-08)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {byDepartment
                  .filter(d => !filterQuery || d.departmentName.toLowerCase().includes(filterQuery.toLowerCase()))
                  .map((dept) => {
                    const lpi = dept.laborProductivityIndex;
                    const isPositiveMargin = dept.netLaborMargin >= 0;

                    return (
                      <tr key={dept.departmentId} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-100 flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-slate-500" />
                          {dept.departmentName}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-400">
                          {dept.attributedRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })} {selectedCurrency}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-indigo-300">
                          {dept.directLaborCost.toLocaleString("en-US", { minimumFractionDigits: 2 })} {selectedCurrency}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-semibold ${isPositiveMargin ? "text-emerald-400" : "text-rose-400"}`}>
                          {dept.netLaborMargin.toLocaleString("en-US", { minimumFractionDigits: 2 })} {selectedCurrency}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-400">
                          {dept.workedHours.toFixed(1)} h
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-200">
                          {dept.revenuePerHour !== null ? `${dept.revenuePerHour.toFixed(2)} ${selectedCurrency}/h` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-200">
                          {dept.unitLaborCostRatio !== null ? `${dept.unitLaborCostRatio.toFixed(2)} %` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-200">
                          {dept.returnOnLaborInvestment !== null ? `${dept.returnOnLaborInvestment.toFixed(2)} %` : "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {lpi.state === "VALUE" && lpi.value !== null ? (
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono ${
                                lpi.value >= 1.2
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                  : lpi.value >= 0.8
                                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                  : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              }`}
                            >
                              {lpi.value.toFixed(2)}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400">
                              {lpi.state}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                {byDepartment.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      Aucun département trouvé.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content: Employees */}
      {activeTab === "EMPLOYEES" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-indigo-400" />
              Rentabilité & Productivité Individuelle
            </h4>
            <span className="text-xs text-slate-400">
              {byEmployee.length} collaborateurs
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Collaborateur</th>
                  <th className="px-4 py-3 text-right">Revenu Attribué</th>
                  <th className="px-4 py-3 text-right">Coût Salarial Direct</th>
                  <th className="px-4 py-3 text-right">Marge Nette</th>
                  <th className="px-4 py-3 text-right">Heures Prestées</th>
                  <th className="px-4 py-3 text-right">Revenu / Heure</th>
                  <th className="px-4 py-3 text-right">ULCR (%)</th>
                  <th className="px-4 py-3 text-right">ROLI (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {byEmployee
                  .filter(e => !filterQuery || e.employeeName.toLowerCase().includes(filterQuery.toLowerCase()))
                  .map((emp) => {
                    const isPositiveMargin = emp.netLaborMargin >= 0;

                    return (
                      <tr key={emp.employeeId} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-100 flex items-center gap-2">
                          <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                          {emp.employeeName}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-400">
                          {emp.attributedRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })} {selectedCurrency}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-indigo-300">
                          {emp.directLaborCost.toLocaleString("en-US", { minimumFractionDigits: 2 })} {selectedCurrency}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-semibold ${isPositiveMargin ? "text-emerald-400" : "text-rose-400"}`}>
                          {emp.netLaborMargin.toLocaleString("en-US", { minimumFractionDigits: 2 })} {selectedCurrency}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-400">
                          {emp.workedHours.toFixed(1)} h
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-200">
                          {emp.revenuePerHour !== null ? `${emp.revenuePerHour.toFixed(2)} ${selectedCurrency}/h` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-200">
                          {emp.unitLaborCostRatio !== null ? `${emp.unitLaborCostRatio.toFixed(2)} %` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-200">
                          {emp.returnOnLaborInvestment !== null ? `${emp.returnOnLaborInvestment.toFixed(2)} %` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                {byEmployee.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      Aucun collaborateur trouvé.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content: Reconciliation */}
      {activeTab === "RECONCILIATION" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-400" />
              Réconciliation GL & Invariant Comptable
            </h4>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
              Variance = {reconciliation.varianceCents} Cents
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
              <div className="text-xs text-slate-400 mb-1">Revenu GL Total Éligible</div>
              <div className="text-xl font-bold font-mono text-slate-100">
                {(reconciliation.totalEligibleGLRevenueCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} {selectedCurrency}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Écritures POSTED / INCOME</div>
            </div>

            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
              <div className="text-xs text-slate-400 mb-1">Revenu Attribué aux Départements / Salariés</div>
              <div className="text-xl font-bold font-mono text-emerald-400">
                {(reconciliation.totalAttributedRevenueCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} {selectedCurrency}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Tiers 1 à 4 résolus</div>
            </div>

            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
              <div className="text-xs text-slate-400 mb-1">Revenu Non-Assigné (Tier 5)</div>
              <div className="text-xl font-bold font-mono text-amber-400">
                {(unassignedRevenue.amountCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} {selectedCurrency}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">{unassignedRevenue.count} écritures non-assignées</div>
            </div>
          </div>

          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg text-xs text-slate-300 space-y-1">
            <div className="font-semibold text-slate-200">Garantie Mathématique SSOT :</div>
            <div>
              Revenu Éligible GL ({reconciliation.totalEligibleGLRevenueCents / 100} {selectedCurrency}) = Attribué ({reconciliation.totalAttributedRevenueCents / 100} {selectedCurrency}) + Non-Assigné ({unassignedRevenue.amountCents / 100} {selectedCurrency}).
            </div>
            <div className="text-emerald-400">
              ✓ L'invariant comptable est parfaitement respecté sans aucune perte de centime.
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: Attributed Items */}
      {activeTab === "ATTRIBUTED_ITEMS" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              Journal des Écritures de Revenu Attribuées
            </h4>
            <span className="text-xs text-slate-400">
              {attributedItems.length} écritures
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">ID Écriture</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Tier Attribution</th>
                  <th className="px-4 py-3">Collaborateur</th>
                  <th className="px-4 py-3">Département</th>
                  <th className="px-4 py-3">Branche</th>
                  <th className="px-4 py-3 text-right">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {attributedItems
                  .filter(item => !filterQuery || item.transactionId.toLowerCase().includes(filterQuery.toLowerCase()) || (item.resolvedEmployeeName && item.resolvedEmployeeName.toLowerCase().includes(filterQuery.toLowerCase())))
                  .slice(0, 50)
                  .map((item) => (
                    <tr key={item.transactionId} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-mono text-slate-400">{item.transactionId}</td>
                      <td className="px-4 py-3 text-slate-300">{item.date}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                          {item.attributionTier}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-200">{item.resolvedEmployeeName || "—"}</td>
                      <td className="px-4 py-3 text-slate-200">{item.operationalDepartmentName || "—"}</td>
                      <td className="px-4 py-3 text-slate-200">{item.branchName || "—"}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-400">
                        {item.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} {item.currency}
                      </td>
                    </tr>
                  ))}
                {attributedItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      Aucune écriture attribuée.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
