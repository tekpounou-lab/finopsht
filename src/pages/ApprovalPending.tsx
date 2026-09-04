import React, { useEffect } from "react";
import { motion } from "motion/react";
import { Clock, CheckCircle, AlertTriangle, XCircle, LogOut, RefreshCw, Layers } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

import { useI18n } from "../i18n";

export default function ApprovalPending() {
  const { logout, businessDoc } = useAuth();
  const { language } = useI18n();
  const navigate = useNavigate();

  // Auto-redirect if status becomes ACTIVE
  useEffect(() => {
    if (businessDoc?.status === "ACTIVE") {
      toast.success(language === "fr" ? "Votre entreprise a été approuvée ! Redirection..." : language === "ht" ? "Konpayi w la apwouve ! N ap voye w nan tablo a..." : "Your company has been approved! Redirecting...");
      setTimeout(() => {
        navigate("/resolve");
      }, 1000);
    }
  }, [businessDoc?.status, navigate, language]);

  const statusColors = {
    PENDING_APPROVAL: "from-amber-500 via-orange-500 to-yellow-500",
    ACTIVE: "from-emerald-500 to-teal-600",
    SUSPENDED: "from-orange-600 to-red-600",
    REJECTED: "from-rose-600 to-red-800",
  };

  const currentStatus = businessDoc?.status || "PENDING_APPROVAL";
  const borderGradient = statusColors[currentStatus as keyof typeof statusColors] || statusColors.PENDING_APPROVAL;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      {/* Dynamic Background Accents */}
      <div className="absolute inset-x-0 top-0 h-[400px] bg-gradient-to-b from-cyan-900/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute -left-1/4 -top-1/4 w-96 h-96 bg-cyan-500/5 blur-3xl pointer-events-none rounded-full" />
      <div className="absolute -right-1/4 -bottom-1/4 w-96 h-96 bg-indigo-500/5 blur-3xl pointer-events-none rounded-full" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="max-w-xl w-full bg-slate-900 border border-slate-800/80 rounded-3xl overflow-hidden p-8 shadow-2xl relative z-10 font-sans"
      >
        {/* Colorful top status bar */}
        <div className={`absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r ${borderGradient}`} />

        {/* Brand identity */}
        <div className="flex justify-between items-center mb-10 pb-4 border-b border-slate-800/80 select-none">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Layers className="w-4.5 h-4.5 text-cyan-400" />
            </div>
            <span className="font-mono text-sm tracking-wider font-extrabold text-slate-100">
              FINOPS <span className="text-cyan-400">ERP</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-950 border border-slate-800 rounded-full">
            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping" />
            <span className="text-[10px] font-mono tracking-widest text-slate-400 uppercase font-black">
              SECURE WORKSPACE GATEWAY
            </span>
          </div>
        </div>

        {/* Status Illustration */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-cyan-400/5 rounded-full blur-2xl animate-pulse" />
            {currentStatus === "PENDING_APPROVAL" && (
              <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center border border-amber-500/20">
                <Clock className="w-10 h-10 text-amber-500" />
              </div>
            )}
            {currentStatus === "ACTIVE" && (
              <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
                <CheckCircle className="w-10 h-10 text-emerald-500" />
              </div>
            )}
            {currentStatus === "SUSPENDED" && (
              <div className="w-20 h-20 bg-orange-500/10 rounded-full flex items-center justify-center border border-orange-500/20">
                <AlertTriangle className="w-10 h-10 text-orange-500" />
              </div>
            )}
            {currentStatus === "REJECTED" && (
              <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center border border-rose-500/20">
                <XCircle className="w-10 h-10 text-rose-500" />
              </div>
            )}
          </div>

          <h2 className="text-2xl font-black text-slate-100 tracking-tight mb-2">
            {currentStatus === "PENDING_APPROVAL" && "Workspace en attente d'approbation"}
            {currentStatus === "ACTIVE" && "Entreprise approuvée !"}
            {currentStatus === "SUSPENDED" && "Espace de travail suspendu"}
            {currentStatus === "REJECTED" && "Demande rejetée"}
          </h2>

          <p className="text-slate-400 leading-relaxed max-w-md text-sm">
            {currentStatus === "PENDING_APPROVAL" && (
              "Votre entreprise a été créée avec succès. En conformité avec la gouvernance FinOps, votre espace de travail est maintenant en cours d'évaluation par un administrateur."
            )}
            {currentStatus === "ACTIVE" && (
              "Félicitations ! Votre espace de travail a été validé. Redirection automatique vers le tableau de bord..."
            )}
            {currentStatus === "SUSPENDED" && (
              "L'accès à cette entreprise a été temporairement suspendu. Contactez le support si vous estimez qu'il s'agit d'une erreur."
            )}
            {currentStatus === "REJECTED" && (
              "Votre dossier de création d'entreprise a été rejeté par notre équipe de conformité."
            )}
          </p>
        </div>

        {/* Workspace Metadata Details */}
        <div className="bg-slate-950/60 rounded-2xl border border-slate-800/50 p-5 mb-8 text-left">
          <div className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center justify-between">
            <span>Détails de l'entreprise</span>
            <span className="text-cyan-400">ID: {businessDoc?.id || "Chargement..."}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-900/60 border border-slate-800/50 p-3 rounded-xl">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-0.5">Raison sociale</span>
              <span className="text-xs text-slate-200 font-mono block truncate">{businessDoc?.name || "N/A"}</span>
            </div>
            <div className="bg-slate-900/60 border border-slate-800/50 p-3 rounded-xl">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-0.5">Domaine d'activité</span>
              <span className="text-xs text-slate-200 font-mono block truncate">{businessDoc?.domain || "N/A"}</span>
            </div>
            <div className="bg-slate-900/60 border border-slate-800/50 p-3 rounded-xl">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-0.5">NIF (Numéro Fiscale)</span>
              <span className="text-xs text-slate-200 font-mono block truncate">{businessDoc?.nif || "N/A"}</span>
            </div>
            <div className="bg-slate-900/60 border border-slate-800/50 p-3 rounded-xl">
              <span className="text-[9px] text-slate-400/80 font-bold uppercase tracking-wider block mb-0.5">Statut de validation</span>
              <span className="text-xs block font-extrabold text-amber-500">
                {currentStatus === "PENDING_APPROVAL" && "⏳ En attente"}
                {currentStatus === "ACTIVE" && "✅ Active"}
                {currentStatus === "SUSPENDED" && "🛑 Suspended"}
                {currentStatus === "REJECTED" && "❌ Rejetée"}
              </span>
            </div>
          </div>
        </div>

        {/* Actions bar */}
        <div className="flex gap-3 justify-between items-center bg-slate-950/50 p-3 rounded-2xl border border-slate-800/40 mt-6 md:flex-row flex-col">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 ml-2">
            <RefreshCw className="w-3.5 h-3.5 text-cyan-500 animate-spin" />
            <span>Écouteur Firebase actif (onSnapshot)</span>
          </div>

          <button
            onClick={() => logout()}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl font-bold transition-all w-full md:w-auto shrink-0"
          >
            <LogOut className="w-4 h-4" />
            Se déconnecter de la session
          </button>
        </div>
      </motion.div>
    </div>
  );
}
