/**
 * FINOPS ERP / FINAYITI FUSION
 * SINGLE SOURCE OF TRUTH — ATTENDANCE & BADGE KIOSK AUTHORIZATION POLICY
 *
 * Enforces the canonical Attendance RBAC policy identically across:
 * - Backend API (/api/attendance/check-in, /api/attendance/check-out, /api/attendance/override)
 * - Client AttendanceRepository & Unified QR/Badge Kiosk UI
 *
 * Canonical Policy:
 * - OWNER / ADMIN / OWNER_ADMIN / SUPER_ADMIN (tenant-verified):
 *   Self check-in/out ALLOWED; record attendance for any active employee across all branches of the same business ALLOWED.
 * - MANAGER:
 *   Self check-in/out ALLOWED; record attendance ONLY for active employees within authorized branch(es) of the same business.
 * - SUPERVISOR (distinct canonical role — NEVER mapped to MANAGER or HEAD_TELLER):
 *   Self check-in/out ALLOWED; record attendance ONLY for active employees in authorized team/branch within the same business.
 * - HEAD_TELLER / MASTER_HEAD_TELLER:
 *   Self check-in/out ALLOWED; third-party attendance DENIED unless explicitly delegated on trusted server actor record.
 * - SENIOR_TELLER / JUNIOR_TELLER / TELLER / EMPLOYEE:
 *   Self check-in/out ONLY; third-party attendance ALWAYS DENIED.
 * - AUDITOR / GUEST / UNASSIGNED / unknown:
 *   All attendance mutations DENIED.
 */

export type CanonicalAttendanceRole =
  | "SUPER_ADMIN"
  | "OWNER"
  | "ADMIN"
  | "OWNER_ADMIN"
  | "MANAGER"
  | "SUPERVISOR"
  | "HEAD_TELLER"
  | "MASTER_HEAD_TELLER"
  | "SENIOR_TELLER"
  | "JUNIOR_TELLER"
  | "TELLER"
  | "EMPLOYEE"
  | "AUDITOR"
  | "ACCOUNTANT"
  | "DIRECTOR"
  | "HR_MANAGER"
  | "PAYROLL_MANAGER"
  | "TEAM_LEADER"
  | "GUEST"
  | "UNASSIGNED";

const VALID_CANONICAL_ATTENDANCE_ROLES = new Set<string>([
  "SUPER_ADMIN",
  "OWNER",
  "ADMIN",
  "OWNER_ADMIN",
  "MANAGER",
  "SUPERVISOR",
  "HEAD_TELLER",
  "MASTER_HEAD_TELLER",
  "SENIOR_TELLER",
  "JUNIOR_TELLER",
  "TELLER",
  "EMPLOYEE",
  "AUDITOR",
  "ACCOUNTANT",
  "DIRECTOR",
  "HR_MANAGER",
  "PAYROLL_MANAGER",
  "TEAM_LEADER",
  "GUEST",
  "UNASSIGNED"
]);

export const SELF_ONLY_ATTENDANCE_ROLES = new Set<CanonicalAttendanceRole>([
  "JUNIOR_TELLER",
  "SENIOR_TELLER",
  "TELLER",
  "EMPLOYEE"
]);

export const TELLER_DELEGABLE_ATTENDANCE_ROLES = new Set<CanonicalAttendanceRole>([
  "HEAD_TELLER",
  "MASTER_HEAD_TELLER"
]);

export const FULL_BUSINESS_ATTENDANCE_ROLES = new Set<CanonicalAttendanceRole>([
  "SUPER_ADMIN",
  "OWNER",
  "ADMIN",
  "OWNER_ADMIN"
]);

export const INACTIVE_ENTITY_STATUSES = new Set<string>([
  "INACTIVE",
  "SUSPENDED",
  "TERMINATED",
  "DELETED",
  "DISABLED",
  "ARCHIVED",
  "ARCHIVE",
  "REVOKED"
]);

const INVALID_TENANT_VALUES = new Set<string>([
  "",
  "none",
  "null",
  "undefined",
  "default",
  "unknown"
]);

