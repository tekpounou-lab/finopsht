import React from "react";
import {
  DollarSign,
  Users,
  Clock,
  TrendingUp,
  Activity,
  Sparkles,
  Award,
  AlertCircle,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { SimplifiedMetrics } from "../../domains/performance/types";

interface PICSimplifiedViewProps {
  metrics: SimplifiedMetrics;
  onResetFilters: () => void;
}

export const PICSimplifiedView: React.FC<PICSimplifiedViewProps> = ({
  metrics,
}) => {
  const chartData = [
    { name: "Chiffre d'Affaires", amount: metrics.totalRevenue, color: "#10b981" },
    { name: "Masse Salariale", amount: metrics.totalPayroll, color: "#6366f1" },
    { name: "Dépenses Opérationnelles", amount: metrics.totalExpenses, color: "#f43f5e" },
  ];

  return (
    <div className="space-y-6" id="pic-simplified-container">
      {/* Top 4 Core Strategic KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="pic-simplified-kpi-grid">
        {/* 1. Masse Salariale */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden" id="kpi-card-payroll">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Masse Salariale</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-100">
              {metrics.totalPayroll.toLocaleString()} <span className="text-xs font-normal text-slate-400">HTG</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
              <span className="text-indigo-300 font-medium">+{metrics.totalCommissions.toLocaleString()} HTG</span>
              <span>commissions</span>
            </div>
          </div>
        </div>

        {/* 2. Effectifs & Turnover */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden" id="kpi-card-workforce">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Effectifs Actifs</span>
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-100">
              {metrics.activeHeadcount} <span className="text-xs font-normal text-slate-400">collaborateurs</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-slate-400">Turnover :</span>
              <span className={`font-semibold ${metrics.turnoverRate > 15 ? "text-amber-400" : "text-emerald-400"}`}>
                {metrics.turnoverRate}%
              </span>
            </div>
          </div>
        </div>

        {/* 3. Taux de Présence & Heures */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden" id="kpi-card-attendance">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Taux de Présence</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-100">
              {metrics.attendanceRate}%
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
              <span className="text-emerald-400 font-medium">{metrics.averageHoursWorked}h / j</span>
              <span>moyenne</span>
            </div>
          </div>
        </div>

        {/* 4. CA & Marge Nette */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden" id="kpi-card-revenue">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Marge Nette</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className={`text-2xl font-bold ${metrics.netProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {metrics.profitMargin}%
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
              <span>Bénéfice :</span>
              <span className={`font-semibold ${metrics.netProfit >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {metrics.netProfit.toLocaleString()} HTG
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Overview Chart & Strategic Diagnostics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Financial Equilibrium Bar Chart */}
        <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg" id="pic-financial-equilibrium-chart">
          <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            Équilibre Financier & Masse Salariale
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "0.75rem" }}
                  formatter={(val: number) => [`${val.toLocaleString()} HTG`, "Montant"]}
                />
                <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Strategic Diagnosis */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between" id="pic-ai-strategic-card">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm mb-3">
              <Sparkles className="w-4 h-4" />
              <span>Synthèse Décisionnelle PIC</span>
            </div>
            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                <span className="font-semibold text-indigo-300">Ratio Masse Salariale / CA :</span>{" "}
                {metrics.totalRevenue > 0
                  ? `${Math.round((metrics.totalPayroll / metrics.totalRevenue) * 100)}%`
                  : "N/A"}{" "}
                (Seuil cible : &lt; 40%).
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                <span className="font-semibold text-emerald-300">Stabilité Opérationnelle :</span> Taux d'assiduité de{" "}
                {metrics.attendanceRate}% avec un turnover contenu à {metrics.turnoverRate}%.
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Données agrégées en temps réel</span>
            <Award className="w-4 h-4 text-amber-400" />
          </div>
        </div>
      </div>
    </div>
  );
};
