import React, { useState, useEffect, useCallback } from "react";
import { CashTill, TillSession, TillStatement, CurrencyCode } from "../../types/cashManagement";
import { TellerTransactionEngine } from "../../domains/cash/services/TellerTransactionEngine";
import { TillSessionEngine } from "../../domains/cash/services/TillSessionEngine";
import { CurrencyRateRepository } from "../../repositories/CurrencyRateRepository";
import {
  X,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Coins,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Receipt,
  User,
  ShieldCheck,
  TrendingUp,
  Clock
} from "lucide-react";
import { toast } from "sonner";

interface TellerTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  till: CashTill;
  currentSession?: TillSession;
  currentUser: { id: string; name: string; role: string };
  onTransactionSuccess: () => void;
}

export const TellerTransactionModal: React.FC<TellerTransactionModalProps> = ({
  isOpen,
  onClose,
  till,
  currentSession,
  currentUser,
  onTransactionSuccess
}) => {
  const [activeTab, setActiveTab] = useState<"TRANSACTION" | "STATEMENT">("TRANSACTION");
  const [txType, setTxType] = useState<"ENCAISSEMENT" | "DECAISSEMENT" | "FX">("ENCAISSEMENT");

  // Form State
  const [amountStr, setAmountStr] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // FX specific state
  const [fxDirection, setFxDirection] = useState<"BUY_USD" | "SELL_USD">("BUY_USD");
  const [appliedRate, setAppliedRate] = useState<number>(132.5);
  const [rateType, setRateType] = useState<string>("ACHAT_CLIENT");
  const [isLoadingRates, setIsLoadingRates] = useState(false);

  // Statement State
  const [statement, setStatement] = useState<TillStatement | null>(null);
  const [isLoadingStatement, setIsLoadingStatement] = useState(false);

  // Load today's exchange rates
  const loadRates = useCallback(async () => {
    setIsLoadingRates(true);
    try {
      const todayRates = await CurrencyRateRepository.getTodayRatesWithFallback(till.business_id);
      const isBuyingUsd = fxDirection === "BUY_USD";
      const resolvedRate = isBuyingUsd ? todayRates.rates.ACHAT_CLIENT : todayRates.rates.VENTE_CLIENT;
      setAppliedRate(resolvedRate);
      setRateType(isBuyingUsd ? "ACHAT_CLIENT" : "VENTE_CLIENT");
    } catch (err) {
      console.warn("Could not load exchange rates, using fallback 132.50", err);
      setAppliedRate(132.5);
    } finally {
      setIsLoadingRates(false);
    }
  }, [till.business_id, fxDirection]);

  useEffect(() => {
    if (isOpen && txType === "FX") {
      loadRates();
    }
  }, [isOpen, txType, loadRates]);

  // Load Till Statement
  const loadStatement = useCallback(async () => {
    if (!currentSession) return;
    setIsLoadingStatement(true);
    try {
      const stmt = await TillSessionEngine.getTillStatement(till.id, till.business_id);
      setStatement(stmt);
    } catch (err: any) {
      console.error("Error loading till statement:", err);
    } finally {
      setIsLoadingStatement(false);
    }
  }, [till.id, currentSession]);

  useEffect(() => {
    if (isOpen && activeTab === "STATEMENT") {
      loadStatement();
    }
  }, [isOpen, activeTab, loadStatement]);

  if (!isOpen) return null;

  const parsedAmount = parseFloat(amountStr) || 0;
  const amountCents = Math.round(parsedAmount * 100);

  // Calculations for FX
  const fxUsdAmount = parsedAmount;
  const fxHtgEquivalent = Math.round(fxUsdAmount * appliedRate * 100) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSession) {
      setErrorMessage("Une session de caisse active est obligatoire pour enregistrer une transaction.");
      return;
    }
    if (amountCents <= 0) {
      setErrorMessage("Le montant de la transaction doit être supérieur à zéro.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const idempotencyKey = `tx_${till.id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      if (txType === "ENCAISSEMENT") {
        await TellerTransactionEngine.postTellerTransaction({
          tillId: till.id,
          sessionId: currentSession.id,
          operatorId: currentUser.id,
          operatorName: currentUser.name,
          operatorRole: currentUser.role,
          transactionType: "COLLECTION_CLIENT",
          currency: till.currency,
          amountCents,
          flowBehavior: 1, // Cash Inflow
          counterpartyName: counterpartyName.trim() || "Client Guichet",
          description: description.trim() || `Encaissement guichet ${till.currency}`,
          notes: notes.trim(),
          idempotencyKey
        });
        toast.success(`Encaissement de ${(amountCents / 100).toLocaleString()} ${till.currency} enregistré avec succès.`);
      } else if (txType === "DECAISSEMENT") {
        if (amountCents > till.balance_cents) {
          throw new Error(
            `Fonds insuffisants en caisse : solde disponible ${(till.balance_cents / 100).toLocaleString()} ${till.currency}, décaissement demandé ${(amountCents / 100).toLocaleString()} ${till.currency}.`
          );
        }
        await TellerTransactionEngine.postTellerTransaction({
          tillId: till.id,
          sessionId: currentSession.id,
          operatorId: currentUser.id,
          operatorName: currentUser.name,
          operatorRole: currentUser.role,
          transactionType: "DISBURSEMENT_OPERATION",
          currency: till.currency,
          amountCents,
          flowBehavior: -1, // Cash Outflow
          counterpartyName: counterpartyName.trim() || "Bénéficiaire Guichet",
          description: description.trim() || `Décaissement opérationnel guichet ${till.currency}`,
          notes: notes.trim(),
          idempotencyKey
        });
        toast.success(`Décaissement de ${(amountCents / 100).toLocaleString()} ${till.currency} enregistré avec succès.`);
      } else if (txType === "FX") {
        // FX Counter transaction
        const isBuyingUsd = fxDirection === "BUY_USD";
        // If Buying USD: Customer gives USD, receives HTG.
        // For an HTG Till: Outflow of HTG = amountCents in HTG!
        // For a USD Till: Inflow of USD = amountCents in USD!
        await TellerTransactionEngine.postTellerTransaction({
          tillId: till.id,
          sessionId: currentSession.id,
          operatorId: currentUser.id,
          operatorName: currentUser.name,
          operatorRole: currentUser.role,
          transactionType: "FX_EXCHANGE",
          currency: till.currency,
          amountCents,
          flowBehavior: till.currency === "HTG" ? (isBuyingUsd ? -1 : 1) : (isBuyingUsd ? 1 : -1),
          isCrossCurrency: true,
          sourceCurrency: isBuyingUsd ? "USD" : "HTG",
          targetCurrency: isBuyingUsd ? "HTG" : "USD",
          exchangeRateType: rateType,
          appliedExchangeRate: appliedRate,
          htgEquivalentCents: Math.round(fxHtgEquivalent * 100),
          counterpartyName: counterpartyName.trim() || "Client Change Devises",
          description: `Change devises: ${isBuyingUsd ? "Achat USD / Versement HTG" : "Vente USD / Encaissement HTG"} @ ${appliedRate}`,
          notes: notes.trim(),
          idempotencyKey
        });
        toast.success(`Opération de change enregistrée avec succès au taux gelé de ${appliedRate} HTG.`);
      }

      setAmountStr("");
      setCounterpartyName("");
      setDescription("");
      setNotes("");
      onTransactionSuccess();
      setActiveTab("STATEMENT");
    } catch (err: any) {
      setErrorMessage(err.message || "Erreur lors de l'enregistrement de la transaction de guichet.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-5 sm:p-6 text-slate-100 shadow-2xl relative max-h-[90vh] flex flex-col">
        {/* CLOSE BUTTON */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* HEADER */}
        <div className="flex items-center gap-3 mb-4 shrink-0">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white">Guichet & Opérations de Caisse</h2>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {till.currency}
              </span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {till.code || till.name}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Guichetier : <span className="text-slate-200 font-semibold">{currentUser.name}</span> • Session :{" "}
              <span className="font-mono text-cyan-400">{currentSession ? currentSession.id.slice(0, 16) + "..." : "Aucune"}</span>
            </p>
          </div>
        </div>

        {/* BALANCE HIGHLIGHT */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 mb-4 flex items-center justify-between shrink-0">
          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-500">Solde Actuel Disponible</span>
            <div className="text-xl font-bold font-mono text-emerald-400">
              {(till.balance_cents / 100).toLocaleString()} {till.currency}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-semibold text-slate-500">Compte Comptable Grand Livre</span>
            <div className="text-xs font-mono font-bold text-slate-300">
              {till.linked_account_code || (till.currency === "HTG" ? "1010" : "1020")} — {till.linked_account_name || "Caisse Centrale"}
            </div>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4 shrink-0">
          <button
            onClick={() => setActiveTab("TRANSACTION")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "TRANSACTION"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Coins className="w-3.5 h-3.5 text-emerald-400" />
            <span>Nouvelle Transaction Guichet</span>
          </button>

          <button
            onClick={() => setActiveTab("STATEMENT")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "STATEMENT"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span>Relevé de Caisse & Mouvements</span>
          </button>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* TAB 1: NEW TRANSACTION */}
        {activeTab === "TRANSACTION" ? (
          <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto pr-1 flex-1">
            {/* OPERATION TYPE SELECTOR */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Type d'Opération Guichet *
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTxType("ENCAISSEMENT")}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    txType === "ENCAISSEMENT"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm"
                      : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800"
                  }`}
                >
                  <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Encaissement</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTxType("DECAISSEMENT")}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    txType === "DECAISSEMENT"
                      ? "bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm"
                      : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800"
                  }`}
                >
                  <ArrowUpRight className="w-3.5 h-3.5 text-rose-400" />
                  <span>Décaissement</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTxType("FX")}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    txType === "FX"
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm"
                      : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800"
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Change Devises</span>
                </button>
              </div>
            </div>

            {/* FX SECTION */}
            {txType === "FX" && (
              <div className="bg-slate-950 p-3.5 rounded-xl border border-amber-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Sens de l'opération de Change</span>
                  </span>
                  <button
                    type="button"
                    onClick={loadRates}
                    disabled={isLoadingRates}
                    className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingRates ? "animate-spin" : ""}`} />
                    <span>Actualiser Taux</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFxDirection("BUY_USD");
                      loadRates();
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition text-left cursor-pointer ${
                      fxDirection === "BUY_USD"
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                        : "bg-slate-900 text-slate-400 border-slate-800"
                    }`}
                  >
                    <div className="font-bold">Achat Dollars (Client vend USD)</div>
                    <div className="text-[10px] text-slate-400">Versement de Gourdes (HTG)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFxDirection("SELL_USD");
                      loadRates();
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition text-left cursor-pointer ${
                      fxDirection === "SELL_USD"
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                        : "bg-slate-900 text-slate-400 border-slate-800"
                    }`}
                  >
                    <div className="font-bold">Vente Dollars (Client achète USD)</div>
                    <div className="text-[10px] text-slate-400">Encaissement de Gourdes (HTG)</div>
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1 text-xs text-slate-300">
                  <span>Taux appliqué ({rateType}) :</span>
                  <span className="font-mono font-bold text-amber-400">1 USD = {appliedRate.toFixed(4)} HTG</span>
                </div>
              </div>
            )}

            {/* AMOUNT INPUT */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Montant de l'opération ({till.currency}) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-emerald-400">
                  {till.currency}
                </span>
              </div>
            </div>

            {/* COUNTERPARTY */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nom du Client / Bénéficiaire *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  required
                  value={counterpartyName}
                  onChange={(e) => setCounterpartyName(e.target.value)}
                  placeholder="Ex : Jean Baptiste, Société S.A., etc."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* DESCRIPTION & NOTES */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Motif / Libellé
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex : Règlement facture 2026-001"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Remarques / Référence externe
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex : Récépissé #9842"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* SUBMIT BUTTON */}
            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              >
                Fermer
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isSubmitting ? "Enregistrement..." : "Valider & Imputer au Grand Livre"}</span>
              </button>
            </div>
          </form>
        ) : (
          /* TAB 2: TILL STATEMENT */
          <div className="space-y-4 overflow-y-auto pr-1 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">
                Relevé de Caisse en Temps Réel (Source : Grand Livre)
              </span>
              <button
                type="button"
                onClick={loadStatement}
                disabled={isLoadingStatement}
                className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingStatement ? "animate-spin" : ""}`} />
                <span>Actualiser</span>
              </button>
            </div>

            {isLoadingStatement ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Génération du relevé depuis les écritures comptables...
              </div>
            ) : !statement || statement.movements.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 bg-slate-950 rounded-xl border border-slate-800">
                Aucun mouvement enregistré pour cette session active.
              </div>
            ) : (
              <div className="space-y-3">
                {/* STATEMENT SUMMARY */}
                <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Total Entrées</span>
                    <span className="font-mono font-bold text-emerald-400">
                      +{((statement.totalInflowsCents ?? statement.total_inflows_cents ?? 0) / 100).toLocaleString()} {statement.currency}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Total Sorties</span>
                    <span className="font-mono font-bold text-rose-400">
                      -{((statement.totalOutflowsCents ?? statement.total_outflows_cents ?? 0) / 100).toLocaleString()} {statement.currency}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Solde Reconstitué</span>
                    <span className="font-mono font-bold text-cyan-300">
                      {((statement.closingBalanceCents ?? statement.closing_balance_cents ?? 0) / 100).toLocaleString()} {statement.currency}
                    </span>
                  </div>
                </div>

                {/* MOVEMENTS TABLE */}
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">Date / Heure</th>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Contrepartie / Réf</th>
                        <th className="py-2 px-3 text-right">Montant ({statement.currency})</th>
                        <th className="py-2 px-3 text-right">GL Ref</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {statement.movements.map((m) => {
                        const isInflow = m.inflow_cents > 0;
                        const amount = isInflow ? m.inflow_cents : m.outflow_cents;
                        return (
                          <tr key={m.id} className="hover:bg-slate-800/40 transition">
                            <td className="py-2 px-3 text-slate-400 text-[10px]">
                              {new Date(m.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td className="py-2 px-3">
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                  isInflow
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                }`}
                              >
                                {m.type}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-200 truncate max-w-[150px]">
                              {m.description || "N/A"}
                            </td>
                            <td
                              className={`py-2 px-3 text-right font-bold ${
                                isInflow ? "text-emerald-400" : "text-rose-400"
                              }`}
                            >
                              {isInflow ? "+" : "-"}
                              {(amount / 100).toLocaleString()}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-500 text-[9px] truncate max-w-[90px]">
                              {m.referenceId ? m.referenceId.slice(0, 10) + "..." : "GL"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
