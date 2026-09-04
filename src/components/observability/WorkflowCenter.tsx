import React, { useState } from "react";
import { useObservability } from "../../contexts/ObservabilityContext";
import { Workflow, RefreshCw, AlertOctagon, CheckCircle, Clock, Play } from "lucide-react";
import { finopsEventOrchestrator } from "../../services/finopsEventOrchestrator";

export function WorkflowCenter() {
  const { snapshot, isScanning, triggerScan } = useObservability();
  const [testResultMsg, setTestResultMsg] = useState<string | null>(null);

  if (!snapshot) {
    return (
      <div className="p-8 text-center text-slate-400 font-mono text-xs">
        Chargement de la console Workflow Operations Center...
      </div>
    );
  }

  const { workflow } = snapshot;

  const handleTestCircuitBreaker = () => {
    finopsEventOrchestrator.resetCircuitBreaker();
    setTestResultMsg("Circuit Breaker réinitialisé à l'état [CLOSED] avec succès.");
    setTimeout(() => setTestResultMsg(null), 4000);
    triggerScan();
  };

  return (
    <div className="space-y-6 animate-fade-in font-mono text-xs">
      {/* Header Banner */}
      <div className="bg-slate-950 p-6 rounded-2xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-sans font-bold text-slate-100 uppercase tracking-tight flex items-center gap-2">
            <Workflow className="w-5 h-5 text-indigo-400 animate-pulse" />
            Workflow Operations & Orchestration Reliability Center
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Orchestration asynchrone des événements (paie, pointage), files de retentative, et états du Disjoncteur (Circuit Breaker).
          </p>
        </div>
        <button
          onClick={() => triggerScan()}
          disabled={isScanning}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-sans text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isScanning ? "animate-spin" : ""}`} />
          <span>Scanner Workflows</span>
        </button>
      </div>

      {testResultMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 font-bold text-xs">
          {testResultMsg}
        </div>
      )}

      {/* Primary Telemetry Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-1">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Jobs en Attente (Queue)</span>
          <strong className="text-2xl font-sans font-bold text-indigo-400">{workflow.pendingJobsCount} tches</strong>
          <span className="text-[9px] text-slate-500 block">Queue Firestore Fiable</span>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-1">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Jobs en Cours Execution</span>
          <strong className="text-2xl font-sans font-bold text-cyan-400">{workflow.processingJobsCount} tches</strong>
          <span className="text-[9px] text-slate-500 block">Asynchrone Parallèle</span>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-1">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Circuit Breaker Status</span>
          <strong className={`text-2xl font-sans font-bold ${workflow.circuitBreakerState === "CLOSED" ? "text-emerald-400" : "text-rose-500"}`}>
            {workflow.circuitBreakerState}
          </strong>
          <span className="text-[9px] text-slate-500 block">State Machine Active</span>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-1">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Santé des Workers</span>
          <strong className="text-2xl font-sans font-bold text-emerald-400">{workflow.workerHealthPct}%</strong>
          <span className="text-[9px] text-slate-500 block">0% Perte d'Événements</span>
        </div>
      </div>

      {/* Action Controls */}
      <div className="bg-slate-950 p-5 rounded-2xl border border-white/5 flex items-center justify-between gap-4">
        <div>
          <strong className="text-slate-100 font-sans text-xs block">Contrôle de Réinitialisation du Circuit Breaker</strong>
          <p className="text-[11px] text-slate-400">Si des échecs d'API amont ont basculé le disjoncteur à OPEN, réinitialisez-le manuellement une fois la connexion rétablie.</p>
        </div>
        <button
          onClick={handleTestCircuitBreaker}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-emerald-500/30 rounded-xl font-bold transition cursor-pointer shrink-0"
        >
          Réinitialiser Circuit Breaker
        </button>
      </div>
    </div>
  );
}
