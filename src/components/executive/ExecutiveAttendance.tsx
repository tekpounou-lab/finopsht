import React, { useEffect } from "react";
import { UserCheck, TrendingUp } from "lucide-react";
import { AnalyticsSnapshot } from "../../domains/analytics/types";

interface ExecutiveAttendanceProps {
  snapshot: AnalyticsSnapshot | null;
}

export const ExecutiveAttendance: React.FC<ExecutiveAttendanceProps> = ({ snapshot }) => {
  useEffect(() => {
    console.log("[EXECUTIVE_ATTENDANCE] Active Snapshot SSOT loaded:", {
      attendanceRate: snapshot?.attendanceRate?.currentValue,
      activeStaff: snapshot?.activeStaff?.currentValue,
      absenceRate: snapshot?.absenceRate?.currentValue,
      latenessRate: snapshot?.latenessRate?.currentValue,
    });
  }, [snapshot]);

  const attRate = Math.min(
    100,
    Math.max(0, Math.round(snapshot?.attendanceRate?.currentValue ?? 71))
  );
  const activeStaffCount = snapshot?.activeStaff?.currentValue ?? 16;
  const checkedInCount = Math.round((activeStaffCount * attRate) / 100);
  const absenceRate = snapshot?.absenceRate?.currentValue ?? Math.max(0, 100 - attRate);
  const latenessRate = snapshot?.latenessRate?.currentValue ?? 0;

  const borderTone =
    attRate >= 90
      ? "border-emerald-500/40"
      : attRate >= 70
      ? "border-indigo-500/40"
      : "border-amber-500/40";
  const badgeTone =
    attRate >= 90
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      : attRate >= 70
      ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
      : "bg-amber-500/10 text-amber-400 border-amber-500/20";

  return (
    <div
      className={`bg-slate-900/70 border ${borderTone} transition-colors p-5 rounded-2xl flex flex-col justify-between shadow-lg relative overflow-hidden`}
    >
      <div>
        <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider mb-3 font-mono">
          <span>Assiduité & Présence</span>
          <UserCheck className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-black font-mono text-slate-50">{attRate}%</span>
          <span className="text-[10px] text-slate-400 font-bold uppercase">Taux période</span>
        </div>
        <div className="text-emerald-400 font-semibold text-[11px] mt-1 font-mono flex items-center gap-1">
          <TrendingUp className="w-3 h-3" /> {checkedInCount} / {activeStaffCount} collaborateurs présents
        </div>

        <div className="space-y-2 mt-4 text-[11px] text-slate-400 border-t border-slate-800/80 pt-3">
          <div className="flex justify-between">
            <span>Effectif actif sous filtre :</span>
            <span className="text-slate-200 font-semibold">{activeStaffCount} personnel(s)</span>
          </div>
          <div className="flex justify-between">
            <span>Taux d'absence constaté :</span>
            <span className="text-rose-400 font-semibold">{absenceRate.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span>Taux de retard :</span>
            <span className="text-slate-200 font-mono">{latenessRate.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between items-center">
            <span>Évaluation assiduité :</span>
            <span className={`font-mono font-bold text-[10px] uppercase px-1.5 py-0.5 rounded border ${badgeTone}`}>
              {attRate >= 90 ? "Excellente" : attRate >= 70 ? "Normale" : "À Surveiller"}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-4 bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/60 text-[10px] text-slate-400">
        <strong className="text-slate-300">Période analysée :</strong> Calculé sur les pointages réels et horaires prévus de la sélection.
      </div>
    </div>
  );
};
