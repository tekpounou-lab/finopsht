/**
 * FINOPS ERP — Financial Reconciliation Bridge Component
 * Phase 5 UX Component
 *
 * Bridges Mode Simple (Cash Basis) and Mode Expert (Accrual Basis).
 * Displays dual-basis comparative metrics, deterministic variance,
 * and drill-down explanation items.
 */

import React, { useState } from 'react';
import type { FinancialReconciliation } from './financialReconciliation.types';
import { ArrowUpRight, ArrowDownRight, Scale, CheckCircle2, HelpCircle, Layers, FileText } from 'lucide-react';

interface FinancialReconciliationBridgeProps {
  reconciliation: FinancialReconciliation;
  onSelectDrillDown?: (itemId: string) => void;
}

export const FinancialReconciliationBridge: React.FC<FinancialReconciliationBridgeProps> = ({
  reconciliation,
  onSelectDrillDown,
}) => {
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'EXPLANATIONS' | 'ITEMS'>('SUMMARY');
  const { cash, accrual, variance, currency, period, explanations, items, quality } = reconciliation;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency || 'HTG',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getQualityBadge = () => {
    switch (quality) {
      case 'COMPLETE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <CheckCircle2 className="w-3.5 h-3.5" /> Réconciliation Certifiée
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <Scale className="w-3.5 h-3.5" /> Réconciliation Partielle
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <HelpCircle className="w-3.5 h-3.5" /> Données Incomplètes
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-900/80 rounded-2xl border border-slate-800 shadow-lg overflow-hidden" id="pic-reconciliation-bridge-card">
      {/* Header */}
      <div className="p-6 border-b border-slate-800 bg-slate-950/40 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-100">Pont de Réconciliation Financière</h2>
            {getQualityBadge()}
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Analyse comparative déterministe entre Trésorerie Décaissée (Mode Simple) et Réalité Économique (Mode Expert) sur la période du {period.startDate} au {period.endDate}.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('SUMMARY')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              activeTab === 'SUMMARY'
                ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Vue Synoptique
          </button>
          <button
            onClick={() => setActiveTab('EXPLANATIONS')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              activeTab === 'EXPLANATIONS'
                ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Explications des Écarts ({explanations.length})
          </button>
          <button
            onClick={() => setActiveTab('ITEMS')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              activeTab === 'ITEMS'
                ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Détail des Lignes ({items.length})
          </button>
        </div>
      </div>

      {/* Main Comparative View */}
      {activeTab === 'SUMMARY' && (
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Cash Basis Summary */}
            <div className="p-5 rounded-xl bg-slate-950/70 border border-slate-800 shadow-inner">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Mode Simple (Trésorerie)</span>
                <span className="text-[10px] font-semibold text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60">Cash Basis</span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Encaissements Effectifs:</span>
                  <span className="font-semibold text-slate-100 font-mono">{formatCurrency(cash.revenue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Paies Décaissées:</span>
                  <span className="font-semibold text-slate-100 font-mono">{formatCurrency(cash.personnelCost)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Autres Décaissements:</span>
                  <span className="font-semibold text-slate-100 font-mono">{formatCurrency(cash.operatingExpenses)}</span>
                </div>
                <div className="pt-3 border-t border-slate-800 flex justify-between text-base font-bold">
                  <span className="text-slate-300">Flux Net de Trésorerie:</span>
                  <span className={`font-mono ${cash.netResult >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatCurrency(cash.netResult)}
                  </span>
                </div>
              </div>
            </div>

            {/* Accrual Basis Summary */}
            <div className="p-5 rounded-xl bg-blue-950/20 border border-blue-800/40 shadow-inner">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-300">Mode Expert (Engagement)</span>
                <span className="text-[10px] font-semibold text-blue-300 bg-blue-900/40 px-2 py-0.5 rounded border border-blue-700/50">Accrual Basis</span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Revenus Reconnus:</span>
                  <span className="font-semibold text-slate-100 font-mono">{formatCurrency(accrual.revenue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Charges Personnel Engagées:</span>
                  <span className="font-semibold text-slate-100 font-mono">{formatCurrency(accrual.personnelCost)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Charges Exploitation Engagées:</span>
                  <span className="font-semibold text-slate-100 font-mono">{formatCurrency(accrual.operatingExpenses)}</span>
                </div>
                <div className="pt-3 border-t border-blue-800/40 flex justify-between text-base font-bold">
                  <span className="text-blue-200">Résultat Économique:</span>
                  <span className={`font-mono ${accrual.netResult >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatCurrency(accrual.netResult)}
                  </span>
                </div>
              </div>
            </div>

            {/* Variance Summary */}
            <div className="p-5 rounded-xl bg-indigo-950/20 border border-indigo-800/40 shadow-inner">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">Écarts Expliqués (Expert - Simple)</span>
                <span className="text-[10px] font-semibold text-indigo-300 bg-indigo-900/40 px-2 py-0.5 rounded border border-indigo-700/50">Variances</span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Écart Chiffre d'Affaires:</span>
                  <span className={`font-semibold font-mono ${variance.revenue >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {variance.revenue >= 0 ? '+' : ''}{formatCurrency(variance.revenue)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Écart Coûts Personnel:</span>
                  <span className={`font-semibold font-mono ${variance.personnelCost >= 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {variance.personnelCost >= 0 ? '+' : ''}{formatCurrency(variance.personnelCost)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Écart Charges Exploitation:</span>
                  <span className={`font-semibold font-mono ${variance.operatingExpenses >= 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {variance.operatingExpenses >= 0 ? '+' : ''}{formatCurrency(variance.operatingExpenses)}
                  </span>
                </div>
                <div className="pt-3 border-t border-indigo-800/40 flex justify-between text-base font-bold">
                  <span className="text-indigo-200">Écart Résultat Global:</span>
                  <span className={`font-mono ${variance.netResult >= 0 ? 'text-indigo-300' : 'text-rose-400'}`}>
                    {variance.netResult >= 0 ? '+' : ''}{formatCurrency(variance.netResult)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Explanations Cards */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Synthèse des Directeurs d'Écarts</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {explanations.map((exp, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shrink-0">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-200">{exp.title}</h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{exp.description}</p>
                    <div className="mt-2 text-xs font-semibold text-indigo-300 font-mono">
                      Impact: {exp.impactAmount > 0 ? '+' : ''}{formatCurrency(exp.impactAmount)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Explanations Tab */}
      {activeTab === 'EXPLANATIONS' && (
        <div className="p-6 space-y-4">
          {explanations.map((exp, idx) => (
            <div key={idx} className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 shadow-sm space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-slate-200">{exp.title}</span>
                <span className="text-xs font-bold font-mono text-indigo-300 bg-indigo-500/20 px-2.5 py-1 rounded-full border border-indigo-500/40">
                  {exp.impactAmount > 0 ? '+' : ''}{formatCurrency(exp.impactAmount)}
                </span>
              </div>
              <p className="text-sm text-slate-400">{exp.description}</p>
              <div className="text-xs text-slate-500 pt-2 border-t border-slate-800/80 flex justify-between">
                <span>Nombre d'éléments concernés: {exp.itemCount}</span>
                <span>Catégorie: {exp.category}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Items Tab */}
      {activeTab === 'ITEMS' && (
        <div className="p-6 overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300 border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/70 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="py-3 px-4">Libellé</th>
                <th className="py-3 px-4">Module Source</th>
                <th className="py-3 px-4">Catégorie</th>
                <th className="py-3 px-4 text-right">Simple (Caisse)</th>
                <th className="py-3 px-4 text-right">Expert (Engagement)</th>
                <th className="py-3 px-4 text-right">Écart</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => onSelectDrillDown?.(item.id)}
                  className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 font-medium text-slate-200 font-sans">{item.label}</td>
                  <td className="py-3 px-4 text-[10px] font-sans">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60 font-semibold">{item.sourceModule}</span>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-400 font-sans">{item.category}</td>
                  <td className="py-3 px-4 text-right text-slate-300">{formatCurrency(item.cashAmount)}</td>
                  <td className="py-3 px-4 text-right text-slate-300">{formatCurrency(item.accrualAmount)}</td>
                  <td className={`py-3 px-4 text-right font-bold ${item.variance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {item.variance >= 0 ? '+' : ''}{formatCurrency(item.variance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
