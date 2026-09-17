import React, { useState, useMemo } from "react";
import { PayrollRecord, Employee, Branch, Department } from "../../../../types";
import { Building2, Landmark, Users, TrendingUp, HelpCircle } from "lucide-react";

interface PayrollBranchDepartmentEconomicsProps {
  filteredPayrolls: PayrollRecord[];
  filteredEmployees: Employee[];
  branches: Branch[];
  departments: Department[];
  isSocialTaxEnabled: boolean;
  totalRevenue: number;
  formatCurrencyValue: (val: number) => string;
}

export const PayrollBranchDepartmentEconomics: React.FC<PayrollBranchDepartmentEconomicsProps> = ({
  filteredPayrolls,
  filteredEmployees,
  branches,
  departments,
  isSocialTaxEnabled,
  totalRevenue,
  formatCurrencyValue,
}) => {
  const [viewMode, setViewMode] = useState<"BRANCH" | "DEPARTMENT">("BRANCH");

  // Maps for resolution
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

  const getEmployerTax = (p: any): number => {
    if (!isSocialTaxEnabled) return 0;
    const erCnss = (p.cnss_employer_cents ? p.cnss_employer_cents / 100 : 0) || (p.onaEmployer || 0);
    const erCns = (p.ofatma_employer_cents ? p.ofatma_employer_cents / 100 : 0) || (p.cns_employer_cents ? p.cns_employer_cents / 100 : 0) || (p.ofatmaEmployer || 0);
    return erCnss + erCns;
  };

  const getCommissions = (p: any): number => {
    return p.commissions || (p.commission_cents ? p.commission_cents / 100 : 0) || p.commissionsHTG || 0;
  };

  const getOvertime = (p: any): number => {
    return p.overtimePay || (p.overtime_cents ? p.overtime_cents / 100 : 0) || p.overtime || 0;
  };

  const getSales = (p: any): number => {
    return (p as any).salesVolume || (p as any).sales_cents ? (p as any).sales_cents / 100 : (p as any).salesHtg || 0;
  };

  // Aggregation by Branch
  const branchAggregates = useMemo(() => {
    const map = new Map<string, {
      id: string;
      name: string;
      headcount: Set<string>;
      payrollCost: number;
      employerCost: number;
      commissions: number;
      overtime: number;
      sales: number;
    }>();

    filteredPayrolls.forEach((p) => {
      const empId = p.employee_id || (p as any).employeeId;
      const emp = empId ? empMap.get(empId) : undefined;
      const branchId = p.branch_id || (p as any).branchId || emp?.branchId || (emp as any)?.branch_id || "UNRESOLVED";
      const branchName = branchId === "UNRESOLVED" ? "Non assigné (UNRESOLVED)" : (branchMap.get(branchId) || branchId);

      if (!map.has(branchId)) {
        map.set(branchId, {
          id: branchId,
          name: branchName,
          headcount: new Set(),
          payrollCost: 0,
          employerCost: 0,
          commissions: 0,
          overtime: 0,
          sales: 0,
        });
      }

      const item = map.get(branchId)!;
      if (empId) item.headcount.add(empId);
      item.payrollCost += getRecordCost(p);
      item.employerCost += getEmployerTax(p);
      item.commissions += getCommissions(p);
      item.overtime += getOvertime(p);
      item.sales += getSales(p);
    });

    return Array.from(map.values()).sort((a, b) => b.payrollCost - a.payrollCost);
  }, [filteredPayrolls, empMap, branchMap, isSocialTaxEnabled]);

  // Aggregation by Department
  const departmentAggregates = useMemo(() => {
    const map = new Map<string, {
      id: string;
      name: string;
      headcount: Set<string>;
      payrollCost: number;
      employerCost: number;
      commissions: number;
      overtime: number;
      sales: number;
    }>();

    filteredPayrolls.forEach((p) => {
      const empId = p.employee_id || (p as any).employeeId;
      const emp = empId ? empMap.get(empId) : undefined;
      const deptId = p.department_id || (p as any).departmentId || emp?.departmentId || (emp as any)?.department_id || "UNRESOLVED";
      const deptName = deptId === "UNRESOLVED" ? "Non assigné (UNRESOLVED)" : (deptMap.get(deptId) || deptId);

      if (!map.has(deptId)) {
        map.set(deptId, {
          id: deptId,
          name: deptName,
          headcount: new Set(),
          payrollCost: 0,
          employerCost: 0,
          commissions: 0,
          overtime: 0,
          sales: 0,
        });
      }

      const item = map.get(deptId)!;
      if (empId) item.headcount.add(empId);
      item.payrollCost += getRecordCost(p);
      item.employerCost += getEmployerTax(p);
      item.commissions += getCommissions(p);
      item.overtime += getOvertime(p);
      item.sales += getSales(p);
    });

    return Array.from(map.values()).sort((a, b) => b.payrollCost - a.payrollCost);
  }, [filteredPayrolls, empMap, deptMap, isSocialTaxEnabled]);

  const currentList = viewMode === "BRANCH" ? branchAggregates : departmentAggregates;
  const totalCostAll = currentList.reduce((sum, item) => sum + item.payrollCost, 0);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6" id="payroll-branch-dept-economics">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm uppercase font-extrabold text-slate-300 tracking-wider flex items-center gap-2">
            <Building2 className="w-4 h-4 text-cyan-400" />
            Économie par Entité Organisationnelle
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Les collaborateurs sans affectation explicite sont classés en <code>UNRESOLVED</code> sans rattachement forcé.
          </p>
        </div>

        {/* View Switcher */}
        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode("BRANCH")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              viewMode === "BRANCH"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Landmark className="w-3.5 h-3.5" />
            Branches ({branchAggregates.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode("DEPARTMENT")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              viewMode === "DEPARTMENT"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Départements ({departmentAggregates.length})
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
              <th className="py-3 px-3">Entité</th>
              <th className="py-3 px-3 text-center">Effectif</th>
              <th className="py-3 px-3 text-right">Masse Salariale</th>
              <th className="py-3 px-3 text-right">Charges Patronales</th>
              <th className="py-3 px-3 text-right">Commissions</th>
              <th className="py-3 px-3 text-right">Heures Sup.</th>
              <th className="py-3 px-3 text-right">Poids Masse</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {currentList.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-slate-500">
                  Aucune donnée de paie pour cette sélection.
                </td>
              </tr>
            ) : (
              currentList.map((item) => {
                const count = item.headcount.size;
                const weight = totalCostAll > 0 ? (item.payrollCost / totalCostAll) * 100 : 0;
                const isUnresolved = item.id === "UNRESOLVED";

                return (
                  <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3 font-sans font-medium text-slate-200 flex items-center gap-2">
                      {isUnresolved ? (
                        <span className="text-amber-400 flex items-center gap-1" title="Entité non définie dans l'annuaire RH">
                          <HelpCircle className="w-3.5 h-3.5" />
                          {item.name}
                        </span>
                      ) : (
                        <span>{item.name}</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center text-slate-300">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                        {count}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-slate-200">
                      {formatCurrencyValue(item.payrollCost)}
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-400">
                      {formatCurrencyValue(item.employerCost)}
                    </td>
                    <td className="py-3 px-3 text-right text-amber-400">
                      {formatCurrencyValue(item.commissions)}
                    </td>
                    <td className="py-3 px-3 text-right text-purple-400">
                      {formatCurrencyValue(item.overtime)}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-400">
                      {weight.toFixed(1)}%
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
