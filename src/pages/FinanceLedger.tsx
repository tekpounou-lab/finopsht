import React, { useState, useEffect } from 'react';
import { Filter, Database, Sparkles, Plus, Loader2, Layers, TrendingUp } from 'lucide-react';
import { Employee, LedgerTransaction, ERPEvent, ForensicLog, Role, Branch, Business, Department } from '../types';
import LedgerHeader from '../components/ledger/LedgerHeader';
import FilterToolbar from '../components/ledger/FilterToolbar';
import DoubleEntryTable from '../components/ledger/DoubleEntryTable';
import CreateTransactionDialog from '../components/ledger/CreateTransactionDialog';
import BulkTransactionImportDialog from '../components/ledger/BulkTransactionImportDialog';
import CompensationDialog from '../components/ledger/CompensationDialog';
import DataIntegrityDialog from '../components/ledger/DataIntegrityDialog';
import AICFOAnalysisSheet from '../components/ledger/AICFOAnalysisSheet';
import { FinancialDashboard } from '../components/ledger/FinancialDashboard';
import { LedgerRepository } from '../repositories/LedgerRepository';
import { LedgerFilterParams } from '../components/ledger/types';
import { generateSignature, getLocalIP } from '../data';
import { hasPermission } from '../permissions/role.permissions';
import * as xlsx from 'xlsx';
import { toast } from 'sonner';
import { useI18n, useTranslate } from '../i18n';
import { resolveDepartmentName } from '../utils/nameResolvers';
import { filterLedgerTransactions, calculateLedgerSummary, LedgerFilterContext } from '../services/cfo/LedgerFilterEngine';
import { LedgerSeedService } from '../services/cfo/LedgerSeedService';
import { detectOrphanTransactions, COST_CENTER_DEFAULT } from '../services/AccountingEngine';
import { useFilters } from '../hooks/useFilters';

const DEFAULT_GL_FILTERS: LedgerFilterParams = {
  type: ['ALL'],
  category: 'ALL',
  branchId: ['ALL'],
  departmentId: ['ALL'],
  employeeId: ['ALL'],
  period: 'ALL',
  search: '',
  startDate: '',
  endDate: ''
};

interface FinanceLedgerProps {
  currentRole: Role;
  current_business_id: string;
  currentBranchId: string | null;
  employees: Employee[];
  ledgerTransactions: LedgerTransaction[];
  onAddTransaction: (t: LedgerTransaction) => void;
  onReverseTransaction?: (t: LedgerTransaction) => void;
  onAddForensicLog: (log: ForensicLog) => void;
  onAddEvent: (ev: ERPEvent) => void;
  currentBusiness: Business;
  branches: Branch[];
  departments: Department[];
  selectedMonth: number | string;
}

