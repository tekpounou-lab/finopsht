import React from "react";
import { Zap, Plus, Check, AlertTriangle, X } from "lucide-react";
import { Employee, PayrollCycle } from "../../../types";
import { PayrollBonus, PayrollDeduction } from "../types";

export interface AdjustmentsTabProps {
  employees: Employee[];
  payrollBonuses: PayrollBonus[];
  payrollDeductions: PayrollDeduction[];
  currentBusinessId: string;
  activeCycle: PayrollCycle;
  bonusIdToConfirm: string | null;
  setBonusIdToConfirm: (id: string | null) => void;
  deductionIdToConfirm: string | null;
  setDeductionIdToConfirm: (id: string | null) => void;
  onOpenBonusModal: (bonus: Partial<PayrollBonus>) => void;
  onOpenDeductionModal: (deduction: Partial<PayrollDeduction>) => void;
  handleDeleteBonus: (id: string) => void;
  handleDeleteDeduction: (id: string) => void;
  toCents: (val: number) => number;
}

export const AdjustmentsTab: React.FC<AdjustmentsTabProps> = ({
  employees,
  payrollBonuses,
  payrollDeductions,
  currentBusinessId,
  activeCycle,
  bonusIdToConfirm,
  setBonusIdToConfirm,
  deductionIdToConfirm,
  setDeductionIdToConfirm,
  onOpenBonusModal,
  onOpenDeductionModal,
  handleDeleteBonus,
  handleDeleteDeduction,
  toCents
}) => {
  return (
    <div className="flex flex-col gap-6 animate-fadeIn" id="adjustments-tab-content">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass p-5 rounded-2xl border border-slate-800/60">
        <div>
          <h3 className="font-sans font-bold text-base text-slate-100 flex items-center gap-2">
            <Zap className="w-5 h-5 text-rose-400" />
            Ajustements Salariaux Ponctuels
          </h3>
          <p className="text-xs text-slate-400 font-light mt-0.5">
            Saisissez des primes de performance ou des retenues pour la quinzaine active pour altérer dynamiquement le bulletin des employés.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              onOpenBonusModal({
                employee_id: employees.filter(e => e.business_id === currentBusinessId)[0]?.id || "",
                bonus_amount_cents: toCents(2000),
                reason: "Prime de rendement opérationnel"
              });
            }}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-100 font-bold text-xs rounded-lg transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            + Allouer Prime
          </button>
          <button
            onClick={() => {
              onOpenDeductionModal({
                employee_id: employees.filter(e => e.business_id === currentBusinessId)[0]?.id || "",
                deduction_amount_cents: toCents(1000),
                reason: "Retenue pour matériel endommagé"
              });
            }}
            className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-slate-100 font-bold text-xs rounded-lg transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            + Saisir Retenue
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="adjustments-grid">
        {/* Manual bonuses */}
        <div className="glass p-4 rounded-xl border border-slate-800/60">
          <h4 className="font-bold text-xs text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Check className="w-4 h-4" /> Primes de la Quinzaine Active
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-xs">
              <thead>
                <tr className="bg-slate-950/70 border-b border-slate-850 text-slate-400 font-bold text-[9px] uppercase tracking-wider">
                  <th className="py-2.5 px-3">Employé</th>
                  <th className="py-2.5 px-3">Description / Motif</th>
                  <th className="py-2.5 px-3 text-right">Montant</th>
                  <th className="py-2.5 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {payrollBonuses.filter(b => b.business_id === currentBusinessId && b.payroll_cycle_id === activeCycle.id).map(b => (
                  <tr key={b.id} className="hover:bg-slate-900/20 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-200">{b.employee_name}</td>
                    <td className="py-2.5 px-3 text-slate-400 italic text-[11px]">{b.reason}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-400 font-semibold">+{(b.bonus_amount_cents / 100).toLocaleString()} HTG</td>
                    <td className="py-2.5 px-3 text-center">
                      {bonusIdToConfirm === b.id ? (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => { handleDeleteBonus(b.id); setBonusIdToConfirm(null); }} className="text-emerald-400 font-bold text-[10px]">Oui</button>
                          <button onClick={() => setBonusIdToConfirm(null)} className="text-slate-500 font-bold text-[10px]">Non</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setBonusIdToConfirm(b.id)}
                          className="text-rose-500 hover:text-rose-400 p-1 rounded-md hover:bg-rose-500/10"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {payrollBonuses.filter(b => b.business_id === currentBusinessId && b.payroll_cycle_id === activeCycle.id).length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-xs text-slate-500 italic">
                      Aucune prime ponctuelle saisie pour ce cycle.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Manual deductions */}
        <div className="glass p-4 rounded-xl border border-slate-800/60">
          <h4 className="font-bold text-xs text-rose-455 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Retenues de la Quinzaine Active
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-xs">
              <thead>
                <tr className="bg-slate-950/70 border-b border-slate-850 text-slate-400 font-bold text-[9px] uppercase tracking-wider">
                  <th className="py-2.5 px-3">Employé</th>
                  <th className="py-2.5 px-3">Motif de la sanction</th>
                  <th className="py-2.5 px-3 text-right">Montant</th>
                  <th className="py-2.5 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {payrollDeductions.filter(d => d.business_id === currentBusinessId && d.payroll_cycle_id === activeCycle.id).map(d => (
                  <tr key={d.id} className="hover:bg-slate-900/20 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-200">{d.employee_name}</td>
                    <td className="py-2.5 px-3 text-slate-400 italic text-[11px]">{d.reason}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-rose-455 font-semibold">-{(d.deduction_amount_cents / 100).toLocaleString()} HTG</td>
                    <td className="py-2.5 px-3 text-center">
                      {deductionIdToConfirm === d.id ? (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => { handleDeleteDeduction(d.id); setDeductionIdToConfirm(null); }} className="text-emerald-400 font-bold text-[10px]">Oui</button>
                          <button onClick={() => setDeductionIdToConfirm(null)} className="text-slate-500 font-bold text-[10px]">Non</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeductionIdToConfirm(d.id)}
                          className="text-rose-500 hover:text-rose-400 p-1 rounded-md hover:bg-rose-500/10"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {payrollDeductions.filter(d => d.business_id === currentBusinessId && d.payroll_cycle_id === activeCycle.id).length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-xs text-slate-500 italic">
                      Aucune retenue ponctuelle saisie pour ce cycle.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
