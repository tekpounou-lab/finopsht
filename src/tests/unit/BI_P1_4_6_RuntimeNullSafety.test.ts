import { describe, it, expect } from "vitest";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { ExecutiveRecommendationEngine } from "../../domains/analytics/services/ExecutiveRecommendationEngine";
import { ExecutiveAlertEngine } from "../../domains/analytics/services/ExecutiveAlertEngine";
import { ExecutiveScoreEngine } from "../../domains/analytics/services/ExecutiveScoreEngine";
import { AnalyticsSnapshot, KPIComparison } from "../../domains/analytics/types";

describe("BI-P1.4.6 — Runtime Null-Safety Verification", () => {

  const createEmptyComparison = <T extends number | null>(val: T): KPIComparison<T> => ({
    currentValue: val,
    previousValue: val,
    difference: val,
    differencePercentage: val,
    trend: "STABLE",
    direction: "NEUTRAL",
    state: val === null ? "NO_DATA" : "VALID_ZERO"
  });

  const nullSnapshot: AnalyticsSnapshot = {
    period: "MONTH",
    generatedAt: new Date().toISOString(),
    revenue: createEmptyComparison(null as any),
    quickbooksSalesRevenue: createEmptyComparison(null as any),
    expenses: createEmptyComparison(null as any),
    operationalExpenses: createEmptyComparison(null as any),
    profit: createEmptyComparison(null as any),
    cashOnHand: createEmptyComparison(null as any),
    burnRate: createEmptyComparison(null as any),
    payrollCost: createEmptyComparison(null as any),
    activeStaff: createEmptyComparison(null as any),
    attendanceRate: createEmptyComparison(null as any),
    latenessRate: createEmptyComparison(null as any),
    absenceRate: createEmptyComparison(null as any),
    avgHoursWorked: createEmptyComparison(null as any),
    advanceExposure: createEmptyComparison(null as any),
    commissionsPaid: createEmptyComparison(null as any),
    branchPerformance: [],
    departmentPerformance: [],
    employeeScorecards: [],
    historicalTrends: [],
    expenseBreakdown: [],
    forecast: { forecast7Days: 0, forecast15Days: 0, forecast30Days: 0 },
    anomalies: [],
    businessHealthScore: 0,
    profitMargin: 0,
    payrollCostRatio: 0
  };

  describe("AnalyticsEngine.compareNullableValues", () => {
    it("handles null current value correctly (NO_DATA)", () => {
      const res = AnalyticsEngine.compareNullableValues(null, 100);
      expect(res.currentValue).toBeNull();
      expect(res.state).toBe("NO_DATA");
      expect(res.difference).toBeNull();
    });

    it("handles null previous value correctly", () => {
      const res = AnalyticsEngine.compareNullableValues(100, null);
      expect(res.currentValue).toBe(100);
      expect(res.previousValue).toBeNull();
      expect(res.difference).toBeNull();
      expect(res.differencePercentage).toBe(0);
    });

    it("handles NaN safely (should not crash)", () => {
      // @ts-ignore - testing runtime safety for bad data
      const res = AnalyticsEngine.compareNullableValues(NaN, 100);
      expect(res.currentValue).toBeNaN();
    });
  });

  describe("ExecutiveRecommendationEngine", () => {
    it("generates default recommendations when snapshot contains nulls", () => {
      const recs = ExecutiveRecommendationEngine.generateRecommendations(nullSnapshot);
      expect(recs.length).toBeGreaterThan(0);
      expect(recs[0].id).toBe("rec_perfect_pacing");
    });

    it("does not crash with NaN values", () => {
      const badSnapshot = {
        ...nullSnapshot,
        attendanceRate: createEmptyComparison(NaN as any)
      };
      const recs = ExecutiveRecommendationEngine.generateRecommendations(badSnapshot as any);
      expect(recs).toBeDefined();
    });
  });

  describe("ExecutiveAlertEngine", () => {
    it("generates perfect health alert when snapshot is null-filled", () => {
      const alerts = ExecutiveAlertEngine.generateAlerts(nullSnapshot);
      expect(alerts.length).toBe(1);
      expect(alerts[0].id).toBe("alert_perfect_health");
    });

    it("handles null values in alert conditions", () => {
      const alerts = ExecutiveAlertEngine.generateAlerts(nullSnapshot);
      expect(alerts).toBeDefined();
      // Should not trigger revenue drop alert if rev.currentValue is null
      expect(alerts.find(a => a.id === "alert_rev_drop")).toBeUndefined();
    });
  });

  describe("ExecutiveScoreEngine", () => {
    it("calculates baseline scores for null snapshot", () => {
      const scores = ExecutiveScoreEngine.calculateScorecards(nullSnapshot);
      expect(scores.length).toBe(8);
      scores.forEach(s => {
        expect(s.score).toBe(0);
        expect(s.explanation).toContain("Aucune transaction");
      });
    });

    it("handles null attendance rate gracefully", () => {
      const snapWithActivity = {
        ...nullSnapshot,
        revenue: createEmptyComparison(1000),
        attendanceRate: createEmptyComparison(null)
      };
      const scores = ExecutiveScoreEngine.calculateScorecards(snapWithActivity as any);
      const opHealth = scores.find(s => s.name === "Operational Health");
      expect(opHealth).toBeDefined();
      expect(opHealth?.explanation).toContain("N/D");
    });
  });
});
