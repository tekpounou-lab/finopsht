import { describe, it, expect } from "vitest";
import { PerformanceService } from "../../services/performance/PerformanceService";

describe("PerformanceService Unit Tests", () => {
  it("tracks async query execution time and logs metrics", async () => {
    const mockExecutor = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { success: true };
    };

    const result = await PerformanceService.trackExecution(
      "query",
      "TestQuery",
      mockExecutor
    );

    expect(result.success).toBe(true);

    const report = PerformanceService.getReport();
    expect(report.totalMetricsLogged).toBeGreaterThan(0);
    expect(report.recentMetrics.some((m) => m.name === "TestQuery")).toBe(true);
  });

  it("registers and unsubscribes realtime listeners", () => {
    const unsub = PerformanceService.registerSubscription("sub_key_1");
    let report = PerformanceService.getReport();
    expect(report.activeSubscriptionsCount).toBe(1);

    unsub();
    report = PerformanceService.getReport();
    expect(report.activeSubscriptionsCount).toBe(0);
  });
});
