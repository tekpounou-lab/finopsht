import { describe, it, expect } from "vitest";
import { HistoricalLedgerAuditService } from "../../services/analytics/HistoricalLedgerAuditService";
import { LedgerTransaction } from "../../types";
import { createCalculatedMetric, formatMetricDisplay } from "../../types/metrics";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";

describe("Historical Ledger Audit & Metric State Integrity", () => {
  const businessId = "biz_audit_test_001";

  it("detects legacy keys, duplicates, and unbalanced transactions in ledger", () => {
    const testTxs: LedgerTransaction[] = [
      {
        id: "tx_pay_inv_001", // Legacy key (3 parts)
        business_id: businessId,
        branchId: "main",
        type: "TRANSFER",
        amount: 10000,
        amount_cents: 1000000,
        date: "2026-09-01",
        description: "Legacy payment transaction",
        category: "SALES",
        currency: "HTG",
        debit_account: "1010_BANK",
        credit_account: "1200_ACCOUNTS_RECEIVABLE",
        debit: 10000,
        credit: 10000,
        status: "POSTED",
        isImmutable: true,
        signerId: "usr1",
        source: "SYSTEM"
      },
      {
        id: "tx_pay_inv_001", // Duplicate ID
        business_id: businessId,
        branchId: "main",
        type: "TRANSFER",
        amount: 10000,
        amount_cents: 1000000,
        date: "2026-09-01",
        description: "Duplicate transaction",
        category: "SALES",
        currency: "HTG",
        debit_account: "1010_BANK",
        credit_account: "1200_ACCOUNTS_RECEIVABLE",
        debit: 10000,
        credit: 10000,
        status: "POSTED",
        isImmutable: true,
        signerId: "usr1",
        source: "SYSTEM"
      },
      {
        id: "tx_unbalanced_001",
        business_id: businessId,
        branchId: "main",
        type: "EXPENSE",
        amount: 5000,
        amount_cents: 500000,
        date: "2026-09-02",
        description: "Unbalanced OPEX",
        category: "OPEX",
        currency: "HTG",
        debit_account: "5000_OPEX",
        credit_account: "1010_BANK",
        debit: 5000,
        credit: 4000, // Unbalanced debit != credit
        status: "POSTED",
        isImmutable: true,
        signerId: "usr1",
        source: "SYSTEM"
      }
    ];

    const report = HistoricalLedgerAuditService.auditLedgerTransactions(businessId, testTxs);

    expect(report.isAuditClean).toBe(false);
    expect(report.summary.duplicateCount).toBe(1);
    expect(report.summary.legacyKeyCount).toBe(2);
    expect(report.summary.unbalancedCount).toBe(1);
  });

  it("distinguishes VALID_VALUE (0 HTG) from NO_DATA (N/A) without masking", () => {
    const zeroMetric = createCalculatedMetric(0);
    expect(zeroMetric.status).toBe("VALID_VALUE");
    expect(zeroMetric.value).toBe(0);
    expect(formatMetricDisplay(zeroMetric, (v) => `${v} HTG`)).toBe("0 HTG");

    const noDataMetric = createCalculatedMetric(null);
    expect(noDataMetric.status).toBe("NO_DATA");
    expect(noDataMetric.value).toBe(null);
    expect(formatMetricDisplay(noDataMetric, (v) => `${v} HTG`)).toBe("N/A");
  });

  it("prevents timezone boundary shift in getPeriodRanges across midnight", () => {
    // Midnight Date in local timezone
    const midnightLocal = new Date(2026, 8, 1, 0, 0, 0, 0); // 2026-09-01 00:00:00
    const ranges = AnalyticsEngine.getPeriodRanges("MONTH", undefined, midnightLocal);

    expect(ranges.current.startDate).toBe("2026-09-01");
    expect(ranges.current.endDate).toBe("2026-09-30");
  });
});
