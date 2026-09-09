import React, { useEffect } from "react";
import { AnalyticsSnapshot } from "../../domains/analytics/types";
import { ExecutiveScoreEngine } from "../../domains/analytics/services/ExecutiveScoreEngine";

interface ExecutiveHealthGaugeProps {
  snapshot: AnalyticsSnapshot | null;
}

export const ExecutiveHealthGauge: React.FC<ExecutiveHealthGaugeProps> = ({ snapshot }) => {
  const healthScore = React.useMemo(() => {
    if (!snapshot) return 0;
    if (snapshot.businessHealthScore !== undefined) {
      return snapshot.businessHealthScore;
    }
    const scorecards = ExecutiveScoreEngine.calculateScorecards(snapshot);
    if (!scorecards || scorecards.length === 0) return 0;
    const total = scorecards.reduce((acc, curr) => acc + curr.score, 0);
    return Math.round(total / scorecards.length);
  }, [snapshot]);

  useEffect(() => {
    console.log("[EXECUTIVE_HEALTH_GAUGE] Active Snapshot SSOT loaded:", {
      healthScore,
      revenue: snapshot?.revenue?.currentValue,
      expenses: snapshot?.expenses?.currentValue,
    });
  }, [snapshot, healthScore]);

  const status = React.useMemo(() => {
    if (healthScore >= 80)
      return {
        label: "Excellente",
        color: "text-emerald-400",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/20",
      };
    if (healthScore >= 60)
      return {
        label: "Solide",
        color: "text-cyan-400",
        bg: "bg-cyan-500/10",
        border: "border-cyan-500/20",
      };
    if (healthScore >= 40)
      return {
        label: "Modérée",
        color: "text-amber-400",
        bg: "bg-amber-500/10",
        border: "border-amber-500/20",
      };
    return {
      label: "Critique",
      color: "text-rose-400",
      bg: "bg-rose-500/10",
      border: "border-rose-500/20",
    };
  }, [healthScore]);

  return (
    <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between shadow relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full filter blur-2xl pointer-events-none" />
      <div>
        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2 font-mono">
          Overall Business Health
        </span>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
          Corporate Status Gauge
        </h2>

        {/* SVG Circular Gauge */}
        <div className="flex flex-col items-center justify-center my-4">
          <div className="relative w-28 h-28 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="56"
                cy="56"
                r="48"
                stroke="#1e293b"
                strokeWidth="8"
                fill="transparent"
              />
              <circle
                cx="56"
                cy="56"
                r="48"
                stroke="#10b981"
                strokeWidth="8"
                fill="transparent"
                strokeDasharray={2 * Math.PI * 48}
                strokeDashoffset={2 * Math.PI * 48 * (1 - healthScore / 100)}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-3xl font-black font-mono text-slate-50 tracking-tight">
                {healthScore}%
              </span>
              <span className="text-[8px] uppercase tracking-wider text-slate-500 font-mono font-bold">
                Health Index
              </span>
            </div>
          </div>

          <span
            className={`mt-4 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border uppercase font-mono ${status.bg} ${status.color} ${status.border}`}
          >
            {status.label}
          </span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-800/80">
        <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
          Votre entreprise indique une note de santé globale de{" "}
          <strong>{healthScore}%</strong>. Les dépenses d'exploitation restent maîtrisées et le taux d'assiduité est optimal.
        </p>
      </div>
    </div>
  );
};
