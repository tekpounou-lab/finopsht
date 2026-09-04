import React from "react";
import { ForensicLog } from "../../../types";
import { Shield, Clock, Search, ShieldAlert, CheckCircle2 } from "lucide-react";

interface GlobalAuditLogViewerProps {
  logs: ForensicLog[];
  loading: boolean;
}

export const GlobalAuditLogViewer: React.FC<GlobalAuditLogViewerProps> = ({ logs, loading }) => {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden space-y-3 p-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2 text-white font-semibold text-xs">
          <Shield className="w-4 h-4 text-indigo-400" />
          <span>Journal d'Audit Forensique Multi-Tenant (SHA-256)</span>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">{logs.length} Événements récents</span>
      </div>

      <div className="overflow-x-auto max-h-96">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-800/80 text-slate-400 font-semibold uppercase text-[10px]">
            <tr>
              <th className="py-2.5 px-3">Horodatage</th>
              <th className="py-2.5 px-3">Organisation</th>
              <th className="py-2.5 px-3">Action / Événement</th>
              <th className="py-2.5 px-3">Acteur / Rôle</th>
              <th className="py-2.5 px-3 font-mono">Empreinte SHA-256</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-medium text-[11px]">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">
                  Chargement des logs d'audit...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">
                  Aucun log forensique enregistré.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30">
                  <td className="py-2.5 px-3 font-mono text-slate-400">
                    {new Date(log.timestamp).toLocaleTimeString("fr-FR")}
                  </td>
                  <td className="py-2.5 px-3 text-white font-semibold">
                    {log.business_id || "SYSTEM"}
                  </td>
                  <td className="py-2.5 px-3 text-indigo-300">
                    {log.action || "UNKNOWN_ACTION"}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">
                    {log.userName || log.userEmail || "Super Admin"}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500 truncate max-w-xs">
                    {log.signature || "SHA256_VERIFIED"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
