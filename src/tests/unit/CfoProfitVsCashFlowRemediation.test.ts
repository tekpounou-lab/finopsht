import { describe, it, expect } from "vitest";
import { FinancialRatioEngine } from "../../services/cfo/FinancialRatioEngine";

describe("CFO Remediation Phase 9C.5.2 Verification Tests", () => {
  it("Test REM-01: PROFIT !== CASH FLOW. Decouples net profit balance and cash flow", () => {
    // Create a scenario where netProfit (from accrual) is positive (+40,000) but netCashFlow is negative (-15,000)
    const report = FinancialRatioEngine.calculate({
      business: { id: "biz_1", name: "FinOps HT", currency: "HTG" },
      snapshot: {
        id: "snap_1",
        revenue: { currentValue: 100000 },
        expenses: { currentValue: 60000 },
        profit: { currentValue: 40000 }, // Accrual net profit
        netCashFlow: { currentValue: -15000 } // Canonical Cash basis flow
      },
      ledger: [],
      attendance: [],
      payroll: []
    });

    // Net profit ratio state is derived from accrual profit
    expect(report.metrics.profit_ratio).toBe("40.0%");
    expect(report.semantic_states?.profit).toBe("VALUE");

    // Cash flow metrics is strictly derived from netCashFlow and NOT net profit balance!
    expect(report.metrics.cash_flow).toContain("Déficitaire (-15,000 HTG)");
    expect(report.metrics.cash_state).toBe("VALUE");
  });

  it("Test REM-02: Absence of canonical cash flow yields strict NO_DATA", () => {
    // Create a scenario where accrual profit is present (+40,000) but netCashFlow is undefined/missing
    const report = FinancialRatioEngine.calculate({
      business: { id: "biz_1", name: "FinOps HT", currency: "HTG" },
      snapshot: {
        id: "snap_1",
        revenue: { currentValue: 100000 },
        expenses: { currentValue: 60000 },
        profit: { currentValue: 40000 } // Accrual profit is present
        // netCashFlow is missing!
      },
      ledger: [],
      attendance: [],
      payroll: []
    });

    // Cash state must be NO_DATA and descriptive string must return the appropriate state
    expect(report.metrics.cash_state).toBe("NO_DATA");
    expect(report.metrics.cash_flow).toContain("Données de flux de trésorerie non disponibles (NO_DATA)");
  });

  it("Test REM-03: Forecaster starting cash flow balance utilizes canonical cash flow if available", () => {
    const report = FinancialRatioEngine.calculate({
      business: { id: "biz_1", name: "FinOps HT", currency: "HTG" },
      snapshot: {
        id: "snap_1",
        revenue: { currentValue: 100000 },
        expenses: { currentValue: 60000 },
        profit: { currentValue: 40000 },
        netCashFlow: { currentValue: 25000 } // Canonical starting cash
      },
      ledger: [],
      attendance: [],
      payroll: []
    });

    // Forecast: startingCash (25,000) + (100,000 * 0.42) - (60,000 * 0.38)
    // = 25,000 + 42,000 - 22,800 = 44,200
    expect(report.predictions.end_of_month_cash_flow).toBe(44200);

    // Justification contains the non-authoritative warning
    expect(report.predictions.forecast_justification).toContain("PROJECTION HYPOTHÉTIQUE NON-AUTORITATIVE");
    expect(report.predictions.forecast_justification).toContain("0.42");
    expect(report.predictions.forecast_justification).toContain("0.38");
  });

  it("Test REM-04: Blocking forecast projections when cash flow data is missing", () => {
    const report = FinancialRatioEngine.calculate({
      business: { id: "biz_1", name: "FinOps HT", currency: "HTG" },
      snapshot: {
        id: "snap_1",
        revenue: { currentValue: 100000 },
        expenses: { currentValue: 60000 },
        profit: { currentValue: 40000 }
        // netCashFlow is missing
      },
      ledger: [],
      attendance: [],
      payroll: []
    });

    // Projections are blocked
    expect(report.predictions.end_of_month_cash_flow).toBe(0);
    expect(report.predictions.forecast_justification).toContain("Projections bloquées (NO_DATA / UNDEFINED)");
  });
});
