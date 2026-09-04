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
});
