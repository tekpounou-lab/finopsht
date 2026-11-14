import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  canApproveInternalTransferRole,
  canOperateCashTill,
  canRecordCommercialSales,
  canRecordCommercialServices,
  canSuperviseTillLifecycleRole,
  evaluateOperationalProfileAccess,
  normalizeOperationalProfile,
  validateRoleOperationalProfileCompatibility
} from "../../../domains/rbac/operationalProfilePolicy";
import {
  ServerProfileVerificationError,
  verifyServerEmployeeOperationalProfile
} from "../../../domains/rbac/serverEmployeeProfileVerifier";
import {
  TransactionMappingEngine,
  DEFAULT_SYSTEM_TRANSACTION_TYPES
} from "../../../services/cash/transactionMappingEngine";
import { EmployeeCashEligibilityService } from "../../../domains/cash/services/EmployeeCashEligibilityService";
import { PermissionService } from "../../../services/PermissionService";
import {
  ServerInternalTransferEngine,
  SUPERVISOR_TRANSFER_ROLES
} from "../../../domains/cash/services/ServerInternalTransferEngine";
import { BulkEmployeeImportService } from "../../../services/workforce/BulkEmployeeImportService";
import { EmployeeIntegritySchema } from "../../../validations/integritySchemas";

function createInMemoryAdminDb(docs: Record<string, any>) {
  const store = new Map<string, any>(Object.entries(docs));
  const makeSnap = (docPath: string) => {
    const data = store.get(docPath);
    return {
      exists: data !== undefined,
      id: docPath.split("/").pop(),
      data: () => data
    };
  };
  return {
    doc: (docPath: string) => ({
      get: async () => makeSnap(docPath)
    }),
    collection: (collName: string) => ({
      doc: (docId: string) => ({
        get: async () => makeSnap(`${collName}/${docId}`)
      }),
      where: (field: string, _op: string, value: any) => ({
        get: async () => {
          const matched: any[] = [];
          for (const [k, v] of store.entries()) {
            if (k.startsWith(`${collName}/`) && v && v[field] === value) {
              matched.push({
                id: k.slice(collName.length + 1),
                data: () => v
              });
            }
          }
          return {
            empty: matched.length === 0,
            docs: matched
          };
        }
      })
    })
  };
}

