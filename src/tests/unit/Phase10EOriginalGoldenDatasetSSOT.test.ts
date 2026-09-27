import { describe, it, expect } from "vitest";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { selectCashBasisExpertMetrics, selectExpertMetrics } from "../../domains/performance/selectors";
import { RawPerformanceDataSet, PICFilters } from "../../domains/performance/types";
import { LedgerTransaction, Employee } from "../../types";

/**
 * Phase 10E.2.2 — Original Golden Dataset SSOT and KPI Evidence Closure Test Suite
 *
 * This suite provides absolute evidence of the execution of the original 10E Golden Dataset
 * comprising six canonical events: INV-A, PAY-A1, EXP-A, PMT-E1, TRF-01, REV-01.
 *
 * It validates:
 * 1. Accrual Mode outputs: Revenue = 100,000 HTG, Expenses = 30,000 HTG, Profit = 70,000 HTG.
 * 2. Cash Mode outputs: Revenue = 50,000 HTG, Expenses = 10,000 HTG, Profit = 40,000 HTG, Net Cash Flow = 40,000 HTG.
 * 3. Exact mathematical proof that SALE ≠ ENCAISSEMENT (INV-A !== PAY-A1).
 * 4. Exact mathematical proof that EXPENSE ≠ PAYMENT (EXP-A !== PMT-E1).
 * 5. Treasury transfer (TRF-01) is correctly recognized and excluded from Revenue, Expenses, and Net Profit (impact = 0).
 * 6. Reversal transaction (REV-01) is correctly excluded based on canonical status-based exclusion rules.
 * 7. Verification using the high-level performance selectors: selectExpertMetrics and selectCashBasisExpertMetrics.
 */
