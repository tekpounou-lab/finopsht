import React, { useState } from "react";
import { BIPayrollTabProps } from "../types";
import { PayrollExecutiveKPIs } from "./payroll/PayrollExecutiveKPIs";
import { PayrollCompensationMix } from "./payroll/PayrollCompensationMix";
import { PayrollBranchDepartmentEconomics } from "./payroll/PayrollBranchDepartmentEconomics";
import { PayrollEmployeeScorecard } from "./payroll/PayrollEmployeeScorecard";
import { PayrollReconciliationPanel } from "./payroll/PayrollReconciliationPanel";
import { Phase6CAttendanceCapacityIntelligence } from "./payroll/Phase6CAttendanceCapacityIntelligence";
import { Phase6DWorkforceForecasting } from "./payroll/Phase6DWorkforceForecasting";
import { Phase7LaborEconomicsIntelligence } from "./payroll/Phase7LaborEconomicsIntelligence";
import { 
  BarChart3, 
  Layers, 
  Building2, 
  UserCheck, 
  ShieldCheck, 
  FileSpreadsheet,
  AlertCircle,
  Clock,
  TrendingUp,
  Percent
} from "lucide-react";

type SubSection = "OVERVIEW" | "LABOR_ECONOMICS" | "ATTENDANCE_CAPACITY" | "WORKFORCE_FORECASTING" | "COMPENSATION_MIX" | "ORGANIZATIONAL" | "SCORECARD" | "RECONCILIATION";

export const BIPayrollTab: React.FC<BIPayrollTabProps> = ({
  payrollAggregates,
  isSocialTaxEnabled,
  filteredPayrolls = [],
  filteredEmployees = [],
  branches = [],
  departments = [],
  totalRevenue = 0,
  totalExpenses = 0,
  selectedCurrency = "HTG",
  formatCurrencyValue: customFormatCurrency,
  ledgerTransactions = [],
  isSimplifiedMode = false,
  phase6cDataset,
  phase6dDataset,
  phase7Dataset,
}) => {
  const [activeSection, setActiveSection] = useState<SubSection>("OVERVIEW");

  // Fallback formatter if none provided
  const formatCurrency = customFormatCurrency || ((val: number) => `${Math.round(val).toLocaleString()} ${selectedCurrency}`);

  const totalCost = payrollAggregates?.totalEmploymentCost || 0;
  const activeStaff = payrollAggregates?.activeEmployeesCount || filteredPayrolls.length;

  return (
    <div className="space-y-6" id="bi-payroll-tab-root">
      {/* Sub-navigation Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 rounded-lg text-indigo-400">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Payroll Intelligence & Économie du Travail
            </h2>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
              <span>Mode: <strong className="text-slate-300 font-mono">{isSimplifiedMode ? "CASH (Encaissement)" : "ACCRUAL (Engagement)"}</strong></span>
              <span>•</span>
              <span>Fiches scellées: <strong className="text-indigo-400 font-mono">{filteredPayrolls.length}</strong></span>
              <span>•</span>
              <span>Devise: <strong className="text-slate-300 font-mono">{selectedCurrency}</strong></span>
            </div>
          </div>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex flex-wrap items-center bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1">
          <button
            type="button"
            onClick={() => setActiveSection("OVERVIEW")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeSection === "OVERVIEW"
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Vue Globale
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("LABOR_ECONOMICS")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeSection === "LABOR_ECONOMICS"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Percent className="w-3.5 h-3.5" />
            Économie du Travail (Phase 7)
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("ATTENDANCE_CAPACITY")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeSection === "ATTENDANCE_CAPACITY"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Temps & Capacité (Phase 6C)
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("WORKFORCE_FORECASTING")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeSection === "WORKFORCE_FORECASTING"
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Workforce Planning (Phase 6D)
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("COMPENSATION_MIX")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeSection === "COMPENSATION_MIX"
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Mix Rémunération
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("ORGANIZATIONAL")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeSection === "ORGANIZATIONAL"
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Branches & Depts
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("SCORECARD")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeSection === "SCORECARD"
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Scorecard Salariés
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("RECONCILIATION")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeSection === "RECONCILIATION"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Audit SSOT
          </button>
        </div>
      </div>

      {/* Empty State Guard if zero records */}
      {filteredPayrolls.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-200">Aucune donnée de paie disponible (NO_DATA)</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Aucune fiche de paie scellée ne correspond aux filtres actuels (période, branche, département ou statut de paiement).
          </p>
        </div>
      )}

      {/* Render Active Subsection */}
      {filteredPayrolls.length > 0 && (
        <div className="space-y-6">
          {activeSection === "OVERVIEW" && (
            <div className="space-y-6">
              <PayrollExecutiveKPIs
                payrollAggregates={payrollAggregates}
                isSocialTaxEnabled={isSocialTaxEnabled}
                totalRevenue={totalRevenue}
                totalExpenses={totalExpenses}
                filteredPayrolls={filteredPayrolls}
                formatCurrencyValue={formatCurrency}
              />
              <PayrollCompensationMix
                filteredPayrolls={filteredPayrolls}
                filteredEmployees={filteredEmployees}
                isSocialTaxEnabled={isSocialTaxEnabled}
                formatCurrencyValue={formatCurrency}
              />
            </div>
          )}

          {activeSection === "LABOR_ECONOMICS" && phase7Dataset && (
            <Phase7LaborEconomicsIntelligence
              phase7Dataset={phase7Dataset}
              selectedCurrency={selectedCurrency}
            />
          )}

          {activeSection === "ATTENDANCE_CAPACITY" && (
            <Phase6CAttendanceCapacityIntelligence
              phase6cDataset={phase6cDataset}
              selectedCurrency={selectedCurrency}
            />
          )}

          {activeSection === "WORKFORCE_FORECASTING" && phase6dDataset && (
            <Phase6DWorkforceForecasting
              forecastDataset={phase6dDataset}
              selectedCurrency={selectedCurrency}
            />
          )}

          {activeSection === "COMPENSATION_MIX" && (
            <PayrollCompensationMix
              filteredPayrolls={filteredPayrolls}
              filteredEmployees={filteredEmployees}
              isSocialTaxEnabled={isSocialTaxEnabled}
              formatCurrencyValue={formatCurrency}
            />
          )}

          {activeSection === "ORGANIZATIONAL" && (
            <PayrollBranchDepartmentEconomics
              filteredPayrolls={filteredPayrolls}
              filteredEmployees={filteredEmployees}
              branches={branches}
              departments={departments}
              isSocialTaxEnabled={isSocialTaxEnabled}
              totalRevenue={totalRevenue}
              formatCurrencyValue={formatCurrency}
            />
          )}

          {activeSection === "SCORECARD" && (
            <PayrollEmployeeScorecard
              filteredPayrolls={filteredPayrolls}
              filteredEmployees={filteredEmployees}
              branches={branches}
              departments={departments}
              isSocialTaxEnabled={isSocialTaxEnabled}
              formatCurrencyValue={formatCurrency}
            />
          )}

          {activeSection === "RECONCILIATION" && (
            <PayrollReconciliationPanel
              filteredPayrolls={filteredPayrolls}
              filteredEmployees={filteredEmployees}
              ledgerTransactions={ledgerTransactions}
              totalPayrollCost={totalCost}
              formatCurrencyValue={formatCurrency}
            />
          )}
        </div>
      )}
    </div>
  );
};
