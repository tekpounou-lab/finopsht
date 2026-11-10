import React, { useState } from "react";
import { CashTill, CustomerTransfer } from "../../types/cashManagement";
import { CustomerTransferRepository } from "../../repositories/CustomerTransferRepository";
import { TransferPayoutEngine } from "../../domains/cash/services/TransferPayoutEngine";
import { 
  Search, 
  Banknote, 
  User, 
  Phone, 
  FileText, 
  CheckCircle2, 
  X, 
  AlertCircle,
  Clock,
  MapPin
} from "lucide-react";
import { toast } from "sonner";

interface TransferPayoutDialogProps {
  isOpen: boolean;
  onClose: () => void;
  till: CashTill;
  businessId: string;
  branchId: string;
  operatorId: string;
  operatorName: string;
  onSuccess?: () => void;
}

export const TransferPayoutDialog: React.FC<TransferPayoutDialogProps> = ({
  isOpen,
  onClose,
  till,
  businessId,
  branchId,
  operatorId,
  operatorName,
  onSuccess
}) => {
  const [step, setStep] = useState<"SEARCH" | "CONFIRM" | "SUCCESS">("SEARCH");
  const [reference, setReference] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [transfer, setTransfer] = useState<CustomerTransfer | null>(null);
  const [idDocument, setIdDocument] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [payoutResult, setPayoutResult] = useState<CustomerTransfer | null>(null);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reference.trim()) return;

    setIsSearching(true);
    try {
      const result = await CustomerTransferRepository.getByReference(businessId, reference.trim());
      if (result) {
        if (result.status !== "READY_FOR_PAYOUT") {
          toast.error(`Ce transfert n'est pas payable (Statut: ${result.status})`);
          return;
        }
        if (result.currency !== till.currency) {
          toast.error(`Devise incompatible : Le transfert est en ${result.currency} mais cette caisse est en ${till.currency}.`);
          return;
        }
        setTransfer(result);
        setStep("CONFIRM");
      } else {
        toast.error("Aucun transfert trouvé avec cette référence.");
      }
    } catch (err) {
      toast.error("Erreur lors de la recherche du transfert.");
    } finally {
      setIsSearching(false);
    }
  };

  const handlePayout = async () => {
    if (!transfer || !idDocument.trim()) {
      toast.error("Le numéro de la pièce d'identité du bénéficiaire est obligatoire.");
      return;
    }

    if (till.balance_cents < transfer.amount_cents) {
      toast.error("Encaisse insuffisante pour payer ce transfert.");
      return;
    }

    setIsProcessing(true);
    try {
      let result: CustomerTransfer;
      const { auth } = await import("../../lib/firebase");
      const currentUser = auth.currentUser;
      const token = currentUser ? await currentUser.getIdToken() : "";

      if (token) {
        const response = await fetch("/api/cash/transfers/payout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            businessId,
            branchId,
            transferId: transfer.id,
            tillId: till.id,
            sessionId: till.active_session_id || "",
            idDocument: idDocument.trim(),
            businessDate: new Date().toISOString().split("T")[0]
          })
        });

        const resData = await response.json();
        if (!response.ok) {
          throw new Error(resData.message || resData.error || "Erreur lors du paiement du transfert.");
        }
        result = resData.transfer;
      } else {
        // Fallback for isolated local test mode
        result = await TransferPayoutEngine.executePayout({
          businessId,
          branchId,
          transferId: transfer.id,
          tillId: till.id,
          sessionId: till.active_session_id || "",
          operatorId,
          operatorName,
          idDocument: idDocument.trim(),
          businessDate: new Date().toISOString().split("T")[0]
        }, {
          id: operatorId,
          name: operatorName
        });
      }

      setPayoutResult(result);
      setStep("SUCCESS");
      toast.success("Paiement effectué avec succès !");
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error("Payout error:", err);
      toast.error(err.message || "Erreur lors du paiement du transfert.");
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setStep("SEARCH");
    setReference("");
    setTransfer(null);
    setIdDocument("");
    setPayoutResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* HEADER */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
              <Banknote className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Paiement de Transfert</h2>
              <p className="text-xs text-slate-400">Guichet : {till.name}</p>
            </div>
          </div>
          <button 
            onClick={reset}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTENT */}
        <div className="p-6">
          {step === "SEARCH" && (
            <div className="space-y-6">
              <div className="bg-blue-500/5 border border-blue-500/10 p-4 rounded-2xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-300 leading-relaxed">
                  Saisissez la référence du transfert fourni par le client. Le système vérifiera l'éligibilité, le montant et la devise avant d'autoriser le décaissement.
                </p>
              </div>

              <form onSubmit={handleSearch} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                    Référence du Transfert
                  </label>
                  <div className="relative">
                    <Search className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      autoFocus
                      type="text"
                      value={reference}
                      onChange={(e) => setReference(e.target.value.toUpperCase())}
                      placeholder="Ex: TRF-12345678"
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 pl-11 pr-4 text-white focus:outline-none focus:border-blue-500 transition-all font-mono text-lg tracking-widest uppercase"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSearching || !reference.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-2xl transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
                >
                  {isSearching ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Search className="w-5 h-5" />
                  )}
                  <span>Rechercher le Transfert</span>
                </button>
              </form>
            </div>
          )}

          {step === "CONFIRM" && transfer && (
            <div className="space-y-6">
              {/* DETAILS CARD */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="p-4 bg-slate-900/50 border-b border-slate-800 flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Détails du Transfert</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold font-mono">
                    PRÊT POUR PAIEMENT
                  </span>
                </div>
                
                <div className="p-4 space-y-4">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-semibold">Montant à payer</p>
                      <p className="text-3xl font-black text-white font-mono">
                        {(transfer.amount_cents / 100).toLocaleString()} <span className="text-blue-400">{transfer.currency}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500 uppercase font-semibold">Référence</p>
                      <p className="text-sm font-bold text-slate-200 font-mono tracking-tighter">{transfer.reference}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-[10px] text-slate-500 uppercase font-bold">Expéditeur</span>
                      </div>
                      <div className="pl-5.5">
                        <p className="text-xs font-bold text-slate-200">{transfer.sender_name}</p>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {transfer.sender_country || "N/A"}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-[10px] text-slate-500 uppercase font-bold">Bénéficiaire</span>
                      </div>
                      <div className="pl-5.5">
                        <p className="text-xs font-bold text-slate-200">{transfer.beneficiary_name}</p>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {transfer.beneficiary_phone || "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ID DOCUMENT INPUT */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                  Pièce d'Identité (CIN/NIF/Passeport)
                </label>
                <input
                  autoFocus
                  type="text"
                  value={idDocument}
                  onChange={(e) => setIdDocument(e.target.value)}
                  placeholder="Obligatoire pour validation"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500 transition-all font-semibold"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep("SEARCH")}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3.5 rounded-2xl transition-all border border-slate-700"
                >
                  Retour
                </button>
                <button
                  onClick={handlePayout}
                  disabled={isProcessing || !idDocument.trim()}
                  className="flex-[2] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-2xl transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Banknote className="w-5 h-5" />
                  )}
                  <span>Confirmer le Paiement</span>
                </button>
              </div>
            </div>
          )}

          {step === "SUCCESS" && payoutResult && (
            <div className="py-8 text-center space-y-6">
              <div className="w-20 h-20 bg-emerald-500/20 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-4 scale-in animate-in duration-500">
                <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-white tracking-tight">Paiement Terminé !</h3>
                <p className="text-slate-400 text-sm max-w-xs mx-auto">
                  Le transfert <span className="text-slate-200 font-mono font-bold">{payoutResult.reference}</span> a été payé avec succès.
                </p>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3 max-w-sm mx-auto text-left">
                <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold uppercase">
                  <span>Reçu de Paiement</span>
                  <span>{new Date(payoutResult.paid_at || "").toLocaleDateString()}</span>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-400">Montant Décaissé :</p>
                  <p className="text-xl font-black text-emerald-400 font-mono">
                    {(payoutResult.amount_cents / 100).toLocaleString()} {payoutResult.currency}
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-800 space-y-1">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Bénéficiaire</p>
                  <p className="text-xs font-bold text-slate-200">{payoutResult.beneficiary_name}</p>
                  <p className="text-[10px] text-slate-500 font-mono">ID: {payoutResult.beneficiary_id_document}</p>
                </div>
              </div>

              <button
                onClick={reset}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-2xl transition-all border border-slate-700 mt-4"
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