export default function FinanceLedger({
  currentRole,
  current_business_id,
  currentBranchId,
  employees,
  ledgerTransactions,
  onAddTransaction,
  onReverseTransaction,
  onAddForensicLog,
  onAddEvent,
  currentBusiness,
  branches,
  departments,
  selectedMonth
}: FinanceLedgerProps) {
  const { language } = useI18n();
  const tText = useTranslate();
  
  // Centralized SSOT Filter Store for General Ledger
  const {
    filters,
    setFilterGroup: setFilters,
    resetFilters: handleResetFilters,
    setPeriod
  } = useFilters<LedgerFilterParams>('gl', DEFAULT_GL_FILTERS);

  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showCompensation, setShowCompensation] = useState(false);
  const [showAiCfo, setShowAiCfo] = useState(false);
  const [showDataIntegrity, setShowDataIntegrity] = useState(false);
  const [currentView, setCurrentView] = useState<'TRANSACTIONS' | 'FINANCIAL_STATEMENTS'>('TRANSACTIONS');
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isCleaningOrphans, setIsCleaningOrphans] = useState(false);

  const orphanTransactions = React.useMemo(() => {
    return detectOrphanTransactions(ledgerTransactions, current_business_id);
  }, [ledgerTransactions, current_business_id]);

  const handleCleanOrphans = async () => {
    if (orphanTransactions.length === 0) {
      toast.info(tText("Aucune écriture orpheline détectée."));
      return;
    }
    try {
      setIsCleaningOrphans(true);
      const defaultBranch = (branches.find(b => b.business_id === current_business_id) as any)?.cost_center_id || COST_CENTER_DEFAULT;
      const res = await LedgerRepository.cleanOrphanTransactions(
        current_business_id,
        defaultBranch,
        { role: currentRole, business_id: current_business_id }
      );
      toast.success(tText(`${res.fixedCount} transaction(s) orpheline(s) corrigée(s) et réaffectée(s) avec succès !`));
    } catch (err: any) {
      toast.error(tText(`Erreur lors du nettoyage des orphelins: ${err?.message || 'Erreur inconnue'}`));
    } finally {
      setIsCleaningOrphans(false);
    }
  };

  const handleToggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.length === ledgerSummary.transactionsWithBalance.length && ledgerSummary.transactionsWithBalance.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(ledgerSummary.transactionsWithBalance.map(tx => tx.id));
    }
  };

  // Adjust filter period when selectedMonth changes explicitly
  useEffect(() => {
    if (selectedMonth === 'ALL') {
      if (filters.period !== 'ALL') setPeriod('ALL');
    } else if (typeof selectedMonth === 'number') {
      const now = new Date();
      const year = now.getFullYear();
      const monthStr = String(selectedMonth + 1).padStart(2, '0');
      const targetPeriod = `${year}-${monthStr}`;

      const hasTxInPeriod = (ledgerTransactions || []).some(tx => 
        tx.business_id === current_business_id && tx.date && tx.date.startsWith(targetPeriod)
      );

      // Only switch from 'ALL' if there are transactions in that target month
      if (hasTxInPeriod && filters.period !== targetPeriod) {
        setPeriod(targetPeriod);
      }
    } else if (typeof selectedMonth === 'string' && selectedMonth.trim() && selectedMonth !== 'ALL') {
      const hasTxInPeriod = (ledgerTransactions || []).some(tx => 
        tx.business_id === current_business_id && tx.date && tx.date.startsWith(selectedMonth.trim())
      );
      if (hasTxInPeriod && filters.period !== selectedMonth.trim()) {
        setPeriod(selectedMonth.trim());
      }
    }
  }, [selectedMonth, ledgerTransactions, current_business_id, setPeriod, filters.period]);

  // Filter transactions dynamically using SSOT LedgerFilterEngine
  const filterContext: LedgerFilterContext = {
    employees,
    branches,
    departments,
    currentRole,
    currentBranchId,
    businessId: current_business_id
  };

  const filteredTransactions = filterLedgerTransactions(ledgerTransactions, filters, filterContext);
  const ledgerSummary = calculateLedgerSummary(filteredTransactions);

  // Controlled Audit & Diagnostic Logging
  useEffect(() => {
    if (!current_business_id) return;
    console.info(`[FinanceLedger Diagnostic] Collection: "ledger_transactions" | Business ID: "${current_business_id}" | Raw Docs From Firestore: ${ledgerTransactions?.length || 0} | Filtered Count: ${filteredTransactions?.length || 0} | Active Filters:`, filters);
  }, [current_business_id, ledgerTransactions?.length, filteredTransactions?.length, filters]);

  const handleSeedDemoData = async () => {
    setIsSeeding(true);
    setSeedError(null);
    console.log(`[FinanceLedger] Starting handleSeedDemoData for businessId: "${current_business_id}"...`);

    try {
      const firstBranch = branches.find(b => b.business_id === current_business_id)?.id;
      const firstDept = departments.find(d => d.business_id === current_business_id)?.id;
      const firstEmp = employees.find(e => e.business_id === current_business_id)?.id;

      const res = await LedgerSeedService.seedDemoTransactions(
        current_business_id,
        firstBranch,
        firstDept,
        firstEmp
      );

      console.log(`[FinanceLedger] Seed service response:`, res);

      if (res.success > 0) {
        toast.success(tText(`${res.success} transactions de démonstration créées dans Firestore !`));

        // 1. Instantly inject created transactions into local context as immediate state fallback
        if (res.demoTransactions && res.demoTransactions.length > 0) {
          console.log(`[FinanceLedger] Injecting ${res.demoTransactions.length} seeded transactions directly into local context...`);
          res.demoTransactions.forEach((tx) => {
            if (onAddTransaction) {
              onAddTransaction(tx);
            }
          });
        }

        // 2. Clear all active filter constraints (period, search, startDate, endDate) to display newly generated transactions immediately
        console.log(`[FinanceLedger] Resetting filters (period: ALL, startDate: '', endDate: '') to show new transactions...`);
        handleResetFilters();
      } else {
        const errDetail = res.error || "L'écriture en lot dans Firestore a échoué.";
        console.error(`[FinanceLedger] Seeding failed: ${errDetail}`);
        setSeedError(errDetail);
        toast.error(tText(`Échec de la création: ${errDetail}`));
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Erreur inconnue lors de la création des transactions.';
      console.error("[FinanceLedger] Exception during seeding:", err);
      setSeedError(errMsg);
      toast.error(tText(`Erreur: ${errMsg}`));
    } finally {
      setIsSeeding(false);
    }
  };

  const netCashflow = ledgerSummary.netCashflowCents;
  const healthScore = ledgerSummary.healthScore;

  const handleReverseTransaction = (tx: LedgerTransaction) => {
    if (!hasPermission(currentRole, "canManagePayroll")) {
      toast.error(tText("Accès refusé. Vous ne pouvez pas annuler de transaction."));
      return;
    }

    if (onReverseTransaction) {
      onReverseTransaction(tx);
      toast.success(tText("Transaction contrepassée avec succès. L'écriture d'inversion a été générée."));
    } else {
      console.error("onReverseTransaction prop is not provided!");
    }
  };

  const handleBatchReverseTransactions = async (txs: LedgerTransaction[], reason: string) => {
    if (!hasPermission(currentRole, "canManagePayroll")) {
      toast.error(tText("Accès refusé. Vous ne pouvez pas annuler de transactions."));
      return;
    }

    const userId = currentRole === "OWNER" ? "e1" : "system";
    const userName = currentRole === "OWNER" ? "Propriétaire" : "Système";

    if (onReverseTransaction) {
      for (const tx of txs) {
        onReverseTransaction(tx);
      }
    } else {
      const reversalTxs: LedgerTransaction[] = txs.map(tx => {
        return LedgerRepository.createReversalEntry(tx, reason, userId, userName, currentRole);
      });

      reversalTxs.forEach(reversalTx => {
        onAddTransaction(reversalTx);
      });
    }

    onAddForensicLog({
      id: "f_" + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      userId: userId,
      userName: userName,
      userRole: currentRole,
      business_id: current_business_id,
      action: "BATCH_REVERSAL_ENTRY_CREATED",
      beforeState: JSON.stringify(txs),
      afterState: JSON.stringify(txs.map(t => ({ id: t.id, status: 'REVERSED' }))),
      ipAddress: getLocalIP(),
      userAgent: window.navigator.userAgent,
      signature: generateSignature({ txs, reason })
    });

    setSelectedIds([]);
    toast.success(`${txs.length} ${tText("transactions ont été contrepassées avec succès !")}`);
  };

  const handleBatchDeleteTransactions = async (txIds: string[]) => {
    if (!['OWNER', 'MANAGER', 'SUPER_ADMIN', 'ADMIN'].includes((currentRole || '').toUpperCase())) {
      toast.error(tText("Accès refusé. Vous n'avez pas les permissions pour supprimer ces écritures."));
      return;
    }

    const userId = currentRole === "OWNER" ? "e1" : "system";
    const userName = currentRole === "OWNER" ? "Propriétaire" : "Système";

    try {
      await LedgerRepository.batchDeleteTransactions(txIds, {
        id: userId,
        uid: userId,
        name: userName,
        role: currentRole,
        business_id: current_business_id
      });

      onAddForensicLog({
        id: "f_" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        userId: userId,
        userName: userName,
        userRole: currentRole,
        business_id: current_business_id,
        action: "BATCH_TRANSACTIONS_DELETED",
        beforeState: JSON.stringify({ count: txIds.length, transactionIds: txIds }),
        afterState: "{}",
        ipAddress: getLocalIP(),
        userAgent: window.navigator.userAgent,
        signature: generateSignature({ txIds, timestamp: Date.now() })
      });

      setSelectedIds([]);
      toast.success(`${txIds.length} ${tText("transaction(s) supprimée(s) définitivement du Grand Livre.")}`);
    } catch (err: any) {
      console.error("[FinanceLedger] Erreur suppression groupée:", err);
      toast.error(tText(`Erreur lors de la suppression: ${err?.message || 'Erreur inconnue'}`));
    }
  };

  const handleSaveTransaction = async (txData: Partial<LedgerTransaction>) => {
    if (currentRole !== 'OWNER' && currentRole !== 'MANAGER') {
      toast.error(tText("Accès refusé."));
      return;
    }
    
    const newTx = {
      ...txData,
      id: "tx_" + Math.random().toString(36).substring(2, 9),
    } as LedgerTransaction;
    
    onAddTransaction(newTx);
    onAddForensicLog({
      id: "f_" + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      userId: "user",
      userName: "User",
      userRole: currentRole,
      business_id: current_business_id,
      action: txData.type === 'COMPENSATION' ? "COMPENSATION_CREATED" : "TRANSACTION_CREATED",
      beforeState: "{}",
      afterState: JSON.stringify(newTx),
      ipAddress: getLocalIP(),
      userAgent: window.navigator.userAgent,
      signature: generateSignature({ newTx })
    });
  };

  const [isBatchImporting, setIsBatchImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  const handleCsvImport = async (txs: Partial<LedgerTransaction>[]) => {
    if (currentRole !== 'OWNER' && currentRole !== 'MANAGER') {
      toast.error(tText("Accès refusé."));
      return;
    }

    setIsBatchImporting(true);
    setImportProgress(0);
    
    // Map partials to full transactions
    const mappedTxs: LedgerTransaction[] = txs.map(txData => ({
      ...txData,
      id: "tx_imp_" + Math.random().toString(36).substring(2, 9),
      business_id: current_business_id
    } as LedgerTransaction));

    const forensicLog: ForensicLog = {
      id: "f_" + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      userId: "user",
      userName: "User",
      userRole: currentRole,
      business_id: current_business_id,
      action: "BULK_CSV_IMPORT",
      beforeState: `{}`,
      afterState: `{"importedRecords": ${mappedTxs.length}}`,
      ipAddress: getLocalIP(),
      userAgent: window.navigator.userAgent,
      signature: generateSignature({ importedRecords: mappedTxs.length })
    };

    try {
      const result = await LedgerRepository.bulkImportWithAudit(
        mappedTxs, 
        forensicLog, 
        (completed, total) => {
          const percentage = Math.round((completed / total) * 100);
          setImportProgress(percentage);
        }
      );

      if (result.failed > 0) {
        toast.error(`Importation partielle: ${result.success} réussis, ${result.failed} échoués.`);
      } else {
        toast.success(`${result.success} ${tText("transactions importées avec succès.")}`);
      }
      
      // Update local state directly for optimism
      mappedTxs.forEach(tx => onAddTransaction(tx));

    } catch (e: any) {
      toast.error(`Erreur critique lors de l'import: ${e.message}`);
    } finally {
      setIsBatchImporting(false);
      setImportProgress(0);
    }
  };

  const handleExportExcel = () => {
    if (filteredTransactions.length === 0) {
      toast.error(tText("Aucune donnée à exporter avec les filtres actuels."));
      return;
    }
    
    // Sort to match table display (newest first)
    const exportData = [...filteredTransactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map(tx => ({
        'ID Transaction': tx.id,
        'Date': tx.date.split('T')[0],
        'Heure': tx.date.split('T')[1]?.substring(0,8) || '',
        'Type': tx.type,
        'Catégorie': tx.category,
        'Description': tx.description,
        'Montant (Cents)': tx.amount_cents,
        'Montant': tx.amount,
        'Devise': tx.currency,
        'Succursale': branches.find(b => b.id === tx.branchId)?.name || tx.branchId,
        'Département': resolveDepartmentName(tx.departmentId || (tx as any).department_id, undefined, departments),
        'Employé lié': tx.employeeName || tx.employeeId || 'N/A',
        'Statut': tx.status,
        'Source': tx.source,
        'Immuable': tx.isImmutable ? 'OUI' : 'NON'
      }));

    const ws = xlsx.utils.json_to_sheet(exportData);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Grand Livre");

    // Format header
    const range = xlsx.utils.decode_range(ws['!ref'] as string);
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const address = xlsx.utils.encode_col(C) + "1";
      if (!ws[address]) continue;
      ws[address].v = String(ws[address].v).toUpperCase();
    }
    
    const dateStr = new Date().toISOString().split('T')[0];
    xlsx.writeFile(wb, `finops-ledger-filtered-${dateStr}.xlsx`);
    
    onAddForensicLog({
      id: "f_" + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      userId: "user",
      userName: "User",
      userRole: currentRole,
      business_id: current_business_id,
      action: "EXPORT_LEGER_EXCEL",
      beforeState: "{}",
      afterState: `{"exportedRecords": ${exportData.length}}`,
      ipAddress: getLocalIP(),
      userAgent: window.navigator.userAgent,
      signature: generateSignature({ action: "EXPORT_LEGER_EXCEL", count: exportData.length })
    });
  };

  if (!current_business_id) {
    return (
      <div className="flex flex-col flex-1 min-h-[400px] items-center justify-center gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <p className="text-sm font-medium">{tText("Chargement du grand livre comptable...")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 font-sans animate-in fade-in w-full">
      <div className="shrink-0">
        <LedgerHeader 
          healthScore={healthScore}
          cashflow={netCashflow}
          orphanCount={orphanTransactions.length}
          isCleaningOrphans={isCleaningOrphans}
          onCleanOrphans={handleCleanOrphans}
          onNewTransaction={() => setShowCreate(true)}
          onImportCsv={() => setShowImport(true)}
          onGenerateReport={handleExportExcel}
          onCompensation={() => setShowCompensation(true)}
          onAiCfo={() => setShowAiCfo(true)}
          onOpenDataIntegrity={() => setShowDataIntegrity(true)}
        />
      </div>

      <CreateTransactionDialog 
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        branches={branches}
        departments={departments}
        employees={employees}
        current_business_id={current_business_id}
        onSave={handleSaveTransaction}
      />

      <BulkTransactionImportDialog 
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleCsvImport}
        current_business_id={current_business_id}
        branches={branches}
        departments={departments}
        employees={employees}
        ledgerTransactions={ledgerTransactions}
        onAddEvent={onAddEvent}
        onAddForensicLog={onAddForensicLog}
      />

      <DataIntegrityDialog 
        isOpen={showDataIntegrity}
        onClose={() => setShowDataIntegrity(false)}
        ledgerTransactions={ledgerTransactions}
        branches={branches}
        departments={departments}
        employees={employees}
        current_business_id={current_business_id}
        onAddForensicLog={onAddForensicLog}
      />

      <CompensationDialog 
        isOpen={showCompensation}
        onClose={() => setShowCompensation(false)}
        transactions={ledgerTransactions.filter(t => t.business_id === current_business_id)}
        current_business_id={current_business_id}
        onSave={handleSaveTransaction}
      />


      {/* Import Progress Overlay */}
      {isBatchImporting && (
        <div className="fixed bottom-6 right-6 bg-slate-900 border border-indigo-500/50 p-4 rounded-xl shadow-2xl z-50 w-72">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-slate-200">Importation en cours...</span>
            <span className="text-xs font-mono text-indigo-400">{importProgress}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${importProgress}%` }}></div>
          </div>
        </div>
      )}

      <AICFOAnalysisSheet 
        isOpen={showAiCfo}
        onClose={() => setShowAiCfo(false)}
        transactionsCount={filteredTransactions.length}
        current_business_id={current_business_id}
      />

      <div className="flex flex-col gap-3">
        {/* Unified Filter Toolbar for both Grand Livre and Financial Statements */}
        <FilterToolbar 
          branches={branches.filter(b => b.business_id === current_business_id)}
          departments={departments}
          employees={employees.filter(e => e.business_id === current_business_id)}
          filters={filters}
          onFilterChange={setFilters}
        />

        {ledgerTransactions.length > 0 && filteredTransactions.length === 0 && (
          <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-300 shadow-sm animate-fadeIn">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {filters.period && filters.period !== 'ALL' 
                  ? `Aucune transaction pour la période sélectionnée (${filters.period}). ${ledgerTransactions.length} transaction(s) existent dans d'autres périodes.`
                  : `Aucune transaction ne correspond à vos filtres actuels sur un total de ${ledgerTransactions.length} enregistrement(s).`
                }
              </span>
            </div>
            <button
              onClick={handleResetFilters}
              className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-lg font-semibold whitespace-nowrap transition cursor-pointer"
            >
              Réinitialiser les filtres & Période
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between bg-slate-900/60 p-1.5 rounded-2xl border border-slate-800 backdrop-blur-md">
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentView('TRANSACTIONS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              currentView === 'TRANSACTIONS'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm shadow-cyan-950/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
            }`}
            id="btn_view_transactions"
          >
            <Layers className="w-3.5 h-3.5" />
            {tText("Grand Livre & Écritures")}
          </button>
          <button
            onClick={() => setCurrentView('FINANCIAL_STATEMENTS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              currentView === 'FINANCIAL_STATEMENTS'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm shadow-emerald-950/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
            }`}
            id="btn_view_financial_statements"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            {tText("États Financiers & Ratios (Bilan / P&L)")}
          </button>
        </div>
      </div>

      {currentView === 'FINANCIAL_STATEMENTS' ? (
        <FinancialDashboard 
          transactions={filteredTransactions}
          allTransactions={ledgerTransactions}
          filters={filters}
          onFilterChange={setFilters}
          branches={branches.filter(b => b.business_id === current_business_id)}
          departments={departments}
          employees={employees.filter(e => e.business_id === current_business_id)}
          businessId={current_business_id}
          currency={currentBusiness?.currency || "HTG"}
        />
      ) : (
        <DoubleEntryTable 
          transactions={ledgerSummary.transactionsWithBalance}
          rawCount={ledgerTransactions.length}
          currentRole={currentRole}
          onViewDetails={(tx) => {}}
          onReverse={handleReverseTransaction}
          onBatchReverse={handleBatchReverseTransactions}
          onBatchDelete={handleBatchDeleteTransactions}
          onResetFilters={handleResetFilters}
          onSeedDemoData={handleSeedDemoData}
          isSeeding={isSeeding}
          onOpenCreate={() => setShowCreate(true)}
          selectedIds={selectedIds}
          onToggleSelection={handleToggleSelection}
          onToggleSelectAll={handleToggleSelectAll}
        />
      )}
    </div>
  );
}
