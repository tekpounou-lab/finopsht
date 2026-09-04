import React from "react";
import { PayrollAggregates } from "../types";

interface BIPayrollTabProps {
  payrollAggregates?: PayrollAggregates;
  isSocialTaxEnabled: boolean;
}

export const BIPayrollTab: React.FC<BIPayrollTabProps> = ({
  payrollAggregates,
  isSocialTaxEnabled,
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="bi-payroll-tab-content">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col gap-4">
        <h3 className="text-xs uppercase font-extrabold text-slate-400 tracking-wider flex items-center gap-1.5">
          <span className="w-1.5 h-3.5 bg-indigo-500 rounded-sm"></span>
          Payroll Structure & Cost Analysis
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Base Wages</span>
            <span className="text-xl font-mono text-indigo-400 font-bold block">
              {(payrollAggregates?.payrollPaid || 0).toLocaleString()} HTG
            </span>
          </div>
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Commissions Given</span>
            <span className="text-xl font-mono text-amber-400 font-bold block">
              {(payrollAggregates?.commissionsPaid || 0).toLocaleString()} HTG
            </span>
          </div>
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
              CNSS & OFATMA {isSocialTaxEnabled ? "Cotisations" : "(Désactivé)"}
            </span>
            <span className="text-xl font-mono text-emerald-400 font-bold block">
              {(payrollAggregates?.cnssContributions || 0).toLocaleString()} HTG
            </span>
          </div>
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Total Payroll Mass</span>
            <span className="text-2xl font-mono text-cyan-400 font-black block">
              {(payrollAggregates?.totalEmploymentCost || 0).toLocaleString()} HTG
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
