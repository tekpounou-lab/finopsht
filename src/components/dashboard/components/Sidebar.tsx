import React, { useMemo } from "react";
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
  X
} from "lucide-react";
import { normalizeTab, NavigationBadgeCounts } from "../hooks/useNavigation";

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  currentRole: Role;
  isOpen: boolean;
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

  // All ERP navigation items with role mapping
  const allNavItems = useMemo(() => [
    // Super Admin Specific Platform & SRE Modules
    { id: "platform", label: "Organisations & Tenants", icon: Building2, roles: ["SUPER_ADMIN"] },
    { id: "plans", label: "Plans & Licences", icon: Layers, roles: ["SUPER_ADMIN"] },
    { id: "health", label: "Santé Système & SRE", icon: Activity, roles: ["SUPER_ADMIN"] },
    { id: "reliability", label: "Flux Événements & DLQ", icon: Radio, roles: ["SUPER_ADMIN"] },
    { id: "recovery", label: "Plan de Reprise (DRP)", icon: Database, roles: ["SUPER_ADMIN"] },

    // Executive / Core Operations
    { id: "dashboard", label: "Vue d'ensemble", icon: LayoutDashboard, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"] },
    { id: "organization", label: "Structure Organisation", icon: Building2, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"] },
    { id: "personnel", label: "Effectifs & Personnel", icon: Users, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"] },
    { id: "payroll", label: "Moteur de Paie", icon: Landmark, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"] },
    { id: "ledger", label: "Grand Livre Comptable", icon: BookOpen, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"] },
    { id: "attendance", label: "Pointage & Présences", icon: Clock, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER", "SUPERVISOR", "EMPLOYEE"] },
    { id: "planning", label: "Planning & Horaires", icon: Briefcase, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER", "SUPERVISOR"] },
    { id: "leaves", label: "Gestion des Congés", icon: Calendar, badge: badgeCounts.leaves, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER", "SUPERVISOR", "EMPLOYEE"] },
    { id: "performance", label: "Performance & CRM", icon: TrendingUp, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER", "SUPERVISOR"] },
    { id: "cfo", label: "Assistant IA CFO", icon: Sparkles, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"] },
    { id: "documents", label: "Gestion Documentaire", icon: FileText, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER", "EMPLOYEE"] },
    { id: "forensic", label: "Audit & Sécurité", icon: ShieldCheck, roles: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
    { id: "employeeSpace", label: "Mon Espace Collaborateur", icon: UserCheck, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER", "SUPERVISOR", "EMPLOYEE"] },
    { id: "settings", label: "Administration", icon: Settings, roles: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"] },
  ], [badgeCounts]);

  // Filter items according to the active role
  const visibleNavItems = useMemo(() => {
    return allNavItems.filter((item) => {
      if (!currentRole) return true;
      const roleStr = String(currentRole).toUpperCase();
      return item.roles.includes(roleStr);
    });
  }, [allNavItems, currentRole]);

  return (
    <>
      {/* Mobile / Tablet Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Container */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-slate-950 border-r border-slate-800/80 p-4 flex flex-col justify-between transition-transform duration-200 ease-in-out shrink-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="space-y-5 flex-1 flex flex-col min-h-0">
          {/* Brand / Logo + Mobile Close */}
          <div className="flex items-center justify-between px-2 py-1">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white font-black text-sm shadow-md shadow-indigo-900/30">
                F
              </div>
              <div>
                <span className="font-bold text-sm tracking-wide text-white block">FINOPS ERP</span>
                <span className="text-[10px] text-slate-400 font-mono">Enterprise Suite</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onCloseMobile}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 lg:hidden"
              aria-label="Fermer le menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Items (Scrollable if viewport is small) */}
          <nav className="space-y-1 text-xs overflow-y-auto flex-1 pr-1 custom-scrollbar">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isItemActive = normalizedActive === normalizeTab(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(item.id);
                    onCloseMobile();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-all cursor-pointer ${
                    isItemActive
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/20"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/80"
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <Icon className={`w-4 h-4 shrink-0 ${isItemActive ? "text-white" : "text-slate-400"}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer / Status */}
        <div className="pt-3 border-t border-slate-900 mt-2">
          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/60 text-[11px] space-y-1.5">
            <div className="flex items-center justify-between text-slate-400">
              <span>Rôle Actif</span>
              <span className="font-semibold text-indigo-400 uppercase tracking-wider">{currentRole}</span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Connecté au Cloud ERP</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

