import { describe, it, expect, beforeEach, vi } from "vitest";
import { InvitationService } from "../../../services/business/InvitationService";
import { createApp } from "../../../../server";
import { AddressInfo } from "net";

const {
  mockFirestoreStore,
  mockAuthUsers,
  mockClaimsSet,
  setCustomUserClaimsSpy
} = vi.hoisted(() => {
  return {
    mockFirestoreStore: new Map<string, any>(),
    mockAuthUsers: new Map<string, any>(),
    mockClaimsSet: new Map<string, any>(),
    setCustomUserClaimsSpy: vi.fn()
  };
});

vi.mock("../../../lib/firebaseAdmin", () => {
  return {
    getAdminApp: () => ({ name: "test-app" }),
    getAdminFirestore: () => ({
      doc: (pathStr: string) => {
        return {
          get: async () => {
            const data = mockFirestoreStore.get(pathStr);
            return {
              exists: Boolean(data),
              id: pathStr.split("/").pop(),
              data: () => data
            };
          },
          update: async (fields: any) => {
            const current = mockFirestoreStore.get(pathStr) || {};
            mockFirestoreStore.set(pathStr, { ...current, ...fields });
          },
          set: async (fields: any, opts?: any) => {
            if (opts?.merge) {
              const current = mockFirestoreStore.get(pathStr) || {};
              mockFirestoreStore.set(pathStr, { ...current, ...fields });
            } else {
              mockFirestoreStore.set(pathStr, fields);
            }
          }
        };
      },
      collection: (colName: string) => ({
        where: (field: string, op: string, val: any) => ({
          limit: (l: number) => ({
            get: async () => {
              const matches: any[] = [];
              mockFirestoreStore.forEach((v, k) => {
                if (k.startsWith(`${colName}/`) && v[field] === val) {
                  matches.push({ id: k.split("/").pop(), data: () => v });
                }
              });
              return {
                empty: matches.length === 0,
                docs: matches
              };
            }
          })
        }),
        doc: () => ({ set: async () => {} })
      }),
      runTransaction: async (cb: any) => {
        const transactionMock = {
          get: async (ref: any) => ref.get(),
          set: (ref: any, data: any, opts?: any) => ref.set(data, opts),
          update: (ref: any, data: any) => ref.update(data)
        };
        return cb(transactionMock);
      }
    }),
    getAdminAuth: () => ({
      setCustomUserClaims: async (uid: string, claims: any) => {
        setCustomUserClaimsSpy(uid, claims);
        if (claims.__fail) {
          throw new Error("AUTH_SDK_UNAVAILABLE");
        }
        mockClaimsSet.set(uid, claims);
      },
      getUser: async (uid: string) => mockAuthUsers.get(uid),
      verifyIdToken: async (token: string) => {
        if (token === "token_alice") {
          return { uid: "user_alice", email: "alice@company.com", email_verified: true, business_id: "biz_acme" };
        }
        if (token === "token_eve") {
          return { uid: "user_eve", email: "eve@attacker.com", email_verified: true };
        }
        throw new Error("Invalid token");
      }
    })
  };
});

