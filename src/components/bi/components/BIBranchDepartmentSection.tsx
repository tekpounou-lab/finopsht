import React from "react";
import { Info } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from "recharts";
import { SafeChartContainer } from "../../ui/SafeChartContainer";
import { RadarMetricType } from "../hooks/useBIUIState";
import { EnrichedDepartmentMetric } from "../types";

interface BIBranchDepartmentSectionProps {
  tbi: Record<string, string>;
  branchMetrics: any[];
  chartBranchData: any[];
  selectedCurrency: string;
  formatCurrencyValue: (val: number) => string;
  formatValueDirectly: (val: number) => string;
  enrichedDepartmentMetrics: EnrichedDepartmentMetric[];
  selectedDeptId: string;
  radarActiveMetric: RadarMetricType;
  setRadarActiveMetric: (metric: RadarMetricType) => void;
  setSelectedDeptForExpenseModal: (dept: EnrichedDepartmentMetric) => void;
}

const CustomRadarTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-950/95 border border-slate-800 p-2.5 rounded-lg shadow-xl font-sans text-xs backdrop-blur-md flex flex-col gap-1 z-50">
        <p className="font-bold text-slate-100 border-b border-slate-850 pb-1">{data.departmentName}</p>
        <p className="text-purple-400 font-mono flex items-center justify-between gap-4">
          <span>Productivité:</span>
          <span className="font-bold">{data.productivityScore}%</span>
        </p>
        <p className="text-cyan-400 font-mono flex items-center justify-between gap-4">
          <span>Assiduité:</span>
          <span className="font-bold">{data.attendanceRate}%</span>
        </p>
      </div>
    );
  }
  return null;
};

