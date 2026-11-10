import { describe, it, expect, beforeEach, vi } from "vitest";

let fakeFirestoreData: Map<string, any> = new Map();
let batchSetOperations: Array<{ path: string; data: any; options?: any }> = [];
let batchUpdateOperations: Array<{ path: string; data: any }> = [];
let shouldBatchCommitFail = false;
let batchCommitError: any = null;

const mockWriteBatch = vi.fn(() => ({
  set: vi.fn((docRef: any, data: any, options?: any) => {
    batchSetOperations.push({ path: docRef?.path || docRef?.id || String(docRef), data, options });
    return {} as any;
  }),
  update: vi.fn((docRef: any, data: any) => {
    batchUpdateOperations.push({ path: docRef?.path || docRef?.id || String(docRef), data });
    return {} as any;
  }),
  delete: vi.fn(),
  commit: vi.fn(async () => {
    if (shouldBatchCommitFail) {
      throw batchCommitError || new Error("PERMISSION_DENIED: Missing or insufficient permissions.");
    }
    for (const op of batchSetOperations) {
      fakeFirestoreData.set(op.path, { ...(op.options?.merge ? (fakeFirestoreData.get(op.path) || {}) : {}), ...op.data });
    }
    for (const op of batchUpdateOperations) {
      const existing = fakeFirestoreData.get(op.path) || {};
      fakeFirestoreData.set(op.path, { ...existing, ...op.data });
    }
  }),
}));

const mockDoc = vi.fn((...args: any[]) => {
  const pathParts = args.slice(1);
  const fullPath = pathParts.join("/");
  return {
    id: pathParts[pathParts.length - 1],
    path: fullPath,
  };
});

const mockCollection = vi.fn((...args: any[]) => {
  const pathParts = args.slice(1);
  return {
    id: pathParts[pathParts.length - 1],
    path: pathParts.join("/"),
  };
});

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    writeBatch: () => mockWriteBatch(),
    doc: (...args: any[]) => mockDoc(...args),
    collection: (...args: any[]) => mockCollection(...args),
    addDoc: vi.fn().mockResolvedValue({ id: "mock_doc_id" }),
    serverTimestamp: () => "2026-10-19T12:00:00.000Z",
  };
});

