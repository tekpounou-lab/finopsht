import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";

// In-memory Firestore store and write telemetry shared with hoisted mocks
const testState = vi.hoisted(() => {
  const docs = new Map<string, Record<string, any>>();
  const writeLog: Array<{
    path: string;
    operation: "create" | "update";
    payload: Record<string, any>;
    merge: boolean;
  }> = [];
  const authUserRef: { current: any } = { current: null };
  let readDelayMs = 0;
  let createDelayMs = 0;

  return {
    docs,
    writeLog,
    authUserRef,
    getReadDelayMs: () => readDelayMs,
    setReadDelayMs: (ms: number) => {
      readDelayMs = ms;
    },
    getCreateDelayMs: () => createDelayMs,
    setCreateDelayMs: (ms: number) => {
      createDelayMs = ms;
    },
  };
});

/**
 * Evaluates the exact `match /users/{userId}` `allow create` and `allow update`
 * security invariants from `firestore.rules` (lines 696-755).
 */
function evaluateUsersAllowCreate(
  auth: { uid: string; email?: string; email_verified?: boolean; token?: Record<string, any> } | null,
  targetUserId: string,
  reqData: Record<string, any>
): { allowed: boolean; reason: string } {
  if (!auth?.uid) {
    return { allowed: false, reason: "UNAUTHENTICATED" };
  }

  const token = auth.token || {};
  const emailLower = String(auth.email || token.email || "").toLowerCase();
  const isSuperAdmin =
    token.is_super_admin === true ||
    token.isSuperAdmin === true ||
    token.role === "SUPER_ADMIN" ||
    (token.email_verified === true && emailLower === "tekpounou@gmail.com");

  if (isSuperAdmin) {
    return { allowed: true, reason: "SUPER_ADMIN" };
  }

  if (auth.uid !== targetUserId) {
    return { allowed: false, reason: "UID_MISMATCH" };
  }
  if ("is_super_admin" in reqData && reqData.is_super_admin === true) {
    return { allowed: false, reason: "FORBIDDEN_IS_SUPER_ADMIN_SNAKE" };
  }
  if ("isSuperAdmin" in reqData && reqData.isSuperAdmin === true) {
    return { allowed: false, reason: "FORBIDDEN_IS_SUPER_ADMIN_CAMEL" };
  }
  if ("super_admin" in reqData && reqData.super_admin === true) {
    return { allowed: false, reason: "FORBIDDEN_SUPER_ADMIN_FLAG" };
  }
  if ("is_owner" in reqData && reqData.is_owner === true) {
    return { allowed: false, reason: "FORBIDDEN_IS_OWNER_SNAKE" };
  }
  if ("isOwner" in reqData && reqData.isOwner === true) {
    return { allowed: false, reason: "FORBIDDEN_IS_OWNER_CAMEL" };
  }
  if ("permissions" in reqData) {
    return { allowed: false, reason: "FORBIDDEN_PERMISSIONS_FIELD" };
  }
  if ("operational_profile" in reqData || "operationalProfile" in reqData) {
    return { allowed: false, reason: "FORBIDDEN_OPERATIONAL_PROFILE" };
  }

  // (!('role' in request.resource.data) || request.resource.data.role.upper() in ['EMPLOYEE', ''])
  if ("role" in reqData) {
    const roleUpper = typeof reqData.role === "string" ? reqData.role.toUpperCase() : "__INVALID__";
    if (!["EMPLOYEE", ""].includes(roleUpper)) {
      return { allowed: false, reason: `FORBIDDEN_ROLE_${roleUpper}` };
    }
  }

  // ((!('businessId' in request.resource.data) || request.resource.data.businessId == '') ||
  //   request.resource.data.get('role', '').upper() in ['EMPLOYEE', ''])
  const hasBusinessId = "businessId" in reqData && reqData.businessId !== "";
  if (hasBusinessId) {
    const roleUpper = typeof reqData.role === "string" ? reqData.role.toUpperCase() : "";
    if (!["EMPLOYEE", ""].includes(roleUpper)) {
      return { allowed: false, reason: "FORBIDDEN_BUSINESS_ID_WITH_ROLE" };
    }
  }

  if ("tenantId" in reqData && reqData.tenantId !== "") {
    return { allowed: false, reason: "FORBIDDEN_TENANT_ID_CAMEL" };
  }
  if ("tenant_id" in reqData && reqData.tenant_id !== "") {
    return { allowed: false, reason: "FORBIDDEN_TENANT_ID_SNAKE" };
  }

  return { allowed: true, reason: "STANDARD_SELF_CREATE_ALLOWED" };
}

