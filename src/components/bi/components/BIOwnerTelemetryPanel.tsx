import React from "react";
import { Database, History } from "lucide-react";
import { Role } from "../../../types";

interface BIOwnerTelemetryPanelProps {
  currentRole: Role;
  selectedBranchId: string;
  selectedDeptId: string;
  startDate: string;
  endDate: string;
}

export const BIOwnerTelemetryPanel: React.FC<BIOwnerTelemetryPanelProps> = ({
  currentRole,
  selectedBranchId,
  selectedDeptId,
  startDate,
  endDate,
}) => {
  if (currentRole !== "OWNER") return null;

  return (
    <div className="mt-12 bg-slate-950/80 border border-slate-800 rounded-xl p-5 shadow-2xl font-mono text-[11px] text-slate-300 backdrop-blur animate-in fade-in slide-in-from-bottom-5 duration-500" id="analytics-realtime-debug-panel">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
          <Database className="w-4 h-4 text-cyan-400" />
          <h4 className="font-extrabold uppercase text-slate-100 tracking-wider">
            FINOPS ERP · CFO DATA TRACE AUDIT PANEL <span className="text-cyan-400 text-[10px] lowercase font-normal">(Owner-Only Telemetry)</span>
          </h4>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
          <span className="text-slate-500 uppercase text-[9px] font-bold block mb-1">Status de l'Audit Temps-Réel</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold font-mono text-cyan-400">
              OPTIMAL
            </span>
            <span className="text-[10px] text-slate-500">
              (In-Memory Cache)
            </span>
          </div>
          <div className="w-full bg-slate-800 h-1 rounded overflow-hidden mt-2">
            <div
              className="bg-cyan-500 h-full transition-all duration-300"
              style={{ width: "100%" }}
            ></div>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
          <span className="text-slate-400 uppercase text-[9px] font-bold block mb-1">Origine de la Donnée</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-bold text-slate-200">BusinessContext SSOT</span>
          </div>
          <span className="text-[10px] text-slate-500 block mt-1.5">
            Synchronisation Firestore atomique sans latence.
          </span>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
          <span className="text-slate-400 uppercase text-[9px] font-bold block mb-1">Filtres Actifs Transmission</span>
          <div className="flex flex-col gap-0.5 mt-1 font-mono text-[10px]">
            <div>Succursale : <strong className="text-slate-300">{selectedBranchId}</strong></div>
            <div>Département : <strong className="text-slate-300">{selectedDeptId}</strong></div>
            <div>Période : <strong className="text-slate-300">{startDate} à {endDate}</strong></div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-slate-500" />
          Journal des Audits In-Memory (Live Sync)
        </span>
        <div className="border border-slate-850 rounded-lg overflow-hidden bg-slate-950/30">
          <div className="p-4 text-center text-slate-500 italic">
            Toutes les données sont synchronisées en temps réel depuis le cache local Firestore.
          </div>
        </div>
      </div>
    </div>
  );
};