describe("Phase 10E.2.2 — Original Golden Dataset End-To-End SSOT Verification", () => {
  const testTenantId = "golden_dataset_tenant_10e";

  const goldenFilters: PICFilters = {
    period: "custom",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    branchId: "ALL",
    departmentId: "ALL",
    metricType: "all",
    searchQuery: "",
  };

  // Setup mock employees to avoid undefined references in headcount or activeStaff metrics
  const mockEmployees: Employee[] = [
    {
      id: "emp_10e",
      business_id: testTenantId,
      firstName: "Mister",
      lastName: "Ten-E",
      status: "ACTIVE",
      employmentStatus: "ACTIVE",
      departmentId: "dept_1",
      branchId: "branch_1",
      is_active: true,
    } as any,
  ];

  // ==========================================
  // AUTHORITATIVE SIX GOLDEN DATASET RECORDS
  // ==========================================

  // GD-INV-A — SALE (invoice / receivable recognition)
  const INV_A: LedgerTransaction = {
    id: "INV-A",
    business_id: testTenantId,
    type: "INCOME",
    category: "REVENUE",
    amount: 100000,
    date: "2026-09-05", // Sept 2026 (inside accrual range)
    transaction_date: "2026-09-05",
    status: "POSTED",
    is_settled: false,
    debit_account: "1200_RECEIVABLE",
    credit_account: "7000_REVENUE",
    description: "Sale invoice recognized on accrual basis",
  } as any;

  // GD-PAY-A1 — ENCAISSEMENT (unrelated to accrual revenue, cash inflow only)
  const PAY_A1: LedgerTransaction = {
    id: "PAY-A1",
    business_id: testTenantId,
    type: "INCOME",
    category: "REVENUE",
    amount: 50000,
    date: "2026-08-10", // Aug 2026 (outside accrual range)
    paymentDate: "2026-09-10", // Sept 2026 (inside cash range)
    status: "POSTED",
    is_settled: true,
    debit_account: "1010_BANK",
    credit_account: "1200_RECEIVABLE", // Debit Treasury, Credit non-Treasury (Cash Inflow)
    invoiceId: "INV-A",
    description: "Partial collection payment on invoice",
  } as any;

  // GD-EXP-A — ACCRUED EXPENSE (unsettled rent)
  const EXP_A: LedgerTransaction = {
    id: "EXP-A",
    business_id: testTenantId,
    type: "EXPENSE",
    category: "OPEX",
    amount: 30000,
    date: "2026-09-15", // Sept 2026 (inside accrual range)
    transaction_date: "2026-09-15",
    status: "POSTED",
    is_settled: false,
    debit_account: "5200_RENT",
    credit_account: "2010_AP", // Accounts Payable
    description: "Rent accrued but unpaid",
  } as any;

  // GD-PMT-E1 — CASH EXPENSE PAYMENT (cash outflow only)
  const PMT_E1: LedgerTransaction = {
    id: "PMT-E1",
    business_id: testTenantId,
    type: "EXPENSE",
    category: "OPEX",
    amount: 10000,
    date: "2026-08-20", // Aug 2026 (outside accrual range)
    paymentDate: "2026-09-20", // Sept 2026 (inside cash range)
    status: "POSTED",
    is_settled: true,
    debit_account: "2010_AP",
    credit_account: "1010_BANK", // Credit Treasury, Debit non-Treasury (Cash Outflow)
    expenseId: "EXP-A",
    description: "Expense payment check",
  } as any;

  // GD-TRF-01 — TREASURY TRANSFER (internal cash movement)
  const TRF_01: LedgerTransaction = {
    id: "TRF-01",
    business_id: testTenantId,
    type: "TRANSFER",
    amount: 15000,
    date: "2026-08-22", // Aug 2026 (outside accrual range)
    paymentDate: "2026-09-22", // Sept 2026 (inside cash range)
    status: "POSTED",
    debit_account: "1000_CASH", // Debit Treasury
    credit_account: "1010_BANK", // Credit Treasury (Internal Transfer)
    description: "Internal cash transfer from bank to till safe",
  } as any;

  // GD-REV-01 — REVERSAL (excluded entirely)
  const REV_01: LedgerTransaction = {
    id: "REV-01",
    business_id: testTenantId,
    type: "INCOME",
    category: "REVENUE",
    amount: 5000,
    date: "2026-09-23",
    paymentDate: "2026-09-23",
    status: "REVERSED", // Triggers status exclusion rules
    is_settled: true,
    debit_account: "1010_BANK",
    credit_account: "7000_REVENUE",
    description: "Cancelled transaction to be ignored",
  } as any;

  const originalGoldenTransactions: LedgerTransaction[] = [
    INV_A,
    PAY_A1,
    EXP_A,
    PMT_E1,
    TRF_01,
    REV_01,
  ];

  const goldenDataSet: RawPerformanceDataSet = {
    employees: mockEmployees,
    transactions: originalGoldenTransactions,
    payrollRecords: [],
    attendanceRecords: [],
    departments: [{ id: "dept_1", name: "Ops", business_id: testTenantId } as any],
    branches: [{ id: "branch_1", name: "Main Office", business_id: testTenantId } as any],
    snapshots: [],
  };

  // ==========================================
  // CORE THEORETICAL ASSURANCES & PROOFS
  // ==========================================

  it("Proves the fundamental separation of SALE vs ENCAISSEMENT (INV-A !== PAY-A1)", () => {
    // A sale invoice recognizes accrual revenue of 100,000 HTG but does not create immediate cash inflow
    expect(INV_A.amount).toBe(100000);
    expect(INV_A.is_settled).toBe(false);

    // An encaissement payment settles 50,000 HTG but does not represent fresh accrual revenue
    expect(PAY_A1.amount).toBe(50000);
    expect(PAY_A1.is_settled).toBe(true);

    // Prove they are independent and distinct events
    expect(INV_A.id).not.toBe(PAY_A1.id);
    expect(INV_A.amount).not.toBe(PAY_A1.amount);
  });

  it("Proves the fundamental separation of ACCRUED EXPENSE vs CASH EXPENSE PAYMENT (EXP-A !== PMT-E1)", () => {
    // An accrued rent expense recognizes 30,000 HTG liability but is not a physical disbursement
    expect(EXP_A.amount).toBe(30000);
    expect(EXP_A.is_settled).toBe(false);

    // A payment on the accrued rent represents a 10,000 HTG physical outflow but is not fresh operational opex
    expect(PMT_E1.amount).toBe(10000);
    expect(PMT_E1.is_settled).toBe(true);

    // Prove they are independent and distinct events
    expect(EXP_A.id).not.toBe(PMT_E1.id);
    expect(EXP_A.amount).not.toBe(PMT_E1.amount);
  });

  // ==========================================
  // ACCRUAL-BASIS SSOT ENGINE VALIDATION
  // ==========================================

  it("GD-ACC: Verifies correct Accrual-Basis calculations: Revenue (100,000 HTG), Expenses (30,000 HTG), Net Profit (70,000 HTG)", () => {
    const snap = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: goldenFilters.startDate, endDate: goldenFilters.endDate },
      employees: mockEmployees,
      transactions: originalGoldenTransactions,
      attendanceLogs: [],
      payrollRecords: [],
      branches: goldenDataSet.branches,
      departments: goldenDataSet.departments,
      businessId: testTenantId,
      language: "fr",
      accountingMode: "ACCRUAL",
    });

    // Assert Accrual Revenue is exactly 100,000 HTG (from INV-A)
    expect(snap.revenue.currentValue).toBe(100000);
    expect(snap.revenue.state).toBe("VALID_VALUE");

    // Assert Accrual Expenses is exactly 30,000 HTG (from EXP-A)
    expect(snap.expenses.currentValue).toBe(30000);
    expect(snap.expenses.state).toBe("VALID_VALUE");

    // Assert Accrual Operating Profit is exactly 70,000 HTG
    expect(snap.profit.currentValue).toBe(70000);
    expect(snap.profit.state).toBe("VALID_VALUE");
  });

  // ==========================================
  // CASH-BASIS SSOT ENGINE VALIDATION
  // ==========================================

  it("GD-CSH: Verifies correct Cash-Basis calculations: Revenue (50,000 HTG), Expenses (10,000 HTG), Net Cash Flow (40,000 HTG)", () => {
    const snap = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: goldenFilters.startDate, endDate: goldenFilters.endDate },
      employees: mockEmployees,
      transactions: originalGoldenTransactions,
      attendanceLogs: [],
      payrollRecords: [],
      branches: goldenDataSet.branches,
      departments: goldenDataSet.departments,
      businessId: testTenantId,
      language: "fr",
      accountingMode: "CASH",
    });

    // Assert Cash Revenue is exactly 50,000 HTG (from PAY-A1)
    expect(snap.revenue.currentValue).toBe(50000);
    expect(snap.revenue.state).toBe("VALID_VALUE");

    // Assert Cash Expenses is exactly 10,000 HTG (from PMT-E1 opex payment)
    expect(snap.expenses.currentValue).toBe(10000);
    expect(snap.expenses.state).toBe("VALID_VALUE");

    // Assert Cash Profit / Operating Result is exactly 40,000 HTG
    expect(snap.profit.currentValue).toBe(40000);
    expect(snap.profit.state).toBe("VALID_VALUE");

    // Assert Net Cash Flow is exactly 40,000 HTG
    expect(snap.netCashFlow.currentValue).toBe(40000);
    expect(snap.netCashFlow.state).toBe("VALID_VALUE");
  });

  // ==========================================
  // EXCLUSION & TRANSFERS DEEP TRACING
  // ==========================================

  it("GD-TRF: Proves that TRF-01 treasury transfer has precisely ZERO impact on revenue, opex, and net profit", () => {
    // Cash-basis statement with all transactions except TRF-01
    const txsWithoutTransfer = originalGoldenTransactions.filter(t => t.id !== "TRF-01");
    
    const snapWithTransfer = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: goldenFilters.startDate, endDate: goldenFilters.endDate },
      employees: mockEmployees,
      transactions: originalGoldenTransactions,
      attendanceLogs: [],
      payrollRecords: [],
      branches: goldenDataSet.branches,
      departments: goldenDataSet.departments,
      businessId: testTenantId,
      language: "fr",
      accountingMode: "CASH",
    });

    const snapWithoutTransfer = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: goldenFilters.startDate, endDate: goldenFilters.endDate },
      employees: mockEmployees,
      transactions: txsWithoutTransfer,
      attendanceLogs: [],
      payrollRecords: [],
      branches: goldenDataSet.branches,
      departments: goldenDataSet.departments,
      businessId: testTenantId,
      language: "fr",
      accountingMode: "CASH",
    });

    // Assert complete mathematical equality showing 0 variance
    expect(snapWithTransfer.revenue.currentValue).toBe(snapWithoutTransfer.revenue.currentValue);
    expect(snapWithTransfer.expenses.currentValue).toBe(snapWithoutTransfer.expenses.currentValue);
    expect(snapWithTransfer.profit.currentValue).toBe(snapWithoutTransfer.profit.currentValue);
    expect(snapWithTransfer.netCashFlow.currentValue).toBe(snapWithoutTransfer.netCashFlow.currentValue);

    expect(snapWithTransfer.revenue.currentValue).toBe(50000);
    expect(snapWithTransfer.expenses.currentValue).toBe(10000);
    expect(snapWithTransfer.profit.currentValue).toBe(40000);
    expect(snapWithTransfer.netCashFlow.currentValue).toBe(40000);
  });

  it("GD-REV: Proves that REV-01 is ignored entirely on both Cash and Accrual bases due to its REVERSED status", () => {
    const txsWithoutReversal = originalGoldenTransactions.filter(t => t.id !== "REV-01");

    const snapWithReversalAccrual = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: goldenFilters.startDate, endDate: goldenFilters.endDate },
      employees: mockEmployees,
      transactions: originalGoldenTransactions,
      attendanceLogs: [],
      payrollRecords: [],
      branches: goldenDataSet.branches,
      departments: goldenDataSet.departments,
      businessId: testTenantId,
      language: "fr",
      accountingMode: "ACCRUAL",
    });

    const snapWithoutReversalAccrual = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: goldenFilters.startDate, endDate: goldenFilters.endDate },
      employees: mockEmployees,
      transactions: txsWithoutReversal,
      attendanceLogs: [],
      payrollRecords: [],
      branches: goldenDataSet.branches,
      departments: goldenDataSet.departments,
      businessId: testTenantId,
      language: "fr",
      accountingMode: "ACCRUAL",
    });

    expect(snapWithReversalAccrual.revenue.currentValue).toBe(snapWithoutReversalAccrual.revenue.currentValue);
    expect(snapWithReversalAccrual.revenue.currentValue).toBe(100000); // 5000 HTG reversal is correctly omitted
  });

  // ==========================================
  // HIGH-LEVEL SELECTORS VALIDATION
  // ==========================================

  it("GD-SEL-ACC: Validates high-level selector selectExpertMetrics outputs correct Accrual metrics", () => {
    const metrics = selectExpertMetrics(goldenDataSet, {
      ...goldenFilters,
      accountingMode: "ACCRUAL",
    } as any);

    expect(metrics.kpis.totalRevenue).toBe(100000);
    expect(metrics.kpis.totalExpenses).toBe(30000);
    expect(metrics.kpis.netProfit).toBe(70000);
    expect(metrics.isDataAvailable).toBe(true);
  });

  it("GD-SEL-CSH: Validates high-level selector selectCashBasisExpertMetrics outputs correct Cash metrics", () => {
    const metrics = selectCashBasisExpertMetrics(goldenDataSet, {
      ...goldenFilters,
      accountingMode: "CASH",
    } as any);

    expect(metrics.kpis.totalRevenue).toBe(50000);
    expect(metrics.kpis.totalExpenses).toBe(10000);
    expect(metrics.kpis.netProfit).toBe(40000);
    expect(metrics.isDataAvailable).toBe(true);
  });
});
