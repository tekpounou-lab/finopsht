import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../../lib/firebase";
import {
  IdentityRepository,
  WorkspaceRepository,
  PermissionRepository,
  SubscriptionRepository,
  FeatureRepository,
  UserProfileData,
  WorkspaceData,
  SubscriptionData,
  FeatureMatrix
} from "../../repositories";
import { PermissionService } from "../PermissionService";
import { Role } from "../../types";
import { ResilienceEngine } from "./ResilienceEngine";
import { EnterpriseAuditService } from "./EnterpriseAuditService";
import { FeatureFlagConfigService } from "./FeatureFlagConfigService";
import { FeatureResolver as CoreFeatureResolver } from "@/services/FeatureResolver";
import { isSuperAdminEmail } from "../../config/superadmin";

const loggedSessionStarts = new Set<string>();

export interface SessionContext {
  identity: {
    uid: string;
    email: string;
    emailVerified: boolean;
    providerId: string;
    status: "UNKNOWN" | "AUTHENTICATED" | "UNAUTHENTICATED" | "ERROR";
  };
  profile: {
    exists: boolean;
    data: UserProfileData | null;
    status: "PROFILE_FOUND" | "INVITATION_FOUND" | "REQUEST_PENDING" | "PROFILE_MISSING" | "ACCOUNT_DISABLED" | "ACCOUNT_LOCKED" | "ACCOUNT_SUSPENDED" | "INITIAL_IDENTITY";
    invitation: any | null;
    pendingRequest: any | null;
  } | null;
  workspace: {
    exists: boolean;
    data: WorkspaceData | null;
    status: "ACTIVE" | "READ_ONLY" | "MAINTENANCE" | "SUSPENDED" | "ARCHIVED" | "NONE" | "REJECTED" | "PENDING_APPROVAL";
  } | null;
  subscription: {
    data: SubscriptionData | null;
    status: "ACTIVE" | "EXPIRED" | "TRIAL" | "GRACE_PERIOD" | "BLOCKED" | "NONE";
  } | null;
  features: {
    matrix: FeatureMatrix | null;
  } | null;
  permissions: {
    list: string[];
  } | null;
  routing: {
    recommendedRoute: string;
    correlationId?: string;
  };
}

/**
 * 1. IdentityResolver
 * Authenticates user existence and raw credentials, fully uncoupled from tenant configurations.
 */
export const IdentityResolver = {
  async resolve(authUser: any | null): Promise<SessionContext["identity"]> {
    if (!authUser) {
      return {
        uid: "",
        email: "",
        emailVerified: false,
        providerId: "",
        status: "UNAUTHENTICATED"
      };
    }

    return {
      uid: authUser.uid,
      email: authUser.email || "",
      emailVerified: authUser.emailVerified || false,
      providerId: authUser.providerData?.[0]?.providerId || "password",
      status: "AUTHENTICATED"
    };
  }
};

/**
 * 2. ProfileResolver
 * Resolves user database profiles, including active invitations and pending admin join requests.
 */
