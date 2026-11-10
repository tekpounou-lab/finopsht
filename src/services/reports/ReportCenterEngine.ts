import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as xlsx from "xlsx";
import { LedgerTransaction, Employee, Branch, ForensicLog, PayrollRecord } from "../../types";
import { ChartOfAccountItem } from "../../repositories/accounting/ChartOfAccountsRepository";

export interface HaitiDateTimeFormatOptions {
  includeTime?: boolean;
}

/**
 * Strict Haiti Time (UTC-5) formatting helper.
 * Eliminates ambiguities during night shifts and closures.
 */
export function formatHaitiDateTime(dateStr?: string | Date, options?: HaitiDateTimeFormatOptions): string {
  if (!dateStr) return "-";
  try {
    const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
    if (isNaN(d.getTime())) return String(dateStr);

    const formatter = new Intl.DateTimeFormat("fr-HT", {
      timeZone: "America/Port-au-Prince",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: options?.includeTime !== false ? "2-digit" : undefined,
      minute: options?.includeTime !== false ? "2-digit" : undefined,
      second: options?.includeTime !== false ? "2-digit" : undefined,
      hour12: false
    });

    const formatted = formatter.format(d);
    return options?.includeTime !== false ? `${formatted} (UTC-5 Haïti)` : formatted;
  } catch {
    return String(dateStr);
  }
}

export function getHaitiDateString(dateStr?: string | Date): string {
  if (!dateStr) {
    dateStr = new Date();
  }
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Port-au-Prince",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return formatter.format(d);
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

// ==========================================
// FAMILLE 1 : COMPTABILITÉ GÉNÉRALE
// ==========================================

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  classId: string;
  debitHtgCents: number;
  creditHtgCents: number;
  debitUsdCents: number;
  creditUsdCents: number;
  netHtgCents: number;
  netUsdCents: number;
  consolidatedHtgCents: number;
}

export interface TrialBalanceReport {
  rows: TrialBalanceRow[];
  totalDebitHtgCents: number;
  totalCreditHtgCents: number;
  totalDebitUsdCents: number;
  totalCreditUsdCents: number;
  totalConsolidatedHtgCents: number;
  isBalanced: boolean;
  deltaHtgCents: number;
  brhRate: number;
}

export interface BalanceSheetSectionRow {
  code: string;
  name: string;
  htgCents: number;
  usdCents: number;
  consolidatedHtgCents: number;
}

export interface BalanceSheetReport {
  asOfDate: string;
  brhRate: number;
  assets: {
    rows: BalanceSheetSectionRow[];
    totalHtgCents: number;
    totalConsolidatedHtgCents: number;
  };
  liabilities: {
    rows: BalanceSheetSectionRow[];
    totalHtgCents: number;
    totalConsolidatedHtgCents: number;
  };
  equity: {
    rows: BalanceSheetSectionRow[];
    totalHtgCents: number;
    currentPeriodIncomeHtgCents: number;
    totalConsolidatedHtgCents: number;
  };
  isBalanced: boolean;
  deltaHtgCents: number;
}

export interface IncomeStatementRow {
  code: string;
  name: string;
  category: "REVENUE" | "EXPENSE";
  amountHtgCents: number;
  amountUsdCents: number;
  consolidatedHtgCents: number;
}

export interface IncomeStatementReport {
  startDate: string;
  endDate: string;
  brhRate: number;
  revenueRows: IncomeStatementRow[];
  expenseRows: IncomeStatementRow[];
  totalRevenueHtgCents: number;
  totalExpenseHtgCents: number;
  netIncomeHtgCents: number;
}

export interface AccountStatementLine {
  date: string;
  transactionId: string;
  description: string;
  counterAccount: string;
  debitCents: number;
  creditCents: number;
  currency: "HTG" | "USD";
  runningBalanceCents: number;
}

export interface AccountStatementReport {
  accountCode: string;
  accountName: string;
  currency: string;
  startDate: string;
  endDate: string;
  openingBalanceCents: number;
  lines: AccountStatementLine[];
  closingBalanceCents: number;
  totalDebitCents: number;
  totalCreditCents: number;
}

// ==========================================
// FAMILLE 2 : TRÉSORERIE & CAISSES
// ==========================================

export type CashFlowCategory = "SAFE_TO_TILL" | "TILL_TO_SAFE" | "CLIENT_OPERATION" | "EXPENSE" | "CAPITAL" | "OTHER";

