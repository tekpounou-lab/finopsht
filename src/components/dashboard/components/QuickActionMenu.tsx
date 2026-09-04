import React from "react";
import { QuickActionItem } from "../hooks/useQuickActions";
import { Search, X, ArrowRight, Sparkles, Command } from "lucide-react";

interface QuickActionMenuProps {
  isOpen: boolean;
  onClose: () => void;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  actions: QuickActionItem[];
  onExecute: (item: QuickActionItem) => void;
}

export const QuickActionMenu: React.FC<QuickActionMenuProps> = ({
  isOpen,
  onClose,
  searchQuery,
  onSearchChange,
  actions,
  onExecute,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden space-y-2">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
          <Search className="w-5 h-5 text-indigo-400" />
          <input
            autoFocus
            type="text"
            placeholder="Tapez une commande ou recherchez un module..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {actions.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Aucune action correspondante.
            </div>
          ) : (
            actions.map((act) => (
              <button
                key={act.id}
                type="button"
                onClick={() => onExecute(act)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-800/80 text-left transition-colors group"
              >
                <span className="text-xs font-medium text-slate-200 group-hover:text-white">
                  {act.title}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