const USERS_SELF_UPDATE_ALLOWLIST = new Set([
  "display_name",
  "displayName",
  "name",
  "phone_number",
  "phoneNumber",
  "phone",
  "address",
  "photo_url",
  "photoURL",
  "avatarUrl",
  "avatar_url",
  "preferred_language",
  "preferredLanguage",
  "language",
  "locale",
  "timezone",
  "email_notifications_enabled",
  "emailNotificationsEnabled",
  "push_notifications_enabled",
  "pushNotificationsEnabled",
  "notification_preferences",
  "notificationPreferences",
  "theme",
  "ui_preferences",
  "uiPreferences",
  "bio",
  "job_title",
  "jobTitle",
  "department",
  "auth_provider",
  "authProvider",
  "auth_providers",
  "authProviders",
  "has_password",
  "has_set_password",
  "hasSetPassword",
  "requested_role",
  "requestedRole",
  "company_code",
  "companyCode",
  "onboarding_completed",
  "onboardingComplete",
  "account_status",
  "accountStatus",
  "updated_at",
  "updatedAt",
  "last_active_at",
  "lastActiveAt",
]);

function evaluateUsersAllowUpdate(
  auth: { uid: string; email?: string; token?: Record<string, any> } | null,
  targetUserId: string,
  existingData: Record<string, any>,
  mergedData: Record<string, any>
): { allowed: boolean; reason: string } {
  if (!auth?.uid) {
    return { allowed: false, reason: "UNAUTHENTICATED" };
  }

  const token = auth.token || {};
  const emailLower = String(auth.email || token.email || "").toLowerCase();
  const isSuperAdmin =
    token.is_super_admin === true ||
    token.isSuperAdmin === true ||
    token.role === "SUPER_ADMIN" ||
    (token.email_verified === true && emailLower === "tekpounou@gmail.com");

  if (isSuperAdmin) {
    return { allowed: true, reason: "SUPER_ADMIN" };
  }

  if (auth.uid !== targetUserId) {
    return { allowed: false, reason: "UID_MISMATCH" };
  }

  const allKeys = new Set([...Object.keys(existingData), ...Object.keys(mergedData)]);
  const affectedKeys: string[] = [];
  for (const k of allKeys) {
    if (existingData[k] !== mergedData[k]) {
      affectedKeys.push(k);
    }
  }

  for (const k of affectedKeys) {
    if (!USERS_SELF_UPDATE_ALLOWLIST.has(k)) {
      return { allowed: false, reason: `DISALLOWED_UPDATE_KEY_${k}` };
    }
  }

  if (affectedKeys.includes("account_status") || affectedKeys.includes("accountStatus")) {
    const allowedStatuses = new Set(["NEW_USER", "PENDING_MEMBER", "PENDING_OWNER", "WAITING_APPROVAL"]);
    const s1 = String(mergedData.account_status || "").toUpperCase();
    const s2 = String(mergedData.accountStatus || "").toUpperCase();
    if (!allowedStatuses.has(s1) || !allowedStatuses.has(s2)) {
      return { allowed: false, reason: `FORBIDDEN_ACCOUNT_STATUS_${s1 || s2}` };
    }
  }

  if (affectedKeys.includes("requested_role") || affectedKeys.includes("requestedRole")) {
    const r1 = String(mergedData.requested_role || "").toUpperCase();
    const r2 = String(mergedData.requestedRole || "").toUpperCase();
    if (r1 === "SUPER_ADMIN" || r2 === "SUPER_ADMIN") {
      return { allowed: false, reason: "FORBIDDEN_REQUESTED_ROLE_SUPER_ADMIN" };
    }
  }

  return { allowed: true, reason: "STANDARD_SELF_UPDATE_ALLOWED" };
}

