import { describe, it, expect, vi, beforeEach } from "vitest";
import Papa from "papaparse";
import {
  BulkEmployeeImportService,
  resolveOrCreateBranch,
  resolveOrCreateDepartment,
  evaluateBulkImportActorPermissions,
  OrgResolutionError,
  type BulkImportActorContext,
  type OrgImportContext
} from "../../services/workforce/BulkEmployeeImportService";
import { BranchRepository, DepartmentRepository } from "../../repositories/organization";
import { EmployeeRepository } from "../../repositories/EmployeeRepository";
import { BranchNormalizer } from "../../domains/organization/services/BranchNormalizer";
import { DepartmentNormalizer } from "../../domains/organization/services/DepartmentNormalizer";
import { Branch, Department, Role } from "../../types";

function makeBranch(overrides: Partial<Branch> = {}): Branch {
  return {
    id: overrides.id || "br_existing_1",
    business_id: overrides.business_id ?? "biz_p2",
    businessId: overrides.businessId ?? overrides.business_id ?? "biz_p2",
    name: overrides.name || "Bureau Central",
    code: overrides.code || "SUC-001",
    status: overrides.status || "ACTIVE",
    is_active: overrides.is_active !== undefined ? overrides.is_active : true,
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    address: "Port-au-Prince",
    location: "Centre",
    ...overrides
  };
}

function makeDepartment(overrides: Partial<Department> = {}): Department {
  return {
    id: overrides.id || "dep_existing_1",
    business_id: overrides.business_id ?? "biz_p2",
    businessId: overrides.businessId ?? overrides.business_id ?? "biz_p2",
    branch_id: overrides.branch_id ?? "br_existing_1",
    branchId: overrides.branchId ?? overrides.branch_id ?? "br_existing_1",
    name: overrides.name || "Barber Shop",
    normalized_name: overrides.normalized_name ?? "barber shop",
    code: overrides.code || "DEP-001",
    status: overrides.status || "ACTIVE",
    is_active: overrides.is_active !== undefined ? overrides.is_active : true,
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    budget: overrides.budget ?? 50000,
    ...overrides
  };
}

function hasUndefinedValue(obj: Record<string, any>): boolean {
  return Object.values(obj).some((v) => v === undefined);
}

