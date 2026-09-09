import React, { useState, useEffect } from "react";
import { CheckCircle, Lightbulb } from "lucide-react";
import { AnalyticsSnapshot } from "../../domains/analytics/types";
import { ExecutiveRecommendationEngine, ActionableRecommendation } from "../../domains/analytics/services/ExecutiveRecommendationEngine";

interface ExecutiveActionsChecklistProps {
  snapshot: AnalyticsSnapshot | null;
}

export const ExecutiveActionsChecklist: React.FC<ExecutiveActionsChecklistProps> = ({ snapshot }) => {
  const [completedActions, setCompletedActions] = useState<Record<string, boolean>>({});

  const recommendations: ActionableRecommendation[] = React.useMemo(() => {
    if (!snapshot) return [];
    return ExecutiveRecommendationEngine.generateRecommendations(snapshot);
  }, [snapshot]);

  useEffect(() => {
    console.log("[EXECUTIVE_ACTIONS_CHECKLIST] Active Snapshot SSOT loaded:", {
      recommendationsCount: recommendations.length,
      revenue: snapshot?.revenue?.currentValue,
      expenses: snapshot?.expenses?.currentValue,
      activeStaff: snapshot?.activeStaff?.currentValue,
    });
  }, [snapshot, recommendations]);

  const toggleAction = (title: string) => {
    setCompletedActions((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden backdrop-blur">
      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full filter blur-2xl pointer-events-none" />
      <div>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-black uppercase text-slate-300 tracking-wider font-mono">
              Today's Actions Checklist
            </h3>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] border border-amber-500/20 font-mono font-bold">
            {recommendations.filter((r) => !completedActions[r.title]).length} / {recommendations.length} Pending
          </span>
        </div>

        <div className="space-y-3.5">
          {recommendations.length > 0 ? (
            recommendations.map((rec, idx) => {
              const isDone = !!completedActions[rec.title];
              return (
                <div
                  key={idx}
                  onClick={() => toggleAction(rec.title)}
                  className={`p-3.5 rounded-xl border flex gap-3 items-start cursor-pointer transition-all ${
                    isDone
                      ? "bg-slate-950/40 border-slate-800/40 opacity-60"
                      : "bg-slate-950/70 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <button className="mt-0.5 shrink-0 text-slate-500 hover:text-emerald-400 transition-colors">
                    <CheckCircle
                      className={`w-4 h-4 ${isDone ? "text-emerald-400 fill-emerald-400/20" : "text-slate-600"}`}
                    />
                  </button>
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-xs font-bold ${isDone ? "text-slate-500 line-through" : "text-slate-100"}`}>
                        {rec.title}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 text-[8px] font-mono font-bold rounded ${
                          rec.priority === "HIGH"
                            ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        }`}
                      >
                        {rec.priority}
                      </span>
                    </div>
                    <p className={`text-[11px] leading-relaxed ${isDone ? "text-slate-500" : "text-slate-400"}`}>
                      {rec.description}
                    </p>
                    <div className="flex gap-4 mt-2 text-[10px] font-mono text-slate-500">
                      <span>
                        Impact: <strong className={isDone ? "text-slate-500" : "text-emerald-400"}>{rec.estimatedImpact}</strong>
                      </span>
                      <span>Source: {rec.sourcedKpi}</span>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-6 text-center text-slate-500 text-xs font-mono">
              Aucune action urgente requise pour cette période.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