export interface TrustedAttendanceActor {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  role: string | null | undefined;
  businessId?: string | null;
  business_id?: string | null;
  isSuperAdmin?: boolean;
  employeeId?: string | null;
  branchId?: string | null;
  branch_id?: string | null;
  departmentId?: string | null;
  department_id?: string | null;
  teamId?: string | null;
  team_id?: string | null;
  authorizedBranchIds?: string[] | null;
  authorizedDepartmentIds?: string[] | null;
  authorizedTeamIds?: string[] | null;
  delegatedEmployeeIds?: string[] | null;
  delegatedBranchIds?: string[] | null;
  explicitAttendanceDelegation?: boolean;
  status?: string | null;
  active?: boolean;
}

export interface TrustedAttendanceTarget {
  id: string;
  uid?: string | null;
  firebase_uid?: string | null;
  userId?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  businessId?: string | null;
  business_id?: string | null;
  tenantId?: string | null;
  tenant_id?: string | null;
  branchId?: string | null;
  branch_id?: string | null;
  departmentId?: string | null;
  department_id?: string | null;
  teamId?: string | null;
  team_id?: string | null;
  managerId?: string | null;
  supervisorId?: string | null;
  status?: string | null;
  active?: boolean;
}

export type AttendanceActionKind =
  | "check_in"
  | "check_out"
  | "override"
  | "bulk_import"
  | "delete"
  | "approve_adjustment";

export interface AttendanceAuthorizationInput {
  action: AttendanceActionKind;
  actor: TrustedAttendanceActor;
  targetEmployee: TrustedAttendanceTarget | null | undefined;
  claimedBusinessId?: string | null;
  claimedActorId?: string | null;
  claimedActorRole?: string | null;
  claimedTargetUid?: string | null;
}

export type AttendanceAuthorizationCode =
  | "ALLOWED"
  | "UNAUTHENTICATED_ACTOR"
  | "INACTIVE_ACTOR"
  | "INVALID_OR_MISSING_ROLE"
  | "IDENTITY_SPOOFING_DETECTED"
  | "ROLE_SPOOFING_DETECTED"
  | "FORBIDDEN_TENANT_CLAIM"
  | "TARGET_EMPLOYEE_NOT_FOUND"
  | "MISSING_TARGET_TENANT_CONTEXT"
  | "TARGET_EMPLOYEE_INACTIVE"
  | "CROSS_TENANT_ATTENDANCE_DENIED"
  | "FORBIDDEN_ATTENDANCE_ROLE"
  | "TELLER_SELF_ATTENDANCE_ONLY"
  | "SELF_ATTENDANCE_ONLY"
  | "BRANCH_SCOPE_VIOLATION"
  | "MISSING_BRANCH_SCOPE"
  | "SUPERVISOR_SCOPE_VIOLATION"
  | "SUPERVISOR_SCOPE_MISSING"
  | "CANNOT_RECORD_HIGHER_PRIVILEGE_TARGET"
  | "OVERRIDE_FORBIDDEN_FOR_ROLE"
  | "DELETE_FORBIDDEN_FOR_ROLE"
  | "ADJUSTMENT_APPROVAL_FORBIDDEN";

export interface AttendanceAuthorizationDecision {
  allowed: boolean;
  code: AttendanceAuthorizationCode;
  reason: string;
  canonicalRole: CanonicalAttendanceRole | null;
  canonicalBusinessId: string | null;
  canonicalBranchId: string | null;
  isSelfTarget: boolean;
}

export function isInvalidAttendanceTenantId(value: unknown): boolean {
  if (typeof value !== "string") return true;
  const trimmed = value.trim();
  return INVALID_TENANT_VALUES.has(trimmed.toLowerCase());
}

export function extractCanonicalBusinessId(entity: {
  businessId?: unknown;
  business_id?: unknown;
  tenantId?: unknown;
  tenant_id?: unknown;
} | null | undefined): string | null {
  if (!entity) return null;
  const candidates = [entity.business_id, entity.businessId, entity.tenant_id, entity.tenantId];
  const validValues = new Set<string>();
  for (const raw of candidates) {
    if (typeof raw === "string" && !isInvalidAttendanceTenantId(raw)) {
      validValues.add(raw.trim());
    }
  }
  if (validValues.size !== 1) {
    // Reject missing OR conflicting business_id / businessId fields
    return null;
  }
  return Array.from(validValues)[0];
}

export function extractCanonicalBranchId(entity: {
  branchId?: unknown;
  branch_id?: unknown;
} | null | undefined): string | null {
  if (!entity) return null;
  const raw =
    typeof entity.branchId === "string" && entity.branchId.trim()
      ? entity.branchId.trim()
      : typeof entity.branch_id === "string" && entity.branch_id.trim()
        ? entity.branch_id.trim()
        : null;
  return raw;
}

