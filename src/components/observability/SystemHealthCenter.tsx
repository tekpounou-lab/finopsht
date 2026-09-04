import React from "react";
import { useObservability, ObservabilityTab } from "../../contexts/ObservabilityContext";
import { 
  Activity, 
  Cpu, 
  Database, 
  Bot, 
  Workflow, 
  ShieldCheck, 
  ShieldAlert, 
  Terminal, 
  Lightbulb, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Zap,
  LayoutDashboard
} from "lucide-react";

import { RuntimePerformanceCenter } from "./RuntimePerformanceCenter";
import { FirestoreObservatory } from "./FirestoreObservatory";
import { AiOperationsCenter } from "./AiOperationsCenter";
import { WorkflowCenter } from "./WorkflowCenter";
import { FinancialIntegrityCenter } from "./FinancialIntegrityCenter";
import { SecurityOperationsCenter } from "./SecurityOperationsCenter";
import { DevOpsDashboard } from "./DevOpsDashboard";
import { RecommendationConsole } from "./RecommendationConsole";
import { OutboxMetricsDashboard } from "./OutboxMetricsDashboard";

export function SystemHealthCenter() {
  const { 
    snapshot, 
    scores, 
    alerts, 
    recommendations, 
    activeCenterTab, 
    setActiveCenterTab, 
    triggerScan, 
    isScanning,
    updateAlertStatus
  } = useObservability();

  if (!snapshot || !scores) {
    return (
      <div className="p-12 text-center text-slate-400 font-mono text-xs flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
        <span>Initialisation de la télémétrie de la plateforme d'Observabilité Enterprise...</span>
      </div>
    );
  }

  const activeAlertsCount = alerts.filter(a => a.status === "ACTIVE").length;

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Executive Header Banner */}
      <div className="bg-slate-950 p-6 rounded-2xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-indigo-400 animate-pulse" />
            <h1 className="text-lg font-sans font-extrabold text-slate-100 uppercase tracking-tight">
              System Health Center & Enterprise Observability Platform
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
              GRADE {scores.grade} ({scores.overall}/100)
            </span>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl font-mono leading-relaxed">
            Plateforme d'auto-surveillance en temps réel : profiling React, métriques Firestore, consommation IA Gemini, disjoncteur workflows, intégrité comptable et SOC.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 relative z-10">
          <button
            onClick={() => triggerScan()}
            disabled={isScanning}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-sans text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer shadow-lg shadow-indigo-600/20"
          >
            <RefreshCw className={`w-4 h-4 ${isScanning ? "animate-spin" : ""}`} />
            <span>Balayage Télémétrique Live</span>
          </button>
        </div>
      </div>

      {/* Center Navigation Subtabs */}
      <div className="flex bg-slate-950 p-1.5 border border-white/5 rounded-2xl text-xs font-mono overflow-x-auto gap-1">
        <button
          onClick={() => setActiveCenterTab("overview")}
          className={`px-3.5 py-2 rounded-xl transition flex items-center gap-2 shrink-0 cursor-pointer ${
            activeCenterTab === "overview" ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Vue d'Ensemble Exec</span>
        </button>

        <button
          onClick={() => setActiveCenterTab("runtime")}
          className={`px-3.5 py-2 rounded-xl transition flex items-center gap-2 shrink-0 cursor-pointer ${
            activeCenterTab === "runtime" ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <Cpu className="w-4 h-4 text-indigo-400" />
          <span>Runtime ({scores.runtime})</span>
        </button>

        <button
          onClick={() => setActiveCenterTab("firestore")}
          className={`px-3.5 py-2 rounded-xl transition flex items-center gap-2 shrink-0 cursor-pointer ${
            activeCenterTab === "firestore" ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <Database className="w-4 h-4 text-emerald-400" />
          <span>Firestore ({scores.firestore})</span>
        </button>

        <button
          onClick={() => setActiveCenterTab("ai")}
          className={`px-3.5 py-2 rounded-xl transition flex items-center gap-2 shrink-0 cursor-pointer ${
            activeCenterTab === "ai" ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <Bot className="w-4 h-4 text-cyan-400" />
          <span>AI Ops ({scores.ai})</span>
        </button>

        <button
          onClick={() => setActiveCenterTab("workflow")}
          className={`px-3.5 py-2 rounded-xl transition flex items-center gap-2 shrink-0 cursor-pointer ${
            activeCenterTab === "workflow" ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <Workflow className="w-4 h-4 text-purple-400" />
          <span>Workflow ({scores.workflow})</span>
        </button>

        <button
          onClick={() => setActiveCenterTab("financial")}
          className={`px-3.5 py-2 rounded-xl transition flex items-center gap-2 shrink-0 cursor-pointer ${
            activeCenterTab === "financial" ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Finances ({scores.financial})</span>
        </button>

        <button
          onClick={() => setActiveCenterTab("security")}
          className={`px-3.5 py-2 rounded-xl transition flex items-center gap-2 shrink-0 cursor-pointer ${
            activeCenterTab === "security" ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-rose-400" />
          <span>SOC ({scores.security})</span>
        </button>

        <button
          onClick={() => setActiveCenterTab("devops")}
          className={`px-3.5 py-2 rounded-xl transition flex items-center gap-2 shrink-0 cursor-pointer ${
            activeCenterTab === "devops" ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <Terminal className="w-4 h-4 text-amber-400" />
          <span>DevOps ({scores.devops})</span>
        </button>

        <button
          onClick={() => setActiveCenterTab("outbox")}
          className={`px-3.5 py-2 rounded-xl transition flex items-center gap-2 shrink-0 cursor-pointer ${
            activeCenterTab === "outbox" ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <Activity className="w-4 h-4 text-cyan-400" />
          <span>Outbox Metrics ({snapshot.outbox?.score ?? 100})</span>
        </button>

        <button
          onClick={() => setActiveCenterTab("recommendations")}
          className={`px-3.5 py-2 rounded-xl transition flex items-center gap-2 shrink-0 cursor-pointer ${
            activeCenterTab === "recommendations" ? "bg-amber-600 text-white font-bold" : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <Lightbulb className="w-4 h-4 text-amber-300" />
          <span>Recommandations ({recommendations.length})</span>
        </button>
      </div>

      {/* Active Tab View Router */}
      {activeCenterTab === "runtime" && <RuntimePerformanceCenter />}
      {activeCenterTab === "firestore" && <FirestoreObservatory />}
      {activeCenterTab === "ai" && <AiOperationsCenter />}
      {activeCenterTab === "workflow" && <WorkflowCenter />}
      {activeCenterTab === "financial" && <FinancialIntegrityCenter />}
      {activeCenterTab === "security" && <SecurityOperationsCenter />}
      {activeCenterTab === "devops" && <DevOpsDashboard />}
      {activeCenterTab === "outbox" && <OutboxMetricsDashboard />}
      {activeCenterTab === "recommendations" && <RecommendationConsole />}

      {/* Default Overview Dashboard View */}
      {activeCenterTab === "overview" && (
        <div className="space-y-6">
          {/* Executive Overview Domain Scores Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <div 
              onClick={() => setActiveCenterTab("runtime")} 
              className="bg-slate-950 p-4 rounded-xl border border-white/5 space-y-1 hover:border-indigo-500/30 transition cursor-pointer"
            >
              <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold">Runtime</span>
              <strong className="text-xl font-sans font-bold text-indigo-400">{scores.runtime}/100</strong>
              <span className="text-[8px] text-slate-500 block">Render & RAM</span>
            </div>

            <div 
              onClick={() => setActiveCenterTab("firestore")} 
              className="bg-slate-950 p-4 rounded-xl border border-white/5 space-y-1 hover:border-emerald-500/30 transition cursor-pointer"
            >
              <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold">Firestore</span>
              <strong className="text-xl font-sans font-bold text-emerald-400">{scores.firestore}/100</strong>
              <span className="text-[8px] text-slate-500 block">Streams & Reads</span>
            </div>

            <div 
              onClick={() => setActiveCenterTab("ai")} 
              className="bg-slate-950 p-4 rounded-xl border border-white/5 space-y-1 hover:border-cyan-500/30 transition cursor-pointer"
            >
              <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold">AI Ops</span>
              <strong className="text-xl font-sans font-bold text-cyan-400">{scores.ai}/100</strong>
              <span className="text-[8px] text-slate-500 block">Tokens & Quota</span>
            </div>

            <div 
              onClick={() => setActiveCenterTab("workflow")} 
              className="bg-slate-950 p-4 rounded-xl border border-white/5 space-y-1 hover:border-purple-500/30 transition cursor-pointer"
            >
              <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold">Workflow</span>
              <strong className="text-xl font-sans font-bold text-purple-400">{scores.workflow}/100</strong>
              <span className="text-[8px] text-slate-500 block">Queue & Breaker</span>
            </div>

            <div 
              onClick={() => setActiveCenterTab("financial")} 
              className="bg-slate-950 p-4 rounded-xl border border-white/5 space-y-1 hover:border-emerald-500/30 transition cursor-pointer"
            >
              <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold">Financial</span>
              <strong className="text-xl font-sans font-bold text-emerald-400">{scores.financial}/100</strong>
              <span className="text-[8px] text-slate-500 block">Ledger & Invariants</span>
            </div>

            <div 
              onClick={() => setActiveCenterTab("security")} 
              className="bg-slate-950 p-4 rounded-xl border border-white/5 space-y-1 hover:border-rose-500/30 transition cursor-pointer"
            >
              <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold">SOC Security</span>
              <strong className="text-xl font-sans font-bold text-rose-400">{scores.security}/100</strong>
              <span className="text-[8px] text-slate-500 block">RBAC & Tenants</span>
            </div>

            <div 
              onClick={() => setActiveCenterTab("devops")} 
              className="bg-slate-950 p-4 rounded-xl border border-white/5 space-y-1 hover:border-amber-500/30 transition cursor-pointer"
            >
              <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold">DevOps</span>
              <strong className="text-xl font-sans font-bold text-amber-400">{scores.devops}/100</strong>
              <span className="text-[8px] text-slate-500 block">Bundle & Modularity</span>
            </div>

            <div 
              onClick={() => setActiveCenterTab("outbox")} 
              className="bg-slate-950 p-4 rounded-xl border border-white/5 space-y-1 hover:border-cyan-500/30 transition cursor-pointer"
            >
              <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold">Outbox Queue</span>
              <strong className="text-xl font-sans font-bold text-cyan-400">{(snapshot.outbox?.score ?? 100)}/100</strong>
              <span className="text-[8px] text-slate-500 block">Latency & Dups</span>
            </div>
          </div>

          {/* Realtime Active Alerts Feed */}
          <div className="bg-slate-950 p-6 rounded-2xl border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-slate-200 font-sans flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Alertes Actives du Système ({activeAlertsCount})
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Détection Automatique</span>
            </div>

            {alerts.length === 0 ? (
              <div className="p-6 bg-slate-900/40 rounded-xl border border-white/5 text-center text-slate-400 font-mono text-xs flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Aucune alerte active — Tous les composants fonctionnent dans les seuils normaux.</span>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map(alert => (
                  <div 
                    key={alert.id} 
                    className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      alert.severity === "CRITICAL" ? "bg-rose-500/10 border-rose-500/30" :
                      alert.severity === "HIGH" ? "bg-amber-500/10 border-amber-500/30" :
                      "bg-slate-900 border-white/5"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-sans uppercase ${
                          alert.severity === "CRITICAL" ? "bg-rose-500 text-white" :
                          alert.severity === "HIGH" ? "bg-amber-500 text-slate-950" :
                          "bg-indigo-500 text-white"
                        }`}>
                          {alert.severity}
                        </span>
                        <strong className="text-slate-100 font-sans text-xs">{alert.title}</strong>
                      </div>
                      <p className="text-slate-300 text-xs leading-relaxed">{alert.description}</p>
                      {alert.recommendedAction && (
                        <p className="text-indigo-300 text-[11px]">
                          <strong>Action conseillée :</strong> {alert.recommendedAction}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {alert.status === "ACTIVE" && (
                        <button
                          onClick={() => updateAlertStatus(alert.id, "RESOLVED")}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-emerald-500/30 rounded-lg text-[10px] font-bold font-sans transition cursor-pointer"
                        >
                          Marquer Résolu
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
