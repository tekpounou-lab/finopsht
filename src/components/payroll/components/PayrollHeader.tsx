import React from "react";
import { Landmark, Plus, Scale } from "lucide-react";

export interface PayrollHeaderProps {
  l: {
    engineTitle: string;
    tagline: string;
    customCycle: string;
    complianceOn: string;
    complianceOff: string;
  };
  onOpenCreateCycle: () => void;
  enableSocialTaxes: boolean;
  onToggleSocialTaxes: () => void;
  activeCycleId: string;
  onSelectCycleId: (id: string) => void;
  tenantCycles: Array<{ id: string; cycleName: string; status: string }>;
}

export const PayrollHeader: React.FC<PayrollHeaderProps> = ({
  l,
  onOpenCreateCycle,
  enableSocialTaxes,
  onToggleSocialTaxes,
  activeCycleId,
  onSelectCycleId,
  tenantCycles
}) => {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 glass p-4 sm:p-6 rounded-2xl border border-slate-800/60" id="payroll-brand">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
          <Landmark className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h2 className="font-sans font-bold text-lg text-slate-100 leading-tight">
            {l.engineTitle}
          </h2>
          <p className="text-[10px] sm:text-xs text-slate-400 font-light mt-0.5">{l.tagline}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:gap-4 w-full lg:w-auto" id="payroll-switches">
        <div className="flex gap-2 w-full xs:w-auto">
          {/* Custom Cycle instanter button */}
          <button
            id="btn-trigger-cycle-create"
            onClick={onOpenCreateCycle}
            className="flex-1 xs:flex-none px-3 py-2 rounded-lg bg-cyan-900/35 hover:bg-cyan-850 border border-cyan-700/50 text-cyan-300 font-bold text-[10px] sm:text-xs select-none cursor-pointer transition flex items-center justify-center gap-1.5 active:scale-95 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            {l.customCycle}
          </button>

          {/* Compliance Switcher toggle */}
          <button
            id="btn-social-tax-toggle"
            onClick={onToggleSocialTaxes}
            className={`flex-1 xs:flex-none px-3 py-2 rounded-lg font-bold text-[10px] sm:text-xs cursor-pointer border transition flex items-center justify-center gap-1.5 active:scale-95 shadow-sm ${
              enableSocialTaxes 
                ? "bg-indigo-500/10 border-indigo-500/40 text-indigo-400" 
                : "bg-slate-950 border-slate-800 text-slate-500"
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">{enableSocialTaxes ? l.complianceOn : l.complianceOff}</span>
            <span className="xs:hidden">Taxes: {enableSocialTaxes ? "ON" : "OFF"}</span>
          </button>
        </div>

        {/* Active Cycle Selector */}
        <div className="flex-1 xs:flex-none flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200">
          <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest hidden xs:inline">Quinzaine</span>
          <select
            id="cycle-active-select"
            value={activeCycleId}
            onChange={(e) => onSelectCycleId(e.target.value)}
            className="w-full bg-transparent border-none text-slate-200 outline-none text-xs font-bold cursor-pointer"
          >
            {tenantCycles.map((cyc) => (
              <option key={cyc.id} value={cyc.id} className="bg-slate-950 text-slate-200">
                {cyc.cycleName} ({cyc.status})
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
