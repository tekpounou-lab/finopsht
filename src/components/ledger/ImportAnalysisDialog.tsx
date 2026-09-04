import React, { useState } from 'react';
import { 
  AlertTriangle, 
  CheckCircle, 
  X, 
  ShieldAlert, 
  FileSpreadsheet, 
  Database, 
  ArrowRight, 
  Layers, 
  Filter, 
  HelpCircle,
  FileCheck,
  Ban,
  ArrowUpRight,
  TrendingUp,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { DuplicateAnalysisResult, RowAnalysisItem } from '../../lib/bulkDuplicateDetector';

interface ImportAnalysisDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCancelImport?: () => void;
  analysis: DuplicateAnalysisResult;
  onConfirmImport: (option: 'SKIP_DUPLICATES' | 'FORCE_ALL') => void;
  isImporting: boolean;
}

export default function ImportAnalysisDialog({
  isOpen,
  onClose,
  onCancelImport,
  analysis,
  onConfirmImport,
  isImporting
}: ImportAnalysisDialogProps) {
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'DIFFERENCES'>('SUMMARY');
  const [filterCategory, setFilterCategory] = useState<'ALL' | 'EXACT_DUPLICATE' | 'NEW_ENTRY' | 'MODIFIED_CONFLICT'>('ALL');
  const [showFullTable, setShowFullTable] = useState(false);

  if (!isOpen || !analysis) return null;

  const {
    accountingPeriod,
    currentLedgerSummary,
    uploadedSummary,
    exactDuplicatesCount,
    newEntriesCount,
    modifiedEntriesCount,
    similarityScore,
    riskLevel,
    recommendation,
    rowAnalysisList
  } = analysis;

  // Format currencies
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('fr-HT', { style: 'currency', currency: 'HTG', maximumFractionDigits: 0 }).format(val);
  };

  // Color mapping for Risk Level
  const getRiskStyle = () => {
    switch (riskLevel) {
      case 'CRITICAL':
      case 'HIGH':
        return {
          bg: 'bg-rose-950/40 border-rose-800/80',
          text: 'text-rose-400',
          badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          icon: ShieldAlert
        };
      case 'MEDIUM':
        return {
          bg: 'bg-amber-950/40 border-amber-800/80',
          text: 'text-amber-400',
          badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          icon: AlertTriangle
        };
      case 'LOW':
      default:
        return {
          bg: 'bg-emerald-950/40 border-emerald-800/80',
          text: 'text-emerald-400',
          badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          icon: CheckCircle
        };
    }
  };

  const riskStyle = getRiskStyle();
  const RiskIcon = riskStyle.icon;

  const filteredRows = rowAnalysisList.filter((r) => {
    if (filterCategory === 'ALL') return true;
    return r.status === filterCategory;
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] flex flex-col max-h-[92vh] overflow-hidden text-left">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className={`p-3 rounded-2xl border ${riskStyle.bg} flex items-center justify-center ${riskStyle.text}`}>
              <RiskIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-100 uppercase tracking-tight">
                  Import Analysis & Duplicate Detection
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border uppercase ${riskStyle.badgeBg}`}>
                  {riskLevel} RISK ({similarityScore}%)
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Financial Integrity Protection — Period: <span className="text-cyan-400 font-mono font-bold">{accountingPeriod.periodLabel}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* Risk & Recommendation Banner */}
          <div className={`p-4 rounded-2xl border ${riskStyle.bg} flex flex-col md:flex-row items-start md:items-center justify-between gap-4`}>
            <div className="flex items-start gap-3">
              <RiskIcon className={`w-5 h-5 shrink-0 mt-0.5 ${riskStyle.text}`} />
              <div>
                <h4 className={`text-xs font-bold uppercase tracking-wide ${riskStyle.text}`}>
                  {riskLevel === 'CRITICAL' || riskLevel === 'HIGH' 
                    ? "Possible Duplicate Import Detected" 
                    : (riskLevel === 'MEDIUM' ? "Partial Duplicate Overlap Detected" : "Low Duplicate Risk Detected")}
                </h4>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  {recommendation}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0 font-mono bg-slate-950/60 px-3 py-2 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Similarity Score</span>
              <span className={`text-lg font-black ${riskStyle.text}`}>{similarityScore}%</span>
            </div>
          </div>

          {/* Nav Tabs */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-1">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('SUMMARY')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  activeTab === 'SUMMARY'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-4 h-4" /> Comparison Summary
              </button>
              <button
                onClick={() => setActiveTab('DIFFERENCES')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  activeTab === 'DIFFERENCES'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileCheck className="w-4 h-4" /> Difference Report ({rowAnalysisList.length})
              </button>
            </div>

            <span className="text-[11px] font-mono text-slate-400">
              {accountingPeriod.startDate} → {accountingPeriod.endDate}
            </span>
          </div>

          {/* TAB 1: COMPARISON SUMMARY */}
          {activeTab === 'SUMMARY' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              
              {/* Side-by-side Ledger Comparison Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Current Ledger Column */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                        <Database className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                          Current Ledger
                        </h3>
                        <p className="text-[10px] text-slate-400 font-mono">Existing in Firestore</p>
                      </div>
                    </div>
                    <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300 font-bold">
                      {accountingPeriod.periodLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/60">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Transactions</span>
                      <span className="text-base font-bold text-slate-100 font-mono">
                        {currentLedgerSummary.transactionCount.toLocaleString()}
                      </span>
                    </div>

                    <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/60">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Amount</span>
                      <span className="text-base font-bold text-cyan-400 font-mono">
                        {formatCurrency(currentLedgerSummary.totalAmount)}
                      </span>
                    </div>

                    <div className="bg-emerald-950/20 p-3 rounded-xl border border-emerald-900/40">
                      <span className="text-[10px] text-emerald-400 uppercase font-bold block">Revenue (Income)</span>
                      <span className="text-sm font-bold text-emerald-300 font-mono">
                        {formatCurrency(currentLedgerSummary.totalRevenue)}
                      </span>
                    </div>

                    <div className="bg-rose-950/20 p-3 rounded-xl border border-rose-900/40">
                      <span className="text-[10px] text-rose-400 uppercase font-bold block">Expenses</span>
                      <span className="text-sm font-bold text-rose-300 font-mono">
                        {formatCurrency(currentLedgerSummary.totalExpenses)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Uploaded File Column */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                          Uploaded File
                        </h3>
                        <p className="text-[10px] text-slate-400 font-mono">Incoming CSV/Excel</p>
                      </div>
                    </div>
                    <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-cyan-400 font-bold">
                      {accountingPeriod.periodLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/60">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Transactions</span>
                      <span className="text-base font-bold text-slate-100 font-mono">
                        {uploadedSummary.transactionCount.toLocaleString()}
                      </span>
                    </div>

                    <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/60">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Amount</span>
                      <span className="text-base font-bold text-cyan-400 font-mono">
                        {formatCurrency(uploadedSummary.totalAmount)}
                      </span>
                    </div>

                    <div className="bg-emerald-950/20 p-3 rounded-xl border border-emerald-900/40">
                      <span className="text-[10px] text-emerald-400 uppercase font-bold block">Revenue (Income)</span>
                      <span className="text-sm font-bold text-emerald-300 font-mono">
                        {formatCurrency(uploadedSummary.totalRevenue)}
                      </span>
                    </div>

                    <div className="bg-rose-950/20 p-3 rounded-xl border border-rose-900/40">
                      <span className="text-[10px] text-rose-400 uppercase font-bold block">Expenses</span>
                      <span className="text-sm font-bold text-rose-300 font-mono">
                        {formatCurrency(uploadedSummary.totalExpenses)}
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Difference Metrics Quick Bar */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 bg-rose-950/20 border border-rose-900/50 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-rose-400 block">Exact Duplicates</span>
                    <span className="text-xs text-slate-400">Match existing entries</span>
                  </div>
                  <span className="text-xl font-bold font-mono text-rose-400">{exactDuplicatesCount}</span>
                </div>

                <div className="p-3.5 bg-emerald-950/20 border border-emerald-900/50 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-emerald-400 block">New Entries</span>
                    <span className="text-xs text-slate-400">Unique to file</span>
                  </div>
                  <span className="text-xl font-bold font-mono text-emerald-400">{newEntriesCount}</span>
                </div>

                <div className="p-3.5 bg-amber-950/20 border border-amber-900/50 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-amber-400 block">Modified / Conflicts</span>
                    <span className="text-xs text-slate-400">Potential overlaps</span>
                  </div>
                  <span className="text-xl font-bold font-mono text-amber-400">{modifiedEntriesCount}</span>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: DIFFERENCES REPORT TABLE */}
          {activeTab === 'DIFFERENCES' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              
              {/* Filter controls */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-400 font-bold uppercase text-[10px]">Filter Status:</span>
                  <div className="flex items-center gap-1 font-mono">
                    <button
                      onClick={() => setFilterCategory('ALL')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                        filterCategory === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      All ({rowAnalysisList.length})
                    </button>
                    <button
                      onClick={() => setFilterCategory('EXACT_DUPLICATE')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                        filterCategory === 'EXACT_DUPLICATE' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'text-slate-400 hover:text-rose-400'
                      }`}
                    >
                      Duplicates ({exactDuplicatesCount})
                    </button>
                    <button
                      onClick={() => setFilterCategory('NEW_ENTRY')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                        filterCategory === 'NEW_ENTRY' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'text-slate-400 hover:text-emerald-400'
                      }`}
                    >
                      New ({newEntriesCount})
                    </button>
                    <button
                      onClick={() => setFilterCategory('MODIFIED_CONFLICT')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                        filterCategory === 'MODIFIED_CONFLICT' ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'text-slate-400 hover:text-amber-400'
                      }`}
                    >
                      Conflicts ({modifiedEntriesCount})
                    </button>
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/60">
                <div className="max-h-[320px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 sticky top-0 font-mono text-[10px] uppercase">
                        <th className="p-2.5 w-12 text-center">Row</th>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Type</th>
                        <th className="p-2.5">Category</th>
                        <th className="p-2.5">Description</th>
                        <th className="p-2.5">Amount</th>
                        <th className="p-2.5">Duplicate Analysis</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-slate-500 font-mono">
                            No transactions in this category.
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((item) => (
                          <tr key={item.rowIdx} className="hover:bg-slate-800/30 transition">
                            <td className="p-2.5 text-center font-mono font-bold text-slate-500">
                              #{item.rowIdx}
                            </td>
                            <td className="p-2.5 font-mono text-slate-300">
                              {item.date}
                            </td>
                            <td className="p-2.5 font-bold font-mono text-slate-200">
                              {item.type}
                            </td>
                            <td className="p-2.5 text-slate-400">
                              {item.category}
                            </td>
                            <td className="p-2.5 text-slate-200 max-w-[200px] truncate" title={item.description}>
                              {item.description}
                            </td>
                            <td className="p-2.5 font-mono font-bold text-cyan-400">
                              {item.amount.toLocaleString()} HTG
                            </td>
                            <td className="p-2.5">
                              {item.status === 'EXACT_DUPLICATE' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950/80 text-rose-300 border border-rose-800/60">
                                  <AlertTriangle className="w-3 h-3" /> Exact Duplicate
                                </span>
                              )}
                              {item.status === 'NEW_ENTRY' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                                  <CheckCircle className="w-3 h-3" /> New Entry
                                </span>
                              )}
                              {item.status === 'MODIFIED_CONFLICT' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-800/60">
                                  <Info className="w-3 h-3" /> Conflict
                                </span>
                              )}
                              {item.status === 'INTERNAL_DUPLICATE' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60">
                                  <Info className="w-3 h-3" /> File Duplicate
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer Actions — Default is CANCEL IMPORT */}
        <div className="p-6 border-t border-slate-800 bg-slate-950/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          
          <div className="text-xs text-slate-400">
            Default choice is <strong className="text-slate-200">Cancel Import</strong> to protect ledger integrity.
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {/* Action 1: DEFAULT - CANCEL IMPORT */}
            <button
              onClick={onCancelImport || onClose}
              disabled={isImporting}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wide rounded-xl transition flex-1 sm:flex-none border border-slate-700 shadow-md active:scale-95 cursor-pointer"
            >
              Cancel Import (Default)
            </button>

            {/* Action 2: IMPORT ONLY NEW TRANSACTIONS (SKIP DUPLICATES) */}
            {exactDuplicatesCount > 0 && newEntriesCount > 0 && (
              <button
                onClick={() => onConfirmImport('SKIP_DUPLICATES')}
                disabled={isImporting}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wide rounded-xl transition flex-1 sm:flex-none shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-1.5"
              >
                Import Only New ({newEntriesCount})
              </button>
            )}

            {/* Action 3: CONTINUE / FORCE ALL */}
            <button
              onClick={() => onConfirmImport('FORCE_ALL')}
              disabled={isImporting}
              className={`px-5 py-2.5 font-bold text-xs uppercase tracking-wide rounded-xl transition flex-1 sm:flex-none flex items-center justify-center gap-1.5 ${
                riskLevel === 'CRITICAL' || riskLevel === 'HIGH'
                  ? 'bg-rose-950/80 hover:bg-rose-900 border border-rose-700 text-rose-200'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/50'
              }`}
            >
              {isImporting ? 'Importing...' : 'Continue / Force Import'}
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
