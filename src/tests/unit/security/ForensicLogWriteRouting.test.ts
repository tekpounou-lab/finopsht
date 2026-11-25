import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";

const mockAdminDocs = new Map<string, any>();
const mockClientWrites: Array<{ coll: string; id: string; data: any }> = [];

vi.mock("../../../lib/firebaseAdmin", () => ({
  getAdminApp: () => ({}),
  getAdminAuth: () => ({
    verifyIdToken: vi.fn(async (token: string) => {
      if (token === "valid-alpha-token") {
        return {
          uid: "usr_alpha_1",
          email: "alpha@example.com",
          email_verified: true,
          business_id: "biz_alpha",
          role: "OWNER"
        };
      }
      if (token === "valid-new-user-token") {
        return {
          uid: "usr_new_1",
          email: "newuser@example.com",
          email_verified: false
        };
      }
      throw new Error("auth/argument-error");
    })
  }),
  getAdminFirestore: () => ({
    collection: (collName: string) => ({
      doc: (docId: string) => ({
        get: vi.fn(async () => {
          if (collName === "users" && docId === "usr_alpha_1") {
            return {
              exists: true,
              data: () => ({
                business_id: "biz_alpha",
                role: "OWNER",
                accountStatus: "ACTIVE"
              })
            };
          }
          if (collName === "users" && docId === "usr_new_1") {
            return {
              exists: true,
              data: () => ({
                role: "EMPLOYEE",
                accountStatus: "ACTIVE"
              })
            };
          }
          return { exists: false, data: () => ({}) };
        }),
        set: vi.fn(async (data: any) => {
          mockAdminDocs.set(`${collName}/${docId}`, data);
        })
      })
    })
  })
}));

vi.mock("../../../lib/firebase", () => ({
  db: {},
  auth: {
    currentUser: {
      uid: "usr_alpha_1",
      getIdToken: vi.fn(async () => "valid-alpha-token")
    }
  },
  serverTimestamp: () => "__SERVER_TS__",
  OperationType: {
    CREATE: "create",
    UPDATE: "update",
    DELETE: "delete",
    LIST: "list",
    GET: "get",
    WRITE: "write"
  },
  handleFirestoreError: vi.fn((err: unknown) => {
    throw err;
  })
}));

vi.mock("firebase/firestore", async () => {
  const actual = await vi.importActual<typeof import("firebase/firestore")>("firebase/firestore");
  return {
    ...actual,
    doc: (_db: any, coll: string, id: string) => ({ coll, id }),
    setDoc: vi.fn(async (ref: any, data: any) => {
      mockClientWrites.push({ coll: ref.coll, id: ref.id, data });
    })
  };
});

import { transferRouter } from "../../../routes/transferRoutes";
import { ForensicLogRepository } from "../../../repositories/ForensicLogRepository";

describe("ForensicLogWriteRouting — Server Authority & Client Fallback", () => {
  const app = express();
  app.use(express.json());
  app.use("/api/audit", transferRouter);

  beforeEach(() => {
    mockAdminDocs.clear();
    mockClientWrites.length = 0;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists tenant-scoped forensic logs on /api/audit/forensic-logs with server actor & HMAC seal", async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/audit/forensic-logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-alpha-token"
        },
        body: JSON.stringify({
          log: {
            id: "flog_test_001",
            business_id: "biz_alpha",
            action: "WORKSPACE_AUDIT_INITIALIZED",
            actorId: "system_init",
            timestamp: "2026-11-25T14:00:00.000Z",
            details: "Initial audit log",
            signature: "client_forged_sig"
          }
        })
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.keyVersion).toBe("v2_server");
      expect(body.signature).not.toBe("client_forged_sig");

      const stored = mockAdminDocs.get("forensic_logs/flog_test_001");
      expect(stored).toBeDefined();
      expect(stored.actorId).toBe("usr_alpha_1");
      expect(stored.sourceActorId).toBe("system_init");
      expect(stored.verifiedByServer).toBe(true);
      expect(stored.signature).toBe(body.signature);
    } finally {
      server.close();
    }
  });

  it("rejects cross-tenant forensic log writes with 403 FORBIDDEN_TENANT_ACCESS", async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/audit/forensic-logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-alpha-token"
        },
        body: JSON.stringify({
          log: {
            id: "flog_test_cross",
            business_id: "biz_beta_victim",
            action: "WORKSPACE_AUDIT_INITIALIZED"
          }
        })
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("FORBIDDEN_TENANT_ACCESS");
      expect(mockAdminDocs.has("forensic_logs/flog_test_cross")).toBe(false);
    } finally {
      server.close();
    }
  });

  it("allows self-scoped USER_* global onboarding audit logs when user has no tenant yet", async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/audit/forensic-logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-new-user-token"
        },
        body: JSON.stringify({
          log: {
            id: "flog_onboarding_1",
            business_id: "global",
            action: "USER_ACCOUNT_STATUS_PENDING_MEMBER",
            actorId: "usr_new_1",
            timestamp: "2026-11-25T14:00:00.000Z"
          }
        })
      });

      expect(res.status).toBe(201);
      const stored = mockAdminDocs.get("forensic_logs/flog_onboarding_1");
      expect(stored.business_id).toBe("global");
      expect(stored.actorId).toBe("usr_new_1");
    } finally {
      server.close();
    }
  });

  it("client writeForensicLog delegates to /api/audit/forensic-logs and falls back safely to audit_logs (never forensic_logs) on 503", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({ error: "ADMIN_FIRESTORE_UNAVAILABLE" })
      }))
    );

    const log = await ForensicLogRepository.createAndSignLog({
      business_id: "global",
      action: "USER_ACCOUNT_STATUS_PENDING_MEMBER",
      actorId: "system_init",
      timestamp: "2026-11-25T14:04:38.828Z",
      details: "Onboarding transition"
    });

    await ForensicLogRepository.writeForensicLog(log);

    expect(mockClientWrites).toHaveLength(1);
    expect(mockClientWrites[0].coll).toBe("audit_logs");
    expect(mockClientWrites[0].id).toBe(log.id);
    expect(mockClientWrites[0].data.actorId).toBe("usr_alpha_1");
    expect(mockClientWrites[0].data.sourceActorId).toBe("system_init");
    expect(mockClientWrites[0].data.audit_type).toBe("AUTH_AUDIT_LOGS");
    expect(mockClientWrites[0].data.business_id).toBe("global");
  });
});
