import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Building2, 
  User, 
  Settings2, 
  MapPin, 
  CheckCircle2, 
  ChevronRight, 
  ChevronLeft,
  Loader2,
  ShieldCheck
} from "lucide-react";
import { useIdentity } from "../../modules/identity/IdentityContext";
import { useAuth } from "../../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { OnboardingDraftManager } from "./OnboardingDraftManager";
import { toast } from "sonner";

interface BusinessCreationWizardProps {
  onBackToChoice?: () => void;
  onStepChanged?: (step: number) => void;
}

export const BusinessCreationWizard: React.FC<BusinessCreationWizardProps> = ({
  onBackToChoice,
  onStepChanged
}) => {
  const { createBusiness } = useIdentity();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    personalName: "",
    businessName: "",
    nif: "",
    domain: "SME",
    branchName: "Siège Social",
    location: "Port-au-Prince"
  });

  // Rehydrate draft on mount
  useEffect(() => {
    if (user?.uid) {
      const draft = OnboardingDraftManager.getDraft(user.uid);
      if (draft.businessFormData) {
        setFormData(prev => ({
          ...prev,
          ...draft.businessFormData,
          personalName: draft.businessFormData?.personalName || user.displayName || prev.personalName
        }));
      } else if (user.displayName) {
        setFormData(prev => ({ ...prev, personalName: user.displayName || "" }));
      }
      if (draft.wizardStep && draft.wizardStep >= 1 && draft.wizardStep <= 4) {
        setStep(draft.wizardStep);
      }
    }
  }, [user?.uid, user?.displayName]);

  // Persist draft on step or form data change
  const updateFormData = (fields: Partial<typeof formData>) => {
    const updated = { ...formData, ...fields };
    setFormData(updated);
    if (user?.uid) {
      OnboardingDraftManager.saveDraft(user.uid, {
        activeState: "CREATE",
        wizardStep: step,
        businessFormData: updated
      });
    }
  };

  const handleStepChange = (newStep: number) => {
    setStep(newStep);
    if (onStepChanged) onStepChanged(newStep);
    if (user?.uid) {
      OnboardingDraftManager.saveDraft(user.uid, {
        activeState: "CREATE",
        wizardStep: newStep,
        businessFormData: formData
      });
    }
  };

  const nextStep = () => handleStepChange(step + 1);
  const prevStep = () => {
    if (step > 1) {
      handleStepChange(step - 1);
    } else if (onBackToChoice) {
      onBackToChoice();
    }
  };

  const handleSubmit = async () => {
    if (loading) return;

    // Check if user already belongs to an existing enterprise
    const existingBizId = (user as any)?.businessId || (user as any)?.business_id || (user as any)?.tenantId;
    if (existingBizId) {
      toast.info("Une entreprise est déjà associée à votre compte. Redirection vers la salle d'attente...");
      navigate("/waiting-room");
      return;
    }

    setLoading(true);
    try {
      await createBusiness(formData.businessName, {
        personalName: formData.personalName.trim(),
        ownerName: formData.personalName.trim(),
        name: formData.personalName.trim(),
        nif: formData.nif,
        domain: formData.domain,
        branchName: formData.branchName,
        location: formData.location
      });
      if (user?.uid) {
        OnboardingDraftManager.clearDraft(user.uid);
      }
      toast.success("Entreprise initiée avec succès ! Redirection vers la salle d'attente...");
      navigate("/waiting-room");
    } catch (err: any) {
      if (err.message === "BUSINESS_ALREADY_EXISTS") {
        toast.info("Votre entreprise est déjà enregistrée. Redirection vers la salle d'attente...");
        navigate("/waiting-room");
      } else {
        toast.error(`Échec d'initialisation: ${err.message}. Vous pouvez réessayer.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch(step) {
      case 1:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-cyan-500/20 rounded-lg">
                <User className="text-cyan-400" size={24} />
              </div>
              <h2 className="text-xl font-bold text-white">Informations Personnelles</h2>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">Nom Complet</label>
              <input 
                type="text"
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                value={formData.personalName}
                onChange={e => updateFormData({ personalName: e.target.value })}
                placeholder="Votre nom complet"
              />
            </div>
            <p className="text-xs text-slate-500 italic">
              Ces informations seront utilisées pour créer votre profil d'administrateur propriétaire.
            </p>
          </motion.div>
        );
      case 2:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-indigo-500/20 rounded-lg">
                <Building2 className="text-indigo-400" size={24} />
              </div>
              <h2 className="text-xl font-bold text-white">Votre Entreprise</h2>
            </div>
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Nom de l'Entreprise</label>
                <input 
                  type="text"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={formData.businessName}
                  onChange={e => updateFormData({ businessName: e.target.value })}
                  placeholder="Ex: Tek Pou Nou S.A."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">NIF (Optionnel)</label>
                <input 
                  type="text"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={formData.nif}
                  onChange={e => updateFormData({ nif: e.target.value })}
                  placeholder="000-000-000-0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Secteur d'Activité</label>
                <select 
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={formData.domain}
                  onChange={e => updateFormData({ domain: e.target.value })}
                >
                  <option value="SME">PME / Services</option>
                  <option value="RETAIL">Commerce de Détail</option>
                  <option value="TECH">Technologie</option>
                  <option value="LOGISTICS">Logistique</option>
                  <option value="HOSPITALITY">Hôtellerie / Restauration</option>
                </select>
              </div>
            </div>
          </motion.div>
        );
      case 3:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <MapPin className="text-purple-400" size={24} />
              </div>
              <h2 className="text-xl font-bold text-white">Premier Établissement</h2>
            </div>
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Nom de la Branche</label>
                <input 
                  type="text"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  value={formData.branchName}
                  onChange={e => updateFormData({ branchName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Localisation</label>
                <input 
                  type="text"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  value={formData.location}
                  onChange={e => updateFormData({ location: e.target.value })}
                />
              </div>
            </div>
          </motion.div>
        );
      case 4:
        return (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-8"
          >
            <div className="flex justify-center mb-6">
              <div className="p-4 bg-emerald-500/20 rounded-full">
                <ShieldCheck className="text-emerald-400" size={48} />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Prêt à démarrer ?</h2>
            <p className="text-slate-400 max-w-xs mx-auto mb-8">
              En cliquant sur confirmer, nous allons initialiser votre environnement ERP sécurisé.
            </p>
            
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 text-left space-y-3 mb-8">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Propriétaire:</span>
                <span className="text-white font-medium">{formData.personalName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Entreprise:</span>
                <span className="text-white font-medium">{formData.businessName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Secteur:</span>
                <span className="text-white font-medium">{formData.domain}</span>
              </div>
            </div>
          </motion.div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 selection:bg-cyan-500/30">
      <div className="w-full max-w-xl">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-[32px] overflow-hidden border border-white/5 shadow-2xl bg-slate-950/50 backdrop-blur-xl"
        >
          {/* Progress bar */}
          <div className="h-1 w-full bg-slate-800/50">
            <motion.div 
              className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500"
              initial={{ width: "25%" }}
              animate={{ width: `${(step / 4) * 100}%` }}
              transition={{ type: "spring", stiffness: 50, damping: 20 }}
            />
          </div>
          
          <div className="p-8 md:p-12">
            <AnimatePresence mode="wait">
              {renderStep()}
            </AnimatePresence>

            <div className="flex items-center justify-between mt-12 gap-4">
              {step > 1 ? (
                <button 
                  onClick={prevStep}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-3 text-slate-400 hover:text-white transition-colors font-black uppercase text-[10px] tracking-widest disabled:opacity-30"
                >
                  <ChevronLeft size={16} strokeWidth={3} />
                  <span>Retour</span>
                </button>
              ) : (
                <div />
              )}

              {step < 4 ? (
                <button 
                  onClick={nextStep}
                  disabled={!formData.businessName && step === 2}
                  className="flex items-center gap-2 bg-white text-black px-8 py-3 rounded-xl font-black uppercase text-[11px] tracking-widest hover:bg-cyan-400 transition-all active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed group shadow-xl shadow-white/5"
                >
                  <span>Continuer</span>
                  <ChevronRight size={16} strokeWidth={3} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
              ) : (
                <button 
                  onClick={handleSubmit}
                  disabled={loading}
                  className="relative flex items-center justify-center gap-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-10 py-4 rounded-2xl font-black uppercase text-[12px] tracking-[0.2em] hover:shadow-2xl hover:shadow-cyan-500/40 transition-all active:scale-95 disabled:opacity-50 overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                  {loading ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>
                      <span className="relative z-10">Initialiser FINOPS</span>
                      <CheckCircle2 size={18} className="relative z-10" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </motion.div>
        
        {/* Step indicators */}
        <div className="flex justify-center gap-2 mt-8">
          {[1, 2, 3, 4].map(s => (
            <div 
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                s === step ? "w-8 bg-cyan-500" : "w-2 bg-slate-800"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
