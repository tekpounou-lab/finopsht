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
    const list = stabilizedSnapshot?.branchPerformance || [];
    if (list.length === 0 && totalRev === 0) {
      return [];
    }

    // Map existing branch performance and handle missing/null branchName as 'Non Alloué'
    const mapped = list.map((bp) => ({
      name: bp.branchName || "Non Alloué",
      revenue: bp.revenue || 0,
      percentage: totalRev > 0 ? Math.round(((bp.revenue || 0) / totalRev) * 100) : 0,
    }));

    // Calculate sum of all explicit branch revenues
    const sumBranchRevenue = list.reduce((sum, bp) => sum + (bp.revenue || 0), 0);
    const unallocatedRevenue = totalRev - sumBranchRevenue;

    // If there is unallocated revenue (overall revenue exceeding the sum of branch revenues), represent it explicitly
    if (unallocatedRevenue > 0.01) {
      mapped.push({
        name: "Non Alloué",
        revenue: unallocatedRevenue,
        percentage: totalRev > 0 ? Math.round((unallocatedRevenue / totalRev) * 100) : 0,
      });
    }

    return mapped.sort((a, b) => b.revenue - a.revenue);
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

        {branchData.length === 0 ? (
          <div className="py-8 px-4 text-center rounded-xl bg-slate-950/40 border border-slate-800/50 my-2">
            <p className="text-xs text-slate-400 font-mono">
              Aucun revenu enregistré par succursale sur cette plage temporelle.
            </p>
            <p className="text-[10px] text-slate-500 mt-1">
              Les transactions de vente et d'activité sectorielles s'afficheront ici dynamiquement.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {branchData.map((b, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-200">{b.name}</span>
                  <div className="font-mono text-right">
                    <span className="text-emerald-400 font-bold">
                      +{b.revenue.toLocaleString()} HTG
                    </span>
                    <span className="text-slate-500 text-[10px] ml-2">( {b.percentage}% )</span>
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
        )}
      </div>
    </div>
  );
};

export const ExecutiveBranchRevenue = React.memo(
  ExecutiveBranchRevenueComponent,
  (prev, next) => getSnapshotSemanticSignature(prev.snapshot) === getSnapshotSemanticSignature(next.snapshot)
);

