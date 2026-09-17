import { LedgerTransaction } from "../types";
import {
  FinancialSnapshot,
  TrialBalance,
  TrialBalanceItem,
  BalanceSheet,
  IncomeStatement,
  FinancialRatios,
  AccountCategory
} from "../types/accounting";
import { applyDoubleEntryRules } from "./AccountingEngine";
import { extractTxDateString } from "./cfo/LedgerFilterEngine";
import { FinancialSnapshotRepository } from "../repositories/accounting/FinancialSnapshotRepository";

export class FinancialSnapshotBuilder {
  /**
   * Generates, signs and persists a financial snapshot.
   */
  public static async generateAndSaveSnapshot(
    transactions: LedgerTransaction[],
    businessId: string,
    periodType: FinancialSnapshot["periodType"],
    startDate: string,
    endDate: string,
    currency: string = "HTG"
  ): Promise<FinancialSnapshot> {
    const snapshot = this.buildSnapshot(transactions, businessId, periodType, startDate, endDate, currency);
    snapshot.signature = await this.signSnapshot(snapshot);
    await FinancialSnapshotRepository.save(snapshot);
    return snapshot;
  }

  /**
   * Generates a lightweight synchronous hash signature for the snapshot.
   */
  public static signSnapshotSync(snapshot: FinancialSnapshot): string {
    const dataToSign = `${snapshot.id}:${snapshot.businessId}:${snapshot.endDate}:${snapshot.balanceSheet.assets.totalAssetsCents}:${snapshot.balanceSheet.liabilities.totalLiabilitiesCents}:${snapshot.balanceSheet.equity.totalEquityCents}:${snapshot.incomeStatement.netIncomeCents}`;
    let hash = 0;
    for (let i = 0; i < dataToSign.length; i++) {
      const char = dataToSign.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }

  /**
   * Signs a financial snapshot using SHA-256 for cryptographic tamper-proofing.
   */
  public static async signSnapshot(snapshot: FinancialSnapshot): Promise<string> {
    const dataToSign = JSON.stringify({
      id: snapshot.id,
      businessId: snapshot.businessId,
      endDate: snapshot.endDate,
      totalAssetsCents: snapshot.balanceSheet.assets.totalAssetsCents,
      totalLiabilitiesCents: snapshot.balanceSheet.liabilities.totalLiabilitiesCents,
      totalEquityCents: snapshot.balanceSheet.equity.totalEquityCents,
      netIncomeCents: snapshot.incomeStatement.netIncomeCents
    });
    
    if (typeof crypto !== "undefined" && crypto.subtle) {
      try {
        const msgUint8 = new TextEncoder().encode(dataToSign);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch {
        return this.signSnapshotSync(snapshot);
      }
    }
    return this.signSnapshotSync(snapshot);
  }

  /**
   * Helper to validate status integrity.
   * Strictly excludes REVERSED, VOID, VOIDED, CANCELLED, DRAFT, and is_reversed flag.
   */
  public static isValidFinancialTx(tx: any): boolean {
    if (!tx) return false;
    const status = (tx.status || "").toUpperCase();
    if (status === "REVERSED" || status === "VOID" || status === "VOIDED" || status === "CANCELLED" || status === "DRAFT") {
      return false;
    }
    if (tx.is_reversed === true || tx.isReversed === true) {
      return false;
    }
    return true;
  }

  /**
   * Helper to enforce strict tenant isolation.
   * Missing business_id or wrong business_id is strictly excluded.
   */
  public static isEligibleTenant(tx: any, targetBusinessId: string): boolean {
    if (!targetBusinessId) return false;
    const txBizId = tx.business_id || tx.businessId;
    if (!txBizId || txBizId !== targetBusinessId) {
      return false;
    }
    return true;
  }

  /**
   * Helper to enforce currency isolation.
   * Does not mix HTG and USD without explicit conversion.
   */
  public static isEligibleCurrency(tx: any, targetCurrency: string = "HTG"): boolean {
    if (!targetCurrency) return true;
    const txCurr = (tx.currency || tx.currency_code || "HTG").toUpperCase();
    return txCurr === targetCurrency.toUpperCase();
  }

  /**
   * Builds a complete, verified Financial Snapshot from ledger transactions.
   */
  public static buildSnapshot(
    transactions: LedgerTransaction[],
    businessId: string,
    periodType: FinancialSnapshot["periodType"] = "MONTHLY",
    startDate?: string,
    endDate?: string,
    currency: string = "HTG"
  ): FinancialSnapshot {
    const asOfEndDate = endDate || new Date().toISOString().split("T")[0];
    const asOfStartDate = startDate || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split("T")[0];

    // Filter transactions for business, valid status, currency, and up to end date, normalized with double-entry rules
    const relevantTxs = (transactions || [])
      .filter((tx) => {
        if (!this.isValidFinancialTx(tx)) return false;
        if (!this.isEligibleTenant(tx, businessId)) return false;
        if (!this.isEligibleCurrency(tx, currency)) return false;
        const txDate = extractTxDateString(tx.date || (tx as any).transaction_date || (tx as any).createdAt);
        return !txDate || txDate <= asOfEndDate;
      })
      .map((tx) => (!tx.debit_account || !tx.credit_account ? applyDoubleEntryRules(tx) : tx));

    // 1. Build Trial Balance
    const trialBalance = this.buildTrialBalance(relevantTxs, businessId, asOfEndDate, currency);

    // 2. Build Income Statement (P&L) for the period (from startDate to endDate)
    const periodTxs = relevantTxs.filter((tx) => {
      const txDate = extractTxDateString(tx.date || (tx as any).transaction_date || (tx as any).createdAt);
      if (!txDate) return true;
      return txDate >= asOfStartDate && txDate <= asOfEndDate;
    });
    const incomeStatement = this.buildIncomeStatement(periodTxs, businessId, asOfStartDate, asOfEndDate, currency);

    // 3. Build Balance Sheet as of end date
    const balanceSheet = this.buildBalanceSheet(trialBalance, incomeStatement.netIncomeCents, businessId, asOfEndDate, currency);

    // 4. Compute Financial Ratios
    const ratios = this.calculateRatios(balanceSheet, incomeStatement);
    
    const snapshot: FinancialSnapshot = {
      id: `snap_${businessId || 'default'}_${asOfEndDate.replace(/-/g, "")}_${Date.now().toString(36)}`,
      businessId: businessId || 'default',
      periodType,
      startDate: asOfStartDate,
      endDate: asOfEndDate,
      generatedAt: new Date().toISOString(),
      currency,
      trialBalance,
      balanceSheet,
      incomeStatement,
      ratios,
      isFrozen: false
    };

    snapshot.signature = this.signSnapshotSync(snapshot);

    return snapshot;
  }

  /**
   * Scans all transactions across time and creates / persists financial snapshots
   * for every historical month and year found in the ledger.
   */
  public static async rebuildAllHistoricalFinancialSnapshots(
    transactions: LedgerTransaction[],
    businessId: string,
    currency: string = "HTG"
  ): Promise<{ savedCount: number; periods: string[] }> {
    if (!transactions || transactions.length === 0) {
      return { savedCount: 0, periods: [] };
    }

    const businessTxs = transactions.filter(tx =>
      this.isValidFinancialTx(tx) &&
      this.isEligibleTenant(tx, businessId) &&
      this.isEligibleCurrency(tx, currency)
    );
    
    // Identify all unique monthly periods (YYYY-MM)
    const monthSet = new Set<string>();
    businessTxs.forEach(tx => {
      const dateStr = extractTxDateString(tx.date || (tx as any).transaction_date || (tx as any).createdAt);
      if (dateStr && dateStr.length >= 7) {
        monthSet.add(dateStr.substring(0, 7));
      }
    });

    // Also include current month if empty
    const currentMonth = new Date().toISOString().substring(0, 7);
    monthSet.add(currentMonth);

    const sortedMonths = Array.from(monthSet).sort();
    const savedPeriods: string[] = [];

    for (const month of sortedMonths) {
      const [yearStr, mStr] = month.split("-");
      const y = parseInt(yearStr, 10);
      const m = parseInt(mStr, 10);
      const startDate = `${month}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

      const snapshot = this.buildSnapshot(
        businessTxs,
        businessId,
        "MONTHLY",
        startDate,
        endDate,
        currency
      );

      await FinancialSnapshotRepository.save(snapshot);
      savedPeriods.push(month);
    }

    return {
      savedCount: savedPeriods.length,
      periods: savedPeriods
    };
  }

  /**
   * Helper to derive account category from account code.
   */
  public static getAccountCategory(accountCode: string): AccountCategory {
    const code = accountCode.toUpperCase();
    if (code.startsWith("1")) return "ASSET";
    if (code.startsWith("2")) return "LIABILITY";
    if (code.startsWith("3")) return "EQUITY";
    if (code.startsWith("4") || code.startsWith("7")) return "REVENUE";
    return "EXPENSE"; // 5xxx, 6xxx, 8xxx
  }

  /**
   * Helper to get user-friendly account name.
   */
  public static getAccountName(accountCode: string): string {
    const names: Record<string, string> = {
      "1000_CASH": "Caisse Principale (Cash)",
      "1010_BANK": "Banque & Trésorerie (Bank)",
      "1200_ACCOUNTS_RECEIVABLE": "Clients & Créances d'Exploitation (AR)",
      "1300_EMPLOYEE_ADVANCES": "Avances & Prêts au Personnel",
      "2000_ACCOUNTS_PAYABLE": "Fournisseurs & Dettes d'Exploitation (AP)",
      "2100_ONA_TAXES_PAYABLE": "Dettes Sociales ONA (6%)",
      "2110_OFATMA_TAXES_PAYABLE": "Dettes Sécurité Sociale OFATMA (2-3%)",
      "2200_TAXES_PAYABLE": "Taxes & Impôts à Payer (TVA/DGI)",
      "3000_SHARE_CAPITAL": "Capital Social Souscrit",
      "3000_RETAINED_EARNINGS": "Report à Nouveau & Réserves",
      "4000_OPERATING_REVENUE": "Chiffre d'Affaires / Ventes de Services",
      "4100_SALES": "Ventes de Marchandises & Produits",
      "5000_PAYROLL_EXPENSE": "Charges Salariales Directes (Masse Salariale)",
      "5050_COMMISSIONS_EXPENSE": "Commissions & Primes Commerciales",
      "5100_RENT_EXPENSE": "Loyers & Charges Locatives",
      "5200_UTILITIES": "Services Publics & Énergie",
      "5200_ADMINISTRATIVE_EXPENSE": "Frais Administratifs & Généraux",
      "5900_GENERAL_EXPENSES": "Autres Charges d'Exploitation"
    };

    if (names[accountCode]) return names[accountCode];
    const parts = accountCode.split("_");
    return parts.length > 1 ? parts.slice(1).join(" ") : accountCode;
  }

  private static buildTrialBalance(
    transactions: LedgerTransaction[],
    businessId: string,
    asOfDate: string,
    currency: string
  ): TrialBalance {
    const accountMap = new Map<string, { debitCents: number; creditCents: number }>();

    transactions.forEach((tx) => {
      const amtCents = tx.amount_cents ?? Math.round((tx.amount || 0) * 100);
      if (amtCents <= 0) return;

      const debitAcc = tx.debit_account || "1010_BANK";
      const creditAcc = tx.credit_account || "4000_OPERATING_REVENUE";

      // Add to debit account
      const debitEntry = accountMap.get(debitAcc) || { debitCents: 0, creditCents: 0 };
      debitEntry.debitCents += amtCents;
      accountMap.set(debitAcc, debitEntry);

      // Add to credit account
      const creditEntry = accountMap.get(creditAcc) || { debitCents: 0, creditCents: 0 };
      creditEntry.creditCents += amtCents;
      accountMap.set(creditAcc, creditEntry);
    });

    let totalDebitCents = 0;
    let totalCreditCents = 0;
    const items: TrialBalanceItem[] = [];

    accountMap.forEach((val, accCode) => {
      totalDebitCents += val.debitCents;
      totalCreditCents += val.creditCents;
      const category = this.getAccountCategory(accCode);

      // Net balance: positive for debit normal (Assets, Expenses), positive for credit normal (Liab, Eq, Rev)
      let netBalanceCents = 0;
      if (category === "ASSET" || category === "EXPENSE") {
        netBalanceCents = val.debitCents - val.creditCents;
      } else {
        netBalanceCents = val.creditCents - val.debitCents;
      }

      items.push({
        accountCode: accCode,
        accountName: this.getAccountName(accCode),
        category,
        debitCents: val.debitCents,
        creditCents: val.creditCents,
        netBalanceCents
      });
    });

    // Sort items by account code
    items.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    return {
      asOfDate,
      businessId,
      currency,
      items,
      totalDebitCents,
      totalCreditCents,
      isBalanced: totalDebitCents === totalCreditCents
    };
  }

  private static buildIncomeStatement(
    periodTxs: LedgerTransaction[],
    businessId: string,
    startDate: string,
    endDate: string,
    currency: string
  ): IncomeStatement {
    let operatingRevenueCents = 0;
    let otherRevenueCents = 0;
    let costOfSalesCents = 0;
    let payrollExpensesCents = 0;
    let employerTaxesCents = 0;
    let generalExpensesCents = 0;
    let depreciationCents = 0;
    let financialExpensesCents = 0;
    let taxExpensesCents = 0;

    periodTxs.forEach((tx) => {
      const rawAmount =
        typeof tx.amount === "number" && !isNaN(tx.amount) && tx.amount !== 0 ? Math.abs(tx.amount) :
        typeof (tx as any).amount_htg === "number" && !isNaN((tx as any).amount_htg) && (tx as any).amount_htg !== 0 ? Math.abs((tx as any).amount_htg) :
        typeof (tx as any).amountHtg === "number" && !isNaN((tx as any).amountHtg) && (tx as any).amountHtg !== 0 ? Math.abs((tx as any).amountHtg) :
        typeof (tx as any).credit === "number" && !isNaN((tx as any).credit) && (tx as any).credit > 0 ? (tx as any).credit :
        typeof (tx as any).total === "number" && !isNaN((tx as any).total) && (tx as any).total !== 0 ? Math.abs((tx as any).total) : 0;

      const amtCents = tx.amount_cents ?? (tx as any).amountCents ?? Math.round(rawAmount * 100);
      if (amtCents <= 0) return;

      const creditAcc = String(tx.credit_account || (tx as any).creditAccount || "").toUpperCase();
      const debitAcc = String(tx.debit_account || (tx as any).debitAccount || "").toUpperCase();
      const txType = String(tx.type || "").toUpperCase();
      const catUpper = String(tx.category || (tx as any).category_name || "").toUpperCase();

      // Revenue entries (Credits to 4xxx / 7xxx or type INCOME/REVENUE/SALES/VENTE)
      const isRevenue =
        creditAcc.startsWith("4") || creditAcc.startsWith("7") ||
        ["INCOME", "REVENUE", "SALES", "VENTE", "VENTES", "CREDIT"].includes(txType) ||
        catUpper.includes("INCOME") || catUpper.includes("REVENUE") || catUpper.includes("VENTE") || catUpper.includes("SALES");

      if (isRevenue) {
        if (
          creditAcc.startsWith("4000") ||
          creditAcc.startsWith("4100") ||
          creditAcc.startsWith("4") ||
          ["INCOME", "REVENUE", "SALES", "VENTE", "VENTES"].includes(txType) ||
          catUpper.includes("VENTE") || catUpper.includes("INCOME") || catUpper.includes("REVENUE")
        ) {
          operatingRevenueCents += amtCents;
        } else {
          otherRevenueCents += amtCents;
        }
      }

      // Expense entries (Debits to 5xxx / 6xxx / 8xxx)
      if (debitAcc.startsWith("5000") || debitAcc.startsWith("5050")) {
        payrollExpensesCents += amtCents;
      } else if (debitAcc.startsWith("5100_PAYROLL")) {
        employerTaxesCents += amtCents;
      } else if (debitAcc.startsWith("6500")) {
        depreciationCents += amtCents;
      } else if (debitAcc.startsWith("8000")) {
        financialExpensesCents += amtCents;
      } else if (debitAcc.startsWith("2200") || debitAcc.startsWith("5900_TAX")) {
        taxExpensesCents += amtCents;
      } else if (debitAcc.startsWith("5") || debitAcc.startsWith("6")) {
        generalExpensesCents += amtCents;
      }
    });

    const totalRevenueCents = operatingRevenueCents + otherRevenueCents;
    const grossProfitCents = totalRevenueCents - costOfSalesCents;
    const totalOperatingExpensesCents = payrollExpensesCents + employerTaxesCents + generalExpensesCents + depreciationCents;
    const operatingIncomeCents = grossProfitCents - totalOperatingExpensesCents;
    const netIncomeCents = operatingIncomeCents - financialExpensesCents - taxExpensesCents;
    const profitMarginPercentage = totalRevenueCents > 0 ? Math.round((netIncomeCents / totalRevenueCents) * 10000) / 100 : 0;

    return {
      startDate,
      endDate,
      businessId,
      currency,
      revenue: {
        operatingRevenueCents,
        otherRevenueCents,
        totalRevenueCents
      },
      costOfSalesCents,
      grossProfitCents,
      operatingExpenses: {
        payrollExpensesCents,
        employerTaxesCents,
        generalExpensesCents,
        depreciationCents,
        totalOperatingExpensesCents
      },
      operatingIncomeCents,
      financialExpensesCents,
      taxExpensesCents,
      netIncomeCents,
      profitMarginPercentage
    };
  }

  private static buildBalanceSheet(
    trialBalance: TrialBalance,
    currentPeriodNetIncomeCents: number,
    businessId: string,
    asOfDate: string,
    currency: string
  ): BalanceSheet {
    const currentAssetAccounts: { code: string; name: string; balanceCents: number }[] = [];
    const nonCurrentAssetAccounts: { code: string; name: string; balanceCents: number }[] = [];
    let currentAssetsCents = 0;
    let nonCurrentAssetsCents = 0;

    const currentLiabilityAccounts: { code: string; name: string; balanceCents: number }[] = [];
    const longTermLiabilityAccounts: { code: string; name: string; balanceCents: number }[] = [];
    let currentLiabilitiesCents = 0;
    let longTermLiabilitiesCents = 0;

    let capitalCents = 0;
    let retainedEarningsCents = 0;

    trialBalance.items.forEach((item) => {
      if (item.category === "ASSET") {
        if (item.accountCode.startsWith("10") || item.accountCode.startsWith("12") || item.accountCode.startsWith("13")) {
          currentAssetAccounts.push({ code: item.accountCode, name: item.accountName, balanceCents: item.netBalanceCents });
          currentAssetsCents += item.netBalanceCents;
        } else {
          nonCurrentAssetAccounts.push({ code: item.accountCode, name: item.accountName, balanceCents: item.netBalanceCents });
          nonCurrentAssetsCents += item.netBalanceCents;
        }
      } else if (item.category === "LIABILITY") {
        if (item.accountCode.startsWith("20") || item.accountCode.startsWith("21") || item.accountCode.startsWith("22")) {
          currentLiabilityAccounts.push({ code: item.accountCode, name: item.accountName, balanceCents: item.netBalanceCents });
          currentLiabilitiesCents += item.netBalanceCents;
        } else {
          longTermLiabilityAccounts.push({ code: item.accountCode, name: item.accountName, balanceCents: item.netBalanceCents });
          longTermLiabilitiesCents += item.netBalanceCents;
        }
      } else if (item.category === "EQUITY") {
        if (item.accountCode.includes("CAPITAL")) {
          capitalCents += item.netBalanceCents;
        } else {
          retainedEarningsCents += item.netBalanceCents;
        }
      }
    });

    const totalAssetsCents = currentAssetsCents + nonCurrentAssetsCents;
    const totalLiabilitiesCents = currentLiabilitiesCents + longTermLiabilitiesCents;
    const totalEquityCents = capitalCents + retainedEarningsCents + currentPeriodNetIncomeCents;

    const equilibriumDeltaCents = totalAssetsCents - (totalLiabilitiesCents + totalEquityCents);
    const isBalanced = equilibriumDeltaCents === 0;

    return {
      asOfDate,
      businessId,
      currency,
      assets: {
        currentAssets: {
          title: "Actifs Circulants (Current Assets)",
          accounts: currentAssetAccounts,
          totalCents: currentAssetsCents
        },
        nonCurrentAssets: {
          title: "Actifs Immobilisés (Non-Current Assets)",
          accounts: nonCurrentAssetAccounts,
          totalCents: nonCurrentAssetsCents
        },
        totalAssetsCents
      },
      liabilities: {
        currentLiabilities: {
          title: "Passifs à Court Terme (Current Liabilities)",
          accounts: currentLiabilityAccounts,
          totalCents: currentLiabilitiesCents
        },
        longTermLiabilities: {
          title: "Passifs à Long Terme (Long-Term Debt)",
          accounts: longTermLiabilityAccounts,
          totalCents: longTermLiabilitiesCents
        },
        totalLiabilitiesCents
      },
      equity: {
        capitalCents,
        retainedEarningsCents,
        currentPeriodNetIncomeCents,
        totalEquityCents
      },
      isBalanced,
      equilibriumDeltaCents
    };
  }

  private static calculateRatios(balanceSheet: BalanceSheet, incomeStatement: IncomeStatement): FinancialRatios {
    const curAssets = balanceSheet.assets.currentAssets.totalCents;
    const curLiabs = balanceSheet.liabilities.currentLiabilities.totalCents;
    const totalLiabs = balanceSheet.liabilities.totalLiabilitiesCents;
    const totalEquity = balanceSheet.equity.totalEquityCents;

    const currentRatio = curLiabs > 0 ? Math.round((curAssets / curLiabs) * 100) / 100 : curAssets > 0 ? 99.9 : 1.0;
    const quickRatio = curLiabs > 0 ? Math.round((curAssets / curLiabs) * 100) / 100 : 1.0; // Assuming zero inventory
    const workingCapitalCents = curAssets - curLiabs;
    const debtToEquityRatio = totalEquity > 0 ? Math.round((totalLiabs / totalEquity) * 100) / 100 : 0;

    const grossMarginPercentage = incomeStatement.profitMarginPercentage;
    const netMarginPercentage = incomeStatement.profitMarginPercentage;
    const returnOnEquityPercentage = totalEquity > 0 ? Math.round((incomeStatement.netIncomeCents / totalEquity) * 10000) / 100 : 0;

    const monthlyBurnRateCents = Math.max(1, incomeStatement.operatingExpenses.totalOperatingExpensesCents);
    const totalCashCents = balanceSheet.assets.currentAssets.accounts
      .filter((a) => a.code.startsWith("10"))
      .reduce((sum, a) => sum + a.balanceCents, 0);

    const cashRunwayMonths = monthlyBurnRateCents > 0 ? Math.round((totalCashCents / monthlyBurnRateCents) * 10) / 10 : 12;

    return {
      currentRatio,
      quickRatio,
      workingCapitalCents,
      debtToEquityRatio,
      grossMarginPercentage,
      netMarginPercentage,
      returnOnEquityPercentage,
      cashRunwayMonths,
      monthlyBurnRateCents
    };
  }
}
