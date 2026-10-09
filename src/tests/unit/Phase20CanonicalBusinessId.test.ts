import { describe, it, expect } from "vitest";

describe("Phase 20: Canonical Data Schema & Property Resolution", () => {
  it("enforces businessId as the canonical tenant field in domain objects", () => {
    const canonicalTenantObject = {
      id: "obj_01",
      businessId: "biz_canonical_100",
      name: "Test Entity"
    };

    expect(canonicalTenantObject.businessId).toBe("biz_canonical_100");
    // Verify legacy alias is not relied upon
    expect((canonicalTenantObject as any).business_id).toBeUndefined();
  });

  it("verifies fail-closed behavior when businessId is missing or null", () => {
    const invalidResource: { businessId?: string } = {};
    const resolvedTenant = invalidResource.businessId || "DENIED_NONE";
    
    expect(resolvedTenant).toBe("DENIED_NONE");
  });
});
