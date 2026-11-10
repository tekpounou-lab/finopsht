import React, { useState, useEffect } from "react";
import { BranchSafe, CashTill, CurrencyCode } from "../../types/cashManagement";
import { CashTransferEngine, TransferUserContext } from "../../domains/cash/services/CashTransferEngine";
import {
  Vault,
  Building2,
  Landmark,
  ArrowRightLeft,
  X,
  Coins,
  CheckCircle2,
  ShieldCheck,
  FileCheck,
  AlertCircle,
  HelpCircle
} from "lucide-react";
import { toast } from "sonner";

interface FundSafeModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  branchId: string;
  safes: BranchSafe[];
  tills: CashTill[];
  preselectedSafe?: BranchSafe | null;
  currentUser: TransferUserContext;
  onFundSuccess: () => void;
}

type FundingMode = "BANK_WITHDRAWAL" | "INTER_SAFE" | "OWNER_INJECTION" | "TILL_RELIEF";

export const FundSafeModal: React.FC<FundSafeModalProps> = ({
  isOpen,
  onClose,
  businessId,
  branchId,
  safes,
  tills,
  preselectedSafe,
  currentUser,
  onFundSuccess
}) => {
  const [selectedSafeId, setSelectedSafeId] = useState<string>(
    preselectedSafe?.id || safes[0]?.id || ""
  );
  const [fundingMode, setFundingMode] = useState<FundingMode>("BANK_WITHDRAWAL");
  const [amountStr, setAmountStr] = useState<string>("");
  const [bankAccountCode, setBankAccountCode] = useState<string>("1110");
  const [bankReference, setBankReference] = useState<string>("");
  const [sourceSafeId, setSourceSafeId] = useState<string>("");
  const [sourceTillId, setSourceTillId] = useState<string>("");
  const [equityAccountCode, setEquityAccountCode] = useState<string>("3010");
  const [description, setDescription] = useState<string>("");
  const [autoExecute, setAutoExecute] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync selected safe when preselectedSafe or safes changes
  useEffect(() => {
    if (preselectedSafe) {
      setSelectedSafeId(preselectedSafe.id);
    } else if (safes.length > 0 && !selectedSafeId) {
      setSelectedSafeId(safes[0].id);
    }
  }, [preselectedSafe, safes]);

  if (!isOpen) return null;

  const currentSafe = safes.find((s) => s.id === selectedSafeId) || safes[0];
  const safeCurrency: CurrencyCode = currentSafe?.currency || "HTG";

  // Filter possible source safes (same currency, different ID)
  const candidateSourceSafes = safes.filter(
    (s) => s.id !== currentSafe?.id && s.currency === safeCurrency
  );

  // Filter candidate tills (same currency)
  const candidateTills = tills.filter((t) => t.currency === safeCurrency);

  // Default source IDs
  const activeSourceSafeId = sourceSafeId || candidateSourceSafes[0]?.id || "";
  const activeSourceTillId = sourceTillId || candidateTills[0]?.id || "";

  // Resolve Double-Entry Accounting Accounts from Plan Comptable
  const getDebitAccount = () => {
    if (safeCurrency === "HTG") {
      return { code: "1010", name: "Coffre-Fort Principal HTG (Classe 1 - Trésorerie)" };
    }
    return { code: "1020", name: "Coffre-Fort Principal USD (Classe 1 - Trésorerie)" };
  };

  const getCreditAccount = () => {
    switch (fundingMode) {
      case "BANK_WITHDRAWAL":
        if (bankAccountCode === "1110" || safeCurrency === "HTG") {
          return {
            code: "1110",
            name: "Banque HTG Principale (SOGEBANK / UNIBANK - Classe 1)"
          };
        }
        return {
          code: "1120",
          name: "Banque USD Commerciale (Classe 1 - Trésorerie)"
        };

      case "INTER_SAFE": {
        const srcSafe = safes.find((s) => s.id === activeSourceSafeId);
        return {
          code: "1910",
          name: `Transit Virement Inter-Coffres (${srcSafe?.name || "Coffre Émetteur"})`
        };
      }

      case "OWNER_INJECTION":
        if (equityAccountCode === "3010") {
          return {
            code: "3010",
            name: "Capital Social & Apports Associés (Classe 3 - Capitaux Propres)"
          };
        }
        return {
          code: "4550",
          name: "Compte Courant d'Associé / Exploitant (Classe 2 - Dettes)"
        };

      case "TILL_RELIEF": {
        const srcTill = tills.find((t) => t.id === activeSourceTillId);
        return {
          code: safeCurrency === "HTG" ? "1010" : "1020",
          name: `Caisse Guichet Délester (${srcTill?.name || "Caisse"})`
        };
      }
    }
  };

  const debitAcc = getDebitAccount();
  const creditAcc = getCreditAccount();

  const amountNumber = parseFloat(amountStr) || 0;
  const amountCents = Math.round(amountNumber * 100);

  const canDirectlyExecute = ["OWNER", "MANAGER", "ADMIN", "SUPER_ADMIN"].includes(
    (currentUser.role || "").toUpperCase()
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSafe) {
      toast.error("Veuillez sélectionner un coffre-fort destinataire.");
      return;
    }
    if (amountCents <= 0) {
      toast.error("Le montant doit être supérieur à zéro.");
      return;
    }

    if (fundingMode === "BANK_WITHDRAWAL" && !bankReference.trim()) {
      toast.error("Le numéro de bordereau de retrait ou de chèque est obligatoire.");
      return;
    }

    if (fundingMode === "INTER_SAFE" && !activeSourceSafeId) {
      toast.error("Veuillez sélectionner un coffre source émetteur.");
      return;
    }

    if (fundingMode === "TILL_RELIEF" && !activeSourceTillId) {
      toast.error("Veuillez sélectionner une caisse guichet émettrice.");
      return;
    }

    // Resolve source identifier and name
    let sourceId = "";
    let sourceName = "";

    if (fundingMode === "BANK_WITHDRAWAL") {
      sourceId = `BANK_${safeCurrency}_${bankAccountCode}`;
      sourceName =
        safeCurrency === "HTG"
          ? "Compte Bancaire HTG (SOGEBANK / UNIBANK)"
          : "Compte Bancaire USD Commercial";
    } else if (fundingMode === "INTER_SAFE") {
      const srcSafe = safes.find((s) => s.id === activeSourceSafeId);
      sourceId = activeSourceSafeId;
      sourceName = srcSafe?.name || "Coffre Source";
    } else if (fundingMode === "OWNER_INJECTION") {
      sourceId = `EQUITY_${equityAccountCode}`;
      sourceName =
        equityAccountCode === "3010"
          ? "Apport Capital Associé / Propriétaire"
          : "Compte Courant Associé";
    } else if (fundingMode === "TILL_RELIEF") {
      const srcTill = tills.find((t) => t.id === activeSourceTillId);
      sourceId = activeSourceTillId;
      sourceName = srcTill?.name || "Caisse Guichet";
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const desc =
      description.trim() ||
      `Alimentation de réserve ${currentSafe.name} depuis ${sourceName}${
        bankReference ? ` (Réf: ${bankReference})` : ""
      }`;

    try {
      const result = await CashTransferEngine.fundSafe(
        businessId,
        branchId,
        {
          safeId: currentSafe.id,
          safeName: currentSafe.name,
          currency: safeCurrency,
          amountCents,
          fundingCategory: fundingMode,
          sourceId,
          sourceName,
          bankReference: bankReference.trim() || undefined,
          debitAccountCode: debitAcc.code,
          debitAccountName: debitAcc.name,
          creditAccountCode: creditAcc.code,
          creditAccountName: creditAcc.name,
          description: desc,
          autoExecute: autoExecute && canDirectlyExecute
        },
        currentUser
      );

      if (result.status === "EXECUTED") {
        toast.success(
          `Alimentation réussie ! ${(amountCents / 100).toLocaleString()} ${safeCurrency} crédités au coffre "${currentSafe.name}" et comptabilisés au Grand Livre.`
        );
      } else {
        toast.info(
          `Demande d'alimentation de ${(amountCents / 100).toLocaleString()} ${safeCurrency} initiée et transmise à la file Maker-Checker.`
        );
      }

      onFundSuccess();
      onClose();
    } catch (err: any) {
      console.error("[FundSafeModal] Error:", err);
      setErrorMessage(err.message || "Erreur lors de l'alimentation du coffre.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 text-slate-100 shadow-2xl relative space-y-5 my-8">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Alimentation de Coffre-Fort (Safe Funding)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-medium">
                  Grand Livre & Plan Comptable
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Approvisionnement des liquidités de réserve avec écriture en partie double
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* COFFRE BENEFICIAIRE */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Vault className="w-3.5 h-3.5 text-amber-400" />
                <span>Coffre-Fort Destinataire *</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                Solde actuel : {((currentSafe?.balance_cents || 0) / 100).toLocaleString()}{" "}
                {safeCurrency}
              </span>
            </label>
            <select
              value={selectedSafeId}
              onChange={(e) => {
                setSelectedSafeId(e.target.value);
                setSourceSafeId("");
                setSourceTillId("");
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-100 font-medium focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              {safes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.currency}) — Solde: {((s.balance_cents || 0) / 100).toLocaleString()} {s.currency}
                </option>
              ))}
            </select>
          </div>

          {/* MODE D'ALIMENTATION */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Source d'Approvisionnement (Origine des Fonds) *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setFundingMode("BANK_WITHDRAWAL")}
                className={`p-2.5 rounded-xl text-xs font-bold border transition flex flex-col items-center gap-1 cursor-pointer ${
                  fundingMode === "BANK_WITHDRAWAL"
                    ? "bg-blue-600/20 text-blue-400 border-blue-500/50 shadow-sm"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800"
                }`}
              >
                <Landmark className="w-4 h-4" />
                <span>Banque</span>
                <span className="text-[9px] font-mono text-slate-500 font-normal">Compte 1110</span>
              </button>

              <button
                type="button"
                onClick={() => setFundingMode("INTER_SAFE")}
                className={`p-2.5 rounded-xl text-xs font-bold border transition flex flex-col items-center gap-1 cursor-pointer ${
                  fundingMode === "INTER_SAFE"
                    ? "bg-purple-600/20 text-purple-400 border-purple-500/50 shadow-sm"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800"
                }`}
              >
                <Vault className="w-4 h-4" />
                <span>Autre Coffre</span>
                <span className="text-[9px] font-mono text-slate-500 font-normal">Transit 1910</span>
              </button>

              <button
                type="button"
                onClick={() => setFundingMode("OWNER_INJECTION")}
                className={`p-2.5 rounded-xl text-xs font-bold border transition flex flex-col items-center gap-1 cursor-pointer ${
                  fundingMode === "OWNER_INJECTION"
                    ? "bg-emerald-600/20 text-emerald-400 border-emerald-500/50 shadow-sm"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800"
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>Apport Associé</span>
                <span className="text-[9px] font-mono text-slate-500 font-normal">Capital 3010</span>
              </button>

              <button
                type="button"
                onClick={() => setFundingMode("TILL_RELIEF")}
                className={`p-2.5 rounded-xl text-xs font-bold border transition flex flex-col items-center gap-1 cursor-pointer ${
                  fundingMode === "TILL_RELIEF"
                    ? "bg-amber-600/20 text-amber-400 border-amber-500/50 shadow-sm"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800"
                }`}
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>Caisse Guichet</span>
                <span className="text-[9px] font-mono text-slate-500 font-normal">Délestage</span>
              </button>
            </div>
          </div>

          {/* DÉTAILS SPÉCIFIQUES SELON LA SOURCE */}
          {fundingMode === "BANK_WITHDRAWAL" && (
            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  Compte Bancaire Émetteur (Plan Comptable)
                </span>
                <span className="text-[10px] text-blue-400 font-mono">
                  Bordereau / Slip Requis
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Compte Banque {safeCurrency}
                  </label>
                  <select
                    value={bankAccountCode}
                    onChange={(e) => setBankAccountCode(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                  >
                    {safeCurrency === "HTG" ? (
                      <option value="1110">1110 - Banque HTG Principale (SOGEBANK / UNIBANK)</option>
                    ) : (
                      <option value="1120">1120 - Banque USD Commerciale (SOGEBANK / BUH)</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Réf. Bordereau Retrait / N° Chèque *
                  </label>
                  <input
                    type="text"
                    value={bankReference}
                    onChange={(e) => setBankReference(e.target.value)}
                    placeholder="Ex: BDR-2026-0912 ou CHQ-00445"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {fundingMode === "INTER_SAFE" && (
            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Coffre Émetteur (Doit détenir la devise {safeCurrency})
              </label>
              {candidateSourceSafes.length === 0 ? (
                <p className="text-xs text-amber-400">
                  Aucun autre coffre enregistré en devise {safeCurrency}.
                </p>
              ) : (
                <select
                  value={activeSourceSafeId}
                  onChange={(e) => setSourceSafeId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-200"
                >
                  {candidateSourceSafes.map((cs) => (
                    <option key={cs.id} value={cs.id}>
                      {cs.name} — Réserve disponible: {((cs.balance_cents || 0) / 100).toLocaleString()}{" "}
                      {cs.currency}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {fundingMode === "OWNER_INJECTION" && (
            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Imputation Comptable de l'Apport (Contrepartie Passif / Capitaux)
              </label>
              <select
                value={equityAccountCode}
                onChange={(e) => setEquityAccountCode(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-200"
              >
                <option value="3010">3010 - Capital Social & Apports Associés (Fonds Propres)</option>
                <option value="4550">4550 - Compte Courant d'Associé (Dette Court Terme)</option>
              </select>
            </div>
          )}

          {fundingMode === "TILL_RELIEF" && (
            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Tiroir-Caisse Guichet Émetteur ({safeCurrency})
              </label>
              {candidateTills.length === 0 ? (
                <p className="text-xs text-amber-400">
                  Aucune caisse guichet enregistrée en devise {safeCurrency}.
                </p>
              ) : (
                <select
                  value={activeSourceTillId}
                  onChange={(e) => setSourceTillId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-200"
                >
                  {candidateTills.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (Opéré par {t.assigned_teller_name || "Caissier"}) — Solde:{" "}
                      {((t.balance_cents || 0) / 100).toLocaleString()} {t.currency}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* MONTANT */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Montant à Créditer au Coffre ({safeCurrency}) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500 pr-16"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-slate-400">
                  {safeCurrency}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Motif / Description de l'Opération
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Approvisionnement hebdomadaire de succursale"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* VISUALISATION DE L'ÉCRITURE COMPTABLE EN DOUBLE ENTRÉE (GRAND LIVRE) */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-emerald-400" />
                <span>Écriture Grand Livre Générée (Partie Double)</span>
              </span>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Équilibrée (Débit = Crédit)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 text-[10px]">
                    <th className="pb-1">Sens</th>
                    <th className="pb-1">Compte Plan Comptable</th>
                    <th className="pb-1 text-right">Débit ({safeCurrency})</th>
                    <th className="pb-1 text-right">Crédit ({safeCurrency})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900 text-slate-300">
                  <tr>
                    <td className="py-1.5 text-emerald-400 font-bold">DÉBIT (+)</td>
                    <td className="py-1.5">
                      <span className="font-bold text-white">{debitAcc.code}</span> —{" "}
                      <span>{debitAcc.name}</span>
                    </td>
                    <td className="py-1.5 text-right font-bold text-emerald-400">
                      {amountNumber > 0 ? amountNumber.toLocaleString() : "0.00"}
                    </td>
                    <td className="py-1.5 text-right text-slate-600">-</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-rose-400 font-bold">CRÉDIT (-)</td>
                    <td className="py-1.5">
                      <span className="font-bold text-white">{creditAcc.code}</span> —{" "}
                      <span>{creditAcc.name}</span>
                    </td>
                    <td className="py-1.5 text-right text-slate-600">-</td>
                    <td className="py-1.5 text-right font-bold text-rose-400">
                      {amountNumber > 0 ? amountNumber.toLocaleString() : "0.00"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-900 flex items-center justify-between">
              <span>Législation : Mouvement de trésorerie neutre sur le P&L (Aucune charge fictive).</span>
              <span className="text-amber-400 font-mono">FINAYITI GL Engine</span>
            </p>
          </div>

          {/* GOUVERNANCE / MAKER-CHECKER OPTIONS */}
          {canDirectlyExecute && (
            <div className="flex items-center gap-2.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <input
                type="checkbox"
                id="chk_auto_execute"
                checked={autoExecute}
                onChange={(e) => setAutoExecute(e.target.checked)}
                className="w-4 h-4 text-amber-500 rounded bg-slate-950 border-slate-800 cursor-pointer"
              />
              <label htmlFor="chk_auto_execute" className="text-xs text-slate-200 cursor-pointer">
                <span className="font-semibold text-amber-300">
                  Exécuter et comptabiliser immédiatement au Grand Livre
                </span>
                <span className="block text-[10px] text-slate-400">
                  Votre rôle ({currentUser.role}) vous accorde l'autorité de validation directe des alimentations de coffre.
                </span>
              </label>
            </div>
          )}

          {/* ACTIONS */}
          <div className="pt-2 flex justify-end gap-2.5 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting || amountCents <= 0}
              className="px-5 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-amber-900/40 disabled:opacity-50 cursor-pointer"
            >
              <Coins className="w-3.5 h-3.5" />
              <span>
                {isSubmitting
                  ? "Comptabilisation..."
                  : autoExecute && canDirectlyExecute
                  ? "Alimenter & Enregistrer au GL"
                  : "Soumettre pour Approbation"}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
