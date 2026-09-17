import { describe, it, expect } from "vitest";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { AccrualBasisEngine } from "../../domains/analytics/services/AccrualBasisEngine";
import { LedgerTransaction } from "../../types";

const BIZ_ID = "biz_test_ssot_phase7e";
const RANGE = { startDate: "2026-09-01", endDate: "2026-09-30" };

describe("Phase 7E — Revenue KPI SSOT Golden Certification Matrix", () => {
  it("SC-01: Unpaid Invoice (100,000 HTG) -> Cash Revenue = 0, Accrual Revenue = 100,000", async () => {
    const unpaidTx = {
      id: "tx_sc01_unpaid",
      business_id: BIZ_ID,
      type: "INCOME",
      category: "SALES_INCOME",
      amount: 100000,
      status: "UNPAID",
      date: "2026-09-15T10:00:00Z",
      debit_account: "1200_ACCOUNTS_RECEIVABLE",
      credit_account: "4000_SALES_REVENUE",
      created_at: "2026-09-15T10:00:00Z",
    } as any as LedgerTransaction;

    const cashSnap = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: RANGE,
      businessId: BIZ_ID,
      transactions: [unpaidTx],
      accountingMode: "CASH",
    });

    const accrualSnap = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: RANGE,
      businessId: BIZ_ID,
      transactions: [unpaidTx],
      accountingMode: "ACCRUAL",
    });

    expect(cashSnap.revenue.currentValue).toBe(0);
    expect(accrualSnap.revenue.currentValue).toBe(100000);
  });

  it("SC-02: Paid Invoice (100,000 HTG) -> Cash Revenue = 100,000, Accrual Revenue = 100,000", async () => {
    const paidTx = {
      id: "tx_sc02_paid",
      business_id: BIZ_ID,
      type: "INCOME",
      category: "SALES_INCOME",
      amount: 100000,
      status: "PAID",
      date: "2026-09-15T10:00:00Z",
      debit_account: "1000_CASH",
      credit_account: "4000_SALES_REVENUE",
      created_at: "2026-09-15T10:00:00Z",
    } as any as LedgerTransaction;

    const cashSnap = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: RANGE,
      businessId: BIZ_ID,
      transactions: [paidTx],
      accountingMode: "CASH",
    });

    const accrualSnap = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: RANGE,
      businessId: BIZ_ID,
      transactions: [paidTx],
      accountingMode: "ACCRUAL",
    });

    expect(cashSnap.revenue.currentValue).toBe(100000);
    expect(accrualSnap.revenue.currentValue).toBe(100000);
  });

  it("SC-03: Recognized in Period P1 (Sept), Paid in Period P2 (Oct)", async () => {
    const period1Range = { startDate: "2026-09-01", endDate: "2026-09-30" };
    const period2Range = { startDate: "2026-10-01", endDate: "2026-10-31" };

    const crossPeriodTx = {
      id: "tx_sc03_cross_period",
      business_id: BIZ_ID,
      type: "INCOME",
      category: "SALES_INCOME",
      amount: 100000,
      status: "SETTLED",
      date: "2026-09-15T10:00:00Z", // Accounting Recognition Date (Sept)
      paymentDate: "2026-10-05T14:00:00Z", // Cash Settlement Date (Oct)
      debit_account: "1010_BANK",
      credit_account: "4000_SALES_REVENUE",
      created_at: "2026-09-15T10:00:00Z",
    } as any as LedgerTransaction;

    // Period P1 (September)
    const p1CashSnap = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: period1Range,
      businessId: BIZ_ID,
      transactions: [crossPeriodTx],
      accountingMode: "CASH",
    });

    const p1AccrualSnap = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: period1Range,
      businessId: BIZ_ID,
      transactions: [crossPeriodTx],
      accountingMode: "ACCRUAL",
    });

    expect(p1CashSnap.revenue.currentValue).toBe(0);
    expect(p1AccrualSnap.revenue.currentValue).toBe(100000);

    // Period P2 (October)
    const p2CashSnap = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: period2Range,
      businessId: BIZ_ID,
      transactions: [crossPeriodTx],
      accountingMode: "CASH",
    });

    const p2AccrualSnap = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: period2Range,
      businessId: BIZ_ID,
      transactions: [crossPeriodTx],
      accountingMode: "ACCRUAL",
    });

    expect(p2CashSnap.revenue.currentValue).toBe(100000);
    expect(p2AccrualSnap.revenue.currentValue).toBe(0);
  });

  it("SC-04: Reversed Income Transaction -> Revenue = 0 across Cash & Accrual", async () => {
    const reversedTx = {
      id: "tx_sc04_reversed",
      business_id: BIZ_ID,
      type: "INCOME",
      category: "SALES_INCOME",
      amount: 100000,
      status: "REVERSED",
      date: "2026-09-15T10:00:00Z",
      debit_account: "1000_CASH",
      credit_account: "4000_SALES_REVENUE",
      created_at: "2026-09-15T10:00:00Z",
    } as any as LedgerTransaction;

    const cashSnap = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: RANGE,
      businessId: BIZ_ID,
      transactions: [reversedTx],
      accountingMode: "CASH",
    });

    const accrualSnap = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: RANGE,
      businessId: BIZ_ID,
      transactions: [reversedTx],
      accountingMode: "ACCRUAL",
    });

    expect(cashSnap.revenue.currentValue).toBe(0);
    expect(accrualSnap.revenue.currentValue).toBe(0);
  });

  it("SC-05: Voided Income Transaction -> Revenue = 0 across Cash & Accrual", async () => {
    const voidedTx = {
      id: "tx_sc05_voided",
      business_id: BIZ_ID,
      type: "INCOME",
      category: "SALES_INCOME",
      amount: 100000,
      status: "VOIDED",
      date: "2026-09-15T10:00:00Z",
      debit_account: "1000_CASH",
      credit_account: "4000_SALES_REVENUE",
      created_at: "2026-09-15T10:00:00Z",
    } as any as LedgerTransaction;

    const cashSnap = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: RANGE,
      businessId: BIZ_ID,
      transactions: [voidedTx],
      accountingMode: "CASH",
    });

    const accrualSnap = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: RANGE,
      businessId: BIZ_ID,
      transactions: [voidedTx],
      accountingMode: "ACCRUAL",
    });

    expect(cashSnap.revenue.currentValue).toBe(0);
    expect(accrualSnap.revenue.currentValue).toBe(0);
  });

  it("SC-06: Cancelled Income Transaction -> Revenue = 0 across Cash & Accrual", async () => {
    const cancelledTx = {
      id: "tx_sc06_cancelled",
      business_id: BIZ_ID,
      type: "INCOME",
      category: "SALES_INCOME",
      amount: 100000,
      status: "CANCELLED",
      date: "2026-09-15T10:00:00Z",
      debit_account: "1000_CASH",
      credit_account: "4000_SALES_REVENUE",
      created_at: "2026-09-15T10:00:00Z",
    } as any as LedgerTransaction;

    const cashSnap = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: RANGE,
      businessId: BIZ_ID,
      transactions: [cancelledTx],
      accountingMode: "CASH",
    });

    const accrualSnap = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: RANGE,
      businessId: BIZ_ID,
      transactions: [cancelledTx],
      accountingMode: "ACCRUAL",
    });

    expect(cashSnap.revenue.currentValue).toBe(0);
    expect(accrualSnap.revenue.currentValue).toBe(0);
  });

  it("SC-07: Internal Treasury Transfer -> Revenue = 0 across Cash & Accrual", async () => {
    const transferTx = {
      id: "tx_sc07_transfer",
      business_id: BIZ_ID,
      type: "TRANSFER",
      category: "INTERNAL_TRANSFER",
      amount: 100000,
      status: "COMPLETED",
      date: "2026-09-15T10:00:00Z",
      debit_account: "1010_BANK",
      credit_account: "1000_CASH",
      created_at: "2026-09-15T10:00:00Z",
    } as any as LedgerTransaction;

    const cashSnap = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: RANGE,
      businessId: BIZ_ID,
      transactions: [transferTx],
      accountingMode: "CASH",
    });

    const accrualSnap = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: RANGE,
      businessId: BIZ_ID,
      transactions: [transferTx],
      accountingMode: "ACCRUAL",
    });

    expect(cashSnap.revenue.currentValue).toBe(0);
    expect(accrualSnap.revenue.currentValue).toBe(0);
  });

  it("SC-08: Payroll Payout Transaction -> Revenue = 0 across Cash & Accrual", async () => {
    const payrollTx = {
      id: "tx_sc08_payroll",
      business_id: BIZ_ID,
      type: "PAYROLL",
      category: "SALARY_DISBURSEMENT",
      amount: 100000,
      status: "PAID",
      date: "2026-09-15T10:00:00Z",
      debit_account: "5000_SALARY_EXPENSE",
      credit_account: "1010_BANK",
      created_at: "2026-09-15T10:00:00Z",
    } as any as LedgerTransaction;

    const cashSnap = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: RANGE,
      businessId: BIZ_ID,
      transactions: [payrollTx],
      accountingMode: "CASH",
    });

    const accrualSnap = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: RANGE,
      businessId: BIZ_ID,
      transactions: [payrollTx],
      accountingMode: "ACCRUAL",
    });

    expect(cashSnap.revenue.currentValue).toBe(0);
    expect(accrualSnap.revenue.currentValue).toBe(0);
  });

  it("SC-09: Transaction Date vs Recognition Date Resolution", async () => {
    const accrualEngineResult = await AccrualBasisEngine.generateSnapshot(
      BIZ_ID,
      RANGE,
      [
        {
          id: "tx_sc09_in_range",
          business_id: BIZ_ID,
          type: "INCOME",
          amount: 50000,
          status: "PAID",
          date: "2026-09-10T12:00:00Z",
        } as any as LedgerTransaction,
        {
          id: "tx_sc09_out_range",
          business_id: BIZ_ID,
          type: "INCOME",
          amount: 75000,
          status: "PAID",
          date: "2026-08-10T12:00:00Z",
        } as any as LedgerTransaction,
      ]
    );

    expect(accrualEngineResult.revenueRecognized).toBe(50000);
  });

  it("SC-10: Untagged / Cross-Tenant Transaction Isolation -> Revenue = 0 for Target Business", async () => {
    const otherTenantTx = {
      id: "tx_sc10_other_tenant",
      business_id: "biz_other_tenant_123",
      type: "INCOME",
      category: "SALES_INCOME",
      amount: 500000,
      status: "PAID",
      date: "2026-09-15T10:00:00Z",
    } as any as LedgerTransaction;

    const untaggedTx = {
      id: "tx_sc10_untagged",
      type: "INCOME",
      category: "SALES_INCOME",
      amount: 300000,
      status: "PAID",
      date: "2026-09-15T10:00:00Z",
    } as any as LedgerTransaction;

    const accrualEngineResult = await AccrualBasisEngine.generateSnapshot(
      BIZ_ID,
      RANGE,
      [otherTenantTx, untaggedTx]
    );

    expect(accrualEngineResult.revenueRecognized).toBe(0);
  });
});
