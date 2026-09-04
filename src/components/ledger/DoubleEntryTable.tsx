import React, { useState, useEffect } from 'react';
import { LedgerTransaction, Role } from '../../types';
import { ShieldCheck, ShieldAlert, AlertTriangle, Eye, RotateCcw, X, Copy, HelpCircle, FilterX, RefreshCw, Trash2, CheckSquare } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useTranslate } from '../../i18n';
import { BatchReversalModal } from './modals/BatchReversalModal';
import { BatchDeleteModal } from './modals/BatchDeleteModal';

export const formatTxDate = (dateVal: any, formatStr: string = 'dd/MM/yyyy HH:mm'): string => {
  if (!dateVal) return '-';
  try {
    let d: Date;
    if (typeof dateVal === 'string' || typeof dateVal === 'number') {
      d = new Date(dateVal);
    } else if (dateVal && typeof dateVal.toDate === 'function') {
      d = dateVal.toDate();
    } else if (dateVal && typeof dateVal.seconds === 'number') {
      d = new Date(dateVal.seconds * 1000);
    } else {
      d = new Date(dateVal);
    }
    if (isNaN(d.getTime())) return typeof dateVal === 'string' ? dateVal : '-';
    return format(d, formatStr);
  } catch {
    return typeof dateVal === 'string' ? dateVal : '-';
  }
};

interface DoubleEntryTableProps {
  transactions: LedgerTransaction[];
  rawCount?: number;
  currentRole: Role;
  onViewDetails: (tx: LedgerTransaction) => void;
  onReverse?: (tx: LedgerTransaction) => void;
  onBatchReverse?: (txs: LedgerTransaction[], reason: string) => Promise<void>;
  onBatchDelete?: (txIds: string[]) => Promise<void>;
  onResetFilters?: () => void;
  onSeedDemoData?: () => void;
  isSeeding?: boolean;
  onOpenCreate?: () => void;
  selectedIds?: string[];
  onToggleSelection?: (id: string) => void;
  onToggleSelectAll?: () => void;
}

