import React from "react";
import { PayrollAggregates } from "../../types";
import { PayrollRecord } from "../../../../types";
import { 
  DollarSign, 
  Users, 
  TrendingUp, 
  Percent, 
  ShieldCheck, 
  Clock, 
  AlertTriangle,
  Award,
  Wallet
} from "lucide-react";

interface PayrollExecutiveKPIsProps {
  payrollAggregates?: PayrollAggregates;
  isSocialTaxEnabled: boolean;
  totalRevenue: number;
  totalExpenses: number;
  filteredPayrolls: PayrollRecord[];
  formatCurrencyValue: (val: number) => string;
}

export const PayrollExecutiveKPIs: React.FC<PayrollExecutiveKPIsProps> = ({
  payrollAggregates,
  isSocialTaxEnabled,
  totalRevenue,
  totalExpenses,
  filteredPayrolls,
  formatCurrencyValue,
}) => {
  const totalCost = payrollAggregates?.totalEmploymentCost || 0;
  const grossPayroll = payrollAggregates?.grossPayroll || payrollAggregates?.payrollPaid || 0;
  const netPayroll = payrollAggregates?.netPayroll || 0;
  const employerTaxes = payrollAggregates?.employerTaxes || payrollAggregates?.employerChargesSocials || 0;
  const employeeTaxes = payrollAggregates?.employeeTaxes || 0;
  const commissionsPaid = payrollAggregates?.commissionsPaid || 0;
  const overtimeCost = payrollAggregates?.overtimeCost || 0;
  const latePenalties = payrollAggregates?.latePenalties || 0;
  const absencePenalties = payrollAggregates?.absencePenalties || 0;
  const activeStaff = payrollAggregates?.activeEmployeesCount || filteredPayrolls.length;

  // Authoritative Payroll Ratio: (Total Payroll Cost / Total Revenue) * 100
  const payrollRatio = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : null;

  // Authoritative HC-ROI: (Total Revenue - Non-Payroll Expenses) / Total Payroll Cost
  const nonPayrollExpenses = Math.max(0, totalExpenses - totalCost);
  const hcRoi = totalCost > 0 ? (totalRevenue - nonPayrollExpenses) / totalCost : null;

  // Average cost per employee
  const avgCostPerEmp = activeStaff > 0 ? totalCost / activeStaff : 0;

  return (
    <div className="space-y-6" id="payroll-executive-kpis-container">
      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Payroll Cost (Canonical SSOT) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden" id="card-total-payroll-cost">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Masse Salariale Totale</span>
            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-mono font-bold text-indigo-300">
              {formatCurrencyValue(totalCost)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <span>Brut + Charges Patronales</span>
            </div>
          </div>
        </div>

        {/* Card 2: Gross & Net Breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between shadow-sm" id="card-gross-net-payroll">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Salaire Brut vs Net</span>
            <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-lg font-mono font-bold text-cyan-300">
              {formatCurrencyValue(grossPayroll)} <span className="text-xs font-normal text-slate-400">Brut</span>
            </div>
            <div className="text-sm font-mono text-emerald-400 mt-0.5">
              {netPayroll > 0 ? formatCurrencyValue(netPayroll) : "—"} <span className="text-xs text-slate-400">Net versé</span>
            </div>
          </div>
        </div>

        {/* Card 3: Social Taxes (ONA / OFATMA) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between shadow-sm" id="card-social-charges">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Charges Sociales {isSocialTaxEnabled ? "(Actives)" : "(Désactivées)"}
            </span>
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-mono font-bold text-emerald-300">
              {formatCurrencyValue(employerTaxes)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>Patronales: {formatCurrencyValue(employerTaxes)}</span>
              {employeeTaxes > 0 && <span>Salariales: {formatCurrencyValue(employeeTaxes)}</span>}
            </div>
          </div>
        </div>

        {/* Card 4: Payroll Cost Ratio */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between shadow-sm" id="card-payroll-ratio">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ratio Masse / CA</span>
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-mono font-bold text-amber-300">
              {payrollRatio !== null ? `${payrollRatio.toFixed(1)}%` : <span className="text-slate-500 text-base">NO_DATA (CA = 0)</span>}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {hcRoi !== null ? `ROI Capital Humain: ${hcRoi.toFixed(2)}x` : "ROI: Non applicable"}
            </div>
          </div>
        </div>
      </div>

      {/* Secondary KPI Row: Components & Specific Costs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Variable Compensation: Commissions */}
        <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1.5 font-medium">
              <Award className="w-3.5 h-3.5 text-amber-400" /> Commissions Versées
            </span>
          </div>
          <div className="text-xl font-mono font-bold text-amber-300">
            {formatCurrencyValue(commissionsPaid)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {grossPayroll > 0 ? `${((commissionsPaid / grossPayroll) * 100).toFixed(1)}% du brut` : "0%"}
          </div>
        </div>

        {/* Overtime Cost */}
        <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1.5 font-medium">
              <Clock className="w-3.5 h-3.5 text-purple-400" /> Heures Supplémentaires
            </span>
          </div>
          <div className="text-xl font-mono font-bold text-purple-300">
            {formatCurrencyValue(overtimeCost)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Majoration 150% / 200%
          </div>
        </div>

        {/* Penalties: Late & Absence */}
        <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Déductions & Pénalités
            </span>
          </div>
          <div className="text-xl font-mono font-bold text-rose-300">
            {formatCurrencyValue(latePenalties + absencePenalties)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Retards: {formatCurrencyValue(latePenalties)} | Absences: {formatCurrencyValue(absencePenalties)}
          </div>
        </div>

        {/* Staff & Average Cost */}
        <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1.5 font-medium">
              <Users className="w-3.5 h-3.5 text-teal-400" /> Coût Moyen / Employé
            </span>
          </div>
          <div className="text-xl font-mono font-bold text-teal-300">
            {formatCurrencyValue(avgCostPerEmp)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Effectif rémunéré: {activeStaff} collaborateur{activeStaff > 1 ? "s" : ""}
          </div>
        </div>
      </div>
    </div>
  );
};
