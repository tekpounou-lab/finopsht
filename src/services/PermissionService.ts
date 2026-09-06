import { FeatureMatrix } from "../repositories";
import { finopsEventOrchestrator } from "./finopsEventOrchestrator";
import { auth } from "../lib/firebase";

export type FeatureFlagState = "ENABLED" | "DISABLED" | "BETA" | "ENTERPRISE_ONLY" | "HIDDEN" | "COMING_SOON" | "DEPRECATED";

export interface LicenseCheckResult {
  exceeded: boolean;
  limit: number;
  usage: number;
  message?: string;
}

export const SUPER_ADMIN_SYSTEM_MODULES = [
  "forensic",
  "health",
  "system_health",
  "reliability",
  "resilience_dlq",
  "dlq",
  "recovery",
  "disaster_recovery"
];

export const DEFAULT_SYSTEM_ROLE_MODULE_MATRIX: Record<string, Record<string, boolean>> = {
  SUPER_ADMIN: {
    bi: true,
    personnel: true,
    performance: true,
    organization: true,
    planning: true,
    leave: true,
    attendance: true,
    payroll: true,
    ledger: true,
    accounting: true,
    crm: true,
    leads: true,
    prospects: true,
    proformas: true,
    invoices: true,
    invoice_template: true,
    invoiceTemplate: true,
    documents: true,
    forensic: true,
    health: true,
    system_health: true,
    reliability: true,
    resilience_dlq: true,
    dlq: true,
    recovery: true,
    disaster_recovery: true,
    aicfo: true,
    employeespace: true,
    settings: true
  },
  OWNER: {
    bi: true,
    personnel: true,
    performance: true,
    organization: true,
    planning: true,
    leave: true,
    attendance: true,
    payroll: true,
    ledger: true,
    accounting: true,
    crm: true,
    leads: true,
    prospects: true,
    proformas: true,
    invoices: true,
    invoice_template: true,
    invoiceTemplate: true,
    documents: true,
    forensic: true,
    health: false,
    system_health: false,
    reliability: false,
    resilience_dlq: false,
    dlq: false,
    recovery: false,
    disaster_recovery: false,
    aicfo: true,
    employeespace: true,
    settings: true
  },
  ADMIN: {
    bi: true,
    personnel: true,
    performance: true,
    organization: true,
    planning: true,
    leave: true,
    attendance: true,
    payroll: true,
    ledger: true,
    accounting: true,
    crm: true,
    leads: true,
    prospects: true,
    proformas: true,
    invoices: true,
    invoice_template: true,
    invoiceTemplate: true,
    documents: true,
    forensic: true,
    health: false,
    system_health: false,
    reliability: false,
    resilience_dlq: false,
    dlq: false,
    recovery: false,
    disaster_recovery: false,
    aicfo: true,
    employeespace: true,
    settings: true
  },
  MANAGER: {
    bi: true,
    personnel: true,
    performance: true,
    organization: true,
    planning: true,
    leave: true,
    attendance: true,
    payroll: true,
    ledger: true,
    accounting: true,
    crm: true,
    leads: true,
    prospects: true,
    proformas: true,
    invoices: true,
    invoice_template: false,
    invoiceTemplate: false,
    documents: true,
    forensic: false,
    health: false,
    system_health: false,
    reliability: false,
    resilience_dlq: false,
    dlq: false,
    recovery: false,
    disaster_recovery: false,
    aicfo: true,
    employeespace: true,
    settings: false
  },
  SUPERVISOR: {
    bi: false,
    personnel: false,
    performance: false,
    organization: false,
    planning: true,
    leave: true,
    attendance: true,
    payroll: false,
    ledger: false,
    accounting: false,
    crm: false,
    leads: false,
    prospects: false,
    proformas: false,
    invoices: false,
    invoice_template: false,
    invoiceTemplate: false,
    documents: false,
    forensic: false,
    health: false,
    system_health: false,
    reliability: false,
    resilience_dlq: false,
    dlq: false,
    recovery: false,
    disaster_recovery: false,
    aicfo: false,
    employeespace: true,
    settings: false
  },
  EMPLOYEE: {
    bi: false,
    personnel: false,
    performance: false,
    organization: false,
    planning: true,
    leave: false,
    attendance: false,
    payroll: false,
    ledger: false,
    accounting: false,
    crm: false,
    leads: false,
    prospects: false,
    proformas: false,
    invoices: false,
    invoice_template: false,
    invoiceTemplate: false,
    documents: false,
    forensic: false,
    health: false,
    system_health: false,
    reliability: false,
    resilience_dlq: false,
    dlq: false,
    recovery: false,
    disaster_recovery: false,
    aicfo: false,
    employeespace: true,
    settings: false
  }
};

