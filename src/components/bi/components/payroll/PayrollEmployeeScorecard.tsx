import React, { useState, useMemo } from "react";
import { PayrollRecord, Employee, Branch, Department } from "../../../../types";
import { BIDataState } from "../../types";
import { UserCheck, Search, Filter, HelpCircle, CheckCircle2, AlertCircle } from "lucide-react";

interface PayrollEmployeeScorecardProps {
  filteredPayrolls: PayrollRecord[];
  filteredEmployees: Employee[];
  branches: Branch[];
  departments: Department[];
  isSocialTaxEnabled: boolean;
  formatCurrencyValue: (val: number) => string;
}

export const PayrollEmployeeScorecard: React.FC<PayrollEmployeeScorecardProps> = ({
  filteredPayrolls,
  filteredEmployees,
  branches,
  departments,
  isSocialTaxEnabled,
  formatCurrencyValue,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegime, setSelectedRegime] = useState<string>("ALL");

  const branchMap = useMemo(() => {
    const m = new Map<string, string>();
    (branches || []).forEach((b) => m.set(b.id, b.name));
    return m;
  }, [branches]);

  const deptMap = useMemo(() => {
    const m = new Map<string, string>();
    (departments || []).forEach((d) => m.set(d.id, d.name));
    return m;
  }, [departments]);

  const empMap = useMemo(() => {
    const m = new Map<string, Employee>();
    (filteredEmployees || []).forEach((e) => m.set(e.id, e));
    return m;
  }, [filteredEmployees]);

  const scorecards = useMemo(() => {
    return filteredPayrolls.map((p) => {
      const empId = p.employee_id || p.employeeId;
      const emp = empId ? empMap.get(empId) : undefined;
      const name = p.employeeName || (p as any).employee_name || emp?.name || emp?.displayName || (emp as any)?.firstName ? `${(emp as any).firstName || ""} ${(emp as any).lastName || ""}`.trim() : empId || "Salarié inconnu";
      const model = (p as any).paymentModel || p.pay_profile || emp?.paymentModel || "FIXED";
      const branchId = p.branch_id || (p as any).branchId || emp?.branchId || (emp as any)?.branch_id || "UNRESOLVED";
      const branchName = branchId === "UNRESOLVED" ? "Non assigné" : (branchMap.get(branchId) || branchId);
      const deptId = p.department_id || (p as any).departmentId || emp?.departmentId || (emp as any)?.department_id || "UNRESOLVED";
      const deptName = deptId === "UNRESOLVED" ? "Non assigné" : (deptMap.get(deptId) || deptId);

      const baseSalary = p.baseSalary || (p.base_salary_cents ? p.base_salary_cents / 100 : 0) || 0;
      const gross = p.grossSalary || (p.gross_salary_cents ? p.gross_salary_cents / 100 : 0) || (p as any).gross || baseSalary;
      const net = (p as any).netPay || p.netPaid || (p.net_salary_cents ? p.net_salary_cents / 100 : 0) || (p as any).finalPayout || 0;
      const commissions = p.commissions || (p.commission_cents ? p.commission_cents / 100 : 0) || (p as any).commissionsHTG || 0;
      const overtime = p.overtimePayout || (p.overtime_cents ? p.overtime_cents / 100 : 0) || (p as any).overtimePay || (p as any).overtime || 0;
      const sales = (p as any).salesVolume || ((p as any).sales_cents ? (p as any).sales_cents / 100 : ((p as any).salesHtg || p.salesHtg || 0));

      let employerTax = 0;
      if (isSocialTaxEnabled) {
        const erCnss = (p.cnss_employer_cents ? p.cnss_employer_cents / 100 : 0) || ((p as any).onaEmployer || 0);
        const erCns = (p.ofatma_employer_cents ? p.ofatma_employer_cents / 100 : 0) || ((p as any).cnss_employer_cents ? (p as any).cnss_employer_cents / 100 : 0) || ((p as any).ofatmaEmployer || 0);
        employerTax = erCnss + erCns;
      }

      const totalEmployerCost = gross + employerTax;

      // Data state identification
      let commissionState: BIDataState = "AVAILABLE";
      if (model === "FIXED") {
        commissionState = "NOT_ELIGIBLE";
      } else if (commissions === 0) {
        commissionState = sales > 0 ? "ZERO" : "NO_DATA";
      }

      const roi = totalEmployerCost > 0 && sales > 0 ? (sales - totalEmployerCost) / totalEmployerCost : null;

      return {
        id: p.id,
        empId,
        name,
        model,
        branchName,
        deptName,
        baseSalary,
        gross,
        net,
        commissions,
        commissionState,
        overtime,
        sales,
        employerTax,
        totalEmployerCost,
        roi,
      };
    });
  }, [filteredPayrolls, empMap, branchMap, deptMap, isSocialTaxEnabled]);

  const filteredScorecards = useMemo(() => {
    return scorecards.filter((sc) => {
      if (selectedRegime !== "ALL" && sc.model !== selectedRegime) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          sc.name.toLowerCase().includes(q) ||
          sc.branchName.toLowerCase().includes(q) ||
          sc.deptName.toLowerCase().includes(q) ||
          sc.model.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [scorecards, selectedRegime, searchQuery]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6" id="payroll-employee-scorecard-section">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm uppercase font-extrabold text-slate-300 tracking-wider flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            Scorecard Économique par Collaborateur
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Indicateurs individuels avec distinction stricte des états de données (<code>AVAILABLE</code>, <code>ZERO</code>, <code>NOT_ELIGIBLE</code>, <code>NO_DATA</code>).
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Regime select */}
          <select
            value={selectedRegime}
            onChange={(e) => setSelectedRegime(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">Tous les Régimes</option>
            <option value="FIXED">Fixe uniquement</option>
            <option value="COMMISSION">Commission uniquement</option>
            <option value="HYBRID">Hybride uniquement</option>
          </select>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Rechercher salarié..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-300 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Scorecard Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
              <th className="py-3 px-3">Collaborateur</th>
              <th className="py-3 px-3">Régime</th>
              <th className="py-3 px-3">Département / Branche</th>
              <th className="py-3 px-3 text-right">Salaire Base</th>
              <th className="py-3 px-3 text-right">Commissions</th>
              <th className="py-3 px-3 text-right">Net Versé</th>
              <th className="py-3 px-3 text-right">Coût Employeur</th>
              <th className="py-3 px-3 text-right">Ventes Générées</th>
              <th className="py-3 px-3 text-right">ROI Salarié</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {filteredScorecards.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-8 text-slate-500">
                  Aucun collaborateur trouvé pour les critères sélectionnés.
                </td>
              </tr>
            ) : (
              filteredScorecards.map((sc) => {
                const isFixed = sc.model === "FIXED";
                const isCommission = sc.model === "COMMISSION";
                const isHybrid = sc.model === "HYBRID";

                return (
                  <tr key={sc.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3 font-sans font-medium text-slate-200">
                      {sc.name}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold uppercase ${
                        isFixed
                          ? "bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                          : isCommission
                          ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                          : "bg-purple-500/10 text-purple-300 border border-purple-500/20"
                      }`}>
                        {sc.model}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-sans text-slate-400">
                      <div>{sc.deptName}</div>
                      <div className="text-[10px] text-slate-500">{sc.branchName}</div>
                    </td>
                    <td className="py-3 px-3 text-right text-slate-300">
                      {isCommission ? (
                        <span className="text-slate-500 font-sans text-[10px]">NON APPLICABLE</span>
                      ) : (
                        formatCurrencyValue(sc.baseSalary)
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {sc.commissionState === "NOT_ELIGIBLE" ? (
                        <span className="text-slate-500 font-sans text-[10px]">NON ÉLIGIBLE</span>
                      ) : sc.commissions > 0 ? (
                        <span className="text-amber-400 font-bold">{formatCurrencyValue(sc.commissions)}</span>
                      ) : (
                        <span className="text-slate-500">0 HTG</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-400 font-bold">
                      {formatCurrencyValue(sc.net)}
                    </td>
                    <td className="py-3 px-3 text-right text-indigo-300 font-bold">
                      {formatCurrencyValue(sc.totalEmployerCost)}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-300">
                      {sc.sales > 0 ? (
                        formatCurrencyValue(sc.sales)
                      ) : (
                        <span className="text-slate-500 font-sans text-[10px]">AUCUNE VENTE</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-sans">
                      {sc.roi !== null ? (
                        <span className={`font-bold ${sc.roi >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {sc.roi >= 0 ? "+" : ""}{(sc.roi * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[10px]">NON APPLICABLE</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
