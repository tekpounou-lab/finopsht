import React from "react";
import { DollarSign } from "lucide-react";
import { AdaptiveModal } from "../../ui/AdaptiveModal";
import { Employee } from "../../../types";

export interface SalaryAdvanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingAdvance: any;
  setEditingAdvance: (a: any) => void;
  employees: Employee[];
  currentBusinessId: string;
  onSubmit: (e: React.FormEvent) => void;
  toCents: (val: number) => number;
}

export const SalaryAdvanceModal: React.FC<SalaryAdvanceModalProps> = ({
  isOpen,
  onClose,
  editingAdvance,
  setEditingAdvance,
  employees,
  currentBusinessId,
  onSubmit,
  toCents
}) => {
  return (
    <AdaptiveModal
      isOpen={isOpen}
      onClose={onClose}
      title="Accorder une Avance de Rémunération"
      icon={<DollarSign className="w-5 h-5" />}
      iconVariant="amber"
    >
      {editingAdvance && (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Bénéficiaire</label>
            <select
              value={editingAdvance.employee_id}
              onChange={(e) => setEditingAdvance({ ...editingAdvance, employee_id: e.target.value })}
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-300"
              required
            >
              <option value="">-- Choisir employé --</option>
              {employees.filter((e) => e.business_id === currentBusinessId).map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Montant global (Gourdes HTG)</label>
              <input
                type="number"
                value={editingAdvance.advance_amount_cents ? editingAdvance.advance_amount_cents / 100 : ""}
                onChange={(e) => setEditingAdvance({ ...editingAdvance, advance_amount_cents: toCents(Number(e.target.value)) })}
                placeholder="Ex: 20000"
                className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-100 font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Retenue par Quinzaine (HTG)</label>
              <input
                type="number"
                value={editingAdvance.recovery_installment_cents ? editingAdvance.recovery_installment_cents / 100 : ""}
                onChange={(e) => setEditingAdvance({ ...editingAdvance, recovery_installment_cents: toCents(Number(e.target.value)) })}
                placeholder="Ex: 5000"
                className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-100 font-mono"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-sm rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <DollarSign className="w-4 h-4" />
            Engager & Libérer l'Avance de Fonds
          </button>
        </form>
      )}
    </AdaptiveModal>
  );
};
