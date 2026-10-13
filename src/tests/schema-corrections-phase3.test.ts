/**
 * FINOPS ERP — Phase 3 Schema Corrections & Multi-Tenant Security Tests
 */
import { PayrollService } from "../services/payroll/PayrollService";
import { PayrollRepository } from "../repositories/PayrollRepository";
import { LedgerRepository } from "../repositories/LedgerRepository";
import { AnalyticsSnapshotRepository } from "../repositories/AnalyticsRepository";
import { Employee, PayrollCycle, LedgerTransaction } from "../types";

declare const describe: any, it: any, expect: any;

describe("Phase 3 Schema Corrections & Integrity Suite", () => {
  const targetBusinessId = "biz_company_alpha";
  const foreignBusinessId = "biz_company_beta";

  const sampleCycle: PayrollCycle = {
    id: "cyc_2026_10",
    business_id: targetBusinessId,
    cycleName: "Paie Octobre 2026",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    status: "DRAFT",
    recordsCount: 0,
    excludedEmployeeIds: [],
  };

  it("1. Allows employee belonging to the correct tenant", async () => {
    const validEmp: Employee = {
      id: "emp_valid_1",
      business_id: targetBusinessId,
      businessId: targetBusinessId,
      branchId: "br_main",
      departmentId: "dept_hr",
      name: "Alice Valid",
      email: "alice@alpha.com",
      role: "EMPLOYEE",
      baseSalary: 100000,
      paymentModel: "FIXED",
      status: "ACTIVE",
    };

    const records = await PayrollService.processPayrollCycle(
      sampleCycle,
      [validEmp],
      targetBusinessId
    );

    expect(records.length).toBe(1);
    expect(records[0].employeeId).toBe("emp_valid_1");
  });

  it("2. Excludes employee belonging to a different tenant", async () => {
    const foreignEmp: Employee = {
      id: "emp_foreign_1",
      business_id: foreignBusinessId,
      businessId: foreignBusinessId,
      branchId: "br_main",
      departmentId: "dept_hr",
      name: "Bob Foreign",
      email: "bob@beta.com",
      role: "EMPLOYEE",
      baseSalary: 100000,
      paymentModel: "FIXED",
      status: "ACTIVE",
    };

    const records = await PayrollService.processPayrollCycle(
      sampleCycle,
      [foreignEmp],
      targetBusinessId
    );

    expect(records.length).toBe(0);
  });

  it("3. Excludes employee missing a tenant ID", async () => {
    const noTenantEmp: Employee = {
      id: "emp_notenant_1",
      branchId: "br_main",
      departmentId: "dept_hr",
      name: "Charlie NoTenant",
      email: "charlie@unknown.com",
      role: "EMPLOYEE",
      baseSalary: 100000,
      paymentModel: "FIXED",
      status: "ACTIVE",
    } as any;

    const records = await PayrollService.processPayrollCycle(
      sampleCycle,
      [noTenantEmp],
      targetBusinessId
    );

    expect(records.length).toBe(0);
  });

  it("4. Excludes employee with contradictory tenant IDs", async () => {
    const contradictoryEmp: Employee = {
      id: "emp_contradictory_1",
      business_id: targetBusinessId,
      businessId: foreignBusinessId, // Contradictory!
      branchId: "br_main",
      departmentId: "dept_hr",
      name: "David Contradictory",
      email: "david@conflict.com",
      role: "EMPLOYEE",
      baseSalary: 100000,
      paymentModel: "FIXED",
      status: "ACTIVE",
    };

    const records = await PayrollService.processPayrollCycle(
      sampleCycle,
      [contradictoryEmp],
      targetBusinessId
    );

    expect(records.length).toBe(0);
  });

  it("5 & 6. LedgerRepository rejects transactions without tenant or with 'biz_default'", async () => {
    const invalidTx1: LedgerTransaction = {
      id: "tx_invalid_1",
      date: "2026-10-11",
      description: "Transaction test sans tenant",
      amount: 5000,
      type: "EXPENSE",
      status: "POSTED",
      debit_account: "6110",
      credit_account: "5120",
    } as any;

    await expect(LedgerRepository.save(invalidTx1)).rejects.toThrow(
      /MultiTenancyViolation/
    );

    const invalidTx2: LedgerTransaction = {
      id: "tx_invalid_2",
      business_id: "biz_default",
      date: "2026-10-11",
      description: "Transaction test biz_default",
      amount: 5000,
      type: "EXPENSE",
      status: "POSTED",
      debit_account: "6110",
      credit_account: "5120",
    } as any;

    await expect(LedgerRepository.save(invalidTx2)).rejects.toThrow(
      /MultiTenancyViolation/
    );
  });

  it("7. LedgerRepository rejects transaction with contradictory tenant IDs", async () => {
    const conflictTx: LedgerTransaction = {
      id: "tx_conflict_1",
      business_id: targetBusinessId,
      businessId: foreignBusinessId,
      date: "2026-10-11",
      description: "Transaction avec tenants contradictoires",
      amount: 5000,
      type: "EXPENSE",
      status: "POSTED",
      debit_account: "6110",
      credit_account: "5120",
    } as any;

    await expect(LedgerRepository.save(conflictTx)).rejects.toThrow(
      /MultiTenancyViolation/
    );
  });

  it("8. Validates employee contracts for payroll calculation", () => {
    const validEmp: Employee = {
      id: "emp_1",
      business_id: targetBusinessId,
      branchId: "br_main",
      departmentId: "dept_hr",
      name: "Eva Valid",
      email: "eva@alpha.com",
      role: "EMPLOYEE",
      baseSalary: 120000,
      paymentModel: "FIXED",
      status: "ACTIVE",
    };

    const invalidEmp: Employee = {
      id: "emp_2",
      business_id: targetBusinessId,
      branchId: "br_main",
      departmentId: "dept_hr",
      name: "Frank ZeroSalary",
      email: "frank@alpha.com",
      role: "EMPLOYEE",
      baseSalary: 0,
      paymentModel: "FIXED",
      status: "ACTIVE",
    };

    expect(() =>
      PayrollRepository.validateEmployeeContractsForPayroll([
        validEmp,
        invalidEmp,
      ])
    ).toThrow(/Frank ZeroSalary/);
  });
});
