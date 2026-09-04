import React from "react";
import { useTheme } from "../contexts/ThemeContext";
import { Sun, Moon, Monitor } from "lucide-react";

export function ThemeSegmentedControl({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className={`p-0.5 bg-slate-900 border border-slate-800 rounded-lg flex items-center w-fit ${className}`} id="theme-segmented-ctrl">
      <button
        onClick={() => setTheme("light")}
        aria-label="Mode Clair"
        title="Mode Clair"
        className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
          theme === "light"
            ? "bg-cyan-600 text-slate-950 shadow-sm"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
        <Sun className="w-3.5 h-3.5" />
        <span>Clair</span>
      </button>
      
      <button
        onClick={() => setTheme("dark")}
        aria-label="Mode Sombre"
        title="Mode Sombre"
        className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
          theme === "dark"
            ? "bg-cyan-600 text-slate-950 shadow-sm"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
        <Moon className="w-3.5 h-3.5" />
        <span>Sombre</span>
      </button>

      <button
        onClick={() => setTheme("system")}
        aria-label="Thème Système"
        title="Thème Système"
        className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
          theme === "system"
            ? "bg-cyan-600 text-slate-950 shadow-sm"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
        <Monitor className="w-3.5 h-3.5" />
        <span>Système</span>
      </button>
    </div>
  );
}

export function ThemeDropdownToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const handleToggle = () => {
    const nextTheme = resolvedTheme === "light" ? "dark" : "light";
    setTheme(nextTheme);
  };

  return (
    <div className="relative inline-block" id="theme-dropdown-toggle-wrapper">
      <button
        type="button"
        onClick={handleToggle}
        aria-label={resolvedTheme === "light" ? "Activer le mode sombre" : "Activer le mode clair"}
        title={resolvedTheme === "light" ? "Mode Sombre" : "Mode Clair"}
        className="flex items-center justify-center p-2 rounded-lg border border-slate-800 bg-slate-900/45 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-all cursor-pointer h-8 w-8 shadow-sm group"
        id="theme-quick-toggle"
      >
        {resolvedTheme === "light" ? (
          <Sun className="w-4 h-4 text-amber-500 transition-transform group-hover:rotate-45 duration-300" />
        ) : (
          <Moon className="w-4 h-4 text-cyan-400 transition-transform group-hover:-rotate-12 duration-300" />
        )}
      </button>
    </div>
  );
}
