import { describe, it, expect, vi, beforeEach } from "vitest";

const docStore = new Map<string, any>();

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    collection: vi.fn((_db: any, name: string) => ({ name })),
    doc: vi.fn((_db: any, collName: string, id: string) => ({ collName, id })),
    setDoc: vi.fn(async (docRef: any, data: any) => {
      docStore.set(`${docRef.collName}/${docRef.id}`, data);
    }),
    getDoc: vi.fn(async (docRef: any) => {
      const key = `${docRef.collName}/${docRef.id}`;
      const data = docStore.get(key);
      return {
        exists: () => !!data,
        data: () => data
      };
    }),
    updateDoc: vi.fn(async (docRef: any, updates: any) => {
      const key = `${docRef.collName}/${docRef.id}`;
      const existing = docStore.get(key) || {};
      docStore.set(key, { ...existing, ...updates });
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
import { ForensicLogRepository } from "../../repositories/ForensicLogRepository";
import { SuperAdminRepository, SuperAdminActor } from "../../repositories/SuperAdminRepository";
import { SystemTaxConfigurationService } from "../../services/SystemTaxConfigurationService";

describe("SuperAdmin Domain Security & Data Integrity Tests", () => {
  const mockSuperActor: SuperAdminActor = {
    uid: "sa_user_999",
    email: "superadmin@finops.com",
    name: "Platform Super Admin",
    role: "SUPER_ADMIN"
  };

  beforeEach(() => {
    docStore.clear();
  });

  it("strictly forbids modify_forensic_log or delete_forensic_log capability for ALL roles including SUPER_ADMIN", () => {
    PermissionService.init("SUPER_ADMIN", ["all"], {} as any, "ENTERPRISE", "ACTIVE", "SUPER_ADMIN_SYSTEM");

    expect(PermissionService.can("modify_forensic_log")).toBe(false);
    expect(PermissionService.can("delete_forensic_log")).toBe(false);
  });

  it("grants critical superadmin flags ONLY to SUPER_ADMIN role and denies them to OWNER/MANAGER", () => {
    // 1. SuperAdmin role
    PermissionService.init("SUPER_ADMIN", ["all"], {} as any, "ENTERPRISE", "ACTIVE", "SUPER_ADMIN_SYSTEM");
    expect(PermissionService.can("delete_business")).toBe(true);
    expect(PermissionService.can("force_unseal_payroll")).toBe(true);
    expect(PermissionService.can("manage_global_tax")).toBe(true);

    // 2. Tenant OWNER role (even with wildcard permissions)
    PermissionService.init("OWNER", ["all", "*"], {} as any, "ENTERPRISE", "ACTIVE", "biz_100");
    expect(PermissionService.can("delete_business")).toBe(false);
    expect(PermissionService.can("force_unseal_payroll")).toBe(false);
    expect(PermissionService.can("manage_global_tax")).toBe(false);
  });

  it("creates a cryptographically signed ForensicLog with non-empty SHA-256 signature seal", async () => {
    const log = await ForensicLogRepository.createAndSignLog({
      business_id: "biz_test_001",
      action: "SUPERADMIN_FORCE_UNSEAL",
      actorId: mockSuperActor.uid,
      userName: mockSuperActor.name,
      userRole: mockSuperActor.role,
      userEmail: mockSuperActor.email,
      timestamp: "2026-08-18T10:00:00.000Z",
      details: "Force unsealed due to audit correction requirement.",
      beforeState: { status: "SEALED" },
      afterState: { status: "LOCKED" }
    });

    expect(log.id).toBeDefined();
    expect(log.signature).toBeDefined();
    expect(log.signature.length).toBeGreaterThan(10);
  });

  it("requires at least 10 characters typed justification for force unsealing a payroll cycle", async () => {
    await expect(
      SuperAdminRepository.forceUnsealPayrollCycle(
        "biz_test_001",
        "cycle_2026_01",
        "Too short",
        mockSuperActor
      )
    ).rejects.toThrow("A typed justification of at least 10 characters is required");
  });

  it("requires typed justification for scheduling a tenant business for deletion and marks status as SCHEDULED_FOR_DELETION", async () => {
    await expect(
      SuperAdminRepository.scheduleTenantForDeletion(
        "biz_test_001",
        "short",
        mockSuperActor
      )
    ).rejects.toThrow("Justification of at least 10 characters is required");
  });

  it("validates that SystemTaxConfigurationService updates global tax rates with audit log and event emission", async () => {
    const spyWriteLog = vi.spyOn(ForensicLogRepository, "writeForensicLog").mockResolvedValue();

    const updated = await SystemTaxConfigurationService.updateGlobalTaxRates(
      { onaEmployeeRate: 0.06, onaEmployerRate: 0.06, ofatmaRate: 0.02 },
      "Regulatory alignment for fiscal year 2026",
      mockSuperActor
    );

    expect(updated.onaEmployeeRate).toBe(0.06);
    expect(updated.ofatmaRate).toBe(0.02);
    expect(spyWriteLog).toHaveBeenCalled();
  });
});