class PermissionServiceClass {
  private permissions: string[] = [];
  private features: Partial<FeatureMatrix> = {};
  private activeRole: string | null = null;
  private businessId: string | null = null;
  
  // Subscription parameters
  private subscriptionPlan: "TRIAL" | "STARTER" | "PROFESSIONAL" | "BUSINESS" | "ENTERPRISE" = "STARTER";
  private subscriptionStatus: "ACTIVE" | "EXPIRED" | "TRIAL" | "GRACE_PERIOD" | "BLOCKED" | "NONE" = "ACTIVE";

  // Dynamic admin-configured role-to-module authorization matrix
  private roleModuleMatrix: Record<string, Record<string, boolean>> = DEFAULT_SYSTEM_ROLE_MODULE_MATRIX;

  // Cache for capabilities checks to maximize performance and avoid redundant processing
  private capabilityCache: Record<string, boolean> = {};

  /**
   * Initializes the PermissionService with resolved credentials, subscriptions, and features
   */
  public init(
    role: string,
    permissions: string[],
    features: FeatureMatrix,
    subscriptionPlan?: "TRIAL" | "STARTER" | "PROFESSIONAL" | "BUSINESS" | "ENTERPRISE",
    subscriptionStatus?: "ACTIVE" | "EXPIRED" | "TRIAL" | "GRACE_PERIOD" | "BLOCKED" | "NONE",
    businessId?: string | null,
    roleModuleMatrix?: Record<string, Record<string, boolean>>
  ) {
    this.activeRole = (role || "EMPLOYEE").toUpperCase();
    this.permissions = (permissions || []).map(p => p.toLowerCase());
    this.features = features || {};
    this.subscriptionPlan = subscriptionPlan || "STARTER";
    this.subscriptionStatus = subscriptionStatus || "ACTIVE";
    this.businessId = businessId || null;
    this.roleModuleMatrix = roleModuleMatrix && Object.keys(roleModuleMatrix).length > 0 
      ? roleModuleMatrix 
      : DEFAULT_SYSTEM_ROLE_MODULE_MATRIX;
    this.capabilityCache = {}; // Invalidate cache on re-initialization

    // Log the successful bootstrapping event to the monitoring/auditing layer
    try {
      if (this.businessId && auth.currentUser) {
        finopsEventOrchestrator.emit("AUTHORIZATION", this.businessId, {
          action: "PERMISSION_BOOTSTRAP_COMPLETE",
          role: this.activeRole,
          permissionsCount: this.permissions.length,
          plan: this.subscriptionPlan,
          status: this.subscriptionStatus
        });
      }
    } catch (e) {
      console.warn("[PermissionService] Event emission deferred:", e);
    }
  }

