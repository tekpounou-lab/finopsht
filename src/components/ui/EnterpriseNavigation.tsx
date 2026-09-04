import React, { useState } from "react";
import { ChevronRight, Home, Star, Clock, Zap } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

export const Breadcrumbs: React.FC<{ items: BreadcrumbItem[] }> = ({ items }) => (
  <nav className="flex items-center gap-1.5 text-xs text-slate-400 flex-wrap">
    <span className="hover:text-slate-200 cursor-pointer transition">
      <Home className="w-3.5 h-3.5" />
    </span>
    {items.map((item, idx) => (
      <React.Fragment key={idx}>
        <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
        {item.onClick ? (
          <button
            type="button"
            onClick={item.onClick}
            className="hover:text-slate-200 transition cursor-pointer"
          >
            {item.label}
          </button>
        ) : (
          <span className="font-semibold text-slate-200">{item.label}</span>
        )}
      </React.Fragment>
    ))}
  </nav>
);

export interface TabItem {
  id: string;
  label: React.ReactNode;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export const Tabs: React.FC<{
  tabs: TabItem[];
  activeTabId: string;
  onChange: (id: string) => void;
  variant?: "pills" | "line" | "cards";
  className?: string;
}> = ({ tabs, activeTabId, onChange, variant = "pills", className = "" }) => {
  if (variant === "line") {
    return (
      <div className={`border-b border-slate-800 flex items-center gap-4 overflow-x-auto ${className}`}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              type="button"
              disabled={tab.disabled}
              onClick={() => onChange(tab.id)}
              className={`pb-2.5 px-1 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer whitespace-nowrap ${
                isActive
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              } ${tab.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`p-1 bg-slate-950/80 border border-slate-800 rounded-2xl flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            type="button"
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              isActive
                ? "bg-slate-800 text-slate-100 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
            } ${tab.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
};

export const VerticalTabs: React.FC<{
  tabs: TabItem[];
  activeTabId: string;
  onChange: (id: string) => void;
}> = ({ tabs, activeTabId, onChange }) => (
  <div className="flex flex-col gap-1 w-full">
    {tabs.map((tab) => {
      const isActive = tab.id === activeTabId;
      return (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`w-full px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
            isActive
              ? "bg-blue-600 text-white shadow-md"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {tab.icon}
            <span>{tab.label}</span>
          </div>
          {tab.badge}
        </button>
      );
    })}
  </div>
);

export const SidebarMenu = VerticalTabs;
export const TopNavigation = Tabs;
export const MegaMenu = () => null;
export const CommandPalette = () => null;

export const QuickActions: React.FC<{
  actions: { label: string; onClick: () => void; icon?: React.ReactNode }[];
}> = ({ actions }) => (
  <div className="flex items-center gap-2 flex-wrap">
    {actions.map((act, idx) => (
      <button
        key={idx}
        type="button"
        onClick={act.onClick}
        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700/80 flex items-center gap-1.5 cursor-pointer transition"
      >
        {act.icon || <Zap className="w-3.5 h-3.5 text-amber-400" />}
        <span>{act.label}</span>
      </button>
    ))}
  </div>
);

export const RecentItems: React.FC<{
  items: { label: string; onClick: () => void }[];
}> = ({ items }) => (
  <div className="space-y-1">
    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-2 flex items-center gap-1">
      <Clock className="w-3 h-3" /> Récent
    </div>
    {items.map((item, idx) => (
      <button
        key={idx}
        type="button"
        onClick={item.onClick}
        className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-slate-300 hover:text-slate-100 hover:bg-slate-800 transition truncate cursor-pointer"
      >
        {item.label}
      </button>
    ))}
  </div>
);

export const FavoritesMenu: React.FC<{
  items: { label: string; onClick: () => void }[];
}> = ({ items }) => (
  <div className="space-y-1">
    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-2 flex items-center gap-1">
      <Star className="w-3 h-3 text-amber-400" /> Favoris
    </div>
    {items.map((item, idx) => (
      <button
        key={idx}
        type="button"
        onClick={item.onClick}
        className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-slate-300 hover:text-slate-100 hover:bg-slate-800 transition truncate cursor-pointer"
      >
        {item.label}
      </button>
    ))}
  </div>
);
