import { Role, Employee } from "../types";
import { ROLE_PERMISSIONS, RolePermissions } from "./role.permissions";

export interface ActorIdentity {
  id: string; // Employee ID or User ID
  role: Role;
  businessId?: string; // Associated business tenant
  business_id?: string;
  branchId?: string;
  departmentId?: string;
}

export interface ProtectedResource {
  businessId?: string; // Associated business tenant
  business_id?: string;
  employeeId?: string; // Owner of the resource
  branchId?: string;   // Associated branch
  departmentId?: string; // Associated department
}

/**
 * Enterprise AccessResolver V1
 * Enforces hierarchical context-aware RBAC and resource tenancy constraints.
 */
export const AccessResolver = {
  /**
   * Evaluate if an actor has global permission by role.
   */
  hasGlobalPermission(role: Role, permission: keyof RolePermissions): boolean {
    const perms = ROLE_PERMISSIONS[role];
    return perms ? !!perms[permission] : false;
  },

  /**
   * Enforces contextual tenancy matching:
   * - SUPER_ADMIN has sovereign global bypass across all businesses and resources.
   * - OWNER has full sovereign control strictly within their verified business tenant (cross-tenant denied).
   * - MANAGER has access if branchId matches actor's branchId within their tenant.
   * - SUPERVISOR has departmental/branch access within their tenant.
   * - EMPLOYEE can only access resources belonging directly to them (employeeId matches actor.id).
   */
  canAccessResource(actor: ActorIdentity, resource?: ProtectedResource | null): boolean {
    // 1. Super Admin possesses universal platform bypass
    if (actor.role === "SUPER_ADMIN") {
      return true;
    }

    // 2. Strict Fail-Closed Tenant Isolation:
    // Resource must exist and both actor and resource must possess a valid, non-empty matching businessId
    if (!resource) {
      return false;
    }

    const actorBiz = actor.businessId || actor.business_id;
    const resourceBiz = resource.businessId || resource.business_id;

    if (!actorBiz || !resourceBiz || actorBiz !== resourceBiz) {
      return false;
    }

    // 3. OWNER has full sovereign control strictly within their verified enterprise
    if (actor.role === "OWNER") {
      return true;
    }

    if (actor.role === "MANAGER") {
      if (!actor.branchId || !resource.branchId) return false;
      return actor.branchId === resource.branchId;
    }

    if (actor.role === "SUPERVISOR") {
      if (!actor.branchId || !resource.branchId) return false;
      const sameBranch = actor.branchId === resource.branchId;
      if (!sameBranch) return false;
      // Supervisors can only access resources if they are within their department or general branch telemetry
      if (actor.departmentId && resource.departmentId) {
        return actor.departmentId === resource.departmentId;
      }
      return true;
    }

    // Standard employee self-access rule
    if (actor.role === "EMPLOYEE") {
      return !!resource.employeeId && actor.id === resource.employeeId;
    }

    return false;
  },

  /**
   * Evaluate whether an actor can write/mutate an employee document.
   * Hierarchical rule:
   * - SUPER_ADMIN can mutate any profile platform-wide.
   * - OWNER can mutate any employee within their verified tenant (never other tenants, never SUPER_ADMIN).
   * - MANAGER can only mutate employees who:
   *   1. Are in the same branch within the tenant.
   *   2. Do not hold SUPER_ADMIN or OWNER role.
   *   3. Do not hold MANAGER role (managers cannot mutate other managers).
   * - SUPERVISOR & EMPLOYEE cannot mutate any employee documents.
   */
  canMutateEmployee(actor: ActorIdentity, target?: Employee | ActorIdentity | null): boolean {
    if (actor.role === "SUPER_ADMIN") {
      return true;
    }

    if (!target) {
      return false;
    }

    // Strict Fail-Closed Tenant Isolation: Both actor and target must possess a valid matching businessId
    const actorBiz = actor.businessId || actor.business_id;
    const targetBiz = (target as any).businessId || (target as any).business_id;
    if (!actorBiz || !targetBiz || actorBiz !== targetBiz) {
      return false;
    }

    // Non-superadmins can never mutate a SUPER_ADMIN
    if (target.role === "SUPER_ADMIN") {
      return false;
    }

    if (actor.role === "OWNER") {
      return true;
    }

    if (actor.role === "MANAGER") {
      // Must share the same branch
      if (!actor.branchId || !target.branchId) return false;
      if (actor.branchId !== target.branchId) return false;

      // Cannot mutate SuperAdmins, Owners or other Managers
      if ((target.role as string) === "SUPER_ADMIN" || target.role === "OWNER" || target.role === "MANAGER") {
        return false;
      }

      return true;
    }

    return false;
  },

  /**
   * Evaluate if an actor can prepare or edit payrolls for a target employee.
   */
  canManagePayrollFor(actor: ActorIdentity, target?: Employee | ActorIdentity | null): boolean {
    if (actor.role === "SUPER_ADMIN") {
      return true;
    }

    if (!target) {
      return false;
    }

    // Strict Fail-Closed Tenant Isolation: Both actor and target must possess a valid matching businessId
    const actorBiz = actor.businessId || actor.business_id;
    const targetBiz = (target as any).businessId || (target as any).business_id;
    if (!actorBiz || !targetBiz || actorBiz !== targetBiz) {
      return false;
    }

    if (actor.role === "OWNER") {
      return true;
    }

    if (!this.hasGlobalPermission(actor.role, "canManagePayroll")) {
      return false;
    }

    if (actor.role === "MANAGER") {
      // Local branch manager restriction
      if (!actor.branchId || !target.branchId) return false;
      return actor.branchId === target.branchId;
    }

    return false;
  }
};
