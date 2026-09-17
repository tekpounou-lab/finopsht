import { describe, it, expect } from "vitest";
import {
  OrganizationalDimensionResolver,
  RawImportRow
} from "../OrganizationalDimensionResolver";
import { Employee, Department, Branch } from "../../../../types";

describe("OrganizationalDimensionResolver", () => {
  const businessId = "biz_tech_corp";
  const otherBusinessId = "biz_other_corp";

  const mockBranches: Branch[] = [
    {
      id: "branch_delmas",
      code: "DELMAS",
      name: "Delmas Central",
      business_id: businessId,
      status: "ACTIVE"
    } as any,
    {
      id: "branch_petionville",
      code: "PV",
      name: "Pétion-Ville",
      business_id: businessId,
      status: "ACTIVE"
    } as any,
    {
      id: "branch_foreign",
      code: "FOREIGN",
      name: "Foreign Branch",
      business_id: otherBusinessId,
      status: "ACTIVE"
    } as any
  ];

  const mockDepartments: Department[] = [
    {
      id: "dept_it",
      code: "IT",
      name: "Information Technology",
      business_id: businessId,
      branch_id: "branch_delmas"
    } as any,
    {
      id: "dept_marketing",
      code: "MKTG",
      name: "Marketing & Growth",
      business_id: businessId,
      branch_id: "branch_petionville"
    } as any,
    {
      id: "dept_foreign",
      code: "FIT",
      name: "Foreign IT",
      business_id: otherBusinessId,
      branch_id: "branch_foreign"
    } as any
  ];

  const mockEmployees: Employee[] = [
    {
      id: "emp_jean_1",
      name: "Jean Dupont",
      email: "jean.dupont@tech.com",
      business_id: businessId,
      departmentId: "dept_it",
      branchId: "branch_delmas"
    } as any,
    {
      id: "emp_marie_1",
      name: "Marie Claire",
      email: "marie.claire@tech.com",
      business_id: businessId,
      departmentId: "dept_marketing",
      branchId: "branch_petionville"
    } as any,
    {
      id: "emp_dup_1",
      name: "Alex Joseph",
      email: "alex.j1@tech.com",
      business_id: businessId,
      departmentId: "dept_it",
      branchId: "branch_delmas"
    } as any,
    {
      id: "emp_dup_2",
      name: "Alex Joseph",
      email: "alex.j2@tech.com",
      business_id: businessId,
      departmentId: "dept_marketing",
      branchId: "branch_petionville"
    } as any,
    {
      id: "emp_foreign",
      name: "Foreign Worker",
      email: "foreign@other.com",
      business_id: otherBusinessId,
      departmentId: "dept_foreign",
      branchId: "branch_foreign"
    } as any
  ];

  describe("Resolution Hierarchy", () => {
    it("Level 1: Resolves by employee_id", () => {
      const row: RawImportRow = {
        date: "2026-05-01",
        type: "INCOME",
        amount: 5000,
        currency: "HTG",
        employee_id: "emp_jean_1"
      };

      const result = OrganizationalDimensionResolver.resolveRow(
        row,
        businessId,
        mockEmployees,
        mockDepartments,
        mockBranches
      );

      expect(result.isFinanciallyValid).toBe(true);
      expect(result.rhStatus).toBe("RESOLVED");
      expect(result.employeeId).toBe("emp_jean_1");
      expect(result.employeeName).toBe("Jean Dupont");
      // Deduces department and branch from RH
      expect(result.departmentId).toBe("dept_it");
      expect(result.branchId).toBe("branch_delmas");
    });

    it("Level 2: Resolves by email when employee_id is missing", () => {
      const row: RawImportRow = {
        date: "2026-05-01",
        type: "INCOME",
        amount: 2500,
        currency: "HTG",
        employee_email: "marie.claire@tech.com"
      };

      const result = OrganizationalDimensionResolver.resolveRow(
        row,
        businessId,
        mockEmployees,
        mockDepartments,
        mockBranches
      );

      expect(result.rhStatus).toBe("RESOLVED");
      expect(result.employeeId).toBe("emp_marie_1");
      expect(result.departmentId).toBe("dept_marketing");
      expect(result.branchId).toBe("branch_petionville");
    });

    it("Level 3: Resolves by single unambiguous employee name", () => {
      const row: RawImportRow = {
        date: "2026-05-01",
        type: "INCOME",
        amount: 1000,
        currency: "HTG",
        employee_name: "Jean Dupont"
      };

      const result = OrganizationalDimensionResolver.resolveRow(
        row,
        businessId,
        mockEmployees,
        mockDepartments,
        mockBranches
      );

      expect(result.rhStatus).toBe("RESOLVED");
      expect(result.employeeId).toBe("emp_jean_1");
      expect(result.departmentId).toBe("dept_it");
      expect(result.branchId).toBe("branch_delmas");
    });

    it("Flags AMBIGUOUS_EMPLOYEE_MATCH when multiple employees have the same name", () => {
      const row: RawImportRow = {
        date: "2026-05-01",
        type: "INCOME",
        amount: 1000,
        currency: "HTG",
        employee_name: "Alex Joseph"
      };

      const result = OrganizationalDimensionResolver.resolveRow(
        row,
        businessId,
        mockEmployees,
        mockDepartments,
        mockBranches
      );

      expect(result.isFinanciallyValid).toBe(true);
      expect(result.rhStatus).toBe("AMBIGUOUS_EMPLOYEE_MATCH");
      expect(result.candidateEmployees).toHaveLength(2);
      expect(result.employeeId).toBeUndefined();
    });

    it("Flags UNKNOWN_EMPLOYEE when employee cannot be found", () => {
      const row: RawImportRow = {
        date: "2026-05-01",
        type: "INCOME",
        amount: 1000,
        currency: "HTG",
        employee_name: "Nonexistent Employee"
      };

      const result = OrganizationalDimensionResolver.resolveRow(
        row,
        businessId,
        mockEmployees,
        mockDepartments,
        mockBranches
      );

      expect(result.isFinanciallyValid).toBe(true);
      expect(result.rhStatus).toBe("UNKNOWN_EMPLOYEE");
      expect(result.employeeId).toBeUndefined();
    });
  });

  describe("Department & Branch Consistency and Mismatch Detection", () => {
    it("Validates consistent department provided in CSV", () => {
      const row: RawImportRow = {
        date: "2026-05-01",
        type: "INCOME",
        amount: 5000,
        currency: "HTG",
        employee_id: "emp_jean_1",
        department_code: "IT"
      };

      const result = OrganizationalDimensionResolver.resolveRow(
        row,
        businessId,
        mockEmployees,
        mockDepartments,
        mockBranches
      );

      expect(result.rhStatus).toBe("RESOLVED");
      expect(result.departmentId).toBe("dept_it");
    });

    it("Flags DEPARTMENT_MISMATCH when CSV department contradicts RH Employee department", () => {
      const row: RawImportRow = {
        date: "2026-05-01",
        type: "INCOME",
        amount: 5000,
        currency: "HTG",
        employee_id: "emp_jean_1",
        department_code: "MKTG" // Jean is actually in IT!
      };

      const result = OrganizationalDimensionResolver.resolveRow(
        row,
        businessId,
        mockEmployees,
        mockDepartments,
        mockBranches
      );

      expect(result.rhStatus).toBe("DEPARTMENT_MISMATCH");
      expect(result.warnings.some((w) => w.includes("Incohérence département"))).toBe(true);
      expect(result.departmentId).toBe("dept_it"); // Preserves RH Master
    });

    it("Flags BRANCH_MISMATCH when CSV branch contradicts RH Department branch", () => {
      const row: RawImportRow = {
        date: "2026-05-01",
        type: "INCOME",
        amount: 5000,
        currency: "HTG",
        employee_id: "emp_jean_1",
        branch_code: "PV" // IT dept is in DELMAS!
      };

      const result = OrganizationalDimensionResolver.resolveRow(
        row,
        businessId,
        mockEmployees,
        mockDepartments,
        mockBranches
      );

      expect(result.rhStatus).toBe("BRANCH_MISMATCH");
      expect(result.warnings.some((w) => w.includes("Incohérence succursale"))).toBe(true);
      expect(result.branchId).toBe("branch_delmas"); // Preserves RH Master
    });
  });

  describe("Non-Employee Transactions & Default Protection", () => {
    it("Treats general expenses as NON_EMPLOYEE and financially valid", () => {
      const row: RawImportRow = {
        date: "2026-05-01",
        type: "EXPENSE",
        category: "RENT",
        description: "Loyer mensuel local commercial",
        amount: 50000,
        currency: "HTG",
        branch_code: "DELMAS"
      };

      const result = OrganizationalDimensionResolver.resolveRow(
        row,
        businessId,
        mockEmployees,
        mockDepartments,
        mockBranches
      );

      expect(result.isFinanciallyValid).toBe(true);
      expect(result.rhStatus).toBe("NON_EMPLOYEE");
      expect(result.employeeId).toBeUndefined();
      expect(result.branchId).toBe("branch_delmas");
    });

    it("NEVER falls back to primary branch if no branch/department/employee is provided", () => {
      const row: RawImportRow = {
        date: "2026-05-01",
        type: "EXPENSE",
        category: "FEES",
        description: "Frais bancaires généraux",
        amount: 120,
        currency: "USD"
      };

      const result = OrganizationalDimensionResolver.resolveRow(
        row,
        businessId,
        mockEmployees,
        mockDepartments,
        mockBranches
      );

      expect(result.isFinanciallyValid).toBe(true);
      expect(result.rhStatus).toBe("NON_EMPLOYEE");
      // MUST NOT be defaulted to any branch!
      expect(result.branchId).toBeUndefined();
      expect(result.branchName).toBeUndefined();
      expect(result.departmentId).toBeUndefined();
    });
  });

  describe("Tenant Isolation", () => {
    it("Cannot resolve employee belonging to another business_id", () => {
      const row: RawImportRow = {
        date: "2026-05-01",
        type: "INCOME",
        amount: 5000,
        currency: "HTG",
        employee_id: "emp_foreign"
      };

      const result = OrganizationalDimensionResolver.resolveRow(
        row,
        businessId,
        mockEmployees,
        mockDepartments,
        mockBranches
      );

      expect(result.rhStatus).toBe("UNKNOWN_EMPLOYEE");
      expect(result.employeeId).toBeUndefined();
    });

    it("Cannot resolve department or branch belonging to another business_id", () => {
      const row: RawImportRow = {
        date: "2026-05-01",
        type: "EXPENSE",
        amount: 5000,
        currency: "HTG",
        department_code: "FIT",
        branch_code: "FOREIGN"
      };

      const result = OrganizationalDimensionResolver.resolveRow(
        row,
        businessId,
        mockEmployees,
        mockDepartments,
        mockBranches
      );

      expect(result.departmentId).toBeUndefined();
      expect(result.branchId).toBeUndefined();
    });
  });

  describe("Validation Report Generation", () => {
    it("Computes accurate metrics and classifications", () => {
      const rows: RawImportRow[] = [
        { date: "2026-05-01", type: "INCOME", amount: 100, employee_id: "emp_jean_1" }, // RESOLVED
        { date: "2026-05-01", type: "EXPENSE", amount: 200 }, // NON_EMPLOYEE
        { date: "2026-05-01", type: "INCOME", amount: 300, employee_name: "Ghost" }, // UNKNOWN_EMPLOYEE
        { date: "2026-05-01", type: "INCOME", amount: 400, employee_name: "Alex Joseph" }, // AMBIGUOUS
        { date: "2026-05-01", type: "INCOME", amount: 500, employee_id: "emp_jean_1", department_code: "MKTG" }, // DEPT MISMATCH
        { date: "2026-05-01", type: "EXPENSE", amount: -50 } // FINANCIALLY INVALID
      ];

      const resolved = rows.map((r, i) =>
        OrganizationalDimensionResolver.resolveRow(
          r,
          businessId,
          mockEmployees,
          mockDepartments,
          mockBranches,
          i
        )
      );

      const report = OrganizationalDimensionResolver.generateValidationReport(resolved);

      expect(report.totalAnalyzed).toBe(6);
      expect(report.financiallyValidCount).toBe(5);
      expect(report.financiallyInvalidCount).toBe(1);
      expect(report.rhResolvedCount).toBe(1);
      expect(report.nonEmployeeCount).toBe(1);
      expect(report.unknownEmployeesCount).toBe(1);
      expect(report.ambiguousEmployeesCount).toBe(1);
      expect(report.departmentMismatchCount).toBe(1);
      expect(report.unknownEmployees).toContain("Ghost");
      expect(report.ambiguousMatches[0].rawName).toBe("Alex Joseph");
    });
  });
});
