import React, { useState, useMemo } from "react";
import { Briefcase, Layers, Wallet, TrendingDown } from "lucide-react";
import { AnalyticsSnapshot, DepartmentPerformance } from "../../domains/analytics/types";
import { useLoggedSnapshot, getSnapshotSemanticSignature } from "../../hooks/useLoggedSnapshot";

interface ExecutiveDepartmentExpensesProps {
  snapshot: AnalyticsSnapshot | null;
}

type ExpenseViewMode = "all" | "operational" | "payroll";

const ExecutiveDepartmentExpensesComponent: React.FC<ExecutiveDepartmentExpensesProps> = ({
  snapshot,
}) => {
  const [viewMode, setViewMode] = useState<ExpenseViewMode>("all");
  const { stabilizedSnapshot } = useLoggedSnapshot("EXECUTIVE_DEPARTMENT_EXPENSES", snapshot);

  const rawDeptList = stabilizedSnapshot?.departmentPerformance || [];

  // Calculate totals according to view mode based on SSOT data
  const modeTotals = useMemo(() => {
    const totalAll = stabilizedSnapshot?.totalExpenses?.currentValue ?? stabilizedSnapshot?.expenses?.currentValue ?? 0;
    const totalOperational = stabilizedSnapshot?.operationalExpenses?.currentValue ?? 
      rawDeptList.reduce((sum, d) => sum + (d.nonPayrollExpenses || 0), 0);
    const totalPayroll = stabilizedSnapshot?.payrollCost?.currentValue ?? 
      rawDeptList.reduce((sum, d) => sum + (d.payrollCost || 0), 0);

    return {
      all: totalAll,
      operational: totalOperational,
      payroll: totalPayroll,
    };
  }, [stabilizedSnapshot, rawDeptList]);

  const activeTotal = modeTotals[viewMode];

  const deptData = useMemo(() => {
    if (!rawDeptList || rawDeptList.length === 0) {
      return [];
    }

    return rawDeptList
      .map((dp: DepartmentPerformance) => {
        let amount = 0;
        if (viewMode === "operational") {
          amount = dp.nonPayrollExpenses || 0;
        } else if (viewMode === "payroll") {
          amount = dp.payrollCost || 0;
        } else {
          amount = dp.expenses || ((dp.payrollCost || 0) + (dp.nonPayrollExpenses || 0));
        }

        const percentage = activeTotal > 0 ? Math.round((amount / activeTotal) * 100) : 0;

        return {
          id: dp.departmentId,
          name: dp.departmentName || "Département",
          amount,
          payrollCost: dp.payrollCost || 0,
          nonPayrollExpenses: dp.nonPayrollExpenses || 0,
          employeeCount: dp.employeeCount || 0,
          percentage,
        };
      })
      .filter((d) => d.amount > 0 || viewMode === "all")
      .sort((a, b) => b.amount - a.amount);
  }, [rawDeptList, viewMode, activeTotal]);

  const hasExpenses = deptData.some((d) => d.amount > 0);

  return (
    <div 
      className="bg-slate-900/70 border border-slate-800/80 p-6 rounded-2xl flex flex-col justify-between shadow-lg"
      id="executive-department-expenses-card"
    >
      <div>
        {/* Header with Title & SSOT Badge */}
        <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold uppercase text-slate-200 tracking-wider font-mono">
              Dépenses par Département
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              SSOT Période Active
            </span>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 mb-4">
          Ventilation analytique par centre de coût conforme aux règles SSOT (dissociation stricte Grand Livre et Paie scellée).
        </p>

        {/* View Mode Segmented Controls */}
        <div className="flex items-center gap-1.5 mb-4 bg-slate-950/70 p-1 rounded-xl border border-slate-800/80">
          <button
            type="button"
            onClick={() => setViewMode("all")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-mono font-medium transition-all ${
              viewMode === "all"
                ? "bg-amber-500 text-slate-950 font-bold shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Toutes ({activeTotal.toLocaleString()} HTG)</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("operational")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-mono font-medium transition-all ${
              viewMode === "operational"
                ? "bg-amber-500 text-slate-950 font-bold shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            <span>Exploitation GL</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("payroll")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-mono font-medium transition-all ${
              viewMode === "payroll"
                ? "bg-amber-500 text-slate-950 font-bold shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Masse Salariale</span>
          </button>
        </div>

        {/* Department List or SSOT Empty State */}
        {!hasExpenses ? (
          <div className="py-8 px-4 text-center rounded-xl bg-slate-950/40 border border-slate-800/50 my-2">
            <p className="text-xs text-slate-400 font-mono">
              Aucune dépense enregistrée pour les départements sur cette plage temporelle.
            </p>
            <p className="text-[10px] text-slate-500 mt-1">
              Les écritures du Grand Livre et les bulletins scellés de la période s'afficheront ici dynamiquement.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {deptData.map((d) => (
              <div key={d.id} className="space-y-1.5 bg-slate-950/30 p-2.5 rounded-xl border border-slate-800/40">
                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-200">{d.name}</span>
                    {d.employeeCount > 0 && (
                      <span className="text-[10px] text-slate-400 font-mono bg-slate-800/60 px-1.5 py-0.2 rounded">
                        {d.employeeCount} emp.
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-right">
                    <span className="text-amber-400 font-bold">
                      {d.amount.toLocaleString()} HTG
                    </span>
                    <span className="text-slate-500 text-[10px] ml-1.5">({d.percentage}%)</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-amber-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, d.percentage))}%` }}
                  />
                </div>

                {/* Sub-breakdown: SSOT Paie vs SSOT Exploitation */}
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 pt-0.5">
                  <span>
                    Exploitation (GL) : <strong className="text-slate-300">{d.nonPayrollExpenses.toLocaleString()} HTG</strong>
                  </span>
                  <span>
                    Paie scellée : <strong className="text-slate-300">{d.payrollCost.toLocaleString()} HTG</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const ExecutiveDepartmentExpenses = React.memo(
  ExecutiveDepartmentExpensesComponent,
  (prev, next) => getSnapshotSemanticSignature(prev.snapshot) === getSnapshotSemanticSignature(next.snapshot)
);
