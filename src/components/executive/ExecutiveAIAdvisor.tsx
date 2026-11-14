import React from "react";
import { Gauge } from "lucide-react";
import { AnalyticsSnapshot } from "../../domains/analytics/types";
import { useLoggedSnapshot, getSnapshotSemanticSignature } from "../../hooks/useLoggedSnapshot";

interface ExecutiveAIAdvisorProps {
  snapshot: AnalyticsSnapshot | null;
  currency?: string;
  accountingBasis?: "CASH" | "ACCRUAL";
}

const ExecutiveAIAdvisorComponent: React.FC<ExecutiveAIAdvisorProps> = ({
  snapshot,
  currency = "HTG",
  accountingBasis = "ACCRUAL",
}) => {
  const { stabilizedSnapshot } = useLoggedSnapshot("EXECUTIVE_AI_ADVISOR", snapshot);

  const revVal = stabilizedSnapshot?.revenue?.currentValue || 0;
  const expVal = stabilizedSnapshot?.expenses?.currentValue || 0;
  const payrollVal = stabilizedSnapshot?.payrollCost?.currentValue || 0;
  const netProfit = stabilizedSnapshot?.profit?.currentValue ?? (revVal - expVal);
  const attendanceRate = stabilizedSnapshot?.attendanceRate?.currentValue ?? null;
  const activeStaff = stabilizedSnapshot?.activeStaff?.currentValue ?? 0;
  const checkedInCount = attendanceRate !== null ? Math.round((activeStaff * attendanceRate) / 100) : null;
  const absenteeCount = checkedInCount !== null ? Math.max(0, activeStaff - checkedInCount) : null;
  const payrollRatio = revVal > 0 ? Math.round((payrollVal / revVal) * 100) : 0;

  return (
    <div
      className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl shadow relative overflow-hidden flex flex-col justify-between"
      id="ai-cfo-storytelling-narrative-bento"
    >
      <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full filter blur-3xl pointer-events-none" />
      <div>
        <div className="flex items-center justify-between gap-2 mb-4 border-b border-slate-800/60 pb-3">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span className="text-xs font-black uppercase text-slate-300 tracking-wider font-mono">
              AI CFO Storytelling Advisory
            </span>
          </div>
          <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
            SSOT Synchronized ({accountingBasis})
          </span>
        </div>

        <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
          <div className="p-3.5 bg-slate-950/40 border border-slate-800/50 rounded-xl hover:border-slate-800/80 transition-all duration-350">
            <strong className="text-slate-100 text-[11px] font-bold block mb-1">
              📈 Analyse Financière & Rentabilité
            </strong>
            <p className="font-sans leading-relaxed font-light text-slate-300">
              Sur la période sélectionnée,{" "}
              {accountingBasis === "CASH" ? "les encaissements réels s'élèvent à" : "le chiffre d'affaires brut s'élève à"}{" "}
              <span className="text-emerald-400 font-bold font-mono">
                {revVal > 0 ? `+${revVal.toLocaleString()}` : revVal.toLocaleString()} {currency}
              </span>
              , générant un{" "}
              {accountingBasis === "CASH" ? "résultat net de trésorerie de" : "bénéfice net d'exploitation de"}{" "}
              <span className={`${netProfit >= 0 ? "text-cyan-400" : "text-rose-400"} font-bold font-mono`}>
                {netProfit > 0 ? `+${netProfit.toLocaleString()}` : netProfit.toLocaleString()} {currency}
              </span>{" "}
              après déduction des {accountingBasis === "CASH" ? "décaissements de" : "charges d'exploitation de"}{" "}
              <span className="text-slate-200 font-mono">{expVal.toLocaleString()} {currency}</span>.
            </p>
          </div>

          <div className="p-3.5 bg-slate-950/40 border border-slate-800/50 rounded-xl hover:border-slate-800/80 transition-all duration-350">
            <strong className="text-slate-100 text-[11px] font-bold block mb-1">
              📉 Charges d'Exploitation & Masse Salariale
            </strong>
            <p className="font-sans leading-relaxed font-light text-slate-300">
              La masse salariale validée ou engagée sur la période ressort à{" "}
              <span className="text-amber-400 font-mono font-bold">
                {payrollVal.toLocaleString()} {currency}
              </span>
              , représentant un ratio de{" "}
              <span className="text-amber-300 font-mono font-bold">{payrollRatio}%</span>{" "}
              {accountingBasis === "CASH" ? "des encaissements." : "du chiffre d'affaires."}{" "}
              {payrollVal === 0 && (
                <span className="italic text-slate-400">
                  (Aucun bulletin de paie n'a été scellé sur cette plage exacte, évitant l'imputation de faux débours).
                </span>
              )}
            </p>
          </div>

          <div className="p-3.5 bg-slate-950/40 border border-slate-800/50 rounded-xl hover:border-slate-800/80 transition-all duration-350">
            <strong className="text-slate-100 text-[11px] font-bold block mb-1">
              👥 Operations & Assiduité des Effectifs
            </strong>
            <p className="font-sans leading-relaxed font-light text-slate-300">
              Sur un effectif actif de{" "}
              <span className="text-slate-100 font-bold">{activeStaff} collaborateurs</span>, le taux d'assiduité moyen s'établit à{" "}
              <span className="text-emerald-400 font-bold font-mono">{attendanceRate !== null ? `${attendanceRate}%` : "N/D"}</span>, soit{" "}
              <span className="text-slate-100 font-semibold">{checkedInCount !== null ? `${checkedInCount} agents présents` : "N/D"}</span> et{" "}
              <span className="text-rose-400 font-semibold">{absenteeCount !== null ? `${absenteeCount} absents enregistrés` : "N/D"}</span>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ExecutiveAIAdvisor = React.memo(
  ExecutiveAIAdvisorComponent,
  (prev, next) =>
    prev.currency === next.currency &&
    prev.accountingBasis === next.accountingBasis &&
    getSnapshotSemanticSignature(prev.snapshot) === getSnapshotSemanticSignature(next.snapshot)
);

