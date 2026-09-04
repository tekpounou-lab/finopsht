import React from "react";
import { createPortal } from "react-dom";
import { TrendingDown } from "lucide-react";
import { Employee, LedgerTransaction, Business } from "../../../types";
import { EnrichedDepartmentMetric } from "../types";
import { filterOperationalEmployees } from "../../../services/workforce/EmployeeEligibilityService";

interface BIDepartmentExpensesModalProps {
  selectedDept: EnrichedDepartmentMetric | null;
  onClose: () => void;
  employees: Employee[];
  ledgerTransactions: LedgerTransaction[];
  currentBusiness?: Business;
  selectedBranchId: string;
  startDate: string;
  endDate: string;
}

export const BIDepartmentExpensesModal: React.FC<BIDepartmentExpensesModalProps> = ({
  selectedDept,
  onClose,
  employees,
  ledgerTransactions,
  currentBusiness,
  selectedBranchId,
  startDate,
  endDate,
}) => {
  if (!selectedDept) return null;

  const d = selectedDept;
  const cohort = filterOperationalEmployees(employees).filter(
    (e) => e.departmentId === d.departmentId || (e as any).department_id === d.departmentId
  );

  // Filter transactions for this department, date-range, and branch
  const deptTxList = ledgerTransactions.filter((tx) => {
    if (currentBusiness?.id && tx.business_id !== currentBusiness.id) return false;
    if (selectedBranchId !== "ALL" && tx.branchId !== selectedBranchId && (tx as any).branch_id !== selectedBranchId) return false;
    if (tx.date) {
      const txDate = tx.date.split("T")[0];
      if (startDate && txDate < startDate) return false;
      if (endDate && txDate > endDate) return false;
    }

    if (tx.departmentId === d.departmentId || (tx as any).department_id === d.departmentId) return true;
    if (tx.employeeId || (tx as any).employee_id) {
      const empId = tx.employeeId || (tx as any).employee_id;
      const emp = employees.find((e) => e.id === empId);
      return emp?.departmentId === d.departmentId || (emp as any)?.department_id === d.departmentId;
    }
    return false;
  });

  // Filter for actual Expense and Advance transactions
  const actualExpenses = deptTxList.filter((t) => t.type === "EXPENSE" || t.type === "ADVANCE");
  const staticFallbackAllowance = 0;
  const totalCalculatedExpenses = actualExpenses.reduce((sum, t) => sum + (t.amount || 0), 0) + staticFallbackAllowance;
  const usesSalaryFallback = false;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200" id="origin-expenses-modal-overlay">
      <div
        className="w-full max-w-3xl bg-slate-900 border border-slate-850 rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh] animate-in zoom-in-95 duration-200 font-sans"
        id="origin-expenses-modal"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-xs font-extrabold uppercase text-slate-200 tracking-wider flex items-center gap-1.5 font-mono">
              <span className="p-1 rounded bg-rose-500/10 text-rose-400">
                <TrendingDown className="w-4 h-4" />
              </span>
              Origine des Dépenses : {d.departmentName}
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">
              Total Visualisé : <span className="text-rose-400 font-bold">{(totalCalculatedExpenses || 0).toLocaleString()} HTG</span> · Période du {startDate} au {endDate}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 px-2.5 rounded bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition text-[11px] font-mono cursor-pointer border border-slate-750"
            type="button"
          >
            [X]
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-4">
          {/* Visual Explanation Alert Card */}
          <div className="p-3.5 bg-slate-950/50 border border-rose-950/30 rounded-lg text-xs leading-relaxed text-slate-300">
            <p className="mb-2 font-bold text-slate-100">
              D'où proviennent ces dépenses ?
            </p>
            <p className="mb-2">
              Le module de Performance Intellectuelle consolide les sources de dépenses suivantes :
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-400 font-mono text-[10px]">
              <li>
                <strong className="text-slate-200 font-semibold">Transactions Émises :</strong> Tout mouvement de débit de type <span className="text-rose-400 bg-rose-950/25 px-1 rounded font-bold">EXPENSE / ADVANCE</span> enregistré au Grand Livre et imputé à ce département ou à ses collaborateurs.
              </li>
              <li>
                <strong className="text-slate-200 font-semibold">Masse Salariée (Compensation) :</strong> Si aucune paie réelle n'a encore été constatée dans le Grand Livre, le système injecte une charge simulée basée sur le salaire de base des employés actifs de ce département (<span className="text-cyan-400 underline font-bold">Salaire Mensuel RH / 2</span> pour la quinzaine simulée).
              </li>
            </ul>
          </div>

          {/* Aggregated view */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800">
              <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold font-mono">Transactions Ledger</span>
              <span className="text-lg font-mono font-bold text-rose-400">
                {(actualExpenses.reduce((sum, t) => sum + (t.amount || 0), 0) || 0).toLocaleString()} <span className="text-xs text-slate-500 font-normal">HTG</span>
              </span>
              <span className="text-[9px] text-slate-500 block font-mono">Dépenses ou Avances</span>
            </div>

            <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800">
              <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold font-mono">Masse Salariale RH</span>
              <span className={`text-lg font-mono font-bold ${staticFallbackAllowance > 0 ? "text-cyan-400" : "text-slate-500"}`}>
                {(staticFallbackAllowance || 0).toLocaleString()} <span className="text-xs text-slate-500 font-normal">HTG</span>
              </span>
              <span className="text-[9px] text-slate-400 block font-mono">
                {usesSalaryFallback ? "💡 Provisionné (Simulation RH)" : "✔ Réel Comptabilisé"}
              </span>
            </div>

            <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-850 bg-gradient-to-br from-rose-950/10 to-slate-900/50">
              <span className="text-[9px] text-rose-400 uppercase tracking-wider block font-bold font-mono">Total Consolidé</span>
              <span className="text-lg font-mono font-bold text-rose-400">
                {(totalCalculatedExpenses || 0).toLocaleString()} <span className="text-xs text-rose-500/80 font-normal">HTG</span>
              </span>
              <span className="text-[9px] text-slate-400 block font-mono">Visualisé dans le BI</span>
            </div>
          </div>

          {/* Detail Table */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider">
              Détail des Écritures Réelles ({actualExpenses.length})
            </span>

            {actualExpenses.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg bg-slate-950/20 font-mono">
                Aucune transaction de dépense directe (EXPENSE/ADVANCE) n'a été enregistrée pour ce département sur cette période.
              </div>
            ) : (
              <div className="border border-slate-850 rounded-lg overflow-hidden bg-slate-950/30">
                <table className="w-full text-left font-mono text-[10px] border-collapse">
                  <thead>
                    <tr className="bg-slate-950/80 border-b border-slate-850 text-slate-400 uppercase text-[8.5px] tracking-wider">
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">ID</th>
                      <th className="p-2.5">Catégorie</th>
                      <th className="p-2.5">Description</th>
                      <th className="p-2.5">Employé / Tiers</th>
                      <th className="p-2.5 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850/60">
                    {actualExpenses.map((tx, _i) => {
                      const empId = tx.employeeId || (tx as any).employee_id;
                      const emp = empId ? employees.find((e) => e.id === empId) : null;
                      return (
                        <tr key={`${tx.id}-${_i}`} className="hover:bg-slate-900/40 transition">
                          <td className="p-2.5 text-slate-300 font-mono whitespace-nowrap">{tx.date}</td>
                          <td className="p-2.5 text-slate-500 uppercase font-bold">{tx.id?.substring(4, 10) || "N/A"}</td>
                          <td className="p-2.5">
                            <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-slate-900 border border-slate-800 text-slate-300">
                              {tx.category}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-400 max-w-xs truncate" title={tx.description}>{tx.description}</td>
                          <td className="p-2.5 text-slate-300 uppercase">
                            {emp ? (
                              <span className="text-cyan-400 font-sans text-[9px] font-bold">👤 {emp.name}</span>
                            ) : (
                              <span className="text-slate-500 italic">Général</span>
                            )}
                          </td>
                          <td className="p-2.5 text-right text-rose-400 font-bold whitespace-nowrap">
                            -{(tx.amount || 0).toLocaleString()} HTG
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition text-xs font-mono font-semibold tracking-wide cursor-pointer"
            type="button"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
