import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, limit, addDoc, serverTimestamp } from "firebase/firestore";
import { db, auth, handleFirestoreError, logFirestoreError, OperationType } from "../lib/firebase";
import { resilientGetDoc, resilientGetDocs } from "../utils/resilientFirestore";
import { IBusinessRepository, IBranchRepository, IDepartmentRepository, IRoleRepository, IBusinessSettingsRepository } from "./organization/types";
import { Business, Branch, Department, Role, BusinessSettings } from "../types/organization";
import { BusinessRepository, BranchRepository, DepartmentRepository, RoleRepository, BusinessSettingsRepository } from "./organization";
import { EventBus } from "../modules/runtime/EventBus";
import { OptimizedResolver } from "../services/identity/OptimizedResolver";

export interface UserProfileData {
  uid: string;
  email: string;
  name: string;
  role: string;
  business_id: string;
  branchId?: string;
  departmentId?: string;
  status?: string;
  account_status?: string;
  onboarding_completed?: boolean;
}

export interface WorkspaceData {
  id: string;
  name: string;
  nif: string;
  domain: string;
  status: "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED" | "REJECTED" | "ARCHIVED" | "MAINTENANCE" | "READ_ONLY";
  ownerId: string;
}

export interface SubscriptionData {
  business_id: string;
  plan: "TRIAL" | "STARTER" | "PROFESSIONAL" | "BUSINESS" | "ENTERPRISE";
  status: "ACTIVE" | "EXPIRED" | "TRIAL" | "GRACE_PERIOD" | "BLOCKED";
  trialEndsAt?: string;
  expiresAt?: string;
  gracePeriodEndsAt?: string;
  allowedLimits: {
    maxEmployees: number;
    maxTransactions: number;
    featuresEnabled: string[];
  };
}

export interface FeatureMatrix {
  attendance: boolean;
  payroll: boolean;
  accounting: boolean;
  pos: boolean;
  hr: boolean;
  crm: boolean;
  bi: boolean;
  aiCfo: boolean;
}

/**
 * IdentityRepository handles authentication profile and audit logging interactions
 */
