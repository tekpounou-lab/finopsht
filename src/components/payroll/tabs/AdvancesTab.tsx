import React from "react";
import { DollarSign, Plus, CheckCircle2 } from "lucide-react";
import { Employee } from "../../../types";
import { SalaryAdvance } from "../types";

export interface AdvancesTabProps {
  employees: Employee[];
  salaryAdvances: SalaryAdvance[];
  currentBusinessId: string;
  advIdToConfirm: string | null;
  setAdvIdToConfirm: (id: string | null) => void;
  onOpenAdvanceModal: (adv: Partial<SalaryAdvance>) => void;
  handleDeleteAdvance: (id: string) => void;
  handleRepayAdvanceInstantly: (adv: SalaryAdvance, amountCents: number) => void;
  toCents: (val: number) => number;
  fromCents: (val: number) => number;
}

export const AdvancesTab: React.FC<AdvancesTabProps> = ({
  employees,
  salaryAdvances,
  currentBusinessId,
  advIdToConfirm,
  setAdvIdToConfirm,
  onOpenAdvanceModal,
  handleDeleteAdvance,
  handleRepayAdvanceInstantly,
  toCents,
  fromCents
}) => {
  return (
    <div className="flex flex-col gap-6 animate-fadeIn" id="advances-tab-content">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass p-5 rounded-2xl border border-slate-800/60">
        <div>
          <h3 className="font-sans font-bold text-base text-slate-100 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-amber-400" />
            Advance Workflow Hub & Recovery Engine
          </h3>
          <p className="text-xs text-slate-400 font-light mt-0.5">
            Gérez les avances sur salaire accordées au personnel avec prélèvement automatique quinzaine capé par le seuil de subsistance de 30%.
          </p>
        </div>
        <button
          onClick={() => {
            onOpenAdvanceModal({
              employee_id: employees.filter(e => e.business_id === currentBusinessId)[0]?.id || "",
              advance_amount_cents: toCents(5000),
              recovery_installment_cents: toCents(1250),
              balance_cents: toCents(5000)
            });
          }}
          className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs rounded-lg transition flex items-center gap-2 cursor-pointer select-none"
        >
          <Plus className="w-4 h-4" />
          + Accorder Nouvelle Avance
        </button>
      </div>

      {/* Loans overview status indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="advances-meters">
        <div className="glass p-4 rounded-xl border border-slate-800/60">
          <span className="text-[10px] text-slate-400 font-bold block uppercase">Encours global des avances</span>
          <span className="font-mono text-lg font-bold text-amber-400 mt-1">
            {fromCents(salaryAdvances.filter(a => a.business_id === currentBusinessId).reduce((sum, a) => sum + (a.balance_cents || 0), 0)).toLocaleString()} HTG
          </span>
        </div>
        <div className="glass p-4 rounded-xl border border-slate-800/60">
          <span className="text-[10px] text-slate-400 font-bold block uppercase">Total avances déboursées</span>
          <span className="font-mono text-lg font-bold text-slate-200 mt-1">
            {fromCents(salaryAdvances.filter(a => a.business_id === currentBusinessId).reduce((sum, a) => sum + (a.advance_amount_cents || 0), 0)).toLocaleString()} HTG
          </span>
        </div>
        <div className="glass p-4 rounded-xl border border-slate-800/60 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-bold block uppercase">Prêts remboursés</span>
            <span className="font-mono text-lg font-bold text-emerald-400 mt-1">
              {salaryAdvances.filter(a => a.business_id === currentBusinessId && a.balance_cents === 0).length} dossiers
            </span>
          </div>
          <CheckCircle2 className="w-8 h-8 text-emerald-500/20" />
        </div>
      </div>

      <div className="glass rounded-xl overflow-hidden border border-slate-800/60">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans text-xs min-w-[800px]">
            <thead>
              <tr className="bg-slate-950/70 border-b border-slate-850 text-slate-400 font-bold uppercase text-[9px] tracking-wider">
                <th className="py-3 px-4">Bénéficiaire</th>
                <th className="py-3 px-4 text-right">Montant Initial</th>
                <th className="py-3 px-4 text-right">Amortissement / Quinzaine</th>
                <th className="py-3 px-4 text-right text-amber-400">Reste dû</th>
                <th className="py-3 px-4 text-center">Remboursé (%)</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {(salaryAdvances || []).filter((a) => a.business_id === currentBusinessId).map((adv) => {
                const paidRatio = adv.advance_amount_cents > 0 
                  ? Math.round(((adv.advance_amount_cents - adv.balance_cents) / adv.advance_amount_cents) * 100)
                  : 100;
                return (
                  <tr key={adv.id} className="hover:bg-slate-900/30 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-200">
                      {adv.employee_name}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-350">
                      {(adv.advance_amount_cents / 100).toLocaleString()} HTG
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-450 font-medium">
                      {(adv.recovery_installment_cents / 100).toLocaleString()} HTG
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-amber-400">
                      {(adv.balance_cents / 100).toLocaleString()} HTG
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-20 bg-slate-900 border border-slate-800 rounded-full h-2 overflow-hidden">
                          <div className="bg-amber-500 h-full" style={{ width: `${paidRatio}%` }} />
                        </div>
                        <span className="font-mono text-[10px] font-semibold text-slate-300">{paidRatio}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {adv.balance_cents === 0 ? (
                        <span className="text-emerald-400 bg-emerald-950/20 border border-emerald-900/50 px-1.5 py-0.5 rounded text-[9px] font-bold">SOLDE (PAID_OFF)</span>
                      ) : (
                        <span className="text-amber-400 bg-amber-950/40 border border-amber-900/50 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">EN COURS</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {advIdToConfirm === adv.id ? (
                          <div className="flex items-center gap-1 animate-in fade-in zoom-in duration-200">
                            <button
                              type="button"
                              onClick={() => {
                                handleDeleteAdvance(adv.id);
                                setAdvIdToConfirm(null);
                              }}
                              className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded text-[10px] cursor-pointer shadow-sm"
                            >
                              Confirmer
                            </button>
                            <button
                              type="button"
                              onClick={() => setAdvIdToConfirm(null)}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded text-[10px] cursor-pointer"
                            >
                              Annuler
                            </button>
                          </div>
                        ) : (
                          <>
                            {adv.balance_cents > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const amountStr = prompt("Entrez le montant de remboursement direct en gourdes (HTG):", "1000");
                                  if (amountStr && !isNaN(Number(amountStr))) {
                                    handleRepayAdvanceInstantly(adv, toCents(Number(amountStr)));
                                  }
                                }}
                                className="px-2 py-1 bg-emerald-950/45 hover:bg-emerald-900/50 border border-emerald-900/40 text-emerald-400 font-bold rounded text-[10px] cursor-pointer"
                              >
                                Rembourser
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setAdvIdToConfirm(adv.id)}
                              className="px-2 py-1 bg-rose-950/45 hover:bg-rose-900 border border-rose-900 text-rose-400 font-bold rounded text-[10px] cursor-pointer"
                            >
                              Supprimer
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(salaryAdvances || []).filter((a) => a.business_id === currentBusinessId).length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-slate-500 italic">
                    Aucune avance active présente dans ce registre d'exploitation.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
