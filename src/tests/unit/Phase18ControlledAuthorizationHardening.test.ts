import { describe, it, expect, beforeEach } from "vitest";
import { PermissionService } from "../../services/PermissionService";
import { AccessResolver, ActorIdentity, ProtectedResource } from "../../permissions/AccessResolver";
import { Employee } from "../../types";

describe("Phase 18: Controlled Authorization & Tenant-Isolation Hardening Test Suite", () => {
  beforeEach(() => {
    PermissionService.reset();
  });

  describe("1. ADV-17B-01: Unknown Capability Fail-Closed & Deny-by-Default", () => {
    const tenantRoles = ["OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "EMPLOYEE"];
    const unknownCapabilities = [
      "unknown_capability",
      "manage_cross_tenant_data",
      "future_global_capability",
      "random_new_permission",
      "system_root_access",
      "arbitrary_injected_claim"
    ];

    tenantRoles.forEach((role) => {
      it(`strictly denies unknown capabilities to ${role} (even with wildcard permissions)`, () => {
        PermissionService.init(
          role,
          ["all", "*", "unknown_capability", "system_root_access"],
          { attendance: true, payroll: true, accounting: true, hr: true, bi: true, pos: true, crm: true, aiCfo: true },
          "ENTERPRISE",
          "ACTIVE",
          "biz_tenant_01"
        );

        unknownCapabilities.forEach((cap) => {
          expect(PermissionService.can(cap)).toBe(false);
        });
      });
    });

    it("allows registered platform capabilities strictly to SUPER_ADMIN", () => {
      PermissionService.init(
        "SUPER_ADMIN",
        [],
        { attendance: true, payroll: true, accounting: true, hr: true, bi: true, pos: true, crm: true, aiCfo: true },
        "ENTERPRISE",
        "ACTIVE",
        null
      );

      expect(PermissionService.can("approve_business")).toBe(true);
      expect(PermissionService.can("reject_business")).toBe(true);
      expect(PermissionService.can("manage_licensing")).toBe(true);
      expect(PermissionService.can("manage_plans")).toBe(true);
      expect(PermissionService.can("manage_subscriptions")).toBe(true);
      expect(PermissionService.can("system_health")).toBe(true);
      expect(PermissionService.can("reliability_dlq")).toBe(true);
      expect(PermissionService.can("disaster_recovery")).toBe(true);
      expect(PermissionService.can("manage_system_config")).toBe(true);
      expect(PermissionService.can("manage_global_tax")).toBe(true);
      expect(PermissionService.can("delete_business")).toBe(true);
    });

    it("denies registered platform capabilities to OWNER", () => {
      PermissionService.init(
        "OWNER",
        ["all", "*"],
        { attendance: true, payroll: true, accounting: true, hr: true, bi: true, pos: true, crm: true, aiCfo: true },
        "ENTERPRISE",
        "ACTIVE",
        "biz_tenant_01"
      );

      const platformCaps = [
        "approve_business",
        "manage_licensing",
        "manage_plans",
        "manage_subscriptions",
        "view_all_businesses",
        "manage_global_payment_methods",
        "system_health",
        "reliability_dlq",
        "disaster_recovery",
        "forensic_audit",
        "manage_system_config",
        "manage_global_tax",
        "delete_business"
      ];

      platformCaps.forEach((cap) => {
        expect(PermissionService.can(cap)).toBe(false);
      });
    });
  });

  describe("2. ADV-17B-02: Subscription & Feature Entitlement Gates", () => {
    it("denies paid modules and capabilities to OWNER on STARTER tier", () => {
      PermissionService.init(
        "OWNER",
        ["read_bi", "use_aicfo", "view_ledger"],
        { attendance: true, payroll: true, accounting: true, hr: true, bi: true, pos: true, crm: true, aiCfo: true },
        "STARTER",
        "ACTIVE",
        "biz_tenant_01"
      );

      // Module checks
      expect(PermissionService.hasModule("bi")).toBe(false);
      expect(PermissionService.hasModule("aicfo")).toBe(false);
      expect(PermissionService.hasModule("accounting")).toBe(false);
      expect(PermissionService.hasModule("ledger")).toBe(false);

      // Capability checks
      expect(PermissionService.can("bi.read")).toBe(false);
      expect(PermissionService.can("read_bi")).toBe(false);
      expect(PermissionService.can("aicfo.use")).toBe(false);
      expect(PermissionService.can("use_aicfo")).toBe(false);
      expect(PermissionService.can("accounting.view")).toBe(false);
      expect(PermissionService.can("ledger.view")).toBe(false);
      expect(PermissionService.can("view_ledger")).toBe(false);

      // Role module access matrix
      expect(PermissionService.hasRoleModuleAccess("OWNER", "bi")).toBe(false);
      expect(PermissionService.hasRoleModuleAccess("OWNER", "aicfo")).toBe(false);
      expect(PermissionService.hasRoleModuleAccess("OWNER", "accounting")).toBe(false);
    });

    it("denies paid modules to OWNER when feature flag is explicitly disabled", () => {
      PermissionService.init(
        "OWNER",
        [],
        { attendance: true, payroll: true, accounting: false, hr: true, bi: false, pos: false, crm: false, aiCfo: false },
        "ENTERPRISE",
        "ACTIVE",
        "biz_tenant_01"
      );

      expect(PermissionService.hasModule("bi")).toBe(false);
      expect(PermissionService.hasModule("aicfo")).toBe(false);
      expect(PermissionService.hasModule("accounting")).toBe(false);
      expect(PermissionService.hasModule("ledger")).toBe(false);

      expect(PermissionService.can("bi.read")).toBe(false);
      expect(PermissionService.can("aicfo.use")).toBe(false);
      expect(PermissionService.can("accounting.view")).toBe(false);
      expect(PermissionService.can("ledger.view")).toBe(false);
    });

    it("allows paid modules to OWNER on eligible plan with enabled features", () => {
      PermissionService.init(
        "OWNER",
        [],
        { attendance: true, payroll: true, accounting: true, hr: true, bi: true, pos: true, crm: true, aiCfo: true },
        "ENTERPRISE",
        "ACTIVE",
        "biz_tenant_01"
      );

      expect(PermissionService.hasModule("bi")).toBe(true);
      expect(PermissionService.hasModule("aicfo")).toBe(true);
      expect(PermissionService.hasModule("accounting")).toBe(true);
      expect(PermissionService.hasModule("ledger")).toBe(true);

      expect(PermissionService.can("bi.read")).toBe(true);
      expect(PermissionService.can("aicfo.use")).toBe(true);
      expect(PermissionService.can("accounting.view")).toBe(true);
      expect(PermissionService.can("ledger.view")).toBe(true);
    });

    it("allows legitimate baseline ERP modules to OWNER on STARTER tier", () => {
      PermissionService.init(
        "OWNER",
        [],
        { attendance: true, payroll: true, accounting: true, hr: true, bi: true, pos: true, crm: true, aiCfo: true },
        "STARTER",
        "ACTIVE",
        "biz_tenant_01"
      );

      expect(PermissionService.hasModule("payroll")).toBe(true);
      expect(PermissionService.hasModule("personnel")).toBe(true);
      expect(PermissionService.hasModule("organization")).toBe(true);
      expect(PermissionService.hasModule("planning")).toBe(true);
      expect(PermissionService.hasModule("attendance")).toBe(true);
      expect(PermissionService.hasModule("settings")).toBe(true);

      expect(PermissionService.can("employee.create")).toBe(true);
      expect(PermissionService.can("employee.update")).toBe(true);
      expect(PermissionService.can("payroll.approve")).toBe(true);
      expect(PermissionService.can("attendance.log")).toBe(true);
    });
  });

  describe("3. ADV-17B-04: Strict Fail-Closed Resource Tenancy in AccessResolver", () => {
    const superAdminActor: ActorIdentity = {
      id: "usr_super_01",
      role: "SUPER_ADMIN"
    };

    const ownerTenantA: ActorIdentity = {
      id: "usr_owner_A",
      role: "OWNER",
      businessId: "biz_tenant_A"
    };

    const managerTenantA: ActorIdentity = {
      id: "usr_mgr_A",
      role: "MANAGER",
      businessId: "biz_tenant_A",
      branchId: "branch_nord_A"
    };

    const sampleEmployeeA: Employee = {
      id: "emp_target_A",
      businessId: "biz_tenant_A",
      branchId: "branch_nord_A",
      departmentId: "dept_nord_A",
      name: "Target Tenant A",
      email: "target@tenantA.com",
      role: "EMPLOYEE",
      baseSalary: 45000,
      paymentModel: "FIXED",
      status: "ACTIVE",
      isActive: true,
      contractType: "cdi",
      payRegime: "fixe"
    };

    const sampleEmployeeB: Employee = {
      id: "emp_target_B",
      businessId: "biz_tenant_B",
      branchId: "branch_sud_B",
      departmentId: "dept_sud_B",
      name: "Target Tenant B",
      email: "target@tenantB.com",
      role: "EMPLOYEE",
      baseSalary: 55000,
      paymentModel: "FIXED",
      status: "ACTIVE",
      isActive: true,
      contractType: "cdi",
      payRegime: "fixe"
    };

    it("allows OWNER access strictly within own businessId", () => {
      const resourceA: ProtectedResource = { businessId: "biz_tenant_A" };
      expect(AccessResolver.canAccessResource(ownerTenantA, resourceA)).toBe(true);
    });

    it("strictly denies OWNER access to resources of a different tenant (Cross-Tenant Breach)", () => {
      const resourceB: ProtectedResource = { businessId: "biz_tenant_B" };
      expect(AccessResolver.canAccessResource(ownerTenantA, resourceB)).toBe(false);
    });

    it("strictly denies OWNER access when resource businessId is missing or empty (Fail-Closed)", () => {
      expect(AccessResolver.canAccessResource(ownerTenantA, { employeeId: "emp_target_A" })).toBe(false);
      expect(AccessResolver.canAccessResource(ownerTenantA, {})).toBe(false);
      expect(AccessResolver.canAccessResource(ownerTenantA, null as any)).toBe(false);
      expect(AccessResolver.canAccessResource(ownerTenantA, undefined as any)).toBe(false);
      expect(AccessResolver.canAccessResource(ownerTenantA, { businessId: "" })).toBe(false);
      expect(AccessResolver.canAccessResource(ownerTenantA, { business_id: "" })).toBe(false);
    });

    it("strictly denies employee mutation when target lacks businessId (Fail-Closed)", () => {
      const unscopedTarget: any = {
        id: "emp_unscoped",
        name: "Unscoped Target",
        role: "EMPLOYEE"
      };

      expect(AccessResolver.canMutateEmployee(ownerTenantA, unscopedTarget)).toBe(false);
      expect(AccessResolver.canMutateEmployee(ownerTenantA, null as any)).toBe(false);
      expect(AccessResolver.canMutateEmployee(ownerTenantA, undefined as any)).toBe(false);
    });

    it("strictly denies payroll management when target lacks businessId (Fail-Closed)", () => {
      const unscopedTarget: any = {
        id: "emp_unscoped",
        name: "Unscoped Target",
        role: "EMPLOYEE"
      };

      expect(AccessResolver.canManagePayrollFor(ownerTenantA, unscopedTarget)).toBe(false);
      expect(AccessResolver.canManagePayrollFor(ownerTenantA, null as any)).toBe(false);
      expect(AccessResolver.canManagePayrollFor(ownerTenantA, undefined as any)).toBe(false);
    });

    it("allows SUPER_ADMIN global access across all tenants and unscoped resources", () => {
      expect(AccessResolver.canAccessResource(superAdminActor, { businessId: "biz_tenant_A" })).toBe(true);
      expect(AccessResolver.canAccessResource(superAdminActor, { businessId: "biz_tenant_B" })).toBe(true);
      expect(AccessResolver.canMutateEmployee(superAdminActor, sampleEmployeeA)).toBe(true);
      expect(AccessResolver.canMutateEmployee(superAdminActor, sampleEmployeeB)).toBe(true);
      expect(AccessResolver.canManagePayrollFor(superAdminActor, sampleEmployeeA)).toBe(true);
      expect(AccessResolver.canManagePayrollFor(superAdminActor, sampleEmployeeB)).toBe(true);
    });
  });

  describe("4. ADV-17B-03 & Forensic Anti-Tampering", () => {
    it("strictly forbids modify_forensic_log or delete_forensic_log for ALL roles including SUPER_ADMIN", () => {
      PermissionService.init("SUPER_ADMIN", ["all"], {} as any, "ENTERPRISE", "ACTIVE", null);
      expect(PermissionService.can("modify_forensic_log")).toBe(false);
      expect(PermissionService.can("delete_forensic_log")).toBe(false);

      PermissionService.init("OWNER", ["all"], {} as any, "ENTERPRISE", "ACTIVE", "biz_01");
      expect(PermissionService.can("modify_forensic_log")).toBe(false);
      expect(PermissionService.can("delete_forensic_log")).toBe(false);
    });
  });
});
