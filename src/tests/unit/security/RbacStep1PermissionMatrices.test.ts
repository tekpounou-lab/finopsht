import { describe, it, expect, beforeEach } from "vitest";
import { PermissionService } from "../../../services/PermissionService";

describe("RBAC Step 1 — ACCOUNTANT & MASTER_HEAD_TELLER Permission Matrix Verification", () => {
  const fullFeatureMatrix = {
    attendance: true,
    payroll: true,
    accounting: true,
    pos: true,
    hr: true,
    crm: true,
    bi: true,
    aiCfo: true
  };

  describe("ACCOUNTANT Matrix (INV-RBAC-01)", () => {
    beforeEach(() => {
      PermissionService.init(
        "ACCOUNTANT",
        ["view_ledger", "view_accounting", "view_payroll", "read_bi", "use_aicfo"],
        fullFeatureMatrix,
        "ENTERPRISE",
        "ACTIVE",
        "biz_test_01"
      );
    });

    it("ACC-01: denies employee administration & HR management to ACCOUNTANT", () => {
      expect(PermissionService.can("employee.create")).toBe(false);
      expect(PermissionService.can("employee.update")).toBe(false);
      expect(PermissionService.can("employee.delete")).toBe(false);
      expect(PermissionService.can("employees.suspend")).toBe(false);
      expect(PermissionService.can("employees.reactivate")).toBe(false);
      expect(PermissionService.hasRoleModuleAccess("ACCOUNTANT", "personnel")).toBe(false);
      expect(PermissionService.hasRoleModuleAccess("ACCOUNTANT", "organization")).toBe(false);
    });

    it("ACC-02: authorizes payroll payment approval & locking for ACCOUNTANT as Checker while denying calculation", () => {
      expect(PermissionService.can("payroll.approve")).toBe(true);
      expect(PermissionService.can("payroll.lock")).toBe(true);
      expect(PermissionService.can("payroll.calculate")).toBe(false);
    });

    it("ACC-03: denies tenant settings & FX configuration to ACCOUNTANT", () => {
      expect(PermissionService.can("manage_settings")).toBe(false);
      expect(PermissionService.can("settings.write")).toBe(false);
      expect(PermissionService.can("business.settings")).toBe(false);
      expect(PermissionService.can("manage_tenant_settings")).toBe(false);
      expect(PermissionService.hasRoleModuleAccess("ACCOUNTANT", "settings")).toBe(false);
    });

    it("ACC-04: denies physical till operations (operate/transfer) while allowing view for accounting reconciliation", () => {
      expect(PermissionService.can("cash.operate")).toBe(false);
      expect(PermissionService.can("cash.transfer")).toBe(false);
      expect(PermissionService.can("cash.view")).toBe(true);
      expect(PermissionService.hasRoleModuleAccess("ACCOUNTANT", "cash_management")).toBe(false);
    });

    it("ACC-05: permits authorized accounting, ledger, BI, and document read access", () => {
      expect(PermissionService.can("accounting.view")).toBe(true);
      expect(PermissionService.can("ledger.view")).toBe(true);
      expect(PermissionService.can("view_ledger")).toBe(true);
      expect(PermissionService.can("bi.read")).toBe(true);
      expect(PermissionService.can("aicfo.use")).toBe(true);
      expect(PermissionService.hasRoleModuleAccess("ACCOUNTANT", "accounting")).toBe(true);
      expect(PermissionService.hasRoleModuleAccess("ACCOUNTANT", "ledger")).toBe(true);
      expect(PermissionService.hasRoleModuleAccess("ACCOUNTANT", "payroll")).toBe(true);
    });

    it("ACC-06: ensures ACCOUNTANT does NOT inherit MANAGER or OWNER permissions", () => {
      expect(PermissionService.can("manage_employees")).toBe(false);
      expect(PermissionService.can("delete_employees")).toBe(false);
      expect(PermissionService.can("branch.create")).toBe(false);
      expect(PermissionService.can("department.create")).toBe(false);
    });
  });

  describe("MASTER_HEAD_TELLER Matrix (INV-RBAC-02)", () => {
    beforeEach(() => {
      PermissionService.init(
        "MASTER_HEAD_TELLER",
        ["cash.view", "cash.operate", "cash.transfer", "view_planning", "view_attendance"],
        fullFeatureMatrix,
        "ENTERPRISE",
        "ACTIVE",
        "biz_test_01"
      );
    });

    it("MHT-01: permits multi-branch cash visibility, operation, and transfers", () => {
      expect(PermissionService.can("cash.view")).toBe(true);
      expect(PermissionService.can("cash.operate")).toBe(true);
      expect(PermissionService.can("cash.transfer")).toBe(true);
      expect(PermissionService.hasRoleModuleAccess("MASTER_HEAD_TELLER", "cash_management")).toBe(true);
      expect(PermissionService.hasRoleModuleAccess("MASTER_HEAD_TELLER", "cash")).toBe(true);
      expect(PermissionService.hasRoleModuleAccess("MASTER_HEAD_TELLER", "operations")).toBe(true);
    });

    it("MHT-02: denies accounting, ledger, and BI modules to MASTER_HEAD_TELLER", () => {
      expect(PermissionService.hasRoleModuleAccess("MASTER_HEAD_TELLER", "accounting")).toBe(false);
      expect(PermissionService.hasRoleModuleAccess("MASTER_HEAD_TELLER", "ledger")).toBe(false);
      expect(PermissionService.hasRoleModuleAccess("MASTER_HEAD_TELLER", "bi")).toBe(false);
      expect(PermissionService.hasRoleModuleAccess("MASTER_HEAD_TELLER", "aicfo")).toBe(false);
      expect(PermissionService.can("accounting.view")).toBe(false);
      expect(PermissionService.can("ledger.view")).toBe(false);
    });

    it("MHT-03: denies payroll administration & policy configuration to MASTER_HEAD_TELLER", () => {
      expect(PermissionService.hasRoleModuleAccess("MASTER_HEAD_TELLER", "payroll")).toBe(false);
      expect(PermissionService.can("payroll.view")).toBe(false);
      expect(PermissionService.can("payroll.approve")).toBe(false);
      expect(PermissionService.can("payroll.lock")).toBe(false);
    });

    it("MHT-04: denies tenant settings & employee administration to MASTER_HEAD_TELLER", () => {
      expect(PermissionService.hasRoleModuleAccess("MASTER_HEAD_TELLER", "settings")).toBe(false);
      expect(PermissionService.hasRoleModuleAccess("MASTER_HEAD_TELLER", "personnel")).toBe(false);
      expect(PermissionService.can("manage_settings")).toBe(false);
      expect(PermissionService.can("employee.create")).toBe(false);
      expect(PermissionService.can("employee.delete")).toBe(false);
    });

    it("MHT-05: ensures MASTER_HEAD_TELLER does NOT inherit OWNER, MANAGER, or ACCOUNTANT permissions", () => {
      expect(PermissionService.can("manage_employees")).toBe(false);
      expect(PermissionService.can("view_tenant_financials")).toBe(false);
      expect(PermissionService.can("journal.post")).toBe(false);
    });
  });

  describe("DEFAULT-DENY & Malformed Role Safety", () => {
    it("DENY-01: denies all capabilities for unknown roles without explicit permission grants", () => {
      const unknownRoles = ["HACKER", "UNKNOWN_ROLE", "SYSTEM_INJECTED", "INVALID_ROLE"];
      unknownRoles.forEach((role) => {
        PermissionService.init(
          role,
          [],
          fullFeatureMatrix,
          "ENTERPRISE",
          "ACTIVE",
          "biz_test_01"
        );

        expect(PermissionService.can("cash.view")).toBe(false);
        expect(PermissionService.can("payroll.approve")).toBe(false);
        expect(PermissionService.can("employee.create")).toBe(false);
        expect(PermissionService.hasRoleModuleAccess(role, "cash_management")).toBe(false);
        expect(PermissionService.hasRoleModuleAccess(role, "accounting")).toBe(false);
      });
    });

    it("DENY-02: resolves null, undefined, empty, or whitespace roles to UNASSIGNED and denies all checks", () => {
      const invalidRoles = [null as any, undefined as any, "", "   "];
      invalidRoles.forEach((invalidRole) => {
        PermissionService.init(
          invalidRole,
          [],
          fullFeatureMatrix,
          "ENTERPRISE",
          "ACTIVE",
          "biz_test_01"
        );

        expect(PermissionService.getRole()).toBe("UNASSIGNED");
        expect(PermissionService.can("cash.view")).toBe(false);
        expect(PermissionService.can("payroll.view")).toBe(false);
        expect(PermissionService.hasRoleModuleAccess(undefined, "cash_management")).toBe(false);
      });
    });

    it("DENY-03: denies missing module name or unmapped role module access", () => {
      PermissionService.init(
        "ACCOUNTANT",
        [],
        fullFeatureMatrix,
        "ENTERPRISE",
        "ACTIVE",
        "biz_test_01"
      );
      expect(PermissionService.hasModule("")).toBe(false);
      expect(PermissionService.hasRoleModuleAccess("ACCOUNTANT", "non_existent_module")).toBe(false);
      expect(PermissionService.hasRoleModuleAccess("UNASSIGNED", "payroll")).toBe(false);
    });
  });

  describe("REGRESSION & Existing Role Integrity", () => {
    it("REG-01: preserves existing OWNER capabilities and platform module denials", () => {
      PermissionService.init(
        "OWNER",
        [],
        fullFeatureMatrix,
        "ENTERPRISE",
        "ACTIVE",
        "biz_test_01"
      );
      expect(PermissionService.hasModule("payroll")).toBe(true);
      expect(PermissionService.hasModule("accounting")).toBe(true);
      expect(PermissionService.hasModule("platform")).toBe(false);
      expect(PermissionService.can("employee.create")).toBe(true);
      expect(PermissionService.can("payroll.approve")).toBe(true);
      expect(PermissionService.can("approve_business")).toBe(false);
    });

    it("REG-02: preserves existing MANAGER capabilities", () => {
      PermissionService.init(
        "MANAGER",
        ["view_employees", "manage_employees", "view_payroll", "view_ledger"],
        fullFeatureMatrix,
        "ENTERPRISE",
        "ACTIVE",
        "biz_test_01"
      );
      expect(PermissionService.hasRoleModuleAccess("MANAGER", "payroll")).toBe(true);
      expect(PermissionService.hasRoleModuleAccess("MANAGER", "accounting")).toBe(true);
      expect(PermissionService.hasRoleModuleAccess("MANAGER", "settings")).toBe(false);
      expect(PermissionService.can("cash.operate")).toBe(true);
      expect(PermissionService.can("cash.transfer")).toBe(true);
    });

    it("REG-03: preserves AUDITOR read-only restrictions", () => {
      PermissionService.init(
        "AUDITOR",
        ["cash.view"],
        fullFeatureMatrix,
        "ENTERPRISE",
        "ACTIVE",
        "biz_test_01"
      );
      expect(PermissionService.can("cash.view")).toBe(true);
      expect(PermissionService.can("cash.operate")).toBe(false);
      expect(PermissionService.can("cash.transfer")).toBe(false);
      expect(PermissionService.hasRoleModuleAccess("AUDITOR", "accounting")).toBe(true);
    });

    it("REG-04: preserves TELLER physical cash operation capabilities", () => {
      PermissionService.init(
        "TELLER",
        ["cash.operate"],
        fullFeatureMatrix,
        "ENTERPRISE",
        "ACTIVE",
        "biz_test_01"
      );
      expect(PermissionService.can("cash.view")).toBe(true);
      expect(PermissionService.can("cash.operate")).toBe(true);
      expect(PermissionService.can("cash.transfer")).toBe(false);
      expect(PermissionService.hasRoleModuleAccess("TELLER", "payroll")).toBe(false);
    });
  });
});
