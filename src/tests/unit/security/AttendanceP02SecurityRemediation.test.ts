import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { AddressInfo } from "net";

const {
  mockAdminStore,
  mockClientStore,
  mockAuthTokens,
  mockAuthState,
  mockVerifyIdToken,
  mockHooks
} = vi.hoisted(() => {
  return {
    mockAdminStore: new Map<string, any>(),
    mockClientStore: new Map<string, any>(),
    mockAuthTokens: new Map<string, any>(),
    mockAuthState: { currentUser: null as any },
    mockVerifyIdToken: vi.fn(),
    mockHooks: {
      failAuditWrite: false,
      failPayrollQuery: false
    }
  };
});

function buildDocSnapshot(store: Map<string, any>, docPath: string, forClient = false) {
  const data = store.get(docPath);
  const existsVal = data !== undefined;
  return {
    exists: forClient ? () => existsVal : existsVal,
    id: docPath.split("/").pop(),
    data: () => (data ? structuredClone(data) : undefined)
  };
}

function queryStoreCollection(
  store: Map<string, any>,
  colName: string,
  filters: Array<{ field: string; op: string; value: any }>,
  limitCount?: number
) {
  if (mockHooks.failPayrollQuery && colName === "payroll_cycles") {
    throw new Error("Simulated Firestore payroll_cycles unavailable");
  }
  const docs: any[] = [];
  for (const [k, v] of store.entries()) {
    if (!k.startsWith(`${colName}/`) || k.slice(colName.length + 1).includes("/")) {
      continue;
    }
    let matched = true;
    for (const f of filters) {
      const actual = v?.[f.field];
      if (f.op === "==" && actual !== f.value) {
        matched = false;
        break;
      }
      if (f.op === "in" && (!Array.isArray(f.value) || !f.value.includes(actual))) {
        matched = false;
        break;
      }
    }
    if (matched) {
      const id = k.slice(colName.length + 1);
      docs.push({
        id,
        exists: true,
        data: () => structuredClone(v)
      });
    }
  }
  const sliced = typeof limitCount === "number" ? docs.slice(0, limitCount) : docs;
  return {
    empty: sliced.length === 0,
    size: sliced.length,
    docs: sliced
  };
}

function createAdminCollectionRef(
  colPath: string,
  filters: Array<{ field: string; op: string; value: any }> = [],
  limitCount?: number,
  targetStore?: Map<string, any>
): any {
  const activeStore = targetStore || mockAdminStore;
  return {
    where: (field: string, op: string, value: any) =>
      createAdminCollectionRef(colPath, [...filters, { field, op, value }], limitCount, activeStore),
    limit: (n: number) => createAdminCollectionRef(colPath, filters, n, activeStore),
    get: async () => queryStoreCollection(activeStore, colPath, filters, limitCount),
    doc: (docId?: string) => {
      const id = docId || `auto_${Math.random().toString(36).slice(2, 10)}`;
      const fullPath = `${colPath}/${id}`;
      return {
        id,
        path: fullPath,
        collection: (subCol: string) => createAdminCollectionRef(`${fullPath}/${subCol}`, [], undefined, activeStore),
        get: async () => buildDocSnapshot(activeStore, fullPath, false),
        set: async (data: any, opts?: { merge?: boolean }) => {
          if (mockHooks.failAuditWrite && fullPath.startsWith("audit_logs/")) {
            throw new Error("Simulated audit_logs write failure");
          }
          if (opts?.merge) {
            const cur = activeStore.get(fullPath) || {};
            activeStore.set(fullPath, { ...cur, ...structuredClone(data) });
          } else {
            activeStore.set(fullPath, structuredClone(data));
          }
        },
        update: async (data: any) => {
          if (mockHooks.failAuditWrite && fullPath.startsWith("audit_logs/")) {
            throw new Error("Simulated audit_logs write failure");
          }
          const cur = activeStore.get(fullPath) || {};
          activeStore.set(fullPath, { ...cur, ...structuredClone(data) });
        },
        delete: async () => {
          activeStore.delete(fullPath);
        }
      };
    }
  };
}

function makeAdminDb(stagingStore?: Map<string, any>) {
  const activeStore = stagingStore || mockAdminStore;
  return {
    doc: (docPath: string) => ({
      path: docPath,
      id: docPath.split("/").pop(),
      get: async () => buildDocSnapshot(activeStore, docPath, false),
      set: async (data: any, opts?: { merge?: boolean }) => {
        if (mockHooks.failAuditWrite && docPath.startsWith("audit_logs/")) {
          throw new Error("Simulated audit_logs write failure");
        }
        if (opts?.merge) {
          const cur = activeStore.get(docPath) || {};
          activeStore.set(docPath, { ...cur, ...structuredClone(data) });
        } else {
          activeStore.set(docPath, structuredClone(data));
        }
      },
      update: async (data: any) => {
        const cur = activeStore.get(docPath) || {};
        activeStore.set(docPath, { ...cur, ...structuredClone(data) });
      },
      delete: async () => {
        activeStore.delete(docPath);
      }
    }),
    collection: (colName: string) => createAdminCollectionRef(colName, [], undefined, activeStore),
    runTransaction: async (cb: (tx: any) => Promise<any>) => {
      // Snapshot-and-commit transaction semantics so failed writes rollback cleanly
      const staged = new Map<string, any>();
      for (const [k, v] of mockAdminStore.entries()) {
        staged.set(k, structuredClone(v));
      }
      const ops: Array<() => void> = [];
      const tx = {
        get: async (ref: any) => {
          if (typeof ref.path === "string") {
            return buildDocSnapshot(staged, ref.path, false);
          }
          return ref.get();
        },
        set: (ref: any, data: any, opts?: { merge?: boolean }) => {
          ops.push(() => {
            if (mockHooks.failAuditWrite && String(ref.path).startsWith("audit_logs/")) {
              throw new Error("Simulated audit_logs write failure");
            }
            if (opts?.merge) {
              const cur = staged.get(ref.path) || {};
              staged.set(ref.path, { ...cur, ...structuredClone(data) });
            } else {
              staged.set(ref.path, structuredClone(data));
            }
          });
        },
        update: (ref: any, data: any) => {
          ops.push(() => {
            const cur = staged.get(ref.path) || {};
            staged.set(ref.path, { ...cur, ...structuredClone(data) });
          });
        },
        delete: (ref: any) => {
          ops.push(() => {
            staged.delete(ref.path);
          });
        }
      };

      const result = await cb(tx);
      for (const op of ops) {
        op();
      }
      mockAdminStore.clear();
      for (const [k, v] of staged.entries()) {
        mockAdminStore.set(k, v);
      }
      return result;
    }
  };
}

