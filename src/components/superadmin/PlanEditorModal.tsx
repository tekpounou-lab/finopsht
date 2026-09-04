import React, { useState, useEffect } from "react";
import { 
  X, 
  Check, 
  DollarSign, 
  Users, 
  CreditCard, 
  Landmark, 
  Smartphone, 
  Zap, 
  Shield, 
  Sparkles, 
  Building, 
  Database, 
  Clock, 
  Tag, 
  AlertCircle 
} from "lucide-react";
import { 
  SubscriptionPlanDocument, 
  PaymentGatewayType 
} from "../../repositories/SubscriptionPlanRepository";
import { toast } from "sonner";

interface PlanEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: SubscriptionPlanDocument | null;
  onSave: (plan: SubscriptionPlanDocument) => Promise<void>;
}

const AVAILABLE_MODULES = [
  { id: "attendance", label: "Pointage QR & Présence" },
  { id: "payroll", label: "Paie V3 (ONA / OFATMA / Barèmes)" },
  { id: "accounting", label: "Grand Livre & Comptabilité Double-Entrée" },
  { id: "hr", label: "Gestion RH, Congés & Contrats" },
  { id: "bi", label: "Tableaux de Bord & BI Financière" },
  { id: "aiCfo", label: "Assistant IA CFO & Prévisions" },
  { id: "multiBranch", label: "Gestion Multi-Succursales" },
  { id: "commissionEngine", label: "Moteur de Commissions & Ventes" },
  { id: "auditVault", label: "Coffre-fort Forensique SHA-256" },
  { id: "customSla", label: "SLA Dédié & Support 24/7" },
  { id: "disasterRecovery", label: "Sauvegardes & Haute Disponibilité" }
];

