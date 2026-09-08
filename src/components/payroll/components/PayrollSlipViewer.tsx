import React from "react";
import { PayrollRecord } from "../../../types";
import { FileText, DollarSign, Printer, Download, X, Building2, ShieldCheck, Lock, Award, Clock, AlertTriangle } from "lucide-react";

interface PayrollSlipViewerProps {
  record: PayrollRecord | null;
  onClose: () => void;
}

export const PayrollSlipViewer: React.FC<PayrollSlipViewerProps> = ({ record, onClose }) => {
  if (!record) return null;

  const baseSalary = (record as any).base_salary_cents 
    ? (record as any).base_salary_cents / 100 
    : (record as any).baseSalary || 0;

  const gross = record.grossSalary ?? ((record as any).gross_salary_cents ? (record as any).gross_salary_cents / 100 : 0);
  
  // Tax deductions - respect 0 if taxes were disabled in policy
  const ona = record.cnssDeduction ?? ((record as any).cnss_employee_cents ? (record as any).cnss_employee_cents / 100 : 0);
  const ofatma = record.cnsDeduction ?? ((record as any).cns_employee_cents ? (record as any).cns_employee_cents / 100 : 0);
  const totalTax = ona + ofatma;
  const isTaxEnabled = totalTax > 0 || (record as any).enableTaxes === true;

  const commissions = (record as any).commissions ?? ((record as any).commission_cents ? (record as any).commission_cents / 100 : 0);
  const overtime = (record as any).overtimePayout ?? ((record as any).overtime_cents ? (record as any).overtime_cents / 100 : 0);
  const bonuses = (record as any).bonusesAddition ?? (record as any).bonuses ?? ((record as any).bonuses_cents ? (record as any).bonuses_cents / 100 : 0);
  const advances = (record as any).advances ?? (record as any).advancesTreated ?? ((record as any).debts_deduction_cents ? (record as any).debts_deduction_cents / 100 : 0);
  const penalties = (record as any).penalty ?? (record as any).penalties ?? (record as any).absencePenalties ?? ((record as any).penalties_cents ? (record as any).penalties_cents / 100 : 0);

  const net = record.netPaid ?? ((record as any).net_salary_cents ? (record as any).net_salary_cents / 100 : gross - totalTax - advances - penalties);

  const hashSig = record.hashSignature || (record as any).checksum || (record as any).signature || "SHA256_SEAL_PENDING";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-white font-semibold">
            <FileText className="w-5 h-5 text-indigo-400" />
            <span>Bulletin de Paie Individuel</span>
            {record.status === "SEALED" && (
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 font-mono">
                <Lock className="w-3 h-3" /> SCELLÉ
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-slate-950 p-5 rounded-xl border border-slate-800/80 space-y-4 text-xs font-sans">
          {/* Header Info */}
          <div className="flex justify-between items-start border-b border-slate-800 pb-3">
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Collaborateur</span>
              <h3 className="text-base font-bold text-white">{record.employeeName || "Employé"}</h3>
              <span className="text-slate-400 font-mono text-[11px]">ID: {record.employeeId || (record as any).employee_id}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Cycle / Période</span>
              <span className="text-indigo-400 font-semibold font-mono">{record.cycleId || (record as any).payroll_cycle_id}</span>
              {(record as any).pay_profile && (
                <span className="block text-[10px] text-slate-400 mt-0.5">Régime: {(record as any).pay_profile}</span>
              )}
            </div>
          </div>

          {/* Detailed Financial Breakdown */}
          <div className="space-y-2">
            <div className="flex justify-between py-1 border-b border-slate-900/80">
              <span className="text-slate-400">Salaire de Base</span>
              <span className="font-mono font-semibold text-white">{baseSalary.toLocaleString("fr-FR")} HTG</span>
            </div>

            {commissions > 0 && (
              <div className="flex justify-between py-1 border-b border-slate-900/80 text-indigo-400 font-mono">
                <span>Commissions Ventes</span>
                <span>+{commissions.toLocaleString("fr-FR")} HTG</span>
              </div>
            )}

            {overtime > 0 && (
              <div className="flex justify-between py-1 border-b border-slate-900/80 text-emerald-400 font-mono">
                <span>Heures Supplémentaires</span>
                <span>+{overtime.toLocaleString("fr-FR")} HTG</span>
              </div>
            )}

            {bonuses > 0 && (
              <div className="flex justify-between py-1 border-b border-slate-900/80 text-emerald-400 font-mono">
                <span>Primes & Allocations</span>
                <span>+{bonuses.toLocaleString("fr-FR")} HTG</span>
              </div>
            )}

            <div className="flex justify-between py-1.5 border-b border-slate-800 font-bold bg-slate-900/50 px-2 rounded">
              <span className="text-slate-200">Salaire Brut Total</span>
              <span className="font-mono text-white">{gross.toLocaleString("fr-FR")} HTG</span>
            </div>

            {/* Social Taxes Section */}
            {isTaxEnabled ? (
              <>
                <div className="flex justify-between py-1 border-b border-slate-900/80 text-red-400 font-mono">
                  <span>Cotisation ONA (6%)</span>
                  <span>-{ona.toLocaleString("fr-FR")} HTG</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-900/80 text-red-400 font-mono">
                  <span>Cotisation OFATMA (2%)</span>
                  <span>-{ofatma.toLocaleString("fr-FR")} HTG</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between py-1 border-b border-slate-900/80 text-slate-500 font-mono">
                <span>Cotisations Sociales (ONA / OFATMA)</span>
                <span className="uppercase text-[10px] font-bold">Désactivé (0 HTG)</span>
              </div>
            )}

            {advances > 0 && (
              <div className="flex justify-between py-1 border-b border-slate-900/80 text-rose-400 font-mono">
                <span>Remboursement Avances</span>
                <span>-{advances.toLocaleString("fr-FR")} HTG</span>
              </div>
            )}

            {penalties > 0 && (
              <div className="flex justify-between py-1 border-b border-slate-900/80 text-rose-400 font-mono">
                <span>Pénalités Absences / Retards</span>
                <span>-{penalties.toLocaleString("fr-FR")} HTG</span>
              </div>
            )}

            {/* Net Payout */}
            <div className="flex justify-between py-2 border-t-2 border-slate-800 text-sm font-bold bg-indigo-950/30 px-2 rounded my-1">
              <span className="text-indigo-300">Net à Payer</span>
              <span className="font-mono text-emerald-400 text-base">{net.toLocaleString("fr-FR")} HTG</span>
            </div>
          </div>

          {/* Protection Rule Notice */}
          {((record as any).protectionRuleEnforced || (record as any).survivalFloorEnforced) && (
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg text-[10px] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Plancher de survie appliqué : Solde net maintenu au minimum légal de protection.</span>
            </div>
          )}

          {/* Cryptogram Signature Seal */}
          <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-850 font-mono text-[10px] space-y-1">
            <span className="text-slate-500 block">Empreinte Forensique SHA-256 :</span>
            <span className="text-indigo-400 font-bold block break-all">{hashSig}</span>
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
