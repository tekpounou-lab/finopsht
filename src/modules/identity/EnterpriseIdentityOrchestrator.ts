import { db, auth } from "../../lib/firebase";
import { 
  doc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  limit, 
  runTransaction,
  writeBatch,
  updateDoc
} from "firebase/firestore";
import { User as FirebaseUser } from "firebase/auth";
import { resilientGetDoc, resilientGetDocs, FirestoreNetworkError, isNetworkError, withTimeout, clearResilientCache } from "../../utils/resilientFirestore";
import { 
  IdentitySnapshot, 
  OrchestratorState, 
  TerminalErrorState,
  IdentityStatus,
  OnboardingStatus
} from "./types";
import { Employee, Business, Role, UserProfile, BusinessSnapshot } from "../../types";
import { WorkspaceProvisioningService } from "../../services/business/WorkspaceProvisioningService";
import { BusinessSnapshotService } from "../../services/business/BusinessSnapshotService";
import { SUPER_ADMIN_EMAIL, isSuperAdminEmail } from "../../config/superadmin";
import { PermissionRepository } from "../../repositories";
import { OptimizedResolver } from "../../services/identity/OptimizedResolver";
import { BusinessResolver } from "../../services/business/BusinessResolver";
import { PermissionService } from "../../services/PermissionService";
import { SynchronizationEngine } from "../runtime/SynchronizationEngine";
import { realtimeManager } from "../../services/firestore/realtimeManager";
import { FirestoreRealtimeManager } from "../../services/firestore/FirestoreRealtimeManager";
import { FeatureResolver } from "../../services/FeatureResolver";
import { DashboardQueryService } from "../../services/query/DashboardQueryService";
import { EmployeeQueryService } from "../../services/query/EmployeeQueryService";
import { CentralizedCachePurgeManager } from "./CentralizedCachePurgeManager";
import { SecurityAuditLogger } from "../../services/security/SecurityAuditLogger";

function cleanPayload<T extends Record<string, any>>(obj: T): Partial<T> {
  const obsolete = new Set([
    'business_id', 'branch_id', 'department_id', 'employee_id', 'firebase_uid', 
    'display_name', 'employee_name', 'created_at', 'updated_at', 'hire_date', 
    'base_salary', 'salary_base_htg', 'salaryBaseHtg', 'payment_model', 'commission_rate', 
    'business_status', 'account_status', 'onboarding_completed', 'normalized_email', 
    'total_gross_htg', 'total_net_htg', 'amount_paid', 'is_paid', 'customer_id', 
    'invoice_date', 'due_date', 'owner_id', 'is_active', 'totalGrossHtg', 'totalNetHtg',
    'target_user_id', 'target_roles', 'read_at', 'amount_cents', 'debit_account',
    'credit_account', 'debit_cents', 'credit_cents', 'requested_role', 'user_id'
  ]);
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (!obsolete.has(key) && val !== undefined) {
      cleaned[key] = val;
    }
  }
  return cleaned as Partial<T>;
}

export class EnterpriseIdentityOrchestrator {
  private static readonly SUPER_ADMIN_EMAIL = SUPER_ADMIN_EMAIL;
  private static inFlightOrchestration: Map<string, Promise<IdentitySnapshot>> = new Map();
  private static pendingRequestedRoles: Map<string, Role> = new Map();
  private static loggedHydrations: Set<string> = new Set();

  /**
   * Action: Set the requested role (Owner or Employee) for onboarding persistence
   */
  static async setRequestedRole(user: FirebaseUser, role: Role): Promise<void> {
    // Record in-memory pending role for zero-latency orchestration synchronization
    this.pendingRequestedRoles.set(user.uid, role);

    // Invalidate stale in-flight orchestration for this user so fresh state is resolved
    this.inFlightOrchestration.delete(user.uid);

    const userRef = doc(db, "users", user.uid);
    await setDoc(userRef, cleanPayload({
      id: user.uid,
      email: user.email || "",
      name: user.displayName || "User",
      requestedRole: role,
      updatedAt: new Date().toISOString()
    }), { merge: true });

    // Instantly update cache snapshot
    const cached = this.getCachedSnapshot(user.uid);
    if (cached) {
      this.cacheSnapshot(user.uid, {
        ...cached,
        requested_role: role
      });
    }
  }

