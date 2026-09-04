import React from "react";
import { PayrollCycle, PayrollRecord } from "../../../types";
import { Play, Sparkles, CheckCircle2, ShieldCheck, X, AlertTriangle } from "lucide-react";

interface PayrollRunModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCycle: PayrollCycle | null;
  dryRunRecords: PayrollRecord[];
  isCalculating: boolean;
  onRunDryRun: () => void;
  onCommit: () => void;
}

export const PayrollRunModal: React.FC<PayrollRunModalProps> = ({
  isOpen,
  onClose,
  activeCycle,
  dryRunRecords,
  isCalculating,
  onRunDryRun,
  onCommit,
}) => {
  if (!isOpen || !activeCycle) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-white font-semibold">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <span>Exécution du Cycle : {activeCycle.cycleName || activeCycle.label}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs text-slate-300">
          <p>
            Le moteur de paie va appliquer les barèmes légaux ONA (6%), OFATMA (2%) et les déductions
            associées aux effectifs actifs rattachés à cette entreprise.
          </p>

          <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60 space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Période de début :</span>
              <span className="font-semibold text-white">{activeCycle.startDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Période de fin :</span>
              <span className="font-semibold text-white">{activeCycle.endDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Statut actuel :</span>
              <span className="text-amber-400 font-semibold">{activeCycle.status}</span>
            </div>
          </div>

          {dryRunRecords.length > 0 && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{dryRunRecords.length} bulletins calculés avec succès (Simulation prête).</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium"
          >
            Fermer
          </button>
          <button
            type="button"
            disabled={isCalculating}
            onClick={onRunDryRun}
            className="px-4 py-2 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/40 text-xs font-medium flex items-center gap-1.5"
          >
            <Play className="w-4 h-4" />
            <span>{isCalculating ? "Calcul en cours..." : "Simuler (Dry-Run)"}</span>
          </button>
          <button
            type="button"
            disabled={dryRunRecords.length === 0 || isCalculating}
            onClick={() => {
              onCommit();
              onClose();
            }}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Valider et Enregistrer</span>
          </button>
        </div>
      </div>
    </div>
  );
};
