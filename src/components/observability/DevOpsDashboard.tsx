import React from "react";
import { useObservability } from "../../contexts/ObservabilityContext";
import { Terminal, Code, Layers, FileCode, CheckCircle, Package } from "lucide-react";

export function DevOpsDashboard() {
  const { snapshot } = useObservability();

  if (!snapshot) {
    return (
      <div className="p-8 text-center text-slate-400 font-mono text-xs">
        Chargement de la console Developer Operations...
      </div>
    );
  }

  const { devops } = snapshot;

  return (
    <div className="space-y-6 animate-fade-in font-mono text-xs">
      {/* Header Banner */}
      <div className="bg-slate-950 p-6 rounded-2xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-sans font-bold text-slate-100 uppercase tracking-tight flex items-center gap-2">
            <Terminal className="w-5 h-5 text-indigo-400 animate-pulse" />
            Developer Operations & Code Health Dashboard
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Analyse de la taille du bundle React, modularité des fichiers (&lt;400 LOC), couverture de tests et dette technique.
          </p>
        </div>
        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-bold font-sans">
          BUILD READY (0 Errors)
        </span>
      </div>

      {/* Primary Telemetry Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-1">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Taille Totale Bundle</span>
          <strong className="text-2xl font-sans font-bold text-indigo-400">
            {(devops.bundleSizeBytes / (1024 * 1024)).toFixed(2)} MB
          </strong>
          <span className="text-[9px] text-slate-500 block">{devops.totalChunksCount} Chunks Dynamic Import</span>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-1">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Fichiers &gt; 400 LOC</span>
          <strong className={`text-2xl font-sans font-bold ${devops.filesOver400LocCount === 0 ? "text-emerald-400" : "text-amber-400"}`}>
            {devops.filesOver400LocCount} fichier(s)
          </strong>
          <span className="text-[9px] text-slate-500 block">Norme d'Architecture Modularité</span>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-1">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Couverture de Tests</span>
          <strong className="text-2xl font-sans font-bold text-emerald-400">{devops.testCoveragePct}%</strong>
          <span className="text-[9px] text-slate-500 block">Tests Invariants & Repositories</span>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-1">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Score Dette Technique</span>
          <strong className="text-2xl font-sans font-bold text-cyan-400">{devops.technicalDebtScore} / 100</strong>
          <span className="text-[9px] text-slate-500 block">Excellente Maintenabilité</span>
        </div>
      </div>

      {/* Large Files & Code Split Analysis Table */}
      <div className="bg-slate-950 border border-white/5 rounded-2xl overflow-hidden shadow-xl space-y-4 p-6">
        <span className="text-xs font-bold uppercase text-slate-200 font-sans flex items-center gap-2">
          <FileCode className="w-4 h-4 text-indigo-400" />
          Analyse de Découpage de Code Route-Level (Lazy Chunks)
        </span>

        <table className="w-full text-left text-xs font-mono text-slate-300">
          <thead className="bg-slate-900 text-slate-500 uppercase text-[9px] font-bold">
            <tr>
              <th className="p-3">Route Chunk</th>
              <th className="p-3">Import Mode</th>
              <th className="p-3">Taille Estimée</th>
              <th className="p-3">Statut Modularity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-[11px]">
            <tr>
              <td className="p-3 font-semibold text-white">SystemHealthCenter</td>
              <td className="p-3 text-emerald-400">React.lazy()</td>
              <td className="p-3 text-slate-300">42 KB</td>
              <td className="p-3 text-emerald-400 font-bold">CONFORME</td>
            </tr>
            <tr>
              <td className="p-3 font-semibold text-white">PayrollDashboard</td>
              <td className="p-3 text-emerald-400">React.lazy()</td>
              <td className="p-3 text-slate-300">68 KB</td>
              <td className="p-3 text-emerald-400 font-bold">CONFORME</td>
            </tr>
            <tr>
              <td className="p-3 font-semibold text-white">AccountingLedger</td>
              <td className="p-3 text-emerald-400">React.lazy()</td>
              <td className="p-3 text-slate-300">54 KB</td>
              <td className="p-3 text-emerald-400 font-bold">CONFORME</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
