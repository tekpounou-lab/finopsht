import React from "react";
import { useObservability } from "../../contexts/ObservabilityContext";
import { Bot, Sparkles, RefreshCw, Zap, DollarSign, AlertTriangle, ShieldAlert } from "lucide-react";

export function AiOperationsCenter() {
  const { snapshot, isScanning, triggerScan } = useObservability();

  if (!snapshot) {
    return (
      <div className="p-8 text-center text-slate-400 font-mono text-xs">
        Chargement de la console AI Operations Center...
      </div>
    );
  }

  const { ai } = snapshot;

  return (
    <div className="space-y-6 animate-fade-in font-mono text-xs">
      {/* Header Banner */}
      <div className="bg-slate-950 p-6 rounded-2xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-sans font-bold text-slate-100 uppercase tracking-tight flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-400 animate-pulse" />
            AI Operations Center & Gemini Service Control
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Suivi en temps réel de la consommation de jetons, temps de latence des requêtes, taux de cache et garde-fou budgétaire.
          </p>
        </div>
        <button
          onClick={() => triggerScan()}
          disabled={isScanning}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-sans text-xs font-bold rounded-xl flex items-center gap-2 transition cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isScanning ? "animate-spin" : ""}`} />
          <span>Scanner Services IA</span>
        </button>
      </div>

      {/* Quota Warning Banner if quota >= 80% */}
      {ai.quotaUsedPct >= 80 && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <strong className="text-amber-300 font-sans text-xs">Avertissement de Seuil de Seuil IA ({ai.quotaUsedPct}%)</strong>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Le plafond mensuel d'utilisation de l'API Google AI Studio approche de son maximum. Le moteur basculera automatiquement vers les règles heuristiques déterministes (<code className="text-indigo-300 font-bold">FinancialRatioEngine.ts</code>) sans interruption pour les utilisateurs.
            </p>
          </div>
        </div>
      )}

      {/* Primary Telemetry Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-1">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Prompts Exécutés</span>
          <strong className="text-2xl font-sans font-bold text-indigo-400">{ai.promptCount} requêtes</strong>
          <span className="text-[9px] text-slate-500 block">IA CFO & Prédictions</span>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-1">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Jetons Consommés (Tokens)</span>
          <strong className="text-2xl font-sans font-bold text-cyan-400">{(ai.inputTokens + ai.outputTokens).toLocaleString()} tok</strong>
          <span className="text-[9px] text-slate-500 block">In: {ai.inputTokens.toLocaleString()} | Out: {ai.outputTokens.toLocaleString()}</span>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-1">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Taux de Cache Prompts</span>
          <strong className="text-2xl font-sans font-bold text-emerald-400">{ai.cacheHitRatioPct}%</strong>
          <span className="text-[9px] text-slate-500 block">Économie de Quota</span>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-1">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Utilisation Quota Mensuel</span>
          <strong className={`text-2xl font-sans font-bold ${ai.quotaUsedPct < 80 ? "text-emerald-400" : "text-amber-400"}`}>
            {ai.quotaUsedPct}%
          </strong>
          <span className="text-[9px] text-slate-500 block">Plafond Cap Actif</span>
        </div>
      </div>

      {/* Model Allocation & Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-950 p-5 rounded-2xl border border-white/5 space-y-4">
          <span className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-wider block">Modèles d'Intelligence Active</span>
          <div className="space-y-3">
            {ai.modelsUsed.map(model => (
              <div key={model} className="p-3 bg-slate-900/60 rounded-xl border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span className="font-bold text-white text-xs">{model}</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold">
                  ACTIF (Tier Production)
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-950 p-5 rounded-2xl border border-white/5 space-y-4">
          <span className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-wider block">Fallback & Mode Dégradé</span>
          <div className="p-4 bg-slate-900/60 rounded-xl border border-white/5 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Taux de Fallback Heuristique :</span>
              <strong className="text-emerald-400 font-bold">{ai.fallbackRatePct}%</strong>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Latence Moyenne Réponses :</span>
              <strong className="text-cyan-400 font-bold">{ai.avgLatencyMs} ms</strong>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Coût Estimé Éliminé (Cache) :</span>
              <strong className="text-emerald-400 font-bold">$0.48 USD</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
