
import React, { useState } from "react";
import { 
  Shield, 
  Workflow, 
  Cpu, 
  Terminal, 
  AlertCircle, 
  Settings, 
  BarChart3, 
  Activity,
  LogOut,
  ChevronRight
} from "lucide-react";
import { ControlTower } from "./ControlTower";
import { WorkflowCenter } from "./WorkflowCenter";
import { AuditConsole } from "./AuditConsole";
import { JobCenter } from "./JobCenter";
import { DeadLetterCenter } from "./DeadLetterCenter";
import { useBusinessContext } from "../../contexts/BusinessContext";

type AdminView = "TOWER" | "WORKFLOW" | "JOBS" | "AUDIT" | "DLQ" | "METRICS";

export const OperationsLayout: React.FC = () => {
  const [currentView, setCurrentView] = useState<AdminView>("TOWER");
  const { business } = useBusinessContext();
  const businessId = business?.id || "demo_business";

  const menuItems = [
    { id: "TOWER", label: "Control Tower", icon: Shield },
    { id: "WORKFLOW", label: "Workflow Engine", icon: Workflow },
    { id: "JOBS", label: "Job Scheduler", icon: Cpu },
    { id: "AUDIT", label: "Audit Console", icon: Terminal },
    { id: "DLQ", label: "Dead Letters", icon: AlertCircle },
    { id: "METRICS", label: "Performance", icon: BarChart3 },
  ];

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 flex flex-col">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white italic">F</div>
          <div>
            <div className="text-sm font-bold tracking-tight text-white">FINOPS <span className="text-blue-500 text-[10px]">ERP</span></div>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Operations Center</div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id as AdminView)}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm transition-all group ${
                currentView === item.id 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <item.icon className="w-4 h-4" />
                {item.label}
              </div>
              {currentView === item.id && <ChevronRight className="w-3 h-3" />}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="bg-slate-900 rounded-lg p-3">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Health</span>
            </div>
            <div className="text-lg font-bold text-white font-mono">98.4%</div>
          </div>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 hover:text-rose-400 text-sm mt-4 transition-colors">
            <LogOut className="w-4 h-4" />
            Exit Console
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        {currentView === "TOWER" && <ControlTower />}
        {currentView === "WORKFLOW" && <WorkflowCenter businessId={businessId} />}
        {currentView === "JOBS" && <JobCenter />}
        {currentView === "AUDIT" && <AuditConsole businessId={businessId} />}
        {currentView === "DLQ" && <DeadLetterCenter businessId={businessId} />}
        {currentView === "METRICS" && (
          <div className="p-20 text-center text-slate-500 italic">Performance metrics visualization under development...</div>
        )}
      </main>
    </div>
  );
};

export default OperationsLayout;
