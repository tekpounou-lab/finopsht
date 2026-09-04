import { expect, test, describe, vi } from "vitest";
import { LedgerTransaction } from "../../types";
import { calculateLedgerSummary } from "../../services/cfo/LedgerFilterEngine";
import { createReversalEntry, LedgerRepository } from "../../repositories/LedgerRepository";
import { validateDoubleEntry, DEFAULT_CHART_OF_ACCOUNTS } from "../../services/AccountingEngine";
import { CacheInvalidationService } from "../../services/performance/CacheInvalidationService";
import { AnalyticsRepository } from "../../domains/analytics/repositories/AnalyticsRepository";
import { EventBus } from "../../modules/runtime/EventBus";
import { SnapshotRebuildService } from "../../services/SnapshotRebuildService";

describe("Ledger Transaction Reversal Logic", () => {
  test("Reversal strictly preserves historical transaction date (e.g. July 31) and never uses today's date", () => {
    const historicalTx: LedgerTransaction = {
      id: "tx_july_31",
      business_id: "biz_test_corp",
      branchId: "branch_main",
      type: "INCOME",
      amount: 2500,
      amount_cents: 250000,
      description: "Prestation de Clôture Juillet",
      date: "2026-07-31T23:59:59.000Z",
      category: "Services",
      isImmutable: true,
      signerId: "user_owner",
      currency: "HTG",
      status: "POSTED",
      source: "MANUAL",
      debit_account: "1010_BANK",
      credit_account: "4000_REVENUE"
    };

    const reversalTx = createReversalEntry(historicalTx, "Annulation Clôture", "usr_1", "Comptable", "ADMIN");

    // Must be exactly July 31, NOT today's date
    expect(reversalTx.date).toBe("2026-07-31T23:59:59.000Z");
    expect(reversalTx.date).not.toBe(new Date().toISOString().split('T')[0]);
    expect(reversalTx.date).toBe(historicalTx.date);
  });

  test("Reversing a credit / income transaction creates a balanced double-entry reversal and returns balance to 0", () => {
    // 1. Original Credit / Income Transaction
    const originalIncomeTx: LedgerTransaction = {
      id: "tx_income_001",
      business_id: "biz_test_corp",
      branchId: "branch_main",
      type: "INCOME",
      amount: 1000,
      amount_cents: 100000,
      description: "Prestation de services financiers",
      date: "2026-08-10T14:30:00Z",
      category: "Ventes & Prestations",
      isImmutable: true,
      signerId: "user_owner",
      currency: "HTG",
      status: "POSTED",
      source: "MANUAL",
      debit_account: "1010_BANK",
      credit_account: "4000_OPERATING_REVENUE"
    };

    // 2. Create Reversal Entry via LedgerRepository
    const reversalTx = createReversalEntry(originalIncomeTx, "Erreur de facturation client", "usr_adm_1", "Administrateur", "OWNER");

    // Double-Entry Verification:
    // Original: Debit 1010 (Bank), Credit 4000 (Revenue)
    // Reversal MUST BE: Debit 4000 (Revenue), Credit 1010 (Bank)
    expect(reversalTx.debit_account).toBe("4000_OPERATING_REVENUE");
    expect(reversalTx.credit_account).toBe("1010_BANK");
    
    // Balanced Debit and Credit values
    expect(reversalTx.debit).toBe(1000);
    expect(reversalTx.credit).toBe(1000);
    expect(reversalTx.debit_cents).toBe(100000);
    expect(reversalTx.credit_cents).toBe(100000);
    expect(reversalTx.amount).toBe(1000);
    expect(reversalTx.amount_cents).toBe(100000);
    expect(validateDoubleEntry(reversalTx)).toBe(true);

    // Independence of Exercises Principle (Strict Date Preservation)
    expect(reversalTx.date).toBe(originalIncomeTx.date);

    // Metadata & Classification
    expect(reversalTx.type).toBe("REVERSAL");
    expect(reversalTx.source).toBe("SYSTEM");
    expect(reversalTx.referenceTransactionId).toBe(originalIncomeTx.id);
    expect(reversalTx.metadata?.reversalOf).toBe(originalIncomeTx.id);
    expect(reversalTx.metadata?.reason).toBe("Erreur de facturation client");
    expect(reversalTx.isImmutable).toBe(true);

    // 3. Verify Running Balance calculation with original + reversal
    const transactions = [originalIncomeTx, reversalTx];
    const summary = calculateLedgerSummary(transactions);

    // Net Cashflow must return to pre-transaction baseline (0)
    expect(summary.netCashflowCents).toBe(0);
    
    // Debits and credits totals across entries must be balanced
    expect(summary.totalDebitsCents).toBe(200000);
    expect(summary.totalCreditsCents).toBe(200000);

    // The final transaction chronologically must have computed balance = 0
    const latestTx = summary.transactionsWithBalance[0];
    expect(latestTx.computedBalance).toBe(0);
  });

  test("Reversing an expense transaction creates a balanced double-entry reversal and returns balance to 0", () => {
    const originalExpenseTx: LedgerTransaction = {
      id: "tx_expense_001",
      business_id: "biz_test_corp",
      branchId: "branch_main",
      type: "EXPENSE",
      amount: 450,
      amount_cents: 45000,
      description: "Achat Fournitures Bureau",
      date: "2026-08-12T09:15:00Z",
      category: "Operations",
      isImmutable: true,
      signerId: "user_owner",
      currency: "HTG",
      status: "POSTED",
      source: "MANUAL",
      debit_account: "5900_GENERAL_EXPENSES",
      credit_account: "1010_BANK"
    };

    const reversalTx = LedgerRepository.createReversalEntry(originalExpenseTx, "Fournitures retournées");

    // Inverted double-entry legs:
    // Original: Debit 5900 (Expenses), Credit 1010 (Bank)
    // Reversal: Debit 1010 (Bank), Credit 5900 (Expenses)
    expect(reversalTx.debit_account).toBe("1010_BANK");
    expect(reversalTx.credit_account).toBe("5900_GENERAL_EXPENSES");
    expect(reversalTx.date).toBe(originalExpenseTx.date);
    expect(reversalTx.amount_cents).toBe(45000);
    expect(reversalTx.type).toBe("REVERSAL");

    const summary = calculateLedgerSummary([originalExpenseTx, reversalTx]);
    expect(summary.netCashflowCents).toBe(0);
    expect(summary.transactionsWithBalance[0].computedBalance).toBe(0);
  });

  test("Legacy transaction without explicit accounts automatically derives and inverts accounts", () => {
    const legacyIncomeTx: LedgerTransaction = {
      id: "tx_legacy_001",
      business_id: "biz_test_corp",
      branchId: "branch_main",
      type: "INCOME",
      amount: 750,
      amount_cents: 75000,
      description: "Legacy Income without account strings",
      date: "2026-08-01T10:00:00Z",
      category: "Sales",
      isImmutable: false,
      signerId: "user_legacy",
      currency: "HTG",
      status: "POSTED",
      source: "CSV_IMPORT"
    };

    const reversalTx = createReversalEntry(legacyIncomeTx);

    // Derived double entry inverted accounts:
    expect(reversalTx.debit_account).toBe(DEFAULT_CHART_OF_ACCOUNTS.REVENUE.OPERATING);
    expect(reversalTx.credit_account).toBe(DEFAULT_CHART_OF_ACCOUNTS.ASSETS.BANK);
    expect(reversalTx.date).toBe(legacyIncomeTx.date);
    expect(reversalTx.debit).toBe(750);
    expect(reversalTx.credit).toBe(750);

    const summary = calculateLedgerSummary([legacyIncomeTx, reversalTx]);
    expect(summary.netCashflowCents).toBe(0);
    expect(summary.transactionsWithBalance[0].computedBalance).toBe(0);
  });

  test("CacheInvalidationService sweep invalidates AnalyticsRepository cache", () => {
    const invalidateSpy = vi.spyOn(AnalyticsRepository, "invalidateCache");

    CacheInvalidationService.sweepLocal("biz_test_corp");

    expect(invalidateSpy).toHaveBeenCalled();
    invalidateSpy.mockRestore();
  });

  test("EventBus dispatches LEDGER_TRANSACTION_REVERSED which triggers SnapshotRebuildService listener", async () => {
    SnapshotRebuildService.startListener();
    const rebuildSpy = vi.spyOn(SnapshotRebuildService, "rebuildActivityTable").mockResolvedValue(undefined as any);

    EventBus.publish(EventBus.createEvent({
      correlationId: "corr_test_rev_123",
      businessId: "biz_test_rebuild",
      module: "FINANCIAL_LEDGER",
      aggregate: "LedgerTransaction",
      type: "LEDGER_TRANSACTION_REVERSED",
      source: "TestRunner",
      payload: { businessId: "biz_test_rebuild", transactionId: "tx_orig", reversalId: "tx_rev" }
    }));

    // Allow microtasks to resolve
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(rebuildSpy).toHaveBeenCalledWith("biz_test_rebuild");
    rebuildSpy.mockRestore();
  });
});
