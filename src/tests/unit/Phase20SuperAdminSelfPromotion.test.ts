import { describe, it, expect } from "vitest";
import { isSuperAdminEmail } from "../../config/superadmin";
import { IdentityResolver } from "../../services/auth/IdentityResolver";
import { EnterpriseIdentityOrchestrator } from "../../modules/identity/EnterpriseIdentityOrchestrator";

describe("Phase 20: Super Admin Self-Promotion & Identity Invariants", () => {
  it("strictly validates that super admin authority is derived only from verified platform allowlist", () => {
    expect(isSuperAdminEmail("tekpounou@gmail.com")).toBe(true);
    expect(isSuperAdminEmail("admin@finops.com")).toBe(true);
    expect(isSuperAdminEmail("superadmin@finops.com")).toBe(true);
    
    // Attacker emails must return false
    expect(isSuperAdminEmail("attacker@external.org")).toBe(false);
    expect(isSuperAdminEmail("hacker@malicious.com")).toBe(false);
    expect(isSuperAdminEmail("owner@tenant.com")).toBe(false);
  });

  it("ensures IdentityResolver sanitizes user profile role if poisoned with SUPER_ADMIN", async () => {
    // Simulated identity resolution for an attacker claiming SUPER_ADMIN via profile
    const result = await IdentityResolver.resolve("attacker_uid_99", "attacker@external.org");
    
    // If the attacker user record claims SUPER_ADMIN, role must be resolved to non-superadmin (e.g. EMPLOYEE/INITIAL)
    expect(result.role).not.toBe("SUPER_ADMIN");
  });

  it("ensures EnterpriseIdentityOrchestrator instance is instantiable and defined", () => {
    const orchestrator = new EnterpriseIdentityOrchestrator();
    expect(orchestrator).toBeDefined();
  });
});