export const IdentityRepository = {
  async getUserProfile(uid: string): Promise<UserProfileData | null> {
    if (!uid) return null;
    const path = `users/${uid}`;
    try {
      const res = await OptimizedResolver.resolveUserProfileWithRetry(uid, "id_repo");
      if (res.status === "RESOLVED" && res.data) {
        return res.data as UserProfileData;
      }
      return null;
    } catch (error) {
      logFirestoreError(error, OperationType.GET, path);
      return null;
    }
  },

  async updateUserProfile(uid: string, data: Partial<UserProfileData>): Promise<void> {
    const path = `users/${uid}`;
    try {
      await setDoc(doc(db, "users", uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
      
      EventBus.publish(EventBus.createEvent({
        correlationId: `update_user_${uid}`,
        actorId: uid,
        module: "IDENTITY",
        aggregate: "USER",
        type: "UserProfileUpdated",
        payload: { uid, updates: data }
      }));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  async getPendingInvitation(email: string): Promise<any | null> {
    const path = "invitations";
    try {
      const q = query(
        collection(db, "invitations"),
        where("email", "==", email.toLowerCase().trim()),
        where("status", "==", "PENDING"),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) return null;
      const d = snap.docs[0];
      return { id: d.id, ...d.data() };
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  },

  async checkEmailUniqueness(email: string, businessId: string): Promise<{ isUnique: boolean; reason?: "users" | "employees" | "pending invitations" }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !businessId) return { isUnique: true };

    try {
      const qUsers = query(collection(db, "users"), where("email", "==", cleanEmail));
      const snapUsers = await getDocs(qUsers);
      if (snapUsers.docs.some(d => d.data().business_id === businessId)) {
        return { isUnique: false, reason: "users" };
      }

      const qEmployees = query(collection(db, "employees"), where("business_id", "==", businessId), where("email", "==", cleanEmail));
      const snapEmployees = await getDocs(qEmployees);
      if (!snapEmployees.empty) {
        return { isUnique: false, reason: "employees" };
      }

      const qInvites = query(collection(db, "invitations"), where("business_id", "==", businessId), where("email", "==", cleanEmail));
      const snapInvites = await getDocs(qInvites);
      const hasPending = snapInvites.docs.some(d => {
        const status = (d.data().status || d.data().invitation_status || "").toUpperCase();
        return status === "PENDING";
      });
      if (hasPending) {
        return { isUnique: false, reason: "pending invitations" };
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, "email_uniqueness");
    }
    return { isUnique: true };
  },

  async checkEmailUniquenessGlobal(email: string): Promise<{ isUnique: boolean; reason?: "users" | "employees" | "pending invitations" }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return { isUnique: true };

    try {
      const qUsers = query(collection(db, "users"), where("email", "==", cleanEmail));
      const snapUsers = await getDocs(qUsers);
      if (snapUsers.docs.some(d => d.data().business_id)) {
        return { isUnique: false, reason: "users" };
      }

      const qEmployees = query(collection(db, "employees"), where("email", "==", cleanEmail));
      const snapEmployees = await getDocs(qEmployees);
      if (!snapEmployees.empty) {
        return { isUnique: false, reason: "employees" };
      }

      const qInvites = query(collection(db, "invitations"), where("email", "==", cleanEmail));
      const snapInvites = await getDocs(qInvites);
      const hasPending = snapInvites.docs.some(d => {
        const status = (d.data().status || d.data().invitation_status || "").toUpperCase();
        return status === "PENDING";
      });
      if (hasPending) {
        return { isUnique: false, reason: "pending invitations" };
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, "global_email_uniqueness");
    }
    return { isUnique: true };
  },

  async createAuditLog(log: {
    userId: string;
    userName: string;
    userRole: string;
    business_id: string | null;
    action: string;
    beforeState: string;
    afterState: string;
    ipAddress?: string;
    userAgent?: string;
    severity?: "info" | "warning" | "critical";
  }): Promise<void> {
    const path = "audit_logs";
    try {
      const logId = `f_${Math.random().toString(36).substring(2, 9)}`;
      // Separate Auth Audit (pre-tenant, no business_id) from Business Audit (requires business_id)
      const auditType = log.business_id ? "BUSINESS_AUDIT_LOGS" : "AUTH_AUDIT_LOGS";
      const payload = {
        id: logId,
        audit_type: auditType,
        timestamp: serverTimestamp(),
        ipAddress: log.ipAddress || "127.0.0.1",
        userAgent: log.userAgent || window.navigator.userAgent,
        signature: `sig_${Math.floor(Math.random() * 999999)}`,
        severity: log.severity || "info",
        ...log
      };
      await setDoc(doc(db, "audit_logs", logId), payload);
    } catch (error) {
      console.warn("[IdentityRepository] Optional audit logging failure:", error);
    }
  }
};

/**
 * WorkspaceRepository encapsulates workspace configuration and organization units
 */
export const WorkspaceRepository = {
  async getWorkspace(business_id: string): Promise<WorkspaceData | null> {
    if (!business_id || !auth.currentUser) return null;
    const path = `businesses/${business_id}`;
    try {
      const snap = await resilientGetDoc(doc(db, "businesses", business_id));
      if (!snap.exists()) return null;
      return snap.data() as WorkspaceData;
    } catch (error) {
      logFirestoreError(error, OperationType.GET, path);
      return null;
    }
  },

  async getBranches(business_id: string): Promise<any[]> {
    if (!business_id || !auth.currentUser) return [];
    const path = "branches";
    try {
      const q = query(collection(db, "branches"), where("business_id", "==", business_id));
      const snap = await resilientGetDocs(q, `branches_${business_id}`);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
      logFirestoreError(error, OperationType.GET, path);
      return [];
    }
  },

  async getDepartments(business_id: string): Promise<any[]> {
    if (!business_id || !auth.currentUser) return [];
    const path = "departments";
    try {
      const q = query(collection(db, "departments"), where("business_id", "==", business_id));
      const snap = await resilientGetDocs(q, `departments_${business_id}`);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
      logFirestoreError(error, OperationType.GET, path);
      return [];
    }
  },

  async getEmployeeRecordByEmail(business_id: string, email: string): Promise<any | null> {
    if (!business_id || !email || !auth.currentUser) return null;
    const path = "employees";
    try {
      const q = query(
        collection(db, "employees"),
        where("business_id", "==", business_id),
        where("email", "==", email.toLowerCase().trim()),
        limit(1)
      );
      const snap = await resilientGetDocs(q, `emp_email_${business_id}_${email}`);
      if (snap.empty) return null;
      return { id: snap.docs[0].id, ...snap.docs[0].data() };
    } catch (error) {
      logFirestoreError(error, OperationType.GET, path);
      return null;
    }
  },

  async getEmployeeRecordByUid(business_id: string, uid: string): Promise<any | null> {
    if (!business_id || !uid || !auth.currentUser) return null;
    const path = "employees";
    try {
      const q = query(
        collection(db, "employees"),
        where("business_id", "==", business_id),
        where("uid", "==", uid),
        limit(1)
      );
      const snap = await resilientGetDocs(q, `emp_uid_${business_id}_${uid}`);
      if (snap.empty) return null;
      return { id: snap.docs[0].id, ...snap.docs[0].data() };
    } catch (error) {
      logFirestoreError(error, OperationType.GET, path);
      return null;
    }
  }
};

/**
 * PermissionRepository fetches default and customized permissions for SaaS RBAC
 */
export const PermissionRepository = {
  async getRolePermissions(role: string, business_id?: string): Promise<string[]> {
    // Standard Static RBAC Policies matching objectives
    const defaultPermissionsMap: Record<string, string[]> = {
      SUPER_ADMIN: ["all", "super_admin_panel", "system_health_read", "disaster_recovery_write"],
      OWNER: [
        "view_dashboard", "read_bi", "manage_settings", "manage_employees", "invite_employees",
        "manage_payroll", "lock_payroll", "view_ledger", "write_ledger", "view_documents",
        "manage_leaves", "override_attendance", "use_aicfo", "view_audit_logs"
      ],
      DIRECTOR: [
        "view_dashboard", "read_bi", "manage_employees", "manage_payroll", "view_ledger",
        "view_documents", "manage_leaves", "view_employee_space", "use_aicfo"
      ],
      MANAGER: [
        "view_dashboard", "manage_employees", "invite_employees", "manage_payroll", "view_ledger",
        "view_documents", "manage_leaves", "view_employee_space", "override_attendance", "use_aicfo"
      ],
      SUPERVISOR: [
        "view_dashboard", "manage_employees", "view_documents", "manage_leaves", "view_employee_space", "override_attendance"
      ],
      HR_MANAGER: [
        "manage_employees", "invite_employees", "manage_leaves", "view_documents", "view_employee_space"
      ],
      ACCOUNTANT: [
        "view_ledger", "write_ledger", "view_documents", "view_employee_space"
      ],
      PAYROLL_MANAGER: [
        "manage_payroll", "lock_payroll", "view_documents", "view_employee_space"
      ],
      TEAM_LEADER: [
        "manage_leaves", "override_attendance", "view_employee_space"
      ],
      EMPLOYEE: [
        "view_employee_space", "view_documents", "request_leaves", "log_attendance"
      ],
      GUEST: [
        "view_employee_space"
      ]
    };

    if (!business_id || !auth.currentUser) {
      return defaultPermissionsMap[role.toUpperCase()] || defaultPermissionsMap.GUEST;
    }

    try {
      const settingsSnap = await resilientGetDoc(doc(db, "business_settings", business_id), { timeoutMs: 2000, maxRetries: 1, fallbackToCache: true, throwOnNetworkFailure: false });
      if (settingsSnap && settingsSnap.exists()) {
        const data = settingsSnap.data();
        if (data && data[role.toUpperCase()] && Array.isArray(data[role.toUpperCase()])) {
          const uiPerms = data[role.toUpperCase()];
          
          const uiToBackendMap: Record<string, string[]> = {
            "employees.read": ["view_employee_space", "view_documents"],
            "employees.write": ["manage_employees", "invite_employees"],
            "attendance.manage": ["override_attendance", "manage_leaves"],
            "payroll.run": ["manage_payroll"],
            "payroll.lock": ["lock_payroll", "validate_payroll"],
            "finance.view": ["view_ledger"],
            "finance.write": ["write_ledger"],
            "analytics.view": ["read_bi", "view_dashboard"],
            "admin.settings": ["manage_settings"]
          };
          
          const backendPerms = new Set<string>();
          uiPerms.forEach(p => {
            if (uiToBackendMap[p]) {
              uiToBackendMap[p].forEach(bp => backendPerms.add(bp));
            } else {
              backendPerms.add(p);
            }
          });
          backendPerms.add("view_dashboard"); // Baseline
          return Array.from(backendPerms);
        }
      }
    } catch (error: any) {
      if (auth.currentUser) {
        console.warn("[PermissionRepository] Dynamic role config from settings bypassed.", error?.message || error);
      }
    }

    // Dynamic config path
    if (!auth.currentUser) {
      return defaultPermissionsMap[role.toUpperCase()] || defaultPermissionsMap.GUEST;
    }
    try {
      const snap = await resilientGetDoc(doc(db, "businesses", business_id, "roles_config", role.toUpperCase()), { timeoutMs: 2000, maxRetries: 1, fallbackToCache: true, throwOnNetworkFailure: false });
      if (snap && snap.exists() && snap.data().permissions) {
        return snap.data().permissions as string[];
      }
    } catch (error: any) {
      if (auth.currentUser) {
        console.warn("[PermissionRepository] Dynamic role config lookup bypassed. Falling back to default.");
      }
    }

    return defaultPermissionsMap[role.toUpperCase()] || defaultPermissionsMap.GUEST;
  }
};

/**
 * SubscriptionRepository checks and keeps track of business tenant plans
 */
export const SubscriptionRepository = {
  async getWorkspaceSubscription(business_id: string): Promise<SubscriptionData> {
    if (business_id && auth.currentUser) {
      try {
        const snap = await getDoc(doc(db, "subscriptions", business_id));
        if (snap.exists()) {
          const data = snap.data() as SubscriptionData;
          return {
            ...data,
            business_id,
            plan: data.plan || "TRIAL",
            status: data.status || "ACTIVE",
            allowedLimits: {
              maxEmployees: data.allowedLimits?.maxEmployees ?? 10,
              maxTransactions: data.allowedLimits?.maxTransactions ?? 1000,
              featuresEnabled: data.allowedLimits?.featuresEnabled ?? ["attendance", "payroll", "hr", "accounting"]
            }
          };
        }
      } catch (error: any) {
        if (auth.currentUser) {
          console.warn("[SubscriptionRepository] Error reading subscription, generating default plan:", error?.message || error);
        }
      }
    }

    // Default to ACTIVE TRIAL plan to prevent lockouts
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 30); // 30-day trial

    const defaultSub: SubscriptionData = {
      business_id,
      plan: "TRIAL",
      status: "TRIAL",
      trialEndsAt: trialEnds.toISOString(),
      expiresAt: trialEnds.toISOString(),
      allowedLimits: {
        maxEmployees: 10,
        maxTransactions: 1000,
        featuresEnabled: ["attendance", "payroll", "accounting", "hr", "bi", "aiCfo"]
      }
    };

    try {
      if (business_id) {
        await setDoc(doc(db, "subscriptions", business_id), {
          ...defaultSub,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
        
        EventBus.publish(EventBus.createEvent({
          correlationId: `sub_created_${business_id}`,
          businessId: business_id,
          module: "IDENTITY",
          aggregate: "SUBSCRIPTION",
          type: "SubscriptionChanged",
          payload: { plan: defaultSub.plan, status: defaultSub.status }
        }));
      }
    } catch (e) {
      console.error("[SubscriptionRepository] Error saving default subscription", e);
    }

    return defaultSub;
  },

  async getAllSubscriptions(): Promise<SubscriptionData[]> {
    try {
      const snap = await getDocs(collection(db, "subscriptions"));
      return snap.docs.map(d => ({
        ...d.data(),
        business_id: d.id,
      } as SubscriptionData));
    } catch (error) {
      console.warn("[SubscriptionRepository] Error fetching all subscriptions:", error);
      return [];
    }
  },

  async saveSubscription(business_id: string, subscriptionData: Partial<SubscriptionData>): Promise<void> {
    if (!business_id) return;
    const docRef = doc(db, "subscriptions", business_id);
    await setDoc(docRef, {
      ...subscriptionData,
      business_id,
      updatedAt: serverTimestamp()
    }, { merge: true });

    EventBus.publish(EventBus.createEvent({
      correlationId: `sub_updated_${business_id}_${Date.now()}`,
      businessId: business_id,
      module: "IDENTITY",
      aggregate: "SUBSCRIPTION",
      type: "SubscriptionChanged",
      payload: { plan: subscriptionData.plan, status: subscriptionData.status }
    }));
  },

  async syncSubscriptionWithPlan(business_id: string, planId: string, customUserLimit?: number): Promise<SubscriptionData> {
    const { SubscriptionPlanRepository } = await import("./SubscriptionPlanRepository");
    const planDoc = await SubscriptionPlanRepository.getPlanById(planId);

    const maxEmployees = customUserLimit ?? planDoc?.userLimit ?? 10;
    const featuresEnabled = planDoc?.featuresEnabled || ["attendance", "payroll", "hr"];

    const updatedSub: SubscriptionData = {
      business_id,
      plan: (planId.toUpperCase() as any) || "STARTER",
      status: "ACTIVE",
      allowedLimits: {
        maxEmployees,
        maxTransactions: planDoc?.maxTransactions || 5000,
        featuresEnabled
      }
    };

    await this.saveSubscription(business_id, updatedSub);

    // Also sync Feature matrix
    await FeatureRepository.syncFeaturesWithPlan(business_id, featuresEnabled);

    return updatedSub;
  }
};

/**
 * FeatureRepository handles activated modules & feature switches
 */
export const FeatureRepository = {
  async getWorkspaceFeatures(business_id: string): Promise<FeatureMatrix> {
    const standardFeatures: FeatureMatrix = {
      attendance: true,
      payroll: true,
      accounting: true,
      pos: false,
      hr: true,
      crm: false,
      bi: true,
      aiCfo: true
    };

    if (!business_id) return standardFeatures;

    try {
      // Modern path: businesses/{business_id}/settings/features
      const settingsSnap = await getDoc(doc(db, "businesses", business_id, "settings", "features"));
      if (settingsSnap.exists() && settingsSnap.data()?.features) {
        return { ...standardFeatures, ...settingsSnap.data().features };
      }

      // Legacy path: features/{business_id}
      const snap = await getDoc(doc(db, "features", business_id));
      if (snap.exists()) {
        return { ...standardFeatures, ...snap.data() } as FeatureMatrix;
      }
    } catch (error) {
      console.warn("[FeatureRepository] Error loading features, using default subscription modules:", error);
    }

    // Save defaults if missing
    try {
      await this.saveFeatures(business_id, standardFeatures);
    } catch (e) {}

    return standardFeatures;
  },

  async saveFeatures(business_id: string, features: Partial<FeatureMatrix> | Record<string, boolean>): Promise<void> {
    if (!business_id) return;
    const settingsRef = doc(db, "businesses", business_id, "settings", "features");
    const legacyRef = doc(db, "features", business_id);

    const payload = {
      businessId: business_id,
      features,
      updatedAt: serverTimestamp()
    };

    await Promise.all([
      setDoc(settingsRef, payload, { merge: true }),
      setDoc(legacyRef, features, { merge: true })
    ]);

    // Clear FeatureResolver cache dynamically
    const { FeatureResolver } = await import("../services/FeatureResolver");
    FeatureResolver.clearCache(business_id);
  },

  async syncFeaturesWithPlan(business_id: string, featuresEnabledList: string[]): Promise<FeatureMatrix> {
    const enabledSet = new Set(featuresEnabledList.map(f => f.toLowerCase()));
    
    const updatedFeatures: FeatureMatrix = {
      attendance: enabledSet.has("attendance"),
      payroll: enabledSet.has("payroll"),
      accounting: enabledSet.has("accounting"),
      pos: enabledSet.has("pos"),
      hr: enabledSet.has("hr"),
      crm: enabledSet.has("crm"),
      bi: enabledSet.has("bi"),
      aiCfo: enabledSet.has("aicfo") || enabledSet.has("ai_cfo")
    };

    await this.saveFeatures(business_id, updatedFeatures);
    return updatedFeatures;
  }
};

export { AttendanceRepository } from "./AttendanceRepository";
export { EmployeeRepository } from "./EmployeeRepository";
export { BadgeRepository } from "./BadgeRepository";
export { ScheduleRepository } from "./ScheduleRepository";
export { LeaveRepository } from "./LeaveRepository";
export { BusinessAdministrationRepository } from "./BusinessAdministrationRepository";
export { DocumentRepository } from "./DocumentRepository";
export { WorkforcePerformanceRepository } from "./WorkforcePerformanceRepository";
export { LedgerRepository } from "./LedgerRepository";
export { PayrollRepository } from "./PayrollRepository";
export { PayrollInputSnapshotRepository } from "./PayrollInputSnapshotRepository";
export { CurrencyRateRepository } from "./CurrencyRateRepository";
export { SuperAdminRepository } from "./SuperAdminRepository";
export { ForensicLogRepository } from "./ForensicLogRepository";
export { SubscriptionPlanRepository, type SubscriptionPlanDocument } from "./SubscriptionPlanRepository";
export { NotificationRepository } from "./NotificationRepository";
export { 
  AnalyticsSnapshotRepository,
  EmployeeDepartmentActivityRepository,
  WorkforcePerformanceSnapshotRepository,
  DepartmentAliasRepository
} from "./AnalyticsRepository";

export { 
  BusinessRepository, 
  BranchRepository, 
  DepartmentRepository, 
  BusinessUnitRepository,
  CostCenterRepository,
  RoleRepository, 
  BusinessSettingsRepository 
} from "./organization";
export { 
  LeadRepository, 
  ProformaRepository, 
  InvoiceRepository, 
  InvoiceTemplateRepository 
} from "./crm";

export {
  toCamelCase,
  toSnakeCase,
  snakeToCamel,
  camelToSnake,
  mapBranch,
  mapDepartment,
  mapBusinessUnit,
  mapCostCenter,
  mapEmployee,
  mapAttendanceRecord,
  mapPayrollCycle
} from "../utils/caseConverter";
export { IntegrityValidator, ForeignKeyIntegrityViolationError } from "../services/integrity/ForeignKeyIntegrityValidator";