export const ProfileResolver = {
  async resolve(uid: string, email: string): Promise<SessionContext["profile"]> {
    // Wrap profile loading in Resilience Engine with local storage fallback
    const fetchProfileOp = () => ResilienceEngine.withRetry(() => IdentityRepository.getUserProfile(uid));
    const fallbackProfileOp = async () => {
      const cached = ResilienceEngine.getCachedState<UserProfileData>(`user_profile_${uid}`);
      return cached;
    };

    const profile = await ResilienceEngine.withCircuitBreaker(
      ResilienceEngine.identityBreaker,
      fetchProfileOp,
      fallbackProfileOp
    );

    if (profile) {
      // Cache success state
      ResilienceEngine.setCachedState(`user_profile_${uid}`, profile);

      const accountStatus = (profile.account_status || profile.status || "ACTIVE").toUpperCase();
      if (accountStatus === "SUSPENDED") {
        return {
          exists: true,
          data: profile,
          status: "ACCOUNT_SUSPENDED",
          invitation: null,
          pendingRequest: null
        };
      }
      if (accountStatus === "DISABLED") {
        return {
          exists: true,
          data: profile,
          status: "ACCOUNT_DISABLED",
          invitation: null,
          pendingRequest: null
        };
      }
      if (accountStatus === "LOCKED") {
        return {
          exists: true,
          data: profile,
          status: "ACCOUNT_LOCKED",
          invitation: null,
          pendingRequest: null
        };
      }

      return {
        exists: true,
        data: profile,
        status: "PROFILE_FOUND",
        invitation: null,
        pendingRequest: null
      };
    }

    // Check for active invitations
    const pendingInvitation = await ResilienceEngine.withRetry(() => IdentityRepository.getPendingInvitation(email));
    if (pendingInvitation) {
      return {
        exists: false,
        data: null,
        status: "INVITATION_FOUND",
        invitation: pendingInvitation,
        pendingRequest: null
      };
    }

    // Check for pending join requests
    try {
      const reqSnap = await ResilienceEngine.withRetry(() => getDoc(doc(db, "onboarding_requests", `req_${uid}`)));
      if (reqSnap.exists() && reqSnap.data().status === "PENDING") {
        return {
          exists: false,
          data: null,
          status: "REQUEST_PENDING",
          invitation: null,
          pendingRequest: reqSnap.data()
        };
      }
    } catch (e) {
      console.warn("[ProfileResolver] Error reading onboarding requests:", e);
    }

    return {
      exists: false,
      data: null,
      status: "INITIAL_IDENTITY",
      invitation: null,
      pendingRequest: null
    };
  }
};

/**
 * 3. WorkspaceResolver
 * Validates target company branch/departments, enforcing absolute tenant access control.
 */
export const WorkspaceResolver = {
  async resolve(business_id: string | null): Promise<SessionContext["workspace"]> {
    if (!business_id || !auth.currentUser) {
      return {
        exists: false,
        data: null,
        status: "NONE"
      };
    }

    const fetchWorkspaceOp = () => ResilienceEngine.withRetry(() => WorkspaceRepository.getWorkspace(business_id));
    const fallbackWorkspaceOp = async () => {
      const cached = ResilienceEngine.getCachedState<WorkspaceData>(`workspace_${business_id}`);
      return cached;
    };

    const ws = await ResilienceEngine.withCircuitBreaker(
      ResilienceEngine.workspaceBreaker,
      fetchWorkspaceOp,
      fallbackWorkspaceOp
    );

    if (!ws) {
      return {
        exists: false,
        data: null,
        status: "NONE"
      };
    }

    // Cache success state
    ResilienceEngine.setCachedState(`workspace_${business_id}`, ws);

    const wsStatus = (ws.status || "ACTIVE").toUpperCase() as WorkspaceData["status"];
    
    return {
      exists: true,
      data: ws,
      status: wsStatus as any
    };
  }
};

/**
 * 4. SubscriptionResolver
 * Checks current workspace package constraints, isolating billing state.
 */
export const SubscriptionResolver = {
  async resolve(business_id: string | null): Promise<SessionContext["subscription"]> {
    if (!business_id) {
      return {
        data: null,
        status: "NONE"
      };
    }

    const sub = await ResilienceEngine.withRetry(() => SubscriptionRepository.getWorkspaceSubscription(business_id));
    if (!sub) {
      return {
        data: null,
        status: "NONE"
      };
    }
    
    const now = new Date().getTime();
    const expiresAt = sub.expiresAt ? new Date(sub.expiresAt).getTime() : Infinity;
    const gracePeriodEndsAt = sub.gracePeriodEndsAt ? new Date(sub.gracePeriodEndsAt).getTime() : 0;

    let computedStatus = (sub.status || "ACTIVE").toUpperCase() as SubscriptionData["status"];

    if (computedStatus !== "BLOCKED") {
      if (now > expiresAt) {
        if (now < gracePeriodEndsAt) {
          computedStatus = "GRACE_PERIOD";
        } else {
          computedStatus = "EXPIRED";
        }
      }
    }

    return {
      data: sub,
      status: computedStatus as any
    };
  }
};

