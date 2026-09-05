import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { 
  Loader2, 
  Clock, 
  ShieldAlert, 
  ChevronLeft,
  Mail,
  RefreshCw,
  Search,
  Building2,
  Shield,
  CheckCircle,
  XCircle,
  KeyRound,
  Sparkles,
  LayoutDashboard,
  PlusCircle,
  LogOut,
  Edit3,
  AlertCircle,
  FileText,
  CreditCard,
  Send
} from "lucide-react";
import { useIdentity } from "../../modules/identity/IdentityContext";
import { EnterpriseIdentityOrchestrator } from "../../modules/identity/EnterpriseIdentityOrchestrator";
import { clearResilientCache } from "../../utils/resilientFirestore";
import { useAuth } from "../../hooks/useAuth";
import { isSuperAdminEmail } from "../../config/superadmin";
import { InvitationRepository } from "../../repositories/InvitationRepository";
import { PendingBusinessRepository } from "../../repositories/PendingBusinessRepository";
import { BusinessRepository } from "../../repositories";
import { PendingBusiness } from "../../types";
import { toast } from "sonner";

export type WaitingRoomStatus = 
  | "WAITING_FOR_INVITATION"
  | "INVITATION_PENDING"
  | "WAITING_SUPERADMIN_APPROVAL"
  | "PROVISIONING_WORKSPACE"
  | "SYNCING_IDENTITY"
  | "BUILDING_CONTEXT"
  | "ERROR";

interface WaitingRoomProps {
  email?: string;
  status?: WaitingRoomStatus;
  isOwner?: boolean;
  businessName?: string;
  businessId?: string;
  onBack?: () => void;
  onEditMemberInfo?: () => void;
  onCreateBusiness?: () => void;
  onExploreDemo?: () => void;
  onGoToSuperAdmin?: () => void;
  onLogout?: () => void;
}

