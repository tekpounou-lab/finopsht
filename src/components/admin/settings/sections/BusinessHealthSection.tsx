import React from "react";
import { Activity, ShieldCheck, FileText, History, BarChart3, TrendingUp, AlertTriangle, CheckCircle2, Zap } from "lucide-react";
import { motion } from "motion/react";

const HEALTH_METRICS = [
  { id: "config", label: "Configuration", score: 85, color: "text-cyan-400", bg: "bg-cyan-500/10", icon: Zap },
  { id: "security", label: "Sécurité", score: 92, color: "text-emerald-400", bg: "bg-emerald-500/10", icon: ShieldCheck },
  { id: "payroll", label: "Paie & Fiscalité", score: 78, color: "text-amber-400", bg: "bg-amber-500/10", icon: FileText },
  { id: "attendance", label: "Temps & Présence", score: 65, color: "text-rose-400", bg: "bg-rose-500/10", icon: History },
  { id: "analytics", label: "Analytics", score: 88, color: "text-blue-400", bg: "bg-blue-500/10", icon: BarChart3 },
];

export default function BusinessHealthSection() {
  const overallScore = Math.round(HEALTH_METRICS.reduce((acc, curr) => acc + curr.score, 0) / HEALTH_METRICS.length);

  return (
    <div className="space-y-10" id="business-health-root">
      {/* Overall Health Card */}
      <div className="relative p-1 rounded-3xl bg-gradient-to-br from-cyan-500/20 via-slate-900 to-blue-500/20">
        <div className="bg-slate-950 rounded-[22px] p-8 flex flex-col md:flex-row items-center gap-10 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-10 opacity-5">
            <Activity className="w-64 h-64 text-cyan-500" />
          </div>

          <div className="relative w-48 h-48 shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle className="text-slate-900" strokeWidth="8" stroke="currentColor" fill="transparent" r="40" cx="50" cy="50" />
              <motion.circle 
                initial={{ strokeDasharray: "0 251" }}
                animate={{ strokeDasharray: `${(overallScore / 100) * 251} 251` }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="text-cyan-500" 
                strokeWidth="8" 
                strokeLinecap="round" 
                stroke="currentColor" 
                fill="transparent" 
                r="40" 
                cx="50" 
                cy="50" 
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl font-black text-slate-100">{overallScore}</span>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Health Score</span>
            </div>
          </div>

          <div className="flex-1 space-y-4 relative z-10 text-center md:text-left">
            <h2 className="text-2xl font-black text-slate-100 uppercase tracking-tight">Santé Globale de l'Entreprise</h2>
            <p className="text-sm text-slate-400 leading-relaxed max-w-xl">
              Votre business affiche une santé robuste. Cependant, l'IA a identifié des <span className="text-cyan-400 font-bold">frictions opérationnelles</span> dans la gestion des temps qui pourraient impacter la rentabilité du prochain cycle de paie.
            </p>
            <div className="flex flex-wrap gap-3 justify-center md:justify-start pt-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                CONFORMITÉ FISCALE OK
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold">
                <AlertTriangle className="w-3.5 h-3.5" />
                OPTIMISATION PRÉSENCE REQUISE
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        {HEALTH_METRICS.map((metric, idx) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            key={metric.id} 
            className="glass rounded-2xl p-6 flex flex-col items-center text-center group hover:border-cyan-500/30 transition-all"
          >
            <div className={`p-4 rounded-2xl ${metric.bg} ${metric.color} mb-4 group-hover:scale-110 transition-transform`}>
              <metric.icon className="w-6 h-6" />
            </div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{metric.label}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-slate-100">{metric.score}</span>
              <span className="text-[10px] font-bold text-slate-600">%</span>
            </div>
            <div className="w-full h-1 bg-slate-900 rounded-full mt-4 overflow-hidden">
              <div className={`h-full ${metric.bg.replace('/10', '')}`} style={{ width: `${metric.score}%` }}></div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Strategic Insights View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-6">
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 px-1">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            Trajectoire Opérationnelle
          </h4>
          <div className="glass rounded-2xl p-6 h-64 flex items-center justify-center">
            <p className="text-xs text-slate-500 italic">Visualisation des tendances de performance (Graphique D3.js)...</p>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 px-1">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Points de Vigilance
          </h4>
          <div className="space-y-3">
            {[
              "Retards excessifs dans le département Logistique (Moyenne +12 min).",
              "Configuration NIF à valider avant la fin du mois.",
              "Renouvellement de l'abonnement dans 12 jours.",
            ].map((msg, i) => (
              <div key={i} className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5 animate-pulse"></div>
                <p className="text-[11px] text-slate-400 leading-relaxed font-medium">{msg}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
