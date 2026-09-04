import React from "react";
import { Sliders } from "lucide-react";
import { AdaptiveModal } from "../../ui/AdaptiveModal";
import { Employee } from "../../../types";

export interface SalaryStructureModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingStructure: any;
  setEditingStructure: (s: any) => void;
  employees: Employee[];
  currentBusinessId: string;
  onSubmit: (e: React.FormEvent) => void;
  toCents: (val: number) => number;
}

export const SalaryStructureModal: React.FC<SalaryStructureModalProps> = ({
  isOpen,
  onClose,
  editingStructure,
  setEditingStructure,
  employees,
  currentBusinessId,
  onSubmit,
  toCents
}) => {
  return (
    <AdaptiveModal
      isOpen={isOpen}
      onClose={onClose}
      title="Configuration Structure Salariale (FinOps V3)"
      icon={<Sliders className="w-5 h-5" />}
      iconVariant="blue"
    >
      {editingStructure && (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Employé concerné</label>
            <select
              value={editingStructure.employee_id}
              onChange={(e) => setEditingStructure({ ...editingStructure, employee_id: e.target.value })}
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
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Salaire de Base (En Gourdes / USD)</label>
              <input
                type="number"
                value={editingStructure.base_salary_cents ? editingStructure.base_salary_cents / 100 : ""}
                onChange={(e) => setEditingStructure({ ...editingStructure, base_salary_cents: toCents(Number(e.target.value)) })}
                placeholder="Ex: 25000"
                className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-100 font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Devise de Contrat</label>
              <select
                value={editingStructure.payment_currency || "HTG"}
                onChange={(e) => setEditingStructure({ ...editingStructure, payment_currency: e.target.value as any })}
                className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-200 font-semibold"
              >
                <option value="HTG">HTG (Gourdes Haïtiennes)</option>
                <option value="USD">USD (Dollar Américain, Auto exchange 135)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Intervalle de Calcul</label>
              <select
                value={editingStructure.salary_interval || "MONTHLY"}
                onChange={(e) => setEditingStructure({ ...editingStructure, salary_interval: e.target.value as any })}
                className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-200"
              >
                <option value="MONTHLY">Mensuel (Divisé par 2 en quinzaine)</option>
                <option value="HOURLY">Taux Horaire</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Éligible Taxes Sociales</label>
              <select
                value={editingStructure.social_tax_eligible !== false ? "true" : "false"}
                onChange={(e) => setEditingStructure({ ...editingStructure, social_tax_eligible: e.target.value === "true" })}
                className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-200"
              >
                <option value="true">Oui (CNSS 6% d'office)</option>
                <option value="false">Non (Exonération Légale)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Méthode de Virement</label>
              <select
                value={editingStructure.payment_method || "BANK"}
                onChange={(e) => setEditingStructure({ ...editingStructure, payment_method: e.target.value as any })}
                className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-200"
              >
                <option value="BANK">Virement Bancaire (SOGEBANK/UNIBANK)</option>
                <option value="CASH">Espèces / Cash</option>
                <option value="MOBILE_MONEY">MonCash / Mobile Wallet</option>
                <option value="CHEQUE">Chèque de Direction</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Nom de la Banque / Mobile</label>
              <input
                type="text"
                value={editingStructure.bank_name || ""}
                onChange={(e) => setEditingStructure({ ...editingStructure, bank_name: e.target.value })}
                placeholder="SOGEBANK"
                className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Numéro de Compte</label>
            <input
              type="text"
              value={editingStructure.bank_account_number || ""}
              onChange={(e) => setEditingStructure({ ...editingStructure, bank_account_number: e.target.value })}
              placeholder="0021-3444-5555"
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-100 font-mono"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-slate-100 font-bold text-sm rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Sliders className="w-4 h-4" />
            Sauvegarder les Paramètres FinOps
          </button>
        </form>
      )}
    </AdaptiveModal>
  );
};
