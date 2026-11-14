/**
 * FINOPS ERP / FINAYITI FUSION
 * PHASE D1 & D1.1 — AUTHENTICATION, AUTHORIZATION, IDOR & MULTI-TENANT ISOLATION TEST SUITE
 *
 * Verifies:
 * 1. Token revocation verification via verifyIdToken(token, true) -> 401 TOKEN_REVOKED (with spy assertion on checkRevoked === true and sanitized 401 body).
 * 2. Disabled user detection & suspended Firestore user detection -> 401 USER_DISABLED / 403 ACCOUNT_SUSPENDED.
 * 3. Missing/synthetic/placeholder tenant rejection -> 403 TENANT_BINDING_REQUIRED.
 * 4. Claims vs Firestore tenant conflict detection -> 403 TENANT_MISMATCH (no hybrid attribution).
 * 5. Unverified email SuperAdmin claim rejection.
 * 6. Client businessId and x-business-id substitution prevention -> 403 FORBIDDEN_TENANT_ACCESS.
 * 7. SuperAdmin governance access & x-business-id override even with home business_id.
 * 8. Cash RBAC enforcement on /intake and /payout (AUDITOR and EMPLOYEE rejected with 403 FORBIDDEN_ROLE).
 * 9. Real Engine IDOR protection on /intake and /payout (cross-tenant transferId, tillId, sessionId, and foreign operator session rejected with 403 and zero state mutation).
 * 10. Invitations & Provisioning security (UID spoofing, SUPER_ADMIN escalation, cross-tenant send, recipient email mismatch, tenant overwrite forbidden).
 * 11. Payroll Receivables & Maintenance route protection (unauthenticated 401, cross-tenant 403, approver spoofing 403, Maker-Checker enforcement 403).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import {
  authenticateToken,
  requireSuperAdmin,
  AuthenticatedRequest
} from "../../../modules/workflow/approval/serverAuthMiddleware";
import { ServerTransferIntakeEngine } from "../../../domains/cash/services/ServerTransferIntakeEngine";
import { createApp } from "../../../../server";

const {
  mockUserDocs,
  mockFirestoreStore,
  verifyIdTokenSpy,
  setCustomUserClaimsSpy
} = vi.hoisted(() => {
  return {
    mockUserDocs: new Map<string, any>(),
    mockFirestoreStore: new Map<string, any>(),
    verifyIdTokenSpy: vi.fn(),
    setCustomUserClaimsSpy: vi.fn(async () => {})
  };
});

function applyUpdatesWithFieldDelete(prev: Record<string, any>, updates: Record<string, any>) {
  const next = { ...prev };
  for (const [k, v] of Object.entries(updates)) {
    const isDeleteSentinel =
      v &&
      typeof v === "object" &&
      (v.constructor?.name === "DeleteTransform" ||
        v._methodName === "FieldValue.delete" ||
        typeof v.isEqual === "function");
    if (isDeleteSentinel) {
      delete next[k];
    } else {
      next[k] = v;
    }
  }
  return next;
}

// Mock Firebase Admin SDK with in-memory transactional store supporting queries, deletes, and subcollections
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
          mockUserDocs.set(docId, applyUpdatesWithFieldDelete(prev, data));
          return;
        }
        const prev = mockFirestoreStore.get(docPath) || {};
        mockFirestoreStore.set(docPath, applyUpdatesWithFieldDelete(prev, data));
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
      setCustomUserClaims: setCustomUserClaimsSpy
    }),
    getAdminFirestore: () => ({
      doc: (fullPath: string) => getDocHelper(fullPath),
      collection: (collName: string) => ({
        doc: (docId?: string) => {
          const resolvedId = docId || `auto_${Math.random().toString(36).substring(2, 9)}`;
          return getDocHelper(`${normalizePath(collName)}/${resolvedId}`);
        },
        add: async (data: any) => {
          const resolvedId = `auto_${Math.random().toString(36).substring(2, 9)}`;
          mockFirestoreStore.set(`${normalizePath(collName)}/${resolvedId}`, data);
          return { id: resolvedId };
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
        // Snapshot clone so aborted transactions roll back cleanly
        const stagedStore = new Map(mockFirestoreStore);
        const stagedUsers = new Map(mockUserDocs);

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
              stagedUsers.set(docId, { ...prev, ...data });
            } else {
              const prev = options?.merge && stagedStore.has(cleanPath) ? stagedStore.get(cleanPath) : {};
              stagedStore.set(cleanPath, { ...prev, ...data });
            }
          },
          update: (ref: any, data: any) => {
            const cleanPath = normalizePath(ref.path);
            const prev = stagedStore.get(cleanPath) || {};
            stagedStore.set(cleanPath, applyUpdatesWithFieldDelete(prev, data));
          }
        };

        const result = await updateFn(txContext);
        // Commit staged changes only if updateFn succeeded without throwing
        mockFirestoreStore.clear();
        stagedStore.forEach((v, k) => mockFirestoreStore.set(k, v));
        mockUserDocs.clear();
        stagedUsers.forEach((v, k) => mockUserDocs.set(k, v));
        return result;
      }
    })
  };
});

describe("Phase D1, D1.1 & D1.2: Authentication, Authorization, IDOR & Multi-Tenant Hardening Suite", () => {
  let app: express.Express;

  beforeEach(async () => {
    mockUserDocs.clear();
    mockFirestoreStore.clear();
    vi.clearAllMocks();
    vi.restoreAllMocks();

    verifyIdTokenSpy.mockImplementation(async (token: string, checkRevoked?: boolean) => {
      if (checkRevoked !== true) {
        throw new Error("SECURITY_DEFECT: verifyIdToken must be called with checkRevoked === true");
      }

      if (token === "revoked-token") {
        const err: any = new Error("Firebase ID token has been revoked (internal detail).");
        err.code = "auth/id-token-revoked";
        throw err;
      }

      if (token === "disabled-user-token") {
        const err: any = new Error("User account has been disabled.");
        err.code = "auth/user-disabled";
        throw err;
      }

      if (token === "invalid-token") {
        const err: any = new Error("Firebase ID token verification failed. Secret trace.");
        err.code = "auth/id-token-expired";
        throw err;
      }

      if (token === "valid-superadmin-token") {
        return {
          uid: "superadmin_001",
          email: "tekpounou@gmail.com",
          email_verified: true,
          role: "SUPER_ADMIN",
          is_super_admin: true
        };
      }

      if (token === "superadmin-with-home-biz-token") {
        return {
          uid: "superadmin_home_002",
          email: "tekpounou@gmail.com",
          email_verified: true,
          role: "SUPER_ADMIN",
          is_super_admin: true,
          business_id: "biz_superadmin_home"
        };
      }

      if (token === "unverified-superadmin-email-token") {
        return {
          uid: "spoof_superadmin_999",
          email: "tekpounou@gmail.com",
          email_verified: false,
          role: "EMPLOYEE",
          business_id: "biz_tenant_alpha"
        };
      }

      if (token === "valid-alpha-user-token") {
        return {
          uid: "user_alpha_001",
          email: "operator@tenant-alpha.com",
          email_verified: true,
          role: "TELLER",
          business_id: "biz_tenant_alpha"
        };
      }

      if (token === "valid-alpha-owner-token") {
        return {
          uid: "owner_alpha_001",
          email: "owner@tenant-alpha.com",
          email_verified: true,
          role: "OWNER",
          business_id: "biz_tenant_alpha"
        };
      }

      if (token === "valid-alpha-admin-token") {
        return {
          uid: "admin_alpha_001",
          email: "admin@tenant-alpha.com",
          email_verified: true,
          role: "ADMIN",
          business_id: "biz_tenant_alpha"
        };
      }

      if (token === "valid-alpha-accountant-token") {
        return {
          uid: "accountant_alpha_001",
          email: "accountant@tenant-alpha.com",
          email_verified: true,
          role: "ACCOUNTANT",
          business_id: "biz_tenant_alpha"
        };
      }

      if (token === "valid-alpha-manager-token") {
        return {
          uid: "manager_alpha_001",
          email: "manager@tenant-alpha.com",
          email_verified: true,
          role: "MANAGER",
          business_id: "biz_tenant_alpha"
        };
      }

      if (token === "valid-alpha-auditor-token") {
        return {
          uid: "auditor_alpha_001",
          email: "auditor@tenant-alpha.com",
          email_verified: true,
          role: "AUDITOR",
          business_id: "biz_tenant_alpha"
        };
      }

      if (token === "valid-alpha-employee-token") {
        return {
          uid: "employee_alpha_001",
          email: "employee@tenant-alpha.com",
          email_verified: true,
          role: "EMPLOYEE",
          business_id: "biz_tenant_alpha"
        };
      }

      if (token === "user-relying-on-firestore-token") {
        return {
          uid: "user_firestore_lookup_001",
          email: "firestore_user@tenant-alpha.com",
          email_verified: true,
          role: "EMPLOYEE"
        };
      }

      if (token === "orphaned-user-token") {
        return {
          uid: "orphaned_user_999",
          email: "orphan@unbound.com",
          email_verified: true,
          role: "EMPLOYEE"
        };
      }

      if (token === "new-founder-token") {
        return {
          uid: "founder_new_001",
          email: "founder@newco.com",
          email_verified: true
        };
      }

      if (token === "invited-colleague-token") {
        return {
          uid: "invited_user_001",
          email: "colleague@tenant-alpha.com",
          email_verified: true
        };
      }

      if (token === "claims-bound-alpha-no-userdoc-token") {
        return {
          uid: "claims_only_alpha_001",
          email: "claims_only@tenant-alpha.com",
          email_verified: true,
          role: "OWNER",
          business_id: "biz_tenant_alpha"
        };
      }

      throw new Error("Unknown token signature");
    });

    // Mount the REAL server.ts Express application (no inline duplicated routes)
    const realServerApp = await createApp();
    app = express();
    app.use(express.json());

    // Diagnostic middleware verification routes placed before realServerApp's /api 404 catch-all
    app.get("/api/test/me", authenticateToken, (req: AuthenticatedRequest, res) => {
      res.json({ user: req.user });
    });

    app.get("/api/test/superadmin-only", authenticateToken, requireSuperAdmin, (_req: AuthenticatedRequest, res) => {
      res.json({ success: true, message: "SuperAdmin access granted." });
    });

    app.use(realServerApp);
  });

  describe("1. Token Revocation & Status Verification (verifyIdToken(token, true))", () => {
    it("explicitly calls verifyIdToken(token, true) and rejects revoked tokens with sanitized 401 TOKEN_REVOKED", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/test/me`, {
          headers: { Authorization: "Bearer revoked-token" }
        });

        expect(verifyIdTokenSpy).toHaveBeenCalledWith("revoked-token", true);
        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe("TOKEN_REVOKED");
        expect(data.details).toBeUndefined();
      } finally {
        server.close();
      }
    });

    it("rejects disabled user tokens with 401 USER_DISABLED", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/test/me`, {
          headers: { Authorization: "Bearer disabled-user-token" }
        });

        expect(verifyIdTokenSpy).toHaveBeenCalledWith("disabled-user-token", true);
        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe("USER_DISABLED");
        expect(data.details).toBeUndefined();
      } finally {
        server.close();
      }
    });

    it("rejects invalid or expired tokens with sanitized 401 INVALID_TOKEN", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/test/me`, {
          headers: { Authorization: "Bearer invalid-token" }
        });

        expect(verifyIdTokenSpy).toHaveBeenCalledWith("invalid-token", true);
        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe("INVALID_TOKEN");
        expect(data.details).toBeUndefined();
      } finally {
        server.close();
      }
    });

    it("rejects requests missing Bearer authorization header with 401 UNAUTHORIZED", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/test/me`);

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe("UNAUTHORIZED");
      } finally {
        server.close();
      }
    });

    it("rejects user whose Firestore users/{uid} profile is SUSPENDED even when token is still valid", async () => {
      mockUserDocs.set("user_alpha_001", {
        business_id: "biz_tenant_alpha",
        role: "TELLER",
        accountStatus: "SUSPENDED"
      });

      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/test/me`, {
          headers: { Authorization: "Bearer valid-alpha-user-token" }
        });

        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBe("ACCOUNT_SUSPENDED");
      } finally {
        server.close();
      }
    });
  });

  describe("2. Source of Truth Unification & Elimination of Synthetic/Placeholder Tenants", () => {
    it("rejects orphaned users lacking business association with 403 TENANT_BINDING_REQUIRED", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/test/me`, {
          headers: { Authorization: "Bearer orphaned-user-token" }
        });

        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBe("TENANT_BINDING_REQUIRED");
      } finally {
        server.close();
      }
    });

    it("rejects unprovisioned synthetic biz_${uid} or placeholder ('none', 'default') in users/{uid}", async () => {
      mockUserDocs.set("user_firestore_lookup_001", {
        business_id: "biz_user_firestore_lookup_001",
        role: "OWNER"
      });

      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/test/me`, {
          headers: { Authorization: "Bearer user-relying-on-firestore-token" }
        });

        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBe("TENANT_BINDING_REQUIRED");
      } finally {
        server.close();
      }
    });

    it("rejects conflicting custom claims (biz_tenant_alpha) vs users/{uid} (biz_victim_beta) with 403 TENANT_MISMATCH (no hybrid attribution)", async () => {
      mockUserDocs.set("user_alpha_001", {
        business_id: "biz_victim_beta",
        role: "OWNER"
      });

      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/test/me`, {
          headers: { Authorization: "Bearer valid-alpha-user-token" }
        });

        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBe("TENANT_MISMATCH");
      } finally {
        server.close();
      }
    });

    it("does NOT grant SuperAdmin when email matches SuperAdmin list but email_verified is false", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/test/superadmin-only`, {
          headers: { Authorization: "Bearer unverified-superadmin-email-token" }
        });

        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBe("FORBIDDEN");
      } finally {
        server.close();
      }
    });

    it("successfully binds tenant when business_id is present in Firestore user document", async () => {
      mockUserDocs.set("user_firestore_lookup_001", {
        business_id: "biz_from_firestore_doc",
        role: "MANAGER"
      });

      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/test/me`, {
          headers: { Authorization: "Bearer user-relying-on-firestore-token" }
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.user.business_id).toBe("biz_from_firestore_doc");
        expect(data.user.role).toBe("MANAGER");
      } finally {
        server.close();
      }
    });
  });

  describe("3. Multi-Tenant Cross-Tenant Substitution, x-business-id & RBAC Prevention", () => {
    it("blocks non-SuperAdmin client sending conflicting x-business-id header with 403 FORBIDDEN_TENANT_ACCESS", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/test/me`, {
          headers: {
            Authorization: "Bearer valid-alpha-user-token",
            "x-business-id": "biz_victim_beta"
          }
        });

        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBe("FORBIDDEN_TENANT_ACCESS");
      } finally {
        server.close();
      }
    });

    it("blocks non-SuperAdmin client attempting to substitute businessId in POST /intake or /payout body", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/cash/transfers/intake`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-user-token"
          },
          body: JSON.stringify({
            businessId: "biz_victim_beta",
            amountCents: 500000,
            currency: "HTG"
          })
        });

        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBe("FORBIDDEN_TENANT_ACCESS");
      } finally {
        server.close();
      }
    });

    it("rejects AUDITOR and EMPLOYEE roles on POST /intake and POST /payout with 403 FORBIDDEN_ROLE", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        for (const token of ["valid-alpha-auditor-token", "valid-alpha-employee-token"]) {
          const intakeRes = await fetch(`http://127.0.0.1:${port}/api/cash/transfers/intake`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              amountCents: 100000,
              currency: "HTG",
              senderName: "Alice",
              beneficiaryName: "Bob"
            })
          });
          expect(intakeRes.status).toBe(403);
          const intakeData = await intakeRes.json();
          expect(intakeData.error).toBe("FORBIDDEN_ROLE");

          const payoutRes = await fetch(`http://127.0.0.1:${port}/api/cash/transfers/payout`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              transferId: "trf_001",
              tillId: "till_001",
              sessionId: "sess_001",
              idDocument: "CIN-123"
            })
          });
          expect(payoutRes.status).toBe(403);
          const payoutData = await payoutRes.json();
          expect(payoutData.error).toBe("FORBIDDEN_ROLE");
        }
      } finally {
        server.close();
      }
    });

    it("rejects POST /verify-log when log.business_id is missing, 'DEFAULT', or belongs to another tenant", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        // Missing business_id
        const missingBizRes = await fetch(`http://127.0.0.1:${port}/api/cash/transfers/verify-log`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-user-token"
          },
          body: JSON.stringify({
            log: {
              id: "log_001",
              action: "TRANSFER_PAYOUT",
              signature: "sig_123"
            }
          })
        });
        expect(missingBizRes.status).toBe(400);
        const missingData = await missingBizRes.json();
        expect(missingData.error).toBe("MISSING_TENANT_CONTEXT");

        // Foreign tenant business_id
        const foreignRes = await fetch(`http://127.0.0.1:${port}/api/cash/transfers/verify-log`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-user-token"
          },
          body: JSON.stringify({
            log: {
              id: "log_002",
              business_id: "biz_victim_beta",
              action: "TRANSFER_PAYOUT",
              signature: "sig_123"
            }
          })
        });
        expect(foreignRes.status).toBe(403);
        const foreignData = await foreignRes.json();
        expect(foreignData.error).toBe("FORBIDDEN_TENANT_ACCESS");
      } finally {
        server.close();
      }
    });
  });

  describe("4. Real Engine Cross-Tenant IDOR Protection via HTTP Router (No Engine Mocks)", () => {
    beforeEach(() => {
      // Seed user_alpha_001 with authorized TELLER role and 'teller' operational profile
      mockUserDocs.set("user_alpha_001", {
        business_id: "biz_tenant_alpha",
        role: "TELLER",
        operational_profile: "teller",
        accountStatus: "ACTIVE"
      });
      mockFirestoreStore.set("employees/user_alpha_001", {
        id: "user_alpha_001",
        business_id: "biz_tenant_alpha",
        role: "TELLER",
        operational_profile: "teller",
        status: "ACTIVE"
      });

      // Seed Tenant Alpha till & session owned by user_alpha_001
      mockFirestoreStore.set("cash_tills/till_alpha", {
        id: "till_alpha",
        business_id: "biz_tenant_alpha",
        branch_id: "BR_ALPHA",
        name: "Caisse Alpha",
        currency: "HTG",
        balance_cents: 5000000,
        status: "OPEN",
        active_session_id: "sess_alpha"
      });
      mockFirestoreStore.set("till_sessions/sess_alpha", {
        id: "sess_alpha",
        business_id: "biz_tenant_alpha",
        branch_id: "BR_ALPHA",
        till_id: "till_alpha",
        operator_id: "user_alpha_001",
        operator_name: "Teller Alpha",
        status: "ACTIVE"
      });

      // Seed Tenant Beta transfer, till & session
      mockFirestoreStore.set("customer_transfers/trf_victim_beta", {
        id: "trf_victim_beta",
        business_id: "biz_victim_beta",
        branch_id: "BR_BETA",
        reference: "TRF-BETA-999",
        sender_name: "Beta Sender",
        beneficiary_name: "Beta Receiver",
        amount_cents: 1000000,
        currency: "HTG",
        status: "READY_FOR_PAYOUT"
      });
      mockFirestoreStore.set("cash_tills/till_victim_beta", {
        id: "till_victim_beta",
        business_id: "biz_victim_beta",
        branch_id: "BR_BETA",
        name: "Caisse Victim Beta",
        currency: "HTG",
        balance_cents: 9000000,
        status: "OPEN",
        active_session_id: "sess_victim_beta"
      });
      mockFirestoreStore.set("till_sessions/sess_victim_beta", {
        id: "sess_victim_beta",
        business_id: "biz_victim_beta",
        branch_id: "BR_BETA",
        till_id: "till_victim_beta",
        operator_id: "user_beta_001",
        operator_name: "Teller Beta",
        status: "ACTIVE"
      });
    });

    it("rejects POST /payout when user belongs to biz_tenant_alpha but transferId belongs to biz_victim_beta (403, zero mutation)", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/cash/transfers/payout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-user-token"
          },
          body: JSON.stringify({
            transferId: "trf_victim_beta",
            tillId: "till_alpha",
            sessionId: "sess_alpha",
            idDocument: "CIN-ATTACK"
          })
        });

        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.error).toBe("TENANT_ISOLATION_VIOLATION");

        // Verify victim transfer and alpha till remain untouched
        expect(mockFirestoreStore.get("customer_transfers/trf_victim_beta").status).toBe("READY_FOR_PAYOUT");
        expect(mockFirestoreStore.get("cash_tills/till_alpha").balance_cents).toBe(5000000);
      } finally {
        server.close();
      }
    });

    it("rejects POST /intake and POST /payout when tillId or sessionId belongs to biz_victim_beta (403, zero mutation)", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const intakeRes = await fetch(`http://127.0.0.1:${port}/api/cash/transfers/intake`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-user-token"
          },
          body: JSON.stringify({
            senderName: "Attacker",
            beneficiaryName: "Receiver",
            amountCents: 250000,
            currency: "HTG",
            tillId: "till_victim_beta",
            sessionId: "sess_alpha"
          })
        });

        expect(intakeRes.status).toBe(403);
        const intakeData = await intakeRes.json();
        expect(intakeData.error).toBe("TENANT_ISOLATION_VIOLATION");
        expect(mockFirestoreStore.get("cash_tills/till_victim_beta").balance_cents).toBe(9000000);

        // Also verify that providing tillId without sessionId is rejected and does not mutate till balance
        const partialTillRes = await fetch(`http://127.0.0.1:${port}/api/cash/transfers/intake`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-user-token"
          },
          body: JSON.stringify({
            senderName: "Attacker",
            beneficiaryName: "Receiver",
            amountCents: 250000,
            currency: "HTG",
            tillId: "till_alpha"
          })
        });
        expect(partialTillRes.status).toBe(403);
        const partialTillData = await partialTillRes.json();
        expect(partialTillData.error).toBe("SESSION_TILL_MISMATCH");
        expect(mockFirestoreStore.get("cash_tills/till_alpha").balance_cents).toBe(5000000);
      } finally {
        server.close();
      }
    });

    it("rejects POST /intake when session belongs to a different operator in the same tenant (403 UNAUTHORIZED_SESSION_OPERATOR)", async () => {
      mockFirestoreStore.set("till_sessions/sess_other_alpha_teller", {
        id: "sess_other_alpha_teller",
        business_id: "biz_tenant_alpha",
        branch_id: "BR_ALPHA",
        till_id: "till_alpha",
        operator_id: "other_teller_alpha_777",
        status: "ACTIVE"
      });

      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/cash/transfers/intake`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-user-token"
          },
          body: JSON.stringify({
            senderName: "Alice",
            beneficiaryName: "Bob",
            amountCents: 100000,
            currency: "HTG",
            tillId: "till_alpha",
            sessionId: "sess_other_alpha_teller"
          })
        });

        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.error).toBe("UNAUTHORIZED_SESSION_OPERATOR");
        expect(mockFirestoreStore.get("cash_tills/till_alpha").balance_cents).toBe(5000000);
      } finally {
        server.close();
      }
    });
  });

  describe("5. SuperAdmin Governance & Explicit Tenant Targeting", () => {
    it("allows SuperAdmin with a default home business_id to target another tenant via x-business-id header or body", async () => {
      const intakeSpy = vi.spyOn(ServerTransferIntakeEngine, "recordInboundTransfer").mockResolvedValue({
        transfer: { id: "trf_sa_001", status: "READY_FOR_PAYOUT" } as any,
        intakeGlTxId: "gl_sa_001"
      });

      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/cash/transfers/intake`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer superadmin-with-home-biz-token",
            "x-business-id": "biz_managed_target"
          },
          body: JSON.stringify({
            amountCents: 100000,
            currency: "HTG",
            senderName: "SA",
            beneficiaryName: "Target"
          })
        });

        expect(response.status).toBe(201);
        expect(intakeSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            businessId: "biz_managed_target"
          }),
          expect.objectContaining({
            business_id: "biz_managed_target",
            uid: "superadmin_home_002"
          })
        );
      } finally {
        server.close();
      }
    });
  });

  describe("6. P0-A: Invitations & Provisioning Adversarial Tests", () => {
    it("rejects founder.uid spoofing and existing business overwrite on POST /api/provisioning/create-business", async () => {
      // Seed an existing business owned by owner_alpha_001
      mockFirestoreStore.set("businesses/biz_existing_alpha", {
        id: "biz_existing_alpha",
        ownerId: "owner_alpha_001",
        status: "ACTIVE"
      });

      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        // 1. Spoofing founder.uid
        const spoofRes = await fetch(`http://127.0.0.1:${port}/api/provisioning/create-business`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer new-founder-token"
          },
          body: JSON.stringify({
            founder: { uid: "victim_uid_999", email: "founder@newco.com", name: "Attacker" },
            businessName: "Spoofed Corp"
          })
        });
        expect(spoofRes.status).toBe(403);
        expect((await spoofRes.json()).error).toBe("IDENTITY_SPOOFING_DETECTED");

        // 2. Attempting to overwrite existing business via options.businessId
        const overwriteRes = await fetch(`http://127.0.0.1:${port}/api/provisioning/create-business`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer new-founder-token"
          },
          body: JSON.stringify({
            founder: { uid: "founder_new_001", email: "founder@newco.com", name: "Founder" },
            businessName: "Takeover Corp",
            options: { businessId: "biz_existing_alpha" }
          })
        });
        expect(overwriteRes.status).toBe(403);
        expect((await overwriteRes.json()).error).toBe("TENANT_OVERWRITE_FORBIDDEN");
      } finally {
        server.close();
      }
    });

    it("rejects SUPER_ADMIN role escalation and cross-tenant invitation sending on POST /api/invitations/send", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        // 1. Owner attempting to invite SUPER_ADMIN
        const saRes = await fetch(`http://127.0.0.1:${port}/api/invitations/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-owner-token"
          },
          body: JSON.stringify({
            businessId: "biz_tenant_alpha",
            email: "hacker@external.com",
            role: "SUPER_ADMIN"
          })
        });
        expect(saRes.status).toBe(403);
        expect((await saRes.json()).error).toBe("FORBIDDEN_ROLE_ASSIGNMENT");

        // 2. Owner attempting to send invitation for foreign tenant
        const crossTenantRes = await fetch(`http://127.0.0.1:${port}/api/invitations/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-owner-token"
          },
          body: JSON.stringify({
            businessId: "biz_victim_beta",
            email: "colleague@tenant-alpha.com",
            role: "TELLER"
          })
        });
        expect(crossTenantRes.status).toBe(403);
        expect((await crossTenantRes.json()).error).toBe("FORBIDDEN_TENANT_ACCESS");
      } finally {
        server.close();
      }
    });

    it("enforces recipient email match and blocks SUPER_ADMIN escalation on POST /api/invitations/accept", async () => {
      mockFirestoreStore.set("invitations/inv_legit_001", {
        id: "inv_legit_001",
        business_id: "biz_tenant_alpha",
        email: "intended_recipient@tenant-alpha.com",
        role: "TELLER",
        status: "PENDING"
      });
      mockFirestoreStore.set("invitations/inv_poisoned_sa", {
        id: "inv_poisoned_sa",
        business_id: "biz_tenant_alpha",
        email: "colleague@tenant-alpha.com",
        role: "SUPER_ADMIN",
        status: "PENDING"
      });

      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        // 1. Wrong email recipient attempting to accept inv_legit_001
        const mismatchRes = await fetch(`http://127.0.0.1:${port}/api/invitations/accept`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer invited-colleague-token"
          },
          body: JSON.stringify({
            inviteId: "inv_legit_001",
            user: { uid: "invited_user_001", email: "colleague@tenant-alpha.com", name: "Colleague" }
          })
        });
        expect(mismatchRes.status).toBe(403);
        expect((await mismatchRes.json()).error).toBe("INVITATION_RECIPIENT_MISMATCH");

        // 2. Poisoned invitation with role SUPER_ADMIN
        const poisonedRes = await fetch(`http://127.0.0.1:${port}/api/invitations/accept`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer invited-colleague-token"
          },
          body: JSON.stringify({
            inviteId: "inv_poisoned_sa",
            user: { uid: "invited_user_001", email: "colleague@tenant-alpha.com", name: "Colleague" }
          })
        });
        expect(poisonedRes.status).toBe(403);
        expect((await poisonedRes.json()).error).toBe("FORBIDDEN_ROLE_ASSIGNMENT");
      } finally {
        server.close();
      }
    });
  });

  describe("7. P0-C: Payroll Receivables Route Protection & Maker-Checker Enforcement", () => {
    const sampleProposal = {
      id: "rec_prop_001",
      businessId: "biz_tenant_alpha",
      employeeId: "emp_001",
      employeeName: "Jean",
      originalPayrollCycleId: "cyc_001",
      originalPayrollRecordId: "rec_001",
      currency: "HTG" as const,
      approvedRecoverableAmount: 5000,
      approvedRecoverableCents: 500000,
      recoveredAmount: 0,
      recoveredCents: 0,
      outstandingAmount: 5000,
      outstandingCents: 500000,
      status: "PENDING_HUMAN_APPROVAL" as const,
      createdById: "manager_alpha_001",
      createdByName: "Manager Alpha",
      createdAt: new Date().toISOString(),
      repayments: [],
      receivableAccount: "1310_EMPLOYEE_RECEIVABLES",
      idempotencyKey: "idemp_rec_001",
      updatedAt: new Date().toISOString()
    };

    it("rejects unauthenticated access, cross-tenant approval/repayment IDOR, approver spoofing, and Maker-Checker self-approval with zero mutation on failure", async () => {
      mockFirestoreStore.set("employee_receivables/rec_prop_001", sampleProposal);
      mockFirestoreStore.set("employee_receivables/rec_victim_beta", {
        ...sampleProposal,
        id: "rec_victim_beta",
        businessId: "biz_victim_beta",
        status: "APPROVED"
      });

      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        // 1. Unauthenticated -> 401
        const unauthRes = await fetch(`http://127.0.0.1:${port}/api/payroll/receivables/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receivableId: "rec_prop_001", proposal: sampleProposal })
        });
        expect(unauthRes.status).toBe(401);

        // 2. Creator (manager_alpha_001) attempting to spoof approver.id to bypass Maker-Checker -> 403 IDENTITY_SPOOFING_DETECTED
        const spoofRes = await fetch(`http://127.0.0.1:${port}/api/payroll/receivables/approve`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-manager-token"
          },
          body: JSON.stringify({
            receivableId: "rec_prop_001",
            approver: { id: "owner_alpha_001", name: "Fake Owner", role: "OWNER" },
            proposal: sampleProposal
          })
        });
        expect(spoofRes.status).toBe(403);
        expect((await spoofRes.json()).error).toBe("IDENTITY_SPOOFING_DETECTED");

        // 3. Creator (manager_alpha_001) attempting self-approval -> 403 SEGREGATION_OF_DUTIES_VIOLATION
        const selfApproveRes = await fetch(`http://127.0.0.1:${port}/api/payroll/receivables/approve`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-manager-token"
          },
          body: JSON.stringify({
            receivableId: "rec_prop_001",
            proposal: sampleProposal
          })
        });
        expect(selfApproveRes.status).toBe(403);
        expect((await selfApproveRes.json()).error).toBe("SEGREGATION_OF_DUTIES_VIOLATION");
        expect(mockFirestoreStore.get("employee_receivables/rec_prop_001").status).toBe("PENDING_HUMAN_APPROVAL");

        // 4. Cross-tenant repayment IDOR on rec_victim_beta -> 403 TENANT_ISOLATION_VIOLATION (zero mutation)
        const crossRepayRes = await fetch(`http://127.0.0.1:${port}/api/payroll/receivables/repayment`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-owner-token"
          },
          body: JSON.stringify({
            receivableId: "rec_victim_beta",
            amountCents: 100000,
            method: "CASH_REPAYMENT",
            reference: "REF-ATTACK"
          })
        });
        expect(crossRepayRes.status).toBe(403);
        expect((await crossRepayRes.json()).error).toBe("TENANT_ISOLATION_VIOLATION");
        expect(mockFirestoreStore.get("employee_receivables/rec_victim_beta").recoveredCents).toBe(0);

        // 5. Distinct Owner (owner_alpha_001) in same tenant approving -> 200 OK
        const validApproveRes = await fetch(`http://127.0.0.1:${port}/api/payroll/receivables/approve`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-owner-token"
          },
          body: JSON.stringify({
            receivableId: "rec_prop_001",
            proposal: sampleProposal
          })
        });
        expect(validApproveRes.status).toBe(200);
        const approvedData = await validApproveRes.json();
        expect(approvedData.approvedReceivable.status).toBe("APPROVED_PENDING_RECOVERY");
        expect(approvedData.approvedReceivable.approverId).toBe("owner_alpha_001");
      } finally {
        server.close();
      }
    });

    it("protects /api/maintenance/prune-snapshots and /api/integrity/validate-foreign-keys against unauthenticated, unauthorized role, and cross-tenant requests", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        // 1. Unauthenticated -> 401
        const unauthRes = await fetch(`http://127.0.0.1:${port}/api/maintenance/prune-snapshots`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ retentionDays: 90 })
        });
        expect(unauthRes.status).toBe(401);

        // 2. Non-Admin (TELLER) -> 403 FORBIDDEN_ROLE
        const tellerRes = await fetch(`http://127.0.0.1:${port}/api/maintenance/prune-snapshots`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-user-token"
          },
          body: JSON.stringify({ retentionDays: 90 })
        });
        expect(tellerRes.status).toBe(403);
        expect((await tellerRes.json()).error).toBe("FORBIDDEN_ROLE");

        // 3. Invalid retentionDays -> 400 INVALID_RETENTION_DAYS
        const badRetentionRes = await fetch(`http://127.0.0.1:${port}/api/maintenance/prune-snapshots`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-owner-token"
          },
          body: JSON.stringify({ retentionDays: -5 })
        });
        expect(badRetentionRes.status).toBe(400);
        expect((await badRetentionRes.json()).error).toBe("INVALID_RETENTION_DAYS");

        // 4. Cross-tenant entityData on /api/integrity/validate-foreign-keys -> 403 FORBIDDEN_TENANT_ACCESS
        const crossIntegrityRes = await fetch(`http://127.0.0.1:${port}/api/integrity/validate-foreign-keys`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-owner-token"
          },
          body: JSON.stringify({
            entityType: "TRANSACTION",
            entityData: { id: "tx_1", businessId: "biz_victim_beta" }
          })
        });
        expect(crossIntegrityRes.status).toBe(403);
        expect((await crossIntegrityRes.json()).error).toBe("FORBIDDEN_TENANT_ACCESS");
      } finally {
        server.close();
      }
    });

    it("rejects hybrid role/tenant attribution and suspended businesses in serverAuthMiddleware", async () => {
      // Hybrid conflict: token has business_id="biz_tenant_alpha", role="TELLER", while users/{uid} has role="OWNER" and no business_id
      mockUserDocs.set("user_alpha_001", {
        role: "OWNER"
      });

      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const hybridRes = await fetch(`http://127.0.0.1:${port}/api/test/me`, {
          headers: { Authorization: "Bearer valid-alpha-user-token" }
        });
        expect(hybridRes.status).toBe(403);
        expect((await hybridRes.json()).error).toBe("TENANT_MISMATCH");

        // Clear user doc and mark business as SUSPENDED
        mockUserDocs.clear();
        mockFirestoreStore.set("businesses/biz_tenant_alpha", {
          id: "biz_tenant_alpha",
          status: "SUSPENDED"
        });

        const inactiveBizRes = await fetch(`http://127.0.0.1:${port}/api/test/me`, {
          headers: { Authorization: "Bearer valid-alpha-user-token" }
        });
        expect(inactiveBizRes.status).toBe(403);
        expect((await inactiveBizRes.json()).error).toBe("TENANT_INACTIVE");
      } finally {
        server.close();
      }
    });
  });

  describe("8. Phase D1.2 Post-Audit Remediations (D1.1-R-01 through D1.1-R-06) on Real createApp()", () => {
    it("D1.1-R-01: blocks cross-tenant employee overwrite via options.employeeId on POST /api/provisioning/create-business", async () => {
      mockFirestoreStore.set("employees/emp_victim_beta", {
        id: "emp_victim_beta",
        business_id: "biz_victim_beta",
        user_id: "user_beta_001",
        name: "Victim Employee Beta",
        role: "OWNER",
        status: "ACTIVE"
      });

      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/provisioning/create-business`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer new-founder-token"
          },
          body: JSON.stringify({
            founder: { uid: "founder_new_001", email: "founder@newco.com", name: "Attacker Founder" },
            businessName: "Attacker Co",
            options: {
              employeeId: "emp_victim_beta"
            }
          })
        });

        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error).toBe("TENANT_OVERWRITE_FORBIDDEN");

        // Verify victim employee record was NOT overwritten
        const victimEmp = mockFirestoreStore.get("employees/emp_victim_beta");
        expect(victimEmp.business_id).toBe("biz_victim_beta");
        expect(victimEmp.name).toBe("Victim Employee Beta");
      } finally {
        server.close();
      }
    });

    it("D1.1-R-02: enforces single-tenant membership invariant from Custom Claims even when users/{uid} is absent and options.businessId is omitted", async () => {
      // Seed an invitation for biz_victim_beta targeting claims_only@tenant-alpha.com
      mockFirestoreStore.set("invitations/inv_cross_beta", {
        id: "inv_cross_beta",
        business_id: "biz_victim_beta",
        email: "claims_only@tenant-alpha.com",
        role: "MANAGER",
        status: "PENDING"
      });

      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        // 1. User bound to biz_tenant_alpha via Custom Claims ONLY (no users/{uid} doc, no options.businessId) tries to create a new business
        const createRes = await fetch(`http://127.0.0.1:${port}/api/provisioning/create-business`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer claims-bound-alpha-no-userdoc-token"
          },
          body: JSON.stringify({
            founder: { uid: "claims_only_alpha_001", email: "claims_only@tenant-alpha.com", name: "Claims Only User" },
            businessName: "Second Tenant Bypass Co"
          })
        });
        expect(createRes.status).toBe(403);
        expect((await createRes.json()).error).toBe("USER_ALREADY_BOUND_TO_TENANT");

        // 2. Same user tries to accept an invitation to biz_victim_beta
        const acceptRes = await fetch(`http://127.0.0.1:${port}/api/invitations/accept`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer claims-bound-alpha-no-userdoc-token"
          },
          body: JSON.stringify({
            inviteId: "inv_cross_beta",
            user: { uid: "claims_only_alpha_001", email: "claims_only@tenant-alpha.com", name: "Claims Only User" }
          })
        });
        expect(acceptRes.status).toBe(403);
        expect((await acceptRes.json()).error).toBe("TENANT_CONFLICT_EXISTING_MEMBERSHIP");
        expect(mockFirestoreStore.get("invitations/inv_cross_beta").status).toBe("PENDING");
      } finally {
        server.close();
      }
    });

    it("D1.1-R-03: protects /api/cfo/analyze and /api/cfo/narrative with authenticateToken, removes /cfo/* aliases, and blocks identity/role/tenant spoofing", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        // 1. Unauthenticated access to /api/cfo/analyze and /api/cfo/narrative -> 401
        const unauthAnalyze = await fetch(`http://127.0.0.1:${port}/api/cfo/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        expect(unauthAnalyze.status).toBe(401);

        const unauthNarrative = await fetch(`http://127.0.0.1:${port}/api/cfo/narrative`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        expect(unauthNarrative.status).toBe(401);

        // 2. Unprefixed /cfo/analyze and /cfo/narrative are removed (404 in test mode since no SPA fallback is mounted)
        const unprefixedAnalyze = await fetch(`http://127.0.0.1:${port}/cfo/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        expect(unprefixedAnalyze.status).toBe(404);

        // 3. Spoofed userContext.userId -> 403 IDENTITY_SPOOFING_DETECTED
        const spoofUserRes = await fetch(`http://127.0.0.1:${port}/api/cfo/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-owner-token"
          },
          body: JSON.stringify({
            userContext: { userId: "victim_owner_999", businessId: "biz_tenant_alpha", role: "OWNER" },
            business: { id: "biz_tenant_alpha", name: "Alpha" }
          })
        });
        expect(spoofUserRes.status).toBe(403);
        expect((await spoofUserRes.json()).error).toBe("IDENTITY_SPOOFING_DETECTED");

        // 4. Cross-tenant business.id -> 403 FORBIDDEN_TENANT_ACCESS
        const crossTenantCfoRes = await fetch(`http://127.0.0.1:${port}/api/cfo/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-owner-token"
          },
          body: JSON.stringify({
            userContext: { userId: "owner_alpha_001", businessId: "biz_tenant_alpha" },
            business: { id: "biz_victim_beta", name: "Beta" }
          })
        });
        expect(crossTenantCfoRes.status).toBe(403);
        expect((await crossTenantCfoRes.json()).error).toBe("FORBIDDEN_TENANT_ACCESS");

        // 5. TELLER attempting to spoof userContext.role = "OWNER" is bound to req.user.role ("TELLER") and denied confidential company profit/payroll access
        const { AICFOPermissionEngine } = await import("../../../services/cfo/AICFOPermissionEngine");
        const evaluateSpy = vi.spyOn(AICFOPermissionEngine, "evaluate");

        const roleEscalationRes = await fetch(`http://127.0.0.1:${port}/api/cfo/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-user-token"
          },
          body: JSON.stringify({
            userQuestion: "Quel est le profit et la masse salariale de l'entreprise ?",
            userContext: { userId: "user_alpha_001", businessId: "biz_tenant_alpha", role: "OWNER" },
            business: { id: "biz_tenant_alpha", name: "Alpha" }
          })
        });
        expect(roleEscalationRes.status).toBe(200);
        const roleEscalationBody = await roleEscalationRes.json();
        expect(roleEscalationBody.metrics.cash_flow).toBe("[ACCÈS REFUSÉ]");
        expect(evaluateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "user_alpha_001",
            businessId: "biz_tenant_alpha",
            role: "TELLER"
          }),
          expect.any(String)
        );
      } finally {
        server.close();
      }
    });

    it("D1.1-R-04: executes Admin SDK operations for GET /api/payroll/receivables, prune-snapshots, ssot-cleanup, and validate-foreign-keys with strict tenant isolation", async () => {
      // Seed receivables (both camelCase businessId and snake_case business_id)
      mockFirestoreStore.set("employee_receivables/rec_alpha_camel", {
        id: "rec_alpha_camel",
        businessId: "biz_tenant_alpha",
        employeeId: "emp_alpha_1",
        status: "APPROVED_PENDING_RECOVERY"
      });
      mockFirestoreStore.set("employee_receivables/rec_alpha_snake", {
        id: "rec_alpha_snake",
        business_id: "biz_tenant_alpha",
        employeeId: "emp_alpha_2",
        status: "PENDING_HUMAN_APPROVAL"
      });
      mockFirestoreStore.set("employee_receivables/rec_beta_other", {
        id: "rec_beta_other",
        businessId: "biz_victim_beta",
        employeeId: "emp_beta_1",
        status: "APPROVED_PENDING_RECOVERY"
      });

      // Seed expired snapshots (root + subcollection + locked + other tenant)
      mockFirestoreStore.set("metric_snapshots/snap_alpha_expired", {
        businessId: "biz_tenant_alpha",
        timestamp: "2020-01-01T00:00:00.000Z",
        period: "DAILY"
      });
      mockFirestoreStore.set("businesses/biz_tenant_alpha/metric_snapshots/snap_sub_expired", {
        business_id: "biz_tenant_alpha",
        timestamp: "2020-01-01T00:00:00.000Z",
        period: "DAILY"
      });
      mockFirestoreStore.set("metric_snapshots/snap_alpha_annual", {
        businessId: "biz_tenant_alpha",
        timestamp: "2020-01-01T00:00:00.000Z",
        period: "ANNUAL"
      });
      mockFirestoreStore.set("metric_snapshots/snap_beta_expired", {
        businessId: "biz_victim_beta",
        timestamp: "2020-01-01T00:00:00.000Z",
        period: "DAILY"
      });

      // Seed SSOT cleanup targets (payroll_cycles redundant keys: totalRevenue, totalProfit)
      mockFirestoreStore.set("payroll_cycles/cyc_alpha_dirty", {
        businessId: "biz_tenant_alpha",
        totalRevenue: 9999,
        totalProfit: 8888
      });
      mockFirestoreStore.set("payroll_cycles/cyc_beta_dirty", {
        businessId: "biz_victim_beta",
        totalRevenue: 7777
      });

      // Seed foreign key targets (including root business doc for businessId foreign key validation)
      mockFirestoreStore.set("businesses/biz_tenant_alpha", {
        id: "biz_tenant_alpha",
        status: "ACTIVE"
      });
      mockFirestoreStore.set("employees/emp_alpha_valid", {
        id: "emp_alpha_valid",
        businessId: "biz_tenant_alpha",
        name: "Alpha Employee"
      });
      mockFirestoreStore.set("employees/emp_beta_foreign", {
        id: "emp_beta_foreign",
        businessId: "biz_victim_beta",
        name: "Beta Employee"
      });

      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        // 1. GET /api/payroll/receivables returns both camelCase and snake_case receivables for biz_tenant_alpha only
        const listRes = await fetch(`http://127.0.0.1:${port}/api/payroll/receivables`, {
          headers: { Authorization: "Bearer valid-alpha-owner-token" }
        });
        expect(listRes.status).toBe(200);
        const listBody = await listRes.json();
        const returnedIds = listBody.receivables.map((r: any) => r.id).sort();
        expect(returnedIds).toEqual(["rec_alpha_camel", "rec_alpha_snake"]);

        // 2. POST /api/maintenance/prune-snapshots deletes expired alpha snapshots (root + subcollection) and preserves ANNUAL & beta
        const pruneRes = await fetch(`http://127.0.0.1:${port}/api/maintenance/prune-snapshots`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-owner-token"
          },
          body: JSON.stringify({ retentionDays: 90 })
        });
        expect(pruneRes.status).toBe(200);
        const pruneBody = await pruneRes.json();
        expect(pruneBody.purgedCount).toBe(2);
        expect(mockFirestoreStore.has("metric_snapshots/snap_alpha_expired")).toBe(false);
        expect(mockFirestoreStore.has("businesses/biz_tenant_alpha/metric_snapshots/snap_sub_expired")).toBe(false);
        expect(mockFirestoreStore.has("metric_snapshots/snap_alpha_annual")).toBe(true);
        expect(mockFirestoreStore.has("metric_snapshots/snap_beta_expired")).toBe(true);

        // 3. POST /api/maintenance/ssot-cleanup strips redundant fields on alpha only
        const ssotRes = await fetch(`http://127.0.0.1:${port}/api/maintenance/ssot-cleanup`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-owner-token"
          },
          body: JSON.stringify({})
        });
        expect(ssotRes.status).toBe(200);
        const ssotBody = await ssotRes.json();
        expect(ssotBody.summary.payrollCyclesCleaned).toBe(1);
        expect(ssotBody.summary.totalFieldsRemoved).toBe(2);
        expect(mockFirestoreStore.get("payroll_cycles/cyc_alpha_dirty").totalRevenue).toBeUndefined();
        expect(mockFirestoreStore.get("payroll_cycles/cyc_alpha_dirty").totalProfit).toBeUndefined();
        expect(mockFirestoreStore.get("payroll_cycles/cyc_beta_dirty").totalRevenue).toBe(7777);

        // 4. POST /api/integrity/validate-foreign-keys:
        // 4a. Valid same-tenant reference -> 200
        const fkValidRes = await fetch(`http://127.0.0.1:${port}/api/integrity/validate-foreign-keys`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-owner-token"
          },
          body: JSON.stringify({
            entityType: "PAYROLL_RECORD",
            entityData: { id: "pr_1", businessId: "biz_tenant_alpha", employeeId: "emp_alpha_valid" }
          })
        });
        expect(fkValidRes.status).toBe(200);

        // 4b. Cross-tenant foreign key reference (emp_beta_foreign) -> 403 FORBIDDEN_TENANT_ACCESS
        const fkCrossTenantRes = await fetch(`http://127.0.0.1:${port}/api/integrity/validate-foreign-keys`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-owner-token"
          },
          body: JSON.stringify({
            entityType: "PAYROLL_RECORD",
            entityData: { id: "pr_2", businessId: "biz_tenant_alpha", employeeId: "emp_beta_foreign" }
          })
        });
        expect(fkCrossTenantRes.status).toBe(403);
        expect((await fkCrossTenantRes.json()).error).toBe("FORBIDDEN_TENANT_ACCESS");

        // 4c. Non-existent foreign key reference -> 400 FOREIGN_KEY_VIOLATION
        const fkMissingRes = await fetch(`http://127.0.0.1:${port}/api/integrity/validate-foreign-keys`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-owner-token"
          },
          body: JSON.stringify({
            entityType: "PAYROLL_RECORD",
            entityData: { id: "pr_3", businessId: "biz_tenant_alpha", employeeId: "emp_non_existent" }
          })
        });
        expect(fkMissingRes.status).toBe(400);
        expect((await fkMissingRes.json()).error).toBe("FOREIGN_KEY_VIOLATION");
      } finally {
        server.close();
      }
    });

    it("D1.1-R-05: enforces unified RBAC matrices (ADMIN approve, ACCOUNTANT repayment, TELLER rejected) and dual-field businessId/business_id consistency", async () => {
      const legacySnakeProposal = {
        id: "rec_legacy_snake",
        business_id: "biz_tenant_alpha",
        employeeId: "emp_009",
        employeeName: "Marie",
        originalPayrollCycleId: "cyc_009",
        originalPayrollRecordId: "rec_009",
        currency: "HTG" as const,
        approvedRecoverableAmount: 2000,
        approvedRecoverableCents: 200000,
        recoveredAmount: 0,
        recoveredCents: 0,
        outstandingAmount: 2000,
        outstandingCents: 200000,
        status: "PENDING_HUMAN_APPROVAL" as const,
        createdById: "manager_alpha_001",
        createdByName: "Manager Alpha",
        createdAt: new Date().toISOString(),
        repayments: [],
        receivableAccount: "1310_EMPLOYEE_RECEIVABLES",
        idempotencyKey: "idemp_rec_snake",
        updatedAt: new Date().toISOString()
      };

      mockFirestoreStore.set("employee_receivables/rec_legacy_snake", legacySnakeProposal);

      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        // 1. ADMIN role succeeds on POST /api/payroll/receivables/approve for legacy business_id receivable -> 200
        const adminApproveRes = await fetch(`http://127.0.0.1:${port}/api/payroll/receivables/approve`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-admin-token"
          },
          body: JSON.stringify({
            receivableId: "rec_legacy_snake",
            proposal: legacySnakeProposal
          })
        });
        expect(adminApproveRes.status).toBe(200);
        const approvedPayload = await adminApproveRes.json();
        expect(approvedPayload.approvedReceivable.status).toBe("APPROVED_PENDING_RECOVERY");
        expect(approvedPayload.approvedReceivable.approverRole).toBe("ADMIN");

        // 2. TELLER role is rejected on POST /api/payroll/receivables/repayment -> 403 FORBIDDEN_ROLE
        const tellerRepayRes = await fetch(`http://127.0.0.1:${port}/api/payroll/receivables/repayment`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-user-token"
          },
          body: JSON.stringify({
            receivableId: "rec_legacy_snake",
            amountCents: 50000,
            method: "CASH_REPAYMENT",
            reference: "REF-TELLER"
          })
        });
        expect(tellerRepayRes.status).toBe(403);
        expect((await tellerRepayRes.json()).error).toBe("FORBIDDEN_ROLE");

        // 3. ACCOUNTANT role succeeds on POST /api/payroll/receivables/repayment -> 200
        const accountantRepayRes = await fetch(`http://127.0.0.1:${port}/api/payroll/receivables/repayment`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-accountant-token"
          },
          body: JSON.stringify({
            receivableId: "rec_legacy_snake",
            amountCents: 50000,
            method: "CASH_REPAYMENT",
            reference: "REF-ACCOUNTANT"
          })
        });
        expect(accountantRepayRes.status).toBe(200);
        const repayBody = await accountantRepayRes.json();
        expect(repayBody.updatedReceivable.recoveredCents).toBe(50000);

        // 4. Contradictory { businessId: "biz_tenant_alpha", business_id: "biz_victim_beta" } -> 403 FORBIDDEN_TENANT_ACCESS
        const dualMismatchRes = await fetch(`http://127.0.0.1:${port}/api/integrity/validate-foreign-keys`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-owner-token"
          },
          body: JSON.stringify({
            businessId: "biz_tenant_alpha",
            business_id: "biz_victim_beta",
            entityType: "TRANSACTION",
            entityData: { id: "tx_dual" }
          })
        });
        expect(dualMismatchRes.status).toBe(403);
        expect((await dualMismatchRes.json()).error).toBe("FORBIDDEN_TENANT_ACCESS");
      } finally {
        server.close();
      }
    });

    it("D1.1-R-06: sanitizes error responses in serverApprovalRoutes and server.ts so raw err.message is never leaked", async () => {
      const { ServerApprovalGateway } = await import("../../../modules/workflow/approval/ServerApprovalGateway");
      const initiateSpy = vi
        .spyOn(ServerApprovalGateway.prototype, "initiatePayrollApproval")
        .mockRejectedValueOnce(new Error("INTERNAL_SECRET: Postgres password or Firestore path /keys/master_key leaked"));
      const decideSpy = vi
        .spyOn(ServerApprovalGateway.prototype, "submitStepDecision")
        .mockRejectedValueOnce(new Error("INTERNAL_SECRET: Decision DB trace /private/credentials leaked"));

      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/approvals/payroll/initiate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-owner-token"
          },
          body: JSON.stringify({
            businessId: "biz_tenant_alpha",
            cycleId: "cyc_001",
            period: "Oct 2026",
            totalAmount: 500000,
            currency: "HTG"
          })
        });

        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBe("INITIATION_FAILED");
        expect(body.message).toBe("Failed to initiate payroll approval.");
        expect(JSON.stringify(body)).not.toContain("INTERNAL_SECRET");
        expect(JSON.stringify(body)).not.toContain("master_key");
        expect(initiateSpy).toHaveBeenCalledOnce();

        const decideRes = await fetch(`http://127.0.0.1:${port}/api/approvals/inst_001/decide`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-alpha-owner-token"
          },
          body: JSON.stringify({
            businessId: "biz_tenant_alpha",
            action: "APPROVE",
            comment: "Approved"
          })
        });

        expect(decideRes.status).toBe(500);
        const decideBody = await decideRes.json();
        expect(decideBody.error).toBe("DECISION_FAILED");
        expect(JSON.stringify(decideBody)).not.toContain("INTERNAL_SECRET");
        expect(JSON.stringify(decideBody)).not.toContain("credentials");
        expect(decideSpy).toHaveBeenCalledOnce();
      } finally {
        server.close();
      }
    });
  });
});



