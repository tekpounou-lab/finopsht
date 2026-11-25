import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { AddressInfo } from "net";

const {
  mockFirestoreStore,
  mockClaimsSet,
  setCustomUserClaimsSpy,
  verifyIdTokenSpy,
  adminControl,
  mockClientSetDoc,
  mockClientUpdateDoc,
  mockClientGetDoc
} = vi.hoisted(() => ({
  mockFirestoreStore: new Map<string, any>(),
  mockClaimsSet: new Map<string, any>(),
  setCustomUserClaimsSpy: vi.fn(),
  verifyIdTokenSpy: vi.fn(),
  adminControl: {
    authInitError: null as Error | null,
    firestoreError: null as Error | null
  },
  mockClientSetDoc: vi.fn(),
  mockClientUpdateDoc: vi.fn(),
  mockClientGetDoc: vi.fn()
}));

vi.mock("../../../lib/firebase", () => ({
  db: { __mockDb: true },
  auth: {
    currentUser: null,
    signOut: vi.fn(async () => {})
  },
  serverTimestamp: () => ({ __serverTimestamp: true }),
  logFirestoreError: vi.fn(),
  handleFirestoreError: vi.fn((e: any) => e),
  OperationType: { GET: "get", WRITE: "write", LIST: "list" }
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: any, col: string, id: string) => ({ path: `${col}/${id}`, id, col })),
  getDoc: mockClientGetDoc,
  setDoc: mockClientSetDoc,
  updateDoc: mockClientUpdateDoc,
  collection: vi.fn((_db: any, col: string) => ({ path: col, col })),
  query: vi.fn((...args: any[]) => ({ args })),
  where: vi.fn((...args: any[]) => ({ args })),
  orderBy: vi.fn((...args: any[]) => ({ args })),
  limit: vi.fn((n: number) => ({ n })),
  onSnapshot: vi.fn(() => () => {}),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  writeBatch: vi.fn(),
  runTransaction: vi.fn()
}));

vi.mock("../../../lib/firebaseAdmin", () => {
  const normalizePath = (p: string) => p.replace(/^\/+|\/+$/g, "");

  const makeDocRef = (rawPath: string) => {
    const cleanPath = normalizePath(rawPath);
    const id = cleanPath.split("/").pop() || "";
    return {
      id,
      path: cleanPath,
      get: async () => {
        if (adminControl.firestoreError) throw adminControl.firestoreError;
        const data = mockFirestoreStore.get(cleanPath);
        return {
          exists: Boolean(data),
          id,
          data: () => data
        };
      },
      set: async (fields: any, opts?: any) => {
        if (adminControl.firestoreError) throw adminControl.firestoreError;
        if (opts?.merge) {
          const current = mockFirestoreStore.get(cleanPath) || {};
          mockFirestoreStore.set(cleanPath, { ...current, ...fields });
        } else {
          mockFirestoreStore.set(cleanPath, fields);
        }
      },
      update: async (fields: any) => {
        if (adminControl.firestoreError) throw adminControl.firestoreError;
        const current = mockFirestoreStore.get(cleanPath) || {};
        mockFirestoreStore.set(cleanPath, { ...current, ...fields });
      }
    };
  };

  return {
    getAdminApp: () => ({ name: "test-app" }),
    getAdminAuth: () => {
      if (adminControl.authInitError) {
        throw adminControl.authInitError;
      }
      return {
        verifyIdToken: verifyIdTokenSpy,
        setCustomUserClaims: async (uid: string, claims: any) => {
          setCustomUserClaimsSpy(uid, claims);
          mockClaimsSet.set(uid, claims);
        }
      };
    },
    getAdminFirestore: () => {
      if (adminControl.firestoreError) {
        throw adminControl.firestoreError;
      }
      return {
        doc: (pathStr: string) => makeDocRef(pathStr),
        collection: (colName: string) => ({
          where: (field: string, _op: string, val: any) => {
            const runQuery = async () => {
              const matches: any[] = [];
              mockFirestoreStore.forEach((v, k) => {
                if (k.startsWith(`${colName}/`) && v?.[field] === val) {
                  matches.push({ id: k.split("/").pop(), data: () => v });
                }
              });
              return { empty: matches.length === 0, docs: matches };
            };
            return {
              get: runQuery,
              limit: () => ({ get: runQuery })
            };
          },
          doc: (docId?: string) => {
            const resolvedId = docId || `auto_${Math.random().toString(36).slice(2, 9)}`;
            return makeDocRef(`${colName}/${resolvedId}`);
          }
        }),
        runTransaction: async (cb: any) => {
          const staged = new Map(mockFirestoreStore);
          const tx = {
            get: async (ref: any) => {
              const cleanPath = normalizePath(ref.path);
              const data = staged.get(cleanPath);
              return {
                exists: Boolean(data),
                id: cleanPath.split("/").pop(),
                data: () => data
              };
            },
            set: (ref: any, data: any, opts?: any) => {
              const cleanPath = normalizePath(ref.path);
              if (opts?.merge && staged.has(cleanPath)) {
                staged.set(cleanPath, { ...staged.get(cleanPath), ...data });
              } else {
                staged.set(cleanPath, data);
              }
            },
            update: (ref: any, data: any) => {
              const cleanPath = normalizePath(ref.path);
              const prev = staged.get(cleanPath) || {};
              staged.set(cleanPath, { ...prev, ...data });
            }
          };
          const res = await cb(tx);
          mockFirestoreStore.clear();
          staged.forEach((v, k) => mockFirestoreStore.set(k, v));
          return res;
        }
      };
    }
  };
});

