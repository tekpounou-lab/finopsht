import React from "react";
import { 
  Menu, 
  Search, 
  Bell, 
  Building2, 
  ShieldCheck, 
  Sparkles, 
  Command, 
  Globe 
} from "lucide-react";
import { Business, Role } from "../../../types";

interface TopBarProps {
  currentBusiness?: Business | null;
  businesses: Business[];
  onSelectBusiness: (biz: Business) => void;
  onOpenMobileMenu: () => void;
  onOpenCommandPalette: () => void;
  onOpenNotifications: () => void;
  notificationCount: number;
  userSlot: React.ReactNode;
  currentRole?: Role | string;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentBusiness,
  businesses,
  onSelectBusiness,
  onOpenMobileMenu,
  onOpenCommandPalette,
  onOpenNotifications,
  notificationCount,
  userSlot,
  currentRole,
}) => {
  const isSuperAdmin = String(currentRole || "").toUpperCase() === "SUPER_ADMIN";

  return (
    <header className="h-16 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30 shrink-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 lg:hidden cursor-pointer"
          aria-label="Ouvrir le menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Business Selector / Platform Root Status */}
        {isSuperAdmin && (!currentBusiness || currentBusiness.id === "PLATFORM_ROOT" || businesses.length === 0) ? (
          <div className="flex items-center gap-2 bg-slate-900/80 border border-emerald-500/30 rounded-xl px-3 py-1.5 shadow-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-white font-semibold text-xs truncate max-w-[140px] sm:max-w-[200px]">
              {currentBusiness?.name || "Plateforme Root (Multi-Tenant)"}
            </span>
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full hidden sm:inline-block">
              SUPER ADMIN
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-1.5">
            <Building2 className="w-4 h-4 text-indigo-400 shrink-0" />
            <select
              value={currentBusiness?.id || ""}
              onChange={(e) => {
                const selected = businesses.find((b) => b.id === e.target.value);
                if (selected) onSelectBusiness(selected);
              }}
              className="bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer max-w-[140px] sm:max-w-[200px] truncate"
            >
              {businesses.length === 0 ? (
                <option value="">{isSuperAdmin ? "Instance Racine (Multi-Tenant)" : "Aucune entreprise"}</option>
              ) : (
                businesses.map((b) => (
                  <option key={b.id} value={b.id} className="bg-slate-900 text-white">
                    {b.name || "Entreprise"}
                  </option>
                ))
              )}
            </select>
          </div>
        )}
      </div>

      {/* Center Search / Command palette trigger */}
      <button
        type="button"
        onClick={onOpenCommandPalette}
        className="hidden md:flex items-center gap-3 bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 px-3.5 py-1.5 rounded-xl text-xs text-slate-400 transition-all w-64 justify-between cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <Search className="w-3.5 h-3.5" />
          <span>Recherche rapide...</span>
        </span>
        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-300">
          ⌘K
        </kbd>
      </button>

      {/* Right Tools & User Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onOpenNotifications}
          className="relative p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          {notificationCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-slate-950 animate-pulse" />
          )}
        </button>

        {userSlot}
      </div>
    </header>
  );
};
