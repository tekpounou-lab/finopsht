import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { normalizeTab } from "../hooks/useNavigation";

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  roles: string[];
}

export interface NavCategory {
  id: string;
  label: string;
  items: NavItem[];
}

interface SidebarCategoryProps {
  category: NavCategory;
  isExpanded: boolean;
  onToggleCategory: (categoryId: string) => void;
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  onCloseMobile: () => void;
  isSidebarCollapsed: boolean;
}

export const SidebarCategory: React.FC<SidebarCategoryProps> = ({
  category,
  isExpanded,
  onToggleCategory,
  activeTab,
  onSelectTab,
  onCloseMobile,
  isSidebarCollapsed,
}) => {
  const normalizedActive = normalizeTab(activeTab);

  // Check if any item in this category is currently active
  const hasActiveChild = category.items.some(
    (item) => normalizeTab(item.id) === normalizedActive
  );

  // If sidebar is globally collapsed into icons-only mode
  if (isSidebarCollapsed) {
    return (
      <div className="py-2 border-b border-slate-900/80 last:border-0 space-y-1.5">
        {/* Category Tooltip Header in Collapsed Mode */}
        <div 
          className="text-[9px] font-bold text-slate-500 uppercase tracking-widest text-center py-1 cursor-default select-none"
          title={category.label}
        >
          <span className="w-4 h-0.5 bg-slate-800 rounded-full mx-auto block" />
        </div>

        {/* Category Nav Icons */}
        <div className="flex flex-col items-center space-y-1">
          {category.items.map((item) => {
            const Icon = item.icon;
            const isItemActive = normalizedActive === normalizeTab(item.id);

            return (
              <div key={item.id} className="relative group flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => {
                    onSelectTab(item.id);
                    onCloseMobile();
                  }}
                  title={`${category.label} • ${item.label}`}
                  aria-label={item.label}
                  className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                    isItemActive
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 ring-1 ring-indigo-400/50"
                      : "text-slate-400 hover:text-slate-100 hover:bg-slate-900"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isItemActive ? "text-white" : "text-slate-400 group-hover:text-slate-200"}`} />

                  {/* Badge Floating Dot or Count */}
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[9px] font-extrabold rounded-full bg-amber-500 text-slate-950 shadow-xs border border-slate-950 animate-pulse">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </button>

                {/* Floating Tooltip Panel for Hover */}
                <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-900 text-slate-100 text-xs rounded-xl shadow-2xl border border-slate-800 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 z-50 flex items-center gap-2">
                  <span className="font-semibold">{item.label}</span>
                  <span className="text-[10px] text-indigo-400 bg-indigo-950/80 px-1.5 py-0.5 rounded-md border border-indigo-800/40">
                    {category.label}
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {item.badge}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Expanded Sidebar Mode (Default Full Sidebar)
  return (
    <div className="space-y-1 my-1">
      {/* Category Header Toggle Button */}
      <button
        type="button"
        onClick={() => onToggleCategory(category.id)}
        aria-expanded={isExpanded}
        className={`w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer select-none ${
          hasActiveChild ? "text-indigo-400 bg-indigo-950/30" : "text-slate-400 hover:text-slate-300 hover:bg-slate-900/50"
        }`}
      >
        <div className="flex items-center gap-1.5 truncate">
          <span className="truncate">{category.label}</span>
          <span className="text-[10px] font-mono text-slate-400 font-normal">
            ({category.items.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          {hasActiveChild && (
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          )}
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          )}
        </div>
      </button>

      {/* Category Child Items */}
      {isExpanded && (
        <div className="space-y-0.5 pl-1.5 border-l-2 border-slate-800/60 ml-2.5 transition-all duration-200">
          {category.items.map((item) => {
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
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  isItemActive
                    ? "bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-900/30"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-900/80"
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isItemActive ? "text-white" : "text-slate-400 group-hover:text-slate-200"
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>

                {item.badge !== undefined && item.badge > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
