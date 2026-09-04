import React from "react";
import { PayrollRecord } from "../../../types";
import { FileText, DollarSign, Printer, Download, X, Building2, ShieldCheck } from "lucide-react";

interface PayrollSlipViewerProps {
  record: PayrollRecord | null;
  onClose: () => void;
}

export const PayrollSlipViewer: React.FC<PayrollSlipViewerProps> = ({ record, onClose }) => {
  if (!record) return null;

  const gross = record.grossSalary || (record.gross_salary_cents ? record.gross_salary_cents / 100 : 0);
  const ona = record.cnssDeduction || Math.round(gross * 0.06);
  const ofatma = record.cnsDeduction || Math.round(gross * 0.02);
  const totalTax = ona + ofatma;
  const net = record.netPaid || (record.net_salary_cents ? record.net_salary_cents / 100 : gross - totalTax);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-white font-semibold">
            <FileText className="w-5 h-5 text-indigo-400" />
            <span>Bulletin de Paie Individuel</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4 text-xs font-sans">
          <div className="flex justify-between items-start border-b border-slate-800 pb-3">
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Collaborateur</span>
              <h3 className="text-base font-bold text-white">{record.employeeName}</h3>
              <span className="text-slate-400 font-mono text-[11px]">ID: {record.employeeId}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Cycle</span>
              <span className="text-indigo-400 font-semibold">{record.cycleId}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between py-1 border-b border-slate-900">
              <span className="text-slate-300">Salaire de Base Brut</span>
              <span className="font-mono font-semibold text-white">{gross.toLocaleString("fr-FR")} HTG</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-900 text-red-400">
              <span>Cotisation ONA (6%)</span>
              <span className="font-mono">-{ona.toLocaleString("fr-FR")} HTG</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-900 text-red-400">
              <span>Cotisation OFATMA (2%)</span>
              <span className="font-mono">-{ofatma.toLocaleString("fr-FR")} HTG</span>
            </div>
            <div className="flex justify-between py-2 border-t border-slate-800 text-sm font-bold">
              <span className="text-slate-200">Net à Payer</span>
              <span className="font-mono text-emerald-400">{net.toLocaleString("fr-FR")} HTG</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