export const WaitingRoom: React.FC<WaitingRoomProps> = ({ 
  email, 
  status = "WAITING_FOR_INVITATION", 
  isOwner = false,
  businessName: initialBusinessName,
  businessId: initialBusinessId,
  onBack,
  onEditMemberInfo,
  onCreateBusiness,
  onExploreDemo,
  onGoToSuperAdmin,
  onLogout
}) => {
  const navigate = useNavigate();
  const { identity, loading: identityLoading, refresh, refreshIdentity, acceptInvitation, rejectInvitation } = useIdentity();
  const { user, role, flowState, logout } = useAuth();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [isSearchingCode, setIsSearchingCode] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [manualFoundInvite, setManualFoundInvite] = useState<any | null>(null);
  const [enterpriseName, setEnterpriseName] = useState<string>(initialBusinessName || "");

  // Real-time state for member invitations and owner pending request
  const [receivedInvitations, setReceivedInvitations] = useState<any[]>([]);
  const [livePendingBiz, setLivePendingBiz] = useState<PendingBusiness | null>(identity?.pendingBusiness || null);

  const effectiveEmail = email || user?.email || identity?.email || "";
  const isSuperUser = 
    isSuperAdminEmail(user?.email) || 
    role === "SUPER_ADMIN" || 
    identity?.role === "SUPER_ADMIN" || 
    flowState === "SUPER_ADMIN_ACTIVE";

  const isPendingOwner = 
    isOwner || 
    identity?.role === "OWNER" || 
    identity?.requested_role === "OWNER" || 
    status === "WAITING_SUPERADMIN_APPROVAL" ||
    flowState === "BUSINESS_PENDING" ||
    (identity as any)?.userProfile?.accountStatus === "PENDING_OWNER" ||
    Boolean(livePendingBiz);

  // 1. Real-time listener for Owner: Pending business status
  useEffect(() => {
    if (!user?.uid || !isPendingOwner) return;

    const unsubscribe = PendingBusinessRepository.listenByOwnerUid(user.uid, (pendingData) => {
      setLivePendingBiz(pendingData);

      if (pendingData?.status === "APPROVED") {
        toast.success(`Votre entreprise "${pendingData.businessName}" a été validée par le Super Admin !`);
        refresh();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [user?.uid, isPendingOwner]);

  // 2. Real-time listener for Member: Pending invitations by email
  useEffect(() => {
    if (!effectiveEmail || isPendingOwner) return;

    const unsubscribe = InvitationRepository.listenPendingInvitationsByEmail(effectiveEmail, (invitations) => {
      setReceivedInvitations(invitations);
      if (invitations.length > 0 && !manualFoundInvite) {
        setManualFoundInvite(invitations[0]);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [effectiveEmail, isPendingOwner, manualFoundInvite]);

  // Active invitation is either from Identity, live listener, or manual search
  const activeInvitation = manualFoundInvite || identity?.invitation || (receivedInvitations.length > 0 ? receivedInvitations[0] : null);

  // 3. Auto-redirect effect when business status becomes active
  useEffect(() => {
    const isBizActive = identity?.business?.status === "ACTIVE" || identity?.business?.status === "APPROVED" || livePendingBiz?.status === "APPROVED";
    
    if (isBizActive && identity?.onboardingStatus === "COMPLETED") {
      toast.success("Espace déverrouillé ! Redirection...");
      if (identity?.role === "EMPLOYEE" || flowState === "EMPLOYEE_ACTIVE") {
        navigate("/workspace");
      } else if (identity?.role === "MANAGER" || flowState === "MANAGER_ACTIVE") {
        navigate("/manager");
      } else if (identity?.role === "SUPERVISOR" || flowState === "SUPERVISOR_ACTIVE") {
        navigate("/supervisor");
      } else {
        navigate("/dashboard");
      }
    }
  }, [flowState, identity?.business?.status, identity?.onboardingStatus, livePendingBiz?.status, identity?.role, navigate]);

  // 4. Resolve business / enterprise name cleanly via BusinessRepository
  useEffect(() => {
    let isMounted = true;
    const resolveBusinessName = async () => {
      if (initialBusinessName) {
        if (isMounted) setEnterpriseName(initialBusinessName);
        return;
      }

      if (livePendingBiz?.businessName) {
        if (isMounted) setEnterpriseName(livePendingBiz.businessName);
        return;
      }

      if (identity?.business?.name) {
        if (isMounted) setEnterpriseName(identity.business.name);
        return;
      }

      if (!activeInvitation) {
        if (isMounted && !enterpriseName) setEnterpriseName("");
        return;
      }

      const explicitName = activeInvitation.business_name || activeInvitation.businessName;
      if (explicitName) {
        if (isMounted) setEnterpriseName(explicitName);
        return;
      }

      const bizId = activeInvitation.business_id || activeInvitation.businessId || initialBusinessId || identity?.business?.id;
      if (bizId) {
        try {
          const biz = await BusinessRepository.getById(bizId);
          if (biz && isMounted) {
            setEnterpriseName(biz.name);
            return;
          }
        } catch (e) {
          console.warn("[WaitingRoom] Failed to fetch business name via repository:", e);
        }
      }

      if (isMounted) {
        setEnterpriseName(bizId || "Espace Entreprise");
      }
    };

    resolveBusinessName();
    return () => { isMounted = false; };
  }, [activeInvitation, initialBusinessName, initialBusinessId, identity?.business, livePendingBiz]);

  // 5. Manual Refresh Handler
  const handleRefreshStatus = useCallback(async () => {
    const userId = user?.uid;
    setIsRefreshing(true);
    try {
      if (userId) {
        EnterpriseIdentityOrchestrator.invalidateCache(userId);
      } else {
        EnterpriseIdentityOrchestrator.clearSessionCache();
      }
      clearResilientCache();

      if (refreshIdentity) {
        await refreshIdentity(userId);
      } else {
        await refresh();
      }

      const updatedSnapshot = (userId ? EnterpriseIdentityOrchestrator.getCachedSnapshot(userId) : null) || identity;
      const updatedBizStatus = updatedSnapshot?.business?.status;
      const updatedFlow = (updatedSnapshot as any)?.flowState || flowState;

      if (
        updatedBizStatus === "ACTIVE" || 
        updatedBizStatus === "APPROVED" || 
        updatedFlow === "OWNER_ACTIVE" || 
        updatedFlow === "EMPLOYEE_ACTIVE"
      ) {
        toast.success("Espace d'entreprise validé ! Redirection...");
        if (updatedSnapshot?.role === "EMPLOYEE" || updatedFlow === "EMPLOYEE_ACTIVE") {
          navigate("/workspace");
        } else {
          navigate("/dashboard");
        }
      } else {
        toast.info("Statut actualisé. Demande toujours en cours d'examen.");
      }
    } catch (err: any) {
      console.warn("[WaitingRoom] Refresh error:", err);
      toast.error(`Erreur lors de la vérification : ${err.message || err}`);
    } finally {
      setIsRefreshing(false);
    }
  }, [user?.uid, refreshIdentity, refresh, identity, flowState, navigate]);

  // 6. Search Invitation by Code / Token via Repository
  const handleSearchCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = inviteCodeInput.trim();
    if (!code) {
      toast.error("Veuillez saisir un code ou token d'invitation.");
      return;
    }

    setIsSearchingCode(true);
    try {
      const invData = await InvitationRepository.getByTokenOrCode(code);

      if (invData && (invData.status === "SENT" || invData.status === "PENDING")) {
        setManualFoundInvite(invData);
        toast.success("Invitation valide trouvée !");
        setIsSearchingCode(false);
        return;
      }

      toast.error("Aucune invitation active trouvée pour ce code ou token.");
    } catch (err: any) {
      console.error("[WaitingRoom] Code search error:", err);
      toast.error(`Erreur lors de la recherche: ${err.message}`);
    } finally {
      setIsSearchingCode(false);
    }
  };

  // 7. Accept / Reject Handlers via IdentityContext / Repository
  const handleAccept = async (targetInv?: any) => {
    const inv = targetInv || activeInvitation;
    const invId = inv?.id;
    if (!invId) return;
    setActionLoading(true);
    try {
      await acceptInvitation(invId);
      toast.success("Invitation acceptée avec succès ! Redirection en cours...");
    } catch (err: any) {
      toast.error(`Erreur: ${err.message}`);
      setActionLoading(false);
    }
  };

  const handleReject = async (targetInv?: any) => {
    const inv = targetInv || activeInvitation;
    const invId = inv?.id;
    if (!invId) return;
    setActionLoading(true);
    try {
      await rejectInvitation(invId);
      setManualFoundInvite(null);
      setReceivedInvitations(prev => prev.filter(i => i.id !== invId));
      toast.success("Invitation refusée.");
    } catch (err: any) {
      toast.error(`Erreur: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Status configuration
  const getStatusConfig = () => {
    if (livePendingBiz?.status === "REJECTED") {
      return {
        title: "Demande Non Retenue",
        desc: "L'activation de votre entreprise n'a pas été validée par le Super Admin.",
        icon: <XCircle className="text-rose-400" size={40} />,
        badge: "Demande Rejetée"
      };
    }

    if (status === "WAITING_SUPERADMIN_APPROVAL" || isPendingOwner) {
      return {
        title: "Validation en cours par le Super Admin",
        desc: "Votre demande d'activation d'entreprise est actuellement transmise au Super Admin de FINOPS ERP. Votre espace de travail sera automatiquement activé dès son approbation.",
        icon: <Clock className="text-amber-400 animate-pulse" size={40} />,
        badge: "En attente d'approbation"
      };
    }

    switch (status) {
      case "PROVISIONING_WORKSPACE":
        return {
          title: "Provisionnement de l'Espace",
          desc: "Préparation de votre environnement sécurisé multi-tenants...",
          icon: <Loader2 className="text-emerald-500 animate-spin" size={40} />,
          badge: "Provisioning"
        };
      case "BUILDING_CONTEXT":
        return {
          title: "Configuration du Profil",
          desc: "Finalisation de vos autorisations et accès...",
          icon: <Loader2 className="text-cyan-500 animate-spin" size={40} />,
          badge: "Context Engine"
        };
      case "ERROR":
        return {
          title: "Échec de Synchronisation",
          desc: "Une erreur est survenue lors de la validation de votre identité.",
          icon: <ShieldAlert className="text-rose-500" size={40} />,
          badge: "Erreur Système"
        };
      default:
        return {
          title: activeInvitation ? "Invitation Reçue !" : "En attente d'une invitation",
          desc: activeInvitation 
            ? "Une invitation d'entreprise est en attente de votre réponse."
            : `Votre compte (${effectiveEmail}) est prêt. Vous pouvez accepter une invitation reçue ou saisir un code d'invitation.`,
          icon: activeInvitation 
            ? <Building2 className="text-cyan-400 animate-bounce" size={40} />
            : <Mail className="text-amber-400" size={40} />,
          badge: activeInvitation ? "Invitation Détectée" : "En attente d'invitation"
        };
    }
  };

  // Loading state guard
  const isInitialLoading = identityLoading && !identity && !isPendingOwner;
  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mx-auto" />
          <h2 className="text-white font-bold text-sm tracking-wider uppercase font-mono">
            Vérification de l'espace...
          </h2>
          <p className="text-slate-400 text-xs">Analyse du statut de l'organisation en cours...</p>
        </div>
      </div>
    );
  }

  const config = getStatusConfig();
  const isOwnerRejected = livePendingBiz?.status === "REJECTED";

  return (
    <div id="waiting-room-container" className="min-h-screen bg-[#020617] flex items-center justify-center p-4 selection:bg-cyan-500/30">
      <div className="w-full max-w-xl">
        <motion.div 
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-8 md:p-10 border border-slate-800 bg-slate-900/90 shadow-2xl relative overflow-hidden text-center"
        >
          {/* Ambient Glows */}
          <div className="absolute -top-24 -left-24 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative">
            {/* Header Icon */}
            <div className="mb-6 flex justify-center">
              <div className="w-20 h-20 bg-slate-800/80 rounded-2xl flex items-center justify-center border border-slate-700/60 shadow-inner">
                {config.icon}
              </div>
            </div>

            {/* Title & Description */}
            <div className="space-y-3 mb-6">
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-mono uppercase font-black tracking-widest ${
                isOwnerRejected 
                  ? "bg-rose-500/10 border border-rose-500/30 text-rose-400"
                  : isPendingOwner 
                    ? "bg-amber-500/10 border border-amber-500/30 text-amber-400"
                    : "bg-cyan-500/10 border border-cyan-500/30 text-cyan-400"
              }`}>
                {config.badge}
              </div>
              <h1 className="text-xl md:text-2xl font-black text-white tracking-tight leading-tight">
                {config.title}
              </h1>
              <p className="text-slate-400 font-medium leading-relaxed max-w-md mx-auto text-xs">
                {config.desc}
              </p>
            </div>

            {/* OWNER CARD — DETAILS OF PENDING BUSINESS */}
            {isPendingOwner && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`rounded-2xl p-5 mb-6 text-left space-y-4 border ${
                  isOwnerRejected 
                    ? "bg-rose-950/20 border-rose-500/30" 
                    : "bg-amber-950/20 border-amber-500/30"
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2 text-white font-bold text-xs uppercase tracking-wider">
                    <Building2 size={16} className={isOwnerRejected ? "text-rose-400" : "text-amber-400"} />
                    <span>Détails de la Demande</span>
                  </div>
                  <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold border uppercase ${
                    isOwnerRejected 
                      ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                      : "bg-amber-500/20 border-amber-500/40 text-amber-300"
                  }`}>
                    {livePendingBiz?.status || "PENDING"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 py-1 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block">Entreprise</span>
                    <strong className="text-white text-sm truncate block mt-0.5">
                      {livePendingBiz?.businessName || enterpriseName || "Mon Entreprise"}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block">Plan Choisi</span>
                    <span className="inline-flex items-center gap-1 text-cyan-400 font-mono font-bold mt-0.5">
                      <CreditCard size={13} />
                      {livePendingBiz?.selectedPlan || "STARTER"}
                    </span>
                  </div>
                  {livePendingBiz?.industry && (
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block">Secteur</span>
                      <span className="text-slate-300 block mt-0.5">{livePendingBiz.industry}</span>
                    </div>
                  )}
                  {livePendingBiz?.taxId && (
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block">NIF / CIF</span>
                      <span className="text-slate-300 font-mono block mt-0.5">{livePendingBiz.taxId}</span>
                    </div>
                  )}
                </div>

                {/* If rejected, show rejection motive clearly */}
                {isOwnerRejected && (
                  <div className="bg-rose-900/30 border border-rose-500/30 rounded-xl p-3.5 space-y-1">
                    <div className="flex items-center gap-1.5 text-rose-400 font-bold text-xs">
                      <AlertCircle size={14} />
                      <span>Motif du refus du Super Admin :</span>
                    </div>
                    <p className="text-xs text-rose-200 italic">
                      "{livePendingBiz?.rejectionReason || "Informations incomplètes ou non conformes aux conditions d'éligibilité."}"
                    </p>
                  </div>
                )}

                <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
                  <button 
                    id="waiting-room-refresh-btn"
                    onClick={handleRefreshStatus}
                    disabled={isRefreshing}
                    className="w-full sm:flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw className={isRefreshing ? "animate-spin" : ""} size={14} />
                    <span>{isRefreshing ? "Vérification..." : "Vérifier le statut en direct"}</span>
                  </button>

                  {isOwnerRejected && onBack && (
                    <button
                      id="retry-request-btn"
                      onClick={onBack}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
                    >
                      Refaire une demande
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* MEMBER VIEW — REAL-TIME INVITATIONS RECEIVED */}
            {!isPendingOwner && (
              <div className="space-y-4 mb-6 text-left">
                {/* Real-time received invitations list */}
                {receivedInvitations.length > 0 ? (
                  <div className="space-y-3">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold block">
                      Invitations en attente ({receivedInvitations.length})
                    </span>
                    {receivedInvitations.map((inv) => (
                      <motion.div
                        key={inv.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-cyan-950/20 border border-cyan-500/30 rounded-2xl p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-white font-bold text-xs">
                            <Building2 size={16} className="text-cyan-400" />
                            <span>{inv.businessName || inv.business_name || "Entreprise"}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 uppercase">
                            Rôle: {inv.role || "MEMBRE"}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-400">
                          Invité par : <strong className="text-slate-300">{inv.invitedByEmail || inv.invited_by_email || "Administrateur"}</strong>
                        </p>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            id={`accept-inv-${inv.id}`}
                            onClick={() => handleAccept(inv)}
                            disabled={actionLoading}
                            className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 py-2 px-3 rounded-xl font-bold text-xs uppercase flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                          >
                            {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                            Accepter
                          </button>
                          <button
                            id={`reject-inv-${inv.id}`}
                            onClick={() => handleReject(inv)}
                            disabled={actionLoading}
                            className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1"
                          >
                            <XCircle size={14} />
                            Refuser
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  /* Waiting for invitation info banner */
                  <div className="p-4 bg-slate-800/50 border border-slate-800 rounded-2xl flex items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-slate-800 rounded-xl mt-0.5 text-amber-400">
                        <Mail size={18} />
                      </div>
                      <div>
                        <h4 className="text-white font-bold text-xs mb-0.5">En attente d'une invitation</h4>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Le propriétaire doit vous envoyer une invitation sur <strong className="text-slate-200">{effectiveEmail}</strong>.
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={handleRefreshStatus}
                      disabled={isRefreshing}
                      title="Vérifier les invitations"
                      className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-400 rounded-xl transition-all active:scale-95 flex-shrink-0"
                    >
                      <RefreshCw className={isRefreshing ? "animate-spin" : ""} size={16} />
                    </button>
                  </div>
                )}

                {/* Manual Code / Token Search */}
                <form onSubmit={handleSearchCode} className="p-4 bg-slate-800/30 border border-slate-800 rounded-2xl space-y-2.5">
                  <div className="flex items-center gap-1.5 text-slate-300 font-bold text-xs">
                    <KeyRound size={14} className="text-amber-400" />
                    <span>Rechercher une invitation par code ou token</span>
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={inviteCodeInput}
                      onChange={(e) => setInviteCodeInput(e.target.value)}
                      placeholder="Coller le code ou token d'invitation..."
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                    <button 
                      type="submit"
                      disabled={isSearchingCode || !inviteCodeInput.trim()}
                      className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isSearchingCode ? <Loader2 className="animate-spin" size={14} /> : <Search size={14} />}
                      <span>Vérifier</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Bottom Actions Bar */}
            <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {/* Modify personal info (Member) or change path */}
                {!isPendingOwner && onEditMemberInfo && (
                  <button 
                    id="waiting-room-edit-info-btn"
                    onClick={onEditMemberInfo}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-800 bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition-all active:scale-95"
                  >
                    <Edit3 size={14} />
                    <span>Modifier mes informations</span>
                  </button>
                )}

                {onBack && (
                  <button 
                    id="waiting-room-back-btn"
                    onClick={onBack}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-800 bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition-all active:scale-95"
                  >
                    <ChevronLeft size={14} />
                    <span>Changer de choix</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isSuperUser && onGoToSuperAdmin && (
                  <button
                    id="waiting-room-superadmin-btn"
                    onClick={onGoToSuperAdmin}
                    className="px-3 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5"
                  >
                    <Sparkles size={14} />
                    Console Super Admin
                  </button>
                )}

                {onLogout && (
                  <button 
                    id="waiting-room-logout-btn"
                    onClick={onLogout}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold transition-all active:scale-95"
                  >
                    <LogOut size={14} />
                    <span>Déconnexion</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        <p className="mt-6 text-center text-[10px] text-slate-600 font-mono font-semibold uppercase tracking-widest">
          FINOPS ERP Identity Engine &bull; Sécurité & Isolement Multi-Tenant
        </p>
      </div>
    </div>
  );
};
