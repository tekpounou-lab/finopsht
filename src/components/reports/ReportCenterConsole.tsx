import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  FileText,
  TrendingUp,
  Vault,
  Users,
  ShieldCheck,
  Download,
  Calendar,
  Building2,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft,
  ArrowUpRight,
  ArrowDownLeft,
  Layers,
  Scale,
  Sparkles,
  Printer,
  FileSpreadsheet,
  Clock,
  Filter
} from "lucide-react";
import {
  LedgerTransaction,
  Branch,
  Department,
  Employee,
  ForensicLog,
  PayrollRecord
} from "../../types";
import {
  ChartOfAccountsRepository,
  ChartOfAccountItem
} from "../../repositories/accounting/ChartOfAccountsRepository";
import { CurrencyRateRepository } from "../../repositories/CurrencyRateRepository";
import { ForensicLogRepository } from "../../repositories/ForensicLogRepository";
import { PayrollRepository } from "../../repositories/PayrollRepository";
import {
  ReportCenterEngine,
  formatHaitiDateTime,
  getHaitiDateString,
  TrialBalanceReport,
  BalanceSheetReport,
  IncomeStatementReport,
  AccountStatementReport,
  CashMovementLine,
  PeriodComparisonReport,
  DailySummaryRow,
  TellerVolumeRow,
  PayrollBookRow
} from "../../services/reports/ReportCenterEngine";
import { toast } from "sonner";

interface ReportCenterConsoleProps {
  businessId: string;
  businessName?: string;
  currentRole: string;
  currentBranchId?: string;
  transactions: LedgerTransaction[];
  branches: Branch[];
  departments: Department[];
  employees: Employee[];
}