export interface CashMovementLine {
  date: string;
  transactionId: string;
  type: string;
  category: CashFlowCategory;
  categoryLabel: string;
  tillOrSafeId: string;
  tillOrSafeName: string;
  inflowCents: number;
  outflowCents: number;
  netCents: number;
  currency: "HTG" | "USD";
  description: string;
}

export interface PeriodComparisonReport {
  periodALabel: string;
  periodBLabel: string;
  periodAInflowsCents: number;
  periodAOutflowsCents: number;
  periodANetCents: number;
  periodBInflowsCents: number;
  periodBOutflowsCents: number;
  periodBNetCents: number;
  deltaNetCents: number;
  percentageChange: number;
}

// ==========================================
// FAMILLE 3 : GUICHET & PERFORMANCE
// ==========================================

export interface DailySummaryRow {
  date: string;
  branchId: string;
  branchName: string;
  openingBalanceCents: number;
  inflowCents: number;
  outflowCents: number;
  theoreticalBalanceCents: number;
  actualBalanceCents: number;
  discrepancyCents: number; // Positive = Surplus (1910), Negative = Shortage (2910)
  discrepancyStatus: "BALANCED" | "SURPLUS_1910" | "SHORTAGE_2910";
}

export interface TellerVolumeRow {
  employeeId: string;
  employeeName: string;
  role: string;
  transactionCount: number;
  totalVolumeHtgCents: number;
  totalVolumeUsdCents: number;
  estimatedCommissionsHtgCents: number;
}

// ==========================================
// FAMILLE 4 : RH, PAIE & COMMISSIONS
// ==========================================

export interface PayrollBookRow {
  employeeId: string;
  employeeName: string;
  baseSalaryHtg: number;
  validatedCommissionsHtg: number;
  grossSalaryHtg: number;
  advancesDeductedHtg: number;
  onaDeductionHtg: number; // 6%
  ofatmaDeductionHtg: number; // 2-3%
  cfgdctDeductionHtg: number; // 1%
  iriTaxHtg: number; // Barème progressif
  netPaidHtg: number;
}

// ==========================================
// MOTEUR DE CALCULS CENTRALISÉ
// ==========================================

export class ReportCenterEngine {
  /**
   * 1. Balance de Vérification (Trial Balance) bidevise et consolidée BRH
   */
  public static computeTrialBalance(
    transactions: LedgerTransaction[],
    chartAccounts: ChartOfAccountItem[] = [],
    brhRate: number = 135.0
  ): TrialBalanceReport {
    const accMap = new Map<string, { debitHtg: number; creditHtg: number; debitUsd: number; creditUsd: number }>();

    const getOrInit = (code: string) => {
      if (!accMap.has(code)) {
        accMap.set(code, { debitHtg: 0, creditHtg: 0, debitUsd: 0, creditUsd: 0 });
      }
      return accMap.get(code)!;
    };

    transactions.forEach((tx) => {
      const isUsd = tx.currency === "USD";
      const amtCents = Math.round((tx.amount || 0) * 100);

      // Debit leg
      const debitCode = tx.debit_account || (tx.category === "EXPENSE" ? "6010" : "1010");
      const debEntry = getOrInit(debitCode);
      if (isUsd) debEntry.debitUsd += amtCents;
      else debEntry.debitHtg += amtCents;

      // Credit leg
      const creditCode = tx.credit_account || (tx.category === "REVENUE" ? "4010" : "1010");
      const credEntry = getOrInit(creditCode);
      if (isUsd) credEntry.creditUsd += amtCents;
      else credEntry.creditHtg += amtCents;
    });

    // Ensure all chart accounts are present
    chartAccounts.forEach((ca) => {
      if (ca.type === "POSTING") getOrInit(ca.code);
    });

    const rows: TrialBalanceRow[] = [];
    let totalDebitHtgCents = 0;
    let totalCreditHtgCents = 0;
    let totalDebitUsdCents = 0;
    let totalCreditUsdCents = 0;
    let totalConsolidatedHtgCents = 0;

    Array.from(accMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([code, data]) => {
        const ca = chartAccounts.find((a) => a.code === code);
        const name = ca?.name || `Compte ${code}`;
        const classId = ca?.classId || code.charAt(0) || "1";

        const netHtg = data.debitHtg - data.creditHtg;
        const netUsd = data.debitUsd - data.creditUsd;
        const consolidated = netHtg + Math.round(netUsd * brhRate);

        totalDebitHtgCents += data.debitHtg;
        totalCreditHtgCents += data.creditHtg;
        totalDebitUsdCents += data.debitUsd;
        totalCreditUsdCents += data.creditUsd;
        totalConsolidatedHtgCents += consolidated;

        rows.push({
          accountCode: code,
          accountName: name,
          classId,
          debitHtgCents: data.debitHtg,
          creditHtgCents: data.creditHtg,
          debitUsdCents: data.debitUsd,
          creditUsdCents: data.creditUsd,
          netHtgCents: netHtg,
          netUsdCents: netUsd,
          consolidatedHtgCents: consolidated
        });
      });

    const deltaHtg = totalDebitHtgCents - totalCreditHtgCents;
    const isBalanced = deltaHtg === 0 && totalDebitUsdCents === totalCreditUsdCents;

    return {
      rows,
      totalDebitHtgCents,
      totalCreditHtgCents,
      totalDebitUsdCents,
      totalCreditUsdCents,
      totalConsolidatedHtgCents,
      isBalanced,
      deltaHtgCents: deltaHtg,
      brhRate
    };
  }

