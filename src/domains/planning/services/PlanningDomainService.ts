import { Employee } from "../../../types";
import { EmployeeRepository } from "../../../repositories/EmployeeRepository";

export class PlanningDomainService {
  /**
   * Returns all employees that can be scheduled for shifts.
   * OWNER role is excluded from operational planning.
   */
  static getSchedulableEmployees(employees: Employee[], currentBusinessId: string): Employee[] {
    return employees.filter((e) => {
      // Must belong to current business
      if (e.business_id !== currentBusinessId) return false;
      // OWNER should not appear as an operational employee in planning
      if (e.role === 'OWNER') return false;
      return true;
    });
  }

  /**
   * Validates if a shift can be assigned to an employee.
   * Prevents assigning shifts to non-schedulable roles like OWNER.
   */
  static validateShiftAssignment(employee: Employee | undefined): void {
    if (!employee) {
      throw new Error("Employee not found for shift assignment.");
    }
    if (employee.role === 'OWNER') {
      throw new Error("Les propriétaires (OWNER) ne peuvent pas être assignés à des shifts opérationnels.");
    }
  }

  /**
   * Validates if a shift can be assigned to an employee by ID (async).
   */
  static async validateShiftAssignmentById(employeeId: string): Promise<void> {
    const employee = await EmployeeRepository.getById(employeeId);
    this.validateShiftAssignment(employee || undefined);
  }

  /**
   * Filters shifts based on the actor's role and authorized scope (RBAC visibility rules).
   */
  static filterVisibleShifts(
    shifts: any[],
    actor: { id: string; role: string; branchId?: string; departmentId?: string },
    employees: Employee[]
  ): any[] {
    const role = (actor.role || "EMPLOYEE").toUpperCase();

    // 1. OWNER / SUPER_ADMIN has full planning visibility
    if (role === "OWNER" || role === "SUPER_ADMIN") {
      return shifts;
    }

    // 2. MANAGER has full planning in authorized scope (same branch)
    if (role === "MANAGER") {
      if (!actor.branchId) return [];
      return shifts.filter(s => {
        if (s.branchId && s.branchId === actor.branchId) return true;
        const emp = employees.find(e => e.id === s.employeeId);
        return emp && emp.branchId === actor.branchId;
      });
    }

    // 3. SUPERVISOR has planning only for supervised employees
    if (role === "SUPERVISOR") {
      const supervisedIds = new Set(
        employees.filter(e => {
          if (e.id === actor.id) return true;
          if (e.managerId && e.managerId === actor.id) return true;
          if (e.departmentId && e.departmentId === actor.departmentId && e.id !== actor.id) return true;
          return false;
        }).map(e => e.id)
      );
      return shifts.filter(s => supervisedIds.has(s.employeeId));
    }

    // 4. EMPLOYEE has only own planning
    if (role === "EMPLOYEE") {
      return shifts.filter(s => s.employeeId === actor.id);
    }

    return [];
  }

  /**
   * Resolves whether an actor has write/manage permissions for a target employee's shift.
   */
  static canManageShiftFor(
    actor: { id: string; role: string; branchId?: string; departmentId?: string },
    targetEmployee: Employee | undefined
  ): boolean {
    const role = (actor.role || "EMPLOYEE").toUpperCase();

    if (role === "OWNER" || role === "SUPER_ADMIN") {
      return true;
    }

    if (role === "MANAGER") {
      if (!targetEmployee) return false;
      if (targetEmployee.role === "OWNER" || targetEmployee.role === "MANAGER") return false;
      return actor.branchId === targetEmployee.branchId;
    }

    if (role === "SUPERVISOR") {
      if (!targetEmployee) return false;
      const isSupervised = targetEmployee.id === actor.id ||
        (targetEmployee.managerId && targetEmployee.managerId === actor.id) ||
        (targetEmployee.departmentId && targetEmployee.departmentId === actor.departmentId && targetEmployee.id !== actor.id);
      return !!isSupervised;
    }

    return false;
  }
}