import { createApp } from "../../../../server";
import { EnterpriseIdentityOrchestrator } from "../../../modules/identity/EnterpriseIdentityOrchestrator";
import { InvitationRepository } from "../../../repositories/InvitationRepository";
import { InvitationLifecycleService } from "../../../services/auth/InvitationLifecycleService";

const ROOT = process.cwd();

describe("FINOPS — INVITATION ACCEPTANCE P0 REMEDIATION SUITE (14 Scenarios)", () => {
  let server: any;
  let port: number;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFirestoreStore.clear();
    mockClaimsSet.clear();
    adminControl.authInitError = null;
    adminControl.firestoreError = null;

    verifyIdTokenSpy.mockImplementation(async (token: string) => {
      if (token === "token_alice") {
        return { uid: "user_alice", email: "alice@acme.com", email_verified: true };
      }
      if (token === "token_alice_unverified_email") {
        return { uid: "user_alice", email: "alice@acme.com", email_verified: false };
      }
      if (token === "token_bob") {
        return { uid: "user_bob", email: "bob@acme.com", email_verified: true };
      }
      if (token === "token_bound_beta") {
        return {
          uid: "user_alice",
          email: "alice@acme.com",
          email_verified: true,
          business_id: "biz_beta",
          role: "MANAGER"
        };
      }
      throw new Error("Invalid token");
    });

    mockFirestoreStore.set("businesses/biz_acme", {
      id: "biz_acme",
      name: "Acme FinOps S.A.",
      status: "ACTIVE"
    });

    mockFirestoreStore.set("employees/emp_prelinked_1", {
      id: "emp_prelinked_1",
      business_id: "biz_acme",
      businessId: "biz_acme",
      email: "alice@acme.com",
      name: "Alice Prelinked",
      role: "SENIOR_TELLER",
      operational_profile: "teller",
      operationalProfile: "teller",
      status: "INVITED",
      isActive: false
    });

    mockFirestoreStore.set("invitations/inv_valid_001", {
      id: "inv_valid_001",
      token: "tok_valid_001",
      business_id: "biz_acme",
      businessId: "biz_acme",
      employeeId: "emp_prelinked_1",
      email: "alice@acme.com",
      role: "SENIOR_TELLER",
      operational_profile: "teller",
      operationalProfile: "teller",
      status: "PENDING",
      senderName: "Owner Acme",
      expiresAt: new Date(Date.now() + 86400_000).toISOString()
    });

    mockFirestoreStore.set("invitations/inv_sent_002", {
      id: "inv_sent_002",
      business_id: "biz_acme",
      email: "alice@acme.com",
      role: "ACCOUNTANT",
      status: "SENT",
      expiresAt: new Date(Date.now() + 86400_000).toISOString()
    });

    mockFirestoreStore.set("invitations/inv_expired_001", {
      id: "inv_expired_001",
      business_id: "biz_acme",
      email: "alice@acme.com",
      role: "EMPLOYEE",
      status: "PENDING",
      expiresAt: new Date(Date.now() - 3600_000).toISOString()
    });

    mockFirestoreStore.set("invitations/inv_poisoned_sa", {
      id: "inv_poisoned_sa",
      business_id: "biz_acme",
      email: "alice@acme.com",
      role: "SUPER_ADMIN",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 86400_000).toISOString()
    });

    const app = await createApp();
    server = app.listen(0);
    port = (server.address() as AddressInfo).port;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (server) {
      server.close();
      server = null;
    }
  });

  it("1. Accepts valid invitation (including SENT status & pre-linked employee reuse) and returns businessName + membership context", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/invitations/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token_alice_unverified_email"
      },
      body: JSON.stringify({
        inviteId: "tok_valid_001",
        user: { uid: "user_alice", email: "alice@acme.com", name: "Alice" }
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      alreadyAccepted: false,
      inviteId: "inv_valid_001",
      businessId: "biz_acme",
      businessName: "Acme FinOps S.A.",
      role: "SENIOR_TELLER",
      membershipId: "biz_acme_user_alice",
      employeeId: "emp_prelinked_1"
    });

    // Reused pre-linked employee instead of creating a duplicate
    expect(mockFirestoreStore.get("employees/emp_prelinked_1").status).toBe("ACTIVE");
    expect(mockFirestoreStore.get("employees/emp_prelinked_1").uid).toBe("user_alice");
    expect(mockFirestoreStore.get("memberships/biz_acme_user_alice").status).toBe("ACTIVE");
    expect(mockFirestoreStore.get("users/user_alice").customClaimsSynced).toBe(true);
    expect(mockClaimsSet.get("user_alice")).toEqual({
      business_id: "biz_acme",
      businessId: "biz_acme",
      role: "SENIOR_TELLER"
    });

    // Also verifies SENT invitation status support
    const resSent = await fetch(`http://127.0.0.1:${port}/api/invitations/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token_alice"
      },
      body: JSON.stringify({
        inviteId: "inv_sent_002",
        user: { uid: "user_alice", email: "alice@acme.com", name: "Alice" }
      })
    });
    expect(resSent.status).toBe(200);
    const sentBody = await resSent.json();
    expect(sentBody.role).toBe("ACCOUNTANT");
  });

  it("2. Rejects expired invitation with 409 INVITATION_EXPIRED and zero mutations", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/invitations/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token_alice"
      },
      body: JSON.stringify({
        inviteId: "inv_expired_001",
        user: { uid: "user_alice", email: "alice@acme.com" }
      })
    });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("INVITATION_EXPIRED");
    expect(mockFirestoreStore.get("memberships/biz_acme_user_alice")).toBeUndefined();
  });

  it("3. Rejects invalid invitation token (404) and path traversal inviteId (400)", async () => {
    const missingRes = await fetch(`http://127.0.0.1:${port}/api/invitations/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token_alice"
      },
      body: JSON.stringify({ inviteId: "inv_does_not_exist" })
    });
    expect(missingRes.status).toBe(404);
    expect((await missingRes.json()).error).toBe("INVITATION_NOT_FOUND");

    const traversalRes = await fetch(`http://127.0.0.1:${port}/api/invitations/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token_alice"
      },
      body: JSON.stringify({ inviteId: "../users/victim" })
    });
    expect(traversalRes.status).toBe(400);
    expect((await traversalRes.json()).error).toBe("INVALID_INVITATION_ID");
  });

  it("4. Rejects wrong authenticated recipient with 403 INVITATION_RECIPIENT_MISMATCH", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/invitations/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token_bob"
      },
      body: JSON.stringify({ inviteId: "inv_valid_001" })
    });

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("INVITATION_RECIPIENT_MISMATCH");
    expect(mockFirestoreStore.get("invitations/inv_valid_001").status).toBe("PENDING");
  });

  it("5. Rejects cross-tenant invitation acceptance when user already belongs to another tenant", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/invitations/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token_bound_beta"
      },
      body: JSON.stringify({ inviteId: "inv_valid_001" })
    });

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("TENANT_CONFLICT_EXISTING_MEMBERSHIP");
  });

  it("6. Rejects unauthorized SUPER_ADMIN role assignment with 403 FORBIDDEN_ROLE_ASSIGNMENT", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/invitations/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token_alice"
      },
      body: JSON.stringify({ inviteId: "inv_poisoned_sa" })
    });

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("FORBIDDEN_ROLE_ASSIGNMENT");
  });

  it("7. Handles already-accepted invitation idempotently for same user and rejects different user", async () => {
    // First acceptance succeeds
    const first = await fetch(`http://127.0.0.1:${port}/api/invitations/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token_alice"
      },
      body: JSON.stringify({ inviteId: "inv_valid_001" })
    });
    expect(first.status).toBe(200);
    expect((await first.json()).alreadyAccepted).toBe(false);

    // Repeat acceptance by SAME user succeeds idempotently without creating duplicate employees
    const repeat = await fetch(`http://127.0.0.1:${port}/api/invitations/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token_alice"
      },
      body: JSON.stringify({ inviteId: "inv_valid_001" })
    });
    expect(repeat.status).toBe(200);
    const repeatBody = await repeat.json();
    expect(repeatBody.alreadyAccepted).toBe(true);
    expect(repeatBody.employeeId).toBe("emp_prelinked_1");

    // Different user trying to accept an already-consumed invitation is rejected
    mockFirestoreStore.set("invitations/inv_accepted_other", {
      id: "inv_accepted_other",
      business_id: "biz_acme",
      email: "alice@acme.com",
      role: "EMPLOYEE",
      operational_profile: "vendeur",
      operationalProfile: "vendeur",
      status: "ACCEPTED",
      acceptedByUid: "user_other_uid",
      expiresAt: new Date(Date.now() + 86400_000).toISOString()
    });
    const hijackRes = await fetch(`http://127.0.0.1:${port}/api/invitations/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token_alice"
      },
      body: JSON.stringify({ inviteId: "inv_accepted_other" })
    });
    expect(hijackRes.status).toBe(409);
    expect((await hijackRes.json()).error).toBe("INVITATION_NOT_PENDING");
  });

  it("8. Handles concurrent acceptance attempts safely with exactly one membership and one employee", async () => {
    const reqInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token_alice"
      },
      body: JSON.stringify({ inviteId: "inv_valid_001" })
    };

    const [r1, r2] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/api/invitations/accept`, reqInit),
      fetch(`http://127.0.0.1:${port}/api/invitations/accept`, reqInit)
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const employeeKeys = Array.from(mockFirestoreStore.keys()).filter((k) => k.startsWith("employees/"));
    const membershipKeys = Array.from(mockFirestoreStore.keys()).filter((k) => k.startsWith("memberships/"));
    expect(employeeKeys).toEqual(["employees/emp_prelinked_1"]);
    expect(membershipKeys).toEqual(["memberships/biz_acme_user_alice"]);
  });

  it("9. Maps Firebase Admin initialization failure to sanitized 503 without crashing or leaking secrets", async () => {
    adminControl.authInitError = new Error(
      "FIREBASE_ADMIN_INVALID_KEY_FORMAT: private_key invalid (do-not-leak-secret)"
    );

    const res = await fetch(`http://127.0.0.1:${port}/api/invitations/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token_alice"
      },
      body: JSON.stringify({ inviteId: "inv_valid_001" })
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("ADMIN_AUTH_UNAVAILABLE");
    expect(body.code).toBe("FIREBASE_ADMIN_INVALID_KEY_FORMAT");
    expect(JSON.stringify(body)).not.toContain("do-not-leak-secret");
  });

  it("10. Rejects on API 500 with zero client-side Firestore fallback writes and fails-closed on legacy client accept methods", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "INTERNAL_SERVER_ERROR", message: "Failed to accept invitation." })
      })
    );

    const fakeUser: any = {
      uid: "user_alice",
      email: "alice@acme.com",
      displayName: "Alice",
      getIdToken: vi.fn(async () => "tok_alice")
    };

    await expect(
      EnterpriseIdentityOrchestrator.acceptInvitation("inv_valid_001", fakeUser)
    ).rejects.toThrow(/Failed to accept invitation/);
    expect(mockClientSetDoc).not.toHaveBeenCalled();
    expect(mockClientUpdateDoc).not.toHaveBeenCalled();

    await expect(
      InvitationRepository.acceptInvitation("inv_valid_001", { uid: "u1", email: "alice@acme.com" })
    ).rejects.toThrow(/CLIENT_INVITATION_ACCEPTANCE_FORBIDDEN/);
    await expect(
      InvitationLifecycleService.acceptInvitation("inv_valid_001", "u1", { id: "u1", name: "A", role: "EMPLOYEE" })
    ).rejects.toThrow(/CLIENT_INVITATION_ACCEPTANCE_FORBIDDEN/);
  });

  it("11. Resolves business name safely via /api/invitations/lookup without direct client businesses Firestore reads", async () => {
    const acceptPageSrc = fs.readFileSync(path.join(ROOT, "src/pages/AcceptInvitation.tsx"), "utf-8");
    expect(acceptPageSrc).not.toContain('doc(db, "businesses"');
    expect(acceptPageSrc).not.toContain("Error fetching business name for accept invitation");
    expect(acceptPageSrc).toContain("/api/invitations/lookup");

    const waitingRoomSrc = fs.readFileSync(path.join(ROOT, "src/components/onboarding/WaitingRoom.tsx"), "utf-8");
    expect(waitingRoomSrc).toContain("InvitationRepository.getByTokenOrCode");

    const lookupOk = await fetch(`http://127.0.0.1:${port}/api/invitations/lookup?token=inv_valid_001`);
    expect(lookupOk.status).toBe(200);
    expect((await lookupOk.json()).invitation.businessName).toBe("Acme FinOps S.A.");

    // Lookup safely returns 503 when Admin Firestore is unavailable
    adminControl.firestoreError = Object.assign(new Error("Service unavailable"), { code: "unavailable" });
    const lookupUnavailable = await fetch(`http://127.0.0.1:${port}/api/invitations/lookup?token=inv_valid_001`);
    expect(lookupUnavailable.status).toBe(503);
    expect((await lookupUnavailable.json()).error).toBe("ADMIN_SERVICE_UNAVAILABLE");
  });

  it("12. Rejects missing or malformed 200 API responses (non-JSON or missing success: true)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ unexpected: true })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON");
        }
      });
    vi.stubGlobal("fetch", fetchMock);

    const fakeUser: any = {
      uid: "user_alice",
      email: "alice@acme.com",
      getIdToken: vi.fn(async () => "tok_alice")
    };

    await expect(
      EnterpriseIdentityOrchestrator.acceptInvitation("inv_valid_001", fakeUser)
    ).rejects.toThrow(/MALFORMED_API_RESPONSE/);

    await expect(
      EnterpriseIdentityOrchestrator.acceptInvitation("inv_valid_001", fakeUser)
    ).rejects.toThrow(/MALFORMED_API_RESPONSE/);
  });

  it("13. Handles network timeout (AbortError) cleanly without mutating Firestore", async () => {
    const abortErr = Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(abortErr));

    const fakeUser: any = {
      uid: "user_alice",
      email: "alice@acme.com",
      getIdToken: vi.fn(async () => "tok_alice")
    };

    await expect(
      EnterpriseIdentityOrchestrator.acceptInvitation("inv_valid_001", fakeUser)
    ).rejects.toThrow(/REQUEST_TIMEOUT/);
    expect(mockClientSetDoc).not.toHaveBeenCalled();
    expect(mockClientUpdateDoc).not.toHaveBeenCalled();
  });

  it("14. Recovers cleanly on safe retry after 502 CUSTOM_CLAIMS_SYNC_FAILED via idempotent acceptance", async () => {
    // 1st attempt: Custom Claims throws -> 502 CUSTOM_CLAIMS_SYNC_FAILED
    setCustomUserClaimsSpy.mockImplementationOnce(() => {
      throw new Error("AUTH_TRANSIENT_FAILURE");
    });

    const firstAttempt = await fetch(`http://127.0.0.1:${port}/api/invitations/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token_alice"
      },
      body: JSON.stringify({ inviteId: "inv_valid_001" })
    });
    expect(firstAttempt.status).toBe(502);
    expect((await firstAttempt.json()).error).toBe("CUSTOM_CLAIMS_SYNC_FAILED");
    expect(mockFirestoreStore.get("users/user_alice").customClaimsSynced).toBe(false);

    // 2nd attempt (safe user retry): succeeds idempotently & syncs claims without duplicate records
    const retryAttempt = await fetch(`http://127.0.0.1:${port}/api/invitations/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token_alice"
      },
      body: JSON.stringify({ inviteId: "inv_valid_001" })
    });
    expect(retryAttempt.status).toBe(200);
    const retryBody = await retryAttempt.json();
    expect(retryBody.success).toBe(true);
    expect(retryBody.alreadyAccepted).toBe(true);
    expect(mockFirestoreStore.get("users/user_alice").customClaimsSynced).toBe(true);
    expect(mockFirestoreStore.get("memberships/biz_acme_user_alice").customClaimsSynced).toBe(true);
  });
});
