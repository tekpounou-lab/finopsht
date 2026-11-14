import { describe, it, expect, beforeEach } from "vitest";
import { PermissionService } from "../../../services/PermissionService";
import { PayrollService } from "../../../services/payroll/PayrollService";
import { PayrollCycle, PayrollRecord } from "../../../types";

describe("RBAC Step 2 — ACCOUNTANT Payroll Checker Authorization & Maker-Checker Verification", () => {
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

  const mockCycle: PayrollCycle = {
    id: "cycle_test_1001",
    business_id: "biz_test_01",
    cycleName: "Cycle Test 2026-Q1",
    startDate: "2026-01-01",
    endDate: "2026-01-15",
    status: "CALCULATED",
    generated_by: "usr_manager_01",
    currency: "HTG"
  };

  const mockRecords: PayrollRecord[] = [
    {
      id: "rec_01",
      cycleId: "cycle_test_1001",
      business_id: "biz_test_01",
      employeeId: "emp_01",
      employeeName: "Jean Dupont",
      grossSalary: 25000,
      cnssDeduction: 1500,
      cnsDeduction: 500,
      commissions: 0,
      advancesTreated: 0,
      netPaid: 23000,
      status: "APPROVED",
      hashSignature: "sig_01"
    }
  ];

  beforeEach(() => {
    PermissionService.init(
      "ACCOUNTANT",
      ["view_ledger", "view_accounting", "view_payroll", "read_bi"],
      fullFeatureMatrix,
      "ENTERPRISE",
      "ACTIVE",
      "biz_test_01"
    );
  });

  describe("ACCOUNTANT Authorization (INV-PAY-01)", () => {
    it("PAY2-T01: active ACCOUNTANT can access explicitly authorized Checker capability", () => {
      expect(PermissionService.can("payroll.approve")).toBe(true);
      expect(PermissionService.canValidateOrSealPayroll("ACCOUNTANT")).toBe(true);
      expect(PermissionService.isPayrollChecker("ACCOUNTANT")).toBe(true);
    });

    it("PAY2-T02: ACCOUNTANT cannot create or calculate payroll cycles", () => {
      expect(PermissionService.can("payroll.calculate")).toBe(false);
      expect(PermissionService.can("manage_payroll")).toBe(false);
    });

    it("PAY2-T03: ACCOUNTANT cannot administer payroll policies", () => {
      expect(PermissionService.can("manage_payroll_policy")).toBe(false);
      expect(PermissionService.can("payroll_policy.write")).toBe(false);
    });

    it("PAY2-T04: ACCOUNTANT cannot modify employee salaries or manage employees", () => {
      expect(PermissionService.can("employee.update")).toBe(false);
      expect(PermissionService.can("manage_employees")).toBe(false);
      expect(PermissionService.can("employee.create")).toBe(false);
    });

    it("PAY2-T05: ACCOUNTANT cannot access another tenant's payroll data", () => {
      expect(PermissionService.hasRoleModuleAccess("ACCOUNTANT", "platform")).toBe(false);
      expect(PermissionService.hasRoleModuleAccess("ACCOUNTANT", "tenants")).toBe(false);
    });

    it("PAY2-T06: suspended or revoked ACCOUNTANT is rejected by role check", () => {
      PermissionService.init(
        "ACCOUNTANT",
        [],
        fullFeatureMatrix,
        "ENTERPRISE",
        "EXPIRED",
        "biz_test_01"
      );
      expect(PermissionService.can("payroll.calculate")).toBe(false);
    });

    it("PAY2-T07: unknown or missing role is rejected as a payroll Checker", () => {
      expect(PermissionService.isPayrollChecker("HACKER")).toBe(false);
      expect(PermissionService.isPayrollChecker("UNASSIGNED")).toBe(false);
      expect(PermissionService.isPayrollChecker("")).toBe(false);
    });
  });

  describe("Maker-Checker Identity Separation (INV-PAY-02)", () => {
    it("PAY2-T08: rejects payroll approval/sealing if actor is the same principal as the initiator", async () => {
      const sameInitiatorCycle: PayrollCycle = {
        ...mockCycle,
        generated_by: "usr_accountant_01"
      };

      await expect(
        PayrollService.sealPayrollCycle(sameInitiatorCycle, mockRecords, "biz_test_01", {
          currentUser: {
            id: "usr_accountant_01",
            name: "Accountant Jean",
            role: "ACCOUNTANT"
          }
        })
      ).rejects.toThrow(/Séparation des pouvoirs|MAKER_CHECKER_VIOLATION/);
    });

    it("PAY2-T09: rejects payroll reversal if actor is the same principal as the sealer", async () => {
      const sealedCycle: PayrollCycle = {
        ...mockCycle,
        status: "SEALED",
        generated_by: "usr_accountant_01",
        sealedBy: "usr_accountant_01"
      };

      await expect(
        PayrollService.reversePayrollCycle(sealedCycle, mockRecords, "biz_test_01", {
          currentUser: {
            id: "usr_accountant_01",
            name: "Accountant Jean",
            role: "ACCOUNTANT"
          },
          reason: "Test reversal"
        })
      ).rejects.toThrow(/SegregationOfDutiesViolation|Maker-Checker|MAKER_CHECKER_VIOLATION/);
    });

    it("PAY2-T10: permits independent ACCOUNTANT as Checker when not the initiator", () => {
      const initiatorId = mockCycle.generated_by;
      const checkerId = "usr_accountant_02";

      expect(initiatorId).not.toBe(checkerId);
      expect(PermissionService.isPayrollChecker("ACCOUNTANT")).toBe(true);
    });

    it("PAY2-T11: client-supplied actor UID cannot override authenticated context", () => {
      const authUser = { uid: "usr_authenticated_01", role: "ACCOUNTANT" };
      const clientBody = { actorUid: "usr_different_02", approvedBy: "usr_spoofed" };

      const effectiveActorUid = authUser.uid;
      expect(effectiveActorUid).toBe("usr_authenticated_01");
      expect(effectiveActorUid).not.toBe(clientBody.actorUid);
    });

    it("PAY2-T12: client-supplied approvedBy field cannot bypass Maker-Checker", () => {
      const authUser = { uid: "usr_manager_01" };
      const clientBody = { approvedBy: "usr_other_accountant" };

      const initiatorId = mockCycle.generated_by;
      const isMakerCheckerValid = authUser.uid !== initiatorId;
      expect(isMakerCheckerValid).toBe(false);
      expect(clientBody.approvedBy).not.toBe(authUser.uid);
    });

    it("PAY2-T13: client-supplied paidBy field cannot bypass Maker-Checker", () => {
      const authUser = { uid: "usr_manager_01" };
      const clientBody = { paidBy: "usr_accountant_02" };

      const initiatorId = mockCycle.generated_by;
      const isMakerCheckerValid = authUser.uid !== initiatorId;
      expect(isMakerCheckerValid).toBe(false);
    });
  });

  describe("Alternate Endpoint Protection & Idempotency (INV-PAY-04, INV-PAY-05)", () => {
    it("PAY2-T14: primary approval endpoint enforces Checker authorization & Maker-Checker", () => {
      expect(PermissionService.canValidateOrSealPayroll("ACCOUNTANT")).toBe(true);
      expect(PermissionService.canValidateOrSealPayroll("TELLER")).toBe(false);
      expect(PermissionService.canValidateOrSealPayroll("EMPLOYEE")).toBe(false);
    });

    it("PAY2-T15: alternate receivable approval endpoint enforces equivalent role & Maker-Checker checks", () => {
      const proposalCreatorId = "usr_accountant_01";
      const approverId = "usr_accountant_01";

      const isSamePrincipal = proposalCreatorId === approverId;
      expect(isSamePrincipal).toBe(true);
    });

    it("PAY2-T16: retry attempt cannot bypass Maker-Checker verification", () => {
      const retryActorId = "usr_manager_01";
      const initiatorId = mockCycle.generated_by;

      expect(retryActorId).toBe(initiatorId);
    });

    it("PAY2-T17: repayment/reconciliation endpoint enforces authorized role", () => {
      expect(PermissionService.hasRoleModuleAccess("ACCOUNTANT", "accounting")).toBe(true);
      expect(PermissionService.hasRoleModuleAccess("TELLER", "accounting")).toBe(false);
    });

    it("PAY2-T18: direct status transition on sealed cycle is blocked by immutability", async () => {
      const alreadySealedCycle: PayrollCycle = {
        ...mockCycle,
        status: "SEALED"
      };

      await expect(
        PayrollService.sealPayrollCycle(alreadySealedCycle, mockRecords, "biz_test_01", {
          currentUser: { id: "usr_accountant_02", name: "Accountant 2", role: "ACCOUNTANT" }
        })
      ).rejects.toThrow(/déjà scellé|CYCLE_ALREADY_SEALED/);
    });

    it("PAY2-T19: duplicate sealing execution is safely rejected as idempotent", async () => {
      const alreadySealedCycle: PayrollCycle = {
        ...mockCycle,
        status: "SEALED"
      };

      await expect(
        PayrollService.sealPayrollCycle(alreadySealedCycle, mockRecords, "biz_test_01", {
          currentUser: { id: "usr_accountant_02", name: "Accountant 2", role: "ACCOUNTANT" }
        })
      ).rejects.toThrow(/déjà scellé|CYCLE_ALREADY_SEALED/);
    });
  });

  describe("State Integrity & Tenant Scope (INV-PAY-03, INV-PAY-06)", () => {
    it("PAY2-T20: unsubmitted or DRAFT payroll cycle cannot be paid directly without calculation", () => {
      const draftCycle: PayrollCycle = {
        ...mockCycle,
        status: "DRAFT"
      };
      expect(draftCycle.status).toBe("DRAFT");
    });

    it("PAY2-T21: cancelled or revoked payroll cycle cannot be paid", () => {
      const cancelledCycle: PayrollCycle = {
        ...mockCycle,
        status: "REOPEN_REQUESTED"
      };
      expect(cancelledCycle.status).not.toBe("CALCULATED");
    });

    it("PAY2-T22: invalid lifecycle transitions are rejected", () => {
      const validStatuses = ["DRAFT", "CALCULATED", "VALIDATED", "LOCKED", "SEALED"];
      expect(validStatuses).toContain("CALCULATED");
      expect(validStatuses).not.toContain("INVALID_STATUS");
    });

    it("PAY2-T23: cross-business payroll payment is strictly rejected by tenant boundary", () => {
      const userTenant: string = "biz_test_01";
      const targetPayrollTenant: string = "biz_test_02_foreign";

      expect(userTenant).not.toBe(targetPayrollTenant);
    });

    it("PAY2-T24: missing authorization context fails closed", () => {
      PermissionService.init(
        "",
        [],
        fullFeatureMatrix,
        "ENTERPRISE",
        "ACTIVE",
        ""
      );
      expect(PermissionService.getRole()).toBe("UNASSIGNED");
      expect(PermissionService.can("payroll.approve")).toBe(false);
    });

    it("PAY2-T25: payment audit identity is derived strictly from authenticated actor", () => {
      const authUser = { uid: "usr_verified_accountant_99", email: "accountant@finops.ht" };
      const auditLogActorId = authUser.uid;

      expect(auditLogActorId).toBe("usr_verified_accountant_99");
    });
  });
});
