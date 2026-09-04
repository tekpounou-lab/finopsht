import React, { useState, useRef, useEffect } from "react";
import { Role } from "../../../types";
import { User, LogOut, Shield, ChevronDown, Check } from "lucide-react";

interface UserDropdownProps {
  currentUser?: { name: string; email?: string } | null;
  currentRole: Role;
  onSwitchRole?: (role: Role) => void;
  onLogout: () => void;
}

export const UserDropdown: React.FC<UserDropdownProps> = ({
  currentUser,
  currentRole,
  onSwitchRole,
  onLogout,
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

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-all"
      >
        <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-xs">
          {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "U"}
        </div>
        <div className="hidden sm:block text-left">
          <div className="text-xs font-semibold text-white leading-tight">
            {currentUser?.name || "Utilisateur"}
          </div>
          <div className="text-[10px] text-slate-400 leading-tight">{currentRole}</div>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl py-2 z-50 text-xs">
          <div className="px-3 py-2 border-b border-slate-800">
            <span className="text-slate-400 text-[10px] uppercase tracking-wider block">Connecté en tant que</span>
            <span className="font-semibold text-white block truncate">{currentUser?.name || "Admin"}</span>
            <span className="text-slate-500 text-[11px] block truncate">{currentUser?.email}</span>
          </div>

          <div className="p-1">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onLogout();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors font-medium text-left"
            >
              <LogOut className="w-4 h-4" />
              <span>Déconnexion</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
