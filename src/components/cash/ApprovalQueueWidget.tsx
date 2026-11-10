import React, { useState } from "react";
import { InternalTransfer } from "../../types/cashManagement";
import { TransferUserContext } from "../../domains/cash/services/CashTransferEngine";
import { auth } from "../../lib/firebase";
import { Check, X, ShieldAlert, Clock, UserCheck } from "lucide-react";

interface ApprovalQueueWidgetProps {
  transfers: InternalTransfer[];
  currentUser: TransferUserContext;
  onTransferUpdated: () => void;
}

export const ApprovalQueueWidget: React.FC<ApprovalQueueWidgetProps> = ({
  transfers,
  currentUser,
  onTransferUpdated
}) => {
  const pendingTransfers = transfers.filter((t) => t.status === "PENDING_APPROVAL");

  const [rejectingTransferId, setRejectingTransferId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleApprove = async (transfer: InternalTransfer) => {
    setProcessingId(transfer.id);
    setErrorMessage(null);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";
      const idempotencyKey = `idemp_app_${transfer.id}_${Date.now()}`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`/api/cash/transfers/internal/${encodeURIComponent(transfer.id)}/approve`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          businessId: transfer.business_id,
          approvalNotes: "Approuvé depuis la console de trésorerie",
          idempotencyKey
        })
      });

      const resData = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Session expirée ou non authentifiée. Veuillez vous reconnecter.");
        }
        if (response.status === 403) {
          if (resData.error === "MAKER_CHECKER_VIOLATION" || resData.message?.includes("Maker-Checker")) {
            throw new Error("Séparation des tâches (Maker-Checker) : vous ne pouvez pas approuver votre propre virement.");
          }
          throw new Error(resData.message || "Accès refusé : rôle insuffisant pour approuver ce transfert.");
        }
        if (response.status === 409) {
          throw new Error(resData.message || "Ce transfert a déjà été exécuté ou est en cours.");
        }
        if (response.status === 422) {
          throw new Error(resData.message || "Impossible d'exécuter : solde insuffisant ou session de caisse inactive.");
        }
        throw new Error(resData.message || resData.error || `Erreur serveur (${response.status})`);
      }

      onTransferUpdated();
    } catch (err: any) {
      setErrorMessage(err.message || "Erreur lors de l'approbation du transfert.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmReject = async (transfer: InternalTransfer) => {
    if (!rejectionReason || rejectionReason.trim().length < 5) {
      setErrorMessage("Le motif de refus doit comporter au moins 5 caractères.");
      return;
    }

    setProcessingId(transfer.id);
    setErrorMessage(null);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`/api/cash/transfers/internal/${encodeURIComponent(transfer.id)}/reject`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          businessId: transfer.business_id,
          rejectionReason: rejectionReason.trim()
        })
      });

      const resData = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Session expirée ou non authentifiée. Veuillez vous reconnecter.");
        }
        if (response.status === 403) {
          throw new Error(resData.message || "Accès refusé : rôle insuffisant pour rejeter ce transfert.");
        }
        if (response.status === 409) {
          throw new Error(resData.message || "Ce transfert est déjà dans un état terminal.");
        }
        throw new Error(resData.message || resData.error || `Erreur lors du rejet (${response.status})`);
      }

      setRejectingTransferId(null);
      setRejectionReason("");
      onTransferUpdated();
    } catch (err: any) {
      setErrorMessage(err.message || "Erreur lors du rejet du transfert.");
    } finally {
      setProcessingId(null);
    }
  };

  if (pendingTransfers.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
        <div className="inline-flex p-3 bg-slate-800 text-slate-400 rounded-full mb-2">
          <Clock className="w-5 h-5" />
        </div>
        <p className="text-xs font-medium text-slate-300">Aucun transfert en attente d'approbation</p>
        <p className="text-[11px] text-slate-500 mt-1">Tous les mouvements de fonds ont été traités.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            File d'Approbation Maker-Checker ({pendingTransfers.length})
          </h3>
        </div>
        <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-medium">
          Approbation Requis
        </span>
      </div>

      {errorMessage && (
        <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
        {pendingTransfers.map((transfer) => {
          const isSelfInitiated = transfer.initiator_id === currentUser.id;

          return (
            <div
              key={transfer.id}
              className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-white">
                    {transfer.source_name} ➔ {transfer.destination_name}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {transfer.description} • Initié par{" "}
                    <span className="text-slate-200 font-medium">{transfer.initiator_name}</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-amber-400 text-sm">
                    {(transfer.amount_cents / 100).toLocaleString()} {transfer.currency}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {new Date(transfer.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>

              {isSelfInitiated ? (
                <div className="p-2 bg-slate-900 border border-slate-800 rounded-md text-[11px] text-slate-400 flex items-center justify-between">
                  <span>🔒 Maker-Checker : Vous ne pouvez pas approuver votre propre virement</span>
                  <span className="text-[10px] text-slate-500 font-mono">En attente Manager</span>
                </div>
              ) : (
                <div className="pt-2 border-t border-slate-900 flex items-center justify-end gap-2">
                  {rejectingTransferId === transfer.id ? (
                    <div className="w-full flex items-center gap-2">
                      <input
                        type="text"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Motif de refus obligatoire..."
                        className="flex-1 bg-slate-900 border border-red-500/30 rounded-md px-2 py-1 text-xs text-white focus:outline-hidden"
                      />
                      <button
                        onClick={() => handleConfirmReject(transfer)}
                        disabled={processingId === transfer.id}
                        className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded-md font-medium text-xs transition"
                      >
                        Confirmer Refus
                      </button>
                      <button
                        onClick={() => setRejectingTransferId(null)}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-xs transition"
                      >
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => setRejectingTransferId(transfer.id)}
                        disabled={processingId === transfer.id}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-300 rounded-md font-medium transition flex items-center gap-1.5"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Rejeter</span>
                      </button>

                      <button
                        onClick={() => handleApprove(transfer)}
                        disabled={processingId === transfer.id}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md font-medium transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approuver & Exécuter</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
