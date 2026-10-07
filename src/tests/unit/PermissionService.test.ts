import { describe, it, expect, beforeEach } from "vitest";
import { PermissionService } from "../../services/PermissionService";

describe("PermissionService Unit Tests", () => {
  beforeEach(() => {
    PermissionService.init(
      "ADMIN",
      ["manage_employees", "manage_payroll", "view_ledger", "manage_settings"],
      {
        attendance: true,
        payroll: true,
        accounting: true,
        pos: false,
        hr: true,
        crm: false,
        bi: true,
        aiCfo: false
      },
      "PROFESSIONAL",
      "ACTIVE",
      "biz_test_01"
    );
  });

  it("grants Super Admin full bypass permissions regardless of list", () => {
    PermissionService.init(
      "SUPER_ADMIN",
      [],
      {
        attendance: true,
        payroll: true,
        accounting: true,
        pos: true,
        hr: true,
        crm: true,
        bi: true,
        aiCfo: true
      },
      "STARTER",
      "ACTIVE",
      "biz_test_01"
    );
    expect(PermissionService.can("payroll.approve")).toBe(true);
    expect(PermissionService.can("any.custom.action")).toBe(true);
  });

  it("evaluates fine-grained action mapping for employee management", () => {
    expect(PermissionService.can("employee.create")).toBe(true);
    expect(PermissionService.can("employee.update")).toBe(true);
    expect(PermissionService.can("payroll.calculate")).toBe(true);
  });

  it("enforces subscription plan feature barriers for STARTER tier", () => {
    PermissionService.init(
      "ADMIN",
      ["read_bi", "use_aicfo"],
      {
        attendance: true,
        payroll: true,
        accounting: true,
        pos: false,
        hr: true,
        crm: false,
        bi: true,
        aiCfo: true
      },
      "STARTER",
      "ACTIVE",
      "biz_test_01"
    );

    // Starter plan disables BI and AICFO modules
    expect(PermissionService.hasModule("bi")).toBe(false);
    expect(PermissionService.hasModule("aicfo")).toBe(false);
  });

  it("checks platform resource thresholds correctly per tier", () => {
    // Professional plan allows up to 25 employees
    const limitCheck = PermissionService.checkLimit("employees", 20);
    expect(limitCheck.exceeded).toBe(false);
    expect(limitCheck.limit).toBe(25);

    const exceededCheck = PermissionService.checkLimit("employees", 25);
    expect(exceededCheck.exceeded).toBe(true);
  });

  describe("Phase 17: SUPER_ADMIN ≠ OWNER & Multi-Tenant Remediation", () => {
    it("denies all platform governance capabilities to OWNER role", () => {
      PermissionService.init(
        "OWNER",
        ["all", "*"], // Even with wildcard permissions!
        { attendance: true, payroll: true, accounting: true, hr: true, bi: true, pos: false, crm: false, aiCfo: false },
        "ENTERPRISE",
        "ACTIVE",
        "biz_tenant_01"
      );

      const platformCapabilities = [
        "approve_business",
        "reject_business",
        "toggle_tenant_status",
        "manage_licensing",
        "upgrade_plan",
        "manage_plans",
        "manage_subscriptions",
        "view_all_businesses",
        "manage_global_payment_methods",
        "system_health",
        "reliability_dlq",
        "disaster_recovery",
        "manage_system_config",
        "manage_global_tax",
        "force_unseal_payroll",
        "superadmin_access",
        "forensic_audit",
        "delete_business"
      ];

      platformCapabilities.forEach((cap) => {
        expect(PermissionService.can(cap)).toBe(false);
      });
    });

    it("allows platform governance capabilities strictly to SUPER_ADMIN", () => {
      PermissionService.init(
        "SUPER_ADMIN",
        [],
        { attendance: true, payroll: true, accounting: true, hr: true, bi: true, pos: false, crm: false, aiCfo: false },
        "ENTERPRISE",
        "ACTIVE",
        null
      );

      expect(PermissionService.can("approve_business")).toBe(true);
      expect(PermissionService.can("manage_licensing")).toBe(true);
      expect(PermissionService.can("manage_plans")).toBe(true);
      expect(PermissionService.can("manage_subscriptions")).toBe(true);
      expect(PermissionService.can("system_health")).toBe(true);
      expect(PermissionService.can("reliability_dlq")).toBe(true);
      expect(PermissionService.can("disaster_recovery")).toBe(true);
      expect(PermissionService.can("manage_system_config")).toBe(true);
      expect(PermissionService.can("manage_global_tax")).toBe(true);
    });

    it("denies platform system modules to OWNER while preserving legitimate ERP business modules", () => {
      PermissionService.init(
        "OWNER",
        [],
        { attendance: true, payroll: true, accounting: true, hr: true, bi: true, pos: false, crm: false, aiCfo: false },
        "ENTERPRISE",
        "ACTIVE",
        "biz_tenant_01"
      );

      // Platform modules must be denied
      const platformModules = [
        "platform",
        "tenants",
        "plans",
        "licences",
        "security",
        "health",
        "system_health",
        "reliability",
        "resilience_dlq",
        "dlq",
        "recovery",
        "disaster_recovery",
        "forensic"
      ];

      platformModules.forEach((mod) => {
        expect(PermissionService.hasModule(mod)).toBe(false);
        expect(PermissionService.hasRoleModuleAccess("OWNER", mod)).toBe(false);
      });

      // Legitimate tenant ERP modules must be allowed
      expect(PermissionService.hasModule("payroll")).toBe(true);
      expect(PermissionService.hasModule("personnel")).toBe(true);
      expect(PermissionService.hasModule("organization")).toBe(true);
      expect(PermissionService.hasModule("ledger")).toBe(true);
      expect(PermissionService.hasModule("accounting")).toBe(true);
      expect(PermissionService.hasModule("settings")).toBe(true);
      expect(PermissionService.can("employee.create")).toBe(true);
      expect(PermissionService.can("payroll.approve")).toBe(true);
    });
  });
});
