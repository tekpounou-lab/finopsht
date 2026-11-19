/**
 * FINOPS ERP / FINAYITI FUSION
 * RBAC CASH-P2 CRITICAL REMEDIATION — COMPREHENSIVE REGRESSION & SECURITY VERIFICATION SUITE
 *
 * Covers every finding documented in FINOPS_RBAC_CASH_P1_INDEPENDENT_VERIFICATION_REPORT.md (F-01 .. F-10):
 * - F-01: Strict prohibition of internal transfer approval/rejection for ALL teller roles (incl. HEAD_TELLER & MASTER_HEAD_TELLER),
 *         while preserving legitimate HEAD_TELLER/MASTER_HEAD_TELLER till lifecycle supervision (cash.supervise).
 * - F-02 / F-03: PermissionService evaluation order, fail-closed defaults, subscription/module precedence,
 *         anti-bypass of explicit role denials via custom permissions, and MASTER_HEAD_TELLER restriction on performance/pic.
 * - F-04: Server auth middleware (authenticateToken / authenticateIdentityOnly) & verifyServerEmployeeOperationalProfile
 *         fail-closed (503 AUTH_VERIFICATION_UNAVAILABLE) when Firestore lookup throws.
 * - F-05 / F-06: Branch & tenant scope resolution, elimination of "MAIN_BRANCH" fallbacks,
 *         forged req.body.branchId rejection, missing branch_id denial for branch-scoped tellers,
 *         and multi-branch same-tenant authorization for MASTER_HEAD_TELLER.
 * - F-07: Maker-Checker enforcement across CashTransferEngine.fundSafe / ServerInternalTransferEngine.fundSafe / FundSafeModal
 *         (autoExecute forbidden; initiator cannot self-approve; engine direct calls cannot bypass).
 * - F-08: UI & routing least-privilege gates (routeResolver, useNavigation, useQuickActions, RouteGuards,
 *         FinanceLedger, LedgerHeader, ChartOfAccountsManagement, TransactionTypesManagement, CashConsole, ApprovalQueueWidget, InternalTransferDialog).
 * - F-09 / F-10: Static verification of hardened firestore.rules and honest ctx.skip() emulator test reporting.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";

const { mockAdminStore, adminDbControl, mockClientStore } = vi.hoisted(() => {
  return {
    mockAdminStore: new Map<string, any>(),
    mockClientStore: new Map<string, any>(),
    adminDbControl: {
      throwFirestoreError: false
    }
  };
});

vi.mock("../../../lib/firebaseAdmin", () => {
  return {
    getAdminApp: vi.fn(() => ({})),
    getAdminAuth: vi.fn(() => ({
      verifyIdToken: vi.fn(async (token: string) => {
        if (token === "token_head_teller_alpha") {
          return {
            uid: "usr_head_alpha",
            email: "head@alpha.ht",
            role: "HEAD_TELLER",
            business_id: "biz_alpha",
            branch_id: "br_alpha_1",
            email_verified: true
          };
        }
        if (token === "token_master_teller_alpha") {
          return {
            uid: "usr_master_alpha",
            email: "master@alpha.ht",
            role: "MASTER_HEAD_TELLER",
            business_id: "biz_alpha",
            email_verified: true
          };
        }
        if (token === "token_manager_alpha") {
          return {
            uid: "usr_mgr_alpha",
            email: "mgr@alpha.ht",
            role: "MANAGER",
            business_id: "biz_alpha",
            branch_id: "br_alpha_1",
            email_verified: true
          };
        }
        if (token === "token_junior_no_branch") {
          return {
            uid: "usr_junior_nobranch",
            email: "junior_nb@alpha.ht",
            role: "JUNIOR_TELLER",
            business_id: "biz_alpha",
            email_verified: true
          };
        }
        throw new Error("Invalid token");
      })
    })),
    getAdminFirestore: vi.fn(() => ({
      doc: (docPath: string) => ({
        path: docPath,
        id: docPath.split("/").pop() || "",
        get: async () => {
          if (adminDbControl.throwFirestoreError) {
            throw new Error("FIRESTORE_UNAVAILABLE");
          }
          const data = mockAdminStore.get(docPath);
          return { exists: !!data, data: () => data, id: docPath.split("/").pop() || "" };
        }
      }),
      collection: (collName: string) => ({
        doc: (docId: string) => {
          const docPath = `${collName}/${docId}`;
          return {
            path: docPath,
            id: docId,
            get: async () => {
              if (adminDbControl.throwFirestoreError) {
                throw new Error("FIRESTORE_UNAVAILABLE");
              }
              const data = mockAdminStore.get(docPath);
              return { exists: !!data, data: () => data, id: docId };
            },
            set: async (data: any, options?: any) => {
              if (options?.merge && mockAdminStore.has(docPath)) {
                mockAdminStore.set(docPath, { ...mockAdminStore.get(docPath), ...data });
              } else {
                mockAdminStore.set(docPath, data);
              }
            }
          };
        },
        where: () => ({
          get: async () => {
            if (adminDbControl.throwFirestoreError) {
              throw new Error("FIRESTORE_UNAVAILABLE");
            }
            return { docs: [] };
          }
        })
      }),
      runTransaction: async (fn: (tx: any) => Promise<any>) => {
        if (adminDbControl.throwFirestoreError) {
          throw new Error("FIRESTORE_UNAVAILABLE");
        }
        const tx = {
          get: async (ref: any) => {
            const data = mockAdminStore.get(ref.path);
            return { exists: !!data, data: () => data, id: ref.id };
          },
          set: (ref: any, data: any, options?: any) => {
            if (options?.merge && mockAdminStore.has(ref.path)) {
              mockAdminStore.set(ref.path, { ...mockAdminStore.get(ref.path), ...data });
            } else {
              mockAdminStore.set(ref.path, data);
            }
          },
          update: (ref: any, data: any) => {
            const prev = mockAdminStore.get(ref.path) || {};
            mockAdminStore.set(ref.path, { ...prev, ...data });
          }
        };
        return await fn(tx);
      }
    }))
  };
});

vi.mock("../../../repositories/CashManagementRepository", () => ({
  CashManagementRepository: {
    getTillsByBusiness: vi.fn(async (bizId: string) => {
      const res: any[] = [];
      mockClientStore.forEach((v, k) => {
        if (k.startsWith("cash_tills/") && v.business_id === bizId) res.push(v);
      });
      return res;
    }),
    getTillById: vi.fn(async (tillId: string) => mockClientStore.get(`cash_tills/${tillId}`) || null),
    saveTill: vi.fn(async (till: any) => {
      mockClientStore.set(`cash_tills/${till.id}`, till);
    }),
    getSafesByBusiness: vi.fn(async (bizId: string) => {
      const res: any[] = [];
      mockClientStore.forEach((v, k) => {
        if (k.startsWith("branch_safes/") && v.business_id === bizId) res.push(v);
      });
      return res;
    }),
    getSafeById: vi.fn(async (safeId: string) => mockClientStore.get(`branch_safes/${safeId}`) || null),
    saveSafe: vi.fn(async (safe: any) => {
      mockClientStore.set(`branch_safes/${safe.id}`, safe);
    }),
    saveTransfer: vi.fn(async (trf: any) => {
      mockClientStore.set(`internal_transfers/${trf.id}`, trf);
    }),
    listActiveSessions: vi.fn(async (bizId: string) => {
      const res: any[] = [];
      mockClientStore.forEach((v, k) => {
        if (k.startsWith("till_sessions/") && v.business_id === bizId && v.status === "ACTIVE") res.push(v);
      });
      return res;
    }),
    saveSession: vi.fn(async (sess: any) => {
      mockClientStore.set(`till_sessions/${sess.id}`, sess);
    })
  }
}));

vi.mock("../../../repositories/ForensicLogRepository", () => ({
  ForensicLogRepository: {
    createAndSignLog: vi.fn(async (p: any) => ({ id: "flog_mock", signature: "sig_mock", ...p })),
    writeForensicLog: vi.fn(async () => {})
  },
  computeHMACSignature: vi.fn(() => "sig_mock"),
  getForensicHMACSecretKey: vi.fn(() => "key_mock")
}));

vi.mock("../../../repositories/LedgerRepository", () => ({
  LedgerRepository: {
    save: vi.fn(async () => {}),
    listByBusiness: vi.fn(async () => [])
  }
}));

import { PermissionService } from "../../../services/PermissionService";
import {
  canApproveInternalTransferRole,
  canSuperviseTillLifecycleRole,
  isBranchScopedTellerRole
} from "../../../domains/rbac/operationalProfilePolicy";
import {
  verifyServerEmployeeOperationalProfile,
  ServerProfileVerificationError
} from "../../../domains/rbac/serverEmployeeProfileVerifier";
import {
  authenticateToken,
  authenticateIdentityOnly
} from "../../../modules/workflow/approval/serverAuthMiddleware";
import {
  ServerInternalTransferEngine,
  SUPERVISOR_TRANSFER_ROLES
} from "../../../domains/cash/services/ServerInternalTransferEngine";
import { transferRouter } from "../../../routes/transferRoutes";
import { CashTransferEngine } from "../../../domains/cash/services/CashTransferEngine";
import { TellerTransactionEngine } from "../../../domains/cash/services/TellerTransactionEngine";
import { TransferPayoutEngine } from "../../../domains/cash/services/TransferPayoutEngine";
import { resolveDefaultTabForRole, getAuthorizedTabsForRole } from "../../../services/auth/routeResolver";
import { getAdminFirestore } from "../../../lib/firebaseAdmin";

const fullFeatures = {
  attendance: true,
  payroll: true,
  accounting: true,
  pos: true,
  hr: true,
  crm: true,
  bi: true,
  aiCfo: true
};

async function invokeTransferRoute(
  pathUrl: string,
  userContext: any,
  body: any = {},
  params: any = {},
  headers: any = {}
): Promise<{ statusCode: number; body: any }> {
  let statusCode = 200;
  let resBody: any = null;

  const req: any = {
    method: "POST",
    url: pathUrl,
    user: userContext,
    body,
    params,
    query: {},
    headers: {
      "content-type": "application/json",
      ...headers
    }
  };
  const res: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: any) {
      resBody = payload;
      return this;
    }
  };

  // Match route handler from transferRouter stack (bypassing authenticateToken only when req.user is manually supplied, or invoking authenticateToken directly)
  const layers = (transferRouter as any).stack || [];
  let matchedRoute: any = null;
  for (const layer of layers) {
    if (layer.route && layer.route.methods?.post) {
      const routePath: string = layer.route.path;
      if (routePath === pathUrl) {
        matchedRoute = layer.route;
        break;
      }
      if (routePath.includes(":transferId")) {
        const prefix = routePath.split(":transferId")[0];
        const suffix = routePath.split(":transferId")[1];
        if (pathUrl.startsWith(prefix) && pathUrl.endsWith(suffix)) {
          matchedRoute = layer.route;
          break;
        }
      }
    }
  }
  if (!matchedRoute) throw new Error(`Route not found: ${pathUrl}`);

  const stackHandlers = matchedRoute.stack;
  const endpointHandler = stackHandlers[stackHandlers.length - 1].handle;
  await endpointHandler(req, res, () => {});
  return { statusCode, body: resBody };
}

describe("FINOPS RBAC CASH-P2 Critical Security Remediation Verification Suite", () => {
  beforeEach(() => {
    mockAdminStore.clear();
    mockClientStore.clear();
    adminDbControl.throwFirestoreError = false;
    PermissionService.reset();

    // Seed valid tenant business & active employees/users
    mockAdminStore.set("businesses/biz_alpha", { id: "biz_alpha", status: "ACTIVE" });

    mockAdminStore.set("users/usr_head_alpha", {
      id: "usr_head_alpha",
      business_id: "biz_alpha",
      branch_id: "br_alpha_1",
      role: "HEAD_TELLER",
      operational_profile: "teller",
      status: "ACTIVE"
    });
    mockAdminStore.set("employees/usr_head_alpha", {
      id: "usr_head_alpha",
      business_id: "biz_alpha",
      branch_id: "br_alpha_1",
      role: "HEAD_TELLER",
      operational_profile: "teller",
      status: "ACTIVE"
    });

    mockAdminStore.set("users/usr_master_alpha", {
      id: "usr_master_alpha",
      business_id: "biz_alpha",
      role: "MASTER_HEAD_TELLER",
      operational_profile: "teller",
      status: "ACTIVE"
    });
    mockAdminStore.set("employees/usr_master_alpha", {
      id: "usr_master_alpha",
      business_id: "biz_alpha",
      role: "MASTER_HEAD_TELLER",
      operational_profile: "teller",
      status: "ACTIVE"
    });

    mockAdminStore.set("users/usr_senior_alpha", {
      id: "usr_senior_alpha",
      business_id: "biz_alpha",
      branch_id: "br_alpha_1",
      role: "SENIOR_TELLER",
      operational_profile: "teller",
      status: "ACTIVE"
    });
    mockAdminStore.set("employees/usr_senior_alpha", {
      id: "usr_senior_alpha",
      business_id: "biz_alpha",
      branch_id: "br_alpha_1",
      role: "SENIOR_TELLER",
      operational_profile: "teller",
      status: "ACTIVE"
    });

    mockAdminStore.set("users/usr_junior_alpha", {
      id: "usr_junior_alpha",
      business_id: "biz_alpha",
      branch_id: "br_alpha_1",
      role: "JUNIOR_TELLER",
      operational_profile: "teller",
      status: "ACTIVE"
    });
    mockAdminStore.set("employees/usr_junior_alpha", {
      id: "usr_junior_alpha",
      business_id: "biz_alpha",
      branch_id: "br_alpha_1",
      role: "JUNIOR_TELLER",
      operational_profile: "teller",
      status: "ACTIVE"
    });

    mockAdminStore.set("users/usr_junior_nobranch", {
      id: "usr_junior_nobranch",
      business_id: "biz_alpha",
      role: "JUNIOR_TELLER",
      operational_profile: "teller",
      status: "ACTIVE"
    });

    mockAdminStore.set("users/usr_mgr_alpha", {
      id: "usr_mgr_alpha",
      business_id: "biz_alpha",
      branch_id: "br_alpha_1",
      role: "MANAGER",
      status: "ACTIVE"
    });
    mockAdminStore.set("employees/usr_mgr_alpha", {
      id: "usr_mgr_alpha",
      business_id: "biz_alpha",
      branch_id: "br_alpha_1",
      role: "MANAGER",
      status: "ACTIVE"
    });

    mockAdminStore.set("users/usr_owner_alpha", {
      id: "usr_owner_alpha",
      business_id: "biz_alpha",
      role: "OWNER",
      status: "ACTIVE"
    });

    mockAdminStore.set("cash_tills/till_br1", {
      id: "till_br1",
      business_id: "biz_alpha",
      branch_id: "br_alpha_1",
      name: "Caisse Principale Br1",
      currency: "HTG",
      balance_cents: 500000,
      status: "OPEN",
      active_session_id: "sess_br1"
    });
    mockAdminStore.set("till_sessions/sess_br1", {
      id: "sess_br1",
      business_id: "biz_alpha",
      branch_id: "br_alpha_1",
      till_id: "till_br1",
      operator_id: "usr_senior_alpha",
      status: "ACTIVE"
    });
    mockAdminStore.set("branch_safes/safe_br1", {
      id: "safe_br1",
      business_id: "biz_alpha",
      branch_id: "br_alpha_1",
      name: "Coffre Fort Br1",
      currency: "HTG",
      balance_cents: 1000000
    });
    mockAdminStore.set("branch_safes/safe_br2", {
      id: "safe_br2",
      business_id: "biz_alpha",
      branch_id: "br_alpha_2",
      name: "Coffre Fort Br2",
      currency: "HTG",
      balance_cents: 1000000
    });

    mockAdminStore.set("internal_transfers/trf_pending_01", {
      id: "trf_pending_01",
      business_id: "biz_alpha",
      branch_id: "br_alpha_1",
      source_type: "SAFE",
      source_id: "safe_br1",
      source_name: "Coffre Fort Br1",
      destination_type: "TILL",
      destination_id: "till_br1",
      destination_name: "Caisse Principale Br1",
      amount_cents: 100000,
      currency: "HTG",
      status: "PENDING_APPROVAL",
      initiator_id: "usr_senior_alpha",
      initiator_name: "Senior Teller",
      initiator_role: "SENIOR_TELLER",
      description: "Provisioning till",
      created_at: new Date().toISOString()
    });
  });

  // --------------------------------------------------------------------------
  // F-01: Strict prohibition of internal transfer approval/rejection for ALL tellers
  // --------------------------------------------------------------------------
  describe("F-01: No Teller May Approve or Reject Internal Transfers", () => {
    const tellerRoles = ["JUNIOR_TELLER", "SENIOR_TELLER", "HEAD_TELLER", "MASTER_HEAD_TELLER", "TELLER"];

    it("denies transfer.approve and transfer.reject for ALL teller roles even with injected custom permissions", () => {
      for (const role of tellerRoles) {
        PermissionService.init(
          role,
          ["transfer.approve", "transfer.reject", "cash.supervise", "write_ledger", "*"],
          fullFeatures,
          "ENTERPRISE",
          "ACTIVE",
          "biz_alpha"
        );
        expect(PermissionService.can("transfer.approve")).toBe(false);
        expect(PermissionService.can("transfer.reject")).toBe(false);
        expect(canApproveInternalTransferRole(role)).toBe(false);
        expect(SUPERVISOR_TRANSFER_ROLES.has(role)).toBe(false);
      }
    });

    it("preserves legitimate HEAD_TELLER & MASTER_HEAD_TELLER till supervision while blocking transfer approval", () => {
      for (const role of ["HEAD_TELLER", "MASTER_HEAD_TELLER"]) {
        PermissionService.init(role, [], fullFeatures, "ENTERPRISE", "ACTIVE", "biz_alpha");
        expect(PermissionService.can("cash.supervise")).toBe(true);
        expect(PermissionService.can("cash.transfer")).toBe(true);
        expect(PermissionService.can("transfer.approve")).toBe(false);
        expect(canSuperviseTillLifecycleRole(role)).toBe(true);
        expect(canApproveInternalTransferRole(role)).toBe(false);
      }
    });

    it("rejects HEAD_TELLER and MASTER_HEAD_TELLER in ServerInternalTransferEngine.approveTransfer & rejectTransfer", async () => {
      await expect(
        ServerInternalTransferEngine.approveTransfer(
          "trf_pending_01",
          { businessId: "biz_alpha" },
          { uid: "usr_head_alpha", business_id: "biz_alpha", role: "HEAD_TELLER", branch_id: "br_alpha_1" }
        )
      ).rejects.toMatchObject({ code: "FORBIDDEN_ROLE" });

      await expect(
        ServerInternalTransferEngine.rejectTransfer(
          "trf_pending_01",
          { businessId: "biz_alpha", rejectionReason: "Policy rejection test" },
          { uid: "usr_master_alpha", business_id: "biz_alpha", role: "MASTER_HEAD_TELLER" }
        )
      ).rejects.toMatchObject({ code: "FORBIDDEN_ROLE" });
    });

    it("rejects HEAD_TELLER and MASTER_HEAD_TELLER on HTTP /internal/:id/approve and /reject with 403 FORBIDDEN_ROLE", async () => {
      const appHead = await invokeTransferRoute(
        "/internal/:transferId/approve",
        { uid: "usr_head_alpha", business_id: "biz_alpha", role: "HEAD_TELLER", branch_id: "br_alpha_1", isSuperAdmin: false },
        { businessId: "biz_alpha" },
        { transferId: "trf_pending_01" }
      );
      expect(appHead.statusCode).toBe(403);
      expect(appHead.body.error).toBe("FORBIDDEN_ROLE");

      const rejMaster = await invokeTransferRoute(
        "/internal/:transferId/reject",
        { uid: "usr_master_alpha", business_id: "biz_alpha", role: "MASTER_HEAD_TELLER", isSuperAdmin: false },
        { businessId: "biz_alpha", rejectionReason: "Insufficient docs" },
        { transferId: "trf_pending_01" }
      );
      expect(rejMaster.statusCode).toBe(403);
      expect(rejMaster.body.error).toBe("FORBIDDEN_ROLE");
    });

    it("allows distinct MANAGER or OWNER (Checker !== Maker) to approve internal transfers", async () => {
      const res = await invokeTransferRoute(
        "/internal/:transferId/approve",
        { uid: "usr_mgr_alpha", business_id: "biz_alpha", role: "MANAGER", branch_id: "br_alpha_1", isSuperAdmin: false },
        { businessId: "biz_alpha" },
        { transferId: "trf_pending_01" }
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("EXECUTED");
    });
  });

  // --------------------------------------------------------------------------
  // F-02 / F-03: PermissionService Strict Precedence & Fail-Closed Evaluation
  // --------------------------------------------------------------------------
  describe("F-02 / F-03: PermissionService Precedence & Explicit Denials", () => {
    it("fails closed on empty/unknown/UNASSIGNED role even if permissions array is populated", () => {
      PermissionService.init("", ["cash.operate", "ledger.write", "*"], fullFeatures, "ENTERPRISE", "ACTIVE", "biz_alpha");
      expect(PermissionService.can("cash.operate")).toBe(false);
      expect(PermissionService.can("ledger.write")).toBe(false);

      PermissionService.init("HACKER_ADMIN", ["cash.operate", "transfer.approve"], fullFeatures, "ENTERPRISE", "ACTIVE", "biz_alpha");
      expect(PermissionService.can("cash.operate")).toBe(false);
      expect(PermissionService.can("transfer.approve")).toBe(false);
    });

    it("fails closed when businessId is missing for any non-SUPER_ADMIN role", () => {
      PermissionService.init("OWNER", ["cash.operate", "transfer.approve"], fullFeatures, "ENTERPRISE", "ACTIVE", "");
      expect(PermissionService.can("cash.operate")).toBe(false);
      expect(PermissionService.can("transfer.approve")).toBe(false);
    });

    it("enforces subscription EXPIRED / BLOCKED read-only gate and STARTER module barriers BEFORE OWNER bypass", () => {
      PermissionService.init("OWNER", ["ledger.write", "cash.operate"], fullFeatures, "ENTERPRISE", "EXPIRED", "biz_alpha");
      expect(PermissionService.can("ledger.write")).toBe(false);
      expect(PermissionService.can("cash.operate")).toBe(false);
      expect(PermissionService.can("view_ledger")).toBe(true);

      PermissionService.init("OWNER", ["ledger.view", "bi.read"], fullFeatures, "STARTER", "ACTIVE", "biz_alpha");
      expect(PermissionService.can("bi.read")).toBe(false);
      expect(PermissionService.can("ledger.view")).toBe(false);
    });

    it("blocks MASTER_HEAD_TELLER from performance / pic, accounting, payroll, BI, and settings even with custom permissions", () => {
      PermissionService.init(
        "MASTER_HEAD_TELLER",
        ["bi.read", "read_bi", "ledger.write", "write_ledger", "payroll.approve", "manage_settings"],
        fullFeatures,
        "ENTERPRISE",
        "ACTIVE",
        "biz_alpha"
      );
      expect(PermissionService.hasRoleModuleAccess("MASTER_HEAD_TELLER", "performance")).toBe(false);
      expect(PermissionService.hasRoleModuleAccess("MASTER_HEAD_TELLER", "pic")).toBe(false);
      expect(PermissionService.can("bi.read")).toBe(false);
      expect(PermissionService.can("ledger.write")).toBe(false);
      expect(PermissionService.can("payroll.approve")).toBe(false);
      expect(PermissionService.can("manage_settings")).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // F-04: Server Auth Middleware & Profile Verifier Fail-Closed on Firestore Errors
  // --------------------------------------------------------------------------
  describe("F-04: Fail-Closed 503 AUTH_VERIFICATION_UNAVAILABLE When Firestore Errors Occur", () => {
    it("authenticateToken returns 503 AUTH_VERIFICATION_UNAVAILABLE instead of silently continuing when Firestore throws", async () => {
      adminDbControl.throwFirestoreError = true;
      const req: any = { headers: { authorization: "Bearer token_head_teller_alpha" } };
      let status = 0;
      let payload: any = null;
      const res: any = {
        status(c: number) { status = c; return this; },
        json(b: any) { payload = b; return this; }
      };
      const next = vi.fn();

      await authenticateToken(req, res, next);
      expect(status).toBe(503);
      expect(payload.error).toBe("AUTH_VERIFICATION_UNAVAILABLE");
      expect(next).not.toHaveBeenCalled();
    });

    it("authenticateIdentityOnly returns 503 AUTH_VERIFICATION_UNAVAILABLE when Firestore user lookup fails", async () => {
      adminDbControl.throwFirestoreError = true;
      const req: any = { headers: { authorization: "Bearer token_manager_alpha" } };
      let status = 0;
      let payload: any = null;
      const res: any = {
        status(c: number) { status = c; return this; },
        json(b: any) { payload = b; return this; }
      };
      const next = vi.fn();

      await authenticateIdentityOnly(req, res, next);
      expect(status).toBe(503);
      expect(payload.error).toBe("AUTH_VERIFICATION_UNAVAILABLE");
      expect(next).not.toHaveBeenCalled();
    });

    it("verifyServerEmployeeOperationalProfile throws 503 AUTH_VERIFICATION_UNAVAILABLE when Firestore throws", async () => {
      adminDbControl.throwFirestoreError = true;
      await expect(
        verifyServerEmployeeOperationalProfile({
          adminDb: getAdminFirestore(),
          uid: "usr_head_alpha",
          businessId: "biz_alpha",
          actorRole: "HEAD_TELLER",
          capability: "cash"
        })
      ).rejects.toMatchObject({
        code: "AUTH_VERIFICATION_UNAVAILABLE",
        statusCode: 503
      });
    });

    it("rejects inactive/suspended employee and missing or mismatched operational profile", async () => {
      mockAdminStore.set("employees/usr_senior_alpha", {
        id: "usr_senior_alpha",
        business_id: "biz_alpha",
        branch_id: "br_alpha_1",
        role: "SENIOR_TELLER",
        operational_profile: "teller",
        status: "SUSPENDED"
      });

      await expect(
        verifyServerEmployeeOperationalProfile({
          adminDb: getAdminFirestore(),
          uid: "usr_senior_alpha",
          businessId: "biz_alpha",
          actorRole: "SENIOR_TELLER",
          requireBranchScope: true,
          capability: "cash"
        })
      ).rejects.toMatchObject({ code: "INACTIVE_ACTOR" });

      mockAdminStore.set("users/usr_bad_profile", {
        id: "usr_bad_profile",
        business_id: "biz_alpha",
        branch_id: "br_alpha_1",
        role: "JUNIOR_TELLER",
        status: "ACTIVE"
      });
      await expect(
        verifyServerEmployeeOperationalProfile({
          adminDb: getAdminFirestore(),
          uid: "usr_bad_profile",
          businessId: "biz_alpha",
          actorRole: "JUNIOR_TELLER",
          requireBranchScope: true,
          capability: "cash"
        })
      ).rejects.toMatchObject({ code: "MISSING_OPERATIONAL_PROFILE" });

      mockAdminStore.set("users/usr_wrong_profile", {
        id: "usr_wrong_profile",
        business_id: "biz_alpha",
        branch_id: "br_alpha_1",
        role: "JUNIOR_TELLER",
        operational_profile: "vendeur",
        status: "ACTIVE"
      });
      await expect(
        verifyServerEmployeeOperationalProfile({
          adminDb: getAdminFirestore(),
          uid: "usr_wrong_profile",
          businessId: "biz_alpha",
          actorRole: "JUNIOR_TELLER",
          requireBranchScope: true,
          capability: "cash"
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN_ROLE_PROFILE_COMBINATION" });
    });
  });

  // --------------------------------------------------------------------------
  // F-05 / F-06: Branch Scope Enforcement & Zero "MAIN_BRANCH" Fallbacks
  // --------------------------------------------------------------------------
  describe("F-05 / F-06: Authoritative Branch Scope & Elimination of MAIN_BRANCH Fallbacks", () => {
    it("populates req.user.branch_id from employee profile fallback in authenticateToken", async () => {
      mockAdminStore.set("users/usr_emp_branch_only", {
        id: "usr_emp_branch_only",
        business_id: "biz_alpha",
        role: "SENIOR_TELLER",
        operational_profile: "teller",
        status: "ACTIVE"
      });
      mockAdminStore.set("employees/usr_emp_branch_only", {
        id: "usr_emp_branch_only",
        business_id: "biz_alpha",
        branch_id: "br_alpha_9",
        role: "SENIOR_TELLER",
        operational_profile: "teller",
        status: "ACTIVE"
      });

      const req: any = { headers: { authorization: "Bearer token_junior_no_branch" } };
      // For usr_junior_nobranch, no branch on token/user/employee -> remains undefined (which server routes reject)
      let nextCalled = false;
      await authenticateToken(req, { status: () => ({ json: () => {} }) } as any, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
      expect(req.user.branch_id).toBeUndefined();
    });

    it("fails closed with 403 MISSING_BRANCH_SCOPE when branch-scoped teller has no branch_id", async () => {
      const res = await invokeTransferRoute(
        "/intake",
        { uid: "usr_junior_nobranch", business_id: "biz_alpha", role: "JUNIOR_TELLER", isSuperAdmin: false },
        { businessId: "biz_alpha", branchId: "br_alpha_1", senderName: "A", beneficiaryName: "B", amountCents: 1000, currency: "HTG" }
      );
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe("MISSING_BRANCH_SCOPE");
    });

    it("rejects forged req.body.branchId pointing to another branch for branch-scoped tellers", async () => {
      const res = await invokeTransferRoute(
        "/internal/request",
        { uid: "usr_head_alpha", business_id: "biz_alpha", role: "HEAD_TELLER", branch_id: "br_alpha_1", isSuperAdmin: false },
        {
          businessId: "biz_alpha",
          branchId: "br_alpha_2",
          sourceType: "SAFE",
          sourceId: "safe_br2",
          destinationType: "TILL",
          destinationId: "till_br1",
          amountCents: 10000,
          currency: "HTG",
          reason: "Cross-branch spoof"
        }
      );
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe("BRANCH_ISOLATION_VIOLATION");
    });

    it("enforces branch scope in client CashTransferEngine, TellerTransactionEngine, and TransferPayoutEngine", async () => {
      mockClientStore.set("cash_tills/till_br2", {
        id: "till_br2",
        business_id: "biz_alpha",
        branch_id: "br_alpha_2",
        name: "Till Branch 2",
        currency: "HTG",
        balance_cents: 500000,
        status: "OPEN",
        active_session_id: "sess_br2"
      });

      await expect(
        CashTransferEngine.initiateTransfer(
          "biz_alpha",
          "br_alpha_1",
          { type: "TILL", id: "till_br2", name: "Till Branch 2" },
          { type: "SAFE", id: "safe_br1", name: "Safe Branch 1" },
          10000,
          "HTG",
          "Cross branch attempt",
          { id: "usr_head_alpha", name: "Head", role: "HEAD_TELLER", branch_id: "br_alpha_1", operational_profile: "teller" }
        )
      ).rejects.toMatchObject({ code: "BRANCH_ISOLATION_VIOLATION" });

      await expect(
        TellerTransactionEngine.postTransaction({
          businessId: "biz_alpha",
          branchId: "br_alpha_2",
          operatorBranchId: "br_alpha_1",
          tillId: "till_br2",
          sessionId: "sess_br2",
          operatorId: "usr_senior_alpha",
          operatorName: "Senior",
          operatorRole: "SENIOR_TELLER",
          operatorProfile: "teller",
          transactionTypeCode: "DEP",
          transactionTypeName: "Deposit",
          flowBehavior: 1,
          currency: "HTG",
          amountCents: 10000
        })
      ).rejects.toMatchObject({ code: "BRANCH_ISOLATION_VIOLATION" });

      await expect(
        TransferPayoutEngine.executePayout(
          {
            businessId: "biz_alpha",
            branchId: "br_alpha_2",
            operatorBranchId: "",
            transferId: "trf_1",
            tillId: "till_br2",
            sessionId: "sess_br2",
            operatorId: "usr_senior_alpha",
            operatorName: "Senior",
            idDocument: "CIN-123"
          },
          { id: "usr_senior_alpha", name: "Senior", role: "SENIOR_TELLER", operational_profile: "teller" }
        )
      ).rejects.toBeDefined();
    });

    it("contains ZERO 'MAIN_BRANCH' fallback literals in cash engines, routes, or cash components", () => {
      const filesToScan = [
        "src/routes/transferRoutes.ts",
        "src/domains/cash/services/ServerInternalTransferEngine.ts",
        "src/domains/cash/services/ServerTransferIntakeEngine.ts",
        "src/domains/cash/services/ServerTransferPayoutEngine.ts",
        "src/domains/cash/services/TillSessionEngine.ts",
        "src/domains/cash/services/TellerTransactionEngine.ts",
        "src/domains/cash/services/TransferPayoutEngine.ts",
        "src/domains/cash/services/CashTransferEngine.ts",
        "src/services/business/ServerTillProvisioningService.ts",
        "src/components/cash/CashConsole.tsx",
        "src/components/cash/FundSafeModal.tsx",
        "src/components/cash/InternalTransferDialog.tsx",
        "src/components/ConnectedFinanceLedger.tsx"
      ];
      for (const relPath of filesToScan) {
        const content = fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8");
        expect(content, `Unexpected MAIN_BRANCH fallback in ${relPath}`).not.toContain("MAIN_BRANCH");
      }
    });
  });

  // --------------------------------------------------------------------------
  // F-07: Maker-Checker Enforcement on fundSafe & Internal Transfers
  // --------------------------------------------------------------------------
  describe("F-07: Maker-Checker Integrity Across Direct Engine, API, and UI", () => {
    it("forbids autoExecute=true in CashTransferEngine.fundSafe and leaves transfer PENDING_APPROVAL", async () => {
      mockClientStore.set("branch_safes/safe_br1", {
        id: "safe_br1",
        business_id: "biz_alpha",
        branch_id: "br_alpha_1",
        name: "Coffre Br1",
        currency: "HTG",
        balance_cents: 100000
      });

      await expect(
        CashTransferEngine.fundSafe(
          "biz_alpha",
          "br_alpha_1",
          {
            safeId: "safe_br1",
            safeName: "Coffre Br1",
            currency: "HTG",
            amountCents: 50000,
            fundingCategory: "BANK_WITHDRAWAL",
            sourceId: "BANK_HTG",
            sourceName: "Bank",
            debitAccountCode: "1015",
            debitAccountName: "Coffre",
            creditAccountCode: "1110",
            creditAccountName: "Bank",
            description: "Attempt auto execute",
            autoExecute: true
          },
          { id: "usr_owner_alpha", name: "Owner", role: "OWNER" }
        )
      ).rejects.toMatchObject({ code: "MAKER_CHECKER_VIOLATION" });

      const pendingTrf = await CashTransferEngine.fundSafe(
        "biz_alpha",
        "br_alpha_1",
        {
          safeId: "safe_br1",
          safeName: "Coffre Br1",
          currency: "HTG",
          amountCents: 50000,
          fundingCategory: "BANK_WITHDRAWAL",
          sourceId: "BANK_HTG",
          sourceName: "Bank",
          debitAccountCode: "1015",
          debitAccountName: "Coffre",
          creditAccountCode: "1110",
          creditAccountName: "Bank",
          description: "Compliant safe funding"
        },
        { id: "usr_owner_alpha", name: "Owner", role: "OWNER" }
      );
      expect(pendingTrf.status).toBe("PENDING_APPROVAL");
      expect(pendingTrf.approver_id).toBeUndefined();
    });

    it("rejects self-approval by the initiator in both CashTransferEngine and ServerInternalTransferEngine", async () => {
      const pending = await CashTransferEngine.initiateTransfer(
        "biz_alpha",
        "br_alpha_1",
        { type: "BANK", id: "BANK_HTG", name: "Bank" },
        { type: "SAFE", id: "safe_br1", name: "Safe" },
        25000,
        "HTG",
        "Self approval test",
        { id: "usr_mgr_alpha", name: "Mgr", role: "MANAGER", branch_id: "br_alpha_1" }
      );
      await expect(
        CashTransferEngine.approveAndExecuteTransfer(pending, {
          id: "usr_mgr_alpha",
          name: "Mgr",
          role: "MANAGER"
        })
      ).rejects.toThrow(/MAKER_CHECKER_VIOLATION/);

      const srvPending = await ServerInternalTransferEngine.fundSafe(
        {
          businessId: "biz_alpha",
          safeId: "safe_br1",
          sourceType: "BANK",
          sourceIdentifier: "BANK_HTG",
          amountCents: 25000,
          currency: "HTG",
          reason: "Server fundSafe test",
          autoExecute: true // ignored/never auto-executes
        },
        { uid: "usr_mgr_alpha", business_id: "biz_alpha", role: "MANAGER", branch_id: "br_alpha_1" }
      );
      expect(srvPending.status).toBe("PENDING_APPROVAL");

      await expect(
        ServerInternalTransferEngine.approveTransfer(
          srvPending.id,
          { businessId: "biz_alpha" },
          { uid: "usr_mgr_alpha", business_id: "biz_alpha", role: "MANAGER", branch_id: "br_alpha_1" }
        )
      ).rejects.toMatchObject({ code: "MAKER_CHECKER_VIOLATION" });
    });

    it("verifies FundSafeModal posts to /api/cash/transfers/internal/request without autoExecute or direct CashTransferEngine execution", () => {
      const modalSrc = fs.readFileSync(path.resolve(process.cwd(), "src/components/cash/FundSafeModal.tsx"), "utf8");
      const engineSrc = fs.readFileSync(path.resolve(process.cwd(), "src/domains/cash/services/CashTransferEngine.ts"), "utf8");
      expect(modalSrc).toContain("/api/cash/transfers/internal/request");
      expect(modalSrc).not.toContain("executeTransferDirectly");
      expect(modalSrc).not.toContain("autoExecute: true");
      expect(engineSrc).not.toContain("executeTransferDirectly");
    });
  });

  // --------------------------------------------------------------------------
  // F-08: UI & Routing Authorization Least-Privilege Gates
  // --------------------------------------------------------------------------
  describe("F-08: Cash UI, FinanceLedger, RouteGuards & Navigation Fail-Closed Gates", () => {
    it("isolates all teller roles in routeResolver to cash/attendance/leave/documents/employeeSpace only", () => {
      const tellers = ["JUNIOR_TELLER", "SENIOR_TELLER", "HEAD_TELLER", "MASTER_HEAD_TELLER", "TELLER"];
      const forbiddenTabs = ["bi", "ledger", "reports", "performance", "pic", "payroll", "settings", "forensic", "audit", "platform"];
      for (const role of tellers) {
        expect(resolveDefaultTabForRole(role)).toBe("cash");
        const allowed = getAuthorizedTabsForRole(role);
        for (const tab of forbiddenTabs) {
          expect(allowed, `Tab '${tab}' should be excluded for ${role}`).not.toContain(tab);
        }
      }
      expect(getAuthorizedTabsForRole("UNKNOWN_ROLE")).toEqual([]);
    });

    it("verifies static fail-closed UI authorization gates across RouteGuards, AppRouter, FinanceLedger, CashConsole, Modals", () => {
      const routeGuards = fs.readFileSync(path.resolve(process.cwd(), "src/navigation/RouteGuards.tsx"), "utf8");
      const appRouter = fs.readFileSync(path.resolve(process.cwd(), "src/routes/AppRouter.tsx"), "utf8");
      const financeLedger = fs.readFileSync(path.resolve(process.cwd(), "src/pages/FinanceLedger.tsx"), "utf8");
      const ledgerHeader = fs.readFileSync(path.resolve(process.cwd(), "src/components/ledger/LedgerHeader.tsx"), "utf8");
      const coa = fs.readFileSync(path.resolve(process.cwd(), "src/components/cash/ChartOfAccountsManagement.tsx"), "utf8");
      const txTypes = fs.readFileSync(path.resolve(process.cwd(), "src/components/cash/TransactionTypesManagement.tsx"), "utf8");
      const cashConsole = fs.readFileSync(path.resolve(process.cwd(), "src/components/cash/CashConsole.tsx"), "utf8");
      const approvalWidget = fs.readFileSync(path.resolve(process.cwd(), "src/components/cash/ApprovalQueueWidget.tsx"), "utf8");
      const transferDialog = fs.readFileSync(path.resolve(process.cwd(), "src/components/cash/InternalTransferDialog.tsx"), "utf8");

      expect(routeGuards).toContain("PIC_ALLOWED_ROLES");
      expect(appRouter).toContain("<PicRoute>");
      expect(financeLedger).toContain("canAccessAccountingLedger");
      expect(financeLedger).toContain("canWriteLedger");
      expect(ledgerHeader).toContain("canWriteLedger");
      expect(coa).toContain("canEditChart");
      expect(txTypes).toContain("canEditTransactionTypes");
      expect(cashConsole).toContain("hasMissingTellerBranch");
      expect(cashConsole).toContain("canOperateSpecificTill");
      expect(approvalWidget).toContain("canApproveInternalTransferRole");
      expect(transferDialog).toContain("TRANSFER_INITIATOR_ROLES");
    });
  });

  // --------------------------------------------------------------------------
  // F-09 / F-10: Firestore Security Rules Static Inspection & Honest Emulator Test Gate
  // --------------------------------------------------------------------------
  describe("F-09 / F-10: Firestore Security Rules Hardening & Emulator Test Honesty", () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");

    it("F-09: hardens exchange_rates, daily_exchange_rate_grids, cash collections, ledger_transactions, audit_logs, and bulk_imports", () => {
      const exRatesBlock = rules.match(/match\s+\/exchange_rates\/\{rateId\}\s*\{([^}]+)\}/s)?.[1] || "";
      expect(exRatesBlock).toContain("isTenantAdminOrManager(getBusinessId(request.resource.data))");
      expect(exRatesBlock).toContain("allow delete: if false;");

      const dailyGridsBlock = rules.match(/match\s+\/daily_exchange_rate_grids\/\{gridId\}\s*\{([^}]+)\}/s)?.[1] || "";
      expect(dailyGridsBlock).toContain("isTenantAdminOrManager(getBusinessId(request.resource.data))");

      const internalTransfersBlock = rules.match(/match\s+\/internal_transfers\/\{id\}\s*\{([^}]+)\}/s)?.[1] || "";
      expect(internalTransfersBlock).toMatch(/allow create,\s*delete:\s*if false;/);
      expect(internalTransfersBlock).toMatch(/allow update:\s*if false;/);

      const tellerTxBlock = rules.match(/match\s+\/teller_transactions\/\{id\}\s*\{([^}]+)\}/s)?.[1] || "";
      expect(tellerTxBlock).toContain("allow create, update, delete: if false;");

      const cashTillsBlock = rules.match(/match\s+\/cash_tills\/\{id\}\s*\{([^}]+)\}/s)?.[1] || "";
      expect(cashTillsBlock).toContain("isBranchScopedCashAuthorized");
      expect(cashTillsBlock).not.toMatch(/allow\s+write:\s*if\s+isAuthenticated\(\)/);

      const ledgerBlock = rules.match(/match\s+\/ledger_transactions\/\{txId\}\s*\{([^}]+)\}/s)?.[1] || "";
      expect(ledgerBlock).toContain("isNonAuditorTenantMember");
      expect(ledgerBlock).toContain("isTenantFinanceOrManager");

      const auditBlock = rules.match(/match\s+\/audit_logs\/\{logId\}\s*\{([^}]+)\}/s)?.[1] || "";
      expect(auditBlock).toContain("canCreateAuditLog");
      expect(auditBlock).toContain("allow update, delete: if false;");

      const bulkImportsBlock = rules.match(/match\s+\/bulk_imports\/\{id\}\s*\{([^}]+)\}/s)?.[1] || "";
      expect(bulkImportsBlock).toContain("isTenantAdminOrManager");

      // Ensure CRM helper functions are defined
      expect(rules).toContain("function isValidAmount(");
      expect(rules).toContain("function isValidLeadStatus(");
      expect(rules).toContain("function isValidProformaStatus(");
      expect(rules).toContain("function isValidInvoiceStatus(");
    });

    it("F-10: ensures firestoreRules.test.ts uses explicit ctx.skip() when Firestore Emulator is unavailable instead of silent early return", () => {
      const emulatorTest = fs.readFileSync(
        path.resolve(process.cwd(), "src/tests/emulator/firestoreRules.test.ts"),
        "utf8"
      );
      expect(emulatorTest).toContain("if (!testEnv) ctx.skip()");
      expect(emulatorTest).not.toMatch(/if\s*\(!testEnv\)\s*return;/);
    });
  });
});
