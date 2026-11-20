import { Branch, Department, Role } from "../../../types";
import { hasPermission } from "../../../permissions/role.permissions";

export type OrgResolutionErrorCode =
  | "INVALID_BUSINESS_ID"
  | "INVALID_ORG_REFERENCE"
  | "MISSING_BRANCH_REFERENCE"
  | "MISSING_DEPARTMENT_REFERENCE"
  | "CROSS_TENANT_ORG_REFERENCE"
  | "CONFLICTING_TENANT_FIELDS"
  | "INACTIVE_ORG_REFERENCE"
  | "AMBIGUOUS_BRANCH_REFERENCE"
  | "AMBIGUOUS_DEPARTMENT_REFERENCE"
  | "UNAUTHENTICATED_ACTOR"
  | "INACTIVE_ACTOR"
  | "FORBIDDEN_TENANT_ACCESS"
  | "UNAUTHORIZED_IMPORT_ROLE"
  | "UNAUTHORIZED_BRANCH_CREATION"
  | "UNAUTHORIZED_DEPARTMENT_CREATION";

export class OrgResolutionError extends Error {
  public readonly code: OrgResolutionErrorCode;
  public readonly statusCode: number;
  public readonly entityType?: "branch" | "department" | "actor" | "tenant";
  public readonly details?: Record<string, any>;

  constructor(params: {
    code: OrgResolutionErrorCode;
    message: string;
    statusCode?: number;
    entityType?: "branch" | "department" | "actor" | "tenant";
    details?: Record<string, any>;
  }) {
    super(params.message);
    this.name = "OrgResolutionError";
    this.code = params.code;
    this.statusCode = params.statusCode ?? 400;
    this.entityType = params.entityType;
    this.details = params.details;
    Object.setPrototypeOf(this, OrgResolutionError.prototype);
  }
}

export interface BulkImportActorContext {
  uid?: string;
  id?: string;
  name?: string;
  role?: Role | string | null;
  businessId?: string | null;
  business_id?: string | null;
  status?: string | null;
  isActive?: boolean;
  is_active?: boolean;
  permissions?: string[];
}

export interface BulkImportPermissionVerdict {
  role: string;
  allowedToImportEmployees: boolean;
  canCreateBranch: boolean;
  canCreateDepartment: boolean;
  denialCode?: OrgResolutionErrorCode;
  denialReason?: string;
}

const DENIED_IMPORT_ROLES = new Set([
  "",
  "UNASSIGNED",
  "GUEST",
  "EMPLOYEE",
  "SUPERVISOR",
  "AUDITOR",
  "ACCOUNTANT",
  "TELLER",
  "JUNIOR_TELLER",
  "SENIOR_TELLER",
  "HEAD_TELLER",
  "MASTER_HEAD_TELLER"
]);

const AUTHORIZED_IMPORT_ROLES = new Set([
  "SUPER_ADMIN",
  "SYSTEM",
  "OWNER",
  "ADMIN",
  "MANAGER",
  "DIRECTOR",
  "HR_MANAGER",
  "PAYROLL_MANAGER",
  "CFO",
  "CONTROLLER"
]);

const INACTIVE_STATUSES = new Set(["INACTIVE", "SUSPENDED", "ARCHIVED", "DELETED", "REJECTED", "BLOCKED"]);