vi.mock("../../../lib/firebase", () => ({
  db: { __mockDb: true },
  auth: {
    get currentUser() {
      return testState.authUserRef.current;
    },
    set currentUser(u: any) {
      testState.authUserRef.current = u;
    },
  },
  OperationType: {
    CREATE: "create",
    UPDATE: "update",
    DELETE: "delete",
    LIST: "list",
    GET: "get",
    WRITE: "write",
  },
  handleFirestoreError: (err: any) => {
    throw err;
  },
  logFirestoreError: () => undefined,
}));

vi.mock("firebase/firestore", () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  return {
    doc: (_db: any, col: string, id: string) => ({ path: `${col}/${id}`, col, id }),
    collection: (_db: any, col: string) => ({ col }),
    query: (target: any, ...constraints: any[]) => ({ target, constraints }),
    where: (field: string, op: string, value: any) => ({ field, op, value }),
    limit: (n: number) => ({ limit: n }),
    serverTimestamp: () => new Date().toISOString(),
    getDocFromCache: async () => ({ exists: () => false, id: "", data: () => undefined }),
    getDocsFromCache: async () => ({ empty: true, docs: [] }),
    getDoc: async (ref: any) => {
      if (testState.getReadDelayMs() > 0) {
        await sleep(testState.getReadDelayMs());
      }
      const data = testState.docs.get(ref.path);
      return {
        id: ref.id,
        exists: () => data !== undefined,
        data: () => (data ? { ...data } : undefined),
      };
    },
    getDocs: async () => ({ empty: true, docs: [] }),
    setDoc: async (ref: any, payload: Record<string, any>, options?: { merge?: boolean }) => {
      if (testState.getCreateDelayMs() > 0) {
        await sleep(testState.getCreateDelayMs());
      }
      const existing = testState.docs.get(ref.path);
      const isCreate = !existing;
      const nextData = options?.merge && existing ? { ...existing, ...payload } : { ...payload };

      if (ref.col === "users") {
        const currentUser = testState.authUserRef.current;
        const authContext = currentUser
          ? {
              uid: currentUser.uid,
              email: currentUser.email,
              token: {
                email: currentUser.email,
                email_verified: currentUser.emailVerified ?? true,
                ...(currentUser.__claims || {}),
              },
            }
          : null;

        const verdict = isCreate
          ? evaluateUsersAllowCreate(authContext, ref.id, nextData)
          : evaluateUsersAllowUpdate(authContext, ref.id, existing!, nextData);

        if (!verdict.allowed) {
          const permErr: any = new Error(`Missing or insufficient permissions. (${verdict.reason})`);
          permErr.code = "permission-denied";
          throw permErr;
        }
      }

      testState.writeLog.push({
        path: ref.path,
        operation: isCreate ? "create" : "update",
        payload: { ...payload },
        merge: Boolean(options?.merge),
      });
      testState.docs.set(ref.path, nextData);
    },
    updateDoc: async () => undefined,
    runTransaction: async () => undefined,
    writeBatch: () => ({ set: () => undefined, update: () => undefined, commit: async () => undefined }),
  };
});

