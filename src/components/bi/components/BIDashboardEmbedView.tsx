import React from "react";
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { SafeChartContainer } from "../../ui/SafeChartContainer";
import { Activity } from "lucide-react";

interface BIDashboardEmbedViewProps {
  isLoading?: boolean;
  dashboardChartData: any[];
  language: string;
}

export const BIDashboardEmbedView: React.FC<BIDashboardEmbedViewProps> = ({
  isLoading,
  dashboardChartData,
  language,
}) => {
  if (isLoading) {
    return (
      <div className="w-full h-[220px] bg-slate-900/10 border border-slate-800 rounded-xl flex items-center justify-center animate-pulse">
        <div className="flex flex-col items-center gap-2 font-mono text-[10px] text-slate-500">
          <Activity className="w-6 h-6 text-cyan-500 animate-spin" />
          <span>Chargement des flux financiers en cours...</span>
        </div>
      </div>
    );
  }

  if (dashboardChartData.length === 0) {
    return (
      <div className="w-full h-[220px] bg-slate-900/10 border border-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-500 font-mono text-xs text-center p-4">
        <Activity className="w-8 h-8 text-slate-700 mb-2" />
        <span className="font-bold text-slate-400">Aucune donnée financière disponible</span>
        <p className="text-[10px] text-slate-600 mt-1 max-w-xs leading-relaxed">
          Aucun mouvement n'a été enregistré dans le Grand Livre ou la paie de l'entreprise pour cette période.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-[220px] relative" id="dashboard-financials-chart">
      <SafeChartContainer height="100%" minHeight={220}>
        <AreaChart data={dashboardChartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <defs>
            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.01} />
            </linearGradient>
            <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.01} />
            </linearGradient>
            <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
          <XAxis
            dataKey="date"
            stroke="#94a3b8"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            dy={10}
          />
          <YAxis
            stroke="#94a3b8"
            fontSize={9}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-slate-950/90 border border-slate-800 p-2.5 rounded-lg shadow-xl font-sans text-[11px] backdrop-blur-md">
                    <p className="font-extrabold text-slate-200 mb-1.5 font-mono">{label}</p>
                    <div className="flex flex-col gap-1 font-mono">
                      <p className="text-cyan-400 flex justify-between gap-4">
                        <span>{language === "fr" ? "Recettes:" : language === "ht" ? "Revni:" : "Revenue:"}</span>
                        <span className="font-bold">+{(payload[0]?.value || 0).toLocaleString()} HTG</span>
                      </p>
                      <p className="text-rose-400 flex justify-between gap-4 border-b border-slate-800/60 pb-1">
                        <span>{language === "fr" ? "Dépenses:" : language === "ht" ? "Depans:" : "Expenses:"}</span>
                        <span className="font-bold">-{(payload[1]?.value || 0).toLocaleString()} HTG</span>
                      </p>
                      <p className="text-emerald-400 flex justify-between gap-4 pt-1 font-bold">
                        <span>{language === "fr" ? "Bénéfice Net:" : language === "ht" ? "ProfNet:" : "Net Profit:"}</span>
                        <span>{(payload[2]?.value || 0).toLocaleString()} HTG</span>
                      </p>
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#06b6d4"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorRevenue)"
            name={language === "fr" ? "Recettes" : language === "ht" ? "Revni" : "Revenue"}
          />
          <Area
            type="monotone"
            dataKey="expenses"
            stroke="#f43f5e"
            strokeWidth={1.5}
            fillOpacity={1}
            fill="url(#colorExpenses)"
            name={language === "fr" ? "Dépenses" : language === "ht" ? "Depans" : "Expenses"}
          />
          <Area
            type="monotone"
            dataKey="net"
            stroke="#10b981"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#colorNet)"
            name={language === "fr" ? "Bénéfice Net" : language === "ht" ? "ProfNet" : "Net Profit"}
          />
        </AreaChart>
      </SafeChartContainer>
    </div>
  );
};
