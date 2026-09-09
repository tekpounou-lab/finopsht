import React, { useEffect } from "react";
import { Wallet, TrendingUp } from "lucide-react";
import { AnalyticsSnapshot } from "../../domains/analytics/types";

interface ExecutiveTreasuryProps {
  snapshot: AnalyticsSnapshot | null;
}

export const ExecutiveTreasury: React.FC<ExecutiveTreasuryProps> = ({ snapshot }) => {
  useEffect(() => {
    console.log("[EXECUTIVE_TREASURY] Active Snapshot SSOT loaded:", {
      cashOnHand: snapshot?.cashOnHand?.currentValue,
      burnRate: snapshot?.burnRate?.currentValue,
      revenue: snapshot?.revenue?.currentValue,
      expenses: snapshot?.expenses?.currentValue,
    });
  }, [snapshot]);

  const cashVal = snapshot?.cashOnHand?.currentValue || 0;
  const dailyBurn = snapshot?.burnRate?.currentValue || 0;
  const monthlyBurn = Math.round(dailyBurn * 30);
  const runwayDays = dailyBurn > 0 ? Math.round(cashVal / dailyBurn) : cashVal > 0 ? 999 : 0;
  const revVal = snapshot?.revenue?.currentValue || 0;
  const expVal = snapshot?.expenses?.currentValue || 0;
  const netPeriodCashFlow = revVal - expVal;

  return (
    <div className="bg-slate-900/70 border border-slate-800/80 hover:border-cyan-500/40 transition-colors p-5 rounded-2xl flex flex-col justify-between shadow-lg relative overflow-hidden">
      <div>
        <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider mb-3 font-mono">
          <span>Trésorerie & Runways</span>
          <Wallet className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-black font-mono text-slate-50">
            {cashVal.toLocaleString()}
          </span>
          <span className="text-[10px] text-slate-400 font-bold uppercase">HTG</span>
        </div>
        <div className="text-cyan-400 font-semibold text-[11px] mt-1 font-mono flex items-center gap-1">
          <TrendingUp className="w-3 h-3" /> Runway :{" "}
          <strong>{runwayDays >= 999 ? "Couverture totale" : `${runwayDays} jours`}</strong>
        </div>

        <div className="space-y-2 mt-4 text-[11px] text-slate-400 border-t border-slate-800/80 pt-3">
          <div className="flex justify-between">
            <span>Flux net sur la période :</span>
            <span
              className={`font-mono font-semibold ${
                netPeriodCashFlow >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {netPeriodCashFlow >= 0 ? "+" : ""}
              {netPeriodCashFlow.toLocaleString()} HTG
            </span>
          </div>
          <div className="flex justify-between">
            <span>Burn Rate mensuel estimé :</span>
            <span className="text-slate-200 font-mono">{monthlyBurn.toLocaleString()} HTG</span>
          </div>
          <div className="flex justify-between">
            <span>Indice de solvabilité :</span>
            <span
              className={`font-mono font-bold text-[10px] uppercase px-1.5 py-0.5 rounded ${
                cashVal >= monthlyBurn * 3
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : cashVal >= monthlyBurn
                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                  : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
              }`}
            >
              {cashVal >= monthlyBurn * 3
                ? "Haute Couverture"
                : cashVal >= monthlyBurn
                ? "Standard"
                : "Réserve Faible"}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-4 bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/60 text-[10px] text-slate-400">
        <strong className="text-slate-300">Statut Réserve :</strong> Trésorerie cumulée disponible au terme de la plage sélectionnée.
      </div>
    </div>
  );
};