export function extractCanonicalDepartmentId(entity: {
  departmentId?: unknown;
  department_id?: unknown;
  teamId?: unknown;
  team_id?: unknown;
} | null | undefined): string | null {
  if (!entity) return null;
  const candidates = [entity.departmentId, entity.department_id, entity.teamId, entity.team_id];
  for (const raw of candidates) {
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }
  }
  return null;
}

/**
 * Normalizes a role strictly WITHOUT silently mapping SUPERVISOR to MANAGER or HEAD_TELLER.
 */
export function normalizeCanonicalAttendanceRole(rawRole: unknown): CanonicalAttendanceRole | null {
  if (typeof rawRole !== "string") return null;
  const normalized = rawRole.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!normalized) return null;
  if (VALID_CANONICAL_ATTENDANCE_ROLES.has(normalized)) {
    return normalized as CanonicalAttendanceRole;
  }
  return null;
}

export function isEntityInactive(entity: { status?: unknown; active?: unknown } | null | undefined): boolean {
  if (!entity) return true;
  if (entity.active === false) return true;
  if (typeof entity.status === "string" && INACTIVE_ENTITY_STATUSES.has(entity.status.trim().toUpperCase())) {
    return true;
  }
  return false;
}

export function isActorSelfTarget(
  actor: TrustedAttendanceActor,
  target: TrustedAttendanceTarget
): boolean {
  const actorUid = typeof actor.uid === "string" ? actor.uid.trim() : "";
  if (!actorUid) return false;

  const targetUids = [target.firebase_uid, target.uid, target.userId]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());

  if (targetUids.includes(actorUid)) {
    return true;
  }

  if (target.id && target.id.trim() === actorUid) {
    return true;
  }

  if (actor.employeeId && target.id && actor.employeeId.trim() === target.id.trim()) {
    return true;
  }

  return false;
}

function getActorAuthorizedBranchSet(actor: TrustedAttendanceActor): Set<string> {
  const set = new Set<string>();
  const primary = extractCanonicalBranchId(actor);
  if (primary) set.add(primary);
  if (Array.isArray(actor.authorizedBranchIds)) {
    for (const b of actor.authorizedBranchIds) {
      if (typeof b === "string" && b.trim()) {
        set.add(b.trim());
      }
    }
  }
  return set;
}

function getActorAuthorizedDepartmentSet(actor: TrustedAttendanceActor): Set<string> {
  const set = new Set<string>();
  const primary = extractCanonicalDepartmentId(actor);
  if (primary) set.add(primary);
  if (Array.isArray(actor.authorizedDepartmentIds)) {
    for (const d of actor.authorizedDepartmentIds) {
      if (typeof d === "string" && d.trim()) {
        set.add(d.trim());
      }
    }
  }
  if (Array.isArray(actor.authorizedTeamIds)) {
    for (const t of actor.authorizedTeamIds) {
      if (typeof t === "string" && t.trim()) {
        set.add(t.trim());
      }
    }
  }
  return set;
}

function hasExplicitTellerDelegation(
  actor: TrustedAttendanceActor,
  target: TrustedAttendanceTarget,
  targetBranchId: string | null
): boolean {
  if (Array.isArray(actor.delegatedEmployeeIds) && actor.delegatedEmployeeIds.includes(target.id)) {
    return true;
  }
  if (actor.explicitAttendanceDelegation === true) {
    // If branch-scoped delegations are listed, verify branch match strictly
    if (Array.isArray(actor.delegatedBranchIds) && actor.delegatedBranchIds.length > 0) {
      return Boolean(targetBranchId && actor.delegatedBranchIds.includes(targetBranchId));
    }
    const actorBranches = getActorAuthorizedBranchSet(actor);
    // Fail closed when HEAD_TELLER lacks an explicit branch scope (never grant tenant-wide authority)
    if (actorBranches.size === 0 || !targetBranchId) {
      return false;
    }
    return actorBranches.has(targetBranchId);
  }
  return false;
}

