import React from "react";
import { Activity, Sparkles, Database, Building, Layers, DollarSign } from "lucide-react";
import { Branch, Department, Role, Business } from "../../../types";

interface BIFiltersHeaderProps {
  title: string;
  subtitle: string;
  language: string;
  isSimplifiedMode: boolean;
  setIsSimplifiedMode: (val: boolean) => void;
  currentRole: Role;
  currentBusiness?: Business;
  branches: Branch[];
  departments: Department[];
  selectedBranchId: string;
  setSelectedBranchId: (id: string) => void;
  selectedDeptId: string;
  setSelectedDeptId: (id: string) => void;
  selectedTxType: string;
  setSelectedTxType: (type: string) => void;
  startDate: string;
  setStartDate: (date: string) => void;
  endDate: string;
  setEndDate: (date: string) => void;
  allBranchesLabel: string;
  allDepartmentsLabel: string;
  transactionTypeLabel: string;
}

export const BIFiltersHeader: React.FC<BIFiltersHeaderProps> = ({
  title,
  subtitle,
  language,
  isSimplifiedMode,
  setIsSimplifiedMode,
  currentRole,
  currentBusiness,
  branches,
  departments,
  selectedBranchId,
  setSelectedBranchId,
  selectedDeptId,
  setSelectedDeptId,
  selectedTxType,
  setSelectedTxType,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  allBranchesLabel,
  allDepartmentsLabel,
  transactionTypeLabel,
}) => {
  return (
    <div className="flex flex-wrap lg:items-center lg:justify-between border-b border-slate-900 pb-5 gap-4" id="bi-header">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full xl:w-auto">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2 tracking-tight">
            <Activity className="w-5 h-5 text-cyan-400 animate-pulse" />
            {title}
          </h2>
          <p className="text-xs text-slate-400 font-light mt-0.5">{subtitle}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {/* Mode Toggle Switch */}
        <div className="flex items-center bg-slate-950/80 border border-slate-800/80 p-1 rounded-xl shadow-lg shrink-0" id="bi-mode-toggle">
          <button
            onClick={() => setIsSimplifiedMode(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              isSimplifiedMode
                ? "bg-gradient-to-r from-cyan-500/10 to-teal-500/10 text-cyan-400 border border-cyan-500/30 shadow-md"
                : "text-slate-500 hover:text-slate-300 border border-transparent"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            💡 {language === "ht" ? "Mòd Senp" : "Mode Simplifié"}
          </button>
          <button
            onClick={() => setIsSimplifiedMode(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              !isSimplifiedMode
                ? "bg-slate-800 text-slate-200 border border-slate-700 shadow-md"
                : "text-slate-500 hover:text-slate-400 border border-transparent"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            📊 {language === "ht" ? "Mòd Ekspè" : "Mode Expert (Finances)"}
          </button>
        </div>

        {/* Global Structural Filters Panel */}
        <div className="flex flex-wrap items-center gap-3 bg-slate-900/30 border border-slate-850 p-3 rounded-xl shadow" id="bi-filter-panel">
          <div className="flex items-center gap-1.5" id="branch-select-box">
            <Building className="w-3.5 h-3.5 text-slate-500" />
            <select
              id="bi-branch-selector"
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              disabled={currentRole === "MANAGER"}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-[11px] text-slate-200"
            >
              <option value="ALL">{allBranchesLabel}</option>
              {branches
                .filter((b) => !currentBusiness?.id || b.business_id === currentBusiness.id)
                .map((b, _i) => (
                  <option key={`${b.id}-${_i}`} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5" id="dept-select-box">
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            <select
              id="bi-dept-selector"
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-[11px] text-slate-200"
            >
              <option value="ALL">{allDepartmentsLabel}</option>
              {departments.map((d, _i) => (
                <option key={`${d.id}-${_i}`} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {!isSimplifiedMode && (
            <div className="flex items-center gap-1.5" id="tx-type-select-box">
              <DollarSign className="w-3.5 h-3.5 text-slate-500" />
              <select
                id="bi-tx-type-selector"
                value={selectedTxType}
                onChange={(e) => setSelectedTxType(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-[11px] text-slate-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition outline-none"
              >
                <option value="ALL">{transactionTypeLabel} : {language === "ht" ? "Tout" : language === "en" ? "All" : "Tous"}</option>
                <option value="INCOME">{language === "ht" ? "Revni (INCOME)" : language === "en" ? "Revenue" : "Revenus"}</option>
                <option value="EXPENSE">{language === "ht" ? "Depans (EXPENSE)" : language === "en" ? "Expense" : "Dépenses"}</option>
                <option value="ADVANCE">{language === "ht" ? "Avans (ADVANCE)" : language === "en" ? "Advance" : "Avances"}</option>
                <option value="PAYROLL">{language === "ht" ? "Peman (PAYROLL)" : language === "en" ? "Payroll" : "Salaires"}</option>
                <option value="BONUS">Bonus</option>
                <option value="PENALTY">{language === "ht" ? "Penalite" : "Pénalités"}</option>
              </select>
            </div>
          )}

          {/* Date range inputs */}
          <div className="flex items-center gap-1 font-mono text-[11px]" id="bi-date-range-box">
            <input
              id="bi-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 outline-none focus:border-cyan-500 text-slate-300"
            />
            <span>-</span>
            <input
              id="bi-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 outline-none focus:border-cyan-500 text-slate-300"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
