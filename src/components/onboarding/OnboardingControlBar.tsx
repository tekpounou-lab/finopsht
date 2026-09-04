import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  RotateCcw, 
  Globe, 
  LogOut, 
  RefreshCw, 
  Repeat, 
  ShieldCheck,
  WifiOff,
  AlertTriangle,
  X,
  Check,
  Sparkles,
  Info
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

export interface OnboardingControlBarProps {
  activeState: "RESOLVING" | "SELECT_PATH" | "CREATE" | "JOIN" | "WAITING_APPROVAL" | "INVITATION" | "OFFLINE";
  canGoBack?: boolean;
  onBack?: () => void;
  onSwitchPath?: () => Promise<void> | void;
  onReset?: () => Promise<void> | void;
  onRetry?: () => void;
  isOffline?: boolean;
  hasUnsavedData?: boolean;
  draftSummary?: {
    businessName?: string;
    personalName?: string;
    wizardStep?: number;
    joinCode?: string;
  };
}

export const OnboardingControlBar: React.FC<OnboardingControlBarProps> = ({
  activeState,
  canGoBack,
  onBack,
  onSwitchPath,
  onReset,
  onRetry,
  isOffline = false,
  hasUnsavedData = false,
  draftSummary
}) => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  // Modal visibility states
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [showLandingModal, setShowLandingModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  // Loading indicator for reset modal execution
  const [isResetting, setIsResetting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const getBadgeLabel = () => {
    if (isOffline || activeState === "OFFLINE") return "Mode Hors-Ligne";
    switch (activeState) {
      case "RESOLVING": return "1/4 • Résolution Identité";
      case "SELECT_PATH": return "2/4 • Sélection Mode";
      case "CREATE": return "3/4 • Enregistrement Entreprise";
      case "JOIN": return "3/4 • Demande de Raccordement";
      case "WAITING_APPROVAL": return "4/4 • Attente Approbation";
      case "INVITATION": return "3/4 • Validation Invitation";
      default: return "Onboarding FINOPS";
    }
  };

  // 1. Handlers for Switch Path Action
  const handleSwitchClick = () => {
    if (hasUnsavedData) {
      setShowSwitchModal(true);
    } else {
      executeSwitchPath();
    }
  };

  const executeSwitchPath = async () => {
    if (!onSwitchPath) return;
    setIsSwitching(true);
    try {
      const targetModeName = activeState === "CREATE" ? "Demande de Raccordement" : "Création d'Entreprise";
      toast.info(`Bascule vers le mode ${targetModeName}...`);
      await onSwitchPath();
      setShowSwitchModal(false);
    } catch (e) {
      toast.error("Erreur lors de la bascule de mode.");
    } finally {
      setIsSwitching(false);
    }
  };

  // 2. Handlers for Landing Navigation
  const handleLandingClick = () => {
    if (hasUnsavedData || (draftSummary?.wizardStep && draftSummary.wizardStep > 1)) {
      setShowLandingModal(true);
    } else {
      navigate("/landing");
    }
  };

  // 3. Handlers for Reset Action
  const handleResetClick = () => {
    setShowResetModal(true);
  };

  const executeReset = async () => {
    if (!onReset) return;
    setIsResetting(true);
    try {
      await onReset();
      toast.success("Procédure d'inscription réinitialisée avec succès.");
      setShowResetModal(false);
    } catch (e) {
      toast.error("Échec de la réinitialisation.");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <>
      <header 
        id="onboarding-control-header"
        className="w-full bg-slate-950/90 border-b border-slate-800/80 backdrop-blur-md px-4 py-3 sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 font-sans selection:bg-cyan-500/30 shadow-lg"
      >
        {/* Left section: Identity Gateway Logo + State Badge */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center font-black text-slate-950 text-sm shadow-md shadow-cyan-500/20">
            F
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-white text-xs font-bold tracking-tight">FINOPS ERP</span>
              <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">Gateway</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isOffline ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[9px] font-mono font-bold uppercase">
                  <WifiOff size={10} />
                  {getBadgeLabel()}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[9px] font-mono font-bold uppercase">
                  <ShieldCheck size={10} />
                  {getBadgeLabel()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right section: Control Actions */}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {/* Back Button */}
          {canGoBack && onBack && (
            <motion.button
              id="onboarding-btn-back"
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-200 hover:text-white text-xs font-mono font-bold transition-all cursor-pointer shadow-sm"
              title="Étape précédente / Back"
            >
              <ArrowLeft size={13} className="text-cyan-400" />
              <span>Précédent</span>
            </motion.button>
          )}

          {/* Button 1: Switch Path Button */}
          {onSwitchPath && (activeState === "CREATE" || activeState === "JOIN") && (
            <motion.button
              id="onboarding-btn-switch-path"
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={handleSwitchClick}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-950/70 hover:bg-indigo-900/90 border border-indigo-500/40 text-indigo-200 hover:text-white text-xs font-mono font-bold transition-all cursor-pointer shadow-md shadow-indigo-950/40 group"
              title="Basculer entre Créer une entreprise ou Rejoindre un espace existant"
            >
              <Repeat size={13} className="text-indigo-400 group-hover:rotate-180 transition-transform duration-300" />
              <div className="flex items-center gap-1.5">
                <span className="hidden sm:inline">Changer de mode</span>
                <span className="sm:hidden">Changer</span>
                
                {/* Visual Active Mode Badge Pill */}
                {activeState === "CREATE" ? (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[9px] font-bold uppercase tracking-wider">
                    Création
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-[9px] font-bold uppercase tracking-wider">
                    Demande
                  </span>
                )}
              </div>
            </motion.button>
          )}

          {/* Retry Button */}
          {onRetry && (isOffline || activeState === "OFFLINE") && (
            <motion.button
              id="onboarding-btn-retry"
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={onRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/40 text-emerald-300 hover:text-emerald-200 text-xs font-mono font-bold transition-all cursor-pointer shadow-sm"
              title="Réessayer la résolution"
            >
              <RefreshCw size={13} className="text-emerald-400" />
              <span>Réessayer</span>
            </motion.button>
          )}

          {/* Button 2: Go to Landing Button */}
          <motion.button
            id="onboarding-btn-landing"
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={handleLandingClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-800/90 text-slate-300 hover:text-cyan-300 text-xs font-mono font-bold transition-all cursor-pointer"
            title="Retourner à la page d'accueil publique FINOPS"
          >
            <Globe size={13} className="text-cyan-400" />
            <span className="hidden md:inline">Page d'Accueil</span>
          </motion.button>

          {/* Button 3: Cancel / Reset Button */}
          {onReset && activeState !== "RESOLVING" && (
            <motion.button
              id="onboarding-btn-reset"
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={handleResetClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/30 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 hover:text-rose-100 text-xs font-mono font-bold transition-all cursor-pointer shadow-sm"
              title="Effacer les données et recommencer l'inscription"
            >
              <RotateCcw size={13} className="text-rose-400" />
              <span className="hidden sm:inline">Réinitialiser</span>
            </motion.button>
          )}

          {/* Logout Button */}
          <motion.button
            id="onboarding-btn-logout"
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-mono font-bold transition-all cursor-pointer"
            title="Déconnexion"
          >
            <LogOut size={13} />
            <span className="hidden lg:inline">Déconnexion</span>
          </motion.button>
        </div>
      </header>

      {/* ==========================================
          1. CONFIRMATION MODAL: MODE SWITCH
         ========================================== */}
      <AnimatePresence>
        {showSwitchModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-slate-900 border border-indigo-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl shadow-indigo-950/50 flex flex-col gap-4 font-sans text-slate-100"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                    <Repeat size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Changer de mode d'inscription ?</h3>
                    <p className="text-[11px] text-slate-400 font-mono">Bascule de parcours FINOPS</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowSwitchModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Vous avez saisi des informations temporaires dans le formulaire de mode <strong>{activeState === "CREATE" ? "Création d'Entreprise" : "Demande de Raccordement"}</strong>.
                  </span>
                </div>
                <p className="text-slate-400 pl-6">
                  Passer au mode <strong>{activeState === "CREATE" ? "Demande de Raccordement" : "Création d'Entreprise"}</strong> réinitialisera ces données non enregistrées.
                </p>
              </div>

              {draftSummary?.businessName && (
                <div className="p-3 bg-indigo-950/30 border border-indigo-500/20 rounded-xl text-xs font-mono text-indigo-200 flex justify-between items-center">
                  <span className="text-slate-400">Entreprise en cours:</span>
                  <span className="font-bold text-indigo-300">{draftSummary.businessName}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSwitchModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase transition"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={isSwitching}
                  onClick={executeSwitchPath}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase transition flex items-center gap-2 shadow-lg shadow-indigo-600/30 disabled:opacity-50"
                >
                  {isSwitching ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  <span>Changer vers {activeState === "CREATE" ? "Demande" : "Création"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==========================================
          2. CONFIRMATION MODAL: LANDING EXIT
         ========================================== */}
      <AnimatePresence>
        {showLandingModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-slate-900 border border-cyan-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl shadow-cyan-950/50 flex flex-col gap-4 font-sans text-slate-100"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                    <Globe size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Quitter l'inscription ?</h3>
                    <p className="text-[11px] text-slate-400 font-mono">Retour vers FINOPS Landing Page</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowLandingModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 flex items-start gap-2.5">
                <Info size={18} className="text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-slate-200 mb-1">Votre progression sera conservée en brouillon.</p>
                  <p className="text-slate-400">Vous pourrez reprendre votre inscription ultérieurement lorsque vous vous reconnecterez.</p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLandingModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase transition"
                >
                  Poursuivre l'inscription
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowLandingModal(false);
                    navigate("/landing");
                  }}
                  className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black text-xs uppercase transition flex items-center gap-2 shadow-lg shadow-cyan-600/30"
                >
                  <Globe size={14} />
                  <span>Accéder à l'Accueil</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==========================================
          3. CONFIRMATION MODAL: RESET FLOW
         ========================================== */}
      <AnimatePresence>
        {showResetModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl shadow-rose-950/50 flex flex-col gap-4 font-sans text-slate-100"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
                    <RotateCcw size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Réinitialiser l'inscription ?</h3>
                    <p className="text-[11px] text-rose-400 font-mono">Action destructive irréversible</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowResetModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="text-xs text-slate-300 leading-relaxed bg-rose-950/20 p-3.5 rounded-xl border border-rose-500/20 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                  <span className="font-bold text-rose-200">
                    Cette action effacera complètement votre brouillon d'inscription et vous ramènera à l'Étape 1.
                  </span>
                </div>
              </div>

              {/* Summary of items to reset */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2 font-mono text-xs text-slate-400">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Éléments qui seront effacés :</span>
                <div className="flex justify-between items-center text-slate-300">
                  <span>• Nom entreprise :</span>
                  <strong className="text-white">{draftSummary?.businessName || "Non renseigné"}</strong>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span>• Responsable :</span>
                  <strong className="text-white">{draftSummary?.personalName || "Non renseigné"}</strong>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span>• Étape actuelle :</span>
                  <strong className="text-amber-400">Étape {draftSummary?.wizardStep || 1} sur 4</strong>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase transition"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={isResetting}
                  onClick={executeReset}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase transition flex items-center gap-2 shadow-lg shadow-rose-600/30 disabled:opacity-50"
                >
                  {isResetting ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <RotateCcw size={14} />
                  )}
                  <span>Réinitialiser tout</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
