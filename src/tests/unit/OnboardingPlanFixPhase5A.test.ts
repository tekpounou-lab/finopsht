import { describe, it, expect } from "vitest";
import { resolveAndValidateSubscriptionPlan } from "../../services/business/WorkspaceProvisioningService";

describe("Phase 5A Correctif A — Onboarding Subscription Plan Transmission", () => {
  it("1. Request for PROFESSIONAL preserves PROFESSIONAL plan", () => {
    const plan = resolveAndValidateSubscriptionPlan("PROFESSIONAL");
    expect(plan).toBe("PROFESSIONAL");
  });

  it("2. Request for FREE_TIER preserves FREE_TIER plan", () => {
    const plan = resolveAndValidateSubscriptionPlan("FREE_TIER");
    expect(plan).toBe("FREE_TIER");
  });

  it("3. Request for ENTERPRISE preserves ENTERPRISE plan", () => {
    const plan = resolveAndValidateSubscriptionPlan("ENTERPRISE");
    expect(plan).toBe("ENTERPRISE");
  });

  it("4. Empty plan defaults safely to STARTER without converting PROFESSIONAL to FREE_TIER", () => {
    const plan = resolveAndValidateSubscriptionPlan("");
    expect(plan).toBe("STARTER");
  });

  it("5. Invalid plan throws explicit INVALID_SUBSCRIPTION_PLAN error", () => {
    expect(() => resolveAndValidateSubscriptionPlan("INVALID_PLAN_X")).toThrowError(
      "INVALID_SUBSCRIPTION_PLAN: Plan 'INVALID_PLAN_X' is not supported by the catalog."
    );
  });
});
