import React from "react";
import { PayrollRecord, Employee } from "../../../../types";
import { Layers, CheckCircle2, TrendingUp, DollarSign } from "lucide-react";

interface PayrollCompensationMixProps {
  filteredPayrolls: PayrollRecord[];
  filteredEmployees: Employee[];
  isSocialTaxEnabled: boolean;
  formatCurrencyValue: (val: number) => string;
}

export const PayrollCompensationMix: React.FC<PayrollCompensationMixProps> = ({
  filteredPayrolls,
  filteredEmployees,
  isSocialTaxEnabled,
  formatCurrencyValue,
}) => {
  // Build employee payment model map
  const empModelMap = new Map<string, string>();
  (filteredEmployees || []).forEach((e) => {
    empModelMap.set(e.id, e.paymentModel || "FIXED");
  });

  // Segment payroll records by persisted payment model
  const fixedRecords: PayrollRecord[] = [];
  const commissionRecords: PayrollRecord[] = [];
  const hybridRecords: PayrollRecord[] = [];

  filteredPayrolls.forEach((p) => {
    const empId = p.employee_id || (p as any).employeeId;
    const model = (p as any).paymentModel || (empId ? empModelMap.get(empId) : undefined) || "FIXED";
    if (model === "COMMISSION") {
      commissionRecords.push(p);
    } else if (model === "HYBRID") {
      hybridRecords.push(p);
    } else {
      fixedRecords.push(p);
    }
  });

  const getRecordCost = (p: any): number => {
    const gross = p.grossSalary || (p.gross_salary_cents ? p.gross_salary_cents / 100 : 0) || p.gross || (p.baseSalary || 0);
    let employerTax = 0;
    if (isSocialTaxEnabled) {
      const erCnss = (p.cnss_employer_cents ? p.cnss_employer_cents / 100 : 0) || (p.onaEmployer || 0);
      const erCns = (p.ofatma_employer_cents ? p.ofatma_employer_cents / 100 : 0) || (p.cns_employer_cents ? p.cns_employer_cents / 100 : 0) || (p.ofatmaEmployer || 0);
      employerTax = erCnss + erCns;
    }
    return gross + employerTax;
  };

  const getBaseSalary = (p: any): number => {
    return p.baseSalary || (p.base_salary_cents ? p.base_salary_cents / 100 : 0) || 0;
  };

  const getCommissions = (p: any): number => {
    return p.commissions || (p.commission_cents ? p.commission_cents / 100 : 0) || p.commissionsHTG || 0;
  };

  const getSales = (p: any): number => {
    return (p as any).salesVolume || (p as any).sales_cents ? (p as any).sales_cents / 100 : (p as any).salesHtg || 0;
  };

  // Fixed statistics
  const fixedCount = fixedRecords.length;
  const fixedTotalCost = fixedRecords.reduce((sum, p) => sum + getRecordCost(p), 0);
  const fixedBaseMass = fixedRecords.reduce((sum, p) => sum + getBaseSalary(p), 0);

  // Commission statistics
  const commissionCount = commissionRecords.length;
  const commissionTotalCost = commissionRecords.reduce((sum, p) => sum + getRecordCost(p), 0);
  const commissionPaid = commissionRecords.reduce((sum, p) => sum + getCommissions(p), 0);
  const commissionSales = commissionRecords.reduce((sum, p) => sum + getSales(p), 0);
  const effectiveCommissionRate = commissionSales > 0 ? (commissionPaid / commissionSales) * 100 : null;

  // Hybrid statistics
  const hybridCount = hybridRecords.length;
  const hybridTotalCost = hybridRecords.reduce((sum, p) => sum + getRecordCost(p), 0);
  const hybridBaseMass = hybridRecords.reduce((sum, p) => sum + getBaseSalary(p), 0);
  const hybridCommissions = hybridRecords.reduce((sum, p) => sum + getCommissions(p), 0);
  const hybridSales = hybridRecords.reduce((sum, p) => sum + getSales(p), 0);

  const totalHeadcount = fixedCount + commissionCount + hybridCount;
  const totalCost = fixedTotalCost + commissionTotalCost + hybridTotalCost;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6" id="payroll-compensation-mix-section">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm uppercase font-extrabold text-slate-300 tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            Mix de Rémunération & Régimes Économiques (SSOT)
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Ventilation basée strictement sur le profil contractuel (<code>paymentModel</code>) sans inférence monétaire.
          </p>
        </div>
      </div>

      {/* Visual Weight Distribution Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-slate-400 font-medium">
          <span>Répartition Masse Salariale par Régime</span>
          <span>Total: {formatCurrencyValue(totalCost)}</span>
        </div>
        <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
          {totalCost > 0 ? (
            <>
              <div 
                className="bg-indigo-500 h-full transition-all duration-300"
                style={{ width: `${(fixedTotalCost / totalCost) * 100}%` }}
                title={`Fixe: ${((fixedTotalCost / totalCost) * 100).toFixed(1)}%`}
              />
              <div 
                className="bg-amber-500 h-full transition-all duration-300"
                style={{ width: `${(commissionTotalCost / totalCost) * 100}%` }}
                title={`Commission: ${((commissionTotalCost / totalCost) * 100).toFixed(1)}%`}
              />
              <div 
                className="bg-purple-500 h-full transition-all duration-300"
                style={{ width: `${(hybridTotalCost / totalCost) * 100}%` }}
                title={`Hybride: ${((hybridTotalCost / totalCost) * 100).toFixed(1)}%`}
              />
            </>
          ) : (
            <div className="bg-slate-800 w-full h-full" />
          )}
        </div>
        <div className="flex flex-wrap gap-4 text-xs mt-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500"></span>
            <span className="text-slate-300 font-medium">Fixe:</span>
            <span className="text-slate-400">{totalCost > 0 ? `${((fixedTotalCost / totalCost) * 100).toFixed(1)}%` : "0%"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500"></span>
            <span className="text-slate-300 font-medium">Commission:</span>
            <span className="text-slate-400">{totalCost > 0 ? `${((commissionTotalCost / totalCost) * 100).toFixed(1)}%` : "0%"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-purple-500"></span>
            <span className="text-slate-300 font-medium">Hybride:</span>
            <span className="text-slate-400">{totalCost > 0 ? `${((hybridTotalCost / totalCost) * 100).toFixed(1)}%` : "0%"}</span>
          </div>
        </div>
      </div>

      {/* Cards for each Compensation Regime */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* FIXED Regime */}
        <div className="bg-slate-950/80 border border-slate-800/90 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-indigo-400 tracking-wider">Régime FIXE</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                {fixedCount} salarié{fixedCount > 1 ? "s" : ""}
              </span>
            </div>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Coût Total:</span>
                <span className="font-mono font-bold text-slate-200">{formatCurrencyValue(fixedTotalCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Salaire de Base:</span>
                <span className="font-mono text-slate-300">{formatCurrencyValue(fixedBaseMass)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">% Effectif:</span>
                <span className="font-mono text-slate-300">
                  {totalHeadcount > 0 ? `${((fixedCount / totalHeadcount) * 100).toFixed(1)}%` : "0%"}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-500">
            Commission contractuelle: 0 HTG (Règle stricte)
          </div>
        </div>

        {/* COMMISSION Regime */}
        <div className="bg-slate-950/80 border border-slate-800/90 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-amber-400 tracking-wider">Régime COMMISSION</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20">
                {commissionCount} commercial{commissionCount > 1 ? "s" : ""}
              </span>
            </div>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Commissions:</span>
                <span className="font-mono font-bold text-slate-200">{formatCurrencyValue(commissionPaid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Ventes Générées:</span>
                <span className="font-mono text-slate-300">{formatCurrencyValue(commissionSales)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Taux Effectif:</span>
                <span className="font-mono text-amber-300">
                  {effectiveCommissionRate !== null ? `${effectiveCommissionRate.toFixed(1)}%` : "0%"}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-500">
            Rémunération variable 100% sur objectifs
          </div>
        </div>

        {/* HYBRID Regime */}
        <div className="bg-slate-950/80 border border-slate-800/90 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-purple-400 tracking-wider">Régime HYBRIDE</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20">
                {hybridCount} salarié{hybridCount > 1 ? "s" : ""}
              </span>
            </div>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Coût Total:</span>
                <span className="font-mono font-bold text-slate-200">{formatCurrencyValue(hybridTotalCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Base Fixe:</span>
                <span className="font-mono text-slate-300">{formatCurrencyValue(hybridBaseMass)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Commissions:</span>
                <span className="font-mono text-slate-300">{formatCurrencyValue(hybridCommissions)}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-500">
            Ratio Fixe/Variable: {hybridCommissions > 0 ? `${(hybridBaseMass / hybridCommissions).toFixed(1)}x` : "100% Fixe"}
          </div>
        </div>
      </div>
    </div>
  );
};
