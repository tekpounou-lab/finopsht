import React from "react";
import { Zap, CheckCircle2, Lock, Database } from "lucide-react";

export interface PayrollSummaryCardsProps {
  cycleStatus: string;
  isPaid: boolean;
  totalWages: {
    baseHTG: number;
    commsHTG: number;
    overtimeHTG: number;
    cnssPatronHTG: number;
    netHTG: number;
    totalCompanyExposure: number;
  };
  enableSocialTaxes: boolean;
  totalCostsLabel: string;
}

export const PayrollSummaryCards: React.FC<PayrollSummaryCardsProps> = ({
  cycleStatus,
  isPaid,
  totalWages,
  enableSocialTaxes,
  totalCostsLabel
}) => {
  return (
    <div className="space-y-4" id="payroll-summary-section">
      {/* Dynamic Progress State Indicator Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="cycle-state-tracker">
        <div className={`p-4 rounded-xl border flex items-center gap-3 transition-colors ${
          cycleStatus === "DRAFT" 
            ? "bg-amber-500/10 border-amber-500/40 text-amber-400" 
            : "bg-slate-950 border-slate-900 text-slate-500"
        }`}>
          <Zap className="w-5 h-5 shrink-0" />
          <div>
            <span className="text-[9px] uppercase font-bold block">Phase 1</span>
            <span className="text-xs font-extrabold">Brouillon Dynamique</span>
          </div>
        </div>

        <div className={`p-4 rounded-xl border flex items-center gap-3 transition-colors ${
          cycleStatus === "VALIDATED" 
            ? "bg-blue-500/15 border-blue-500/40 text-blue-400 animate-pulse" 
            : "bg-slate-950 border-slate-900 text-slate-500"
        }`}>
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <div>
            <span className="text-[9px] uppercase font-bold block">Phase 2</span>
            <span className="text-xs font-extrabold">Calcul Validé</span>
          </div>
        </div>

        <div className={`p-4 rounded-xl border flex items-center gap-3 transition-colors ${
          cycleStatus === "LOCKED" 
            ? "bg-rose-500/15 border-rose-500/40 text-rose-400" 
            : "bg-slate-950 border-slate-900 text-slate-500"
        }`}>
          <Lock className="w-5 h-5 shrink-0" />
          <div>
            <span className="text-[9px] uppercase font-bold block">Phase 3</span>
            <span className="text-xs font-extrabold">Signature Immuable</span>
          </div>
        </div>

        <div className={`p-4 rounded-xl border flex items-center gap-3 transition-colors ${
          isPaid 
            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400" 
            : "bg-slate-950 border-slate-900 text-slate-500"
        }`}>
          <Database className="w-5 h-5 shrink-0" />
          <div>
            <span className="text-[9px] uppercase font-bold block">Phase 4</span>
            <span className="text-xs font-extrabold">Fonds décaissés</span>
          </div>
        </div>
      </div>

      {/* Quick Stats banner */}
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4" id="quinzaine-stats-banner">
        <div className="glass p-4 rounded-xl border-l-4 border-cyan-500 shadow-sm transition-all hover:bg-slate-900/60">
          <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Base Salariale</span>
          <div className="font-mono text-lg font-black text-cyan-400 mt-1 leading-none">{totalWages.baseHTG.toLocaleString()} <span className="text-[10px] font-sans text-slate-500">HTG</span></div>
        </div>

        <div className="glass p-4 rounded-xl border-l-4 border-indigo-500 shadow-sm transition-all hover:bg-slate-900/60">
          <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Commissions</span>
          <div className="font-mono text-lg font-black text-indigo-400 mt-1 leading-none">+{totalWages.commsHTG.toLocaleString()} <span className="text-[10px] font-sans text-slate-500">HTG</span></div>
        </div>

        <div className="glass p-4 rounded-xl border-l-4 border-purple-500 shadow-sm transition-all hover:bg-slate-900/60">
          <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Heures Sup.</span>
          <div className="font-mono text-lg font-black text-purple-400 mt-1 leading-none">+{totalWages.overtimeHTG.toLocaleString()} <span className="text-[10px] font-sans text-slate-500">HTG</span></div>
        </div>

        <div className={`glass p-4 rounded-xl border-l-4 shadow-sm transition-all hover:bg-slate-900/60 ${enableSocialTaxes ? "border-emerald-500" : "border-slate-700 opacity-60"}`}>
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Patronal CNSS</span>
            {!enableSocialTaxes && <span className="text-[8px] font-extrabold text-amber-500 uppercase bg-amber-950/40 px-1 rounded">OFF</span>}
          </div>
          <div className="font-mono text-lg font-black text-emerald-400 mt-1 leading-none">{enableSocialTaxes ? `+${totalWages.cnssPatronHTG.toLocaleString()} HTG` : "0 HTG"}</div>
        </div>

        <div className="glass p-4 rounded-xl border-l-4 border-rose-500 shadow-sm transition-all hover:bg-slate-900/60">
          <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Net Distribuable</span>
          <div className="font-mono text-lg font-black text-slate-100 mt-1 leading-none">{totalWages.netHTG.toLocaleString()} <span className="text-[10px] font-sans text-slate-500">HTG</span></div>
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-cyan-950/20 p-4 rounded-xl border-l-4 border-amber-500 shadow-sm transition-all hover:bg-slate-900/60 border border-slate-800/40">
          <span className="text-[9px] text-amber-500 font-black uppercase tracking-widest">{totalCostsLabel}</span>
          <div className="font-mono text-lg font-black text-slate-100 mt-1 leading-none">{totalWages.totalCompanyExposure.toLocaleString()} <span className="text-[10px] font-sans text-slate-500">HTG</span></div>
        </div>
      </div>
    </div>
  );
};
