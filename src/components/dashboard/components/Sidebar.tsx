import React, { useMemo, useEffect } from "react";
import { Role } from "../../../types";
import {
  LayoutDashboard,
  Building2,
  Landmark,
  BookOpen,
  Clock,
  Calendar,
  ShieldCheck,
  Settings,
  Users,
  TrendingUp,
  Sparkles,
  FileText,
  UserCheck,
  Briefcase,
  Layers,
  Activity,
  Radio,
  Database,
  X,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeft
} from "lucide-react";
import { normalizeTab, NavigationBadgeCounts } from "../hooks/useNavigation";
import { SidebarCategory, NavCategory } from "./SidebarCategory";
import { useSidebarState } from "../../../hooks/useSidebarState";

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  currentRole: Role;
  isOpen: boolean; // Mobile open state
  onCloseMobile: () => void;
  badgeCounts?: NavigationBadgeCounts;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  currentRole,
  isOpen,
  onCloseMobile,
  badgeCounts = {},
}) => {
  const normalizedActive = normalizeTab(activeTab);

  const {
    isCollapsed,
    toggleSidebar,
    expandedCategories,
    toggleCategory,
    expandCategory,
  } = useSidebarState();

  // All Categorized ERP navigation items
  const allCategories: NavCategory[] = useMemo(() => [
    {
      id: "dashboard_group",
      label: "Tableau de Bord",
      items: [
        { id: "dashboard", label: "Vue d'ensemble", icon: LayoutDashboard, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"] },
      ],
    },
    {
      id: "hr_group",
      label: "Gestion RH & Personnel",
      items: [
        { id: "organization", label: "Structure Organisation", icon: Building2, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"] },
        { id: "personnel", label: "Effectifs & Personnel", icon: Users, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"] },
        { id: "attendance", label: "Pointage & Présences", icon: Clock, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER", "SUPERVISOR", "EMPLOYEE"] },
        { id: "planning", label: "Planning & Horaires", icon: Briefcase, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER", "SUPERVISOR"] },
        { id: "leaves", label: "Gestion des Congés", icon: Calendar, badge: badgeCounts.leaves, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER", "SUPERVISOR", "EMPLOYEE"] },
      ],
    },
    {
      id: "finance_group",
      label: "Finances & Comptabilité",
      items: [
        { id: "payroll", label: "Moteur de Paie", icon: Landmark, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"] },
        { id: "ledger", label: "Grand Livre Comptable", icon: BookOpen, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"] },
      ],
    },
    {
      id: "intelligence_group",
      label: "Performance & CRM",
      items: [
        { id: "performance", label: "Performance & CRM", icon: TrendingUp, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER", "SUPERVISOR"] },
        { id: "cfo", label: "Assistant IA CFO", icon: Sparkles, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"] },
      ],
    },
    {
      id: "tools_group",
      label: "Outils & Espace",
      items: [
        { id: "documents", label: "Gestion Documentaire", icon: FileText, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER", "EMPLOYEE"] },
        { id: "employeeSpace", label: "Mon Espace Collaborateur", icon: UserCheck, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER", "SUPERVISOR", "EMPLOYEE"] },
      ],
    },
    {
      id: "admin_group",
      label: "Administration & Sécurité",
      items: [
        { id: "settings", label: "Administration", icon: Settings, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"] },
        { id: "forensic", label: "Audit & Sécurité", icon: ShieldCheck, roles: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
      ],
    },
    {
      id: "sre_group",
      label: "Plateforme & SRE",
      items: [
        { id: "platform", label: "Organisations & Tenants", icon: Building2, roles: ["SUPER_ADMIN"] },
        { id: "plans", label: "Plans & Licences", icon: Layers, roles: ["SUPER_ADMIN"] },
        { id: "health", label: "Santé Système & SRE", icon: Activity, roles: ["SUPER_ADMIN"] },
        { id: "reliability", label: "Flux Événements & DLQ", icon: Radio, roles: ["SUPER_ADMIN"] },
        { id: "recovery", label: "Plan de Reprise (DRP)", icon: Database, roles: ["SUPER_ADMIN"] },
      ],
    },
  ], [badgeCounts]);

  // Filter Categories and Items according to current user's Role
  // Empty categories (0 matching items) are automatically omitted!
  const visibleCategories = useMemo(() => {
    const roleStr = String(currentRole || "").toUpperCase();
    return allCategories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((item) => !roleStr || item.roles.includes(roleStr)),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [allCategories, currentRole]);

  // Auto-expand category if active tab is inside a currently collapsed category
  useEffect(() => {
    visibleCategories.forEach((cat) => {
      const containsActive = cat.items.some(
        (item) => normalizeTab(item.id) === normalizedActive
      );
      if (containsActive && expandedCategories[cat.id] === false) {
        expandCategory(cat.id);
      }
    });
  }, [normalizedActive, visibleCategories, expandedCategories, expandCategory]);

  return (
    <>
      {/* Mobile / Tablet Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs lg:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Container */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 bg-slate-950 border-r border-slate-800/80 p-3 flex flex-col justify-between transition-all duration-300 ease-in-out shrink-0 select-none ${
          isOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0"
        } ${isCollapsed ? "lg:w-20" : "lg:w-64"}`}
      >
        <div className="space-y-4 flex-1 flex flex-col min-h-0">
          {/* Brand Logo & Global Collapse Toggle */}
          <div className="flex items-center justify-between px-1 py-1">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white font-black text-sm shadow-md shadow-indigo-900/30 shrink-0">
                F
              </div>
              {!isCollapsed && (
                <div className="animate-in fade-in duration-200">
                  <span className="font-bold text-sm tracking-wide text-white block truncate">
                    FINOPS ERP
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono block truncate">
                    Enterprise Suite
                  </span>
                </div>
              )}
            </div>

            {/* Desktop Global Collapse/Expand Button */}
            <button
              type="button"
              onClick={toggleSidebar}
              className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 transition-colors cursor-pointer"
              title={isCollapsed ? "Étendre la barre latérale (Expand)" : "Réduire la barre latérale (Collapse)"}
              aria-label={isCollapsed ? "Étendre le menu" : "Réduire le menu"}
            >
              {isCollapsed ? (
                <PanelLeft className="w-4 h-4 text-indigo-400" />
              ) : (
                <PanelLeftClose className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {/* Mobile Close Button */}
            <button
              type="button"
              onClick={onCloseMobile}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 lg:hidden"
              aria-label="Fermer le menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Categorized Navigation List */}
          <nav className="space-y-1.5 text-xs overflow-y-auto flex-1 pr-0.5 custom-scrollbar">
            {visibleCategories.map((category) => {
              const isCatExpanded = expandedCategories[category.id] !== false; // Default true

              return (
                <SidebarCategory
                  key={category.id}
                  category={category}
                  isExpanded={isCatExpanded}
                  onToggleCategory={toggleCategory}
                  activeTab={activeTab}
                  onSelectTab={onSelectTab}
                  onCloseMobile={onCloseMobile}
                  isSidebarCollapsed={isCollapsed}
                />
              );
            })}
          </nav>
        </div>

        {/* Footer / Role & System Connection Badge */}
        <div className="pt-2 border-t border-slate-900/80 mt-2">
          {isCollapsed ? (
            /* Compact Collapsed Footer Icon */
            <div
              className="p-2 bg-slate-900/60 rounded-xl border border-slate-800/60 flex items-center justify-center cursor-help"
              title={`Rôle Actif: ${currentRole} • Connecté Cloud ERP`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          ) : (
            /* Expanded Full Footer */
            <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/60 text-[11px] space-y-1.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-slate-400">
                <span>Rôle Actif</span>
                <span className="font-semibold text-indigo-400 uppercase tracking-wider text-[10px]">
                  {currentRole}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-400 font-medium text-[10px]">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Connecté Cloud ERP</span>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