vi.mock("../../../repositories/PendingBusinessRepository", () => ({
  PendingBusinessRepository: {
    getByOwnerUid: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("../../../repositories/ForensicLogRepository", () => ({
  computeSHA256Signature: vi.fn().mockResolvedValue("mock-sha256"),
  ForensicLogRepository: {
    createAndSignLog: vi.fn().mockResolvedValue({ id: "log_mock" }),
    writeForensicLog: vi.fn().mockResolvedValue(undefined),
    computeSHA256Signature: vi.fn().mockResolvedValue("mock-sha256"),
  },
}));

import { EnterpriseIdentityOrchestrator } from "../../../modules/identity/EnterpriseIdentityOrchestrator";
import { OptimizedResolver } from "../../../services/identity/OptimizedResolver";
import { UserProfileRepository } from "../../../repositories/UserProfileRepository";

function makeFirebaseUser(overrides: Record<string, any> = {}) {
  return {
    uid: "std_user_001",
    email: "alice.standard@example.com",
    emailVerified: true,
    displayName: "Alice Standard",
    photoURL: "",
    getIdToken: vi.fn().mockResolvedValue("mock-id-token"),
    ...overrides,
  } as any;
}

describe("P0.2: Firestore Bootstrap Security & Profile Write Deduplication", () => {
  const rulesPath = path.resolve(process.cwd(), "firestore.rules");
  const rulesContent = fs.readFileSync(rulesPath, "utf8");
  const usersMatch = rulesContent.match(/match \/users\/\{userId\} \{[\s\S]*?\n    \}/)?.[0] || "";

  const getUsersWrites = () => testState.writeLog.filter((w) => w.path.startsWith("users/"));

  beforeEach(() => {
    testState.docs.clear();
    testState.writeLog.length = 0;
    testState.authUserRef.current = null;
    testState.setReadDelayMs(0);
    testState.setCreateDelayMs(0);
    EnterpriseIdentityOrchestrator.clearSessionCache();
    OptimizedResolver.clearAllCache();
    testState.writeLog.length = 0;
  });

  describe("0. Guardrail: firestore.rules was NOT weakened", () => {
    it("does NOT allow 'UNASSIGNED' in users/{userId} create rule and preserves strict field guards", () => {
      expect(usersMatch).not.toContain("UNASSIGNED");
      expect(usersMatch).toContain("(!('role' in request.resource.data) || request.resource.data.role.upper() in ['EMPLOYEE', ''])");
      expect(usersMatch).toContain("(!('tenantId' in request.resource.data) || request.resource.data.tenantId == '')");
      expect(usersMatch).toContain("(!('tenant_id' in request.resource.data) || request.resource.data.tenant_id == '')");
    });
  });

  describe("1-5. Firestore users/{uid} creation rules matrix", () => {
    it("1. ALLOWS initial profile creation by authenticated standard user (no role, no tenant)", async () => {
      const user = makeFirebaseUser({ uid: "u_new_101", email: "newuser@company.ht", displayName: "Jean Marc" });
      testState.authUserRef.current = user;

      const snapshot = await EnterpriseIdentityOrchestrator.orchestrate(user);

      expect(snapshot.orchestratorState).toBe("READY");
      const usersWrites = getUsersWrites();
      expect(usersWrites).toHaveLength(1);

      const createdWrite = usersWrites[0];
      expect(createdWrite.path).toBe("users/u_new_101");
      expect(createdWrite.operation).toBe("create");

      // Role MUST NOT be written on initial non-SuperAdmin bootstrap
      expect("role" in createdWrite.payload).toBe(false);
      expect("businessId" in createdWrite.payload).toBe(false);
      expect("business_id" in createdWrite.payload).toBe(false);
      expect("tenantId" in createdWrite.payload).toBe(false);
      expect("tenant_id" in createdWrite.payload).toBe(false);
      expect("permissions" in createdWrite.payload).toBe(false);
      expect(createdWrite.payload.accountStatus).toBe("NEW_USER");
      expect(createdWrite.payload.account_status).toBe("NEW_USER");
      expect(createdWrite.payload.onboardingComplete).toBe(false);
      expect(createdWrite.payload.onboarding_completed).toBe(false);

      const stored = testState.docs.get("users/u_new_101");
      expect(stored).toBeDefined();
      expect("role" in stored!).toBe(false);
    });

    it("2. DENIES profile creation with role = OWNER for standard user", () => {
      const verdict = evaluateUsersAllowCreate(
        { uid: "u_attacker_1", email: "attacker@example.com", token: { email_verified: true } },
        "u_attacker_1",
        { id: "u_attacker_1", email: "attacker@example.com", role: "OWNER", account_status: "NEW_USER" }
      );
      expect(verdict.allowed).toBe(false);
      expect(verdict.reason).toBe("FORBIDDEN_ROLE_OWNER");
    });

    it("3. DENIES profile creation with role = MANAGER for standard user", () => {
      const verdict = evaluateUsersAllowCreate(
        { uid: "u_attacker_2", email: "attacker@example.com", token: { email_verified: true } },
        "u_attacker_2",
        { id: "u_attacker_2", email: "attacker@example.com", role: "MANAGER", account_status: "NEW_USER" }
      );
      expect(verdict.allowed).toBe(false);
      expect(verdict.reason).toBe("FORBIDDEN_ROLE_MANAGER");
    });

    it("4. DENIES profile creation with role = SUPER_ADMIN for standard user", () => {
      const verdict = evaluateUsersAllowCreate(
        { uid: "u_attacker_3", email: "attacker@example.com", token: { email_verified: true } },
        "u_attacker_3",
        { id: "u_attacker_3", email: "attacker@example.com", role: "SUPER_ADMIN", account_status: "ACTIVE" }
      );
      expect(verdict.allowed).toBe(false);
      expect(verdict.reason).toBe("FORBIDDEN_ROLE_SUPER_ADMIN");
    });

    it("5. DENIES profile creation with unauthorized businessId+role or tenantId/tenant_id", () => {
      const withTenantId = evaluateUsersAllowCreate(
        { uid: "u_attacker_4", email: "attacker@example.com", token: { email_verified: true } },
        "u_attacker_4",
        { id: "u_attacker_4", email: "attacker@example.com", tenantId: "biz_victim" }
      );
      expect(withTenantId.allowed).toBe(false);
      expect(withTenantId.reason).toBe("FORBIDDEN_TENANT_ID_CAMEL");

      const withSnakeTenantId = evaluateUsersAllowCreate(
        { uid: "u_attacker_4", email: "attacker@example.com", token: { email_verified: true } },
        "u_attacker_4",
        { id: "u_attacker_4", email: "attacker@example.com", tenant_id: "biz_victim" }
      );
      expect(withSnakeTenantId.allowed).toBe(false);
      expect(withSnakeTenantId.reason).toBe("FORBIDDEN_TENANT_ID_SNAKE");

      const withForeignBusinessAndOwner = evaluateUsersAllowCreate(
        { uid: "u_attacker_4", email: "attacker@example.com", token: { email_verified: true } },
        "u_attacker_4",
        { id: "u_attacker_4", email: "attacker@example.com", businessId: "biz_victim", role: "OWNER" }
      );
      expect(withForeignBusinessAndOwner.allowed).toBe(false);
    });

    it("preserves dedicated SUPER_ADMIN bootstrap when isSuperAdminEmail(email) is true", async () => {
      const superUser = makeFirebaseUser({
        uid: "u_super_001",
        email: "tekpounou@gmail.com",
        emailVerified: true,
        displayName: "Platform Super Admin",
        __claims: { is_super_admin: true, role: "SUPER_ADMIN" },
      });
      testState.authUserRef.current = superUser;

      const snapshot = await EnterpriseIdentityOrchestrator.orchestrate(superUser);
      expect(snapshot.role).toBe("SUPER_ADMIN");
      expect(snapshot.identityStatus).toBe("SUPER_ADMIN");
      expect(snapshot.onboardingStatus).toBe("COMPLETED");

      const usersWrites = getUsersWrites();
      expect(usersWrites).toHaveLength(1);
      const createdWrite = usersWrites[0];
      expect(createdWrite.payload.role).toBe("SUPER_ADMIN");
      expect(createdWrite.payload.accountStatus).toBe("ACTIVE");
      expect(createdWrite.payload.account_status).toBe("ACTIVE");
      expect(createdWrite.payload.onboardingComplete).toBe(true);
      expect(createdWrite.payload.onboarding_completed).toBe(true);
    });
  });

  describe("6. Handling of profiles without a role field", () => {
    it("resolves existing users/{uid} without role to snapshot.role='UNASSIGNED', NEW_USER, PENDING_WORKSPACE, permissions=[]", async () => {
      const user = makeFirebaseUser({ uid: "u_roleless_1", email: "roleless@company.ht" });
      testState.authUserRef.current = user;
      testState.docs.set("users/u_roleless_1", {
        id: "u_roleless_1",
        email: "roleless@company.ht",
        name: "Roleless User",
        accountStatus: "NEW_USER",
        account_status: "NEW_USER",
        onboardingComplete: false,
        onboarding_completed: false,
      });

      const snapshot = await EnterpriseIdentityOrchestrator.orchestrate(user);

      expect(snapshot.orchestratorState).toBe("READY");
      expect(snapshot.role).toBe("UNASSIGNED");
      expect(snapshot.identityStatus).toBe("NEW_USER");
      expect(snapshot.onboardingStatus).toBe("PENDING_WORKSPACE");
      expect(snapshot.permissions).toEqual([]);
      expect(getUsersWrites()).toHaveLength(0);
    });

    it("refuses forged client-side role='SUPER_ADMIN' on non-SuperAdmin profile during orchestration", async () => {
      const user = makeFirebaseUser({ uid: "u_forged_1", email: "notadmin@company.ht" });
      testState.authUserRef.current = user;
      testState.docs.set("users/u_forged_1", {
        id: "u_forged_1",
        email: "notadmin@company.ht",
        name: "Forged",
        role: "SUPER_ADMIN",
        accountStatus: "NEW_USER",
      });

      const snapshot = await EnterpriseIdentityOrchestrator.orchestrate(user);
      expect(snapshot.role).toBe("UNASSIGNED");
      expect(snapshot.identityStatus).not.toBe("SUPER_ADMIN");
      expect(snapshot.identityStatus).not.toBe("ACTIVE");
      expect(snapshot.permissions).toEqual([]);
      expect(snapshot.onboardingStatus).toBe("PENDING_WORKSPACE");
    });
  });

  describe("7-8. Sign-up simulation (UnifiedAuthPortal + onAuthStateChanged) & Write Deduplication", () => {
    it("7. UnifiedAuthPortal.tsx delegates signup profile bootstrap to EnterpriseIdentityOrchestrator without direct privileged setDoc", () => {
      const portalSource = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/UnifiedAuthPortal.tsx"),
        "utf8"
      );
      expect(portalSource).toContain("EnterpriseIdentityOrchestrator.setPendingDisplayName");
      expect(portalSource).toContain("EnterpriseIdentityOrchestrator.orchestrate(userCred.user)");
      expect(portalSource).not.toMatch(/setDoc\s*\(\s*doc\s*\(\s*db\s*,\s*["']users["']/);
      expect(portalSource).not.toContain("role: initialRole");
      expect(portalSource).not.toContain('accountStatus: "ACTIVE"');
    });

    it("7 & 8a. Coalesces simultaneous onAuthStateChanged + UnifiedAuthPortal signup calls into a single users/{uid} write without privileged fields", async () => {
      // Simulate real Firestore latency during read/create so onAuthStateChanged and signup race overlap
      testState.setReadDelayMs(15);
      testState.setCreateDelayMs(15);

      const user = makeFirebaseUser({
        uid: "u_signup_race_1",
        email: "marie.signup@example.com",
        displayName: "",
      });
      testState.authUserRef.current = user;

      // 1) Auth listener fires immediately on createUserWithEmailAndPassword
      const authListenerPromise = EnterpriseIdentityOrchestrator.orchestrate(user);

      // 2) UnifiedAuthPortal registers pending display name, updates Auth profile, and calls orchestrate concurrently
      const resolvedName = "Marie Joseph";
      EnterpriseIdentityOrchestrator.setPendingDisplayName(user.uid, resolvedName);
      user.displayName = resolvedName;
      const portalPromise = EnterpriseIdentityOrchestrator.orchestrate(user);

      const [snap1, snap2] = await Promise.all([authListenerPromise, portalPromise]);

      expect(snap1).toBe(snap2);
      expect(snap2.orchestratorState).toBe("READY");
      expect(snap2.role).toBe("UNASSIGNED");
      expect(snap2.identityStatus).toBe("NEW_USER");

      // Strictly 1 create write happened for users/{uid}
      const usersWrites = getUsersWrites();
      expect(usersWrites).toHaveLength(1);
      expect(usersWrites[0].operation).toBe("create");
      expect("role" in usersWrites[0].payload).toBe(false);

      // Conditional name sync only triggers when snapshot.displayName !== resolvedName
      if (snap2.displayName !== resolvedName) {
        await UserProfileRepository.updateUserProfile(user.uid, {
          name: resolvedName,
          displayName: resolvedName,
        });
      }
      const stored = testState.docs.get("users/u_signup_race_1")!;
      expect(stored.name).toBeDefined();
      expect("role" in stored).toBe(false);
    });

    it("8b. Sequential second orchestrate() hits cache and emits ZERO additional writes", async () => {
      const user = makeFirebaseUser({ uid: "u_seq_1", email: "seq@example.com", displayName: "Seq User" });
      testState.authUserRef.current = user;

      await EnterpriseIdentityOrchestrator.orchestrate(user);
      expect(getUsersWrites()).toHaveLength(1);

      // Re-orchestrate after bootstrap while profile is cached in OptimizedResolver memory cache
      const snapSecond = await EnterpriseIdentityOrchestrator.orchestrate(user);
      expect(snapSecond.role).toBe("UNASSIGNED");
      expect(getUsersWrites()).toHaveLength(1);
    });

    it("8c. setRequestedRole waits for bootstrap and updates ONLY allowlisted requestedRole fields (rejects SUPER_ADMIN)", async () => {
      testState.setReadDelayMs(10);
      testState.setCreateDelayMs(10);

      const user = makeFirebaseUser({ uid: "u_req_role_1", email: "founder@example.com", displayName: "Founder" });
      testState.authUserRef.current = user;

      await expect(
        EnterpriseIdentityOrchestrator.setRequestedRole(user, "SUPER_ADMIN" as any)
      ).rejects.toThrow("FORBIDDEN_REQUESTED_ROLE");
      expect(getUsersWrites()).toHaveLength(0);

      // Trigger bootstrap and setRequestedRole concurrently
      const [snap] = await Promise.all([
        EnterpriseIdentityOrchestrator.orchestrate(user),
        EnterpriseIdentityOrchestrator.setRequestedRole(user, "OWNER"),
      ]);

      expect(snap).toBeDefined();
      const usersWrites = getUsersWrites();
      expect(usersWrites).toHaveLength(2);
      expect(usersWrites[0].operation).toBe("create");
      expect(usersWrites[1].operation).toBe("update");
      expect(Object.keys(usersWrites[1].payload).sort()).toEqual([
        "requestedRole",
        "requested_role",
        "updatedAt",
        "updated_at",
      ]);

      const finalDoc = testState.docs.get("users/u_req_role_1")!;
      expect("role" in finalDoc).toBe(false);
      expect(finalDoc.requestedRole).toBe("OWNER");
      expect(finalDoc.requested_role).toBe("OWNER");
    });
  });
});
