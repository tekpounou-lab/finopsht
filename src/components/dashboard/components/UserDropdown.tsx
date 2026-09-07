import React, { useState, useRef, useEffect } from "react";
import { Role } from "../../../types";
import { User, LogOut, ShieldCheck, ChevronDown, HelpCircle, Settings } from "lucide-react";

export interface UserDropdownProps {
  currentUser?: { name: string; email?: string } | null;
  currentRole: Role | string;
  onSwitchRole?: (role: Role) => void;
  onLogout: () => void;
  onNavigateToProfile?: () => void;
  onNavigateToSupport?: () => void;
  onNavigateToSettings?: () => void;
}

function getInitials(name?: string): string {
  if (!name || name.trim().length === 0) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatRoleLabel(roleStr?: string): string {
  const r = String(roleStr || "").toUpperCase();
  switch (r) {
    case "SUPER_ADMIN":
      return "Super Admin";
    case "OWNER":
      return "Propriétaire (Owner)";
    case "MANAGER":
      return "Manager";
    case "SUPERVISOR":
      return "Superviseur";
    case "EMPLOYEE":
      return "Collaborateur";
    case "JUNIOR_TELLER":
      return "Guichetier Junior";
    case "SENIOR_TELLER":
      return "Guichetier Sénior";
    case "HEAD_TELLER":
      return "Chef Guichetier";
    case "AUDITOR":
      return "Auditeur";
    default:
      return roleStr || "Membre";
  }
}

export const UserDropdown: React.FC<UserDropdownProps> = ({
  currentUser,
  currentRole,
  onLogout,
  onNavigateToProfile,
  onNavigateToSupport,
  onNavigateToSettings,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayName = currentUser?.name || "Administrateur";
  const displayEmail = currentUser?.email || "";
  const initials = getInitials(displayName);
  const roleLabel = formatRoleLabel(String(currentRole));

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-all cursor-pointer group"
        aria-expanded={isOpen}
        aria-label="Menu Utilisateur"
      >
        <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-xs uppercase shrink-0 group-hover:border-indigo-400 transition-colors">
          {initials}
        </div>
        <div className="hidden sm:block text-left">
          <div className="text-xs font-semibold text-white leading-tight max-w-[160px] truncate" title={displayName}>
            {displayName}
          </div>
          <div className="text-[10px] text-slate-400 leading-tight font-medium">
            {roleLabel}
          </div>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 hidden sm:block transition-transform duration-200 ${isOpen ? "rotate-180 text-white" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-60 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl py-2 z-50 text-xs animate-in fade-in duration-150">
          {/* User Header */}
          <div className="px-3.5 py-2.5 border-b border-slate-800/80">
            <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider block mb-0.5">
              Identité Connectée
            </span>
            <span className="font-semibold text-white block truncate text-xs" title={displayName}>
              {displayName}
            </span>
            {displayEmail && (
              <span className="text-slate-400 text-[11px] block truncate mt-0.5" title={displayEmail}>
                {displayEmail}
              </span>
            )}
            <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px] font-semibold">
              <ShieldCheck className="w-3 h-3 text-indigo-400" />
              <span>{roleLabel}</span>
            </div>
          </div>

          {/* Actions Menu */}
          <div className="p-1 space-y-0.5">
            {onNavigateToProfile && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onNavigateToProfile();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors font-medium text-left cursor-pointer"
              >
                <User className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Mon Profil</span>
              </button>
            )}

            {onNavigateToSettings && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onNavigateToSettings();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors font-medium text-left cursor-pointer"
              >
                <Settings className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Paramètres Entreprise</span>
              </button>
            )}

            {onNavigateToSupport && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onNavigateToSupport();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors font-medium text-left cursor-pointer"
              >
                <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Centre de Support & Aide</span>
              </button>
            )}

            <div className="border-t border-slate-800/80 my-1" />

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onLogout();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors font-medium text-left cursor-pointer"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Déconnexion</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
