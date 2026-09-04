import React, { useState } from 'react';
import { Trash2, AlertTriangle, X, Loader2 } from 'lucide-react';
import { LedgerTransaction } from '../../../types';
import { useTranslate } from '../../../i18n';

interface BatchDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTxs: LedgerTransaction[];
  onConfirm: () => Promise<void>;
}

export const BatchDeleteModal: React.FC<BatchDeleteModalProps> = ({
  isOpen,
  onClose,
  selectedTxs,
  onConfirm,
}) => {
  const tText = useTranslate();
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const isDeleteConfirmed = deleteConfirmText.trim().toUpperCase() === 'SUPPRIMER';

  const handleExecute = async () => {
    if (!isDeleteConfirmed || isDeleting) return;
    try {
      setIsDeleting(true);
      await onConfirm();
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-rose-900/50 rounded-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="flex justify-between items-center bg-rose-950/40 px-5 py-4 border-b border-rose-900/40">
          <div className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-rose-400" />
            <span className="text-xs font-mono font-extrabold tracking-widest text-rose-200 uppercase">
              {tText("SUPPRESSION DÉFINITIVE DU GRAND LIVRE")} ({selectedTxs.length})
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1 hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4 font-sans text-xs">
          <div className="bg-rose-950/30 border border-rose-900/60 rounded-xl p-4 flex gap-3 text-rose-200 shadow-inner">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-extrabold text-[11px] uppercase text-rose-300 mb-1">
                {tText("ATTENTION : ACTION IRRÉVERSIBLE")}
              </h4>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                {tText("Cette action supprimera définitivement les")} <strong className="text-rose-300 font-mono">{selectedTxs.length} {tText("transactions sélectionnées")}</strong> {tText("de la base de données. Une trace médico-légale sera consignée dans le journal d'audit.")}
              </p>
            </div>
          </div>

          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">
              {tText("Tapez")} <strong className="text-rose-400 font-mono">SUPPRIMER</strong> {tText("pour confirmer la suppression :")}
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="SUPPRIMER"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-xs text-rose-300 uppercase focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            />
          </div>
        </div>

        <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg transition"
          >
            {tText("Annuler")}
          </button>
          <button
            onClick={handleExecute}
            disabled={!isDeleteConfirmed || isDeleting}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition flex items-center gap-2"
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            <span>{tText("Supprimer Définitivement")}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
