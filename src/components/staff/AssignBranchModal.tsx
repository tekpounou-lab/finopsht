import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Employee, Branch } from '../../types';
import { MapPin, Loader2, X, Check } from 'lucide-react';
import { useI18n } from '../../i18n';

interface AssignBranchModalProps {
  isOpen: boolean;
  employee: Employee | null;
  branches: Branch[];
  onClose: () => void;
  onConfirm: (employee: Employee, branchId: string) => Promise<void>;
}

const modalDict = {
  fr: {
    title: "Assigner une Succursale",
    subtitle: "Sélectionnez la succursale d'affectation pour cet employé.",
    branchLabel: "Succursale d'affectation",
    selectPlaceholder: "-- Choisir une succursale --",
    cancel: "Annuler",
    confirm: "Enregistrer l'assignation",
    processing: "Enregistrement...",
    success: "Succursale mise à jour avec succès"
  },
  ht: {
    title: "Asiyen yon Sikisal",
    subtitle: "Chwazi sikisal pou anplwaye sa a travay.",
    branchLabel: "Sikisal pou asiyen",
    selectPlaceholder: "-- Chwazi yon sikisal --",
    cancel: "Anile",
    confirm: "Anregistre",
    processing: "Ap anregistre...",
    success: "Sikisal la mete a jou ak siksè"
  },
  en: {
    title: "Assign Branch",
    subtitle: "Select the assigned branch for this employee.",
    branchLabel: "Assigned Branch",
    selectPlaceholder: "-- Select a branch --",
    cancel: "Cancel",
    confirm: "Save Assignment",
    processing: "Saving...",
    success: "Branch updated successfully"
  }
};

export const AssignBranchModal: React.FC<AssignBranchModalProps> = ({
  isOpen,
  employee,
  branches,
  onClose,
  onConfirm
}) => {
  const { language } = useI18n();
  const d = modalDict[(language === "ht" || language === "en") ? language : "fr"];

  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && employee) {
      setSelectedBranchId(employee.branchId || (employee as any).branch_id || "");
      setErrorMsg(null);
      setIsLoading(false);
    }
  }, [isOpen, employee]);

  if (!isOpen || !employee) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchId) {
      setErrorMsg("Veuillez sélectionner une succursale.");
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg(null);
      await onConfirm(employee, selectedBranchId);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "Erreur lors de la mise à jour de la succursale.");
    } finally {
      setIsLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 flex flex-col font-sans relative">
        <button 
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 text-cyan-400 mb-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
            <MapPin className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100">{d.title}</h3>
            <span className="text-xs text-cyan-400 font-mono font-semibold uppercase tracking-wider">{employee.name}</span>
          </div>
        </div>

        <p className="text-slate-400 text-xs leading-relaxed mb-4">
          {d.subtitle}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="branchSelect" className="text-[10px] font-mono text-slate-400 uppercase font-bold">
              {d.branchLabel}
            </label>
            <select
              id="branchSelect"
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              disabled={isLoading}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl p-3 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all font-sans cursor-pointer disabled:opacity-50"
            >
              <option value="" disabled className="bg-slate-900 text-slate-500">
                {d.selectPlaceholder}
              </option>
              {branches.map((b) => (
                <option key={b.id} value={b.id} className="bg-slate-900 text-slate-200">
                  {b.name} {b.code ? `(${b.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-400 text-xs font-mono">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800/60 mt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition disabled:opacity-50"
            >
              {d.cancel}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-cyan-600 hover:bg-cyan-500 text-slate-950 transition shadow-lg shadow-cyan-950/50 flex items-center gap-2 disabled:opacity-50 font-mono"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {d.processing}
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  {d.confirm}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
