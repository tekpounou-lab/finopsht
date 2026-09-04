
import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { 
  Activity, 
  Shield, 
  Cpu, 
  Workflow, 
  Bell, 
  Database, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  Terminal,
  Zap
} from "lucide-react";
import { AdminRepository } from "../../modules/admin/AdminRepository";
import { ModuleHealth, EnterpriseIncident } from "../../modules/admin/types";
import { RuntimeEngine } from "../../modules/runtime/RuntimeEngine";

export const ControlTower: React.FC = () => {
  const [healthData, setHealthData] = useState<ModuleHealth[]>([]);
  const [incidents, setIncidents] = useState<EnterpriseIncident[]>([]);
  const [runtimeState, setRuntimeState] = useState(RuntimeEngine.getState());

  useEffect(() => {
    const unsubHealth = AdminRepository.subscribeToHealth(setHealthData);
    // In a real app, we'd also subscribe to incidents
    return () => unsubHealth();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "GREEN": return "text-emerald-400";
      case "YELLOW": return "text-amber-400";
      case "RED": return "text-rose-400";
      default: return "text-slate-400";
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case "GREEN": return "bg-emerald-500/10 border-emerald-500/20";
      case "YELLOW": return "bg-amber-500/10 border-amber-500/20";
      case "RED": return "bg-rose-500/10 border-rose-500/20";
      default: return "bg-slate-500/10 border-slate-500/20";
    }
  };

  return (
    <div className="p-4 sm:p-8 bg-slate-950 min-h-screen text-slate-200 font-sans">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Shield className="text-blue-500 w-6 h-6 sm:w-8 sm:h-8" />
            Enterprise Operations Center
            <span className="text-[10px] sm:text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded font-mono uppercase tracking-widest">v1.0.0</span>
          </h1>
          <p className="text-slate-400 mt-1 text-sm sm:text-base">Technical Runtime & Workflow Administration</p>
        </div>
        <div className="flex flex-wrap gap-4 w-full sm:w-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 flex items-center gap-3 flex-1 sm:flex-initial">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs sm:text-sm font-mono text-slate-300">RUNTIME: {runtimeState.status}</span>
          </div>
          <button className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 flex-1 sm:flex-initial justify-center">
            <Zap className="w-4 h-4" />
            Force Sync
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Core Stats */}
        {[
          { label: "Active Workflows", value: "12", icon: Workflow, color: "text-blue-400" },
          { label: "Queued Jobs", value: "45", icon: Cpu, color: "text-purple-400" },
          { label: "Event Rate", value: "124/s", icon: Activity, color: "text-emerald-400" },
          { label: "DLQ Items", value: "0", icon: Bell, color: "text-rose-400" },
        ].map((stat, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-slate-900 border border-slate-800 p-5 rounded-xl"
          >
            <div className="flex justify-between items-start mb-4">
              <stat.icon className={`${stat.color} w-5 h-5`} />
              <span className="text-xs text-slate-500 font-mono tracking-tighter uppercase">Snapshot: LIVE</span>
            </div>
            <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
            <div className="text-sm text-slate-400">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Health Center */}
        <div className="lg:col-span-2">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h2 className="font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                System Health Monitor
              </h2>
              <span className="text-xs text-slate-500">Aggregating 12 Core Modules</span>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {healthData.length === 0 ? (
                <div className="col-span-2 py-12 text-center text-slate-500 italic">
                  Initial health telemetry expected in 60s...
                </div>
              ) : (
                healthData.map((h, i) => (
                  <div key={i} className={`p-4 border rounded-lg ${getStatusBg(h.status)} flex items-center justify-between`}>
                    <div>
                      <div className="text-sm font-semibold text-white">{h.name}</div>
                      <div className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" />
                        {new Date(h.lastUpdate).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className={`flex items-center gap-2 font-mono text-xs font-bold ${getStatusColor(h.status)}`}>
                      {h.status === "GREEN" && <CheckCircle className="w-4 h-4" />}
                      {h.status === "YELLOW" && <AlertCircle className="w-4 h-4" />}
                      {h.status}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-8 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="p-5 border-b border-slate-800 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-blue-400" />
              <h2 className="font-semibold">Recent Event Timeline</h2>
            </div>
            <div className="p-5 h-64 overflow-y-auto space-y-3 font-mono text-xs text-slate-400">
              <div className="flex gap-4 border-l-2 border-emerald-500/30 pl-4 py-1">
                <span className="text-slate-500">20:01:04</span>
                <span className="text-emerald-400">[EVENT_BUS]</span>
                <span>ModuleLoaded: MONITORING v1.0.0</span>
              </div>
              <div className="flex gap-4 border-l-2 border-blue-500/30 pl-4 py-1">
                <span className="text-slate-500">20:00:58</span>
                <span className="text-blue-400">[RUNTIME]</span>
                <span>Transition: READY -&gt; RUNNING</span>
              </div>
              <div className="flex gap-4 border-l-2 border-emerald-500/30 pl-4 py-1">
                <span className="text-slate-500">20:00:57</span>
                <span className="text-emerald-400">[EVENT_BUS]</span>
                <span>RuntimeStarted (correlationId: system_boot)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Incidents & Alerts */}
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center">
              <h2 className="font-semibold text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Active Incidents
              </h2>
              <span className="text-xs bg-rose-500 text-white px-2 py-0.5 rounded-full font-bold">0</span>
            </div>
            <div className="p-8 text-center">
              <CheckCircle className="w-12 h-12 text-emerald-500/20 mx-auto mb-4" />
              <p className="text-slate-400 text-sm italic">All technical systems operational</p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-400" />
              Infrastructure Metrics
            </h3>
            <div className="space-y-4">
              {[
                { label: "Firestore Connections", value: "Active (WebSocket)", status: "text-emerald-400" },
                { label: "Sync Latency", value: "42ms", status: "text-emerald-400" },
                { label: "Memory Heap", value: "124MB", status: "text-emerald-400" },
                { label: "Cold Start Time", value: "1.2s", status: "text-blue-400" },
              ].map((m, i) => (
                <div key={i} className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">{m.label}</span>
                  <span className={`font-mono font-bold ${m.status}`}>{m.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
