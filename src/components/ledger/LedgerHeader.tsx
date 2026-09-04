import React from 'react';
import { BookOpen, Upload, Download, FileSpreadsheet, Sparkles, Activity, Key, ShieldCheck, ShieldAlert, AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslate } from '../../i18n';

interface LedgerHeaderProps {
  healthScore: number;
  cashflow: number;
  orphanCount?: number;
  isCleaningOrphans?: boolean;
  onCleanOrphans?: () => void;
  onNewTransaction: () => void;
  onImportCsv: () => void;
  onGenerateReport: () => void;
  onCompensation: () => void;
  onAiCfo: () => void;
  onOpenDataIntegrity: () => void;
}

export default function LedgerHeader({
  healthScore,
  cashflow,
  orphanCount = 0,
  isCleaningOrphans = false,
  onCleanOrphans,
  onNewTransaction,
  onImportCsv,
  onGenerateReport,
  onCompensation,
  onAiCfo,
  onOpenDataIntegrity
}: LedgerHeaderProps) {
  const tText = useTranslate();

  return (
    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-900/40 p-4 border border-slate-800/60 rounded-xl backdrop-blur-md">
      <div>
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-cyan-400" />
          {tText("Grand Livre à Double Entrée")}
        </h2>
        <div className="flex flex-wrap gap-4 mt-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>{tText("Score Santé:")}</span>
            <span className={`font-mono font-bold ${healthScore > 90 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {healthScore}%
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>{tText("Trésorerie:")}</span>
            <span className={`font-mono font-bold ${cashflow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {(cashflow / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'HTG' })}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Key className="w-3 h-3 text-indigo-400" /> {tText("Immuable (Audit Grade)")}
          </div>
          {orphanCount > 0 && onCleanOrphans && (
            <button
              onClick={onCleanOrphans}
              disabled={isCleaningOrphans}
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition cursor-pointer shadow-sm animate-pulse"
              title={tText("Transactions orphelines sans centre de coûts ou déséquilibrées. Cliquez pour corriger.")}
            >
              {isCleaningOrphans ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>{orphanCount} {orphanCount > 1 ? tText("Orphelines") : tText("Orpheline")} — {tText("Corriger")}</span>
            </button>
          )}
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2">
        <button 
          onClick={onNewTransaction}
          className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-[10px] uppercase tracking-wider px-3 py-2 rounded flex items-center gap-1.5 transition shadow-lg shadow-cyan-900/20"
        >
          <BookOpen className="w-3.5 h-3.5" /> {tText("Nouvelle Transaction")}
        </button>
        <button 
          onClick={onImportCsv}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] uppercase tracking-wider px-3 py-2 rounded flex items-center gap-1.5 transition"
        >
          <Upload className="w-3.5 h-3.5" /> {tText("Import CSV")}
        </button>
        <button 
          onClick={onOpenDataIntegrity}
          className="bg-rose-600/20 text-rose-400 hover:bg-rose-600/30 border border-rose-500/30 font-bold text-[10px] uppercase tracking-wider px-3 py-2 rounded flex items-center gap-1.5 transition"
        >
          <ShieldAlert className="w-3.5 h-3.5" /> {tText("Audit d'Intégrité")}
        </button>
        <button 
          onClick={onCompensation}
          className="bg-amber-600/20 text-amber-500 hover:bg-amber-600/30 border border-amber-500/30 font-bold text-[10px] uppercase tracking-wider px-3 py-2 rounded flex items-center gap-1.5 transition"
        >
          <Activity className="w-3.5 h-3.5" /> {tText("Compensation")}
        </button>
        <button 
          onClick={onAiCfo}
          className="bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 border border-purple-500/30 font-bold text-[10px] uppercase tracking-wider px-3 py-2 rounded flex items-center gap-1.5 transition"
        >
          <Sparkles className="w-3.5 h-3.5" /> {tText("AI CFO Analysis")}
        </button>
        <button 
          onClick={onGenerateReport}
          className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] uppercase tracking-wider px-3 py-2 rounded flex items-center gap-1.5 transition"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" /> {tText("Export Excel")}
        </button>
      </div>
    </div>
  );
}