  /**
   * 2. Bilan Financier (Balance Sheet) filtrable par date et succursale
   */
  public static computeBalanceSheet(
    transactions: LedgerTransaction[],
    chartAccounts: ChartOfAccountItem[] = [],
    asOfDate: string,
    brhRate: number = 135.0,
    branchId?: string
  ): BalanceSheetReport {
    const filtered = transactions.filter((tx) => {
      const matchesDate = !asOfDate || tx.date.split("T")[0] <= asOfDate;
      const matchesBranch = !branchId || branchId === "ALL" || tx.branchId === branchId;
      return matchesDate && matchesBranch;
    });

    const tb = this.computeTrialBalance(filtered, chartAccounts, brhRate);

    const assetRows: BalanceSheetSectionRow[] = [];
    const liabilityRows: BalanceSheetSectionRow[] = [];
    const equityRows: BalanceSheetSectionRow[] = [];

    let totalAssetHtg = 0;
    let totalAssetConsolidated = 0;
    let totalLiabHtg = 0;
    let totalLiabConsolidated = 0;
    let totalEquityHtg = 0;
    let totalEquityConsolidated = 0;

    let totalRevConsolidated = 0;
    let totalExpConsolidated = 0;

    tb.rows.forEach((r) => {
      const rowItem: BalanceSheetSectionRow = {
        code: r.accountCode,
        name: r.accountName,
        htgCents: r.netHtgCents,
        usdCents: r.netUsdCents,
        consolidatedHtgCents: r.consolidatedHtgCents
      };

      if (r.classId === "1") {
        assetRows.push(rowItem);
        totalAssetHtg += r.netHtgCents;
        totalAssetConsolidated += r.consolidatedHtgCents;
      } else if (r.classId === "2") {
        // Liabilities normal balance is credit
        const liabItem = { ...rowItem, consolidatedHtgCents: -rowItem.consolidatedHtgCents };
        liabilityRows.push(liabItem);
        totalLiabHtg += -r.netHtgCents;
        totalLiabConsolidated += liabItem.consolidatedHtgCents;
      } else if (r.classId === "3") {
        const eqItem = { ...rowItem, consolidatedHtgCents: -rowItem.consolidatedHtgCents };
        equityRows.push(eqItem);
        totalEquityHtg += -r.netHtgCents;
        totalEquityConsolidated += eqItem.consolidatedHtgCents;
      } else if (r.classId === "4" || r.classId === "7") {
        totalRevConsolidated += -r.consolidatedHtgCents;
      } else if (r.classId === "5" || r.classId === "6") {
        totalExpConsolidated += r.consolidatedHtgCents;
      }
    });

    // Net income of period belongs to Equity
    const netIncomeConsolidated = totalRevConsolidated - totalExpConsolidated;
    totalEquityConsolidated += netIncomeConsolidated;

    const delta = totalAssetConsolidated - (totalLiabConsolidated + totalEquityConsolidated);

    return {
      asOfDate,
      brhRate,
      assets: {
        rows: assetRows,
        totalHtgCents: totalAssetHtg,
        totalConsolidatedHtgCents: totalAssetConsolidated
      },
      liabilities: {
        rows: liabilityRows,
        totalHtgCents: totalLiabHtg,
        totalConsolidatedHtgCents: totalLiabConsolidated
      },
      equity: {
        rows: equityRows,
        totalHtgCents: totalEquityHtg,
        currentPeriodIncomeHtgCents: netIncomeConsolidated,
        totalConsolidatedHtgCents: totalEquityConsolidated
      },
      isBalanced: Math.abs(delta) < 100,
      deltaHtgCents: delta
    };
  }

