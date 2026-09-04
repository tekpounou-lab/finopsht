import React from "react";
import { FileCheck, Printer, Trash2 } from "lucide-react";
import { PayrollRecord } from "../types";

export interface PayslipsTabProps {
  computedRecords: PayrollRecord[];
  enableSocialTaxes: boolean;
  onSetFocusedRecord: (rec: PayrollRecord) => void;
  onDeletePayrollRecord?: (id: string) => void;
}

export const PayslipsTab: React.FC<PayslipsTabProps> = ({
  computedRecords,
  enableSocialTaxes,
  onSetFocusedRecord,
  onDeletePayrollRecord
}) => {
  return (
    <div className="flex flex-col gap-6 animate-fadeIn" id="payslips-tab-content">
      <div className="glass p-5 rounded-2xl border border-slate-800/60">
        <h3 className="font-sans font-bold text-base text-slate-100 flex items-center gap-2">
          <FileCheck className="w-5 h-5 text-emerald-400" />
          Portail de Consultation des Bulletins Certifiés (FinOps V3)
        </h3>
        <p className="text-xs text-slate-400 font-light mt-0.5">
          Visualisez, imprimez et téléchargez au format PDF hautement fidèle les bulletins de salaire cryptographiquement certifiés.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="payslip-cards-grid">
        {computedRecords.map((rec) => {
          return (
            <div key={rec.id} className="glass p-5 rounded-xl border border-slate-800/60 flex flex-col justify-between hover:border-slate-700/80 transition-all duration-300">
              <div>
                <div className="flex items-center justify-between border-b border-slate-850 pb-2.5 mb-3">
                  <span className="font-bold text-slate-200">{rec.employeeName}</span>
                  <span className="font-mono text-[9px] bg-indigo-950 border border-indigo-900 text-indigo-400 px-1.5 py-0.5 rounded uppercase font-semibold">
                    {rec.pay_profile}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 font-sans text-xs text-slate-400 mb-4">
                  <div className="flex justify-between">
                    <span>Salaire de Base:</span>
                    <span className="font-mono text-slate-250 font-medium">{(rec.base_salary_cents / 100).toLocaleString()} HTG</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Contributions CNSS/CNS:</span>
                    <span className={`font-mono text-slate-250 font-medium ${!enableSocialTaxes ? "text-slate-500" : ""}`}>
                      {enableSocialTaxes ? `-${(rec.cnss_employee_cents / 100 + rec.cns_employee_cents / 100).toLocaleString()} HTG` : "0 HTG (OFF)"}
                    </span>
                  </div>
                  {rec.debts_deduction_cents > 0 && (
                    <div className="flex justify-between">
                      <span className="text-amber-400">Remboursement Avance:</span>
                      <span className="font-mono text-amber-400 font-semibold">-{(rec.debts_deduction_cents / 100).toLocaleString()} HTG</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-850/60 pt-1.5 mt-1 font-bold text-slate-200">
                    <span>Net à Recevoir:</span>
                    <span className="font-mono text-cyan-400">{(rec.net_salary_cents / 100).toLocaleString()} HTG</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => onSetFocusedRecord(rec)}
                className="w-full py-2 bg-cyan-900/25 hover:bg-cyan-850 text-cyan-400 border border-cyan-800/50 hover:text-cyan-300 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Générer & Imprimer Bulletin
              </button>
              {rec.status !== "PAID" && onDeletePayrollRecord && (
                <button
                  onClick={() => onDeletePayrollRecord(rec.id)}
                  className="w-full py-2 mt-2 bg-rose-900/25 hover:bg-rose-850 text-rose-400 border border-rose-800/50 hover:text-rose-300 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Supprimer Enregistrement
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
