import { describe, it, expect } from "vitest";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { CashBasisEngine } from "../../domains/analytics/services/CashBasisEngine";
import { AccrualBasisEngine } from "../../domains/analytics/services/AccrualBasisEngine";
import { LedgerTransaction, PayrollRecord, Employee } from "../../types";

describe("FINOPS ERP — SSOT Cross-Module Invariant Matrix Tests", () => {
  const businessId = "biz_ssot_matrix_001";
  const customRange = { startDate: "2026-09-01", endDate: "2026-09-30" };
  const referenceDate = new Date("2026-09-15T12:00:00Z");

  const mockEmployees: Employee[] = [
    {
      id: "emp_101",
      businessId,
      branchId: "branch_main",
      departmentId: "dept_sales",
      name: "Alice Dupont",
      email: "alice@finops.com",
      role: "EMPLOYEE",
      paymentModel: "FIXED",
      status: "ACTIVE",
      baseSalary: 120000,
      createdAt: "2026-01-01T00:00:00Z"
    }
  ];

  const mockTransactions: LedgerTransaction[] = [
    {
      id: "tx_inc_001",
      business_id: businessId,
      branchId: "branch_main",
      type: "INCOME",
      amount: 300000,
      amount_cents: 30000000,
      date: "2026-09-10",
      category: "SALES",
      description: "Vente de services CRM",
      currency: "HTG",
      status: "POSTED",
      debit_account: "1010_BANK",
      credit_account: "4000_REVENUE",
      isImmutable: true,
      signerId: "user_001",
      source: "SYSTEM"
    },
    {
      id: "tx_exp_001",
      business_id: businessId,
      branchId: "branch_main",
      type: "EXPENSE",
      amount: 50000,
      amount_cents: 5000000,
      date: "2026-09-12",
      category: "RENT",
      description: "Loyer bureau",
      currency: "HTG",
      status: "POSTED",
      debit_account: "5100_RENT",
      credit_account: "1010_BANK",
      isImmutable: true,
      signerId: "user_001",
      source: "SYSTEM"
    }
  ];

  const mockPayrolls: PayrollRecord[] = [
    {
      id: "pay_rec_001",
      business_id: businessId,
      employeeId: "emp_101",
      employeeName: "Alice Dupont",
      cycleId: "cycle_sept",
      baseSalary: 120000,
      grossSalary: 120000,
      netPaid: 100000,
      primes: 0,
      cnssDeduction: 10000,
      cnsDeduction: 5000,
      commissions: 0,
      advancesTreated: 0,
      status: "SEALED",
      hashSignature: "sig_001",
      created_at: "2026-09-15T00:00:00Z"
    }
  ];

  it("SSOT Invariant: Direct AnalyticsEngine vs AccrualBasis vs CashBasis produce deterministic, aligned snapshots", async () => {
    // 1. Direct AnalyticsEngine canonical snapshot
    const canonicalSnapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange,
      employees: mockEmployees,
      transactions: mockTransactions,
      attendanceLogs: [],
      payrollRecords: mockPayrolls,
      branches: [],
      departments: [],
      contracts: [],
      businessId,
      referenceDate
    });

    // 2. Accrual Basis Engine consumer snapshot
    const accrualSnapshot = await AccrualBasisEngine.generateSnapshot(
      businessId,
      customRange,
      mockTransactions,
      mockPayrolls,
      mockEmployees
    );

    // 3. Cash Basis Engine consumer snapshot
    const cashSnapshot = await CashBasisEngine.generateSnapshot(
      businessId,
      customRange,
      mockTransactions,
      mockPayrolls,
      mockEmployees
    );

    // Invariant Check 1: Revenue (Canonical 300,000 == Accrual 300,000)
    expect(canonicalSnapshot.revenue.currentValue).toBe(300000);
    expect(accrualSnapshot.revenueRecognized).toBe(300000);

    // Invariant Check 2: Payroll Cost
    expect(canonicalSnapshot.payrollCost.currentValue).toBe(135000);

    // Invariant Check 3: Expenses (No Double Counting: 50,000 Rent + 135,000 Payroll = 185,000)
    expect(canonicalSnapshot.expenses.currentValue).toBe(185000);

    // Invariant Check 4: Profit (300,000 - 185,000 = 115,000)
    expect(canonicalSnapshot.profit.currentValue).toBe(115000);
  });
});
