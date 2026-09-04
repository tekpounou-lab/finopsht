import React, { useState, useRef, useEffect } from "react";
import { User, LogOut, HelpCircle, ChevronDown, ShieldCheck } from "lucide-react";
import { Language } from "../i18n";

interface UserProfileDropdownProps {
  name: string;
  role: string;
  language: Language;
  onLogout: () => void;
  onEditProfile: () => void;
  onHelpCenter: () => void;
}

export default function UserProfileDropdown({ name, role, language, onLogout, onEditProfile, onHelpCenter }: UserProfileDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 cursor-pointer group"
        id="user-badge-header"
      >
        <div className="text-right hidden md:block">
          <p className="text-xs font-semibold leading-none text-slate-100">{name}</p>
          <p className="text-[10px] text-slate-500 font-mono mt-0.5 font-bold uppercase tracking-wider">{role}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-cyan-950/40 border border-cyan-800/40 flex items-center justify-center text-xs font-extrabold text-cyan-400 font-mono uppercase shadow-inner group-hover:border-cyan-500 transition-colors">
          {role.substring(0, 2)}
        </div>
        <ChevronDown className="w-3 h-3 text-slate-500" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-10 w-64 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-2 z-50">
          <div className="px-3 py-2 border-b border-slate-800 mb-2">
            <p className="text-xs font-bold text-slate-200">{name}</p>
            <p className="text-[10px] text-slate-500">{role}</p>
            <div className="mt-2 flex items-center gap-1 text-[9px] text-cyan-400 font-mono">
              <ShieldCheck className="w-3 h-3" />
              {language === "fr" ? "KYC VÉRIFIÉ" : language === "ht" ? "KYC TE VEYE" : "KYC VERIFIED"}
            </div>
          </div>
          <button onClick={onEditProfile} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-cyan-400 hover:bg-slate-800/50 rounded-lg transition-all border border-transparent hover:border-slate-700 cursor-pointer">
            <User className="w-3.5 h-3.5" />
            {language === "fr" ? "Modifier le Profil" : language === "ht" ? "Modifye Pwofil" : "Edit Profile"}
          </button>
          <button onClick={onHelpCenter} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-cyan-400 hover:bg-slate-800/50 rounded-lg transition-all border border-transparent hover:border-slate-700 cursor-pointer">
            <HelpCircle className="w-3.5 h-3.5" />
            {language === "fr" ? "Centre d'Aide" : language === "ht" ? "Sant Èd" : "Help Center"}
          </button>
          <div className="border-t border-slate-800 mt-2 pt-2">
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              {language === "fr" ? "Déconnexion" : language === "ht" ? "Dekonekte" : "Logout"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
