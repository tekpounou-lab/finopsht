import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Building2, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  User, 
  Mail, 
  Calendar, 
  FileText, 
  ShieldCheck, 
  AlertCircle, 
  Loader2, 
  Briefcase, 
  CreditCard,
  Search,
  Filter
} from "lucide-react";
import { PendingBusinessRepository } from "../../../repositories/PendingBusinessRepository";
import { PendingBusiness } from "../../../types";
import { useAuth } from "../../../hooks/useAuth";
import { toast } from "sonner";

interface AdminPendingBusinessesProps {
  onApprovalSuccess?: (businessId: string) => void;
}

export const AdminPendingBusinesses: React.FC<AdminPendingBusinessesProps> = ({ onApprovalSuccess }) => {
  const { user } = useAuth();
  const [pendingList, setPendingList] = useState<PendingBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Reject modal state
  const [rejectingItem, setRejectingItem] = useState<PendingBusiness | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  // Subscribe to all pending businesses via repository
  useEffect(() => {
    setLoading(true);
    console.debug("[AdminPendingBusinesses] Subscribing to listenAllPending on /pending_businesses with query filter: status == 'PENDING'");
    const unsubscribe = PendingBusinessRepository.listenAllPending((records) => {
      console.debug(`[AdminPendingBusinesses] Received ${records.length} pending business records:`, records);
      setPendingList(records);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleApprove = async (item: PendingBusiness) => {
    const adminUid = user?.uid;
    if (!adminUid) {
      toast.error("Session Super Admin requise.");
      return;
    }

    setActionLoadingId(item.id);
    try {
      const result = await PendingBusinessRepository.approve(item.id, adminUid);
      toast.success(`Entreprise "${item.businessName}" approuvée avec succès !`);
      if (onApprovalSuccess) {
        onApprovalSuccess(result.businessId);
      }
    } catch (err: any) {
      console.error("[AdminPendingBusinesses] Approve error:", err);
      toast.error(`Erreur d'approbation : ${err.message || err}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const openRejectModal = (item: PendingBusiness) => {
    setRejectingItem(item);
    setRejectionReason("");
  };

  const handleConfirmReject = async () => {
    if (!rejectingItem) return;
    const adminUid = user?.uid;
    if (!adminUid) {
      toast.error("Session Super Admin requise.");
      return;
    }

    setIsRejecting(true);
    try {
      await PendingBusinessRepository.reject(rejectingItem.id, adminUid, rejectionReason.trim() || undefined);
      toast.success(`Demande pour "${rejectingItem.businessName}" rejetée.`);
      setRejectingItem(null);
    } catch (err: any) {
      console.error("[AdminPendingBusinesses] Reject error:", err);
      toast.error(`Erreur lors du rejet : ${err.message || err}`);
    } finally {
      setIsRejecting(false);
    }
  };

  const filteredList = pendingList.filter((item) => {
    const query = searchQuery.toLowerCase();
    return (
      item.businessName.toLowerCase().includes(query) ||
      item.ownerEmail.toLowerCase().includes(query) ||
      (item.ownerName && item.ownerName.toLowerCase().includes(query)) ||
      (item.taxId && item.taxId.toLowerCase().includes(query))
    );
  });

  return (
    <div id="admin-pending-businesses-container" className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[10px] font-mono uppercase font-bold tracking-widest text-amber-400">
              Super Admin Gateway
            </span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            Demandes d'activation d'entreprises
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {pendingList.length}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Entreprises créées en attente d'approbation et de provisionnement d'espace de travail.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par nom, email..."
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 text-xs"
          />
        </div>
      </div>

      {/* Content List */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
          <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">
            Chargement des demandes en attente...
          </p>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400 mx-auto">
            <CheckCircle2 size={24} />
          </div>
          <h3 className="text-base font-bold text-white">Aucune demande en attente</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {searchQuery 
              ? "Aucune entreprise ne correspond à vos critères de recherche." 
              : "Toutes les demandes de création d'entreprise ont été traitées."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <AnimatePresence>
            {filteredList.map((item) => {
              const isActionLoading = actionLoadingId === item.id;
              const formattedDate = item.createdAt 
                ? (typeof item.createdAt === "string" 
                    ? new Date(item.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                    : item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString("fr-FR") : "Récent")
                : "Date inconnue";

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-6"
                >
                  {/* Business & Owner Info */}
                  <div className="space-y-3 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                        <Building2 size={20} />
                      </div>
                      <div>
                        <h4 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                          {item.businessName}
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">
                            {item.status}
                          </span>
                        </h4>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mt-0.5 font-medium">
                          {item.industry && (
                            <span className="inline-flex items-center gap-1 text-slate-300">
                              <Briefcase size={13} className="text-slate-500" />
                              {item.industry}
                            </span>
                          )}
                          {item.taxId && (
                            <span className="inline-flex items-center gap-1 font-mono text-slate-400">
                              <FileText size={13} className="text-slate-500" />
                              NIF/CIN: {item.taxId}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 text-cyan-400 font-mono font-semibold">
                            <CreditCard size={13} />
                            Plan: {item.selectedPlan}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Owner & Submission Meta */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800/80 text-xs">
                      <div className="flex items-center gap-2 text-slate-400">
                        <User size={14} className="text-slate-500" />
                        <span>Demandeur: <strong className="text-slate-200">{item.ownerName || "Non renseigné"}</strong></span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400 truncate">
                        <Mail size={14} className="text-slate-500" />
                        <span className="truncate">{item.ownerEmail}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        <Calendar size={14} className="text-slate-500" />
                        <span>Soumis le: {formattedDate}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-800">
                    <button
                      id={`reject-btn-${item.id}`}
                      type="button"
                      disabled={isActionLoading}
                      onClick={() => openRejectModal(item)}
                      className="px-4 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold inline-flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                    >
                      <XCircle size={16} />
                      Rejeter
                    </button>

                    <button
                      id={`approve-btn-${item.id}`}
                      type="button"
                      disabled={isActionLoading}
                      onClick={() => handleApprove(item)}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 text-xs font-black uppercase tracking-wider inline-flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                    >
                      {isActionLoading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Approbation...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={16} />
                          Approuver
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Reject Confirmation Modal */}
      {rejectingItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                <AlertCircle size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Rejeter la demande</h3>
                <p className="text-xs text-slate-400">{rejectingItem.businessName}</p>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Veuillez indiquer un motif de refus qui sera communiqué au demandeur (<strong className="text-slate-300">{rejectingItem.ownerEmail}</strong>).
            </p>

            <div>
              <label htmlFor="rejection-reason" className="block text-xs font-semibold text-slate-300 mb-2">
                Motif du refus (optionnel mais recommandé)
              </label>
              <textarea
                id="rejection-reason"
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Ex: Document fiscal non valide ou informations incomplètes..."
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-rose-500 text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isRejecting}
                onClick={() => setRejectingItem(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-semibold"
              >
                Annuler
              </button>
              <button
                id="confirm-reject-btn"
                type="button"
                disabled={isRejecting}
                onClick={handleConfirmReject}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold inline-flex items-center gap-2 shadow-lg shadow-rose-600/20 active:scale-95 disabled:opacity-50"
              >
                {isRejecting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Traitement...
                  </>
                ) : (
                  <>
                    <XCircle size={16} />
                    Confirmer le rejet
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
