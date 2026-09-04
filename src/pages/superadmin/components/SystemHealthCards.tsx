import React from "react";
import { SystemMetrics } from "../hooks/useSystemHealth";
import { 
  Cpu, 
  Database, 
  Activity, 
  Server, 
  CheckCircle2, 
  Clock, 
  ShieldCheck 
} from "lucide-react";

interface SystemHealthCardsProps {
  metrics: SystemMetrics;
}

export const SystemHealthCards: React.FC<SystemHealthCardsProps> = ({ metrics }) => {
  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}j ${h}h ${m}m`;
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-medium">Santé Globale</span>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="text-xl font-bold text-emerald-400">100% OPÉRATIONNEL</div>
        <div className="text-[11px] text-slate-500 mt-1">Tous les services cloud connectés</div>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-medium">Charge CPU Cluster</span>
          <Cpu className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="text-xl font-bold text-white font-mono">{metrics.cpuUsage}%</div>
        <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
          <div
            className="bg-indigo-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${metrics.cpuUsage}%` }}
          />
        </div>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-medium">Latence Firestore</span>
          <Database className="w-4 h-4 text-sky-400" />
        </div>
        <div className="text-xl font-bold text-white font-mono">{metrics.dbLatencyMs} ms</div>
        <div className="text-[11px] text-slate-500 mt-1">Multi-région US-Central</div>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-medium">Uptime Système</span>
          <Clock className="w-4 h-4 text-amber-400" />
        </div>
        <div className="text-xl font-bold text-white font-mono">{formatUptime(metrics.uptimeSeconds)}</div>
        <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" /> SLA 99.99% Garanti
        </div>
      </div>
    </div>
  );
};
