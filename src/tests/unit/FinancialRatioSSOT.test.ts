import { describe, it, expect } from "vitest";
import { FinancialRatioEngine } from "../../services/cfo/FinancialRatioEngine";
import { AICFOChatService } from "../../services/AICFOChatService";
import { generateFinancialMetrics } from "../../services/FinancialIntelligence";

describe("FinancialRatioEngine SSOT Invariant & AnalyticsSnapshot Consumption Tests", () => {
  it("Test A (SSOT-01): Canonical snapshot wins over contradictory raw ledger", () => {
    const report = FinancialRatioEngine.calculate({
      business: { id: "biz_1", name: "FinOps HT", currency: "HTG" },
      snapshot: {
        id: "snap_1",
        business_id: "biz_1",
        revenue: { currentValue: 100000 },
        expenses: { currentValue: 60000 },
        profit: { currentValue: 40000 },
        metrics: {
          revenue: { totalHTG: 100000 },
          expenses: { totalHTG: 60000 },
          profit: { netHTG: 40000 }
        }
      },
      // Contradictory raw ledger transactions that MUST BE IGNORED when snapshot is present
      ledger: [
        { id: "tx_1", type: "REVENUE", amount: 999999, status: "POSTED" },
        { id: "tx_2", type: "EXPENSE", amount: 500000, status: "POSTED" }
      ]
    });

    expect(report.semantic_states?.revenue).toBe("VALUE");
    const revenueChart = report.chartsData.find(c => c.name.includes("Revenus"));
    expect(revenueChart?.value).toBe(100000);
    expect(revenueChart?.value).not.toBe(999999);
  });

  it("Test B (SSOT-02): Absence of AnalyticsSnapshot with populated ledger -> NO raw financial reconstruction", () => {
    const report = FinancialRatioEngine.calculate({
      business: { id: "biz_1", name: "FinOps HT", currency: "HTG" },
      snapshot: undefined,
      ledger: [
        { id: "tx_1", type: "REVENUE", amount: 999999, status: "POSTED" },
        { id: "tx_2", type: "EXPENSE", amount: 500000, status: "POSTED" }
      ]
    });

    // FROZEN SSOT INVARIANT: Without snapshot, FinancialRatioEngine MUST NOT sum ledger
    expect(report.semantic_states?.revenue).toBe("NO_DATA");
    expect(report.metrics.revenue_state).toBe("NO_DATA");
    expect(report.metrics.expense_state).toBe("NO_DATA");
    const revenueChart = report.chartsData.find(c => c.name.includes("Revenus"));
    expect(revenueChart?.value).toBe(0);
    expect(revenueChart?.value).not.toBe(999999);
  });

  it("Test C (SSOT-03): Explicit AnalyticsSnapshot Revenue = 0 with non-zero ledger -> revenueState = ZERO, value = 0 preserved", () => {
    const report = FinancialRatioEngine.calculate({
      business: { id: "biz_1", name: "FinOps HT", currency: "HTG" },
      snapshot: {
        id: "snap_zero",
        revenue: { currentValue: 0 },
        expenses: { currentValue: 0 },
        profit: { currentValue: 0 }
      },
      ledger: [
        { id: "tx_1", type: "REVENUE", amount: 999999, status: "POSTED" }
      ]
    });

    expect(report.semantic_states?.revenue).toBe("ZERO");
    expect(report.metrics.revenue_state).toBe("ZERO");
    const revenueChart = report.chartsData.find(c => c.name.includes("Revenus"));
    expect(revenueChart?.value).toBe(0);
  });

  it("Test D (SSOT-04): AI CFO offline fallback with missing snapshot -> reports NO_DATA without raw ledger summation", async () => {
    const report = await AICFOChatService.queryCFO({
      business: { id: "biz_1", name: "FinOps HT", currency: "HTG", status: "ACTIVE" } as any,
      branch: null,
      employees: [],
      ledger: [
        { id: "tx_1", type: "INCOME", amount: 999999, status: "POSTED", business_id: "biz_1", date: "2026-01-01" } as any
      ],
      attendance: [],
      payroll: [],
      userQuestion: "Quel est le chiffre d'affaires ?",
      snapshot: undefined
    });

    // Forced offline error trigger returns local report
    expect(report.metrics.cash_flow).not.toContain("999");
  });

  it("Test E (SSOT-05): FinancialIntelligence consumes AnalyticsSnapshot when available", () => {
    const snapshot = {
      id: "snap_1",
      revenue: { currentValue: 500000 },
      expenses: { currentValue: 200000 },
      profit: { currentValue: 300000 }
    };

    const rawLedger = [
      { id: "tx_1", type: "INCOME", amount: 123456, status: "POSTED", business_id: "biz_1", date: "2026-01-01" } as any
    ];

    const metrics = generateFinancialMetrics(rawLedger, [], "biz_1", snapshot);
    expect(metrics.totalRevenue).toBe(500000);
    expect(metrics.totalExpenses).toBe(200000);
    expect(metrics.netProfit).toBe(300000);
    expect(metrics.totalRevenue).not.toBe(123456);
  });

  it("Test SSOT-06: Currency context is respected without static FX conversion", () => {
    const reportUSD = FinancialRatioEngine.calculate({
      business: { id: "biz_usd", name: "FinOps Global", currency: "USD" },
      snapshot: {
        id: "snap_usd",
        revenue: { currentValue: 12000 },
        expenses: { currentValue: 8000 },
        profit: { currentValue: 4000 },
        netCashFlow: { currentValue: 4000 }
      }
    });

    expect(reportUSD.chartsData[0].name).toBe("Revenus (USD)");
    expect(reportUSD.metrics.cash_flow).toContain("USD");
  });
});
