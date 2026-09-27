import React from "react";
import { Wallet, TrendingUp } from "lucide-react";
import { AnalyticsSnapshot } from "../../domains/analytics/types";
import { useLoggedSnapshot, getSnapshotSemanticSignature } from "../../hooks/useLoggedSnapshot";

interface ExecutiveTreasuryProps {
  snapshot: AnalyticsSnapshot | null;
}

import { useExecutiveFilters } from "../../domains/analytics/context/ExecutiveFilterContext";

const ExecutiveTreasuryComponent: React.FC<ExecutiveTreasuryProps> = ({ snapshot }) => {
  const { stabilizedSnapshot } = useLoggedSnapshot("EXECUTIVE_TREASURY", snapshot);
  const { filters } = useExecutiveFilters();

  const isCashBasis = filters.accountingMode === "CASH";

  const cashVal = stabilizedSnapshot?.cashOnHand?.currentValue || 0;
  const dailyBurn = stabilizedSnapshot?.burnRate?.currentValue || 0;
  const monthlyBurn = Math.round(dailyBurn * 30);
  const runwayDays = dailyBurn > 0 ? Math.round(cashVal / dailyBurn) : cashVal > 0 ? 999 : 0;

  // Retrieve canonical Net Profit and Net Cash Flow from the SSOT snapshot
  const netProfit = stabilizedSnapshot?.profit?.currentValue ?? 0;
  const netCashFlow = stabilizedSnapshot?.netCashFlow?.currentValue ?? 0;

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

        <div className="space-y-3 mt-4 text-[11px] text-slate-400 border-t border-slate-800/80 pt-3">
          {/* Section 8: Show Bénéfice Net (Accrual/Economic) */}
          <div className="flex justify-between items-center py-0.5">
            <span className="flex flex-col">
              <span className="font-semibold text-slate-300">Bénéfice Net :</span>
              <span className="text-[9px] text-slate-500 font-sans">
                {isCashBasis ? "Caisse (Revenus encaissés − Décaissements)" : "Engagement (Chiffre d'affaires − Charges)"}
              </span>
            </span>
            <span
              className={`font-mono font-bold ${
                netProfit >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {netProfit >= 0 ? "+" : ""}
              {netProfit.toLocaleString()} HTG
            </span>
          </div>

          {/* Section 8: Show Flux Net de Trésorerie (Treasury Cash Flow) */}
          <div className="flex justify-between items-center py-0.5 border-t border-slate-800/40 pt-1.5">
            <span className="flex flex-col">
              <span className="font-semibold text-slate-300">Flux Net de Trésorerie :</span>
              <span className="text-[9px] text-slate-500 font-sans">Variation réelle de caisse (Inflows − Outflows)</span>
            </span>
            <span
              className={`font-mono font-bold ${
                netCashFlow >= 0 ? "text-cyan-400" : "text-rose-400"
              }`}
            >
              {netCashFlow >= 0 ? "+" : ""}
              {netCashFlow.toLocaleString()} HTG
            </span>
          </div>

          <div className="flex justify-between items-center py-0.5 border-t border-slate-800/40 pt-1.5">
            <span>Burn Rate mensuel estimé :</span>
            <span className="text-slate-200 font-mono">{monthlyBurn.toLocaleString()} HTG</span>
          </div>
          <div className="flex justify-between items-center py-0.5">
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

export const ExecutiveTreasury = React.memo(
  ExecutiveTreasuryComponent,
  (prev, next) => getSnapshotSemanticSignature(prev.snapshot) === getSnapshotSemanticSignature(next.snapshot)
);
