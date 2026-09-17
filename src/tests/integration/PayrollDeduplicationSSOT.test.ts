import { describe, it, expect } from "vitest";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { LedgerTransaction, PayrollRecord } from "../../types";

describe("Payroll and OPEX Deduplication SSOT Invariant Tests", () => {
  const businessId = "biz_dedup_test";
  const customRange = { startDate: "2026-09-01", endDate: "2026-09-30" };
  const referenceDate = new Date("2026-09-15T12:00:00Z");

  const val = (metric: any) => (typeof metric === "number" ? metric : metric?.currentValue ?? 0);

  const samplePayrollRecord: PayrollRecord = {
    id: "rec_dedup_001",
    business_id: businessId,
    employeeId: "emp_001",
    employeeName: "Jean Baptiste",
    cycleId: "cycle_001",
    baseSalary: 110000,
    grossSalary: 110000,
    netPaid: 85000,
    primes: 0,
    cnssDeduction: 0,
    cnsDeduction: 0,
    commissions: 0,
    advancesTreated: 0,
    status: "SEALED",
    hashSignature: "sig_001",
    created_at: "2026-09-15T00:00:00Z"
  };

  const sampleGlPayrollTx: LedgerTransaction = {
    id: "tx_gl_payroll_001",
    business_id: businessId,
    branchId: "branch_main",
    type: "EXPENSE",
    amount: 110000,
    amount_cents: 11000000,
    date: "2026-09-15",
    category: "PAYROLL",
    description: "Salaires de Septembre 2026",
    currency: "HTG",
    status: "POSTED",
    debit_account: "5000_PAYROLL_EXPENSE",
    credit_account: "1010_BANK",
    isImmutable: true,
    signerId: "user_001",
    source: "SYSTEM"
  };

  const sampleGlNonPayrollTx: LedgerTransaction = {
    id: "tx_gl_opex_001",
    business_id: businessId,
    branchId: "branch_main",
    type: "EXPENSE",
    amount: 25000,
    amount_cents: 2500000,
    date: "2026-09-10",
    category: "OFFICE_SUPPLIES",
    description: "Fournitures de bureau",
    currency: "HTG",
    status: "POSTED",
    debit_account: "5200_OFFICE_SUPPLIES",
    credit_account: "1010_BANK",
    isImmutable: true,
    signerId: "user_001",
    source: "SYSTEM"
  };

  it("Case 1: Payroll record only -> Total Expenses equals Payroll Cost (110,000 HTG)", () => {
    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange,
      businessId,
      transactions: [],
      payrollRecords: [samplePayrollRecord],
      referenceDate
    });

    expect(val(snapshot.payrollCost)).toBe(110000);
    expect(val(snapshot.expenses)).toBe(110000);
  });

  it("Case 2: GL payroll entry only -> Total Expenses equals GL Payroll (110,000 HTG)", () => {
    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange,
      businessId,
      transactions: [sampleGlPayrollTx],
      payrollRecords: [],
      referenceDate
    });

    expect(val(snapshot.expenses)).toBe(110000);
  });

  it("Case 3: Payroll record + GL payroll entry -> NO DOUBLE COUNTING (110,000 HTG, not 220,000 HTG)", () => {
    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange,
      businessId,
      transactions: [sampleGlPayrollTx],
      payrollRecords: [samplePayrollRecord],
      referenceDate
    });

    expect(val(snapshot.payrollCost)).toBe(110000);
    expect(val(snapshot.expenses)).toBe(110000); // Strict canonical deduplication
  });

  it("Case 4: Payroll record + Non-payroll GL expense -> Correct Total (110,000 + 25,000 = 135,000 HTG)", () => {
    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange,
      businessId,
      transactions: [sampleGlNonPayrollTx],
      payrollRecords: [samplePayrollRecord],
      referenceDate
    });

    expect(val(snapshot.payrollCost)).toBe(110000);
    expect(val(snapshot.expenses)).toBe(135000);
  });

  it("Case 5: GL Non-payroll expense only -> Total Expenses equals 25,000 HTG", () => {
    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange,
      businessId,
      transactions: [sampleGlNonPayrollTx],
      payrollRecords: [],
      referenceDate
    });

    expect(val(snapshot.payrollCost)).toBe(0);
    expect(val(snapshot.expenses)).toBe(25000);
  });

  it("Case 6: Empty dataset -> Total Expenses equals 0 HTG", () => {
    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange,
      businessId,
      transactions: [],
      payrollRecords: [],
      referenceDate
    });

    expect(val(snapshot.payrollCost)).toBe(0);
    expect(val(snapshot.expenses)).toBe(0);
  });
});
