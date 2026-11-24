import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { AddressInfo } from "net";

const {
  mockAdminStore,
  mockClientStore,
  mockAuthTokens,
  mockAuthState,
  mockVerifyIdToken
} = vi.hoisted(() => {
  return {
    mockAdminStore: new Map<string, any>(),
    mockClientStore: new Map<string, any>(),
    mockAuthTokens: new Map<string, any>(),
    mockAuthState: { currentUser: null as any },
    mockVerifyIdToken: vi.fn()
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

function createAdminCollectionRef(colPath: string, filters: Array<{ field: string; op: string; value: any }> = [], limitCount?: number): any {
  return {
    where: (field: string, op: string, value: any) =>
      createAdminCollectionRef(colPath, [...filters, { field, op, value }], limitCount),
    limit: (n: number) => createAdminCollectionRef(colPath, filters, n),
    get: async () => queryStoreCollection(mockAdminStore, colPath, filters, limitCount),
    doc: (docId?: string) => {
      const id = docId || `auto_${Math.random().toString(36).slice(2, 10)}`;
      const fullPath = `${colPath}/${id}`;
      return {
        id,
        path: fullPath,
        collection: (subCol: string) => createAdminCollectionRef(`${fullPath}/${subCol}`),
        get: async () => buildDocSnapshot(mockAdminStore, fullPath, false),
        set: async (data: any, opts?: { merge?: boolean }) => {
          if (opts?.merge) {
            const cur = mockAdminStore.get(fullPath) || {};
            mockAdminStore.set(fullPath, { ...cur, ...structuredClone(data) });
          } else {
            mockAdminStore.set(fullPath, structuredClone(data));
          }
        },
        update: async (data: any) => {
          const cur = mockAdminStore.get(fullPath) || {};
          mockAdminStore.set(fullPath, { ...cur, ...structuredClone(data) });
        },
        delete: async () => {
          mockAdminStore.delete(fullPath);
        }
      };
    }
  };
}

vi.mock("../../../lib/firebaseAdmin", () => {
  const adminDb = {
    doc: (docPath: string) => ({
      path: docPath,
      id: docPath.split("/").pop(),
      get: async () => buildDocSnapshot(mockAdminStore, docPath, false),
      set: async (data: any, opts?: { merge?: boolean }) => {
        if (opts?.merge) {
          const cur = mockAdminStore.get(docPath) || {};
          mockAdminStore.set(docPath, { ...cur, ...structuredClone(data) });
        } else {
          mockAdminStore.set(docPath, structuredClone(data));
        }
      },
      update: async (data: any) => {
        const cur = mockAdminStore.get(docPath) || {};
        mockAdminStore.set(docPath, { ...cur, ...structuredClone(data) });
      },
      delete: async () => {
        mockAdminStore.delete(docPath);
      }
    }),
    collection: (colName: string) => createAdminCollectionRef(colName),
    runTransaction: async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        get: async (ref: any) => ref.get(),
        set: (ref: any, data: any, opts?: { merge?: boolean }) => ref.set(data, opts),
        update: (ref: any, data: any) => ref.update(data),
        delete: (ref: any) => ref.delete()
      };
      return cb(tx);
    }
  };

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
  normalizeCanonicalAttendanceRole,
  TrustedAttendanceActor,
  TrustedAttendanceTarget
} from "../../../domains/attendance/AttendanceAuthorizationService";
import { AttendanceRepository } from "../../../repositories/AttendanceRepository";
import { PermissionService } from "../../../services/PermissionService";
import { PermissionRepository } from "../../../repositories";
import { verifyScannedBadgeSecurity } from "../../../domains/attendance/clientActorResolver";

describe("FINOPS Attendance P0 RBAC & Badge Kiosk Remediation Suite", () => {
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
    authorizedBranchIds?: string[];
    authorizedDepartmentIds?: string[];
    managerId?: string;
    supervisorId?: string;
    status?: string;
    active?: boolean;
    explicitAttendanceDelegation?: boolean;
    delegatedEmployeeIds?: string[];
    email?: string;
  }) {
    const empId = params.empId || params.uid;
    const userDoc: Record<string, any> = {
      uid: params.uid,
      email: params.email || `${params.uid}@finops.test`,
      displayName: params.uid,
      role: params.role,
      employeeId: empId,
      status: params.status || "ACTIVE"
    };
    if (params.businessId !== null) {
      userDoc.business_id = params.businessId;
      userDoc.businessId = params.businessId;
    }
    if (params.branchId) {
      userDoc.branch_id = params.branchId;
      userDoc.branchId = params.branchId;
    }
    if (params.departmentId) {
      userDoc.department_id = params.departmentId;
      userDoc.departmentId = params.departmentId;
    }
    if (params.authorizedBranchIds) {
      userDoc.authorizedBranchIds = params.authorizedBranchIds;
    }
    if (params.authorizedDepartmentIds) {
      userDoc.authorizedDepartmentIds = params.authorizedDepartmentIds;
    }
    if (params.explicitAttendanceDelegation !== undefined) {
      userDoc.explicitAttendanceDelegation = params.explicitAttendanceDelegation;
    }
    if (params.delegatedEmployeeIds) {
      userDoc.delegatedEmployeeIds = params.delegatedEmployeeIds;
    }
    mockAdminStore.set(`users/${params.uid}`, userDoc);

    const empDoc: Record<string, any> = {
      id: empId,
      firebase_uid: params.uid,
      uid: params.uid,
      name: `Employee ${empId}`,
      email: userDoc.email,
      role: params.role,
      status: params.status || "ACTIVE",
      active: params.active !== false
    };
    if (params.businessId !== null) {
      empDoc.business_id = params.businessId;
      empDoc.businessId = params.businessId;
    }
    if (params.branchId) {
      empDoc.branchId = params.branchId;
      empDoc.branch_id = params.branchId;
    }
    if (params.departmentId) {
      empDoc.departmentId = params.departmentId;
      empDoc.department_id = params.departmentId;
    }
    if (params.managerId) empDoc.managerId = params.managerId;
    if (params.supervisorId) empDoc.supervisorId = params.supervisorId;

    mockAdminStore.set(`employees/${empId}`, empDoc);
    mockClientStore.set(`employees/${empId}`, empDoc);
    mockClientStore.set(`users/${params.uid}`, userDoc);

    mockAuthTokens.set(`tok_${params.uid}`, {
      uid: params.uid,
      email: userDoc.email,
      email_verified: true,
      role: params.role,
      ...(params.businessId ? { business_id: params.businessId } : {}),
      ...(params.branchId ? { branch_id: params.branchId } : {})
    });
  }

  async function postAttendance(endpoint: string, token: string, body: Record<string, any>) {
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
    vi.clearAllMocks();

    mockAdminStore.set(`businesses/${BIZ_ALPHA}`, { id: BIZ_ALPHA, name: "Alpha Corp", status: "ACTIVE", ownerId: "owner_alpha" });
    mockAdminStore.set(`businesses/${BIZ_BETA}`, { id: BIZ_BETA, name: "Beta Corp", status: "ACTIVE", ownerId: "owner_beta" });

    seedUserAndEmployee({
      uid: "owner_alpha",
      role: "OWNER",
      businessId: BIZ_ALPHA,
      branchId: "br_hq"
    });
    seedUserAndEmployee({
      uid: "manager_alpha_b1",
      role: "MANAGER",
      businessId: BIZ_ALPHA,
      branchId: "br_1"
    });
    seedUserAndEmployee({
      uid: "supervisor_alpha_team1",
      role: "SUPERVISOR",
      businessId: BIZ_ALPHA,
      branchId: "br_1",
      departmentId: "dept_ops"
    });
    seedUserAndEmployee({
      uid: "head_teller_alpha",
      role: "HEAD_TELLER",
      businessId: BIZ_ALPHA,
      branchId: "br_1"
    });
    seedUserAndEmployee({
      uid: "head_teller_delegated",
      role: "HEAD_TELLER",
      businessId: BIZ_ALPHA,
      branchId: "br_1",
      explicitAttendanceDelegation: true
    });
    seedUserAndEmployee({
      uid: "senior_teller_alpha",
      role: "SENIOR_TELLER",
      businessId: BIZ_ALPHA,
      branchId: "br_1"
    });
    seedUserAndEmployee({
      uid: "junior_teller_alpha",
      role: "JUNIOR_TELLER",
      businessId: BIZ_ALPHA,
      branchId: "br_1"
    });
    seedUserAndEmployee({
      uid: "emp_alpha_b1",
      empId: "emp_alpha_b1",
      role: "EMPLOYEE",
      businessId: BIZ_ALPHA,
      branchId: "br_1",
      departmentId: "dept_ops",
      supervisorId: "supervisor_alpha_team1"
    });
    seedUserAndEmployee({
      uid: "emp_alpha_b2",
      empId: "emp_alpha_b2",
      role: "EMPLOYEE",
      businessId: BIZ_ALPHA,
      branchId: "br_2",
      departmentId: "dept_sales"
    });
    seedUserAndEmployee({
      uid: "emp_alpha_b1_otherdept",
      empId: "emp_alpha_b1_otherdept",
      role: "EMPLOYEE",
      businessId: BIZ_ALPHA,
      branchId: "br_1",
      departmentId: "dept_finance"
    });
    seedUserAndEmployee({
      uid: "emp_beta_1",
      empId: "emp_beta_1",
      role: "EMPLOYEE",
      businessId: BIZ_BETA,
      branchId: "br_beta_1"
    });
    seedUserAndEmployee({
      uid: "emp_alpha_suspended",
      empId: "emp_alpha_suspended",
      role: "EMPLOYEE",
      businessId: BIZ_ALPHA,
      branchId: "br_1",
      status: "SUSPENDED",
      active: false
    });
    seedUserAndEmployee({
      uid: "emp_missing_biz",
      empId: "emp_missing_biz",
      role: "EMPLOYEE",
      businessId: null,
      branchId: "br_1"
    });

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
  // SCENARIOS 1–18: CANONICAL ATTENDANCE RBAC POLICY (SERVER HTTP + DOMAIN)
  // =========================================================================

  it("Scenario 1: OWNER records another employee's badge attendance in same business -> ALLOW (persists canonical business_id in attendance_status)", async () => {
    mockAdminStore.set("employee_badges/badge_alpha_1", {
      id: "badge_alpha_1",
      employeeId: "emp_alpha_b1",
      business_id: BIZ_ALPHA,
      businessId: BIZ_ALPHA,
      status: "ACTIVE",
      signature: "SIG_VALID_EMP_B1"
    });

    const { status, json } = await postAttendance("/api/attendance/check-in", "tok_owner_alpha", {
      employeeId: "emp_alpha_b1",
      method: "QR",
      badgeId: "badge_alpha_1",
      qrSignature: "SIG_VALID_EMP_B1",
      deviceDate: "2026-11-23"
    });

    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.status.business_id).toBe(BIZ_ALPHA);
    expect(json.status.businessId).toBe(BIZ_ALPHA);
    expect(json.status.employeeId).toBe("emp_alpha_b1");
    expect(json.status.recordedBy).toBe("owner_alpha");

    const persistedStatus = mockAdminStore.get("attendance_status/emp_alpha_b1");
    expect(persistedStatus).toBeDefined();
    expect(persistedStatus.business_id).toBe(BIZ_ALPHA);
    expect(persistedStatus.businessId).toBe(BIZ_ALPHA);
    expect(persistedStatus.employeeId).toBe("emp_alpha_b1");
    expect(persistedStatus.recordedBy).toBe("owner_alpha");
    expect(persistedStatus.activeSessionId).toBe(json.session.sessionId);

    // Check-out by OWNER for the same employee also succeeds with valid badge signature
    const outRes = await postAttendance("/api/attendance/check-out", "tok_owner_alpha", {
      sessionId: json.session.sessionId,
      employeeId: "emp_alpha_b1",
      method: "QR",
      badgeId: "badge_alpha_1",
      qrSignature: "SIG_VALID_EMP_B1"
    });
    expect(outRes.status).toBe(200);
    expect(mockAdminStore.get("attendance_status/emp_alpha_b1")?.activeSessionId).toBeNull();
  });

  it("Scenario 2: OWNER records employee across a different branch in same business -> ALLOW", async () => {
    const { status, json } = await postAttendance("/api/attendance/check-in", "tok_owner_alpha", {
      employeeId: "emp_alpha_b2",
      method: "MANUAL",
      deviceDate: "2026-11-23"
    });
    expect(status).toBe(200);
    expect(json.session.business_id).toBe(BIZ_ALPHA);
    expect(json.session.branchId).toBe("br_2");
  });

  it("Scenario 3: OWNER attempts to record employee from another business -> DENY", async () => {
    const { status, json } = await postAttendance("/api/attendance/check-in", "tok_owner_alpha", {
      employeeId: "emp_beta_1",
      method: "MANUAL",
      deviceDate: "2026-11-23"
    });
    expect(status).toBe(403);
    expect(json.code).toBe("CROSS_TENANT_ATTENDANCE_DENIED");
    expect(mockAdminStore.get("attendance_status/emp_beta_1")).toBeUndefined();
  });

  it("Scenario 4: MANAGER records employee in authorized branch -> ALLOW", async () => {
    const { status, json } = await postAttendance("/api/attendance/check-in", "tok_manager_alpha_b1", {
      employeeId: "emp_alpha_b1",
      method: "MANUAL",
      deviceDate: "2026-11-23"
    });
    expect(status).toBe(200);
    expect(json.session.recordedBy).toBe("manager_alpha_b1");
    expect(json.session.business_id).toBe(BIZ_ALPHA);
  });

  it("Scenario 5: MANAGER attempts to record employee in another branch -> DENY", async () => {
    const { status, json } = await postAttendance("/api/attendance/check-in", "tok_manager_alpha_b1", {
      employeeId: "emp_alpha_b2",
      method: "MANUAL",
      deviceDate: "2026-11-23"
    });
    expect(status).toBe(403);
    expect(json.code).toBe("BRANCH_SCOPE_VIOLATION");
  });

  it("Scenario 6: SUPERVISOR records employee in authorized team/branch -> ALLOW (distinct canonical role)", async () => {
    expect(normalizeCanonicalAttendanceRole("SUPERVISOR")).toBe("SUPERVISOR");
    expect(normalizeCanonicalAttendanceRole("SUPERVISOR")).not.toBe("MANAGER");
    expect(normalizeCanonicalAttendanceRole("SUPERVISOR")).not.toBe("HEAD_TELLER");

    const { status, json } = await postAttendance("/api/attendance/check-in", "tok_supervisor_alpha_team1", {
      employeeId: "emp_alpha_b1",
      method: "MANUAL",
      deviceDate: "2026-11-23"
    });
    expect(status).toBe(200);
    expect(json.session.recordedByRole).toBe("SUPERVISOR");
  });

  it("Scenario 7: SUPERVISOR attempts to record employee outside authorized team/branch -> DENY", async () => {
    // Different department in same branch -> DENY
    const resOtherDept = await postAttendance("/api/attendance/check-in", "tok_supervisor_alpha_team1", {
      employeeId: "emp_alpha_b1_otherdept",
      method: "MANUAL",
      deviceDate: "2026-11-23"
    });
    expect(resOtherDept.status).toBe(403);
    expect(resOtherDept.json.code).toBe("SUPERVISOR_SCOPE_VIOLATION");

    // Different branch -> DENY
    const resOtherBranch = await postAttendance("/api/attendance/check-in", "tok_supervisor_alpha_team1", {
      employeeId: "emp_alpha_b2",
      method: "MANUAL",
      deviceDate: "2026-11-23"
    });
    expect(resOtherBranch.status).toBe(403);
    expect(resOtherBranch.json.code).toBe("SUPERVISOR_SCOPE_VIOLATION");
  });

  it("Scenario 8: HEAD_TELLER records own attendance -> ALLOW", async () => {
    const { status, json } = await postAttendance("/api/attendance/check-in", "tok_head_teller_alpha", {
      employeeId: "head_teller_alpha",
      method: "MANUAL",
      deviceDate: "2026-11-23"
    });
    expect(status).toBe(200);
    expect(json.session.employeeId).toBe("head_teller_alpha");
    expect(json.session.recordedBy).toBe("head_teller_alpha");
  });

  it("Scenario 9: HEAD_TELLER attempts to record another employee without explicit delegation -> DENY (and ALLOW only with trusted delegation)", async () => {
    const denied = await postAttendance("/api/attendance/check-in", "tok_head_teller_alpha", {
      employeeId: "emp_alpha_b1",
      method: "MANUAL",
      deviceDate: "2026-11-23"
    });
    expect(denied.status).toBe(403);
    expect(denied.json.code).toBe("TELLER_SELF_ATTENDANCE_ONLY");

    // Explicitly delegated HEAD_TELLER (stored on trusted server user doc, same branch) -> ALLOW
    const allowed = await postAttendance("/api/attendance/check-in", "tok_head_teller_delegated", {
      employeeId: "emp_alpha_b1",
      method: "MANUAL",
      deviceDate: "2026-11-23"
    });
    expect(allowed.status).toBe(200);
    expect(allowed.json.session.recordedBy).toBe("head_teller_delegated");
  });

  it("Scenario 10: SENIOR_TELLER records own attendance -> ALLOW", async () => {
    const { status } = await postAttendance("/api/attendance/check-in", "tok_senior_teller_alpha", {
      employeeId: "senior_teller_alpha",
      method: "MANUAL",
      deviceDate: "2026-11-23"
    });
    expect(status).toBe(200);
  });

  it("Scenario 11: SENIOR_TELLER attempts to record another employee -> DENY", async () => {
    const { status, json } = await postAttendance("/api/attendance/check-in", "tok_senior_teller_alpha", {
      employeeId: "emp_alpha_b1",
      method: "MANUAL",
      deviceDate: "2026-11-23"
    });
    expect(status).toBe(403);
    expect(json.code).toBe("SELF_ATTENDANCE_ONLY");
  });

  it("Scenario 12: JUNIOR_TELLER records own attendance -> ALLOW", async () => {
    const { status } = await postAttendance("/api/attendance/check-in", "tok_junior_teller_alpha", {
      employeeId: "junior_teller_alpha",
      method: "MANUAL",
      deviceDate: "2026-11-23"
    });
    expect(status).toBe(200);
  });

  it("Scenario 13: JUNIOR_TELLER attempts to record another employee -> DENY", async () => {
    const { status, json } = await postAttendance("/api/attendance/check-in", "tok_junior_teller_alpha", {
      employeeId: "emp_alpha_b1",
      method: "MANUAL",
      deviceDate: "2026-11-23"
    });
    expect(status).toBe(403);
    expect(json.code).toBe("SELF_ATTENDANCE_ONLY");
  });

  it("Scenario 14: EMPLOYEE records own attendance -> ALLOW", async () => {
    const { status } = await postAttendance("/api/attendance/check-in", "tok_emp_alpha_b1", {
      employeeId: "emp_alpha_b1",
      method: "MANUAL",
      deviceDate: "2026-11-23"
    });
    expect(status).toBe(200);
  });

  it("Scenario 15: EMPLOYEE attempts to record another employee -> DENY", async () => {
    const { status, json } = await postAttendance("/api/attendance/check-in", "tok_emp_alpha_b1", {
      employeeId: "emp_alpha_b2",
      method: "MANUAL",
      deviceDate: "2026-11-23"
    });
    expect(status).toBe(403);
    expect(json.code).toBe("SELF_ATTENDANCE_ONLY");
  });

  it("Scenario 16: Client attempts to forge business_id, target UID, actorId, or spoofed OWNER role -> DENY", async () => {
    // 16a: Employee attempts to spoof actor.role = "OWNER"
    const spoofRoleRes = await postAttendance("/api/attendance/check-in", "tok_emp_alpha_b1", {
      employeeId: "emp_alpha_b2",
      actor: { id: "emp_alpha_b1", role: "OWNER" },
      method: "MANUAL"
    });
    expect(spoofRoleRes.status).toBe(403);
    expect(spoofRoleRes.json.code).toBe("ROLE_SPOOFING_DETECTED");

    // 16b: Employee attempts to spoof actorId = "owner_alpha"
    const spoofActorRes = await postAttendance("/api/attendance/check-in", "tok_emp_alpha_b1", {
      employeeId: "emp_alpha_b2",
      actorId: "owner_alpha",
      recordedBy: "owner_alpha",
      method: "MANUAL"
    });
    expect(spoofActorRes.status).toBe(403);
    expect(spoofActorRes.json.code).toBe("IDENTITY_SPOOFING_DETECTED");

    // 16c: Forged client business_id on valid actor targeting alpha employee
    const forgedBizRes = await postAttendance("/api/attendance/check-in", "tok_owner_alpha", {
      employeeId: "emp_alpha_b1",
      businessId: BIZ_BETA,
      method: "MANUAL"
    });
    expect(forgedBizRes.status).toBe(403);
    expect(forgedBizRes.json.code).toBe("FORBIDDEN_TENANT_CLAIM");

    // 16d: Pure authorization helper rejects forged target UID claim
    const decision = authorizeAttendanceAction({
      action: "check_in",
      actor: { uid: "owner_alpha", role: "OWNER", business_id: BIZ_ALPHA },
      targetEmployee: { id: "emp_alpha_b1", firebase_uid: "emp_alpha_b1", business_id: BIZ_ALPHA, status: "ACTIVE" },
      claimedTargetUid: "forged_uid_999"
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("IDENTITY_SPOOFING_DETECTED");
  });

  it("Scenario 17: Missing business_id in target employee record -> DENY (fail-closed, zero silent fallback)", async () => {
    const { status, json } = await postAttendance("/api/attendance/check-in", "tok_owner_alpha", {
      employeeId: "emp_missing_biz",
      businessId: BIZ_ALPHA,
      method: "MANUAL"
    });
    expect(status).toBe(422);
    expect(json.code).toBe("MISSING_TARGET_TENANT_CONTEXT");
    expect(mockAdminStore.get("attendance_status/emp_missing_biz")).toBeUndefined();
  });

  it("Scenario 18: Inactive/suspended/cross-tenant employee or LOCKED/PESSIMISTIC_LOCKED/SEALED/PAID payroll period -> DENY", async () => {
    // 18a: Inactive/suspended employee
    const inactiveRes = await postAttendance("/api/attendance/check-in", "tok_owner_alpha", {
      employeeId: "emp_alpha_suspended",
      method: "MANUAL"
    });
    expect(inactiveRes.status).toBe(422);
    expect(inactiveRes.json.code).toBe("TARGET_EMPLOYEE_INACTIVE");

    // 18b: Locked payroll cycle statuses
    for (const lockStatus of ["LOCKED", "PESSIMISTIC_LOCKED", "SEALED", "PAID"]) {
      mockAdminStore.set("payroll_cycles/cycle_lock_test", {
        id: "cycle_lock_test",
        business_id: BIZ_ALPHA,
        status: lockStatus,
        startDate: "2026-11-01",
        endDate: "2026-11-30"
      });

      const lockedRes = await postAttendance("/api/attendance/check-in", "tok_owner_alpha", {
        employeeId: "emp_alpha_b1",
        method: "MANUAL",
        deviceDate: "2026-11-23"
      });
      expect(lockedRes.status).toBe(423);
      expect(lockedRes.json.code).toBe("PAYROLL_PERIOD_LOCKED");
    }
  });

  // =========================================================================
  // ADDITIONAL SECURITY VERIFICATIONS (BADGE CRYPTO, CLIENT REPO, RBAC, RULES)
  // =========================================================================

  it("Badge Security: rejects forged badge signature even when badge status is ACTIVE", async () => {
    mockAdminStore.set("employee_badges/badge_alpha_forged", {
      id: "badge_alpha_forged",
      employeeId: "emp_alpha_b1",
      business_id: BIZ_ALPHA,
      businessId: BIZ_ALPHA,
      status: "ACTIVE",
      signature: "SIG_REAL_CRYPTO_KEY"
    });

    const serverRes = await postAttendance("/api/attendance/check-in", "tok_owner_alpha", {
      employeeId: "emp_alpha_b1",
      method: "QR",
      badgeId: "badge_alpha_forged",
      qrSignature: "SIG_FAKE_ATTACKER",
      deviceDate: "2026-11-23"
    });
    expect(serverRes.status).toBe(403);
    expect(serverRes.json.code).toBe("INVALID_BADGE_SIGNATURE");

    // Client-side pre-verification also rejects invalid signature regardless of ACTIVE status
    const clientBadgeCheck = verifyScannedBadgeSecurity({
      emp: { id: "emp_alpha_b1", business_id: BIZ_ALPHA, status: "ACTIVE" } as any,
      activeBadge: {
        id: "badge_alpha_forged",
        employeeId: "emp_alpha_b1",
        business_id: BIZ_ALPHA,
        status: "ACTIVE",
        signature: "SIG_REAL_CRYPTO_KEY"
      } as any,
      signature: "SIG_FAKE_ATTACKER",
      payloadBusinessId: BIZ_ALPHA,
      currentBusinessId: BIZ_ALPHA
    });
    expect(clientBadgeCheck.valid).toBe(false);
    expect(clientBadgeCheck.reasonCode).toBe("INVALID_SIGNATURE");

    // Cross-tenant badge payload check uses OR (||), rejecting payload mismatch even if emp belongs to currentBusinessId
    const crossTenantPayload = verifyScannedBadgeSecurity({
      emp: { id: "emp_alpha_b1", business_id: BIZ_ALPHA, status: "ACTIVE" } as any,
      payloadBusinessId: BIZ_BETA,
      currentBusinessId: BIZ_ALPHA
    });
    expect(crossTenantPayload.valid).toBe(false);
    expect(crossTenantPayload.reasonCode).toBe("CROSS_TENANT");
  });

  it("Client Repository Direct Firestore Bypass Rejected (fail-closed) & verifyPeriodLock supports legacy camelCase businessId", async () => {
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
        deviceId: "KIOSK-TEST",
        location: "HQ",
        actor: { id: "owner_alpha", name: "Owner Alpha", role: "OWNER", businessId: BIZ_ALPHA },
        deviceDate: "2026-11-23",
        preferDirectFirestore: true
      })
    ).rejects.toThrow(/MUTATION_BYPASS_DENIED/i);
    expect(mockClientStore.get("attendance_status/emp_alpha_b1")).toBeUndefined();

    await expect(
      AttendanceRepository.checkOut({
        sessionId: "sess_1",
        employeeId: "emp_alpha_b1",
        businessId: BIZ_ALPHA,
        method: "MANUAL",
        actor: { id: "owner_alpha", name: "Owner Alpha", role: "OWNER", businessId: BIZ_ALPHA },
        preferDirectFirestore: true
      })
    ).rejects.toThrow(/MUTATION_BYPASS_DENIED/i);

    // verifyPeriodLock must detect legacy camelCase-only locked payroll_cycles
    mockClientStore.set("payroll_cycles/legacy_camel_locked", {
      id: "legacy_camel_locked",
      businessId: BIZ_ALPHA,
      status: "LOCKED",
      startDate: "2026-11-01",
      endDate: "2026-11-30"
    });
    await expect(
      AttendanceRepository.verifyPeriodLock(BIZ_ALPHA, "2026-11-23", { bypassCache: true })
    ).rejects.toThrow(/Période verrouillée/i);
  });

  it("PermissionService & PermissionRepository: preserves SUPERVISOR canonical independence and removes override_attendance from HEAD_TELLER", async () => {
    const fullFeatures: any = { attendance: true, payroll: true, accounting: true, pos: true, hr: true, crm: true, bi: true, aiCfo: true };

    const supervisorPerms = await PermissionRepository.getRolePermissions("SUPERVISOR" as any);
    expect(supervisorPerms).toContain("attendance.record_self");
    expect(supervisorPerms).toContain("attendance.record_others");
    expect(supervisorPerms).toContain("log_attendance");
    expect(supervisorPerms).not.toContain("override_attendance");

    const headTellerPerms = await PermissionRepository.getRolePermissions("HEAD_TELLER");
    expect(headTellerPerms).toContain("attendance.record_self");
    expect(headTellerPerms).not.toContain("attendance.record_others");
    expect(headTellerPerms).not.toContain("override_attendance");

    const seniorTellerPerms = await PermissionRepository.getRolePermissions("SENIOR_TELLER");
    expect(seniorTellerPerms).toContain("attendance.record_self");
    expect(seniorTellerPerms).not.toContain("attendance.record_others");

    PermissionService.init("SUPERVISOR", supervisorPerms, fullFeatures, "ENTERPRISE", "ACTIVE", BIZ_ALPHA);
    expect(PermissionService.can("attendance.record_others")).toBe(true);
    expect(PermissionService.can("override_attendance")).toBe(false);

    PermissionService.init("JUNIOR_TELLER", await PermissionRepository.getRolePermissions("JUNIOR_TELLER"), fullFeatures, "ENTERPRISE", "ACTIVE", BIZ_ALPHA);
    expect(PermissionService.can("attendance.record_self")).toBe(true);
    expect(PermissionService.can("attendance.record_others")).toBe(false);

    // Non-actor roles (AUDITOR) must be denied attendance mutations
    const auditorDecision = authorizeAttendanceAction({
      action: "check_in",
      actor: { uid: "aud_1", role: "AUDITOR", business_id: BIZ_ALPHA } as TrustedAttendanceActor,
      targetEmployee: { id: "emp_alpha_b1", business_id: BIZ_ALPHA, status: "ACTIVE" } as TrustedAttendanceTarget
    });
    expect(auditorDecision.allowed).toBe(false);
    expect(auditorDecision.code).toBe("FORBIDDEN_ATTENDANCE_ROLE");
  });

  it("Override Endpoint: enforces OWNER/MANAGER authority and rejects SUPERVISOR/TELLER/EMPLOYEE overrides", async () => {
    const deniedSup = await postAttendance("/api/attendance/override", "tok_supervisor_alpha_team1", {
      employeeId: "emp_alpha_b1",
      date: "2026-11-23",
      checkIn: "08:00",
      reason: "Manual fix"
    });
    expect(deniedSup.status).toBe(403);
    expect(deniedSup.json.code).toBe("OVERRIDE_FORBIDDEN_FOR_ROLE");

    const allowedOwner = await postAttendance("/api/attendance/override", "tok_owner_alpha", {
      employeeId: "emp_alpha_b1",
      date: "2026-11-23",
      checkIn: "08:00",
      checkOut: "17:00",
      reason: "Owner verified clock adjustment"
    });
    expect(allowedOwner.status).toBe(200);
    expect(allowedOwner.json.record.business_id).toBe(BIZ_ALPHA);
    expect(allowedOwner.json.record.overriddenBy).toBe("owner_alpha");
  });

  it("Static firestore.rules Verification: validates P0.2 server-authoritative attendance writes, null-safe attendance_status get, employees allowlist, and unchanged isTenantAdminOrManager", () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");

    // isTenantAdminOrManager must NOT include head_teller or master_head_teller
    const adminMgrMatch = rules.match(/function isTenantAdminOrManager\(bizId\)\s*\{([\s\S]*?)\n\s*\}/);
    expect(adminMgrMatch).not.toBeNull();
    expect(adminMgrMatch![1]).not.toContain("head_teller");
    expect(adminMgrMatch![1]).not.toContain("master_head_teller");

    // Distinct SUPERVISOR helper and attendance RBAC helpers
    expect(rules).toContain("function hasConsistentTenantFields(data)");
    expect(rules).toContain("function isAttendanceSupervisor(bizId)");
    expect(rules).toContain("getActorRoleLower() == 'supervisor'");
    expect(rules).toContain("function hasExplicitAttendanceDelegation(bizId)");
    expect(rules).toContain("function canWriteAttendanceForEmployee(empId, data)");
    expect(rules).toContain("!(getActorRoleLower() in ['auditor', 'guest', 'unassigned', 'accountant', ''])");

    // attendance_status preserves null-safe get while denying all direct client writes
    const statusBlock = rules.match(/match \/attendance_status\/\{id\}\s*\{([\s\S]*?)\n\s*\}/);
    expect(statusBlock).not.toBeNull();
    expect(statusBlock![1]).toContain("resource == null && exists(/databases/$(database)/documents/employees/$(id))");
    expect(statusBlock![1]).toContain("allow create, update, delete: if false;");

    // Authoritative attendance collections enforce server-only writes via Admin SDK
    for (const col of [
      "attendance_logs",
      "attendance_records",
      "attendance_sessions",
      "attendance_events",
      "attendance",
      "attendance_adjustment_requests",
      "attendance_idempotency"
    ]) {
      const colMatch = rules.match(new RegExp(`match \\/${col}\\/\\{[^}]+\\}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`));
      expect(colMatch, `Missing rules block for ${col}`).not.toBeNull();
      expect(colMatch![1]).toContain("allow create, update, delete: if false;");
    }

    // attendance_justifications requires canWriteAttendanceForEmployee and PENDING status on create
    const justMatch = rules.match(/match \/attendance_justifications\/\{id\}\s*\{([\s\S]*?)\n\s*\}/);
    expect(justMatch).not.toBeNull();
    expect(justMatch![1]).toContain("canWriteAttendanceForEmployee(");
    expect(justMatch![1]).toContain("request.resource.data.get('status', '') == 'PENDING'");

    // employee_badges write restricted to admin/manager (never generic tenant member)
    const badgesMatch = rules.match(/match \/employee_badges\/\{badgeId\}\s*\{([\s\S]*?)\n\s*\}/);
    expect(badgesMatch).not.toBeNull();
    expect(badgesMatch![1]).toContain("isTenantAdminOrManager(getBusinessId(request.resource.data))");
  });
});
