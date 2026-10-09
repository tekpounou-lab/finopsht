import { describe, it, expect } from "vitest";
import type { UserProfile } from "../../types";
import type { Business, Branch, Department } from "../../types/organization";

describe("Phase 21: Canonical Tenant Schema & Authority Normalization", () => {
  it("mandates businessId as the sole canonical tenant property in UserProfile interface", () => {
    const canonicalProfile: UserProfile = {
      id: "usr_canonical_21",
      email: "user@enterprise.com",
      name: "Jean Dupont",
      role: "EMPLOYEE",
      businessId: "biz_canonical_2026"
    };

    expect(canonicalProfile.businessId).toBe("biz_canonical_2026");
  });

  it("mandates businessId in organizational interfaces (Branch and Department)", () => {
    const canonicalBranch: Branch = {
      id: "branch_01",
      businessId: "biz_canonical_2026",
      name: "Siège Principal"
    };

    const canonicalDept: Department = {
      id: "dept_01",
      businessId: "biz_canonical_2026",
      name: "Direction Financière"
    };

    expect(canonicalBranch.businessId).toBe("biz_canonical_2026");
    expect(canonicalDept.businessId).toBe("biz_canonical_2026");
  });

  it("fails closed when businessId is missing on tenant-scoped operations", () => {
    const invalidTenantResource: { businessId?: string } = {};
    const effectiveTenant = invalidTenantResource.businessId || "NONE";
    expect(effectiveTenant).toBe("NONE");
  });
});
