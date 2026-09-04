import React from "react";
import { FileCheck, Download, Calculator, ShieldCheck } from "lucide-react";
import { AdaptiveModal } from "../../ui/AdaptiveModal";
import { CommissionEngine } from "../../../services/CommissionEngine";

export interface PayslipModalProps {
  focusedRecord: any | null;
  onClose: () => void;
  currentBusiness: any;
  enableSocialTaxes: boolean;
  onDownloadPdf: (rec: any) => void;
  l: any;
  fromCents: (val: number) => number;
}

export const PayslipModal: React.FC<PayslipModalProps> = ({
  focusedRecord,
  onClose,
  currentBusiness,
  enableSocialTaxes,
  onDownloadPdf,
  l,
  fromCents
}) => {
  if (!focusedRecord) return null;

  return (
    <AdaptiveModal
      isOpen={focusedRecord !== null}
      onClose={onClose}
      title={l.bulletinTitle}
      subtitle={l.issuePayslip}
      icon={<FileCheck className="w-5 h-5" />}
      iconVariant="emerald"
      maxWidthClass="w-[95%] sm:w-[85%] md:w-[70%] max-w-xl"
    >
      <div className="flex flex-col gap-4 font-sans text-xs" id="printable-payslip-canvas">
        {/* Employer / Employee Information block */}
        <div className="bg-slate-950/90 border border-slate-900 rounded-xl p-4 grid grid-cols-2 gap-4" id="payslip-entities">
          <div>
            <span className="text-[9px] uppercase text-slate-500 font-bold block">Établissement</span>
            <div className="font-bold text-slate-100">{currentBusiness?.name || "Tek Pou Nou Enterprise S.A."}</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">NIF: {currentBusiness?.nif || "003-456-789-1"}</div>
          </div>

          <div>
            <span className="text-[9px] uppercase text-slate-500 font-bold block">Bénéficiaire</span>
            <div className="font-bold text-slate-100">{focusedRecord.employeeName}</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {focusedRecord.employeeId || focusedRecord.employee_id}</div>
            <span className="px-1.5 py-0.2 rounded text-[9px] bg-indigo-950 text-indigo-400 inline-block font-mono mt-0.5">
              Régime: {focusedRecord.pay_profile}
            </span>
          </div>
        </div>

        {/* Items Table details */}
        <div className="flex flex-col gap-2 bg-slate-950/45 p-3 rounded-xl border border-slate-900" id="payslip-financials">
          <div className="flex justify-between items-center pb-1 border-b border-slate-900">
            <span className="text-[10px] uppercase font-bold text-indigo-300 tracking-wide block">Détails des Rubriques & Traçabilité Granulaire</span>
            <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
              Régime: {focusedRecord.pay_profile}
            </span>
          </div>

          <div className="flex justify-between py-1.5 border-b border-slate-900/60 font-mono" id="row-base-salary">
            <span className="text-slate-400">{l.baseSalary}</span>
            <span className="text-slate-200 font-bold">
              {focusedRecord.pay_profile === "COMMISSION" ? "0 HTG (Exclusif Commission)" : `${fromCents(focusedRecord.theoretical_quincena_base_cents).toLocaleString()} HTG`}
            </span>
          </div>

          {/* Commission Calculation Breakdown */}
          {focusedRecord.pay_profile !== "FIXED" && (
            <div className="p-2.5 rounded-lg bg-indigo-950/30 border border-indigo-900/40 flex flex-col gap-1.5 font-mono text-xs my-1" id="row-base-sales-commission-breakdown">
              <div className="flex justify-between items-center">
                <span className="text-slate-300 font-bold flex items-center gap-1">
                  <Calculator className="w-3.5 h-3.5 text-indigo-400" /> Commission sur Ventes (GL)
                </span>
                <span className="text-emerald-400 font-extrabold text-sm">
                  +{fromCents(focusedRecord.commission_cents || 0).toLocaleString()} HTG
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 pt-1 border-t border-indigo-900/30">
                <span>Volume Ventes Réalisées (GL) :</span>
                <span className="text-slate-200 font-bold">{fromCents(focusedRecord.sales_cents || 0).toLocaleString()} HTG</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Taux Stocké (Employee SSOT) :</span>
                <span className="text-amber-400 font-bold">
                  {CommissionEngine.formatCommissionRateDisplay(focusedRecord.commission_rate_stored ?? focusedRecord.commission_rate)}
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Taux Appliqué (Used Rate) :</span>
                <span className="text-cyan-400 font-bold">
                  {CommissionEngine.formatCommissionRateDisplay(focusedRecord.commission_rate_used ?? focusedRecord.commission_rate)}
                </span>
              </div>
              <div className="text-[9px] text-indigo-300/80 italic pt-0.5 border-t border-indigo-900/30 mt-1">
                Formule: {fromCents(focusedRecord.sales_cents || 0).toLocaleString()} HTG × {CommissionEngine.formatCommissionRateDisplay(focusedRecord.commission_rate_used ?? focusedRecord.commission_rate)} = {fromCents(focusedRecord.commission_cents || 0).toLocaleString()} HTG
              </div>
            </div>
          )}

          {focusedRecord.attendance_adjustment_cents < 0 && (
            <div className="flex justify-between py-1.5 border-b border-slate-900/60 font-mono" id="row-base-absences">
              <span className="text-slate-400">Ajustement Absences / Heures manquantes</span>
              <span className="text-rose-400 font-bold">-{fromCents(-focusedRecord.attendance_adjustment_cents).toLocaleString()} HTG</span>
            </div>
          )}

          {focusedRecord.overtime_cents > 0 && (
            <div className="flex justify-between py-1.5 border-b border-slate-900/60 font-mono" id="row-base-overtime">
              <span className="text-slate-400">Prime Assiduité / Heures Sup (Extra)</span>
              <span className="text-emerald-400 font-bold">+{fromCents(focusedRecord.overtime_cents).toLocaleString()} HTG</span>
            </div>
          )}

          <div className="flex flex-col py-1.5 border-b border-slate-900/60 font-mono" id="row-base-bonus">
            <div className="flex justify-between">
              <span className="text-slate-400">{l.bonus}</span>
              <span className="text-emerald-400 font-bold">+{fromCents(focusedRecord.bonuses_cents).toLocaleString()} HTG</span>
            </div>
            {focusedRecord.bonuses_cents > 0 && (
              <div className="pl-3 mt-1 flex flex-col gap-1 text-[9px] text-slate-500 font-sans leading-normal">
                {focusedRecord.performance_bonus_cents > 0 && (
                  <div className="flex justify-between items-start gap-2">
                    <span>• Primes / Allocations Documentées (Grand Livre)</span>
                    <span className="font-mono text-emerald-500 text-[10px] shrink-0">+{fromCents(focusedRecord.performance_bonus_cents).toLocaleString()} HTG</span>
                  </div>
                )}
                {focusedRecord.custom_override_bonus_cents > 0 && (
                  <div className="flex justify-between items-start gap-2">
                    <span>• Ajustement Exceptionnel / Prime Manuelle</span>
                    <span className="font-mono text-emerald-500 text-[10px] shrink-0">+{fromCents(focusedRecord.custom_override_bonus_cents).toLocaleString()} HTG</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Subtotal Gross Salary */}
          <div className="flex justify-between py-1.5 border-b border-slate-900 font-mono bg-slate-900/40 px-2 rounded" id="row-gross-salary">
            <span className="text-emerald-400 font-bold">Sous-Total Salaire Brut</span>
            <span className="text-emerald-400 font-extrabold">{fromCents(focusedRecord.gross_salary_cents).toLocaleString()} HTG</span>
          </div>

          {/* Social compliance taxes list */}
          {enableSocialTaxes ? (
            <>
              <div className="flex justify-between py-1 border-b border-slate-900/40 text-[10px] font-mono" id="row-ona-tax">
                <span className="text-slate-500">Cotisation CNSS (ONA 6%)</span>
                <span className="text-indigo-400/80">-{fromCents(focusedRecord.cnss_employee_cents || 0).toLocaleString()} HTG</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-900/40 text-[10px] font-mono" id="row-cns-tax">
                <span className="text-slate-500">Cotisation CNS (OFATMA 2%)</span>
                <span className="text-indigo-400/80">-{fromCents(focusedRecord.cns_employee_cents || 0).toLocaleString()} HTG</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between py-1 border-b border-slate-900/40 text-[10px] font-mono" id="row-tax-off">
              <span className="text-slate-500">Cotisations Sociales (ONA / OFATMA)</span>
              <span className="text-slate-500 font-bold uppercase">Désactivé (0 HTG)</span>
            </div>
          )}

          {focusedRecord.penalties_cents > 0 && (
            <div className="flex justify-between py-1.5 border-b border-slate-900/60 font-mono" id="row-base-penalties">
              <span className="text-slate-400">Pénalité Absences / Retards</span>
              <span className="text-rose-400 font-bold">-{fromCents(focusedRecord.penalties_cents).toLocaleString()} HTG</span>
            </div>
          )}

          <div className="flex justify-between py-1.5 font-mono" id="row-base-deduction">
            <span className="text-slate-400">{l.debtDeduct}</span>
            <span className="text-rose-400 font-bold">-{fromCents(focusedRecord.debts_deduction_cents || 0).toLocaleString()} HTG</span>
          </div>
        </div>

        {/* Net Payout block */}
        <div className="bg-cyan-950/20 border border-cyan-900/50 rounded-xl p-4 flex items-center justify-between font-mono" id="payslip-grand-net">
          <div>
            <span className="text-[10px] uppercase text-cyan-400 block font-semibold">{l.netPaid} (Bi-Mensuel)</span>
            <span className="text-[8px] text-slate-500">Formule déterministe certifiée</span>
          </div>
          <div className="text-lg font-extrabold text-cyan-350">
            {focusedRecord.netPaid.toLocaleString()} HTG
          </div>
        </div>

        {focusedRecord.protectionRuleEnforced && (
          <div className="p-2 sm:p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg text-[9px] font-sans">
            {l.survivalNotice}
          </div>
        )}

        {/* Forensic Ledger Signature seal */}
        <div className="p-3 bg-slate-950 rounded-xl border border-slate-900 sm:flex sm:items-center sm:justify-between text-[10px] font-mono" id="payslip-audits-row">
          <span className="text-slate-550 block sm:inline">Cryptogramme d'Intégrité:</span>
          <span className="text-cyan-500 font-bold block sm:inline break-all">{focusedRecord.hashSignature}</span>
        </div>

        <div className="flex gap-4 mt-4 border-t border-slate-850 pt-4" id="payslip-actions">
          <button
            id="btn-print-action"
            onClick={() => onDownloadPdf(focusedRecord)}
            className="flex-1 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-200 font-semibold text-xs rounded-xl cursor-pointer transition flex items-center justify-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Télécharger PDF
          </button>

          <button
            id="btn-cancel-payslip"
            onClick={onClose}
            className="flex-1 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-400 font-semibold text-xs rounded-xl cursor-pointer transition flex items-center justify-center gap-1.5"
          >
            {l.closeBtn}
          </button>
        </div>
      </div>
    </AdaptiveModal>
  );
};
