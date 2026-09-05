import React, { useState } from "react";
import { motion } from "motion/react";
import { User, Phone, Building2, ArrowLeft, ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { useIdentity } from "../../modules/identity/IdentityContext";
import { useAuth } from "../../hooks/useAuth";
import { UserProfileRepository } from "../../repositories/UserProfileRepository";
import { toast } from "sonner";

interface MemberInfoFormProps {
  onBackToChoice?: () => void;
  onBack?: () => void;
  onSuccess: () => void;
}

export const MemberInfoForm: React.FC<MemberInfoFormProps> = ({ onBackToChoice, onBack, onSuccess }) => {
  const handleGoBack = onBack || onBackToChoice;
  const { identity, refresh } = useIdentity();
  const { user } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setErrorMsg("Veuillez renseigner votre prénom et nom.");
      return;
    }
    if (!phone.trim()) {
      setErrorMsg("Veuillez renseigner votre numéro de téléphone.");
      return;
    }

    const uid = user?.uid || identity?.user_uid;
    const email = user?.email || identity?.email;

    if (!uid || !email) {
      toast.error("Session utilisateur introuvable. Veuillez vous reconnecter.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await UserProfileRepository.registerMemberInfo(uid, {
        firstName,
        lastName,
        phone,
        companyCode: companyCode.trim() || undefined,
        email
      });

      toast.success("Informations enregistrées ! Vous êtes en attente d'invitation.");
      await refresh();
      onSuccess();
    } catch (err: any) {
      console.error("[MemberInfoForm] Submission failed:", err);
      setErrorMsg(err.message || "Impossible d'enregistrer vos informations.");
      toast.error("Erreur lors de l'enregistrement de vos informations.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="member-info-form-container" className="min-h-[80vh] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl bg-slate-900/90 border border-slate-800 rounded-3xl p-8 md:p-10 shadow-2xl backdrop-blur-xl"
      >
        <button
          type="button"
          onClick={onBackToChoice}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-cyan-400 transition-colors mb-6"
        >
          <ArrowLeft size={16} />
          Retour au choix du profil
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <User size={20} />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase font-bold tracking-widest text-cyan-400">
              Profil Collaborateur
            </span>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Informations Personnelles
            </h2>
          </div>
        </div>

        <p className="text-sm text-slate-400 mb-8 leading-relaxed">
          Renseignez vos coordonnées pour permettre aux administrateurs d'entreprise de vous identifier et vous assigner les accès appropriés.
        </p>

        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-sm">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="member-first-name" className="block text-xs font-semibold text-slate-300 mb-2">
                Prénom <span className="text-cyan-400">*</span>
              </label>
              <input
                id="member-first-name"
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ex: Jean"
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors text-sm"
              />
            </div>

            <div>
              <label htmlFor="member-last-name" className="block text-xs font-semibold text-slate-300 mb-2">
                Nom <span className="text-cyan-400">*</span>
              </label>
              <input
                id="member-last-name"
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Ex: Dupont"
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="member-phone" className="block text-xs font-semibold text-slate-300 mb-2">
              Numéro de téléphone <span className="text-cyan-400">*</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                id="member-phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+509 3000-0000"
                className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="member-company-code" className="block text-xs font-semibold text-slate-300 mb-2">
              Code Entreprise <span className="text-slate-500 font-normal">(Optionnel)</span>
            </label>
            <div className="relative">
              <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                id="member-company-code"
                type="text"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value)}
                placeholder="Ex: FINOPS-BIZ-892"
                className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors text-sm uppercase font-mono"
              />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Si votre employeur vous a fourni un code d'organisation, saisissez-le ici.
            </span>
          </div>

          <div className="pt-4 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={handleGoBack}
              className="px-5 py-3 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-xs font-semibold"
            >
              Annuler
            </button>

            <button
              id="submit-member-info-btn"
              type="submit"
              disabled={isSubmitting}
              className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold hover:brightness-110 active:scale-[0.99] transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50 text-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Enregistrement...
                </>
              ) : (
                <>
                  Rejoindre la salle d'attente
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
