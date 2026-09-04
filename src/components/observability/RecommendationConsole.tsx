import React from "react";
import { useObservability } from "../../contexts/ObservabilityContext";
import { Lightbulb, ArrowRight, Zap, CheckCircle2, Code2, ShieldAlert } from "lucide-react";

export function RecommendationConsole() {
  const { recommendations, isScanning, triggerScan } = useObservability();

  return (
    <div className="space-y-6 animate-fade-in font-mono text-xs">
      {/* Header Banner */}
      <div className="bg-slate-950 p-6 rounded-2xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-sans font-bold text-slate-100 uppercase tracking-tight flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-400 animate-pulse" />
            Automated Recommendation Engine
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Recommandations d'optimisation générées dynamiquement selon les métriques temps réel du système.
          </p>
        </div>
        <button
          onClick={() => triggerScan()}
          disabled={isScanning}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-sans text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer shrink-0"
        >
          <Zap className="w-4 h-4" />
          <span>Re-calculer Recommandations</span>
        </button>
      </div>

      {/* Recommendations Cards List */}
      {recommendations.length === 0 ? (
        <div className="p-8 bg-slate-950 rounded-2xl border border-white/5 text-center text-slate-400 font-mono space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
          <strong className="text-slate-200 font-sans block text-sm">Système Optimal — Aucune Recommandation Requis</strong>
          <p className="text-xs text-slate-500">Toutes les métriques de performance, sécurité et intégrité sont dans les seuils nominaux.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {recommendations.map(rec => (
            <div key={rec.id} className="bg-slate-950 p-6 rounded-2xl border border-white/5 space-y-4 hover:border-amber-500/20 transition">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-sans uppercase ${
                    rec.impact === "CRITICAL" ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" :
                    rec.impact === "HIGH" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                    "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                  }`}>
                    Impact : {rec.impact}
                  </span>
                  <span className="px-2 py-0.5 bg-slate-900 text-slate-400 rounded text-[10px] font-sans border border-white/5">
                    Effort : {rec.effort}
                  </span>
                  <span className="text-slate-500 text-[10px] uppercase font-bold">Domain: {rec.category}</span>
                </div>
                {rec.targetModule && (
                  <code className="text-slate-400 text-[10px] bg-slate-900 px-2 py-0.5 rounded border border-white/5 font-mono">
                    {rec.targetModule}
                  </code>
                )}
              </div>

              <div className="space-y-1">
                <h3 className="font-sans font-bold text-slate-100 text-sm flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-amber-400 shrink-0" />
                  {rec.title}
                </h3>
                <p className="text-slate-300 text-xs leading-relaxed">{rec.issueSummary}</p>
              </div>

              {/* Actionable Steps */}
              <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-2">
                <span className="text-[10px] text-amber-400 font-extrabold uppercase block">Plan d'Action Recommandé :</span>
                <ul className="space-y-1.5 list-disc list-inside text-slate-300 text-xs">
                  {rec.actionableSteps.map((step, idx) => (
                    <li key={idx} className="leading-relaxed">{step}</li>
                  ))}
                </ul>
              </div>

              {/* Code Snippet Hint */}
              {rec.codeHint && (
                <div className="bg-slate-900 p-3 rounded-xl border border-white/5 flex items-center gap-2 text-slate-300 text-[11px] font-mono">
                  <Code2 className="w-4 h-4 text-indigo-400 shrink-0" />
                  <code className="text-indigo-300 font-bold overflow-x-auto">{rec.codeHint}</code>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
