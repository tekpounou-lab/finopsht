import React from "react";
import { CreditCard, Zap, Package, Check, ShieldCheck, ArrowUpRight, BarChart3, Activity } from "lucide-react";
import { useBusinessContext } from "../../../../contexts/BusinessContext";
import { useBusinessAdmin } from "../../../../hooks/useBusinessAdmin";

const FEATURES_CATALOG = [
  { id: "payroll", label: "Moteur de Paie Enterprise", desc: "Calculs automatiques, taxes, et génération de fiches de paie.", tier: "STARTER" },
  { id: "attendance", label: "Gestion des Temps (QR/GPS)", desc: "Scanner QR, géolocalisation, et suivi des heures en temps réel.", tier: "STARTER" },
  { id: "accounting", label: "Grand Livre & Comptabilité", desc: "Double entrée, journaux comptables et états financiers.", tier: "PROFESSIONAL" },
  { id: "inventory", label: "Gestion de Stock", desc: "Suivi des actifs, alertes de seuil et inventaire multi-sites.", tier: "PROFESSIONAL" },
  { id: "ai_cfo", label: "AI Strategic CFO", desc: "Assistant intelligent pour l'analyse financière et recommandations.", tier: "ENTERPRISE" },
  { id: "api_access", label: "Accès API & Webhooks", desc: "Intégration avec des systèmes tiers et automation externe.", tier: "ENTERPRISE" },
];

export default function FeatureSubscriptionSection() {
  const { businessSettings } = useBusinessContext();
  const { updateFeatures, loading } = useBusinessAdmin();

  const currentPlan = businessSettings?.subscription?.plan || "STARTER";
  const enabledFeatures = businessSettings?.featureFlags || {};

  const handleToggleFeature = async (id: string) => {
    const newFeatures = { ...enabledFeatures, [id]: !enabledFeatures[id] };
    await updateFeatures(newFeatures);
  };

  return (
    <div className="space-y-8" id="subscription-section-root">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-100 uppercase tracking-tight">Modules & Abonnement</h3>
          <p className="text-xs text-slate-500 font-medium mt-1">Gérez votre licence Enterprise et activez les modules selon vos besoins.</p>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Plan {currentPlan} Actif</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Features Toggle */}
        <div className="lg:col-span-8 space-y-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-cyan-400" />
            Catalogue des Modules
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FEATURES_CATALOG.map(feature => {
              const enabled = enabledFeatures[feature.id];
              const isLocked = currentPlan === "STARTER" && (feature.tier === "PROFESSIONAL" || feature.tier === "ENTERPRISE");
              
              return (
                <div 
                  key={feature.id}
                  className={`p-4 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                    enabled 
                    ? "bg-slate-900 border-cyan-500/30" 
                    : "bg-slate-950/50 border-slate-900 opacity-80"
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-2 rounded-lg ${enabled ? "bg-cyan-500/10 text-cyan-400" : "bg-slate-900 text-slate-600"}`}>
                      <Zap className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border ${
                        feature.tier === "ENTERPRISE" ? "border-amber-500/30 text-amber-500" : "border-slate-800 text-slate-500"
                      }`}>
                        {feature.tier}
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className={`text-xs font-bold ${enabled ? "text-slate-100" : "text-slate-400"}`}>{feature.label}</p>
                    <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">{feature.desc}</p>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-900 flex items-center justify-between">
                    {isLocked ? (
                      <div className="flex items-center gap-1.5 text-amber-500">
                        <ArrowUpRight className="w-3 h-3" />
                        <span className="text-[9px] font-bold">UPGRADE REQUIS</span>
                      </div>
                    ) : (
                      <button 
                        onClick={() => handleToggleFeature(feature.id)}
                        disabled={loading}
                        className={`text-[10px] font-bold uppercase tracking-wider ${enabled ? "text-cyan-400" : "text-slate-500 hover:text-slate-300"}`}
                      >
                        {enabled ? "DÉSACTIVER" : "ACTIVER"}
                      </button>
                    )}
                    {enabled && <Check className="w-4 h-4 text-emerald-500" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Subscription Info */}
        <div className="lg:col-span-4 space-y-6">
          <div className="glass rounded-2xl p-6 space-y-6 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-5">
              <CreditCard className="w-24 h-24 text-slate-100" />
            </div>

            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-cyan-400" />
              Détails de Facturation
            </h4>

            <div className="space-y-4">
              <div className="p-4 bg-slate-950/50 border border-slate-900 rounded-xl">
                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Coût Mensuel Estimation</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-slate-100">$99</span>
                  <span className="text-xs text-slate-500">/ mois</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
                  <span>Utilisateurs (12/20)</span>
                  <span className="font-mono">60%</span>
                </div>
                <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                  <div className="w-[60%] h-full bg-cyan-500"></div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
                  <span>Stockage Documents (4GB/10GB)</span>
                  <span className="font-mono">40%</span>
                </div>
                <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                  <div className="w-[40%] h-full bg-cyan-500"></div>
                </div>
              </div>
            </div>

            <button className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-lg shadow-cyan-500/10 active:scale-95 flex items-center justify-center gap-2">
              UPGRADE VERS PROFESSIONAL
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 bg-slate-900/30 border border-slate-900 rounded-2xl flex items-start gap-3">
             <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <Activity className="w-4 h-4 text-amber-500" />
             </div>
             <div>
                <p className="text-[11px] font-bold text-slate-200">Facturation Automatique</p>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">Votre prochain versement sera prélevé le <span className="text-slate-300">01 Août 2026</span> via votre méthode de paiement enregistrée.</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
