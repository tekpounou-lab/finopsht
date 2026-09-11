import React, { useState, useEffect } from "react";
import { 
  Layers, 
  Zap, 
  Check, 
  X, 
  ShieldCheck, 
  Sparkles, 
  RefreshCw, 
  Search, 
  FileText, 
  QrCode, 
  BookOpen, 
  Wallet, 
  Box, 
  Bot, 
  Link2, 
  Globe, 
  UploadCloud, 
  GraduationCap, 
  WifiOff, 
  Lock, 
  CheckCircle2,
  Info,
  Activity,
  Users,
  ChevronDown,
  ChevronUp,
  Shield,
  SlidersHorizontal,
  Grid
} from "lucide-react";
import { useBusinessContext } from "../../../../contexts/BusinessContext";
import { useBusinessAdmin } from "../../../../hooks/useBusinessAdmin";
import { PermissionService } from "../../../../services/PermissionService";
import { RoleModuleMatrixGrid } from "./roles/RoleModuleMatrixGrid";
import { toast } from "sonner";

export interface ErpModuleConfig {
  id: string;
  title: string;
  description: string;
  category: "PAIE_RH" | "FINANCE" | "CAISSE_OPS" | "SECURITE" | "INTELLIGENCE";
  categoryLabel: string;
  tier: "STARTER" | "PROFESSIONAL" | "ENTERPRISE";
  icon: React.ElementType;
  subFeatures: string[];
  dependencies?: string[];
}

