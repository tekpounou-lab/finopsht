import React from "react";
import { Menu } from "lucide-react";

interface BottomNavProps {
  allowedTabs: any[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onMenuToggle: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  allowedTabs,
  activeTab,
  setActiveTab,
  onMenuToggle
}) => {
  // Take top 4 tabs for bottom navigation
  const primaryTabs = allowedTabs.slice(0, 4);

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-[60] bg-slate-950/95 border-t border-slate-800/80 backdrop-blur-md pb-safe">
      <div className="flex items-center justify-around px-2 py-2">
        {primaryTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center p-2 rounded-xl min-w-[64px] min-h-[48px] ${
                isActive ? "text-cyan-400" : "text-slate-400 hover:text-slate-200"
              } transition-colors`}
            >
              {Icon && <Icon className="w-5 h-5 mb-1" />}
              <span className="text-[10px] font-medium leading-none truncate max-w-[64px] text-center">
                {tab.label}
              </span>
            </button>
          );
        })}
        <button
          onClick={onMenuToggle}
          className="flex flex-col items-center justify-center p-2 rounded-xl text-slate-400 hover:text-slate-200 min-w-[64px] min-h-[48px] transition-colors"
        >
          <Menu className="w-5 h-5 mb-1" />
          <span className="text-[10px] font-medium leading-none">Menu</span>
        </button>
      </div>
    </div>
  );
};