describe("FINOPS Bulk Employee Import P2 — Organizational Resolution & RBAC", () => {
  const BIZ_ID = "biz_p2";
  const OWNER_ACTOR: BulkImportActorContext = {
    uid: "usr_owner_1",
    name: "Owner P2",
    role: "OWNER",
    business_id: BIZ_ID,
    status: "ACTIVE"
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Normalization, Matching & Canonical Name Preservation", () => {
    it("normalizes NFKC compatibility characters, NFD accents, case, and repeated spaces identically", () => {
      expect(BranchNormalizer.normalize("  Ｂｕｒｅａｕ   Cénträl  ")).toBe("bureau central");
      expect(BranchNormalizer.getCanonicalId("  Ｂｕｒｅａｕ   Cénträl  ")).toBe("bureaucentral");
      expect(DepartmentNormalizer.normalize("  Logistíc  &  Sécurité ")).toBe("logistic & securite");
      expect(DepartmentNormalizer.getCanonicalId("  Logistíc  &  Sécurité ")).toBe("logisticsecurite");
    });

    it("reuses existing branch and department preserving canonical stored ID, code, and name", async () => {
      const existingBranch = makeBranch({ id: "br_canon_1", name: "Bureau Central", code: "SUC-001" });
      const existingDept = makeDepartment({
        id: "dep_canon_1",
        branch_id: "br_canon_1",
        name: "Logistic & Sécurité",
        normalized_name: "logistic & securite",
        code: "DEP-001"
      });

      const branchSpy = vi.spyOn(BranchRepository, "createWithId").mockResolvedValue("should_not_run");
      const deptSpy = vi.spyOn(DepartmentRepository, "createWithId").mockResolvedValue("should_not_run");

      const ctx: OrgImportContext = {
        existingBranches: [existingBranch],
        existingDepartments: [existingDept],
        branchCache: new Map(),
        departmentCache: new Map()
      };

      const brRes = await resolveOrCreateBranch({
        businessId: BIZ_ID,
        branchName: "  buréau   CENTRAL ",
        actor: OWNER_ACTOR,
        importContext: ctx
      });
      expect(brRes.status).toBe("REUSED");
      expect(brRes.created).toBe(false);
      expect(brRes.branch.id).toBe("br_canon_1");
      expect(brRes.branch.name).toBe("Bureau Central");
      expect(brRes.branch.code).toBe("SUC-001");

      const depRes = await resolveOrCreateDepartment({
        businessId: BIZ_ID,
        departmentName: "  LOGISTIC & securite ",
        branchId: brRes.branch.id,
        actor: OWNER_ACTOR,
        importContext: ctx
      });
      expect(depRes.status).toBe("REUSED");
      expect(depRes.created).toBe(false);
      expect(depRes.department.id).toBe("dep_canon_1");
      expect(depRes.department.name).toBe("Logistic & Sécurité");
      expect(branchSpy).not.toHaveBeenCalled();
      expect(deptSpy).not.toHaveBeenCalled();
    });
  });

  describe("2. Deterministic Auto-Creation & Concurrent In-Flight Deduplication", () => {
    it("creates missing branch and department with OrganizationCodeService sequential codes and zero undefined values", async () => {
      const existingBranch = makeBranch({ id: "br_1", name: "Siège", code: "SUC-001" });
      const existingDept = makeDepartment({ id: "dep_1", branch_id: "br_1", name: "Direction", code: "DEP-001" });

      const createBranchMock = vi
        .spyOn(BranchRepository, "createWithId")
        .mockImplementation(async (id) => id);
      const createDeptMock = vi
        .spyOn(DepartmentRepository, "createWithId")
        .mockImplementation(async (id) => id);

      const ctx: OrgImportContext = {
        existingBranches: [existingBranch],
        existingDepartments: [existingDept],
        branchCache: new Map(),
        departmentCache: new Map()
      };

      const brRes = await resolveOrCreateBranch({
        businessId: BIZ_ID,
        branchName: "Succursale Pétion-Ville",
        actor: OWNER_ACTOR,
        importContext: ctx
      });

      expect(brRes.status).toBe("CREATED");
      expect(brRes.created).toBe(true);
      expect(brRes.branch.id.startsWith("b_auto_")).toBe(true);
      expect(brRes.branch.code).toBe("SUC-002");
      expect(brRes.branch.business_id).toBe(BIZ_ID);
      expect(hasUndefinedValue(brRes.branch)).toBe(false);
      expect(createBranchMock).toHaveBeenCalledTimes(1);

      const depRes = await resolveOrCreateDepartment({
        businessId: BIZ_ID,
        departmentName: "Nail Studio",
        branchId: brRes.branch.id,
        actor: OWNER_ACTOR,
        importContext: ctx
      });

      expect(depRes.status).toBe("CREATED");
      expect(depRes.created).toBe(true);
      expect(depRes.department.id.startsWith("d_auto_")).toBe(true);
      expect(depRes.department.code).toBe("DEP-002");
      expect(depRes.department.branch_id).toBe(brRes.branch.id);
      expect(depRes.department.budget).toBe(50000);
      expect(depRes.department.source).toBe("BULK_IMPORT");
      expect(hasUndefinedValue(depRes.department)).toBe(false);
      expect(createDeptMock).toHaveBeenCalledTimes(1);
    });

    it("deduplicates concurrent resolveOrCreateBranch and resolveOrCreateDepartment calls for the same entity", async () => {
      const listBranchesMock = vi.spyOn(BranchRepository, "listByBusiness").mockResolvedValue([]);
      const listDeptsMock = vi.spyOn(DepartmentRepository, "listByBusiness").mockResolvedValue([]);
      const createBranchMock = vi.spyOn(BranchRepository, "createWithId").mockImplementation(async (id) => {
        await new Promise((r) => setTimeout(r, 15));
        return id;
      });
      const createDeptMock = vi.spyOn(DepartmentRepository, "createWithId").mockImplementation(async (id) => {
        await new Promise((r) => setTimeout(r, 15));
        return id;
      });

      const ctx: OrgImportContext = {
        branchCache: new Map(),
        departmentCache: new Map(),
        inFlightBranches: new Map(),
        inFlightDepartments: new Map()
      };

      const variants = [
        "Succursale Nord",
        "  succursale   nord ",
        "SUCCURSALE NORD",
        "Ｓｕｃｃｕｒｓａｌｅ  Ｎｏｒｄ"
      ];

      const branchResults = await Promise.all(
        variants.map((v) =>
          resolveOrCreateBranch({
            businessId: BIZ_ID,
            branchName: v,
            actor: OWNER_ACTOR,
            importContext: ctx
          })
        )
      );

      expect(createBranchMock).toHaveBeenCalledTimes(1);
      expect(listBranchesMock).toHaveBeenCalledTimes(1);
      const uniqueBranchIds = new Set(branchResults.map((r) => r.branch.id));
      expect(uniqueBranchIds.size).toBe(1);
      expect(branchResults.filter((r) => r.created)).toHaveLength(1);

      const deptResults = await Promise.all(
        ["Barber Shop", "  barber   shop ", "BARBER SHOP"].map((v) =>
          resolveOrCreateDepartment({
            businessId: BIZ_ID,
            departmentName: v,
            branchId: branchResults[0].branch.id,
            actor: OWNER_ACTOR,
            importContext: ctx
          })
        )
      );

      expect(createDeptMock).toHaveBeenCalledTimes(1);
      expect(listDeptsMock).toHaveBeenCalledTimes(1);
      const uniqueDeptIds = new Set(deptResults.map((r) => r.department.id));
      expect(uniqueDeptIds.size).toBe(1);
      expect(deptResults.filter((r) => r.created)).toHaveLength(1);
    });

    it("generates collision-free sequential codes across multiple new branches/departments and scopes same-named departments per branch", () => {
      const existingBranches = [makeBranch({ id: "br_1", name: "Bureau Central", code: "SUC-001" })];
      const existingDepts = [makeDepartment({ id: "dep_1", branch_id: "br_1", name: "Barber Shop", code: "DEP-001" })];

      const plan = BulkEmployeeImportService.resolveImportPlan(
        BIZ_ID,
        [
          {
            displayName: "Agent Nord",
            email: "nord@finops.ht",
            position: "Caisse",
            role: "EMPLOYEE",
            branch_name: "Succursale Nord",
            department_name: "Caisse"
          },
          {
            displayName: "Agent Sud",
            email: "sud@finops.ht",
            position: "Caisse",
            role: "EMPLOYEE",
            branch_name: "Succursale Sud",
            department_name: "Caisse"
          }
        ],
        existingBranches,
        existingDepts,
        [],
        { actor: OWNER_ACTOR }
      );

      expect(plan.summary.validRows).toBe(2);
      expect(plan.branchesToCreate).toHaveLength(2);
      expect(plan.branchesToCreate.map((b) => b.code)).toEqual(["SUC-002", "SUC-003"]);
      expect(plan.departmentsToCreate).toHaveLength(2);
      expect(plan.departmentsToCreate.map((d) => d.code)).toEqual(["DEP-002", "DEP-003"]);
      expect(plan.departmentsToCreate[0].id).not.toBe(plan.departmentsToCreate[1].id);
      expect(plan.departmentsToCreate[0].branch_id).toBe(plan.branchesToCreate[0].id);
      expect(plan.departmentsToCreate[1].branch_id).toBe(plan.branchesToCreate[1].id);
      expect(plan.parsedRows[0].branchId).toBe(plan.branchesToCreate[0].id);
      expect(plan.parsedRows[0].departmentId).toBe(plan.departmentsToCreate[0].id);
      expect(plan.parsedRows[1].branchId).toBe(plan.branchesToCreate[1].id);
      expect(plan.parsedRows[1].departmentId).toBe(plan.departmentsToCreate[1].id);
    });
  });

  describe("3. Fail-Closed Integrity: No Arbitrary Fallback, Tenant Isolation, Inactive & Ambiguity Blocking", () => {
    it("NEVER falls back to Bureau Central, Administration, MAIN_BRANCH, or existingBranches[0] when branch/dept missing", () => {
      const existingBranches = [makeBranch({ id: "br_only", name: "Succursale Unique" })];
      const existingDepts = [makeDepartment({ id: "dep_only", name: "Direction Unique", branch_id: "br_only" })];

      const plan = BulkEmployeeImportService.resolveImportPlan(
        BIZ_ID,
        [
          {
            displayName: "Sans Succursale",
            email: "nobranch@finops.ht",
            position: "Barber",
            role: "EMPLOYEE",
            branch_name: "",
            department_name: "Direction Unique"
          },
          {
            displayName: "Sans Département",
            email: "nodept@finops.ht",
            position: "Barber",
            role: "EMPLOYEE",
            branch_name: "Succursale Unique",
            department_name: "   "
          },
          {
            displayName: "Placeholder N/A",
            email: "placeholder@finops.ht",
            position: "Barber",
            role: "EMPLOYEE",
            branch_name: "N/A",
            department_name: "null"
          }
        ],
        existingBranches,
        existingDepts,
        [],
        { actor: OWNER_ACTOR }
      );

      expect(plan.summary.validRows).toBe(0);
      expect(plan.summary.blockedRowsCount).toBe(3);
      expect(plan.parsedRows[0].branchResolutionStatus).toBe("BLOCKED");
      expect(plan.parsedRows[0].validationErrors.some((e) => e.includes("MISSING_BRANCH_REFERENCE"))).toBe(true);
      expect(plan.parsedRows[1].departmentResolutionStatus).toBe("BLOCKED");
      expect(plan.parsedRows[1].validationErrors.some((e) => e.includes("MISSING_DEPARTMENT_REFERENCE"))).toBe(true);
      expect(plan.parsedRows[2].branchResolutionStatus).toBe("BLOCKED");
      expect(plan.parsedRows[2].departmentResolutionStatus).toBe("BLOCKED");
      expect(plan.parsedRows[2].validationErrors.some((e) => e.includes("INVALID_ORG_REFERENCE"))).toBe(true);
      expect(plan.branchesToCreate).toHaveLength(0);
      expect(plan.departmentsToCreate).toHaveLength(0);
    });

    it("rejects cross-tenant branches and departments and ignores cross-tenant records", async () => {
      const otherTenantBranch = makeBranch({
        id: "br_other_biz",
        business_id: "biz_competitor",
        businessId: "biz_competitor",
        name: "Bureau Central"
      });
      const otherTenantDept = makeDepartment({
        id: "dep_other_biz",
        business_id: "biz_competitor",
        businessId: "biz_competitor",
        branch_id: "br_other_biz",
        name: "Barber Shop"
      });

      await expect(
        resolveOrCreateBranch({
          businessId: BIZ_ID,
          branchName: "Bureau Central",
          actor: OWNER_ACTOR,
          importContext: { existingBranches: [otherTenantBranch], dryRun: true }
        })
      ).rejects.toMatchObject({ code: "CROSS_TENANT_ORG_REFERENCE" });

      await expect(
        resolveOrCreateDepartment({
          businessId: BIZ_ID,
          departmentName: "Barber Shop",
          actor: OWNER_ACTOR,
          importContext: { existingDepartments: [otherTenantDept], dryRun: true }
        })
      ).rejects.toMatchObject({ code: "CROSS_TENANT_ORG_REFERENCE" });
    });

    it("rejects inactive existing branch/department without silently creating duplicates", async () => {
      const inactiveBranch = makeBranch({ id: "br_inact", name: "Ancienne Agence", status: "INACTIVE", is_active: false, isActive: false });
      const activeBranch = makeBranch({ id: "br_act", name: "Agence Active" });
      const inactiveDept = makeDepartment({ id: "dep_inact", branch_id: "br_act", name: "Ancien Service", status: "INACTIVE", is_active: false, isActive: false });

      const plan = BulkEmployeeImportService.resolveImportPlan(
        BIZ_ID,
        [
          {
            displayName: "Emp 1",
            email: "emp1@finops.ht",
            position: "Barber",
            role: "EMPLOYEE",
            branch_name: "Ancienne Agence",
            department_name: "Barber Shop"
          },
          {
            displayName: "Emp 2",
            email: "emp2@finops.ht",
            position: "Barber",
            role: "EMPLOYEE",
            branch_name: "Agence Active",
            department_name: "Ancien Service"
          }
        ],
        [inactiveBranch, activeBranch],
        [inactiveDept],
        [],
        { actor: OWNER_ACTOR }
      );

      expect(plan.summary.validRows).toBe(0);
      expect(plan.summary.blockedRowsCount).toBe(2);
      expect(plan.parsedRows[0].validationErrors.some((e) => e.includes("INACTIVE_ORG_REFERENCE"))).toBe(true);
      expect(plan.parsedRows[1].validationErrors.some((e) => e.includes("INACTIVE_ORG_REFERENCE"))).toBe(true);
      expect(plan.branchesToCreate).toHaveLength(0);
      expect(plan.departmentsToCreate).toHaveLength(0);
    });

    it("blocks ambiguous duplicate branch or department references fail-closed", () => {
      const dupBranch1 = makeBranch({ id: "br_dup_1", name: "Bureau Central", code: "SUC-001" });
      const dupBranch2 = makeBranch({ id: "br_dup_2", name: "  bureau   central ", code: "SUC-002" });
      const activeBranch = makeBranch({ id: "br_ok", name: "Succursale Sud", code: "SUC-003" });
      const dupDept1 = makeDepartment({ id: "dep_dup_1", branch_id: "br_ok", name: "Nail Studio", code: "DEP-001" });
      const dupDept2 = makeDepartment({ id: "dep_dup_2", branch_id: "br_ok", name: "nail  stúdio", code: "DEP-002" });

      const plan = BulkEmployeeImportService.resolveImportPlan(
        BIZ_ID,
        [
          {
            displayName: "Ambig Branch",
            email: "amb1@finops.ht",
            position: "Barber",
            role: "EMPLOYEE",
            branch_name: "Bureau Central",
            department_name: "Ventes"
          },
          {
            displayName: "Ambig Dept",
            email: "amb2@finops.ht",
            position: "Nail Tech",
            role: "EMPLOYEE",
            branch_name: "Succursale Sud",
            department_name: "Nail Studio"
          }
        ],
        [dupBranch1, dupBranch2, activeBranch],
        [dupDept1, dupDept2],
        [],
        { actor: OWNER_ACTOR }
      );

      expect(plan.summary.validRows).toBe(0);
      expect(plan.summary.blockedRowsCount).toBe(2);
      expect(plan.parsedRows[0].validationErrors.some((e) => e.includes("AMBIGUOUS_BRANCH_REFERENCE"))).toBe(true);
      expect(plan.parsedRows[1].validationErrors.some((e) => e.includes("AMBIGUOUS_DEPARTMENT_REFERENCE"))).toBe(true);
    });

    it("does not create orphan new branches/departments if the only referencing employee row is blocked", () => {
      const plan = BulkEmployeeImportService.resolveImportPlan(
        BIZ_ID,
        [
          {
            displayName: "Invalid Email User",
            email: "not-an-email",
            position: "Barber",
            role: "EMPLOYEE",
            branch_name: "Orphan Branch",
            department_name: "Orphan Dept"
          }
        ],
        [],
        [],
        [],
        { actor: OWNER_ACTOR }
      );

      expect(plan.summary.validRows).toBe(0);
      expect(plan.summary.blockedRowsCount).toBe(1);
      expect(plan.branchesToCreate).toHaveLength(0);
      expect(plan.departmentsToCreate).toHaveLength(0);
    });
  });

  describe("4. RBAC Enforcement Matrix (Import vs Branch Creation vs Department Creation)", () => {
    it("allows OWNER, ADMIN, MANAGER, SUPER_ADMIN while denying EMPLOYEE, SUPERVISOR, TELLER*, AUDITOR, ACCOUNTANT, UNASSIGNED", () => {
      for (const role of ["OWNER", "ADMIN", "MANAGER", "SUPER_ADMIN"]) {
        const v = evaluateBulkImportActorPermissions({ uid: "u1", role, business_id: BIZ_ID, status: "ACTIVE" }, BIZ_ID);
        expect(v.allowedToImportEmployees).toBe(true);
        expect(v.canCreateBranch).toBe(true);
        expect(v.canCreateDepartment).toBe(true);
      }

      const deniedRoles: Array<Role | string> = [
        "EMPLOYEE",
        "SUPERVISOR",
        "TELLER",
        "JUNIOR_TELLER",
        "SENIOR_TELLER",
        "HEAD_TELLER",
        "MASTER_HEAD_TELLER",
        "AUDITOR",
        "ACCOUNTANT",
        "UNASSIGNED",
        ""
      ];

      for (const role of deniedRoles) {
        const v = evaluateBulkImportActorPermissions(
          { uid: "u_denied", role, business_id: BIZ_ID, status: "ACTIVE", permissions: ["employee.import", "branch.create", "department.create"] },
          BIZ_ID
        );
        expect(v.allowedToImportEmployees).toBe(false);
        expect(v.canCreateBranch).toBe(false);
        expect(v.canCreateDepartment).toBe(false);
      }
    });

    it("allows import-only actor (without branch.create/department.create) to reuse existing orgs but blocks rows requiring new org creation", async () => {
      const scopedManager: BulkImportActorContext = {
        uid: "u_hr_mgr",
        role: "MANAGER",
        business_id: BIZ_ID,
        status: "ACTIVE",
        permissions: ["employee.import", "manage_employees"]
      };

      const existingBranch = makeBranch({ id: "br_1", name: "Bureau Central", code: "SUC-001" });
      const existingDept = makeDepartment({ id: "dep_1", branch_id: "br_1", name: "Barber Shop", code: "DEP-001" });

      const plan = BulkEmployeeImportService.resolveImportPlan(
        BIZ_ID,
        [
          {
            displayName: "Reuse Valid",
            email: "reuse.ok@finops.ht",
            position: "Barber",
            role: "EMPLOYEE",
            branch_name: "Bureau Central",
            department_name: "Barber Shop"
          },
          {
            displayName: "Needs New Branch",
            email: "new.br@finops.ht",
            position: "Barber",
            role: "EMPLOYEE",
            branch_name: "Nouvelle Agence",
            department_name: "Barber Shop"
          },
          {
            displayName: "Needs New Dept",
            email: "new.dep@finops.ht",
            position: "Barber",
            role: "EMPLOYEE",
            branch_name: "Bureau Central",
            department_name: "Nouveau Département"
          }
        ],
        [existingBranch],
        [existingDept],
        [],
        { actor: scopedManager }
      );

      expect(plan.parsedRows[0].isValid).toBe(true);
      expect(plan.parsedRows[0].branchResolutionStatus).toBe("EXISTING");
      expect(plan.parsedRows[0].departmentResolutionStatus).toBe("EXISTING");

      expect(plan.parsedRows[1].isValid).toBe(false);
      expect(plan.parsedRows[1].validationErrors.some((e) => e.includes("UNAUTHORIZED_BRANCH_CREATION"))).toBe(true);

      expect(plan.parsedRows[2].isValid).toBe(false);
      expect(plan.parsedRows[2].validationErrors.some((e) => e.includes("UNAUTHORIZED_DEPARTMENT_CREATION"))).toBe(true);

      // Even if a plan containing new branches is manually handed to executeImportPlan, execution re-verifies RBAC fail-closed
      const forgedPlan = BulkEmployeeImportService.resolveImportPlan(
        BIZ_ID,
        [
          {
            displayName: "Forged",
            email: "forged@finops.ht",
            position: "Barber",
            role: "EMPLOYEE",
            branch_name: "Nouvelle Agence",
            department_name: "Nouveau Département"
          }
        ],
        [],
        [],
        [],
        { actor: OWNER_ACTOR }
      );
      const execBlocked = await BulkEmployeeImportService.executeImportPlan(forgedPlan, scopedManager);
      expect(execBlocked.success).toBe(false);
      expect(execBlocked.errorCategory).toBe("PERMISSION");
      expect(execBlocked.errorCode).toBe("UNAUTHORIZED_BRANCH_CREATION");
    });

    it("denies cross-tenant, inactive, and null actors on both resolveImportPlan and executeImportPlan", async () => {
      const crossTenantOwner: BulkImportActorContext = {
        uid: "u_other",
        role: "OWNER",
        business_id: "biz_attacker",
        status: "ACTIVE"
      };
      const inactiveOwner: BulkImportActorContext = {
        uid: "u_susp",
        role: "OWNER",
        business_id: BIZ_ID,
        status: "SUSPENDED"
      };

      const rows = [
        {
          displayName: "Test Emp",
          email: "test.emp@finops.ht",
          position: "Barber",
          role: "EMPLOYEE",
          branch_name: "Bureau Central",
          department_name: "Barber Shop"
        }
      ];

      for (const badActor of [crossTenantOwner, inactiveOwner, null]) {
        const plan = BulkEmployeeImportService.resolveImportPlan(BIZ_ID, rows, [], [], [], { actor: badActor });
        expect(plan.summary.validRows).toBe(0);
        expect(plan.summary.blockedRowsCount).toBe(1);
        expect(plan.branchesToCreate).toHaveLength(0);

        const validPlan = BulkEmployeeImportService.resolveImportPlan(BIZ_ID, rows, [], [], [], { actor: OWNER_ACTOR });
        const execRes = await BulkEmployeeImportService.executeImportPlan(validPlan, badActor);
        expect(execRes.success).toBe(false);
        expect(execRes.errorCategory).toBe("PERMISSION");
      }
    });
  });

  describe("5. Preview vs Confirm Isolation, Foreign Key Integrity & Partial Batch Recovery", () => {
    it("performs ZERO Firestore repository writes during dry-run preview and creates orgs only on execution", async () => {
      const branchCreateSpy = vi.spyOn(BranchRepository, "create");
      const branchCreateWithIdSpy = vi.spyOn(BranchRepository, "createWithId");
      const deptCreateSpy = vi.spyOn(DepartmentRepository, "create");
      const deptCreateWithIdSpy = vi.spyOn(DepartmentRepository, "createWithId");
      const batchSpy = vi.spyOn(EmployeeRepository, "createBulkImportBatch").mockResolvedValueOnce({
        committedBatches: 2,
        totalBatches: 2,
        committedEmployeesCount: 2,
        metaCommitted: true
      });

      const existingBranch = makeBranch({ id: "br_existing", name: "Bureau Central", code: "SUC-001" });
      const existingDept = makeDepartment({ id: "dep_existing", branch_id: "br_existing", name: "Barber Shop", code: "DEP-001" });

      const csv = [
        "displayName,email,phone,position,role,contract_type,pay_regime,salary_base_htg,commission_rate,branch_name,department_name,hire_date",
        "Jean Existing,jean.ex@finops.ht,50936001111,Barber,EMPLOYEE,cdd,Commission,0,0.45,Bureau Central,Barber Shop,2026-01-01",
        "Marie New,marie.new@finops.ht,50936002222,Nail Tech,EMPLOYEE,cdd,Hybrid,12000,0.10,Succursale Nord,Nail Studio,2026-01-01"
      ].join("\n");
      const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });

      const plan = BulkEmployeeImportService.resolveImportPlan(
        BIZ_ID,
        parsed.data,
        [existingBranch],
        [existingDept],
        [],
        { actor: OWNER_ACTOR }
      );

      expect(branchCreateSpy).not.toHaveBeenCalled();
      expect(branchCreateWithIdSpy).not.toHaveBeenCalled();
      expect(deptCreateSpy).not.toHaveBeenCalled();
      expect(deptCreateWithIdSpy).not.toHaveBeenCalled();
      expect(batchSpy).not.toHaveBeenCalled();

      expect(plan.summary.validRows).toBe(2);
      expect(plan.summary.reusedBranchesCount).toBe(1);
      expect(plan.summary.newBranchesCount).toBe(1);
      expect(plan.summary.reusedDepartmentsCount).toBe(1);
      expect(plan.summary.newDepartmentsCount).toBe(1);
      expect(plan.summary.blockedRowsCount).toBe(0);

      const result = await BulkEmployeeImportService.executeImportPlan(plan, OWNER_ACTOR);
      expect(result.success).toBe(true);
      expect(batchSpy).toHaveBeenCalledTimes(1);

      // Verify FK integrity & absence of undefined values across all 4 generated collections
      expect(result.createdEmployees[0].branchId).toBe("br_existing");
      expect(result.createdEmployees[0].departmentId).toBe("dep_existing");
      expect(result.createdEmployees[1].branchId).toBe(result.createdBranches[0].id);
      expect(result.createdEmployees[1].departmentId).toBe(result.createdDepartments[0].id);
      expect(result.createdDepartments[0].branch_id).toBe(result.createdBranches[0].id);

      for (const e of result.createdEmployees) expect(hasUndefinedValue(e)).toBe(false);
      for (const inv of result.createdInvitations) expect(hasUndefinedValue(inv)).toBe(false);
      for (const badge of result.createdBadges) expect(hasUndefinedValue(badge)).toBe(false);
      for (const con of result.createdContracts) expect(hasUndefinedValue(con)).toBe(false);
    });

    it("reports accurate partial-batch failure progress without miscounting metadata batch as 45 employees", async () => {
      const rows = Array.from({ length: 60 }, (_, idx) => ({
        displayName: `Staff ${idx + 1}`,
        email: `staff${idx + 1}@finops.ht`,
        position: "Barber",
        role: "EMPLOYEE",
        branch_name: "Nouvelle Succursale",
        department_name: "Barber Shop"
      }));

      const plan = BulkEmployeeImportService.resolveImportPlan(BIZ_ID, rows, [], [], [], { actor: OWNER_ACTOR });
      expect(plan.summary.validRows).toBe(60);

      const simulatedErr: any = new Error("Network failure on chunk 2");
      simulatedErr.batchProgress = {
        committedBatches: 2, // 1 metaBatch + 1 employee chunk (45 employees)
        totalBatches: 3,
        committedEmployeesCount: 45,
        metaCommitted: true,
        failedBatchIndex: 3
      };

      const batchSpy = vi.spyOn(EmployeeRepository, "createBulkImportBatch").mockRejectedValueOnce(simulatedErr);

      const res = await BulkEmployeeImportService.executeImportPlan(plan, OWNER_ACTOR);
      expect(res.success).toBe(false);
      expect(res.status).toBe("PARTIAL_FAILURE");
      expect(res.metaCommitted).toBe(true);
      expect(res.importedEmployeesCount).toBe(45);
      expect(res.committedEmployeesCount).toBe(45);
      expect(res.createdBranchesCount).toBe(1);
      expect(res.createdDepartmentsCount).toBe(1);
      expect(res.failedStep).toBe("CHUNK_BATCH_3");
      expect(res.canRetryIdempotently).toBe(true);

      batchSpy.mockRestore();
    });
  });
});
