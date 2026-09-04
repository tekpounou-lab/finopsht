import React from "react";
import { motion } from "motion/react";
import { TrendingUp, Clock, AlertTriangle, Download } from "lucide-react";
import { PayrollAggregates } from "../types";

interface BIExecutiveKpisProps {
  tbi: Record<string, string>;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  profitMarginPercentage: number;
  payrollAggregates?: PayrollAggregates;
  isSocialTaxEnabled: boolean;
  activeEmployeesCount: number;
  selectedBranchId: string;
  attendanceAggregates: {
    attendanceRate: number;
    latenessRate: number;
    absenceRate: number;
    avgHours: number;
    overrides: number;
  };
  totalAdvancesPending: number;
  biSnapshot: any;
  isLoading?: boolean;
  handleSaveSnapshot: () => void;
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
  selectedBranchId,
  attendanceAggregates,
  totalAdvancesPending,
  biSnapshot,
  isLoading = false,
  handleSaveSnapshot,
}) => {
  return (
    <div className="flex flex-col gap-2.5">
      {totalRevenue === 0 && totalExpenses === 0 && (
        <div className="mb-4 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 flex items-center gap-3 font-sans text-xs animate-in fade-in duration-300">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div>
            <span className="font-bold">Aucune donnée financière disponible pour cette période.</span>
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
          Archiver Snapshot Journalier
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
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider truncate">{tbi.revenue}</span>
            <div className="font-mono text-lg sm:text-base font-black text-emerald-400 mt-1 truncate" title={(totalRevenue || 0).toLocaleString() + " HTG"}>
              +{(totalRevenue || 0).toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">HTG</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-emerald-500 font-semibold truncate">
              <TrendingUp className="w-3 h-3 shrink-0" />
              <span className="truncate">Conforme (Caisse active)</span>
            </div>
          </motion.div>

          {/* Expenses */}
          <motion.div
            whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="glass p-4 rounded-xl border-l-2 border-l-rose-500 flex flex-col justify-between min-h-[6rem] shadow"
          >
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider truncate">{tbi.expenses}</span>
            <div className="font-mono text-lg sm:text-base font-black text-rose-500 mt-1 truncate" title={`-${(totalExpenses || 0).toLocaleString()} HTG`}>
              -{(totalExpenses || 0).toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">HTG</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-slate-500 truncate">
              <Clock className="w-3 h-3 shrink-0" />
              <span className="truncate">Sert à l'investissement</span>
            </div>
          </motion.div>

          {/* Net Profit */}
          <motion.div
            whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="glass p-4 rounded-xl border-l-2 border-l-cyan-500 flex flex-col justify-between min-h-[6rem] shadow"
          >
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider truncate">{tbi.netProfit}</span>
            <div className={`font-mono text-lg sm:text-base font-black mt-1 truncate ${netProfit >= 0 ? "text-cyan-400" : "text-rose-400"}`} title={`${netProfit >= 0 ? "+" : ""}${(netProfit || 0).toLocaleString()} HTG`}>
              {netProfit >= 0 ? "+" : ""}{(netProfit || 0).toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">HTG</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-slate-400 truncate">
              <span className="font-semibold text-cyan-400">{profitMarginPercentage}%</span>
              <span className="truncate">{tbi.profitMargin}</span>
            </div>
          </motion.div>

          {/* Payroll cost */}
          <motion.div
            whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="glass p-4 rounded-xl border-l-2 border-l-indigo-500 flex flex-col justify-between min-h-[6rem] shadow"
          >
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider truncate">{tbi.payrollCost}</span>
            <div className="font-mono text-lg sm:text-base font-black text-indigo-400 mt-1 truncate" title={(payrollAggregates?.totalEmploymentCost || 0).toLocaleString() + " HTG"}>
              {(payrollAggregates?.totalEmploymentCost || 0).toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">HTG</span>
            </div>
            <div className="text-[9.5px] text-slate-500 font-normal truncate" title={isSocialTaxEnabled ? `CNSS & CNS : ${(payrollAggregates?.cnssContributions || 0).toLocaleString()} HTG` : "Taxes: Désactivées (0 HTG)"}>
              CNSS & CNS : {isSocialTaxEnabled ? `${(payrollAggregates?.cnssContributions || 0).toLocaleString()} HTG` : "Désactivé (0 HTG)"}
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
              {activeEmployeesCount} <span className="text-[10.5px] text-slate-500 font-normal lowercase">agents</span>
            </div>
            <div className="text-[9.5px] text-slate-500 truncate">
              {selectedBranchId === "ALL" ? tbi.allBranches : tbi.operationalStatus}
            </div>
          </motion.div>

          {/* Attendance Rate */}
          <motion.div
            whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="glass p-4 rounded-xl border-l-2 border-l-green-500 flex flex-col justify-between min-h-[6rem] shadow"
          >
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider truncate">{tbi.attendanceRate}</span>
            <div className="font-mono text-lg sm:text-base font-black text-green-400 mt-1 truncate">
              {attendanceAggregates.attendanceRate}%
            </div>
            <div className="text-[9.5px] text-slate-500 truncate">
              {tbi.avgWorkHours}: {attendanceAggregates.avgHours} hrs
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
              {attendanceAggregates.absenceRate}%
            </div>
            <div className="text-[9.5px] text-slate-500 truncate">
              {attendanceAggregates.overrides} pwentaj retouche auditées
            </div>
          </motion.div>

          {/* Debt exposure */}
          <motion.div
            whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="glass p-4 rounded-xl border-l-2 border-l-purple-500 flex flex-col justify-between min-h-[6rem] shadow"
          >
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider truncate">{tbi.debtExposure}</span>
            <div className="font-mono text-lg sm:text-base font-black text-purple-400 mt-1 truncate" title={(totalAdvancesPending || 0).toLocaleString() + " HTG"}>
              {(totalAdvancesPending || 0).toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">HTG</span>
            </div>
            <div className="text-[9.5px] text-purple-500 font-medium tracking-tight truncate">
              Charges deduites du grand livre
            </div>
          </motion.div>

          {/* 7-Day Forecast */}
          <motion.div
            whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="glass p-4 rounded-xl border-l-2 border-l-fuchsia-500 flex flex-col justify-between min-h-[6rem] shadow"
          >
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider truncate">Forecast (7 Jours)</span>
            <div className={`font-mono text-lg sm:text-base font-black mt-1 truncate ${(biSnapshot?.forecast?.forecast7Days || 0) >= 0 ? "text-fuchsia-400" : "text-rose-400"}`} title={`${(biSnapshot?.forecast?.forecast7Days || 0).toLocaleString()} HTG`}>
              {(biSnapshot?.forecast?.forecast7Days || 0) >= 0 ? "+" : ""}{(biSnapshot?.forecast?.forecast7Days || 0).toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">HTG</span>
            </div>
            <div className="text-[9.5px] text-slate-500 truncate">
              Burn rate: {(biSnapshot?.burnRate?.currentValue || 0).toLocaleString()} HTG/j
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
