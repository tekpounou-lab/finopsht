import React from "react";
import { AlertOctagon, ShieldCheck, DollarSign } from "lucide-react";
import { TillDiscrepancyAlert } from "@/domains/performance/types";

interface OperationalRiskAuditPanelProps {
  alerts?: TillDiscrepancyAlert[];
  language?: "fr" | "en" | "ht";
}

export const OperationalRiskAuditPanel: React.FC<OperationalRiskAuditPanelProps> = ({
  alerts = [],
  language = "fr",
}) => {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="bg-slate-900/60 border border-emerald-500/30 rounded-xl p-4 flex items-center gap-3" id="operational-risk-audit-panel-clean">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
        <div>
          <h4 className="text-xs font-semibold text-emerald-300">
            {language === "ht" ? "Audit Caisse: Konfòm" : "Audit Opérationnel Caisse: Conformité Totale"}
          </h4>
          <p className="text-[11px] text-slate-400">
            {language === "ht"
              ? "Aucun ékart detekte nan sesyon caisse kontwole yo."
              : "Aucun écart de caisse détecté sur les sessions clôturées dans cette période."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/90 border border-amber-500/40 rounded-2xl p-5 shadow-xl space-y-4" id="operational-risk-audit-panel">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <AlertOctagon className="w-5 h-5 text-amber-400 animate-pulse" />
          <div>
            <h3 className="text-sm font-bold text-amber-200 uppercase tracking-wider">
              {language === "ht" ? "Abalan Operasyonèl Caisses" : "Alerte Audit: Écarts Physiques de Caisse"}
            </h3>
            <p className="text-[11px] text-slate-400">
              Alerte de risque opérationnel (Mode Engagement) — <span className="text-amber-300 font-medium">Impact P&L / EBITDA: ZERO</span>
            </p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
          {alerts.length} {alerts.length === 1 ? "écart détecté" : "écarts détectés"}
        </span>
      </div>

      <div className="space-y-2.5">
        {alerts.map((alert) => (
          <div
            key={alert.id || alert.sessionId}
            className="bg-slate-950/80 border border-slate-800 hover:border-amber-500/30 p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <span className="text-amber-400">{alert.tillName || "Caisse non spécifiée"}</span>
                {alert.branchName && (
                  <span className="text-slate-500">({alert.branchName})</span>
                )}
                <span className="text-slate-400 font-normal">| Caissier: {alert.tellerName || "Non spécifié"}</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Clôture: {alert.closedAt ? new Date(alert.closedAt).toLocaleString() : "N/A"} | Session ID: {alert.sessionId}
              </p>
              {alert.notes && (
                <p className="text-[11px] text-slate-400 italic">Note: "{alert.notes}"</p>
              )}
            </div>

            <div className="text-right shrink-0">
              <span className="text-xs font-mono font-bold text-rose-400 flex items-center justify-end gap-1">
                <DollarSign className="w-3.5 h-3.5 text-rose-400" />
                {Math.abs(alert.discrepancyAmount).toLocaleString()} {alert.currency || "HTG"}
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">
                {alert.discrepancyAmount < 0 ? "Déficit physique" : "Excédent physique"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
