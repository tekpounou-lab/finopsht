import { Employee, EmployeeDepartmentAssignment, Department } from "../../../types";

export interface AssignmentValidationResult {
  isValid: boolean;
  errors: string[];
}

export class DepartmentAssignmentEngine {
  /**
   * Retrieves the Primary Department ID for an employee.
   * Priority:
   * 1. Primary entry in `emp.departmentAssignments` where `primary === true` and `status === "ACTIVE"`
   * 2. `emp.primaryDepartmentId`
   * 3. Legacy `emp.departmentId` or `(emp as any).department_id`
   */
  public static getPrimaryDepartmentId(employee: Employee): string | undefined {
    if (employee.departmentAssignments && Array.isArray(employee.departmentAssignments)) {
      const activeAssignments = employee.departmentAssignments.filter(a => a.status === "ACTIVE" || !a.status);
      const primary = activeAssignments.find(a => a.primary);
      if (primary) return primary.department_id;
    }

    if (employee.primaryDepartmentId) return employee.primaryDepartmentId;
    if (employee.departmentId) return employee.departmentId;
    if ((employee as any).department_id) return (employee as any).department_id;

    return undefined;
  }

  /**
   * Gets all active department assignments for an employee.
   * If `departmentAssignments` is empty or missing, synthesizes a primary assignment from `departmentId`.
   */
  public static getActiveAssignments(employee: Employee): EmployeeDepartmentAssignment[] {
    if (employee.departmentAssignments && employee.departmentAssignments.length > 0) {
      const active = employee.departmentAssignments.filter(a => a.status === "ACTIVE" || !a.status);
      if (active.length > 0) return active;
    }

    const primaryDeptId = this.getPrimaryDepartmentId(employee);
    if (!primaryDeptId) return [];

    return [{
      id: `assign_${employee.id}_${primaryDeptId}`,
      employee_id: employee.id,
      department_id: primaryDeptId,
      primary: true,
      allocation_percentage: 100,
      status: "ACTIVE"
    }];
  }

  /**
   * Validates a list of employee department assignments according to enterprise rules:
   * - Exactly 1 Primary Department
   * - Allocation percentages sum to 100% (with ±0.1 rounding tolerance)
   * - No duplicate department assignments for the same employee
   */
  public static validateAssignments(assignments: EmployeeDepartmentAssignment[]): AssignmentValidationResult {
    const errors: string[] = [];

    if (!assignments || assignments.length === 0) {
      return { isValid: false, errors: ["L'employé doit être assigné à au moins un département."] };
    }

    const activeAssignments = assignments.filter(a => a.status === "ACTIVE" || !a.status);
    if (activeAssignments.length === 0) {
      return { isValid: false, errors: ["Aucune affectation de département active trouvée."] };
    }

    const primaryCount = activeAssignments.filter(a => a.primary).length;
    if (primaryCount === 0) {
      errors.push("L'employé doit avoir exactement un Département Principal.");
    } else if (primaryCount > 1) {
      errors.push("Un employé ne peut pas avoir plusieurs Départements Principaux simultanément.");
    }

    const totalAllocation = activeAssignments.reduce((sum, a) => sum + (Number(a.allocation_percentage) || 0), 0);
    if (Math.abs(totalAllocation - 100) > 0.1) {
      errors.push(`La somme des allocations de département doit être égale à 100% (actuellement : ${totalAllocation.toFixed(1)}%).`);
    }

    const deptSet = new Set<string>();
    for (const a of activeAssignments) {
      if (deptSet.has(a.department_id)) {
        errors.push(`Avertissement : Le département ID "${a.department_id}" est assigné plusieurs fois.`);
      }
      deptSet.add(a.department_id);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Sets or updates an employee's Primary Department, adjusting allocations automatically.
   */
  public static setPrimaryDepartment(employee: Employee, newPrimaryDepartmentId: string): Employee {
    const currentAssignments = this.getActiveAssignments(employee);
    let updatedAssignments: EmployeeDepartmentAssignment[] = [];

    const existingIndex = currentAssignments.findIndex(a => a.department_id === newPrimaryDepartmentId);

    if (existingIndex >= 0) {
      // Mark as primary, unmark others
      updatedAssignments = currentAssignments.map((a, idx) => ({
        ...a,
        primary: idx === existingIndex
      }));
    } else {
      // Create new primary assignment
      const newPrimaryAssignment: EmployeeDepartmentAssignment = {
        id: `assign_${employee.id}_${newPrimaryDepartmentId}_${Date.now()}`,
        employee_id: employee.id,
        department_id: newPrimaryDepartmentId,
        primary: true,
        allocation_percentage: currentAssignments.length === 0 ? 100 : 50,
        status: "ACTIVE"
      };

      // Unmark existing primaries and recalculate
      const secondaryAssignments = currentAssignments.map(a => ({
        ...a,
        primary: false,
        allocation_percentage: currentAssignments.length === 0 ? 0 : Math.floor(50 / currentAssignments.length)
      }));

      updatedAssignments = [newPrimaryAssignment, ...secondaryAssignments];
    }

    return {
      ...employee,
      departmentId: newPrimaryDepartmentId,
      primaryDepartmentId: newPrimaryDepartmentId,
      departmentAssignments: updatedAssignments
    };
  }

  /**
   * Calculates weighted allocation splits for an amount across an employee's assigned departments.
   * Useful for payroll engine, revenue allocation, and cost center accounting.
   */
  public static calculateAmountAllocations(employee: Employee, totalAmount: number): Array<{ departmentId: string; amount: number; percentage: number; isPrimary: boolean }> {
    const assignments = this.getActiveAssignments(employee);
    if (assignments.length === 0) return [];

    return assignments.map(a => ({
      departmentId: a.department_id,
      amount: (totalAmount * a.allocation_percentage) / 100,
      percentage: a.allocation_percentage,
      isPrimary: a.primary
    }));
  }
}
