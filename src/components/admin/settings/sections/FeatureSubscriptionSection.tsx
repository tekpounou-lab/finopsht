import React, { useState, useEffect } from "react";
import { CreditCard, Zap, Package, Check, ShieldCheck, ArrowUpRight, Activity, Users, AlertTriangle, Sparkles, X, RefreshCw } from "lucide-react";
import { useBusinessContext } from "../../../../contexts/BusinessContext";
import { useBusinessAdmin } from "../../../../hooks/useBusinessAdmin";
import { SubscriptionPlanRepository, SubscriptionPlanDocument } from "../../../../repositories/SubscriptionPlanRepository";
import { SubscriptionService } from "../../../../services/billing/SubscriptionService";
import { PermissionService } from "../../../../services/PermissionService";
import { toast } from "sonner";

const FEATURES_CATALOG = [
  { id: "payroll", label: "Moteur de Paie Enterprise", desc: "Calculs automatiques, taxes, et génération de fiches de paie.", tier: "STARTER" },
  { id: "attendance", label: "Gestion des Temps (QR/GPS)", desc: "Scanner QR, géolocalisation, et suivi des heures en temps réel.", tier: "STARTER" },
  { id: "accounting", label: "Grand Livre & Comptabilité", desc: "Double entrée, journaux comptables et états financiers.", tier: "PROFESSIONAL" },
  { id: "inventory", label: "Gestion de Stock", desc: "Suivi des actifs, alertes de seuil et inventaire multi-sites.", tier: "PROFESSIONAL" },
  { id: "ai_cfo", label: "AI Strategic CFO", desc: "Assistant intelligent pour l'analyse financière et recommandations.", tier: "ENTERPRISE" },
  { id: "api_access", label: "Accès API & Webhooks", desc: "Intégration avec des systèmes tiers et automation externe.", tier: "ENTERPRISE" },
];

