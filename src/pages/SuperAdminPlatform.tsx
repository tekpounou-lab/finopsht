import React, { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { 
  Building2, 
  ShieldCheck, 
  Database, 
  Activity, 
  Plus, 
  Lock,
  Layers,
  FileText,
  Radio,
  Loader2
} from "lucide-react";
import { 
  useTenantManagement, 
  useSystemHealth, 
  TenantListTable, 
  TenantDetailsDrawer, 
  CreateTenantModal, 
  SystemHealthCards, 
  GlobalAuditLogViewer 
} from "./superadmin";
import { lazyWithRetry } from "../utils/lazyWithRetry";
import { SubscriptionPlanRepository, SubscriptionPlanDocument, SubscriptionRepository } from "../repositories";
import { db } from "../lib/firebase";
import { collection, onSnapshot, query, limit } from "firebase/firestore";
import { toast } from "sonner";

// Lazy-load heavyweight sub-modules for performance & resilient dynamic loading
const SuperAdminPlanManager = lazyWithRetry(() => 
  import("../components/superadmin/SuperAdminPlanManager").then((m: any) => ({ default: m.SuperAdminPlanManager || m.default }))
);
const SuperAdminSecurityCenter = lazyWithRetry(() => 
  import("../components/superadmin/SuperAdminSecurityCenter").then((m: any) => ({ default: m.SuperAdminSecurityCenter || m.default }))
);
const SystemHealthConsole = lazyWithRetry(() => 
  import("./SystemHealthConsole").then((m: any) => ({ default: m.SystemHealthConsole || m.default }))
);
const EventStreamPage = lazyWithRetry(() => 
  import("./reliability/EventStreamPage").then((m: any) => ({ default: m.EventStreamPage || m.default }))
);
const DisasterRecovery = lazyWithRetry(() => 
  import("../components/DisasterRecovery").then((m: any) => ({ default: m.DisasterRecovery || m.default }))
);

function TabLoadingFallback({ message = "Chargement du module..." }: { message?: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center space-y-3">
      <Loader2 className="w-7 h-7 text-indigo-400 animate-spin" />
      <span className="text-xs font-medium text-slate-400">{message}</span>
    </div>
  );
}

export interface SuperAdminPlatformProps {
  initialTab?: string;
}

export function SuperAdminPlatform({ initialTab = "tenants" }: SuperAdminPlatformProps) {
  // Normalize initialTab
  const resolvedInitialTab = initialTab === "system/reliability" ? "reliability" : initialTab;
  const [activeTab, setActiveTab] = useState<string>(resolvedInitialTab);

  // 1. Tenant Management Hook
  const {
    tenants,
    allUsers,
    allEmployees,
    filteredTenants,
    loading: loadingTenants,
    error: tenantsError,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    selectedTenant,
    setSelectedTenant,
    isCreateModalOpen,
    setIsCreateModalOpen,
    toggleTenantStatus,
    approveTenant,
    rejectTenant,
    updateTenantPlan,
    createTenant,
  } = useTenantManagement();

  // SSOT Listeners for Global Infrastructure Components
  const [events, setEvents] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [employeeContracts, setEmployeeContracts] = useState<any[]>([]);
  const [employeeBadges, setEmployeeBadges] = useState<any[]>([]);

  useEffect(() => {
    const unsubEvents = onSnapshot(
      query(collection(db, "events"), limit(200)),
      (snap) => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.warn("[SuperAdminPlatform] Events listener warning:", err)
    );

    const unsubDepts = onSnapshot(
      collection(db, "departments"),
      (snap) => setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.warn("[SuperAdminPlatform] Departments listener warning:", err)
    );

    const unsubBranches = onSnapshot(
      collection(db, "branches"),
      (snap) => setBranches(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.warn("[SuperAdminPlatform] Branches listener warning:", err)
    );

    const unsubInvites = onSnapshot(
      collection(db, "invitations"),
      (snap) => setInvitations(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.warn("[SuperAdminPlatform] Invitations listener warning:", err)
    );

    const unsubContracts = onSnapshot(
      collection(db, "employee_contracts"),
      (snap) => setEmployeeContracts(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.warn("[SuperAdminPlatform] Contracts listener warning:", err)
    );

    const unsubBadges = onSnapshot(
      collection(db, "employee_badges"),
      (snap) => setEmployeeBadges(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.warn("[SuperAdminPlatform] Badges listener warning:", err)
    );

    return () => {
      unsubEvents();
      unsubDepts();
      unsubBranches();
      unsubInvites();
      unsubContracts();
      unsubBadges();
    };
  }, []);

  // 2. System Health & Telemetry Hook
  const { metrics, auditLogs, loadingAudit } = useSystemHealth();

  // 3. Subscription Plans State & Synchronizer
  const [plans, setPlans] = useState<SubscriptionPlanDocument[]>([]);

  const loadPlans = useCallback(async () => {
    try {
      const loadedPlans = await SubscriptionPlanRepository.getAllPlans();
      setPlans(loadedPlans);
    } catch (err) {
      console.warn("[SuperAdminPlatform] Error loading subscription plans:", err);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const handleSavePlan = useCallback(async (plan: SubscriptionPlanDocument) => {
    try {
      await SubscriptionPlanRepository.savePlan(plan, { uid: "super_admin", email: "superadmin@finops.corp", name: "Super Admin" });
      await loadPlans();
      toast.success(`Forfait ${plan.name} enregistré avec succès.`);
    } catch (err) {
      console.error("Failed to save plan:", err);
      toast.error("Échec de l'enregistrement du forfait.");
    }
  }, [loadPlans]);

  const handleDeletePlan = useCallback(async (planId: string) => {
    try {
      await SubscriptionPlanRepository.deletePlan(planId, { uid: "super_admin", email: "superadmin@finops.corp", name: "Super Admin" });
      await loadPlans();
      toast.success("Forfait supprimé.");
    } catch (err) {
      console.error("Failed to delete plan:", err);
      toast.error("Échec de la suppression du forfait.");
    }
  }, [loadPlans]);

  const handleSeedDefaults = useCallback(async () => {
    try {
      await SubscriptionPlanRepository.seedDefaultPlans();
      await loadPlans();
      toast.success("Catalogue de forfaits réinitialisé avec les normes standards.");
    } catch (err) {
      console.error("Failed to seed default plans:", err);
      toast.error("Échec de la réinitialisation des forfaits.");
    }
  }, [loadPlans]);

  const handleAssignTenantPlan = useCallback(async (companyId: string, planId: string) => {
    try {
      await updateTenantPlan(companyId, planId);
      await SubscriptionRepository.syncSubscriptionWithPlan(companyId, planId);
      toast.success("Statut et limites de souscription synchronisés avec succès.");
    } catch (err) {
      console.error("Failed to assign plan:", err);
      toast.error("Échec de l'affectation du forfait au tenant.");
    }
  }, [updateTenantPlan]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* Platform Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-5 rounded-2xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <span>Plateforme Super Admin FINOPS</span>
              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                SaaS Multi-Tenant Root
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Supervision globale des instances clientes, intégrité cryptographique et infrastructure.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "tenants" && (
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-900/20 cursor-pointer transition"
            >
              <Plus className="w-4 h-4" /> Nouvelle Organisation
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("tenants")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-medium transition-all cursor-pointer ${
            activeTab === "tenants"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/30"
              : "text-slate-400 hover:text-white hover:bg-slate-900"
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Organisations ({tenants.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("plans")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-medium transition-all cursor-pointer ${
            activeTab === "plans"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/30"
              : "text-slate-400 hover:text-white hover:bg-slate-900"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Plans & Licences</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("security")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-medium transition-all cursor-pointer ${
            activeTab === "security"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/30"
              : "text-slate-400 hover:text-white hover:bg-slate-900"
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>Sécurité & Vault</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("health")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-medium transition-all cursor-pointer ${
            activeTab === "health"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/30"
              : "text-slate-400 hover:text-white hover:bg-slate-900"
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Santé Système</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("reliability")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-medium transition-all cursor-pointer ${
            activeTab === "reliability"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/30"
              : "text-slate-400 hover:text-white hover:bg-slate-900"
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>Flux d'Événements</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("forensic")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-medium transition-all cursor-pointer ${
            activeTab === "forensic"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/30"
              : "text-slate-400 hover:text-white hover:bg-slate-900"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Audit Forensique</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("recovery")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-medium transition-all cursor-pointer ${
            activeTab === "recovery"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/30"
              : "text-slate-400 hover:text-white hover:bg-slate-900"
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Plan de Reprise (DRP)</span>
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === "tenants" && (
        <div className="space-y-6">
          <SystemHealthCards metrics={metrics} />
          {tenantsError && (
            <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-lg text-red-400 font-mono text-sm">
              Erreur Firestore : {tenantsError}
            </div>
          )}
          <TenantListTable
            tenants={filteredTenants}
            loading={loadingTenants}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onSelectTenant={setSelectedTenant}
            onToggleStatus={toggleTenantStatus}
            onApproveTenant={approveTenant}
            onRejectTenant={rejectTenant}
          />
        </div>
      )}

      {activeTab === "plans" && (
        <Suspense fallback={<TabLoadingFallback message="Chargement du gestionnaire de plans..." />}>
          <SuperAdminPlanManager
            plans={plans}
            companies={tenants}
            allEmployees={allEmployees}
            allUsers={allUsers}
            onSavePlan={handleSavePlan}
            onDeletePlan={handleDeletePlan}
            onSeedDefaults={handleSeedDefaults}
            onAssignTenantPlan={handleAssignTenantPlan}
          />
        </Suspense>
      )}

      {activeTab === "security" && (
        <Suspense fallback={<TabLoadingFallback message="Chargement du centre de sécurité..." />}>
          <SuperAdminSecurityCenter
            currentUser={{ name: "Super Admin", role: "SUPER_ADMIN" }}
            allUsers={allUsers}
            allAuditLogs={auditLogs}
          />
        </Suspense>
      )}

      {activeTab === "health" && (
        <Suspense fallback={<TabLoadingFallback message="Chargement de la console de santé système..." />}>
          <SystemHealthConsole
            current_business_id="GLOBAL_SYSTEM"
            employees={allEmployees}
            departments={departments}
            branches={branches}
            ledgerTransactions={[]}
            employeeContracts={employeeContracts}
            employeeBadges={employeeBadges}
            invitations={invitations}
          />
        </Suspense>
      )}

      {activeTab === "reliability" && (
        <Suspense fallback={<TabLoadingFallback message="Chargement du flux d'événements & DLQ..." />}>
          <EventStreamPage
            events={events}
            current_business_id="GLOBAL_SYSTEM"
            isOffline={false}
            onReplayEvent={() => {}}
            onClearDlq={() => {}}
          />
        </Suspense>
      )}

      {activeTab === "forensic" && (
        <GlobalAuditLogViewer logs={auditLogs} loading={loadingAudit} />
      )}

      {activeTab === "recovery" && (
        <Suspense fallback={<TabLoadingFallback message="Chargement du module de reprise d'activité..." />}>
          <DisasterRecovery current_business_id="GLOBAL_SYSTEM" currentRole="SUPER_ADMIN" />
        </Suspense>
      )}

      {/* Drawers & Modals */}
      {selectedTenant && (
        <TenantDetailsDrawer
          tenant={selectedTenant}
          onClose={() => setSelectedTenant(null)}
          onUpdatePlan={updateTenantPlan}
          onApproveTenant={approveTenant}
          onRejectTenant={rejectTenant}
        />
      )}

      {isCreateModalOpen && (
        <CreateTenantModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreate={createTenant}
        />
      )}
    </div>
  );
}

export default SuperAdminPlatform;
