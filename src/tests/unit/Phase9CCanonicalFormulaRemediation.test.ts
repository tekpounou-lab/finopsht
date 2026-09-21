import { describe, it, expect } from "vitest";
import { selectCashBasisExpertMetrics } from "../../domains/performance/selectors";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { AccrualBasisEngine } from "../../domains/analytics/services/AccrualBasisEngine";
import { EmployeeOperationalAttributionService } from "../../services/workforce/EmployeeOperationalAttributionService";
import { IRI_IMPLEMENTATION_BLOCKED_BY_POLICY_DATA } from "../../constants/finance";
import { LedgerTransaction, PayrollRecord, Employee, Department } from "../../types";

describe("Phase 9C.2 — Controlled Canonical Formula Remediation Test Suite", () => {
  // --------------------------------------------------------------------------
  // DEF-9C-01: Cash Basis Net Profit vs Net Cash Flow Separation
  // --------------------------------------------------------------------------
  it("DEF-9C-01: selectCashBasisExpertMetrics should calculate netCashFlow and cashFlowMargin separately from netProfit and profitMargin", () => {
    const employees = [{ id: "emp1", name: "Emp One", is_active: true }] as Employee[];
    const transactions = [
      {
        id: "tx1",
        business_id: "biz_test_c1",
        amount: 100000,
        type: "INCOME",
        category: "REVENUE",
        debit_account: "1010_BANK",
        credit_account: "7000_REVENUE",
        status: "POSTED",
        is_settled: true,
        transaction_date: "2026-09-10",
      },
      {
        id: "tx2",
        business_id: "biz_test_c1",
        amount: 60000,
        type: "EXPENSE",
        category: "OPEX",
        debit_account: "6000_EXPENSE",
        credit_account: "1010_BANK",
        status: "POSTED",
        is_settled: true,
        transaction_date: "2026-09-15",
      },
    ] as LedgerTransaction[];

    const rawDataSet = {
      employees,
      transactions,
      payrollRecords: [],
      branches: [],
      departments: [],
    };

    const filters = {
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    };

    const result = selectCashBasisExpertMetrics(rawDataSet as any, filters as any);
    const metrics = result.kpis;

    expect(metrics.totalRevenue).toBe(100000);
    expect(metrics.totalExpenses).toBe(60000);
    expect(metrics.netCashFlow).toBe(40000);
    expect(metrics.cashFlowMargin).toBe(40);
  });

  // --------------------------------------------------------------------------
  // DEF-9C-02: Mode-Aware Expenses in CASH vs ACCRUAL Accounting
  // --------------------------------------------------------------------------
  it("DEF-9C-02: AnalyticsEngine in CASH mode should use cash outflows for total expenses", async () => {
    const transactions: LedgerTransaction[] = [
      {
        id: "tx_inc_settled",
        business_id: "biz_test_c2",
        amount: 80000,
        type: "INCOME",
        category: "REVENUE",
        debit_account: "1010_BANK",
        credit_account: "7000_REVENUE",
        status: "POSTED",
        is_settled: true,
        transaction_date: "2026-09-10",
      } as LedgerTransaction,
      {
        id: "tx_exp_settled",
        business_id: "biz_test_c2",
        amount: 30000,
        type: "EXPENSE",
        category: "OPEX",
        debit_account: "6000_EXPENSE",
        credit_account: "1010_BANK",
        status: "POSTED",
        is_settled: true,
        transaction_date: "2026-09-15",
      } as LedgerTransaction,
      {
        id: "tx_exp_unsettled",
        business_id: "biz_test_c2",
        amount: 50000,
        type: "EXPENSE",
        category: "OPEX",
        debit_account: "6000_EXPENSE",
        credit_account: "2000_PAYABLE",
        status: "POSTED",
        is_settled: false, // Unsettled accrual expense - excluded from CASH mode
        transaction_date: "2026-09-20",
      } as LedgerTransaction,
    ];

    const snapshotCash = await AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: "2026-09-01", endDate: "2026-09-30" },
      businessId: "biz_test_c2",
      employees: [],
      transactions: transactions,
      attendanceLogs: [],
      payrollRecords: [],
      accountingMode: "CASH",
    });

    // In CASH mode, expenses = settled outflows = 30000
    expect(snapshotCash.expenses.currentValue).toBe(30000);
    // Net profit (Cash mode) = Settled Inflows (80000) - Settled Outflows (30000) = 50000
    expect(snapshotCash.profit.currentValue).toBe(50000);
  });

  // --------------------------------------------------------------------------
  // DEF-9C-03: IRI Progressive Tax Policy Contract
  // --------------------------------------------------------------------------
  it("DEF-9C-03: IRI implementation should be marked as BLOCKED by policy data", () => {
    expect(IRI_IMPLEMENTATION_BLOCKED_BY_POLICY_DATA.STATUS).toBe("BLOCKED");
    expect(IRI_IMPLEMENTATION_BLOCKED_BY_POLICY_DATA.DEFAULT_DEDUCTION_HTG).toBe(0);
  });

  // --------------------------------------------------------------------------
  // DEF-9C-05: AccrualBasisEngine EBITDA Deprecation
  // --------------------------------------------------------------------------
  it("DEF-9C-05: AccrualBasisEngine should set ebitda to undefined and expose canonical operatingResult", async () => {
    const transactions = [
      {
        id: "tx_rev",
        business_id: "biz_test_accrual",
        type: "INCOME",
        category: "REVENUE",
        amount: 50000,
        status: "POSTED",
        is_settled: true,
        transaction_date: "2026-09-10",
      },
      {
        id: "tx_exp",
        business_id: "biz_test_accrual",
        type: "EXPENSE",
        category: "OPEX",
        amount: 20000,
        status: "POSTED",
        is_settled: true,
        transaction_date: "2026-09-15",
      },
    ] as unknown as LedgerTransaction[];

    const snapshot = await AccrualBasisEngine.generateSnapshot(
      "biz_test_accrual",
      { startDate: "2026-09-01", endDate: "2026-09-30" },
      transactions,
      [],
      []
    );

    expect(snapshot.netIncome).toBe(30000);
    expect(snapshot.operatingResult).toBe(30000);
    expect(snapshot.ebitda).toBeUndefined();
  });

  // --------------------------------------------------------------------------
  // DEF-9C-06: EmployeeOperationalAttributionService Commission Fallback
  // --------------------------------------------------------------------------
  it("DEF-9C-06: EmployeeOperationalAttributionService should default commission rate fallback to 0% (not 5%)", async () => {
    const employees = [
      { id: "emp_no_comm", name: "Jean Sales", is_active: true } as Employee,
    ];
    const transactions = [
      {
        id: "tx1",
        business_id: "biz_test_c6",
        amount: 10000,
        employee_id: "emp_no_comm",
        department_id: "dept1",
        type: "INCOME",
        status: "POSTED",
        date: "2026-09-10",
      } as unknown as LedgerTransaction,
    ];
    const departments = [{ id: "dept1", name: "Sales" }] as Department[];

    const attributions = await EmployeeOperationalAttributionService.rebuildAttributions(
      "biz_test_c6",
      employees,
      transactions,
      departments
    );

    expect(attributions.length).toBe(1);
    expect(attributions[0].commissionAmount).toBe(0);
  });

  // --------------------------------------------------------------------------
  // DEF-9C-08: AccrualBasisEngine Employer Tax Fallback
  // --------------------------------------------------------------------------
  it("DEF-9C-08: AccrualBasisEngine should not invent 17% employer tax when cnss/ofatma cents are 0", async () => {
    const payroll = [
      {
        id: "pr1",
        business_id: "biz_test_c8",
        gross_salary_cents: 1000000, // 10,000 HTG gross
        cnss_employer_cents: 0,
        ofatma_employer_cents: 0,
        status: "APPROVED",
        period_start: "2026-09-01",
        period_end: "2026-09-30",
      } as unknown as PayrollRecord,
    ];

    const snapshot = await AccrualBasisEngine.generateSnapshot(
      "biz_test_c8",
      { startDate: "2026-09-01", endDate: "2026-09-30" },
      [],
      payroll,
      []
    );

    // Employer contributions should be 0, not 1,700 HTG (17% of 10,000)
    expect(snapshot.payrollAccrued.employerContributions).toBe(0);
  });
});