vi.mock("../../../lib/firebaseAdmin", () => {
  const adminDb = makeAdminDb();
  return {
    getAdminApp: () => ({ name: "test-admin-app" }),
    getAdminFirestore: () => adminDb,
    getAdminAuth: () => ({
      verifyIdToken: mockVerifyIdToken
    })
  };
});

vi.mock("../../../lib/firebase", () => ({
  db: { __mockClientDb: true },
  auth: mockAuthState,
  serverTimestamp: () => ({ __serverTimestamp: true }),
  logFirestoreError: vi.fn(),
  handleFirestoreError: vi.fn(),
  OperationType: { GET: "get", WRITE: "write", LIST: "list" }
}));

vi.mock("firebase/firestore", () => {
  const makeDocRef = (_db: any, colOrPath: string, ...segments: string[]) => {
    const fullPath = segments.length > 0 ? `${colOrPath}/${segments.join("/")}` : colOrPath;
    return {
      __type: "docRef",
      path: fullPath,
      id: fullPath.split("/").pop()
    };
  };

  const makeCollectionRef = (_db: any, colName: string) => ({
    __type: "collectionRef",
    colName
  });

  const makeWhere = (field: string, op: string, value: any) => ({
    __type: "where",
    field,
    op,
    value
  });

  const makeQuery = (colRef: any, ...constraints: any[]) => ({
    __type: "query",
    colName: colRef.colName,
    filters: constraints.filter((c) => c?.__type === "where")
  });

  return {
    doc: makeDocRef,
    collection: makeCollectionRef,
    where: makeWhere,
    query: makeQuery,
    orderBy: vi.fn(() => ({ __type: "orderBy" })),
    limit: vi.fn(() => ({ __type: "limit" })),
    GeoPoint: class MockGeoPoint {
      latitude: number;
      longitude: number;
      constructor(lat: number, lng: number) {
        this.latitude = lat;
        this.longitude = lng;
      }
    },
    serverTimestamp: () => "2026-11-23T08:00:00.000Z",
    getDoc: async (ref: any) => buildDocSnapshot(mockClientStore, ref.path, true),
    getDocs: async (q: any) => queryStoreCollection(mockClientStore, q.colName, q.filters || []),
    setDoc: async (ref: any, data: any, opts?: { merge?: boolean }) => {
      if (opts?.merge) {
        const cur = mockClientStore.get(ref.path) || {};
        mockClientStore.set(ref.path, { ...cur, ...structuredClone(data) });
      } else {
        mockClientStore.set(ref.path, structuredClone(data));
      }
    },
    updateDoc: async (ref: any, data: any) => {
      const cur = mockClientStore.get(ref.path) || {};
      mockClientStore.set(ref.path, { ...cur, ...structuredClone(data) });
    },
    runTransaction: async (_db: any, cb: (tx: any) => Promise<any>) => {
      const tx = {
        get: async (ref: any) => buildDocSnapshot(mockClientStore, ref.path, true),
        set: (ref: any, data: any, opts?: { merge?: boolean }) => {
          if (opts?.merge) {
            const cur = mockClientStore.get(ref.path) || {};
            mockClientStore.set(ref.path, { ...cur, ...structuredClone(data) });
          } else {
            mockClientStore.set(ref.path, structuredClone(data));
          }
        },
        update: (ref: any, data: any) => {
          const cur = mockClientStore.get(ref.path) || {};
          mockClientStore.set(ref.path, { ...cur, ...structuredClone(data) });
        }
      };
      return cb(tx);
    }
  };
});

vi.mock("../../../services/audit/EmployeeAuditService", () => ({
  EmployeeAuditService: {
    logTransition: vi.fn(async () => {})
  }
}));

vi.mock("../../../repositories/ScheduleRepository", () => ({
  ScheduleRepository: {
    getShiftByEmployeeAndDate: vi.fn(async () => null)
  }
}));

vi.mock("../../../modules/runtime/EventBus", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    EventBus: {
      ...actual.EventBus,
      createEvent: vi.fn((p: any) => p),
      publish: vi.fn(),
      subscribe: vi.fn(() => () => {})
    }
  };
});

import { createApp } from "../../../../server";
import {
  authorizeAttendanceAction,
  extractCanonicalBusinessId,
  TrustedAttendanceActor,
  TrustedAttendanceTarget
} from "../../../domains/attendance/AttendanceAuthorizationService";
import { ServerAttendanceService } from "../../../domains/attendance/ServerAttendanceService";
import { verifyScannedBadgeSecurity } from "../../../domains/attendance/clientActorResolver";
import { AttendanceRepository } from "../../../repositories/AttendanceRepository";
import { PermissionService } from "../../../services/PermissionService";
import { PermissionRepository } from "../../../repositories";
import { ROLE_PERMISSIONS } from "../../../permissions/role.permissions";
import { queueAttendanceLog, syncAttendanceQueue } from "../../../lib/offlineSync";

