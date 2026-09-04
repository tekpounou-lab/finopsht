import { Employee } from "../../types";

/**
 * Single source of truth for employee eligibility rules in FINOPS ERP.
 * Decision-makers (OWNER, SUPER_ADMIN) are excluded from operational workforce metrics,
 * performance rankings, productivity scores, headcount performance KPIs, and AI recommendations.
 */
export class EmployeeEligibilityService {
  /**
   * Evaluates if an employee record represents an operational employee.
   * Returns false for Owners and Super Admins.
   */
  public static isOperationalEmployee(employee: Partial<Employee> | null | undefined): boolean {
    if (!employee) return false;

    const role = (employee.role || "").toString().toUpperCase();
    if (role === "OWNER" || role === "SUPER_ADMIN" || role === "PROPRIETAIRE") {
      return false;
    }

    if ((employee as any).isOwner === true || (employee as any).is_owner === true) {
      return false;
    }

    const position = (employee.position || "").toString().toLowerCase();
    if (position === "owner" || position.includes("propriétaire") || position.includes("proprietaire")) {
      if (role === "OWNER" || role === "UNASSIGNED" || !role) {
        return false;
      }
    }

    return true;
  }

  /**
   * Filters a list of employee objects, returning only operational employees.
   */
  public static filterOperationalEmployees<T extends Partial<Employee>>(employees: T[] | null | undefined): T[] {
    if (!employees || !Array.isArray(employees)) return [];
    return employees.filter((emp) => this.isOperationalEmployee(emp));
  }

  /**
   * Checks whether a given employeeId belongs to an operational employee in a provided lookup list.
   */
  public static isOperationalEmployeeId(employeeId: string, employees: Partial<Employee>[]): boolean {
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return true;
    return this.isOperationalEmployee(emp);
  }
}

export const isOperationalEmployee = EmployeeEligibilityService.isOperationalEmployee.bind(EmployeeEligibilityService);
export const filterOperationalEmployees = EmployeeEligibilityService.filterOperationalEmployees.bind(EmployeeEligibilityService);