/**
 * 5. FeatureResolver
 * Resolves activated functional modules for the tenant.
 */
export const FeatureResolver = {
  async resolve(business_id: string | null): Promise<SessionContext["features"]> {
    if (!business_id) {
      return {
        matrix: null
      };
    }

    const matrix = await ResilienceEngine.withRetry(() => CoreFeatureResolver.resolveAll(business_id)) as unknown as FeatureMatrix;
    return {
      matrix
    };
  }
};

/**
 * 6. PermissionResolver
 * Maps dynamic and static RBAC rules and initializes the security PermissionService.
 */
export const PermissionResolver = {
  async resolve(
    role: string | null,
    business_id: string | null,
    features: FeatureMatrix | null,
    subscriptionPlan?: "TRIAL" | "STARTER" | "PROFESSIONAL" | "BUSINESS" | "ENTERPRISE",
    subscriptionStatus?: "ACTIVE" | "EXPIRED" | "TRIAL" | "GRACE_PERIOD" | "BLOCKED" | "NONE"
  ): Promise<SessionContext["permissions"]> {
    if (!role) {
      return {
        list: []
      };
    }

    const list = await ResilienceEngine.withRetry(() => PermissionRepository.getRolePermissions(role, business_id || undefined));
    
    const defaultFeatures: FeatureMatrix = {
      attendance: true,
      payroll: true,
      accounting: true,
      pos: false,
      hr: true,
      crm: true,
      bi: true,
      aiCfo: true
    };
    PermissionService.init(
      role,
      list,
      features || defaultFeatures,
      subscriptionPlan,
      subscriptionStatus,
      business_id
    );

    return {
      list
    };
  }
};

/**
 * Dynamic Navigation Builder
 * Generates exact navigation tab config governed by PermissionService and Feature activations.
 */
