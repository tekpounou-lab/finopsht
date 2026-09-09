import React, { useEffect } from "react";
import { Briefcase } from "lucide-react";
import { AnalyticsSnapshot } from "../../domains/analytics/types";

interface ExecutiveDepartmentExpensesProps {
  snapshot: AnalyticsSnapshot | null;
}

export const ExecutiveDepartmentExpenses: React.FC<ExecutiveDepartmentExpensesProps> = ({
  snapshot,
}) => {
  useEffect(() => {
    console.log("[EXECUTIVE_DEPARTMENT_EXPENSES] Active Snapshot SSOT loaded:", {
      totalExpenses: snapshot?.expenses?.currentValue,
      departmentPerformanceCount: snapshot?.departmentPerformance?.length,
      expenseBreakdownCount: snapshot?.expenseBreakdown?.length,
    });
  }, [snapshot]);

  const totalExp = snapshot?.expenses?.currentValue || 0;

  const deptData = React.useMemo(() => {
    if (snapshot?.departmentPerformance && snapshot.departmentPerformance.length > 0) {
      return snapshot.departmentPerformance.map((dp) => ({
        name: dp.departmentName || "Département",
        amount: dp.expenses || 0,
        percentage: totalExp > 0 ? Math.round(((dp.expenses || 0) / totalExp) * 100) : 0,
      }));
    }
    if (snapshot?.expenseBreakdown && snapshot.expenseBreakdown.length > 0) {
      return snapshot.expenseBreakdown.map((eb) => ({
        name: eb.name,
        amount: eb.value,
        percentage: totalExp > 0 ? Math.round((eb.value / totalExp) * 100) : 0,
      }));
    }
    return [
      { name: "Direction Générale", amount: Math.round(totalExp * 0.4), percentage: 40 },
      { name: "Opérations", amount: Math.round(totalExp * 0.35), percentage: 35 },
      { name: "Administration & RH", amount: Math.round(totalExp * 0.25), percentage: 25 },
    ];
  }, [snapshot, totalExp]);

  return (
    <div className="bg-slate-900/70 border border-slate-800/80 p-6 rounded-2xl flex flex-col justify-between shadow-lg">
      <div>
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold uppercase text-slate-200 tracking-wider block font-mono">
              Dépenses par Département
            </span>
          </div>
          <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
            Centre de Coût SSOT
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mb-4">
          Répartition des charges d'exploitation engagées par département pour la plage courante.
        </p>

        <div className="space-y-3">
          {deptData.map((d, idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-200">{d.name}</span>
                <div className="font-mono text-right">
                  <span className="text-amber-400 font-bold">
                    {d.amount.toLocaleString()} HTG
                  </span>
                  <span className="text-slate-500 text-[10px] ml-2">({d.percentage}%)</span>
                </div>
              </div>
              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-amber-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, d.percentage)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
