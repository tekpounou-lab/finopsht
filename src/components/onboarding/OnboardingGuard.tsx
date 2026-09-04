import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useIdentity } from "../../modules/identity/IdentityContext";
import { WifiOff, RefreshCw, LogOut } from "lucide-react";
import { motion } from "motion/react";

interface OnboardingGuardProps {
  children?: React.ReactNode;
}

/**
 * OnboardingGuard
 * Manages loading spinners, unauthenticated redirects, and network error screens.
 * Destination routing for active users is handled authoritatively by AuthNavigationEngine.
 */
export const OnboardingGuard: React.FC<OnboardingGuardProps> = ({ children }) => {
  const { user, logout, isResolved } = useAuth();
  const { identity, refresh, error } = useIdentity();

  // 1. Loading State: Wait for authoritative resolution
  if (!isResolved) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 font-sans p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md flex flex-col items-center"
        >
          <div className="relative w-20 h-20 mb-8 flex items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 rounded-3xl border border-slate-800 shadow-2xl">
            <div className="absolute inset-0 rounded-3xl bg-cyan-500/5 animate-pulse" />
            <div className="w-8 h-8 border-2 border-transparent border-t-cyan-500 rounded-full animate-spin" />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-cyan-400 mb-2 font-semibold">
            FINOPS Identity Resolution
          </span>
          <h2 className="text-sm font-medium text-slate-400 mb-6">
            Résolution de votre profil et espace de travail...
          </h2>
        </motion.div>
      </div>
    );
  }

  // 2. Unauthenticated -> Redirect to Login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 3. Network Failure / Error State (DO NOT REDIRECT TO ONBOARDING)
  const isError = 
    identity?.orchestratorState === "ERROR" || 
    identity?.terminalError === "NETWORK_OFFLINE" || 
    Boolean(error);

  if (isError) {
    return (
      <div className="min-h-screen bg-[#020617] text-slate-100 flex items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-xl text-center"
        >
          <div className="w-16 h-16 mx-auto mb-6 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center text-red-400">
            <WifiOff className="w-8 h-8" />
          </div>

          <h2 className="text-xl font-bold text-slate-100 mb-2">
            Problème de connexion au profil
          </h2>

          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            Impossible de charger votre profil d'entreprise en raison d'une erreur réseau ou d'un délai d'attente dépassé. 
            Veuillez vérifier votre connexion internet et réessayer.
          </p>

          <div className="space-y-3">
            <button
              onClick={() => refresh()}
              id="retry-identity-resolution-btn"
              className="w-full py-3 px-4 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/20 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Réessayer la connexion
            </button>

            <button
              onClick={() => logout()}
              id="logout-on-error-btn"
              className="w-full py-2.5 px-4 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-slate-100 text-sm font-medium rounded-xl transition flex items-center justify-center gap-2 border border-slate-700/50 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Se déconnecter
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // 4. Identity is resolved and valid for onboarding / choice flows -> render children
  return <>{children}</>;
};