export default function FeatureSubscriptionSection() {
  const { currentBusiness, businessSettings, employees } = useBusinessContext();
  const { updateFeatures, loading: adminLoading } = useBusinessAdmin();

  const [plans, setPlans] = useState<SubscriptionPlanDocument[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [selectedPlanForUpgrade, setSelectedPlanForUpgrade] = useState<SubscriptionPlanDocument | null>(null);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [showPlansModal, setShowPlansModal] = useState(false);

  const businessId = currentBusiness?.id;
  const userRole = PermissionService.getRole();
  const canUpgrade = userRole === "OWNER" || userRole === "SUPER_ADMIN";

  // Active Plan determination
  const activePlanCode = (
    (currentBusiness as any)?.plan || 
    (currentBusiness as any)?.subscription?.plan || 
    businessSettings?.subscription?.plan || 
    "STARTER"
  ).toUpperCase();

  const enabledFeatures = businessSettings?.featureFlags || {};
  const activeEmployeesCount = (employees || []).filter((e: any) => e.status !== "TERMINATED" && e.isActive !== false).length;

  useEffect(() => {
    let isMounted = true;
    async function loadPlans() {
      try {
        setLoadingPlans(true);
        const data = await SubscriptionPlanRepository.getAllPlans();
        if (isMounted) setPlans(data);
      } catch (err) {
        console.error("Failed to load subscription plans:", err);
      } finally {
        if (isMounted) setLoadingPlans(false);
      }
    }
    loadPlans();
    return () => { isMounted = false; };
  }, [activePlanCode]);

  // Current active plan object
  const currentPlanObj = plans.find(p => p.id.toUpperCase() === activePlanCode) || {
    id: activePlanCode,
    name: `${activePlanCode} Plan`,
    priceUsd: 49,
    priceHtg: 6400,
    userLimit: 10
  };

  const currentSeatLimit = currentPlanObj.userLimit || 10;
  const seatUsagePercentage = Math.min(100, Math.round((activeEmployeesCount / currentSeatLimit) * 100));
  const isSeatExceeded = activeEmployeesCount > currentSeatLimit;

  const handleToggleFeature = async (id: string) => {
    const newFeatures = { ...enabledFeatures, [id]: !enabledFeatures[id] };
    await updateFeatures(newFeatures);
  };

  const handleConfirmUpgrade = async () => {
    if (!selectedPlanForUpgrade || !businessId) return;
    setIsUpgrading(true);
    try {
      const result = await SubscriptionService.upgradePlan(businessId, selectedPlanForUpgrade.id, {
        role: userRole
      });

      toast.success(result.message || `Abonnement sur-classé vers le plan ${selectedPlanForUpgrade.name} avec succès !`);
      setSelectedPlanForUpgrade(null);
      setShowPlansModal(false);

      // Reload window or trigger soft refresh after short delay so SSOT updates everywhere
      setTimeout(() => {
        window.location.reload();
      }, 600);
    } catch (err: any) {
      console.error("Upgrade error:", err);
      toast.error(err.message || "Impossible d'effectuer la mise à niveau.");
    } finally {
      setIsUpgrading(false);
    }
  };

  return (
    <div className="space-y-8" id="subscription-section-root">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
        <div>
          <h3 className="text-lg font-bold text-slate-100 uppercase tracking-tight flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-cyan-400" />
            Modules & Formules d'Abonnement
          </h3>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Gérez votre forfait d'entreprise, les capacités collaborateurs et activez les modules métier.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Plan {activePlanCode} Actif</span>
          </div>
          {canUpgrade && (
            <button
              onClick={() => setShowPlansModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-slate-950 text-xs font-extrabold rounded-xl transition-all shadow-md shadow-cyan-500/10 active:scale-95 flex items-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Changer de Plan
            </button>
          )}
        </div>
      </div>

      {/* Seat Exceeded Warning Banner */}
      {isSeatExceeded && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start justify-between gap-4 animate-fadeIn">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-300 uppercase tracking-wider">Capacité Collaborateurs Dépassée</p>
              <p className="text-xs text-amber-200/80 mt-1 leading-relaxed">
                Votre entreprise compte actuellement <span className="font-bold text-white">{activeEmployeesCount}</span> collaborateurs pour une limite autorisée de <span className="font-bold text-white">{currentSeatLimit}</span> sur le plan {activePlanCode}.
              </p>
            </div>
          </div>
          {canUpgrade && (
            <button
              onClick={() => setShowPlansModal(true)}
              className="shrink-0 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-lg transition-all"
            >
              Upgrader Maintenant
            </button>
          )}
        </div>
      )}

      {/* Main Grid: Modules Catalog vs Billing Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Modules Toggle */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Package className="w-4 h-4 text-cyan-400" />
              Catalogue des Modules Métier
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FEATURES_CATALOG.map(feature => {
              const enabled = enabledFeatures[feature.id];
              const isLocked = activePlanCode === "STARTER" && (feature.tier === "PROFESSIONAL" || feature.tier === "ENTERPRISE");

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
                    <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded border ${
                      feature.tier === "ENTERPRISE" ? "border-amber-500/30 text-amber-400" : "border-slate-800 text-slate-500"
                    }`}>
                      {feature.tier}
                    </span>
                  </div>

                  <div>
                    <p className={`text-xs font-bold ${enabled ? "text-slate-100" : "text-slate-400"}`}>{feature.label}</p>
                    <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">{feature.desc}</p>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-900 flex items-center justify-between">
                    {isLocked ? (
                      <button
                        onClick={() => setShowPlansModal(true)}
                        className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 transition-colors"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">UPGRADE REQUIS</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleToggleFeature(feature.id)}
                        disabled={adminLoading}
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

        {/* Subscription Info Card */}
        <div className="lg:col-span-4 space-y-6">
          <div className="glass rounded-2xl p-6 space-y-6 relative overflow-hidden border border-slate-800">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <CreditCard className="w-28 h-28 text-slate-100" />
            </div>

            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-cyan-400" />
              Abonnement Actif
            </h4>

            <div className="space-y-4">
              <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl">
                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Forfait {activePlanCode}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-100">${currentPlanObj.priceUsd || 49}</span>
                  <span className="text-xs text-slate-500">/ mois ({currentPlanObj.priceHtg || 6400} HTG)</span>
                </div>
              </div>

              {/* Sièges Utilisés */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Users className="w-3.5 h-3.5 text-cyan-400" />
                    Sièges Collaborateurs
                  </span>
                  <span className="font-mono font-bold text-slate-200">
                    {activeEmployeesCount} / {currentSeatLimit}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className={`h-full transition-all duration-500 ${
                      isSeatExceeded ? "bg-amber-500" : "bg-gradient-to-r from-cyan-500 to-emerald-500"
                    }`}
                    style={{ width: `${seatUsagePercentage}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {canUpgrade && (
              <button
                onClick={() => setShowPlansModal(true)}
                className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-lg shadow-cyan-500/10 active:scale-95 flex items-center justify-center gap-2 uppercase tracking-wider"
              >
                Gérer / Surclasser le Plan
                <ArrowUpRight className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-2xl flex items-start gap-3">
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <Activity className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-200">Traçabilité & Sceaux Forensiques</p>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                Toute modification d'abonnement génère une empreinte SHA-256 consigné dans le registre immutable <span className="text-slate-300">forensic_logs</span>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Upgrade / Plans Catalogue Modal */}
      {showPlansModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-xl font-black text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-cyan-400" />
                  Catalogue des Plans FINOPS ERP
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Sélectionnez le forfait adapté à la taille et aux besoins opérationnels de votre entreprise.
                </p>
              </div>
              <button
                onClick={() => setShowPlansModal(false)}
                className="p-2 text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingPlans ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
                <p className="text-xs text-slate-400">Chargement des forfaits d'abonnement...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {plans.map((plan) => {
                  const isCurrent = plan.id.toUpperCase() === activePlanCode;
                  const isSelected = selectedPlanForUpgrade?.id === plan.id;

                  return (
                    <div
                      key={plan.id}
                      className={`p-5 rounded-2xl border transition-all flex flex-col justify-between relative ${
                        isCurrent
                          ? "bg-emerald-500/5 border-emerald-500/40 ring-1 ring-emerald-500/30"
                          : isSelected
                          ? "bg-cyan-500/10 border-cyan-500 ring-2 ring-cyan-500/50"
                          : "bg-slate-950 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      {plan.badgeText && (
                        <span className="absolute top-3 right-3 text-[9px] font-extrabold px-2 py-0.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-full uppercase tracking-wider">
                          {plan.badgeText}
                        </span>
                      )}

                      <div>
                        <h4 className="text-sm font-bold text-slate-100">{plan.name}</h4>
                        <div className="mt-3 flex items-baseline gap-1">
                          <span className="text-2xl font-black text-slate-100">${plan.priceUsd}</span>
                          <span className="text-xs text-slate-500">/ mois</span>
                        </div>
                        <p className="text-[10px] text-cyan-400 font-medium mt-0.5">{plan.priceHtg} HTG / mois</p>

                        <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">{plan.description}</p>

                        <div className="mt-4 pt-4 border-t border-slate-900 space-y-2">
                          <div className="flex items-center gap-2 text-xs text-slate-300 font-semibold">
                            <Users className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Jusqu'à {plan.userLimit} collaborateurs</span>
                          </div>
                          {plan.maxBranches && (
                            <div className="text-[10px] text-slate-400">
                              Jusqu'à {plan.maxBranches} succursale(s)
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-6">
                        {isCurrent ? (
                          <div className="w-full py-2.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-bold rounded-xl flex items-center justify-center gap-2">
                            <Check className="w-4 h-4" />
                            PLAN ACTUEL
                          </div>
                        ) : (
                          <button
                            onClick={() => setSelectedPlanForUpgrade(plan)}
                            className={`w-full py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                              isSelected
                                ? "bg-cyan-400 text-slate-950 font-black"
                                : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                            }`}
                          >
                            {isSelected ? "SÉLECTIONNÉ" : "CHOISIR CE PLAN"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Confirmation Footer if a Plan is selected */}
            {selectedPlanForUpgrade && (
              <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-fadeIn">
                <div>
                  <p className="text-xs font-bold text-cyan-300">
                    Surclassement sélectionné : <span className="text-white uppercase font-black">{selectedPlanForUpgrade.name}</span>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Nouvelle capacité : {selectedPlanForUpgrade.userLimit} collaborateurs — Tarif : ${selectedPlanForUpgrade.priceUsd} / mois.
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => setSelectedPlanForUpgrade(null)}
                    disabled={isUpgrading}
                    className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleConfirmUpgrade}
                    disabled={isUpgrading}
                    className="px-5 py-2.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black rounded-xl transition-all shadow-md shadow-cyan-500/20 flex items-center gap-2 active:scale-95"
                  >
                    {isUpgrading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Traitement...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        CONFIRMER LA MISE À NIVEAU
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
