import React, { useState, useMemo } from "react";
import { CashTill, BranchSafe, CurrencyCode } from "../../types/cashManagement";
import { TransferUserContext } from "../../domains/cash/services/CashTransferEngine";
import { auth } from "../../lib/firebase";
import { isBranchScopedTellerRole, normalizeRole } from "../../domains/rbac/operationalProfilePolicy";
import { X, ArrowRightLeft, ShieldAlert } from "lucide-react";
import SearchableSelect from "../ui/SearchableSelect";

interface InternalTransferDialogProps {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  branchId: string;
  tills: CashTill[];
  safes: BranchSafe[];
  currentUser: TransferUserContext;
  onTransferCreated: () => void;
}

const TRANSFER_INITIATOR_ROLES = new Set<string>([
  "SUPER_ADMIN",
  "OWNER",
  "ADMIN",
  "MANAGER",
  "MASTER_HEAD_TELLER",
  "HEAD_TELLER",
  "SENIOR_TELLER"
]);

export const InternalTransferDialog: React.FC<InternalTransferDialogProps> = ({
  isOpen,
  onClose,
  businessId,
  branchId,
  tills,
  safes,
  currentUser,
  onTransferCreated
}) => {
  const normalizedRole = normalizeRole(currentUser?.role);
  const canInitiateTransfer = Boolean(normalizedRole && TRANSFER_INITIATOR_ROLES.has(normalizedRole));
  const actorBranchId = (currentUser?.branch_id || currentUser?.branchId || branchId || "").trim();
  const isBranchScopedTeller = isBranchScopedTellerRole(normalizedRole);

  const scopedSafes = useMemo(() => {
    if (!isBranchScopedTeller) return safes;
    if (!actorBranchId) return [];
    return safes.filter((s) => !s.branch_id || s.branch_id === actorBranchId);
  }, [safes, isBranchScopedTeller, actorBranchId]);

  const scopedTills = useMemo(() => {
    if (!isBranchScopedTeller) return tills;
    if (!actorBranchId) return [];
    return tills.filter((t) => !t.branch_id || t.branch_id === actorBranchId);
  }, [tills, isBranchScopedTeller, actorBranchId]);

  const [sourceType, setSourceType] = useState<"TILL" | "SAFE" | "BANK">("SAFE");
  const [sourceId, setSourceId] = useState<string>(scopedSafes[0]?.id || "");
  const [destType, setDestType] = useState<"TILL" | "SAFE" | "BANK">("TILL");
  const [destId, setDestId] = useState<string>(scopedTills[0]?.id || "");
  const [currency, setCurrency] = useState<CurrencyCode>("HTG");
  const [amountStr, setAmountStr] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const safeOptions = scopedSafes.map((s) => ({
    id: s.id,
    name: `${s.name} (Solde : ${(s.balance_cents / 100).toLocaleString()} ${s.currency})`
  }));

  const tillOptions = scopedTills.map((t) => ({
    id: t.id,
    name: `${t.name} (Solde : ${(t.balance_cents / 100).toLocaleString()} ${t.currency})`
  }));

  const handleSourceTypeChange = (type: "TILL" | "SAFE" | "BANK") => {
    setSourceType(type);
    if (type === "SAFE") setSourceId(scopedSafes[0]?.id || "");
    else if (type === "TILL") setSourceId(scopedTills[0]?.id || "");
    else setSourceId("BANK_SOGEBANK_HTG");
  };

  const handleDestTypeChange = (type: "TILL" | "SAFE" | "BANK") => {
    setDestType(type);
    if (type === "TILL") setDestId(scopedTills[0]?.id || "");
    else if (type === "SAFE") setDestId(scopedSafes[0]?.id || "");
    else setDestId("BANK_SOGEBANK_HTG");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canInitiateTransfer) {
      setErrorMessage(
        `Accès refusé : le rôle (${normalizedRole || "INCONNU"}) n'est pas autorisé à initier un transfert interne.`
      );
      return;
    }
    if (isBranchScopedTeller && !actorBranchId) {
      setErrorMessage("Succursale assignée manquante : impossible d'initier un transfert sans branch_id.");
      return;
    }
    if (sourceType === destType && sourceId === destId) {
      setErrorMessage("La source et la destination ne peuvent pas être identiques.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const amountCents = Math.round((parseFloat(amountStr) || 0) * 100);
      if (amountCents <= 0) {
        throw new Error("Le montant du transfert doit être un entier positif supérieur à zéro.");
      }

      const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";
      if (!token) {
        throw new Error("Session expirée ou non authentifiée. Veuillez vous reconnecter.");
      }

      const idempotencyKey = `idemp_req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "x-business-id": businessId,
        "Idempotency-Key": idempotencyKey
      };

      const response = await fetch("/api/cash/transfers/internal/request", {
        method: "POST",
        headers,
        body: JSON.stringify({
          businessId,
          ...(actorBranchId ? { branchId: actorBranchId } : {}),
          sourceType,
          sourceId,
          destinationType: destType,
          destinationId: destId,
          amountCents,
          currency,
          reason: description.trim() || "Transfert interne de fonds",
          idempotencyKey
        })
      });

      const resData = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Session expirée ou non authentifiée. Veuillez vous reconnecter.");
        }
        if (response.status === 403) {
          throw new Error(resData.message || "Accès refusé : vous n'avez pas l'autorisation d'initier ce transfert.");
        }
        if (response.status === 422) {
          throw new Error(resData.message || "Conditions de transfert non satisfaites.");
        }
        throw new Error(resData.message || resData.error || `Erreur serveur (${response.status})`);
      }

      onTransferCreated();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Erreur lors de l'initiation du transfert.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 text-slate-100 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg">
            <ArrowRightLeft className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Nouveau Transfert Interne de Fonds</h3>
            <p className="text-xs text-slate-400">
              Mouvements Caisse ↔ Coffre ↔ Banque (Soumis à validation Maker-Checker)
            </p>
          </div>
        </div>

        {!canInitiateTransfer ? (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>
              Accès refusé : le rôle ({normalizedRole || "INCONNU"}) n'est pas autorisé à initier un transfert interne.
            </span>
          </div>
        ) : isBranchScopedTeller && !actorBranchId ? (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>
              Succursale assignée manquante : impossible d'initier un transfert sans branch_id.
            </span>
          </div>
        ) : null}

        {errorMessage && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* SOURCE */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
            <label className="block text-xs font-semibold text-slate-300">Emplacement Source</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSourceTypeChange("SAFE")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${
                  sourceType === "SAFE"
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                Coffre
              </button>
              <button
                type="button"
                onClick={() => handleSourceTypeChange("TILL")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${
                  sourceType === "TILL"
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                Caisse
              </button>
              <button
                type="button"
                onClick={() => handleSourceTypeChange("BANK")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${
                  sourceType === "BANK"
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                Banque
              </button>
            </div>

            {sourceType === "SAFE" && (
              <SearchableSelect
                options={safeOptions}
                value={sourceId}
                onChange={setSourceId}
                placeholder="Tapez pour rechercher un coffre source..."
              />
            )}

            {sourceType === "TILL" && (
              <SearchableSelect
                options={tillOptions}
                value={sourceId}
                onChange={setSourceId}
                placeholder="Tapez pour rechercher une caisse source..."
              />
            )}
          </div>

          {/* DESTINATION */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
            <label className="block text-xs font-semibold text-slate-300">Emplacement Destination</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleDestTypeChange("TILL")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${
                  destType === "TILL"
                    ? "bg-emerald-600 border-emerald-500 text-white"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                Caisse
              </button>
              <button
                type="button"
                onClick={() => handleDestTypeChange("SAFE")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${
                  destType === "SAFE"
                    ? "bg-emerald-600 border-emerald-500 text-white"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                Coffre
              </button>
              <button
                type="button"
                onClick={() => handleDestTypeChange("BANK")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${
                  destType === "BANK"
                    ? "bg-emerald-600 border-emerald-500 text-white"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                Banque
              </button>
            </div>

            {destType === "TILL" && (
              <SearchableSelect
                options={tillOptions}
                value={destId}
                onChange={setDestId}
                placeholder="Tapez pour rechercher une caisse destination..."
              />
            )}

            {destType === "SAFE" && (
              <SearchableSelect
                options={safeOptions}
                value={destId}
                onChange={setDestId}
                placeholder="Tapez pour rechercher un coffre destination..."
              />
            )}
          </div>

          {/* AMOUNT & CURRENCY */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">Montant à transférer</label>
              <input
                type="number"
                step="0.01"
                required
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-hidden focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Devise</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-hidden"
              >
                <option value="HTG">HTG (Gourdes)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
          </div>

          {/* DESCRIPTION */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Motif du virement</label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ex: Alimentation caisse du matin / Dégagement mi-journée"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[11px] text-amber-400">
            <strong>Règle Maker-Checker :</strong> Ce virement restera en attente d'approbation. Vous ne pourrez pas le valider vous-même.
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
              type="submit"
              disabled={isSubmitting || !canInitiateTransfer || (isBranchScopedTeller && !actorBranchId)}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition shadow-lg shadow-blue-600/20"
            >
              Soumettre pour Approbation
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
