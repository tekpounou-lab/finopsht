import React from "react";
import { History, CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { AttendanceRecord } from "../../../types";

interface RecentClockInsProps {
  records: AttendanceRecord[];
  employeeId: string;
  tw: any;
}

export const RecentClockIns: React.FC<RecentClockInsProps> = ({
  records,
  employeeId,
  tw,
}) => {
  const employeeRecords = records
    .filter((r) => r.employeeId === employeeId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8); // Keep the latest 8 entries

  const getStatusIcon = (status: AttendanceRecord["status"]) => {
    switch (status) {
      case "NORMAL":
      case "OVERTIME":
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case "ABSENT":
        return <XCircle className="w-4 h-4 text-rose-400" />;
      case "PENDING_VERIFICATION":
        return <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />;
      default:
        return <AlertCircle className="w-4 h-4 text-amber-400" />;
    }
  };

  const getStatusBadge = (status: AttendanceRecord["status"]) => {
    switch (status) {
      case "NORMAL":
        return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
      case "OVERTIME":
        return "bg-cyan-500/10 border-cyan-500/20 text-cyan-400";
      case "LATE":
        return "bg-rose-500/10 border-rose-500/20 text-rose-400";
      case "PENDING_VERIFICATION":
        return "bg-amber-500/10 border-amber-500/20 text-amber-400";
      default:
        return "bg-slate-500/10 border-slate-500/20 text-slate-400";
    }
  };

  return (
    <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col h-full" id="workspace-clockins-ledger">
      <h3 className="text-xs font-black font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-4 pb-2 border-b border-slate-800/50">
        <History className="w-4.5 h-4.5 text-cyan-400" />
        {tw.pointagesRecents || "REGISTRE DE VOS POINTAGES RÉCENTS"}
      </h3>

      {employeeRecords.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-950/40 border border-dashed border-slate-800/60 rounded-2xl">
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
            {tw.emptyPresence || "Aucun pointage enregistré"}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800/50 text-[9px] font-mono text-slate-500 uppercase tracking-wider">
                <th className="py-2.5 font-bold">{tw.dateCol || "Date"}</th>
                <th className="py-2.5 font-bold">{tw.entree || "Entrée"}</th>
                <th className="py-2.5 font-bold">{tw.sortie || "Sortie"}</th>
                <th className="py-2.5 font-bold">{tw.heuresEffectives || "Durée"}</th>
                <th className="py-2.5 font-bold text-right">{tw.statusCol || "Statut"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 text-[11px] font-mono text-slate-300">
              {employeeRecords.map((r) => (
                <tr key={r.id} className="hover:bg-slate-950/40 transition-colors">
                  <td className="py-3 font-bold text-slate-200">
                    {new Date(r.date).toLocaleDateString()}
                  </td>
                  <td className="py-3 text-emerald-400 font-bold">{r.checkIn || "--:--"}</td>
                  <td className="py-3 text-cyan-400 font-bold">{r.checkOut || "--:--"}</td>
                  <td className="py-3 text-slate-400">
                    {r.realHours > 0 ? `${r.realHours.toFixed(1)} h` : "--"}
                  </td>
                  <td className="py-3 text-right">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[8px] font-black tracking-widest uppercase ${getStatusBadge(
                        r.status
                      )}`}
                    >
                      {getStatusIcon(r.status)}
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