  /**
   * Verifies if the user is authorized to perform a specific system action.
   * Maps fine-grained capability queries (e.g. "payroll.approve") to role permissions.
   */
  public can(action: string): boolean {
    const actionLower = action.toLowerCase();
    
    // Forensic log modification is strictly prohibited for ALL roles (including SuperAdmin)
    if (actionLower === "modify_forensic_log" || actionLower === "delete_forensic_log") {
      this.capabilityCache[actionLower] = false;
      return false;
    }

    // SuperAdmin critical capabilities are ONLY accessible to SUPER_ADMIN role
    const isSuperAdminCapability = [
      "delete_business", 
      "manage_system_config", 
      "force_unseal_payroll", 
      "manage_global_tax", 
      "superadmin_access"
    ].includes(actionLower);

    if (isSuperAdminCapability) {
      const isSuper = this.activeRole === "SUPER_ADMIN";
      this.capabilityCache[actionLower] = isSuper;
      return isSuper;
    }

    // Check local cache first
    if (this.capabilityCache[actionLower] !== undefined) {
      return this.capabilityCache[actionLower];
    }

    // Platform Super Admin possesses universal platform bypass across all features/business operations
    if (this.activeRole === "SUPER_ADMIN") {
      this.capabilityCache[actionLower] = true;
      return true;
    }

    // Business OWNER possesses full sovereign control over all modules and operations within their own business
    if (this.activeRole === "OWNER") {
      this.capabilityCache[actionLower] = true;
      return true;
    }

    // Wildcard permissions bypass
    if (this.permissions.includes("all") || this.permissions.includes("*")) {
      this.capabilityCache[actionLower] = true;
      return true;
    }

    // Read-only state checks for expired/suspended subscriptions
    if (this.subscriptionStatus === "EXPIRED" || this.subscriptionStatus === "BLOCKED") {
      // Allow only non-mutating view actions
      const isReadAction = actionLower.startsWith("view") || actionLower.startsWith("read") || actionLower.includes("get") || actionLower.includes("list");
      if (!isReadAction) {
        this.capabilityCache[actionLower] = false;
        return false;
      }
    }

    let result = false;

    // Standard static actions / exact matching
    if (this.permissions.includes(actionLower)) {
      result = true;
    } else {
      // Map fine-grained capability checks (ABAC-ready mappings)
      switch (actionLower) {
        // HR / Employee Operations
        // HR / Staff Operations
        case "staff.view":
        case "staff.read":
        case "employee.view":
        case "employee.read":
          result = this.permissions.includes("view_employees") || ["SUPER_ADMIN", "OWNER", "ADMIN", "CFO", "DIRECTOR", "MANAGER", "SUPERVISOR", "EMPLOYEE", "HR_MANAGER"].includes(this.activeRole || "") || this.hasRoleModuleAccess(this.activeRole || undefined, "personnel");
          break;
        case "employee.create":
        case "employee.update":
        case "employee.import":
          result = this.permissions.includes("manage_employees") || this.permissions.includes("invite_employees");
          break;
        case "employees.suspend":
        case "employee.suspend":
          result = this.permissions.includes("employees.suspend") || this.permissions.includes("manage_employees") || this.activeRole === "OWNER" || this.activeRole === "MANAGER";
          break;
        case "employees.reactivate":
        case "employee.reactivate":
          result = this.permissions.includes("employees.reactivate") || this.permissions.includes("manage_employees") || this.activeRole === "OWNER" || this.activeRole === "MANAGER";
          break;
        case "employee.delete":
          result = this.permissions.includes("delete_employees") || this.activeRole === "OWNER";
          break;
        case "branch.create":
        case "branch.update":
          result = this.permissions.includes("create_branch") || this.permissions.includes("manage_settings");
          break;
        case "department.create":
        case "department.update":
          result = this.permissions.includes("create_department") || this.permissions.includes("manage_settings");
          break;

        // Payroll Operations
        case "payroll.view":
        case "payroll.read":
          result = this.permissions.includes("view_payroll") || this.permissions.includes("manage_payroll") || ["SUPER_ADMIN", "OWNER", "ADMIN", "CFO", "DIRECTOR", "MANAGER", "ACCOUNTANT", "PAYROLL_MANAGER"].includes(this.activeRole || "") || this.hasRoleModuleAccess(this.activeRole || undefined, "payroll");
          break;
        case "payroll.calculate":
          result = this.permissions.includes("manage_payroll");
          break;
        case "payroll.approve":
        case "payroll.lock":
          result = this.permissions.includes("lock_payroll") || this.permissions.includes("validate_payroll");
          break;

        // Attendance Operations
        case "attendance.view":
        case "attendance.read":
          result = this.permissions.includes("view_attendance") || ["SUPER_ADMIN", "OWNER", "ADMIN", "CFO", "DIRECTOR", "MANAGER", "SUPERVISOR", "EMPLOYEE"].includes(this.activeRole || "") || this.hasRoleModuleAccess(this.activeRole || undefined, "attendance");
          break;
        case "attendance.log":
          result = this.permissions.includes("log_attendance") || this.permissions.includes("override_attendance");
          break;
        case "attendance.override":
        case "attendance.approve":
          result = this.permissions.includes("override_attendance");
          break;

        // Leave & Vacation Operations
        case "leave.request":
        case "leave.create":
        case "leaves.request":
        case "request_leaves":
          result = this.permissions.includes("request_leaves") || this.permissions.includes("manage_leaves") || ["OWNER", "MANAGER", "SUPERVISOR", "EMPLOYEE", "HR_MANAGER", "DIRECTOR", "SUPER_ADMIN"].includes(this.activeRole || "");
          break;
        case "leave.manage":
        case "leaves.manage":
        case "manage_leaves":
          result = this.permissions.includes("manage_leaves") || ["OWNER", "MANAGER", "SUPERVISOR", "HR_MANAGER", "DIRECTOR", "SUPER_ADMIN"].includes(this.activeRole || "");
          break;

        // Accounting / General Ledger Operations
        case "accounting.view":
        case "accounting.read":
        case "ledger.view":
        case "ledger.read":
          result = this.permissions.includes("view_ledger") || ["SUPER_ADMIN", "OWNER", "ADMIN", "CFO", "DIRECTOR", "MANAGER", "ACCOUNTANT", "CONTROLLER"].includes(this.activeRole || "") || this.hasRoleModuleAccess(this.activeRole || undefined, "accounting") || this.hasRoleModuleAccess(this.activeRole || undefined, "ledger");
          break;
        case "ledger.write":
        case "journal.post":
          result = this.permissions.includes("write_ledger");
          break;

        // Observability & System
        case "observability.view":
        case "observability.read":
          result = ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER", "CFO"].includes(this.activeRole || "");
          break;

        // Business Setting Modifications
        case "business.settings":
        case "settings.write":
          result = this.permissions.includes("manage_settings");
          break;

        // BI & AI Assistant Capabilities
        case "bi.read":
          result = this.permissions.includes("read_bi") && this.hasModule("bi");
          break;
        case "aicfo.use":
          result = this.permissions.includes("use_aicfo") && this.hasModule("aicfo");
          break;

        // Documents Space
        case "documents.read":
          result = this.permissions.includes("view_documents") || this.permissions.includes("view_employee_space");
          break;
        case "documents.write":
        case "documents.delete":
          result = this.permissions.includes("view_documents") && (this.activeRole === "OWNER" || this.activeRole === "MANAGER" || this.activeRole === "HR_MANAGER" || this.activeRole === "PAYROLL_MANAGER");
          break;

        // Planning / Schedules Operations
        case "planning.read":
        case "planning.view":
          result = this.permissions.includes("view_planning") || ["OWNER", "MANAGER", "SUPERVISOR", "EMPLOYEE"].includes(this.activeRole || "");
          break;
        case "planning.write":
        case "planning.manage":
          result = this.permissions.includes("manage_planning") || ["OWNER", "MANAGER", "SUPERVISOR"].includes(this.activeRole || "");
          break;

        // Security Logs Audit
        case "security.view":
        case "audit.read":
          result = this.permissions.includes("view_audit_logs") || ["SUPER_ADMIN", "OWNER", "ADMIN", "CFO"].includes(this.activeRole || "");
          break;

        default:
          result = false;
          break;
      }
    }

    // If check failed, emit warning log for potential forensic analysis
    if (!result && this.businessId) {
      try {
        finopsEventOrchestrator.emit("AUTHORIZATION", this.businessId, {
          action: "PERMISSION_DENIED",
          actionChecked: action,
          role: this.activeRole,
          plan: this.subscriptionPlan,
          status: this.subscriptionStatus
        });
      } catch (e) {
        // Suppress background emission failures
      }
    }

    this.capabilityCache[actionLower] = result;
    return result;
  }