export const NavigationBuilder = {
  build(role: string, language: string, t: any): Array<{ id: string; label: string; icon: string; highlights?: boolean }> {
    const list: Array<{ id: string; label: string; icon: string; highlights?: boolean }> = [];
    const isFr = language === "fr";
    const isHt = language === "ht";
    const userRole = (role || "").toUpperCase();

    const addTab = (id: string, label: string, icon: string, highlights?: boolean) => {
      list.push({ id, label, icon, highlights });
    };

    // 1. Business Intelligence / Analytics
    if (PermissionService.hasRoleModuleAccess(userRole, "bi")) {
      addTab("bi", t.navigation?.bi || (isFr ? "Analyse Décisionnelle" : "Business Intelligence"), "BarChart3");
    }

    // 2. Personnel Directory (HR)
    if (PermissionService.hasRoleModuleAccess(userRole, "personnel")) {
      addTab("personnel", t.navigation?.personnel || (isFr ? "Directoire du Personnel" : "Personnel Directory"), "Users");
    }

    // 3. Performance & Commissions
    if (PermissionService.hasRoleModuleAccess(userRole, "performance")) {
      addTab("performance", isFr ? "Pérf. et Commissions" : isHt ? "Pèfòmans ak Komisyon" : "Performance & Commissions", "Target");
    }

    // 4. Organization Structure
    if (PermissionService.hasRoleModuleAccess(userRole, "organization")) {
      addTab("organization", t.organization?.title || (isFr ? "Structure d'Entreprise" : "Organization Structure"), "Network");
    }

    // 5. Operational Schedules / Planning
    if (PermissionService.hasRoleModuleAccess(userRole, "planning")) {
      addTab("planning", t.planning?.title || (isFr ? "Plannings Opérationnels" : "Operational Schedules"), "CalendarRange");
    }

    // 6. Leave & Absence Management
    if (PermissionService.hasRoleModuleAccess(userRole, "leave")) {
      addTab("leave", t.leave?.title || (isFr ? "Gestion des Congés" : "Leave Management"), "Calendar");
    }

    // 7. Biometric Attendance & Clock-in
    if (PermissionService.hasRoleModuleAccess(userRole, "attendance")) {
      addTab("attendance", t.navigation?.attendance || (isFr ? "Badgeuse Biométrique" : "Attendance Ledger"), "Fingerprint");
    }

    // 8. Payroll Engine V3
    if (PermissionService.hasRoleModuleAccess(userRole, "payroll")) {
      addTab("payroll", t.navigation?.payroll || (isFr ? "Calculateur de Paie" : "Payroll Calculator"), "Wallet");
    }

    // 9. General Ledger & Accounting
    if (PermissionService.hasRoleModuleAccess(userRole, "ledger") || PermissionService.hasRoleModuleAccess(userRole, "accounting")) {
      addTab("ledger", t.navigation?.ledger || (isFr ? "Grand Livre" : isHt ? "Gran Liv" : "Ledger"), "BookOpen");
    }

    // 10. CRM, Quotes & Invoicing
    if (PermissionService.hasRoleModuleAccess(userRole, "crm")) {
      addTab("crm", isFr ? "CRM & Facturation" : isHt ? "CRM ak Faktirasyon" : "CRM & Invoices", "Briefcase");
    }

    // 11. Document Vault & Legal Archiving
    if (PermissionService.hasRoleModuleAccess(userRole, "documents")) {
      addTab("documents", t.documents?.title || (isFr ? "Gestion Documentaire" : "Document Vault"), "FolderOpen");
    }

    // 11. Forensic Audit Trail (Super Admin SRE only)
    if (userRole === "SUPER_ADMIN" || PermissionService.hasRoleModuleAccess(userRole, "forensic")) {
      addTab("forensic", t.navigation?.forensic || (isFr ? "Forensic Audit" : isHt ? "Odit Forensik" : "Forensic Audit Trail"), "History");
    }

    // 12. Super Admin System SRE Consoles (Health, Reliability/DLQ, Disaster Recovery)
    if (userRole === "SUPER_ADMIN" || PermissionService.hasRoleModuleAccess(userRole, "health")) {
      addTab("health", t.navigation?.health || (isFr ? "Santé du Système" : isHt ? "Sante Sistèm" : "System Health"), "Activity");
    }
    if (userRole === "SUPER_ADMIN" || PermissionService.hasRoleModuleAccess(userRole, "reliability")) {
      addTab("reliability", t.navigation?.reliability || (isFr ? "Résilience & DLQ" : isHt ? "Rezilyans & DLQ" : "Reliability & DLQ"), "Cpu");
    }
    if (userRole === "SUPER_ADMIN" || PermissionService.hasRoleModuleAccess(userRole, "recovery")) {
      addTab("recovery", t.navigation?.recovery || (isFr ? "Restauration Catastrophe" : isHt ? "Restorasyon Katastwòf" : "Disaster Recovery"), "Database");
    }

    // 13. AI CFO Strategic Assistant
    if (PermissionService.hasRoleModuleAccess(userRole, "aicfo")) {
      addTab("aicfo", t.navigation?.aicfo || (isFr ? "Intelligence CFO" : "AI CFO Assistant"), "Sparkles", true);
    }

    // 14. Operator Manual Guide (Universal Operator Tool)
    addTab("instructions", isFr ? "Guide de l'Opérateur" : isHt ? "Gid Operatè" : "Operator Manual", "HelpCircle", true);

    // 15. Employee Self-Service Workspace
    if (PermissionService.hasRoleModuleAccess(userRole, "employeespace")) {
      addTab("employeeSpace", t.navigation?.employeeSpace || (isFr ? "Espace Salarié" : "Employee Portal"), "Sparkles", true);
    }

    // 16. Administration & Business Settings
    if (PermissionService.hasRoleModuleAccess(userRole, "settings")) {
      addTab("settings", t.navigation?.settings || (isFr ? "Paramètres" : isHt ? "Paramèt" : "Settings"), "Settings");
    }

    return list;
  }
};

