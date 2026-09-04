import { Role, Employee } from "../types";
import { ROLE_PERMISSIONS, RolePermissions } from "./role.permissions";

export interface ActorIdentity {
  id: string; // Employee ID
  role: Role;
  branchId?: string;
  departmentId?: string;
}

export interface ProtectedResource {
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
   * - OWNER has full sovereign bypass on all resources within their business.
   * - MANAGER has access if branchId matches actor's branchId.
   * - EMPLOYEE can only access resources belonging directly to them (employeeId matches actor.id).
   */
  canAccessResource(actor: ActorIdentity, resource: ProtectedResource): boolean {
    if (actor.role === "SUPER_ADMIN" || actor.role === "OWNER") {
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
   * - OWNER can mutate any employee.
   * - MANAGER can only mutate employees who:
   *   1. Are in the same branch.
   *   2. Do not hold OWNER role.
   *   3. Do not hold MANAGER role (managers cannot mutate other managers).
   * - SUPERVISOR & EMPLOYEE cannot mutate any employee documents.
   */
  canMutateEmployee(actor: ActorIdentity, target: Employee | ActorIdentity): boolean {
    if (actor.role === "SUPER_ADMIN" || actor.role === "OWNER") {
      return true;
    }

    if (actor.role === "MANAGER") {
      // Must share the same branch
      if (!actor.branchId || !target.branchId) return false;
      if (actor.branchId !== target.branchId) return false;

      // Cannot mutate SuperAdmins, Owners or other Managers
      if (target.role === "SUPER_ADMIN" || target.role === "OWNER" || target.role === "MANAGER") {
        return false;
      }

      return true;
    }

    return false;
  },

  /**
   * Evaluate if an actor can prepare or edit payrolls for a target employee.
   */
  canManagePayrollFor(actor: ActorIdentity, target: Employee | ActorIdentity): boolean {
    if (actor.role === "SUPER_ADMIN" || actor.role === "OWNER") {
      return true;
    }

    if (!this.hasGlobalPermission(actor.role, "canManagePayroll")) {
      return false;
    }

    if (actor.role === "MANAGER") {
      // Local branch manager restriction
      return actor.branchId === target.branchId;
    }

    return false;
  }
};
