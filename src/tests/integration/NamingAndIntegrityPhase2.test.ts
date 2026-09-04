/**
 * FINOPS ERP — Phase 2 Verification & Integration Tests
 * 
 * Validates:
 * 2.1 Uniform Naming (snake_case in Firestore <-> camelCase in TypeScript).
 * 2.2 Referential Integrity Validation (Validating businessId, departmentId, employeeId, branchId existence before write).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { 
  toCamelCase, 
  toSnakeCase, 
  mapBranch, 
  mapDepartment, 
  mapEmployee, 
  mapAttendanceRecord 
} from "../../utils/caseConverter";
import { 
  IntegrityValidator, 
  ForeignKeyIntegrityViolationError 
} from "../../services/integrity/ForeignKeyIntegrityValidator";

const docStore = new Map<string, any>();

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    collection: vi.fn((_db: any, ...pathSegments: string[]) => ({ path: pathSegments.join("/") })),
    doc: vi.fn((_db: any, ...pathSegments: string[]) => ({ path: pathSegments.join("/") })),
    setDoc: vi.fn(async (docRef: any, data: any) => {
      docStore.set(docRef.path, { ...data });
    }),
    getDoc: vi.fn(async (docRef: any) => {
      const data = docStore.get(docRef.path);
      return {
        exists: () => !!data,
        data: () => data,
        id: docRef.path.split("/").pop()
      };
    }),
    updateDoc: vi.fn(async (docRef: any, updates: any) => {
      const existing = docStore.get(docRef.path) || {};
      docStore.set(docRef.path, { ...existing, ...updates });
    }),
    getDocs: vi.fn(async (queryOrCol: any) => {
      const path = queryOrCol.path || "";
      const results: any[] = [];
      docStore.forEach((value, key) => {
        if (key.startsWith(path) || (queryOrCol._businessId && (value.business_id === queryOrCol._businessId || value.businessId === queryOrCol._businessId))) {
          results.push({
            id: key.split("/").pop(),
            ref: { path: key },
            data: () => value
          });
        }
      });
      return {
        docs: results,
        empty: results.length === 0,
        forEach: (cb: any) => results.forEach(cb)
      };
    }),
    query: vi.fn((colRef: any) => ({ path: colRef.path })),
    where: vi.fn((field: string, op: string, value: any) => ({ field, op, value })),
    orderBy: vi.fn(() => ({})),
    serverTimestamp: vi.fn(() => new Date().toISOString()),
    GeoPoint: vi.fn((lat: number, lng: number) => ({ latitude: lat, longitude: lng }))
  };
});

describe("Phase 2.1: Case Conversion & Naming Uniformity (snake_case <-> camelCase)", () => {
  it("should convert deep snake_case Firestore documents to clean camelCase objects", () => {
    const rawFirestoreDoc = {
      business_id: "biz_enterprise_1",
      branch_id: "br_delmas_01",
      created_at: "2026-03-01T10:00:00Z",
      contact_info: {
        phone_number: "+509 3700 0000",
        postal_code: "HT6110"
      },
      is_active: true
    };

    const converted = toCamelCase<any>(rawFirestoreDoc);

    expect(converted.businessId).toBe("biz_enterprise_1");
    expect(converted.branchId).toBe("br_delmas_01");
    expect(converted.createdAt).toBe("2026-03-01T10:00:00Z");
    expect(converted.contactInfo.phoneNumber).toBe("+509 3700 0000");
    expect(converted.contactInfo.postalCode).toBe("HT6110");
    expect(converted.isActive).toBe(true);
  });

  it("should convert camelCase domain models to snake_case for Firestore writes", () => {
    const domainEntity = {
      businessId: "biz_enterprise_1",
      departmentId: "dept_finance_01",
      updatedAt: "2026-03-01T12:00:00Z",
      salaryBaseHtg: 85000,
      isActive: true
    };

    const snake = toSnakeCase<any>(domainEntity);

    expect(snake.business_id).toBe("biz_enterprise_1");
    expect(snake.department_id).toBe("dept_finance_01");
    expect(snake.updated_at).toBe("2026-03-01T12:00:00Z");
    expect(snake.salary_base_htg).toBe(85000);
    expect(snake.is_active).toBe(true);
  });

  it("should correctly map Employee entity preserving both camelCase and backward compatibility properties", () => {
    const rawEmployee = {
      id: "emp_1001",
      name: "Jean-Baptiste Duval",
      business_id: "biz_test_01",
      branch_id: "branch_cap_01",
      department_id: "dept_logistics_01",
      is_active: true,
      salary_base_htg: 75000,
      base_salary: 75000
    };

    const mapped = mapEmployee<any>(rawEmployee);

    expect(mapped.id).toBe("emp_1001");
    expect(mapped.businessId).toBe("biz_test_01");
    expect(mapped.business_id).toBe("biz_test_01");
    expect(mapped.branchId).toBe("branch_cap_01");
    expect(mapped.branch_id).toBe("branch_cap_01");
    expect(mapped.departmentId).toBe("dept_logistics_01");
    expect(mapped.department_id).toBe("dept_logistics_01");
    expect(mapped.isActive).toBe(true);
    expect(mapped.salaryBaseHtg).toBe(75000);
  });

  it("should map AttendanceRecord cleanly with robust date, session, and status defaults", () => {
    const rawAttendance = {
      id: "att_001",
      business_id: "biz_test_01",
      employee_id: "emp_1001",
      branch_id: "br_01",
      date: "2026-03-01",
      check_in: "08:00",
      check_out: "17:00",
      total_hours: 9,
      regular_hours: 8,
      overtime_hours: 1,
      is_unplanned: false,
      status: "PRESENT"
    };

    const record = mapAttendanceRecord<any>(rawAttendance);

    expect(record.id).toBe("att_001");
    expect(record.businessId).toBe("biz_test_01");
    expect(record.employeeId).toBe("emp_1001");
    expect(record.checkIn).toBe("08:00");
    expect(record.checkOut).toBe("17:00");
    expect(record.totalHours).toBe(9);
    expect(record.overtimeHours).toBe(1);
    expect(record.status).toBe("PRESENT");
  });
});

describe("Phase 2.2: Referential & Foreign Key Integrity Validator", () => {
  beforeEach(() => {
    docStore.clear();
    IntegrityValidator.clearCache();

    // Seed mock database records
    docStore.set("businesses/biz_valid", { id: "biz_valid", name: "Valid Enterprise", status: "ACTIVE" });
    docStore.set("branches/br_valid", { id: "br_valid", business_id: "biz_valid", name: "Central Branch" });
    docStore.set("departments/dept_valid", { id: "dept_valid", business_id: "biz_valid", branch_id: "br_valid", name: "Engineering" });
    docStore.set("employees/emp_valid", { id: "emp_valid", business_id: "biz_valid", name: "Alice Smith", status: "ACTIVE", isActive: true });
  });

  it("should pass validation when all foreign keys exist and belong to the correct tenant", async () => {
    await expect(IntegrityValidator.validateBusinessExists("biz_valid")).resolves.not.toThrow();
    await expect(IntegrityValidator.validateBranchExists("biz_valid", "br_valid")).resolves.not.toThrow();
    await expect(IntegrityValidator.validateDepartmentExists("biz_valid", "dept_valid")).resolves.not.toThrow();
    await expect(IntegrityValidator.validateEmployeeExists("biz_valid", "emp_valid")).resolves.not.toThrow();
  });

  it("should throw ForeignKeyIntegrityViolationError when a referenced business does not exist", async () => {
    await expect(IntegrityValidator.validateBusinessExists("biz_non_existent"))
      .rejects
      .toThrow(ForeignKeyIntegrityViolationError);
  });

  it("should throw ForeignKeyIntegrityViolationError when a department references a non-existent branch", async () => {
    await expect(IntegrityValidator.validateDepartmentExists("biz_valid", "dept_ghost"))
      .rejects
      .toThrow(ForeignKeyIntegrityViolationError);
  });

  it("should throw ForeignKeyIntegrityViolationError when an employee references a non-existent employee ID", async () => {
    await expect(IntegrityValidator.validateEmployeeExists("biz_valid", "emp_ghost"))
      .rejects
      .toThrow(ForeignKeyIntegrityViolationError);
  });

  it("should validate entity foreign keys comprehensively before write", async () => {
    const validDepartmentData = {
      name: "New Department",
      branchId: "br_valid",
      managerId: "emp_valid"
    };

    await expect(
      IntegrityValidator.validateEntityForeignKeys("biz_valid", validDepartmentData, "DEPARTMENT")
    ).resolves.not.toThrow();

    const invalidDepartmentData = {
      name: "Bad Department",
      branchId: "br_non_existent",
      managerId: "emp_valid"
    };

    await expect(
      IntegrityValidator.validateEntityForeignKeys("biz_valid", invalidDepartmentData, "DEPARTMENT")
    ).rejects.toThrow(ForeignKeyIntegrityViolationError);
  });
});