describe("FINOPS Attendance P0.2 Security & Integrity Remediation Suite", () => {
  let server: any;
  let baseUrl: string;

  const BIZ_ALPHA = "biz_alpha";
  const BIZ_BETA = "biz_beta";

  function seedUserAndEmployee(params: {
    uid: string;
    empId?: string;
    role: string;
    businessId: string | null;
    branchId?: string;
    departmentId?: string;
    userExtras?: Record<string, any>;
    empExtras?: Record<string, any>;
  }) {
    const empId = params.empId || params.uid;
    const userDoc: Record<string, any> = {
      uid: params.uid,
      email: `${params.uid}@finops.test`,
      displayName: params.uid,
      role: params.role,
      employeeId: empId,
      status: "ACTIVE",
      ...(params.businessId ? { business_id: params.businessId, businessId: params.businessId } : {}),
      ...(params.branchId ? { branch_id: params.branchId, branchId: params.branchId } : {}),
      ...(params.departmentId ? { department_id: params.departmentId, departmentId: params.departmentId } : {}),
      ...(params.userExtras || {})
    };
    mockAdminStore.set(`users/${params.uid}`, userDoc);
    mockClientStore.set(`users/${params.uid}`, userDoc);

    const empDoc: Record<string, any> = {
      id: empId,
      firebase_uid: params.uid,
      uid: params.uid,
      name: `Employee ${empId}`,
      email: userDoc.email,
      role: params.role,
      status: "ACTIVE",
      active: true,
      ...(params.businessId ? { business_id: params.businessId, businessId: params.businessId } : {}),
      ...(params.branchId ? { branchId: params.branchId, branch_id: params.branchId } : {}),
      ...(params.departmentId ? { departmentId: params.departmentId, department_id: params.departmentId } : {}),
      ...(params.empExtras || {})
    };
    mockAdminStore.set(`employees/${empId}`, empDoc);
    mockClientStore.set(`employees/${empId}`, empDoc);

    mockAuthTokens.set(`tok_${params.uid}`, {
      uid: params.uid,
      email: userDoc.email,
      email_verified: true,
      role: params.role,
      ...(params.businessId ? { business_id: params.businessId } : {}),
      ...(params.branchId ? { branch_id: params.branchId } : {})
    });
  }

  async function postJson(endpoint: string, token: string, body: Record<string, any>) {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    return { status: res.status, json };
  }

  beforeEach(async () => {
    mockAdminStore.clear();
    mockClientStore.clear();
    mockAuthTokens.clear();
    mockAuthState.currentUser = null;
    mockHooks.failAuditWrite = false;
    mockHooks.failPayrollQuery = false;
    vi.clearAllMocks();

    mockAdminStore.set(`businesses/${BIZ_ALPHA}`, { id: BIZ_ALPHA, name: "Alpha Corp", status: "ACTIVE", ownerId: "owner_alpha" });
    mockAdminStore.set(`businesses/${BIZ_BETA}`, { id: BIZ_BETA, name: "Beta Corp", status: "ACTIVE", ownerId: "owner_beta" });

    seedUserAndEmployee({ uid: "owner_alpha", role: "OWNER", businessId: BIZ_ALPHA, branchId: "br_hq" });
    seedUserAndEmployee({ uid: "owner_alpha_2", role: "OWNER", businessId: BIZ_ALPHA, branchId: "br_1" });
    seedUserAndEmployee({ uid: "owner_beta", role: "OWNER", businessId: BIZ_BETA, branchId: "br_beta_1" });
    seedUserAndEmployee({ uid: "manager_alpha_b1", role: "MANAGER", businessId: BIZ_ALPHA, branchId: "br_1" });
    seedUserAndEmployee({ uid: "supervisor_alpha_ops", role: "SUPERVISOR", businessId: BIZ_ALPHA, branchId: "br_1", departmentId: "dept_ops" });
    seedUserAndEmployee({ uid: "head_teller_alpha", role: "HEAD_TELLER", businessId: BIZ_ALPHA, branchId: "br_1" });
    seedUserAndEmployee({ uid: "emp_alpha_b1", role: "EMPLOYEE", businessId: BIZ_ALPHA, branchId: "br_1", departmentId: "dept_ops", empExtras: { supervisorId: "supervisor_alpha_ops" } });
    seedUserAndEmployee({ uid: "emp_alpha_b2", role: "EMPLOYEE", businessId: BIZ_ALPHA, branchId: "br_2", departmentId: "dept_sales" });
    seedUserAndEmployee({ uid: "emp_beta_1", role: "EMPLOYEE", businessId: BIZ_BETA, branchId: "br_beta_1" });
    seedUserAndEmployee({ uid: "auditor_alpha", role: "AUDITOR", businessId: BIZ_ALPHA, branchId: "br_1" });

    mockVerifyIdToken.mockImplementation(async (token: string) => {
      const claim = mockAuthTokens.get(token);
      if (!claim) throw new Error("Invalid token");
      return claim;
    });

    const app = await createApp();
    server = app.listen(0);
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // =========================================================================
  // GROUP 1: Employee Privilege Escalation Protection (GAP-ATT-01)
  // =========================================================================
  describe("Group 1: Employee Self-Privilege Escalation Protection (GAP-ATT-01)", () => {
    it("1.1 firestore.rules restricts employee self-updates to personal allowlist and blocks all authorization-sensitive fields", () => {
      const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");
      const employeesBlock = rules.match(/match \/employees\/\{empId\}\s*\{[\s\S]*?\n    \}/)?.[0] || "";
      expect(employeesBlock).not.toBe("");

      const hasOnlyMatch = employeesBlock.match(/request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/);
      expect(hasOnlyMatch).not.toBeNull();
      const allowlist = hasOnlyMatch![1];

      // EditProfileModal fields permitted
      for (const personalField of ["'phone'", "'address'", "'emergencyContactName'", "'emergencyContactPhone'", "'preferredLanguage'"]) {
        expect(allowlist).toContain(personalField);
      }

      // Authorization-sensitive fields MUST NEVER be in self-update allowlist and MUST be explicitly denied
      const protectedFields = [
        "explicitAttendanceDelegation",
        "attendanceDelegated",
        "delegatedEmployeeIds",
        "delegatedBranchIds",
        "authorizedBranchIds",
        "authorizedBranches",
        "authorizedDepartmentIds",
        "authorizedTeamIds",
        "managerId",
        "supervisorId",
        "role",
        "businessId",
        "business_id",
        "permissions"
      ];
      for (const field of protectedFields) {
        expect(allowlist).not.toContain(`'${field}'`);
        expect(employeesBlock).toContain(`'${field}'`);
      }
    });

    it("1.2 ServerAttendanceService.resolveTrustedActor ignores tampered delegation/branch/team fields on employees/{id}", async () => {
      // Attacker manages to tamper with their employees doc (simulating legacy data)
      const tamperedEmp = mockAdminStore.get("employees/head_teller_alpha");
      mockAdminStore.set("employees/head_teller_alpha", {
        ...tamperedEmp,
        explicitAttendanceDelegation: true,
        attendanceDelegated: true,
        delegatedEmployeeIds: ["emp_alpha_b1", "emp_alpha_b2"],
        delegatedBranchIds: ["br_1", "br_2"],
        authorizedBranchIds: ["br_1", "br_2"],
        authorizedDepartmentIds: ["dept_ops", "dept_sales"],
        authorizedTeamIds: ["team_all"]
      });

      const actor = await ServerAttendanceService.resolveTrustedActor(
        makeAdminDb() as any,
        {
          uid: "head_teller_alpha",
          email: "head_teller_alpha@finops.test",
          role: "HEAD_TELLER",
          business_id: BIZ_ALPHA
        } as any
      );

      expect(actor.explicitAttendanceDelegation).toBe(false);
      expect(actor.delegatedEmployeeIds).toBeNull();
      expect(actor.delegatedBranchIds).toBeNull();
      expect(actor.authorizedBranchIds).toBeNull();
      expect(actor.authorizedDepartmentIds).toBeNull();
      expect(actor.authorizedTeamIds).toBeNull();

      // And HTTP check-in for another employee is STILL denied
      const res = await postJson("/api/attendance/check-in", "tok_head_teller_alpha", {
        employeeId: "emp_alpha_b1",
        method: "MANUAL",
        deviceDate: "2026-11-23"
      });
      expect(res.status).toBe(403);
      expect(res.json.code).toBe("TELLER_SELF_ATTENDANCE_ONLY");
    });
  });

  // =========================================================================
  // GROUP 2: Attendance Mutation, Tenant Consistency & Rules Protection
  // =========================================================================
  describe("Group 2: Client Mutation Locking, Tenant Consistency & Fail-Closed Period Locks", () => {
    it("2.1 firestore.rules denies ALL direct client writes on authoritative attendance collections while preserving tenant reads", () => {
      const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");
      const authoritativeCollections = [
        "attendance_adjustment_requests",
        "attendance_logs",
        "attendance_records",
        "attendance_sessions",
        "attendance_events",
        "attendance",
        "attendance_status",
        "attendance_idempotency"
      ];

      for (const col of authoritativeCollections) {
        const block = rules.match(new RegExp(`match \\/${col}\\/\\{[^}]+\\}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`));
        expect(block, `Missing block for ${col}`).not.toBeNull();
        expect(block![1]).toContain("allow create, update, delete: if false;");
        expect(block![1]).toContain("isTenantScoped(getBusinessId(");
      }

      // Justifications require PENDING on create, mandatory actor/recordedBy, and admin/manager on update
      const justBlock = rules.match(/match \/attendance_justifications\/\{id\}\s*\{([\s\S]*?)\n\s*\}/)?.[1] || "";
      expect(justBlock).toContain("request.resource.data.get('status', '') == 'PENDING'");
      expect(justBlock).not.toContain("isAttendanceSupervisor(getBusinessId(resource.data))");
      expect(justBlock).toContain("isTenantAdminOrManager(getBusinessId(resource.data))");

      // canWriteAttendanceForEmployee enforces strict non-empty business_id, consistent tenant fields, and mandatory recordedBy/actorId
      const helperMatch = rules.match(/function canWriteAttendanceForEmployee\(empId, data\)\s*\{([\s\S]*?)\n    \}/);
      expect(helperMatch).not.toBeNull();
      const helperBody = helperMatch![1];
      expect(helperBody).toContain("'business_id' in data");
      expect(helperBody).toContain("hasConsistentTenantFields(data)");
      expect(helperBody).toContain("data.get('recordedBy', '') == request.auth.uid");
      expect(helperBody).toContain("data.get('actorId', '') == request.auth.uid");
      expect(helperBody).not.toContain("!('recordedBy' in data)");
    });

    it("2.2 Conflicting business_id / businessId / tenantId values fail closed", () => {
      expect(extractCanonicalBusinessId({ business_id: BIZ_ALPHA, businessId: BIZ_BETA })).toBeNull();
      expect(extractCanonicalBusinessId({ business_id: BIZ_ALPHA, tenantId: BIZ_BETA })).toBeNull();
      expect(extractCanonicalBusinessId({ business_id: BIZ_ALPHA, businessId: BIZ_ALPHA })).toBe(BIZ_ALPHA);

      const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");
      const getBizFn = rules.match(/function getBusinessId\(data\)\s*\{([\s\S]*?)\n    \}/)?.[1] || "";
      expect(getBizFn).toContain("!hasConsistentTenantFields(data)");
      expect(getBizFn).toContain("? 'none'");
    });

    it("2.3 AttendanceRepository blocks unauthenticated calls, preferDirectFirestore, and routes writes via API; verifyPeriodLock fails closed", async () => {
      await expect(
        AttendanceRepository.checkIn({
          employeeId: "emp_alpha_b1",
          businessId: BIZ_ALPHA,
          branchId: "br_1",
          method: "MANUAL",
          deviceId: "K1",
          location: "HQ",
          actor: { id: "owner_alpha", name: "Owner", role: "OWNER" }
        })
      ).rejects.toThrow(/Authentification Firebase requise/i);

      mockAuthState.currentUser = {
        uid: "owner_alpha",
        getIdToken: async () => "tok_owner_alpha"
      };

      await expect(
        AttendanceRepository.checkIn({
          employeeId: "emp_alpha_b1",
          businessId: BIZ_ALPHA,
          branchId: "br_1",
          method: "MANUAL",
          deviceId: "K1",
          location: "HQ",
          actor: { id: "owner_alpha", name: "Owner", role: "OWNER" },
          preferDirectFirestore: true
        })
      ).rejects.toThrow(/MUTATION_BYPASS_DENIED/i);

      // Missing cycle boundaries fails closed
      mockClientStore.set("payroll_cycles/bad_cycle", {
        id: "bad_cycle",
        business_id: BIZ_ALPHA,
        status: "LOCKED"
      });
      await expect(
        AttendanceRepository.verifyPeriodLock(BIZ_ALPHA, "2026-11-23", { bypassCache: true })
      ).rejects.toThrow(/fail-closed/i);

      mockClientStore.delete("payroll_cycles/bad_cycle");
      mockHooks.failPayrollQuery = true;
      await expect(
        AttendanceRepository.verifyPeriodLock(BIZ_ALPHA, "2026-11-23", { bypassCache: true })
      ).rejects.toThrow(/fail-closed/i);
    });
  });

  // =========================================================================
  // GROUP 3: Delegation, Scope Boundaries & Permission Parity
  // =========================================================================
  describe("Group 3: HEAD_TELLER Delegation Bounds, SUPERVISOR Separation & GAP-ATT-14 Parity", () => {
    it("3.1 HEAD_TELLER with explicitAttendanceDelegation=true and empty branch/delegated scope is DENIED (zero tenant-wide escalation)", async () => {
      seedUserAndEmployee({
        uid: "ht_empty_scope",
        role: "HEAD_TELLER",
        businessId: BIZ_ALPHA,
        userExtras: {
          explicitAttendanceDelegation: true
          // Notice: no branchId, no authorizedBranchIds, no delegatedBranchIds, no delegatedEmployeeIds
        }
      });

      const res = await postJson("/api/attendance/check-in", "tok_ht_empty_scope", {
        employeeId: "emp_alpha_b2",
        method: "MANUAL",
        deviceDate: "2026-11-23"
      });
      expect(res.status).toBe(403);
      expect(res.json.code).toBe("TELLER_SELF_ATTENDANCE_ONLY");
    });

    it("3.2 HEAD_TELLER with delegatedBranchIds or delegatedEmployeeIds ONLY accesses explicitly delegated targets", async () => {
      seedUserAndEmployee({
        uid: "ht_scoped",
        role: "HEAD_TELLER",
        businessId: BIZ_ALPHA,
        branchId: "br_1",
        userExtras: {
          explicitAttendanceDelegation: true,
          delegatedBranchIds: ["br_1"],
          delegatedEmployeeIds: ["emp_alpha_b2"]
        }
      });

      // emp_alpha_b1 in delegated branch br_1 -> ALLOWED
      const resB1 = await postJson("/api/attendance/check-in", "tok_ht_scoped", {
        employeeId: "emp_alpha_b1",
        method: "MANUAL",
        deviceDate: "2026-11-23"
      });
      expect(resB1.status).toBe(200);

      // emp_alpha_b2 explicitly in delegatedEmployeeIds -> ALLOWED
      const resB2 = await postJson("/api/attendance/check-in", "tok_ht_scoped", {
        employeeId: "emp_alpha_b2",
        method: "MANUAL",
        deviceDate: "2026-11-23"
      });
      expect(resB2.status).toBe(200);

      // New employee in br_3 NOT delegated -> DENIED
      seedUserAndEmployee({ uid: "emp_alpha_b3", role: "EMPLOYEE", businessId: BIZ_ALPHA, branchId: "br_3" });
      const resB3 = await postJson("/api/attendance/check-in", "tok_ht_scoped", {
        employeeId: "emp_alpha_b3",
        method: "MANUAL",
        deviceDate: "2026-11-23"
      });
      expect(resB3.status).toBe(403);
      expect(resB3.json.code).toBe("TELLER_SELF_ATTENDANCE_ONLY");
    });

    it("3.3 PermissionService, PermissionRepository, and ROLE_PERMISSIONS keep override_attendance strictly on management roles", async () => {
      const restrictedRoles = ["SUPERVISOR", "TEAM_LEADER", "HEAD_TELLER", "MASTER_HEAD_TELLER", "SENIOR_TELLER", "JUNIOR_TELLER", "TELLER", "EMPLOYEE", "AUDITOR"];
      const fullFeatures: any = { attendance: true, payroll: true, accounting: true, pos: true, hr: true, crm: true, bi: true, aiCfo: true };

      for (const role of restrictedRoles) {
        const repoPerms = await PermissionRepository.getRolePermissions(role as any);
        expect(repoPerms, `${role} repo perms`).not.toContain("override_attendance");
        expect(repoPerms, `${role} repo perms`).not.toContain("attendance.override");
        expect(repoPerms, `${role} repo perms`).not.toContain("attendance.approve");

        expect(ROLE_PERMISSIONS[role]?.canOverrideAttendance, `ROLE_PERMISSIONS[${role}]`).toBe(false);

        // Even if someone tampers with passed permissions array in PermissionService.init, PermissionService fails closed
        PermissionService.init(role as any, [...repoPerms, "override_attendance", "attendance.override", "attendance.approve"], fullFeatures, "ENTERPRISE", "ACTIVE", BIZ_ALPHA);
        expect(PermissionService.can("override_attendance"), `PermissionService.can for ${role}`).toBe(false);
        expect(PermissionService.can("attendance.override"), `PermissionService.can for ${role}`).toBe(false);
        expect(PermissionService.can("attendance.approve"), `PermissionService.can for ${role}`).toBe(false);
      }

      // Dynamic roles_config tampering for HEAD_TELLER / SUPERVISOR is stripped by PermissionRepository
      mockClientStore.set(`businesses/${BIZ_ALPHA}/settings/roles_config`, {
        HEAD_TELLER: ["view_dashboard", "override_attendance", "attendance.approve"],
        SUPERVISOR: ["view_dashboard", "attendance.record_others", "override_attendance"]
      });
      const dynHt = await PermissionRepository.getRolePermissions("HEAD_TELLER", BIZ_ALPHA);
      expect(dynHt).not.toContain("override_attendance");
      expect(dynHt).not.toContain("attendance.approve");

      const dynSup = await PermissionRepository.getRolePermissions("SUPERVISOR" as any, BIZ_ALPHA);
      expect(dynSup).toContain("attendance.record_others");
      expect(dynSup).not.toContain("override_attendance");

      // OWNER & MANAGER preserve override capabilities
      const ownerPerms = await PermissionRepository.getRolePermissions("OWNER");
      PermissionService.init("OWNER", ownerPerms, fullFeatures, "ENTERPRISE", "ACTIVE", BIZ_ALPHA);
      expect(PermissionService.can("override_attendance")).toBe(true);
    });
  });

  // =========================================================================
  // GROUP 4: Badge Cryptographic & Lifecycle Integrity (GAP-ATT-07)
  // =========================================================================
  describe("Group 4: Badge Cryptographic & Lifecycle Verification (GAP-ATT-07)", () => {
    it("4.1 Rejects unsigned QR and NFC check-in attempts on server and client", async () => {
      mockAdminStore.set("employee_badges/b_1", {
        id: "b_1",
        employeeId: "emp_alpha_b1",
        business_id: BIZ_ALPHA,
        status: "ACTIVE",
        signature: "CRYPTO_SIG_1"
      });

      const qrUnsigned = await postJson("/api/attendance/check-in", "tok_owner_alpha", {
        employeeId: "emp_alpha_b1",
        method: "QR",
        deviceDate: "2026-11-23"
      });
      expect(qrUnsigned.status).toBe(403);
      expect(qrUnsigned.json.code).toBe("INVALID_BADGE_SIGNATURE");

      const nfcUnsigned = await postJson("/api/attendance/check-in", "tok_owner_alpha", {
        employeeId: "emp_alpha_b1",
        method: "NFC",
        deviceDate: "2026-11-23"
      });
      expect(nfcUnsigned.status).toBe(403);
      expect(nfcUnsigned.json.code).toBe("INVALID_BADGE_SIGNATURE");

      const clientUnsigned = verifyScannedBadgeSecurity({
        emp: { id: "emp_alpha_b1", business_id: BIZ_ALPHA } as any,
        activeBadge: undefined,
        currentBusinessId: BIZ_ALPHA,
        requireSignature: true
      });
      expect(clientUnsigned.valid).toBe(false);
      expect(clientUnsigned.reasonCode).toBe("INVALID_SIGNATURE");

      // Client verify rejects weak btoa signature when activeBadge carries strong signature
      const weakBtoaSig = Buffer.from(`emp_alpha_b1:${BIZ_ALPHA}:FINOPS`).toString("base64");
      const weakClientCheck = verifyScannedBadgeSecurity({
        emp: { id: "emp_alpha_b1", business_id: BIZ_ALPHA } as any,
        activeBadge: {
          id: "b_1",
          employeeId: "emp_alpha_b1",
          business_id: BIZ_ALPHA,
          status: "ACTIVE",
          signature: "CRYPTO_SIG_1"
        } as any,
        signature: weakBtoaSig,
        currentBusinessId: BIZ_ALPHA,
        requireSignature: true
      });
      expect(weakClientCheck.valid).toBe(false);
      expect(weakClientCheck.reasonCode).toBe("INVALID_SIGNATURE");
    });

    it("4.2 Rejects REVOKED, EXPIRED, cross-tenant, and duplicate ACTIVE badges (AMBIGUOUS_ACTIVE_BADGES)", async () => {
      // Revoked badge
      mockAdminStore.set("employee_badges/b_revoked", {
        id: "b_revoked",
        employeeId: "emp_alpha_b1",
        business_id: BIZ_ALPHA,
        status: "REVOKED",
        signature: "SIG_REV"
      });
      const revRes = await postJson("/api/attendance/check-in", "tok_owner_alpha", {
        employeeId: "emp_alpha_b1",
        method: "QR",
        badgeId: "b_revoked",
        qrSignature: "SIG_REV",
        deviceDate: "2026-11-23"
      });
      expect(revRes.status).toBe(403);
      expect(revRes.json.code).toBe("BADGE_NOT_ACTIVE");

      // Expired badge
      mockAdminStore.set("employee_badges/b_expired", {
        id: "b_expired",
        employeeId: "emp_alpha_b1",
        business_id: BIZ_ALPHA,
        status: "ACTIVE",
        expiresAt: "2020-01-01T00:00:00.000Z",
        signature: "SIG_EXP"
      });
      const expRes = await postJson("/api/attendance/check-in", "tok_owner_alpha", {
        employeeId: "emp_alpha_b1",
        method: "QR",
        badgeId: "b_expired",
        qrSignature: "SIG_EXP",
        deviceDate: "2026-11-23"
      });
      expect(expRes.status).toBe(403);
      expect(expRes.json.code).toBe("BADGE_EXPIRED");

      // Duplicate ACTIVE badges -> AMBIGUOUS_ACTIVE_BADGES
      mockAdminStore.set("employee_badges/b_dup_1", {
        id: "b_dup_1",
        employeeId: "emp_alpha_b1",
        business_id: BIZ_ALPHA,
        status: "ACTIVE",
        signature: "SIG_EXP"
      });
      const dupServer = await postJson("/api/attendance/check-in", "tok_owner_alpha", {
        employeeId: "emp_alpha_b1",
        method: "QR",
        badgeId: "b_dup_1",
        qrSignature: "SIG_EXP",
        deviceDate: "2026-11-23"
      });
      expect(dupServer.status).toBe(409);
      expect(dupServer.json.code).toBe("AMBIGUOUS_ACTIVE_BADGES");

      const dupClient = verifyScannedBadgeSecurity({
        emp: { id: "emp_alpha_b1", business_id: BIZ_ALPHA } as any,
        activeBadge: mockAdminStore.get("employee_badges/b_dup_1"),
        allEmployeeBadges: [
          mockAdminStore.get("employee_badges/b_expired"),
          mockAdminStore.get("employee_badges/b_dup_1")
        ],
        signature: "SIG_EXP",
        currentBusinessId: BIZ_ALPHA
      });
      expect(dupClient.valid).toBe(false);
      expect(dupClient.reasonCode).toBe("AMBIGUOUS_ACTIVE_BADGES");

      // Cross-tenant badge payload rejected
      mockAdminStore.delete("employee_badges/b_expired");
      const crossPayloadRes = await postJson("/api/attendance/check-in", "tok_owner_alpha", {
        employeeId: "emp_alpha_b1",
        method: "QR",
        badgeId: "b_dup_1",
        qrSignature: "SIG_EXP",
        badgePayload: JSON.stringify({ employee_id: "emp_alpha_b1", business_id: BIZ_BETA, signature: "SIG_EXP" }),
        deviceDate: "2026-11-23"
      });
      expect(crossPayloadRes.status).toBe(403);
      expect(crossPayloadRes.json.code).toBe("FORBIDDEN_TENANT_CLAIM");

      // Valid signed QR check-in succeeds
      const okQr = await postJson("/api/attendance/check-in", "tok_owner_alpha", {
        employeeId: "emp_alpha_b1",
        method: "QR",
        badgeId: "b_dup_1",
        qrSignature: "SIG_EXP",
        badgePayload: JSON.stringify({ employee_id: "emp_alpha_b1", business_id: BIZ_ALPHA, signature: "SIG_EXP" }),
        deviceDate: "2026-11-23"
      });
      expect(okQr.status).toBe(200);
    });
  });

  // =========================================================================
  // GROUP 5: Adjustment Workflow & Maker-Checker Separation (GAP-ATT-08)
  // =========================================================================
  describe("Group 5: Server-Authoritative Adjustment Requests & Maker-Checker Enforcement (GAP-ATT-08)", () => {
    it("5.1 Enforces Maker-Checker self-approval block, RBAC approval boundaries, replay protection, payroll lock, and SSOT sync", async () => {
      // Seed an active check-in session for emp_alpha_b1
      const ci = await postJson("/api/attendance/check-in", "tok_owner_alpha", {
        employeeId: "emp_alpha_b1",
        method: "MANUAL",
        deviceDate: "2026-11-23"
      });
      expect(ci.status).toBe(200);
      const sessionId = ci.json.session.sessionId;

      // Requester: manager_alpha_b1 creates an adjustment request
      const reqRes = await postJson("/api/attendance/adjustments", "tok_manager_alpha_b1", {
        sessionId,
        employeeId: "emp_alpha_b1",
        requestedHours: 9.5,
        reason: "Worked extra shift covering closing"
      });
      expect(reqRes.status).toBe(200);
      const requestId = reqRes.json.request.requestId;
      expect(reqRes.json.request.status).toBe("REQUESTED");
      expect(reqRes.json.request.requestedBy).toBe("manager_alpha_b1");

      // Self-approval by requester -> MAKER_CHECKER_VIOLATION (403)
      const selfApprove = await postJson("/api/attendance/adjustments/approve", "tok_manager_alpha_b1", {
        requestId,
        decision: "APPROVED"
      });
      expect(selfApprove.status).toBe(403);
      expect(selfApprove.json.code).toBe("MAKER_CHECKER_VIOLATION");

      // SUPERVISOR / HEAD_TELLER cannot approve -> ADJUSTMENT_APPROVAL_FORBIDDEN (403); AUDITOR -> FORBIDDEN_ATTENDANCE_ROLE (403)
      for (const [tok, expectedCode] of [
        ["tok_supervisor_alpha_ops", "ADJUSTMENT_APPROVAL_FORBIDDEN"],
        ["tok_head_teller_alpha", "ADJUSTMENT_APPROVAL_FORBIDDEN"],
        ["tok_auditor_alpha", "FORBIDDEN_ATTENDANCE_ROLE"]
      ]) {
        const deniedRole = await postJson("/api/attendance/adjustments/approve", tok, {
          requestId,
          decision: "APPROVED"
        });
        expect(deniedRole.status).toBe(403);
        expect(deniedRole.json.code).toBe(expectedCode);
      }

      // Cross-tenant OWNER cannot approve -> CROSS_TENANT_ATTENDANCE_DENIED (403)
      const crossApprove = await postJson("/api/attendance/adjustments/approve", "tok_owner_beta", {
        requestId,
        decision: "APPROVED"
      });
      expect(crossApprove.status).toBe(403);
      expect(crossApprove.json.code).toBe("CROSS_TENANT_ATTENDANCE_DENIED");

      // Valid second OWNER approves -> 200 & syncs sessions + logs + records + events + audit_logs
      const approved = await postJson("/api/attendance/adjustments/approve", "tok_owner_alpha_2", {
        requestId,
        decision: "APPROVED"
      });
      expect(approved.status).toBe(200);
      expect(approved.json.request.status).toBe("APPROVED");
      expect(approved.json.request.approvedBy).toBe("owner_alpha_2");

      const sessDoc = mockAdminStore.get(`attendance_sessions/${sessionId}`);
      const logDoc = mockAdminStore.get(`attendance_logs/${sessionId}`);
      const recDoc = mockAdminStore.get(`attendance_records/${sessionId}`);
      expect(sessDoc.totalMinutes).toBe(570);
      expect(logDoc.realHours).toBe(9.5);
      expect(recDoc.realHours).toBe(9.5);

      // Replay approval blocked -> ADJUSTMENT_ALREADY_PROCESSED (409)
      const replay = await postJson("/api/attendance/adjustments/approve", "tok_owner_alpha", {
        requestId,
        decision: "APPROVED"
      });
      expect(replay.status).toBe(409);
      expect(replay.json.code).toBe("ADJUSTMENT_ALREADY_PROCESSED");
    });

    it("5.2 Blocks adjustment request and approval when payroll period is LOCKED", async () => {
      const ci = await postJson("/api/attendance/check-in", "tok_owner_alpha", {
        employeeId: "emp_alpha_b1",
        method: "MANUAL",
        deviceDate: "2026-11-23"
      });
      const sessionId = ci.json.session.sessionId;

      const reqRes = await postJson("/api/attendance/adjustments", "tok_emp_alpha_b1", {
        sessionId,
        employeeId: "emp_alpha_b1",
        requestedHours: 8,
        reason: "Request before lock"
      });
      expect(reqRes.status).toBe(200);

      // Lock payroll period via legacy camelCase businessId
      mockAdminStore.set("payroll_cycles/cycle_nov", {
        id: "cycle_nov",
        businessId: BIZ_ALPHA,
        status: "SEALED",
        startDate: "2026-11-01",
        endDate: "2026-11-30"
      });

      const approveLocked = await postJson("/api/attendance/adjustments/approve", "tok_owner_alpha", {
        requestId: reqRes.json.request.requestId,
        decision: "APPROVED"
      });
      expect(approveLocked.status).toBe(423);
      expect(approveLocked.json.code).toBe("PAYROLL_PERIOD_LOCKED");
    });
  });

  // =========================================================================
  // GROUP 6: Transaction Integrity, Idempotency, Bulk Import, Delete & Offline
  // =========================================================================
  describe("Group 6: Atomicity, Stale Session Reconciliation, Idempotency, Bulk/Delete & Offline Sync", () => {
    it("6.1 Transactional audit_logs failure rolls back check-in & check-out atomically (GAP-ATT-09)", async () => {
      mockHooks.failAuditWrite = true;
      const failCi = await postJson("/api/attendance/check-in", "tok_owner_alpha", {
        employeeId: "emp_alpha_b1",
        method: "MANUAL",
        deviceDate: "2026-11-23"
      });
      expect(failCi.status).toBe(500);
      expect(mockAdminStore.get("attendance_status/emp_alpha_b1")).toBeUndefined();
      // Zero attendance_sessions persisted
      const sessions = Array.from(mockAdminStore.keys()).filter((k) => k.startsWith("attendance_sessions/"));
      expect(sessions).toHaveLength(0);
    });

    it("6.2 Flags stale prior-day ACTIVE session on new check-in & preserves newer activeSessionId on stale check-out (GAP-ATT-11)", async () => {
      const day1 = await postJson("/api/attendance/check-in", "tok_owner_alpha", {
        employeeId: "emp_alpha_b1",
        method: "MANUAL",
        deviceDate: "2026-11-22",
        overrideTimestamp: "2026-11-22T08:00:00.000Z"
      });
      expect(day1.status).toBe(200);
      const day1SessionId = day1.json.session.sessionId;

      // Next-day check-in without closing day1 session flags day1 -> FLAGGED
      const day2 = await postJson("/api/attendance/check-in", "tok_owner_alpha", {
        employeeId: "emp_alpha_b1",
        method: "MANUAL",
        deviceDate: "2026-11-23",
        overrideTimestamp: "2026-11-23T08:00:00.000Z"
      });
      expect(day2.status).toBe(200);
      const day2SessionId = day2.json.session.sessionId;

      expect(mockAdminStore.get(`attendance_sessions/${day1SessionId}`)?.status).toBe("FLAGGED");
      expect(mockAdminStore.get("attendance_status/emp_alpha_b1")?.activeSessionId).toBe(day2SessionId);

      // Closing the older flagged day1 session MUST NOT wipe activeSessionId pointing to day2SessionId
      const closeDay1 = await postJson("/api/attendance/check-out", "tok_owner_alpha", {
        sessionId: day1SessionId,
        employeeId: "emp_alpha_b1",
        method: "MANUAL",
        overrideTimestamp: "2026-11-22T17:00:00.000Z"
      });
      expect(closeDay1.status).toBe(200);
      expect(mockAdminStore.get("attendance_status/emp_alpha_b1")?.activeSessionId).toBe(day2SessionId);

      // Backdated check-out earlier than check-in rejected (422 INVALID_CHECKOUT_TIME)
      const backdatedOut = await postJson("/api/attendance/check-out", "tok_owner_alpha", {
        sessionId: day2SessionId,
        employeeId: "emp_alpha_b1",
        method: "MANUAL",
        overrideTimestamp: "2026-11-23T07:30:00.000Z"
      });
      expect(backdatedOut.status).toBe(422);
      expect(backdatedOut.json.code).toBe("INVALID_CHECKOUT_TIME");
    });

    it("6.3 Idempotency prevents duplicate sessions on retry and rejects key conflict across employees", async () => {
      const first = await postJson("/api/attendance/check-in", "tok_owner_alpha", {
        employeeId: "emp_alpha_b1",
        method: "MANUAL",
        deviceDate: "2026-11-23",
        idempotencyKey: "offline_evt_9001"
      });
      expect(first.status).toBe(200);

      const replay = await postJson("/api/attendance/check-in", "tok_owner_alpha", {
        employeeId: "emp_alpha_b1",
        method: "MANUAL",
        deviceDate: "2026-11-23",
        idempotencyKey: "offline_evt_9001"
      });
      expect(replay.status).toBe(200);
      expect(replay.json.idempotentReplay).toBe(true);
      expect(replay.json.session.sessionId).toBe(first.json.session.sessionId);

      const conflict = await postJson("/api/attendance/check-in", "tok_owner_alpha", {
        employeeId: "emp_alpha_b2",
        method: "MANUAL",
        deviceDate: "2026-11-23",
        idempotencyKey: "offline_evt_9001"
      });
      expect(conflict.status).toBe(409);
      expect(conflict.json.code).toBe("IDEMPOTENCY_KEY_CONFLICT");
    });

    it("6.4 Bulk Import & Delete enforce strict RBAC, tenant isolation, and payroll locks", async () => {
      // SUPERVISOR cannot bulk import or delete
      const supBulk = await postJson("/api/attendance/bulk-import", "tok_supervisor_alpha_ops", {
        businessId: BIZ_ALPHA,
        records: [{ employeeId: "emp_alpha_b1", date: "2026-11-23", realHours: 8 }]
      });
      expect(supBulk.status).toBe(403);
      expect(supBulk.json.code).toBe("OVERRIDE_FORBIDDEN_FOR_ROLE");

      // OWNER bulk import succeeds
      const ownerBulk = await postJson("/api/attendance/bulk-import", "tok_owner_alpha", {
        businessId: BIZ_ALPHA,
        records: [{ id: "rec_bulk_1", employeeId: "emp_alpha_b1", date: "2026-11-23", realHours: 8 }]
      });
      expect(ownerBulk.status).toBe(200);
      expect(ownerBulk.json.importedCount).toBe(1);
      expect(mockAdminStore.get("attendance_logs/rec_bulk_1")?.business_id).toBe(BIZ_ALPHA);
      expect(mockAdminStore.get("attendance_records/rec_bulk_1")?.business_id).toBe(BIZ_ALPHA);

      // MANAGER cannot delete attendance records
      const mgrDel = await postJson("/api/attendance/delete", "tok_manager_alpha_b1", {
        recordIds: ["rec_bulk_1"]
      });
      expect(mgrDel.status).toBe(403);
      expect(mgrDel.json.code).toBe("DELETE_FORBIDDEN_FOR_ROLE");

      // Cross-tenant OWNER cannot delete rec_bulk_1
      const betaDel = await postJson("/api/attendance/delete", "tok_owner_beta", {
        recordIds: ["rec_bulk_1"]
      });
      expect(betaDel.status).toBe(403);
      expect(betaDel.json.code).toBe("CROSS_TENANT_ATTENDANCE_DENIED");

      // Alpha OWNER can delete unlocked rec_bulk_1
      const ownerDel = await postJson("/api/attendance/delete", "tok_owner_alpha", {
        recordIds: ["rec_bulk_1"],
        reason: "Duplicate test entry"
      });
      expect(ownerDel.status).toBe(200);
      expect(mockAdminStore.get("attendance_logs/rec_bulk_1")).toBeUndefined();
      expect(mockAdminStore.get("attendance_records/rec_bulk_1")).toBeUndefined();
    });

    it("6.5 offlineSync refuses anonymous queuing and preserves authenticated actor/badge metadata without impersonation", async () => {
      mockAuthState.currentUser = null;
      await expect(
        queueAttendanceLog({
          id: "off_1",
          business_id: BIZ_ALPHA,
          employeeId: "emp_alpha_b1",
          timestamp: "2026-11-23T08:00:00.000Z",
          type: "CHECK_IN",
          method: "QR",
          badgeId: "b_1",
          qrSignature: "SIG_1"
        })
      ).rejects.toThrow(/AUTH_REQUIRED/i);

      // Ensure offlineSync.ts no longer contains hardcoded impersonation fallback strings
      const offlineSrc = fs.readFileSync(path.resolve(process.cwd(), "src/lib/offlineSync.ts"), "utf8");
      expect(offlineSrc).not.toContain('role: "EMPLOYEE"');
      expect(offlineSrc).not.toContain('branchId: "UNKNOWN"');
      expect(offlineSrc).toContain("record.actorId !== sessionActorUid");
      expect(offlineSrc).toContain("idempotencyKey");
      expect(typeof syncAttendanceQueue).toBe("function");
    });
  });
});
