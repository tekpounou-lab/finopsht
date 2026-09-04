import React, { useState } from "react";
import {
  Building,
  Layers,
  TrendingUp,
  Award,
  Users,
  Grid,
  ChevronDown,
  ArrowUpDown,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ExpertMetrics } from "../../domains/performance/types";

interface PICExpertViewProps {
  metrics: ExpertMetrics;
}

export const PICExpertView: React.FC<PICExpertViewProps> = ({ metrics }) => {
  const [activeTab, setActiveTab] = useState<"departments" | "branches" | "trends" | "matrix" | "rankings">("departments");

  return (
    <div className="space-y-6" id="pic-expert-container">
      {/* Sub-tab navigation for expert view */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto" id="pic-expert-subtabs">
        <button
          type="button"
          onClick={() => setActiveTab("departments")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "departments"
              ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
              : "text-slate-400 hover:text-slate-200"
          }`}
          id="pic-expert-tab-dept"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Analyse Départements ({metrics.departments.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("branches")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "branches"
              ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
              : "text-slate-400 hover:text-slate-200"
          }`}
          id="pic-expert-tab-branch"
        >
          <Building className="w-3.5 h-3.5" />
          <span>Analyse Succursales ({metrics.branches.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("trends")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "trends"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
              : "text-slate-400 hover:text-slate-200"
          }`}
          id="pic-expert-tab-trends"
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Tendances & Courbes</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("matrix")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "matrix"
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
              : "text-slate-400 hover:text-slate-200"
          }`}
          id="pic-expert-tab-matrix"
        >
          <Grid className="w-3.5 h-3.5" />
          <span>Tableau Croisé (Dept × Branch)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("rankings")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "rankings"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
              : "text-slate-400 hover:text-slate-200"
          }`}
          id="pic-expert-tab-rankings"
        >
          <Award className="w-3.5 h-3.5" />
          <span>Palmarès Collaborateurs ({metrics.employeeRankings.length})</span>
        </button>
      </div>

      {/* 1. DEPARTMENTS VIEW */}
      {activeTab === "departments" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="pic-expert-dept-section">
          {/* Department Bar Chart */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              Chiffre d'Affaires vs Masse Salariale par Département
            </h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.departments} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="departmentName" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "0.75rem" }}
                    formatter={(val: number) => [`${val.toLocaleString()} HTG`]}
                  />
                  <Bar dataKey="revenue" fill="#10b981" name="Revenus" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="payroll" fill="#6366f1" name="Masse Salariale" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Department Table List */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg overflow-x-auto">
            <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-400" />
              Répartition Détaillée par Département
            </h3>
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="pb-2">Département</th>
                  <th className="pb-2 text-right">Effectifs</th>
                  <th className="pb-2 text-right">Masse Salariale</th>
                  <th className="pb-2 text-right">Marge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {metrics.departments.map((d) => (
                  <tr key={d.departmentId} className="hover:bg-slate-800/40">
                    <td className="py-2.5 font-medium text-slate-200">{d.departmentName}</td>
                    <td className="py-2.5 text-right">{d.headcount}</td>
                    <td className="py-2.5 text-right font-mono">{d.payroll.toLocaleString()} HTG</td>
                    <td className={`py-2.5 text-right font-semibold ${d.netMargin >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {d.netMargin}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. BRANCHES VIEW */}
      {activeTab === "branches" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" id="pic-expert-branch-section">
          {metrics.branches.map((b) => (
            <div key={b.branchId} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-100">{b.branchName}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  Score : {b.efficiencyScore}/100
                </span>
              </div>
              <div className="mt-4 space-y-2 text-xs text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Collaborateurs :</span>
                  <span className="font-semibold text-slate-200">{b.headcount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Masse Salariale :</span>
                  <span className="font-mono text-slate-200">{b.payroll.toLocaleString()} HTG</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Chiffre d'Affaires :</span>
                  <span className="font-mono text-emerald-400">{b.revenue.toLocaleString()} HTG</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Taux d'assiduité :</span>
                  <span className="font-semibold text-cyan-300">{b.attendanceRate}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3. TRENDS VIEW */}
      {activeTab === "trends" && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg" id="pic-expert-trends-section">
          <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            Évolution Chronologique (Masse Salariale vs Revenus)
          </h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.trends} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorPay" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="label" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "0.75rem" }} />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorRev)" name="Revenus" />
                <Area type="monotone" dataKey="payroll" stroke="#6366f1" fillOpacity={1} fill="url(#colorPay)" name="Masse Salariale" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 4. CROSS-TABLE MATRIX VIEW */}
      {activeTab === "matrix" && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg overflow-x-auto" id="pic-expert-matrix-section">
          <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Grid className="w-4 h-4 text-emerald-400" />
            Tableau Croisé Dynamique : Département × Succursale
          </h3>
          <table className="w-full text-left text-xs">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="pb-2">Département</th>
                <th className="pb-2">Succursale</th>
                <th className="pb-2 text-right">Effectifs</th>
                <th className="pb-2 text-right">Masse Salariale</th>
                <th className="pb-2 text-right">Revenus Estimés</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {metrics.crossTableMatrix.map((cell, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40">
                  <td className="py-2.5 font-medium text-slate-200">{cell.departmentName}</td>
                  <td className="py-2.5 text-slate-400">{cell.branchName}</td>
                  <td className="py-2.5 text-right">{cell.headcount}</td>
                  <td className="py-2.5 text-right font-mono">{cell.payroll.toLocaleString()} HTG</td>
                  <td className="py-2.5 text-right font-mono text-emerald-400">{cell.revenue.toLocaleString()} HTG</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. EMPLOYEE RANKINGS VIEW */}
      {activeTab === "rankings" && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg overflow-x-auto" id="pic-expert-rankings-section">
          <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            Classement de la Performance Individuelle
          </h3>
          <table className="w-full text-left text-xs">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="pb-2">Rang</th>
                <th className="pb-2">Collaborateur</th>
                <th className="pb-2">Département</th>
                <th className="pb-2">Succursale</th>
                <th className="pb-2 text-right">Score Productivité</th>
                <th className="pb-2 text-right">Volume Ventes</th>
                <th className="pb-2 text-right">Commissions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {metrics.employeeRankings.map((emp) => (
                <tr key={emp.employeeId} className="hover:bg-slate-800/40">
                  <td className="py-2.5 font-bold text-amber-400">#{emp.rank}</td>
                  <td className="py-2.5 font-medium text-slate-200">{emp.employeeName}</td>
                  <td className="py-2.5 text-slate-400">{emp.departmentName}</td>
                  <td className="py-2.5 text-slate-400">{emp.branchName}</td>
                  <td className="py-2.5 text-right font-semibold text-cyan-300">{emp.productivityIndex}/100</td>
                  <td className="py-2.5 text-right font-mono">{emp.salesVolume.toLocaleString()} HTG</td>
                  <td className="py-2.5 text-right font-mono text-emerald-400">+{emp.commission.toLocaleString()} HTG</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
