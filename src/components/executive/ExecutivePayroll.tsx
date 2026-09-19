import React from "react";
import { Wallet, AlertTriangle } from "lucide-react";
import { AnalyticsSnapshot } from "../../domains/analytics/types";
import { useLoggedSnapshot, getSnapshotSemanticSignature } from "../../hooks/useLoggedSnapshot";

interface ExecutivePayrollProps {
  snapshot: AnalyticsSnapshot | null;
  isSocialTaxEnabled?: boolean;
}

const ExecutivePayrollComponent: React.FC<ExecutivePayrollProps> = ({
  snapshot,
  isSocialTaxEnabled = false,
}) => {
  const { stabilizedSnapshot } = useLoggedSnapshot("EXECUTIVE_PAYROLL", snapshot);

  const payrollVal = stabilizedSnapshot?.payrollCost?.currentValue || 0;
  const revVal = stabilizedSnapshot?.revenue?.currentValue || 0;
  const payrollRatio = revVal > 0 ? Math.min(100, Math.round((payrollVal / revVal) * 100)) : 0;
  const commissions = stabilizedSnapshot?.commissionsPaid?.currentValue || 0;
  const basePayroll = Math.max(0, payrollVal - commissions);
  const advances = stabilizedSnapshot?.advanceExposure?.currentValue || 0;

  return (
    <div className="bg-slate-900/70 border border-slate-800/80 hover:border-amber-500/40 transition-colors p-5 rounded-2xl flex flex-col justify-between shadow-lg relative overflow-hidden">
      <div>
        <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider mb-3 font-mono">
          <span>Masse Salariale Engagée</span>
          <Wallet className="w-4 h-4 text-amber-500" />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-black font-mono text-slate-50">
            {payrollVal.toLocaleString()}
          </span>
          <span className="text-[10px] text-slate-400 font-bold uppercase">HTG</span>
        </div>
        <div className="text-amber-400 font-semibold text-[11px] mt-1 font-mono flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Ratio Paie / Revenu : <strong>{payrollRatio}%</strong>
        </div>

        <div className="space-y-2 mt-4 text-[11px] text-slate-400 border-t border-slate-800/80 pt-3">
          <div className="flex justify-between">
            <span>Commissions & Primes :</span>
            <span className="text-slate-200 font-mono">{commissions.toLocaleString()} HTG</span>
          </div>
          <div className="flex justify-between">
            <span>Masse salariale de base :</span>
            <span className="text-slate-200 font-mono">{basePayroll.toLocaleString()} HTG</span>
          </div>
          <div className="flex justify-between">
            <span>Avances en cours :</span>
            <span className="text-amber-300 font-mono">{advances.toLocaleString()} HTG</span>
          </div>
        </div>
      </div>
      <div className="mt-4 bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/60 text-[10px] text-slate-400">
        <strong className="text-slate-300">Gestion SSOT :</strong> Intègre salaires bruts validés
        {isSocialTaxEnabled ? ", cotisations patronales" : ""} et primes.
      </div>
    </div>
  );
};

export const ExecutivePayroll = React.memo(
  ExecutivePayrollComponent,
  (prev, next) =>
    prev.isSocialTaxEnabled === next.isSocialTaxEnabled &&
    getSnapshotSemanticSignature(prev.snapshot) === getSnapshotSemanticSignature(next.snapshot)
);