export default function DoubleEntryTable({ 
  transactions, 
  rawCount = 0,
  currentRole, 
  onViewDetails, 
  onReverse,
  onBatchReverse,
  onBatchDelete,
  onResetFilters,
  onSeedDemoData,
  isSeeding = false,
  onOpenCreate,
  selectedIds = [],
  onToggleSelection,
  onToggleSelectAll
}: DoubleEntryTableProps) {
  const tText = useTranslate();
  const cleanDescription = (desc: string) => {
    return desc ? desc.replace(/^\[IMPORT\]\s*/i, '') : '';
  };
  const [detailTx, setDetailTx] = useState<LedgerTransaction | null>(null);
  const [reversalTx, setReversalTx] = useState<LedgerTransaction | null>(null);
  const [internalSelectedTxIds, setInternalSelectedTxIds] = useState<string[]>([]);
  const [showBatchReversalModal, setShowBatchReversalModal] = useState<boolean>(false);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState<boolean>(false);

  const selectedTxIds = onToggleSelection ? selectedIds : internalSelectedTxIds;

  const handleSelectRow = (txId: string) => {
    if (onToggleSelection) {
      onToggleSelection(txId);
    } else {
      setInternalSelectedTxIds(prev =>
        prev.includes(txId) ? prev.filter(id => id !== txId) : [...prev, txId]
      );
    }
  };

  const clearSelection = () => {
    if (onToggleSelectAll && selectedIds.length > 0) {
      onToggleSelectAll();
    } else {
      setInternalSelectedTxIds([]);
    }
  };
  
  // Pagination state
  const itemsPerPage = 20;
  const [currentPage, setCurrentPage] = useState<number>(1);

  const handleCopySignature = (sig: string) => {
    navigator.clipboard.writeText(sig);
    toast.success(tText("Signature d'audit copiée dans le presse-papiers !"));
  };

  const sortedTransactions = [...transactions].sort((a, b) => {
    const timeA = new Date(a.date || 0).getTime() || 0;
    const timeB = new Date(b.date || 0).getTime() || 0;
    return timeB - timeA;
  });

  // Quick helper for running balance calculation
  let currentBalance = 0;
  const txWithBalances = [...sortedTransactions].reverse().map(tx => {
    // Advanced Double-Entry Balance Resolver:
    // A transaction only affects the "Cash/Bank" balance if it moves funds in or out of a liquidity account.
    const isLiquidityDebit = tx.debit_account?.toUpperCase().includes("CASH") || 
                            tx.debit_account?.toUpperCase().includes("BANK") || 
                            tx.debit_account?.startsWith("10"); // Asset class 1 (Cash/Bank)
    
    const isLiquidityCredit = tx.credit_account?.toUpperCase().includes("CASH") || 
                             tx.credit_account?.toUpperCase().includes("BANK") || 
                             tx.credit_account?.startsWith("10");

    const amtCents = tx.amount_cents ?? Math.round((tx.amount || 0) * 100);

    if ((tx as any).computedBalance !== undefined) {
      return { ...tx, computedBalance: (tx as any).computedBalance };
    }

    if (isLiquidityDebit && !isLiquidityCredit) {
      currentBalance += amtCents;
    } else if (isLiquidityCredit && !isLiquidityDebit) {
      currentBalance -= amtCents;
    } else if (tx.type === 'INCOME' && !tx.debit_account) {
      // Fallback for legacy transactions without accounts
      currentBalance += amtCents;
    } else if (['EXPENSE', 'ADVANCE', 'PAYROLL', 'REFUND', 'PENALTY'].includes(tx.type) && !tx.credit_account) {
      // Fallback for legacy transactions without accounts
      currentBalance -= amtCents;
    }
    
    return { ...tx, computedBalance: currentBalance };
  }).reverse();

  // Filter only transactions that can be reversed (non-reversals)
  const selectableTxs = txWithBalances.filter(tx => tx.type !== 'REVERSAL');

  const totalPages = Math.ceil(txWithBalances.length / itemsPerPage);
  
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTxs = txWithBalances.slice(startIndex, startIndex + itemsPerPage);
  const isAllSelected = selectableTxs.length > 0 && selectableTxs.every(tx => selectedTxIds.includes(tx.id));

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onToggleSelectAll) {
      onToggleSelectAll();
    } else {
      if (e.target.checked) {
        setInternalSelectedTxIds(selectableTxs.map(t => t.id));
      } else {
        setInternalSelectedTxIds([]);
      }
    }
  };

  // Get objects for currently selected transactions
  const selectedTxs = txWithBalances.filter(tx => selectedTxIds.includes(tx.id));

  const isReversalAuthorized = ['OWNER', 'MANAGER', 'SUPER_ADMIN', 'ADMIN'].includes((currentRole || '').toUpperCase());
  const isDeleteAuthorized = ['OWNER', 'MANAGER', 'SUPER_ADMIN', 'ADMIN'].includes((currentRole || '').toUpperCase());

  const totalDebitsToReverse = selectedTxs
    .filter(tx => ['EXPENSE', 'ADVANCE', 'PAYROLL', 'REFUND', 'PENALTY'].includes(tx.type))
    .reduce((sum, tx) => sum + (tx.amount_cents ?? Math.round((tx.amount || 0) * 100)), 0);

  const totalCreditsToReverse = selectedTxs
    .filter(tx => tx.type === 'INCOME')
    .reduce((sum, tx) => sum + (tx.amount_cents ?? Math.round((tx.amount || 0) * 100)), 0);

  return (
    <div id="ledger-table-section-container" className="flex flex-col flex-1 min-h-0 gap-4">
      
      {/* SELECTION ACTIONS TOOLBAR BANNER */}
      {selectedTxIds.length > 0 && (
        <div 
          id="gl-selection-action-bar"
          className="shrink-0 flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-900 border-2 border-cyan-500/50 rounded-xl shadow-xl shadow-cyan-950/40 animate-in slide-in-from-top-2 duration-200"
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-cyan-950/80 border border-cyan-700/60 px-3 py-1.5 rounded-lg text-cyan-300">
              <CheckSquare className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold font-mono">
                {selectedTxIds.length} {selectedTxIds.length > 1 ? tText("lignes sélectionnées") : tText("ligne sélectionnée")}
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-3 text-xs font-mono">
              <span className="text-slate-400">
                {tText("Débit")}: <strong className="text-rose-400">{(totalDebitsToReverse / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} HTG</strong>
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">
                {tText("Crédit")}: <strong className="text-emerald-400">{(totalCreditsToReverse / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} HTG</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* BULK DELETE BUTTON */}
            {isDeleteAuthorized && onBatchDelete && (
              <button
                id="btn-trigger-bulk-delete"
                onClick={() => setShowBatchDeleteModal(true)}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-lg shadow-rose-950/40 transition flex items-center gap-1.5 cursor-pointer"
                title={tText("Supprimer définitivement les écritures sélectionnées")}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{tText("Supprimer")} ({selectedTxIds.length})</span>
              </button>
            )}

            {/* BATCH REVERSAL BUTTON */}
            {isReversalAuthorized && onBatchReverse && (
              <button
                id="btn-trigger-batch-reversal"
                onClick={() => setShowBatchReversalModal(true)}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-lg shadow-amber-950/40 transition flex items-center gap-1.5 cursor-pointer"
                title={tText("Contrepasser (inverser) les écritures sélectionnées")}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{tText("Contrepasser")} ({selectedTxIds.length})</span>
              </button>
            )}

            {/* CLEAR SELECTION BUTTON */}
            <button
              onClick={clearSelection}
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition cursor-pointer"
              title={tText("Tout désélectionner")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* TABLE DIV WITH ID SPECIFIC TO USER FOCUS TARGET */}
      <div id="double-entry-viewport-wrapper" className="flex flex-col flex-1 min-h-[60vh] glass rounded-xl overflow-hidden backdrop-blur-md bg-slate-900/40 border border-slate-800/60">
        
        {/* DESKTOP TABLE */}
        <div className="flex-1 overflow-auto hidden md:block">
          <table className="w-full text-left font-sans text-xs whitespace-nowrap min-w-max">
            <thead className="bg-slate-950/85 sticky top-0 z-10 border-b border-slate-800">
              <tr className="text-[10px] uppercase text-slate-400 tracking-wider font-extrabold child:py-3 child:px-4">
                <th className="w-10 text-center py-3 px-4">
                  <input 
                    type="checkbox" 
                    className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500 bg-slate-950 cursor-pointer w-3.5 h-3.5"
                    checked={isAllSelected} 
                    onChange={handleSelectAll} 
                    title="Sélectionner toutes les transactions éligibles de la liste"
                  />
                </th>
                <th className="w-32 py-3 px-4">{tText("Date & Heure")}</th>
                <th className="w-24 py-3 px-4">{tText("ID Ref")}</th>
                <th className="w-24 py-3 px-4">{tText("Type")}</th>
                <th className="py-3 px-4">{tText("Description")}</th>
                <th className="w-32 py-3 px-4">{tText("Source")}</th>
                <th className="w-24 text-right py-3 px-4">{tText("Debit")}</th>
                <th className="w-24 text-right py-3 px-4">{tText("Credit")}</th>
                <th className="w-32 text-right py-3 px-4">{tText("Solde (HTG)")}</th>
                <th className="w-20 text-center py-3 px-4">{tText("Audit")}</th>
                <th className="w-20 text-center py-3 px-4">{tText("Actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {txWithBalances.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500 font-sans" id="ledger-table-empty-row">
                    <div className="flex flex-col items-center justify-center gap-3 max-w-lg mx-auto px-4">
                      <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 shadow-inner">
                        <FilterX className="w-6 h-6 text-cyan-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-200">
                          {rawCount > 0 
                            ? tText("Aucune écriture ne correspond aux filtres actifs.")
                            : tText("Aucune écriture comptable enregistrée dans cette entreprise.")
                          }
                        </p>
                        <p className="text-xs text-slate-400 mt-1 max-w-md">
                          {rawCount > 0
                            ? tText(`${rawCount} transaction(s) existent dans d'autres périodes ou catégories. Réinitialisez les filtres pour les afficher.`)
                            : tText("Vous pouvez générer des écritures de démonstration conformes aux normes SYSCOHADA ou créer une nouvelle écriture manuelle.")
                          }
                        </p>
                      </div>
                      
                      <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                        {rawCount > 0 && onResetFilters && (
                          <button
                            onClick={onResetFilters}
                            className="inline-flex items-center gap-2 px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold transition shadow-md shadow-cyan-950/40 cursor-pointer"
                            id="btn_empty_reset_filters"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>{tText("Afficher toutes les écritures (Reset)")}</span>
                          </button>
                        )}

                        {onSeedDemoData && (
                          <button
                            onClick={onSeedDemoData}
                            disabled={isSeeding}
                            className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition shadow-md shadow-emerald-950/40 disabled:opacity-50 cursor-pointer"
                            id="btn_empty_seed_demo"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isSeeding ? "animate-spin" : ""}`} />
                            <span>{isSeeding ? tText("Génération...") : tText("Générer les écritures démo")}</span>
                          </button>
                        )}

                        {onOpenCreate && (
                          <button
                            onClick={onOpenCreate}
                            className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                            id="btn_empty_create_tx"
                          >
                            <span>+ {tText("Nouvelle écriture")}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedTxs.map((tx) => {
                  const isLiquidityDebit = Boolean(
                    tx.debit_account?.toUpperCase().includes("CASH") || 
                    tx.debit_account?.toUpperCase().includes("BANK") || 
                    tx.debit_account?.startsWith("10")
                  );
                  const isLiquidityCredit = Boolean(
                    tx.credit_account?.toUpperCase().includes("CASH") || 
                    tx.credit_account?.toUpperCase().includes("BANK") || 
                    tx.credit_account?.startsWith("10")
                  );
                  let isCredit = false;
                  let isDebit = false;
                  if (isLiquidityDebit && !isLiquidityCredit) {
                    isCredit = true;
                  } else if (isLiquidityCredit && !isLiquidityDebit) {
                    isDebit = true;
                  } else if (tx.type === 'INCOME') {
                    isCredit = true;
                  } else if (['EXPENSE', 'ADVANCE', 'PAYROLL', 'REFUND', 'PENALTY'].includes(tx.type)) {
                    isDebit = true;
                  } else if (tx.type === 'REVERSAL') {
                    const isReversingIncome = tx.description?.includes('INCOME') || tx.metadata?.originalType === 'INCOME';
                    if (isReversingIncome) {
                      isDebit = true;
                    } else {
                      isCredit = true;
                    }
                  }
                  
                  let typeClass = "bg-slate-500/10 text-slate-400 border-slate-500/20";
                  if (tx.type === "INCOME") typeClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                  if (tx.type === "EXPENSE") typeClass = "bg-rose-500/10 text-rose-450 border-rose-500/20";
                  if (tx.type === "ADVANCE") typeClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                  if (tx.type === "PAYROLL") typeClass = "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
                  if (tx.type === 'REVERSAL') typeClass = "bg-purple-500/10 text-purple-400 border-purple-500/20";

                  const amtCents = tx.amount_cents ?? Math.round((tx.amount || 0) * 100);
                  const displayAmount = (amtCents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  const balCents = tx.computedBalance ?? 0;
                  const displayBalance = (balCents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                  return (
                    <tr key={tx.id} className={`hover:bg-slate-900/60 transition-colors group ${selectedTxIds.includes(tx.id) ? 'bg-cyan-950/10' : ''}`}>
                      <td className="py-2.5 px-4 text-center">
                        {tx.type !== 'REVERSAL' ? (
                          <input 
                            type="checkbox" 
                            className="rounded border-slate-705 text-cyan-500 focus:ring-cyan-500 bg-slate-950 cursor-pointer w-3.5 h-3.5"
                            checked={selectedTxIds.includes(tx.id)}
                            onChange={() => handleSelectRow(tx.id)}
                          />
                        ) : (
                          <span className="text-[10px] text-slate-600 font-extrabold" title="Contrepassation (Non Re-sélectionnable)">
                            Ø
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-400">
                        {formatTxDate(tx.date, 'dd/MM/yyyy HH:mm')}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 text-[10px]">
                        {tx.id.substring(0, 8)}...
                      </td>
                      <td className="py-2.5 px-4 text-left">
                        <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold font-sans ${typeClass}`}>
                          {tx.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-sans text-slate-300 truncate max-w-[200px]" title={cleanDescription(tx.description) || tx.employeeName || 'Client / Divers'}>
                        {cleanDescription(tx.description) || tx.employeeName || 'Client / Divers'}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 text-[10px]">
                        {tx.source}
                      </td>
                      <td className={`py-2.5 px-4 text-right ${isDebit ? 'text-rose-400 font-bold' : 'text-slate-600'}`}>
                        {isDebit ? displayAmount : '-'}
                      </td>
                      <td className={`py-2.5 px-4 text-right ${isCredit ? 'text-emerald-400' : 'text-slate-600'}`}>
                        {isCredit ? displayAmount : '-'}
                      </td>
                      <td className={`py-2.5 px-4 text-right font-bold ${tx.computedBalance >= 0 ? "text-slate-200" : "text-rose-400"}`}>
                        {displayBalance}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {tx.isImmutable ? (
                          <span title="Transaction Immuable et Sécurisée">
                            <ShieldCheck className="w-4 h-4 text-emerald-500 inline-block" />
                          </span>
                        ) : (
                          <span title="Non-Immuable">
                            <AlertTriangle className="w-4 h-4 text-amber-500 inline-block animate-pulse" />
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <div className="flex justify-center items-center gap-2">
                          <button
                            onClick={() => {
                              setDetailTx(tx);
                              onViewDetails(tx);
                            }}
                            className="px-2 py-1 text-[10px] uppercase font-sans font-extrabold tracking-wider bg-slate-950/65 hover:bg-cyan-950/40 text-slate-300 hover:text-cyan-400 border border-slate-800 hover:border-cyan-500/30 rounded shadow-sm hover:shadow-cyan-950/10 transition-all cursor-pointer flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3 text-cyan-500" />
                            <span>Détails</span>
                          </button>
                          {isReversalAuthorized && tx.type !== 'REVERSAL' && (
                            <button
                              onClick={() => setReversalTx(tx)}
                              className="px-2 py-1 text-[10px] uppercase font-sans font-extrabold tracking-wider bg-slate-950/65 hover:bg-rose-950/40 text-slate-400 hover:text-rose-450 border border-slate-800 hover:border-rose-550/30 rounded shadow-sm hover:shadow-rose-950/10 transition-all cursor-pointer flex items-center gap-1"
                              title="Reversal Entry"
                            >
                              <RotateCcw className="w-3 h-3 text-rose-500" />
                              <span>Annuler</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARDS */}
        <div className="flex-1 overflow-y-auto flex flex-col md:hidden divide-y divide-slate-800/60 font-mono text-xs">
          {txWithBalances.length === 0 ? (
            <div className="py-12 px-4 text-center text-slate-500 font-sans flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400">
                <FilterX className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-300">
                  {tText("Aucune transaction trouvée pour les filtres sélectionnés.")}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {tText("Vérifiez vos critères de recherche (période, succursale, département, type ou employé).")}
                </p>
              </div>
              {onResetFilters && (
                <button
                  onClick={onResetFilters}
                  className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/60 text-cyan-400 rounded-lg text-xs font-semibold transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{tText("Réinitialiser tous les filtres")}</span>
                </button>
              )}
            </div>
          ) : (
            paginatedTxs.map((tx) => {
              const isLiquidityDebit = Boolean(
                tx.debit_account?.toUpperCase().includes("CASH") || 
                tx.debit_account?.toUpperCase().includes("BANK") || 
                tx.debit_account?.startsWith("10")
              );
              const isLiquidityCredit = Boolean(
                tx.credit_account?.toUpperCase().includes("CASH") || 
                tx.credit_account?.toUpperCase().includes("BANK") || 
                tx.credit_account?.startsWith("10")
              );
              let isCredit = false;
              let isDebit = false;
              if (isLiquidityDebit && !isLiquidityCredit) {
                isCredit = true;
              } else if (isLiquidityCredit && !isLiquidityDebit) {
                isDebit = true;
              } else if (tx.type === 'INCOME') {
                isCredit = true;
              } else if (['EXPENSE', 'ADVANCE', 'PAYROLL', 'REFUND', 'PENALTY'].includes(tx.type)) {
                isDebit = true;
              } else if (tx.type === 'REVERSAL') {
                const isReversingIncome = tx.description?.includes('INCOME') || tx.metadata?.originalType === 'INCOME';
                if (isReversingIncome) {
                  isDebit = true;
                } else {
                  isCredit = true;
                }
              }
              
              let typeClass = "bg-slate-500/10 text-slate-400 border-slate-500/20";
              if (tx.type === "INCOME") typeClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
              if (tx.type === "EXPENSE") typeClass = "bg-rose-500/10 text-rose-450 border-rose-500/20";
              if (tx.type === "ADVANCE") typeClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
              if (tx.type === "PAYROLL") typeClass = "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
              if (tx.type === 'REVERSAL') typeClass = "bg-purple-500/10 text-purple-400 border-purple-500/20";

              const amtCents = tx.amount_cents ?? Math.round((tx.amount || 0) * 100);
              const displayAmount = (amtCents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              const balCents = tx.computedBalance ?? 0;
              const displayBalance = (balCents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

              return (
                <div key={tx.id} className={`p-5 flex flex-col gap-4 hover:bg-slate-900/40 transition-colors ${selectedTxIds.includes(tx.id) ? 'bg-cyan-950/10' : ''}`}>
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex items-start gap-3">
                      {tx.type !== 'REVERSAL' && (
                        <div className="pt-1">
                          <input 
                            type="checkbox" 
                            className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500 bg-slate-950 cursor-pointer w-4 h-4"
                            checked={selectedTxIds.includes(tx.id)}
                            onChange={() => handleSelectRow(tx.id)}
                          />
                        </div>
                      )}
                      <div className="flex flex-col gap-1.5">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black font-sans w-max uppercase tracking-wider border ${typeClass}`}>
                          {tx.type}
                        </span>
                        <span className="font-sans text-sm font-semibold text-slate-200 leading-snug">{cleanDescription(tx.description) || tx.employeeName || 'Client / Divers'}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{tx.source}</span>
                          <span className="text-slate-700">•</span>
                          <span className="text-slate-500 text-[10px]">{formatTxDate(tx.date, 'dd/MM/yy HH:mm')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right shrink-0">
                      <span className={`font-black text-base font-mono ${isCredit ? 'text-emerald-400' : isDebit ? 'text-rose-400' : 'text-slate-400'}`}>
                        {isCredit ? '+' : isDebit ? '-' : ''}{displayAmount}
                      </span>
                      {tx.isImmutable ? (
                        <div className="flex items-center gap-1 text-emerald-500/60 bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/10">
                          <ShieldCheck className="w-3 h-3" />
                          <span className="text-[9px] font-bold">SECURED</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-amber-500/60 bg-amber-500/5 px-1.5 py-0.5 rounded border border-amber-500/10">
                          <AlertTriangle className="w-3 h-3" />
                          <span className="text-[9px] font-bold">LEGACY</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-3 border-t border-slate-800/40">
                    <div className="flex flex-col">
                      <span className="text-slate-500 font-sans text-[9px] font-black uppercase tracking-widest">Solde Courant</span>
                      <span className={`font-mono text-sm font-bold ${tx.computedBalance >= 0 ? 'text-slate-200' : 'text-rose-400'}`}>
                        {displayBalance} <span className="text-[10px] text-slate-500 font-sans">HTG</span>
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setDetailTx(tx);
                          onViewDetails(tx);
                        }}
                        className="px-3 py-1.5 bg-slate-950/60 border border-slate-800 hover:bg-slate-900 text-slate-300 hover:text-cyan-400 rounded-lg flex items-center gap-2 transition-all active:scale-95 shadow-sm"
                      >
                        <Eye className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-[10px] font-bold uppercase tracking-wider font-sans">Détails</span>
                      </button>
                      {isReversalAuthorized && tx.type !== 'REVERSAL' && (
                        <button
                          onClick={() => setReversalTx(tx)}
                          className="px-3 py-1.5 bg-slate-950/60 border border-slate-800 hover:bg-slate-900 text-rose-400 hover:text-rose-500 rounded-lg flex items-center gap-2 transition-all active:scale-95 shadow-sm"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                          <span className="text-[10px] font-bold uppercase tracking-wider font-sans">Annuler</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* PAGINATION CONTROLS */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between py-2 shrink-0 border-t border-slate-800/40">
          <div className="text-xs text-slate-500 font-sans">
            Affichage de {startIndex + 1} à {Math.min(startIndex + itemsPerPage, txWithBalances.length)} sur {txWithBalances.length} entrées
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-xs font-bold rounded bg-slate-900 border border-slate-700 text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800 transition"
            >
              Précédent
            </button>
            <span className="text-xs font-mono text-slate-400 font-bold mx-2">
              Page {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-xs font-bold rounded bg-slate-900 border border-slate-700 text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800 transition"
            >
              Suivant
            </button>
          </div>
        </div>
      )}

      {/* DETAIL OVERLAY DIALOG */}
      {detailTx && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center bg-slate-950 px-4 py-3 border-b border-slate-800/80">
              <span className="text-xs font-mono font-bold tracking-widest text-cyan-450 uppercase flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                FICHE DE TRANSACTION DOUBLE ENTRÉE
              </span>
              <button
                onClick={() => setDetailTx(null)}
                className="text-slate-400 hover:text-white transition p-1 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4 font-sans text-xs max-h-[75vh] overflow-y-auto w-full">
              <div className="flex justify-between items-start border-b border-slate-800/40 pb-3">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-black tracking-wider mb-0.5">Identifiant de Référence</div>
                  <div className="font-mono text-xs font-bold text-slate-350 select-all">{detailTx.id}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-500 uppercase font-black tracking-wider mb-0.5">Statut Validation</div>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse">
                    {detailTx.status || 'POSTED'}
                  </span>
                </div>
              </div>

              <div className="bg-slate-950/65 rounded-lg border border-slate-800/80 p-3.5 flex justify-between items-center">
                <div>
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mb-1">Impact Financier</div>
                  <div className="font-sans text-lg font-bold text-slate-100">
                    {detailTx.type === 'INCOME' ? '+' : '-'} {((detailTx.amount_cents ?? Math.round((detailTx.amount || 0) * 100)) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {detailTx.currency || 'HTG'}
                  </div>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-black tracking-wider border ${
                    detailTx.type === 'INCOME'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-450 border-rose-500/20'
                  }`}>
                    {detailTx.type}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3 pb-3 border-b border-slate-800/40">
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-0.5">Date & Heure Enregistrement</div>
                  <div className="text-slate-300 font-mono">{formatTxDate(detailTx.date, 'dd/MM/yyyy HH:mm:ss')}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-0.5">Catégorie Comptable</div>
                  <div className="text-slate-100 font-bold font-mono">{detailTx.category}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-0.5">Compte Débit (Actif)</div>
                  <div className="text-rose-400 font-mono font-bold">{detailTx.debit_account || '1010 - Caisse Principale'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-0.5">Compte Crédit (Passif/Revenu)</div>
                  <div className="text-emerald-400 font-mono font-bold">{detailTx.credit_account || '4110 - Ventes / Services'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-0.5">Source d'Alimentation</div>
                  <div className="text-indigo-400 font-mono font-bold uppercase text-[10px]">{detailTx.source}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-0.5">Membre/Employé Lié</div>
                  <div className="text-slate-300 font-semibold">{detailTx.employeeName || detailTx.employeeId || 'Non Spécifié'}</div>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-1">Description Transactionnelle</div>
                <div className="bg-slate-950/40 p-2.5 border border-slate-850 rounded text-slate-300 font-sans leading-relaxed">
                  {cleanDescription(detailTx.description) || detailTx.employeeName || 'Client / Divers'}
                </div>
              </div>

              <div className="bg-cyan-950/20 border border-cyan-900/30 rounded-lg p-3">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider mb-1">Trace d'Audit Cryptographique Immuable</div>
                    <p className="text-[9.5px] text-slate-400 font-mono leading-tight break-all select-all">
                      {detailTx.signerId || `audit-sha256-${detailTx.id}-secured-by-hash-chain-82a1`}
                    </p>
                    <button
                      onClick={() => handleCopySignature(detailTx.signerId || `audit-sha256-${detailTx.id}-secured-by-hash-chain-82a1`)}
                      className="mt-1.5 px-2 py-0.5 bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-800/40 hover:border-cyan-550/30 text-cyan-400 text-[9px] uppercase font-mono font-bold tracking-wider rounded transition flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-2.5 h-2.5" />
                      Copier Trace d'Audit
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-950 px-5 py-3 border-t border-slate-805/80 flex justify-end">
              <button
                onClick={() => setDetailTx(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded transition cursor-pointer"
              >
                Fermer l'Aperçu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REVERSAL DIALOG (SINGLE) */}
      {reversalTx && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center bg-slate-950 px-4 py-3 border-b border-slate-800/80">
              <span className="text-xs font-mono font-bold tracking-widest text-rose-550 uppercase flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                CONTRÔLE DE CONTREPASSATION (ÉCRITURE UNIQUE)
              </span>
              <button
                onClick={() => setReversalTx(null)}
                className="text-slate-400 hover:text-white transition p-1 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4 font-sans text-xs">
              <div className="bg-amber-955/20 border border-amber-900/30 rounded-lg p-3 text-amber-305">
                <p className="leading-relaxed">
                  ⚠️ <strong>Principe d'Immuabilité de Registre :</strong> Les écritures validées du Grand Livre FinOps sont archivées de manière indélébile. L'annulation d'une écriture se fait uniquement par l'insertion d'une <strong>Écriture Compensatoire inverse (Contra-Entry)</strong> qui neutralisera le solde tout en conservant l'intégrité historique complète de l'audit.
                </p>
                <div className="mt-3 bg-amber-950/40 border border-amber-900/50 p-2.5 rounded text-amber-200 font-sans text-xs leading-relaxed">
                  <p><strong>Action planifiée :</strong> Création d'une écriture de contrepassation datée du <strong>{format(new Date(reversalTx.date), 'dd/MM/yyyy HH:mm')}</strong> pour <strong>{(reversalTx.amount_cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} {reversalTx.currency}</strong>.</p>
                  <p className="mt-1">Ceci annulera le solde de la transaction initiale en intervertissant les comptes Débit/Crédit, sans modifier la période comptable d'origine.</p>
                </div>
              </div>

              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/60 font-mono">
                <div className="text-[10px] text-slate-500 uppercase font-extrabold mb-1.5">Écriture Source à Neutraliser :</div>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-mono text-[11px] text-slate-300 font-bold">{reversalTx.id.substring(0, 12)}...</div>
                    <div className="text-slate-450 mt-1 font-sans">{cleanDescription(reversalTx.description) || reversalTx.employeeName || 'Client / Divers'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-slate-150 font-bold">
                      {(reversalTx.amount_cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} {reversalTx.currency}
                    </div>
                    <div className="text-slate-500 text-[9px] mt-0.5">{format(new Date(reversalTx.date), 'dd/MM/yyyy')}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-950 px-5 py-3 border-t border-slate-808/80 flex justify-end gap-2.5">
              <button
                onClick={() => setReversalTx(null)}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  onReverse(reversalTx);
                  setReversalTx(null);
                  toast.success("Demande d'écriture compensatoire envoyée avec succès.");
                }}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-slate-100 text-xs font-bold rounded transition cursor-pointer flex items-center gap-1.5 font-sans"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-200 animate-spin-reverse" />
                Valider la Contrepassation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BATCH REVERSAL WARNING & CONFIRMATION MODAL */}
      <BatchReversalModal
        isOpen={showBatchReversalModal}
        onClose={() => setShowBatchReversalModal(false)}
        selectedTxs={selectedTxs}
        onConfirm={async (reason) => {
          if (onBatchReverse) {
            await onBatchReverse(selectedTxs, reason);
            clearSelection();
          }
        }}
      />

      {/* BULK DELETE CONFIRMATION MODAL */}
      <BatchDeleteModal
        isOpen={showBatchDeleteModal}
        onClose={() => setShowBatchDeleteModal(false)}
        selectedTxs={selectedTxs}
        onConfirm={async () => {
          if (onBatchDelete) {
            await onBatchDelete(selectedTxIds);
            clearSelection();
          }
        }}
      />
    </div>
  );
}