export function evaluateBulkImportActorPermissions(
  actor: BulkImportActorContext | null | undefined,
  targetBusinessId: string
): BulkImportPermissionVerdict {
  const cleanTargetBiz = (targetBusinessId || "").trim();
  if (!cleanTargetBiz) {
    return {
      role: "UNASSIGNED",
      allowedToImportEmployees: false,
      canCreateBranch: false,
      canCreateDepartment: false,
      denialCode: "INVALID_BUSINESS_ID",
      denialReason: "Identifiant d'entreprise cible manquant pour la vérification des autorisations."
    };
  }

  if (!actor) {
    return {
      role: "UNASSIGNED",
      allowedToImportEmployees: false,
      canCreateBranch: false,
      canCreateDepartment: false,
      denialCode: "UNAUTHENTICATED_ACTOR",
      denialReason: "Acteur authentifié requis pour exécuter l'importation organisationnelle."
    };
  }

  const rawRole = typeof actor.role === "string" ? actor.role.trim().toUpperCase() : "";
  const biz1 = typeof actor.business_id === "string" ? actor.business_id.trim() : "";
  const biz2 = typeof actor.businessId === "string" ? actor.businessId.trim() : "";

  if (biz1 && biz2 && biz1 !== biz2) {
    return {
      role: rawRole || "UNASSIGNED",
      allowedToImportEmployees: false,
      canCreateBranch: false,
      canCreateDepartment: false,
      denialCode: "CONFLICTING_TENANT_FIELDS",
      denialReason: "Incohérence multi-tenant sur les identifiants business_id / businessId de l'acteur."
    };
  }

  const actorBiz = biz1 || biz2;
  if (rawRole !== "SUPER_ADMIN" && rawRole !== "SYSTEM") {
    if (actorBiz && actorBiz !== cleanTargetBiz) {
      return {
        role: rawRole || "UNASSIGNED",
        allowedToImportEmployees: false,
        canCreateBranch: false,
        canCreateDepartment: false,
        denialCode: "FORBIDDEN_TENANT_ACCESS",
        denialReason: `Accès inter-tenant refusé : l'acteur appartient à '${actorBiz}' et ne peut opérer sur '${cleanTargetBiz}'.`
      };
    }
  }

  const actorStatus = typeof actor.status === "string" ? actor.status.trim().toUpperCase() : "";
  if (
    actor.isActive === false ||
    actor.is_active === false ||
    (actorStatus && INACTIVE_STATUSES.has(actorStatus))
  ) {
    return {
      role: rawRole || "UNASSIGNED",
      allowedToImportEmployees: false,
      canCreateBranch: false,
      canCreateDepartment: false,
      denialCode: "INACTIVE_ACTOR",
      denialReason: "Compte acteur inactif ou suspendu : opération d'importation refusée."
    };
  }

  if (DENIED_IMPORT_ROLES.has(rawRole) || !AUTHORIZED_IMPORT_ROLES.has(rawRole)) {
    return {
      role: rawRole || "UNASSIGNED",
      allowedToImportEmployees: false,
      canCreateBranch: false,
      canCreateDepartment: false,
      denialCode: "UNAUTHORIZED_IMPORT_ROLE",
      denialReason: `Le rôle '${rawRole || "UNASSIGNED"}' n'est pas autorisé à importer des collaborateurs ou créer des entités organisationnelles.`
    };
  }

  // OWNER / SUPER_ADMIN / SYSTEM hold full tenant organization + workforce import authority
  if (rawRole === "OWNER" || rawRole === "SUPER_ADMIN" || rawRole === "SYSTEM") {
    return {
      role: rawRole,
      allowedToImportEmployees: true,
      canCreateBranch: true,
      canCreateDepartment: true
    };
  }

  // Scoped custom permission list when explicitly supplied on the actor
  if (Array.isArray(actor.permissions)) {
    const pSet = new Set(actor.permissions.map((p) => String(p || "").trim().toLowerCase()).filter(Boolean));
    if (pSet.has("*") || pSet.has("all")) {
      return {
        role: rawRole,
        allowedToImportEmployees: true,
        canCreateBranch: true,
        canCreateDepartment: true
      };
    }

    const canImport =
      pSet.has("employee.import") ||
      pSet.has("manage_employees") ||
      pSet.has("invite_employees") ||
      pSet.has("employee.create");

    const canBranch =
      pSet.has("branch.create") ||
      pSet.has("create_branch") ||
      pSet.has("manage_branches") ||
      pSet.has("manage_settings");

    const canDept =
      pSet.has("department.create") ||
      pSet.has("create_department") ||
      pSet.has("manage_departments") ||
      pSet.has("manage_settings");

    if (!canImport) {
      return {
        role: rawRole,
        allowedToImportEmployees: false,
        canCreateBranch: canBranch,
        canCreateDepartment: canDept,
        denialCode: "UNAUTHORIZED_IMPORT_ROLE",
        denialReason: `Permissions insuffisantes pour le rôle '${rawRole}' : permission 'employee.import' requise.`
      };
    }

    return {
      role: rawRole,
      allowedToImportEmployees: true,
      canCreateBranch: canBranch,
      canCreateDepartment: canDept
    };
  }

  // Role default matrix fallback (when explicit granular permissions array is not passed)
  const canImport = hasPermission(rawRole, "canImportEmployees");
  const canBranch = hasPermission(rawRole, "canCreateBranch");
  const canDept = hasPermission(rawRole, "canCreateDepartment");

  if (!canImport) {
    return {
      role: rawRole,
      allowedToImportEmployees: false,
      canCreateBranch: canBranch,
      canCreateDepartment: canDept,
      denialCode: "UNAUTHORIZED_IMPORT_ROLE",
      denialReason: `Le rôle '${rawRole}' ne dispose pas de la permission d'importation de collaborateurs.`
    };
  }

  return {
    role: rawRole,
    allowedToImportEmployees: true,
    canCreateBranch: canBranch,
    canCreateDepartment: canDept
  };
}

