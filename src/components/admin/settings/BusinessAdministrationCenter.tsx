import React, { useState, useEffect, useRef } from "react";
import { 
  Settings, 
  Building2, 
  MapPin, 
  Users, 
  ShieldCheck, 
  FileText, 
  CreditCard, 
  Palette, 
  Bell, 
  Lock, 
  Activity, 
  Database, 
  Bot, 
  Link2, 
  History,
  LayoutDashboard,
  ChevronRight,
  ChevronDown,
  Search,
  Star,
  GitMerge,
  Percent,
  User,
  Menu,
  X,
  Sparkles,
  CheckCircle2,
  SlidersHorizontal
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useBusinessContext } from "../../../contexts/BusinessContext";
import { useAuth } from "../../../hooks/useAuth";
import { useI18n } from "../../../i18n";

// Sub-components
import BusinessProfileSection from "./sections/BusinessProfileSection";
import BranchDepartmentSection from "./sections/BranchDepartmentSection";
import RolesPermissionsSection from "./sections/RolesPermissionsSection";
import ApprovalPoliciesSection from "./sections/ApprovalPoliciesSection";
import PayrollPoliciesSection from "./sections/PayrollPoliciesSection";
import AttendancePoliciesSection from "./sections/AttendancePoliciesSection";
import FeatureSubscriptionSection from "./sections/FeatureSubscriptionSection";
import BrandingSection from "./sections/BrandingSection";
import SecurityAuditSection from "./sections/SecurityAuditSection";
import AiAssistantSection from "./sections/AiAssistantSection";
import BusinessHealthSection from "./sections/BusinessHealthSection";
import NotificationSection from "./sections/NotificationSection";
import IntegrationSection from "./sections/IntegrationSection";
import DataManagementSection from "./sections/DataManagementSection";
import OrganizationStructureSection from "./sections/OrganizationStructureSection";
import UserProfileSection from "./sections/UserProfileSection";
import PayrollTaxConfigurationSection from "./sections/PayrollTaxConfigurationSection";
import SettingsHomeDashboard from "./sections/SettingsHomeDashboard";

export type SettingsSection = 
  | "OVERVIEW"
  | "USER_PROFILE"
  | "PROFILE"
  | "VISUALIZER"
  | "ORGANIZATION"
  | "ROLES"
  | "APPROVAL_POLICIES"
  | "PAYROLL_POLICIES"
  | "PAYROLL_TAXES"
  | "ATTENDANCE_POLICIES"
  | "FEATURES"
  | "SUBSCRIPTION"
  | "BRANDING"
  | "NOTIFICATIONS"
  | "SECURITY"
  | "AUDIT"
  | "INTEGRATIONS"
  | "DATA"
  | "HEALTH"
  | "AI";

export interface CategoryGroup {
  id: string;
  label: string;
  icon: any;
  items: {
    id: SettingsSection;
    label: string;
    description: string;
    icon: any;
    badge?: string;
  }[];
}

export const SETTINGS_CATEGORIES: CategoryGroup[] = [
  {
    id: "GENERAL",
    label: "Général",
    icon: Building2,
    items: [
      { id: "OVERVIEW", label: "Tableau de bord", description: "Synthèse & état global de configuration", icon: LayoutDashboard },
      { id: "USER_PROFILE", label: "Mon profil utilisateur", description: "Préférences & accès individuel", icon: User },
      { id: "PROFILE", label: "Profil entreprise", description: "NIF, coordonnées & statut légal", icon: Building2 },
      { id: "BRANDING", label: "Identité visuelle", description: "Logo, charte & rapports PDF", icon: Palette },
    ]
  },
  {
    id: "ORGANIZATION",
    label: "Organisation",
    icon: Users,
    items: [
      { id: "VISUALIZER", label: "Visualiseur hiérarchique", description: "Organigramme interactif", icon: GitMerge },
      { id: "ORGANIZATION", label: "Succursales & départements", description: "Sites physiques & unités de travail", icon: MapPin },
      { id: "ROLES", label: "Rôles & Accès aux modules", description: "Matrice d'accès aux modules ERP & permissions RBAC", icon: Users },
      { id: "APPROVAL_POLICIES", label: "Circuits d'approbation", description: "Règles de validation multi-niveaux", icon: ShieldCheck },
    ]
  },
  {
    id: "PAYROLL_RH",
    label: "Paie & RH",
    icon: FileText,
    items: [
      { id: "PAYROLL_POLICIES", label: "Politiques de paie", description: "Cycle de paiement & barèmes", icon: FileText },
      { id: "PAYROLL_TAXES", label: "Taxes & cotisations paie", description: "Règles ONA (6%), OFATMA (2%) & IRI", icon: Percent },
      { id: "ATTENDANCE_POLICIES", label: "Politiques de temps", description: "Heures sup, retards & congés", icon: History },
    ]
  },
  {
    id: "FINANCE_OPS",
    label: "Finance & Opérations",
    icon: Settings,
    items: [
      { id: "FEATURES", label: "Modules & fonctionnalités", description: "Activation des briques fonctionnelles", icon: Settings },
      { id: "DATA", label: "Gestion des données", description: "Import, export & sauvegarde", icon: Database },
      { id: "AUDIT", label: "Audit & transparence", description: "Journal immuable des activités", icon: Activity },
      { id: "HEALTH", label: "Santé entreprise", description: "Indicateurs de performance globale", icon: ShieldCheck },
    ]
  },
  {
    id: "ADMINISTRATION",
    label: "Administration",
    icon: Lock,
    items: [
      { id: "SUBSCRIPTION", label: "Abonnement & facturation", description: "Licences SaaS & factures", icon: CreditCard },
      { id: "INTEGRATIONS", label: "API & intégrations", description: "Webhooks & clés système", icon: Link2 },
      { id: "NOTIFICATIONS", label: "Notifications", description: "Canaux d'alerte email & SMS", icon: Bell },
      { id: "SECURITY", label: "Centre de sécurité", description: "Authentification & sessions", icon: Lock },
    ]
  },
  {
    id: "INTELLIGENCE",
    label: "Intelligence",
    icon: Bot,
    items: [
      { id: "AI", label: "Assistant AI stratégique", description: "CFO IA & recommandations", icon: Bot, badge: "IA Enterprise" },
    ]
  }
];

