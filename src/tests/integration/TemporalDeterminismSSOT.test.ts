import { describe, it, expect } from "vitest";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";

describe("Temporal Determinism and Timezone Invariant Tests", () => {
  const businessId = "biz_temporal_test";
  const refDateFixed = new Date("2026-09-15T12:00:00Z");

  it("getPeriodRanges TODAY anchored to referenceDate is strictly deterministic", () => {
    const { current, previous } = AnalyticsEngine.getPeriodRanges("TODAY", undefined, refDateFixed);
    
    expect(current.startDate).toBe("2026-09-15");
    expect(current.endDate).toBe("2026-09-15");
    expect(previous.startDate).toBe("2026-09-14");
    expect(previous.endDate).toBe("2026-09-14");
  });

  it("getPeriodRanges MONTH anchored to referenceDate is strictly deterministic", () => {
    const { current, previous } = AnalyticsEngine.getPeriodRanges("MONTH", undefined, refDateFixed);
    
    expect(current.startDate).toBe("2026-09-01");
    expect(current.endDate).toBe("2026-09-30");
    expect(previous.startDate).toBe("2026-08-01");
    expect(previous.endDate).toBe("2026-08-31");
  });

  it("generateSnapshot produces identical results across invocations with fixed referenceDate", () => {
    const snap1 = AnalyticsEngine.generateSnapshot({
      period: "MONTH",
      businessId,
      referenceDate: refDateFixed
    });

    const snap2 = AnalyticsEngine.generateSnapshot({
      period: "MONTH",
      businessId,
      referenceDate: refDateFixed
    });

    expect(snap1.revenue.currentValue).toBe(snap2.revenue.currentValue);
    expect(snap1.expenses.currentValue).toBe(snap2.expenses.currentValue);
    expect(snap1.profit.currentValue).toBe(snap2.profit.currentValue);
  });
});
