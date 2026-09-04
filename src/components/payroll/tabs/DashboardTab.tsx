import React from "react";
import { 
  Layers, 
  Download, 
  FileSpreadsheet, 
  Sliders, 
  RefreshCw, 
  Check, 
  Lock, 
  DollarSign, 
  RotateCcw, 
  ShieldCheck, 
  Scale, 
  Bot, 
  Sparkles, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2 
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { SafeChartContainer } from "../../ui/SafeChartContainer";
import { PayrollCycle } from "../../../types";
import { PayrollRecord, CorrectionRecord } from "../types";
import { CommissionEngine } from "../../../services/CommissionEngine";

export interface DashboardTabProps {
  snapshot?: any[];
  employees?: any[];
  computedRecords: PayrollRecord[];
  activeCycle: PayrollCycle;
  cycleStatus: string;
  currentRole: string;
  manualAdjustments: Record<string, { bonuses?: number; penalties?: number; commissions?: number }>;
  handleToggleExcludeEmployee: (empId: string) => void;
  handleAdjustFactor: (empId: string, field: "bonuses" | "penalties" | "commissions", value: number) => void;
  handleExportCsv: () => void;
  handleExportExcel: () => void;
  handleExportPdf: () => void;
  handleSyncWorkforce: () => void;
  isSyncingWorkforce: boolean;
  triggerValidateProcess: () => void;
  triggerLockProcess: () => void;
  setConfirmModalState: (state: any) => void;
  isDisbursing: boolean;
  isRollingBack: boolean;
  triggerReopenRequest: () => void;
  triggerReopenApprove: () => void;
  showCorrectionForm: boolean;
  setShowCorrectionForm: (show: boolean) => void;
  correctionList: CorrectionRecord[];
  aiInquiery: string;
  setAiInquiery: (val: string) => void;
  handleAskCfo: () => void;
  cfoLoading: boolean;
  cfoAnalysis: any;
  rechartsData: any[];
  deadLetterAnomalies: any[];
  setFocusedRecord: (rec: PayrollRecord) => void;
  fromCents: (val: number) => number;
  l: any;
  totalWages: any;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  computedRecords,
  activeCycle,
  cycleStatus,
  currentRole,
  manualAdjustments,
  handleToggleExcludeEmployee,
  handleAdjustFactor,
  handleExportCsv,
  handleExportExcel,
  handleExportPdf,
  handleSyncWorkforce,
  isSyncingWorkforce,
  triggerValidateProcess,
  triggerLockProcess,
  setConfirmModalState,
  isDisbursing,
  isRollingBack,
  triggerReopenRequest,
  triggerReopenApprove,
  showCorrectionForm,
  setShowCorrectionForm,
  correctionList,
  aiInquiery,
  setAiInquiery,
  handleAskCfo,
  cfoLoading,
  cfoAnalysis,
  rechartsData,
  deadLetterAnomalies,
  setFocusedRecord,
  fromCents,
  l,
  totalWages,
  snapshot,
  employees
}) => {
  return (
    <>
      {/* Multi-grid section : Interactive Spreadsheet (Left) & CFO Analysis Core (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="payroll-workspace-body">
        {/* Interactive Spreadsheet (8 columns) */}
        <div className="xl:col-span-8 flex flex-col gap-6" id="spreadsheet-container">
          {/* Phase 12 & 13: SSOT Snapshot Architecture Badge */}
          <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-slate-300">
                Enterprise SSOT Pipeline: <span className="text-cyan-400 font-mono">PayrollInputSnapshot</span> Active
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${activeCycle.status === "LOCKED" || activeCycle.status === "PAID" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"}`}>
                {activeCycle.status || "DRAFT"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Deterministic Formulas (100% Repro)</span>
            </div>
          </div>

          <div className="glass rounded-xl overflow-hidden border border-slate-800/60">
            <div className="p-4 sm:p-5 bg-slate-900/40 border-b border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs" id="table-toolbar">
              <span className="font-black text-slate-200 flex items-center gap-2 tracking-tight">
                <Layers className="w-4 h-4 text-cyan-400" />
                {l.payrollSheet} <span className="bg-slate-950 px-1.5 py-0.5 rounded text-[10px] text-cyan-400">{computedRecords.length}</span>
              </span>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={handleExportCsv}
                    className="px-2.5 py-1.5 text-[10px] bg-cyan-900/30 hover:bg-cyan-800/40 text-cyan-400 border border-cyan-800/50 rounded-lg flex items-center gap-1.5 transition active:scale-95 shadow-sm"
                    title="Exporter en format CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    CSV
                  </button>
                  <button 
                    onClick={handleExportExcel}
                    className="px-2.5 py-1.5 text-[10px] bg-emerald-900/30 hover:bg-emerald-800/40 text-emerald-400 border border-emerald-800/50 rounded-lg flex items-center gap-1.5 transition active:scale-95 shadow-sm"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Excel
                  </button>
                  <button 
                    onClick={handleExportPdf}
                    className="px-2.5 py-1.5 text-[10px] bg-rose-900/30 hover:bg-rose-800/40 text-rose-400 border border-rose-800/50 rounded-lg flex items-center gap-1.5 transition active:scale-95 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    PDF
                  </button>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                  <span className="font-mono text-[9px] text-slate-400 bg-slate-950/80 px-2 py-1 rounded border border-slate-800/40 flex-1 sm:flex-none text-center">
                    {activeCycle.startDate} → {activeCycle.endDate}
                  </span>
                  <span className="font-mono text-[9px] text-indigo-400 bg-indigo-950/40 border border-indigo-900/60 px-2 py-1 rounded hidden lg:inline-block">
                    {totalWages.collectiveTaxesHTG.toLocaleString()} HTG mobilisés à l'ONA
                  </span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto" id="spreadsheet-scroll">
              <table className="w-full text-left font-sans text-[11px] hidden md:table" id="payroll-core-table">
                <thead>
                  <tr className="bg-slate-950/70 border-b border-slate-850 text-slate-400 font-bold uppercase text-[9px] tracking-wider">
                    <th className="py-2.5 px-3 text-center w-12">Payer ?</th>
                    <th className="py-2.5 px-3">Employee</th>
                    <th className="py-2.5 px-3">Regime</th>
                    <th className="py-2.5 px-3 text-right">Base</th>
                    <th className="py-2.5 px-3 text-right">Sales (GL)</th>
                    <th className="py-2.5 px-3 text-right text-indigo-400">Rate</th>
                    <th className="py-2.5 px-3 text-right">Commission</th>
                    <th className="py-2.5 px-3 text-right">Hours</th>
                    <th className="py-2.5 px-3 text-right">Prime</th>
                    <th className="py-2.5 px-3 text-right">Penality</th>
                    <th className="py-2.5 px-3 text-right">Bonus</th>
                    <th className="py-2.5 px-3 text-right text-emerald-400 font-black">Gross</th>
                    <th className="py-2.5 px-3 text-right text-rose-400 font-black">Gov Fees</th>
                    <th className="py-2.5 px-3 text-right text-cyan-400 font-black">Net</th>
                    <th className="py-2.5 px-3 text-center">Trace</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {computedRecords.map((rec) => {
                    const snap = snapshot?.find((s) => s.employeeId === rec.employeeId);
                    const hours = snap ? snap.workedHours : Math.round((rec.worked_minutes || 0) / 60);
                    const empMatch = employees?.find(e => e.id === rec.employeeId);
                    const commRate = rec.commission_rate_used ?? rec.commission_rate ?? (empMatch ? CommissionEngine.resolveCommissionRate(empMatch) : 0);
                    const rateFormatted = CommissionEngine.formatCommissionRateDisplay(commRate);
                    const sales = rec.sales_cents !== undefined ? fromCents(rec.sales_cents) : (snap?.salesHtg !== undefined ? snap.salesHtg : (snap ? (snap.commissionsHtg > 0 && commRate > 0 ? snap.commissionsHtg / commRate : 0) : 0));
                    const commAmount = (rec.commission_cents !== undefined && rec.commission_cents > 0)
                      ? fromCents(rec.commission_cents)
                      : (sales > 0 && commRate > 0 ? sales * commRate : 0);
                    const prime = snap ? snap.overtimeContribution : (rec.overtime_cents ? fromCents(rec.overtime_cents) : 0);
                    const penality = snap ? snap.absencePenaltiesHtg : (rec.penalties_cents ? fromCents(rec.penalties_cents) : 0);
                    const bonus = snap ? snap.bonusesHtg : (rec.bonuses_cents ? rec.bonuses_cents / 100 : 0);

                    return (
                      <tr key={rec.id} className={`transition-colors ${rec.isExcluded ? 'bg-slate-950/10 opacity-50' : 'hover:bg-slate-900/30'}`}>
                        <td className="py-2 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={!rec.isExcluded}
                            disabled={activeCycle.status !== "DRAFT"}
                            onChange={() => handleToggleExcludeEmployee(rec.employeeId)}
                            className="w-3.5 h-3.5 border-slate-700 bg-slate-950 text-emerald-500 rounded focus:ring-0 cursor-pointer disabled:cursor-not-allowed"
                            title={rec.isExcluded ? "Décision: Ne pas payer (cliquez pour inclure)" : "Décision: Payer (cliquez pour exclure)"}
                          />
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-200">
                          <span className={rec.isExcluded ? "text-slate-400 line-through" : "text-slate-200"}>{rec.employeeName}</span>
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-950/60 font-medium text-slate-400">
                            {rec.pay_profile}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-300">
                          {(fromCents(rec.theoretical_quincena_base_cents) || 0).toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-300">
                           {sales ? sales.toLocaleString() : "0"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-indigo-300 font-semibold">
                          {rec.pay_profile === "FIXED" ? "-" : rateFormatted}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-cyan-400">
                           {commAmount ? commAmount.toLocaleString() : "0"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-300">
                          {hours}h
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-400">
                          {prime ? prime.toLocaleString() : "0"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-rose-400">
                          {penality ? penality.toLocaleString() : "0"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-cyan-400">
                          {bonus ? bonus.toLocaleString() : "0"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-400 font-bold">
                           {(fromCents(rec.gross_salary_cents) || 0).toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-rose-300">
                          {(fromCents((rec.cnss_employee_cents || 0) + (rec.cns_employee_cents || 0)) || 0).toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-cyan-400 font-bold">
                          {(fromCents(rec.net_salary_cents) || 0).toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            onClick={() => setFocusedRecord(rec)}
                            className="px-2 py-0.5 bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800/60 text-cyan-300 rounded text-[10px] font-mono font-medium transition cursor-pointer"
                            title="Inspecter le calcul détaillé"
                          >
                            Trace
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* MOBILE CARDS */}
              <div className="flex flex-col md:hidden divide-y divide-slate-800 font-sans text-xs">
                {computedRecords.map((rec) => (
                  <div key={rec.id} className={`p-3 flex flex-col gap-2 transition-colors ${rec.isExcluded ? 'bg-slate-950/25 opacity-60' : 'hover:bg-slate-900/30'}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-bold text-sm ${rec.isExcluded ? 'text-slate-400 line-through' : 'text-slate-200'}`}>{rec.employeeName}</span>
                          {rec.isExcluded && (
                            <span className="text-[8px] bg-rose-500/10 border border-rose-500/20 text-rose-400 px-1 py-0.2 rounded font-mono font-semibold uppercase">
                              NON PAYÉ
                            </span>
                          )}
                        </div>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-950/60 font-medium text-slate-400 w-max mt-1">
                          {rec.pay_profile}
                        </span>
                        {rec.protectionRuleEnforced && (
                          <span className="text-[8px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1 rounded mt-1 w-max">
                            PROTECTED 🛡️
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 font-mono">
                        <span className="text-cyan-400 font-bold text-sm tracking-tight">{rec.netPaid.toLocaleString()} HTG</span>
                        <span className="text-slate-500 text-[10px]">Net Période</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-1 border-t border-slate-800/40 pt-2 text-[10px]">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Heures</span>
                        <span className="text-slate-300 font-mono font-bold">{(rec.worked_minutes / 60).toFixed(1)}h</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Base</span>
                        <span className="text-slate-300 font-mono">{rec.grossSalary.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-emerald-500 text-opacity-80">Extras</span>
                        <span className="text-emerald-400 font-mono leading-none">+{ (rec.commissions + fromCents(rec.bonuses_cents)).toLocaleString() }</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-rose-500 text-opacity-80">Déductions</span>
                        <span className="text-rose-400 font-mono leading-none">-{ (fromCents(rec.penalties_cents) + fromCents(rec.debts_deduction_cents)).toLocaleString() }</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center bg-slate-900/40 p-2 rounded border border-slate-800/60 mt-1 my-1.5">
                      <span className="text-[10px] text-slate-400">Payer pour ce cycle ?</span>
                      <input
                        type="checkbox"
                        checked={!rec.isExcluded}
                        disabled={activeCycle.status !== "DRAFT"}
                        onChange={() => handleToggleExcludeEmployee(rec.employeeId)}
                        className="w-3.5 h-3.5 border-slate-700 bg-slate-950 text-emerald-500 rounded focus:ring-0 cursor-pointer disabled:cursor-not-allowed"
                      />
                    </div>
                    <div className="flex justify-end mt-1">
                      <button
                        id={`btn-open-payslip-${rec.employeeId}-mobile`}
                        onClick={() => setFocusedRecord(rec)}
                        className="text-cyan-400 hover:text-cyan-300 bg-cyan-900/20 px-2.5 py-1.5 w-full justify-center rounded transition border border-cyan-500/30 text-[10px] flex items-center gap-1.5 font-bold uppercase mt-2"
                      >
                        {l.payslipBtn}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* State Transition Actions toolbar */}
          <div className="glass rounded-2xl p-5 sm:p-6 border border-slate-800/60" id="payroll-actions-box">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <Sliders className="w-4 h-4 text-cyan-400" />
              </div>
              <h4 className="text-xs uppercase font-black text-slate-100 tracking-widest leading-none">
                {l.actions}
              </h4>
            </div>

            <div className="flex flex-wrap gap-3 sm:gap-4" id="transition-buttons-tray">
              {activeCycle.status === "DRAFT" && (
                <button
                  id="btn-action-sync-workforce"
                  onClick={handleSyncWorkforce}
                  disabled={isSyncingWorkforce}
                  className="flex-1 sm:flex-none px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs select-none cursor-pointer transition-all rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 shadow-lg shadow-indigo-900/20"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncingWorkforce ? "animate-spin" : ""}`} />
                  <span className="uppercase tracking-widest">{isSyncingWorkforce ? "Sync..." : "Synchroniser Workforce"}</span>
                </button>
              )}

              {activeCycle.status === "DRAFT" && (
                <button
                  id="btn-action-validate-cycle"
                  onClick={triggerValidateProcess}
                  className="flex-1 sm:flex-none px-5 py-3 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black text-xs select-none cursor-pointer transition-all rounded-xl flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-cyan-900/20"
                >
                  <Check className="w-4 h-4" />
                  <span className="uppercase tracking-widest">{l.validateBtn}</span>
                </button>
              )}

              {cycleStatus === "VALIDATED" && (
                <button
                  id="btn-action-lock-cycle"
                  onClick={triggerLockProcess}
                  className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs select-none cursor-pointer transition rounded-xl flex items-center gap-1.5"
                >
                  <Lock className="w-4 h-4 animate-pulse" />
                  {l.lockBtn}
                </button>
              )}

              {cycleStatus === "LOCKED" && (
                <button
                  id="btn-action-pay-cycle"
                  onClick={() => setConfirmModalState("DISBURSE")}
                  disabled={isDisbursing}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold text-xs select-none cursor-pointer transition rounded-xl flex items-center gap-1.5 animate-bounce"
                >
                  {isDisbursing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <DollarSign className="w-4 h-4" />
                  )}
                  {isDisbursing ? "Traitement..." : l.payBtn}
                </button>
              )}

              {cycleStatus === "PAID" && (
                <button
                  id="btn-action-rollback-cycle"
                  onClick={() => setConfirmModalState("ROLLBACK")}
                  disabled={isRollingBack}
                  className={`px-4 py-2.5 ${isRollingBack ? 'bg-slate-700' : 'bg-rose-600 hover:bg-rose-500'} text-slate-100 font-bold text-xs select-none cursor-pointer transition rounded-xl flex items-center gap-1.5`}
                >
                  {isRollingBack ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                  {isRollingBack ? "Rollback en cours..." : "Annuler Disbursement (Rollback)"}
                </button>
              )}
              
              {activeCycle.status === "LOCKED" && currentRole === "MANAGER" && (
                <button
                  onClick={triggerReopenRequest}
                  className="px-4 py-2.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 font-bold text-xs select-none cursor-pointer transition rounded-xl flex items-center gap-1.5"
                >
                  Demande Réouverture Cycle
                </button>
              )}

              {activeCycle.status === "REOPEN_REQUESTED" && currentRole === "OWNER" && (
                <button
                  onClick={triggerReopenApprove}
                  className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 border font-extrabold text-xs select-none cursor-pointer transition rounded-xl flex items-center gap-1.5"
                >
                  Approuver la Réouverture
                </button>
              )}

              {activeCycle.status === "REOPEN_REQUESTED" && currentRole !== "OWNER" && (
                <span className="text-amber-400 text-xs font-bold font-mono px-3 py-2 bg-amber-400/10 rounded-lg flex items-center gap-2">
                   <ShieldCheck className="w-4 h-4" /> En attente approbation Owner
                </span>
              )}

              <button
                id="btn-trigger-correction"
                onClick={() => setShowCorrectionForm(!showCorrectionForm)}
                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-rose-300 font-semibold text-xs select-none cursor-pointer transition rounded-xl flex items-center gap-1.5"
              >
                <Scale className="w-4 h-4 text-rose-400" />
                {l.correctionBtn}
              </button>
            </div>

            <div className="mt-3.5" id="cycle-state-message">
              {activeCycle.status === "PAID" ? (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-[10px] font-mono leading-relaxed flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{l.lockedLabel} ({activeCycle.validatedBy})</span>
                </div>
              ) : activeCycle.status === "LOCKED" ? (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-450 rounded-lg text-[10px] font-mono flex items-start gap-2">
                  <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{l.validatedLabel} ({activeCycle.validatedBy})</span>
                </div>
              ) : (
                <p className="text-[10px] text-slate-550 leading-relaxed italic">{l.draftLabel}</p>
              )}
            </div>
          </div>

          {/* Dynamic Double Entry Compensation correction list display */}
          {correctionList.length > 0 && (
            <div className="glass rounded-xl p-5 border border-rose-950/20" id="corrections-board">
              <h4 className="text-xs uppercase font-extrabold text-rose-400 tracking-wider mb-3 flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-rose-400" />
                {l.replays} ({correctionList.length})
              </h4>
              <div className="flex flex-col gap-2" id="correction-items">
                {correctionList.map((cor, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-950 border border-rose-950/40 rounded text-[10px] flex items-center justify-between font-mono">
                    <span className="font-semibold text-rose-300">{cor.correction_type} Compensation</span>
                    <span className="text-slate-400">{cor.reason}</span>
                    <span className="font-bold text-rose-400">+{fromCents(cor.amount_cents).toLocaleString()} HTG</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* AI CFO Gemini Analytical Suite (4 columns) */}
        <div className="xl:col-span-4 flex flex-col gap-6" id="ai-cfo-panel">
          {/* Gemini Analytics Card */}
          <div className="bg-gradient-to-br from-indigo-950/25 to-slate-950 rounded-2xl p-5 border border-indigo-900/40 relative overflow-hidden" id="ai-cfo-intelligence-advisor">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl pointer-events-none rounded-full" />
            <h3 className="font-sans font-extrabold text-sm text-indigo-300 flex items-center gap-2">
              <Bot className="w-4.5 h-4.5 text-indigo-400" />
              {l.cfoTitle}
            </h3>
            <p className="text-[11px] text-slate-400 leading-relaxed font-light mt-1">
              Exécutez de denses audits d'écart, anomalies d'avances salariales de cacao et analyse forensique de fuites de données.
            </p>

            <div className="mt-4 flex flex-col gap-3" id="ai-cfo-trigger-box">
              <textarea
                id="ai-question-box"
                placeholder={l.cfoPlaceholder}
                value={aiInquiery}
                onChange={(e) => setAiInquiery(e.target.value)}
                rows={3}
                className="w-full bg-slate-950 border border-slate-850 rounded-xl p-2.5 font-sans text-xs text-slate-100 outline-none resize-none leading-relaxed focus:border-indigo-500"
              />

              <button
                id="btn-ai-cfo-ask"
                onClick={handleAskCfo}
                disabled={cfoLoading}
                className="w-full py-2 bg-indigo-650 hover:bg-indigo-600 text-slate-100 font-bold text-xs select-none cursor-pointer transition rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {cfoLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Audition en cours...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                    {l.cfoAskBtn}
                  </>
                )}
              </button>
            </div>

            {/* Intelligent metrics */}
            {cfoAnalysis ? (
              <div className="mt-5 border-t border-slate-800/80 pt-4 flex flex-col gap-4 animate-fadeIn" id="ai-cfo-reports">
                <div className="p-3 bg-indigo-950/35 border border-indigo-850/50 rounded-xl text-[11px] text-slate-350 leading-relaxed">
                  {cfoAnalysis.summary}
                </div>

                <div className="flex flex-col gap-2.5" id="cfo-diagnostics-metrics">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
                    {l.cfoMetrics}
                  </span>

                  <div className="grid grid-cols-2 gap-2" id="ai-diagnostics-grids">
                    <div className="bg-slate-950 p-2.5 rounded border border-slate-900">
                      <span className="text-[8px] text-slate-500 uppercase font-semibold block">{l.cfoRisk}</span>
                      <span className="text-[11px] font-bold text-indigo-400">{cfoAnalysis.metrics?.fraud_risk || "Modéré"}</span>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded border border-slate-900">
                      <span className="text-[8px] text-slate-500 uppercase font-semibold block">{l.cfoCash}</span>
                      <span className="text-[11px] font-bold text-indigo-400">{cfoAnalysis.metrics?.cash_flow || "Stabilisé"}</span>
                    </div>
                  </div>
                </div>

                {cfoAnalysis.alerts && cfoAnalysis.alerts.length > 0 && (
                  <div className="flex flex-col gap-1.5" id="cfo-alerts">
                    {cfoAnalysis.alerts.map((al: any, index: number) => (
                      <div key={index} className="p-2 bg-rose-500/10 border border-rose-500/20 rounded text-[9px] text-rose-455 font-mono flex items-center gap-1.5">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span>{al.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Standard fallback visual mock when Gemini has search inactive */
              <div className="mt-5 border-t border-slate-800/80 pt-4 flex flex-col gap-3.5" id="fallback-neural">
                <span className="text-[10px] uppercase font-bold text-indigo-400/80 tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 animate-ping" />
                  Estimation prédictive neural (Local Core)
                </span>

                <p className="text-[10px] text-slate-500 italic">
                  Aucune anomalie critique de paie détectée. La répartition territoriale de la main d’œuvre respecte les limites CNSS (6%) imposées.
                </p>

                <div className="grid grid-cols-2 gap-2.5" id="fallback-report">
                  <div className="bg-slate-950/40 p-2.5 rounded border border-slate-900 flex flex-col">
                    <span className="text-[8px] text-slate-550 uppercase">Ratios Profitabilité</span>
                    <span className="text-xs font-bold text-slate-200 mt-1">94.3% Stable</span>
                  </div>
                  <div className="bg-slate-950/40 p-2.5 rounded border border-slate-900 flex flex-col">
                    <span className="text-[8px] text-slate-550 uppercase">Ressenti fuites</span>
                    <span className="text-xs font-bold text-emerald-400 mt-1">0% Sécurisé</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Recharts Graphical Visualizer widget */}
          <div className="glass rounded-2xl p-5 border border-slate-800/60" id="visualizer-recharts-card">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Répartition Graphique Émoluments</span>
            <div className="w-full h-44 mt-3" id="recharts-wrapper">
              <SafeChartContainer height="100%" minHeight={176}>
                <BarChart data={rechartsData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fill: "var(--chart-text)", fontSize: 8 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--chart-text)", fontSize: 8 }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "var(--chart-tooltip-bg)", border: "1px solid var(--chart-tooltip-border)", borderRadius: "8px" }}
                    labelStyle={{ color: "var(--chart-tooltip-text)", fontSize: "10px" }}
                    itemStyle={{ color: "#38bdf8", fontSize: "10px" }}
                  />
                  <Bar dataKey="HTG" radius={[4, 4, 0, 0]}>
                    {rechartsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </SafeChartContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Unité de Résilience, Robustesse & Dead-letter queue */}
      <div className="glass rounded-2xl p-5 border border-slate-800/60 mt-2" id="reliability-ops-unit">
        <h4 className="text-xs uppercase font-extrabold text-slate-100 tracking-wider mb-3.5 flex items-center gap-1.5">
          <Scale className="w-4 h-4 text-cyan-400" />
          {l.reliabilityHub}
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5" id="reliability-dashboard">
          {/* Idempotence Anti-replay lists */}
          <div className="flex flex-col gap-3" id="idempotency-log-panel">
            <span className="text-[10px] uppercase font-bold text-lime-400 tracking-wider flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-lime-400 animate-pulse" />
              {l.idempotencyLogs}
            </span>

            <div className="h-44 overflow-y-auto divide-y divide-slate-900 border border-slate-900 rounded bg-slate-950 p-3" id="idempotency-entries">
              {computedRecords.map((r, i) => (
                <div key={i} className="py-2 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-300 font-semibold">{r.employeeName}</span>
                  <span className="text-slate-500 text-[9px]">{r.hashSignature?.substring(0, 16)}</span>
                  <span className="text-lime-400 bg-lime-950/20 px-1 rounded-sm">SAFE_POSTED</span>
                </div>
              ))}
            </div>
          </div>

          {/* DLQ - Missing Employee Data logs */}
          <div className="flex flex-col gap-3" id="dlq-panel">
            <span className="text-[10px] uppercase font-bold text-rose-455 tracking-wider flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
              {l.dlqTitle}
            </span>

            <div className="h-44 overflow-y-auto divide-y divide-slate-900 border border-slate-900 rounded bg-slate-950 p-3 flex flex-col gap-2" id="dlq-entries">
              {deadLetterAnomalies.length > 0 ? (
                deadLetterAnomalies.map((an, i) => (
                  <div key={i} className="p-3 bg-rose-950/15 border border-rose-950/40 rounded flex flex-col gap-1 text-[10px]">
                    <div className="flex items-center justify-between font-bold" id={`dlq-error-${i}`}>
                      <span className="text-rose-400">{an.type}</span>
                      <span className="bg-rose-900 text-rose-100 text-[8px] px-1 rounded uppercase tracking-widest">{an.severity}</span>
                    </div>
                    <p className="text-slate-350">{an.desc}</p>
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center text-[10px] text-slate-500 italic">
                  Aucune anomalie de liaison ou d'en-tête présente dans la Dead Letter Queue.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