const MODULES_CATALOG: ErpModuleConfig[] = [
  {
    id: "payroll",
    title: "Moteur de Paie Enterprise",
    description: "Gestion automatisée de la paie, calculs d'impôts (ONA 6%, OFATMA 2%, IRI), génération de bulletins de paie et virements directs.",
    category: "PAIE_RH",
    categoryLabel: "Paie & RH",
    tier: "STARTER",
    icon: FileText,
    subFeatures: ["Déductions ONA / OFATMA / IRI", "Génération Bulletins PDF", "Virement Bancaire Direct"]
  },
  {
    id: "attendance",
    title: "Suivi des Présences (QR & GPS)",
    description: "Pointeuse biométrique, émargement QR Code, suivi GPS mobile et contrôle des heures supplémentaires en temps réel.",
    category: "PAIE_RH",
    categoryLabel: "Paie & RH",
    tier: "STARTER",
    icon: QrCode,
    subFeatures: ["Badge QR Dynamique", "Géofencing d'Émargement", "Calcul Automatique Heures Sup."]
  },
  {
    id: "accounting",
    title: "Grand Livre & Comptabilité",
    description: "Comptabilité générale à partie double, plans comptables OHADA/DGI, journaux auxiliaires et états financiers imprimables.",
    category: "FINANCE",
    categoryLabel: "Finance & Comptabilité",
    tier: "PROFESSIONAL",
    icon: BookOpen,
    subFeatures: ["Partie Double Multi-Devises", "Balance Générale & Bilan", "Export Conforme Fiscalité"]
  },
  {
    id: "cash_management",
    title: "Gestion de Caisse & Coffres",
    description: "Contrôle des tiroirs-caisses, transferts inter-coffres, clôtures aveugles quotidiennes et réconciliation bancaire.",
    category: "CAISSE_OPS",
    categoryLabel: "Gestion de Caisse",
    tier: "STARTER",
    icon: Wallet,
    subFeatures: ["Écarts & Billettage", "Transferts Caisse/Coffre", "Clôtures Sécurisées"]
  },
  {
    id: "inventory",
    title: "Gestion des Stocks & Actifs",
    description: "Inventaire multi-sites, suivi des numéros de série, seuils de réapprovisionnement et valorisation des stocks (FIFO/PUMP).",
    category: "CAISSE_OPS",
    categoryLabel: "Opérations",
    tier: "PROFESSIONAL",
    icon: Box,
    subFeatures: ["Valorisation FIFO/PUMP", "Alertes Rupture de Stock", "Multi-Entrepôts"]
  },
  {
    id: "ai_cfo",
    title: "AI Strategic CFO Assistant",
    description: "Intelligence artificielle d'analyse financière, prévisions de trésorerie, détection d'anomalies et conseils de gestion.",
    category: "INTELLIGENCE",
    categoryLabel: "IA & Analytics",
    tier: "ENTERPRISE",
    icon: Bot,
    subFeatures: ["Prévisions Trésorerie 30j", "Audit IA des Écritures", "Recommandations Stratégiques"]
  },
  {
    id: "api_access",
    title: "Clés API REST & Webhooks",
    description: "Intégration poussée avec des logiciels externes, automatisation Zapier/N8N et notification d'événements en temps réel.",
    category: "SECURITE",
    categoryLabel: "Sécurité & API",
    tier: "ENTERPRISE",
    icon: Link2,
    subFeatures: ["Clés API Sécurisées", "Webhooks HMAC SHA-256", "Logs de Requêtes HTTP"]
  },
  {
    id: "multi_currency",
    title: "Multi-Devises Dynamique (USD/HTG)",
    description: "Conversion temps réel basée sur le taux officiel BRH, comptabilisation bidevises et ajustements de gains/pertes de change.",
    category: "FINANCE",
    categoryLabel: "Finance & Comptabilité",
    tier: "PROFESSIONAL",
    icon: Globe,
    subFeatures: ["Taux BRH Automatique", "Réévaluation de Solde", "Facturation Bidevise"]
  },
  {
    id: "approval_workflows",
    title: "Circuits d'Approbation Maker-Checker",
    description: "Validation hiérarchique multi-niveaux pour les paiements, transferts de fonds et modifications sensibles du système.",
    category: "SECURITE",
    categoryLabel: "Sécurité & Contrôle",
    tier: "PROFESSIONAL",
    icon: ShieldCheck,
    subFeatures: ["Séparation Maker/Checker", "Plafonds d'Autorisation", "Journal de Validation"]
  },
  {
    id: "bulk_import",
    title: "Import Massif de Données (CSV/Excel)",
    description: "Assistant d'importation guidée pour les listes de collaborateurs, balances de comptes et catalogues de produits.",
    category: "CAISSE_OPS",
    categoryLabel: "Opérations",
    tier: "STARTER",
    icon: UploadCloud,
    subFeatures: ["Mapping de Colonnes Smart", "Validation de Schéma", "Rapport d'Erreurs Détaillé"]
  },
  {
    id: "training_support",
    title: "Académie & Assistance Intégrée",
    description: "Simulateur de caisse interactif, tutoriels vidéo intégrés, guides de démarrage et support prioritaire 24/7.",
    category: "INTELLIGENCE",
    categoryLabel: "Assistance",
    tier: "STARTER",
    icon: GraduationCap,
    subFeatures: ["Simulateur de Caisse Test", "Guide d'Abonnement ERP", "Documentation Pas-à-Pas"]
  },
  {
    id: "offline_mode",
    title: "Mode Hors-Ligne & Sync Différée",
    description: "Tolérance aux pannes réseau, enregistrement local sécurisé et synchronisation automatique dès le retour de la connexion.",
    category: "CAISSE_OPS",
    categoryLabel: "Opérations",
    tier: "PROFESSIONAL",
    icon: WifiOff,
    subFeatures: ["Buffer Local Sécurisé", "Contrôle d'Idempotence", "Conflits Auto-Résolus"]
  }
];

const CONFIGURABLE_ROLES = [
  { id: "OWNER", label: "Propriétaire", isFixed: true },
  { id: "MANAGER", label: "Manager / Dirigeant", isFixed: false },
  { id: "HEAD_TELLER", label: "Chef Caissier", isFixed: false },
  { id: "SENIOR_TELLER", label: "Caissier Senior", isFixed: false },
  { id: "JUNIOR_TELLER", label: "Caissier Junior", isFixed: false },
  { id: "AUDITOR", label: "Auditeur", isFixed: false },
  { id: "EMPLOYEE", label: "Employé", isFixed: false },
];