  /**
   * Checks if a high-fidelity workspace module is activated for the tenant, factoring in Subscription barriers.
   */
  public hasModule(moduleName: string): boolean {
    const modLower = moduleName.toLowerCase();
    
    // Check if module is turned on in feature matrix
    if (this.activeRole === "SUPER_ADMIN" || this.activeRole === "OWNER") {
      return true;
    }

    const isFeatureEnabledInMatrix = !!this.features[modLower as keyof FeatureMatrix];
    if (!isFeatureEnabledInMatrix) {
      return false;
    }

    // Enforce subscription modules access limits
    if (this.subscriptionPlan === "STARTER") {
      // Starter Plan is restricted from AI CFO, Business Intelligence (Executive BI), and advanced ledger systems
      if (["aicfo", "bi", "accounting"].includes(modLower)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Updates the dynamic role-to-module matrix configured by the tenant Admin.
   */
  public setRoleModuleMatrix(matrix: Record<string, Record<string, boolean>>): void {
    this.roleModuleMatrix = matrix || {};
    this.capabilityCache = {};
  }

  /**
   * Returns a copy of the active role-to-module matrix.
   */
  public getRoleModuleMatrix(): Record<string, Record<string, boolean>> {
    return { ...this.roleModuleMatrix };
  }

  /**
   * Evaluates if a given role is authorized to access a specific ERP module.
   * Considers explicit Admin customizations from roleModuleMatrix, subscription gates, and standard role defaults.
   */
  public hasRoleModuleAccess(roleOrCurrent?: string, moduleId?: string): boolean {
    if (!moduleId) return false;
    const modLower = moduleId.toLowerCase();
    const effectiveRole = (roleOrCurrent || this.activeRole || "EMPLOYEE").toUpperCase();

    // 1. Super Admin possesses universal platform bypass
    if (effectiveRole === "SUPER_ADMIN") return true;

    // 2. System modules (Forensic Audit, System Health, Reliability & DLQ, Disaster Recovery)
    // are strictly reserved for SUPER_ADMIN. Non-SUPER_ADMIN (including OWNER) are denied access.
    if (SUPER_ADMIN_SYSTEM_MODULES.includes(modLower)) {
      return false;
    }

    // 3. Business OWNER possesses sovereign control over business modules of their enterprise
    if (effectiveRole === "OWNER") return true;

    // 4. Global feature availability check (must be active for tenant)
    if (this.features && Object.keys(this.features).length > 0) {
      const isFeatureSet = this.features[modLower as keyof FeatureMatrix];
      if (isFeatureSet === false) {
        return false;
      }
    }

    // 5. Subscription plan restrictions (e.g. Starter tier cannot access AI CFO / BI / Accounting)
    if (this.subscriptionPlan === "STARTER") {
      if (["aicfo", "bi", "accounting"].includes(modLower)) {
        return false;
      }
    }

    // 6. Explicit Admin-defined Matrix rule (Highest authority within tenant)
    if (this.roleModuleMatrix && this.roleModuleMatrix[effectiveRole]) {
      const explicitSetting = this.roleModuleMatrix[effectiveRole][modLower];
      if (explicitSetting !== undefined) {
        return Boolean(explicitSetting);
      }
    }

    // 7. Canonical ERP Role Defaults
    const defaultAllowedRoles: Record<string, string[]> = {
      bi: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"],
      personnel: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"],
      performance: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"],
      organization: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"],
      planning: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "EMPLOYEE"],
      leave: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER", "SUPERVISOR"],
      attendance: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER", "SUPERVISOR"],
      payroll: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"],
      ledger: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"],
      accounting: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"],
      crm: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"],
      leads: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"],
      prospects: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"],
      proformas: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"],
      invoices: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"],
      invoice_template: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      invoiceTemplate: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      documents: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"],
      forensic: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      health: ["SUPER_ADMIN"],
      system_health: ["SUPER_ADMIN"],
      reliability: ["SUPER_ADMIN"],
      resilience_dlq: ["SUPER_ADMIN"],
      dlq: ["SUPER_ADMIN"],
      recovery: ["SUPER_ADMIN"],
      disaster_recovery: ["SUPER_ADMIN"],
      aicfo: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"],
      employeespace: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "EMPLOYEE"],
      settings: ["SUPER_ADMIN", "OWNER", "ADMIN"]
    };

    const allowed = defaultAllowedRoles[modLower] || ["SUPER_ADMIN", "OWNER", "ADMIN"];
    return allowed.includes(effectiveRole);
  }

  /**
   * Verifies if the user profile carries specific permission clearance (compatible with older stubs)
   */
  public hasPermission(permission: string): boolean {
    return this.can(permission);
  }

  /**
   * Evaluates dynamic feature states including beta, enterprise only, and custom statuses.
   */
  public getFeatureState(moduleName: string): FeatureFlagState {
    const modLower = moduleName.toLowerCase();
    
    if (modLower === "aicfo") {
      if (this.subscriptionPlan === "STARTER") return "ENTERPRISE_ONLY";
      return "BETA";
    }

    if (modLower === "bi") {
      if (this.subscriptionPlan === "STARTER") return "ENTERPRISE_ONLY";
      return "ENABLED";
    }

    const isEnabled = !!this.features[modLower as keyof FeatureMatrix];
    if (!isEnabled) {
      return "DISABLED";
    }

    return "ENABLED";
  }

  /**
   * Validates platform resource limits according to subscriptions to prevent crashes and display upgrade recommendations.
   */
  public checkLimit(limitKey: "employees" | "branches" | "users" | "storage" | "payroll_cycles", currentCount: number): LicenseCheckResult {
    let limit = Infinity;
    
    // Hard limits per Subscription Level
    if (this.subscriptionPlan === "STARTER") {
      switch (limitKey) {
        case "employees": limit = 5; break;
        case "branches": limit = 1; break;
        case "users": limit = 2; break;
        case "storage": limit = 5; break; // 5 GB
        case "payroll_cycles": limit = 2; break;
      }
    } else if (this.subscriptionPlan === "PROFESSIONAL" || this.subscriptionPlan === "TRIAL") {
      switch (limitKey) {
        case "employees": limit = 25; break;
        case "branches": limit = 3; break;
        case "users": limit = 5; break;
        case "storage": limit = 50; break; // 50 GB
        case "payroll_cycles": limit = 10; break;
      }
    } else {
      // ENTERPRISE or BUSINESS
      switch (limitKey) {
        case "employees": limit = 1000; break;
        case "branches": limit = 100; break;
        case "users": limit = 100; break;
        case "storage": limit = 1000; break; // 1 TB
        case "payroll_cycles": limit = 999; break;
      }
    }

    const exceeded = currentCount >= limit;

    if (exceeded && this.businessId) {
      try {
        finopsEventOrchestrator.emit("LICENSE", this.businessId, {
          action: "LICENSE_LIMIT_REACHED",
          limitKey,
          limit,
          currentCount,
          plan: this.subscriptionPlan
        });
      } catch (e) {
        // Safe logging fallback
      }
    }

    return {
      exceeded,
      limit,
      usage: currentCount,
      message: exceeded 
        ? `L'utilisation actuelle (${currentCount}) dépasse la limite autorisée (${limit}) pour le forfait ${this.subscriptionPlan}. Veuillez passer à la version supérieure.`
        : undefined
    };
  }

  /**
   * Returns current active role
   */
  public getRole(): string | null {
    return this.activeRole;
  }

  /**
   * Returns copy of active permissions
   */
  public getPermissions(): string[] {
    return [...this.permissions];
  }

  /**
   * Returns copy of active features
   */
  public getFeatures(): Partial<FeatureMatrix> {
    return { ...this.features };
  }

  /**
   * Returns active subscription plan
   */
  public getSubscriptionPlan() {
    return this.subscriptionPlan;
  }

  /**
   * Returns active subscription status
   */
  public getSubscriptionStatus() {
    return this.subscriptionStatus;
  }

  /**
   * Overrides the current subscription details for simulation purposes
   */
  public simulateSubscription(plan: "TRIAL" | "STARTER" | "PROFESSIONAL" | "BUSINESS" | "ENTERPRISE", status: "ACTIVE" | "EXPIRED" | "TRIAL" | "GRACE_PERIOD" | "BLOCKED" | "NONE") {
    this.subscriptionPlan = plan;
    this.subscriptionStatus = status;
    this.capabilityCache = {}; // Invalidate cache
  }

  /**
   * Overrides feature flags for simulation purposes
   */
  public simulateFeature(moduleName: string, enabled: boolean) {
    this.features[moduleName.toLowerCase() as keyof FeatureMatrix] = enabled;
    this.capabilityCache = {}; // Invalidate cache
  }

  /**
   * Invalidates the local permission capability cache.
   */
  public invalidateCache(): void {
    this.capabilityCache = {};
  }

  /**
   * Resets all internal permission, role, feature, and subscription state on session logout.
   */
  public reset(): void {
    this.permissions = [];
    this.features = {};
    this.activeRole = null;
    this.businessId = null;
    this.subscriptionPlan = "STARTER";
    this.subscriptionStatus = "ACTIVE";
    this.roleModuleMatrix = {};
    this.capabilityCache = {};
  }
}

export const PermissionService = new PermissionServiceClass();
export default PermissionService;