export default function BusinessAdministrationCenter() {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<SettingsSection>("OVERVIEW");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  const { currentBusiness } = useBusinessContext();
  const { dbUser } = useAuth();
  const navRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setExpandedCategory(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close dropdown on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setExpandedCategory(null);
        setIsMobileMenuOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Helper to find current section item details
  const currentItem = SETTINGS_CATEGORIES.flatMap(cat => cat.items).find(item => item.id === activeSection) || SETTINGS_CATEGORIES[0].items[0];
  const currentCategory = SETTINGS_CATEGORIES.find(cat => cat.items.some(item => item.id === activeSection)) || SETTINGS_CATEGORIES[0];

  // Search filter across all items
  const searchResults = searchQuery.trim() 
    ? SETTINGS_CATEGORIES.flatMap(cat => cat.items.map(item => ({ ...item, categoryLabel: cat.label })))
        .filter(item => 
          item.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
          item.description.toLowerCase().includes(searchQuery.toLowerCase())
        )
    : [];

  const handleSelectSection = (sectionId: SettingsSection) => {
    setActiveSection(sectionId);
    setExpandedCategory(null);
    setIsMobileMenuOpen(false);
    setSearchQuery("");
  };

  const toggleCategory = (catId: string) => {
    setExpandedCategory(prev => prev === catId ? null : catId);
  };

  const renderSection = () => {
    switch (activeSection) {
      case "OVERVIEW": return <SettingsHomeDashboard onNavigate={handleSelectSection} />;
      case "USER_PROFILE": return <UserProfileSection />;
      case "PROFILE": return <BusinessProfileSection />;
      case "VISUALIZER": return <OrganizationStructureSection />;
      case "ORGANIZATION": return <BranchDepartmentSection />;
      case "ROLES": return <RolesPermissionsSection />;
      case "APPROVAL_POLICIES": return <ApprovalPoliciesSection />;
      case "PAYROLL_POLICIES": return <PayrollPoliciesSection />;
      case "PAYROLL_TAXES": return <PayrollTaxConfigurationSection />;
      case "ATTENDANCE_POLICIES": return <AttendancePoliciesSection />;
      case "FEATURES": 
      case "SUBSCRIPTION": return <FeatureSubscriptionSection />;
      case "BRANDING": return <BrandingSection />;
      case "SECURITY": 
      case "AUDIT": return <SecurityAuditSection />;
      case "NOTIFICATIONS": return <NotificationSection />;
      case "INTEGRATIONS": return <IntegrationSection />;
      case "DATA": return <DataManagementSection />;
      case "AI": return <AiAssistantSection />;
      case "HEALTH": return <BusinessHealthSection />;
      default: return <div className="p-12 text-center text-slate-500 font-mono">Section en cours de déploiement...</div>;
    }
  };

  return (
    <div className="w-full min-h-screen flex flex-col bg-slate-950 text-slate-200" id="admin-center-root">
      {/* 1. Top Enterprise Header */}
      <header className="border-b border-slate-900 px-4 sm:px-8 py-3 flex flex-col lg:flex-row lg:items-center justify-between bg-slate-950/90 backdrop-blur-xl z-30 shrink-0 gap-4">
        <div className="flex items-center justify-between w-full lg:w-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 shadow-md">
              <Settings className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-xs font-black text-slate-100 uppercase tracking-tight leading-none">
                {t.settings?.title || "Paramètres & Administration"}
              </h1>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                FINOPS ERP Console
              </p>
            </div>
          </div>

          {/* Mobile Menu Toggle Button */}
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-400"
            aria-label="Toggle navigation menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Header Right Actions & Search */}
        <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3 w-full lg:w-auto">
          {/* Quick Search Bar */}
          <div className="relative group w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
            <input 
              type="text" 
              placeholder="Rechercher une rubrique..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/60 border border-slate-800 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-200 outline-none focus:border-cyan-500/50 focus:bg-slate-900 transition-all placeholder:text-slate-600"
            />
            
            {/* Live Search Popup Results */}
            {searchQuery.trim() && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 max-h-80 overflow-y-auto space-y-1">
                {searchResults.length > 0 ? (
                  searchResults.map(res => (
                    <button
                      key={res.id}
                      onClick={() => handleSelectSection(res.id)}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-slate-800/80 transition flex items-center justify-between group cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <res.icon className="w-4 h-4 text-cyan-400" />
                        <div>
                          <span className="text-xs font-bold text-slate-200 block group-hover:text-cyan-400">{res.label}</span>
                          <span className="text-[10px] text-slate-500">{res.categoryLabel}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400" />
                    </button>
                  ))
                ) : (
                  <div className="p-4 text-center text-xs text-slate-500">
                    Aucune rubrique correspondant à "{searchQuery}"
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-3">
            <div className="text-right">
              <span className="text-[10px] font-black text-slate-200 uppercase block">{dbUser?.name || "Admin System"}</span>
              <span className="text-[9px] text-cyan-500 font-mono">TENANT #{currentBusiness?.id?.slice(0, 8) || "ERP"}</span>
            </div>
            <div className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400 font-bold text-xs">
              {dbUser?.name?.charAt(0) || "A"}
            </div>
          </div>
        </div>
      </header>

      {/* 2. Hierarchical Grouped Dropdown Navigation Bar (Desktop) */}
      <nav ref={navRef} className="border-b border-slate-900 bg-slate-950/95 backdrop-blur-md px-4 sm:px-8 py-2.5 z-20 relative shrink-0">
        <div className="hidden lg:flex flex-wrap items-center gap-2">
          {SETTINGS_CATEGORIES.map(category => {
            const isCategoryActive = category.items.some(i => i.id === activeSection);
            const isExpanded = expandedCategory === category.id;
            const CategoryIcon = category.icon;

            return (
              <div key={category.id} className="relative">
                {/* Category Group Button */}
                <button
                  type="button"
                  onClick={() => toggleCategory(category.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    isCategoryActive 
                      ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent"
                  }`}
                  aria-expanded={isExpanded}
                >
                  <CategoryIcon className={`w-4 h-4 ${isCategoryActive ? "text-cyan-400" : "text-slate-500"}`} />
                  <span>{category.label}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? "rotate-180 text-cyan-400" : "text-slate-600"}`} />
                </button>

                {/* Collapsible Dropdown Popover */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.98 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-0 top-full mt-2 w-72 bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 backdrop-blur-xl space-y-1"
                    >
                      <div className="px-3 py-1.5 border-b border-slate-800/80 mb-1">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          {category.label}
                        </span>
                      </div>

                      {category.items.map(item => {
                        const isSelected = activeSection === item.id;
                        const ItemIcon = item.icon;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSelectSection(item.id)}
                            className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between cursor-pointer group ${
                              isSelected
                                ? "bg-cyan-500 text-slate-950 shadow-md font-black"
                                : "hover:bg-slate-800/80 text-slate-300"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <ItemIcon className={`w-4 h-4 shrink-0 ${isSelected ? "text-slate-950" : "text-slate-400 group-hover:text-cyan-400"}`} />
                              <div className="truncate">
                                <span className={`text-xs block leading-tight ${isSelected ? "font-black" : "font-bold"}`}>{item.label}</span>
                                <span className={`text-[9px] block truncate ${isSelected ? "text-slate-900" : "text-slate-500"}`}>{item.description}</span>
                              </div>
                            </div>
                            {item.badge && (
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${isSelected ? "bg-slate-950 text-cyan-400" : "bg-cyan-500/10 text-cyan-400"}`}>
                                {item.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </nav>

      {/* 3. Mobile Navigation Drawer / Accordion Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden border-b border-slate-900 bg-slate-900/95 backdrop-blur-xl px-4 py-4 space-y-4 z-40 overflow-hidden"
          >
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center justify-between pb-2 border-b border-slate-800">
              <span>Navigation des Paramètres</span>
              <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {SETTINGS_CATEGORIES.map(category => (
                <div key={category.id} className="space-y-1">
                  <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    <category.icon className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{category.label}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-1 pl-3">
                    {category.items.map(item => (
                      <button
                        key={item.id}
                        onClick={() => handleSelectSection(item.id)}
                        className={`p-2.5 rounded-xl text-left text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                          activeSection === item.id
                            ? "bg-cyan-500 text-slate-950 font-black"
                            : "bg-slate-950/60 text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <item.icon className="w-4 h-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. Main Section Area (Single Page Scroll Only) */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Breadcrumb Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-cyan-400 shadow-sm">
              <currentItem.icon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                <span>{currentCategory.label}</span>
                <ChevronRight className="w-3 h-3 text-slate-700" />
                <span className="text-cyan-400">{currentItem.label}</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{currentItem.description}</p>
            </div>
          </div>
        </div>

        {/* Section Dynamic View */}
        <div className="w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderSection()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
