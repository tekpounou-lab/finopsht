import React, { useState, useEffect } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { AnalyticsSnapshot } from "../../domains/analytics/types";
import { ExecutiveAlertEngine, ExecutiveAlert } from "../../domains/analytics/services/ExecutiveAlertEngine";

interface ExecutiveAlertCenterProps {
  snapshot: AnalyticsSnapshot | null;
}

export const ExecutiveAlertCenter: React.FC<ExecutiveAlertCenterProps> = ({ snapshot }) => {
  const [acknowledgedAlerts, setAcknowledgedAlerts] = useState<Record<string, boolean>>({});

  const alerts: ExecutiveAlert[] = React.useMemo(() => {
    if (!snapshot) return [];
    return ExecutiveAlertEngine.generateAlerts(snapshot);
  }, [snapshot]);

  useEffect(() => {
    console.log("[EXECUTIVE_ALERT_CENTER] Active Snapshot SSOT loaded:", {
      totalAlerts: alerts.length,
      criticalCount: alerts.filter((a) => a.severity === "CRITICAL").length,
      revenueVal: snapshot?.revenue?.currentValue,
    });
  }, [snapshot, alerts]);

  const activeAlerts = alerts.filter(
    (a) => a.severity !== "INFO" && !acknowledgedAlerts[a.description]
  );

  return (
    <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden backdrop-blur">
      <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full filter blur-2xl pointer-events-none" />
      <div>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <h3 className="text-xs font-black uppercase text-slate-300 tracking-wider font-mono">
              Live Business Alert Center
            </h3>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 text-[10px] border border-rose-500/20 font-mono font-bold">
            {activeAlerts.length} Active
          </span>
        </div>

        <div className="space-y-3.5">
          {activeAlerts.length > 0 ? (
            activeAlerts.map((alert, idx) => {
              const key = alert.description;
              return (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl border flex gap-3 items-start transition-all ${
                    alert.severity === "CRITICAL"
                      ? "bg-rose-500/5 border-rose-500/25 text-rose-300"
                      : "bg-amber-500/5 border-amber-500/25 text-amber-300"
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <strong className="block font-semibold uppercase text-[10px] tracking-wider">
                        {alert.severity} • {alert.relatedKpi}
                      </strong>
                      <button
                        onClick={() =>
                          setAcknowledgedAlerts((prev) => ({ ...prev, [key]: true }))
                        }
                        className="text-[9px] font-mono hover:underline opacity-80 uppercase font-black"
                      >
                        [Acknowledge]
                      </button>
                    </div>
                    <p className="mt-1 leading-relaxed text-[11px] text-slate-300">
                      {alert.description}
                    </p>
                    <div className="mt-2 flex justify-between items-center text-[9px] text-slate-500 font-mono">
                      <span>Affected: {alert.source}</span>
                      <span className="underline">Mitigate Risk</span>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center bg-slate-950/40 border border-dashed border-slate-800 rounded-xl flex flex-col gap-2 items-center">
              <ShieldCheck className="w-8 h-8 text-emerald-400" />
              <span className="text-xs font-bold text-slate-350">All Systems Clear</span>
              <p className="text-[10px] text-slate-500 max-w-xs">
                All corporate operations are running stably inside baseline tolerances.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
