import React, { useState } from "react";
import { CashTill, TillSession, DenominationBreakdown } from "../../types/cashManagement";
import { CashManagementRepository } from "../../repositories/CashManagementRepository";
import { ForensicLogRepository } from "../../repositories/ForensicLogRepository";
import {
  TillSessionEngine,
  CANONICAL_HTG_DENOMINATIONS,
  CANONICAL_USD_DENOMINATIONS
} from "../../domains/cash/services/TillSessionEngine";
import { X, Calculator, AlertTriangle, CheckCircle, ShieldCheck } from "lucide-react";

interface TillSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  till: CashTill;
  currentSession?: TillSession;
  currentUser: { id: string; name: string; role: string };
  onSessionUpdated: () => void;
}

export const HTG_DENOMINATIONS: readonly number[] = CANONICAL_HTG_DENOMINATIONS;
export const USD_DENOMINATIONS: readonly number[] = CANONICAL_USD_DENOMINATIONS;

export const TillSessionModal: React.FC<TillSessionModalProps> = ({
  isOpen,
  onClose,
  till,
  currentSession,
  currentUser,
  onSessionUpdated
}) => {
  const isClosing = till.status === "OPEN" && currentSession;
  const isOpening = till.status === "CLOSED" || !currentSession;

  const denominationsList = till.currency === "HTG" ? HTG_DENOMINATIONS : USD_DENOMINATIONS;

  const [openingAmountStr, setOpeningAmountStr] = useState<string>(
    till.balance_cents ? (till.balance_cents / 100).toString() : "0"
  );
  const [denominations, setDenominations] = useState<DenominationBreakdown>({});
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Calculate actual closing from denominations
  const actualClosingCents = denominationsList.reduce((acc, denom) => {
    const count = denominations[denom.toString()] || 0;
    return acc + count * denom * 100;
  }, 0);

  // Correct SSOT Formula: till.balance_cents already tracks Opening + CashIn - CashOut
  const expectedClosingCents = till.balance_cents || 0;

  const discrepancyCents = actualClosingCents - expectedClosingCents;

  const handleDenominationChange = (denom: number, countStr: string) => {
    const count = parseInt(countStr, 10) || 0;
    setDenominations((prev) => ({
      ...prev,
      [denom.toString()]: Math.max(0, count)
    }));
  };

  const handleStartSession = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const openingCents = Math.round((parseFloat(openingAmountStr) || 0) * 100);

      await TillSessionEngine.openSession({
        tillId: till.id,
        operatorId: till.assigned_teller_id || currentUser.id,
        operatorName: till.assigned_teller_name || currentUser.name,
        operatorRole: currentUser.role,
        openingBalanceCents: openingCents
      });

      onSessionUpdated();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Erreur lors de l'ouverture de la session de caisse.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseSession = async () => {
    if (!currentSession) {
      setErrorMessage("Aucune session active identifiée.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      if (discrepancyCents !== 0 && (!notes || notes.trim().length === 0)) {
        setErrorMessage("Un mot d'explication est obligatoire en cas d'écart de caisse.");
        setIsSubmitting(false);
        return;
      }

      await TillSessionEngine.closeSessionViaApi({
        sessionId: currentSession.id,
        tillId: till.id,
        businessId: till.business_id,
        currency: till.currency,
        actualClosingCents,
        denominationBreakdown: denominations,
        operatorId: currentUser.id,
        operatorName: currentUser.name,
        operatorRole: currentUser.role,
        notes: notes.trim()
      });

      onSessionUpdated();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Erreur lors de la clôture de la caisse.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-6 text-slate-100 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className={`p-3 rounded-lg ${isClosing ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">
              {isClosing ? `Clôture de Caisse — ${till.name}` : `Ouverture de Caisse — ${till.name}`}
            </h3>
            <p className="text-xs text-slate-400">
              {till.currency} • Guichetier : <span className="text-slate-200 font-medium">{currentUser.name}</span>
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {isOpening ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Fonds de Caisse Initial ({till.currency})
              </label>
              <input
                type="number"
                step="0.01"
                value={openingAmountStr}
                onChange={(e) => setOpeningAmountStr(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-hidden focus:border-emerald-500"
                placeholder="0.00"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Saisissez le montant physique présent en caisse au démarrage du guichet.
              </p>
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleStartSession}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-2 shadow-lg shadow-emerald-600/20"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Confirmer & Ouvrir la Session</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Billetage Physique (Comptage des coupures)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950 p-3 rounded-lg border border-slate-800">
                {denominationsList.map((denom) => (
                  <div key={denom} className="flex flex-col gap-1">
                    <span className="text-[11px] text-slate-400 font-mono">
                      Billet {denom} {till.currency}
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={denominations[denom.toString()] || ""}
                      onChange={(e) => handleDenominationChange(denom, e.target.value)}
                      placeholder="0"
                      className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-white focus:outline-hidden focus:border-amber-500 text-right font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Solde Attendu (Grand Livre) :</span>
                <span className="font-mono text-white font-bold">
                  {(expectedClosingCents / 100).toLocaleString()} {till.currency}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-mono italic">
                Formule SSOT : Ouverture + Entrées (GL) − Sorties (GL)
              </p>

              <div className="flex justify-between text-slate-400 pt-1.5 border-t border-slate-900">
                <span>Comptage Billetage Physique :</span>
                <span className="font-mono text-emerald-400 font-bold">
                  {(actualClosingCents / 100).toLocaleString()} {till.currency}
                </span>
              </div>

              <div className="flex justify-between pt-2 border-t border-slate-800">
                <span>Écart de Caisse :</span>
                <span
                  className={`font-mono font-bold ${
                    discrepancyCents === 0
                      ? "text-emerald-400"
                      : discrepancyCents > 0
                      ? "text-blue-400"
                      : "text-rose-400"
                  }`}
                >
                  {discrepancyCents === 0
                    ? "0.00 (Conforme)"
                    : `${(discrepancyCents / 100).toLocaleString()} ${till.currency}`}
                </span>
              </div>
            </div>

            <div className="p-3 bg-cyan-950/40 border border-cyan-800/60 rounded-xl text-[11px] text-cyan-300 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <span>ℹ️ Contrôle de Session vs Remise de Fonds</span>
              </p>
              <p className="font-light leading-relaxed">
                La clôture sert à contrôler le numéraire de la session. Si vous souhaitez remettre les recettes ou l'excédent de liquidités au coffre-fort de la succursale, veuillez initier une demande via <strong>Nouveau Transfert Interne</strong> (Remise Caisse ➔ Coffre).
              </p>
            </div>

            {discrepancyCents !== 0 && (
              <div>
                <label className="block text-xs font-medium text-amber-400 mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Motif d'explication de l'écart (Obligatoire)</span>
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Expliquez la raison de l'écart constaté..."
                  className="w-full bg-slate-950 border border-amber-500/30 rounded-lg p-2 text-xs text-white focus:outline-hidden focus:border-amber-500"
                />
              </div>
            )}

            <div className="pt-4 flex justify-end gap-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleCloseSession}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white transition flex items-center gap-2 shadow-lg shadow-amber-600/20"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Valider le Billetage & Clôturer</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
