import React from "react";
import { Check } from "lucide-react";
import { AdaptiveModal } from "../../ui/AdaptiveModal";
import { Employee } from "../../../types";

export interface DeductionModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingDeduction: any;
  setEditingDeduction: (d: any) => void;
  employees: Employee[];
  currentBusinessId: string;
  onSubmit: (e: React.FormEvent) => void;
  toCents: (val: number) => number;
}

export const DeductionModal: React.FC<DeductionModalProps> = ({
  isOpen,
  onClose,
  editingDeduction,
  setEditingDeduction,
  employees,
  currentBusinessId,
  onSubmit,
  toCents
}) => {
  return (
    <AdaptiveModal
      isOpen={isOpen}
      onClose={onClose}
      title="Saisir une Retenue de Discipline"
      icon={<Check className="w-5 h-5" />}
      iconVariant="rose"
    >
      {editingDeduction && (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Employé concerné</label>
            <select
              value={editingDeduction.employee_id}
              onChange={(e) => setEditingDeduction({ ...editingDeduction, employee_id: e.target.value })}
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-300"
              required
            >
              <option value="">-- Choisir employé --</option>
              {employees.filter((e) => e.business_id === currentBusinessId).map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Montant à prélever (Gourdes HTG)</label>
            <input
              type="number"
              value={editingDeduction.deduction_amount_cents ? editingDeduction.deduction_amount_cents / 100 : ""}
              onChange={(e) => setEditingDeduction({ ...editingDeduction, deduction_amount_cents: toCents(Number(e.target.value)) })}
              placeholder="Ex: 2500"
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-100 font-mono"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Motif de la retenue / Justification</label>
            <input
              type="text"
              value={editingDeduction.reason || ""}
              onChange={(e) => setEditingDeduction({ ...editingDeduction, reason: e.target.value })}
              placeholder="Ex: Dommages constatés sur outillage"
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-150"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-slate-100 font-bold text-sm rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            Enregistrer la Retenue Saisie
          </button>
        </form>
      )}
    </AdaptiveModal>
  );
};
