import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, X, RotateCcw, Loader2 } from 'lucide-react';
import { LedgerTransaction } from '../../../types';
import { useTranslate } from '../../../i18n';

interface BatchReversalModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTxs: LedgerTransaction[];
  onConfirm: (reason: string) => Promise<void>;
}

export const BatchReversalModal: React.FC<BatchReversalModalProps> = ({
  isOpen,
  onClose,
  selectedTxs,
  onConfirm,
}) => {
  const tText = useTranslate();
  const [reversalReason, setReversalReason] = useState('Rectification groupée d\'écritures comptables / Erreur opérationnelle');
  const [confirmTerms, setConfirmTerms] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const totalAmountCents = selectedTxs.reduce((sum, tx) => sum + (tx.amount_cents || 0), 0);
  const isFormValid = confirmTerms && confirmText.trim().toUpperCase() === 'CONTREPASSER' && reversalReason.trim().length >= 5;

  const handleExecute = async () => {
    if (!isFormValid || isProcessing) return;
    try {
      setIsProcessing(true);
      await onConfirm(reversalReason);
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-slate-900 border border-red-900/40 rounded-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="flex justify-between items-center bg-red-950/40 px-5 py-4 border-b border-red-900/30">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-400 animate-pulse" />
            <span className="text-xs font-mono font-extrabold tracking-widest text-red-200 uppercase">
              PROTOCOLE DE SÉCURITÉ COMPTABLE : CONTREPASSATION GROUPÉE ({selectedTxs.length})
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1 hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4 font-sans text-xs max-h-[75vh] overflow-y-auto">
          <div className="bg-red-950/25 border border-red-900/50 rounded-xl p-4 flex gap-3 text-red-200/90 shadow-inner">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-extrabold text-[11px] tracking-wider uppercase text-red-300 mb-1">
                {tText("PROTOCOLE D'INTÉGRITÉ COMPTABLE (PRÉCAUTIONS STRICTES)")}
              </h4>
              <ul className="list-disc pl-4 space-y-1 text-slate-300 text-[11px] leading-relaxed">
                <li>{tText("Les registres existants resteront non modifiés dans la base de données.")}</li>
                <li>{tText("Le système va insérer")} <span className="font-bold text-red-300 text-xs font-mono">{selectedTxs.length} {tText("écritures de rectification opposées")}</span> {tText("correspondantes dans le Grand Livre.")}</li>
                <li>{tText("Un journal d'audit de sécurité médico-légal immuable sera généré.")}</li>
              </ul>
            </div>
          </div>

          <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800/80 flex justify-between items-center">
            <div>
              <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">{tText("Volume sélectionné")}</div>
              <div className="text-slate-200 font-mono font-bold text-sm mt-0.5">{selectedTxs.length} {tText("Transactions")}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">{tText("Valeur cumulative à inverser")}</div>
              <div className="text-red-400 font-mono font-black text-sm mt-0.5">
                {(totalAmountCents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} HTG
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-300 mb-1.5">
              {tText("Motif officiel obligatoire de la contrepassation groupée :")}
            </label>
            <textarea
              rows={2}
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg p-3 text-slate-200 text-xs focus:ring-1 focus:ring-red-500 focus:border-red-500 font-sans"
              placeholder={tText("Expliquez pourquoi ces écritures doivent être neutralisées...")}
            />
          </div>

          <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 flex flex-col gap-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmTerms}
                onChange={(e) => setConfirmTerms(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 bg-slate-900 text-red-600 focus:ring-red-500"
              />
              <span className="text-[11px] text-slate-300 leading-snug">
                {tText("Je confirme avoir vérifié l'exactitude de cette opération comptable groupée.")}
              </span>
            </label>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                {tText("Tapez")} <strong className="text-red-400 font-mono">CONTREPASSER</strong> {tText("pour autoriser l'action :")}
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="CONTREPASSER"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-xs text-slate-100 uppercase focus:border-red-500 focus:ring-1 focus:ring-red-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg transition"
          >
            {tText("Annuler")}
          </button>
          <button
            onClick={handleExecute}
            disabled={!isFormValid || isProcessing}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition flex items-center gap-2"
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            <span>{tText("Exécuter la Contrepassation")}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