export const ReportCenterConsole: React.FC<ReportCenterConsoleProps> = ({
  businessId,
  businessName = "Entreprise FINOPS",
  currentRole,
  currentBranchId,
  transactions,
  branches,
  departments,
  employees
}) => {
  // Family Tabs
  const [activeFamily, setActiveFamily] = useState<
    "COMPTABILITE" | "TRESORERIE" | "GUICHET" | "RH_PAIE" | "AUDIT"
  >("COMPTABILITE");

  // Sub-reports
  const [comptaSub, setComptaSub] = useState<"TRIAL_BALANCE" | "BALANCE_SHEET" | "INCOME_STATEMENT" | "ACCOUNT_STATEMENT">("TRIAL_BALANCE");
  const [tresoSub, setTresoSub] = useState<"TILL_STATEMENT" | "PERIOD_COMPARISON" | "TRANSIT_FLOWS">("TILL_STATEMENT");
  const [guichetSub, setGuichetSub] = useState<"DAILY_SUMMARY" | "TELLER_VOLUMES">("DAILY_SUMMARY");
  const [rhSub, setRhSub] = useState<"PAYROLL_BOOK" | "COMMISSIONS">("PAYROLL_BOOK");

  // Global Filters
  const [selectedBranchId, setSelectedBranchId] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [displayCurrency, setDisplayCurrency] = useState<"BIDEVISE" | "CONSOLIDATED_HTG">("BIDEVISE");
  const [brhRate, setBrhRate] = useState<number>(135.0);

  // Sub-filter: Account Statement selection
  const [selectedAccountCode, setSelectedAccountCode] = useState<string>("1010");
  const [statementCurrency, setStatementCurrency] = useState<"HTG" | "USD">("HTG");

  // Sub-filter: Period comparison dates
  const [periodAStart, setPeriodAStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().split("T")[0];
  });
  const [periodAEnd, setPeriodAEnd] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [periodBStart, setPeriodBStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split("T")[0];
  });
  const [periodBEnd, setPeriodBEnd] = useState<string>(() => new Date().toISOString().split("T")[0]);

  // Data State
  const [chartAccounts, setChartAccounts] = useState<ChartOfAccountItem[]>([]);
  const [forensicLogs, setForensicLogs] = useState<ForensicLog[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // RBAC Access Evaluation
  const isOwnerOrManager = ["OWNER", "MANAGER", "SUPER_ADMIN", "ADMIN"].includes(currentRole.toUpperCase());
  const isAccountant = currentRole.toUpperCase() === "ACCOUNTANT";
  const isHeadTeller = currentRole.toUpperCase() === "HEAD_TELLER";
  const isTellerOrEmployee = ["JUNIOR_TELLER", "SENIOR_TELLER", "EMPLOYEE"].includes(currentRole.toUpperCase());
  const isAuditor = currentRole.toUpperCase() === "AUDITOR";

  // Lock branch filter for Head Teller or Tellers
  useEffect(() => {
    if (isHeadTeller && currentBranchId) {
      setSelectedBranchId(currentBranchId);
    }
  }, [isHeadTeller, currentBranchId]);

  // Load supplemental data (Chart of Accounts, FX BRH Rate, Logs, Payroll)
  const loadSupplementalData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [accs, fxGrid, logs, payRecords] = await Promise.all([
        ChartOfAccountsRepository.getAccountsByBusiness(businessId),
        CurrencyRateRepository.getTodayRatesWithFallback(businessId),
        ForensicLogRepository.listByBusiness(businessId, 40),
        PayrollRepository.getPayrollRecords(businessId)
      ]);

      setChartAccounts(accs);
      if (fxGrid.rates?.BRH) setBrhRate(fxGrid.rates.BRH);
      setForensicLogs(logs);
      setPayrollRecords(payRecords);
    } catch (err) {
      console.warn("[ReportCenterConsole] Error loading supplemental data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    loadSupplementalData();
  }, [loadSupplementalData]);

  // Filtered transactions by selected branch and RBAC
  const scopedTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (selectedBranchId !== "ALL" && tx.branchId !== selectedBranchId) {
        return false;
      }
      return true;
    });
  }, [transactions, selectedBranchId]);

  // Computed Reports
  const trialBalance = useMemo<TrialBalanceReport>(() => {
    return ReportCenterEngine.computeTrialBalance(scopedTransactions, chartAccounts, brhRate);
  }, [scopedTransactions, chartAccounts, brhRate]);

  const balanceSheet = useMemo<BalanceSheetReport>(() => {
    return ReportCenterEngine.computeBalanceSheet(
      scopedTransactions,
      chartAccounts,
      endDate,
      brhRate,
      selectedBranchId
    );
  }, [scopedTransactions, chartAccounts, endDate, brhRate, selectedBranchId]);

  const incomeStatement = useMemo<IncomeStatementReport>(() => {
    return ReportCenterEngine.computeIncomeStatement(
      scopedTransactions,
      chartAccounts,
      startDate,
      endDate,
      brhRate
    );
  }, [scopedTransactions, chartAccounts, startDate, endDate, brhRate]);

  const accountStatement = useMemo<AccountStatementReport>(() => {
    const acc = chartAccounts.find((a) => a.code === selectedAccountCode);
    return ReportCenterEngine.computeAccountStatement(
      scopedTransactions,
      selectedAccountCode,
      acc?.name || `Compte ${selectedAccountCode}`,
      startDate,
      endDate,
      statementCurrency
    );
  }, [scopedTransactions, selectedAccountCode, chartAccounts, startDate, endDate, statementCurrency]);

  const cashMovements = useMemo<CashMovementLine[]>(() => {
    return ReportCenterEngine.computeCashMovements(scopedTransactions, startDate, endDate);
  }, [scopedTransactions, startDate, endDate]);

  const periodComparison = useMemo<PeriodComparisonReport>(() => {
    return ReportCenterEngine.computePeriodComparison(
      scopedTransactions,
      periodAStart,
      periodAEnd,
      periodBStart,
      periodBEnd
    );
  }, [scopedTransactions, periodAStart, periodAEnd, periodBStart, periodBEnd]);

  const dailySummaries = useMemo<DailySummaryRow[]>(() => {
    return ReportCenterEngine.computeDailySummaries(scopedTransactions, branches, endDate);
  }, [scopedTransactions, branches, endDate]);

  const tellerVolumes = useMemo<TellerVolumeRow[]>(() => {
    return ReportCenterEngine.computeTellerVolumes(scopedTransactions, employees);
  }, [scopedTransactions, employees]);

  const payrollBook = useMemo<PayrollBookRow[]>(() => {
    return ReportCenterEngine.computePayrollBook(payrollRecords, employees);
  }, [payrollRecords, employees]);

  // Export PDF Handler
  const handleExportPdf = () => {
    try {
      if (activeFamily === "COMPTABILITE") {
        if (comptaSub === "TRIAL_BALANCE") {
          ReportCenterEngine.exportReportToPdf({
            title: "Balance de Vérification (Trial Balance)",
            subtitle: `Période du ${startDate} au ${endDate} — Consolidation bidevise HTG/USD`,
            businessName,
            referenceRateText: `1 USD = ${brhRate.toFixed(2)} HTG (Banque Centrale BRH)`,
            columns: ["Code", "Intitulé du Compte", "Débit HTG", "Crédit HTG", "Débit USD", "Crédit USD", "Solde Consolidé (HTG)"],
            rows: trialBalance.rows.map((r) => [
              r.accountCode,
              r.accountName,
              (r.debitHtgCents / 100).toLocaleString() + " HTG",
              (r.creditHtgCents / 100).toLocaleString() + " HTG",
              "$" + (r.debitUsdCents / 100).toLocaleString(),
              "$" + (r.creditUsdCents / 100).toLocaleString(),
              (r.consolidatedHtgCents / 100).toLocaleString() + " HTG"
            ]),
            fileName: "Trial_Balance"
          });
        } else if (comptaSub === "BALANCE_SHEET") {
          const allRows = [
            ...balanceSheet.assets.rows.map((r) => [r.code, r.name, "ACTIF", (r.consolidatedHtgCents / 100).toLocaleString() + " HTG"]),
            ...balanceSheet.liabilities.rows.map((r) => [r.code, r.name, "PASSIF", (r.consolidatedHtgCents / 100).toLocaleString() + " HTG"]),
            ...balanceSheet.equity.rows.map((r) => [r.code, r.name, "CAPITAUX", (r.consolidatedHtgCents / 100).toLocaleString() + " HTG"])
          ];
          ReportCenterEngine.exportReportToPdf({
            title: "Bilan Financier (Balance Sheet)",
            subtitle: `Situation patrimoniale arrêtée au ${endDate} (As of Date)`,
            businessName,
            referenceRateText: `1 USD = ${brhRate.toFixed(2)} HTG (BRH)`,
            columns: ["Code", "Intitulé", "Section Bilan", "Montant Consolidé (HTG)"],
            rows: allRows,
            fileName: "Balance_Sheet"
          });
        } else if (comptaSub === "INCOME_STATEMENT") {
          const allRows = [
            ...incomeStatement.revenueRows.map((r) => [r.code, r.name, "PRODUIT", (r.consolidatedHtgCents / 100).toLocaleString() + " HTG"]),
            ...incomeStatement.expenseRows.map((r) => [r.code, r.name, "CHARGE", (r.consolidatedHtgCents / 100).toLocaleString() + " HTG"])
          ];
          ReportCenterEngine.exportReportToPdf({
            title: "Compte de Résultat (P&L / Income Statement)",
            subtitle: `Performance économique du ${startDate} au ${endDate}`,
            businessName,
            referenceRateText: `1 USD = ${brhRate.toFixed(2)} HTG (BRH)`,
            columns: ["Code", "Intitulé", "Nature", "Montant (HTG)"],
            rows: allRows,
            fileName: "Income_Statement"
          });
        } else {
          ReportCenterEngine.exportReportToPdf({
            title: `Grand Livre Auxiliaire — Compte [${accountStatement.accountCode}]`,
            subtitle: `${accountStatement.accountName} (${accountStatement.currency}) — Du ${startDate} au ${endDate}`,
            businessName,
            columns: ["Date (UTC-5)", "Réf. Trans.", "Description", "Contrepartie", "Débit", "Crédit", "Solde Progressif"],
            rows: accountStatement.lines.map((l) => [
              formatHaitiDateTime(l.date, { includeTime: false }),
              l.transactionId.substring(0, 10),
              l.description,
              l.counterAccount,
              l.debitCents > 0 ? (l.debitCents / 100).toLocaleString() : "-",
              l.creditCents > 0 ? (l.creditCents / 100).toLocaleString() : "-",
              (l.runningBalanceCents / 100).toLocaleString()
            ]),
            fileName: `Account_Statement_${accountStatement.accountCode}`
          });
        }
      } else if (activeFamily === "TRESORERIE") {
        ReportCenterEngine.exportReportToPdf({
          title: "Relevé des Mouvements de Caisses & Coffres",
          subtitle: `Période du ${startDate} au ${endDate}`,
          businessName,
          columns: ["Date (UTC-5)", "Caisse / Coffre", "Catégorie Flux", "Entrée (Cash In)", "Sortie (Cash Out)", "Flux Net", "Devise"],
          rows: cashMovements.map((m) => [
            formatHaitiDateTime(m.date, { includeTime: false }),
            m.tillOrSafeName,
            m.categoryLabel,
            m.inflowCents > 0 ? (m.inflowCents / 100).toLocaleString() : "-",
            m.outflowCents > 0 ? (m.outflowCents / 100).toLocaleString() : "-",
            (m.netCents / 100).toLocaleString(),
            m.currency
          ]),
          fileName: "Cash_Movements"
        });
      } else if (activeFamily === "GUICHET") {
        ReportCenterEngine.exportReportToPdf({
          title: "Synthèse Journalière & Écarts de Clôture",
          subtitle: `Date d'arrêt : ${endDate}`,
          businessName,
          columns: ["Succursale", "Solde Ouv. Physique", "Encaissements", "Décaissements", "Solde Théorique", "Solde Constaté", "Écart Clôture"],
          rows: dailySummaries.map((s) => [
            s.branchName,
            (s.openingBalanceCents / 100).toLocaleString() + " HTG",
            (s.inflowCents / 100).toLocaleString() + " HTG",
            (s.outflowCents / 100).toLocaleString() + " HTG",
            (s.theoreticalBalanceCents / 100).toLocaleString() + " HTG",
            (s.actualBalanceCents / 100).toLocaleString() + " HTG",
            s.discrepancyCents === 0 ? "Équilibré (0)" : (s.discrepancyCents / 100).toLocaleString() + " HTG"
          ]),
          fileName: "Daily_Summary"
        });
      } else if (activeFamily === "RH_PAIE") {
        ReportCenterEngine.exportReportToPdf({
          title: "Livre et Registre de Paie Légal (Haïti)",
          subtitle: `Déductions légales obligatoires : ONA 6%, OFATMA 2%, CFGDCT 1%, IRI`,
          businessName,
          columns: ["Employé", "Base (HTG)", "Commissions", "Brut", "Avances", "ONA 6%", "OFATMA", "IRI", "Net Payé"],
          rows: payrollBook.map((p) => [
            p.employeeName,
            p.baseSalaryHtg.toLocaleString(),
            p.validatedCommissionsHtg.toLocaleString(),
            p.grossSalaryHtg.toLocaleString(),
            p.advancesDeductedHtg.toLocaleString(),
            p.onaDeductionHtg.toLocaleString(),
            p.ofatmaDeductionHtg.toLocaleString(),
            p.iriTaxHtg.toLocaleString(),
            p.netPaidHtg.toLocaleString()
          ]),
          fileName: "Livre_Paie_Haiti"
        });
      } else {
        ReportCenterEngine.exportReportToPdf({
          title: "Piste d'Audit & Journal de Conformité Immuable",
          subtitle: "Enregistrement cryptographique scellé par empreinte SHA-256",
          businessName,
          columns: ["Horodatage (UTC-5)", "Action", "Utilisateur", "Rôle", "Détails / Changement", "Signature Sceau"],
          rows: forensicLogs.map((l) => [
            formatHaitiDateTime(l.timestamp),
            l.action,
            l.userName || "Système",
            String(l.userRole || "-"),
            l.details || "-",
            (l.signature || "").substring(0, 16) + "..."
          ]),
          fileName: "Audit_Trail_Report"
        });
      }
      toast.success("Rapport PDF Haute Fidélité généré avec succès !");
    } catch (err: any) {
      toast.error(err?.message || "Erreur lors de la génération du rapport PDF.");
    }
  };

  // Export CSV Handler
  const handleExportCsv = () => {
    try {
      if (activeFamily === "COMPTABILITE") {
        ReportCenterEngine.exportReportToCsv({
          sheetName: "TrialBalance",
          fileName: "Trial_Balance",
          data: trialBalance.rows.map((r) => ({
            "Code Compte": r.accountCode,
            "Intitule": r.accountName,
            "Classe": r.classId,
            "Debit HTG": r.debitHtgCents / 100,
            "Credit HTG": r.creditHtgCents / 100,
            "Debit USD": r.debitUsdCents / 100,
            "Credit USD": r.creditUsdCents / 100,
            "Solde Consolide HTG": r.consolidatedHtgCents / 100
          }))
        });
      } else if (activeFamily === "TRESORERIE") {
        ReportCenterEngine.exportReportToCsv({
          sheetName: "CashMovements",
          fileName: "Cash_Movements",
          data: cashMovements.map((m) => ({
            "Date": m.date,
            "Caisse / Coffre": m.tillOrSafeName,
            "Categorie": m.categoryLabel,
            "Entree": m.inflowCents / 100,
            "Sortie": m.outflowCents / 100,
            "Net": m.netCents / 100,
            "Devise": m.currency,
            "Description": m.description
          }))
        });
      } else if (activeFamily === "RH_PAIE") {
        ReportCenterEngine.exportReportToCsv({
          sheetName: "LivreDePaie",
          fileName: "Livre_Paie_Haiti",
          data: payrollBook.map((p) => ({
            "Employe": p.employeeName,
            "Salaire Base": p.baseSalaryHtg,
            "Commissions": p.validatedCommissionsHtg,
            "Salaire Brut": p.grossSalaryHtg,
            "Avances Deduites": p.advancesDeductedHtg,
            "ONA 6%": p.onaDeductionHtg,
            "OFATMA 2%": p.ofatmaDeductionHtg,
            "CFGDCT 1%": p.cfgdctDeductionHtg,
            "IRI": p.iriTaxHtg,
            "Net Paye": p.netPaidHtg
          }))
        });
      } else {
        ReportCenterEngine.exportReportToCsv({
          sheetName: "ForensicLogs",
          fileName: "Forensic_Logs",
          data: forensicLogs.map((l) => ({
            "Timestamp UTC-5": formatHaitiDateTime(l.timestamp),
            "Action": l.action,
            "Utilisateur": l.userName,
            "Role": l.userRole,
            "Details": l.details,
            "Signature": l.signature
          }))
        });
      }
      toast.success("Fichier CSV / Excel exporté avec succès !");
    } catch (err: any) {
      toast.error(err?.message || "Erreur d'export CSV.");
    }
  };

  return (
    <div className="space-y-6 text-slate-100 font-sans">
      {/* HEADER BANNER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-2xl relative overflow-hidden">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-gradient-to-br from-cyan-500/20 to-teal-500/10 border border-cyan-500/30 text-cyan-400 rounded-2xl shadow-lg shadow-cyan-500/10">
            <FileText className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight">
                Centre des Rapports FINOPS
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                Pôle Décisionnel & Réglementaire
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Grand Livre, Flux de Trésorerie, Performance Guichet, Paie Haïtienne (ONA/OFATMA/IRI) & Piste d'Audit immuable.
            </p>
          </div>
        </div>

        {/* Global Action Bar */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* BRH Rate Badge */}
          <div className="bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Taux BRH :</span>
            <span className="font-mono font-bold text-emerald-400 notranslate">
              1 USD = {brhRate.toFixed(2)} HTG
            </span>
          </div>

          <button
            onClick={loadSupplementalData}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition border border-slate-700 cursor-pointer"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-cyan-400" : ""}`} />
          </button>

          <button
            onClick={handleExportPdf}
            className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-slate-950 font-bold text-xs rounded-xl transition flex items-center gap-2 shadow-lg shadow-cyan-600/20 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Export PDF Haute Fidélité</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl transition flex items-center gap-2 border border-slate-700 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Export Excel / CSV</span>
          </button>
        </div>
      </div>

      {/* 5 MAIN FAMILIES NAVIGATION TABS */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-slate-900/70 p-2 rounded-2xl border border-slate-800">
        <button
          onClick={() => setActiveFamily("COMPTABILITE")}
          className={`px-4 py-3 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeFamily === "COMPTABILITE"
              ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent"
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>1. Comptabilité Générale</span>
        </button>

        <button
          onClick={() => setActiveFamily("TRESORERIE")}
          className={`px-4 py-3 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeFamily === "TRESORERIE"
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent"
          }`}
        >
          <Vault className="w-4 h-4" />
          <span>2. Trésorerie & Caisses</span>
        </button>

        <button
          onClick={() => setActiveFamily("GUICHET")}
          className={`px-4 py-3 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeFamily === "GUICHET"
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>3. Guichet & Performance</span>
        </button>

        <button
          onClick={() => setActiveFamily("RH_PAIE")}
          className={`px-4 py-3 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeFamily === "RH_PAIE"
              ? "bg-purple-500/20 text-purple-400 border border-purple-500/40 shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>4. RH, Paie & Commissions</span>
        </button>

        <button
          onClick={() => setActiveFamily("AUDIT")}
          className={`px-4 py-3 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeFamily === "AUDIT"
              ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent"
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>5. Audit & Conformité</span>
        </button>
      </div>

      {/* FILTER CONTROLS BAR */}
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Branch Filter */}
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400" />
            <select
              value={selectedBranchId}
              disabled={isHeadTeller}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-medium"
            >
              <option value="ALL">Toutes les Succursales (Consolidé)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            />
            <span className="text-slate-500 text-xs">à</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          {/* Display Mode */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Affichage :</span>
            <select
              value={displayCurrency}
              onChange={(e) => setDisplayCurrency(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="BIDEVISE">Bidevise (HTG & USD côte à côte)</option>
              <option value="CONSOLIDATED_HTG">Consolidé en Gourdes (Taux BRH)</option>
            </select>
          </div>
        </div>

        {/* Haiti Time Indicator */}
        <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
          <span>Horodatage : {formatHaitiDateTime(new Date())}</span>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 1. COMPTABILITÉ GÉNÉRALE */}
      {/* ============================================================== */}
      {activeFamily === "COMPTABILITE" && (
        <div className="space-y-4">
          {/* Sub-Tabs */}
          <div className="flex gap-2 border-b border-slate-800 pb-2">
            <button
              onClick={() => setComptaSub("TRIAL_BALANCE")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                comptaSub === "TRIAL_BALANCE"
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Balance de Vérification (Trial Balance)
            </button>
            <button
              onClick={() => setComptaSub("BALANCE_SHEET")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                comptaSub === "BALANCE_SHEET"
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Bilan Financier (Balance Sheet)
            </button>
            <button
              onClick={() => setComptaSub("INCOME_STATEMENT")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                comptaSub === "INCOME_STATEMENT"
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Compte de Résultat (P&L)
            </button>
            <button
              onClick={() => setComptaSub("ACCOUNT_STATEMENT")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                comptaSub === "ACCOUNT_STATEMENT"
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Relevé de Compte Auxiliaire (GL Statement)
            </button>
          </div>

          {/* Sub-view: Trial Balance */}
          {comptaSub === "TRIAL_BALANCE" && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Scale className="w-4 h-4 text-cyan-400" />
                    <span>Balance Générale des Comptes (Classes 1 à 7)</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Contrôle strict de l'équilibre Débit = Crédit en bidevise.
                  </p>
                </div>
                <span
                  className={`text-xs font-bold font-mono px-3 py-1 rounded-full border ${
                    trialBalance.isBalanced
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                  }`}
                >
                  {trialBalance.isBalanced ? "ÉQUILIBRE VALIDÉ (Débit = Crédit)" : `ÉCART : ${(trialBalance.deltaHtgCents / 100).toLocaleString()} HTG`}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                      <th className="p-3">Code</th>
                      <th className="p-3">Intitulé</th>
                      <th className="p-3 text-right">Débit (HTG)</th>
                      <th className="p-3 text-right">Crédit (HTG)</th>
                      <th className="p-3 text-right">Débit (USD)</th>
                      <th className="p-3 text-right">Crédit (USD)</th>
                      <th className="p-3 text-right">Solde Consolidé (HTG)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                    {trialBalance.rows.map((r) => (
                      <tr key={r.accountCode} className="hover:bg-slate-800/40">
                        <td className="p-3 font-bold text-cyan-400">{r.accountCode}</td>
                        <td className="p-3 font-sans text-slate-200">{r.accountName}</td>
                        <td className="p-3 text-right text-slate-300 notranslate">
                          {(r.debitHtgCents / 100).toLocaleString()} HTG
                        </td>
                        <td className="p-3 text-right text-slate-300 notranslate">
                          {(r.creditHtgCents / 100).toLocaleString()} HTG
                        </td>
                        <td className="p-3 text-right text-slate-300 notranslate">
                          ${(r.debitUsdCents / 100).toLocaleString()}
                        </td>
                        <td className="p-3 text-right text-slate-300 notranslate">
                          ${(r.creditUsdCents / 100).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-bold text-emerald-400 notranslate">
                          {(r.consolidatedHtgCents / 100).toLocaleString()} HTG
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-950 font-bold border-t border-slate-700 text-xs font-mono">
                      <td colSpan={2} className="p-3 text-slate-200 uppercase font-sans">
                        Totaux Généraux
                      </td>
                      <td className="p-3 text-right text-emerald-400 notranslate">
                        {(trialBalance.totalDebitHtgCents / 100).toLocaleString()} HTG
                      </td>
                      <td className="p-3 text-right text-emerald-400 notranslate">
                        {(trialBalance.totalCreditHtgCents / 100).toLocaleString()} HTG
                      </td>
                      <td className="p-3 text-right text-cyan-400 notranslate">
                        ${(trialBalance.totalDebitUsdCents / 100).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-cyan-400 notranslate">
                        ${(trialBalance.totalCreditUsdCents / 100).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-emerald-400 notranslate">
                        {(trialBalance.totalConsolidatedHtgCents / 100).toLocaleString()} HTG
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Sub-view: Balance Sheet */}
          {comptaSub === "BALANCE_SHEET" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Assets (Actifs) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h4 className="text-sm font-bold text-emerald-400 uppercase">Actifs (Classe 1)</h4>
                  <span className="text-sm font-mono font-bold text-white notranslate">
                    {(balanceSheet.assets.totalConsolidatedHtgCents / 100).toLocaleString()} HTG
                  </span>
                </div>
                <div className="space-y-2">
                  {balanceSheet.assets.rows.map((r) => (
                    <div key={r.code} className="flex justify-between text-xs py-1 border-b border-slate-800/40 font-mono">
                      <span className="text-slate-300 font-sans">
                        <strong className="text-emerald-400 mr-2">{r.code}</strong> {r.name}
                      </span>
                      <span className="font-bold text-slate-200 notranslate">
                        {(r.consolidatedHtgCents / 100).toLocaleString()} HTG
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Liabilities & Equity (Passifs & Capitaux) */}
              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <h4 className="text-sm font-bold text-cyan-400 uppercase">Passifs (Classe 2)</h4>
                    <span className="text-sm font-mono font-bold text-white notranslate">
                      {(balanceSheet.liabilities.totalConsolidatedHtgCents / 100).toLocaleString()} HTG
                    </span>
                  </div>
                  <div className="space-y-2">
                    {balanceSheet.liabilities.rows.map((r) => (
                      <div key={r.code} className="flex justify-between text-xs py-1 border-b border-slate-800/40 font-mono">
                        <span className="text-slate-300 font-sans">
                          <strong className="text-cyan-400 mr-2">{r.code}</strong> {r.name}
                        </span>
                        <span className="font-bold text-slate-200 notranslate">
                          {(r.consolidatedHtgCents / 100).toLocaleString()} HTG
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <h4 className="text-sm font-bold text-purple-400 uppercase">Capitaux Propres & Résultat (Classe 3)</h4>
                    <span className="text-sm font-mono font-bold text-white notranslate">
                      {(balanceSheet.equity.totalConsolidatedHtgCents / 100).toLocaleString()} HTG
                    </span>
                  </div>
                  <div className="space-y-2">
                    {balanceSheet.equity.rows.map((r) => (
                      <div key={r.code} className="flex justify-between text-xs py-1 border-b border-slate-800/40 font-mono">
                        <span className="text-slate-300 font-sans">
                          <strong className="text-purple-400 mr-2">{r.code}</strong> {r.name}
                        </span>
                        <span className="font-bold text-slate-200 notranslate">
                          {(r.consolidatedHtgCents / 100).toLocaleString()} HTG
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs py-1 font-mono font-bold bg-purple-500/10 p-2 rounded-lg text-purple-300">
                      <span>Résultat Net de l'Exercice (P&L)</span>
                      <span className="notranslate">
                        {(balanceSheet.equity.currentPeriodIncomeHtgCents / 100).toLocaleString()} HTG
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sub-view: Income Statement */}
          {comptaSub === "INCOME_STATEMENT" && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white uppercase">
                  Compte de Résultat (P&L) du {startDate} au {endDate}
                </h3>
                <div className="text-xs font-mono">
                  Résultat Net :{" "}
                  <strong
                    className={`text-sm ${
                      incomeStatement.netIncomeHtgCents >= 0 ? "text-emerald-400" : "text-rose-400"
                    } notranslate`}
                  >
                    {(incomeStatement.netIncomeHtgCents / 100).toLocaleString()} HTG
                  </strong>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase text-emerald-400">
                    Produits d'Exploitation (Classes 4 & 7)
                  </h4>
                  {incomeStatement.revenueRows.map((r) => (
                    <div key={r.code} className="flex justify-between text-xs py-1 border-b border-slate-800/40 font-mono">
                      <span>{r.code} - {r.name}</span>
                      <span className="font-bold text-emerald-400 notranslate">
                        {(r.consolidatedHtgCents / 100).toLocaleString()} HTG
                      </span>
                    </div>
                  ))}
                  <div className="pt-2 flex justify-between font-bold text-xs text-white">
                    <span>Total Produits</span>
                    <span className="notranslate">
                      {(incomeStatement.totalRevenueHtgCents / 100).toLocaleString()} HTG
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase text-rose-400">
                    Charges d'Exploitation (Classes 5 & 6)
                  </h4>
                  {incomeStatement.expenseRows.map((r) => (
                    <div key={r.code} className="flex justify-between text-xs py-1 border-b border-slate-800/40 font-mono">
                      <span>{r.code} - {r.name}</span>
                      <span className="font-bold text-rose-400 notranslate">
                        {(r.consolidatedHtgCents / 100).toLocaleString()} HTG
                      </span>
                    </div>
                  ))}
                  <div className="pt-2 flex justify-between font-bold text-xs text-white">
                    <span>Total Charges</span>
                    <span className="notranslate">
                      {(incomeStatement.totalExpenseHtgCents / 100).toLocaleString()} HTG
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sub-view: Account Statement */}
          {comptaSub === "ACCOUNT_STATEMENT" && (
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <label className="text-xs font-bold text-slate-300">Compte Auxiliaire :</label>
                  <select
                    value={selectedAccountCode}
                    onChange={(e) => setSelectedAccountCode(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200"
                  >
                    {chartAccounts
                      .filter((a) => a.type === "POSTING")
                      .map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} - {a.name}
                        </option>
                      ))}
                  </select>

                  <select
                    value={statementCurrency}
                    onChange={(e) => setStatementCurrency(e.target.value as any)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200"
                  >
                    <option value="HTG">HTG (Gourdes)</option>
                    <option value="USD">USD (Dollars)</option>
                  </select>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono">
                  <div>
                    <span className="text-slate-400">Solde Ouverture : </span>
                    <strong className="text-slate-100 notranslate">
                      {(accountStatement.openingBalanceCents / 100).toLocaleString()} {statementCurrency}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Solde Clôture : </span>
                    <strong className="text-emerald-400 notranslate">
                      {(accountStatement.closingBalanceCents / 100).toLocaleString()} {statementCurrency}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-950/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                      <th className="p-3">Date (UTC-5)</th>
                      <th className="p-3">Description</th>
                      <th className="p-3">Contrepartie</th>
                      <th className="p-3 text-right">Débit</th>
                      <th className="p-3 text-right">Crédit</th>
                      <th className="p-3 text-right">Solde Progressif</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {accountStatement.lines.map((l) => (
                      <tr key={l.transactionId} className="hover:bg-slate-800/40">
                        <td className="p-3 text-slate-400">
                          {formatHaitiDateTime(l.date, { includeTime: false })}
                        </td>
                        <td className="p-3 font-sans text-slate-200">{l.description}</td>
                        <td className="p-3 text-slate-400">{l.counterAccount}</td>
                        <td className="p-3 text-right text-emerald-400 notranslate">
                          {l.debitCents > 0 ? (l.debitCents / 100).toLocaleString() : "-"}
                        </td>
                        <td className="p-3 text-right text-rose-400 notranslate">
                          {l.creditCents > 0 ? (l.creditCents / 100).toLocaleString() : "-"}
                        </td>
                        <td className="p-3 text-right font-bold text-cyan-400 notranslate">
                          {(l.runningBalanceCents / 100).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {accountStatement.lines.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-500 font-sans">
                          Aucune écriture sur ce compte pour la période spécifiée.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. TRÉSORERIE & CAISSES */}
      {/* ============================================================== */}
      {activeFamily === "TRESORERIE" && (
        <div className="space-y-4">
          <div className="flex gap-2 border-b border-slate-800 pb-2">
            <button
              onClick={() => setTresoSub("TILL_STATEMENT")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                tresoSub === "TILL_STATEMENT"
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Relevé de Caisse & Coffre
            </button>
            <button
              onClick={() => setTresoSub("PERIOD_COMPARISON")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                tresoSub === "PERIOD_COMPARISON"
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Module de Comparaison de Périodes
            </button>
          </div>

          {tresoSub === "TILL_STATEMENT" && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-slate-950/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <th className="p-3">Date (UTC-5)</th>
                    <th className="p-3">Tiroir / Coffre</th>
                    <th className="p-3">Catégorie de Flux</th>
                    <th className="p-3 text-right">Cash In</th>
                    <th className="p-3 text-right">Cash Out</th>
                    <th className="p-3 text-right">Flux Net</th>
                    <th className="p-3">Devise</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {cashMovements.map((m) => (
                    <tr key={m.transactionId} className="hover:bg-slate-800/40">
                      <td className="p-3 text-slate-400">
                        {formatHaitiDateTime(m.date, { includeTime: false })}
                      </td>
                      <td className="p-3 font-sans font-bold text-white">{m.tillOrSafeName}</td>
                      <td className="p-3 font-sans">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                          {m.categoryLabel}
                        </span>
                      </td>
                      <td className="p-3 text-right text-emerald-400 font-bold notranslate">
                        {m.inflowCents > 0 ? (m.inflowCents / 100).toLocaleString() : "-"}
                      </td>
                      <td className="p-3 text-right text-amber-400 font-bold notranslate">
                        {m.outflowCents > 0 ? (m.outflowCents / 100).toLocaleString() : "-"}
                      </td>
                      <td className="p-3 text-right font-bold text-white notranslate">
                        {(m.netCents / 100).toLocaleString()}
                      </td>
                      <td className="p-3 font-bold text-cyan-400">{m.currency}</td>
                    </tr>
                  ))}
                  {cashMovements.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-500 font-sans">
                        Aucun mouvement de trésorerie sur cette période.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tresoSub === "PERIOD_COMPARISON" && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-white uppercase">
                Comparaison de Flux de Liquidités Côte à Côte
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Période A : {periodComparison.periodALabel}</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-emerald-400 notranslate">
                    {(periodComparison.periodANetCents / 100).toLocaleString()} HTG
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Encaissements: {(periodComparison.periodAInflowsCents / 100).toLocaleString()} | Décaissements: {(periodComparison.periodAOutflowsCents / 100).toLocaleString()}
                  </p>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Période B : {periodComparison.periodBLabel}</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-cyan-400 notranslate">
                    {(periodComparison.periodBNetCents / 100).toLocaleString()} HTG
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Encaissements: {(periodComparison.periodBInflowsCents / 100).toLocaleString()} | Décaissements: {(periodComparison.periodBOutflowsCents / 100).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400">Variation Nette de Volume :</span>
                  <div className="text-lg font-bold font-mono text-white notranslate">
                    {(periodComparison.deltaNetCents / 100).toLocaleString()} HTG ({periodComparison.percentageChange > 0 ? `+${periodComparison.percentageChange}` : periodComparison.percentageChange}%)
                  </div>
                </div>
                <span
                  className={`text-xs px-3 py-1 rounded-full font-bold uppercase ${
                    periodComparison.percentageChange >= 0
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                      : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                  }`}
                >
                  {periodComparison.percentageChange >= 0 ? "Hausse d'Activité" : "Baisse d'Activité"}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. GUICHET & PERFORMANCE */}
      {/* ============================================================== */}
      {activeFamily === "GUICHET" && (
        <div className="space-y-4">
          <div className="flex gap-2 border-b border-slate-800 pb-2">
            <button
              onClick={() => setGuichetSub("DAILY_SUMMARY")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                guichetSub === "DAILY_SUMMARY"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Synthèse Journalière & Écarts de Clôture
            </button>
            <button
              onClick={() => setGuichetSub("TELLER_VOLUMES")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                guichetSub === "TELLER_VOLUMES"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Volumes & Performance Caissiers
            </button>
          </div>

          {guichetSub === "DAILY_SUMMARY" && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-slate-950/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <th className="p-3">Succursale</th>
                    <th className="p-3 text-right">Solde Ouverture</th>
                    <th className="p-3 text-right">Encaissements</th>
                    <th className="p-3 text-right">Décaissements</th>
                    <th className="p-3 text-right">Solde Théorique</th>
                    <th className="p-3 text-right">Solde Physique</th>
                    <th className="p-3 text-right">Écart Clôture</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {dailySummaries.map((s) => (
                    <tr key={s.branchId} className="hover:bg-slate-800/40">
                      <td className="p-3 font-sans font-bold text-white">{s.branchName}</td>
                      <td className="p-3 text-right text-slate-400 notranslate">
                        {(s.openingBalanceCents / 100).toLocaleString()} HTG
                      </td>
                      <td className="p-3 text-right text-emerald-400 notranslate">
                        {(s.inflowCents / 100).toLocaleString()} HTG
                      </td>
                      <td className="p-3 text-right text-amber-400 notranslate">
                        {(s.outflowCents / 100).toLocaleString()} HTG
                      </td>
                      <td className="p-3 text-right text-slate-200 notranslate">
                        {(s.theoreticalBalanceCents / 100).toLocaleString()} HTG
                      </td>
                      <td className="p-3 text-right font-bold text-white notranslate">
                        {(s.actualBalanceCents / 100).toLocaleString()} HTG
                      </td>
                      <td className="p-3 text-right font-bold notranslate">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] ${
                            s.discrepancyCents === 0
                              ? "text-emerald-400 bg-emerald-500/10"
                              : s.discrepancyCents > 0
                              ? "text-amber-400 bg-amber-500/10"
                              : "text-rose-400 bg-rose-500/10"
                          }`}
                        >
                          {s.discrepancyCents === 0
                            ? "0 (Équilibré)"
                            : `${(s.discrepancyCents / 100).toLocaleString()} HTG (${s.discrepancyStatus})`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {guichetSub === "TELLER_VOLUMES" && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-slate-950/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <th className="p-3">Collaborateur</th>
                    <th className="p-3">Rôle RH</th>
                    <th className="p-3 text-center">Transactions Traitées</th>
                    <th className="p-3 text-right">Volume HTG</th>
                    <th className="p-3 text-right">Volume USD</th>
                    <th className="p-3 text-right">Commissions Estimées (2%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {tellerVolumes.map((tv) => (
                    <tr key={tv.employeeId} className="hover:bg-slate-800/40">
                      <td className="p-3 font-sans font-bold text-white">{tv.employeeName}</td>
                      <td className="p-3 font-sans text-slate-400">{tv.role}</td>
                      <td className="p-3 text-center font-bold text-cyan-400">{tv.transactionCount}</td>
                      <td className="p-3 text-right text-emerald-400 notranslate">
                        {(tv.totalVolumeHtgCents / 100).toLocaleString()} HTG
                      </td>
                      <td className="p-3 text-right text-cyan-400 notranslate">
                        ${(tv.totalVolumeUsdCents / 100).toLocaleString()}
                      </td>
                      <td className="p-3 text-right font-bold text-purple-400 notranslate">
                        {(tv.estimatedCommissionsHtgCents / 100).toLocaleString()} HTG
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 4. RH, PAIE & COMMISSIONS */}
      {/* ============================================================== */}
      {activeFamily === "RH_PAIE" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-400" />
              <span>Livre et Registre de Paie Légal (Haïti — ONA, OFATMA, CFGDCT, IRI)</span>
            </h3>
            <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
              Conforme Code du Travail Haïtien
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-slate-950/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <th className="p-3">Employé</th>
                  <th className="p-3 text-right">Salaire Base</th>
                  <th className="p-3 text-right">Commissions</th>
                  <th className="p-3 text-right">Salaire Brut</th>
                  <th className="p-3 text-right">Avances</th>
                  <th className="p-3 text-right">ONA (6%)</th>
                  <th className="p-3 text-right">OFATMA (2%)</th>
                  <th className="p-3 text-right">IRI (Impôt)</th>
                  <th className="p-3 text-right">Net Payé (HTG)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {payrollBook.map((p) => (
                  <tr key={p.employeeId} className="hover:bg-slate-800/40">
                    <td className="p-3 font-sans font-bold text-white">{p.employeeName}</td>
                    <td className="p-3 text-right text-slate-300 notranslate">
                      {p.baseSalaryHtg.toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-purple-400 notranslate">
                      {p.validatedCommissionsHtg.toLocaleString()}
                    </td>
                    <td className="p-3 text-right font-bold text-slate-100 notranslate">
                      {p.grossSalaryHtg.toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-rose-400 notranslate">
                      {p.advancesDeductedHtg.toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-amber-400 notranslate">
                      {p.onaDeductionHtg.toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-amber-400 notranslate">
                      {p.ofatmaDeductionHtg.toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-rose-400 notranslate">
                      {p.iriTaxHtg.toLocaleString()}
                    </td>
                    <td className="p-3 text-right font-bold text-emerald-400 notranslate">
                      {p.netPaidHtg.toLocaleString()} HTG
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 5. AUDIT & CONFORMITÉ */}
      {/* ============================================================== */}
      {activeFamily === "AUDIT" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-rose-400" />
              <span>Piste d'Audit & Gouvernance Immuable (Horodatage Haiti UTC-5)</span>
            </h3>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Scellé par Sceau Cryptographique
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-slate-950/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <th className="p-3">Horodatage (UTC-5 Haïti)</th>
                  <th className="p-3">Action Système</th>
                  <th className="p-3">Acteur & Rôle</th>
                  <th className="p-3">Détails Opérationnels</th>
                  <th className="p-3">Sceau Signature</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {forensicLogs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-800/40">
                    <td className="p-3 text-slate-400 whitespace-nowrap">
                      {formatHaitiDateTime(l.timestamp)}
                    </td>
                    <td className="p-3 font-sans font-bold text-cyan-400">{l.action}</td>
                    <td className="p-3 font-sans text-slate-300">
                      {l.userName} ({String(l.userRole)})
                    </td>
                    <td className="p-3 font-sans text-slate-300">{l.details}</td>
                    <td className="p-3 text-slate-500 text-[10px] font-mono">
                      {(l.signature || "").substring(0, 16)}...
                    </td>
                  </tr>
                ))}
                {forensicLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-500 font-sans">
                      Aucun journal d'audit enregistré pour ce tenant.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
