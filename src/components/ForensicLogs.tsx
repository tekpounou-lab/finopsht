import { ForensicLog } from "../types";
import { useI18n } from "../i18n";
import { 
  ShieldAlert, Fingerprint, Terminal, Search, Filter, Download, 
  Lock, CheckCircle2, AlertTriangle, BrainCircuit, X, History,
  ShieldCheck, ShieldX, Copy, Check
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";

interface ForensicProps {
  forensicLogs: ForensicLog[];
  current_business_id: string;
  currentUser?: any;
  employees?: any[];
}

const logDict = {
  fr: {
    title: "Journal Forensique",
    immutable: "IMMUABLE",
    eventsCount: "{count} événements certifiés",
    searchPlaceholder: "Chercher opérateur...",
    allActions: "Toutes les actions",
    allSeverities: "Toutes les sévérités",
    aiForensic: "IA Forensique",
    exportJson: "Exporter JSON",
    timestamp: "Horodatage (UTC)",
    action: "Action",
    operator: "Opérateur",
    sealHash: "Sceau (Hash)",
    ipAddress: "IP Source",
    inspection: "Inspection",
    noRecords: "Aucun enregistrement ne correspond aux critères.",
    forensicInspector: "Inspecteur Forensique",
    integrityValidated: "Intégrité validée",
    cryptoSeal: "Sceau Cryptographique (SHA-256) :",
    networkContext: "Contexte Réseau",
    eventId: "ID Événement",
    userAgent: "Agent Utilisateur",
    stateDiff: "Différentiel d'État",
    before: "Avant",
    after: "Après",
    linkedMetadata: "Méta-données Liées"
  },
  ht: {
    title: "Liv Odit Jidisyè",
    immutable: "SEKIRIZE",
    eventsCount: "{count} aksyon verifye",
    searchPlaceholder: "Chache moun ki fè a...",
    allActions: "Tout aksyon yo",
    allSeverities: "Tout nivo alèt yo",
    aiForensic: "IA Jidisyè",
    exportJson: "Ekspòte JSON",
    timestamp: "Dat ak Lè (UTC)",
    action: "Aksyon",
    operator: "Moun ki fè l",
    sealHash: "Kòd Siyati (Hash)",
    ipAddress: "IP Sousse",
    inspection: "Enspeksyon",
    noRecords: "Pa gen okenn aksyon ki koresponn.",
    forensicInspector: "Enspektè Jidisyè",
    integrityValidated: "Done yo kòrèk e an sekirite",
    cryptoSeal: "Siyati Kriptografik (SHA-256) :",
    networkContext: "Enfòmasyon sou Rezo a",
    eventId: "ID Evènman",
    userAgent: "Navigatè/Logisyèl",
    stateDiff: "Chanjman Done",
    before: "Anvan",
    after: "Apre",
    linkedMetadata: "Metadone ki Konekte"
  },
  en: {
    title: "Forensic Audit Log",
    immutable: "IMMUTABLE",
    eventsCount: "{count} certified events",
    searchPlaceholder: "Search operator...",
    allActions: "All Actions",
    allSeverities: "All Severities",
    aiForensic: "AI Forensics",
    exportJson: "Export JSON",
    timestamp: "Timestamp (UTC)",
    action: "Action",
    operator: "Operator",
    sealHash: "Lock (Hash)",
    ipAddress: "Source IP",
    inspection: "Inspection",
    noRecords: "No matching forensic events found.",
    forensicInspector: "Forensic Inspector",
    integrityValidated: "Integrity Validated",
    cryptoSeal: "Cryptographic Seal (SHA-256):",
    networkContext: "Network Context",
    eventId: "Event ID",
    userAgent: "User Agent",
    stateDiff: "State Differential",
    before: "Before",
    after: "After",
    linkedMetadata: "Linked Metadata"
  }
};

export default function ForensicLogs({ forensicLogs, current_business_id, currentUser, employees }: ForensicProps) {
  const { t, language } = useI18n();
  const activeLang = (language === 'fr' || language === 'ht' || language === 'en') ? language : 'fr';
  const d = logDict[activeLang];
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  
  // AI Mode
  const [isAiScanning, setIsAiScanning] = useState(false);

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const allLogs = useMemo(() => {
    return forensicLogs.map(log => {
      let mappedName = log.userName;
      if (log.business_id === current_business_id) {
        if (log.userRole === "OWNER" || log.userName === currentUser?.name || "System" || log.userName?.toLowerCase()?.includes("owner")) {
          const ownerEmp = employees?.find(e => e.role === "OWNER");
          mappedName = ownerEmp?.name || (currentUser?.role === "OWNER" ? currentUser.name : currentUser?.name || "System");
        } else if (log.userRole === "MANAGER" || log.userName === "Fabienne Jean-Gilles" || log.userName?.toLowerCase()?.includes("manager")) {
          const managerEmp = employees?.find(e => e.role === "MANAGER");
          mappedName = managerEmp?.name || (currentUser?.role === "MANAGER" ? currentUser.name : "Fabienne Jean-Gilles");
        }
      }
      return { ...log, userName: mappedName };
    }).filter((log) => log.business_id === current_business_id);
  }, [forensicLogs, current_business_id, employees, currentUser]);

  const uniqueActions = useMemo(() => Array.from(new Set(allLogs.map(l => l.action))), [allLogs]);

  const formatTimestamp = (ts: any) => {
    if (!ts) return "";
    let date: Date;
    
    if (typeof ts === 'string') {
      date = new Date(ts);
    } else if (ts && typeof ts === 'object' && ts.seconds) {
      // Firestore Timestamp
      date = new Date(ts.seconds * 1000);
    } else if (ts instanceof Date) {
      date = ts;
    } else {
      return String(ts);
    }

    try {
      return date.toISOString().replace("T", " ").substring(0, 19);
    } catch (e) {
      return String(ts);
    }
  };

  const filteredLogs = useMemo(() => {
    return allLogs.filter(log => {
      const matchActor = log.userName?.toLowerCase().includes(debouncedSearch.toLowerCase()) || log.userId?.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchAction = filterAction ? log.action === filterAction : true;
      const matchSeverity = filterSeverity ? (log.severity || 'info') === filterSeverity : true;
      return matchActor && matchAction && matchSeverity;
    }).sort((a, b) => {
      const timeA = a.timestamp && typeof a.timestamp === 'object' && a.timestamp.seconds ? a.timestamp.seconds * 1000 : new Date(a.timestamp).getTime();
      const timeB = b.timestamp && typeof b.timestamp === 'object' && b.timestamp.seconds ? b.timestamp.seconds * 1000 : new Date(b.timestamp).getTime();
      return timeB - timeA;
    });
  }, [allLogs, debouncedSearch, filterAction, filterSeverity]);

  const selectedLog = useMemo(() => allLogs.find((l) => l.id === selectedLogId), [allLogs, selectedLogId]);

  const simulateAiScan = () => {
    setIsAiScanning(true);
    setTimeout(() => setIsAiScanning(false), 2000);
  };

  const getSeverityStyles = (severity?: string) => {
    switch (severity) {
      case 'critical': return "bg-rose-500/10 text-rose-500 border-rose-500/20";
      case 'warning': return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      default: return "bg-sky-500/10 text-sky-400 border-sky-500/20";
    }
  };

  return (
    <div className="flex flex-col h-full gap-4 relative overflow-hidden" id="forensic-observability-engine">
      
      {/* Top Bar Actions & Filters */}
      <div className="glass p-3 rounded-xl border border-slate-800/60 backdrop-blur-md flex flex-col lg:flex-row lg:items-center justify-between gap-4 z-10">
        <div className="flex flex-col">
           <h3 className="text-xs uppercase font-bold text-slate-100 tracking-wider flex items-center gap-1.5">
            <Fingerprint className="w-4 h-4 text-cyan-400" />
            {d.title}
            <span className="bg-rose-500/10 text-rose-400 text-[9px] font-mono border border-rose-500/20 px-1.5 py-0.5 rounded ml-2">{d.immutable}</span>
          </h3>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5 ml-5">{d.eventsCount.replace("{count}", String(filteredLogs.length))}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input 
              type="text" 
              placeholder={d.searchPlaceholder} 
              className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-cyan-500 w-48 font-mono placeholder:font-sans"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Filters */}
          <select 
            className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-lg px-2 py-1.5 outline-none focus:border-cyan-500"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
          >
            <option value="">{d.allActions}</option>
            {uniqueActions.map(action => (
              <option key={action} value={action}>{action}</option>
            ))}
          </select>

          <select 
            className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-lg px-2 py-1.5 outline-none focus:border-cyan-500"
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
          >
            <option value="">{d.allSeverities}</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>

          <button onClick={simulateAiScan} className="bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 focus:ring-2 focus:ring-indigo-500/50">
            {isAiScanning ? (
              <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <BrainCircuit className="w-3.5 h-3.5" />
            )}
            {d.aiForensic}
          </button>
          
          <button className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> {d.exportJson}
          </button>
        </div>
      </div>

      <div className="flex-1 relative min-h-0 flex gap-4">
        {/* Main Table */}
        <div className={`flex-1 glass rounded-xl overflow-hidden border border-slate-800/60 backdrop-blur-md flex flex-col transition-all duration-300 z-10`} id="forensic-table-view">
          {/* DESKTOP VIEW */}
          <div className="hidden md:block overflow-x-auto flex-1 custom-scrollbar">
            <table className="w-full text-left font-sans text-xs whitespace-nowrap min-w-[900px]">
              <thead className="bg-slate-950/80 sticky top-0 z-20 border-b border-slate-800/80 backdrop-blur-md">
                <tr className="text-[10px] uppercase text-slate-400 tracking-wider font-extrabold child:py-2.5 child:px-3">
                  <th className="w-8 text-center"><Lock className="w-3 h-3 inline text-slate-500" /></th>
                  <th>{d.timestamp}</th>
                  <th>{d.action}</th>
                  <th>{d.operator}</th>
                  <th>{d.sealHash}</th>
                  <th>{d.ipAddress}</th>
                  <th className="text-right">{d.inspection}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 font-mono">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500 font-sans italic">
                      {d.noRecords}
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map(log => {
                    const isSelected = selectedLogId === log.id;
                    const hashStr = log.hash || log.signature || "NO_SIGNATURE";
                    const shortHash = hashStr.length > 16 ? hashStr.substring(0, 16) + '...' : hashStr;

                    return (
                      <tr 
                        key={log.id} 
                        onClick={() => setSelectedLogId(log.id)}
                        className={`hover:bg-slate-900/40 cursor-pointer transition-colors ${isSelected ? "bg-cyan-900/10" : ""}`}
                      >
                        <td className="py-2 px-3 text-center">
                          {log.severity === 'critical' ? (
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-500 inline" />
                          ) : (
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 inline" />
                          )}
                        </td>
                        <td className="py-2 px-3 text-[10px] text-slate-300">
                          {formatTimestamp(log.timestamp)}
                        </td>
                        <td className="py-2 px-3 text-[10px]">
                          <span className={`px-2 py-0.5 rounded border font-bold uppercase tracking-wider ${getSeverityStyles(log.severity)}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex flex-col justify-center">
                            <span className="font-sans font-bold text-slate-200">{log.userName || log.userId}</span>
                            <span className="text-[9px] text-slate-500">{log.userRole}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                             <span className="bg-slate-900 px-1.5 py-0.5 rounded text-[10px] text-slate-400 border border-slate-800">
                               {shortHash}
                             </span>
                             <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          </div>
                        </td>
                        <td className="py-2 px-3 text-[10px] text-slate-400">
                          {log.ipAddress}
                        </td>
                        <td className="py-2 px-3 text-right">
                           <button className={`p-1.5 rounded-md hover:bg-slate-800 transition ${isSelected ? 'text-cyan-400 bg-slate-800/80' : 'text-slate-500'}`}>
                             <Terminal className="w-4 h-4" />
                           </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* MOBILE VIEW */}
          <div className="flex flex-col md:hidden divide-y divide-slate-800/50 overflow-y-auto flex-1 custom-scrollbar">
            {filteredLogs.length === 0 ? (
              <div className="py-12 text-center text-slate-500 font-sans italic">
                {d.noRecords}
              </div>
            ) : (
              filteredLogs.map(log => {
                const isSelected = selectedLogId === log.id;
                
                return (
                  <div 
                    key={log.id} 
                    onClick={() => setSelectedLogId(log.id)}
                    className={`p-3 flex flex-col gap-2 hover:bg-slate-900/40 cursor-pointer transition-colors ${isSelected ? "bg-cyan-900/10" : ""}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col gap-1.5">
                        <span className={`w-max px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider font-mono ${getSeverityStyles(log.severity)}`}>
                          {log.action}
                        </span>
                        <div className="flex flex-col">
                          <span className="font-sans font-bold text-slate-200 text-sm">{log.userName || log.userId}</span>
                          <span className="text-[10px] text-slate-500 font-mono">{formatTimestamp(log.timestamp)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {log.severity === 'critical' ? (
                          <ShieldAlert className="w-4 h-4 text-rose-500" />
                        ) : (
                          <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        )}
                        <button className={`p-1.5 rounded-md border ${isSelected ? 'border-cyan-500/50 text-cyan-400 bg-cyan-500/10' : 'border-slate-700 text-slate-400 hover:bg-slate-800'} transition`}>
                          <Terminal className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Forensic Inspector Drawer / Side Panel */}
        <AnimatePresence>
          {selectedLog && (
            <>
              {/* Mobile Backdrop */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="md:hidden fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40"
                onClick={() => setSelectedLogId(null)}
              />
              
              {/* Drawer Container */}
              <motion.div 
                initial={{ opacity: 0, x: 20, width: 0 }}
                animate={{ opacity: 1, x: 0, width: "100%" }}
                exit={{ opacity: 0, x: 20, width: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-y-0 right-0 md:relative md:inset-auto glass md:rounded-xl border-l md:border border-slate-800/60 backdrop-blur-xl flex flex-col z-50 md:z-20 shrink-0 overflow-hidden md:max-w-[440px] w-full md:w-[440px]"
              >
              <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-950/50">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest font-mono">{d.forensicInspector}</h4>
                </div>
                <button onClick={() => setSelectedLogId(null)} className="p-1 hover:bg-slate-800 rounded text-slate-400 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 custom-scrollbar bg-slate-950/30">
                 {/* Integrity Check */}
                 <div className="bg-slate-900/60 border border-emerald-500/20 rounded-lg p-3 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">{d.integrityValidated}</span>
                    </div>
                    <div className="flex flex-col gap-1 font-mono text-[9px] text-slate-400">
                      <span className="flex items-center gap-2">{d.cryptoSeal}</span>
                      <span className="bg-slate-950 p-1.5 rounded border border-slate-800 text-slate-300 break-all select-all">
                        {selectedLog.hash || selectedLog.signature || "NO_SIGNATURE"}
                      </span>
                    </div>
                 </div>

                 {/* Context Data */}
                 <div className="flex flex-col gap-2">
                   <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{d.networkContext}</h5>
                   <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                      <div className="bg-slate-900 p-2 rounded border border-slate-800/60 flex flex-col gap-1">
                        <span className="text-slate-500">{d.ipAddress}</span>
                        <span className="text-slate-300">{selectedLog.ipAddress}</span>
                      </div>
                      <div className="bg-slate-900 p-2 rounded border border-slate-800/60 flex flex-col gap-1">
                        <span className="text-slate-500">{d.eventId}</span>
                        <span className="text-slate-300 truncate" title={selectedLog.id}>{selectedLog.id}</span>
                      </div>
                      <div className="col-span-2 bg-slate-900 p-2 rounded border border-slate-800/60 flex flex-col gap-1">
                        <span className="text-slate-500">{d.userAgent}</span>
                        <span className="text-slate-300 truncate" title={selectedLog.userAgent}>{selectedLog.userAgent}</span>
                      </div>
                   </div>
                 </div>

                 {/* Playback / State Changes */}
                 <div className="flex flex-col gap-3">
                   <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center justify-between">
                     <span>{d.stateDiff}</span>
                     <History className="w-3 h-3" />
                   </h5>
                   
                   <div className="flex flex-col gap-2">
                     <div className="flex flex-col gap-1">
                       <span className="text-[9px] font-bold text-rose-400 uppercase bg-rose-500/10 px-2 py-0.5 rounded w-max border border-rose-500/20">{d.before}</span>
                       <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-400 overflow-x-auto custom-scrollbar">
                         {(() => {
                           try {
                             return selectedLog.beforeState ? JSON.stringify(JSON.parse(selectedLog.beforeState), null, 2) : "null";
                           } catch { return String(selectedLog.beforeState); }
                         })()}
                       </pre>
                     </div>

                     <div className="flex justify-center -my-2.5 z-10">
                       <div className="bg-slate-800 border border-slate-700 rounded-full p-1 shadow-md">
                         <AlertTriangle className="w-3 h-3 text-slate-400" />
                       </div>
                     </div>

                     <div className="flex flex-col gap-1">
                       <span className="text-[9px] font-bold text-emerald-400 uppercase bg-emerald-500/10 px-2 py-0.5 rounded w-max border border-emerald-500/20">{d.after}</span>
                       <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[10px] font-mono text-cyan-300 overflow-x-auto custom-scrollbar">
                         {(() => {
                           try {
                             return selectedLog.afterState ? JSON.stringify(JSON.parse(selectedLog.afterState), null, 2) : "null";
                           } catch { return String(selectedLog.afterState); }
                         })()}
                       </pre>
                     </div>
                   </div>
                 </div>

                 {/* Metadata Details */}
                 {(selectedLog.metadata || selectedLog.entityId) && (
                   <div className="flex flex-col gap-2">
                     <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{d.linkedMetadata}</h5>
                     <pre className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-[10px] font-mono text-amber-300/80 overflow-x-auto custom-scrollbar">
                       {JSON.stringify({
                         entityId: selectedLog.entityId,
                         entityType: selectedLog.entityType,
                         actorId: selectedLog.actorId,
                         metadata: selectedLog.metadata
                       }, null, 2)}
                     </pre>
                   </div>
                 )}
              </div>
            </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}
