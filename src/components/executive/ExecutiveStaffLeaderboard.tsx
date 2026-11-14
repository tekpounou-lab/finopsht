import React from "react";
import { Award } from "lucide-react";
import { AnalyticsSnapshot } from "../../domains/analytics/types";
import { useLoggedSnapshot, getSnapshotSemanticSignature } from "../../hooks/useLoggedSnapshot";

interface ExecutiveStaffLeaderboardProps {
  snapshot: AnalyticsSnapshot | null;
  employees?: any[];
  branches?: { id: string; branch_id?: string; name?: string }[];
  currency?: string;
}

const ExecutiveStaffLeaderboardComponent: React.FC<ExecutiveStaffLeaderboardProps> = ({
  snapshot,
  branches = [],
  currency = "HTG",
}) => {
  const { stabilizedSnapshot } = useLoggedSnapshot("EXECUTIVE_STAFF_LEADERBOARD", snapshot);

  const branchNameMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (branches || []).forEach((b) => {
      if (b.id && b.name) map.set(b.id, b.name);
      if (b.branch_id && b.name) map.set(b.branch_id, b.name);
    });
    return map;
  }, [branches]);

  const leaderboardData = React.useMemo(() => {
    if (stabilizedSnapshot?.employeeScorecards && stabilizedSnapshot.employeeScorecards.length > 0) {
      return stabilizedSnapshot.employeeScorecards.slice(0, 6).map((sc) => ({
        employeeId: sc.employeeId,
        employeeName: sc.employeeName,
        netPaid: sc.netPaid || sc.commissions || 0,
        hoursWorked: sc.totalHours || 0,
        performanceScore:
          sc.attendanceConsistencyScore !== null && sc.attendanceConsistencyScore !== undefined
            ? Math.round((sc.attendanceConsistencyScore + sc.productivityIndex) / 2)
            : Math.round(sc.productivityIndex || 0),
        branchName: (sc.branchId && branchNameMap.get(sc.branchId)) || "Non assignée",
      }));
    }
    return [];
  }, [stabilizedSnapshot, branchNameMap]);

  return (
    <div className="bg-slate-900/70 border border-slate-800/80 p-6 rounded-2xl flex flex-col justify-between shadow-lg">
      <div>
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold uppercase text-slate-200 tracking-wider block font-mono">
              Elite Staff Performance Leaderboard
            </span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            Période Active SSOT
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mb-4">
          Classement des collaborateurs selon les heures réelles enregistrées aux poinçonneurs et leurs performances.
        </p>

        <div className="space-y-2.5">
          {leaderboardData.length > 0 ? (
            leaderboardData.map((staff: any, idx: number) => {
              const hours = staff.hoursWorked ?? staff.realHours ?? 0;
              const pay = staff.netPaid ?? staff.amount ?? 0;
              return (
                <div
                  key={staff.employeeId || idx}
                  className="p-3 bg-slate-950/60 border border-slate-800/60 rounded-xl flex justify-between items-center hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-6 h-6 rounded-full font-mono text-[11px] font-black flex items-center justify-center ${
                        idx === 0
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                          : idx === 1
                          ? "bg-slate-400/20 text-slate-300 border border-slate-400/40"
                          : idx === 2
                          ? "bg-amber-700/20 text-amber-500 border border-amber-700/40"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      #{idx + 1}
                    </span>
                    <div>
                      <span className="text-xs font-bold text-slate-100 block">
                        {staff.employeeName}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {staff.branchName}
                      </span>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <span className="text-xs font-bold text-emerald-400 block">
                      {hours} hrs réelles
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {pay > 0 ? `${pay.toLocaleString()} ${currency}` : "Pointage régulier"}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-6 text-center text-slate-500 text-xs font-mono">
              Aucun registre de présence ou de paie pour cette sélection.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ExecutiveStaffLeaderboard = React.memo(
  ExecutiveStaffLeaderboardComponent,
  (prev, next) =>
    prev.employees === next.employees &&
    prev.branches === next.branches &&
    prev.currency === next.currency &&
    getSnapshotSemanticSignature(prev.snapshot) === getSnapshotSemanticSignature(next.snapshot)
);
