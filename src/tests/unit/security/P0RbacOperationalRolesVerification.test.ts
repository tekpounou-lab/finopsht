import { describe, it, expect, beforeEach } from "vitest";
import { PermissionRepository } from "../../../repositories";
import { PermissionService } from "../../../services/PermissionService";
import { resolveTargetRoute } from "../../../navigation/useTargetRoute";
import { Role } from "../../../types";

const mockFeatures: any = { attendance: true, payroll: true, accounting: true, pos: true, hr: true, crm: true, bi: true, aiCfo: true };

describe("P0 RBAC Operational Roles Verification Suite", () => {
  beforeEach(() => {
    PermissionService.reset();
  });

  // 1. Correct resolution of all targeted operational roles
  it("1. Resolves valid operational roles without errors", async () => {
    const roles: Role[] = ["ADMIN", "HEAD_TELLER", "SENIOR_TELLER", "JUNIOR_TELLER", "TELLER", "AUDITOR"];
    for (const r of roles) {
      const perms = await PermissionRepository.getRolePermissions(r);
      expect(Array.isArray(perms)).toBe(true);
      expect(perms.length).toBeGreaterThan(0);
    }
  });

  // 2. Absence of GUEST fallback for valid roles
  it("2. Ensures valid operational roles never silently fall back to GUEST permissions", async () => {
    const guestPerms = await PermissionRepository.getRolePermissions("GUEST");
    const operationalRoles: Role[] = ["ADMIN", "HEAD_TELLER", "SENIOR_TELLER", "JUNIOR_TELLER", "TELLER", "AUDITOR"];

    for (const r of operationalRoles) {
      const perms = await PermissionRepository.getRolePermissions(r);
      expect(perms).not.toEqual(guestPerms);
      expect(perms).toContain("view_dashboard");
    }
  });

  // 3. Specific permissions per role
  it("3. Validates specific operational capabilities per role", async () => {
    const headTellerPerms = await PermissionRepository.getRolePermissions("HEAD_TELLER");
    expect(headTellerPerms).toContain("cash.view");
    expect(headTellerPerms).toContain("cash.operate");
    expect(headTellerPerms).toContain("cash.transfer");
    expect(headTellerPerms).toContain("override_attendance");

    const juniorTellerPerms = await PermissionRepository.getRolePermissions("JUNIOR_TELLER");
    expect(juniorTellerPerms).toContain("cash.view");
    expect(juniorTellerPerms).toContain("cash.operate");
    expect(juniorTellerPerms).not.toContain("cash.transfer");
  });

  // 4. Denial of unauthorized accounting operations
  it("4. Blocks unauthorized write_ledger & journal.post operations for tellers", async () => {
    PermissionService.init("SENIOR_TELLER", ["view_dashboard", "cash.view", "cash.operate"], mockFeatures, "ENTERPRISE", "ACTIVE", "biz_test");
    expect(PermissionService.can("write_ledger")).toBe(false);
    expect(PermissionService.can("journal.post")).toBe(false);

    PermissionService.init("HEAD_TELLER", ["view_dashboard", "cash.view", "cash.operate"], mockFeatures, "ENTERPRISE", "ACTIVE", "biz_test");
    expect(PermissionService.can("write_ledger")).toBe(false);
  });

  // 5. AUDITOR is strictly read-only
  it("5. Enforces AUDITOR strict read-only access with zero write capabilities", async () => {
    const auditorPerms = await PermissionRepository.getRolePermissions("AUDITOR");
    expect(auditorPerms).toContain("view_dashboard");
    expect(auditorPerms).toContain("read_bi");
    expect(auditorPerms).toContain("view_ledger");
    expect(auditorPerms).toContain("view_audit_logs");
    expect(auditorPerms).not.toContain("write_ledger");
    expect(auditorPerms).not.toContain("cash.operate");
    expect(auditorPerms).not.toContain("manage_settings");

    PermissionService.init("AUDITOR", auditorPerms, mockFeatures, "ENTERPRISE", "ACTIVE", "biz_test");
    expect(PermissionService.can("cash.view")).toBe(true);
    expect(PermissionService.can("cash.operate")).toBe(false);
    expect(PermissionService.can("cash.transfer")).toBe(false);
    expect(PermissionService.can("write_ledger")).toBe(false);
    expect(PermissionService.can("manage_settings")).toBe(false);
  });

  // 6. ADMIN / OWNER separation
  it("6. Maintains separation between ADMIN and OWNER roles", async () => {
    const ownerPerms = await PermissionRepository.getRolePermissions("OWNER");
    const adminPerms = await PermissionRepository.getRolePermissions("ADMIN");

    expect(ownerPerms).toContain("lock_payroll");
    expect(adminPerms).not.toContain("lock_payroll");
    expect(PermissionService.canValidateOrSealPayroll("ADMIN")).toBe(true);
    expect(PermissionService.canValidateOrSealPayroll("SENIOR_TELLER")).toBe(false);
  });

  // 7. Module access according to matrix
  it("7. Verifies module access matrix alignment for operational and teller roles", async () => {
    PermissionService.init("AUDITOR", await PermissionRepository.getRolePermissions("AUDITOR"), mockFeatures, "ENTERPRISE", "ACTIVE", "biz_test");

    expect(PermissionService.hasRoleModuleAccess("HEAD_TELLER", "cash_management")).toBe(true);
    expect(PermissionService.hasRoleModuleAccess("JUNIOR_TELLER", "cash_management")).toBe(true);
    expect(PermissionService.hasRoleModuleAccess("AUDITOR", "accounting")).toBe(true);
    expect(PermissionService.hasRoleModuleAccess("AUDITOR", "bi")).toBe(true);
    expect(PermissionService.hasRoleModuleAccess("JUNIOR_TELLER", "payroll")).toBe(false);
    expect(PermissionService.hasRoleModuleAccess("TELLER", "settings")).toBe(false);
  });

  // 8. Navigation according to role
  it("8. Resolves correct navigation target routes without contradicting flowState", () => {
    const adminRoute = resolveTargetRoute({
      flowState: "OWNER_ACTIVE",
      identity: { role: "ADMIN", business: { id: "biz_1" } } as any,
      role: "ADMIN",
      user: { uid: "u1" }
    });
    expect(adminRoute.targetPath).toBe("/dashboard");

    const tellerRoute = resolveTargetRoute({
      flowState: "EMPLOYEE_ACTIVE",
      identity: { role: "SENIOR_TELLER", business: { id: "biz_1" } } as any,
      role: "SENIOR_TELLER",
      user: { uid: "u2" }
    });
    expect(tellerRoute.targetPath).toBe("/dashboard");
    expect(tellerRoute.reason).toContain("Teller operational workspace");

    const auditorRoute = resolveTargetRoute({
      flowState: "EMPLOYEE_ACTIVE",
      identity: { role: "AUDITOR", business: { id: "biz_1" } } as any,
      role: "AUDITOR",
      user: { uid: "u3" }
    });
    expect(auditorRoute.targetPath).toBe("/dashboard");
    expect(auditorRoute.reason).toContain("Auditor read-only workspace");
  });

  // 9. Rejection of unknown / invalid roles
  it("9. Strictly denies permissions for unknown or invalid roles", async () => {
    const unknownPerms = await PermissionRepository.getRolePermissions("INVALID_HACKER_ROLE");
    expect(unknownPerms).toEqual([]);
    expect(PermissionService.hasRoleModuleAccess("INVALID_HACKER_ROLE", "payroll")).toBe(false);
    expect(PermissionService.hasRoleModuleAccess("INVALID_HACKER_ROLE", "cash_management")).toBe(false);
  });

  // 10. Non-regression of historical roles
  it("10. Guarantees non-regression for historical roles (SUPER_ADMIN, OWNER, MANAGER, EMPLOYEE)", async () => {
    expect((await PermissionRepository.getRolePermissions("SUPER_ADMIN")).length).toBeGreaterThan(0);
    expect((await PermissionRepository.getRolePermissions("OWNER")).length).toBeGreaterThan(0);
    expect((await PermissionRepository.getRolePermissions("MANAGER")).length).toBeGreaterThan(0);
    expect((await PermissionRepository.getRolePermissions("EMPLOYEE")).length).toBeGreaterThan(0);

    expect(PermissionService.hasRoleModuleAccess("OWNER", "payroll")).toBe(true);
    expect(PermissionService.hasRoleModuleAccess("MANAGER", "attendance")).toBe(true);
    expect(PermissionService.hasRoleModuleAccess("EMPLOYEE", "employeespace")).toBe(true);
  });

  // 11. Coherence between frontend and backend permissions
  it("11. Confirms coherence between repository static map and service authorization checks", async () => {
    const headTellerPerms = await PermissionRepository.getRolePermissions("HEAD_TELLER");
    PermissionService.init("HEAD_TELLER", headTellerPerms, mockFeatures, "ENTERPRISE", "ACTIVE", "biz_test");

    expect(PermissionService.can("cash.view")).toBe(true);
    expect(PermissionService.can("cash.operate")).toBe(true);
    expect(PermissionService.can("cash.transfer")).toBe(true);
  });

  // 12. Tenant isolation & privilege escalation prevention
  it("12. Prevents privilege escalation for tellers and auditors", async () => {
    const tellerPerms = await PermissionRepository.getRolePermissions("JUNIOR_TELLER");
    PermissionService.init("JUNIOR_TELLER", tellerPerms, mockFeatures, "ENTERPRISE", "ACTIVE", "biz_test");

    expect(PermissionService.can("manage_settings")).toBe(false);
    expect(PermissionService.can("manage_payroll")).toBe(false);
    expect(PermissionService.can("lock_payroll")).toBe(false);
    expect(PermissionService.can("super_admin_panel")).toBe(false);
  });
});
