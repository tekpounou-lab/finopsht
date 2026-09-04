import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Employee } from '../../types';
import { AlertTriangle, ShieldAlert, Loader2, X } from 'lucide-react';
import { useI18n } from '../../i18n';

interface SuspendConfirmationModalProps {
  isOpen: boolean;
  employee: Employee | null;
  onClose: () => void;
  onConfirm: (employee: Employee, reason: string) => Promise<void>;
  currentUserId?: string;
  currentUserEmail?: string;
}

const modalDict = {
  fr: {
    title: "Suspendre l'employé ?",
    warningSelf: "Vous ne pouvez pas suspendre votre propre compte.",
    message: "Cette action va suspendre {name}. L'employé perdra immédiatement son accès à la plateforme FINOPS. Le suivi de la paie et de la présence continuera, mais la connexion sera bloquée.",
    reasonLabel: "Motif de la suspension (optionnel)",
    reasonPlaceholder: "Ex: En attente d'enquête administrative...",
    charLimit: "caractères",
    cancel: "Annuler",
    confirm: "Confirmer la suspension",
    processing: "Traitement en cours..."
  },
  ht: {
    title: "Sispann Anplwaye a ?",
    warningSelf: "Ou pa ka sispann pwòp kont ou.",
    message: "Aksyon sa a pral sispann {name}. Anplwaye a ap pèdi aksè nan platfòm FINOPS imedyatman. Suivi peman ak prezans ap kontinyé, men moun nan pa ka konekte.",
    reasonLabel: "Rezon pou sispansyon an (opsyonèl)",
    reasonPlaceholder: "Eks: Pandan w ap tann enkèt...",
    charLimit: "karaktè",
    cancel: "Anile",
    confirm: "Konfime Sispansyon",
    processing: "Ap trete..."
  },
  en: {
    title: "Suspend Employee?",
    warningSelf: "You cannot suspend your own account.",
    message: "This action will suspend {name}. The employee will lose access to the FINOPS platform. Payroll and attendance tracking will continue but the employee cannot log in.",
    reasonLabel: "Reason for suspension (optional)",
    reasonPlaceholder: "E.g. Pending administrative review...",
    charLimit: "characters",
    cancel: "Cancel",
    confirm: "Confirm Suspend",
    processing: "Processing..."
  }
};

export const SuspendConfirmationModal: React.FC<SuspendConfirmationModalProps> = ({
  isOpen,
  employee,
  onClose,
  onConfirm,
  currentUserId,
  currentUserEmail
}) => {
  const { language } = useI18n();
  const d = modalDict[(language === "ht" || language === "en") ? language : "fr"];

  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setErrorMsg(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  if (!isOpen || !employee) return null;

  const isSelf = Boolean(
    (currentUserId && employee.id === currentUserId) ||
    (currentUserEmail && employee.email.toLowerCase().trim() === currentUserEmail.toLowerCase().trim())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSelf) {
      setErrorMsg(d.warningSelf);
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg(null);
      await onConfirm(employee, reason.trim());
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to suspend user. Please try again.");
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

        <div className="flex items-center gap-3 text-rose-500 mb-3">
          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <ShieldAlert className="w-6 h-6 text-rose-500" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100">{d.title}</h3>
            <span className="text-xs text-rose-400 font-mono font-semibold uppercase tracking-wider">{employee.name}</span>
          </div>
        </div>

        {isSelf && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {d.warningSelf}
          </div>
        )}

        <p className="text-slate-300 text-xs leading-relaxed mb-4">
          {d.message.replace("{name}", employee.name)}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 uppercase font-bold">
              <label htmlFor="suspensionReason">{d.reasonLabel}</label>
              <span className={reason.length > 240 ? "text-amber-400" : "text-slate-500"}>
                {reason.length}/255
              </span>
            </div>
            <textarea
              id="suspensionReason"
              value={reason}
              maxLength={255}
              onChange={(e) => setReason(e.target.value)}
              placeholder={d.reasonPlaceholder}
              disabled={isLoading || isSelf}
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl p-3 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/30 transition-all font-mono resize-none disabled:opacity-50"
            />
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
              disabled={isLoading || isSelf}
              className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-rose-600 hover:bg-rose-500 text-white transition shadow-lg shadow-rose-950/50 flex items-center gap-2 disabled:opacity-50"
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
        </form>
      </div>
    </div>,
    document.body
  );
};
