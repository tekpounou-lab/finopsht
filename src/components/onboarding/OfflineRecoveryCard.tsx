import React from "react";
import { WifiOff, RefreshCw, Globe, LogOut, ShieldAlert } from "lucide-react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

export interface OfflineRecoveryCardProps {
  onRetry: () => void;
  lastSavedAt?: string;
}

export const OfflineRecoveryCard: React.FC<OfflineRecoveryCardProps> = ({
  onRetry,
  lastSavedAt
}) => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 font-sans selection:bg-amber-500/30">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg bg-slate-950/90 border border-amber-500/30 rounded-3xl p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600" />

        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-6 shadow-inner">
            <WifiOff className="text-amber-400" size={32} />
          </div>

          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-400 mb-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
            Connexion Réseau Interrompue
          </span>

          <h2 className="text-2xl font-black text-white mb-3 tracking-tight">
            Mode de Récupération Hors-Ligne
          </h2>

          <p className="text-slate-400 text-sm leading-relaxed mb-6">
            Votre connexion internet a été temporairement perdue pendant la résolution d'identité. 
            <span className="text-slate-200 font-semibold block mt-1">
              Votre progression et vos données saisies ont été sauvegardées en toute sécurité.
            </span>
          </p>

          {lastSavedAt && (
            <div className="w-full bg-slate-900/80 border border-slate-800 rounded-xl p-3 mb-6 text-xs text-slate-400 flex items-center justify-between font-mono">
              <span className="text-slate-500">Dernière sauvegarde locale:</span>
              <span className="text-amber-400 font-bold">{new Date(lastSavedAt).toLocaleTimeString()}</span>
            </div>
          )}

          <div className="w-full flex flex-col gap-3">
            <button
              onClick={onRetry}
              className="w-full py-3.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-amber-500/20 active:scale-98"
            >
              <RefreshCw size={16} />
              <span>Réessayer la connexion</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => navigate("/landing")}
                className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Globe size={14} className="text-cyan-400" />
                <span>Accueil</span>
              </button>

              <button
                onClick={logout}
                className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-rose-400 text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <LogOut size={14} />
                <span>Déconnexion</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