  static invalidateCache(uid: string): void {
    if (!uid) return;
    try {
      this.loggedHydrations.delete(uid);
      this.inFlightOrchestration.delete(uid);
      this.pendingRequestedRoles.delete(uid);

      if (typeof window !== "undefined") {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.removeItem(`finops_identity_cache_${uid}`);
          sessionStorage.removeItem("finops_active_identity_snapshot");
          sessionStorage.removeItem("finops_active_session_uid");
        }
        if (typeof localStorage !== "undefined") {
          localStorage.removeItem(`finops_identity_cache_${uid}`);
          localStorage.removeItem("finops_active_identity_snapshot");
        }
      }

      clearResilientCache();
      OptimizedResolver.clearAllCache();
      BusinessResolver.clearAllCache();
      FeatureResolver.clearCacheLocal();
      DashboardQueryService.invalidateCache();
      EmployeeQueryService.invalidateCache();

      console.log(`[Orchestrator] Cache explicitly invalidated for UID: ${uid}`);
    } catch (e) {
      console.warn(`[Orchestrator] Error invalidating cache for UID ${uid}:`, e);
    }
  }

  static clearSessionCache(): void {
    try {
      this.loggedHydrations.clear();
      this.inFlightOrchestration.clear();
      this.pendingRequestedRoles.clear();

      CentralizedCachePurgeManager.purgeAllCaches({ reason: "ORCHESTRATOR_CLEAR_SESSION" });
      OptimizedResolver.clearAllCache();
      BusinessResolver.clearAllCache();
      PermissionService.reset();
      SynchronizationEngine.stopSync();
      realtimeManager.purgeAll();
      FirestoreRealtimeManager.clearAll();
      FeatureResolver.clearCacheLocal();
      DashboardQueryService.invalidateCache();
      EmployeeQueryService.invalidateCache();

      sessionStorage.removeItem("finops_active_session_uid");
      sessionStorage.removeItem("finops_active_identity_snapshot");
      localStorage.removeItem("finops_active_identity_snapshot");

      // Scan and remove all finops_ keys from storage
      const sessionKeysToClear: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith("finops_")) {
          sessionKeysToClear.push(k);
        }
      }
      sessionKeysToClear.forEach((k) => sessionStorage.removeItem(k));

      const localKeysToClear: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("finops_")) {
          localKeysToClear.push(k);
        }
      }
      localKeysToClear.forEach((k) => localStorage.removeItem(k));

      console.log("[Orchestrator] Session cache, global keys, and all realtime streams purged successfully");
    } catch (e) {
      console.warn("[Orchestrator] Error clearing session cache:", e);
    }
  }

  static getCachedSnapshot(uid: string): IdentitySnapshot | null {
    if (!uid) return null;
    try {
      const key = `finops_identity_cache_${uid}`;
      const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
      if (raw) {
        const parsed: IdentitySnapshot = JSON.parse(raw);
        // Strict UID verification
        if (!parsed || parsed.user_uid !== uid) {
          console.warn(`[Orchestrator] Cache UID mismatch: expected ${uid}, found ${parsed?.user_uid}. Purging stale item.`);
          sessionStorage.removeItem(key);
          localStorage.removeItem(key);
          return null;
        }
        // Verify cache freshness (15 minutes)
        if (parsed.lastResolvedAt) {
          const age = Date.now() - new Date(parsed.lastResolvedAt).getTime();
          if (age < 15 * 60 * 1000) {
            if (!this.loggedHydrations.has(uid)) {
              this.loggedHydrations.add(uid);
              console.log(`[Orchestrator] HYDRATED_FROM_SESSION_STORAGE for user ${uid}`);
            }
            return parsed;
          }
        } else {
          if (!this.loggedHydrations.has(uid)) {
            this.loggedHydrations.add(uid);
            console.log(`[Orchestrator] HYDRATED_FROM_SESSION_STORAGE for user ${uid}`);
          }
          return parsed;
        }
      }
    } catch (e) {}
    return null;
  }

  static getHydratedSessionSnapshot(currentUid?: string): IdentitySnapshot | null {
    // Strictly require verified currentUid to prevent hydrating previous user's session
    if (!currentUid) {
      return null;
    }
    try {
      const activeUid = sessionStorage.getItem("finops_active_session_uid");
      if (activeUid && activeUid !== currentUid) {
        console.warn(`[Orchestrator] Active session UID mismatch (${activeUid} vs ${currentUid}). Purging cache.`);
        this.clearSessionCache();
        return null;
      }
      return this.getCachedSnapshot(currentUid);
    } catch (e) {}
    return null;
  }

  static cacheSnapshot(uid: string, snapshot: IdentitySnapshot): void {
    if (!uid || !snapshot) return;
    try {
      const key = `finops_identity_cache_${uid}`;
      const data = JSON.stringify({
        ...snapshot,
        lastResolvedAt: new Date().toISOString()
      });
      sessionStorage.setItem(key, data);
      localStorage.setItem(key, data);
      sessionStorage.setItem("finops_active_session_uid", uid);
    } catch (e) {}
  }

  static async orchestrate(user: FirebaseUser): Promise<IdentitySnapshot> {
    if (this.inFlightOrchestration.has(user.uid)) {
      console.log(`[Orchestrator] Deduplicating concurrent orchestration call for ${user.email}`);
      return this.inFlightOrchestration.get(user.uid)!;
    }

    // Global 20s timeout with resilient cache/fallback to guarantee UI never blocks indefinitely during network degradation
    const orchestrationPromise = withTimeout(
      this.executeOrchestration(user),
      20000,
      `EnterpriseIdentityOrchestrator.orchestrate(${user.email || user.uid})`
    ).catch((err: any) => {
      console.warn(`[Orchestrator] Global orchestration fallback activated:`, err?.message || err);
      const cached = this.getCachedSnapshot(user.uid);
      if (cached) {
        console.warn(`[Orchestrator] Returning cached snapshot due to timeout/fallback.`);
        return cached;
      }
      const isSuperAdmin = user.email?.toLowerCase() === this.SUPER_ADMIN_EMAIL;
      const fallbackSnapshot: IdentitySnapshot = {
        user_uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || "",
        photoURL: user.photoURL || "",
        employee: null,
        business: null,
        businessSnapshot: null,
        role: isSuperAdmin ? "SUPER_ADMIN" : "UNASSIGNED",
        identityStatus: isSuperAdmin ? "SUPER_ADMIN" : "NEW_USER",
        onboardingStatus: isSuperAdmin ? "COMPLETED" : "PENDING_IDENTITY",
        orchestratorState: "READY",
        terminalError: undefined,
        invitation: null,
        permissions: [],
        lastResolvedAt: new Date().toISOString()
      };
      return fallbackSnapshot;
    });

    this.inFlightOrchestration.set(user.uid, orchestrationPromise);

    try {
      return await orchestrationPromise;
    } finally {
      this.inFlightOrchestration.delete(user.uid);
    }
  }

  private static async executeOrchestration(user: FirebaseUser): Promise<IdentitySnapshot> {
    const correlationId = `track_${Math.random().toString(36).substring(2, 11)}`;

    let snapshot: IdentitySnapshot = {
      user_uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "",
      photoURL: user.photoURL || "",
      employee: null,
      business: null,
      businessSnapshot: null,
      role: "UNASSIGNED",
      identityStatus: "NEW_USER",
      onboardingStatus: "PENDING_IDENTITY",
      orchestratorState: "AUTHENTICATED",
      invitation: null,
      permissions: [],
      lastResolvedAt: new Date().toISOString()
    };

    if (!auth.currentUser || auth.currentUser.uid !== user.uid) {
      console.log(`[Orchestrator][${correlationId}] Aborting orchestration: User not authenticated or mismatch`);
      return snapshot;
    }

    console.log(`[Orchestrator][${correlationId}] Starting orchestration for ${user.email}`);

    const startTime = performance.now();

    try {
      // 1. PHASE 1: FULLY PARALLEL RESOLUTION (Profile + Employee + Owner Biz + Invitations)
      snapshot.orchestratorState = "IDENTITY_RESOLUTION";
      const isSuperAdmin = user.email?.toLowerCase() === this.SUPER_ADMIN_EMAIL;

      const profilePromise = this.resolveUserProfile(user, correlationId).catch(err => {
        console.warn(`[Orchestrator][${correlationId}] User profile fetch warning:`, err);
        return null;
      });

      const initialEmployeePromise = !isSuperAdmin
        ? this.resolveEmployee(user, null, correlationId).catch(err => {
            console.warn(`[Orchestrator][${correlationId}] resolveEmployee non-fatal warning:`, err);
            return null;
          })
        : Promise.resolve(null);

      const ownerBizPromise = user.uid
        ? Promise.all([
            resilientGetDocs(
              query(collection(db, "businesses"), where("ownerId", "==", user.uid), limit(1)),
              undefined,
              { timeoutMs: 3000, maxRetries: 1, fallbackToCache: true, throwOnNetworkFailure: false }
            ).catch(() => null),
            resilientGetDocs(
              query(collection(db, "businesses"), where("owner_id", "==", user.uid), limit(1)),
              undefined,
              { timeoutMs: 3000, maxRetries: 1, fallbackToCache: true, throwOnNetworkFailure: false }
            ).catch(() => null),
          ]).then(([snapCamel, snapSnake]) => {
            if (snapCamel && !snapCamel.empty) return snapCamel;
            if (snapSnake && !snapSnake.empty) return snapSnake;
            return null;
          })
        : Promise.resolve(null);

      const invitationPromise = this.resolveInvitation(user, correlationId).catch(err => {
        console.warn(`[Orchestrator][${correlationId}] resolveInvitation non-fatal warning:`, err);
        return null;
      });

      const [userProfile, initialEmployee, snapBiz, resolvedInvitation] = await Promise.all([
        profilePromise,
        initialEmployeePromise,
        ownerBizPromise,
        invitationPromise
      ]);

      let employee = initialEmployee;
      // If employee wasn't found by direct queries but profile has employeeId/employee_id, secondary quick direct check
      const profileEmpId = userProfile?.employeeId || userProfile?.employee_id;
      if (!employee && profileEmpId && !isSuperAdmin) {
        try {
          const empRef = doc(db, "employees", profileEmpId);
          const empSnap = await resilientGetDoc(empRef, { timeoutMs: 2500, maxRetries: 1, fallbackToCache: true, throwOnNetworkFailure: false });
          if (empSnap && empSnap.exists()) {
            employee = { id: empSnap.id, ...empSnap.data() } as Employee;
          }
        } catch (e) {
          console.warn(`[Orchestrator][${correlationId}] Secondary employee lookup by ID failed:`, e);
        }
      }

      // Determine target business ID across all parallel signals (supporting both camelCase & snake_case)
      let targetBusinessId = 
        employee?.businessId || 
        employee?.business_id || 
        userProfile?.businessId || 
        userProfile?.business_id;

      if (!targetBusinessId && snapBiz && !snapBiz.empty) {
        targetBusinessId = snapBiz.docs[0].id;
        console.debug(`[Orchestrator][${correlationId}] Target business ID found via owner query:`, targetBusinessId);
      }

      if (!targetBusinessId && resolvedInvitation) {
        targetBusinessId = resolvedInvitation.businessId || resolvedInvitation.business_id || "";
        console.debug(`[Orchestrator][${correlationId}] Target business ID found via invitation:`, targetBusinessId);
      }

      const initialRole = isSuperAdmin ? "SUPER_ADMIN" : (employee?.role || userProfile?.role || "UNASSIGNED");

      // 2. PHASE 2: TENANT CONTEXT RESOLUTION
      const tenantResult = targetBusinessId
        ? await OptimizedResolver.resolveTenantParallel(targetBusinessId, initialRole, correlationId).catch(err => {
            console.warn(`[Orchestrator][${correlationId}] Tenant parallel resolution warning:`, err);
            return null;
          })
        : null;

      snapshot.invitation = resolvedInvitation;
      snapshot.orchestratorState = "USER_RESOLVED";
      snapshot.employee = employee;

      if (tenantResult) {
        if (tenantResult.isNetworkError && !tenantResult.business && targetBusinessId) {
          console.error(`[Orchestrator][${correlationId}] Network failure while fetching tenant ${targetBusinessId}`);
          snapshot.orchestratorState = "ERROR";
          snapshot.terminalError = "NETWORK_OFFLINE";
          return snapshot;
        }

        snapshot.business = tenantResult.business;
        snapshot.businessSnapshot = tenantResult.businessSnapshot;
        snapshot.permissions = tenantResult.permissions || [];

        // 3. Non-blocking background reconciliation
        if (employee) {
          this.reconcileIdentityDocs(user.uid, userProfile, employee, correlationId).catch(err => {
            console.warn(`[Orchestrator][${correlationId}] Background reconciliation failed:`, err);
          });
        }
      }

      // 4. ROLE & PERMISSION RESOLUTION
      snapshot.orchestratorState = "ROLE_RESOLVED";
      const isActualOwner = snapshot.business?.ownerId === user.uid || snapshot.business?.owner_id === user.uid || (snapshot.business as any)?.ownerId === user.uid || (snapshot.business as any)?.owner_id === user.uid;
      snapshot.role = isSuperAdmin ? "SUPER_ADMIN" : (isActualOwner ? "OWNER" : (employee?.role || userProfile?.role || "UNASSIGNED"));
      
      const pendingRole = this.pendingRequestedRoles.get(user.uid);
      const cachedSnapshot = this.getCachedSnapshot(user.uid);
      const effectiveRequestedRole = pendingRole || cachedSnapshot?.requested_role || (userProfile as any)?.requested_role;
      snapshot.requested_role = effectiveRequestedRole || (isActualOwner ? "OWNER" : (isSuperAdmin ? "UNASSIGNED" : snapshot.role));
      
      if (!snapshot.permissions || snapshot.permissions.length === 0) {
        snapshot.permissions = await PermissionRepository.getRolePermissions(snapshot.role, snapshot.business?.id);
      }
      
      // 5. ONBOARDING & IDENTITY STATUS RESOLUTION
      snapshot.orchestratorState = "ONBOARDING_RESOLVED";
      snapshot.onboardingStatus = this.determineOnboardingStatus(userProfile, employee, snapshot.business, resolvedInvitation);
      snapshot.identityStatus = this.determineIdentityStatus(userProfile, employee);

      // 6. FINAL VALIDATION
      if (snapshot.onboardingStatus === "COMPLETED" && !snapshot.business && !isSuperAdmin) {
        snapshot.orchestratorState = "ERROR";
        snapshot.terminalError = "NO_BUSINESS";
      } else {
        snapshot.orchestratorState = "READY";
      }

      this.cacheSnapshot(user.uid, snapshot);
      const totalDuration = Math.round(performance.now() - startTime);
      console.log(`[Orchestrator][${correlationId}] Orchestration complete in ${totalDuration}ms. Diagnostic:`, {
        uid: user.uid,
        email: user.email,
        role: snapshot.role,
        requested_role: snapshot.requested_role,
        onboardingStatus: snapshot.onboardingStatus,
        identityStatus: snapshot.identityStatus,
        businessId: snapshot.business?.id || null,
        hasEmployee: Boolean(snapshot.employee),
        hasInvitation: Boolean(snapshot.invitation)
      });
      return snapshot;

    } catch (error: any) {
      console.error(`[Orchestrator][${correlationId}] CRITICAL FAILURE:`, error);
      snapshot.orchestratorState = "ERROR";
      snapshot.terminalError = isNetworkError(error) ? "NETWORK_OFFLINE" : "DATA_INCONSISTENCY";
      return snapshot;
    }
  }

  /**
   * Action: Create a new Enterprise Workspace
   */
  static async createBusiness(user: FirebaseUser, businessName: string, options: any = {}): Promise<{ businessId: string; employeeId: string }> {
    const correlationId = `create_biz_${Date.now()}`;
    
    // Invalidate in-flight and cache before provisioning
    this.inFlightOrchestration.delete(user.uid);
    this.pendingRequestedRoles.set(user.uid, "OWNER");
    try {
      sessionStorage.removeItem(`finops_identity_cache_${user.uid}`);
      localStorage.removeItem(`finops_identity_cache_${user.uid}`);
    } catch (e) {}

    const resolvedOwnerName = (
      options.personalName ||
      options.ownerName ||
      options.name ||
      user.displayName ||
      (user.email ? user.email.split("@")[0] : "") ||
      "Propriétaire"
    ).trim();

    const result = await WorkspaceProvisioningService.provision({
      uid: user.uid,
      email: user.email || "",
      name: resolvedOwnerName
    }, businessName, { ...options, correlationId });

    // Invalidate cache again to force fresh fetch on next resolve
    this.inFlightOrchestration.delete(user.uid);
    try {
      sessionStorage.removeItem(`finops_identity_cache_${user.uid}`);
      localStorage.removeItem(`finops_identity_cache_${user.uid}`);
    } catch (e) {}

    return result;
  }

  /**
   * Action: Accept an Invitation
   */
  static async acceptInvitation(invitationId: string, user: FirebaseUser): Promise<void> {
    const correlationId = `accept_inv_${Date.now()}`;
    console.log(`[Orchestrator][${correlationId}] Accepting invitation ${invitationId}`);
    
    try {
      await runTransaction(db, async (transaction) => {
        const invRef = doc(db, "invitations", invitationId);
        // READS FIRST
        const invSnap = await transaction.get(invRef);
        if (!invSnap.exists()) throw new Error("Invitation introuvable.");
        
        const invitation = invSnap.data();
        if (invitation.status !== "SENT" && invitation.status !== "PENDING") {
          throw new Error("Cette invitation a déjà été acceptée ou révoquée.");
        }

        const employeeId = invitation.employee_id || invitation.employeeId || `emp_${user.uid}`;
        const empRef = doc(db, "employees", employeeId);
        const userRef = doc(db, "users", user.uid);
        const activeEmail = user.email ? user.email.toLowerCase().trim() : (invitation.email || "").toLowerCase().trim();

        const empSnap = await transaction.get(empRef);
        const userSnap = await transaction.get(userRef);
        
        const existingEmp = empSnap.exists() ? empSnap.data() : {
          id: employeeId,
          name: user.displayName || invitation.name || activeEmail.split("@")[0],
          email: activeEmail,
          normalizedEmail: activeEmail,
          role: invitation.role || "EMPLOYEE",
          business_id: invitation.business_id || invitation.businessId || "",
          businessId: invitation.business_id || invitation.businessId || "",
          status: "ACTIVE",
          createdAt: new Date().toISOString()
        };
        const existingUser = userSnap.exists() ? userSnap.data() : {};

        // WRITES AFTER ALL READS ARE COMPLETED
        // 1. Update Invitation
        transaction.update(invRef, cleanPayload({
          status: "ACCEPTED",
          acceptedAt: new Date().toISOString(),
          email: activeEmail,
          normalizedEmail: activeEmail,
          employeeId: employeeId,
          updatedAt: new Date().toISOString()
        }));

        // 2. Activate Employee & record email_history
        const empHistory = Array.from(new Set([
          ...(Array.isArray(existingEmp.email_history) ? existingEmp.email_history : []),
          (existingEmp.email || "").toLowerCase().trim(),
          activeEmail
        ])).filter(Boolean);

        const targetBizId = invitation.business_id || invitation.businessId || existingEmp.business_id || existingEmp.businessId || "";

        transaction.set(empRef, cleanPayload({
          ...existingEmp,
          id: employeeId,
          status: "ACTIVE",
          isActive: true,
          email: activeEmail,
          normalizedEmail: activeEmail,
          email_history: empHistory,
          uid: user.uid,
          businessId: targetBizId,
          role: invitation.role || existingEmp.role || "EMPLOYEE",
          updatedAt: new Date().toISOString()
        }), { merge: true });

        // 3. Update User Profile
        transaction.set(userRef, cleanPayload({
          ...existingUser,
          id: user.uid,
          uid: user.uid,
          email: activeEmail,
          normalizedEmail: activeEmail,
          employeeId: employeeId,
          businessId: targetBizId,
          businessStatus: "ACTIVE",
          branchId: invitation.branchId || existingEmp.branchId || existingUser.branchId || "",
          departmentId: invitation.departmentId || existingEmp.departmentId || existingUser.departmentId || "",
          role: invitation.role || existingEmp.role || existingUser.role || "EMPLOYEE",
          accountStatus: "ACTIVE",
          onboardingComplete: true,
          updatedAt: new Date().toISOString()
        }), { merge: true });

        // 4. Audit Log
        const auditRef = doc(collection(db, "audit_logs"));
        transaction.set(auditRef, cleanPayload({
          businessId: targetBizId,
          userId: user.uid,
          action: "INVITATION_ACCEPTED",
          details: { invitationId, employeeId, email: activeEmail },
          timestamp: new Date().toISOString()
        }));
      });

      // Evict caches to trigger immediate re-orchestration
      this.inFlightOrchestration.delete(user.uid);
      sessionStorage.removeItem(`finops_identity_cache_${user.uid}`);
      localStorage.removeItem(`finops_identity_cache_${user.uid}`);
    } catch (e) {
      console.error(`[Orchestrator][${correlationId}] Accept failed:`, e);
      throw e;
    }
  }

  /**
   * Action: Reject an Invitation
   */
  static async rejectInvitation(invitationId: string, user: FirebaseUser): Promise<void> {
    const invRef = doc(db, "invitations", invitationId);
    await updateDoc(invRef, cleanPayload({
      status: "REJECTED",
      rejectedAt: new Date().toISOString(),
      uid: user.uid
    }));
  }

  private static async resolveUserProfile(user: FirebaseUser, correlationId: string): Promise<UserProfile | null> {
    const res = await OptimizedResolver.resolveUserProfileWithRetry(user.uid, correlationId);
    
    if (res.status === "RESOLVED") {
      return res.data;
    }

    if (res.status === "ERROR") {
      throw new FirestoreNetworkError(`Failed to fetch user profile: ${res.error}`, null, `users/${user.uid}`);
    }

    // Genuine NOT_FOUND (exists === false confirmed by Firestore):
    // Auto-create base profile for newly registered users
    const isSuperAdmin = user.email?.toLowerCase() === this.SUPER_ADMIN_EMAIL;
    const baseProfileData = cleanPayload({
      id: user.uid,
      email: user.email || "",
      name: user.displayName || "User",
      role: isSuperAdmin ? "SUPER_ADMIN" : "UNASSIGNED",
      accountStatus: isSuperAdmin ? "ACTIVE" : "NEW_USER",
      onboardingComplete: isSuperAdmin,
      updatedAt: new Date().toISOString()
    });

    try {
      const userRef = doc(db, "users", user.uid);
      await withTimeout(setDoc(userRef, baseProfileData, { merge: true }), 5000, `setDoc(users/${user.uid})`);
      console.log(`[Orchestrator][${correlationId}] Base profile created for genuine new user.`);
    } catch (e) {
      console.warn(`[Orchestrator][${correlationId}] Failed to create base profile (Permission/Timeout?):`, e);
    }
    
    return baseProfileData as UserProfile;
  }

  private static async resolveEmployee(user: FirebaseUser, profile: UserProfile | null, correlationId: string): Promise<Employee | null> {
    // 0. Try by profile's employee_id (Most direct, fast, and robust path!)
    if (profile?.employee_id) {
      try {
        const empRef = doc(db, "employees", profile.employee_id);
        const empSnap = await resilientGetDoc(empRef, { timeoutMs: 2000, maxRetries: 1, fallbackToCache: true, throwOnNetworkFailure: false });
        if (empSnap && empSnap.exists()) {
          return { id: empSnap.id, ...empSnap.data() } as Employee;
        }
      } catch (e) {
        console.warn(`[Orchestrator][${correlationId}] Direct lookup of employee by ID failed:`, e);
      }
    }

    const isValidUserMatch = (docSnap: any) => {
      if (!docSnap) return false;
      const data = typeof docSnap.data === "function" ? docSnap.data() : docSnap;
      if (data.firebase_uid && data.firebase_uid !== user.uid) return false;
      if (data.uid && data.uid !== user.uid) return false;
      return true;
    };

    const fetchOpts = { timeoutMs: 2000, maxRetries: 1, fallbackToCache: true, throwOnNetworkFailure: false };

    // Tier 1: Query by firebase_uid (primary index)
    try {
      if (user.uid) {
        const snapUid = await resilientGetDocs(query(collection(db, "employees"), where("firebase_uid", "==", user.uid), limit(1)), undefined, fetchOpts);
        if (snapUid && !snapUid.empty && isValidUserMatch(snapUid.docs[0])) {
          return { id: snapUid.docs[0].id, ...snapUid.docs[0].data() } as Employee;
        }
      }
    } catch (e) {
      console.warn(`[Orchestrator][${correlationId}] Employee search by UID failed:`, e);
    }

    // Tier 2: Query by email
    const userEmailLower = user.email ? user.email.toLowerCase().trim() : "";
    if (userEmailLower) {
      try {
        const snapEmail = await resilientGetDocs(query(collection(db, "employees"), where("email", "==", userEmailLower), limit(1)), undefined, fetchOpts);
        if (snapEmail && !snapEmail.empty && isValidUserMatch(snapEmail.docs[0])) {
          return { id: snapEmail.docs[0].id, ...snapEmail.docs[0].data() } as Employee;
        }
      } catch (e) {
        console.warn(`[Orchestrator][${correlationId}] Employee search by email failed:`, e);
      }
    }

    // Tier 3: Secondary email variations (fallback)
    try {
      const profileEmailLower = profile?.email ? profile.email.toLowerCase().trim() : "";
      const queries: Promise<any>[] = [];

      if (userEmailLower) {
        queries.push(resilientGetDocs(query(collection(db, "employees"), where("normalizedEmail", "==", userEmailLower), limit(1)), undefined, fetchOpts).catch(() => null));
        queries.push(resilientGetDocs(query(collection(db, "employees"), where("email_history", "array-contains", userEmailLower), limit(1)), undefined, fetchOpts).catch(() => null));
      }
      if (profileEmailLower && profileEmailLower !== userEmailLower) {
        queries.push(resilientGetDocs(query(collection(db, "employees"), where("email", "==", profileEmailLower), limit(1)), undefined, fetchOpts).catch(() => null));
      }

      if (queries.length > 0) {
        const results = await Promise.all(queries);
        for (const snap of results) {
          if (snap && !snap.empty && isValidUserMatch(snap.docs[0])) {
            return { id: snap.docs[0].id, ...snap.docs[0].data() } as Employee;
          }
        }
      }
    } catch (e) {
      console.warn(`[Orchestrator][${correlationId}] Employee fallback search queries failed:`, e);
    }

    return null;
  }

  /**
   * Tiered Resolution for Employee Invitations:
   * Checks employee_id -> firebase_uid -> email sequentially before searching arrays.
   */
  private static async resolveInvitation(
    user: FirebaseUser, 
    correlationId: string, 
    resolvedEmployee?: Employee | null,
    userProfile?: UserProfile | null
  ): Promise<any | null> {
    if (!user.uid && !user.email) return null;

    const userEmailLower = user.email ? user.email.toLowerCase().trim() : "";
    const targetEmpId = resolvedEmployee?.id || userProfile?.employee_id || null;
    const validStatuses = ["SENT", "PENDING"];
    const fetchOpts = { timeoutMs: 2000, maxRetries: 1, fallbackToCache: true, throwOnNetworkFailure: false };

    try {
      // Tier 1: Check by employee_id if known
      if (targetEmpId) {
        const snap = await resilientGetDocs(query(collection(db, "invitations"), where("employee_id", "==", targetEmpId), limit(3)), undefined, fetchOpts).catch(() => null);
        if (snap && !snap.empty) {
          const match = snap.docs.map(d => ({ id: d.id, ...d.data() })).find((inv: any) => validStatuses.includes(inv.status));
          if (match) {
            this.migrateInvitationIfNeeded(match.id, match, user, targetEmpId, correlationId);
            return match;
          }
        }
      }

      // Tier 2: Check by firebase_uid
      if (user.uid) {
        const snap = await resilientGetDocs(query(collection(db, "invitations"), where("firebase_uid", "==", user.uid), limit(3)), undefined, fetchOpts).catch(() => null);
        if (snap && !snap.empty) {
          const match = snap.docs.map(d => ({ id: d.id, ...d.data() })).find((inv: any) => validStatuses.includes(inv.status));
          if (match) {
            this.migrateInvitationIfNeeded(match.id, match, user, targetEmpId || match.employee_id, correlationId);
            return match;
          }
        }
      }

      // Tier 3: Check by email
      if (userEmailLower) {
        const snap = await resilientGetDocs(query(collection(db, "invitations"), where("email", "==", userEmailLower), limit(3)), undefined, fetchOpts).catch(() => null);
        if (snap && !snap.empty) {
          const match = snap.docs.map(d => ({ id: d.id, ...d.data() })).find((inv: any) => validStatuses.includes(inv.status));
          if (match) {
            this.migrateInvitationIfNeeded(match.id, match, user, targetEmpId || match.employee_id, correlationId);
            return match;
          }
        }

        // Tier 4: Fallback checks for normalizedEmail / email_history
        const snapHist = await resilientGetDocs(query(collection(db, "invitations"), where("email_history", "array-contains", userEmailLower), limit(3)), undefined, fetchOpts).catch(() => null);
        if (snapHist && !snapHist.empty) {
          const match = snapHist.docs.map(d => ({ id: d.id, ...d.data() })).find((inv: any) => validStatuses.includes(inv.status));
          if (match) {
            this.migrateInvitationIfNeeded(match.id, match, user, targetEmpId || match.employee_id, correlationId);
            return match;
          }
        }
      }
    } catch (e) {
      console.warn(`[Orchestrator][${correlationId}] Invitation resolution non-fatal warning:`, e);
    }

    return null;
  }

  /**
   * Migrate/update invitation and employee records when matched via secondary resolution tiers
   */
  private static async migrateInvitationIfNeeded(
    invitationId: string,
    existingInv: any,
    user: FirebaseUser,
    employeeId: string | null,
    correlationId: string
  ) {
    try {
      const activeEmail = user.email ? user.email.toLowerCase().trim() : "";
      if (!activeEmail) return;

      const existingHistory: string[] = Array.isArray(existingInv.email_history) ? existingInv.email_history : [];
      const newHistory = Array.from(new Set([
        ...existingHistory,
        (existingInv.email || "").toLowerCase().trim(),
        (existingInv.normalizedEmail || "").toLowerCase().trim(),
        activeEmail
      ])).filter(Boolean);

      const needsMigration = 
        existingInv.email?.toLowerCase().trim() !== activeEmail ||
        !existingInv.firebase_uid ||
        !existingInv.employee_id ||
        !existingInv.employeeId;

      if (needsMigration) {
        console.log(`[Orchestrator][${correlationId}] Auto-migrating invitation ${invitationId} to user email ${activeEmail}`);
        const invRef = doc(db, "invitations", invitationId);
        await updateDoc(invRef, cleanPayload({
          email: activeEmail,
          normalizedEmail: activeEmail,
          emailHistory: newHistory,
          uid: user.uid,
          ...(employeeId ? { employeeId: employeeId } : {}),
          updatedAt: new Date().toISOString()
        }));

        if (employeeId) {
          const empRef = doc(db, "employees", employeeId);
          const empSnap = await resilientGetDoc(empRef);
          if (empSnap.exists()) {
            const empData = empSnap.data();
            const empHistory: string[] = Array.isArray(empData.email_history || empData.emailHistory) ? (empData.email_history || empData.emailHistory) : [];
            const mergedEmpHistory = Array.from(new Set([
              ...empHistory,
              (empData.email || "").toLowerCase().trim(),
              (empData.normalizedEmail || "").toLowerCase().trim(),
              activeEmail
            ])).filter(Boolean);

            await updateDoc(empRef, cleanPayload({
              email: activeEmail,
              normalizedEmail: activeEmail,
              emailHistory: mergedEmpHistory,
              uid: user.uid,
              updatedAt: new Date().toISOString()
            }));
          }
        }
      }
    } catch (err) {
      console.warn(`[Orchestrator][${correlationId}] Auto-migration of invitation failed:`, err);
    }
  }

  private static async reconcileIdentityDocs(
    uid: string, 
    profile: UserProfile | null, 
    employee: Employee | null, 
    correlationId: string
  ) {
    if (!employee) return;

    const userRef = doc(db, "users", uid);
    const empRef = doc(db, "employees", employee.id);

    const batch = writeBatch(db);
    let needsBatch = false;

    const targetBizId = employee.businessId || (employee as any).business_id || profile?.businessId || profile?.business_id || "";
    const activeEmail = employee.email || profile?.email || "";

    const empId = employee.id;
    const profileEmpId = profile?.employeeId || profile?.employee_id;
    const profileBizId = profile?.businessId || profile?.business_id;

    // Profile repair
    if (
      !profileEmpId || 
      profileEmpId !== empId || 
      !profileBizId || 
      (activeEmail && profile?.email !== activeEmail)
    ) {
      needsBatch = true;
      batch.set(userRef, cleanPayload({
        employeeId: empId,
        businessId: targetBizId,
        businessStatus: "ACTIVE",
        email: activeEmail,
        normalizedEmail: activeEmail ? activeEmail.toLowerCase().trim() : "",
        role: employee.role || profile?.role || "EMPLOYEE",
        accountStatus: "ACTIVE",
        onboardingComplete: true,
        updatedAt: new Date().toISOString()
      }), { merge: true });
    }

    // Employee repair
    const empUid = employee.uid || (employee as any).firebase_uid;
    const empBizId = employee.businessId || (employee as any).business_id;
    if (
      !empUid || 
      empUid !== uid || 
      !empBizId || 
      (activeEmail && employee.email !== activeEmail)
    ) {
      needsBatch = true;
      batch.set(empRef, cleanPayload({
        uid: uid,
        email: activeEmail,
        normalizedEmail: activeEmail ? activeEmail.toLowerCase().trim() : "",
        businessId: targetBizId,
        updatedAt: new Date().toISOString()
      }), { merge: true });
    }

    if (needsBatch) {
      await batch.commit();
      console.log(`[Orchestrator][${correlationId}] Identity docs reconciled.`);
    }
  }

  private static async resolveBusiness(businessId: string, correlationId: string): Promise<Business | null> {
    const bizRef = doc(db, "businesses", businessId);
    const snap = await resilientGetDoc(bizRef);
    return snap.exists() ? snap.data() as Business : null;
  }

  private static determineOnboardingStatus(
    profile: UserProfile | null, 
    employee: Employee | null, 
    business: Business | null,
    invitation: any | null
  ): OnboardingStatus {
    const bizStatus = business?.status || profile?.businessStatus || (profile as any)?.business_status;
    const bizId = business?.id || profile?.businessId || profile?.business_id || employee?.businessId || employee?.business_id;

    console.debug("[Orchestrator] determineOnboardingStatus diagnostic:", {
      bizId,
      bizStatus,
      profileRole: profile?.role,
      profileOnboarding: profile?.onboardingComplete || profile?.onboarding_completed,
      profileStatus: profile?.businessStatus || (profile as any)?.business_status,
      employeeStatus: employee?.status,
      invitationStatus: invitation?.status
    });

    // 0. Super Admin override - Super Admins are always COMPLETED
    if (profile?.role === "SUPER_ADMIN" || isSuperAdminEmail((profile as any)?.email)) {
      return "COMPLETED";
    }

    // 1. Business Activation / Approval Check (SSOT Phase 2)
    if (bizStatus === "ACTIVE" || bizStatus === "APPROVED") {
      return "COMPLETED";
    }

    if (bizStatus === "PENDING" || bizStatus === "PENDING_APPROVAL") {
      return "WAITING";
    }
    
    // 2. Invitation Acceptance Blocking
    if (invitation && (invitation.status === "PENDING" || invitation.status === "SENT")) {
      return "JOINING";
    }

    // 3. Active Workspace Completed
    if (business || bizId) {
      if (profile?.onboardingComplete || profile?.onboarding_completed || employee || bizId) {
        return "COMPLETED";
      }
    }

    if (invitation) return "PENDING_IDENTITY"; 
    if (!bizId) return "PENDING_WORKSPACE";
    return "PENDING_ONBOARDING";
  }

  private static determineIdentityStatus(profile: UserProfile | null, employee: Employee | null): IdentityStatus {
    const hasBiz = profile?.businessId || profile?.business_id || employee?.businessId || employee?.business_id;
    const isProfileOnboarded = profile?.onboardingComplete || profile?.onboarding_completed;
    const isAccountActive = profile?.accountStatus === "ACTIVE" || profile?.account_status === "ACTIVE" || profile?.status === "ACTIVE";

    if (
      employee?.status === "ACTIVE" || 
      (isAccountActive && (hasBiz || isProfileOnboarded)) || 
      employee?.status === "PENDING_ACCEPTANCE" ||
      hasBiz
    ) {
      return "ACTIVE";
    }
    if (employee?.status === "INVITED" || profile?.accountStatus === "INVITED" || profile?.account_status === "INVITED") return "INVITED";
    if (profile?.id && (hasBiz || (profile?.role && profile?.role !== "UNASSIGNED"))) return "PROFILE_ONLY";
    return "NEW_USER";
  }

  static async reconcileEmployee(employeeId: string, correlationId: string): Promise<boolean> {
    console.log(`[Orchestrator][${correlationId}] Manual reconcile for employee: ${employeeId}`);
    try {
      const empRef = doc(db, "employees", employeeId);
      const empSnap = await resilientGetDoc(empRef);
      if (!empSnap.exists()) return false;

      const employee = { id: empSnap.id, ...empSnap.data() } as Employee;
      
      if (employee.firebase_uid) {
        const userRef = doc(db, "users", employee.firebase_uid);
        const userSnap = await resilientGetDoc(userRef);
        if (userSnap.exists()) {
          const userProfile = userSnap.data() as UserProfile;
          await this.reconcileIdentityDocs(employee.firebase_uid, userProfile, employee, correlationId);
          return true;
        }
      }
      return false;
    } catch (e) {
      console.error(`[Orchestrator][${correlationId}] Manual reconcile failed:`, e);
      return false;
    }
  }
}