/**
 * Global Resolver Pipeline Orchestrator
 * Sequentially executes each modular resolver stage to guarantee deterministic clearance under 2 seconds.
 * Extensively hardened with SRE, Audit, Correlation, Feature Flags, and Super Admin bypass bounds.
 */
export const EnterpriseResolverPipeline = {
  async resolveSession(authUser: any | null): Promise<SessionContext> {
    const start = Date.now();
    const correlationId = EnterpriseAuditService.generateCorrelationId();

    try {
      // 1. SAFEGUARD: Absolute Super Admin Isolation check immediately if authUser email matches platform administrators
      const cleanEmail = (authUser?.email || "").toLowerCase().trim();
      if (isSuperAdminEmail(cleanEmail)) {
        console.warn(`[EnterpriseResolverPipeline] SUPER_ADMIN bypass detected for email ${authUser.email}. Instantly routing to Platform Console.`);
        
        await EnterpriseAuditService.logEvent({
          correlationId,
          userId: authUser.uid,
          userEmail: authUser.email,
          action: "RESOLVER_SUPER_ADMIN_BYPASS",
          status: "SUCCESS",
          durationMs: Date.now() - start,
          business_id: null,
          metadata: { reason: "Direct super admin credentials trigger" }
        });

        const identity = await IdentityResolver.resolve(authUser);
        const features = await FeatureResolver.resolve(null);
        const permissions = await PermissionResolver.resolve("SUPER_ADMIN", null, null, "ENTERPRISE", "ACTIVE");

        return {
          identity,
          profile: {
            exists: true,
            status: "PROFILE_FOUND",
            data: {
              uid: authUser.uid,
              email: authUser.email,
              name: "Super Administrator",
              role: "SUPER_ADMIN" as any,
              account_status: "ACTIVE",
              onboarding_completed: true,
              business_id: ""
            },
            invitation: null,
            pendingRequest: null
          },
          workspace: { exists: false, data: null, status: "NONE" },
          subscription: { data: null, status: "NONE" },
          features,
          permissions,
          routing: { recommendedRoute: "/super-admin", correlationId }
        };
      }

      // Stage 1: Identity
      const isIdentityEnabled = FeatureFlagConfigService.isResolverPhaseEnabled("identityResolver", {
        userId: authUser?.uid,
        email: authUser?.email
      });

      if (!isIdentityEnabled) {
        console.warn(`[EnterpriseResolverPipeline] Identity resolver phase is DARK LAUNCH / DISABLED. Rerouting safely.`);
        return {
          identity: { uid: "", email: "", emailVerified: false, providerId: "", status: "UNAUTHENTICATED" },
          profile: null,
          workspace: null,
          subscription: null,
          features: null,
          permissions: null,
          routing: { recommendedRoute: "/", correlationId }
        };
      }

      const identity = await IdentityResolver.resolve(authUser);
      if (identity.status !== "AUTHENTICATED") {
        return {
          identity,
          profile: null,
          workspace: null,
          subscription: null,
          features: null,
          permissions: null,
          routing: { recommendedRoute: "/", correlationId }
        };
      }

      // Stage 2: Profile
      const isProfileEnabled = FeatureFlagConfigService.isResolverPhaseEnabled("invitationResolver", {
        userId: identity.uid,
        email: identity.email
      });

      if (!isProfileEnabled) {
        console.warn(`[EnterpriseResolverPipeline] Profile/Invitation resolver phase is dark launched or disabled.`);
      }

      const profile = await ProfileResolver.resolve(identity.uid, identity.email);

      // Log successful session start once per session per UID
      if (!loggedSessionStarts.has(identity.uid)) {
        loggedSessionStarts.add(identity.uid);
        await EnterpriseAuditService.logEvent({
          correlationId,
          userId: identity.uid,
          userEmail: identity.email,
          action: "RESOLVER_SESSION_START",
          status: "SUCCESS",
          business_id: profile?.data?.business_id || null,
          metadata: { profileStatus: profile?.status }
        });
      }

      if (profile.status === "ACCOUNT_SUSPENDED" || profile.status === "ACCOUNT_DISABLED" || profile.status === "ACCOUNT_LOCKED") {
        await EnterpriseAuditService.logEvent({
          correlationId,
          userId: identity.uid,
          userEmail: identity.email,
          action: "RESOLVER_ACCOUNT_LOCKOUT",
          status: "CRITICAL",
          business_id: profile.data?.business_id || null,
          metadata: { status: profile.status }
        });

        return {
          identity,
          profile,
          workspace: null,
          subscription: null,
          features: null,
          permissions: null,
          routing: { recommendedRoute: "/force-logout", correlationId }
        };
      }

      if (profile.status === "INVITATION_FOUND") {
        return {
          identity,
          profile,
          workspace: null,
          subscription: null,
          features: null,
          permissions: null,
          routing: { recommendedRoute: "/accept-invitation", correlationId }
        };
      }

      if (profile.status === "REQUEST_PENDING") {
        return {
          identity,
          profile,
          workspace: null,
          subscription: null,
          features: null,
          permissions: null,
          routing: { recommendedRoute: "/waiting-approval", correlationId }
        };
      }

      const profileHasNoBusiness = profile.exists && (!profile.data?.business_id);

      if (profile.status === "PROFILE_MISSING" || profile.status === "INITIAL_IDENTITY" || profileHasNoBusiness) {
        // Guard Super Admin here too to make sure they NEVER land on onboarding choices
        if (profile.data?.role === "SUPER_ADMIN") {
          return {
            identity,
            profile,
            workspace: null,
            subscription: null,
            features: null,
            permissions: { list: ["*"] },
            routing: { recommendedRoute: "/super-admin", correlationId }
          };
        }

        if (profile.data?.role === "OWNER") {
          return {
            identity,
            profile,
            workspace: null,
            subscription: null,
            features: null,
            permissions: {
              list: ["CREATE_COMPANY"]
            },
            routing: { recommendedRoute: "/create-business", correlationId }
          };
        }

        if (profile.data?.role === "EMPLOYEE" || profile.data?.role === "SUPERVISOR") {
          return {
            identity,
            profile,
            workspace: null,
            subscription: null,
            features: null,
            permissions: null,
            routing: { recommendedRoute: "/waiting-approval", correlationId }
          };
        }

        return {
          identity,
          profile: {
            exists: profile.exists,
            data: profile.data,
            status: "INITIAL_IDENTITY",
            invitation: profile.invitation,
            pendingRequest: profile.pendingRequest
          },
          workspace: null,
          subscription: null,
          features: null,
          permissions: {
            list: [
              "CREATE_COMPANY",
              "REQUEST_ACCESS",
              "ACCEPT_INVITATION"
            ]
          },
          routing: { recommendedRoute: "/onboarding-choice", correlationId }
        };
      }

      // Stage 3-5: Parallel Tenant Resolution (Workspace, Subscription, Features)
      const role = profile.data?.role || "EMPLOYEE";
      const businessId = profile.data?.business_id || null;

      const isWorkspaceEnabled = FeatureFlagConfigService.isResolverPhaseEnabled("workspaceResolver", {
        userId: identity.uid,
        email: identity.email,
        businessId
      });

      const [workspace, subscription, features] = await Promise.all([
        isWorkspaceEnabled
          ? WorkspaceResolver.resolve(businessId)
          : Promise.resolve({ exists: false, data: null, status: "NONE" as const }),
        SubscriptionResolver.resolve(businessId),
        FeatureResolver.resolve(businessId)
      ]);

      // Double-check Super Admin role bypass just in case profile has a business_id (should not but let's be fully resilient)
      if (role === "SUPER_ADMIN") {
        const permissions = await PermissionResolver.resolve("SUPER_ADMIN", null, null, "ENTERPRISE", "ACTIVE");
        
        await EnterpriseAuditService.logEvent({
          correlationId,
          userId: identity.uid,
          userEmail: identity.email,
          action: "RESOLVER_SUPER_ADMIN_ROUTE",
          status: "SUCCESS",
          durationMs: Date.now() - start,
          business_id: null
        });

        return {
          identity,
          profile,
          workspace,
          subscription: null,
          features,
          permissions,
          routing: { recommendedRoute: "/super-admin", correlationId }
        };
      }

      if (!businessId || workspace.status === "NONE") {
        return {
          identity,
          profile,
          workspace,
          subscription: null,
          features: null,
          permissions: null,
          routing: { recommendedRoute: "/onboarding-choice", correlationId }
        };
      }

      if (workspace.status === "SUSPENDED" || workspace.status === "REJECTED") {
        await EnterpriseAuditService.logEvent({
          correlationId,
          userId: identity.uid,
          userEmail: identity.email,
          action: "RESOLVER_TENANT_SUSPENDED",
          status: "CRITICAL",
          business_id: businessId,
          metadata: { wsStatus: workspace.status }
        });

        return {
          identity,
          profile,
          workspace,
          subscription: null,
          features: null,
          permissions: null,
          routing: { recommendedRoute: "/account-recovery", correlationId }
        };
      }

      // Stage 6: Permissions
      const isPermissionEnabled = FeatureFlagConfigService.isResolverPhaseEnabled("permissionEngine", {
        userId: identity.uid,
        email: identity.email,
        businessId
      });

      let permissions: SessionContext["permissions"] = { list: [] };
      if (isPermissionEnabled) {
        permissions = await PermissionResolver.resolve(
          role,
          businessId,
          features?.matrix || null,
          subscription?.data?.plan,
          subscription?.status as any
        );
      } else {
        console.warn("[EnterpriseResolverPipeline] Permission engine is currently disabled or bypassed.");
      }

      // Map default deterministic route
      let recommendedRoute = "/workspace";
      if (role === "OWNER") recommendedRoute = "/workspace";
      else if (role === "MANAGER") recommendedRoute = "/workspace";
      else if (role === "SUPERVISOR") recommendedRoute = "/workspace";
      else if (role === "EMPLOYEE") recommendedRoute = "/workspace";

      const totalDuration = Date.now() - start;

      // Latency threshold warning if performance falls below SLAs (1.5 seconds)
      const isPerformanceWarning = totalDuration > 1500;
      await EnterpriseAuditService.logEvent({
        correlationId,
        userId: identity.uid,
        userEmail: identity.email,
        action: "RESOLVER_RESOLVE_SUCCESS",
        status: isPerformanceWarning ? "WARNING" : "SUCCESS",
        durationMs: totalDuration,
        business_id: businessId,
        metadata: { latencyWarning: isPerformanceWarning }
      });

      return {
        identity,
        profile,
        workspace,
        subscription,
        features,
        permissions,
        routing: { recommendedRoute, correlationId }
      };

    } catch (err: any) {
      const totalDuration = Date.now() - start;
      console.error(`[EnterpriseResolverPipeline] Critical error during session resolution. Correlation ID: ${correlationId}`, err);

      await EnterpriseAuditService.logEvent({
        correlationId,
        userId: authUser?.uid || "unauthenticated",
        userEmail: authUser?.email || "anonymous",
        action: "RESOLVER_EXCEPTION",
        status: "CRITICAL",
        durationMs: totalDuration,
        errorMessage: err.message || String(err)
      });

      // Attempt Graceful Degradation routing fallback using standard auth resolver
      let recommendedRoute = "/";
      try {
        if (authUser) {
          recommendedRoute = "/onboarding-choice";
        }
      } catch (e) {
        // Suppress nested fallback failures
      }

      return {
        identity: { uid: authUser?.uid || "", email: authUser?.email || "", emailVerified: authUser?.emailVerified || false, providerId: "", status: "ERROR" },
        profile: null,
        workspace: null,
        subscription: null,
        features: null,
        permissions: null,
        routing: { recommendedRoute, correlationId }
      };
    }
  }
};
