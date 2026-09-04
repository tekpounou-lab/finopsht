import React, { useState } from "react";
import { motion } from "motion/react";
import { ShieldAlert, RefreshCw, LogOut, ArrowRight, Home } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useI18n } from "../i18n";

export default function AccountRecovery() {
  const { logout, user, dbUser } = useAuth();
  const { language } = useI18n();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleResetProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const userRef = doc(db, "users", user.uid);
      
      // Update core state so resolver thinks they are brand new and lets them pick again
      await updateDoc(userRef, {
        business_id: "",
        branch_id: "",
        department_id: "",
        role: "OWNER",
        account_status: "NEW_USER",
        onboarding_completed: false
      });

      toast.success(language === "fr" ? "Votre profil a été réinitialisé avec succès !" : language === "ht" ? "Profil ou a mete a zewo ak siksè !" : "Your profile has been reset successfully!");
      
      // Give firebase listener time to update and redirect
      setTimeout(() => {
        navigate("/resolve");
      }, 800);
    } catch (err: any) {
      console.error("Error resetting profile during recovery:", err);
      toast.error((language === "fr" ? "Échec de la réinitialisation du profil : " : language === "ht" ? "Echèk nan mete profil a zewo : " : "Failed to reset profile: ") + err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-amber-500 to-rose-500" />
        
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="w-8 h-8 text-red-500 animate-pulse" />
        </div>
        
        <h1 className="text-2xl font-black text-slate-100 mb-2">
          {language === "fr" ? "Workspace introuvable" : language === "ht" ? "Workspace pa jwenn" : "Workspace not found"}
        </h1>
        <p className="text-slate-400 mb-6 text-sm leading-relaxed">
          {language === "fr" ? `Le business (${dbUser?.business_id || "Inconnu"}) associé à votre compte a été supprimé ou est introuvable sur nos serveurs.` : language === "ht" ? `Biznis (${dbUser?.business_id || "Inconnu"}) ki lye ak kont ou a te efase oswa li pa jwenn sou sèvè nou yo.` : `The business (${dbUser?.business_id || "Unknown"}) associated with your account has been deleted or cannot be found on our servers.`}
        </p>
        
        <div className="bg-slate-950/60 rounded-xl p-4 mb-8 flex flex-col gap-2 text-left border border-slate-800/50">
          <span className="text-[10px] text-slate-500 font-mono font-black uppercase tracking-wider block mb-1">
            {language === "fr" ? "Détails d'incident" : language === "ht" ? "Detay ensidan" : "Incident Details"}
          </span>
          <div className="text-xs text-slate-450 leading-relaxed font-mono">
            • UID: <span className="text-slate-350">{user?.uid?.substring(0, 10)}...</span><br/>
            • Email: <span className="text-slate-350">{user?.email}</span><br/>
            • Statut: <span className="text-rose-400 font-bold">ORPHANED_TENANT</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button 
            disabled={loading}
            onClick={handleResetProfile}
            className="flex items-center justify-center gap-2.5 w-full py-3 px-4 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 disabled:opacity-50 text-slate-950 rounded-xl font-bold transition-all shadow-md shadow-cyan-500/5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? (language === "fr" ? "Réinitialisation..." : language === "ht" ? "Ap mete a zewo..." : "Resetting...") : (language === "fr" ? "Réinitialiser mon profil" : language === "ht" ? "Mete profil mwen a zewo" : "Reset my profile")}
          </button>
          
          <button 
            onClick={() => logout()}
            className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-slate-800 hover:bg-slate-755 text-slate-300 rounded-xl font-medium transition-colors border border-slate-750"
          >
            <LogOut className="w-4 h-4" />
            {language === "fr" ? "Se déconnecter" : language === "ht" ? "Dekonekte" : "Log out"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
