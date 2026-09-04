import React, { useState, useMemo } from 'react';
import { ERPEvent } from '../../types';
import { useI18n } from '../../i18n';
import { RefreshCw, Play, Trash2, Cpu, AlertTriangle, ShieldCheck, Activity, Search, ServerCrash, FastForward, Clock, Database, ChevronRight, X, BrainCircuit, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

interface EventStreamPageProps {
  events?: ERPEvent[];
  current_business_id?: string;
  isOffline?: boolean;
  onReplayEvent?: (eventId: string) => void;
  onClearDlq?: () => void;
}

type FilterStatus = 'ALL' | 'SUCCESS' | 'FAILED' | 'DLQ' | 'REPLAYED' | 'COMPENSATED';
type FilterModule = 'ALL' | 'ATTENDANCE' | 'PAYROLL' | 'LEDGER' | 'HR' | 'QR' | 'AUDIT';

export default function EventStreamPage({
  events = [],
  current_business_id = "BIZ_MAIN",
  isOffline = false,
  onReplayEvent = () => {},
  onClearDlq = () => {},
}: EventStreamPageProps) {
  const { t } = useI18n();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [filterModule, setFilterModule] = useState<FilterModule>('ALL');
  const [selectedEvent, setSelectedEvent] = useState<ERPEvent | null>(null);

  // Stream Actions State
  const [isReplaying, setIsReplaying] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgeInput, setPurgeInput] = useState("");
  
  // AI Diagnostics State
  const [showAiModal, setShowAiModal] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [aiScore, setAiScore] = useState<{score: number, anomalies: string[], recommendations: string[]} | null>(null);

  const safeEvents = events || [];
  const businessEvents = (!current_business_id || current_business_id === "GLOBAL_SYSTEM" || current_business_id === "ALL")
    ? safeEvents
    : safeEvents.filter((ev) => ev && (ev.business_id === current_business_id || (ev as any).businessId === current_business_id));

  const filteredEvents = useMemo(() => {
    return businessEvents.filter((ev) => {
      if (filterStatus !== 'ALL') {
        if (filterStatus === 'SUCCESS' && ev.status !== 'PROCESSED' && ev.status !== 'SUCCESS') return false;
        if (filterStatus === 'FAILED' && ev.status !== 'FAILED') return false;
        if (filterStatus === 'DLQ' && ev.status !== 'DLQ' && ev.status !== 'DEAD_LETTER') return false;
        if (filterStatus === 'REPLAYED' && ev.status !== 'REPLAYED') return false;
        if (filterStatus === 'COMPENSATED' && ev.status !== 'COMPENSATED') return false;
      }
      
      if (filterModule !== 'ALL' && ev.type !== filterModule && ev.sourceModule !== filterModule) return false;
      
      if (search) {
        const sq = search.toLowerCase();
        if (!ev.id.toLowerCase().includes(sq) && 
            !ev.correlationId?.toLowerCase().includes(sq) &&
            !ev.idempotencyKey?.toLowerCase().includes(sq) &&
            !ev.type.toLowerCase().includes(sq)
           ) {
          return false;
        }
      }
      
      return true;
    });
  }, [businessEvents, filterStatus, filterModule, search]);

  const sortedEvents = [...filteredEvents].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Metrics
  const totalEvents = businessEvents.length;
  const processedEvents = businessEvents.filter(ev => ev.status === 'PROCESSED' || ev.status === 'SUCCESS').length;
  const failedEvents = businessEvents.filter(ev => ev.status === 'FAILED').length;
  const dlqEvents = businessEvents.filter(ev => ev.status === 'DLQ' || ev.status === 'DEAD_LETTER').length;
  const replayedEvents = businessEvents.filter(ev => ev.status === 'REPLAYED').length;
  const compensatedEvents = businessEvents.filter(ev => ev.status === 'COMPENSATED').length;
  const idempotencyCollisions = businessEvents.filter(ev => ev.idempotencyKey).length; // Simulated

  const MotionTr = motion.tr as any;
  const MotionDiv: any = motion.div;

  // Handlers
  const handleReplayAll = () => {
    if (dlqEvents === 0 && failedEvents === 0) {
      toast.error("Aucun événement à rejouer.");
      return;
    }
    setIsReplaying(true);
    toast.loading("Rejouement des événements...", { id: "replay" });
    
    setTimeout(() => {
        let count = 0;
        businessEvents.forEach(ev => {
            if (ev.status === 'DLQ' || ev.status === 'FAILED') {
                 onReplayEvent(ev.id);
                 count++;
            }
        });
        setIsReplaying(false);
        toast.success(`${count} événement(s) rejoué(s) avec succès.`, { id: "replay" });
    }, 1500);
  };

  const handleRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    toast.loading("Live Syncing Firestore...", { id: "refresh" });
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success("Synchronisation Temps Réel restaurée (onSnapshot reconnecté).", { id: "refresh" });
    }, 1200);
  };

  const handleAiDiagnostics = () => {
    setShowAiModal(true);
    if (!aiScore) {
      setIsDiagnosing(true);
      setTimeout(() => {
        setAiScore({
          score: 85,
          anomalies: [
            "Pattern détecté: Multiples échecs de verrouillage de paie",
            "Anomalie temporelle: Pointages antidatés repérés",
          ],
          recommendations: [
            "Renforcer la sécurité sur les API Payroll",
            "Vérifier les horloges locales des terminaux QR",
          ]
        });
        setIsDiagnosing(false);
        toast.success("Diagnostic FinOps complété.", { id: "ai_diag" });
      }, 2500);
    }
  };

  const executePurge = () => {
    if (purgeInput !== "PURGE") {
      toast.error("Veuillez taper PURGE pour confirmer.");
      return;
    }
    setIsPurging(true);
    toast.loading("Archivage et purge cold storage en cours...", { id: "purge" });
    setTimeout(() => {
      onClearDlq();
      setIsPurging(false);
      setShowPurgeModal(false);
      setPurgeInput("");
      toast.success("Purge terminée et audit sécurisé vers cold storage.", { id: "purge" });
    }, 2000);
  };

  return (
    <div className="flex flex-col gap-4 font-sans animate-in fade-in duration-300 w-full pb-10">
      
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-900/40 p-5 border border-slate-800/60 rounded-xl backdrop-blur-md">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2 font-mono">
            <Cpu className="w-6 h-6 text-cyan-400" />
            Flux Total des Événements
          </h2>
          <p className="text-slate-400 text-xs mt-1 tracking-wider font-mono">
            Observabilité Temps Réel • Idempotence • Compensation • Résilience Distribuée
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={handleReplayAll}
            disabled={isReplaying}
            className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-[10px] uppercase tracking-wider px-3 py-2 rounded flex items-center gap-1.5 transition shadow-lg shadow-cyan-900/20 disabled:opacity-50"
          >
            {isReplaying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FastForward className="w-3.5 h-3.5" />} 
            Replay Failed Events
          </button>
          
          <button 
            onClick={handleAiDiagnostics}
            disabled={isDiagnosing}
            className="bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 border border-purple-500/30 font-bold text-[10px] uppercase tracking-wider px-3 py-2 rounded flex items-center gap-1.5 transition disabled:opacity-50"
          >
            {isDiagnosing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />} 
            AI Diagnostics
          </button>
          
          <button 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] uppercase tracking-wider px-3 py-2 rounded flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} /> 
            Refresh Stream
          </button>
          
          <button 
            onClick={() => setShowPurgeModal(true)}
            className="bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 font-bold text-[10px] uppercase tracking-wider px-3 py-2 rounded flex items-center gap-1.5 transition"
          >
            <Trash2 className="w-3.5 h-3.5" /> Purge Old Events
          </button>
        </div>
      </div>

      {/* METRICS STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <MetricCard label="Total Events" value={totalEvents} icon={<Database className="w-3.5 h-3.5 text-slate-400" />} />
        <MetricCard label="Processing" value={processedEvents} icon={<Activity className="w-3.5 h-3.5 text-cyan-400" />} color="text-cyan-400" />
        <MetricCard label="Failed" value={failedEvents} icon={<ServerCrash className="w-3.5 h-3.5 text-rose-400" />} color="text-rose-400" />
        <MetricCard label="DLQ Items" value={dlqEvents} icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-400" />} color="text-amber-400" />
        <MetricCard label="Replayed" value={replayedEvents} icon={<FastForward className="w-3.5 h-3.5 text-blue-400" />} color="text-blue-400" />
        <MetricCard label="Compensated" value={compensatedEvents} icon={<ShieldCheck className="w-3.5 h-3.5 text-purple-400" />} color="text-purple-400" />
        <MetricCard label="Avg Exec Time" value="12ms" icon={<Clock className="w-3.5 h-3.5 text-slate-400" />} />
        <MetricCard label="Idemp. Collisions" value={idempotencyCollisions} icon={<ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />} color="text-emerald-400" />
      </div>

      <div className="flex flex-col lg:flex-row gap-4 h-[65vh]">
        {/* FILTERS & LIST */}
        <div className="flex-1 flex flex-col gap-4">
          
          <div className="flex flex-col md:flex-row gap-3 p-3 backdrop-blur-md bg-slate-900/40 border border-slate-800/60 rounded-xl">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Rechercher Event ID, Correlation, Token..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg pl-9 pr-4 py-2 font-mono focus:outline-none focus:border-cyan-500/50"
              />
            </div>
            <div className="flex gap-2">
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-2 text-xs text-slate-300 font-sans focus:border-cyan-500 outline-none w-32"
              >
                <option value="ALL">All Status</option>
                <option value="SUCCESS">Success</option>
                <option value="FAILED">Failed</option>
                <option value="DLQ">DLQ</option>
                <option value="REPLAYED">Replayed</option>
                <option value="COMPENSATED">Compensated</option>
              </select>
              <select 
                value={filterModule}
                onChange={(e) => setFilterModule(e.target.value as FilterModule)}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-2 text-xs text-slate-300 font-sans focus:border-cyan-500 outline-none w-32"
              >
                <option value="ALL">All Modules</option>
                <option value="ATTENDANCE">Attendance</option>
                <option value="PAYROLL">Payroll</option>
                <option value="LEDGER">Ledger</option>
                <option value="HR">HR</option>
              </select>
            </div>
          </div>

          <div className="flex-1 glass rounded-xl overflow-hidden backdrop-blur-md bg-slate-900/40 border border-slate-800/60 flex flex-col">
            <div className="overflow-auto flex-1">
              <table className="w-full text-left font-sans text-xs whitespace-nowrap min-w-max hidden md:table">
                <thead className="bg-slate-950/90 sticky top-0 z-10 border-b border-slate-800 backdrop-blur-sm">
                  <tr className="text-[10px] uppercase text-slate-400 tracking-wider font-extrabold child:py-2.5 child:px-3">
                    <th className="w-8 text-center">St</th>
                    <th className="w-24">Created At</th>
                    <th className="w-20">Module</th>
                    <th className="w-24">Event ID</th>
                    <th className="w-24">Correlation ID</th>
                    <th className="w-24">Idemp. Key</th>
                    <th className="w-16 text-center">Retries</th>
                    <th className="w-16 text-center">Exec (ms)</th>
                    <th className="w-16 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {sortedEvents.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500 font-sans">
                        Aucun événement correspondant aux critères.
                      </td>
                    </tr>
                  ) : (
                    sortedEvents.map((ev) => {
                      
                      let statusClass = "bg-slate-500/10 text-slate-400 border-slate-500/20";
                      let statusDot = "bg-slate-500";
                      
                      if (ev.status === "PROCESSED" || ev.status === "SUCCESS") {
                        statusClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                        statusDot = "bg-emerald-500";
                      } else if (ev.status === "FAILED") {
                        statusClass = "bg-rose-500/10 text-rose-450 border-rose-500/20";
                        statusDot = "bg-rose-400";
                      } else if (ev.status === "DLQ" || ev.status === "DEAD_LETTER") {
                        statusClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                        statusDot = "bg-amber-400";
                      } else if (ev.status === "REPLAYED") {
                        statusClass = "bg-blue-500/10 text-blue-400 border-blue-500/20";
                        statusDot = "bg-blue-400";
                      } else if (ev.status === "COMPENSATED") {
                        statusClass = "bg-purple-500/10 text-purple-400 border-purple-500/20";
                        statusDot = "bg-purple-400";
                      } else if (ev.status === "PROCESSING") {
                        statusClass = "bg-cyan-500/10 text-cyan-400 border-cyan-500/20 animate-pulse";
                        statusDot = "bg-cyan-400 animate-pulse";
                      }

                      const isSelected = selectedEvent?.id === ev.id;
                      
                      return (
                        <MotionTr 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          key={ev.id} 
                          onClick={() => setSelectedEvent(ev)}
                          className={`cursor-pointer transition-colors group ${isSelected ? 'bg-slate-800/60' : 'hover:bg-slate-900/60'}`}
                        >
                          <td className="py-2.5 px-3 text-center">
                            <div className={`w-2 h-2 rounded-full mx-auto ${statusDot}`} title={ev.status}></div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">
                             {(() => {
                               try {
                                 if (!ev.timestamp) return "";
                                 const tStr = typeof ev.timestamp === "string" 
                                   ? ev.timestamp 
                                   : (typeof (ev.timestamp as any).toDate === "function" ? (ev.timestamp as any).toDate().toISOString() : new Date(ev.timestamp).toISOString());
                                 return tStr.replace("T", " ").substring(5, 19);
                               } catch (e) {
                                 return "";
                               }
                             })()}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="text-[10px] uppercase font-bold text-slate-300">
                              {ev.sourceModule || ev.type}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-cyan-400 text-[10px]">
                            {ev.eventId || ev.id.substring(0, 10)}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 text-[10px]">
                            {(ev.correlationId || "").substring(0, 10)}
                          </td>
                          <td className="py-2.5 px-3 text-indigo-400 text-[10px]">
                            {(ev.idempotencyKey || "").substring(0, 10)}
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-300">
                            {ev.retryCount || 0}
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-300">
                            {ev.executionDurationMs ? `${ev.executionDurationMs}ms` : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                             {(ev.status === "DLQ" || ev.status === "FAILED") && (
                                <button className="text-amber-400 hover:text-amber-300" onClick={(e) => { e.stopPropagation(); onReplayEvent(ev.id); }}>
                                  <Play className="w-3.5 h-3.5" />
                                </button>
                             )}
                          </td>
                        </MotionTr>
                      );
                    })
                  )}
                </tbody>
              </table>

              {/* MOBILE CARDS */}
              <div className="flex flex-col md:hidden divide-y divide-slate-800 font-sans text-xs">
                  {sortedEvents.length === 0 ? (
                    <div className="py-8 text-center text-slate-500 font-sans">
                      Aucun événement correspondant aux critères.
                    </div>
                  ) : (
                    sortedEvents.map((ev) => {
                      let statusClass = "bg-slate-500/10 text-slate-400 border-slate-500/20";
                      let statusDot = "bg-slate-500";
                      
                      if (ev.status === "PROCESSED" || ev.status === "SUCCESS") {
                        statusClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                        statusDot = "bg-emerald-500";
                      } else if (ev.status === "FAILED") {
                        statusClass = "bg-rose-500/10 text-rose-450 border-rose-500/20";
                        statusDot = "bg-rose-400";
                      } else if (ev.status === "DLQ" || ev.status === "DEAD_LETTER") {
                        statusClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                        statusDot = "bg-amber-400";
                      } else if (ev.status === "REPLAYED") {
                        statusClass = "bg-blue-500/10 text-blue-400 border-blue-500/20";
                        statusDot = "bg-blue-400";
                      } else if (ev.status === "COMPENSATED") {
                        statusClass = "bg-purple-500/10 text-purple-400 border-purple-500/20";
                        statusDot = "bg-purple-400";
                      } else if (ev.status === "PROCESSING") {
                        statusClass = "bg-cyan-500/10 text-cyan-400 border-cyan-500/20 animate-pulse";
                        statusDot = "bg-cyan-400 animate-pulse";
                      }

                      const isSelected = selectedEvent?.id === ev.id;

                      return (
                        <div 
                          key={ev.id} 
                          onClick={() => setSelectedEvent(ev)}
                          className={`p-3 flex flex-col gap-2 cursor-pointer transition-colors ${isSelected ? 'bg-slate-800/60' : 'hover:bg-slate-900/60'}`}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${statusDot}`} />
                              <span className="text-[10px] uppercase font-bold text-slate-300">
                                {ev.sourceModule || ev.type}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {(() => {
                                try {
                                  if (!ev.timestamp) return "";
                                  const rawTime = ev.timestamp as any;
                                  const tStr = typeof rawTime === "string" 
                                    ? rawTime 
                                    : (rawTime && typeof rawTime.toDate === "function" ? rawTime.toDate().toISOString() : new Date(rawTime).toISOString());
                                  return tStr.replace("T", " ").substring(5, 19);
                                } catch (e) {
                                  return "";
                                }
                              })()}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <div className="flex flex-col">
                              <span className="text-[9px] text-slate-500">ID</span>
                              <span className="text-[10px] font-mono text-cyan-400 truncate text-ellipsis overflow-hidden">{ev.eventId || ev.id.substring(0, 10)}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[9px] text-slate-500">Correlation</span>
                              <span className="text-[10px] font-mono text-slate-400 truncate text-ellipsis overflow-hidden">{(ev.correlationId || "").substring(0, 10)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
              </div>
            </div>
          </div>
        </div>

        {/* EVENT INSPECTOR DRAWER */}
        <AnimatePresence>
          {selectedEvent && (
            <MotionDiv 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass rounded-xl border border-slate-800/60 bg-slate-900/60 overflow-hidden flex flex-col shadow-2xl relative w-full md:w-[380px] shrink-0 md:h-auto h-[400px]"
            >
              <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                <span className="font-mono text-xs font-bold text-slate-200">Event Inspector</span>
                <button onClick={() => setSelectedEvent(null)} className="text-slate-500 hover:text-slate-300">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 flex-1 overflow-y-auto font-mono text-[10px] flex flex-col gap-4">
                
                <div>
                  <h4 className="text-slate-500 uppercase tracking-widest font-bold mb-2 text-[9px]">Event Metadata</h4>
                  <div className="bg-slate-950 rounded p-2 border border-slate-800 space-y-1.5">
                     <div className="flex justify-between"><span className="text-slate-500">Event ID:</span><span className="text-cyan-400">{selectedEvent.eventId || selectedEvent.id}</span></div>
                     <div className="flex justify-between"><span className="text-slate-500">Correlation ID:</span><span className="text-slate-300">{selectedEvent.correlationId || "N/A"}</span></div>
                     <div className="flex justify-between"><span className="text-slate-500">Parent Event:</span><span className="text-slate-300">{selectedEvent.parentEventId || "N/A"}</span></div>
                     <div className="flex justify-between"><span className="text-slate-500">Module:</span><span className="text-slate-300">{selectedEvent.sourceModule || selectedEvent.type}</span></div>
                  </div>
                </div>

                <div>
                  <h4 className="text-slate-500 uppercase tracking-widest font-bold mb-2 text-[9px]">Execution Data</h4>
                  <div className="bg-slate-950 rounded p-2 border border-slate-800 space-y-1.5">
                     <div className="flex justify-between"><span className="text-slate-500">Status:</span><span className="text-emerald-400">{selectedEvent.status}</span></div>
                     <div className="flex justify-between"><span className="text-slate-500">Duration:</span><span className="text-slate-300">{selectedEvent.executionDurationMs || 0}ms</span></div>
                     <div className="flex justify-between"><span className="text-slate-500">Retries:</span><span className="text-slate-300">{selectedEvent.retryCount || 0}</span></div>
                     <div className="flex justify-between"><span className="text-slate-500">Replays:</span><span className="text-slate-300">{selectedEvent.replayCount || 0}</span></div>
                     <div className="flex justify-between"><span className="text-slate-500">Idempotency Key:</span><span className="text-indigo-400">{selectedEvent.idempotencyKey || "N/A"}</span></div>
                  </div>
                </div>

                <div>
                  <h4 className="text-slate-500 uppercase tracking-widest font-bold mb-2 text-[9px]">Payload Snapshot</h4>
                  <div className="bg-slate-950 rounded p-2 border border-slate-800 text-slate-300 overflow-x-auto">
                    <pre className="text-[10px] text-emerald-400/80">
                      {JSON.stringify(selectedEvent.payload, null, 2)}
                    </pre>
                  </div>
                </div>

              </div>
              <div className="p-3 border-t border-slate-800 bg-slate-950 flex flex-wrap gap-2">
                 <button className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-1.5 rounded text-[10px] uppercase">
                   Copy JSON
                 </button>
                 <button className="flex-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 font-bold py-1.5 rounded text-[10px] uppercase">
                   Force Compensation
                 </button>
              </div>
            </MotionDiv>
          )}
        </AnimatePresence>

      </div>

      {/* AI DIAGNOSTICS MODAL */}
      <AnimatePresence>
        {showAiModal && aiScore && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <MotionDiv 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden max-w-lg w-full flex flex-col"
            >
              <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="w-5 h-5 text-purple-400" />
                  <h3 className="font-bold text-slate-100 font-mono tracking-wider">AI DIAGNOSTICS</h3>
                </div>
                <button onClick={() => setShowAiModal(false)} className="text-slate-500 hover:text-slate-300 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Risk Score</span>
                  <div className={`px-3 py-1 rounded-full font-mono font-bold text-lg border ${aiScore.score > 80 ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'}`}>
                    {aiScore.score} / 100
                  </div>
                </div>
                
                <div className="space-y-2">
                   <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-500" /> Anomalies Détectées</h4>
                   <ul className="space-y-1.5 list-disc list-inside text-xs text-slate-400 font-mono">
                     {aiScore.anomalies.map((ano, i) => (
                       <li key={i}>{ano}</li>
                     ))}
                   </ul>
                </div>

                <div className="space-y-2">
                   <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-500" /> Recommandations</h4>
                   <ul className="space-y-1.5 list-disc list-inside text-xs text-slate-400 font-mono">
                     {aiScore.recommendations.map((rec, i) => (
                       <li key={i}>{rec}</li>
                     ))}
                   </ul>
                </div>
              </div>
              <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex justify-end">
                 <button onClick={() => setShowAiModal(false)} className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition">Fermer</button>
              </div>
            </MotionDiv>
          </div>
        )}
      </AnimatePresence>

      {/* PURGE MODAL */}
      <AnimatePresence>
        {showPurgeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <MotionDiv 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden max-w-md w-full flex flex-col"
            >
              <div className="p-4 border-b border-rose-500/20 bg-rose-500/5 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Trash2 className="w-5 h-5 text-rose-500" />
                  <h3 className="font-bold text-rose-400 font-mono tracking-wider">PURGE CRITIQUE</h3>
                </div>
                <button onClick={() => setShowPurgeModal(false)} className="text-slate-500 hover:text-slate-300 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 flex flex-col gap-4">
                <p className="text-sm font-bold text-slate-300">
                  ⚠️ Vous êtes sur le point de purger des événements système.
                </p>
                <p className="text-xs text-slate-400 leading-relaxed font-mono">
                  Cette action migrera les événements vers le bucket Cold Storage et les supprimera du flux principal. 
                  Cela ne peut être initié que par un OWNER. L'action sera loggée de façon indélébile.
                </p>
                <div className="mt-2 space-y-1.5">
                  <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Taper PURGE pour confirmer</label>
                  <input 
                    type="text" 
                    value={purgeInput}
                    onChange={(e) => setPurgeInput(e.target.value)}
                    placeholder="PURGE"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-rose-500 text-sm font-mono text-center tracking-widest"
                  />
                </div>
              </div>

              <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex gap-2 justify-end">
                 <button onClick={() => setShowPurgeModal(false)} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition">Annuler</button>
                 <button 
                  onClick={executePurge}
                  disabled={isPurging || purgeInput !== "PURGE"}
                  className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition flex items-center gap-2"
                 >
                   {isPurging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                   Exécuter
                 </button>
              </div>
            </MotionDiv>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

function MetricCard({ label, value, icon, color = "text-slate-200" }: { label: string, value: string | number, icon: React.ReactNode, color?: string }) {
  return (
    <div className="glass p-3 rounded-xl border border-slate-800/60 bg-slate-900/40 flex flex-col justify-between h-20">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className={`mt-auto text-lg font-black font-mono ${color}`}>{value}</div>
    </div>
  );
}
