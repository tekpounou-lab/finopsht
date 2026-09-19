import React from "react";
import { Building } from "lucide-react";
import { AnalyticsSnapshot } from "../../domains/analytics/types";
import { useLoggedSnapshot, getSnapshotSemanticSignature } from "../../hooks/useLoggedSnapshot";

interface ExecutiveBranchRevenueProps {
  snapshot: AnalyticsSnapshot | null;
}

const ExecutiveBranchRevenueComponent: React.FC<ExecutiveBranchRevenueProps> = ({ snapshot }) => {
  const { stabilizedSnapshot } = useLoggedSnapshot("EXECUTIVE_BRANCH_REVENUE", snapshot);

  const totalRev = stabilizedSnapshot?.revenue?.currentValue || 0;

  const branchData = React.useMemo(() => {
    if (stabilizedSnapshot?.branchPerformance && stabilizedSnapshot.branchPerformance.length > 0) {
      return stabilizedSnapshot.branchPerformance.map((bp) => ({
        name: bp.branchName || "Bureau Central",
        revenue: bp.revenue || totalRev,
        percentage: totalRev > 0 ? Math.round(((bp.revenue || totalRev) / totalRev) * 100) : 100,
      }));
    }
    return [
      {
        name: "Bureau Central",
        revenue: totalRev,
        percentage: 100,
      },
    ];
  }, [stabilizedSnapshot, totalRev]);

  return (
    <div className="bg-slate-900/70 border border-slate-800/80 p-6 rounded-2xl flex flex-col justify-between shadow-lg">
      <div>
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold uppercase text-slate-200 tracking-wider block font-mono">
              Revenus par Succursale
            </span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            Période Sélectionnée
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mb-4">
          Distribution du chiffre d'affaires par succursale opérationnelle pour le filtre en cours.
        </p>

        <div className="space-y-3">
          {branchData.map((b, idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-200">{b.name}</span>
                <div className="font-mono text-right">
                  <span className="text-emerald-400 font-bold">
                    +{b.revenue.toLocaleString()} HTG
                  </span>
                  <span className="text-slate-500 text-[10px] ml-2">({b.percentage}%)</span>
                </div>
              </div>
              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, b.percentage)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const ExecutiveBranchRevenue = React.memo(
  ExecutiveBranchRevenueComponent,
  (prev, next) => getSnapshotSemanticSignature(prev.snapshot) === getSnapshotSemanticSignature(next.snapshot)
);

