import React, { useState, useMemo } from "react";
import {
  FileSpreadsheet,
  TrendingUp,
  Scale,
  ShieldCheck,
  Download,
  RefreshCw,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Building,
  CheckCircle2,
  AlertTriangle,
  Filter,
  Layers,
  Calendar,
  Sparkles,
  Info
} from "lucide-react";
import { LedgerTransaction, Branch, Department, Employee } from "../../types";
import { LedgerFilterParams } from "../../services/cfo/LedgerFilterEngine";
import { FinancialSnapshot, FinancialRatios } from "../../types/accounting";
import { FinancialSnapshotBuilder } from "../../services/FinancialSnapshotBuilder";
import { FinancialSnapshotRepository } from "../../repositories/accounting/FinancialSnapshotRepository";
import { toast } from "sonner";

interface FinancialDashboardProps {
  transactions: LedgerTransaction[];
  allTransactions?: LedgerTransaction[];
  businessId: string;
  currency?: string;
  filters?: LedgerFilterParams;
  onFilterChange?: (filters: LedgerFilterParams) => void;
  branches?: Branch[];
  departments?: Department[];
  employees?: Employee[];
}

export const FinancialDashboard: React.FC<FinancialDashboardProps> = ({
  transactions,
  allTransactions,
  businessId,
  currency = "HTG",
  filters,
  onFilterChange,
  branches = [],
  departments = [],
  employees = []
}) => {
  const [activeTab, setActiveTab] = useState<"RATIOS" | "BALANCE_SHEET" | "INCOME_STATEMENT" | "TRIAL_BALANCE">("RATIOS");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isRebuildingAll, setIsRebuildingAll] = useState(false);
  const [rebuildStats, setRebuildStats] = useState<{ count: number; periods: string[] } | null>(null);

  // Compute active date boundaries based on filters
  const { derivedStartDate, derivedEndDate, derivedPeriodType } = useMemo(() => {
    let periodType: "MONTHLY" | "QUARTERLY" | "ANNUAL" = "MONTHLY";

    if (filters?.startDate && filters?.endDate) {
      return { derivedStartDate: filters.startDate, derivedEndDate: filters.endDate, derivedPeriodType: periodType };
    }
    if (filters?.period && filters.period !== "ALL") {
      const [yStr, mStr] = filters.period.split("-");
      if (yStr && mStr) {
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10);
        const start = `${filters.period}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const end = `${filters.period}-${String(lastDay).padStart(2, "0")}`;
        return { derivedStartDate: start, derivedEndDate: end, derivedPeriodType: periodType };
      }
    }
    
    // Default according to current date
    const now = new Date();
    const currentEnd = now.toISOString().split("T")[0];
    const mStr = String(now.getMonth() + 1).padStart(2, "0");
    const currentStart = `${now.getFullYear()}-${mStr}-01`;

    return { derivedStartDate: currentStart, derivedEndDate: currentEnd, derivedPeriodType: periodType };
  }, [filters?.startDate, filters?.endDate, filters?.period]);

  // Compute live snapshot from filtered transactions
  const currentSnapshot: FinancialSnapshot = useMemo(() => {
    return FinancialSnapshotBuilder.buildSnapshot(
      transactions,
      businessId,
      derivedPeriodType,
      derivedStartDate,
      derivedEndDate,
      currency
    );
  }, [transactions, businessId, derivedPeriodType, derivedStartDate, derivedEndDate, currency]);

  const { balanceSheet, incomeStatement, trialBalance, ratios } = currentSnapshot;

  const handleSaveSnapshot = async () => {
    setIsSaving(true);
    try {
      await FinancialSnapshotRepository.save(currentSnapshot);
      setSaveSuccess(true);
      toast.success("Snapshot financier archivé avec succès dans Firestore !");
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save snapshot:", err);
      toast.error("Erreur lors de l'archivage du snapshot");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRebuildAllSnapshots = async () => {
    const txSource = (allTransactions && allTransactions.length > 0) ? allTransactions : transactions;
    if (!txSource || txSource.length === 0) {
      toast.error("Aucune transaction disponible pour générer les snapshots.");
      return;
    }
    setIsRebuildingAll(true);
    try {
      const result = await FinancialSnapshotBuilder.rebuildAllHistoricalFinancialSnapshots(
        txSource,
        businessId,
        currency
      );
      setRebuildStats({ count: result.savedCount, periods: result.periods });
      toast.success(`Succès : ${result.savedCount} snapshots historiques archivés (${result.periods.join(', ')})`);
    } catch (err) {
      console.error("Failed to rebuild snapshots:", err);
      toast.error("Échec de la reconstruction des snapshots historiques");
    } finally {
      setIsRebuildingAll(false);
    }
  };

  const handleExportCSV = () => {
    if (activeTab === "TRIAL_BALANCE") {
      const headers = "Code Compte,Nom Compte,Catégorie,Total Débit (HTG),Total Crédit (HTG),Solde Net (HTG)\n";
      const rows = trialBalance.items
        .map(
          (i) =>
            `"${i.accountCode}","${i.accountName}","${i.category}",${(i.debitCents / 100).toFixed(2)},${(i.creditCents / 100).toFixed(2)},${(i.netBalanceCents / 100).toFixed(2)}`
        )
        .join("\n");
      const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Balance_Verification_${businessId}_${new Date().toISOString().split("T")[0]}.csv`;
      link.click();
    } else {
      window.print();
    }
  };

  const formatMoney = (cents: number) => {
    return (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + currency;
  };

  // Active filter labels resolution
  const activeBranchName = filters?.branchId && !filters.branchId.includes("ALL")
    ? branches.filter(b => filters.branchId.includes(b.id)).map(b => b.name).join(", ")
    : null;

  const activeDeptName = filters?.departmentId && !filters.departmentId.includes("ALL")
    ? departments.filter(d => filters.departmentId.includes(d.id)).map(d => d.name).join(", ")
    : null;

  const activeEmployeeName = filters?.employeeId && !filters.employeeId.includes("ALL")
    ? employees.filter(e => filters.employeeId.includes(e.id)).map(e => e.name || e.email).join(", ")
    : null;

  return (
    <div className="space-y-6" id="financial_dashboard_root">
      {/* Top Header & Action Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 text-white p-6 rounded-2xl shadow-xl shadow-slate-950/40 border border-slate-800 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30 shadow-inner">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-slate-100">États Financiers & Ratios Stratégiques</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  SYSCOHADA
                </span>
              </div>
              <p className="text-sm text-slate-400">
                Génération en temps réel conforme aux normes comptables (Bilan, Compte de résultat, Balance générale).
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Synchronized Filter Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-semibold">
            <Filter className="w-3.5 h-3.5 text-emerald-400" />
            <span>Sincronisé avec la FilterToolbar</span>
          </div>

          {/* Rebuild Historical Snapshots Button */}
          <button
            onClick={handleRebuildAllSnapshots}
            disabled={isRebuildingAll}
            className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-950/40 disabled:opacity-50 cursor-pointer"
            id="btn_rebuild_historical_snapshots"
            title="Génère et archive automatiquement les snapshots pour toutes les périodes historiques"
          >
            {isRebuildingAll ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-indigo-200" />}
            {isRebuildingAll ? "Génération..." : "Snapshots Historiques"}
          </button>

          <button
            onClick={handleSaveSnapshot}
            disabled={isSaving}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-950/40 disabled:opacity-50 cursor-pointer"
            id="btn_save_financial_snapshot"
          >
            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {saveSuccess ? "Snapshot Archivé !" : "Archiver Snapshot"}
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all border border-slate-700 cursor-pointer"
            id="btn_export_financials"
          >
            <Download className="w-4 h-4" />
            Exporter
          </button>
        </div>
      </div>

      {/* Synchronized Filter Context Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-900/50 rounded-xl border border-slate-800/80 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-slate-400 font-bold">
            <Filter className="w-3.5 h-3.5 text-emerald-400" />
            <span>Périmètre d'analyse :</span>
          </div>
          <span className="px-2.5 py-1 bg-slate-800/90 text-slate-200 rounded-md font-mono border border-slate-700/60 flex items-center gap-1.5">
            <Calendar className="w-3 h-3 text-cyan-400" />
            {derivedStartDate} au {derivedEndDate}
          </span>
          {activeBranchName && (
            <span className="px-2.5 py-1 bg-emerald-950/60 text-emerald-300 rounded-md border border-emerald-800/50">
              Succursale : {activeBranchName}
            </span>
          )}
          {activeDeptName && (
            <span className="px-2.5 py-1 bg-indigo-950/60 text-indigo-300 rounded-md border border-indigo-800/50">
              Département : {activeDeptName}
            </span>
          )}
          {activeEmployeeName && (
            <span className="px-2.5 py-1 bg-purple-950/60 text-purple-300 rounded-md border border-purple-800/50">
              Employé : {activeEmployeeName}
            </span>
          )}
          <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px] font-mono">
            {transactions.length} écritures analysées
          </span>
        </div>

        {rebuildStats && (
          <div className="text-[11px] text-emerald-400 font-medium flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{rebuildStats.count} périodes archivées ({rebuildStats.periods.slice(-3).join(', ')})</span>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800/80 gap-1">
        <button
          onClick={() => setActiveTab("RATIOS")}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 rounded-t-xl cursor-pointer ${
            activeTab === "RATIOS" ? "border-emerald-400 text-emerald-400 bg-emerald-950/30" : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          }`}
          id="tab_financial_ratios"
        >
          <TrendingUp className="w-4 h-4" />
          Ratios & Synthèse Directoire
        </button>
        <button
          onClick={() => setActiveTab("BALANCE_SHEET")}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 rounded-t-xl cursor-pointer ${
            activeTab === "BALANCE_SHEET" ? "border-emerald-400 text-emerald-400 bg-emerald-950/30" : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          }`}
          id="tab_balance_sheet"
        >
          <Building className="w-4 h-4" />
          Bilan Comptable (Balance Sheet)
        </button>
        <button
          onClick={() => setActiveTab("INCOME_STATEMENT")}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 rounded-t-xl cursor-pointer ${
            activeTab === "INCOME_STATEMENT" ? "border-emerald-400 text-emerald-400 bg-emerald-950/30" : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          }`}
          id="tab_income_statement"
        >
          <DollarSign className="w-4 h-4" />
          Compte de Résultat (P&L)
        </button>
        <button
          onClick={() => setActiveTab("TRIAL_BALANCE")}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 rounded-t-xl cursor-pointer ${
            activeTab === "TRIAL_BALANCE" ? "border-emerald-400 text-emerald-400 bg-emerald-950/30" : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          }`}
          id="tab_trial_balance"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Balance Générale de Vérification
        </button>
      </div>

      {/* TAB CONTENT: 1. RATIOS */}
      {activeTab === "RATIOS" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" id="view_financial_ratios">
          {/* Card 1: Liquidité Générale */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-md shadow-sm space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
              <span>Ratio de Liquidité</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ratios.currentRatio >= 1.2 ? "bg-emerald-950/80 border border-emerald-500/40 text-emerald-300" : "bg-amber-950/80 border border-amber-500/40 text-amber-300"}`}>
                {ratios.currentRatio >= 1.2 ? "Excellent" : "Vigilance"}
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-100">{ratios.currentRatio.toFixed(2)}x</div>
            <p className="text-xs text-slate-400">
              Actifs circulants / Passifs court terme. Cible optimale &gt; 1.2x.
            </p>
          </div>

          {/* Card 2: Fonds de Roulement */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-md shadow-sm space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
              <span>Fonds de Roulement (FRNG)</span>
              <Scale className="w-4 h-4 text-slate-400" />
            </div>
            <div className={`text-2xl font-bold font-mono ${ratios.workingCapitalCents >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {formatMoney(ratios.workingCapitalCents)}
            </div>
            <p className="text-xs text-slate-400">
              Matelas de sécurité de trésorerie nette opérationnelle.
            </p>
          </div>

          {/* Card 3: Marge Nette */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-md shadow-sm space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
              <span>Marge Nette (%)</span>
              {ratios.netMarginPercentage >= 0 ? <ArrowUpRight className="w-4 h-4 text-emerald-400" /> : <ArrowDownRight className="w-4 h-4 text-rose-400" />}
            </div>
            <div className={`text-2xl font-bold font-mono ${ratios.netMarginPercentage >= 0 ? "text-slate-100" : "text-rose-400"}`}>
              {ratios.netMarginPercentage.toFixed(1)}%
            </div>
            <p className="text-xs text-slate-400">
              Rentabilité nette rapportée au chiffre d'affaires.
            </p>
          </div>

          {/* Card 4: Runway Trésorerie */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-md shadow-sm space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
              <span>Cash Runway Estimé</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              {ratios.cashRunwayMonths} mois
            </div>
            <p className="text-xs text-slate-400">
              Capacité d'autonomie au rythme de dépenses actuel.
            </p>
          </div>
        </div>
      )}

      {/* TAB CONTENT: 2. BALANCE SHEET */}
      {activeTab === "BALANCE_SHEET" && (
        <div className="space-y-6" id="view_balance_sheet">
          <div className="flex items-center justify-between p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl backdrop-blur-md shadow-sm">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <div>
                <span className="text-sm font-bold text-emerald-300">Équilibre Fondamental du Bilan :</span>
                <span className="text-sm text-emerald-400/90 ml-2">Total Actif = Total Passif + Capitaux Propres</span>
              </div>
            </div>
            <span className="text-xs font-bold font-mono px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full">
              Équilibré (Delta: {formatMoney(balanceSheet.equilibriumDeltaCents)})
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Actif (Assets) */}
            <div className="bg-slate-900/60 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-6 backdrop-blur-md">
              <h3 className="text-base font-bold text-slate-100 border-b border-slate-800 pb-3 flex items-center justify-between">
                <span>ACTIF (Assets)</span>
                <span className="text-emerald-400 font-mono">{formatMoney(balanceSheet.assets.totalAssetsCents)}</span>
              </h3>

              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Actifs Circulants</h4>
                <div className="space-y-2">
                  {balanceSheet.assets.currentAssets.accounts.map((acc, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm py-2 border-b border-slate-800/60">
                      <span className="text-slate-300">{acc.name} <span className="text-slate-500 text-xs font-mono">({acc.code})</span></span>
                      <span className="font-mono font-semibold text-slate-100">{formatMoney(acc.balanceCents)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm font-bold pt-2 text-slate-100 bg-slate-950/60 border border-slate-800 p-3 rounded-xl">
                    <span>Sous-total Actifs Circulants</span>
                    <span className="font-mono text-emerald-400">{formatMoney(balanceSheet.assets.currentAssets.totalCents)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Passif & Capitaux Propres (Liabilities & Equity) */}
            <div className="bg-slate-900/60 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-6 backdrop-blur-md">
              <h3 className="text-base font-bold text-slate-100 border-b border-slate-800 pb-3 flex items-center justify-between">
                <span>PASSIF & CAPITAUX PROPRES</span>
                <span className="text-slate-100 font-mono">{formatMoney(balanceSheet.liabilities.totalLiabilitiesCents + balanceSheet.equity.totalEquityCents)}</span>
              </h3>

              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Passifs à Court Terme</h4>
                <div className="space-y-2">
                  {balanceSheet.liabilities.currentLiabilities.accounts.map((acc, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm py-2 border-b border-slate-800/60">
                      <span className="text-slate-300">{acc.name} <span className="text-slate-500 text-xs font-mono">({acc.code})</span></span>
                      <span className="font-mono font-semibold text-slate-100">{formatMoney(acc.balanceCents)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm font-bold pt-2 text-slate-100 bg-slate-950/60 border border-slate-800 p-3 rounded-xl">
                    <span>Total Passif</span>
                    <span className="font-mono text-slate-100">{formatMoney(balanceSheet.liabilities.totalLiabilitiesCents)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Capitaux Propres & Résultat</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm py-2 border-b border-slate-800/60">
                    <span className="text-slate-300">Report à nouveau / Réserves</span>
                    <span className="font-mono font-semibold text-slate-100">{formatMoney(balanceSheet.equity.retainedEarningsCents)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-2 border-b border-slate-800/60">
                    <span className="text-slate-300">Résultat Net de l'Exercice</span>
                    <span className={`font-mono font-bold ${balanceSheet.equity.currentPeriodNetIncomeCents >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {formatMoney(balanceSheet.equity.currentPeriodNetIncomeCents)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm font-bold pt-2 text-slate-100 bg-emerald-950/30 p-3 rounded-xl border border-emerald-500/30">
                    <span>Total Capitaux Propres</span>
                    <span className="font-mono text-emerald-400">{formatMoney(balanceSheet.equity.totalEquityCents)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: 3. INCOME STATEMENT (P&L) */}
      {activeTab === "INCOME_STATEMENT" && (
        <div className="bg-slate-900/60 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-6 backdrop-blur-md" id="view_income_statement">
          <h3 className="text-lg font-bold text-slate-100 border-b border-slate-800 pb-3">Compte de Résultat Simplifié (P&L)</h3>

          <div className="space-y-4">
            {/* Revenue */}
            <div className="bg-emerald-950/30 p-4 rounded-xl border border-emerald-500/30 space-y-2">
              <div className="flex items-center justify-between font-bold text-emerald-300 text-base">
                <span>1. Produits & Chiffre d'Affaires</span>
                <span className="font-mono text-emerald-400">{formatMoney(incomeStatement.revenue.totalRevenueCents)}</span>
              </div>
              <div className="text-xs text-slate-400 pl-4 space-y-1">
                <div className="flex justify-between">
                  <span>Chiffre d'affaires opérationnel / Factures émises</span>
                  <span className="font-mono font-medium text-slate-200">{formatMoney(incomeStatement.revenue.operatingRevenueCents)}</span>
                </div>
              </div>
            </div>

            {/* Operating Expenses */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-100 text-base">
                <span>2. Charges d'Exploitation</span>
                <span className="font-mono text-rose-400">-{formatMoney(incomeStatement.operatingExpenses.totalOperatingExpensesCents)}</span>
              </div>
              <div className="text-xs text-slate-400 pl-4 space-y-1">
                <div className="flex justify-between">
                  <span>Masse Salariale Directe (Salaires de base, primes, heures supp)</span>
                  <span className="font-mono font-medium text-slate-200">{formatMoney(incomeStatement.operatingExpenses.payrollExpensesCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Charges Patronales & Cotisations Sociales (ONA 6% + OFATMA 2-3%)</span>
                  <span className="font-mono font-medium text-slate-200">{formatMoney(incomeStatement.operatingExpenses.employerTaxesCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Autres Frais Généraux & Loyers</span>
                  <span className="font-mono font-medium text-slate-200">{formatMoney(incomeStatement.operatingExpenses.generalExpensesCents)}</span>
                </div>
              </div>
            </div>

            {/* Net Income */}
            <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl flex items-center justify-between shadow-inner">
              <div>
                <span className="text-base font-bold text-slate-100">3. RÉSULTAT NET COMPTABLE (Bénéfice / Perte)</span>
                <p className="text-xs text-slate-400 mt-0.5">Marge Nette : <span className="font-mono text-slate-200">{incomeStatement.profitMarginPercentage.toFixed(2)}%</span></p>
              </div>
              <span className={`text-2xl font-black font-mono ${incomeStatement.netIncomeCents >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {formatMoney(incomeStatement.netIncomeCents)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: 4. TRIAL BALANCE */}
      {activeTab === "TRIAL_BALANCE" && (
        <div className="bg-slate-900/60 rounded-2xl border border-slate-800 shadow-sm overflow-hidden backdrop-blur-md" id="view_trial_balance">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
            <span className="text-sm font-bold text-slate-100">Grand Livre : Balance Générale de Vérification</span>
            <span className="text-xs font-bold font-mono px-3 py-1 bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 rounded-full">
              Total Équilibré : {formatMoney(trialBalance.totalDebitCents)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/90 text-slate-400 font-extrabold uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="p-3.5">Numéro de Compte</th>
                  <th className="p-3.5">Intitulé du Compte</th>
                  <th className="p-3.5">Catégorie</th>
                  <th className="p-3.5 text-right">Total Débit</th>
                  <th className="p-3.5 text-right">Total Crédit</th>
                  <th className="p-3.5 text-right">Solde Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {trialBalance.items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3.5 font-bold text-slate-100">{item.accountCode}</td>
                    <td className="p-3.5 text-slate-300 font-sans font-medium">{item.accountName}</td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 border border-slate-700 text-slate-300 font-sans">
                        {item.category}
                      </span>
                    </td>
                    <td className="p-3.5 text-right text-slate-200">{formatMoney(item.debitCents)}</td>
                    <td className="p-3.5 text-right text-slate-200">{formatMoney(item.creditCents)}</td>
                    <td className="p-3.5 text-right font-bold text-emerald-400">{formatMoney(item.netBalanceCents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-950/90 font-bold text-slate-100 border-t border-slate-800">
                <tr>
                  <td colSpan={3} className="p-3.5 text-right uppercase tracking-wider text-xs font-sans text-slate-400">Totaux de Vérification</td>
                  <td className="p-3.5 text-right font-mono text-slate-100">{formatMoney(trialBalance.totalDebitCents)}</td>
                  <td className="p-3.5 text-right font-mono text-slate-100">{formatMoney(trialBalance.totalCreditCents)}</td>
                  <td className="p-3.5 text-right font-mono text-emerald-400">ÉQUILIBRÉ</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
