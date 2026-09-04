import React from "react";
import { Scale } from "lucide-react";
import { AdaptiveModal } from "../../ui/AdaptiveModal";
import { Employee } from "../../../types";

export interface CorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeSearchQuery: string;
  setEmployeeSearchQuery: (query: string) => void;
  correctEmpId: string;
  setCorrectEmpId: (id: string) => void;
  correctType: "BONUS" | "PENALTY" | "REFUND" | "ADJUSTMENT";
  setCorrectType: (type: "BONUS" | "PENALTY" | "REFUND" | "ADJUSTMENT") => void;
  correctAmountGourdes: string;
  setCorrectAmountGourdes: (amt: string) => void;
  correctReason: string;
  setCorrectReason: (reason: string) => void;
  employees: Employee[];
  currentBusinessId: string;
  onSubmit: (e: React.FormEvent) => void;
}

export const CorrectionModal: React.FC<CorrectionModalProps> = ({
  isOpen,
  onClose,
  employeeSearchQuery,
  setEmployeeSearchQuery,
  correctEmpId,
  setCorrectEmpId,
  correctType,
  setCorrectType,
  correctAmountGourdes,
  setCorrectAmountGourdes,
  correctReason,
  setCorrectReason,
  employees,
  currentBusinessId,
  onSubmit
}) => {
  return (
    <AdaptiveModal
      isOpen={isOpen}
      onClose={onClose}
      title="Enregistrer une Correction Légale post-validation"
      icon={<Scale className="w-5 h-5" />}
      iconVariant="rose"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" id="correction-form">
        <div>
          <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Anplwaye / Employé concerné</label>
          <div className="flex flex-col gap-1.5">
            <div className="relative">
              <input
                type="text"
                placeholder="🔍 Rechercher par nom..."
                value={employeeSearchQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setEmployeeSearchQuery(val);
                  const matches = employees
                    .filter((emp) => emp.business_id === currentBusinessId)
                    .filter((emp) => emp.name.toLowerCase().includes(val.toLowerCase()));
                  if (matches.length === 1) {
                    setCorrectEmpId(matches[0].id);
                  }
                }}
                className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-100 placeholder-slate-500 focus:border-rose-500/50 outline-none transition"
                id="correction-emp-search-input"
              />
              {employeeSearchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setEmployeeSearchQuery("");
                    setCorrectEmpId("");
                  }}
                  className="absolute right-2 top-2.5 text-slate-500 hover:text-slate-300 text-[10px] uppercase font-bold"
                >
                  Effacer
                </button>
              )}
            </div>
            <select
              id="correction-emp-select"
              value={correctEmpId}
              onChange={(e) => setCorrectEmpId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-300"
              required
            >
              <option value="">-- Choisir employé --</option>
              {employees
                .filter((e) => e.business_id === currentBusinessId)
                .filter((emp) => {
                  if (!employeeSearchQuery) return true;
                  return emp.name.toLowerCase().includes(employeeSearchQuery.toLowerCase());
                })
                .map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3" id="correct-details-grid">
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Mòd koreksyon / Type</label>
            <select
              id="correction-type-select"
              value={correctType}
              onChange={(e) => setCorrectType(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-200"
            >
              <option value="BONUS">BONUS Prime</option>
              <option value="PENALTY">PENALTY Reta</option>
              <option value="REFUND">REFUND Remboursement</option>
              <option value="ADJUSTMENT">ADJUSTMENT Rectification</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Montant (HTG Gourdes)</label>
            <input
              id="correction-amount"
              type="number"
              step="any"
              value={correctAmountGourdes}
              onChange={(e) => setCorrectAmountGourdes(e.target.value)}
              placeholder="Ex: 2500"
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-100 font-mono"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Raison justificative complète</label>
          <input
            id="correction-reason"
            type="text"
            value={correctReason}
            onChange={(e) => setCorrectReason(e.target.value)}
            placeholder="Ex: Prime exceptionnelle de fin de récolte"
            className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-150"
            required
          />
        </div>

        <button
          id="submit-register-correction"
          type="submit"
          className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-slate-100 font-bold text-sm select-none cursor-pointer rounded-xl transition flex items-center justify-center gap-1.5"
        >
          <Scale className="w-4 h-4" />
          Sauvegarder la Rectification
        </button>
      </form>
    </AdaptiveModal>
  );
};
