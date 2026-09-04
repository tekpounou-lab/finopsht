import { describe, it, expect } from "vitest";
import {
  FinopsException,
  validateOrThrow,
  sanitizeAndValidate,
  detectObsoleteFields,
  EmployeeIntegritySchema,
  InvoiceIntegritySchema,
  PayrollCycleIntegritySchema,
  AttendanceRecordIntegritySchema,
  LedgerTransactionIntegritySchema,
  BranchIntegritySchema,
  DepartmentIntegritySchema,
  BusinessIntegritySchema
} from "../../validations/integritySchemas";

describe("Phase 4: Schema Integrity, Validation & Security Rules Test Suite", () => {
  const TEST_BIZ_ID = "biz_enterprise_test_001";

  describe("1. Obsolete & Duplicate Field Detection", () => {
    it("should detect obsolete fields on an uncleaned employee payload", () => {
      const dirtyEmployee = {
        id: "emp_123",
        name: "Jean Baptiste",
        salaryBaseHtg: 50000,
        salary_base_htg: 50000,
        branch_id: "br_01",
        employee_name: "Jean Baptiste"
      };

      const detected = detectObsoleteFields("EMPLOYEE", dirtyEmployee);
      expect(detected).toContain("salaryBaseHtg");
      expect(detected).toContain("salary_base_htg");
      expect(detected).toContain("branch_id");
      expect(detected).toContain("employee_name");
      expect(detected.length).toBeGreaterThanOrEqual(4);
    });

    it("should detect obsolete fields on invoice payload", () => {
      const dirtyInvoice = {
        id: "inv_123",
        totalAmount: 1000,
        amountPaid: 500,
        isPaid: false,
        totalGrossHtg: 1000
      };

      const detected = detectObsoleteFields("INVOICE", dirtyInvoice);
      expect(detected).toContain("amountPaid");
      expect(detected).toContain("isPaid");
      expect(detected).toContain("totalGrossHtg");
    });

    it("should detect obsolete fields on payroll cycle payload", () => {
      const dirtyCycle = {
        id: "cycle_2026_03",
        name: "Mars 2026",
        totalGrossHtg: 500000,
        totalNetHtg: 420000
      };

      const detected = detectObsoleteFields("PAYROLL_CYCLE", dirtyCycle);
      expect(detected).toContain("totalGrossHtg");
      expect(detected).toContain("totalNetHtg");
    });
  });

  describe("2. Zod Schema Validation & FinopsException Enforcement", () => {
    it("should successfully validate a clean Employee record", () => {
      const cleanEmployee = {
        id: "emp_test_01",
        businessId: TEST_BIZ_ID,
        branchId: "br_main_01",
        departmentId: "dept_finance_01",
        name: "Marie Rose",
        email: "marie.rose@finops.com",
        role: "EMPLOYEE" as const,
        baseSalary: 65000,
        paymentModel: "FIXED" as const,
        status: "ACTIVE" as const,
        isActive: true,
        contractType: "cdi" as const,
        payRegime: "fixe" as const
      };

      const result = validateOrThrow(EmployeeIntegritySchema, cleanEmployee, "Employee");
      expect(result.id).toBe("emp_test_01");
      expect(result.baseSalary).toBe(65000);
      expect(result.businessId).toBe(TEST_BIZ_ID);
    });

    it("should throw FinopsException with 422 status on missing businessId (Multi-Tenancy Violation)", () => {
      const invalidEmployee = {
        id: "emp_bad_01",
        name: "No Business Employee",
        email: "bad@test.com",
        baseSalary: 40000
      };

      expect(() => {
        validateOrThrow(EmployeeIntegritySchema, invalidEmployee, "Employee");
      }).toThrow(FinopsException);

      try {
        validateOrThrow(EmployeeIntegritySchema, invalidEmployee, "Employee");
      } catch (err: any) {
        expect(err).toBeInstanceOf(FinopsException);
        expect(err.statusCode).toBe(422);
        expect(err.code).toBe("SCHEMA_VALIDATION_ERROR");
        expect(err.message).toContain("[Employee] Validation failed");
      }
    });

    it("should sanitize snake_case payload to canonical camelCase", () => {
      const snakePayload = {
        id: "br_001",
        business_id: TEST_BIZ_ID,
        name: "Succursale Cap-Haïtien",
        code: "CAP01",
        is_active: true
      };

      const sanitized = sanitizeAndValidate(BranchIntegritySchema, snakePayload, "Branch");
      expect(sanitized.id).toBe("br_001");
      expect(sanitized.businessId).toBe(TEST_BIZ_ID);
      expect(sanitized.name).toBe("Succursale Cap-Haïtien");
      expect(sanitized.isActive).toBe(true);
    });
  });

  describe("3. Accounting & General Ledger Double-Entry Rules", () => {
    it("should validate a balanced double-entry ledger transaction", () => {
      const validTx = {
        id: "tx_gl_1001",
        businessId: TEST_BIZ_ID,
        type: "INCOME" as const,
        amount: 25000,
        amountCents: 2500000,
        date: "2026-03-02",
        description: "Encaissement Facture Client INV-2026-001",
        category: "SALES",
        debitAccount: "1010_BANK_BNC",
        creditAccount: "4110_CLIENTS"
      };

      const result = validateOrThrow(LedgerTransactionIntegritySchema, validTx, "LedgerTransaction");
      expect(result.id).toBe("tx_gl_1001");
      expect(result.debitAccount).not.toBe(result.creditAccount);
    });

    it("should reject double-entry transaction when debit equals credit account", () => {
      const invalidTx = {
        id: "tx_bad_01",
        businessId: TEST_BIZ_ID,
        type: "TRANSFER" as const,
        amount: 5000,
        amountCents: 500000,
        date: "2026-03-02",
        description: "Invalid identical accounts",
        category: "INTERNAL",
        debitAccount: "1010_BANK_BNC",
        creditAccount: "1010_BANK_BNC" // Invalid! Identical accounts
      };

      expect(() => {
        validateOrThrow(LedgerTransactionIntegritySchema, invalidTx, "LedgerTransaction");
      }).toThrow(FinopsException);
    });
  });

  describe("4. Attendance & Workforce Validation", () => {
    it("should validate attendance record with check-in, real hours and variance", () => {
      const attendance = {
        id: "att_rec_20260302_01",
        businessId: TEST_BIZ_ID,
        employeeId: "emp_101",
        employeeName: "Pierre Richard",
        branchId: "br_01",
        date: "2026-03-02",
        checkIn: "07:55:00",
        checkOut: "17:00:00",
        plannedHours: 8,
        realHours: 9,
        variance: 1,
        status: "PRESENT" as const
      };

      const validated = validateOrThrow(AttendanceRecordIntegritySchema, attendance, "AttendanceRecord");
      expect(validated.variance).toBe(1);
      expect(validated.status).toBe("PRESENT");
    });
  });
});
