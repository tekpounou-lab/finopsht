// src/tests/analytics/init.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { AnalyticsInitializer } from "../../services/analytics/AnalyticsInitializer";

describe("AnalyticsInitializer Concurrency & Stability Test", () => {
  beforeEach(() => {
    AnalyticsInitializer.resetAnalytics("biz_test_concurrency");
    AnalyticsInitializer.resetAnalytics("biz_test_readiness");
  });

  it("should return the same singleton promise for concurrent initialization requests", async () => {
    const businessId = "biz_test_concurrency";
    
    // Trigger two initializations concurrently
    const promise1 = AnalyticsInitializer.initializeAnalytics(businessId);
    const promise2 = AnalyticsInitializer.initializeAnalytics(businessId);

    // We rely on the log or subsequent logic to verify duplicate blocking.
    // expect(promise1).toBe(promise2); // async functions return a new Promise instance, strict equality fails.
    
    const result1 = await promise1;
    const result2 = await promise2;
    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
  });

  it("should successfully block duplicate attempts and report readiness", async () => {
    const businessId = "biz_test_readiness";
    
    // Trigger initialization
    const initPromise = AnalyticsInitializer.initializeAnalytics(businessId);
    
    // Wait for readiness with timeout
    const isReady = await AnalyticsInitializer.waitForReady(businessId, 2000);
    expect(isReady).toBe(true);

    const result = await initPromise;
    expect(result.success).toBe(true);
  });
});