export const BIBranchDepartmentSection: React.FC<BIBranchDepartmentSectionProps> = ({
  tbi,
  branchMetrics,
  chartBranchData,
  selectedCurrency,
  formatCurrencyValue,
  formatValueDirectly,
  enrichedDepartmentMetrics,
  selectedDeptId,
  radarActiveMetric,
  setRadarActiveMetric,
  setSelectedDeptForExpenseModal,
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="branches-departments-analytics-row">
      {/* Branch metrics compare card */}
      <div className="lg:col-span-7 flex flex-col gap-3.5" id="branches-perf-col">
        <h3 className="text-xs uppercase font-extrabold text-slate-400 tracking-wider flex items-center gap-1.5">
          <span className="w-1.5 h-3.5 bg-cyan-500 rounded-sm"></span>
          {tbi.branchPerformance}
        </h3>

        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 shadow hover:border-slate-700/50 transition-all duration-300" id="branch-comparison-box">
          <span className="text-[10.5px] text-slate-300 font-bold tracking-tight">{tbi.comparison}</span>

          {/* Heatmap Grid Profitability */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" id="branch-profitability-heatmap">
            {branchMetrics.map((bm, _i) => (
              <div
                key={`${bm.branchId}-${_i}`}
                className={`p-3 rounded-lg border flex justify-between items-center transition hover:bg-slate-900/45 ${
                  bm.profit > 200000
                    ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
                    : "bg-cyan-500/5 border-cyan-500/20 text-cyan-300"
                }`}
                id={`heatmap-cell-${bm.branchId}`}
              >
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-100">{bm.branchName}</span>
                  <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                    {bm.employeeCount} {tbi.activeStaff.toLowerCase()} | {bm.attendanceRate}% {tbi.attendanceRate.toLowerCase()}
                  </span>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xs font-black">{formatCurrencyValue(bm.profit || 0)}</div>
                  <div className="text-[8px] uppercase tracking-widest text-slate-400">{tbi.netProfit}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Recharts compare bars */}
          <div className="w-full h-56 mt-1" id="branch-perf-bars-box">
            <SafeChartContainer height="100%" minHeight={224}>
              <BarChart data={chartBranchData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="branchName" stroke="var(--chart-text)" fontSize={10} tickLine={false} />
                <YAxis stroke="var(--chart-text)" fontSize={9} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-slate-950/95 border border-slate-800 p-2.5 rounded-lg shadow-xl font-sans text-[11px] backdrop-blur-md flex flex-col gap-1 min-w-[150px]">
                          <p className="font-extrabold text-slate-200 font-mono border-b border-slate-800 pb-1 mb-1">{label}</p>
                          <p className="text-cyan-400 font-mono font-bold flex justify-between gap-3">
                            <span>Recettes:</span>
                            <span>+{formatValueDirectly(Number(payload[0]?.value || 0))}</span>
                          </p>
                          <p className="text-rose-400 font-mono font-bold flex justify-between gap-3 border-b border-slate-850 pb-1">
                            <span>Dépenses:</span>
                            <span>-{formatValueDirectly(Number(payload[1]?.value || 0))}</span>
                          </p>
                          <p className="text-emerald-400 font-mono font-bold flex justify-between gap-3 pt-1">
                            <span>Solde net:</span>
                            <span>{formatValueDirectly(Number(payload[2]?.value || 0))}</span>
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "10px" }} />
                <Bar dataKey="revenue" name={`Recettes (${selectedCurrency || "HTG"})`} fill="#06b6d4" />
                <Bar dataKey="expenses" name={`Dépenses (${selectedCurrency || "HTG"})`} fill="#f43f5e" />
                <Bar dataKey="netProfit" name={`Nêt (${selectedCurrency || "HTG"})`} fill="#10b981" />
              </BarChart>
            </SafeChartContainer>
          </div>
        </div>
      </div>

      {/* Department performance radar or charts list */}
      <div className="lg:col-span-5 flex flex-col gap-3.5" id="dept-perf-col">
        <h3 className="text-xs uppercase font-extrabold text-slate-400 tracking-wider flex items-center gap-1.5">
          <span className="w-1.5 h-3.5 bg-cyan-500 rounded-sm"></span>
          {tbi.departmentPerformance}
        </h3>

        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 shadow h-full justify-between relative overflow-hidden group hover:border-cyan-500/10 transition-all duration-300" id="dept-stats-box">
          <div className="flex justify-between items-center bg-slate-950/40 p-2.5 rounded-lg border border-slate-800">
            <span className="text-xs text-slate-200 font-semibold tracking-tight">
              {tbi.departmentPerformance}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {enrichedDepartmentMetrics.filter((dm) => dm.employeeCount > 0 || selectedDeptId === "ALL").length} Départements
            </span>
          </div>

          {/* Interactive Toggle for Metrics */}
          <div className="flex items-center justify-between gap-1.5 p-1 bg-slate-950/60 rounded-lg border border-slate-850 text-[10px] font-mono" id="radar-metric-selectors">
            <span className="text-[9px] text-slate-500 font-sans uppercase font-bold pl-1.5">Filtre Radar:</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRadarActiveMetric("ALL")}
                className={`px-2 py-0.5 rounded text-[9.5px] transition-all cursor-pointer font-bold ${
                  radarActiveMetric === "ALL"
                    ? "bg-slate-800 text-slate-100 border border-slate-750"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent"
                }`}
              >
                Tous
              </button>
              <button
                type="button"
                onClick={() => setRadarActiveMetric("PRODUCTIVITY")}
                className={`px-2 py-0.5 rounded text-[9.5px] transition-all cursor-pointer font-bold flex items-center gap-1 ${
                  radarActiveMetric === "PRODUCTIVITY"
                    ? "bg-indigo-950/40 text-indigo-300 border border-indigo-500/30"
                    : "text-slate-400 hover:text-indigo-400 hover:bg-indigo-950/10 border border-transparent"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                Productivité
              </button>
              <button
                type="button"
                onClick={() => setRadarActiveMetric("ATTENDANCE")}
                className={`px-2 py-0.5 rounded text-[9.5px] transition-all cursor-pointer font-bold flex items-center gap-1 ${
                  radarActiveMetric === "ATTENDANCE"
                    ? "bg-cyan-950/40 text-cyan-300 border border-cyan-500/30"
                    : "text-slate-400 hover:text-cyan-400 hover:bg-cyan-950/10 border border-transparent"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
                Assiduité
              </button>
            </div>
          </div>

          {/* Radar layout / custom metrics list */}
          <div className="w-full h-44 flex items-center justify-center font-mono" id="dept-radar-container">
            <SafeChartContainer height="100%" minHeight={176}>
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={enrichedDepartmentMetrics.filter((dm) => dm.employeeCount > 0 || selectedDeptId === "ALL")}>
                <PolarGrid stroke="var(--chart-grid)" />
                <PolarAngleAxis dataKey="departmentName" stroke="var(--chart-text)" fontSize={8.5} />
                <PolarRadiusAxis stroke="var(--chart-text)" fontSize={7.5} domain={[0, 100]} />
                <Tooltip content={<CustomRadarTooltip />} />
                <Legend iconSize={7} wrapperStyle={{ fontSize: 9, paddingTop: 2 }} />
                {(radarActiveMetric === "ALL" || radarActiveMetric === "PRODUCTIVITY") && (
                  <Radar name="Productivité %" dataKey="productivityScore" stroke="#7c3aed" fill="#8b5cf6" fillOpacity={radarActiveMetric === "PRODUCTIVITY" ? 0.35 : 0.15} activeDot={{ r: 4 }} />
                )}
                {(radarActiveMetric === "ALL" || radarActiveMetric === "ATTENDANCE") && (
                  <Radar name="Présence %" dataKey="attendanceRate" stroke="#06b6d4" fill="#06b6d4" fillOpacity={radarActiveMetric === "ATTENDANCE" ? 0.35 : 0.15} activeDot={{ r: 4 }} />
                )}
              </RadarChart>
            </SafeChartContainer>
          </div>

          {/* Core departments specifications list */}
          <div className="flex flex-col gap-2 font-sans mt-2 max-h-[300px] overflow-y-auto pr-1" id="dept-metrics-list">
            {enrichedDepartmentMetrics
              .filter((dm) => dm.employeeCount > 0 || selectedDeptId === "ALL")
              .map((dm, _i) => (
                <div key={`${dm.departmentId}-${_i}`} className="p-2.5 rounded bg-slate-950/60 border border-slate-850 flex flex-col gap-2 text-xs animate-in fade-in duration-200" id={`dept-cell-${dm.departmentId}`}>
                  <div className="flex justify-between items-center bg-slate-900/50 p-1.5 rounded border border-slate-800">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-100">{dm.departmentName}</span>
                      <span className="text-[9px] text-slate-500 font-mono">Effectif: {dm.employeeCount} membres | {dm.averageHours} hrs/moyenne</span>
                    </div>
                    <div className="text-right font-mono text-[10px]">
                      <span className="text-cyan-400 block font-semibold">{dm.attendanceRate}%</span>
                      <span className="text-[8.5px] text-slate-500 uppercase font-bold">Assiduité</span>
                    </div>
                  </div>

                  {/* Ledger-RH Linkage Ratios */}
                  <div className="grid grid-cols-3 gap-1.5 font-mono text-[9px] pt-1">
                    <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800/40 text-center">
                      <span className="text-slate-500 block uppercase font-semibold text-[8px] tracking-tight">Revenus</span>
                      <span className="text-emerald-400 font-bold">{formatCurrencyValue(dm.revenue || 0)}</span>
                    </div>
                    <div
                      onClick={() => setSelectedDeptForExpenseModal(dm)}
                      className="bg-slate-900/80 hover:bg-slate-900/30 p-1.5 rounded border border-rose-950/20 hover:border-rose-500/30 text-center cursor-pointer transition-all group relative active:scale-95"
                      title="Cliquer pour voir l'origine exacte de ces dépenses (transactions + salaires)"
                    >
                      <span className="text-slate-500 block uppercase font-semibold text-[8px] tracking-tight flex items-center justify-center gap-0.5 group-hover:text-rose-400/90 transition-colors">
                        Dépenses (Ledger)
                        <Info className="w-2.5 h-2.5 text-rose-500/70 group-hover:text-rose-400 group-hover:scale-110 transition-all" />
                      </span>
                      <span className="text-rose-400 font-bold group-hover:text-rose-300">{formatCurrencyValue(dm.expenses || 0)}</span>
                    </div>
                    <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800/40 text-center">
                      <span className="text-slate-500 block uppercase font-semibold text-[8px] tracking-tight">Marge Net RH</span>
                      <span className={dm.margin >= 0 ? "text-cyan-400 font-bold" : "text-amber-500 font-bold"}>
                        {dm.margin >= 0 ? "+" : ""}{dm.margin}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};
