import { describe, it, expect } from "vitest";
import {
  validateDoubleEntry,
  applyDoubleEntryRules,
  runReconciliation,
  DEFAULT_CHART_OF_ACCOUNTS
} from "../../services/AccountingEngine";
import { LedgerTransaction } from "../../types";

describe("AccountingEngine Unit Tests", () => {
  it("validates double-entry transaction structure", () => {
    const invalidTx: Partial<LedgerTransaction> = {
      debit_account: "1010_BANK",
      amount_cents: 0
    };
    expect(validateDoubleEntry(invalidTx)).toBe(false);

    const validTx: Partial<LedgerTransaction> = {
      debit_account: "1010_BANK",
      credit_account: "4000_OPERATING_REVENUE",
      amount_cents: 500000
    };
    expect(validateDoubleEntry(validTx)).toBe(true);
  });

  it("applies backward-compatible chart of accounts mapping for transaction types", () => {
    const rawTx = {
      id: "tx_01",
      business_id: "biz_test",
      type: "PAYROLL",
      amount_cents: 250000,
      description: "July Payroll Disbursement",
      createdAt: new Date().toISOString()
    } as unknown as LedgerTransaction;

    const resolved = applyDoubleEntryRules(rawTx);

    expect(resolved.debit_account).toBe(DEFAULT_CHART_OF_ACCOUNTS.EXPENSES.PAYROLL);
    expect(resolved.credit_account).toBe(DEFAULT_CHART_OF_ACCOUNTS.ASSETS.BANK);
    expect(resolved.isLocked).toBe(true);
  });

  it("reconciles balanced double-entry transactions cleanly", () => {
    const txs: LedgerTransaction[] = [
      {
        id: "tx_1",
        business_id: "biz_rec",
        type: "INCOME",
        amount_cents: 100000,
        debit_account: "1010_BANK",
        credit_account: "4000_OPERATING_REVENUE"
      } as LedgerTransaction,
      {
        id: "tx_2",
        business_id: "biz_rec",
        type: "EXPENSE",
        amount_cents: 40000,
        debit_account: "5000_PAYROLL_EXPENSE",
        credit_account: "1010_BANK"
      } as LedgerTransaction
    ];

    const recon = runReconciliation(txs, "biz_rec");
    expect(recon.isBalanced).toBe(true);
    expect(recon.netSum).toBe(0);
    expect(recon.rawBalances["1010_BANK"]).toBe(60000); // 100,000 debit - 40,000 credit
    expect(recon.rawBalances["4000_OPERATING_REVENUE"]).toBe(-100000); // 100,000 credit
  });
});
