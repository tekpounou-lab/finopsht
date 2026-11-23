import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { generateKeyPairSync } from "node:crypto";

const { privateKey: TEST_PEM_PRIVATE_KEY } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
});

// Mock firebase/firestore and ../../lib/firebase cleanly before importing repositories/orchestrators
const {
  mockGetDoc,
  mockSetDoc,
  mockUpdateDoc,
  mockOnSnapshot,
  mockDoc,
  mockCollection,
  mockQuery,
  mockWhere,
  mockResilientGetDocs,
  mockAuthState
} = vi.hoisted(() => {
  return {
    mockGetDoc: vi.fn(),
    mockSetDoc: vi.fn(),
    mockUpdateDoc: vi.fn(),
    mockOnSnapshot: vi.fn(),
    mockDoc: vi.fn((_db: any, col: string, id: string) => ({ path: `${col}/${id}`, id, col })),
    mockCollection: vi.fn((_db: any, col: string) => ({ path: col, col, __type: "collection" })),
    mockQuery: vi.fn((colRef: any, ...constraints: any[]) => ({ colRef, constraints, __type: "query" })),
    mockWhere: vi.fn((field: string, op: string, val: any) => ({ field, op, val, __type: "where" })),
    mockResilientGetDocs: vi.fn(),
    mockAuthState: {
      currentUser: { uid: "user_1", email: "user@acme.com", getIdToken: vi.fn(async () => "id_tok_123") } as any
    }
  };
});

vi.mock("../../../lib/firebase", () => ({
  db: { __mockDb: true },
  auth: mockAuthState,
  serverTimestamp: () => ({ __serverTimestamp: true }),
  logFirestoreError: vi.fn(),
  handleFirestoreError: vi.fn(),
  OperationType: { GET: "get", WRITE: "write", LIST: "list" }
}));

vi.mock("firebase/firestore", () => ({
  doc: mockDoc,
  getDoc: mockGetDoc,
  setDoc: mockSetDoc,
  updateDoc: mockUpdateDoc,
  collection: mockCollection,
  query: mockQuery,
  where: mockWhere,
  orderBy: vi.fn((f: string, d?: string) => ({ f, d, __type: "orderBy" })),
  limit: vi.fn((n: number) => ({ n, __type: "limit" })),
  onSnapshot: mockOnSnapshot,
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  writeBatch: vi.fn(),
  runTransaction: vi.fn()
}));

vi.mock("../../../utils/resilientFirestore", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    resilientGetDocs: mockResilientGetDocs
  };
});

import {
  normalizeAdminPrivateKey,
  resolveFirebaseAdminConfig
} from "../../../lib/firebaseAdmin";
import { CurrencyRateRepository } from "../../../repositories/CurrencyRateRepository";
import { AdminRepository } from "../../../modules/admin/AdminRepository";
import { JobEngine } from "../../../modules/runtime/JobEngine";
import { MonitoringService } from "../../../modules/admin/MonitoringService";
import { RuntimeEngine } from "../../../modules/runtime/RuntimeEngine";
import { EnterpriseIdentityOrchestrator } from "../../../modules/identity/EnterpriseIdentityOrchestrator";

const ROOT = process.cwd();

