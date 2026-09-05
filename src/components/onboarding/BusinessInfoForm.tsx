import React, { useState } from "react";
import { motion } from "motion/react";
import { 
  Building2, 
  User, 
  Phone, 
  FileText, 
  Briefcase, 
  ArrowLeft, 
  ArrowRight, 
  Loader2, 
  Check, 
  ShieldCheck,
  Zap,
  Sparkles,
  Crown
} from "lucide-react";
import { useIdentity } from "../../modules/identity/IdentityContext";
import { useAuth } from "../../hooks/useAuth";
import { PendingBusinessRepository } from "../../repositories/PendingBusinessRepository";
import { UserProfileRepository } from "../../repositories/UserProfileRepository";
import { toast } from "sonner";

interface BusinessInfoFormProps {
  onBackToChoice?: () => void;
  onBack?: () => void;
  onSuccess: () => void;
}

const INDUSTRIES = [
  "Finance & Microfinance",
  "Commerce de détail & Distribution",
  "Technologie & Services IT",
  "Santé & Pharmacie",
  "Hôtellerie & Restauration",
  "Immobilier & Construction",
  "Transport & Logistique",
  "Industrie & Manufacture",
  "Autre"
];

const PLANS = [
  {
    id: "STARTER" as const,
    name: "Starter",
    desc: "Pour les micro-entreprises et commerces débutants",
    badge: "Essentiel",
    icon: Zap,
    price: "49 USD / mois"
  },
  {
    id: "PROFESSIONAL" as const,
    name: "Professionnel",
    desc: "Pour les entreprises en croissance avec plusieurs branches",
    badge: "Populaire",
    icon: Sparkles,
    price: "129 USD / mois"
  },
  {
    id: "ENTERPRISE" as const,
    name: "Enterprise",
    desc: "Accès complet multi-devises, caisses avancées, audit et API",
    badge: "Complet",
    icon: Crown,
    price: "299 USD / mois"
  }
];