describe("RBAC STEP 4 — Server-Side Operational Profile Enforcement & Step 3 MASTER_HEAD_TELLER Correction", () => {
  const fullFeatures = {
    attendance: true,
    payroll: true,
    accounting: true,
    pos: true,
    hr: true,
    crm: true,
    bi: true,
    aiCfo: true
  };

  beforeEach(() => {
    PermissionService.init("EMPLOYEE", [], fullFeatures, "ENTERPRISE", "ACTIVE", "biz_alpha");
  });

  describe("Suite 1 — Role × Operational Profile Compatibility (The 9 Forbidden Combinations)", () => {
    it("S4-COMP-01 & S4-COMP-02: allows EMPLOYEE + vendeur and EMPLOYEE + polyvalent", () => {
      const v = validateRoleOperationalProfileCompatibility("EMPLOYEE", "vendeur");
      expect(v.valid).toBe(true);
      expect(v.normalizedProfile).toBe("vendeur");

      const p = validateRoleOperationalProfileCompatibility("EMPLOYEE", "polyvalent");
      expect(p.valid).toBe(true);
      expect(p.normalizedProfile).toBe("polyvalent");
    });

    it("S4-COMP-03 to S4-COMP-11: explicitly rejects all 9 forbidden EMPLOYEE/TELLER combinations with zero silent fallback", () => {
      const forbiddenPairs: Array<[string, string]> = [
        ["EMPLOYEE", "teller"],
        ["JUNIOR_TELLER", "vendeur"],
        ["JUNIOR_TELLER", "polyvalent"],
        ["SENIOR_TELLER", "vendeur"],
        ["SENIOR_TELLER", "polyvalent"],
        ["HEAD_TELLER", "vendeur"],
        ["HEAD_TELLER", "polyvalent"],
        ["MASTER_HEAD_TELLER", "vendeur"],
        ["MASTER_HEAD_TELLER", "polyvalent"]
      ];

      for (const [role, profile] of forbiddenPairs) {
        const res = validateRoleOperationalProfileCompatibility(role, profile);
        expect(res.valid, `${role} + ${profile} must be rejected`).toBe(false);
        expect(res.normalizedProfile).toBeNull();
        expect(res.code).toBe("FORBIDDEN_ROLE_PROFILE_COMBINATION");
        const schemaCheck = EmployeeIntegritySchema.safeParse({
          id: "emp_chk",
          businessId: "biz_alpha",
          branchId: "br_1",
          departmentId: "dep_1",
          name: "Test",
          email: "test@example.com",
          role,
          operational_profile: profile,
          baseSalary: 10000
        });
        expect(schemaCheck.success).toBe(false);
      }
    });

    it("S4-COMP-12 & S4-COMP-13: allows TELLER hierarchy + teller and rejects legacy TELLER + commercial profiles", () => {
      for (const tellerRole of ["JUNIOR_TELLER", "SENIOR_TELLER", "HEAD_TELLER", "MASTER_HEAD_TELLER", "TELLER"]) {
        const res = validateRoleOperationalProfileCompatibility(tellerRole, "teller");
        expect(res.valid).toBe(true);
        expect(res.normalizedProfile).toBe("teller");
      }

      expect(validateRoleOperationalProfileCompatibility("TELLER", "vendeur").valid).toBe(false);
      expect(validateRoleOperationalProfileCompatibility("TELLER", "polyvalent").valid).toBe(false);
    });

    it("S4-COMP-14: rejects retired pseudo-profiles (head_teller, manager, owner) across all roles", () => {
      for (const retired of ["head_teller", "manager", "owner"]) {
        for (const role of ["EMPLOYEE", "HEAD_TELLER", "MANAGER", "OWNER"]) {
          const res = validateRoleOperationalProfileCompatibility(role, retired);
          expect(res.valid).toBe(false);
          expect(res.code).toBe("RETIRED_OPERATIONAL_PROFILE");
          expect(res.normalizedProfile).toBeNull();
        }
      }
    });
  });

  describe("Suite 2 — Fail-Closed Missing, Null, Empty, Malformed & Conflicting Profiles", () => {
    it("S4-FAIL-01 & S4-FAIL-02: missing/null/empty/whitespace profiles fail closed on EMPLOYEE and all TELLER roles", () => {
      const missingValues: unknown[] = [undefined, null, "", "   "];
      for (const val of missingValues) {
        const empCheck = validateRoleOperationalProfileCompatibility("EMPLOYEE", val);
        expect(empCheck.valid).toBe(false);
        expect(empCheck.code).toBe("MISSING_OPERATIONAL_PROFILE");

        expect(canRecordCommercialSales("EMPLOYEE", val).allowed).toBe(false);
        expect(canRecordCommercialServices("EMPLOYEE", val).allowed).toBe(false);
        expect(canOperateCashTill("EMPLOYEE", val).allowed).toBe(false);

        for (const tRole of ["JUNIOR_TELLER", "SENIOR_TELLER", "HEAD_TELLER", "MASTER_HEAD_TELLER"]) {
          const tCheck = validateRoleOperationalProfileCompatibility(tRole, val);
          expect(tCheck.valid).toBe(false);
          expect(tCheck.code).toBe("MISSING_OPERATIONAL_PROFILE");
          expect(canOperateCashTill(tRole, val).allowed).toBe(false);
        }
      }
    });

    it("S4-FAIL-03 & S4-FAIL-04: malformed/unknown profiles fail closed everywhere including TransactionMappingEngine", () => {
      const malformed: unknown[] = [123, {}, ["teller"], "ADMIN", "__proto__", "VENDEUR_PLUS"];
      for (const bad of malformed) {
        expect(normalizeOperationalProfile(bad, { role: "EMPLOYEE" })).toBeNull();
        expect(TransactionMappingEngine.filterTypesByProfile(DEFAULT_SYSTEM_TRANSACTION_TYPES, bad as any, "EMPLOYEE")).toEqual([]);
      }

      const saleOp = DEFAULT_SYSTEM_TRANSACTION_TYPES.find((t) => t.code === "3001")!;
      expect(TransactionMappingEngine.isOperationAllowedForProfile(saleOp, undefined, "EMPLOYEE").isAllowed).toBe(false);
      expect(TransactionMappingEngine.filterTypesByProfile(DEFAULT_SYSTEM_TRANSACTION_TYPES, undefined, "EMPLOYEE")).toEqual([]);
    });

    it("rejects conflicting dual fields (operational_profile vs operationalProfile) fail-closed", async () => {
      const adminDb = createInMemoryAdminDb({
        "users/u1": { uid: "u1", business_id: "biz_alpha", role: "JUNIOR_TELLER", operational_profile: "teller", status: "ACTIVE" },
        "employees/u1": {
          id: "u1",
          business_id: "biz_alpha",
          role: "JUNIOR_TELLER",
          operational_profile: "teller",
          operationalProfile: "vendeur",
          status: "ACTIVE"
        }
      });

      await expect(
        verifyServerEmployeeOperationalProfile({
          adminDb,
          uid: "u1",
          businessId: "biz_alpha",
          actorRole: "JUNIOR_TELLER",
          capability: "cash"
        })
      ).rejects.toMatchObject({
        code: "CONFLICTING_OPERATIONAL_PROFILE_FIELDS",
        statusCode: 403
      });
    });
  });

  describe("Suite 3 — Legacy barber Alias Boundary", () => {
    it("S4-BARB-01 & S4-BARB-02: maps barber -> vendeur ONLY for EMPLOYEE when allowLegacyBarberAlias is true, rejects on TELLER", () => {
      const empAlias = validateRoleOperationalProfileCompatibility("EMPLOYEE", "barber", {
        allowLegacyBarberAlias: true
      });
      expect(empAlias.valid).toBe(true);
      expect(empAlias.normalizedProfile).toBe("vendeur");
      expect(empAlias.legacyAliasApplied).toBe(true);

      const empSales = canRecordCommercialSales("EMPLOYEE", "barber", { allowLegacyBarberAlias: true });
      const empServices = canRecordCommercialServices("EMPLOYEE", "barber", { allowLegacyBarberAlias: true });
      const empCash = canOperateCashTill("EMPLOYEE", "barber");
      expect(empSales.allowed).toBe(true);
      expect(empServices.allowed).toBe(false);
      expect(empCash.allowed).toBe(false);

      for (const tRole of ["JUNIOR_TELLER", "SENIOR_TELLER", "HEAD_TELLER", "MASTER_HEAD_TELLER"]) {
        const tellerAlias = validateRoleOperationalProfileCompatibility(tRole, "barber", {
          allowLegacyBarberAlias: true
        });
        expect(tellerAlias.valid).toBe(false);
        expect(tellerAlias.code).toBe("FORBIDDEN_BARBER_ALIAS");
      }
    });

    it("S4-BARB-03: rejects legacy barber when allowLegacyBarberAlias is false (UI / new invitation boundary)", () => {
      const inviteCheck = validateRoleOperationalProfileCompatibility("EMPLOYEE", "barber", {
        allowLegacyBarberAlias: false
      });
      expect(inviteCheck.valid).toBe(false);
      expect(inviteCheck.code).toBe("FORBIDDEN_BARBER_ALIAS");
    });
  });

  describe("Suite 4 — EMPLOYEE (vendeur vs polyvalent) Functional & Cash Isolation", () => {
    it("S4-EMP-01 to S4-EMP-04: enforces EMPLOYEE + vendeur (Sales only) vs EMPLOYEE + polyvalent (Sales + Services)", () => {
      expect(canRecordCommercialSales("EMPLOYEE", "vendeur").allowed).toBe(true);
      expect(canRecordCommercialServices("EMPLOYEE", "vendeur").allowed).toBe(false);
      expect(canOperateCashTill("EMPLOYEE", "vendeur").allowed).toBe(false);

      expect(canRecordCommercialSales("EMPLOYEE", "polyvalent").allowed).toBe(true);
      expect(canRecordCommercialServices("EMPLOYEE", "polyvalent").allowed).toBe(true);
      expect(canOperateCashTill("EMPLOYEE", "polyvalent").allowed).toBe(false);
    });

    it("S4-EMP-06: EmployeeCashEligibilityService strictly rejects EMPLOYEE (vendeur, polyvalent, teller) from till assignment", () => {
      for (const profile of ["vendeur", "polyvalent", "teller"]) {
        const res = EmployeeCashEligibilityService.isEligibleForTillAssignment({
          employee: {
            id: "emp_1",
            name: "Commercial Agent",
            business_id: "biz_alpha",
            role: "EMPLOYEE",
            operational_profile: profile as any,
            status: "ACTIVE"
          } as any,
          existingTills: [],
          currency: "HTG",
          businessId: "biz_alpha"
        });
        expect(res.isEligible).toBe(false);
        expect(res.code).toBe("UNAUTHORIZED_ROLE");
      }
    });

    it("S4-EMP-08: server verifier rejects client-spoofed operational_profile / role against persisted Firestore record", async () => {
      const adminDb = createInMemoryAdminDb({
        "users/u_emp": { uid: "u_emp", business_id: "biz_alpha", role: "EMPLOYEE", operational_profile: "vendeur", status: "ACTIVE" },
        "employees/u_emp": { id: "u_emp", business_id: "biz_alpha", role: "EMPLOYEE", operational_profile: "vendeur", status: "ACTIVE" }
      });

      await expect(
        verifyServerEmployeeOperationalProfile({
          adminDb,
          uid: "u_emp",
          businessId: "biz_alpha",
          actorRole: "EMPLOYEE",
          claimedProfile: "polyvalent",
          capability: "commercial_services"
        })
      ).rejects.toMatchObject({
        code: "OPERATIONAL_PROFILE_SPOOFING_DETECTED",
        statusCode: 403
      });

      await expect(
        verifyServerEmployeeOperationalProfile({
          adminDb,
          uid: "u_emp",
          businessId: "biz_alpha",
          actorRole: "EMPLOYEE",
          claimedProfile: "teller",
          capability: "cash"
        })
      ).rejects.toBeInstanceOf(ServerProfileVerificationError);
    });
  });

  describe("Suite 5 — TELLER Hierarchy Strict Isolation & Firestore Rules Hardening", () => {
    it("S4-TEL-02 to S4-TEL-05: TELLER roles + teller cannot access Sales, Services, HR Admin, Payroll, or GL", () => {
      for (const tRole of ["JUNIOR_TELLER", "SENIOR_TELLER", "HEAD_TELLER", "MASTER_HEAD_TELLER"] as const) {
        expect(canOperateCashTill(tRole, "teller").allowed).toBe(true);
        expect(canRecordCommercialSales(tRole, "teller").allowed).toBe(false);
        expect(canRecordCommercialServices(tRole, "teller").allowed).toBe(false);

        PermissionService.init(tRole, ["cash.view", "cash.operate"], fullFeatures, "ENTERPRISE", "ACTIVE", "biz_alpha");
        expect(PermissionService.can("employee.create")).toBe(false);
        expect(PermissionService.can("invite_employees")).toBe(false);
        expect(PermissionService.can("payroll.approve")).toBe(false);
        expect(PermissionService.can("payroll.calculate")).toBe(false);
        expect(PermissionService.can("journal.post")).toBe(false);
        expect(PermissionService.can("ledger.write")).toBe(false);
      }
    });

    it("S4-TEL-06: firestore.rules enforces parenthesized isTenantCashOperator, excludes head_teller from isTenantAdminOrManager, and validates role/profile compatibility", () => {
      const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");

      // isTenantAdminOrManager must NOT contain head_teller or master_head_teller
      const adminMgrMatch = rules.match(/function isTenantAdminOrManager\(bizId\)\s*\{([\s\S]*?)\n\s*\}/);
      expect(adminMgrMatch).not.toBeNull();
      expect(adminMgrMatch![1]).not.toContain("'head_teller'");
      expect(adminMgrMatch![1]).not.toContain("'master_head_teller'");

      // isTenantCashOperator must wrap the role disjunction in parentheses so master_head_teller cannot bypass bizId check
      const cashOpMatch = rules.match(/function isTenantCashOperator\(bizId\)\s*\{([\s\S]*?)\n\s*\}/);
      expect(cashOpMatch).not.toBeNull();
      expect(cashOpMatch![1]).toContain("'master_head_teller'");
      expect(cashOpMatch![1]).toMatch(/\)\s*&&\s*\(\s*request\.auth\.token\.get\('role'/);

      // Compatibility helper must be enforced on users, employees, and invitations
      expect(rules).toContain("function isValidRoleProfileCompatibility(data)");
      expect(rules).toContain("isValidRoleProfileCompatibility(request.resource.data)");
    });
  });

  describe("Suite 6 — Server Bypass & Bulk Import Enforcement", () => {
    it("S4-BYP-01 & S4-BYP-02: server verifier denies EMPLOYEE claiming teller and HEAD_TELLER with tampered 'vendeur' profile", async () => {
      const adminDb = createInMemoryAdminDb({
        "users/u_emp_poly": { uid: "u_emp_poly", business_id: "biz_alpha", role: "EMPLOYEE", operational_profile: "polyvalent", status: "ACTIVE" },
        "employees/u_emp_poly": { id: "u_emp_poly", business_id: "biz_alpha", role: "EMPLOYEE", operational_profile: "polyvalent", status: "ACTIVE" },
        "users/u_ht_tampered": { uid: "u_ht_tampered", business_id: "biz_alpha", role: "HEAD_TELLER", operational_profile: "vendeur", status: "ACTIVE" },
        "employees/u_ht_tampered": { id: "u_ht_tampered", business_id: "biz_alpha", role: "HEAD_TELLER", operational_profile: "vendeur", status: "ACTIVE" }
      });

      await expect(
        verifyServerEmployeeOperationalProfile({
          adminDb,
          uid: "u_emp_poly",
          businessId: "biz_alpha",
          actorRole: "EMPLOYEE",
          claimedProfile: "teller",
          capability: "cash"
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      await expect(
        verifyServerEmployeeOperationalProfile({
          adminDb,
          uid: "u_ht_tampered",
          businessId: "biz_alpha",
          actorRole: "HEAD_TELLER",
          capability: "cash"
        })
      ).rejects.toMatchObject({
        code: "FORBIDDEN_ROLE_PROFILE_COMBINATION",
        statusCode: 403
      });
    });

    it("S4-BYP-03 & S4-BYP-04: BulkEmployeeImportService rejects forbidden pairs & missing profiles and preserves JUNIOR_TELLER + teller", () => {
      const plan = BulkEmployeeImportService.resolveImportPlan(
        "biz_alpha",
        [
          { name: "Bad Teller", email: "bad1@test.com", role: "JUNIOR_TELLER", operational_profile: "vendeur" },
          { name: "Bad Emp", email: "bad2@test.com", role: "EMPLOYEE", operational_profile: "teller" },
          { name: "Missing Prof", email: "bad3@test.com", role: "EMPLOYEE" },
          { name: "Valid Teller", email: "good1@test.com", role: "JUNIOR_TELLER", operational_profile: "teller" },
          { name: "Legacy Barber", email: "good2@test.com", role: "EMPLOYEE", operational_profile: "barber" }
        ],
        [],
        [],
        []
      );

      expect(plan.parsedRows[0].isValid).toBe(false);
      expect(plan.parsedRows[0].validationErrors.some((e) => e.includes("FORBIDDEN_ROLE_PROFILE_COMBINATION"))).toBe(true);

      expect(plan.parsedRows[1].isValid).toBe(false);
      expect(plan.parsedRows[1].validationErrors.some((e) => e.includes("FORBIDDEN_ROLE_PROFILE_COMBINATION"))).toBe(true);

      expect(plan.parsedRows[2].isValid).toBe(false);
      expect(plan.parsedRows[2].validationErrors.some((e) => e.includes("MISSING_OPERATIONAL_PROFILE"))).toBe(true);

      expect(plan.parsedRows[3].isValid).toBe(true);
      expect(plan.parsedRows[3].role).toBe("JUNIOR_TELLER");
      expect(plan.parsedRows[3].operational_profile).toBe("teller");

      expect(plan.parsedRows[4].isValid).toBe(true);
      expect(plan.parsedRows[4].role).toBe("EMPLOYEE");
      expect(plan.parsedRows[4].operational_profile).toBe("vendeur");
    });

    it("enforces cross-tenant & inactive actor fail-closed in verifyServerEmployeeOperationalProfile", async () => {
      const adminDb = createInMemoryAdminDb({
        "users/u_other": { uid: "u_other", business_id: "biz_beta", role: "SENIOR_TELLER", operational_profile: "teller", status: "ACTIVE" },
        "users/u_susp": { uid: "u_susp", business_id: "biz_alpha", role: "SENIOR_TELLER", operational_profile: "teller", status: "SUSPENDED" }
      });

      await expect(
        verifyServerEmployeeOperationalProfile({
          adminDb,
          uid: "u_other",
          businessId: "biz_alpha",
          actorRole: "SENIOR_TELLER",
          capability: "cash"
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN_TENANT_ACCESS", statusCode: 403 });

      await expect(
        verifyServerEmployeeOperationalProfile({
          adminDb,
          uid: "u_susp",
          businessId: "biz_alpha",
          actorRole: "SENIOR_TELLER",
          capability: "cash"
        })
      ).rejects.toMatchObject({ code: "INACTIVE_ACTOR", statusCode: 403 });
    });
  });

  describe("Suite 7 — Step 3 Mandatory MASTER_HEAD_TELLER Transfer-Approval Authority Correction", () => {
    it("S4-MHT-01 & S4-MHT-02: MASTER_HEAD_TELLER + teller is authorized for cash, till_supervise, transfer_initiate, and fails closed without 'teller'", async () => {
      const adminDb = createInMemoryAdminDb({
        "users/u_mht": { uid: "u_mht", business_id: "biz_alpha", role: "MASTER_HEAD_TELLER", operational_profile: "teller", status: "ACTIVE" },
        "employees/u_mht": { id: "u_mht", business_id: "biz_alpha", role: "MASTER_HEAD_TELLER", operational_profile: "teller", status: "ACTIVE" },
        "users/u_mht_noprof": { uid: "u_mht_noprof", business_id: "biz_alpha", role: "MASTER_HEAD_TELLER", status: "ACTIVE" },
        "employees/u_mht_noprof": { id: "u_mht_noprof", business_id: "biz_alpha", role: "MASTER_HEAD_TELLER", status: "ACTIVE" }
      });

      for (const cap of ["cash", "till_supervise", "transfer_initiate"] as const) {
        const verified = await verifyServerEmployeeOperationalProfile({
          adminDb,
          uid: "u_mht",
          businessId: "biz_alpha",
          actorRole: "MASTER_HEAD_TELLER",
          capability: cap
        });
        expect(verified.role).toBe("MASTER_HEAD_TELLER");
        expect(verified.operationalProfile).toBe("teller");
      }

      await expect(
        verifyServerEmployeeOperationalProfile({
          adminDb,
          uid: "u_mht_noprof",
          businessId: "biz_alpha",
          actorRole: "MASTER_HEAD_TELLER",
          capability: "cash"
        })
      ).rejects.toMatchObject({ code: "MISSING_OPERATIONAL_PROFILE", statusCode: 403 });
    });

    it("S4-MHT-03: MASTER_HEAD_TELLER MUST NEVER approve or reject internal transfers across policy, permissions, and server verifier", async () => {
      expect(canApproveInternalTransferRole("MASTER_HEAD_TELLER")).toBe(false);
      expect(canSuperviseTillLifecycleRole("MASTER_HEAD_TELLER")).toBe(true);
      expect(SUPERVISOR_TRANSFER_ROLES.has("MASTER_HEAD_TELLER")).toBe(false);
      expect(SUPERVISOR_TRANSFER_ROLES.has("HEAD_TELLER")).toBe(true);
      expect(SUPERVISOR_TRANSFER_ROLES.has("MANAGER")).toBe(true);
      expect(SUPERVISOR_TRANSFER_ROLES.has("OWNER")).toBe(true);
      expect(SUPERVISOR_TRANSFER_ROLES.has("ADMIN")).toBe(true);
      expect(SUPERVISOR_TRANSFER_ROLES.has("SUPER_ADMIN")).toBe(true);

      PermissionService.init(
        "MASTER_HEAD_TELLER",
        ["cash.view", "cash.operate", "cash.transfer", "cash.supervise"],
        fullFeatures,
        "ENTERPRISE",
        "ACTIVE",
        "biz_alpha"
      );
      expect(PermissionService.can("cash.operate")).toBe(true);
      expect(PermissionService.can("cash.transfer")).toBe(true);
      expect(PermissionService.can("transfer.approve")).toBe(false);

      const adminDb = createInMemoryAdminDb({
        "users/u_mht": { uid: "u_mht", business_id: "biz_alpha", role: "MASTER_HEAD_TELLER", operational_profile: "teller", status: "ACTIVE" },
        "employees/u_mht": { id: "u_mht", business_id: "biz_alpha", role: "MASTER_HEAD_TELLER", operational_profile: "teller", status: "ACTIVE" },
        "users/u_ht": { uid: "u_ht", business_id: "biz_alpha", role: "HEAD_TELLER", operational_profile: "teller", status: "ACTIVE" },
        "employees/u_ht": { id: "u_ht", business_id: "biz_alpha", role: "HEAD_TELLER", operational_profile: "teller", status: "ACTIVE" }
      });

      await expect(
        verifyServerEmployeeOperationalProfile({
          adminDb,
          uid: "u_mht",
          businessId: "biz_alpha",
          actorRole: "MASTER_HEAD_TELLER",
          capability: "transfer_approve"
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN_ROLE", statusCode: 403 });

      const htVerified = await verifyServerEmployeeOperationalProfile({
        adminDb,
        uid: "u_ht",
        businessId: "biz_alpha",
        actorRole: "HEAD_TELLER",
        capability: "transfer_approve"
      });
      expect(htVerified.role).toBe("HEAD_TELLER");
      expect(htVerified.operationalProfile).toBe("teller");

      // Direct service invocation check on ServerInternalTransferEngine.approveTransfer & rejectTransfer
      await expect(
        ServerInternalTransferEngine.approveTransfer(
          "tr_001",
          { businessId: "biz_alpha" },
          { uid: "u_mht", business_id: "biz_alpha", role: "MASTER_HEAD_TELLER" }
        )
      ).rejects.toMatchObject({ code: "FORBIDDEN_ROLE" });

      await expect(
        ServerInternalTransferEngine.rejectTransfer(
          "tr_001",
          { businessId: "biz_alpha", rejectionReason: "Motif valide pour test" },
          { uid: "u_mht", business_id: "biz_alpha", role: "MASTER_HEAD_TELLER" }
        )
      ).rejects.toMatchObject({ code: "FORBIDDEN_ROLE" });
    });

    it("OVERSIGHT roles (ACCOUNTANT, AUDITOR, SUPERVISOR) fail closed on commercial and cash operational access", () => {
      for (const role of ["ACCOUNTANT", "AUDITOR", "SUPERVISOR"]) {
        expect(evaluateOperationalProfileAccess(role, undefined, "sales").allowed).toBe(false);
        expect(evaluateOperationalProfileAccess(role, undefined, "services").allowed).toBe(false);
        expect(evaluateOperationalProfileAccess(role, "teller", "cash").allowed).toBe(false);
      }
    });
  });
});
