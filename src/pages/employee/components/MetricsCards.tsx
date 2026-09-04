import React from "react";
import { Clock, Wallet, FileText, CheckCircle2 } from "lucide-react";
import { Employee, EmployeeContract } from "../../../types";
import { EmployeeScorecard } from "../../../domains/analytics/types";

interface MetricsCardsProps {
  employee: Employee;
  scorecard?: Partial<EmployeeScorecard> | any;
  contract?: EmployeeContract;
  tw: any;
}

export const MetricsCards: React.FC<MetricsCardsProps> = ({
  employee,
  scorecard,
  contract,
  tw,
}) => {
  // Analytical variables populated by EmployeeAnalyticsSnapshot (scorecard) if exists, fallback nicely
  const attendanceRate = scorecard ? scorecard.attendanceConsistencyScore : 100;
  const latenessRate = scorecard ? scorecard.latenessScore : 0;
  const totalHoursWorked = scorecard ? scorecard.totalHours : 0;
  
  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("fr-HT", {
      style: "currency",
      currency: "HTG",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8" id="workspace-metrics-grid">
      {/* CARD 1: Centralized Timesheet KPIs */}
      <div className="p-6 rounded-[2rem] bg-slate-900/30 border border-slate-800/40 flex flex-col justify-between hover:bg-slate-900/50 transition-all duration-300">
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-slate-900 mb-4">
            <h3 className="text-[10px] font-black font-mono text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-500" />
              {tw.kpiPresenceTitle || "PRÉSENCE (MOIS EN COURS)"}
            </h3>
            {scorecard?.underperformanceSignal ? (
              <span className="text-[8px] font-mono px-2 py-0.5 bg-rose-500/10 text-rose-400 rounded-lg border border-rose-500/20 font-black tracking-widest">
                ⚠️ ALERTE
              </span>
            ) : (
              <span className="text-[8px] font-mono px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 font-black tracking-widest">
                ● {scorecard?.currentMonthLabel || "JUILLET 2026"}
              </span>
            )}
          </div>
          
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-black font-mono tracking-tighter text-slate-100">
              {attendanceRate.toFixed(1)}%
            </span>
            <span className="text-xs font-mono text-slate-500 ml-2">assiduité mois</span>
          </div>

          <div className="mt-6 space-y-3">
            <div className="flex justify-between items-center text-[11px] font-bold">
              <span className="text-slate-500 uppercase tracking-widest">{tw.heuresValidees || "Heures ce mois"}</span>
              <span className="text-slate-200 font-mono">{totalHoursWorked.toFixed(1)}h</span>
            </div>
            <div className="flex justify-between items-center text-[11px] font-bold">
              <span className="text-slate-500 uppercase tracking-widest">{tw.scorePonctualite || "Taux Retard"}</span>
              <span className="text-rose-400 font-mono">{latenessRate.toFixed(1)}%</span>
            </div>
          </div>
        </div>
        
        <div className="mt-8 pt-4 border-t border-slate-900">
          <p className="text-[10px] font-mono text-slate-500 leading-tight">
            Mis à jour au {scorecard?.currentDayLabel || "31 Juillet 2026"} • SSOT Engine
          </p>
        </div>
      </div>

      {/* CARD 2: Base Salary Estimation & Compensation Type */}
      <div className="p-6 rounded-[2rem] bg-slate-900/30 border border-slate-800/40 flex flex-col justify-between hover:bg-slate-900/50 transition-all duration-300">
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-slate-900 mb-4">
            <h3 className="text-[10px] font-black font-mono text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
              <Wallet className="w-4 h-4 text-cyan-500" />
              {tw.kpiSalairesTitle || "COMPENSATION"}
            </h3>
            <span className="text-[8px] font-mono px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-lg border border-cyan-500/20 font-black tracking-widest uppercase">
              {employee.paymentModel || "FIXE"}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black font-mono tracking-tighter text-slate-100">
              {formatCurrency(employee.baseSalary || 0)}
            </span>
          </div>

          <div className="mt-6 space-y-3">
            <div className="flex justify-between items-center text-[11px] font-bold">
              <span className="text-slate-500 uppercase tracking-widest">{tw.commsEarned || "Commissions"}</span>
              <span className="text-emerald-400 font-mono">
                {scorecard ? formatCurrency(scorecard.commissions) : "HTG 0"}
              </span>
            </div>
            <div className="flex justify-between items-center text-[11px] font-bold">
              <span className="text-slate-500 uppercase tracking-widest">{tw.modePaye || "Régime"}</span>
              <span className="text-slate-200 uppercase tracking-tighter">{employee.contractType || "cdi"}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-4 border-t border-slate-900">
          <p className="text-[10px] font-mono text-slate-500 leading-tight">
            {tw.disclaimerCns || "Soumis aux prélèvements fiscaux légaux."}
          </p>
        </div>
      </div>

      {/* CARD 3: Active CDI Specs & Contract Specs */}
      <div className="p-6 rounded-[2rem] bg-slate-900/30 border border-slate-800/40 flex flex-col justify-between hover:bg-slate-900/50 transition-all duration-300">
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-slate-900 mb-4">
            <h3 className="text-[10px] font-black font-mono text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-500" />
              {tw.kpiSpecsContractTitle || "REGULATORY"}
            </h3>
            <span className="text-[8px] font-mono px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20 font-black tracking-widest uppercase">
              ACTIF
            </span>
          </div>

          <div className="space-y-4 mt-2">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-black text-slate-200 uppercase tracking-tight">
                  {tw.contractCd || "CONTRAT VALIDÉ"}
                </p>
                <p className="text-[10px] font-mono text-slate-500 mt-0.5 uppercase tracking-tighter">
                  {tw.deedSigned || "Contresigné électroniquement."}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-black text-slate-200 uppercase tracking-tight">
                  {tw.filiationCdr || "AFFILIATION CNSS"}
                </p>
                <p className="text-[10px] font-mono text-slate-500 mt-0.5 uppercase tracking-tighter">
                  {tw.secuActive || "Couverture santé nominale."}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-4 border-t border-slate-900">
          <p className="text-[10px] font-mono text-slate-500 leading-tight">
            {tw.disclaimerContract || "Contrat archivé et opposable."}
          </p>
        </div>
      </div>
    </div>
  );
};
