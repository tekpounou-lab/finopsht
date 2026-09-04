import React from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from "recharts";
import { SafeChartContainer } from "../../ui/SafeChartContainer";

const COLORS = ["#06b6d4", "#f43f5e", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#3b82f6"];

interface BICostCenterTabProps {
  tbi: Record<string, string>;
  cashflowTimeline: any[];
  expenseCategoryChartData: any[];
  totalExpenses: number;
}

export const BICostCenterTab: React.FC<BICostCenterTabProps> = ({
  tbi,
  cashflowTimeline,
  expenseCategoryChartData,
  totalExpenses,
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="graphs-analytics-panel">
      {/* Cashflow timeline & expense category graph */}
      <div className="lg:col-span-8 flex flex-col gap-3.5" id="ledger-financial-graph-col">
        <h3 className="text-xs uppercase font-extrabold text-slate-400 tracking-wider flex items-center gap-1.5">
          <span className="w-1.5 h-3.5 bg-cyan-500 rounded-sm"></span>
          {tbi.financialLedger}
        </h3>

        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 shadow" id="cashflow-timeline-box">
          <span className="text-[10.5px] text-slate-300 font-bold">{tbi.comparativeProfitability}</span>

          <div className="w-full h-56 font-mono" id="timeline-area-canvas">
            <SafeChartContainer height="100%" minHeight={224}>
              <AreaChart data={cashflowTimeline}>
                <defs>
                  <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="date" stroke="var(--chart-text)" fontSize={9} />
                <YAxis stroke="var(--chart-text)" fontSize={9} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-slate-950/95 border border-slate-800 p-2.5 rounded-lg shadow-xl font-sans text-[11px] backdrop-blur-md">
                          <p className="font-extrabold text-slate-200 mb-1 font-mono">{label}</p>
                          <p className="text-cyan-400 font-mono font-bold flex justify-between gap-4">
                            <span>Solde cumulé:</span>
                            <span>{(payload[0]?.value || 0).toLocaleString()} HTG</span>
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="monotone" dataKey="Balance" name="Solde de caisse cumulé" stroke="#06b6d4" fillOpacity={1} fill="url(#colorBalance)" />
              </AreaChart>
            </SafeChartContainer>
          </div>
        </div>
      </div>

      {/* Expense categories pie breakdown */}
      <div className="lg:col-span-4 flex flex-col gap-3.5" id="expense-pie-col">
        <h3 className="text-xs uppercase font-extrabold text-slate-400 tracking-wider flex items-center gap-1.5">
          <span className="w-1.5 h-3.5 bg-cyan-500 rounded-sm"></span>
          Répartition des Dépenses Catégorielles
        </h3>

        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 shadow h-full justify-between" id="expense-pie-container">
          <span className="text-[10.5px] text-slate-300 font-bold tracking-tight">Répartition Financière</span>

          {/* Pie Chart element */}
          <div className="w-full h-44 flex items-center justify-center relative font-mono" id="expense-pie">
            <SafeChartContainer height="100%" minHeight={176}>
              <PieChart>
                <Pie
                  data={expenseCategoryChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={65}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {expenseCategoryChartData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      const percentage = totalExpenses > 0 ? ((data.value / totalExpenses) * 100).toFixed(1) : "0";
                      return (
                        <div className="bg-slate-950/95 border border-slate-800 p-2.5 rounded-lg shadow-xl font-sans text-[11px] backdrop-blur-md flex flex-col gap-1 min-w-[140px]">
                          <p className="font-extrabold text-slate-200 font-mono border-b border-slate-800 pb-1 mb-1">{data.name}</p>
                          <p className="text-rose-400 font-mono font-bold flex justify-between gap-3">
                            <span>Total:</span>
                            <span>{(data.value || 0).toLocaleString()} HTG</span>
                          </p>
                          <p className="text-slate-400 font-mono text-[9px] flex justify-between gap-3">
                            <span>Part:</span>
                            <span>{percentage}%</span>
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </SafeChartContainer>
            <div className="absolute text-center mt-[-8px]">
              <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-tight">Dépenses</span>
              <span className="text-xs font-mono font-black text-slate-200">En HTG</span>
            </div>
          </div>

          {/* Legend indicators */}
          <div className="flex flex-col gap-1 text-[11px] font-sans" id="pie-custom-legends">
            {expenseCategoryChartData.slice(0, 4).map((entry, index) => (
              <div key={index} className="flex justify-between items-center py-0.5 border-b border-slate-850/20" id={`pie-leg-${index}`}>
                <span className="flex items-center gap-1 text-slate-400 text-[10px]">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                  {entry.name}
                </span>
                <span className="font-mono text-slate-300 font-bold">{(entry.value || 0).toLocaleString()} HTG</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