describe("FINOPS P0 API & Firestore Remediation Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.currentUser = {
      uid: "user_1",
      email: "user@acme.com",
      getIdToken: vi.fn(async () => "id_tok_123")
    };
    CurrencyRateRepository.clearCache();
    RuntimeEngine.setBusinessContext(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("Fix A — Firebase Admin Initialization Matrix & Vercel Packaging", () => {
    it("normalizes escaped \\n PEM private keys with or without wrapping quotes", () => {
      const escaped =
        '"-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBg==\\n-----END PRIVATE KEY-----\\n"';
      const normalized = normalizeAdminPrivateKey(escaped);
      expect(normalized).toContain("-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg==\n-----END PRIVATE KEY-----");
      expect(normalized.startsWith('"')).toBe(false);
    });

    it("selects cloud_run_adc on Cloud Run runtime (non-ais K_SERVICE)", () => {
      const res = resolveFirebaseAdminConfig({
        K_SERVICE: "finops-erp-service",
        NODE_ENV: "production"
      } as any);
      expect(res.runtime).toBe("cloud_run");
      expect(res.credentialSource).toBe("cloud_run_adc");
      expect(res.projectId).toBe("finopsht");
      expect(res.firestoreDatabaseId).toBe("ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a");
    });

    it("selects env_split_key on Vercel when split admin env vars are provided", () => {
      const escapedKey = TEST_PEM_PRIVATE_KEY.replace(/\n/g, "\\n");
      const res = resolveFirebaseAdminConfig({
        VERCEL: "1",
        VERCEL_ENV: "production",
        FIREBASE_ADMIN_PROJECT_ID: "finopsht",
        FIREBASE_ADMIN_CLIENT_EMAIL: "firebase-adminsdk@finopsht.iam.gserviceaccount.com",
        FIREBASE_ADMIN_PRIVATE_KEY: escapedKey
      } as any);
      expect(res.runtime).toBe("vercel");
      expect(res.credentialSource).toBe("env_split_key");
      expect(res.projectId).toBe("finopsht");
    });

    it("supports FIREBASE_SERVICE_ACCOUNT_KEY as raw JSON and base64 JSON on Vercel", () => {
      const saPayload = JSON.stringify({
        type: "service_account",
        project_id: "finopsht",
        client_email: "firebase-adminsdk@finopsht.iam.gserviceaccount.com",
        private_key: TEST_PEM_PRIVATE_KEY
      });

      const rawRes = resolveFirebaseAdminConfig({
        VERCEL: "1",
        VERCEL_ENV: "production",
        FIREBASE_SERVICE_ACCOUNT_KEY: saPayload
      } as any);
      expect(rawRes.runtime).toBe("vercel");
      expect(rawRes.credentialSource).toBe("service_account_json_env");

      const b64Res = resolveFirebaseAdminConfig({
        VERCEL: "1",
        VERCEL_ENV: "production",
        FIREBASE_SERVICE_ACCOUNT_KEY: Buffer.from(saPayload, "utf-8").toString("base64")
      } as any);
      expect(b64Res.runtime).toBe("vercel");
      expect(b64Res.credentialSource).toBe("service_account_json_env");
    });

    it("fails fast on Vercel without credentials and never exposes secrets in the error message", () => {
      expect(() =>
        resolveFirebaseAdminConfig({
          VERCEL: "1",
          VERCEL_ENV: "production"
        } as any)
      ).toThrowError(/FIREBASE_ADMIN_NOT_CONFIGURED/);
    });

    it("rejects mismatched FIREBASE_ADMIN_PROJECT_ID explicitly", () => {
      expect(() =>
        resolveFirebaseAdminConfig({
          VERCEL: "1",
          FIREBASE_ADMIN_PROJECT_ID: "wrong-project-id"
        } as any)
      ).toThrowError(/FIREBASE_ADMIN_PROJECT_MISMATCH/);
    });

    it("rejects invalid PEM format without leaking private key contents", () => {
      const fakeSecret = "super_secret_non_pem_material_12345";
      let thrown: Error | null = null;
      try {
        resolveFirebaseAdminConfig({
          VERCEL: "1",
          FIREBASE_ADMIN_CLIENT_EMAIL: "admin@finopsht.iam.gserviceaccount.com",
          FIREBASE_ADMIN_PRIVATE_KEY: fakeSecret
        } as any);
      } catch (err: any) {
        thrown = err;
      }
      expect(thrown).not.toBeNull();
      expect(thrown!.message).toContain("FIREBASE_ADMIN_INVALID_KEY_FORMAT");
      expect(thrown!.message).not.toContain(fakeSecret);
    });

    it("verifies api/index.ts uses ESM-safe CJS bundle loading and preserves x-invoke-path query + pre-parsed body", async () => {
      const apiSrc = fs.readFileSync(path.join(ROOT, "api/index.ts"), "utf-8");
      expect(apiSrc).toContain('from "node:module"');
      expect(apiSrc).toContain("api/_server.cjs");
      expect(apiSrc).toContain("dist/server.cjs");
      expect(apiSrc).toContain("req._body = true");
      expect(apiSrc).not.toMatch(/import\s+.*firebase-applet-config\.json/);
      expect(apiSrc).not.toContain("import.meta.env");
    });
  });

  describe("Fix B — Null-Safe Firestore Rules Static Verification", () => {
    it("verifies firestore.rules contains null-safe guards and scoped enterprise_health_snapshots rules", () => {
      const rules = fs.readFileSync(path.join(ROOT, "firestore.rules"), "utf-8");
      expect(rules).toContain("function getActorTenantId()");
      expect(rules).toContain("function isPathPrefixedWithActorTenant(docId, prefix)");
      expect(rules).toContain("function isOwnTenantDailyRateGridId(gridId)");
      expect(rules).toMatch(/match \/enterprise_health_snapshots\/\{id\}[\s\S]*?allow get:[\s\S]*?resource != null && getBusinessId\(resource\.data\) != 'none'/);
      expect(rules).toMatch(/match \/enterprise_health_snapshots\/\{id\}[\s\S]*?allow create:[\s\S]*?id == \(getBusinessId\(request\.resource\.data\) \+ '_' \+ request\.resource\.data\.get\('name', ''\)\)/);
      expect(rules).toMatch(/match \/daily_exchange_rate_grids\/\{gridId\}[\s\S]*?resource == null && isOwnTenantDailyRateGridId\(gridId\)/);
      expect(rules).toMatch(/match \/employees\/\{empId\}[\s\S]*?resource == null && \(empId == request\.auth\.uid \|\| empId == \('emp_' \+ request\.auth\.uid\)\)/);
    });
  });

  describe("Fix C — CurrencyRateRepository Isolated Error Boundaries", () => {
    it("falls back to historical grid when today's grid document does not exist", async () => {
      mockGetDoc.mockResolvedValueOnce({ exists: () => false });
      mockResilientGetDocs.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            data: () => ({
              id: "fx_grid_biz_1_2026-11-20",
              businessId: "biz_1",
              effectiveDate: "2026-11-20",
              is_inherited: false,
              source: "manual",
              rates: { ACHAT_CLIENT: 141.5, VENTE_CLIENT: 145.0, BRH: 142.0 }
            })
          }
        ]
      });

      const grid = await CurrencyRateRepository.getTodayRatesWithFallback("biz_1", "2026-11-21");
      expect(grid.rates.ACHAT_CLIENT).toBe(141.5);
      expect(grid.is_inherited).toBe(true);
      expect(grid.fallbackDate).toBe("2026-11-20");
    });

    it("falls back to historical grid when today's getDoc throws not-found", async () => {
      mockGetDoc.mockRejectedValueOnce(Object.assign(new Error("Document not found"), { code: "not-found" }));
      mockResilientGetDocs.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            data: () => ({
              id: "fx_grid_biz_1_2026-11-19",
              businessId: "biz_1",
              effectiveDate: "2026-11-19",
              is_inherited: false,
              source: "manual",
              rates: { ACHAT_CLIENT: 139.0 }
            })
          }
        ]
      });

      const grid = await CurrencyRateRepository.getTodayRatesWithFallback("biz_1", "2026-11-21");
      expect(grid.rates.ACHAT_CLIENT).toBe(139.0);
    });

    it("propagates permission-denied from today's getDoc instead of silently returning default grid", async () => {
      mockGetDoc.mockRejectedValueOnce(
        Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" })
      );

      await expect(
        CurrencyRateRepository.getTodayRatesWithFallback("biz_1", "2026-11-21")
      ).rejects.toThrow(/Missing or insufficient permissions/);
      expect(mockResilientGetDocs).not.toHaveBeenCalled();
    });

    it("propagates permission-denied from historical fallback query instead of masking it", async () => {
      mockGetDoc.mockResolvedValueOnce({ exists: () => false });
      mockResilientGetDocs.mockRejectedValueOnce(
        Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" })
      );

      await expect(
        CurrencyRateRepository.getTodayRatesWithFallback("biz_1", "2026-11-21")
      ).rejects.toThrow(/Missing or insufficient permissions/);
    });

    it("propagates permission-denied in syncYesterdayRatesToToday", async () => {
      mockGetDoc.mockRejectedValueOnce(
        Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" })
      );

      await expect(CurrencyRateRepository.syncYesterdayRatesToToday("biz_1")).rejects.toThrow(
        /Missing or insufficient permissions/
      );
      expect(mockSetDoc).not.toHaveBeenCalled();
    });
  });

  describe("Fix D — Tenant-Scoped Health Snapshots & Monitoring", () => {
    it("skips unscoped health writes for missing, 'none', 'default', or 'SYSTEM' tenant IDs", async () => {
      await AdminRepository.reportHealth({ name: "JOB_ENGINE", status: "GREEN", lastUpdate: new Date().toISOString() });
      await AdminRepository.reportHealth({ name: "JOB_ENGINE", businessId: "none", status: "GREEN", lastUpdate: new Date().toISOString() });
      await AdminRepository.reportHealth({ name: "MONITORING_SERVICE", businessId: "SYSTEM", status: "GREEN", lastUpdate: new Date().toISOString() });

      expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it("writes tenant-scoped health snapshot with docId `${businessId}_${moduleName}` matching firestore.rules", async () => {
      mockSetDoc.mockResolvedValueOnce(undefined);

      await AdminRepository.reportHealth({
        name: "JOB_ENGINE",
        businessId: "biz_alpha",
        status: "GREEN",
        lastUpdate: { seconds: 123 } as any,
        metrics: { queueSize: 0 }
      });

      expect(mockDoc).toHaveBeenCalledWith(expect.anything(), "enterprise_health_snapshots", "biz_alpha_JOB_ENGINE");
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      const writtenPayload = mockSetDoc.mock.calls[0][1];
      expect(writtenPayload.business_id).toBe("biz_alpha");
      expect(writtenPayload.businessId).toBe("biz_alpha");
      expect(writtenPayload.name).toBe("JOB_ENGINE");
      expect(typeof writtenPayload.lastUpdate).toBe("string");
      expect(writtenPayload.lastUpdate).not.toBe("[object Object]");
    });

    it("skips subscribeToHealth collection query when user is not SuperAdmin and has no valid tenant ID", () => {
      const cb = vi.fn();
      const unsub = AdminRepository.subscribeToHealth(cb, { businessId: null, isSuperAdmin: false });
      expect(typeof unsub).toBe("function");
      expect(mockOnSnapshot).not.toHaveBeenCalled();
    });

    it("scopes subscribeToHealth with where('business_id', '==', bizId) for tenant users", () => {
      mockOnSnapshot.mockReturnValueOnce(() => {});
      AdminRepository.subscribeToHealth(vi.fn(), { businessId: "biz_alpha", isSuperAdmin: false });

      expect(mockWhere).toHaveBeenCalledWith("business_id", "==", "biz_alpha");
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
    });

    it("routes RuntimeEngine.setBusinessContext to JobEngine and MonitoringService without unscoped writes", async () => {
      await JobEngine.reportCurrentHealth();
      await (MonitoringService as any).getInstance().reportCurrentHealth();
      expect(mockSetDoc).not.toHaveBeenCalled();

      mockSetDoc.mockResolvedValue(undefined);
      RuntimeEngine.setBusinessContext("biz_beta", { isSuperAdmin: false });
      await JobEngine.reportCurrentHealth();
      await (MonitoringService as any).getInstance().reportCurrentHealth();

      expect(mockDoc).toHaveBeenCalledWith(expect.anything(), "enterprise_health_snapshots", "biz_beta_JOB_ENGINE");
      expect(mockDoc).toHaveBeenCalledWith(expect.anything(), "enterprise_health_snapshots", "biz_beta_MONITORING_SERVICE");

      RuntimeEngine.setBusinessContext(null);
      mockSetDoc.mockClear();
      await JobEngine.reportCurrentHealth();
      expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it("skips unscoped SYSTEM incidents in AdminRepository.createIncident", async () => {
      await AdminRepository.createIncident({
        id: "inc_1",
        businessId: "SYSTEM",
        module: "RUNTIME",
        severity: "CRITICAL",
        priority: "P0",
        status: "OPEN",
        title: "Test",
        description: "Test",
        timeline: [],
        affectedModules: ["RUNTIME"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      expect(mockSetDoc).not.toHaveBeenCalled();
    });
  });

  describe("Fix E — Invitation Acceptance & Rejection Backend Authority", () => {
    it("throws on backend 500 without falling back to client-side Firestore mutations", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "SERVER_ERROR", message: "Backend invitation error" })
      });
      vi.stubGlobal("fetch", fetchMock);

      const fakeUser: any = {
        uid: "uid_alice",
        email: "alice@acme.com",
        displayName: "Alice",
        getIdToken: vi.fn(async () => "tok_alice")
      };

      await expect(EnterpriseIdentityOrchestrator.acceptInvitation("inv_123", fakeUser)).rejects.toThrow(
        /Backend invitation error/
      );
      expect(fetchMock).toHaveBeenCalledWith("/api/invitations/accept", expect.any(Object));
      expect(mockSetDoc).not.toHaveBeenCalled();
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });

    it("routes rejectInvitation through POST /api/invitations/reject and never mutates Firestore directly", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      });
      vi.stubGlobal("fetch", fetchMock);

      const fakeUser: any = {
        uid: "uid_alice",
        email: "alice@acme.com",
        getIdToken: vi.fn(async () => "tok_alice")
      };

      await EnterpriseIdentityOrchestrator.rejectInvitation("inv_123", fakeUser);
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/invitations/reject",
        expect.objectContaining({ method: "POST" })
      );
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });

    it("verifies IdentityContext rethrows acceptInvitation and rejectInvitation failures", () => {
      const ctxSrc = fs.readFileSync(
        path.join(ROOT, "src/modules/identity/IdentityContext.tsx"),
        "utf-8"
      );
      expect(ctxSrc).toMatch(/const acceptInvitation = useCallback[\s\S]*?throw err;/);
      expect(ctxSrc).toMatch(/const rejectInvitation = useCallback[\s\S]*?throw err;/);
    });
  });
});