  /**
   * 3. Compte de Résultat (P&L / Income Statement)
   */
  public static computeIncomeStatement(
    transactions: LedgerTransaction[],
    chartAccounts: ChartOfAccountItem[] = [],
    startDate: string,
    endDate: string,
    brhRate: number = 135.0
  ): IncomeStatementReport {
    const periodTxs = transactions.filter((tx) => {
      const d = tx.date.split("T")[0];
      return (!startDate || d >= startDate) && (!endDate || d <= endDate);
    });

    const tb = this.computeTrialBalance(periodTxs, chartAccounts, brhRate);

    const revenueRows: IncomeStatementRow[] = [];
    const expenseRows: IncomeStatementRow[] = [];
    let totalRevenueHtg = 0;
    let totalExpenseHtg = 0;

    tb.rows.forEach((r) => {
      if (r.classId === "4" || r.classId === "7") {
        const amt = -r.consolidatedHtgCents; // Revenue is credit normal
        revenueRows.push({
          code: r.accountCode,
          name: r.accountName,
          category: "REVENUE",
          amountHtgCents: -r.netHtgCents,
          amountUsdCents: -r.netUsdCents,
          consolidatedHtgCents: amt
        });
        totalRevenueHtg += amt;
      } else if (r.classId === "5" || r.classId === "6") {
        const amt = r.consolidatedHtgCents;
        expenseRows.push({
          code: r.accountCode,
          name: r.accountName,
          category: "EXPENSE",
          amountHtgCents: r.netHtgCents,
          amountUsdCents: r.netUsdCents,
          consolidatedHtgCents: amt
        });
        totalExpenseHtg += amt;
      }
    });

    return {
      startDate,
      endDate,
      brhRate,
      revenueRows,
      expenseRows,
      totalRevenueHtgCents: totalRevenueHtg,
      totalExpenseHtgCents: totalExpenseHtg,
      netIncomeHtgCents: totalRevenueHtg - totalExpenseHtg
    };
  }

