import React from "react";
import { PayrollCycle } from "../../../types";
import { Calendar, Edit3, Trash2 } from "lucide-react";

interface PayrollCycleSelectorProps {
  cycles: PayrollCycle[];
  selectedCycleId: string;
  onSelectCycle: (cycleId: string) => void;
  onOpenCreateModal: () => void;
  onOpenEditModal?: () => void;
  onDeleteActiveCycle?: () => void;
  canCreate: boolean;
}

export const PayrollCycleSelector: React.FC<PayrollCycleSelectorProps> = ({
  cycles,
  selectedCycleId,
  onSelectCycle,
  onOpenCreateModal,
  onOpenEditModal,
  onDeleteActiveCycle,
  canCreate,
}) => {
  const selectedCycle = cycles.find((c) => c.id === selectedCycleId);
  const isDraft = selectedCycle && selectedCycle.status !== "SEALED";

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
          <Calendar className="w-5 h-5" />
        </div>
        <div>
          <span className="text-xs text-slate-400 font-medium block">Cycle de Paie Actif</span>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <select
              value={selectedCycleId}
              onChange={(e) => onSelectCycle(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white font-semibold text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              {cycles.length === 0 ? (
                <option value="">Aucun cycle disponible</option>
              ) : (
                cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.cycleName || c.label || "Cycle sans nom"} ({c.status})
                  </option>
                ))
              )}
            </select>

            {isDraft && canCreate && onOpenEditModal && (
              <button
                type="button"
                onClick={onOpenEditModal}
                title="Modifier les paramètres du cycle (période, employés, taxes)"
                className="px-2.5 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-medium text-xs flex items-center gap-1 transition"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Modifier Draft</span>
              </button>
            )}

            {isDraft && canCreate && onDeleteActiveCycle && (
              <button
                type="button"
                onClick={onDeleteActiveCycle}
                title="Supprimer ce cycle en DRAFT"
                className="px-2 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-medium text-xs flex items-center gap-1 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {canCreate && (
        <button
          type="button"
          onClick={onOpenCreateModal}
          className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-900/20"
        >
          <span>Nouveau Cycle Quinzaine</span>
        </button>
      )}
    </div>
  );
};
