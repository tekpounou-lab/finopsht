import React from "react";
import { Sliders, Plus } from "lucide-react";
import { Employee } from "../../../types";
import { SalaryStructure } from "../types";

export interface StructuresTabProps {
  employees: Employee[];
  salaryStructures: SalaryStructure[];
  currentBusinessId: string;
  enableSocialTaxes: boolean;
  onOpenStructureModal: (struct: Partial<SalaryStructure>) => void;
  toCents: (val: number) => number;
}

export const StructuresTab: React.FC<StructuresTabProps> = ({
  employees,
  salaryStructures,
  currentBusinessId,
  enableSocialTaxes,
  onOpenStructureModal,
  toCents
}) => {
  return (
    <div className="flex flex-col gap-6 animate-fadeIn" id="structures-tab-content">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass p-5 rounded-2xl border border-slate-800/60">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-sans font-bold text-base text-slate-100 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-indigo-400" />
              Registre des Structures de Rémunération & Contrats
            </h3>
            {enableSocialTaxes ? (
              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 font-bold uppercase flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Taxes Sociales Activées
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] bg-amber-950/60 border border-amber-800/60 text-amber-400 font-bold uppercase flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Taxes Générales Désactivées (OFF)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 font-light mt-0.5">
            Configurez les salaires de base quinzaine/mensuel, devises et éligibilité aux contributions sociales LMG.
          </p>
        </div>
        <button
          onClick={() => {
            onOpenStructureModal({
              employee_id: employees.filter(e => e.business_id === currentBusinessId)[0]?.id || "",
              base_salary_cents: toCents(15000),
              salary_interval: "MONTHLY",
              payment_currency: "HTG",
              social_tax_eligible: true,
              insurance_cents: 0,
              payment_method: "BANK",
              bank_name: "",
              bank_account_number: ""
            });
          }}
          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-slate-100 font-bold text-xs rounded-lg transition flex items-center gap-2 cursor-pointer select-none"
        >
          <Plus className="w-4 h-4" />
          + Configurer Nouvelle Structure
        </button>
      </div>

      <div className="glass rounded-xl overflow-hidden border border-slate-800/60">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans text-xs min-w-[800px]">
            <thead>
              <tr className="bg-slate-950/70 border-b border-slate-850 text-slate-400 font-bold uppercase text-[9px] tracking-wider">
                <th className="py-3 px-4">Employé</th>
                <th className="py-3 px-4">Type Contrat</th>
                <th className="py-3 px-4 text-right">Salaire Base</th>
                <th className="py-3 px-4 text-center">Intervalle</th>
                <th className="py-3 px-4 text-center">Devise</th>
                <th className="py-3 px-4 text-center">Taxes CNSS (6%)</th>
                <th className="py-3 px-4">Mode Paiement</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {employees.filter((e) => e.business_id === currentBusinessId).map((emp) => {
                const struct = salaryStructures.find((s) => s.employee_id === emp.id);
                return (
                  <tr key={emp.id} className="hover:bg-slate-900/30 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-200">
                      <div>{emp.name}</div>
                      <span className="text-[10px] text-slate-500 font-mono">{emp.departmentId || "General Staff"}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-350">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-900 border border-slate-800 text-slate-400 uppercase font-mono">
                        {emp.paymentModel}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-250">
                      {struct ? (
                        <span>{(struct.base_salary_cents / 100).toLocaleString()}</span>
                      ) : (
                        <span className="text-slate-500 font-light italic">Non configuré ({(emp.baseSalary || 15000).toLocaleString()} fallback)</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-350 font-mono">
                      {struct?.salary_interval || "MONTHLY"}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-slate-300 font-bold">
                      {struct?.payment_currency || "HTG"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {enableSocialTaxes ? (
                        struct ? (
                          struct.social_tax_eligible !== false ? (
                            <span className="text-emerald-400 bg-emerald-950/20 border border-emerald-900/50 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">ACTIF</span>
                          ) : (
                            <span className="text-rose-400 bg-rose-950/40 border border-rose-900/50 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">EXEMPT</span>
                          )
                        ) : (
                          <span className="text-emerald-400 bg-emerald-950/20 border border-emerald-900/50 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">ACTIF (Default)</span>
                        )
                      ) : (
                        <span className="text-slate-500 bg-slate-900/80 border border-slate-800 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">INACTIF (Taxes OFF)</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {struct?.payment_method || "BANK"} {struct?.bank_name ? `(${struct.bank_name})` : ""}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => {
                          onOpenStructureModal(struct || {
                            employee_id: emp.id,
                            base_salary_cents: struct ? struct.base_salary_cents : toCents(emp.baseSalary || 15000),
                            salary_interval: struct ? struct.salary_interval : "MONTHLY",
                            payment_currency: struct ? struct.payment_currency : "HTG",
                            social_tax_eligible: struct ? struct.social_tax_eligible : true,
                            insurance_cents: struct ? struct.insurance_cents : 0,
                            payment_method: struct ? struct.payment_method : "BANK",
                            bank_name: struct ? struct.bank_name : "",
                            bank_account_number: struct ? struct.bank_account_number : ""
                          });
                        }}
                        className="px-2 py-1 bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-900/40 text-indigo-400 font-bold rounded text-[10px] cursor-pointer"
                      >
                        Gérer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
