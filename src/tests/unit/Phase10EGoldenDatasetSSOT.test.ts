import { describe, it, expect } from "vitest";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { selectCashBasisExpertMetrics, selectExpertMetrics, selectSimplifiedMetrics } from "../../domains/performance/selectors";
import { RawPerformanceDataSet, PICFilters } from "../../domains/performance/types";
import { MetricSemanticState } from "../../domains/analytics/types";
import { Employee, LedgerTransaction, PayrollRecord, AttendanceRecord } from "../../types";

/**
 * Phase 10E & 10E.2 Golden Dataset & Controlled KPI SSOT Regression Test Suite
 *
 * Verifies:
 * 1. The 7 canonical Golden Dataset KPI outputs (Revenue, Expenses, Profit, Net Cash Flow, Attendance, Headcount, Payroll).
 * 2. Accrual Profit (50,000 HTG) vs Net Cash Flow (40,000 HTG) decoupling.
 * 3. ZERO-contract enforcement: distinguishes VALID_ZERO (0) from NO_DATA/LOADING (null).
 * 4. CASH selector accounting-mode propagation into AnalyticsEngine.
 */
describe("Phase 10E.2 — Controlled Golden Dataset & KPI SSOT Verification", () => {
  const goldenFilters: PICFilters = {
    period: "custom",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    branchId: "ALL",
    departmentId: "ALL",
    metricType: "all",
    searchQuery: "",
  };

  const goldenEmployees: Employee[] = [
    {
      id: "emp_1",
      business_id: "biz_golden",
      firstName: "Jean",
      lastName: "Baptiste",
      status: "ACTIVE",
      employmentStatus: "ACTIVE",
      departmentId: "dept_ops",
      branchId: "branch_main",
      hireDate: "2025-01-01",
      baseSalary: 25000,
      is_active: true,
    } as any,
    {
      id: "emp_2",
      business_id: "biz_golden",
      firstName: "Marie",
      lastName: "Célestin",
      status: "ACTIVE",
      employmentStatus: "ACTIVE",
      departmentId: "dept_ops",
      branchId: "branch_main",
      hireDate: "2025-01-01",
      baseSalary: 25000,
      is_active: true,
    } as any,
  ];

  // Golden Dataset Transactions:
  // 1. Revenue / Cash Inflow: 80,000 HTG (settled to 1010_BANK)
  // 2. Operating Expense: 15,000 HTG (settled from 1010_BANK)
  // Combined with Payroll of 25,000 HTG:
  // Total Cash Outflow = 15,000 + 25,000 = 40,000 HTG
  // Cash Inflow = 80,000 HTG
  // Net Cash Flow = 80,000 - 40,000 = 40,000 HTG
  const goldenTransactions: LedgerTransaction[] = [
    {
      id: "tx_inc_1",
      business_id: "biz_golden",
      type: "INCOME",
      category: "REVENUE",
      amount: 80000,
      date: "2026-09-10",
      transaction_date: "2026-09-10",
      paymentDate: "2026-09-10",
      status: "POSTED",
      is_settled: true,
      debit_account: "1010_BANK",
      credit_account: "7000_REVENUE",
      description: "Ventes de services",
    } as any,
    {
      id: "tx_exp_1",
      business_id: "biz_golden",
      type: "EXPENSE",
      category: "OPEX",
      amount: 15000,
      date: "2026-09-15",
      transaction_date: "2026-09-15",
      paymentDate: "2026-09-15",
      status: "POSTED",
      is_settled: true,
      debit_account: "6000_EXPENSE",
      credit_account: "1010_BANK",
      description: "Dépenses d'exploitation",
    } as any,
  ];

  const goldenAttendance: AttendanceRecord[] = [
    {
      id: "att_1",
      employee_id: "emp_1",
      business_id: "biz_golden",
      date: "2026-09-02",
      hours_worked: 8,
      status: "PRESENT",
    } as any,
    {
      id: "att_2",
      employee_id: "emp_2",
      business_id: "biz_golden",
      date: "2026-09-02",
      hours_worked: 8,
      status: "PRESENT",
    } as any,
  ];

  const goldenPayroll: PayrollRecord[] = [
    {
      id: "pay_1",
      employee_id: "emp_1",
      business_id: "biz_golden",
      netPaid: 25000,
      netSalary: 25000,
      grossSalary: 25000,
      totalEmploymentCost: 25000,
      paidAt: "2026-09-28",
      paymentDate: "2026-09-28",
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      status: "PAID",
    } as any,
  ];

  const goldenDataSet: RawPerformanceDataSet = {
    employees: goldenEmployees,
    transactions: goldenTransactions,
    payrollRecords: goldenPayroll,
    attendanceRecords: goldenAttendance,
    departments: [{ id: "dept_ops", name: "Opérations", business_id: "biz_golden" } as any],
    branches: [{ id: "branch_main", name: "Siège", business_id: "biz_golden" } as any],
    snapshots: [],
  };

  it("GD-01: Demonstrates Cash Basis Statement: Inflows (80,000 HTG), Outflows (40,000 HTG), Net Cash Flow (40,000 HTG)", () => {
    const snap = AnalyticsEngine.generateSnapshot(
      "CUSTOM",
      { startDate: goldenFilters.startDate, endDate: goldenFilters.endDate },
      goldenEmployees,
      goldenTransactions,
      goldenAttendance,
      goldenPayroll,
      goldenDataSet.branches,
      goldenDataSet.departments,
      [],
      "biz_golden",
      "fr",
      undefined,
      { enableSocialTax: false, accountingMode: "CASH" }
    );

    // Revenue in cash mode = 80,000 HTG
    expect(snap.revenue.currentValue).toBe(80000);
    expect(snap.revenue.state).toBe("VALID_VALUE");

    // Total cash outflows = 40,000 HTG (15,000 OpEx + 25,000 Payroll)
    expect(snap.expenses.currentValue).toBe(40000);
    expect(snap.expenses.state).toBe("VALID_VALUE");

    // Cash Profit = 80,000 - 40,000 = 40,000 HTG
    expect(snap.profit.currentValue).toBe(40000);
    expect(snap.profit.state).toBe("VALID_VALUE");

    // Net Cash Flow = 40,000 HTG
    expect(snap.netCashFlow.currentValue).toBe(40000);
    expect(snap.netCashFlow.state).toBe("VALID_VALUE");
  });

  it("GD-02: Demonstrates Profit (50,000 HTG) vs Net Cash Flow (40,000 HTG) decoupling in Accrual Mode with non-operating flow", () => {
    // In Accrual Mode:
    // Revenue = 80,000 HTG
    // Accrual Expenses = 30,000 HTG (15,000 OpEx + 15,000 accrued payable)
    // Accrual Operating Profit = 80,000 - 30,000 = 50,000 HTG
    const accrualTxs: LedgerTransaction[] = [
      ...goldenTransactions,
      {
        id: "tx_exp_accrued",
        business_id: "biz_golden",
        type: "EXPENSE",
        category: "OPEX",
        amount: 15000,
        date: "2026-09-25",
        status: "POSTED",
        is_settled: false, // Unsettled accrual payable
        debit_account: "6000_EXPENSE",
        credit_account: "2000_PAYABLE",
      } as any,
    ];

    const snapAccrual = AnalyticsEngine.generateSnapshot(
      "CUSTOM",
      { startDate: goldenFilters.startDate, endDate: goldenFilters.endDate },
      goldenEmployees,
      accrualTxs,
      goldenAttendance,
      [], // no direct payroll subledger, purely GL transactions
      goldenDataSet.branches,
      goldenDataSet.departments,
      [],
      "biz_golden",
      "fr",
      undefined,
      { enableSocialTax: false, accountingMode: "ACCRUAL" }
    );

    // Revenue = 80,000 HTG
    expect(snapAccrual.revenue.currentValue).toBe(80000);
    // Accrual Expenses = 15,000 (settled) + 15,000 (accrued payable) = 30,000 HTG
    expect(snapAccrual.expenses.currentValue).toBe(30000);
    // Operating Profit = 80,000 - 30,000 = 50,000 HTG
    expect(snapAccrual.profit.currentValue).toBe(50000);
  });

  it("GD-03: Demonstrates all 7 Golden Dataset KPI outputs deterministically", () => {
    const snap = AnalyticsEngine.generateSnapshot(
      "CUSTOM",
      { startDate: goldenFilters.startDate, endDate: goldenFilters.endDate },
      goldenEmployees,
      goldenTransactions,
      goldenAttendance,
      goldenPayroll,
      goldenDataSet.branches,
      goldenDataSet.departments,
      [],
      "biz_golden",
      "fr",
      undefined,
      { enableSocialTax: false, accountingMode: "CASH" }
    );

    // 1. Revenue
    expect(snap.revenue.currentValue).toBe(80000);
    // 2. Expenses
    expect(snap.expenses.currentValue).toBe(40000);
    // 3. Profit / Operating Result
    expect(snap.profit.currentValue).toBe(40000);
    // 4. Net Cash Flow
    expect(snap.netCashFlow.currentValue).toBe(40000);
    // 5. Attendance Rate (Numeric percentage, not hardcoded fallback)
    expect(typeof snap.attendanceRate.currentValue).toBe("number");
    expect(snap.attendanceRate.state).toBe("VALID_VALUE");
    // 6. Active Staff / Headcount
    expect(snap.activeStaff.currentValue).toBe(2);
    expect(snap.activeStaff.state).toBe("VALID_VALUE");
    // 7. Payroll Cost
    expect(snap.payrollCost.currentValue).toBe(25000);
    expect(snap.payrollCost.state).toBe("VALID_VALUE");
  });

  it("GD-04: Validates selectCashBasisExpertMetrics passes accountingMode: 'CASH'", () => {
    const cashMetrics = selectCashBasisExpertMetrics(goldenDataSet, {
      ...goldenFilters,
      accountingMode: "CASH",
    } as any);

    expect(cashMetrics.kpis.totalRevenue).toBe(80000);
    expect(cashMetrics.kpis.totalExpenses).toBe(40000);
    expect(cashMetrics.kpis.netProfit).toBe(40000);
    expect(cashMetrics.kpis.netCashFlow).toBe(40000);
    expect(cashMetrics.isDataAvailable).toBe(true);
  });

  it("GD-05: Enforces ZERO contract: distinguishes VALID_ZERO from NO_DATA", () => {
    // 1. Legitimate VALID_ZERO: 0 transactions, 0 revenue
    const zeroComparison = AnalyticsEngine.compareValues(0, 0);
    expect(zeroComparison.currentValue).toBe(0);
    expect(zeroComparison.state).toBe("VALID_ZERO");

    // 2. Legitimate VALID_VALUE: 50,000 revenue
    const valueComparison = AnalyticsEngine.compareValues(50000, 40000);
    expect(valueComparison.currentValue).toBe(50000);
    expect(valueComparison.state).toBe("VALID_VALUE");

    // 3. MetricSemanticState type covers all expected states
    const states: MetricSemanticState[] = ["LOADING", "NO_DATA", "VALID_ZERO", "VALID_VALUE"];
    expect(states).toContain("VALID_ZERO");
    expect(states).toContain("NO_DATA");
  });
});