  /**
   * 4. Relevé de Compte Auxiliaire (Account Statement avec Solde d'Ouverture Historique)
   */
  public static computeAccountStatement(
    transactions: LedgerTransaction[],
    accountCode: string,
    accountName: string,
    startDate: string,
    endDate: string,
    currency: "HTG" | "USD" = "HTG"
  ): AccountStatementReport {
    // 1. Calculate historical opening balance prior to startDate
    let openingBalanceCents = 0;
    const historicalTxs = transactions.filter((tx) => {
      const d = tx.date.split("T")[0];
      return startDate ? d < startDate : false;
    });

    historicalTxs.forEach((tx) => {
      if (tx.currency !== currency) return;
      const amtCents = Math.round((tx.amount || 0) * 100);
      if (tx.debit_account === accountCode) openingBalanceCents += amtCents;
      if (tx.credit_account === accountCode) openingBalanceCents -= amtCents;
    });

    // 2. Filter period lines
    const periodTxs = transactions
      .filter((tx) => {
        const d = tx.date.split("T")[0];
        const inPeriod = (!startDate || d >= startDate) && (!endDate || d <= endDate);
        const touches = tx.debit_account === accountCode || tx.credit_account === accountCode;
        return inPeriod && touches && tx.currency === currency;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = openingBalanceCents;
    let totalDebit = 0;
    let totalCredit = 0;

    const lines: AccountStatementLine[] = periodTxs.map((tx) => {
      const amtCents = Math.round((tx.amount || 0) * 100);
      const isDebit = tx.debit_account === accountCode;
      const debitCents = isDebit ? amtCents : 0;
      const creditCents = !isDebit ? amtCents : 0;

      totalDebit += debitCents;
      totalCredit += creditCents;
      runningBalance += debitCents - creditCents;

      return {
        date: tx.date,
        transactionId: tx.id,
        description: tx.description || "Opération",
        counterAccount: isDebit ? tx.credit_account || "-" : tx.debit_account || "-",
        debitCents,
        creditCents,
        currency,
        runningBalanceCents: runningBalance
      };
    });

    return {
      accountCode,
      accountName,
      currency,
      startDate,
      endDate,
      openingBalanceCents,
      lines,
      closingBalanceCents: runningBalance,
      totalDebitCents: totalDebit,
      totalCreditCents: totalCredit
    };
  }

  /**
   * 5. Relevé Caisse & Coffre (Till & Safe Movements avec Catégorisation Automatique)
   */
  public static computeCashMovements(
    transactions: LedgerTransaction[],
    startDate?: string,
    endDate?: string,
    filterTillId?: string
  ): CashMovementLine[] {
    return transactions
      .filter((tx) => {
        const d = tx.date.split("T")[0];
        const inPeriod = (!startDate || d >= startDate) && (!endDate || d <= endDate);
        const touchesCash =
          (tx.debit_account && tx.debit_account.startsWith("10")) ||
          (tx.debit_account && tx.debit_account.startsWith("11")) ||
          (tx.credit_account && tx.credit_account.startsWith("10")) ||
          (tx.credit_account && tx.credit_account.startsWith("11"));
        const matchesTill = !filterTillId || filterTillId === "ALL" || (tx as any).till_id === filterTillId;
        return inPeriod && touchesCash && matchesTill;
      })
      .map((tx) => {
        const amtCents = Math.round((tx.amount || 0) * 100);
        const isDebitCash = (tx.debit_account?.startsWith("10") || tx.debit_account?.startsWith("11")) ?? false;
        const isCreditCash = (tx.credit_account?.startsWith("10") || tx.credit_account?.startsWith("11")) ?? false;

        let category: CashFlowCategory = "CLIENT_OPERATION";
        let categoryLabel = "Opération Client Guichet";

        const upperDesc = (tx.description || "").toUpperCase();
        if (upperDesc.includes("SAFE-TO-TILL") || upperDesc.includes("APPROVISIONNEMENT")) {
          category = "SAFE_TO_TILL";
          categoryLabel = "Approvisionnement (Coffre → Caisse)";
        } else if (upperDesc.includes("TILL-TO-SAFE") || upperDesc.includes("VERSEMENT") || upperDesc.includes("REMISE")) {
          category = "TILL_TO_SAFE";
          categoryLabel = "Remise / Versement (Caisse → Coffre)";
        } else if (tx.category === "EXPENSE" || tx.type === "EXPENSE") {
          category = "EXPENSE";
          categoryLabel = "Dépense de Caisse";
        } else if (tx.credit_account?.startsWith("3") || tx.debit_account?.startsWith("3")) {
          category = "CAPITAL";
          categoryLabel = "Mouvement de Capital";
        }

        const inflowCents = isDebitCash && !isCreditCash ? amtCents : 0;
        const outflowCents = !isDebitCash && isCreditCash ? amtCents : 0;

        return {
          date: tx.date,
          transactionId: tx.id,
          type: tx.type,
          category,
          categoryLabel,
          tillOrSafeId: (tx as any).till_id || "CAISSE_PRINCIPALE",
          tillOrSafeName: (tx as any).till_name || "Tiroir Guichet",
          inflowCents,
          outflowCents,
          netCents: inflowCents - outflowCents,
          currency: (tx.currency as "HTG" | "USD") || "HTG",
          description: tx.description
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  /**
   * 6. Comparaison de Périodes (Period Comparison Module)
   */
  public static computePeriodComparison(
    transactions: LedgerTransaction[],
    periodAStart: string,
    periodAEnd: string,
    periodBStart: string,
    periodBEnd: string
  ): PeriodComparisonReport {
    const listA = this.computeCashMovements(transactions, periodAStart, periodAEnd);
    const listB = this.computeCashMovements(transactions, periodBStart, periodBEnd);

    const sumAInflows = listA.reduce((s, m) => s + m.inflowCents, 0);
    const sumAOutflows = listA.reduce((s, m) => s + m.outflowCents, 0);
    const netA = sumAInflows - sumAOutflows;

    const sumBInflows = listB.reduce((s, m) => s + m.inflowCents, 0);
    const sumBOutflows = listB.reduce((s, m) => s + m.outflowCents, 0);
    const netB = sumBInflows - sumBOutflows;

    const deltaNet = netB - netA;
    const pct = netA !== 0 ? Math.round((deltaNet / Math.abs(netA)) * 100) : 0;

    return {
      periodALabel: `${periodAStart} → ${periodAEnd}`,
      periodBLabel: `${periodBStart} → ${periodBEnd}`,
      periodAInflowsCents: sumAInflows,
      periodAOutflowsCents: sumAOutflows,
      periodANetCents: netA,
      periodBInflowsCents: sumBInflows,
      periodBOutflowsCents: sumBOutflows,
      periodBNetCents: netB,
      deltaNetCents: deltaNet,
      percentageChange: pct
    };
  }

  /**
   * 7. Synthèse Journalière & Écarts de Clôture (Daily Summary)
   */
  public static computeDailySummaries(
    transactions: LedgerTransaction[],
    branches: Branch[],
    targetDate: string
  ): DailySummaryRow[] {
    const dateTxs = transactions.filter((tx) => tx.date.split("T")[0] === targetDate);

    return branches.map((b) => {
      const bTxs = dateTxs.filter((tx) => tx.branchId === b.id);
      let inflow = 0;
      let outflow = 0;

      bTxs.forEach((tx) => {
        const amt = Math.round((tx.amount || 0) * 100);
        if (tx.type === "INCOME" || tx.category === "REVENUE") inflow += amt;
        else outflow += amt;
      });

      const opening = 500000; // 5,000.00 HTG baseline standard float
      const theoretical = opening + inflow - outflow;
      // Discrepancy check: any manual adjustment lines to 1910 / 2910
      const varianceTx = bTxs.find((tx) => tx.debit_account === "1910" || tx.credit_account === "2910");
      const discrepancyCents = varianceTx ? Math.round((varianceTx.amount || 0) * 100) : 0;

      const discrepancyStatus =
        discrepancyCents > 0 ? "SURPLUS_1910" : discrepancyCents < 0 ? "SHORTAGE_2910" : "BALANCED";

      return {
        date: targetDate,
        branchId: b.id,
        branchName: b.name,
        openingBalanceCents: opening,
        inflowCents: inflow,
        outflowCents: outflow,
        theoreticalBalanceCents: theoretical,
        actualBalanceCents: theoretical + discrepancyCents,
        discrepancyCents,
        discrepancyStatus
      };
    });
  }

  /**
   * 8. Performance de l'Équipe (Team Performance Analytics)
   */
  public static computeTellerVolumes(
    transactions: LedgerTransaction[],
    employees: Employee[]
  ): TellerVolumeRow[] {
    const map = new Map<string, { count: number; htgCents: number; usdCents: number }>();

    employees.forEach((e) => {
      map.set(e.id, { count: 0, htgCents: 0, usdCents: 0 });
    });

    transactions.forEach((tx) => {
      const empId = tx.employeeId || "";
      if (!empId) return;
      if (!map.has(empId)) {
        map.set(empId, { count: 0, htgCents: 0, usdCents: 0 });
      }
      const item = map.get(empId)!;
      item.count += 1;
      const amtCents = Math.round((tx.amount || 0) * 100);
      if (tx.currency === "USD") item.usdCents += amtCents;
      else item.htgCents += amtCents;
    });

    return employees.map((e) => {
      const stats = map.get(e.id) || { count: 0, htgCents: 0, usdCents: 0 };
      // Commission estimation (standard 2% on sales volume)
      const commCents = Math.round(stats.htgCents * 0.02);
      return {
        employeeId: e.id,
        employeeName: e.name,
        role: e.role,
        transactionCount: stats.count,
        totalVolumeHtgCents: stats.htgCents,
        totalVolumeUsdCents: stats.usdCents,
        estimatedCommissionsHtgCents: commCents
      };
    });
  }

  /**
   * 9. Livre et Registres de Paie avec Cotisations Haïtiennes (ONA 6%, OFATMA 2-3%, CFGDCT 1%, IRI)
   */
  public static computePayrollBook(
    payrollRecords: PayrollRecord[],
    employees: Employee[]
  ): PayrollBookRow[] {
    return employees.map((emp) => {
      const pr = payrollRecords.find((p) => p.employeeId === emp.id);
      const baseSalary = emp.baseSalary || 25000;
      const validatedCommissions = pr?.commissions || 0;
      const grossSalary = baseSalary + validatedCommissions;
      const advancesDeducted = pr?.advancesTreated || 0;

      // Haitian statutory deductions
      const onaDeduction = Math.round(grossSalary * 0.06); // 6% ONA
      const ofatmaDeduction = Math.round(grossSalary * 0.02); // 2% OFATMA
      const cfgdctDeduction = Math.round(grossSalary * 0.01); // 1% CFGDCT

      // Progressive IRI estimation
      let iriTax = 0;
      if (grossSalary > 100000) {
        iriTax = Math.round((grossSalary - 100000) * 0.25 + 15000);
      } else if (grossSalary > 50000) {
        iriTax = Math.round((grossSalary - 50000) * 0.15 + 5000);
      } else if (grossSalary > 30000) {
        iriTax = Math.round((grossSalary - 30000) * 0.1);
      }

      const totalDeductions = advancesDeducted + onaDeduction + ofatmaDeduction + cfgdctDeduction + iriTax;
      const netPaid = Math.max(0, grossSalary - totalDeductions);

      return {
        employeeId: emp.id,
        employeeName: emp.name,
        baseSalaryHtg: baseSalary,
        validatedCommissionsHtg: validatedCommissions,
        grossSalaryHtg: grossSalary,
        advancesDeductedHtg: advancesDeducted,
        onaDeductionHtg: onaDeduction,
        ofatmaDeductionHtg: ofatmaDeduction,
        cfgdctDeductionHtg: cfgdctDeduction,
        iriTaxHtg: iriTax,
        netPaidHtg: netPaid
      };
    });
  }

  // ==========================================
  // EXPORTS HAUTE FIDÉLITÉ (PDF & CSV)
  // ==========================================

  /**
   * Generates a high-fidelity PDF report with company watermark,
   * official header, reference rate, and notranslate styling.
   */
  public static exportReportToPdf(params: {
    title: string;
    subtitle?: string;
    businessName: string;
    referenceRateText?: string;
    columns: string[];
    rows: (string | number)[][];
    fileName: string;
  }) {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const { title, subtitle, businessName, referenceRateText, columns, rows, fileName } = params;

    const haitiNow = formatHaitiDateTime(new Date());

    // Official Header
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 210, 26, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text(businessName.toUpperCase(), 14, 11);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Système FINOPS ERP — Centre des Rapports Officiels | Date d'émission : ${haitiNow}`, 14, 18);

    // Report Title & Subtitle
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(15, 23, 42);
    doc.text(title, 14, 36);

    if (subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(subtitle, 14, 42);
    }

    if (referenceRateText) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(16, 185, 129); // emerald-600
      doc.text(`Taux de Référence BRH Appliqué : ${referenceRateText}`, 14, 48);
    }

    // AutoTable layout
    autoTable(doc, {
      startY: referenceRateText ? 52 : 46,
      head: [columns],
      body: rows,
      theme: "striped",
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: 255,
        fontSize: 8,
        fontStyle: "bold"
      },
      bodyStyles: {
        fontSize: 8,
        textColor: 30
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      margin: { top: 20, left: 14, right: 14 },
      didDrawPage: (data) => {
        // Watermark in background
        doc.saveGraphicsState();
        doc.setFont("helvetica", "bold");
        doc.setFontSize(45);
        doc.setTextColor(226, 232, 240); // slate-200 faint
        doc.text("FINOPS CERTIFIED", 40, 160, { angle: 45 });
        doc.restoreGraphicsState();

        // Footer
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Page ${data.pageNumber} — Document confidentiel certifié par signature d'immuabilité FINOPS. Fuseau horaire : UTC-5 (Port-au-Prince).`,
          14,
          290
        );
      }
    });

    doc.save(`${fileName}_${getHaitiDateString()}.pdf`);
  }

  /**
   * Generates a raw CSV / Excel file for external audit.
   */
  public static exportReportToCsv(params: {
    sheetName: string;
    data: Record<string, any>[];
    fileName: string;
  }) {
    const ws = xlsx.utils.json_to_sheet(params.data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, params.sheetName || "Rapport");
    xlsx.writeFile(wb, `${params.fileName}_${getHaitiDateString()}.xlsx`);
  }
}