export default function ModulesAndFeaturesSection() {
  const { currentBusiness, businessSettings, roleModuleMatrix: ctxRoleModMatrix } = useBusinessContext();
  const { updateFeatures, updateSettings, loading: adminLoading } = useBusinessAdmin();

  const [viewMode, setViewMode] = useState<"cards" | "matrix">("cards");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [pendingModuleId, setPendingModuleId] = useState<string | null>(null);
  const [expandedRolePanel, setExpandedRolePanel] = useState<Record<string, boolean>>({});

  const userRole = PermissionService.getRole();
  const canManage = userRole === "OWNER" || userRole === "SUPER_ADMIN" || userRole === "MANAGER";

  // Active Plan determination
  const activePlanCode = (
    (currentBusiness as any)?.plan || 
    (currentBusiness as any)?.subscription?.plan || 
    businessSettings?.subscription?.plan || 
    "STARTER"
  ).toUpperCase();

  const enabledFeatures = businessSettings?.featureFlags || {};

  // Local state for roleModuleMatrix
  const [localRoleMatrix, setLocalRoleMatrix] = useState<Record<string, Record<string, boolean>>>(() => {
    return ctxRoleModMatrix || businessSettings?.roleModuleMatrix || {};
  });

  useEffect(() => {
    if (ctxRoleModMatrix || businessSettings?.roleModuleMatrix) {
      setLocalRoleMatrix(ctxRoleModMatrix || businessSettings?.roleModuleMatrix || {});
    }
  }, [ctxRoleModMatrix, businessSettings?.roleModuleMatrix]);

  // Count active modules
  const activeCount = MODULES_CATALOG.filter(m => enabledFeatures[m.id] !== false).length;

  const toggleRolePanel = (moduleId: string) => {
    setExpandedRolePanel(prev => ({
      ...prev,
      [moduleId]: !prev[moduleId]
    }));
  };

  // Helper to check if a role is allowed for a module
  const isRoleAllowedForModule = (roleId: string, moduleId: string): boolean => {
    if (roleId === "SUPER_ADMIN" || roleId === "OWNER") return true;
    
    const roleConfig = localRoleMatrix[roleId];
    if (roleConfig && roleConfig[moduleId] !== undefined) {
      return Boolean(roleConfig[moduleId]);
    }

    // Default heuristics if not explicitly configured in matrix
    const defaultManagerMods = ["payroll", "attendance", "accounting", "cash_management", "inventory", "ai_cfo", "approval_workflows", "bulk_import", "training_support", "offline_mode"];
    const defaultHeadTellerMods = ["cash_management", "attendance", "inventory", "training_support", "offline_mode"];
    const defaultTellerMods = ["cash_management", "attendance", "training_support", "offline_mode"];
    const defaultAuditorMods = ["accounting", "cash_management", "inventory", "ai_cfo"];
    const defaultEmployeeMods = ["attendance", "training_support"];

    if (roleId === "MANAGER") return defaultManagerMods.includes(moduleId);
    if (roleId === "HEAD_TELLER") return defaultHeadTellerMods.includes(moduleId);
    if (roleId === "SENIOR_TELLER" || roleId === "JUNIOR_TELLER") return defaultTellerMods.includes(moduleId);
    if (roleId === "AUDITOR") return defaultAuditorMods.includes(moduleId);
    if (roleId === "EMPLOYEE") return defaultEmployeeMods.includes(moduleId);

    return false;
  };

  // Toggle Global Feature Flag
  const handleToggleModule = async (moduleId: string, currentStatus: boolean) => {
    if (!canManage) {
      toast.error("Seul le propriétaire ou un administrateur peut activer/désactiver les modules.");
      return;
    }

    setPendingModuleId(moduleId);
    try {
      const newFeatures = { 
        ...enabledFeatures, 
        [moduleId]: !currentStatus 
      };
      
      await updateFeatures(newFeatures);
      
      const moduleObj = MODULES_CATALOG.find(m => m.id === moduleId);
      if (!currentStatus) {
        toast.success(`Module "${moduleObj?.title || moduleId}" activé à l'échelle de l'entreprise !`);
      } else {
        toast.info(`Module "${moduleObj?.title || moduleId}" désactivé.`);
      }
    } catch (err: any) {
      console.error("Failed to update feature flag:", err);
      toast.error("Impossible de mettre à jour le module. Veuillez réessayer.");
    } finally {
      setPendingModuleId(null);
    }
  };

  // Toggle Role Access for a Specific Module
  const handleToggleRoleAccess = async (roleId: string, moduleId: string, currentAllowed: boolean) => {
    if (!canManage) {
      toast.error("Autorisation insuffisante pour modifier les rôles.");
      return;
    }

    if (roleId === "OWNER" || roleId === "SUPER_ADMIN") {
      toast.info("Le rôle Propriétaire conserve toujours l'accès souverain aux modules.");
      return;
    }

    const roleUpper = roleId.toUpperCase();
    const modLower = moduleId.toLowerCase();

    const currentRoleConfig = localRoleMatrix[roleUpper] || {};
    const updatedRoleConfig = { ...currentRoleConfig, [modLower]: !currentAllowed };
    const updatedMatrix = { ...localRoleMatrix, [roleUpper]: updatedRoleConfig };

    setLocalRoleMatrix(updatedMatrix);
    PermissionService.setRoleModuleMatrix(updatedMatrix);

    try {
      await updateSettings({
        ...businessSettings,
        roleModuleMatrix: updatedMatrix
      });

      const roleObj = CONFIGURABLE_ROLES.find(r => r.id === roleId);
      const modObj = MODULES_CATALOG.find(m => m.id === moduleId);

      if (!currentAllowed) {
        toast.success(`Accès au module "${modObj?.title || moduleId}" accordé au rôle "${roleObj?.label || roleId}" !`);
      } else {
        toast.info(`Accès au module "${modObj?.title || moduleId}" révoqué pour le rôle "${roleObj?.label || roleId}".`);
      }
    } catch (err: any) {
      console.error("Failed to update role matrix:", err);
      toast.error("Échec de la sauvegarde des règles de rôle.");
    }
  };

  // Bulk set for Matrix view
  const handleBulkSetRoleModules = async (roleKey: string, moduleIds: string[], enable: boolean) => {
    if (!canManage) return;

    const roleUpper = roleKey.toUpperCase();
    const currentRoleConfig = { ...(localRoleMatrix[roleUpper] || {}) };

    moduleIds.forEach(id => {
      currentRoleConfig[id.toLowerCase()] = enable;
    });

    const updatedMatrix = { ...localRoleMatrix, [roleUpper]: currentRoleConfig };

    setLocalRoleMatrix(updatedMatrix);
    PermissionService.setRoleModuleMatrix(updatedMatrix);

    try {
      await updateSettings({
        ...businessSettings,
        roleModuleMatrix: updatedMatrix
      });

      const roleObj = CONFIGURABLE_ROLES.find(r => r.id === roleKey);
      toast.success(`Permissions du rôle ${roleObj?.label || roleKey} mises à jour (${enable ? "Tout autoriser" : "Tout révoquer"}).`);
    } catch (err: any) {
      console.error("Bulk update failed:", err);
      toast.error("Erreur lors de la mise à jour des autorisations.");
    }
  };

  // Filtering
  const filteredModules = MODULES_CATALOG.filter(mod => {
    const matchesSearch = 
      mod.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mod.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mod.categoryLabel.toLowerCase().includes(searchQuery.toLowerCase());
      
    const matchesCategory = selectedCategory === "ALL" || mod.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6" id="modules-features-root">
      {/* 1. Top Enterprise Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/80 p-6 rounded-3xl border border-slate-800/80 shadow-lg">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-black text-slate-100 uppercase tracking-tight">
              Modules & Habilitations Rôles (RBAC)
            </h3>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            Activez les briques fonctionnelles ERP pour votre entreprise et définissez précisément quels rôles (Managers, Caissiers, Auditeurs) peuvent y accéder.
          </p>
        </div>

        {/* View Switcher & Stats */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* View Mode Toggle Buttons */}
          <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-2xl">
            <button
              onClick={() => setViewMode("cards")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                viewMode === "cards"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Cartes Modules ({activeCount})</span>
            </button>
            <button
              onClick={() => setViewMode("matrix")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                viewMode === "matrix"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Matrice Globale RBAC</span>
            </button>
          </div>

          <div className="px-3.5 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 rounded-2xl flex items-center gap-2 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Formule {activePlanCode}</span>
          </div>
        </div>
      </div>

      {/* VIEW 1: MODULE CARDS WITH PER-MODULE ROLE ACCORDION */}
      {viewMode === "cards" && (
        <div className="space-y-6">
          {/* Controls: Search & Category Filters */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/40 p-4 rounded-2xl border border-slate-800/60">
            {/* Search Bar */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Rechercher un module (ex: Paie, Caisse, IA, API)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 text-slate-100 text-xs rounded-xl pl-10 pr-9 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-sans placeholder:text-slate-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              {[
                { id: "ALL", label: "Tous" },
                { id: "PAIE_RH", label: "Paie & RH" },
                { id: "FINANCE", label: "Finance" },
                { id: "CAISSE_OPS", label: "Caisse & Ops" },
                { id: "SECURITE", label: "Sécurité" },
                { id: "INTELLIGENCE", label: "IA & Analytics" },
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                    selectedCategory === cat.id
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                      : "bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800/80"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Modules Catalog Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredModules.map((mod) => {
              const IconComp = mod.icon;
              const isEnabledGlobally = enabledFeatures[mod.id] !== false; // Default to true if not explicitly false
              const isPending = pendingModuleId === mod.id;
              const isRolePanelOpen = Boolean(expandedRolePanel[mod.id]);

              // Calculate how many roles have access
              const allowedRolesCount = CONFIGURABLE_ROLES.filter(r => isRoleAllowedForModule(r.id, mod.id)).length;

              return (
                <div
                  key={mod.id}
                  className={`p-5 rounded-2xl border transition-all flex flex-col justify-between relative overflow-hidden group ${
                    isEnabledGlobally
                      ? "bg-slate-900/90 border-indigo-500/30 hover:border-indigo-500/50 shadow-md shadow-indigo-950/10"
                      : "bg-slate-950/60 border-slate-900/80 hover:border-slate-800 opacity-80"
                  }`}
                >
                  {/* Background Accent glow if enabled */}
                  {isEnabledGlobally && (
                    <div className="absolute -top-12 -right-12 w-28 h-28 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
                  )}

                  <div>
                    {/* Top Badge Row */}
                    <div className="flex items-center justify-between mb-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`p-2.5 rounded-xl border ${
                          isEnabledGlobally
                            ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400"
                            : "bg-slate-900 border-slate-800 text-slate-600"
                        }`}>
                          <IconComp className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-0.5 bg-slate-950 border border-slate-800 rounded-lg">
                          {mod.categoryLabel}
                        </span>
                      </div>

                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                        mod.tier === "ENTERPRISE" 
                          ? "border-amber-500/30 text-amber-400 bg-amber-500/10"
                          : mod.tier === "PROFESSIONAL"
                          ? "border-cyan-500/30 text-cyan-400 bg-cyan-500/10"
                          : "border-slate-800 text-slate-500 bg-slate-950"
                      }`}>
                        {mod.tier}
                      </span>
                    </div>

                    {/* Title & Description */}
                    <h4 className="text-sm font-bold text-slate-100 group-hover:text-indigo-300 transition-colors">
                      {mod.title}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed min-h-[42px]">
                      {mod.description}
                    </p>

                    {/* Sub-features list */}
                    <div className="mt-3.5 pt-3 border-t border-slate-900/80 space-y-1.5">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 block">
                        Capacités Métier
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {mod.subFeatures.map((sub, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] font-medium text-slate-300 bg-slate-950/80 px-2 py-0.5 rounded-md border border-slate-800/80 flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-2.5 h-2.5 text-indigo-400 shrink-0" />
                            {sub}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* PER-ROLE ACCESS PANEL TOGGLE BUTTON */}
                    {isEnabledGlobally && (
                      <div className="mt-4 pt-3 border-t border-slate-900/80">
                        <button
                          onClick={() => toggleRolePanel(mod.id)}
                          className="w-full py-2 px-3 bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 rounded-xl text-xs font-bold text-slate-300 hover:text-white transition-all flex items-center justify-between group/rolebtn"
                        >
                          <div className="flex items-center gap-2">
                            <Users className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Habilitation par rôle (RBAC)</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-md">
                              {allowedRolesCount}/{CONFIGURABLE_ROLES.length} Rôles
                            </span>
                            {isRolePanelOpen ? (
                              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </div>
                        </button>

                        {/* EXPANDABLE ROLE TOGGLES LIST */}
                        {isRolePanelOpen && (
                          <div className="mt-2.5 p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2 animate-fadeIn">
                            <p className="text-[10px] text-slate-400 font-medium mb-1">
                              Spécifiez quels rôles peuvent utiliser ce module :
                            </p>
                            <div className="space-y-1.5">
                              {CONFIGURABLE_ROLES.map((role) => {
                                const allowed = isRoleAllowedForModule(role.id, mod.id);
                                const isFixedRole = role.isFixed;

                                return (
                                  <div
                                    key={role.id}
                                    className="flex items-center justify-between p-2 bg-slate-900/60 rounded-lg border border-slate-800/60"
                                  >
                                    <div className="flex items-center gap-2">
                                      <Shield className={`w-3.5 h-3.5 ${allowed ? "text-emerald-400" : "text-slate-600"}`} />
                                      <span className="text-xs font-semibold text-slate-200">{role.label}</span>
                                    </div>

                                    {isFixedRole ? (
                                      <span className="text-[9px] font-black uppercase text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                        Accès Total
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => handleToggleRoleAccess(role.id, mod.id, allowed)}
                                        disabled={!canManage || adminLoading}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                                          allowed
                                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"
                                            : "bg-slate-800 text-slate-500 border border-slate-700 hover:text-slate-300"
                                        }`}
                                      >
                                        {allowed ? (
                                          <>
                                            <Check className="w-3 h-3" />
                                            Autorisé
                                          </>
                                        ) : (
                                          <>
                                            <Lock className="w-3 h-3 text-slate-500" />
                                            Désactivé
                                          </>
                                        )}
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Bottom Action / Global Switch Bar */}
                  <div className="mt-5 pt-4 border-t border-slate-900 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        isEnabledGlobally ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
                      }`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${
                        isEnabledGlobally ? "text-emerald-400" : "text-slate-500"
                      }`}>
                        {isEnabledGlobally ? "Module Actif" : "Désactivé Globalement"}
                      </span>
                    </div>

                    {/* Interactive Global Switch */}
                    <button
                      onClick={() => handleToggleModule(mod.id, isEnabledGlobally)}
                      disabled={adminLoading || isPending || !canManage}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ${
                        isEnabledGlobally ? "bg-indigo-600" : "bg-slate-800"
                      } ${(!canManage || adminLoading) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                      title={
                        !canManage
                          ? "Autorisation requise pour modifier"
                          : isEnabledGlobally
                          ? "Cliquer pour désactiver ce module pour l'entreprise"
                          : "Cliquer pour activer ce module pour l'entreprise"
                      }
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform flex items-center justify-center ${
                          isEnabledGlobally ? "translate-x-6" : "translate-x-1"
                        }`}
                      >
                        {isPending && <RefreshCw className="w-2.5 h-2.5 text-indigo-600 animate-spin" />}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredModules.length === 0 && (
            <div className="py-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl space-y-2">
              <Info className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-sm font-bold text-slate-300">Aucun module ne correspond à vos critères de recherche.</p>
              <p className="text-xs text-slate-500">Essayez de modifier votre mot-clé ou de réinitialiser les filtres de catégorie.</p>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: FULL INTERACTIVE RBAC ROLE MATRIX GRID */}
      {viewMode === "matrix" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-xl">
                <SlidersHorizontal className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider">Matrice Complète des Permissions RBAC</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Cochez ou décochez les cases pour accorder ou révoquer l'accès à un module pour un rôle spécifique.
                </p>
              </div>
            </div>
          </div>

          <RoleModuleMatrixGrid
            roles={CONFIGURABLE_ROLES.map(r => r.id)}
            roleModuleMatrix={localRoleMatrix}
            onToggleModule={(role, modId) => {
              const currentVal = isRoleAllowedForModule(role, modId);
              handleToggleRoleAccess(role, modId, currentVal);
            }}
            onBulkSetRoleModules={handleBulkSetRoleModules}
            loading={adminLoading}
          />
        </div>
      )}

      {/* 4. Compliance & Audit Notice */}
      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-start gap-3">
        <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl shrink-0">
          <Activity className="w-4 h-4" />
        </div>
        <div className="space-y-1 text-xs">
          <p className="font-bold text-slate-200">Synchronisation des Droits en Temps Réel & Traçabilité</p>
          <p className="text-slate-400 leading-relaxed">
            Toute modification des droits d'accès par rôle adapte dynamiquement les autorisations utilisateurs, les routes de l'application et les règles de validation Firestore. Chaque mise à jour est archivée dans le journal d'audit de l'entreprise.
          </p>
        </div>
      </div>
    </div>
  );
}