export const BusinessInfoForm: React.FC<BusinessInfoFormProps> = ({ onBackToChoice, onBack, onSuccess }) => {
  const handleGoBack = onBack || onBackToChoice;
  const { identity, refresh } = useIdentity();
  const { user } = useAuth();

  // Business fields
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState(INDUSTRIES[0]);
  const [taxId, setTaxId] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<"STARTER" | "PROFESSIONAL" | "BUSINESS" | "ENTERPRISE">("PROFESSIONAL");

  // Owner fields
  const [ownerFirstName, setOwnerFirstName] = useState("");
  const [ownerLastName, setOwnerLastName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!businessName.trim()) {
      setErrorMsg("Veuillez renseigner le nom de votre entreprise.");
      return;
    }
    if (!ownerFirstName.trim() || !ownerLastName.trim()) {
      setErrorMsg("Veuillez renseigner vos prénom et nom en tant que dirigeant.");
      return;
    }
    if (!ownerPhone.trim()) {
      setErrorMsg("Veuillez renseigner votre numéro de téléphone personnel.");
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
      const ownerFullName = `${ownerFirstName.trim()} ${ownerLastName.trim()}`.trim();

      // 1. Create document in pending_businesses collection
      const pendingRecord = await PendingBusinessRepository.create({
        ownerUid: uid,
        ownerEmail: email,
        ownerName: ownerFullName,
        businessName: businessName.trim(),
        taxId: taxId.trim(),
        industry,
        selectedPlan
      });

      console.debug("[BusinessInfoForm] Pending business document created:", {
        requestId: pendingRecord.id,
        collectionPath: `/pending_businesses/${pendingRecord.id}`,
        status: pendingRecord.status,
        record: pendingRecord
      });

      // 2. Update user profile to status PENDING_OWNER
      await UserProfileRepository.registerOwnerApplication(uid, {
        name: ownerFullName,
        phone: ownerPhone,
        email
      });

      toast.success("Demande d'activation envoyée ! Votre dossier est en cours de validation.");
      await refresh();
      onSuccess();
    } catch (err: any) {
      console.error("[BusinessInfoForm] Submission failed:", err);
      setErrorMsg(err.message || "Erreur lors de la soumission de la demande.");
      toast.error("Échec de la soumission de votre demande d'entreprise.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="business-info-form-container" className="min-h-[85vh] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl bg-slate-900/90 border border-slate-800 rounded-3xl p-8 md:p-10 shadow-2xl backdrop-blur-xl"
      >
        <button
          type="button"
          onClick={handleGoBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-cyan-400 transition-colors mb-6"
        >
          <ArrowLeft size={16} />
          Retour au choix du profil
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Building2 size={20} />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase font-bold tracking-widest text-cyan-400">
              Initialisation Espace Entreprise
            </span>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Création d'Entreprise
            </h2>
          </div>
        </div>

        <p className="text-sm text-slate-400 mb-8 leading-relaxed">
          Configurez votre organisation. Dès soumission, votre dossier sera transmis au Super Admin pour activation immédiate de votre espace de travail ERP.
        </p>

        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-sm">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* SECTION 1: Informations Entreprise */}
          <div className="space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold border-b border-slate-800 pb-2">
              1. Informations sur l'Organisation
            </h3>

            <div>
              <label htmlFor="business-name" className="block text-xs font-semibold text-slate-300 mb-2">
                Nom de l'entreprise <span className="text-cyan-400">*</span>
              </label>
              <div className="relative">
                <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  id="business-name"
                  type="text"
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Ex: Horizon Finance S.A."
                  className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="business-industry" className="block text-xs font-semibold text-slate-300 mb-2">
                  Secteur d'activité <span className="text-cyan-400">*</span>
                </label>
                <div className="relative">
                  <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <select
                    id="business-industry"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500 transition-colors text-sm"
                  >
                    {INDUSTRIES.map((ind) => (
                      <option key={ind} value={ind} className="bg-slate-900 text-white">
                        {ind}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="business-tax-id" className="block text-xs font-semibold text-slate-300 mb-2">
                  Numéro fiscal (NIF / CIN) <span className="text-slate-500 font-normal">(Optionnel)</span>
                </label>
                <div className="relative">
                  <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    id="business-tax-id"
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    placeholder="000-000-000-0"
                    className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors text-sm font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: Choix du Plan */}
          <div className="space-y-4 pt-2">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold border-b border-slate-800 pb-2">
              2. Plan d'Abonnement
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {PLANS.map((plan) => {
                const IconComponent = plan.icon;
                const isSelected = selectedPlan === plan.id;
                return (
                  <div
                    key={plan.id}
                    id={`plan-card-${plan.id.toLowerCase()}`}
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`cursor-pointer rounded-2xl p-4 border transition-all text-left flex flex-col justify-between ${
                      isSelected
                        ? "border-cyan-500 bg-cyan-950/20 shadow-lg shadow-cyan-500/10"
                        : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className={`p-2 rounded-lg ${isSelected ? "bg-cyan-500/20 text-cyan-400" : "bg-slate-800 text-slate-400"}`}>
                          <IconComponent size={16} />
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-cyan-500 flex items-center justify-center text-slate-950">
                            <Check size={12} strokeWidth={3} />
                          </div>
                        )}
                      </div>
                      <div className="font-bold text-white text-sm">{plan.name}</div>
                      <div className="text-[11px] text-slate-400 mt-1 leading-snug">{plan.desc}</div>
                    </div>
                    <div className="mt-3 pt-2 border-t border-slate-800/60 text-[11px] font-mono text-cyan-400 font-semibold">
                      {plan.price}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 3: Informations Propriétaire */}
          <div className="space-y-4 pt-2">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold border-b border-slate-800 pb-2">
              3. Informations du Propriétaire / Dirigeant
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="owner-first-name" className="block text-xs font-semibold text-slate-300 mb-2">
                  Prénom du dirigeant <span className="text-cyan-400">*</span>
                </label>
                <input
                  id="owner-first-name"
                  type="text"
                  required
                  value={ownerFirstName}
                  onChange={(e) => setOwnerFirstName(e.target.value)}
                  placeholder="Ex: Alex"
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors text-sm"
                />
              </div>

              <div>
                <label htmlFor="owner-last-name" className="block text-xs font-semibold text-slate-300 mb-2">
                  Nom du dirigeant <span className="text-cyan-400">*</span>
                </label>
                <input
                  id="owner-last-name"
                  type="text"
                  required
                  value={ownerLastName}
                  onChange={(e) => setOwnerLastName(e.target.value)}
                  placeholder="Ex: Saint-Vil"
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="owner-phone" className="block text-xs font-semibold text-slate-300 mb-2">
                Numéro de téléphone personnel <span className="text-cyan-400">*</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  id="owner-phone"
                  type="tel"
                  required
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  placeholder="+509 3000-0000"
                  className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors text-sm"
                />
              </div>
            </div>
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
              id="submit-business-creation-btn"
              type="submit"
              disabled={isSubmitting}
              className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold hover:brightness-110 active:scale-[0.99] transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50 text-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Soumission de la demande...
                </>
              ) : (
                <>
                  Envoyer la demande d'activation
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