export default function PlanEditorModal({
  isOpen,
  onClose,
  plan,
  onSave
}: PlanEditorModalProps) {
  const [formData, setFormData] = useState<Partial<SubscriptionPlanDocument>>({});
  const [activeSubTab, setActiveSubTab] = useState<"general" | "pricing" | "gateways" | "features">("general");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (plan) {
      setFormData({
        ...plan,
        priceUsd: plan.priceUsd ?? plan.price ?? 0,
        priceHtg: plan.priceHtg ?? ((plan.price || 0) * 131),
        userLimit: plan.userLimit ?? 10,
        extraUserPriceUsd: plan.extraUserPriceUsd ?? 5,
        extraUserPriceHtg: plan.extraUserPriceHtg ?? 650,
        maxBranches: plan.maxBranches ?? 1,
        maxTransactions: plan.maxTransactions ?? 1000,
        maxStorageMB: plan.maxStorageMB ?? 1000,
        supportedGateways: plan.supportedGateways ?? ["stripe", "moncash", "natcash", "bank_transfer"],
        featuresEnabled: plan.featuresEnabled ?? ["attendance", "payroll", "hr"]
      });
    } else {
      // New Plan Default Template
      setFormData({
        id: `PLAN_${Date.now().toString(36).toUpperCase()}`,
        code: "CUSTOM_PLAN",
        name: "Nouveau Forfait Personnalisé",
        price: 99,
        currency: "USD",
        priceUsd: 99,
        priceHtg: 12900,
        extraUserPriceUsd: 4,
        extraUserPriceHtg: 520,
        billingCycle: "MONTHLY",
        userLimit: 30, // Default 30 collaborateurs
        maxBranches: 2,
        maxTransactions: 5000,
        maxStorageMB: 2000,
        description: "Forfait entreprise adapté pour 30 collaborateurs avec paiements Stripe et MonCash.",
        featuresEnabled: ["attendance", "payroll", "hr", "accounting"],
        status: "ACTIVE",
        supportedGateways: ["stripe", "moncash", "natcash", "bank_transfer"],
        stripePriceId: "price_custom_usd_99",
        moncashServiceId: "MC_CUSTOM_12900HTG",
        natcashServiceId: "NC_CUSTOM_12900HTG"
      });
    }
  }, [plan, isOpen]);

  if (!isOpen) return null;

  const handleGatewayToggle = (gateway: PaymentGatewayType) => {
    const current = formData.supportedGateways || [];
    if (current.includes(gateway)) {
      setFormData({ ...formData, supportedGateways: current.filter(g => g !== gateway) });
    } else {
      setFormData({ ...formData, supportedGateways: [...current, gateway] });
    }
  };

  const handleFeatureToggle = (featureId: string) => {
    const current = formData.featuresEnabled || [];
    if (current.includes(featureId)) {
      setFormData({ ...formData, featuresEnabled: current.filter(f => f !== featureId) });
    } else {
      setFormData({ ...formData, featuresEnabled: [...current, featureId] });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.userLimit) {
      toast.error("Veuillez renseigner le nom du forfait et la limite de collaborateurs.");
      return;
    }

    try {
      setIsSaving(true);
      await onSave(formData as SubscriptionPlanDocument);
      toast.success(`Forfait ${formData.name} mis à jour avec succès (${formData.userLimit} collaborateurs).`);
      onClose();
    } catch (err: any) {
      console.error("Save plan error:", err);
      toast.error("Erreur lors de la sauvegarde du forfait : " + (err?.message || "Inconnu"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in" id="plan-editor-modal">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                {plan ? `Modifier le Forfait : ${plan.name}` : "Créer un Nouveau Forfait SaaS"}
              </h3>
              <p className="text-xs text-slate-400">
                Ajustez dynamiquement la capacité de collaborateurs (ex. 10 à 30), les tarifs et les passerelles de paiement.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-tabs Navigation */}
        <div className="px-6 py-2.5 bg-slate-950/60 border-b border-slate-800 flex gap-2 overflow-x-auto">
          {[
            { id: "general", label: "1. Capacité & Profil", icon: Users },
            { id: "pricing", label: "2. Tarification Multi-Devises", icon: DollarSign },
            { id: "gateways", label: "3. Passerelles (Stripe/MonCash/Natcash)", icon: CreditCard },
            { id: "features", label: "4. Modules & Quotas", icon: Sparkles }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition ${
                  active
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* TAB 1: GENERAL & COLLABORATEURS LIMIT */}
          {activeSubTab === "general" && (
            <div className="space-y-4">
              <div className="p-4 bg-cyan-950/30 border border-cyan-500/20 rounded-xl flex gap-3">
                <AlertCircle className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-300 space-y-1">
                  <span className="font-bold text-cyan-300 block">Capacité Dynamique des Collaborateurs :</span>
                  Vous pouvez augmenter ou diminuer le quota de collaborateurs (ex: passer de 10 à 30). Toutes les entreprises sous ce forfait verront instantanément leur seuil de tolérance ajusté sans interruption de service.
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono font-bold text-slate-300 mb-1.5">
                    Code Unique du Forfait (ID)
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!plan}
                    value={formData.code || formData.id || ""}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase(), id: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                    placeholder="EX: PRO_30, ENTERPRISE"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-slate-300 mb-1.5">
                    Nom Commercial du Forfait
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name || ""}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-sans font-bold text-slate-200 focus:outline-none focus:border-cyan-500"
                    placeholder="Ex: Starter 30 Collaborateurs"
                  />
                </div>
              </div>

              {/* Dynamic User Limit (Collaborateurs) */}
              <div className="p-4 bg-slate-950/80 border border-cyan-500/30 rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-mono font-bold text-cyan-400 flex items-center gap-1.5">
                    <Users className="w-4 h-4" /> Limite de Collaborateurs Actifs (Capacité Maximale)
                  </label>
                  <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded">
                    {formData.userLimit || 10} Collaborateurs inclus
                  </span>
                </div>
                <input
                  type="number"
                  min="1"
                  max="100000"
                  required
                  value={formData.userLimit ?? 10}
                  onChange={(e) => setFormData({ ...formData, userLimit: parseInt(e.target.value) || 10 })}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm font-mono font-bold text-slate-100 focus:outline-none focus:border-cyan-500"
                  placeholder="Ex: 30"
                />
                {/* Preset quick buttons */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="text-[11px] font-mono text-slate-400 py-1">Préréglages rapides :</span>
                  {[10, 20, 30, 50, 100, 150, 500, 1000].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setFormData({ ...formData, userLimit: count })}
                      className={`px-2.5 py-1 text-xs font-mono rounded-lg border transition ${
                        formData.userLimit === count
                          ? "bg-cyan-500 text-slate-950 font-bold border-cyan-400 shadow-sm"
                          : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                      }`}
                    >
                      {count} collabs
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-bold text-slate-300 mb-1.5">
                  Description du Forfait & Cible
                </label>
                <textarea
                  rows={2}
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
                  placeholder="Ex: Idéal pour les PME en forte croissance ayant jusqu'à 30 collaborateurs."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-mono font-bold text-slate-300 mb-1.5">
                    Statut du Forfait
                  </label>
                  <select
                    value={formData.status || "ACTIVE"}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200"
                  >
                    <option value="ACTIVE">ACTIVE (Disponible aux clients)</option>
                    <option value="INACTIVE">INACTIVE (Désactivé)</option>
                    <option value="ARCHIVED">ARCHIVED (Archivé)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-slate-300 mb-1.5">
                    Badge de Mise en Avant
                  </label>
                  <input
                    type="text"
                    value={formData.badgeText || ""}
                    onChange={(e) => setFormData({ ...formData, badgeText: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-sans text-slate-200"
                    placeholder="Ex: Recommandé, Économique"
                  />
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-slate-300">
                    <input
                      type="checkbox"
                      checked={!!formData.isPopular}
                      onChange={(e) => setFormData({ ...formData, isPopular: e.target.checked })}
                      className="w-4 h-4 rounded text-cyan-500 bg-slate-950 border-slate-800 focus:ring-0"
                    />
                    <span>Marquer comme "Populaire"</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PRICING MULTI-CURRENCY */}
          {activeSubTab === "pricing" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                  <label className="text-xs font-mono font-bold text-cyan-400 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4" /> Prix de Base (USD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-500 text-xs font-mono">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={formData.priceUsd ?? formData.price ?? 0}
                      onChange={(e) => {
                        const usd = parseFloat(e.target.value) || 0;
                        setFormData({ 
                          ...formData, 
                          priceUsd: usd, 
                          price: usd,
                          priceHtg: Math.round(usd * 131)
                        });
                      }}
                      className="w-full pl-8 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono font-bold text-slate-100 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 block font-mono">Facturation mensuelle récurrente Stripe ou Virement.</span>
                </div>

                <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                  <label className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1.5">
                    <Landmark className="w-4 h-4" /> Équivalent en Gourdes (HTG)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      required
                      value={formData.priceHtg ?? 0}
                      onChange={(e) => setFormData({ ...formData, priceHtg: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-4 pr-12 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
                    />
                    <span className="absolute right-3 top-2 text-slate-500 text-xs font-mono">HTG</span>
                  </div>
                  <span className="text-[10px] text-slate-400 block font-mono">Montant débité pour MonCash et Natcash.</span>
                </div>
              </div>

              {/* Extra Seat Addon Pricing */}
              <div className="p-4 bg-slate-950 border border-slate-850 rounded-xl space-y-3">
                <h4 className="text-xs font-bold font-mono text-slate-200 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-cyan-400" /> Tarif par Collaborateur Additionnel (Au-delà du Quota)
                </h4>
                <p className="text-[11px] text-slate-400">
                  Si une entreprise dépasse sa limite de {formData.userLimit || 10} collaborateurs, le moteur FinOps applique ces frais unitaires mensuels :
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">
                      Prix Extra Seat (USD / collab / mois)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={formData.extraUserPriceUsd ?? 5}
                      onChange={(e) => setFormData({ ...formData, extraUserPriceUsd: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">
                      Prix Extra Seat (HTG / collab / mois)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={formData.extraUserPriceHtg ?? 650}
                      onChange={(e) => setFormData({ ...formData, extraUserPriceHtg: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-emerald-400"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono font-bold text-slate-300 mb-1.5">
                    Cycle de Facturation
                  </label>
                  <select
                    value={formData.billingCycle || "MONTHLY"}
                    onChange={(e) => setFormData({ ...formData, billingCycle: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200"
                  >
                    <option value="MONTHLY">Mensuel (Standard)</option>
                    <option value="ANNUAL">Annuel (Remise 15% suggérée)</option>
                    <option value="QUARTERLY">Trimestriel</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-slate-300 mb-1.5">
                    Période d'Essai Gratuit (Jours)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.trialDays ?? 0}
                    onChange={(e) => setFormData({ ...formData, trialDays: parseInt(e.target.value) || 0 })}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200"
                    placeholder="0 ou 30"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PAYMENT GATEWAYS (STRIPE, MONCASH, NATCASH) */}
          {activeSubTab === "gateways" && (
            <div className="space-y-4">
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300">
                <span className="font-bold text-cyan-400 block mb-1">Passerelles de Paiement Compatibles :</span>
                Activez les canaux de règlement pour ce forfait et configurez les identifiants d'API associés (Stripe Product/Price IDs, codes marchands MonCash Digicel et Natcash Natcom).
              </div>

              {/* Gateways Checkboxes */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { id: "stripe", label: "Stripe", icon: CreditCard, color: "text-indigo-400" },
                  { id: "moncash", label: "MonCash", icon: Smartphone, color: "text-rose-400" },
                  { id: "natcash", label: "Natcash", icon: Smartphone, color: "text-cyan-400" },
                  { id: "bank_transfer", label: "Virement", icon: Landmark, color: "text-amber-400" }
                ].map((gw) => {
                  const Icon = gw.icon;
                  const isChecked = (formData.supportedGateways || []).includes(gw.id as any);
                  return (
                    <div
                      key={gw.id}
                      onClick={() => handleGatewayToggle(gw.id as any)}
                      className={`p-3 rounded-xl border cursor-pointer transition flex items-center gap-2.5 ${
                        isChecked
                          ? "bg-slate-900 border-cyan-500/50 shadow-sm"
                          : "bg-slate-950 border-slate-850 opacity-60 hover:opacity-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="w-4 h-4 rounded text-cyan-500 bg-slate-950 border-slate-800"
                      />
                      <div>
                        <span className={`text-xs font-bold font-mono block ${gw.color}`}>{gw.label}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{isChecked ? "Activé" : "Inactif"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Stripe Configuration */}
              <div className="p-4 bg-slate-950/80 border border-indigo-500/20 rounded-xl space-y-3">
                <h4 className="text-xs font-bold font-mono text-indigo-400 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4" /> Paramètres Stripe (Carte de Crédit / Débit Internationale)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Stripe Price ID</label>
                    <input
                      type="text"
                      value={formData.stripePriceId || ""}
                      onChange={(e) => setFormData({ ...formData, stripePriceId: e.target.value })}
                      placeholder="price_1Nxxx..."
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Stripe Product ID</label>
                    <input
                      type="text"
                      value={formData.stripeProductId || ""}
                      onChange={(e) => setFormData({ ...formData, stripeProductId: e.target.value })}
                      placeholder="prod_xxx..."
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200"
                    />
                  </div>
                </div>
              </div>

              {/* MonCash Configuration */}
              <div className="p-4 bg-slate-950/80 border border-rose-500/20 rounded-xl space-y-3">
                <h4 className="text-xs font-bold font-mono text-rose-400 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" /> Paramètres MonCash (Digicel Haïti - Mobile Money)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Service ID / Identifiant de Facture</label>
                    <input
                      type="text"
                      value={formData.moncashServiceId || ""}
                      onChange={(e) => setFormData({ ...formData, moncashServiceId: e.target.value })}
                      placeholder="MC_PRO_19500HTG"
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Code Marchand / Merchant Code</label>
                    <input
                      type="text"
                      value={formData.moncashMerchantCode || ""}
                      onChange={(e) => setFormData({ ...formData, moncashMerchantCode: e.target.value })}
                      placeholder="FINOPS_MC_01"
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200"
                    />
                  </div>
                </div>
              </div>

              {/* Natcash Configuration */}
              <div className="p-4 bg-slate-950/80 border border-cyan-500/20 rounded-xl space-y-3">
                <h4 className="text-xs font-bold font-mono text-cyan-400 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" /> Paramètres Natcash (Natcom Haïti - Mobile Money)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Service ID / Plan Code</label>
                    <input
                      type="text"
                      value={formData.natcashServiceId || ""}
                      onChange={(e) => setFormData({ ...formData, natcashServiceId: e.target.value })}
                      placeholder="NC_PRO_19500HTG"
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Code Marchand Natcash</label>
                    <input
                      type="text"
                      value={formData.natcashMerchantCode || ""}
                      onChange={(e) => setFormData({ ...formData, natcashMerchantCode: e.target.value })}
                      placeholder="FINOPS_NC_01"
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: FEATURES & LIMITS */}
          {activeSubTab === "features" && (
            <div className="space-y-4">
              {/* Quotas */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 bg-slate-950 border border-slate-850 rounded-xl">
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">Succursales Max</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.maxBranches ?? 1}
                    onChange={(e) => setFormData({ ...formData, maxBranches: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200"
                  />
                </div>
                <div className="p-3.5 bg-slate-950 border border-slate-850 rounded-xl">
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">Transactions Max / mois</label>
                  <input
                    type="number"
                    min="100"
                    value={formData.maxTransactions ?? 1000}
                    onChange={(e) => setFormData({ ...formData, maxTransactions: parseInt(e.target.value) || 1000 })}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200"
                  />
                </div>
                <div className="p-3.5 bg-slate-950 border border-slate-850 rounded-xl">
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">Stockage Pièces (MB)</label>
                  <input
                    type="number"
                    min="100"
                    value={formData.maxStorageMB ?? 1000}
                    onChange={(e) => setFormData({ ...formData, maxStorageMB: parseInt(e.target.value) || 1000 })}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200"
                  />
                </div>
              </div>

              {/* Modules Matrix */}
              <div>
                <h4 className="text-xs font-bold font-mono text-slate-200 mb-2.5">
                  Modules et Fonctionnalités Incluses dans ce Forfait :
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {AVAILABLE_MODULES.map((mod) => {
                    const isChecked = (formData.featuresEnabled || []).includes(mod.id);
                    return (
                      <div
                        key={mod.id}
                        onClick={() => handleFeatureToggle(mod.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                          isChecked
                            ? "bg-slate-900 border-cyan-500/40 text-slate-100"
                            : "bg-slate-950/60 border-slate-850 text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        <span className="text-xs font-sans font-medium">{mod.label}</span>
                        <div className={`w-4 h-4 rounded flex items-center justify-center border ${
                          isChecked ? "bg-cyan-500 border-cyan-400 text-slate-950" : "border-slate-700"
                        }`}>
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          </div>

          {/* Modal Footer Buttons */}
          <div className="p-6 bg-slate-900 border-t border-slate-800 flex justify-between items-center shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-mono transition"
            >
              Annuler
            </button>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs font-mono transition shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Check className="w-4 h-4" />
                {isSaving ? "Sauvegarde en cours..." : "Enregistrer les Modifications"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
