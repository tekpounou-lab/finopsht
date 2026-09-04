import React from "react";
import { useObservability } from "../../contexts/ObservabilityContext";
import { Database, Activity, RefreshCw, Zap, DollarSign, Layers } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { realtimeManager } from "../../services/firestore/realtimeManager";
import { SafeChartContainer } from "../ui/SafeChartContainer";

export function FirestoreObservatory() {
  const { snapshot, isScanning, triggerScan, historicalSnapshots, checkOrchestratorHealth } = useObservability();
  const [orchHealth, setOrchHealth] = React.useState<{ available: boolean; latency: number; lastCheck: string } | null>(null);
  const [checkingOrch, setCheckingOrch] = React.useState(false);

  const verifyOrchestrator = React.useCallback(async () => {
    setCheckingOrch(true);
    const health = await checkOrchestratorHealth();
    setOrchHealth(health);
    setCheckingOrch(false);
  }, [checkOrchestratorHealth]);

  React.useEffect(() => {
    verifyOrchestrator();
  }, [verifyOrchestrator]);

  if (!snapshot) {
    return (
      <div className="p-8 text-center text-slate-400 font-mono text-xs">
        Chargement de la télémétrie Firestore Observatory...
      </div>
    );
  }

  const { firestore } = snapshot;
  const rtStats = realtimeManager.getStats();

  const chartData = historicalSnapshots.map((s, idx) => ({
    time: new Date(s.timestamp).toLocaleTimeString("fr-FR", { minute: "2-digit", second: "2-digit" }),
    reads: s.firestore.readsPerMin,
    writes: s.firestore.writesPerMin,
    latency: s.firestore.avgQueryLatencyMs
  }));

  return (
    <div className="space-y-6 animate-fade-in font-mono text-xs">
      {/* Header Banner */}
      <div className="bg-slate-950 p-6 rounded-2xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-sans font-bold text-slate-100 uppercase tracking-tight flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-400 animate-pulse" />
            Firestore Observatory & Realtime Stream Pool
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Surveillance des flux Firestore (Reads/Writes), temps de latence des requêtes, déduplication et attribution des coûts.
          </p>
        </div>
        <button
          onClick={() => triggerScan()}
          disabled={isScanning}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-sans text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isScanning ? "animate-spin" : ""}`} />
          <span>Scanner Firestore</span>
        </button>
      </div>

      {/* Primary Telemetry Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-1">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Lectures / Minute</span>
          <strong className="text-2xl font-sans font-bold text-emerald-400">{firestore.readsPerMin} R/min</strong>
          <span className="text-[9px] text-slate-500 block">Optimisé par Cache</span>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-1">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Écritures / Minute</span>
          <strong className="text-2xl font-sans font-bold text-indigo-400">{firestore.writesPerMin} W/min</strong>
          <span className="text-[9px] text-slate-500 block">Batched Writes (250ms)</span>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-1">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Listeners Realtime Actifs</span>
          <strong className={`text-2xl font-sans font-bold ${firestore.activeListeners <= 20 ? "text-cyan-400" : "text-rose-400"}`}>
            {firestore.activeListeners}
          </strong>
          <span className="text-[9px] text-slate-500 block">Max Cible : &lt;= 20 Stream</span>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-1">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Coût Mensuel Estimé</span>
          <strong className="text-2xl font-sans font-bold text-amber-400">${firestore.estimatedCostUsd} USD</strong>
          <span className="text-[9px] text-slate-500 block">Facturation Firestore Tier</span>
        </div>
      </div>

      {/* Event Orchestrator Health Status */}
      <div className="bg-slate-950 p-5 rounded-2xl border border-white/5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-400">
            <Zap className="w-4 h-4" />
            <h3 className="text-xs font-sans font-bold text-slate-100 uppercase tracking-wide">
              Event Orchestrator & Cloud Function Pipeline (`finopsEventOrchestrator`)
            </h3>
          </div>
          <button
            onClick={verifyOrchestrator}
            disabled={checkingOrch}
            className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wider block cursor-pointer"
          >
            {checkingOrch ? "VÉRIFICATION..." : "RE-VÉRIFIER"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-900/60 p-3 rounded-xl border border-white/5">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Disponibilité du Service</span>
            <strong className={`text-xl font-sans font-bold ${orchHealth?.available ? "text-emerald-400" : "text-rose-400"}`}>
              {orchHealth ? (orchHealth.available ? "EN LIGNE" : "SANS RÉPONSE") : "VÉRIFICATION..."}
            </strong>
            <span className="text-[9px] text-slate-500 block mt-0.5">Statut de la Cloud Function</span>
          </div>

          <div className="bg-slate-900/60 p-3 rounded-xl border border-white/5">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Latence d'Orchestration</span>
            <strong className="text-xl font-sans text-indigo-400 font-bold">
              {orchHealth ? `${orchHealth.latency} ms` : "---"}
            </strong>
            <span className="text-[9px] text-slate-500 block mt-0.5">Délai d'exécution aller-retour</span>
          </div>

          <div className="bg-slate-900/60 p-3 rounded-xl border border-white/5">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Dernier Diagnostic</span>
            <strong className="text-xs font-mono text-cyan-400 font-bold block truncate mt-1">
              {orchHealth ? new Date(orchHealth.lastCheck).toLocaleTimeString("fr-FR") : "Jamais"}
            </strong>
            <span className="text-[9px] text-slate-500 block mt-0.5">Heure de la dernière sonde</span>
          </div>
        </div>
      </div>

      {/* Realtime Stream Pool Telemetry Card */}
      <div className="bg-slate-950 p-5 rounded-2xl border border-white/5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-400">
            <Layers className="w-4 h-4" />
            <h3 className="text-xs font-sans font-bold text-slate-100 uppercase tracking-wide">
              Moteur de Déduplication & Restauration de Canaux Shared Streams (`realtimeManager`)
            </h3>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            OPTIMISÉ
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-900/60 p-3 rounded-xl border border-white/5">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Listeners Uniques</span>
            <strong className="text-xl font-sans text-emerald-400 font-bold">{rtStats.activeListeners}</strong>
            <span className="text-[9px] text-slate-500 block mt-0.5">Flux uniques ouverts</span>
          </div>

          <div className="bg-slate-900/60 p-3 rounded-xl border border-white/5">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Doublons Prévenus</span>
            <strong className="text-xl font-sans text-indigo-400 font-bold">{rtStats.duplicatesPrevented}</strong>
            <span className="text-[9px] text-slate-500 block mt-0.5">Économie de connexions</span>
          </div>

          <div className="bg-slate-900/60 p-3 rounded-xl border border-white/5">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Nettoyages DOM Exécutés</span>
            <strong className="text-xl font-sans text-cyan-400 font-bold">{rtStats.cleanupsExecuted}</strong>
            <span className="text-[9px] text-slate-500 block mt-0.5">Désabonnements sains</span>
          </div>

          <div className="bg-slate-900/60 p-3 rounded-xl border border-white/5">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Collections Partagées</span>
            <strong className="text-xl font-sans text-amber-400 font-bold">{rtStats.activeKeysCount}</strong>
            <span className="text-[9px] text-slate-500 block mt-0.5">Sub-collections multi-tenant</span>
          </div>
        </div>
      </div>

      {/* Historical Operations Chart */}
      <div className="bg-slate-950 p-6 rounded-2xl border border-white/5 space-y-4">
        <span className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-wider block">
          Volume de Transactions Firestore (Lectures / Écritures)
        </span>
        <div className="h-60 w-full">
          <SafeChartContainer height="100%" minHeight={220}>
            <BarChart data={chartData}>
              <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
              <YAxis stroke="#64748b" fontSize={10} />
              <Tooltip contentStyle={{ backgroundColor: "#020617", borderColor: "rgba(255,255,255,0.1)", borderRadius: "8px" }} />
              <Bar dataKey="reads" fill="#10b981" name="Lectures (R/min)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="writes" fill="#6366f1" name="Écritures (W/min)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </SafeChartContainer>
        </div>
      </div>
    </div>
  );
}
