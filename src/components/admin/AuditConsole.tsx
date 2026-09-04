
import React, { useEffect, useState } from "react";
import { db, auth } from "../../lib/firebase";
import { collection, query, where, limit } from "firebase/firestore";
import { Shield, Search, Terminal, AlertTriangle, Info, Lock, ArrowRightLeft, CheckCircle2 } from "lucide-react";
import { realtimeManager } from "../../services/firestore/realtimeManager";
import { SecurityAuditLogger, SecurityAuditLog } from "../../services/security/SecurityAuditLogger";

export const AuditConsole: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [activeTab, setActiveTab] = useState<"ENTERPRISE" | "SECURITY">("SECURITY");
  const [logs, setLogs] = useState<any[]>([]);
  const [securityLogs, setSecurityLogs] = useState<SecurityAuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!businessId || businessId === "undefined" || businessId === "null" || !auth.currentUser) return;
    const q = query(
      collection(db, "enterprise_audit_logs"),
      where("businessId", "==", businessId),
      limit(100)
    );

    const unsub = realtimeManager.subscribe(
      `enterprise_audit_logs:${businessId}`,
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        list.sort((a: any, b: any) => {
          const tA = a.timestamp?.seconds || (typeof a.timestamp === "string" ? new Date(a.timestamp).getTime() : 0);
          const tB = b.timestamp?.seconds || (typeof b.timestamp === "string" ? new Date(b.timestamp).getTime() : 0);
          return tB - tA;
        });
        setLogs(list);
      },
      (err) => {
        console.warn("[AuditConsole] Firestore snapshot notice:", err);
      }
    );

    return () => unsub();
  }, [businessId]);

  useEffect(() => {
    if (!auth.currentUser) return;
    
    // Load initial recent security logs
    const recent = SecurityAuditLogger.getRecentLogs(businessId);
    if (recent.length > 0) {
      setSecurityLogs(recent);
    }

    const qSec = query(
      collection(db, "security_audit_logs"),
      limit(100)
    );

    const unsubSec = realtimeManager.subscribe(
      `security_audit_logs:${businessId || 'GLOBAL'}`,
      qSec,
      (snapshot) => {
        const list = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() })) as SecurityAuditLog[];
        list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setSecurityLogs(list);
      },
      (err) => {
        console.warn("[AuditConsole] Security logs notice:", err);
      }
    );

    return () => unsubSec();
  }, [businessId]);

  const filteredLogs = logs.filter(l => 
    !searchQuery || 
    JSON.stringify(l).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSecLogs = securityLogs.filter(l =>
    !searchQuery ||
    JSON.stringify(l).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-8 bg-slate-950 min-h-screen text-slate-200">
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-3">
            <Shield className="text-emerald-500 w-6 h-6 sm:w-8 sm:h-8" />
            Enterprise Audit & Security Console
          </h1>
          <p className="text-sm text-slate-400">Cryptographically signed tenant isolation & forensic ledger</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Entity, Actor or Event..." 
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-300 focus:outline-none focus:border-cyan-500/50 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-2 border-b border-slate-800 pb-3 mb-6">
        <button
          onClick={() => setActiveTab("SECURITY")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition ${
            activeTab === "SECURITY"
              ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <Lock className="w-4 h-4" />
          Security & Tenant Isolation ({filteredSecLogs.length})
        </button>
        <button
          onClick={() => setActiveTab("ENTERPRISE")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition ${
            activeTab === "ENTERPRISE"
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <Terminal className="w-4 h-4" />
          Operational Domain Audit ({filteredLogs.length})
        </button>
      </div>

      {activeTab === "SECURITY" ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden font-mono shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-950/50 border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">Event Type</th>
                  <th className="px-6 py-4">Tenant Scope</th>
                  <th className="px-6 py-4">Actor</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Details & Seal</th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-slate-800">
                {filteredSecLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500 italic">
                      No security audit logs recorded yet.
                    </td>
                  </tr>
                ) : (
                  filteredSecLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-6 py-4 text-slate-500 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          log.eventType === "TENANT_SWITCH"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : log.eventType === "SESSION_PURGE"
                            ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                            : log.eventType === "ISOLATION_VIOLATION_BLOCKED"
                            ? "bg-red-500/20 text-red-300 border border-red-500/30"
                            : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                        }`}>
                          {log.eventType}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-300">
                        {log.previous_business_id ? (
                          <span className="flex items-center gap-1.5 text-slate-400">
                            <span className="text-amber-400">{log.previous_business_id}</span>
                            <ArrowRightLeft className="w-3 h-3 text-slate-500" />
                            <span className="text-emerald-400 font-bold">{log.target_business_id || log.business_id}</span>
                          </span>
                        ) : (
                          <span className="font-semibold text-emerald-400">{log.business_id}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-400">
                        <div>{log.actor_email || log.actor_uid}</div>
                        {log.actor_role && (
                          <span className="text-[10px] text-slate-500 uppercase">{log.actor_role}</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {log.status === "SUCCESS" || log.status === "AUDIT_OK" ? (
                          <span className="flex items-center gap-1 text-emerald-400 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> OK
                          </span>
                        ) : log.status === "BLOCKED" ? (
                          <span className="flex items-center gap-1 text-red-400 font-bold">
                            <AlertTriangle className="w-3.5 h-3.5" /> BLOCKED
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-amber-400 font-bold">
                            <AlertTriangle className="w-3.5 h-3.5" /> {log.status}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-400 text-[11px]">
                        <div className="truncate max-w-xs">{log.reason || JSON.stringify(log.details || {})}</div>
                        <div className="text-[9px] text-slate-600 font-mono mt-0.5 truncate max-w-xs">
                          Seal: {log.signature}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden font-mono shadow-xl">
          {/* DESKTOP TABLE */}
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-left">
              <thead className="bg-slate-950/50 border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">Module</th>
                  <th className="px-6 py-4">Action</th>
                  <th className="px-6 py-4">Entity</th>
                  <th className="px-6 py-4">Actor</th>
                  <th className="px-6 py-4">Severity</th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-slate-800">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500 italic">No audit logs found for this business unit.</td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-6 py-4 text-slate-500 whitespace-nowrap">{new Date(log.timestamp).toLocaleTimeString()}</td>
                      <td className="px-6 py-4">
                        <span className="text-blue-400">[{log.module}]</span>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-300">{log.action}</td>
                      <td className="px-6 py-4 text-slate-400 font-mono">{log.entityId}</td>
                      <td className="px-6 py-4 text-slate-500">{log.actorId || 'SYSTEM'}</td>
                      <td className="px-6 py-4">
                        {log.severity === 'CRITICAL' ? (
                          <span className="flex items-center gap-1.5 text-rose-500 font-black">
                            <AlertTriangle className="w-3 h-3" /> CRITICAL
                          </span>
                        ) : log.severity === 'WARNING' ? (
                          <span className="flex items-center gap-1.5 text-amber-500 font-black">
                            <AlertTriangle className="w-3 h-3" /> WARNING
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-emerald-500 font-black">
                            <Info className="w-3 h-3" /> INFO
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* MOBILE CARDS */}
          <div className="flex flex-col md:hidden divide-y divide-slate-800">
            {filteredLogs.length === 0 ? (
              <div className="px-6 py-12 text-center text-slate-500 italic text-xs">No audit logs found.</div>
            ) : (
              filteredLogs.map((log) => (
                <div key={log.id} className="p-4 flex flex-col gap-3 hover:bg-white/5 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-400 text-[10px] font-black uppercase">[{log.module}]</span>
                        <span className="text-slate-100 font-black text-xs">{log.action}</span>
                      </div>
                      <span className="text-[10px] text-slate-500">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    {log.severity === 'CRITICAL' ? (
                      <span className="flex items-center gap-1 text-rose-500 font-black text-[10px]">
                        <AlertTriangle className="w-3 h-3" /> CRITICAL
                      </span>
                    ) : log.severity === 'WARNING' ? (
                      <span className="flex items-center gap-1 text-amber-500 font-black text-[10px]">
                        <AlertTriangle className="w-3 h-3" /> WARNING
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-emerald-500 font-black text-[10px]">
                        <Info className="w-3 h-3" /> INFO
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-[10px] bg-slate-950/50 p-2 rounded-lg border border-slate-800/40">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-600 uppercase tracking-widest font-black">Entity</span>
                      <span className="text-slate-400 break-all">{log.entityId}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 items-end">
                      <span className="text-slate-600 uppercase tracking-widest font-black text-right">Actor</span>
                      <span className="text-slate-400 break-all">{log.actorId || 'SYSTEM'}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
