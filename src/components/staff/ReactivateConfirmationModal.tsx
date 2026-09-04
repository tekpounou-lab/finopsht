import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Employee } from '../../types';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { useI18n } from '../../i18n';

interface ReactivateConfirmationModalProps {
  isOpen: boolean;
  employee: Employee | null;
  onClose: () => void;
  onConfirm: (employee: Employee) => Promise<void>;
}

const modalDict = {
  fr: {
    title: "Réactiver l'employé ?",
    message: "Cette action va réactiver {name}. L'employé récupérera immédiatement un accès complet à la plateforme FINOPS.",
    cancel: "Annuler",
    confirm: "Confirmer la réactivation",
    processing: "Traitement en cours..."
  },
  ht: {
    title: "Reaktive Anplwaye a ?",
    message: "Aksyon sa a pral reaktive {name}. Anplwaye a ap jwenn tout aksè l nan platfòm FINOPS ankò imedyatman.",
    cancel: "Anile",
    confirm: "Konfime Reaktivasyon",
    processing: "Ap trete..."
  },
  en: {
    title: "Reactivate Employee?",
    message: "This action will reactivate {name}. The employee will regain full access to the FINOPS platform.",
    cancel: "Cancel",
    confirm: "Confirm Reactivation",
    processing: "Processing..."
  }
};

export const ReactivateConfirmationModal: React.FC<ReactivateConfirmationModalProps> = ({
  isOpen,
  employee,
  onClose,
  onConfirm
}) => {
  const { language } = useI18n();
  const d = modalDict[(language === "ht" || language === "en") ? language : "fr"];

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  if (!isOpen || !employee) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      setErrorMsg(null);
      await onConfirm(employee);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to reactivate user. Please try again.");
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

        <div className="flex items-center gap-3 text-emerald-400 mb-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100">{d.title}</h3>
            <span className="text-xs text-emerald-400 font-mono font-semibold uppercase tracking-wider">{employee.name}</span>
          </div>
        </div>

        <p className="text-slate-300 text-xs leading-relaxed mb-6">
          {d.message.replace("{name}", employee.name)}
        </p>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-400 text-xs font-mono">
            {errorMsg}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800/60">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition disabled:opacity-50"
          >
            {d.cancel}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-lg shadow-emerald-950/50 flex items-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {d.processing}
              </>
            ) : (
              d.confirm
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
