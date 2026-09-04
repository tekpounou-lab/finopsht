import React, { useState } from "react";
import { 
  Users, 
  DollarSign, 
  CreditCard, 
  Smartphone, 
  Landmark, 
  Check, 
  AlertTriangle, 
  Sparkles, 
  Edit3, 
  Plus, 
  RotateCcw, 
  CheckCircle2, 
  ShieldCheck, 
  Layers, 
  Sliders, 
  Trash2,
  Search,
  ArrowUpRight,
  Zap,
  Activity,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { SubscriptionPlanDocument } from "../../repositories/SubscriptionPlanRepository";
import PlanEditorModal from "./PlanEditorModal";
import TenantFeatureOverrideModal from "./TenantFeatureOverrideModal";
import { SubscriptionAuditService, SubscriptionAuditReport } from "../../services/billing/SubscriptionAuditService";
import { toast } from "sonner";

interface SuperAdminPlanManagerProps {
  plans: SubscriptionPlanDocument[];
  companies: any[];
  allEmployees: any[];
  allUsers: any[];
  onSavePlan: (plan: SubscriptionPlanDocument) => Promise<void>;
  onDeletePlan: (planId: string) => Promise<void>;
  onSeedDefaults: () => Promise<void>;
  onAssignTenantPlan?: (companyId: string, planId: string) => Promise<void>;
}

export default function SuperAdminPlanManager({
  plans,
  companies,
  allEmployees,
  allUsers,
  onSavePlan,
  onDeletePlan,
  onSeedDefaults,
  onAssignTenantPlan
}: SuperAdminPlanManagerProps) {
  const [subTab, setSubTab] = useState<"catalog" | "subscriptions" | "audit">("catalog");
  const [selectedPlanForEdit, setSelectedPlanForEdit] = useState<SubscriptionPlanDocument | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [overrideTenant, setOverrideTenant] = useState<any | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [auditReport, setAuditReport] = useState<SubscriptionAuditReport | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);

  const handleRunAudit = async () => {
    try {
      setIsAuditing(true);
      toast.info("Lancement de l'audit d'intégrité des souscriptions & modules...");
      const report = await SubscriptionAuditService.auditAndHealAllTenants();
      setAuditReport(report);
      toast.success(`Audit terminé : ${report.totalTenants} organisations vérifiées.`);
    } catch (err) {
      console.error("Audit failed:", err);
      toast.error("Erreur lors de l'exécution de l'audit.");
    } finally {
      setIsAuditing(false);
    }
  };

  const handleEditPlan = (plan: SubscriptionPlanDocument) => {
    setSelectedPlanForEdit(plan);
    setIsEditorOpen(true);
  };

  const handleCreateNew = () => {
    setSelectedPlanForEdit(null);
    setIsEditorOpen(true);
  };

  const handleToggleStatus = async (plan: SubscriptionPlanDocument) => {
    const newStatus = plan.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await onSavePlan({ ...plan, status: newStatus });
    toast.success(`Forfait ${plan.name} passé à ${newStatus}.`);
  };

  const handleDelete = async (planId: string) => {
    if (window.confirm("Êtes-vous certain de vouloir supprimer ce forfait du catalogue Firestore ?")) {
      await onDeletePlan(planId);
      toast.success("Forfait supprimé avec succès.");
    }
  };

  const filteredPlans = plans.filter((p) => {
    const matchesSearch = 
      p.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.code.toLowerCase().includes(searchFilter.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchFilter.toLowerCase()));
    const matchesStatus = statusFilter === "ALL" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 animate-fade-in" id="superadmin-plan-manager-console">
      {/* Top Header & Overview */}
      <div className="p-5 bg-slate-900/60 rounded-2xl border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 uppercase tracking-wider">
              Moteur de Forfaits & Passerelles
            </span>
            <span className="text-xs text-slate-500 font-mono">Firestore SSOT : `subscription_plans`</span>
          </div>
          <h3 className="text-base font-bold font-sans text-slate-100 mt-1">
            Gestion Dynamique des Forfaits & Passerelles de Paiement
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Modifiez à chaud la capacité en collaborateurs (ex: passer de 10 à 30), les tarifs multi-devises (USD & HTG), et préparez les identifiants Stripe, MonCash et Natcash.
          </p>
        </div>

        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleRunAudit}
            disabled={isAuditing}
            className="px-3.5 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-mono font-bold rounded-xl border border-indigo-500/30 transition flex items-center gap-1.5 cursor-pointer"
            title="Lancer un diagnostic d'intégrité et auto-correction"
          >
            <Activity className="w-3.5 h-3.5 animate-pulse text-indigo-400" />
            {isAuditing ? "Audit en cours..." : "Lancer Audit Intégrité"}
          </button>
          <button
            onClick={onSeedDefaults}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
            title="Réinitialiser le catalogue avec les forfaits certifiés"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Synchroniser Standards
          </button>
          <button
            onClick={handleCreateNew}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-mono font-bold rounded-xl shadow-lg shadow-cyan-500/20 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nouveau Forfait
          </button>
        </div>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-xs font-mono">
        <button
          onClick={() => setSubTab("catalog")}
          className={`px-3.5 py-1.5 rounded-lg transition font-bold ${
            subTab === "catalog"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          Catalogue des Forfaits ({plans.length})
        </button>
        <button
          onClick={() => setSubTab("subscriptions")}
          className={`px-3.5 py-1.5 rounded-lg transition font-bold ${
            subTab === "subscriptions"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          Licences & Souscriptions Tenants ({companies.length})
        </button>
        <button
          onClick={() => {
            setSubTab("audit");
            if (!auditReport) handleRunAudit();
          }}
          className={`px-3.5 py-1.5 rounded-lg transition font-bold flex items-center gap-1.5 ${
            subTab === "audit"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
          <span>Audit & Intégrité Système</span>
          {auditReport?.globalAlerts && auditReport.globalAlerts.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-bold">
              {auditReport.globalAlerts.length}
            </span>
          )}
        </button>
      </div>

      {/* Gateway Readiness Diagnostic Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-3.5 bg-slate-900/40 border border-indigo-500/20 rounded-xl flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <CreditCard className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono font-bold text-slate-200">Stripe Subscriptions</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/20 font-bold">READY</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono truncate block">Cartes VISA / MC / Amex</span>
          </div>
        </div>

        <div className="p-3.5 bg-slate-900/40 border border-rose-500/20 rounded-xl flex items-center gap-3">
          <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <Smartphone className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono font-bold text-slate-200">MonCash (Digicel)</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/20 font-bold">READY</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono truncate block">Paiement Mobile Gourdes</span>
          </div>
        </div>

        <div className="p-3.5 bg-slate-900/40 border border-cyan-500/20 rounded-xl flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Smartphone className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono font-bold text-slate-200">Natcash (Natcom)</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/20 font-bold">READY</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono truncate block">Portefeuille Électronique HTG</span>
          </div>
        </div>

        <div className="p-3.5 bg-slate-900/40 border border-amber-500/20 rounded-xl flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Landmark className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono font-bold text-slate-200">Virement Bancaire</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/20 font-bold">ACTIVE</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono truncate block">BRH / Unibank / Sogebank</span>
          </div>
        </div>
      </div>

      {/* Search and Filters & Dynamic Plans Grid */}
      {subTab === "catalog" && (
        <>
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 p-3.5 bg-slate-900/40 border border-slate-800 rounded-xl">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Rechercher par nom, code ou description..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex gap-2 w-full sm:w-auto">
              {(["ALL", "ACTIVE", "INACTIVE"] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 text-xs font-mono rounded-lg transition ${
                    statusFilter === st
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold"
                      : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200"
                  }`}
                >
                  {st === "ALL" ? "Tous les forfaits" : st === "ACTIVE" ? "Actifs" : "Inactifs"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredPlans.map((plan) => {
              const isPop = plan.isPopular;
              const tenantSubscribersCount = companies.filter(
                (c) => (c.subscription?.plan || "STARTER").toUpperCase() === plan.id.toUpperCase()
              ).length;

              return (
                <div
                  key={plan.id}
                  className={`rounded-2xl border p-5 flex flex-col justify-between relative transition-all duration-200 ${
                    isPop
                      ? "bg-slate-900/90 border-cyan-500/50 shadow-lg shadow-cyan-500/5"
                      : plan.status === "INACTIVE"
                      ? "bg-slate-950/40 border-slate-850 opacity-60"
                      : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  {/* Badges */}
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                        {plan.code || plan.id}
                      </span>
                      {plan.badgeText && (
                        <span className="text-[10px] font-sans font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                          {plan.badgeText}
                        </span>
                      )}
                      {plan.status === "INACTIVE" && (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-950/60 text-rose-400 border border-rose-500/20">
                          DÉSACTIVÉ
                        </span>
                      )}
                    </div>

                    <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-850">
                      {tenantSubscribersCount} client{tenantSubscribersCount > 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Plan Title & Collaborateurs Quota */}
                  <div className="space-y-3 mb-4">
                    <h4 className="text-base font-bold font-sans text-slate-100 flex items-center gap-1.5">
                      {plan.name}
                    </h4>
                    <p className="text-xs text-slate-400 min-h-[32px] line-clamp-2">
                      {plan.description}
                    </p>

                    {/* Primary Metric: Capacity in Collaborateurs */}
                    <div className="p-3 bg-slate-950/80 border border-cyan-500/30 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                          <Users className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-mono font-bold text-slate-200 block">
                            {plan.userLimit} Collaborateurs
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">Quota d'inscriptions inclus</span>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-2 py-1 rounded-lg">
                        {plan.userLimit} MAX
                      </span>
                    </div>

                    {/* Pricing in USD & HTG */}
                    <div className="p-3 bg-slate-950/50 border border-slate-850 rounded-xl space-y-1">
                      <div className="flex justify-between items-baseline">
                        <span className="text-lg font-mono font-extrabold text-slate-100">
                          ${plan.priceUsd ?? plan.price ?? 0} <span className="text-xs font-normal text-slate-400">USD/mois</span>
                        </span>
                        <span className="text-xs font-mono font-bold text-emerald-400">
                          {(plan.priceHtg ?? ((plan.price || 0) * 131)).toLocaleString()} HTG
                        </span>
                      </div>
                      {(plan.extraUserPriceUsd || plan.extraUserPriceHtg) && (
                        <div className="text-[10px] font-mono text-slate-400 flex justify-between pt-1 border-t border-slate-850/60">
                          <span>Extra seat au-delà de {plan.userLimit} :</span>
                          <span className="text-slate-300 font-bold">+${plan.extraUserPriceUsd || 5}/collab/m</span>
                        </div>
                      )}
                    </div>

                    {/* Gateways Ready Badges */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Passerelles configurées :</span>
                      <div className="flex flex-wrap gap-1.5">
                        {(plan.supportedGateways || ["stripe", "moncash", "natcash", "bank_transfer"]).map((gw) => (
                          <span
                            key={gw}
                            className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 flex items-center gap-1"
                          >
                            <Check className="w-2.5 h-2.5 text-emerald-400" />
                            {gw === "stripe" ? "Stripe" : gw === "moncash" ? "MonCash" : gw === "natcash" ? "Natcash" : "Virement"}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleEditPlan(plan)}
                      className="flex-1 py-1.5 px-3 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs font-mono font-bold transition flex items-center justify-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Modifier le Plan
                    </button>

                    <button
                      onClick={() => handleToggleStatus(plan)}
                      className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-850 hover:border-slate-700 rounded-xl transition"
                      title={plan.status === "ACTIVE" ? "Désactiver ce forfait" : "Activer ce forfait"}
                    >
                      <Sliders className="w-3.5 h-3.5" />
                    </button>

                    {plan.id !== "STARTER" && plan.id !== "PROFESSIONAL" && plan.id !== "BUSINESS" && plan.id !== "ENTERPRISE" && (
                      <button
                        onClick={() => handleDelete(plan.id)}
                        className="p-1.5 text-rose-400 hover:text-rose-300 bg-slate-950 border border-slate-850 hover:border-rose-500/30 rounded-xl transition"
                        title="Supprimer ce forfait"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Tenant License Compliance Table */}
      {subTab === "subscriptions" && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xs font-bold font-mono tracking-widest uppercase text-slate-200">
                Contrôle d'Utilisation des Licences par Entreprise (Collaborateurs & Quotas)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Vérifiez en temps réel l'impact de vos modifications de forfaits sur la conformité de chaque client.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2.5">ENTREPRISE</th>
                  <th>FORFAIT ACTIF</th>
                  <th>COLLABORATEURS ACTIFS</th>
                  <th>UTILISATEURS PORTAIL</th>
                  <th>STATUT CONFORMITÉ</th>
                  <th className="text-right">ACTION FORFAIT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50">
                {companies.map((c) => {
                  const planCode = (c.subscription?.plan || "STARTER").toUpperCase();
                  const matchedPlan = plans.find((p) => p.id.toUpperCase() === planCode) || plans.find(p => p.id === "STARTER");
                  const limit = matchedPlan?.userLimit || 10;
                  const employees = allEmployees.filter((e) => e.business_id === c.id).length;
                  const users = allUsers.filter((u) => u.business_id === c.id).length;
                  const pct = Math.min(100, Math.round((employees / limit) * 100));
                  const isOverLimit = employees > limit;

                  return (
                    <tr key={c.id} className="hover:bg-slate-900/30 text-slate-300">
                      <td className="py-3 font-sans font-bold text-slate-100">{c.name}</td>
                      <td>
                        <span className="text-[10px] bg-slate-950 px-2 py-0.5 rounded text-cyan-400 font-bold border border-slate-800">
                          {matchedPlan?.name || planCode} ({limit} collabs)
                        </span>
                      </td>
                      <td className="py-2.5">
                        <div className="space-y-1">
                          <div className="flex justify-between max-w-[140px] text-[10px]">
                            <span className="font-bold text-slate-200">{employees} / {limit}</span>
                            <span className={isOverLimit ? "text-rose-400 font-bold" : "text-slate-400"}>
                              {Math.round((employees / limit) * 100)}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full max-w-[140px] bg-slate-950 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                isOverLimit ? "bg-rose-500" : pct > 80 ? "bg-amber-500" : "bg-emerald-500"
                              }`}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="text-slate-300 font-bold">{users} utilisateurs</td>
                      <td>
                        {isOverLimit ? (
                          <span className="text-[9px] bg-rose-950/40 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded font-black uppercase inline-flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5" /> Surchargé (+{employees - limit})
                          </span>
                        ) : (
                          <span className="text-[9px] bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-black uppercase inline-flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Conforme
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setOverrideTenant(c)}
                            className="px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg text-[10px] font-mono font-bold transition flex items-center gap-1 cursor-pointer"
                            title="Surcharger les modules autorisés pour ce tenant"
                          >
                            <Sliders className="w-3 h-3" /> Surcharger
                          </button>
                          {onAssignTenantPlan && (
                            <select
                              value={planCode}
                              onChange={async (e) => {
                                await onAssignTenantPlan(c.id, e.target.value);
                                toast.success(`Forfait de ${c.name} mis à jour : ${e.target.value}`);
                              }}
                              className="px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-[10px] font-mono text-slate-200 cursor-pointer hover:border-cyan-500"
                            >
                              {plans.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.userLimit} collabs)
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit View */}
      {subTab === "audit" && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6 animate-fade-in">
          <div className="flex justify-between items-center border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                Diagnostic Intégrité Souscriptions & Auto-Correction
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {auditReport ? `Dernier scan effectué à : ${new Date(auditReport.timestamp).toLocaleString()}` : "Lancement automatique du diagnostic..."}
              </p>
            </div>
            <button
              onClick={handleRunAudit}
              disabled={isAuditing}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold rounded-xl transition flex items-center gap-2 cursor-pointer"
            >
              <Activity className="w-4 h-4" />
              {isAuditing ? "Exécution..." : "Réexécuter Diagnostic"}
            </button>
          </div>

          {auditReport && (
            <>
              {/* Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <span className="text-[10px] font-mono text-slate-400 block">ORGANISATIONS SCANÉES</span>
                  <span className="text-xl font-bold font-mono text-slate-100">{auditReport.totalTenants}</span>
                </div>
                <div className="p-4 bg-slate-950/60 border border-emerald-500/20 rounded-xl">
                  <span className="text-[10px] font-mono text-slate-400 block">SOUSCRIPTIONS ACTIVES</span>
                  <span className="text-xl font-bold font-mono text-emerald-400">{auditReport.activeSubscriptionsCount}</span>
                </div>
                <div className="p-4 bg-slate-950/60 border border-cyan-500/20 rounded-xl">
                  <span className="text-[10px] font-mono text-slate-400 block">DOCUMENTS AUTO-RÉPARÉS</span>
                  <span className="text-xl font-bold font-mono text-cyan-400">
                    {auditReport.missingSubscriptionsHealedCount + auditReport.missingFeaturesHealedCount}
                  </span>
                </div>
                <div className="p-4 bg-slate-950/60 border border-rose-500/20 rounded-xl">
                  <span className="text-[10px] font-mono text-slate-400 block">DÉPASSEMENTS DE SIÈGES</span>
                  <span className="text-xl font-bold font-mono text-rose-400">{auditReport.seatExceededCount}</span>
                </div>
              </div>

              {/* Alerts List */}
              {auditReport.globalAlerts.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold font-mono uppercase text-rose-400 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Alertes de Conformité & Sécurité ({auditReport.globalAlerts.length})
                  </h4>
                  <div className="space-y-2">
                    {auditReport.globalAlerts.map((alert, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl border flex items-center justify-between text-xs font-mono ${
                          alert.severity === "critical"
                            ? "bg-rose-950/30 border-rose-500/30 text-rose-300"
                            : "bg-amber-950/30 border-amber-500/30 text-amber-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span className="font-bold font-sans">{alert.tenantName}</span>
                          <span>— {alert.message}</span>
                        </div>
                        <button
                          onClick={() => setSubTab("subscriptions")}
                          className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-lg text-[10px] font-bold border border-slate-700 transition cursor-pointer"
                        >
                          Gérer
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Plan Editor Modal */}
      <PlanEditorModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        plan={selectedPlanForEdit}
        onSave={onSavePlan}
      />

      {/* Tenant Feature Override Modal */}
      <TenantFeatureOverrideModal
        isOpen={!!overrideTenant}
        onClose={() => setOverrideTenant(null)}
        tenant={overrideTenant}
      />
    </div>
  );
}
