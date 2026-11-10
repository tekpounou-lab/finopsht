import React from "react";
import { motion } from "motion/react";
import { TrendingUp, Clock, AlertTriangle, Download } from "lucide-react";
import { PayrollAggregates } from "../types";
import { useAnalyticsFilters } from "../../../contexts/AnalyticsFilterContext";

interface BIExecutiveKpisProps {
  tbi: Record<string, string>;
  totalRevenue: number | null;
  totalExpenses: number | null;
  netProfit: number | null;
  profitMarginPercentage: number | null;
  payrollAggregates?: PayrollAggregates;
  isSocialTaxEnabled: boolean;
  activeEmployeesCount: number | null;
  selectedBranchId?: string;
  attendanceAggregates: {
    attendanceRate: number | null;
    attendanceFrequency: number | null;
    latenessRate: number | null;
    absenceRate: number | null;
    avgHours: number | null;
    overrides: number;
  };
  totalAdvancesPending: number | null;
  biSnapshot: any;
  isLoading?: boolean;
  handleSaveSnapshot: () => void;
  isSimplifiedMode?: boolean;
  cashSnapshot?: any;
  accrualSnapshot?: any;
}

export const BIExecutiveKpis: React.FC<BIExecutiveKpisProps> = ({
  tbi,
  totalRevenue,
  totalExpenses,
  netProfit,
  profitMarginPercentage,
  payrollAggregates,
  isSocialTaxEnabled,
  activeEmployeesCount,
  selectedBranchId: selectedBranchIdProp,
  attendanceAggregates,
  totalAdvancesPending,
  biSnapshot,
  isLoading = false,
  handleSaveSnapshot,
  isSimplifiedMode = false,
  cashSnapshot,
  accrualSnapshot,
}) => {
  const { filters } = useAnalyticsFilters();
  const selectedBranchId = selectedBranchIdProp !== undefined ? selectedBranchIdProp : filters.branchId;

  const rev = totalRevenue;
  const exp = totalExpenses;
  
  // DEF-9B-02: Canonical Net Cash Flow vs Operating Result.
  // In simplified mode, "Variation de trésorerie" MUST strictly bind to canonical net cash flow (inflows - outflows),
  // NEVER falling back to Net Profit (Revenue - Expenses).
  const cashVariation = cashSnapshot?.netCashFlow !== undefined ? cashSnapshot.netCashFlow : (biSnapshot?.netCashFlow?.currentValue !== undefined ? biSnapshot.netCashFlow.currentValue : null);
  const operatingResult = netProfit;
  const card3Value = isSimplifiedMode ? cashVariation : operatingResult;
  const payroll = isSimplifiedMode
    ? (cashSnapshot?.cashOut?.payrollPaid !== undefined ? cashSnapshot.cashOut.payrollPaid : (payrollAggregates?.payrollPaid ?? null))
    : (accrualSnapshot?.payrollAccrued?.total !== undefined ? accrualSnapshot.payrollAccrued.total : (payrollAggregates?.totalEmploymentCost ?? null));

  const activeCurrency = (filters as any).currency || (filters as any).selectedCurrency || "HTG";

  const formatAmount = (val: number | null | undefined, prefix = "") => {
    if (val === null || val === undefined) {
      return <span className="text-slate-500 font-sans text-sm font-normal">N/D</span>;
    }
    return (
      <>
        {prefix}{val.toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">{activeCurrency}</span>
      </>
    );
  };

  const formatPct = (val: number | null | undefined) => {
    if (val === null || val === undefined) {
      return "N/D";
    }
    return `${val}%`;
  };

  const formatCount = (val: number | null | undefined, unit = "agents") => {
    if (val === null || val === undefined) {
      return <span className="text-slate-500 font-sans text-sm font-normal">N/D</span>;
    }
    return (
      <>
        {val} <span className="text-[10.5px] text-slate-500 font-normal lowercase">{unit}</span>
      </>
    );
  };

  return (
    <div className="flex flex-col gap-2.5">
      {totalRevenue === 0 && totalExpenses === 0 && (
        <div className="mb-4 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 flex items-center gap-3 font-sans text-xs animate-in fade-in duration-300">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div>
            <span className="font-bold">{tbi.noData}</span>
            <p className="text-[10px] text-amber-500/80 mt-0.5">
              Aucun mouvement n'a été enregistré dans le Grand Livre ou la paie de l'entreprise pour les filtres sélectionnés.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase font-extrabold text-slate-400 tracking-wider flex items-center gap-1.5">
          <span className="w-1.5 h-3.5 bg-cyan-500 rounded-sm"></span>
          {tbi.executiveKpis}
        </h3>
        <button
          onClick={handleSaveSnapshot}
          className="text-xs font-bold font-mono px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg flex items-center gap-2 transition cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          {tbi.aiCfoTitle?.includes("Snapshot") ? tbi.aiCfoTitle : "Archiver Snapshot Journalier"}
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="bg-slate-900/60 border border-slate-800 rounded-xl h-[6rem] p-4 flex flex-col justify-between">
              <div className="h-2 w-2/3 bg-slate-800 rounded"></div>
              <div className="h-4 w-1/2 bg-slate-800 rounded mt-2"></div>
              <div className="h-2 w-1/3 bg-slate-800 rounded"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="bi-kpi-grid">
          {/* Revenue */}
          <motion.div
            whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="glass p-4 rounded-xl border-l-2 border-l-emerald-500 flex flex-col justify-between min-h-[6rem] shadow"
          >
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider truncate">
              {isSimplifiedMode ? "Argent entré (Caisse)" : tbi.revenue}
            </span>
            <div className="font-mono text-lg sm:text-base font-black text-emerald-400 mt-1 truncate" title={rev !== null && rev !== undefined ? `${rev.toLocaleString()} HTG` : "N/D"}>
              {formatAmount(rev, "+")}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-emerald-500 font-semibold truncate">
              <TrendingUp className="w-3 h-3 shrink-0" />
              <span className="truncate">{isSimplifiedMode ? "Flux de trésorerie effectif" : "Comptabilité d'exercice"}</span>
            </div>
          </motion.div>

          {/* Expenses */}
          <motion.div
            whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="glass p-4 rounded-xl border-l-2 border-l-rose-500 flex flex-col justify-between min-h-[6rem] shadow"
          >
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider truncate">
              {isSimplifiedMode ? "Argent sorti (Décaissements)" : tbi.expenses}
            </span>
            <div className="font-mono text-lg sm:text-base font-black text-rose-500 mt-1 truncate" title={exp !== null && exp !== undefined ? `-${exp.toLocaleString()} HTG` : "N/D"}>
              {formatAmount(exp, "-")}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-slate-500 truncate">
              <Clock className="w-3 h-3 shrink-0" />
              <span className="truncate">{isSimplifiedMode ? "Sorties de caisse réelles" : "Factures reçues et passifs"}</span>
            </div>
          </motion.div>

          {/* Net Cash Flow (Simplified) / Operating Result (Accrual) - DEF-9B-02 & DEF-9B-03 */}
          <motion.div
            whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="glass p-4 rounded-xl border-l-2 border-l-cyan-500 flex flex-col justify-between min-h-[6rem] shadow"
          >
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider truncate">
              {isSimplifiedMode ? "Variation de trésorerie" : tbi.netProfit}
            </span>
            <div className={`font-mono text-lg sm:text-base font-black mt-1 truncate ${card3Value !== null && card3Value >= 0 ? "text-cyan-400" : "text-rose-400"}`} title={card3Value !== null && card3Value !== undefined ? `${card3Value >= 0 ? "+" : ""}${card3Value.toLocaleString()} HTG` : "N/D"}>
              {card3Value !== null && card3Value !== undefined ? `${card3Value >= 0 ? "+" : ""}${card3Value.toLocaleString()}` : <span className="text-slate-500 font-sans text-sm font-normal">N/D</span>} {card3Value !== null && card3Value !== undefined && <span className="text-[10px] text-slate-500 font-normal">HTG</span>}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-slate-400 truncate">
              {isSimplifiedMode ? (
                <>
                  <span className="font-semibold text-cyan-400">Flux net</span>
                  <span className="truncate">Encaissements - Décaissements</span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-cyan-400">{profitMarginPercentage !== null && profitMarginPercentage !== undefined ? `${profitMarginPercentage}%` : "N/D"}</span>
                  <span className="truncate" title={rev !== null && exp !== null ? `Formule SSOT: Recettes (${rev.toLocaleString()}) - Dépenses (${exp.toLocaleString()}) = ${card3Value !== null ? card3Value.toLocaleString() : 0} HTG` : ""}>
                    {tbi.profitMargin} {rev !== null && exp !== null ? `(Recettes - Dépenses)` : ""}
                  </span>
                </>
              )}
            </div>
          </motion.div>

          {/* Payroll cost */}
          <motion.div
            whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="glass p-4 rounded-xl border-l-2 border-l-indigo-500 flex flex-col justify-between min-h-[6rem] shadow"
          >
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider truncate">
              {isSimplifiedMode ? "Salaires payés (Virements)" : "Masse salariale engagée"}
            </span>
            <div className="font-mono text-lg sm:text-base font-black text-indigo-400 mt-1 truncate" title={payroll !== null && payroll !== undefined ? `${payroll.toLocaleString()} HTG` : "N/D"}>
              {formatAmount(payroll)}
            </div>
            <div className="text-[9.5px] text-slate-500 font-normal truncate">
              {isSimplifiedMode ? "RH : Décaissements effectifs" : "RH : Brut + Charges patronales (ONA/OFATMA)"}
            </div>
          </motion.div>

          {/* Active staff */}
          <motion.div
            whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="glass p-4 rounded-xl border-l-2 border-l-teal-500 flex flex-col justify-between min-h-[6rem] shadow"
          >
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider truncate">{tbi.activeStaff}</span>
            <div className="font-sans text-lg sm:text-base font-black text-teal-400 mt-1 truncate">
              {formatCount(activeEmployeesCount)}
            </div>
            <div className="text-[9.5px] text-slate-500 truncate">
              {selectedBranchId === "ALL" ? tbi.allBranches : tbi.operationalStatus}
            </div>
          </motion.div>

          {/* Attendance Performance (Rate & Frequency) - Align with BI-14-01 & BI-14-02 */}
          <motion.div
            whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="glass p-4 rounded-xl border-l-2 border-l-green-500 flex flex-col justify-between min-h-[6rem] shadow"
          >
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider truncate">{tbi.attendanceRate}</span>
            <div className="flex items-baseline gap-2 mt-1 truncate">
              <div className="font-mono text-lg sm:text-base font-black text-green-400" title={`Performance horaire: ${attendanceAggregates.attendanceRate}%`}>
                {formatPct(attendanceAggregates.attendanceRate)}
              </div>
              {attendanceAggregates.attendanceFrequency !== null && (
                <div className="text-[10px] font-mono font-bold text-slate-400 border-l border-slate-800 pl-2" title={`Fidélité de présence: ${attendanceAggregates.attendanceFrequency}%`}>
                  {attendanceAggregates.attendanceFrequency}% <span className="text-[8px] font-normal uppercase opacity-70">Assiduité</span>
                </div>
              )}
            </div>
            <div className="text-[9.5px] text-slate-500 truncate flex items-center gap-1.5">
               {attendanceAggregates.avgHours === null && attendanceAggregates.attendanceRate === null ? (
                 <span className="text-amber-500 font-bold flex items-center gap-1">
                   <AlertTriangle className="w-3 h-3" /> {tbi.incompleteConfig}
                 </span>
               ) : (
                 <>
                   <span className="opacity-70">{tbi.avgWorkHours}:</span>
                   <span className="font-bold text-slate-300">{attendanceAggregates.avgHours !== null ? `${attendanceAggregates.avgHours} hrs` : "N/D"}</span>
                 </>
               )}
            </div>
          </motion.div>

          {/* Absenteeism rate */}
          <motion.div
            whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="glass p-4 rounded-xl border-l-2 border-l-amber-500 flex flex-col justify-between min-h-[6rem] shadow"
          >
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider truncate">{tbi.absenteeismRate}</span>
            <div className="font-mono text-lg sm:text-base font-black text-amber-500 mt-1 truncate">
              {formatPct(attendanceAggregates.absenceRate)}
            </div>
            <div className="text-[9.5px] text-slate-500 truncate">
              {attendanceAggregates.overrides} {tbi.auditOverrides}
            </div>
          </motion.div>

          {/* Debt exposure */}
          <motion.div
            whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="glass p-4 rounded-xl border-l-2 border-l-purple-500 flex flex-col justify-between min-h-[6rem] shadow"
          >
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider truncate">{tbi.debtExposure}</span>
            <div className="font-mono text-lg sm:text-base font-black text-purple-400 mt-1 truncate" title={totalAdvancesPending !== null && totalAdvancesPending !== undefined ? `${totalAdvancesPending.toLocaleString()} HTG` : "N/D"}>
              {formatAmount(totalAdvancesPending)}
            </div>
            <div className="text-[9.5px] text-purple-500 font-medium tracking-tight truncate">
              {tbi.glDeductions}
            </div>
          </motion.div>

          {/* 7-Day Net Operating Projection - DEF-9B-04 */}
          <motion.div
            whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="glass p-4 rounded-xl border-l-2 border-l-fuchsia-500 flex flex-col justify-between min-h-[6rem] shadow"
          >
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider truncate">{tbi.projection7Days}</span>
            <div className={`font-mono text-lg sm:text-base font-black mt-1 truncate ${(biSnapshot?.forecast?.forecast7Days || 0) >= 0 ? "text-fuchsia-400" : "text-rose-400"}`} title={`${(biSnapshot?.forecast?.forecast7Days || 0).toLocaleString()} HTG`}>
              {(biSnapshot?.forecast?.forecast7Days || 0) >= 0 ? "+" : ""}{(biSnapshot?.forecast?.forecast7Days || 0).toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">HTG</span>
            </div>
            <div className="text-[9.5px] text-slate-500 truncate">
              {tbi.burnRateLabel}: {(biSnapshot?.burnRate?.currentValue || 0).toLocaleString()} HTG/j
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