describe("P0 Final Hardening — Invitation Lookup & Custom Claims Reconciliation", () => {
  let server: any;
  let port: number;

  beforeEach(async () => {
    mockFirestoreStore.clear();
    mockAuthUsers.clear();
    mockClaimsSet.clear();
    setCustomUserClaimsSpy.mockReset();

    // Seed test data
    mockFirestoreStore.set("businesses/biz_acme", {
      name: "Acme Corporation",
      ownerId: "user_owner"
    });

    mockFirestoreStore.set("invitations/inv_alice_valid", {
      id: "inv_alice_valid",
      businessId: "biz_acme",
      email: "alice@company.com",
      role: "SENIOR_TELLER",
      status: "PENDING",
      senderName: "Bob Manager",
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });

    mockFirestoreStore.set("invitations/inv_expired", {
      id: "inv_expired",
      businessId: "biz_acme",
      email: "alice@company.com",
      role: "EMPLOYEE",
      status: "PENDING",
      expiresAt: new Date(Date.now() - 3600000).toISOString()
    });

    mockFirestoreStore.set("invitations/inv_used", {
      id: "inv_used",
      businessId: "biz_acme",
      email: "alice@company.com",
      role: "EMPLOYEE",
      status: "ACCEPTED",
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
  });

  describe("Objective 1: Pre-Auth Public Invitation Lookup API", () => {
    it("returns sanitized public metadata for a valid token without requiring authentication headers", async () => {
      const app = await createApp();
      server = app.listen(0);
      port = (server.address() as AddressInfo).port;

      const res = await fetch(`http://127.0.0.1:${port}/api/invitations/lookup?token=inv_alice_valid`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.invitation).toEqual({
        id: "inv_alice_valid",
        businessId: "biz_acme",
        businessName: "Acme Corporation",
        role: "SENIOR_TELLER",
        senderName: "Bob Manager",
        status: "PENDING",
        expiresAt: expect.any(String),
        isExpired: false
      });
      // Ensure recipient email is not present in public metadata
      expect(body.invitation.email).toBeUndefined();

      server.close();
    });

    it("returns 404 for non-existent invitation token", async () => {
      const app = await createApp();
      server = app.listen(0);
      port = (server.address() as AddressInfo).port;

      const res = await fetch(`http://127.0.0.1:${port}/api/invitations/lookup?token=inv_non_existent`);
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBe("INVITATION_NOT_FOUND");

      server.close();
    });

    it("returns 410 for expired invitation token", async () => {
      const app = await createApp();
      server = app.listen(0);
      port = (server.address() as AddressInfo).port;

      const res = await fetch(`http://127.0.0.1:${port}/api/invitations/lookup?token=inv_expired`);
      expect(res.status).toBe(410);

      const body = await res.json();
      expect(body.error).toBe("INVITATION_EXPIRED");
      expect(body.invitation.isExpired).toBe(true);

      server.close();
    });

    it("returns 409 for already consumed invitation token", async () => {
      const app = await createApp();
      server = app.listen(0);
      port = (server.address() as AddressInfo).port;

      const res = await fetch(`http://127.0.0.1:${port}/api/invitations/lookup?token=inv_used`);
      expect(res.status).toBe(409);

      const body = await res.json();
      expect(body.error).toBe("INVITATION_ALREADY_CONSUMED");

      server.close();
    });
  });

  describe("Objective 2: Custom Claims Sync & Reconciliation", () => {
    it("handles Auth SDK failure by recording customClaimsSynced: false and throwing CUSTOM_CLAIMS_SYNC_FAILED", async () => {
      const app = await createApp();
      server = app.listen(0);
      port = (server.address() as AddressInfo).port;

      // Force setCustomUserClaims failure via __fail parameter
      mockFirestoreStore.set("invitations/inv_fail_claims", {
        id: "inv_fail_claims",
        businessId: "biz_acme",
        email: "alice@company.com",
        role: "EMPLOYEE",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86400000).toISOString()
      });

      // Cause setCustomUserClaims to fail
      setCustomUserClaimsSpy.mockImplementationOnce(() => {
        throw new Error("AUTH_SERVICE_DOWN");
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/invitations/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer token_alice"
        },
        body: JSON.stringify({
          inviteId: "inv_fail_claims",
          user: { uid: "user_alice", email: "alice@company.com" }
        })
      });

      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toBe("CUSTOM_CLAIMS_SYNC_FAILED");

      // Verify user profile and membership were written with customClaimsSynced: false
      const aliceProfile = mockFirestoreStore.get("users/user_alice");
      expect(aliceProfile).toBeDefined();
      expect(aliceProfile.customClaimsSynced).toBe(false);
      expect(aliceProfile.customClaimsError).toBe("AUTH_SERVICE_DOWN");

      server.close();
    });

    it("reconciles Custom Claims via POST /api/invitations/reconcile-claims idempotently", async () => {
      const app = await createApp();
      server = app.listen(0);
      port = (server.address() as AddressInfo).port;

      // Seed un-synced user profile and membership
      mockFirestoreStore.set("users/user_alice", {
        id: "user_alice",
        business_id: "biz_acme",
        businessId: "biz_acme",
        role: "SENIOR_TELLER",
        customClaimsSynced: false
      });

      mockFirestoreStore.set("memberships/biz_acme_user_alice", {
        id: "biz_acme_user_alice",
        uid: "user_alice",
        business_id: "biz_acme",
        businessId: "biz_acme",
        role: "SENIOR_TELLER",
        customClaimsSynced: false
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/invitations/reconcile-claims`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer token_alice"
        },
        body: JSON.stringify({})
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.businessId).toBe("biz_acme");
      expect(body.role).toBe("SENIOR_TELLER");

      // Verify custom claims were updated in mockClaimsSet
      expect(mockClaimsSet.get("user_alice")).toEqual({
        business_id: "biz_acme",
        businessId: "biz_acme",
        role: "SENIOR_TELLER"
      });

      // Verify Firestore state updated to customClaimsSynced: true
      expect(mockFirestoreStore.get("users/user_alice").customClaimsSynced).toBe(true);
      expect(mockFirestoreStore.get("memberships/biz_acme_user_alice").customClaimsSynced).toBe(true);

      server.close();
    });

    it("blocks an attacker from reconciling claims for another user ID", async () => {
      const app = await createApp();
      server = app.listen(0);
      port = (server.address() as AddressInfo).port;

      const res = await fetch(`http://127.0.0.1:${port}/api/invitations/reconcile-claims`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer token_eve"
        },
        body: JSON.stringify({ targetUid: "user_alice" })
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("IDENTITY_SPOOFING_DETECTED");

      server.close();
    });
  });

  describe("Objective 3: Strict RBAC Rules Verification for Invitations", () => {
    it("verifies firestore.rules completely removed direct recipient update branch on invitations", () => {
      const fs = require("fs");
      const path = require("path");
      const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");
      
      const invBlockMatch = rules.match(/match \/invitations\/\{inviteId\} \{([\s\S]*?)\}/);
      expect(invBlockMatch).not.toBeNull();
      const invBlock = invBlockMatch![1];

      // Must not allow recipient diff affectedKeys update
      expect(invBlock).not.toContain("affectedKeys().hasOnly(['status', 'uid'");
      // Must enforce administrative update only
      expect(invBlock).toContain("isTenantAdminOrManager(getBusinessId(resource.data))");
    });

    it("verifies firestore.rules completely removed isTenantScoped create permission on invitations", () => {
      const fs = require("fs");
      const path = require("path");
      const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");
      
      const invBlockMatch = rules.match(/match \/invitations\/\{inviteId\} \{([\s\S]*?)\}/);
      expect(invBlockMatch).not.toBeNull();
      const invBlock = invBlockMatch![1];

      // Must not allow isTenantScoped create
      expect(invBlock).not.toContain("isTenantScoped(getBusinessId(request.resource.data))");
      // Must restrict creation strictly to SuperAdmin and Tenant Admin/Manager
      expect(invBlock).toContain("isTenantAdminOrManager(getBusinessId(request.resource.data))");
    });
  });
});
