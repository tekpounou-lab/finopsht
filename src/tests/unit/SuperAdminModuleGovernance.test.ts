import { describe, it, expect, vi, beforeEach } from "vitest";

const docStore = new Map<string, any>();

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    collection: vi.fn((_db: any, name: string) => ({ name })),
    doc: vi.fn((_db: any, collName: string, id: string, subColl?: string, subId?: string) => {
      const fullPath = subColl && subId ? `${collName}/${id}/${subColl}/${subId}` : `${collName}/${id}`;
      return { collName, id, fullPath };
    }),
    setDoc: vi.fn(async (docRef: any, data: any) => {
      const path = docRef.fullPath || `${docRef.collName}/${docRef.id}`;
      docStore.set(path, data);
    }),
    getDoc: vi.fn(async (docRef: any) => {
      const path = docRef.fullPath || `${docRef.collName}/${docRef.id}`;
      const data = docStore.get(path);
      return {
        exists: () => !!data,
        data: () => data
      };
    }),
    updateDoc: vi.fn(async (docRef: any, updates: any) => {
      const path = docRef.fullPath || `${docRef.collName}/${docRef.id}`;
      const existing = docStore.get(path) || {};
      docStore.set(path, { ...existing, ...updates });
    }),
    getDocs: vi.fn(async () => ({ docs: [], forEach: vi.fn() })),
    query: vi.fn((coll: any) => coll),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    serverTimestamp: vi.fn(() => new Date().toISOString())
  };
});

import { PermissionService } from "../../services/PermissionService";
import { BusinessAdministrationRepository } from "../../services/business/BusinessAdministrationRepository";
import { FeatureRepository } from "../../repositories";
import { SubscriptionPlanRepository } from "../../repositories/SubscriptionPlanRepository";
import { SubscriptionService } from "../../services/billing/SubscriptionService";

describe("FINOPS ERP — Super Admin Module & Feature Governance Tests", () => {
  const TEST_BIZ_ID = "biz_enterprise_gov_test";

  beforeEach(() => {
    docStore.clear();
  });

  it("1. strictly blocks non-SUPER_ADMIN (e.g. OWNER) from invoking BusinessAdministrationRepository.updateFeatures", async () => {
    // Set current active role to OWNER
    PermissionService.init("OWNER", ["all"], {} as any, "STARTER", "ACTIVE", TEST_BIZ_ID);

    // Explicitly test the security check by invoking updateFeatures
    const attempt = BusinessAdministrationRepository.updateFeatures(TEST_BIZ_ID, {
      payroll: true,
      accounting: true,
      ai_cfo: true
    });

    await expect(attempt).rejects.toThrow(/Action réservée au Super Admin/);
  });

  it("2. strictly blocks MANAGER or EMPLOYEE from invoking updateFeatures", async () => {
    PermissionService.init("MANAGER", ["all"], {} as any, "STARTER", "ACTIVE", TEST_BIZ_ID);

    await expect(
      BusinessAdministrationRepository.updateFeatures(TEST_BIZ_ID, { ai_cfo: true })
    ).rejects.toThrow(/Action réservée au Super Admin/);

    PermissionService.init("EMPLOYEE", [], {} as any, "STARTER", "ACTIVE", TEST_BIZ_ID);

    await expect(
      BusinessAdministrationRepository.updateFeatures(TEST_BIZ_ID, { ai_cfo: true })
    ).rejects.toThrow(/Action réservée au Super Admin/);
  });

  it("3. allows SUPER_ADMIN to update features and persists to both modern settings and legacy paths", async () => {
    PermissionService.init("SUPER_ADMIN", ["all"], {} as any, "ENTERPRISE", "ACTIVE", "PLATFORM_GLOBAL");

    const targetFeatures = {
      attendance: true,
      payroll: true,
      accounting: true,
      pos: true,
      hr: true,
      crm: false,
      bi: true,
      aiCfo: true
    };

    await BusinessAdministrationRepository.updateFeatures(TEST_BIZ_ID, targetFeatures);

    const legacyDoc = docStore.get(`features/${TEST_BIZ_ID}`);
    expect(legacyDoc).toBeDefined();
    expect(legacyDoc.pos).toBe(true);

    const modernDoc = docStore.get(`businesses/${TEST_BIZ_ID}/settings/features`);
    expect(modernDoc).toBeDefined();
    expect(modernDoc.features.pos).toBe(true);
  });

  it("4. synchronizes tenant modules automatically when subscription plan is upgraded", async () => {
    // When a tenant is on STARTER vs ENTERPRISE, features are synced by plan
    const starterFeatures = await FeatureRepository.syncFeaturesWithPlan(TEST_BIZ_ID, [
      "attendance",
      "payroll",
      "hr"
    ]);

    expect(starterFeatures.attendance).toBe(true);
    expect(starterFeatures.payroll).toBe(true);
    expect(starterFeatures.accounting).toBe(false);
    expect(starterFeatures.aiCfo).toBe(false);

    // Upgrading to ENTERPRISE unlocks accounting, bi, and aiCfo
    const enterpriseFeatures = await FeatureRepository.syncFeaturesWithPlan(TEST_BIZ_ID, [
      "attendance",
      "payroll",
      "hr",
      "accounting",
      "bi",
      "aicfo"
    ]);

    expect(enterpriseFeatures.accounting).toBe(true);
    expect(enterpriseFeatures.bi).toBe(true);
    expect(enterpriseFeatures.aiCfo).toBe(true);
  });

  it("5. validates that SubscriptionService.upgradePlan applies plan modules and enforces tenant isolation", async () => {
    PermissionService.init("OWNER", ["all"], {} as any, "STARTER", "ACTIVE", TEST_BIZ_ID);

    // Initial business setup in store
    docStore.set(`businesses/${TEST_BIZ_ID}`, {
      id: TEST_BIZ_ID,
      name: "Acme Corp",
      plan: "STARTER"
    });

    const result = await SubscriptionService.upgradePlan(TEST_BIZ_ID, "ENTERPRISE", {
      role: "OWNER",
      businessId: TEST_BIZ_ID
    });

    expect(result.success).toBe(true);

    const bizData = docStore.get(`businesses/${TEST_BIZ_ID}`);
    expect(bizData.plan).toBe("ENTERPRISE");

    const savedFeatures = await FeatureRepository.getWorkspaceFeatures(TEST_BIZ_ID);
    expect(savedFeatures.payroll).toBe(true);
  });
});
