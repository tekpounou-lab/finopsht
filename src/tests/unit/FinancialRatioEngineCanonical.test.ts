import { describe, it, expect } from "vitest";
import { FinancialRatioEngine } from "../../services/cfo/FinancialRatioEngine";

describe("FinancialRatioEngine Canonical Semantic States & Zero vs NO_DATA Tests", () => {
  it("Test CFO-01: Revenue collection empty -> Revenue = NO_DATA (NOT 0, NOT 50,000)", () => {
    const report = FinancialRatioEngine.calculate({
      business: { id: "biz_1", name: "FinOps HT", currency: "HTG" },
      ledger: [],
      attendance: [],
      payroll: []
    });

    expect(report.semantic_states?.revenue).toBe("NO_DATA");
    expect(report.metrics.revenue_state).toBe("NO_DATA");
    expect(report.chartsData.find(c => c.name.includes("Revenus"))?.value).toBe(0);
    // Must NOT contain synthetic 50,000 or 60,000
    expect(report.chartsData.find(c => c.name.includes("Revenus"))?.value).not.toBe(50000);
    expect(report.chartsData.find(c => c.name.includes("Revenus"))?.value).not.toBe(60000);
  });

  it("Test CFO-02: Revenue explicitly equals 0 -> Revenue = ZERO / 0", () => {
    const report = FinancialRatioEngine.calculate({
      business: { id: "biz_1", name: "FinOps HT", currency: "HTG" },
      snapshot: {
        id: "snap_zero",
        revenue: { currentValue: 0 },
        expenses: { currentValue: 0 },
        profit: { currentValue: 0 }
      },
      ledger: [],
      attendance: [],
      payroll: []
    });

    expect(report.semantic_states?.revenue).toBe("ZERO");
    expect(report.metrics.revenue_state).toBe("ZERO");
    expect(report.chartsData.find(c => c.name.includes("Revenus"))?.value).toBe(0);
  });

  it("Test CFO-03: Payroll collection empty -> Payroll = NO_DATA (NOT 145,000)", () => {
    const report = FinancialRatioEngine.calculate({
      business: { id: "biz_1", name: "FinOps HT", currency: "HTG" },
      ledger: [],
      attendance: [],
      payroll: []
    });

    expect(report.semantic_states?.payroll).toBe("NO_DATA");
    expect(report.metrics.payroll_state).toBe("NO_DATA");
    expect(report.predictions.next_fortnight_payroll).toBe(0);
    expect(report.predictions.next_fortnight_payroll).not.toBe(145000);
  });

  it("Test CFO-04: Attendance collection empty -> Absenteeism = NO_DATA (NOT 4.8%)", () => {
    const report = FinancialRatioEngine.calculate({
      business: { id: "biz_1", name: "FinOps HT", currency: "HTG" },
      ledger: [],
      attendance: [],
      payroll: []
    });

    expect(report.semantic_states?.attendance).toBe("NO_DATA");
    expect(report.metrics.attendance_state).toBe("NO_DATA");
    expect(report.predictions.absenteeism_rate_percentage).toBe(0);
    expect(report.predictions.absenteeism_rate_percentage).not.toBe(4.8);
  });

  it("Test CFO-05: Revenue = 0 and expenses = 0 -> Profit = ZERO, Margin = UNDEFINED (NOT 15.4%)", () => {
    const report = FinancialRatioEngine.calculate({
      business: { id: "biz_1", name: "FinOps HT", currency: "HTG" },
      snapshot: {
        id: "snap_zero",
        revenue: { currentValue: 0 },
        expenses: { currentValue: 0 },
        profit: { currentValue: 0 }
      },
      ledger: [],
      attendance: [],
      payroll: []
    });

    expect(report.semantic_states?.profit).toBe("ZERO");
    expect(report.semantic_states?.margin).toBe("UNDEFINED");
    expect(report.metrics.profit_ratio).toBe("INDÉTERMINÉ (0/0)");
    expect(report.metrics.profit_ratio).not.toBe("15.4%");
  });

  it("Test CFO-06: Revenue > 0 and expenses valid -> Actual calculated margin", () => {
    const report = FinancialRatioEngine.calculate({
      business: { id: "biz_1", name: "FinOps HT", currency: "HTG" },
      snapshot: {
        id: "snap_val",
        revenue: { currentValue: 100000 },
        expenses: { currentValue: 70000 },
        profit: { currentValue: 30000 }
      },
      ledger: [],
      attendance: [],
      payroll: []
    });

    expect(report.semantic_states?.profit).toBe("VALUE");
    expect(report.semantic_states?.margin).toBe("VALUE");
    expect(report.metrics.profit_ratio).toBe("30.0%");
  });

  it("Test CFO-07: Missing cash data -> Cash = NO_DATA (NOT 40,000)", () => {
    const report = FinancialRatioEngine.calculate({
      business: { id: "biz_1", name: "FinOps HT", currency: "HTG" },
      ledger: [],
      attendance: [],
      payroll: []
    });

    expect(report.semantic_states?.cash).toBe("NO_DATA");
    expect(report.metrics.cash_state).toBe("NO_DATA");
    expect(report.chartsData.find(c => c.name.includes("Marge"))?.value).toBe(0);
    expect(report.chartsData.find(c => c.name.includes("Marge"))?.value).not.toBe(40000);
  });

  it("Test CFO-08: Missing data in fallback mode -> No synthetic financial number appears in output", () => {
    const report = FinancialRatioEngine.calculate({}, "Network Error");

    expect(report.predictions.next_fortnight_payroll).toBe(0);
    expect(report.predictions.end_of_month_cash_flow).toBe(0);
    expect(report.predictions.absenteeism_rate_percentage).toBe(0);
    expect(report.predictions.estimated_monthly_profit).toBe(0);
    expect(report.predictions.budget_overrun_risk).toBe("NO_DATA");
    expect(report.metrics.profit_ratio).toBe("DONNÉES INSUFFISANTES");
  });

  it("Test CFO-09: Static financial health score removed. Health score derived or NO_DATA", () => {
    const reportEmpty = FinancialRatioEngine.calculate({
      business: { id: "biz_1", name: "FinOps HT", currency: "HTG" },
      ledger: []
    });
    expect(reportEmpty.metrics.financial_health_score).toBeNull();
    expect(reportEmpty.semantic_states?.health_score).toBe("NO_DATA");

    const reportWithData = FinancialRatioEngine.calculate({
      business: { id: "biz_1", name: "FinOps HT", currency: "HTG" },
      snapshot: {
        id: "snap_health",
        revenue: { currentValue: 100000 },
        expenses: { currentValue: 40000 },
        profit: { currentValue: 60000 }
      },
      ledger: [],
      attendance: [
        { id: "att_1", status: "PRESENT" }
      ]
    });
    expect(reportWithData.metrics.financial_health_score).toBeTypeOf("number");
    expect(reportWithData.semantic_states?.health_score).toBe("VALUE");
    expect(reportWithData.metrics.financial_health_score).toBeGreaterThanOrEqual(0);
    expect(reportWithData.metrics.financial_health_score).toBeLessThanOrEqual(100);
  });

  it("Test CFO-10: Currency isolation. HTG data must not become USD. USD data must not become HTG. No static FX.", () => {
    const reportHTG = FinancialRatioEngine.calculate({
      business: { id: "biz_1", name: "FinOps HT", currency: "HTG" },
      snapshot: {
        id: "snap_htg",
        revenue: { currentValue: 50000 },
        expenses: { currentValue: 20000 },
        profit: { currentValue: 30000 }
      },
      ledger: []
    });
    expect(reportHTG.chartsData[0].name).toBe("Revenus (HTG)");
    expect(reportHTG.metrics.cash_flow).toContain("HTG");

    const reportUSD = FinancialRatioEngine.calculate({
      business: { id: "biz_2", name: "FinOps Global", currency: "USD" },
      snapshot: {
        id: "snap_usd",
        revenue: { currentValue: 5000 },
        expenses: { currentValue: 2000 },
        profit: { currentValue: 3000 }
      },
      ledger: []
    });
    expect(reportUSD.chartsData[0].name).toBe("Revenus (USD)");
    expect(reportUSD.metrics.cash_flow).toContain("USD");
    expect(reportUSD.metrics.cash_flow).not.toContain("HTG");
  });
});