export function generateDeterministicOrgId(prefix: string, businessId: string, identifier: string): string {
  const input = `${businessId}:${identifier.toLowerCase().trim()}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hashStr = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  return `${prefix}_${hashStr}`;
}

const INVALID_PLACEHOLDER_REFS = new Set(["null", "undefined", "n/a", "na", "-", "--", "none", "aucun"]);

export function isInvalidOrgReference(rawValue: unknown): boolean {
  if (rawValue === null || rawValue === undefined) return true;
  const trimmed = String(rawValue).normalize("NFKC").trim();
  if (!trimmed) return true;
  if (INVALID_PLACEHOLDER_REFS.has(trimmed.toLowerCase())) return true;
  return false;
}

export function isOrgEntityActive(entity: { is_active?: boolean; isActive?: boolean; status?: string }): boolean {
  if (entity.is_active === false || entity.isActive === false) return false;
  if (typeof entity.status === "string" && entity.status.trim().toUpperCase() === "INACTIVE") return false;
  return true;
}

export function classifyEntityTenant(
  entity: { business_id?: string; businessId?: string },
  expectedBusinessId: string
): "MATCH" | "CROSS_TENANT" | "CONFLICT" | "UNTAGGED" {
  const b1 = typeof entity.business_id === "string" ? entity.business_id.trim() : "";
  const b2 = typeof entity.businessId === "string" ? entity.businessId.trim() : "";
  if (b1 && b2 && b1 !== b2) return "CONFLICT";
  const resolved = b1 || b2;
  if (!resolved) return "UNTAGGED";
  return resolved === expectedBusinessId ? "MATCH" : "CROSS_TENANT";
}

export function stripUndefinedFields<T extends Record<string, any>>(obj: T): T {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      clean[k] = v;
    }
  }
  return clean as T;
}

export interface ResolveBranchResult {
  status: "REUSED" | "CREATED";
  branch: Branch;
  created: boolean;
  matchedBy: "id" | "code" | "normalized_name" | "canonical_name" | "alias" | "cache" | "created";
}

export interface ResolveDepartmentResult {
  status: "REUSED" | "CREATED";
  department: Department;
  created: boolean;
  matchedBy: "id" | "code" | "normalized_name" | "canonical_name" | "alias" | "cache" | "created";
}

export interface OrgImportContext {
  existingBranches?: Branch[];
  existingDepartments?: Department[];
  branchCache?: Map<string, Branch>;
  departmentCache?: Map<string, Department>;
  inFlightBranches?: Map<string, Promise<ResolveBranchResult>>;
  inFlightDepartments?: Map<string, Promise<ResolveDepartmentResult>>;
  dryRun?: boolean;
  persist?: boolean;
}
