/**
 * FINOPS ERP / FINAYITI FUSION
 * PHASE D3 — TRANSACTIONAL TILL CLOSURE, PENDING TRANSFER BLOCKADE & VARIANCE ACCOUNTING TEST SUITE
 *
 * Mounted on both the real `await createApp()` from `server.ts` (HTTP + Firebase Admin SDK transaction path)
 * and `TillSessionEngine` direct domain calls.
 *
 * Covers all 16 mandatory scenarios from Phase D3 Specification (Section 8 - D3-E):
 *  1. Non-existent session -> 404 / SESSION_NOT_FOUND
 *  2. Session belonging to another tenant -> 403 / TENANT_ISOLATION_VIOLATION
 *  3. Unauthorized actor (unauthenticated, revoked token, AUDITOR role, unrelated teller) -> 401 / 403
 *  4. Already closed session -> 409 / SESSION_ALREADY_CLOSED
 *  5. Relevant transfer still pending (PENDING_APPROVAL / PENDING) -> 409 / PENDING_TRANSFERS_BLOCKADE
 *  6. Transfer currently processing / in progress (PROCESSING / IN_PROGRESS / IN_TRANSIT / APPROVED) -> 409 / PENDING_TRANSFERS_BLOCKADE
 *  7. Two simultaneous closure attempts (Promise.all) -> 1 succeeds, 1 rejected, single GL variance entry
 *  8. Retry after success -> rejected 409, zero duplicate GL variance entry
 *  9. Failure of a mandatory write -> error propagated, sanitized 500 on HTTP, full atomic rollback
 * 10. Failure of the accounting (GL) engine -> error propagated, session remains ACTIVE, till remains OPEN
 * 11. Inconsistent denomination amounts -> 400 / DENOMINATION_TOTAL_MISMATCH
 * 12. Negative, malformed, float, NaN, or out-of-bounds amount -> 400 / INVALID_CLOSING_AMOUNT
 * 13. HTG / USD confusion (currency mismatch, wrong denomination for currency, 1010 vs 1020) -> 400
 * 14. Reopening of a closed session (Maker-Checker, RBAC, reason, immutable historical GL entry)
 * 15. Repetition of a reopening or counter-entry -> 409 / SESSION_ALREADY_REOPENED, zero duplicate sessions or GL entries
 * 16. Mid-process failure with byte-for-byte verification of final state (state_before === state_after)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import { Server } from "http";
import { AddressInfo } from "net";
import { createApp } from "../../../../server";
import { TillSessionEngine, CANONICAL_HTG_DENOMINATIONS, CANONICAL_USD_DENOMINATIONS } from "../../../domains/cash/services/TillSessionEngine";
import { HTG_DENOMINATIONS, USD_DENOMINATIONS } from "../../../components/cash/TillSessionModal";
import { CashManagementRepository } from "../../../repositories/CashManagementRepository";
import { LedgerRepository } from "../../../repositories/LedgerRepository";
import { CashTill, TillSession, InternalTransfer } from "../../../types/cashManagement";

const {
  mockUserDocs,
  mockFirestoreStore,
  verifyIdTokenSpy,
  simulateAdminTxCommitFailure,
  simulateAdminTxGetFailure,
  simulateAdminTxSetFailureOnPathPrefix,
  simulateClientSetDocFailureOnCollection
} = vi.hoisted(() => {
  return {
    mockUserDocs: new Map<string, any>(),
    mockFirestoreStore: new Map<string, any>(),
    verifyIdTokenSpy: vi.fn(),
    simulateAdminTxCommitFailure: { value: false },
    simulateAdminTxGetFailure: { value: false },
    simulateAdminTxSetFailureOnPathPrefix: { value: null as string | null },
    simulateClientSetDocFailureOnCollection: { value: null as string | null }
  };
});

// Mock client firebase
vi.mock("../../../lib/firebase", () => ({
  db: { type: "mock-client-firestore" },
  auth: {
    currentUser: {
      uid: "uid_teller_alpha",
      getIdToken: vi.fn(async () => "token-teller-alpha")
    }
  }
}));

// Mock client firebase/firestore backed by the shared mockFirestoreStore
vi.mock("firebase/firestore", () => {
  const normalizePath = (segments: string[]) =>
    segments
      .map((s) => String(s).replace(/^\/+|\/+$/g, ""))
      .filter(Boolean)
      .join("/");

  return {
    getFirestore: vi.fn(() => ({})),
    initializeFirestore: vi.fn(() => ({})),
    memoryLocalCache: vi.fn(() => ({})),
    persistentLocalCache: vi.fn(() => ({})),
    persistentMultipleTabManager: vi.fn(() => ({})),
    serverTimestamp: vi.fn(() => ({ seconds: Date.now() / 1000 })),
    collection: vi.fn((_db: any, ...segments: string[]) => ({
      path: normalizePath(segments)
    })),
    doc: vi.fn((_db: any, ...segments: string[]) => {
      const path = normalizePath(segments);
      const parts = path.split("/");
      return { id: parts[parts.length - 1], path };
    }),
    getDoc: vi.fn(async (docRef: any) => {
      const data = mockFirestoreStore.get(docRef.path);
      return {
        exists: () => data !== undefined,
        data: () => (data !== undefined ? structuredClone(data) : undefined),
        id: docRef.id
      };
    }),
    setDoc: vi.fn(async (docRef: any, data: any, options?: any) => {
      const coll = docRef.path.split("/")[0];
      if (simulateClientSetDocFailureOnCollection.value === coll) {
        throw new Error(`SIMULATED_SETDOC_FAILURE_ON_${coll}`);
      }
      if (options?.merge && mockFirestoreStore.has(docRef.path)) {
        mockFirestoreStore.set(docRef.path, {
          ...structuredClone(mockFirestoreStore.get(docRef.path)),
          ...structuredClone(data)
        });
      } else {
        mockFirestoreStore.set(docRef.path, structuredClone(data));
      }
    }),
    updateDoc: vi.fn(async (docRef: any, data: any) => {
      const existing = mockFirestoreStore.get(docRef.path) || {};
      mockFirestoreStore.set(docRef.path, { ...structuredClone(existing), ...structuredClone(data) });
    }),
    deleteDoc: vi.fn(async (docRef: any) => {
      mockFirestoreStore.delete(docRef.path);
    }),
    query: vi.fn((collRef: any, ...constraints: any[]) => ({
      path: collRef.path,
      constraints: constraints || []
    })),
    where: vi.fn((field: string, op: string, value: any) => ({
      type: "where",
      field,
      op,
      value
    })),
    orderBy: vi.fn((field: string, dir: string) => ({ type: "orderBy", field, dir })),
    limit: vi.fn((n: number) => ({ type: "limit", n })),
    getDocs: vi.fn(async (queryRef: any) => {
      const prefix = `${queryRef.path}/`;
      let results: any[] = [];
      for (const [key, val] of mockFirestoreStore.entries()) {
        if (key.startsWith(prefix)) {
          results.push({
            id: key.split("/").pop()!,
            data: () => structuredClone(val)
          });
        }
      }
      if (queryRef.constraints) {
        for (const c of queryRef.constraints) {
          if (c.type === "where") {
            results = results.filter((d) => {
              const row = d.data();
              if (c.op === "==") return row[c.field] === c.value;
              if (c.op === "<=") return row[c.field] <= c.value;
              if (c.op === ">=") return row[c.field] >= c.value;
              return true;
            });
          }
        }
      }
      return {
        empty: results.length === 0,
        docs: results,
        forEach: (cb: any) => results.forEach(cb)
      };
    }),
    runTransaction: vi.fn(async (_db: any, updateFn: any) => {
      const stagedClientStore = new Map<string, any>();
      for (const [k, v] of mockFirestoreStore.entries()) {
        stagedClientStore.set(k, structuredClone(v));
      }
      const res = await updateFn({
        get: vi.fn(async (docRef: any) => {
          const data = stagedClientStore.get(docRef.path);
          return {
            exists: () => data !== undefined,
            data: () => (data !== undefined ? structuredClone(data) : undefined),
            id: docRef.id
          };
        }),
        set: vi.fn((docRef: any, data: any, options?: any) => {
          const coll = docRef.path.split("/")[0];
          if (simulateClientSetDocFailureOnCollection.value === coll) {
            throw new Error(`SIMULATED_TX_SET_FAILURE_ON_${coll}`);
          }
          if (options?.merge && stagedClientStore.has(docRef.path)) {
            stagedClientStore.set(docRef.path, {
              ...structuredClone(stagedClientStore.get(docRef.path)),
              ...structuredClone(data)
            });
          } else {
            stagedClientStore.set(docRef.path, structuredClone(data));
          }
        }),
        update: vi.fn((docRef: any, data: any) => {
          const existing = stagedClientStore.get(docRef.path) || {};
          stagedClientStore.set(docRef.path, {
            ...structuredClone(existing),
            ...structuredClone(data)
          });
        })
      });
      mockFirestoreStore.clear();
      stagedClientStore.forEach((v, k) => mockFirestoreStore.set(k, v));
      return res;
    })
  };
});

// Mock Firebase Admin SDK with atomic transactional staging over the same mockFirestoreStore
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
            data: () => structuredClone(mockUserDocs.get(docId))
          };
        }
        if (mockFirestoreStore.has(docPath)) {
          return {
            exists: true,
            id: docId,
            ref: getDocHelper(docPath),
            data: () => structuredClone(mockFirestoreStore.get(docPath))
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
          mockUserDocs.set(docId, { ...prev, ...structuredClone(data) });
          return;
        }
        if (options?.merge && mockFirestoreStore.has(docPath)) {
          mockFirestoreStore.set(docPath, {
            ...structuredClone(mockFirestoreStore.get(docPath)),
            ...structuredClone(data)
          });
        } else {
          mockFirestoreStore.set(docPath, structuredClone(data));
        }
      },
      update: async (data: any) => {
        const prev = mockFirestoreStore.get(docPath) || {};
        mockFirestoreStore.set(docPath, { ...structuredClone(prev), ...structuredClone(data) });
      },
      delete: async () => {
        mockFirestoreStore.delete(docPath);
      }
    };
  };

  const getCollectionDocs = (collPath: string, sourceMap = mockFirestoreStore) => {
    const prefix = `${normalizePath(collPath)}/`;
    const targetDepth = normalizePath(collPath).split("/").length + 1;
    const docs: any[] = [];
    for (const [key, val] of sourceMap.entries()) {
      if (key.startsWith(prefix) && key.split("/").length === targetDepth) {
        const docId = key.split("/").pop()!;
        docs.push({
          id: docId,
          exists: true,
          ref: getDocHelper(key),
          data: () => structuredClone(val)
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
          _isQuery: true,
          collName,
          field,
          op,
          value,
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

        const txContext = {
          get: async (refOrQuery: any) => {
            if (simulateAdminTxGetFailure.value) {
              throw new Error("FIRESTORE_ADMIN_TX_READ_FAILED: /private/shard_01/read_abort");
            }
            if (refOrQuery && (refOrQuery._isQuery || (typeof refOrQuery.get === "function" && !refOrQuery.path))) {
              const all = getCollectionDocs(refOrQuery.collName, stagedStore);
              const filtered = all.filter((d) => {
                const data = d.data() || {};
                if (refOrQuery.op === "==") return data[refOrQuery.field] === refOrQuery.value;
                return false;
              });
              return { docs: filtered };
            }
            const cleanPath = normalizePath(refOrQuery.path);
            const segments = cleanPath.split("/");
            const docId = segments[segments.length - 1];
            const isUsersRoot = segments.length === 2 && segments[0] === "users";
            if (stagedStore.has(cleanPath)) {
              return {
                exists: true,
                id: docId,
                data: () => structuredClone(stagedStore.get(cleanPath))
              };
            }
            if (isUsersRoot && mockUserDocs.has(docId)) {
              return {
                exists: true,
                id: docId,
                data: () => structuredClone(mockUserDocs.get(docId))
              };
            }
            return { exists: false, id: docId, data: () => null };
          },
          set: (ref: any, data: any, options?: any) => {
            const cleanPath = normalizePath(ref.path);
            if (
              simulateAdminTxSetFailureOnPathPrefix.value &&
              cleanPath.startsWith(simulateAdminTxSetFailureOnPathPrefix.value)
            ) {
              throw new Error(`FIRESTORE_ADMIN_TX_SET_FAILED_ON_${cleanPath}`);
            }
            const prev = options?.merge && stagedStore.has(cleanPath) ? stagedStore.get(cleanPath) : {};
            stagedStore.set(cleanPath, { ...prev, ...structuredClone(data) });
          },
          update: (ref: any, data: any) => {
            const cleanPath = normalizePath(ref.path);
            const prev = stagedStore.get(cleanPath) || {};
            stagedStore.set(cleanPath, { ...prev, ...structuredClone(data) });
          }
        };

        const result = await updateFn(txContext);

        if (simulateAdminTxCommitFailure.value) {
          throw new Error("FIRESTORE_ADMIN_TX_COMMIT_FAILED: /private/shard_04/wal_abort");
        }

        mockFirestoreStore.clear();
        stagedStore.forEach((v, k) => mockFirestoreStore.set(k, v));
        return result;
      }
    })
  };
});

function captureFullStoreSnapshot() {
  return JSON.stringify(
    Array.from(mockFirestoreStore.entries())
      .filter(([k]) => !k.startsWith("forensic_logs/"))
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

function getForensicLogsFromStore() {
  return Array.from(mockFirestoreStore.entries())
    .filter(([k]) => k.startsWith("forensic_logs/"))
    .map(([, v]) => v);
}

describe("PHASE D3 — TRANSACTIONAL TILL CLOSURE, PENDING TRANSFERS & VARIANCE INTEGRITY SUITE", () => {
  let app: express.Express;
  let server: Server;
  let baseUrl: string;

  const TENANT_ALPHA = "biz_alpha_001";
  const TENANT_BETA = "biz_beta_002";
  const BRANCH_MAIN = "MAIN_BRANCH";

  const TELLER_ALPHA = {
    uid: "uid_teller_alpha",
    email: "teller@alpha.ht",
    role: "TELLER",
    business_id: TENANT_ALPHA
  };

  const MANAGER_ALPHA = {
    uid: "uid_manager_alpha",
    email: "manager@alpha.ht",
    role: "MANAGER",
    business_id: TENANT_ALPHA
  };

  const AUDITOR_ALPHA = {
    uid: "uid_auditor_alpha",
    email: "auditor@alpha.ht",
    role: "AUDITOR",
    business_id: TENANT_ALPHA
  };

  const OTHER_TELLER_ALPHA = {
    uid: "uid_other_teller_alpha",
    email: "other.teller@alpha.ht",
    role: "TELLER",
    business_id: TENANT_ALPHA
  };

  const OWNER_BETA = {
    uid: "uid_owner_beta",
    email: "owner@beta.ht",
    role: "OWNER",
    business_id: TENANT_BETA
  };

  const tokenMap: Record<string, any> = {
    "token-teller-alpha": TELLER_ALPHA,
    "token-manager-alpha": MANAGER_ALPHA,
    "token-auditor-alpha": AUDITOR_ALPHA,
    "token-other-teller-alpha": OTHER_TELLER_ALPHA,
    "token-owner-beta": OWNER_BETA
  };

  function seedActiveHtgTillAndSession(overrides?: {
    tillId?: string;
    sessionId?: string;
    businessId?: string;
    openingCents?: number;
    balanceCents?: number;
    tellerId?: string;
  }) {
    const tillId = overrides?.tillId || "till_htg_alpha_01";
    const sessionId = overrides?.sessionId || "sess_htg_alpha_01";
    const businessId = overrides?.businessId || TENANT_ALPHA;
    const openingCents = overrides?.openingCents ?? 1_000_000; // 10,000.00 HTG
    const balanceCents = overrides?.balanceCents ?? openingCents;
    const tellerId = overrides?.tellerId || TELLER_ALPHA.uid;

    const till: CashTill = {
      id: tillId,
      business_id: businessId,
      branch_id: BRANCH_MAIN,
      name: "Caisse Principale HTG",
      code: "TILL-HTG-01",
      type: "TILL",
      currency: "HTG",
      balance_cents: balanceCents,
      linked_account_code: "1010",
      linked_account_name: "Caisse Centrale HTG",
      assigned_teller_id: tellerId,
      assigned_teller_name: "Jean Teller Alpha",
      active_session_id: sessionId,
      status: "OPEN",
      created_at: "2026-10-29T08:00:00.000Z",
      updated_at: "2026-10-29T08:00:00.000Z"
    };

    const session: TillSession = {
      id: sessionId,
      business_id: businessId,
      branch_id: BRANCH_MAIN,
      till_id: tillId,
      till_name: till.name,
      teller_id: tellerId,
      teller_name: "Jean Teller Alpha",
      currency: "HTG",
      business_date: "2026-10-29",
      opened_at: "2026-10-29T08:00:00.000Z",
      opening_balance_cents: openingCents,
      total_inflows_cents: 0,
      total_outflows_cents: 0,
      expected_closing_cents: openingCents,
      status: "ACTIVE"
    };

    mockFirestoreStore.set(`cash_tills/${tillId}`, till);
    mockFirestoreStore.set(`till_sessions/${sessionId}`, session);

    return { till, session };
  }

  beforeEach(async () => {
    mockUserDocs.clear();
    mockFirestoreStore.clear();
    verifyIdTokenSpy.mockReset();
    simulateAdminTxCommitFailure.value = false;
    simulateAdminTxGetFailure.value = false;
    simulateAdminTxSetFailureOnPathPrefix.value = null;
    simulateClientSetDocFailureOnCollection.value = null;

    for (const u of Object.values(tokenMap)) {
      const opProf = u.role === "TELLER" ? "teller" : undefined;
      mockUserDocs.set(u.uid, {
        uid: u.uid,
        email: u.email,
        role: u.role,
        operational_profile: opProf,
        operationalProfile: opProf,
        status: "ACTIVE",
        is_active: true,
        business_id: u.business_id,
        businessId: u.business_id
      });
      mockFirestoreStore.set(`employees/${u.uid}`, {
        id: u.uid,
        uid: u.uid,
        email: u.email,
        role: u.role,
        operational_profile: opProf,
        operationalProfile: opProf,
        status: "ACTIVE",
        is_active: true,
        business_id: u.business_id,
        businessId: u.business_id
      });
    }

    verifyIdTokenSpy.mockImplementation(async (token: string, checkRevoked?: boolean) => {
      if (checkRevoked !== true) {
        throw new Error("SECURITY_DEFECT: verifyIdToken must be called with checkRevoked = true");
      }
      if (token === "revoked-token") {
        const err: any = new Error("Firebase ID token has been revoked.");
        err.code = "auth/id-token-revoked";
        throw err;
      }
      const mapped = tokenMap[token];
      if (!mapped) {
        throw new Error("Invalid token");
      }
      return mapped;
    });

    app = await createApp();
    server = app.listen(0);
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // =========================================================================
  // SCENARIO 1: Non-existent session
  // =========================================================================
  it("Scenario 1: Rejects closure of a non-existent session with 404 SESSION_NOT_FOUND and zero state mutation", async () => {
    seedActiveHtgTillAndSession();
    const beforeSnapshot = captureFullStoreSnapshot();

    const res = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-teller-alpha"
      },
      body: JSON.stringify({
        sessionId: "sess_does_not_exist_999",
        actualClosingCents: 1_000_000,
        denominationBreakdown: { "1000": 10 }
      })
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("SESSION_NOT_FOUND");
    expect(captureFullStoreSnapshot()).toBe(beforeSnapshot);
  });

  // =========================================================================
  // SCENARIO 2: Session belonging to another tenant
  // =========================================================================
  it("Scenario 2: Rejects cross-tenant session closure attempt (Tenant B attacking Tenant A session) with 403", async () => {
    const { session } = seedActiveHtgTillAndSession({
      businessId: TENANT_ALPHA
    });
    const beforeSnapshot = captureFullStoreSnapshot();

    // Attack 1: Tenant Beta owner attempting to close Tenant Alpha's session under Tenant Beta context
    const res1 = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-owner-beta"
      },
      body: JSON.stringify({
        sessionId: session.id,
        actualClosingCents: 500_000,
        denominationBreakdown: { "1000": 5 },
        notes: "Cross-tenant sabotage attempt"
      })
    });

    expect(res1.status).toBe(403);
    const body1 = await res1.json();
    expect(body1.error).toBe("TENANT_ISOLATION_VIOLATION");

    // Attack 2: Tenant Beta passing explicit Tenant Alpha businessId in body/header
    const res2 = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-owner-beta",
        "x-business-id": TENANT_ALPHA
      },
      body: JSON.stringify({
        businessId: TENANT_ALPHA,
        sessionId: session.id,
        actualClosingCents: 500_000,
        denominationBreakdown: { "1000": 5 },
        notes: "Spoofed tenant header"
      })
    });

    expect(res2.status).toBe(403);

    // Direct engine call with mismatched businessId must also throw TENANT_ISOLATION_VIOLATION
    await expect(
      TillSessionEngine.closeSession({
        sessionId: session.id,
        businessId: TENANT_BETA,
        actualClosingCents: 1_000_000,
        denominationBreakdown: { "1000": 10 },
        operatorId: OWNER_BETA.uid,
        operatorName: "Beta Owner",
        operatorRole: "OWNER"
      })
    ).rejects.toThrow(/Accès inter-tenant refusé/i);

    expect(captureFullStoreSnapshot()).toBe(beforeSnapshot);
  });

  // =========================================================================
  // SCENARIO 3: Unauthorized actor
  // =========================================================================
  it("Scenario 3: Rejects unauthenticated, revoked token, AUDITOR role, and non-owner teller without supervisor role", async () => {
    const { session } = seedActiveHtgTillAndSession();
    const beforeSnapshot = captureFullStoreSnapshot();

    // 3a. Unauthenticated
    const resUnauth = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, actualClosingCents: 1_000_000, denominationBreakdown: { "1000": 10 } })
    });
    expect(resUnauth.status).toBe(401);

    // 3b. Revoked token
    const resRevoked = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer revoked-token"
      },
      body: JSON.stringify({ sessionId: session.id, actualClosingCents: 1_000_000, denominationBreakdown: { "1000": 10 } })
    });
    expect(resRevoked.status).toBe(401);

    // 3c. AUDITOR role (read-only) attempting to close session
    const resAuditor = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-auditor-alpha"
      },
      body: JSON.stringify({ sessionId: session.id, actualClosingCents: 1_000_000, denominationBreakdown: { "1000": 10 } })
    });
    expect(resAuditor.status).toBe(403);
    const bodyAuditor = await resAuditor.json();
    expect(bodyAuditor.error).toBe("FORBIDDEN_ROLE");

    // 3d. Different TELLER (not assigned to this session and not a supervisor)
    const resOtherTeller = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-other-teller-alpha"
      },
      body: JSON.stringify({ sessionId: session.id, actualClosingCents: 1_000_000, denominationBreakdown: { "1000": 10 } })
    });
    expect(resOtherTeller.status).toBe(403);
    const bodyOther = await resOtherTeller.json();
    expect(bodyOther.error).toBe("UNAUTHORIZED_SESSION_OPERATOR");

    expect(captureFullStoreSnapshot()).toBe(beforeSnapshot);
  });

  // =========================================================================
  // SCENARIO 4: Already closed session
  // =========================================================================
  it("Scenario 4: Rejects closing a session that is already closed with 409 SESSION_ALREADY_CLOSED", async () => {
    const { till, session } = seedActiveHtgTillAndSession();
    mockFirestoreStore.set(`till_sessions/${session.id}`, {
      ...session,
      status: "CLOSED_MATCHED",
      closed_at: "2026-10-29T16:00:00.000Z",
      actual_closing_cents: 1_000_000,
      discrepancy_cents: 0
    });
    mockFirestoreStore.set(`cash_tills/${till.id}`, {
      ...till,
      status: "CLOSED",
      active_session_id: undefined
    });

    const beforeSnapshot = captureFullStoreSnapshot();

    const res = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-teller-alpha"
      },
      body: JSON.stringify({
        sessionId: session.id,
        actualClosingCents: 900_000,
        denominationBreakdown: { "1000": 9 },
        notes: "Tentative de seconde clôture avec écart"
      })
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("SESSION_ALREADY_CLOSED");
    expect(mockFirestoreStore.has(`ledger_transactions/gl_variance_${session.id}`)).toBe(false);
    expect(captureFullStoreSnapshot()).toBe(beforeSnapshot);
  });

  // =========================================================================
  // SCENARIO 5: Relevant transfer still pending (PENDING_APPROVAL / PENDING)
  // =========================================================================
  it("Scenario 5: Blocks till closure when a transfer involving the till is in PENDING_APPROVAL or PENDING status (D3-A)", async () => {
    const { till, session } = seedActiveHtgTillAndSession();

    const pendingTransfer: InternalTransfer = {
      id: "trf_pending_001",
      business_id: TENANT_ALPHA,
      branch_id: BRANCH_MAIN,
      source_type: "SAFE",
      source_id: "safe_htg_01",
      source_name: "Coffre Principal HTG",
      destination_type: "TILL",
      destination_id: till.id,
      destination_name: till.name,
      currency: "HTG",
      amount_cents: 500_000,
      debit_account_code: "1010",
      credit_account_code: "1015",
      initiator_id: TELLER_ALPHA.uid,
      initiator_name: "Jean Teller Alpha",
      status: "PENDING_APPROVAL",
      description: "Approvisionnement en attente de validation",
      created_at: "2026-10-29T10:00:00.000Z"
    };
    mockFirestoreStore.set(`internal_transfers/${pendingTransfer.id}`, pendingTransfer);

    const beforeSnapshot = captureFullStoreSnapshot();

    // HTTP endpoint check
    const res = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-teller-alpha"
      },
      body: JSON.stringify({
        sessionId: session.id,
        actualClosingCents: 1_000_000,
        denominationBreakdown: { "1000": 10 },
        notes: "Tentative de clôture malgré transfert pendant"
      })
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("PENDING_TRANSFERS_BLOCKADE");

    // Direct engine check
    await expect(
      TillSessionEngine.closeSession({
        sessionId: session.id,
        actualClosingCents: 1_000_000,
        denominationBreakdown: { "1000": 10 },
        operatorId: TELLER_ALPHA.uid,
        operatorName: "Jean Teller Alpha"
      })
    ).rejects.toThrow(/transfert interne \[trf_pending_001\] est encore en cours/i);

    // State must be 100% untouched and zero variance GL entries created
    expect(mockFirestoreStore.has(`ledger_transactions/gl_variance_${session.id}`)).toBe(false);
    expect(captureFullStoreSnapshot()).toBe(beforeSnapshot);
  });

  // =========================================================================
  // SCENARIO 6: Transfer currently processing / in transit (PROCESSING / IN_TRANSIT / APPROVED)
  // =========================================================================
  it("Scenario 6: Blocks till closure when an internal or customer transfer is PROCESSING, IN_PROGRESS, IN_TRANSIT, or APPROVED (D3-A)", async () => {
    const { till, session } = seedActiveHtgTillAndSession();

    // 6a. Internal transfer in IN_TRANSIT status
    mockFirestoreStore.set("internal_transfers/trf_transit_002", {
      id: "trf_transit_002",
      business_id: TENANT_ALPHA,
      branch_id: BRANCH_MAIN,
      transfer_type: "TILL_TO_SAFE",
      source_id: till.id,
      source_name: till.name,
      destination_id: "safe_htg_01",
      destination_name: "Coffre Principal HTG",
      currency: "HTG",
      amount_cents: 250_000,
      debit_account_code: "1015",
      credit_account_code: "1010",
      initiator_id: TELLER_ALPHA.uid,
      initiator_name: "Jean Teller Alpha",
      status: "IN_TRANSIT",
      description: "Versement vers coffre en transit",
      created_at: "2026-10-29T11:00:00.000Z"
    });

    const beforeSnapshot = captureFullStoreSnapshot();

    const res1 = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-teller-alpha"
      },
      body: JSON.stringify({
        sessionId: session.id,
        actualClosingCents: 1_000_000,
        denominationBreakdown: { "1000": 10 }
      })
    });
    expect(res1.status).toBe(409);
    expect((await res1.json()).error).toBe("PENDING_TRANSFERS_BLOCKADE");
    expect(captureFullStoreSnapshot()).toBe(beforeSnapshot);

    // 6b. Replace with customer_transfer in PROCESSING status bound to this session
    mockFirestoreStore.delete("internal_transfers/trf_transit_002");
    mockFirestoreStore.set("customer_transfers/ct_processing_01", {
      id: "ct_processing_01",
      business_id: TENANT_ALPHA,
      reference_code: "MTCN-889900",
      paid_at_till_id: till.id,
      paid_at_session_id: session.id,
      status: "PROCESSING",
      payout_amount_cents: 100_000,
      payout_currency: "HTG"
    });

    const beforeCustSnapshot = captureFullStoreSnapshot();
    const res2 = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-teller-alpha"
      },
      body: JSON.stringify({
        sessionId: session.id,
        actualClosingCents: 1_000_000,
        denominationBreakdown: { "1000": 10 }
      })
    });
    expect(res2.status).toBe(409);
    expect((await res2.json()).error).toBe("PENDING_TRANSFERS_BLOCKADE");
    expect(captureFullStoreSnapshot()).toBe(beforeCustSnapshot);
  });

  // =========================================================================
  // SCENARIO 7: Two simultaneous closure attempts (Promise.all)
  // =========================================================================
  it("Scenario 7: Handles two simultaneous closure attempts atomically — exactly one succeeds, one is rejected, single GL variance entry", async () => {
    const { session } = seedActiveHtgTillAndSession({
      openingCents: 1_000_000,
      balanceCents: 1_000_000
    });

    // Physical count = 950,000 cents (-50,000 cents shortage)
    const payload = {
      sessionId: session.id,
      actualClosingCents: 950_000,
      denominationBreakdown: { "1000": 9, "500": 1 }, // 9,500 HTG = 950,000 cents
      notes: "Manquant constaté au comptage contradictoire"
    };

    const [resA, resB] = await Promise.all([
      fetch(`${baseUrl}/api/cash/sessions/close`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer token-teller-alpha"
        },
        body: JSON.stringify(payload)
      }),
      fetch(`${baseUrl}/api/cash/sessions/close`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer token-teller-alpha"
        },
        body: JSON.stringify(payload)
      })
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);

    // Verify only ONE variance GL entry exists in ledger_transactions and ONE outbox event
    const glEntries = Array.from(mockFirestoreStore.entries()).filter(([k]) =>
      k.startsWith("ledger_transactions/")
    );
    expect(glEntries).toHaveLength(1);
    const [glKey, glDoc] = glEntries[0];
    expect(glKey).toBe(`ledger_transactions/gl_variance_${session.id}`);
    expect(glDoc.debit_account_code).toBe("2910");
    expect(glDoc.credit_account_code).toBe("1010");
    expect(glDoc.debit_amount_cents).toBe(50_000);
    expect(glDoc.credit_amount_cents).toBe(50_000);

    const outboxEntries = Array.from(mockFirestoreStore.entries()).filter(([k]) =>
      k.includes("/event_outbox/")
    );
    expect(outboxEntries).toHaveLength(1);
    expect(outboxEntries[0][0]).toBe(
      `businesses/${TENANT_ALPHA}/event_outbox/evt_tx_gl_variance_${session.id}`
    );
  });

  // =========================================================================
  // SCENARIO 8: Retry after success
  // =========================================================================
  it("Scenario 8: Rejects retry after a successful closure and never generates a second variance GL entry", async () => {
    const { till, session } = seedActiveHtgTillAndSession({
      openingCents: 1_000_000,
      balanceCents: 1_000_000
    });

    // First call succeeds with +200 HTG overage (+20,000 cents)
    const res1 = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-teller-alpha"
      },
      body: JSON.stringify({
        sessionId: session.id,
        actualClosingCents: 1_020_000,
        denominationBreakdown: { "1000": 10, "100": 2 },
        notes: "Excédent de caisse de 200 HTG",
        idempotencyKey: "close_retry_key_01"
      })
    });

    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.session.status).toBe("CLOSED_DISCREPANCY");
    expect(body1.session.variance_type).toBe("OVERAGE");
    expect(body1.varianceLedgerTx.debit_account_code).toBe("1010");
    expect(body1.varianceLedgerTx.credit_account_code).toBe("2910");
    expect(body1.varianceLedgerTx.amount_cents).toBe(20_000);

    const afterFirstCloseSnapshot = captureFullStoreSnapshot();

    // Retry with same or different parameters
    const res2 = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-teller-alpha"
      },
      body: JSON.stringify({
        sessionId: session.id,
        actualClosingCents: 1_020_000,
        denominationBreakdown: { "1000": 10, "100": 2 },
        notes: "Excédent de caisse de 200 HTG",
        idempotencyKey: "close_retry_key_01"
      })
    });

    expect(res2.status).toBe(409);
    const body2 = await res2.json();
    expect(body2.error).toBe("SESSION_ALREADY_CLOSED");

    // Store snapshot after retry must be identical to after first close
    expect(captureFullStoreSnapshot()).toBe(afterFirstCloseSnapshot);
    expect(mockFirestoreStore.get(`cash_tills/${till.id}`).balance_cents).toBe(1_020_000);
  });

  // =========================================================================
  // SCENARIO 9: Failure of a mandatory write
  // =========================================================================
  it("Scenario 9: Aborts closure and rolls back all state when a mandatory write fails, without leaking internal error details", async () => {
    const { session } = seedActiveHtgTillAndSession({
      openingCents: 1_000_000,
      balanceCents: 1_000_000
    });
    const beforeSnapshot = captureFullStoreSnapshot();

    simulateAdminTxCommitFailure.value = true;

    const res = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-teller-alpha"
      },
      body: JSON.stringify({
        sessionId: session.id,
        actualClosingCents: 980_000,
        denominationBreakdown: { "1000": 9, "500": 1, "250": 1, "50": 1 },
        notes: "Écart test panne écriture"
      })
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("INTERNAL_SERVER_ERROR");
    expect(JSON.stringify(body)).not.toContain("wal_abort");
    expect(JSON.stringify(body)).not.toContain("/private/shard_04");

    // Verify full atomic rollback: session still ACTIVE, till still OPEN, no GL entry
    expect(captureFullStoreSnapshot()).toBe(beforeSnapshot);
  });

  // =========================================================================
  // SCENARIO 10: Failure of the accounting (GL) engine
  // =========================================================================
  it("Scenario 10: Aborts closure when LedgerRepository.save fails — session remains ACTIVE and till remains OPEN", async () => {
    const { till, session } = seedActiveHtgTillAndSession({
      openingCents: 1_000_000,
      balanceCents: 1_000_000
    });
    const beforeSnapshot = captureFullStoreSnapshot();

    vi.spyOn(LedgerRepository, "save").mockRejectedValueOnce(
      new Error("GL_ENGINE_UNAVAILABLE: Failed to persist variance entry")
    );

    await expect(
      TillSessionEngine.closeSession({
        sessionId: session.id,
        actualClosingCents: 950_000,
        denominationBreakdown: { "1000": 9, "500": 1 },
        operatorId: TELLER_ALPHA.uid,
        operatorName: "Jean Teller Alpha",
        notes: "Test panne moteur comptable"
      })
    ).rejects.toThrow(/GL_ENGINE_UNAVAILABLE/);

    // Session and Till must remain untouched
    expect(mockFirestoreStore.get(`till_sessions/${session.id}`).status).toBe("ACTIVE");
    expect(mockFirestoreStore.get(`cash_tills/${till.id}`).status).toBe("OPEN");
    expect(mockFirestoreStore.has(`ledger_transactions/gl_variance_${session.id}`)).toBe(false);
    expect(captureFullStoreSnapshot()).toBe(beforeSnapshot);
  });

  // =========================================================================
  // SCENARIO 11: Inconsistent denomination amounts
  // =========================================================================
  it("Scenario 11: Rejects closure when denominationBreakdown sum does not match actualClosingCents (DENOMINATION_TOTAL_MISMATCH)", async () => {
    const { session } = seedActiveHtgTillAndSession({
      openingCents: 1_000_000,
      balanceCents: 1_000_000
    });
    const beforeSnapshot = captureFullStoreSnapshot();

    // Denomination breakdown = 8 x 1000 HTG + 1 x 500 HTG = 8,500 HTG (850,000 cents)
    // Declared actualClosingCents = 1,000,000 cents (10,000 HTG)
    const res = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-teller-alpha"
      },
      body: JSON.stringify({
        sessionId: session.id,
        actualClosingCents: 1_000_000,
        denominationBreakdown: {
          "1000": 8,
          "500": 1
        }
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("DENOMINATION_TOTAL_MISMATCH");
    expect(captureFullStoreSnapshot()).toBe(beforeSnapshot);
  });

  // =========================================================================
  // SCENARIO 12: Negative, malformed, float, or out-of-bounds amount
  // =========================================================================
  it("Scenario 12: Rejects negative, floating-point, NaN, non-numeric, or out-of-bounds closing amounts and denomination counts", async () => {
    const { session } = seedActiveHtgTillAndSession();
    const beforeSnapshot = captureFullStoreSnapshot();

    const invalidAmounts: any[] = [-1, -500_000, 1000.55, "1000000", null, undefined, 999_999_999_999_999];

    for (const badAmount of invalidAmounts) {
      const res = await fetch(`${baseUrl}/api/cash/sessions/close`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer token-teller-alpha"
        },
        body: JSON.stringify({
          sessionId: session.id,
          actualClosingCents: badAmount,
          denominationBreakdown: { "1000": 10 },
          notes: "Montant invalide"
        })
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("INVALID_CLOSING_AMOUNT");
    }

    // Also test negative denomination count via engine
    await expect(
      TillSessionEngine.closeSession({
        sessionId: session.id,
        actualClosingCents: 1_000_000,
        denominationBreakdown: { "1000": -5 },
        operatorId: TELLER_ALPHA.uid,
        operatorName: "Jean Teller Alpha"
      })
    ).rejects.toThrow(/Quantité de coupures invalide/i);

    expect(captureFullStoreSnapshot()).toBe(beforeSnapshot);
  });

  // =========================================================================
  // SCENARIO 13: HTG / USD confusion
  // =========================================================================
  it("Scenario 13: Enforces strict HTG / USD separation across session, till, denominations, movements, and GL accounts (1010 vs 1020)", async () => {
    const { till, session } = seedActiveHtgTillAndSession();
    const beforeSnapshot = captureFullStoreSnapshot();

    // 13a. Requesting USD closure on an HTG till
    const res1 = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-teller-alpha"
      },
      body: JSON.stringify({
        sessionId: session.id,
        currency: "USD",
        actualClosingCents: 1_000_000,
        denominationBreakdown: { "100": 100 }
      })
    });
    expect(res1.status).toBe(400);
    expect((await res1.json()).error).toBe("CURRENCY_MISMATCH");

    // 13b. Submitting USD-only denomination ($20 bill) on an HTG till
    const res2 = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-teller-alpha"
      },
      body: JSON.stringify({
        sessionId: session.id,
        actualClosingCents: 2_000,
        denominationBreakdown: { "20": 1 }, // 20 is USD-only (HTG uses 25, not 20)
        notes: "Test billet USD dans caisse HTG"
      })
    });
    expect(res2.status).toBe(400);
    expect((await res2.json()).error).toBe("INVALID_DENOMINATION");

    expect(captureFullStoreSnapshot()).toBe(beforeSnapshot);

    // 13c. Verify USD Till closure with variance posts to 1020 and 2910 in USD (never 1010 or HTG)
    const usdTill: CashTill = {
      ...till,
      id: "till_usd_alpha_01",
      name: "Caisse USD Alpha",
      currency: "USD",
      balance_cents: 50_000, // $500.00
      linked_account_code: "1020",
      active_session_id: "sess_usd_alpha_01"
    };
    const usdSession: TillSession = {
      ...session,
      id: "sess_usd_alpha_01",
      till_id: usdTill.id,
      till_name: usdTill.name,
      currency: "USD",
      opening_balance_cents: 50_000,
      expected_closing_cents: 50_000
    };
    mockFirestoreStore.set(`cash_tills/${usdTill.id}`, usdTill);
    mockFirestoreStore.set(`till_sessions/${usdSession.id}`, usdSession);

    const resUsd = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-teller-alpha"
      },
      body: JSON.stringify({
        sessionId: usdSession.id,
        currency: "USD",
        actualClosingCents: 48_000, // $480.00 (-$20.00 shortage)
        denominationBreakdown: { "100": 4, "50": 1, "20": 1, "10": 1 },
        notes: "Billet de $20 manquant au comptage USD"
      })
    });

    expect(resUsd.status).toBe(200);
    const bodyUsd = await resUsd.json();
    expect(bodyUsd.varianceLedgerTx.currency).toBe("USD");
    expect(bodyUsd.varianceLedgerTx.debit_account_code).toBe("2910");
    expect(bodyUsd.varianceLedgerTx.credit_account_code).toBe("1020");
    expect(bodyUsd.varianceLedgerTx.debit_amount_cents).toBe(2_000);
    expect(bodyUsd.varianceLedgerTx.credit_amount_cents).toBe(2_000);
  });

  // =========================================================================
  // SCENARIO 14: Reopening of a closed session
  // =========================================================================
  it("Scenario 14: Enforces Maker-Checker, supervisor RBAC, mandatory reason, and preserves immutable variance GL entry on reopening", async () => {
    const { till, session } = seedActiveHtgTillAndSession({
      openingCents: 1_000_000,
      balanceCents: 1_000_000
    });

    // First close the session with a -10,000 cents (-100 HTG) shortage
    const closeRes = await TillSessionEngine.closeSession({
      sessionId: session.id,
      actualClosingCents: 990_000,
      denominationBreakdown: { "1000": 9, "500": 1, "250": 1, "100": 1, "50": 1 },
      operatorId: TELLER_ALPHA.uid,
      operatorName: "Jean Teller Alpha",
      notes: "Écart initial avant recomptage"
    });
    expect(closeRes.session.status).toBe("CLOSED_DISCREPANCY");
    expect(mockFirestoreStore.has(`ledger_transactions/gl_variance_${session.id}`)).toBe(true);

    // 14a. Reject self-approval (Maker === Checker)
    await expect(
      TillSessionEngine.reopenSession({
        tillId: till.id,
        previousSessionId: session.id,
        requesterId: MANAGER_ALPHA.uid,
        requesterName: "Manager Alpha",
        approverId: MANAGER_ALPHA.uid,
        approverName: "Manager Alpha",
        approverRole: "MANAGER",
        reason: "Auto-approbation interdite"
      })
    ).rejects.toThrow(/Séparation des tâches/i);

    // 14b. Reject unauthorized role (TELLER or AUDITOR cannot approve reopen)
    const resTellerReopen = await fetch(`${baseUrl}/api/cash/sessions/reopen`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-other-teller-alpha"
      },
      body: JSON.stringify({
        tillId: till.id,
        previousSessionId: session.id,
        requesterId: TELLER_ALPHA.uid,
        requesterName: "Jean Teller Alpha",
        reason: "Tentative par simple caissier"
      })
    });
    expect(resTellerReopen.status).toBe(403);
    expect((await resTellerReopen.json()).error).toBe("UNAUTHORIZED_APPROVER");

    // 14c. Authorized reopen by MANAGER via HTTP endpoint
    const resManagerReopen = await fetch(`${baseUrl}/api/cash/sessions/reopen`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-manager-alpha"
      },
      body: JSON.stringify({
        tillId: till.id,
        previousSessionId: session.id,
        requesterId: TELLER_ALPHA.uid,
        requesterName: "Jean Teller Alpha",
        reason: "Recomptage contradictoire autorisé par le directeur d'agence"
      })
    });

    expect(resManagerReopen.status).toBe(200);
    const reopenBody = await resManagerReopen.json();
    expect(reopenBody.till.status).toBe("OPEN");
    expect(reopenBody.newSession.id).toBe(`sess_reopen_${session.id}`);
    expect(reopenBody.newSession.reopened_from_session_id).toBe(session.id);
    expect(reopenBody.newSession.opening_balance_cents).toBe(990_000);

    // Verify historical session and historical variance GL entry were NOT deleted or overwritten
    const prevSessionDoc = mockFirestoreStore.get(`till_sessions/${session.id}`);
    expect(prevSessionDoc.status).toBe("REOPENED");
    expect(prevSessionDoc.discrepancy_cents).toBe(-10_000);
    expect(prevSessionDoc.variance_ledger_tx_id).toBe(`gl_variance_${session.id}`);
    expect(mockFirestoreStore.has(`ledger_transactions/gl_variance_${session.id}`)).toBe(true);
  });

  // =========================================================================
  // SCENARIO 15: Repetition of a reopening or counter-entry
  // =========================================================================
  it("Scenario 15: Rejects repeated reopening attempts on an already reopened session with 409 SESSION_ALREADY_REOPENED", async () => {
    const { till, session } = seedActiveHtgTillAndSession();

    await TillSessionEngine.closeSession({
      sessionId: session.id,
      actualClosingCents: 1_000_000,
      denominationBreakdown: { "1000": 10 },
      operatorId: TELLER_ALPHA.uid,
      operatorName: "Jean Teller Alpha"
    });

    // First reopen succeeds
    const firstReopen = await TillSessionEngine.reopenSession({
      tillId: till.id,
      previousSessionId: session.id,
      requesterId: TELLER_ALPHA.uid,
      requesterName: "Jean Teller Alpha",
      approverId: MANAGER_ALPHA.uid,
      approverName: "Manager Alpha",
      approverRole: "MANAGER",
      reason: "Première réouverture valide"
    });
    expect(firstReopen.newSession.id).toBe(`sess_reopen_${session.id}`);

    const snapshotAfterFirstReopen = captureFullStoreSnapshot();

    // Second reopen attempt on the same previousSessionId must be rejected with 409
    const resDuplicate = await fetch(`${baseUrl}/api/cash/sessions/reopen`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-manager-alpha"
      },
      body: JSON.stringify({
        tillId: till.id,
        previousSessionId: session.id,
        requesterId: TELLER_ALPHA.uid,
        requesterName: "Jean Teller Alpha",
        reason: "Tentative de double réouverture"
      })
    });

    expect(resDuplicate.status).toBe(409);
    expect((await resDuplicate.json()).error).toBe("SESSION_ALREADY_REOPENED");
    expect(captureFullStoreSnapshot()).toBe(snapshotAfterFirstReopen);
  });

  // =========================================================================
  // SCENARIO 16: Mid-process failure with byte-for-byte state verification
  // =========================================================================
  it("Scenario 16: Restores exact initial state (state_before === state_after) when failure occurs mid-process after GL & outbox writes", async () => {
    const { till, session } = seedActiveHtgTillAndSession({
      openingCents: 1_000_000,
      balanceCents: 1_000_000
    });
    const stateBefore = captureFullStoreSnapshot();

    // Inject failure specifically when writing `cash_tills` inside runTransaction after `ledger_transactions` and `event_outbox` were already written
    simulateClientSetDocFailureOnCollection.value = "cash_tills";

    await expect(
      TillSessionEngine.closeSession({
        sessionId: session.id,
        actualClosingCents: 970_000, // -30,000 cents shortage (triggers GL + outbox write first)
        denominationBreakdown: { "1000": 9, "500": 1, "100": 2 },
        operatorId: TELLER_ALPHA.uid,
        operatorName: "Jean Teller Alpha",
        notes: "Test crash au milieu du processus après écriture GL"
      })
    ).rejects.toThrow(/SIMULATED_TX_SET_FAILURE_ON_cash_tills/);

    simulateClientSetDocFailureOnCollection.value = null;

    const stateAfter = captureFullStoreSnapshot();
    expect(stateAfter).toBe(stateBefore);
    expect(mockFirestoreStore.get(`till_sessions/${session.id}`).status).toBe("ACTIVE");
    expect(mockFirestoreStore.get(`cash_tills/${till.id}`).status).toBe("OPEN");
    expect(mockFirestoreStore.get(`cash_tills/${till.id}`).balance_cents).toBe(1_000_000);
    expect(mockFirestoreStore.has(`ledger_transactions/gl_variance_${session.id}`)).toBe(false);
    expect(
      mockFirestoreStore.has(`businesses/${TENANT_ALPHA}/event_outbox/evt_tx_gl_variance_${session.id}`)
    ).toBe(false);
  });

  // =========================================================================
  // PHASE D3.1 — ADVERSARIAL SUITE (D3.1-I CASES 1 TO 33)
  // =========================================================================

  // -------------------------------------------------------------------------
  // D3.1-I IDENTITY CASES (1–8): D3-R-01 Operator & Approver Anti-Spoofing
  // -------------------------------------------------------------------------
  it("D3.1-I Identity (Cases 1–8): Prevents operatorId & approverId spoofing and enforces authenticated identity binding", async () => {
    const { till, session } = seedActiveHtgTillAndSession();
    const beforeSnapshot = captureFullStoreSnapshot();

    // Case 5a: OTHER_TELLER_ALPHA attempting to spoof TELLER_ALPHA.uid in body.operatorId (exact D3-R-01 attack)
    const resSpoofOtherTeller = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-other-teller-alpha"
      },
      body: JSON.stringify({
        sessionId: session.id,
        operatorId: TELLER_ALPHA.uid, // Spoofing titular teller!
        operatorName: "Jean Teller Alpha",
        actualClosingCents: 900_000,
        denominationBreakdown: { "1000": 9 },
        notes: "Tentative d'imputation de déficit à un collègue via spoofing operatorId"
      })
    });
    expect(resSpoofOtherTeller.status).toBe(403);
    const bodySpoof1 = await resSpoofOtherTeller.json();
    expect(bodySpoof1.error).toBe("IDENTITY_SPOOFING_DETECTED");

    // Case 2 & 5b: TELLER_ALPHA sending mismatched operatorId in body
    const resSpoofSelf = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-teller-alpha"
      },
      body: JSON.stringify({
        sessionId: session.id,
        operatorId: OTHER_TELLER_ALPHA.uid,
        actualClosingCents: 1_000_000,
        denominationBreakdown: { "1000": 10 }
      })
    });
    expect(resSpoofSelf.status).toBe(403);
    expect((await resSpoofSelf.json()).error).toBe("IDENTITY_SPOOFING_DETECTED");

    // Case 4: Teller B -> session of Teller A without spoofing operatorId -> 403 UNAUTHORIZED_SESSION_OPERATOR
    const resTellerB = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-other-teller-alpha"
      },
      body: JSON.stringify({
        sessionId: session.id,
        actualClosingCents: 1_000_000,
        denominationBreakdown: { "1000": 10 }
      })
    });
    expect(resTellerB.status).toBe(403);
    expect((await resTellerB.json()).error).toBe("UNAUTHORIZED_SESSION_OPERATOR");

    // Verify zero financial state mutation after all 3 attacks, and ForensicLog recorded for refusals
    expect(captureFullStoreSnapshot()).toBe(beforeSnapshot);
    const refusalLogs = getForensicLogsFromStore().filter(
      (l) => l.action === "TILL_SESSION_CLOSE_REFUSED"
    );
    expect(refusalLogs.length).toBeGreaterThanOrEqual(3);

    // Case 1: operatorId === req.user.uid -> 200 OK
    const resValidExplicit = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-teller-alpha"
      },
      body: JSON.stringify({
        sessionId: session.id,
        operatorId: TELLER_ALPHA.uid,
        actualClosingCents: 990_000,
        denominationBreakdown: { "1000": 9, "500": 1, "250": 1, "100": 1, "50": 1 },
        notes: "Clôture légitime avec operatorId explicite"
      })
    });
    expect(resValidExplicit.status).toBe(200);
    const closedBody = await resValidExplicit.json();
    expect(closedBody.varianceLedgerTx.signerId).toBe(TELLER_ALPHA.uid);

    // Case 6: Spoofing approverId in /api/cash/sessions/reopen
    const resSpoofApprover = await fetch(`${baseUrl}/api/cash/sessions/reopen`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-manager-alpha"
      },
      body: JSON.stringify({
        tillId: till.id,
        previousSessionId: session.id,
        requesterId: TELLER_ALPHA.uid,
        requesterName: "Jean Teller Alpha",
        approverId: "uid_spoofed_super_admin",
        reason: "Tentative spoofing approverId"
      })
    });
    expect(resSpoofApprover.status).toBe(403);
    expect((await resSpoofApprover.json()).error).toBe("IDENTITY_SPOOFING_DETECTED");

    // Case 7: Approver === requester -> 403 MAKER_CHECKER_VIOLATION
    const resApproverIsRequester = await fetch(`${baseUrl}/api/cash/sessions/reopen`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-manager-alpha"
      },
      body: JSON.stringify({
        tillId: till.id,
        previousSessionId: session.id,
        requesterId: MANAGER_ALPHA.uid,
        requesterName: "Manager Alpha",
        reason: "Auto-approbation de réouverture"
      })
    });
    expect(resApproverIsRequester.status).toBe(403);
    expect((await resApproverIsRequester.json()).error).toBe("MAKER_CHECKER_VIOLATION");

    // Case 8: Approver === previous session teller -> 403 MAKER_CHECKER_VIOLATION
    // Seed a closed session where MANAGER_ALPHA was the teller who closed it
    const { till: mgrTill, session: mgrSess } = seedActiveHtgTillAndSession({
      tillId: "till_mgr_01",
      sessionId: "sess_mgr_01",
      tellerId: MANAGER_ALPHA.uid
    });
    const resCloseMgr = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-manager-alpha"
      },
      body: JSON.stringify({
        sessionId: mgrSess.id,
        // Case 3: operatorId absent -> derived from req.user.uid
        actualClosingCents: 1_000_000,
        denominationBreakdown: { "1000": 10 }
      })
    });
    expect(resCloseMgr.status).toBe(200);

    const resApproverIsPrevTeller = await fetch(`${baseUrl}/api/cash/sessions/reopen`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-manager-alpha"
      },
      body: JSON.stringify({
        tillId: mgrTill.id,
        previousSessionId: mgrSess.id,
        requesterId: TELLER_ALPHA.uid,
        requesterName: "Jean Teller Alpha",
        reason: "Manager tente de rouvrir sa propre session antérieure"
      })
    });
    expect(resApproverIsPrevTeller.status).toBe(403);
    expect((await resApproverIsPrevTeller.json()).error).toBe("MAKER_CHECKER_VIOLATION");
  });

  // -------------------------------------------------------------------------
  // D3.1-I FRONTEND CASES (9–11): D3-R-02 Server API Path & Denominations
  // -------------------------------------------------------------------------
  it("D3.1-I Frontend (Cases 9–11): TillSessionModal uses closeSessionViaApi over HTTP with Bearer token, zero client writes, and full HTG denominations", async () => {
    // Verify TillSessionModal exports all canonical HTG denominations including 2 and 1 HTG (D3.1-F)
    expect(HTG_DENOMINATIONS).toEqual([1000, 500, 250, 100, 50, 25, 10, 5, 2, 1]);
    expect(USD_DENOMINATIONS).toEqual([100, 50, 20, 10, 5, 2, 1]);
    expect(HTG_DENOMINATIONS).toEqual([...CANONICAL_HTG_DENOMINATIONS]);
    expect(USD_DENOMINATIONS).toEqual([...CANONICAL_USD_DENOMINATIONS]);

    const { session } = seedActiveHtgTillAndSession();

    // Spy on client repository write methods to prove zero direct client Firestore writes occur (Case 10)
    const saveSessionSpy = vi.spyOn(CashManagementRepository, "saveSession");
    const saveTillSpy = vi.spyOn(CashManagementRepository, "saveTill");
    const ledgerSaveSpy = vi.spyOn(LedgerRepository, "save");

    // Route relative `/api/cash/sessions/close` calls from closeSessionViaApi to our live test server `baseUrl`
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
      const urlStr = typeof input === "string" ? input : input.toString();
      const targetUrl = urlStr.startsWith("/") ? `${baseUrl}${urlStr}` : urlStr;
      return originalFetch(targetUrl, init);
    });

    try {
      // Case 9 & 10: Close session via `closeSessionViaApi` (used by `TillSessionModal.tsx`)
      const result = await TillSessionEngine.closeSessionViaApi({
        sessionId: session.id,
        businessId: TENANT_ALPHA,
        actualClosingCents: 999_700, // 9,997.00 HTG (uses 2 HTG and 1 HTG coins: 9x1000 + 1x500 + 1x250 + 2x100 + 4x10 + 1x5 + 1x2 = 9,997 HTG)
        denominationBreakdown: {
          "1000": 9,
          "500": 1,
          "250": 1,
          "100": 2,
          "10": 4,
          "5": 1,
          "2": 1
        },
        operatorId: TELLER_ALPHA.uid,
        operatorName: "Jean Teller Alpha",
        notes: "Clôture via API serveur depuis TillSessionModal avec pièce de 2 HTG"
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
      expect(calledUrl).toBe("/api/cash/sessions/close");
      expect((calledInit?.headers as any)?.Authorization).toBe("Bearer token-teller-alpha");
      expect((calledInit?.headers as any)?.["x-business-id"]).toBe(TENANT_ALPHA);

      // Zero direct client writes!
      expect(saveSessionSpy).not.toHaveBeenCalled();
      expect(saveTillSpy).not.toHaveBeenCalled();
      expect(ledgerSaveSpy).not.toHaveBeenCalled();

      expect(result.session.status).toBe("CLOSED_DISCREPANCY");
      expect(result.varianceLedgerTx?.id).toBe(`gl_variance_${session.id}`);

      // Case 11: Server error (409 SESSION_ALREADY_CLOSED) is cleanly propagated to the UI caller
      await expect(
        TillSessionEngine.closeSessionViaApi({
          sessionId: session.id,
          businessId: TENANT_ALPHA,
          actualClosingCents: 999_700,
          denominationBreakdown: { "1000": 9, "500": 1, "250": 1, "100": 2, "10": 4, "5": 1, "2": 1 },
          operatorId: TELLER_ALPHA.uid,
          operatorName: "Jean Teller Alpha",
          notes: "Double clic UI"
        })
      ).rejects.toThrow(/Session closure conflict|déjà clôturée/i);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  // -------------------------------------------------------------------------
  // D3.1-I ATOMICITY CASES (12–18): D3-R-02 Step-by-Step Failure & Outbox Sync
  // -------------------------------------------------------------------------
  it("D3.1-I Atomicity (Cases 12–18): Guarantees zero partial state or orphan event_outbox across all failure points and succeeds on retry", async () => {
    const { till, session } = seedActiveHtgTillAndSession({
      openingCents: 1_000_000,
      balanceCents: 1_000_000
    });
    const initialSnapshot = captureFullStoreSnapshot();

    const closePayload = {
      sessionId: session.id,
      actualClosingCents: 950_000,
      denominationBreakdown: { "1000": 9, "500": 1 },
      notes: "Manquant de 500 HTG test atomicité D3.1"
    };

    // Case 12: Failure before first write (read failure inside transaction)
    simulateAdminTxGetFailure.value = true;
    const resFailRead = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer token-teller-alpha" },
      body: JSON.stringify(closePayload)
    });
    expect(resFailRead.status).toBe(500);
    expect(captureFullStoreSnapshot()).toBe(initialSnapshot);
    simulateAdminTxGetFailure.value = false;

    // Case 13: Failure right after session write (when writing `cash_tills/`)
    simulateAdminTxSetFailureOnPathPrefix.value = "cash_tills/";
    const resFailTill = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer token-teller-alpha" },
      body: JSON.stringify(closePayload)
    });
    expect(resFailTill.status).toBe(500);
    expect(captureFullStoreSnapshot()).toBe(initialSnapshot);

    // Case 14: Failure during variance GL write (`ledger_transactions/`)
    simulateAdminTxSetFailureOnPathPrefix.value = "ledger_transactions/";
    const resFailGl = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer token-teller-alpha" },
      body: JSON.stringify(closePayload)
    });
    expect(resFailGl.status).toBe(500);
    expect(captureFullStoreSnapshot()).toBe(initialSnapshot);

    // Case 15: Failure during event_outbox write (`businesses/`) — zero orphan GL or session write!
    simulateAdminTxSetFailureOnPathPrefix.value = "businesses/";
    const resFailOutbox = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer token-teller-alpha" },
      body: JSON.stringify(closePayload)
    });
    expect(resFailOutbox.status).toBe(500);
    expect(captureFullStoreSnapshot()).toBe(initialSnapshot);
    expect(mockFirestoreStore.has(`ledger_transactions/gl_variance_${session.id}`)).toBe(false);
    expect(
      mockFirestoreStore.has(`businesses/${TENANT_ALPHA}/event_outbox/evt_tx_gl_variance_${session.id}`)
    ).toBe(false);
    simulateAdminTxSetFailureOnPathPrefix.value = null;

    // Case 16: Retry after failure succeeds cleanly with 1 GL entry and 1 outbox entry
    const resRetrySuccess = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer token-teller-alpha" },
      body: JSON.stringify(closePayload)
    });
    expect(resRetrySuccess.status).toBe(200);
    expect(mockFirestoreStore.get(`till_sessions/${session.id}`).status).toBe("CLOSED_DISCREPANCY");
    expect(mockFirestoreStore.get(`cash_tills/${till.id}`).status).toBe("CLOSED");
    expect(mockFirestoreStore.has(`ledger_transactions/gl_variance_${session.id}`)).toBe(true);
    const outboxDoc = mockFirestoreStore.get(
      `businesses/${TENANT_ALPHA}/event_outbox/evt_tx_gl_variance_${session.id}`
    );
    expect(outboxDoc).toBeDefined();
    expect(outboxDoc.eventType).toBe("LEDGER_TRANSACTION_RECORDED");
    expect(outboxDoc.payload.transactionId).toBe(`gl_variance_${session.id}`);

    // Verify ForensicLog emitted for successful closure (D3.1-H)
    const closeForensicLogs = getForensicLogsFromStore().filter(
      (l) => l.action === "TILL_SESSION_CLOSED" && l.afterState?.sessionId === session.id
    );
    expect(closeForensicLogs).toHaveLength(1);
    expect(closeForensicLogs[0].actorId).toBe(TELLER_ALPHA.uid);
    expect(closeForensicLogs[0].signature).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // D3.1-I DENOMINATION CASES (19–25): D3-R-03 Mandatory Breakdown & Full Matrix
  // -------------------------------------------------------------------------
  it("D3.1-I Denominations (Cases 19–25): Rejects missing breakdown on positive amount, accepts all canonical HTG & USD denominations, and handles zero amount", async () => {
    const { till, session } = seedActiveHtgTillAndSession({
      openingCents: 194_300, // 1,943.00 HTG = sum of 1 of each HTG denomination (1000+500+250+100+50+25+10+5+2+1)
      balanceCents: 194_300
    });
    const beforeSnapshot = captureFullStoreSnapshot();

    // Case 19a: Breakdown absent (`undefined`) with positive amount -> 400 INVALID_DENOMINATION_BREAKDOWN
    const resMissingBreakdown = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer token-teller-alpha" },
      body: JSON.stringify({
        sessionId: session.id,
        actualClosingCents: 194_300
      })
    });
    expect(resMissingBreakdown.status).toBe(400);
    expect((await resMissingBreakdown.json()).error).toBe("INVALID_DENOMINATION_BREAKDOWN");

    // Case 19b: Breakdown empty (`{}`) with positive amount -> 400 DENOMINATION_TOTAL_MISMATCH
    const resEmptyBreakdown = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer token-teller-alpha" },
      body: JSON.stringify({
        sessionId: session.id,
        actualClosingCents: 194_300,
        denominationBreakdown: {}
      })
    });
    expect(resEmptyBreakdown.status).toBe(400);
    expect((await resEmptyBreakdown.json()).error).toBe("DENOMINATION_TOTAL_MISMATCH");

    expect(captureFullStoreSnapshot()).toBe(beforeSnapshot);

    // Case 20 & 23: HTG with ALL canonical denominations including 2 and 1 HTG -> 200 OK
    const resAllHtg = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer token-teller-alpha" },
      body: JSON.stringify({
        sessionId: session.id,
        actualClosingCents: 194_300,
        denominationBreakdown: {
          "1000": 1,
          "500": 1,
          "250": 1,
          "100": 1,
          "50": 1,
          "25": 1,
          "10": 1,
          "5": 1,
          "2": 1,
          "1": 1
        }
      })
    });
    expect(resAllHtg.status).toBe(200);
    expect((await resAllHtg.json()).session.status).toBe("CLOSED_MATCHED");

    // Case 24: USD with ALL canonical denominations (100+50+20+10+5+2+1 = $188.00 = 18,800 cents) -> 200 OK
    const usdTill: CashTill = {
      ...till,
      id: "till_usd_full_denom",
      currency: "USD",
      balance_cents: 18_800,
      linked_account_code: "1020",
      active_session_id: "sess_usd_full_denom",
      status: "OPEN"
    };
    const usdSess: TillSession = {
      ...session,
      id: "sess_usd_full_denom",
      till_id: usdTill.id,
      currency: "USD",
      opening_balance_cents: 18_800,
      expected_closing_cents: 18_800,
      status: "ACTIVE"
    };
    mockFirestoreStore.set(`cash_tills/${usdTill.id}`, usdTill);
    mockFirestoreStore.set(`till_sessions/${usdSess.id}`, usdSess);

    const resAllUsd = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer token-teller-alpha" },
      body: JSON.stringify({
        sessionId: usdSess.id,
        currency: "USD",
        actualClosingCents: 18_800,
        denominationBreakdown: {
          "100": 1,
          "50": 1,
          "20": 1,
          "10": 1,
          "5": 1,
          "2": 1,
          "1": 1
        }
      })
    });
    expect(resAllUsd.status).toBe(200);

    // Case 25: Zero amount (`actualClosingCents === 0`) with undefined or empty breakdown -> 200 OK
    const { session: zeroSess } = seedActiveHtgTillAndSession({
      tillId: "till_zero_htg",
      sessionId: "sess_zero_htg",
      openingCents: 0,
      balanceCents: 0
    });
    const resZero = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer token-teller-alpha" },
      body: JSON.stringify({
        sessionId: zeroSess.id,
        actualClosingCents: 0
      })
    });
    expect(resZero.status).toBe(200);
    expect((await resZero.json()).session.status).toBe("CLOSED_MATCHED");
  });

  // -------------------------------------------------------------------------
  // D3.1-I REOPENING CASES (26–33): D3-R-04 Requester Validation & ForensicLog
  // -------------------------------------------------------------------------
  it("D3.1-I Reopening (Cases 26–33): Validates requesterId existence, tenant isolation, active status, role, and emits ForensicLog", async () => {
    const { till, session } = seedActiveHtgTillAndSession();

    // Close session first
    const closeRes = await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer token-teller-alpha" },
      body: JSON.stringify({
        sessionId: session.id,
        actualClosingCents: 1_000_000,
        denominationBreakdown: { "1000": 10 }
      })
    });
    expect(closeRes.status).toBe(200);
    const snapshotAfterClose = captureFullStoreSnapshot();

    // Case 27: Non-existent requester -> 404 REQUESTER_NOT_FOUND
    const resGhostRequester = await fetch(`${baseUrl}/api/cash/sessions/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer token-manager-alpha" },
      body: JSON.stringify({
        tillId: till.id,
        previousSessionId: session.id,
        requesterId: "emp_ghost_non_existent_999",
        requesterName: "Ghost Employee",
        reason: "Demande avec employé inexistant"
      })
    });
    expect(resGhostRequester.status).toBe(404);
    expect((await resGhostRequester.json()).error).toBe("REQUESTER_NOT_FOUND");

    // Case 28: Cross-tenant requester (OWNER_BETA from TENANT_BETA) -> 403 TENANT_ISOLATION_VIOLATION
    const resCrossTenantRequester = await fetch(`${baseUrl}/api/cash/sessions/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer token-manager-alpha" },
      body: JSON.stringify({
        tillId: till.id,
        previousSessionId: session.id,
        requesterId: OWNER_BETA.uid,
        requesterName: "Beta Owner",
        reason: "Demande avec employé d'un autre tenant"
      })
    });
    expect(resCrossTenantRequester.status).toBe(403);
    expect((await resCrossTenantRequester.json()).error).toBe("TENANT_ISOLATION_VIOLATION");

    // Case 29: Inactive/suspended requester -> 403 INACTIVE_REQUESTER
    mockFirestoreStore.set("employees/emp_suspended_alpha", {
      id: "emp_suspended_alpha",
      uid: "emp_suspended_alpha",
      business_id: TENANT_ALPHA,
      role: "TELLER",
      status: "SUSPENDED",
      is_active: false
    });
    const resSuspendedRequester = await fetch(`${baseUrl}/api/cash/sessions/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer token-manager-alpha" },
      body: JSON.stringify({
        tillId: till.id,
        previousSessionId: session.id,
        requesterId: "emp_suspended_alpha",
        requesterName: "Suspended Teller",
        reason: "Demande avec employé suspendu"
      })
    });
    expect(resSuspendedRequester.status).toBe(403);
    expect((await resSuspendedRequester.json()).error).toBe("INACTIVE_REQUESTER");
    mockFirestoreStore.delete("employees/emp_suspended_alpha");

    // Also test unauthorized requester role (AUDITOR cannot be assigned a reopened till session) -> 403 UNAUTHORIZED_REQUESTER_ROLE
    const resAuditorRequester = await fetch(`${baseUrl}/api/cash/sessions/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer token-manager-alpha" },
      body: JSON.stringify({
        tillId: till.id,
        previousSessionId: session.id,
        requesterId: AUDITOR_ALPHA.uid,
        requesterName: "Auditor Alpha",
        reason: "Demande avec auditeur comme caissier"
      })
    });
    expect(resAuditorRequester.status).toBe(403);
    expect((await resAuditorRequester.json()).error).toBe("UNAUTHORIZED_REQUESTER_ROLE");

    // Financial state must remain 100% unchanged after all rejected reopen attempts
    expect(captureFullStoreSnapshot()).toBe(snapshotAfterClose);

    // Case 26: Valid requester -> 200 OK and emits TILL_SESSION_REOPENED ForensicLog
    const resValidReopen = await fetch(`${baseUrl}/api/cash/sessions/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer token-manager-alpha" },
      body: JSON.stringify({
        tillId: till.id,
        previousSessionId: session.id,
        requesterId: TELLER_ALPHA.uid,
        requesterName: "Jean Teller Alpha",
        reason: "Réouverture valide après vérification complète du demandeur"
      })
    });
    expect(resValidReopen.status).toBe(200);

    const reopenForensicLogs = getForensicLogsFromStore().filter(
      (l) => l.action === "TILL_SESSION_REOPENED"
    );
    expect(reopenForensicLogs).toHaveLength(1);
    expect(reopenForensicLogs[0].actorId).toBe(MANAGER_ALPHA.uid);
    expect(reopenForensicLogs[0].afterState?.sessionId).toBe(`sess_reopen_${session.id}`);
    expect(reopenForensicLogs[0].signature).toBeTruthy();
  });
});