export function authorizeAttendanceAction(
  input: AttendanceAuthorizationInput
): AttendanceAuthorizationDecision {
  const { action, actor, targetEmployee } = input;

  if (!actor || typeof actor.uid !== "string" || !actor.uid.trim()) {
    return {
      allowed: false,
      code: "UNAUTHENTICATED_ACTOR",
      reason: "Authenticated actor identity is required.",
      canonicalRole: null,
      canonicalBusinessId: null,
      canonicalBranchId: null,
      isSelfTarget: false
    };
  }

  if (isEntityInactive(actor)) {
    return {
      allowed: false,
      code: "INACTIVE_ACTOR",
      reason: "Actor account is inactive or suspended.",
      canonicalRole: null,
      canonicalBusinessId: null,
      canonicalBranchId: null,
      isSelfTarget: false
    };
  }

  const canonicalRole = actor.isSuperAdmin
    ? "SUPER_ADMIN"
    : normalizeCanonicalAttendanceRole(actor.role);

  if (!canonicalRole) {
    return {
      allowed: false,
      code: "INVALID_OR_MISSING_ROLE",
      reason: "Actor does not have a valid canonical RBAC role.",
      canonicalRole: null,
      canonicalBusinessId: null,
      canonicalBranchId: null,
      isSelfTarget: false
    };
  }

  // Reject client identity/role spoofing
  if (
    typeof input.claimedActorId === "string" &&
    input.claimedActorId.trim() !== "" &&
    input.claimedActorId.trim() !== actor.uid.trim() &&
    (!actor.employeeId || input.claimedActorId.trim() !== actor.employeeId.trim())
  ) {
    return {
      allowed: false,
      code: "IDENTITY_SPOOFING_DETECTED",
      reason: "Client-provided actorId does not match authenticated actor.",
      canonicalRole,
      canonicalBusinessId: null,
      canonicalBranchId: null,
      isSelfTarget: false
    };
  }

  if (typeof input.claimedActorRole === "string" && input.claimedActorRole.trim() !== "") {
    const claimedRoleNorm = normalizeCanonicalAttendanceRole(input.claimedActorRole);
    if (!claimedRoleNorm || claimedRoleNorm !== canonicalRole) {
      return {
        allowed: false,
        code: "ROLE_SPOOFING_DETECTED",
        reason: "Client-provided role does not match authenticated actor role.",
        canonicalRole,
        canonicalBusinessId: null,
        canonicalBranchId: null,
        isSelfTarget: false
      };
    }
  }

  if (!targetEmployee || !targetEmployee.id) {
    return {
      allowed: false,
      code: "TARGET_EMPLOYEE_NOT_FOUND",
      reason: "Target employee record was not found.",
      canonicalRole,
      canonicalBusinessId: null,
      canonicalBranchId: null,
      isSelfTarget: false
    };
  }

  const targetBusinessId = extractCanonicalBusinessId(targetEmployee);
  if (!targetBusinessId) {
    return {
      allowed: false,
      code: "MISSING_TARGET_TENANT_CONTEXT",
      reason: "Target employee record lacks a canonical business_id.",
      canonicalRole,
      canonicalBusinessId: null,
      canonicalBranchId: extractCanonicalBranchId(targetEmployee),
      isSelfTarget: false
    };
  }

  // Reject client-supplied forged businessId/tenantId claim
  if (
    typeof input.claimedBusinessId === "string" &&
    input.claimedBusinessId.trim() !== "" &&
    input.claimedBusinessId.trim() !== targetBusinessId
  ) {
    return {
      allowed: false,
      code: "FORBIDDEN_TENANT_CLAIM",
      reason: "Client-supplied business_id does not match target employee's canonical business_id.",
      canonicalRole,
      canonicalBusinessId: targetBusinessId,
      canonicalBranchId: extractCanonicalBranchId(targetEmployee),
      isSelfTarget: false
    };
  }

  // Reject client-supplied overridden target UID mismatch
  if (
    typeof input.claimedTargetUid === "string" &&
    input.claimedTargetUid.trim() !== "" &&
    targetEmployee.firebase_uid &&
    input.claimedTargetUid.trim() !== targetEmployee.firebase_uid.trim() &&
    input.claimedTargetUid.trim() !== targetEmployee.id.trim()
  ) {
    return {
      allowed: false,
      code: "IDENTITY_SPOOFING_DETECTED",
      reason: "Claimed target employee UID does not match resolved employee record.",
      canonicalRole,
      canonicalBusinessId: targetBusinessId,
      canonicalBranchId: extractCanonicalBranchId(targetEmployee),
      isSelfTarget: false
    };
  }

  const targetBranchId = extractCanonicalBranchId(targetEmployee);
  const isSelf = isActorSelfTarget(actor, targetEmployee);

  // Tenant isolation check (even OWNER/MANAGER/SUPERVISOR cannot cross businesses)
  if (canonicalRole !== "SUPER_ADMIN") {
    const actorBusinessId = extractCanonicalBusinessId(actor);
    if (!actorBusinessId || actorBusinessId !== targetBusinessId) {
      return {
        allowed: false,
        code: "CROSS_TENANT_ATTENDANCE_DENIED",
        reason: "Actor and target employee belong to different businesses.",
        canonicalRole,
        canonicalBusinessId: targetBusinessId,
        canonicalBranchId: targetBranchId,
        isSelfTarget: isSelf
      };
    }
  }

  // Inactive target employee check
  if (isEntityInactive(targetEmployee)) {
    return {
      allowed: false,
      code: "TARGET_EMPLOYEE_INACTIVE",
      reason: "Target employee is inactive, suspended, or terminated.",
      canonicalRole,
      canonicalBusinessId: targetBusinessId,
      canonicalBranchId: targetBranchId,
      isSelfTarget: isSelf
    };
  }

  // AUDITOR & non-operational oversight / guest roles cannot mutate attendance
  if (
    canonicalRole === "AUDITOR" ||
    canonicalRole === "GUEST" ||
    canonicalRole === "UNASSIGNED" ||
    canonicalRole === "ACCOUNTANT"
  ) {
    return {
      allowed: false,
      code: "FORBIDDEN_ATTENDANCE_ROLE",
      reason: `Role ${canonicalRole} is not permitted to record or mutate attendance.`,
      canonicalRole,
      canonicalBusinessId: targetBusinessId,
      canonicalBranchId: targetBranchId,
      isSelfTarget: isSelf
    };
  }

  // Administrative attendance deletion: OWNER / ADMIN / OWNER_ADMIN / SUPER_ADMIN only
  if (action === "delete") {
    if (!FULL_BUSINESS_ATTENDANCE_ROLES.has(canonicalRole)) {
      return {
        allowed: false,
        code: "DELETE_FORBIDDEN_FOR_ROLE",
        reason: `Role ${canonicalRole} cannot delete attendance records.`,
        canonicalRole,
        canonicalBusinessId: targetBusinessId,
        canonicalBranchId: targetBranchId,
        isSelfTarget: isSelf
      };
    }
    return {
      allowed: true,
      code: "ALLOWED",
      reason: `Attendance delete authorized for ${canonicalRole}.`,
      canonicalRole,
      canonicalBusinessId: targetBusinessId,
      canonicalBranchId: targetBranchId,
      isSelfTarget: isSelf
    };
  }

  // Override / Bulk Import / Adjustment Approval: strictly restricted to OWNER, ADMIN, OWNER_ADMIN, MANAGER, SUPER_ADMIN
  if (action === "override" || action === "bulk_import" || action === "approve_adjustment") {
    const canAdminOrManage =
      canonicalRole === "SUPER_ADMIN" ||
      canonicalRole === "OWNER" ||
      canonicalRole === "ADMIN" ||
      canonicalRole === "OWNER_ADMIN" ||
      canonicalRole === "MANAGER";
    if (!canAdminOrManage) {
      return {
        allowed: false,
        code:
          action === "approve_adjustment"
            ? "ADJUSTMENT_APPROVAL_FORBIDDEN"
            : "OVERRIDE_FORBIDDEN_FOR_ROLE",
        reason: `Role ${canonicalRole} cannot perform attendance ${action}.`,
        canonicalRole,
        canonicalBusinessId: targetBusinessId,
        canonicalBranchId: targetBranchId,
        isSelfTarget: isSelf
      };
    }
  }

  // Full business-wide roles (OWNER, ADMIN, OWNER_ADMIN, SUPER_ADMIN)
  if (FULL_BUSINESS_ATTENDANCE_ROLES.has(canonicalRole)) {
    return {
      allowed: true,
      code: "ALLOWED",
      reason: `${canonicalRole} authorized across all branches of verified tenant.`,
      canonicalRole,
      canonicalBusinessId: targetBusinessId,
      canonicalBranchId: targetBranchId,
      isSelfTarget: isSelf
    };
  }

  // Self-only roles: JUNIOR_TELLER, SENIOR_TELLER, TELLER, EMPLOYEE
  if (SELF_ONLY_ATTENDANCE_ROLES.has(canonicalRole)) {
    if (!isSelf) {
      return {
        allowed: false,
        code: "SELF_ATTENDANCE_ONLY",
        reason: `${canonicalRole} may only record their own attendance.`,
        canonicalRole,
        canonicalBusinessId: targetBusinessId,
        canonicalBranchId: targetBranchId,
        isSelfTarget: false
      };
    }
    return {
      allowed: true,
      code: "ALLOWED",
      reason: `${canonicalRole} self attendance authorized.`,
      canonicalRole,
      canonicalBusinessId: targetBusinessId,
      canonicalBranchId: targetBranchId,
      isSelfTarget: true
    };
  }

  // HEAD_TELLER / MASTER_HEAD_TELLER: self allowed; others denied unless explicitly delegated
  if (TELLER_DELEGABLE_ATTENDANCE_ROLES.has(canonicalRole)) {
    if (isSelf) {
      return {
        allowed: true,
        code: "ALLOWED",
        reason: `${canonicalRole} self attendance authorized.`,
        canonicalRole,
        canonicalBusinessId: targetBusinessId,
        canonicalBranchId: targetBranchId,
        isSelfTarget: true
      };
    }

    if (hasExplicitTellerDelegation(actor, targetEmployee, targetBranchId)) {
      return {
        allowed: true,
        code: "ALLOWED",
        reason: `${canonicalRole} authorized via explicit attendance delegation.`,
        canonicalRole,
        canonicalBusinessId: targetBusinessId,
        canonicalBranchId: targetBranchId,
        isSelfTarget: false
      };
    }

    return {
      allowed: false,
      code: "TELLER_SELF_ATTENDANCE_ONLY",
      reason: `${canonicalRole} cannot record attendance for another employee without explicit delegation.`,
      canonicalRole,
      canonicalBusinessId: targetBusinessId,
      canonicalBranchId: targetBranchId,
      isSelfTarget: false
    };
  }

  // MANAGER: self allowed; others ONLY within authorized branch(es) of same business
  if (canonicalRole === "MANAGER") {
    if (isSelf) {
      return {
        allowed: true,
        code: "ALLOWED",
        reason: "MANAGER self attendance authorized.",
        canonicalRole,
        canonicalBusinessId: targetBusinessId,
        canonicalBranchId: targetBranchId,
        isSelfTarget: true
      };
    }

    const targetNormRole = normalizeCanonicalAttendanceRole(targetEmployee.role);
    if (targetNormRole === "SUPER_ADMIN" || targetNormRole === "OWNER") {
      return {
        allowed: false,
        code: "CANNOT_RECORD_HIGHER_PRIVILEGE_TARGET",
        reason: "MANAGER cannot record or override attendance for OWNER or SUPER_ADMIN.",
        canonicalRole,
        canonicalBusinessId: targetBusinessId,
        canonicalBranchId: targetBranchId,
        isSelfTarget: false
      };
    }

    const actorBranches = getActorAuthorizedBranchSet(actor);
    if (actorBranches.size === 0) {
      return {
        allowed: false,
        code: "MISSING_BRANCH_SCOPE",
        reason: "MANAGER lacks an authorized branch scope.",
        canonicalRole,
        canonicalBusinessId: targetBusinessId,
        canonicalBranchId: targetBranchId,
        isSelfTarget: false
      };
    }

    if (!targetBranchId || !actorBranches.has(targetBranchId)) {
      return {
        allowed: false,
        code: "BRANCH_SCOPE_VIOLATION",
        reason: "Target employee is outside MANAGER authorized branch scope.",
        canonicalRole,
        canonicalBusinessId: targetBusinessId,
        canonicalBranchId: targetBranchId,
        isSelfTarget: false
      };
    }

    return {
      allowed: true,
      code: "ALLOWED",
      reason: "MANAGER authorized within branch scope.",
      canonicalRole,
      canonicalBusinessId: targetBusinessId,
      canonicalBranchId: targetBranchId,
      isSelfTarget: false
    };
  }

  // SUPERVISOR: distinct canonical role — self allowed; others ONLY within authorized team/branch
  if (canonicalRole === "SUPERVISOR" || canonicalRole === "TEAM_LEADER") {
    if (isSelf) {
      return {
        allowed: true,
        code: "ALLOWED",
        reason: `${canonicalRole} self attendance authorized.`,
        canonicalRole,
        canonicalBusinessId: targetBusinessId,
        canonicalBranchId: targetBranchId,
        isSelfTarget: true
      };
    }

    const targetNormRole = normalizeCanonicalAttendanceRole(targetEmployee.role);
    if (targetNormRole === "SUPER_ADMIN" || targetNormRole === "OWNER") {
      return {
        allowed: false,
        code: "CANNOT_RECORD_HIGHER_PRIVILEGE_TARGET",
        reason: `${canonicalRole} cannot record attendance for OWNER or SUPER_ADMIN.`,
        canonicalRole,
        canonicalBusinessId: targetBusinessId,
        canonicalBranchId: targetBranchId,
        isSelfTarget: false
      };
    }

    const actorBranches = getActorAuthorizedBranchSet(actor);
    const actorDepts = getActorAuthorizedDepartmentSet(actor);
    const targetDeptId = extractCanonicalDepartmentId(targetEmployee);

    const isDirectReport =
      (typeof targetEmployee.managerId === "string" &&
        (targetEmployee.managerId === actor.uid ||
          (actor.employeeId && targetEmployee.managerId === actor.employeeId))) ||
      (typeof targetEmployee.supervisorId === "string" &&
        (targetEmployee.supervisorId === actor.uid ||
          (actor.employeeId && targetEmployee.supervisorId === actor.employeeId)));

    if (actorBranches.size === 0 && actorDepts.size === 0 && !isDirectReport) {
      return {
        allowed: false,
        code: "SUPERVISOR_SCOPE_MISSING",
        reason: `${canonicalRole} lacks an authorized branch or team scope.`,
        canonicalRole,
        canonicalBusinessId: targetBusinessId,
        canonicalBranchId: targetBranchId,
        isSelfTarget: false
      };
    }

    // If actor has branch restrictions, enforce branch match
    if (actorBranches.size > 0 && (!targetBranchId || !actorBranches.has(targetBranchId))) {
      return {
        allowed: false,
        code: "SUPERVISOR_SCOPE_VIOLATION",
        reason: "Target employee is outside SUPERVISOR authorized branch.",
        canonicalRole,
        canonicalBusinessId: targetBusinessId,
        canonicalBranchId: targetBranchId,
        isSelfTarget: false
      };
    }

    // If direct report within allowed branch (or no branch constraint on actor), allow
    if (isDirectReport) {
      return {
        allowed: true,
        code: "ALLOWED",
        reason: `${canonicalRole} authorized for direct report.`,
        canonicalRole,
        canonicalBusinessId: targetBusinessId,
        canonicalBranchId: targetBranchId,
        isSelfTarget: false
      };
    }

    // Otherwise check department/team scope if actor has department/team scope configured
    if (actorDepts.size > 0) {
      if (!targetDeptId || !actorDepts.has(targetDeptId)) {
        return {
          allowed: false,
          code: "SUPERVISOR_SCOPE_VIOLATION",
          reason: "Target employee is outside SUPERVISOR authorized team/department.",
          canonicalRole,
          canonicalBusinessId: targetBusinessId,
          canonicalBranchId: targetBranchId,
          isSelfTarget: false
        };
      }
    }

    return {
      allowed: true,
      code: "ALLOWED",
      reason: `${canonicalRole} authorized within team/branch scope.`,
      canonicalRole,
      canonicalBusinessId: targetBusinessId,
      canonicalBranchId: targetBranchId,
      isSelfTarget: false
    };
  }

  // Remaining management roles (DIRECTOR, HR_MANAGER, PAYROLL_MANAGER): self-only here unless explicit policy
  if (isSelf) {
    return {
      allowed: true,
      code: "ALLOWED",
      reason: `${canonicalRole} self attendance authorized.`,
      canonicalRole,
      canonicalBusinessId: targetBusinessId,
      canonicalBranchId: targetBranchId,
      isSelfTarget: true
    };
  }

  return {
    allowed: false,
    code: "FORBIDDEN_ATTENDANCE_ROLE",
    reason: `Role ${canonicalRole} cannot record attendance for another employee.`,
    canonicalRole,
    canonicalBusinessId: targetBusinessId,
    canonicalBranchId: targetBranchId,
    isSelfTarget: false
  };
}