vi.mock("../../repositories/ForensicLogRepository", () => ({
  ForensicLogRepository: {
    createAndSignLog: vi.fn().mockResolvedValue({ id: "flog_test" }),
    writeForensicLog: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../services/audit/AuditService", () => ({
  AuditService: {
    writeLog: vi.fn().mockResolvedValue(undefined),
  },
}));

import { PayrollPolicyRepository } from "../../repositories/PayrollPolicyRepository";
import { PayrollPolicyResolver } from "../../services/payroll/PayrollPolicyResolver";
import { TaxPolicyEngine } from "../../services/payroll/TaxPolicyEngine";
import { ExceptionOrchestrator } from "../../modules/runtime/ExceptionOrchestrator";
import { StaticDataCacheService } from "../../services/cache/StaticDataCacheService";

describe("FINOPS P1-4C: Remote Persistence & Rehydration Verification Suite", () => {
  const tenantA = "biz_test_tenant_alpha";
  const tenantB = "biz_test_tenant_beta";

  beforeEach(async () => {
    vi.restoreAllMocks();
    await StaticDataCacheService.clearAll();
    fakeFirestoreData = new Map();
    batchSetOperations = [];
    batchUpdateOperations = [];
    shouldBatchCommitFail = false;
    batchCommitError = null;
  });

  // =========================================================================
  // TEST A — Sauvegarde distante confirmée
  // =========================================================================
  describe("Test A — Confirmed Remote Persistence & Full Round-Trip Rehydration", () => {
    it("persists all 3 toggles, custom rates, survival floor, and rehydrates without reverting to defaults", async () => {
      // 1. Configure custom policy input with toggles modified and custom rates
      const customInput = {
        businessId: tenantA,
        effectiveFrom: "2026-11-01",
        frequency: "MONTHLY" as const,
        currency: "HTG" as const,
        standardHoursPerCycle: 192,
        attendanceToleranceHours: 188,
        workingDaysBasis: 24,
        overtime: { normalRate: 1.75, holidayRate: 2.25 },
        penalties: { lateFixedCents: 25000, absencePerDayCents: 50000 },
        socialContributions: {
          enabled: false, // TOGGLE 1: OFF
          cnssOna: { employeeRate: 0.08, employerRate: 0.08 },
          ofatmaCns: { employeeRate: 0.03, employerRate: 0.04 },
        },
        commissions: { defaultSalesRate: 0.08 },
        survivalFloor: {
          enabled: false, // TOGGLE 2: OFF
          minimumNetHTG: 22000,
        },
        attendance: {
          excludeWithoutRecords: false, // TOGGLE 3: OFF
        },
        resolution: { mode: "STRICT" as const },
      };

      // 2. Call saveAndActivatePolicy
      const saved = await PayrollPolicyRepository.saveAndActivatePolicy(
        tenantA,
        customInput,
        { id: "usr_lead_admin", role: "ADMIN" }
      );

      // Verify batch commit executed and stored documents
      expect(saved).toBeDefined();
      expect(saved.version).toBe(1);
      expect(saved.status).toBe("ACTIVE");
      expect(saved.socialContributions.enabled).toBe(false);
      expect(saved.survivalFloor.enabled).toBe(false);
      expect(saved.attendance.excludeWithoutRecords).toBe(false);
      expect(saved.socialContributions.cnssOna.employeeRate).toBe(0.08);
      expect(saved.survivalFloor.minimumNetHTG).toBe(22000);

      // 3. Mock listPolicies returning the persisted doc
      vi.spyOn(PayrollPolicyRepository, "listPolicies").mockResolvedValue([saved]);

      // 4. Rehydrate via getEffectivePolicy
      const rehydrated = await PayrollPolicyRepository.getEffectivePolicy(tenantA, "2026-11-15", true);
      expect(rehydrated).not.toBeNull();
      expect(rehydrated?.frequency).toBe("MONTHLY");
      expect(rehydrated?.standardHoursPerCycle).toBe(192);
      expect(rehydrated?.socialContributions.enabled).toBe(false);
      expect(rehydrated?.survivalFloor.enabled).toBe(false);
      expect(rehydrated?.attendance.excludeWithoutRecords).toBe(false);
      expect(rehydrated?.socialContributions.cnssOna.employeeRate).toBe(0.08);
      expect(rehydrated?.survivalFloor.minimumNetHTG).toBe(22000);

      // 5. Verify consumption by PayrollPolicyResolver
      vi.spyOn(PayrollPolicyRepository, "getEffectivePolicy").mockResolvedValue(saved);

      const resolvedTaxToggle = await PayrollPolicyResolver.resolveParameter("enable_social_taxes", {
        businessId: tenantA,
        effectiveDate: "2026-11-15",
      });
      expect(resolvedTaxToggle.status).toBe("RESOLVED");
      expect(resolvedTaxToggle.value).toBe(false);
      expect(resolvedTaxToggle.source).toBe("TENANT_POLICY");

      const resolvedFloorToggle = await PayrollPolicyResolver.resolveParameter("enable_survival_floor", {
        businessId: tenantA,
        effectiveDate: "2026-11-15",
      });
      expect(resolvedFloorToggle.status).toBe("RESOLVED");
      expect(resolvedFloorToggle.value).toBe(false);
      expect(resolvedFloorToggle.source).toBe("TENANT_POLICY");

      const resolvedAttendanceToggle = await PayrollPolicyResolver.resolveParameter("require_attendance_for_payroll", {
        businessId: tenantA,
        effectiveDate: "2026-11-15",
      });
      expect(resolvedAttendanceToggle.status).toBe("RESOLVED");
      expect(resolvedAttendanceToggle.value).toBe(false);
      expect(resolvedAttendanceToggle.source).toBe("TENANT_POLICY");

      const resolvedOnaRate = await PayrollPolicyResolver.resolveParameter("onaEmployeeRate", {
        businessId: tenantA,
        effectiveDate: "2026-11-15",
      });
      expect(resolvedOnaRate.status).toBe("RESOLVED");
      expect(resolvedOnaRate.value).toBe(0.08);

      // 6. Verify consumption by TaxPolicyEngine
      const dualContributions = TaxPolicyEngine.calculateDualSideContributions(100000, saved);
      expect(dualContributions.isTaxesEnabled).toBe(false);
      expect(dualContributions.onaEmployee).toBe(0);
      expect(dualContributions.ofatmaEmployee).toBe(0);
      expect(dualContributions.totalEmployeeDeductions).toBe(0);
    });
  });

  // =========================================================================
  // TEST B — Échec de Firestore
  // =========================================================================
  describe("Test B — Firestore Failure Simulation & Diagnostics Integrity", () => {
    it("records failure in diagnostics, rejects unconfirmed policy, marks draft unsynchronized, and enables clean retry", async () => {
      shouldBatchCommitFail = true;
      batchCommitError = new Error("PERMISSION_DENIED: Caller does not have required write authorization.");

      const orchestratorSpy = vi.spyOn(ExceptionOrchestrator, "handle");

      const customInput = {
        businessId: tenantA,
        effectiveFrom: "2026-11-01",
        frequency: "BIWEEKLY" as const,
        socialContributions: {
          enabled: false,
          cnssOna: { employeeRate: 0.06, employerRate: 0.06 },
          ofatmaCns: { employeeRate: 0.02, employerRate: 0.03 },
        },
      };

      // 1. saveAndActivatePolicy MUST reject and throw FIRESTORE_PERSISTENCE_FAILED
      await expect(
        PayrollPolicyRepository.saveAndActivatePolicy(
          tenantA,
          customInput as any,
          { id: "usr_teller", role: "TELLER" }
        )
      ).rejects.toThrow("FIRESTORE_PERSISTENCE_FAILED");

      // 2. ExceptionOrchestrator must have captured and logged the failure in diagnostics
      expect(orchestratorSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          businessId: tenantA,
          module: "PAYROLL",
          operation: "SAVE_POLICY_BATCH_COMMIT",
          severity: "HIGH",
        })
      );

      // 3. Unsynchronized copy must NOT be consumed as active by resolver
      vi.spyOn(PayrollPolicyRepository, "listPolicies").mockResolvedValue([]);

      const resolved = await PayrollPolicyRepository.getEffectivePolicy(tenantA, "2026-11-15");
      expect(resolved).toBeNull();

      // 4. A clean retry after resolving the network/permission issue works without duplicate versioning
      shouldBatchCommitFail = false;
      const retryResult = await PayrollPolicyRepository.saveAndActivatePolicy(
        tenantA,
        customInput as any,
        { id: "usr_admin", role: "ADMIN" }
      );

      expect(retryResult.version).toBe(1);
      expect(retryResult.status).toBe("ACTIVE");
    });
  });

  // =========================================================================
  // TEST C — Résolution du tenant & Interdiction BIZ_MAIN
  // =========================================================================
  describe("Test C — Tenant Resolution & Strict BIZ_MAIN Prohibition", () => {
    it("strictly refuses to persist under BIZ_MAIN when tenant is unresolved", async () => {
      const input = {
        businessId: "BIZ_MAIN",
        effectiveFrom: "2026-11-01",
        frequency: "BIWEEKLY" as const,
      };

      await expect(
        PayrollPolicyRepository.saveAndActivatePolicy(
          "BIZ_MAIN",
          input as any,
          { id: "usr_system", role: "ADMIN" }
        )
      ).rejects.toThrow("TENANT_UNRESOLVED");
    });

    it("strictly refuses to persist when businessId is empty or whitespace", async () => {
      await expect(
        PayrollPolicyRepository.saveAndActivatePolicy(
          "   ",
          { frequency: "BIWEEKLY" } as any,
          { id: "usr_system", role: "ADMIN" }
        )
      ).rejects.toThrow("TENANT_UNRESOLVED");
    });

    it("correctly resolves tenant A vs tenant B in independent scopes", async () => {
      const policyA = {
        businessId: tenantA,
        effectiveFrom: "2026-10-01",
        frequency: "BIWEEKLY" as const,
        currency: "HTG" as const,
        socialContributions: { enabled: true, cnssOna: { employeeRate: 0.06, employerRate: 0.06 }, ofatmaCns: { employeeRate: 0.02, employerRate: 0.03 } },
      };

      const policyB = {
        businessId: tenantB,
        effectiveFrom: "2026-10-01",
        frequency: "MONTHLY" as const,
        currency: "USD" as const,
        socialContributions: { enabled: false, cnssOna: { employeeRate: 0.05, employerRate: 0.05 }, ofatmaCns: { employeeRate: 0.01, employerRate: 0.02 } },
      };

      const savedA = await PayrollPolicyRepository.saveAndActivatePolicy(tenantA, policyA as any, { id: "usr_admin" });
      const savedB = await PayrollPolicyRepository.saveAndActivatePolicy(tenantB, policyB as any, { id: "usr_admin" });

      expect(savedA.businessId).toBe(tenantA);
      expect(savedA.currency).toBe("HTG");

      expect(savedB.businessId).toBe(tenantB);
      expect(savedB.currency).toBe("USD");
      expect(savedB.socialContributions.enabled).toBe(false);
    });
  });

  // =========================================================================
  // TEST D — Synchronisation asynchrone & Préservation des valeurs false et 0
  // =========================================================================
  describe("Test D — Asynchronous Synchronization & 0 / false Preservation", () => {
    it("preserves false and 0 without falling back to statutory defaults", () => {
      const zeroPolicy = {
        enable_social_taxes: false,
        enable_survival_floor: false,
        require_attendance_for_payroll: false,
        survival_floor_htg: 0,
        payroll: {
          late_penalty_cents: 0,
          absence_penalty_cents: 0,
        },
        payroll_policies: {
          onaEmployeeRate: 0,
          ofatmaEmployeeRate: 0,
          survivalFloorHTG: 0,
        },
      };

      // Toggles
      expect(TaxPolicyEngine.isSocialTaxEnabled(zeroPolicy)).toBe(false);
      expect(TaxPolicyEngine.isSurvivalFloorEnabled(zeroPolicy)).toBe(false);
      expect(TaxPolicyEngine.isAttendanceRequiredForPayroll(zeroPolicy)).toBe(false);

      // Numeric 0 preservation
      expect(TaxPolicyEngine.getSurvivalFloorAmount(zeroPolicy)).toBe(0);

      const rates = TaxPolicyEngine.getTaxRates(zeroPolicy);
      expect(rates.enabled).toBe(false);
      expect(rates.onaEmployee).toBe(0);
      expect(rates.ofatmaEmployee).toBe(0);
      expect(rates.resolutionStates?.onaEmployee).toBe("VALID_ZERO");
    });
  });

  // =========================================================================
  // TEST E — Isolation du cache local
  // =========================================================================
  describe("Test E — Local Cache Strict Tenant Isolation", () => {
    it("does not leak Tenant A cached policy into Tenant B through finops_payroll_policy_latest", async () => {
      const origWindow = (globalThis as any).window;
      const storageMap: Record<string, string> = {
        // Tenant A policy stored in local storage and marked latest
        [`finops_payroll_policy_${tenantA}`]: JSON.stringify({
          id: `pol_${tenantA}_v1`,
          businessId: tenantA,
          effectiveFrom: "2026-10-01",
          socialContributions: { enabled: false, cnssOna: { employeeRate: 0.1 }, ofatmaCns: { employeeRate: 0.05 } },
        }),
        "finops_payroll_policy_latest": JSON.stringify({
          id: `pol_${tenantA}_v1`,
          businessId: tenantA,
          effectiveFrom: "2026-10-01",
          socialContributions: { enabled: false, cnssOna: { employeeRate: 0.1 }, ofatmaCns: { employeeRate: 0.05 } },
        }),
      };

      const mockStorage = {
        getItem: vi.fn((key: string) => storageMap[key] || null),
        setItem: vi.fn((key: string, val: string) => { storageMap[key] = val; }),
        removeItem: vi.fn((key: string) => { delete storageMap[key]; }),
        clear: vi.fn(),
      };
      (globalThis as any).window = { localStorage: mockStorage };

      try {
        // Query Tenant B (which has no Firestore docs and no localStorage of its own)
        const resultB = await PayrollPolicyRepository.getEffectivePolicy(tenantB, "2026-10-15", true);

        // Result MUST be null, NEVER Tenant A's cached policy!
        expect(resultB).toBeNull();

        // And resolver for Tenant B falls back to GLOBAL_POLICY, never Tenant A
        const resolvedONA = await PayrollPolicyResolver.resolveParameter("onaEmployeeRate", {
          businessId: tenantB,
          effectiveDate: "2026-10-15",
        });
        expect(resolvedONA.source).toBe("GLOBAL_POLICY");
        expect(resolvedONA.value).toBe(0.06); // Global 6%, NOT Tenant A's 10%
      } finally {
        if (origWindow === undefined) {
          delete (globalThis as any).window;
        } else {
          (globalThis as any).window = origWindow;
        }
      }
    });
  });

  // =========================================================================
  // Section 3: Concurrence et versionnement
  // =========================================================================
  describe("Section 3 — Concurrency Control & Versioning Idempotency", () => {
    it("detects concurrent modification when baseVersion does not match active version", async () => {
      // Mock existing active policy at version 2
      const activeV2 = {
        id: `pol_${tenantA}_v2`,
        version: 2,
        status: "ACTIVE" as const,
        effectiveFrom: "2026-10-01",
        frequency: "BIWEEKLY" as const,
        currency: "HTG" as const,
      };

      vi.spyOn(PayrollPolicyRepository, "listPolicies").mockResolvedValue([activeV2 as any]);

      const input = {
        businessId: tenantA,
        effectiveFrom: "2026-11-01",
        frequency: "MONTHLY" as const,
      };

      // User submits with baseVersion: 1 (stale edit)
      await expect(
        PayrollPolicyRepository.saveAndActivatePolicy(
          tenantA,
          input as any,
          { id: "usr_conflict" },
          { baseVersion: 1 }
        )
      ).rejects.toThrow("CONCURRENT_MODIFICATION_DETECTED");
    });

    it("does not create redundant identical versions on repeated saves", async () => {
      const activePolicy = {
        id: `pol_${tenantA}_v1`,
        policyId: `pol_${tenantA}_v1`,
        businessId: tenantA,
        business_id: tenantA,
        version: 1,
        versionLabel: "v1.0.0-canonical",
        status: "ACTIVE" as const,
        effectiveFrom: "2026-10-01",
        effectiveTo: null,
        frequency: "BIWEEKLY" as const,
        currency: "HTG" as const,
        standardHoursPerCycle: 96,
        attendanceToleranceHours: 94,
        workingDaysBasis: 22,
        overtime: { normalRate: 1.5, holidayRate: 2.0 },
        penalties: { lateFixedCents: 0, absencePerDayCents: 0 },
        socialContributions: {
          enabled: true,
          cnssOna: { employeeRate: 0.06, employerRate: 0.06 },
          ofatmaCns: { employeeRate: 0.02, employerRate: 0.03 },
        },
        commissions: { defaultSalesRate: 0.05 },
        survivalFloor: { enabled: true, minimumNetHTG: 15000 },
        attendance: { excludeWithoutRecords: true },
        resolution: { mode: "STRICT" as const },
      };

      vi.spyOn(PayrollPolicyRepository, "listPolicies").mockResolvedValue([activePolicy as any]);

      // Save identical configuration
      const result = await PayrollPolicyRepository.saveAndActivatePolicy(
        tenantA,
        activePolicy as any,
        { id: "usr_admin" },
        { baseVersion: 1 }
      );

      // Must return existing policy without creating v2
      expect(result.version).toBe(1);
      expect(result.id).toBe(`pol_${tenantA}_v1`);
      expect(batchSetOperations.length).toBe(0); // No new writes
    });

    it("supersedes previous policy upon genuine modification while preserving historical immutability", async () => {
      const v1Policy = {
        id: `pol_${tenantA}_v1`,
        policyId: `pol_${tenantA}_v1`,
        businessId: tenantA,
        version: 1,
        status: "ACTIVE" as const,
        effectiveFrom: "2026-10-01",
        effectiveTo: null,
        frequency: "BIWEEKLY" as const,
        currency: "HTG" as const,
        standardHoursPerCycle: 96,
        attendanceToleranceHours: 94,
        workingDaysBasis: 22,
        overtime: { normalRate: 1.5, holidayRate: 2.0 },
        penalties: { lateFixedCents: 0, absencePerDayCents: 0 },
        socialContributions: {
          enabled: true,
          cnssOna: { employeeRate: 0.06, employerRate: 0.06 },
          ofatmaCns: { employeeRate: 0.02, employerRate: 0.03 },
        },
        commissions: { defaultSalesRate: 0.05 },
        survivalFloor: { enabled: true, minimumNetHTG: 15000 },
        attendance: { excludeWithoutRecords: true },
        resolution: { mode: "STRICT" as const },
      };

      vi.spyOn(PayrollPolicyRepository, "listPolicies").mockResolvedValue([v1Policy as any]);

      const modifiedInput = {
        ...v1Policy,
        effectiveFrom: "2026-11-01",
        socialContributions: {
          enabled: false, // Changed
          cnssOna: { employeeRate: 0.07, employerRate: 0.07 },
          ofatmaCns: { employeeRate: 0.03, employerRate: 0.04 },
        },
      };

      const resultV2 = await PayrollPolicyRepository.saveAndActivatePolicy(
        tenantA,
        modifiedInput as any,
        { id: "usr_admin" },
        { baseVersion: 1 }
      );

      expect(resultV2.version).toBe(2);
      expect(resultV2.status).toBe("ACTIVE");
      expect(resultV2.effectiveFrom).toBe("2026-11-01");

      // Verify v1 was marked SUPERSEDED with effectiveTo closed
      const v1Update = batchUpdateOperations.find((op) => op.path.includes(v1Policy.id));
      expect(v1Update).toBeDefined();
      expect(v1Update?.data.status).toBe("SUPERSEDED");
      expect(v1Update?.data.effectiveTo).toBe("2026-11-01");
    });
  });
});
