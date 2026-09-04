import { Branch, Department, Employee } from "../types";
import { DepartmentAliasEngine } from "../domains/organization/services/DepartmentAliasEngine";

export const ReferenceResolver = {
  /**
   * Resolves a branch by code, name, or direct ID.
   */
  resolveBranch(branches: Branch[], query: string | undefined): Branch | undefined {
    if (!query || typeof query !== "string") return undefined;
    const q = query.trim().toUpperCase();
    if (!branches || !Array.isArray(branches)) return undefined;
    return branches.find(
      b => (b && b.code && typeof b.code === "string" && b.code.trim().toUpperCase() === q) || 
           (b && b.name && typeof b.name === "string" && b.name.trim().toUpperCase() === q) || 
           (b && b.id && String(b.id).trim() === query.trim())
    );
  },

  /**
   * Resolves a department by code, name, direct ID, or registered/canonical alias using DepartmentAliasEngine SSOT.
   */
  resolveDepartment(departments: Department[], query: string | undefined): Department | undefined {
    return DepartmentAliasEngine.resolveDepartment(departments, query);
  },

  /**
   * Resolves an employee by email, name, or direct ID.
   */
  resolveEmployee(employees: Employee[], query: string | undefined): Employee | undefined {
    if (!query || typeof query !== "string") return undefined;
    const q = query.trim().toLowerCase();
    if (!employees || !Array.isArray(employees)) return undefined;
    return employees.find(
      e => (e && e.email && typeof e.email === "string" && e.email.trim().toLowerCase() === q) || 
           (e && e.name && typeof e.name === "string" && e.name.trim().toLowerCase() === q) || 
           (e && e.id && String(e.id).trim() === query.trim())
    );
  },

  /**
   * Resolves an employee with confidence scoring and multi-match tracking.
   */
  resolveEmployeeWithConfidence(
    query: string | undefined, 
    employees: Employee[]
  ): { employee: Employee | null; confidence: number; matches: Employee[] } {
    if (!query || !employees || employees.length === 0) {
      return { employee: null, confidence: 0, matches: [] };
    }

    const q = query.trim().toLowerCase();
    const qRaw = query.trim();

    // 1. Check direct ID matches (100%)
    const idMatches = employees.filter(e => e.id === qRaw);
    if (idMatches.length > 0) {
      return { employee: idMatches[0], confidence: 1.0, matches: idMatches };
    }

    // 2. Check email matches (95%)
    const emailMatches = employees.filter(
      e => e.email && e.email.trim().toLowerCase() === q
    );
    if (emailMatches.length > 0) {
      return { employee: emailMatches[0], confidence: 0.95, matches: emailMatches };
    }

    // 3. Check exact full name matches (70%)
    const fullNameMatches = employees.filter(
      e => e.name && e.name.trim().toLowerCase() === q
    );
    if (fullNameMatches.length > 0) {
      if (fullNameMatches.length > 1) {
        console.warn(`[ReferenceResolver] Ambiguous full name matches for query "${query}":`, fullNameMatches.map(e => e.name));
      }
      return { employee: fullNameMatches[0], confidence: 0.70, matches: fullNameMatches };
    }

    // 4. Check partial name matches (50%)
    const partialMatches = employees.filter(e => {
      if (!e.name) return false;
      const nameLower = e.name.trim().toLowerCase();
      return nameLower.includes(q) || q.includes(nameLower);
    });

    if (partialMatches.length > 0) {
      if (partialMatches.length > 1) {
        console.warn(`[ReferenceResolver] Ambiguous partial name matches for query "${query}":`, partialMatches.map(e => e.name));
      }
      return { employee: partialMatches[0], confidence: 0.50, matches: partialMatches };
    }

    return { employee: null, confidence: 0, matches: [] };
  },

  /**
   * Resolves an employee strictly, throwing if multiple matches exist at the highest resolved priority.
   */
  resolveEmployeeStrict(query: string | undefined, employees: Employee[]): Employee | null {
    const res = this.resolveEmployeeWithConfidence(query, employees);
    if (res.matches.length > 1) {
      throw new Error(`Multiple employee matches found for query "${query}": ${res.matches.map(e => e.name).join(", ")}`);
    }
    return res.employee;
  }
};
