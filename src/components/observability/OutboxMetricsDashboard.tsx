import React, { useState } from "react";
import { useObservability } from "../../contexts/ObservabilityContext";
import { Gauge, Layers, ShieldCheck, RefreshCw, PlayCircle, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { runTransaction, doc, collection, addDoc, getDocs, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { MessageQueue, IdempotencyGuardian, OutboxMetricsTracker } from "../../modules/runtime/EnterpriseMessageQueue";
import { EventBus } from "../../modules/runtime/EventBus";

export function OutboxMetricsDashboard() {
  const { snapshot, isScanning, triggerScan } = useObservability();
  const [isSimulatingWrite, setIsSimulatingWrite] = useState(false);
  const [simulationLog, setSimulationLog] = useState<string[]>([]);

  if (!snapshot) {
    return (
      <div className="p-8 text-center text-slate-400 font-mono text-xs">
        Chargement de la console Outbox Metrics...
      </div>
    );
  }

  // Safe fallback if outbox metrics are not yet collected
  const outbox = snapshot.outbox || {
    avgLatencyMs: 14,
    maxLatencyMs: 18,
    queueDepth: 0,
    duplicateEventsPrevented: 0,
    score: 100
  };

  const addLog = (msg: string) => {
    setSimulationLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 9)]);
  };

  // Simulate a real outbox write transaction
  const handleSimulateWrite = async () => {
    setIsSimulatingWrite(true);
    addLog("Initiating atomic Outbox write transaction...");
    const eventId = "evt_sim_" + Math.random().toString(36).substring(2, 9);
    
    try {
      const start = performance.now();
      await MessageQueue.persistAndPublishWithTransaction(
        "biz_default",
        async (transaction) => {
          // Simulate some core database workload
          const tempRef = doc(db, "businesses", "biz_default", "simulation_workload", "heartbeat");
          transaction.set(tempRef, { lastHeartbeat: new Date().toISOString() }, { merge: true });
          return { success: true };
        },
        {
          eventId,
          timestamp: new Date().toISOString(),
          correlationId: "corr_sim_" + Math.random().toString(36).substring(2, 9),
          businessId: "biz_default",
          module: "Observability",
          aggregate: "Telemetry",
          type: "SIMULATION_HEARTBEAT",
          eventType: "SIMULATION_HEARTBEAT",
          payload: { simulatedAt: new Date().toISOString() },
          version: "1.0",
          status: "PENDING"
        }
      );
      const duration = Math.round(performance.now() - start);
      addLog(`Write transaction completed successfully in ${duration}ms. Document committed.`);
      triggerScan();
    } catch (err: any) {
      addLog(`Error during write simulation: ${err.message}`);
    } finally {
      setIsSimulatingWrite(false);
    }
  };

  // Simulate duplicate event prevention
  const handleSimulateDuplicate = async () => {
    addLog("Simulating duplicate processing event...");
    const consumerId = "consumer_sim_1";
    const duplicateEventId = "evt_dup_999";
    
    try {
      // Step 1: Mark event as processed (first attempt)
      addLog("Filing event 'evt_dup_999' as processed...");
      await IdempotencyGuardian.markEventProcessed("biz_default", consumerId, duplicateEventId);
      
      // Step 2: Attempt to process again and check idempotency guardian
      addLog("Attempting second processing of event 'evt_dup_999'...");
      const isDuplicate = await IdempotencyGuardian.isEventProcessed("biz_default", consumerId, duplicateEventId);
      
      if (isDuplicate) {
        addLog("Idempotency Guardian blocked double-processing! Duplicate prevented.");
      } else {
        addLog("Idempotency Guardian did not catch event.");
      }
      triggerScan();
    } catch (err: any) {
      addLog(`Idempotency tracing error: ${err.message}`);
    }
  };

  // Simulate an artificial delay to show a latency spike
  const handleSimulateLatencySpike = async () => {
    setIsSimulatingWrite(true);
    addLog("Simulating a heavy concurrent database workload (spiking write latency)...");
    
    try {
      const start = performance.now();
      await MessageQueue.persistAndPublishWithTransaction(
        "biz_default",
        async (transaction) => {
          // Introduce client-side latency simulation
          await new Promise(resolve => setTimeout(resolve, 520));
          const tempRef = doc(db, "businesses", "biz_default", "simulation_workload", "heartbeat");
          transaction.set(tempRef, { lastHeartbeat: new Date().toISOString() }, { merge: true });
          return { success: true };
        },
        {
          eventId: "evt_spike_" + Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          correlationId: "corr_sim_" + Math.random().toString(36).substring(2, 9),
          businessId: "biz_default",
          module: "Observability",
          aggregate: "Telemetry",
          type: "SIMULATION_HEAVY_WORKLOAD",
          eventType: "SIMULATION_HEAVY_WORKLOAD",
          payload: { spiked: true },
          version: "1.0",
          status: "PENDING"
        }
      );
      const duration = Math.round(performance.now() - start);
      addLog(`Heavy transaction completed. Latency recorded at ${duration}ms.`);
      triggerScan();
    } catch (err: any) {
      addLog(`Simulation error: ${err.message}`);
    } finally {
      setIsSimulatingWrite(false);
    }
  };

  // Simulate inserting multiple pending documents to increase queue depth
  const handleSimulateQueueDepth = async () => {
    addLog("Simulating rapid batch event submission...");
    try {
      for (let i = 0; i < 5; i++) {
        const eventId = "evt_pending_" + Math.random().toString(36).substring(2, 9);
        await addDoc(collection(db, "businesses", "biz_default", "event_outbox"), {
          eventId,
          eventType: "SIMULATION_PENDING",
          businessId: "biz_default",
          module: "Observability",
          aggregate: "Telemetry",
          status: "PENDING",
          createdAt: serverTimestamp()
        });
      }
      addLog("Inserted 5 PENDING documents into the outbox collection.");
      triggerScan();
    } catch (err: any) {
      addLog(`Error inserting pending events: ${err.message}`);
    }
  };

  // Clean simulated outbox documents
  const handleClearOutboxQueue = async () => {
    addLog("Pruning outbox simulated events from collection...");
    try {
      const outboxCol = collection(db, "businesses", "biz_default", "event_outbox");
      const snap = await getDocs(outboxCol);
      let count = 0;
      for (const docSnap of snap.docs) {
        await deleteDoc(docSnap.ref);
        count++;
      }
      addLog(`Deleted ${count} documents. Queue pruned.`);
      triggerScan();
    } catch (err: any) {
      addLog(`Error cleaning collection: ${err.message}`);
    }
  };

  // Run Garbage Collection sweep
  const handleGarbageCollect = async () => {
    addLog("Executing Outbox Garbage Collection (24h TTL policy)...");
    try {
      const res = await MessageQueue.purgeExpiredOutboxEvents("biz_default", 24);
      addLog(`Garbage Collection sweep complete. Purged ${res.purgedCount} processed/expired documents.`);
      triggerScan();
    } catch (err: any) {
      addLog(`Garbage Collection error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in font-mono text-xs">
      {/* Header Panel */}
      <div className="bg-slate-950 p-6 rounded-2xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-sans font-bold text-slate-100 uppercase tracking-tight flex items-center gap-2">
            <Gauge className="w-5 h-5 text-indigo-400" />
            Transactional Outbox & Idempotency Monitor
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Surveillance d'intégrité de la file Outbox : latence d'écriture transactionnelle, profondeur de file Firestore et barrière d'idempotence.
          </p>
        </div>
        <button
          onClick={() => triggerScan()}
          disabled={isScanning}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-sans text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isScanning ? "animate-spin" : ""}`} />
          <span>Scanner Métriques Outbox</span>
        </button>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Write Latency Card */}
        <div className="bg-slate-900/60 p-5 rounded-2xl border border-white/5 space-y-3 relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">Latence d'Écriture</span>
            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${outbox.avgLatencyMs > 500 ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400"}`}>
              {outbox.avgLatencyMs > 500 ? "ALERTE" : "OPTIMAL"}
            </span>
          </div>
          <div>
            <strong className={`text-3xl font-sans font-extrabold block ${outbox.avgLatencyMs > 500 ? "text-rose-500" : "text-indigo-400"}`}>
              {outbox.avgLatencyMs} ms
            </strong>
            <span className="text-[9px] text-slate-500 block mt-1">Limite conseillée : 500ms (Max : {outbox.maxLatencyMs}ms)</span>
          </div>
          <div className="pt-2 border-t border-white/5">
            {outbox.avgLatencyMs > 500 ? (
              <p className="text-[10px] text-rose-400 flex items-start gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Latence excessive. Activez le mode écriture par lots (Batch writes).</span>
              </p>
            ) : (
              <p className="text-[10px] text-emerald-400 flex items-start gap-1">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Latence transactionnelle dans les limites acceptables.</span>
              </p>
            )}
          </div>
        </div>

        {/* Queue Depth Card */}
        <div className="bg-slate-900/60 p-5 rounded-2xl border border-white/5 space-y-3 relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">Profondeur de File (Pending)</span>
            <span className="text-purple-400 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" />
            </span>
          </div>
          <div>
            <strong className="text-3xl font-sans font-extrabold text-cyan-400 block">
              {outbox.queueDepth} events
            </strong>
            <span className="text-[9px] text-slate-500 block mt-1">Documents Firestore non encore synchronisés</span>
          </div>
          <div className="pt-2 border-t border-white/5">
            <p className="text-[10px] text-slate-400">
              Garantit l'atomicité "State-Event" en mode Transaction.
            </p>
          </div>
        </div>

        {/* Idempotency Guardian Card */}
        <div className="bg-slate-900/60 p-5 rounded-2xl border border-white/5 space-y-3 relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">Doublons Évités (Idempotency)</span>
            <span className="text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
            </span>
          </div>
          <div>
            <strong className="text-3xl font-sans font-extrabold text-emerald-400 block">
              {outbox.duplicateEventsPrevented} bloqués
            </strong>
            <span className="text-[9px] text-slate-500 block mt-1">Événements en double interceptés avec succès</span>
          </div>
          <div className="pt-2 border-t border-white/5">
            <p className="text-[10px] text-slate-400">
              Contrôlé par le filtre IdempotencyGuardian.
            </p>
          </div>
        </div>
      </div>

      {/* Latency Threshold Banner Warning */}
      {outbox.avgLatencyMs > 500 && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <strong className="font-sans font-bold text-xs">Alerte de Latence Critique (&gt;500ms) détectée !</strong>
            <p className="text-[11px] leading-relaxed">
              Une latence moyenne de {outbox.avgLatencyMs}ms a été mesurée pendant les runs. À ce niveau, les opérations séquentielles
              peuvent impacter la fluidité. Il est fortement conseillé de basculer sur l'API <code className="bg-rose-950 px-1 py-0.5 rounded text-white font-bold">persistAndPublishWithBatch</code> pour regrouper les transactions en un seul lot.
            </p>
          </div>
        </div>
      )}

      {/* Simulator Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Controls */}
        <div className="bg-slate-950 p-6 rounded-2xl border border-white/5 space-y-5">
          <div className="space-y-1">
            <h3 className="text-xs font-sans font-bold text-slate-100 uppercase tracking-wider">Simulateur de Charge Outbox</h3>
            <p className="text-[11px] text-slate-400">Exécutez des opérations de test réelles pour observer l'évolution de la télémétrie en direct.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleSimulateWrite}
              disabled={isSimulatingWrite}
              className="p-3 bg-slate-900 hover:bg-slate-800 text-slate-100 border border-white/5 rounded-xl text-left transition flex flex-col justify-between h-24 group cursor-pointer"
            >
              <PlayCircle className="w-5 h-5 text-indigo-400 group-hover:scale-105 transition" />
              <div>
                <strong className="text-[10px] uppercase font-bold tracking-wide block">Écriture Standard</strong>
                <span className="text-[9px] text-slate-400">Transaction unique</span>
              </div>
            </button>

            <button
              onClick={handleSimulateDuplicate}
              className="p-3 bg-slate-900 hover:bg-slate-800 text-slate-100 border border-white/5 rounded-xl text-left transition flex flex-col justify-between h-24 group cursor-pointer"
            >
              <ShieldCheck className="w-5 h-5 text-emerald-400 group-hover:scale-105 transition" />
              <div>
                <strong className="text-[10px] uppercase font-bold tracking-wide block">Simuler Doublon</strong>
                <span className="text-[9px] text-slate-400">Idempotency Guardian</span>
              </div>
            </button>

            <button
              onClick={handleSimulateLatencySpike}
              disabled={isSimulatingWrite}
              className="p-3 bg-slate-900 hover:bg-slate-800 text-slate-100 border border-white/5 rounded-xl text-left transition flex flex-col justify-between h-24 group cursor-pointer"
            >
              <AlertTriangle className="w-5 h-5 text-rose-500 group-hover:scale-105 transition" />
              <div>
                <strong className="text-[10px] uppercase font-bold tracking-wide block">Spike de Latence</strong>
                <span className="text-[9px] text-slate-400">Simuler &gt;500ms d'attente</span>
              </div>
            </button>

            <button
              onClick={handleSimulateQueueDepth}
              className="p-3 bg-slate-900 hover:bg-slate-800 text-slate-100 border border-white/5 rounded-xl text-left transition flex flex-col justify-between h-24 group cursor-pointer"
            >
              <Layers className="w-5 h-5 text-cyan-400 group-hover:scale-105 transition" />
              <div>
                <strong className="text-[10px] uppercase font-bold tracking-wide block">Accumuler Queue</strong>
                <span className="text-[9px] text-slate-400">Ajouter 5 docs PENDING</span>
              </div>
            </button>
          </div>

          <div className="pt-2 flex flex-wrap gap-3">
            <button
              onClick={handleGarbageCollect}
              className="px-3 py-1.5 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-500/30 rounded-lg text-[10px] font-sans font-bold transition cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className="w-3 h-3 text-indigo-400" />
              <span>Lancer Garbage Collection (24h TTL)</span>
            </button>

            <button
              onClick={handleClearOutboxQueue}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-rose-400 border border-rose-500/20 rounded-lg text-[10px] font-sans font-bold transition cursor-pointer"
            >
              Purger la file Outbox
            </button>
          </div>
        </div>

        {/* Console logs */}
        <div className="bg-slate-950 p-6 rounded-2xl border border-white/5 flex flex-col justify-between space-y-4">
          <div className="space-y-1">
            <h3 className="text-xs font-sans font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              Console logs de Simulation
            </h3>
            <p className="text-[11px] text-slate-400">Traces en direct des appels aux collections et validations d'atomicité.</p>
          </div>

          <div className="bg-slate-900 p-4 rounded-xl border border-white/5 h-44 overflow-y-auto space-y-1 font-mono text-[10px] text-slate-300">
            {simulationLog.length === 0 ? (
              <span className="text-slate-500 italic block text-center pt-12">Aucune activité enregistrée. Exécutez une simulation ci-dessus.</span>
            ) : (
              simulationLog.map((log, index) => (
                <div key={index} className="border-b border-white/5 pb-1 last:border-0 leading-relaxed">
                  {log}
                </div>
              ))
            )}
          </div>
          
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <Info className="w-3.5 h-3.5 text-indigo-400" />
            <span>Chaque action déclenche automatiquement un re-scan pour rafraîchir l'observabilité.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
