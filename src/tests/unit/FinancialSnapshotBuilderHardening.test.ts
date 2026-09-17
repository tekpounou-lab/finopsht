import { describe, it, expect } from "vitest";
import { FinancialSnapshotBuilder } from "../../services/FinancialSnapshotBuilder";
import { LedgerTransaction } from "../../types";

describe("FinancialSnapshotBuilder Status, Tenant, and Currency Hardening", () => {
  it("Test FSB-01: Excludes REVERSED, VOID, CANCELLED, and DRAFT transactions from financial statements", () => {
    const mockTxs: any[] = [
      {
        id: "tx_posted",
        business_id: "biz_1",
        date: "2026-03-01",
        type: "INCOME",
        amount: 50000,
        status: "POSTED",
        debit_account: "1010",
        credit_account: "4000"
      },
      {
        id: "tx_reversed",
        business_id: "biz_1",
        date: "2026-03-01",
        type: "INCOME",
        amount: 50000,
        status: "REVERSED",
        debit_account: "1010",
        credit_account: "4000"
      },
      {
        id: "tx_void",
        business_id: "biz_1",
        date: "2026-03-01",
        type: "INCOME",
        amount: 50000,
        status: "VOID",
        debit_account: "1010",
        credit_account: "4000"
      },
      {
        id: "tx_cancelled",
        business_id: "biz_1",
        date: "2026-03-01",
        type: "INCOME",
        amount: 50000,
        status: "CANCELLED",
        debit_account: "1010",
        credit_account: "4000"
      },
      {
        id: "tx_draft",
        business_id: "biz_1",
        date: "2026-03-01",
        type: "INCOME",
        amount: 50000,
        status: "DRAFT",
        debit_account: "1010",
        credit_account: "4000"
      }
    ];

    const snapshot = FinancialSnapshotBuilder.buildSnapshot(mockTxs, "biz_1", "MONTHLY", "2026-03-01", "2026-03-31", "HTG");

    // Total revenue should equal 50000 (only tx_posted), excluding all invalid statuses
    expect(snapshot.incomeStatement.revenue.totalRevenueCents / 100).toBe(50000);
  });

  it("Test FSB-02: Strict Tenant Isolation — Excludes transactions with missing or wrong business_id", () => {
    const mockTxs: any[] = [
      {
        id: "tx_valid_biz",
        business_id: "biz_target",
        date: "2026-03-01",
        type: "INCOME",
        amount: 30000,
        status: "POSTED",
        debit_account: "1010",
        credit_account: "4000"
      },
      {
        id: "tx_wrong_biz",
        business_id: "biz_other",
        date: "2026-03-01",
        type: "INCOME",
        amount: 80000,
        status: "POSTED",
        debit_account: "1010",
        credit_account: "4000"
      },
      {
        id: "tx_missing_biz",
        business_id: "",
        date: "2026-03-01",
        type: "INCOME",
        amount: 40000,
        status: "POSTED",
        debit_account: "1010",
        credit_account: "4000"
      }
    ];

    const snapshot = FinancialSnapshotBuilder.buildSnapshot(mockTxs, "biz_target", "MONTHLY", "2026-03-01", "2026-03-31", "HTG");

    expect(snapshot.incomeStatement.revenue.totalRevenueCents / 100).toBe(30000);
  });

  it("Test FSB-03: Currency Isolation — Excludes transactions in other currencies without explicit conversion", () => {
    const mockTxs: any[] = [
      {
        id: "tx_htg",
        business_id: "biz_1",
        currency: "HTG",
        date: "2026-03-01",
        type: "INCOME",
        amount: 100000,
        status: "POSTED",
        debit_account: "1010",
        credit_account: "4000"
      },
      {
        id: "tx_usd",
        business_id: "biz_1",
        currency: "USD",
        date: "2026-03-01",
        type: "INCOME",
        amount: 5000,
        status: "POSTED",
        debit_account: "1010",
        credit_account: "4000"
      }
    ];

    const snapshotHTG = FinancialSnapshotBuilder.buildSnapshot(mockTxs, "biz_1", "MONTHLY", "2026-03-01", "2026-03-31", "HTG");
    expect(snapshotHTG.incomeStatement.revenue.totalRevenueCents / 100).toBe(100000);

    const snapshotUSD = FinancialSnapshotBuilder.buildSnapshot(mockTxs, "biz_1", "MONTHLY", "2026-03-01", "2026-03-31", "USD");
    expect(snapshotUSD.incomeStatement.revenue.totalRevenueCents / 100).toBe(5000);
  });
});
