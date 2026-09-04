import React from "react";
import { Check } from "lucide-react";
import { AdaptiveModal } from "../../ui/AdaptiveModal";
import { Employee } from "../../../types";

export interface BonusModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingBonus: any;
  setEditingBonus: (b: any) => void;
  employees: Employee[];
  currentBusinessId: string;
  onSubmit: (e: React.FormEvent) => void;
  toCents: (val: number) => number;
}

export const BonusModal: React.FC<BonusModalProps> = ({
  isOpen,
  onClose,
  editingBonus,
  setEditingBonus,
  employees,
  currentBusinessId,
  onSubmit,
  toCents
}) => {
  return (
    <AdaptiveModal
      isOpen={isOpen}
      onClose={onClose}
      title="Allouer une Prime Ponctuelle"
      icon={<Check className="w-5 h-5" />}
      iconVariant="emerald"
    >
      {editingBonus && (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Employé bénéficiaire</label>
            <select
              value={editingBonus.employee_id}
              onChange={(e) => setEditingBonus({ ...editingBonus, employee_id: e.target.value })}
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
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Montant de la prime (Gourdes HTG)</label>
            <input
              type="number"
              value={editingBonus.bonus_amount_cents ? editingBonus.bonus_amount_cents / 100 : ""}
              onChange={(e) => setEditingBonus({ ...editingBonus, bonus_amount_cents: toCents(Number(e.target.value)) })}
              placeholder="Ex: 5000"
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-100 font-mono"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Justification opérationnelle / Motif</label>
            <input
              type="text"
              value={editingBonus.reason || ""}
              onChange={(e) => setEditingBonus({ ...editingBonus, reason: e.target.value })}
              placeholder="Ex: Prime de récolte exceptionnelle"
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-150"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-100 font-bold text-sm rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            Allouer la Prime de Quinzaine
          </button>
        </form>
      )}
    </AdaptiveModal>
  );
};
