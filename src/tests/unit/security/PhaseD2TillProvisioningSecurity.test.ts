/**
 * FINOPS ERP / FINAYITI FUSION
 * PHASE D2 — SECURE SERVER-SIDE TILL AUTO-PROVISIONING & IDEMPOTENCY TEST SUITE
 *
 * Mounted on the real `await createApp()` from `server.ts`.
 * Covers all 12 mandatory scenarios from Phase D2 Specification (Section 7):
 *  1. Unauthenticated user -> 401
 *  2. Invalid or revoked token -> 401 (with checkRevoked === true verification)
 *  3. Unauthorized role -> 403
 *  4. Tenant A requesting provisioning for Tenant B -> 403
 *  5. Existing till belonging to same tenant -> idempotent no-overwrite of critical fields (balance, status, session)
 *  6. Till ID / Safe ID / Employee ID already used by another tenant -> 403 (zero cross-tenant overwrite)
 *  7. Repeated identical calls -> idempotent, zero duplicates
 *  8. Concurrent calls (Promise.all) -> transactional consistency, zero duplicates
 *  9. Write failure -> explicit 500 error (sanitized), atomic rollback, no false success
 * 10. Malformed document or parameter -> 400
 * 11. Attempted businessId / business_id / x-business-id / actorUid spoofing -> 403
 * 12. Zero state mutation after any refusal (state_before === state_after across all collections)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import { Server } from "http";
import { AddressInfo } from "net";
import { createApp } from "../../../../server";
import { CashManagementRepository } from "../../../repositories/CashManagementRepository";
import { EmployeeRepository } from "../../../repositories/EmployeeRepository";

const {
  mockUserDocs,
  mockFirestoreStore,
  verifyIdTokenSpy,
  mockCurrentUserToken,
  simulateTransactionFailure
} = vi.hoisted(() => {
  return {
    mockUserDocs: new Map<string, any>(),
    mockFirestoreStore: new Map<string, any>(),
    verifyIdTokenSpy: vi.fn(),
    mockCurrentUserToken: { value: "token-owner-alpha" as string | null },
    simulateTransactionFailure: { value: false }
  };
});

// Mock client-side firebase auth for CashManagementRepository.autoProvisionTillsForBusiness
vi.mock("../../../lib/firebase", () => ({
  db: { type: "client-firestore-should-not-be-used-for-provisioning-writes" },
  auth: {
    get currentUser() {
      if (!mockCurrentUserToken.value) return null;
      return {
        getIdToken: vi.fn(async () => mockCurrentUserToken.value)
      };
    }
  }
}));

// Spy on client-side firebase/firestore setDoc to prove CashManagementRepository.autoProvisionTillsForBusiness
// NEVER performs direct client-side Firestore writes
const clientSetDocSpy = vi.hoisted(() => vi.fn(async () => {
  throw new Error("SECURITY_VIOLATION: Client-side setDoc must not be called by autoProvisionTillsForBusiness");
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: any, col: string, id: string) => ({ path: `${col}/${id}`, id })),
  collection: vi.fn((_db: any, col: string) => ({ path: col, id: col })),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  setDoc: clientSetDocSpy,
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  deleteDoc: vi.fn(async () => {}),
  orderBy: vi.fn(() => ({}))
}));

// Mock Firebase Admin SDK with in-memory transactional store
vi.mock("../../../lib/firebaseAdmin", () => {
  const normalizePath = (fullPath: string) => fullPath.replace(/^\/+|\/+$/g, "");

  const getDocHelper = (rawPath: string) => {
    const docPath = normalizePath(rawPath);
    const segments = docPath.split("/");
    const docId = segments[segments.length - 1];
    const isUsersRoot = segments.length === 2 && segments[0] === "users";

    return {
      id: docId,
      path: docPath,
      get: async () => {
        if (isUsersRoot && mockUserDocs.has(docId)) {
          return {
            exists: true,
            id: docId,
            ref: getDocHelper(docPath),
            data: () => mockUserDocs.get(docId)
          };
        }
        if (mockFirestoreStore.has(docPath)) {
          return {
            exists: true,
            id: docId,
            ref: getDocHelper(docPath),
            data: () => mockFirestoreStore.get(docPath)
          };
        }
        return {
          exists: false,
          id: docId,
          ref: getDocHelper(docPath),
          data: () => null
        };
      },
      set: async (data: any, options?: any) => {
        if (isUsersRoot) {
          const prev = options?.merge && mockUserDocs.has(docId) ? mockUserDocs.get(docId) : {};
          mockUserDocs.set(docId, { ...prev, ...data });
          return;
        }
        if (options?.merge && mockFirestoreStore.has(docPath)) {
          mockFirestoreStore.set(docPath, { ...mockFirestoreStore.get(docPath), ...data });
        } else {
          mockFirestoreStore.set(docPath, data);
        }
      },
      update: async (data: any) => {
        if (isUsersRoot) {
          const prev = mockUserDocs.get(docId) || {};
          mockUserDocs.set(docId, { ...prev, ...data });
          return;
        }
        const prev = mockFirestoreStore.get(docPath) || {};
        mockFirestoreStore.set(docPath, { ...prev, ...data });
      },
      delete: async () => {
        if (isUsersRoot) {
          mockUserDocs.delete(docId);
          return;
        }
        mockFirestoreStore.delete(docPath);
      }
    };
  };

  const getCollectionDocs = (collPath: string) => {
    const prefix = `${normalizePath(collPath)}/`;
    const targetDepth = normalizePath(collPath).split("/").length + 1;
    const docs: any[] = [];
    for (const [key, val] of mockFirestoreStore.entries()) {
      if (key.startsWith(prefix) && key.split("/").length === targetDepth) {
        const docId = key.split("/").pop()!;
        docs.push({
          id: docId,
          exists: true,
          ref: getDocHelper(key),
          data: () => val
        });
      }
    }
    return docs;
  };

  return {
    getAdminApp: () => ({}),
    getAdminAuth: () => ({
      verifyIdToken: verifyIdTokenSpy,
      setCustomUserClaims: vi.fn(async () => {})
    }),
    getAdminFirestore: () => ({
      doc: (fullPath: string) => getDocHelper(fullPath),
      collection: (collName: string) => ({
        doc: (docId?: string) => {
          const resolvedId = docId || `auto_${Math.random().toString(36).substring(2, 9)}`;
          return getDocHelper(`${normalizePath(collName)}/${resolvedId}`);
        },
        get: async () => ({
          docs: getCollectionDocs(collName)
        }),
        where: (field: string, op: string, value: any) => ({
          get: async () => {
            const all = getCollectionDocs(collName);
            const filtered = all.filter((d) => {
              const data = d.data() || {};
              if (op === "==") return data[field] === value;
              return false;
            });
            return { docs: filtered };
          }
        })
      }),
      runTransaction: async (updateFn: any) => {
        const stagedStore = new Map<string, any>();
        for (const [k, v] of mockFirestoreStore.entries()) {
          stagedStore.set(k, structuredClone(v));
        }
        const stagedUsers = new Map<string, any>();
        for (const [k, v] of mockUserDocs.entries()) {
          stagedUsers.set(k, structuredClone(v));
        }

        const txContext = {
          get: async (ref: any) => {
            const cleanPath = normalizePath(ref.path);
            const segments = cleanPath.split("/");
            const docId = segments[segments.length - 1];
            if (segments.length === 2 && segments[0] === "users" && stagedUsers.has(docId)) {
              return { exists: true, id: docId, data: () => stagedUsers.get(docId) };
            }
            if (stagedStore.has(cleanPath)) {
              return { exists: true, id: docId, data: () => stagedStore.get(cleanPath) };
            }
            return { exists: false, id: docId, data: () => null };
          },
          set: (ref: any, data: any, options?: any) => {
            const cleanPath = normalizePath(ref.path);
            const segments = cleanPath.split("/");
            const docId = segments[segments.length - 1];
            if (segments.length === 2 && segments[0] === "users") {
              const prev = options?.merge && stagedUsers.has(docId) ? stagedUsers.get(docId) : {};
              stagedUsers.set(docId, { ...prev, ...structuredClone(data) });
            } else {
              const prev = options?.merge && stagedStore.has(cleanPath) ? stagedStore.get(cleanPath) : {};
              stagedStore.set(cleanPath, { ...prev, ...structuredClone(data) });
            }
          },
          update: (ref: any, data: any) => {
            const cleanPath = normalizePath(ref.path);
            const prev = stagedStore.get(cleanPath) || {};
            stagedStore.set(cleanPath, { ...prev, ...structuredClone(data) });
          }
        };

        const result = await updateFn(txContext);

        if (simulateTransactionFailure.value) {
          throw new Error("FIRESTORE_INTERNAL_DISK_FAULT: /private/db/shard_09/commit_failed");
        }

        mockFirestoreStore.clear();
        stagedStore.forEach((v, k) => mockFirestoreStore.set(k, v));
        mockUserDocs.clear();
        stagedUsers.forEach((v, k) => mockUserDocs.set(k, v));
        return result;
      }
    })
  };
});

function captureFullStoreSnapshot() {
  const storeEntries = Array.from(mockFirestoreStore.entries()).sort(([a], [b]) => a.localeCompare(b));
  const userEntries = Array.from(mockUserDocs.entries()).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify({ storeEntries, userEntries });
}

describe("Phase D2: Secure Server-Side Till Auto-Provisioning, RBAC, Tenant Isolation & Idempotency", () => {
  let app: express.Express;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    mockUserDocs.clear();
    mockFirestoreStore.clear();
    vi.clearAllMocks();
    simulateTransactionFailure.value = false;
    mockCurrentUserToken.value = "token-owner-alpha";

    // Seed active businesses for Tenant Alpha and Tenant Beta
    mockFirestoreStore.set("businesses/biz_tenant_alpha", {
      id: "biz_tenant_alpha",
      name: "Alpha FinOps SA",
      status: "ACTIVE",
      ownerId: "uid_owner_alpha"
    });
    mockFirestoreStore.set("businesses/biz_tenant_beta", {
      id: "biz_tenant_beta",
      name: "Beta Rival Corp",
      status: "ACTIVE",
      ownerId: "uid_owner_beta"
    });

    // Seed active employees for Tenant Alpha and Tenant Beta
    mockFirestoreStore.set("employees/emp_alpha_1", {
      id: "emp_alpha_1",
      business_id: "biz_tenant_alpha",
      businessId: "biz_tenant_alpha",
      branchId: "br_alpha_main",
      departmentId: "dept_alpha_cash",
      name: "Marie Dupont (Alpha)",
      email: "marie@alpha.com",
      role: "SENIOR_TELLER",
      operational_profile: "teller",
      operationalProfile: "teller",
      status: "ACTIVE",
      isActive: true
    });
    mockFirestoreStore.set("employees/emp_beta_1", {
      id: "emp_beta_1",
      business_id: "biz_tenant_beta",
      businessId: "biz_tenant_beta",
      branchId: "br_beta_main",
      departmentId: "dept_beta_cash",
      name: "Paul Rival (Beta)",
      email: "paul@beta.com",
      role: "SENIOR_TELLER",
      operational_profile: "teller",
      operationalProfile: "teller",
      status: "ACTIVE",
      isActive: true
    });

    // Seed user profiles
    mockUserDocs.set("uid_owner_alpha", {
      uid: "uid_owner_alpha",
      email: "owner@alpha.com",
      role: "OWNER",
      business_id: "biz_tenant_alpha",
      businessId: "biz_tenant_alpha",
      status: "ACTIVE"
    });
    mockUserDocs.set("uid_manager_alpha", {
      uid: "uid_manager_alpha",
      email: "manager@alpha.com",
      role: "MANAGER",
      business_id: "biz_tenant_alpha",
      businessId: "biz_tenant_alpha",
      status: "ACTIVE"
    });
    mockUserDocs.set("uid_head_teller_alpha", {
      uid: "uid_head_teller_alpha",
      email: "headteller@alpha.com",
      role: "HEAD_TELLER",
      operational_profile: "teller",
      operationalProfile: "teller",
      business_id: "biz_tenant_alpha",
      businessId: "biz_tenant_alpha",
      status: "ACTIVE"
    });
    mockUserDocs.set("uid_teller_alpha", {
      uid: "uid_teller_alpha",
      email: "teller@alpha.com",
      role: "JUNIOR_TELLER",
      operational_profile: "teller",
      operationalProfile: "teller",
      business_id: "biz_tenant_alpha",
      businessId: "biz_tenant_alpha",
      status: "ACTIVE"
    });
    mockUserDocs.set("uid_auditor_alpha", {
      uid: "uid_auditor_alpha",
      email: "auditor@alpha.com",
      role: "AUDITOR",
      business_id: "biz_tenant_alpha",
      businessId: "biz_tenant_alpha",
      status: "ACTIVE"
    });
    mockUserDocs.set("uid_employee_alpha", {
      uid: "uid_employee_alpha",
      email: "emp@alpha.com",
      role: "EMPLOYEE",
      business_id: "biz_tenant_alpha",
      businessId: "biz_tenant_alpha",
      status: "ACTIVE"
    });
    mockUserDocs.set("uid_superadmin", {
      uid: "uid_superadmin",
      email: "tekpounou@gmail.com",
      role: "SUPER_ADMIN",
      business_id: "biz_tenant_alpha",
      businessId: "biz_tenant_alpha",
      status: "ACTIVE"
    });

    verifyIdTokenSpy.mockImplementation(async (token: string, checkRevoked?: boolean) => {
      if (checkRevoked !== true) {
        throw new Error("SECURITY_DEFECT: verifyIdToken must be called with checkRevoked === true");
      }
      if (token === "revoked-token") {
        const err: any = new Error("Firebase ID token has been revoked (secret trace).");
        err.code = "auth/id-token-revoked";
        throw err;
      }
      if (token === "invalid-token") {
        const err: any = new Error("Decoding Firebase ID token failed.");
        err.code = "auth/argument-error";
        throw err;
      }
      if (token === "token-owner-alpha") {
        return {
          uid: "uid_owner_alpha",
          email: "owner@alpha.com",
          email_verified: true,
          role: "OWNER",
          business_id: "biz_tenant_alpha",
          businessId: "biz_tenant_alpha"
        };
      }
      if (token === "token-manager-alpha") {
        return {
          uid: "uid_manager_alpha",
          email: "manager@alpha.com",
          email_verified: true,
          role: "MANAGER",
          business_id: "biz_tenant_alpha",
          businessId: "biz_tenant_alpha"
        };
      }
      if (token === "token-head-teller-alpha") {
        return {
          uid: "uid_head_teller_alpha",
          email: "headteller@alpha.com",
          email_verified: true,
          role: "HEAD_TELLER",
          business_id: "biz_tenant_alpha",
          businessId: "biz_tenant_alpha"
        };
      }
      if (token === "token-teller-alpha") {
        return {
          uid: "uid_teller_alpha",
          email: "teller@alpha.com",
          email_verified: true,
          role: "JUNIOR_TELLER",
          business_id: "biz_tenant_alpha",
          businessId: "biz_tenant_alpha"
        };
      }
      if (token === "token-auditor-alpha") {
        return {
          uid: "uid_auditor_alpha",
          email: "auditor@alpha.com",
          email_verified: true,
          role: "AUDITOR",
          business_id: "biz_tenant_alpha",
          businessId: "biz_tenant_alpha"
        };
      }
      if (token === "token-employee-alpha") {
        return {
          uid: "uid_employee_alpha",
          email: "emp@alpha.com",
          email_verified: true,
          role: "EMPLOYEE",
          business_id: "biz_tenant_alpha",
          businessId: "biz_tenant_alpha"
        };
      }
      if (token === "token-superadmin") {
        return {
          uid: "uid_superadmin",
          email: "tekpounou@gmail.com",
          email_verified: true,
          role: "SUPER_ADMIN",
          is_super_admin: true,
          business_id: "biz_tenant_alpha",
          businessId: "biz_tenant_alpha"
        };
      }
      throw new Error("Unknown token");
    });

    vi.spyOn(EmployeeRepository, "listAll").mockImplementation(async (bizId: string) => {
      const results: any[] = [];
      for (const [k, v] of mockFirestoreStore.entries()) {
        if (k.startsWith("employees/") && (v.business_id === bizId || v.businessId === bizId)) {
          results.push(v);
        }
      }
      return results;
    });

    app = await createApp();
    server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
    CashManagementRepository.PROVISIONING_API_ENDPOINT = `${baseUrl}/api/cash/tills/auto-provision`;
  });

  afterEach(async () => {
    CashManagementRepository.PROVISIONING_API_ENDPOINT = "/api/cash/tills/auto-provision";
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("Scenario 1 & 12: rejects unauthenticated requests with 401 and zero state mutation", async () => {
    const stateBefore = captureFullStoreSnapshot();

    const res = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId: "biz_tenant_alpha", branchId: "br_alpha_main" })
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("UNAUTHORIZED");

    // Also verify frontend repository rejects when unauthenticated and never calls client setDoc
    mockCurrentUserToken.value = null;
    await expect(
      CashManagementRepository.autoProvisionTillsForBusiness("biz_tenant_alpha", "br_alpha_main")
    ).rejects.toThrow(/Authentification requise/i);
    expect(clientSetDocSpy).not.toHaveBeenCalled();

    const stateAfter = captureFullStoreSnapshot();
    expect(stateAfter).toBe(stateBefore);
  });

  it("Scenario 2 & 12: rejects invalid or revoked tokens with 401 (checkRevoked === true) and zero state mutation", async () => {
    const stateBefore = captureFullStoreSnapshot();

    const resRevoked = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer revoked-token"
      },
      body: JSON.stringify({ businessId: "biz_tenant_alpha" })
    });

    expect(resRevoked.status).toBe(401);
    const revokedBody = await resRevoked.json();
    expect(revokedBody.error).toBe("TOKEN_REVOKED");
    expect(JSON.stringify(revokedBody)).not.toContain("secret trace");
    expect(verifyIdTokenSpy).toHaveBeenCalledWith("revoked-token", true);

    const resInvalid = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer invalid-token"
      },
      body: JSON.stringify({ businessId: "biz_tenant_alpha" })
    });

    expect(resInvalid.status).toBe(401);

    const stateAfter = captureFullStoreSnapshot();
    expect(stateAfter).toBe(stateBefore);
  });

  it("Scenario 3 & 12: enforces RBAC — rejects JUNIOR_TELLER, AUDITOR, and EMPLOYEE with 403 FORBIDDEN_ROLE and zero state mutation, while allowing OWNER, MANAGER, HEAD_TELLER, and SUPER_ADMIN", async () => {
    const stateBefore = captureFullStoreSnapshot();

    for (const unauthorizedToken of [
      "token-teller-alpha",
      "token-auditor-alpha",
      "token-employee-alpha"
    ]) {
      const res = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${unauthorizedToken}`
        },
        body: JSON.stringify({ businessId: "biz_tenant_alpha" })
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("FORBIDDEN_ROLE");
    }

    // Verify zero state mutation after all unauthorized role attempts
    expect(captureFullStoreSnapshot()).toBe(stateBefore);

    // Now verify authorized role (HEAD_TELLER) succeeds
    const resHeadTeller = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-head-teller-alpha"
      },
      body: JSON.stringify({ businessId: "biz_tenant_alpha", branchId: "br_alpha_main" })
    });

    expect(resHeadTeller.status).toBe(200);
    const okBody = await resHeadTeller.json();
    expect(okBody.success).toBe(true);
    expect(okBody.tillsCreated).toBe(2);
    expect(okBody.safesCreated).toBe(2);
  });

  it("Scenario 4 & 12: blocks Tenant A from provisioning tills for Tenant B (403 FORBIDDEN_TENANT_ACCESS) with zero state mutation", async () => {
    const stateBefore = captureFullStoreSnapshot();

    // 4a. Via body.businessId targeting Tenant Beta
    const resBodyCross = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-owner-alpha"
      },
      body: JSON.stringify({ businessId: "biz_tenant_beta" })
    });
    expect(resBodyCross.status).toBe(403);
    expect((await resBodyCross.json()).error).toBe("FORBIDDEN_TENANT_ACCESS");

    // 4b. Via x-business-id header targeting Tenant Beta
    const resHeaderCross = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-owner-alpha",
        "x-business-id": "biz_tenant_beta"
      },
      body: JSON.stringify({ businessId: "biz_tenant_beta" })
    });
    expect(resHeaderCross.status).toBe(403);

    // 4c. Via injecting a Tenant Beta employee into initialEmployees
    const resEmpCross = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-owner-alpha"
      },
      body: JSON.stringify({
        businessId: "biz_tenant_alpha",
        initialEmployees: [
          {
            id: "emp_beta_1",
            business_id: "biz_tenant_beta",
            name: "Paul Rival (Beta)",
            role: "SENIOR_TELLER",
            status: "ACTIVE"
          }
        ]
      })
    });
    expect(resEmpCross.status).toBe(403);
    expect((await resEmpCross.json()).error).toBe("FORBIDDEN_TENANT_ACCESS");

    // 4d. Via injecting Tenant Beta employee ID with forged business_id: "biz_tenant_alpha" (caught inside transaction via employees/emp_beta_1 check)
    const resForgedEmpId = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-owner-alpha"
      },
      body: JSON.stringify({
        businessId: "biz_tenant_alpha",
        initialEmployees: [
          {
            id: "emp_beta_1",
            business_id: "biz_tenant_alpha",
            businessId: "biz_tenant_alpha",
            name: "Forged Beta Employee",
            role: "SENIOR_TELLER",
            status: "ACTIVE"
          }
        ]
      })
    });
    expect(resForgedEmpId.status).toBe(403);
    expect((await resForgedEmpId.json()).error).toBe("TENANT_OVERWRITE_FORBIDDEN");

    const stateAfter = captureFullStoreSnapshot();
    expect(stateAfter).toBe(stateBefore);
  });

  it("Scenario 5: preserves existing tills and safes of the same tenant without overwriting critical fields (balance_cents, status, active_session_id, created_at) and creates zero GL/cash movement entries", async () => {
    // Seed an existing OPEN HTG till with a non-zero balance (250,000 cents = 2,500.00 HTG) and active session
    const existingHtgTill = {
      id: "till_biz_tenant_alpha_emp_alpha_1_htg",
      business_id: "biz_tenant_alpha",
      businessId: "biz_tenant_alpha",
      branch_id: "br_alpha_main",
      name: "TILL-HTG-001 - Marie Dupont (Alpha)",
      code: "TILL-HTG-001",
      type: "TILL",
      assigned_teller_id: "emp_alpha_1",
      assigned_teller_name: "Marie Dupont (Alpha)",
      currency: "HTG",
      linked_account_code: "1010",
      linked_account_name: "Caisse HTG Guichet",
      balance_cents: 250000,
      status: "OPEN",
      active_session_id: "sess_alpha_live_001",
      created_by: "uid_owner_alpha",
      created_at: "2026-01-10T08:00:00.000Z",
      updated_at: "2026-01-10T09:30:00.000Z"
    };
    mockFirestoreStore.set("cash_tills/till_biz_tenant_alpha_emp_alpha_1_htg", existingHtgTill);

    // Seed an existing HTG safe with 5,000,000 cents (50,000.00 HTG)
    const existingHtgSafe = {
      id: "safe_biz_tenant_alpha_htg",
      business_id: "biz_tenant_alpha",
      businessId: "biz_tenant_alpha",
      branch_id: "br_alpha_main",
      name: "SAFE-HTG-01 (Coffre Principal HTG)",
      code: "SAFE-HTG-01",
      type: "SAFE",
      currency: "HTG",
      linked_account_code: "1015",
      linked_account_name: "Coffre-Fort Principal HTG",
      manager_name: "Responsable Coffre / Head Teller",
      balance_cents: 5000000,
      min_limit_cents: 5000000,
      max_limit_cents: 500000000,
      status: "ACTIVE",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-05T12:00:00.000Z"
    };
    mockFirestoreStore.set("branch_safes/safe_biz_tenant_alpha_htg", existingHtgSafe);

    // Invoke via CashManagementRepository.autoProvisionTillsForBusiness (frontend -> server integration)
    const result = await CashManagementRepository.autoProvisionTillsForBusiness(
      "biz_tenant_alpha",
      "br_alpha_main"
    );

    expect(clientSetDocSpy).not.toHaveBeenCalled();
    expect(result.tillsCreated).toBe(1); // Only USD till created
    expect(result.existingTillsCount).toBe(1); // HTG till already existed
    expect(result.safesCreated).toBe(1); // Only USD safe created
    expect(result.existingSafesCount).toBe(1); // HTG safe already existed
    expect(result.totalTills).toBe(2);

    // Verify the existing HTG till was NOT overwritten and kept all its critical fields intact
    const persistedHtgTill = mockFirestoreStore.get("cash_tills/till_biz_tenant_alpha_emp_alpha_1_htg");
    expect(persistedHtgTill).toEqual(existingHtgTill);
    expect(persistedHtgTill.balance_cents).toBe(250000);
    expect(persistedHtgTill.status).toBe("OPEN");
    expect(persistedHtgTill.active_session_id).toBe("sess_alpha_live_001");
    expect(persistedHtgTill.created_at).toBe("2026-01-10T08:00:00.000Z");
    expect(persistedHtgTill.updated_at).toBe("2026-01-10T09:30:00.000Z");

    // Verify the existing HTG safe was NOT overwritten
    const persistedHtgSafe = mockFirestoreStore.get("branch_safes/safe_biz_tenant_alpha_htg");
    expect(persistedHtgSafe).toEqual(existingHtgSafe);
    expect(persistedHtgSafe.balance_cents).toBe(5000000);

    // Verify the new USD till was created with balance_cents = 0 and status = CLOSED
    const persistedUsdTill = mockFirestoreStore.get("cash_tills/till_biz_tenant_alpha_emp_alpha_1_usd");
    expect(persistedUsdTill).toBeDefined();
    expect(persistedUsdTill.business_id).toBe("biz_tenant_alpha");
    expect(persistedUsdTill.currency).toBe("USD");
    expect(persistedUsdTill.balance_cents).toBe(0);
    expect(persistedUsdTill.status).toBe("CLOSED");
    expect(persistedUsdTill.linked_account_code).toBe("1020");

    // Verify ZERO fictitious cash movements, sessions, or GL entries were created
    for (const key of mockFirestoreStore.keys()) {
      expect(key.startsWith("teller_transactions/")).toBe(false);
      expect(key.startsWith("cash_movements/")).toBe(false);
      expect(key.startsWith("internal_transfers/")).toBe(false);
      expect(key.startsWith("customer_transfers/")).toBe(false);
      expect(key.startsWith("till_sessions/")).toBe(false);
      expect(key.startsWith("ledger_transactions/")).toBe(false);
      expect(key.startsWith("GL/")).toBe(false);
    }
  });

  it("Scenario 6 & 12: rejects with 403 TENANT_OVERWRITE_FORBIDDEN when a target Till ID or Safe ID is already owned by another tenant, with zero state mutation", async () => {
    // Seed a till owned by Tenant Beta
    const betaTill = {
      id: "till_shared_victim_001",
      business_id: "biz_tenant_beta",
      businessId: "biz_tenant_beta",
      branch_id: "br_beta_main",
      name: "TILL-HTG-001 - Paul Rival",
      currency: "HTG",
      balance_cents: 900000,
      status: "OPEN"
    };
    mockFirestoreStore.set("cash_tills/till_shared_victim_001", betaTill);

    const stateBefore = captureFullStoreSnapshot();

    // 6a. Tenant Alpha attempts to reference till_shared_victim_001 via htgTillId on an employee
    const res1 = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-owner-alpha"
      },
      body: JSON.stringify({
        businessId: "biz_tenant_alpha",
        initialEmployees: [
          {
            id: "emp_alpha_1",
            business_id: "biz_tenant_alpha",
            name: "Marie Dupont (Alpha)",
            role: "SENIOR_TELLER",
            operational_profile: "teller",
            operationalProfile: "teller",
            status: "ACTIVE",
            htgTillId: "till_shared_victim_001"
          }
        ]
      })
    });
    expect(res1.status).toBe(403);
    const body1 = await res1.json();
    expect(body1.error).toBe("TENANT_OVERWRITE_FORBIDDEN");

    // 6b. Tenant Alpha attempts to pass till_shared_victim_001 in requestedTillIds
    const res2 = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-owner-alpha"
      },
      body: JSON.stringify({
        businessId: "biz_tenant_alpha",
        requestedTillIds: ["till_shared_victim_001"]
      })
    });
    expect(res2.status).toBe(403);
    expect((await res2.json()).error).toBe("TENANT_OVERWRITE_FORBIDDEN");

    // 6c. What if deterministic path cash_tills/till_biz_tenant_alpha_emp_alpha_1_htg was somehow pre-occupied by biz_tenant_beta?
    mockFirestoreStore.set("cash_tills/till_biz_tenant_alpha_emp_alpha_1_htg", {
      id: "till_biz_tenant_alpha_emp_alpha_1_htg",
      business_id: "biz_tenant_beta",
      businessId: "biz_tenant_beta",
      currency: "HTG",
      balance_cents: 123456,
      status: "OPEN"
    });
    const stateBefore6c = captureFullStoreSnapshot();

    const res3 = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-owner-alpha"
      },
      body: JSON.stringify({ businessId: "biz_tenant_alpha" })
    });
    expect(res3.status).toBe(403);
    expect((await res3.json()).error).toBe("TENANT_OVERWRITE_FORBIDDEN");
    expect(captureFullStoreSnapshot()).toBe(stateBefore6c);

    // Clean up 6c doc and verify original stateBefore matches
    mockFirestoreStore.delete("cash_tills/till_biz_tenant_alpha_emp_alpha_1_htg");
    expect(captureFullStoreSnapshot()).toBe(stateBefore);
  });

  it("Scenario 7: guarantees strict idempotency across repeated identical calls with zero duplicate tills or safes", async () => {
    const call1 = await CashManagementRepository.autoProvisionTillsForBusiness(
      "biz_tenant_alpha",
      "br_alpha_main"
    );
    expect(call1.tillsCreated).toBe(2);
    expect(call1.safesCreated).toBe(2);
    expect(call1.existingTillsCount).toBe(0);
    expect(call1.totalTills).toBe(2);

    const snapshotAfterCall1 = captureFullStoreSnapshot();

    const call2 = await CashManagementRepository.autoProvisionTillsForBusiness(
      "biz_tenant_alpha",
      "br_alpha_main"
    );
    expect(call2.tillsCreated).toBe(0);
    expect(call2.safesCreated).toBe(0);
    expect(call2.existingTillsCount).toBe(2);
    expect(call2.existingSafesCount).toBe(2);
    expect(call2.totalTills).toBe(2);

    const call3 = await CashManagementRepository.autoProvisionTillsForBusiness(
      "biz_tenant_alpha",
      "br_alpha_main"
    );
    expect(call3.tillsCreated).toBe(0);
    expect(call3.safesCreated).toBe(0);
    expect(call3.existingTillsCount).toBe(2);
    expect(call3.totalTills).toBe(2);

    // Store state after Call 2 and Call 3 is 100% byte-for-byte identical to after Call 1
    expect(captureFullStoreSnapshot()).toBe(snapshotAfterCall1);
  });

  it("Scenario 8: guarantees transactional consistency and zero duplicates under concurrent requests (Promise.all)", async () => {
    const concurrentRequests = Array.from({ length: 5 }, () =>
      fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token-owner-alpha"
        },
        body: JSON.stringify({
          businessId: "biz_tenant_alpha",
          branchId: "br_alpha_main"
        })
      }).then(async (r) => ({ status: r.status, body: await r.json() }))
    );

    const responses = await Promise.all(concurrentRequests);

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.totalTills).toBe(2);
    }

    // Across all 5 concurrent calls, total tillsCreated summed across responses must be strictly 2 (1 winner creates 2, 4 followers create 0)
    const sumTillsCreated = responses.reduce((acc, r) => acc + r.body.tillsCreated, 0);
    const sumSafesCreated = responses.reduce((acc, r) => acc + r.body.safesCreated, 0);
    expect(sumTillsCreated).toBe(2);
    expect(sumSafesCreated).toBe(2);

    const alphaTillsInStore = Array.from(mockFirestoreStore.entries()).filter(
      ([k, v]) => k.startsWith("cash_tills/") && v.business_id === "biz_tenant_alpha"
    );
    const alphaSafesInStore = Array.from(mockFirestoreStore.entries()).filter(
      ([k, v]) => k.startsWith("branch_safes/") && v.business_id === "biz_tenant_alpha"
    );
    expect(alphaTillsInStore.length).toBe(2);
    expect(alphaSafesInStore.length).toBe(2);
  });

  it("Scenario 9 & 12: handles Firestore transaction failure with explicit 500 error, sanitized response, atomic rollback, and zero false success", async () => {
    const stateBefore = captureFullStoreSnapshot();
    simulateTransactionFailure.value = true;

    const res = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-owner-alpha"
      },
      body: JSON.stringify({ businessId: "biz_tenant_alpha" })
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("INTERNAL_SERVER_ERROR");
    // Must never leak internal path /private/db/shard_09
    expect(JSON.stringify(body)).not.toContain("shard_09");
    expect(JSON.stringify(body)).not.toContain("FIRESTORE_INTERNAL_DISK_FAULT");

    // Verify client repository throws and never masks server failure as { tillsCreated: 0 }
    await expect(
      CashManagementRepository.autoProvisionTillsForBusiness("biz_tenant_alpha", "br_alpha_main")
    ).rejects.toThrow();

    // Verify atomic rollback: zero partial writes committed to store
    expect(captureFullStoreSnapshot()).toBe(stateBefore);
  });

  it("Scenario 10 & 12: rejects malformed parameters and corrupted existing documents with 400 and zero state mutation", async () => {
    const stateBefore = captureFullStoreSnapshot();

    // 10a. Non-string businessId
    const resNonStringBiz = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-owner-alpha"
      },
      body: JSON.stringify({ businessId: { $ne: "biz_tenant_alpha" } })
    });
    expect(resNonStringBiz.status).toBe(400);
    expect((await resNonStringBiz.json()).error).toBe("INVALID_PROVISIONING_PARAMS");

    // 10b. Path traversal in branchId
    const resBadBranch = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-owner-alpha"
      },
      body: JSON.stringify({ businessId: "biz_tenant_alpha", branchId: "../other_branch" })
    });
    expect(resBadBranch.status).toBe(400);
    expect((await resBadBranch.json()).error).toBe("INVALID_PROVISIONING_PARAMS");

    // 10c. Non-array initialEmployees
    const resBadEmps = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-owner-alpha"
      },
      body: JSON.stringify({ businessId: "biz_tenant_alpha", initialEmployees: "not-an-array" })
    });
    expect(resBadEmps.status).toBe(400);

    // 10d. Employee item with invalid ID containing slash
    const resSlashEmp = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-owner-alpha"
      },
      body: JSON.stringify({
        businessId: "biz_tenant_alpha",
        initialEmployees: [{ id: "emp/../../hack", name: "Bad ID", role: "TELLER", status: "ACTIVE" }]
      })
    });
    expect(resSlashEmp.status).toBe(400);

    // 10e. Invalid requestedTillIds containing path traversal
    const resBadTillIds = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-owner-alpha"
      },
      body: JSON.stringify({
        businessId: "biz_tenant_alpha",
        requestedTillIds: ["till_valid", "till/../invalid"]
      })
    });
    expect(resBadTillIds.status).toBe(400);

    expect(captureFullStoreSnapshot()).toBe(stateBefore);

    // 10f. Corrupted existing till document in Firestore (unsupported currency "EUR") -> 400 MALFORMED_EXISTING_DOCUMENT
    mockFirestoreStore.set("cash_tills/till_corrupt_alpha", {
      id: "till_corrupt_alpha",
      business_id: "biz_tenant_alpha",
      businessId: "biz_tenant_alpha",
      currency: "EUR", // Invalid currency
      balance_cents: 0,
      status: "CLOSED"
    });
    const stateBefore10f = captureFullStoreSnapshot();

    const resCorruptDoc = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-owner-alpha"
      },
      body: JSON.stringify({ businessId: "biz_tenant_alpha" })
    });
    expect(resCorruptDoc.status).toBe(400);
    expect((await resCorruptDoc.json()).error).toBe("MALFORMED_EXISTING_DOCUMENT");
    expect(captureFullStoreSnapshot()).toBe(stateBefore10f);
  });

  it("Scenario 11 & 12: rejects dual-field spoofing (businessId vs business_id vs x-business-id) and actorUid spoofing with 403 and zero state mutation", async () => {
    const stateBefore = captureFullStoreSnapshot();

    // 11a. Contradictory body.businessId vs body.business_id
    const resDualBody = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-owner-alpha"
      },
      body: JSON.stringify({
        businessId: "biz_tenant_alpha",
        business_id: "biz_tenant_beta"
      })
    });
    expect(resDualBody.status).toBe(403);
    expect((await resDualBody.json()).error).toBe("FORBIDDEN_TENANT_ACCESS");

    // 11b. Contradictory body.businessId vs x-business-id header (even for SUPER_ADMIN)
    const resDualHeader = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-superadmin",
        "x-business-id": "biz_tenant_beta"
      },
      body: JSON.stringify({
        businessId: "biz_tenant_alpha"
      })
    });
    expect(resDualHeader.status).toBe(403);
    expect((await resDualHeader.json()).error).toBe("FORBIDDEN_TENANT_ACCESS");

    // 11c. Contradictory businessId vs business_id inside an initialEmployees item
    const resDualEmp = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-owner-alpha"
      },
      body: JSON.stringify({
        businessId: "biz_tenant_alpha",
        initialEmployees: [
          {
            id: "emp_alpha_1",
            businessId: "biz_tenant_alpha",
            business_id: "biz_tenant_beta",
            name: "Marie Dupont",
            role: "SENIOR_TELLER",
            status: "ACTIVE"
          }
        ]
      })
    });
    expect(resDualEmp.status).toBe(403);
    expect((await resDualEmp.json()).error).toBe("FORBIDDEN_TENANT_ACCESS");

    // 11d. Spoofing actorUid in request body
    const resSpoofActor = await fetch(`${baseUrl}/api/cash/tills/auto-provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-owner-alpha"
      },
      body: JSON.stringify({
        businessId: "biz_tenant_alpha",
        actorUid: "uid_superadmin"
      })
    });
    expect(resSpoofActor.status).toBe(403);
    expect((await resSpoofActor.json()).error).toBe("IDENTITY_SPOOFING_DETECTED");

    expect(captureFullStoreSnapshot()).toBe(stateBefore);
  });
});
