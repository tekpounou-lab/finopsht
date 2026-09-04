import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
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
  LogOut
} from "lucide-react";
import { useIdentity } from "../../modules/identity/IdentityContext";
import { EnterpriseIdentityOrchestrator } from "../../modules/identity/EnterpriseIdentityOrchestrator";
import { clearResilientCache } from "../../utils/resilientFirestore";
import { useAuth } from "../../hooks/useAuth";
import { isSuperAdminEmail } from "../../config/superadmin";
import { db } from "../../lib/firebase";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
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

  const isSuperUser = 
    isSuperAdminEmail(user?.email) || 
    role === "SUPER_ADMIN" || 
    identity?.role === "SUPER_ADMIN" || 
    flowState === "SUPER_ADMIN_ACTIVE";

  const activeInvitation = identity?.invitation || manualFoundInvite;
  const businessStatus = identity?.business?.status || (identity as any)?.businessStatus || "PENDING";
  
  const isPendingOwner = 
    isOwner || 
    identity?.role === "OWNER" || 
    identity?.requested_role === "OWNER" || 
    status === "WAITING_SUPERADMIN_APPROVAL" ||
    flowState === "BUSINESS_PENDING" ||
    businessStatus === "PENDING" ||
    businessStatus === "PENDING_APPROVAL" ||
    businessStatus === "WAITING_APPROVAL" ||
    businessStatus === "WAITING";

  // Auto-redirect effect when business status becomes active
  useEffect(() => {
    const isBizActive = identity?.business?.status === "ACTIVE" || identity?.business?.status === "APPROVED";
    
    if (isBizActive) {
      toast.success("Organisation activée ! Redirection vers votre espace...");
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
  }, [flowState, identity?.business?.status, identity?.role, navigate]);

  // Resolve business / enterprise name from invitation, identity or Firestore
  useEffect(() => {
    let isMounted = true;
    const resolveBusinessName = async () => {
      if (initialBusinessName) {
        if (isMounted) setEnterpriseName(initialBusinessName);
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
          const bizSnap = await getDoc(doc(db, "businesses", bizId));
          if (bizSnap.exists() && isMounted) {
            const data = bizSnap.data();
            const fetchedName = data.name || data.business_name || data.title;
            if (fetchedName) {
              setEnterpriseName(fetchedName);
              return;
            }
          }
        } catch (e) {
          console.warn("[WaitingRoom] Failed to fetch business name:", e);
        }
      }

      if (isMounted) {
        setEnterpriseName(bizId || "Espace Enterprise");
      }
    };

    resolveBusinessName();
    return () => { isMounted = false; };
  }, [activeInvitation, initialBusinessName, initialBusinessId, identity?.business]);

  // 1. Manual Refresh Handler
  const handleRefreshStatus = useCallback(async () => {
    const userId = user?.uid;
    console.log("[WaitingRoom] Executing handleRefreshStatus for user:", userId);
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

      console.log("[WaitingRoom] Status re-resolution completed:", {
        userId,
        flowState: updatedFlow,
        bizStatus: updatedBizStatus,
        role: updatedSnapshot?.role
      });

      if (
        updatedBizStatus === "ACTIVE" || 
        updatedBizStatus === "APPROVED" || 
        updatedFlow === "OWNER_ACTIVE" || 
        updatedFlow === "EMPLOYEE_ACTIVE" || 
        updatedFlow === "MANAGER_ACTIVE" || 
        updatedFlow === "SUPERVISOR_ACTIVE"
      ) {
        toast.success("Organisation activée ! Redirection vers votre tableau de bord...");
        if (updatedSnapshot?.role === "EMPLOYEE" || updatedFlow === "EMPLOYEE_ACTIVE") {
          navigate("/workspace");
        } else if (updatedSnapshot?.role === "MANAGER" || updatedFlow === "MANAGER_ACTIVE") {
          navigate("/manager");
        } else if (updatedSnapshot?.role === "SUPERVISOR" || updatedFlow === "SUPERVISOR_ACTIVE") {
          navigate("/supervisor");
        } else {
          navigate("/dashboard");
        }
      } else {
        toast.info(`Statut de l'organisation : ${updatedBizStatus || "PENDING"}. En attente d'approbation par le Super Admin.`);
      }
    } catch (err: any) {
      console.warn("[WaitingRoom] Refresh error:", err);
      toast.error(`Erreur lors de la vérification : ${err.message || err}`);
    } finally {
      setIsRefreshing(false);
    }
  }, [user?.uid, refreshIdentity, refresh, identity, flowState, navigate]);

  const handleRefresh = handleRefreshStatus;

  // 3. Search Invitation by Code / Token / ID / Email
  const handleSearchCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = inviteCodeInput.trim();
    if (!code) {
      toast.error("Veuillez saisir un code d'invitation.");
      return;
    }

    setIsSearchingCode(true);
    try {
      // Query by ID directly first
      const invRef = doc(db, "invitations", code);
      const invSnap = await getDoc(invRef);

      if (invSnap.exists()) {
        const invData = { id: invSnap.id, ...invSnap.data() } as any;
        if (invData.status === "SENT" || invData.status === "PENDING") {
          setManualFoundInvite(invData);
          toast.success("Invitation trouvée !");
          setIsSearchingCode(false);
          return;
        }
      }

      // Query by token
      const qToken = query(collection(db, "invitations"), where("token", "==", code));
      const snapToken = await getDocs(qToken);
      if (!snapToken.empty) {
        const invData = { id: snapToken.docs[0].id, ...snapToken.docs[0].data() } as any;
        if (invData.status === "SENT" || invData.status === "PENDING") {
          setManualFoundInvite(invData);
          toast.success("Invitation trouvée via token !");
          setIsSearchingCode(false);
          return;
        }
      }

      // Query by email
      const qEmail = query(collection(db, "invitations"), where("email", "==", code.toLowerCase()));
      const snapEmail = await getDocs(qEmail);
      if (!snapEmail.empty) {
        const validDocs = snapEmail.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(d => d.status === "SENT" || d.status === "PENDING");
        if (validDocs.length > 0) {
          setManualFoundInvite(validDocs[0]);
          toast.success("Invitation trouvée pour cette adresse email !");
          setIsSearchingCode(false);
          return;
        }
      }

      toast.error("Aucune invitation active trouvée pour ce code.");
    } catch (err: any) {
      console.error("[WaitingRoom] Code search error:", err);
      toast.error(`Erreur lors de la recherche: ${err.message}`);
    } finally {
      setIsSearchingCode(false);
    }
  };

  // 4. Accept / Reject Handlers
  const handleAccept = async () => {
    const invId = activeInvitation?.id;
    if (!invId) return;
    setActionLoading(true);
    try {
      await acceptInvitation(invId);
      toast.success("Invitation acceptée avec succès ! Bienvenue sur FINOPS.");
    } catch (err: any) {
      toast.error(`Erreur: ${err.message}`);
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    const invId = activeInvitation?.id;
    if (!invId) return;
    setActionLoading(true);
    try {
      await rejectInvitation(invId);
      setManualFoundInvite(null);
      toast.success("Invitation refusée.");
    } catch (err: any) {
      toast.error(`Erreur: ${err.message}`);
      setActionLoading(false);
    }
  };

  const getStatusConfig = () => {
    if (status === "WAITING_SUPERADMIN_APPROVAL" || isPendingOwner) {
      return {
        title: "Activation Entreprise en Attente",
        desc: "Votre entreprise a été initialisée avec succès. Elle est actuellement en attente d'activation par l'administrateur SuperAdmin. Dès validation, votre espace complet sera automatiquement déverrouillé.",
        icon: <Clock className="text-amber-400 animate-pulse" size={40} />,
        badge: "En attente d'approbation par le Super Admin"
      };
    }

    switch (status) {
      case "PROVISIONING_WORKSPACE":
        return {
          title: "Provisionnement du Workspace",
          desc: "Nous préparons votre infrastructure d'entreprise sécurisée...",
          icon: <Loader2 className="text-emerald-500 animate-spin" size={40} />,
          badge: "Enterprise Provisioning"
        };
      case "BUILDING_CONTEXT":
        return {
          title: "Génération du Snapshot",
          desc: "Agrégation de votre configuration et permissions...",
          icon: <Loader2 className="text-cyan-500 animate-spin" size={40} />,
          badge: "Context Engine"
        };
      case "ERROR":
        return {
          title: "Échec d'Orchestration",
          desc: "Une erreur est survenue lors de la résolution de votre espace.",
          icon: <ShieldAlert className="text-red-500" size={40} />,
          badge: "Critical Failure"
        };
      default:
        return {
          title: activeInvitation ? "Invitation Détectée !" : "Accès Restreint",
          desc: activeInvitation 
            ? "Une invitation d'entreprise en attente de confirmation est associée à votre compte."
            : `Votre identité ${email || user?.email || ""} est reconnue, mais aucune affiliation n'est encore active.`,
          icon: activeInvitation 
            ? <Building2 className="text-cyan-400 animate-bounce" size={40} />
            : <Clock className="text-amber-500" size={40} />,
          badge: activeInvitation ? "Invitation Pending Approval" : "Access Pending Authorization"
        };
    }
  };

  // INITIAL LOADING SPINNER - Only shown when identity is completely loading AND we do NOT have a pending state
  const isInitialLoading = identityLoading && !identity && !isPendingOwner;

  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-amber-500 animate-spin mx-auto" />
          <h2 className="text-white font-bold text-sm tracking-wider uppercase font-mono">
            CHARGEMENT DE L'ESPACE ENTREPRISE...
          </h2>
          <p className="text-slate-400 text-xs">Analyse de l'identité et de l'état d'organisation...</p>
        </div>
      </div>
    );
  }

  const config = getStatusConfig();

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 selection:bg-amber-500/30">
      <div className="w-full max-w-xl">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-[48px] p-8 md:p-12 border border-white/5 bg-white/[0.02] shadow-2xl relative overflow-hidden text-center"
        >
          {/* Ambient Glow */}
          <div className="absolute -top-24 -left-24 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl" />
          
          <div className="relative">
            <div className="mb-8 flex justify-center">
              <div className="relative">
                <div className="w-24 h-24 bg-white/5 rounded-[32px] flex items-center justify-center border border-white/10 shadow-inner">
                  {config.icon}
                </div>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-amber-400 text-[10px] font-mono uppercase font-black tracking-widest mb-2">
                {config.badge}
              </div>
              <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-tight">
                {config.title}
              </h1>
              <p className="text-slate-400 font-medium leading-relaxed max-w-md mx-auto text-sm">
                {config.desc}
              </p>
            </div>

            {/* OWNER PENDING CARD */}
            {isPendingOwner && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-amber-950/20 border border-amber-500/30 rounded-3xl p-6 mb-8 text-left space-y-4 shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-amber-500/20 pb-3">
                  <div className="flex items-center gap-2 text-amber-400 font-black text-xs uppercase tracking-wider">
                    <Shield size={18} />
                    <span>Détails Entreprise (Propriétaire)</span>
                  </div>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-full font-bold">
                    Statut: PENDING
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 py-2">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Entreprise</p>
                    <p className="text-white font-bold text-sm truncate">
                      {enterpriseName || identity?.business?.name || initialBusinessName || "Entreprise Initialisée"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Identifiant</p>
                    <p className="text-amber-300 font-mono font-bold text-xs truncate">
                      {identity?.business?.id || initialBusinessId || "biz_pending"}
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between gap-4">
                  <button 
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-amber-500/20"
                  >
                    <RefreshCw className={isRefreshing ? "animate-spin" : ""} size={16} />
                    <span>{isRefreshing ? "Vérification..." : "Actualiser le statut"}</span>
                  </button>
                </div>
              </motion.div>
            )}

            {/* INLINE INVITATION CARD DISPLAY IF FOUND FOR COLLEAGUES */}
            {!isPendingOwner && activeInvitation ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-cyan-950/30 border border-cyan-500/30 rounded-3xl p-6 mb-8 text-left space-y-4 shadow-xl relative"
              >
                <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
                  <div className="flex items-center gap-2 text-cyan-400 font-black text-xs uppercase tracking-wider">
                    <Building2 size={18} />
                    <span>FINOPS ERP Enterprise Invite</span>
                  </div>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 rounded-full font-bold">
                    Code: {activeInvitation.id}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 py-2">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Entreprise</p>
                    <p className="text-white font-bold text-sm truncate">
                      {enterpriseName || activeInvitation.business_name || activeInvitation.businessName || activeInvitation.business_id || activeInvitation.businessId || "Espace Enterprise"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Rôle Assigné</p>
                    <p className="text-cyan-300 font-bold text-sm uppercase">{activeInvitation.role || "EMPLOYEE"}</p>
                  </div>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                  <button 
                    onClick={handleAccept}
                    disabled={actionLoading}
                    className="flex-1 bg-cyan-500 text-slate-950 py-3.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-cyan-400 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-cyan-500/20"
                  >
                    {actionLoading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
                    <span>Accepter l'Invitation</span>
                  </button>

                  <button 
                    onClick={handleReject}
                    disabled={actionLoading}
                    className="bg-slate-900 border border-white/10 text-slate-400 hover:text-white py-3.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-800 transition-all disabled:opacity-50"
                  >
                    <XCircle size={18} />
                    <span>Refuser</span>
                  </button>
                </div>
              </motion.div>
            ) : !isPendingOwner && status === "WAITING_FOR_INVITATION" && (
              <div className="space-y-6 mb-8 text-left">
                {/* Information Card & Refresh Trigger */}
                <div className="p-5 bg-white/[0.03] border border-white/5 rounded-3xl flex items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 bg-slate-800 rounded-2xl mt-0.5 border border-white/5">
                      <Mail className="text-slate-400" size={20} />
                    </div>
                    <div>
                      <h4 className="text-white font-bold text-sm mb-1">En attente d'une invitation</h4>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        L'administrateur de votre entreprise doit vous envoyer une invitation sur <strong className="text-slate-300">{email || user?.email}</strong>.
                      </p>
                    </div>
                  </div>

                  <button 
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    title="Vérifier les nouvelles invitations"
                    className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-400 rounded-2xl transition-all active:scale-90 flex-shrink-0"
                  >
                    <RefreshCw className={isRefreshing ? "animate-spin" : ""} size={20} />
                  </button>
                </div>

                {/* Manual Code Lookup Form */}
                <form onSubmit={handleSearchCode} className="p-5 bg-white/[0.02] border border-white/5 rounded-3xl space-y-3">
                  <div className="flex items-center gap-2 text-slate-300 font-bold text-xs">
                    <KeyRound size={16} className="text-amber-400" />
                    <span>Saisir un code d'invitation manuellement</span>
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={inviteCodeInput}
                      onChange={(e) => setInviteCodeInput(e.target.value)}
                      placeholder="Code (ex: inv_123...), Token ou Email"
                      className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 font-mono"
                    />
                    <button 
                      type="submit"
                      disabled={isSearchingCode || !inviteCodeInput.trim()}
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isSearchingCode ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                      <span>Vérifier</span>
                    </button>
                  </div>
                </form>

                {/* Navigation and Quick Action Options */}
                <div className="pt-2 space-y-2.5">
                  {isSuperUser && (
                    <button
                      id="waiting-room-super-admin-btn"
                      onClick={onGoToSuperAdmin}
                      className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-slate-950 font-mono font-black text-xs uppercase rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-950/50 border border-emerald-500/30 transition-all active:scale-95"
                    >
                      <Sparkles className="w-4 h-4 text-slate-950" />
                      Ouvrir la Console Super Admin (Platform)
                    </button>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      id="waiting-room-create-business-btn"
                      onClick={onCreateBusiness}
                      className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-md shadow-amber-950/40"
                    >
                      <PlusCircle className="w-4 h-4" />
                      Créer une Entreprise
                    </button>

                    <button
                      id="waiting-room-demo-btn"
                      onClick={onExploreDemo}
                      className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-2 cursor-pointer border border-slate-700 transition-all active:scale-95"
                    >
                      <LayoutDashboard className="w-4 h-4 text-cyan-400" />
                      Mode Démo / Sandbox
                    </button>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    {onBack && (
                      <button 
                        onClick={onBack}
                        className="group flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-medium transition-all active:scale-95 text-xs cursor-pointer"
                      >
                        <ChevronLeft className="text-slate-400 group-hover:text-white transition-colors" size={16} />
                        <span>Changer de rôle</span>
                      </button>
                    )}

                    {onLogout && (
                      <button 
                        onClick={onLogout}
                        className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-medium transition-all active:scale-95 text-xs cursor-pointer"
                      >
                        <LogOut size={16} />
                        <span>Déconnexion</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {isPendingOwner && (
              <div className="pt-2 flex items-center gap-2">
                {onBack && (
                  <button 
                    onClick={onBack}
                    className="group flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-medium transition-all active:scale-95 text-xs cursor-pointer"
                  >
                    <ChevronLeft className="text-slate-400 group-hover:text-white transition-colors" size={16} />
                    <span>Retour aux options</span>
                  </button>
                )}

                {onLogout && (
                  <button 
                    onClick={onLogout}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-medium transition-all active:scale-95 text-xs cursor-pointer"
                  >
                    <LogOut size={16} />
                    <span>Déconnexion</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </motion.div>

        <p className="mt-8 text-center text-[10px] text-slate-600 font-black uppercase tracking-[0.3em]">
          FinOps Identity Orchestration Engine v2.0
        </p>
      </div>
    </div>
  );
};
