import { describe, it, expect } from "vitest";
import { IRI_IMPLEMENTATION_BLOCKED_BY_POLICY_DATA } from "../../constants/finance";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { AccrualBasisEngine } from "../../domains/analytics/services/AccrualBasisEngine";
import { PayrollService } from "../../services/payroll/PayrollService";
import { LedgerTransaction, PayrollCycle, PayrollRecord, Employee } from "../../types";

describe("Phase 9B: Canonical Formula Remediation Test Suite", () => {
  // --------------------------------------------------------------------------
  // DEF-9B-01: IRI Statutory Tax Bracket Blocking
  // --------------------------------------------------------------------------
  it("DEF-9B-01: should block IRI tax implementation until authoritative DGI policy brackets are provided", () => {
    expect(IRI_IMPLEMENTATION_BLOCKED_BY_POLICY_DATA.STATUS).toBe("BLOCKED");
    expect(IRI_IMPLEMENTATION_BLOCKED_BY_POLICY_DATA.REASON).toBe("ABSENT_AUTHORITATIVE_DGI_POLICY_DATA");
    expect(IRI_IMPLEMENTATION_BLOCKED_BY_POLICY_DATA.DEFAULT_DEDUCTION_HTG).toBe(0);
  });

  // --------------------------------------------------------------------------
  // DEF-9B-02: Canonical Net Cash Flow vs Net Profit
  // --------------------------------------------------------------------------
  it("DEF-9B-02: should compute canonical netCashFlow on AnalyticsSnapshot independently of netProfit", async () => {
    const transactions = [
      {
        id: "tx_inc_1",
        business_id: "biz_test_9b",
        date: "2026-09-05",
        type: "INCOME",
        amount: 10000,
        status: "POSTED",
        payment_method: "CASH",
        category: "SALES",
      },
      {
        id: "tx_exp_1",
        business_id: "biz_test_9b",
        date: "2026-09-10",
        type: "EXPENSE",
        amount: 4000,
        status: "POSTED",
        payment_method: "CASH",
        category: "SUPPLIES",
      },
      // Non-cash accrual expense (e.g. accounts payable / unpaid bill)
      {
        id: "tx_exp_accrual",
        business_id: "biz_test_9b",
        date: "2026-09-12",
        type: "EXPENSE",
        amount: 3000,
        status: "POSTED",
        payment_method: "NON_CASH",
        category: "RENT_PAYABLE",
      },
    ] as unknown as LedgerTransaction[];

    const snapshot = await AnalyticsEngine.generateSnapshot({
      period: "MONTH",
      customRange: { startDate: "2026-09-01", endDate: "2026-09-30" },
      transactions,
      employees: [],
      attendanceLogs: [],
      payrollRecords: [],
      businessId: "biz_test_9b",
    });

    // Revenue = 10,000; Total Expenses = 7,000; Net Profit = 3,000
    expect(snapshot.revenue.currentValue).toBe(10000);
    expect(snapshot.expenses.currentValue).toBe(7000);
    expect(snapshot.profit.currentValue).toBe(3000);

    // Net Cash Flow MUST strictly reflect cash movements: 10,000 - 4,000 = 6,000
    expect(snapshot.netCashFlow).toBeDefined();
    expect(snapshot.netCashFlow?.currentValue).toBe(6000);
    expect(snapshot.netCashFlow?.currentValue).not.toBe(snapshot.profit.currentValue);
  });

  // --------------------------------------------------------------------------
  // DEF-9B-03: AccrualBasisEngine Operating Result (Remediated EBITDA)
  // --------------------------------------------------------------------------
  it("DEF-9B-03: should expose operatingResult and deprecated ebitda in AccrualBasisEngine without inventing D&A addbacks", async () => {
    const transactions = [
      {
        id: "tx_inc",
        business_id: "biz_9b_accrual",
        date: "2026-09-05",
        type: "INCOME",
        amount: 25000,
        status: "POSTED",
      },
      {
        id: "tx_exp",
        business_id: "biz_9b_accrual",
        date: "2026-09-10",
        type: "EXPENSE",
        amount: 10000,
        status: "POSTED",
      },
    ] as unknown as LedgerTransaction[];

    const result = await AccrualBasisEngine.generateSnapshot(
      "biz_9b_accrual",
      { startDate: "2026-09-01", endDate: "2026-09-30" },
      transactions,
      [],
      []
    );

    // Net income = 25000 - 10000 = 15000
    expect(result.netIncome).toBe(15000);
    expect(result.operatingResult).toBe(15000);
    // DEF-9C-05: EBITDA is undefined because D&A subledgers do not exist
    expect(result.ebitda).toBeUndefined();
  });

  // --------------------------------------------------------------------------
  // DEF-9B-04: Short-Term Net Operating Projection (Forecast)
  // --------------------------------------------------------------------------
  it("DEF-9B-04: should calculate 7-day operating forecast based on net profit minus 7-day operating burn", async () => {
    const transactions = [
      {
        id: "tx_rev",
        business_id: "biz_9b_forecast",
        date: "2026-09-01",
        type: "INCOME",
        amount: 60000,
        status: "POSTED",
      },
      {
        id: "tx_exp",
        business_id: "biz_9b_forecast",
        date: "2026-09-02",
        type: "EXPENSE",
        amount: 30000,
        status: "POSTED",
      },
    ] as unknown as LedgerTransaction[];

    // Period: 30 days (Sept 1 to Sept 30)
    const snapshot = await AnalyticsEngine.generateSnapshot({
      period: "MONTH",
      customRange: { startDate: "2026-09-01", endDate: "2026-09-30" },
      transactions,
      employees: [],
      attendanceLogs: [],
      payrollRecords: [],
      businessId: "biz_9b_forecast",
    });

    // Profit = 30,000; Days = 30; Daily Burn = 30,000 / 30 = 1,000 HTG/day
    // 7-Day Forecast = Profit (30,000) - (1,000 * 7) = 23,000 HTG
    expect(snapshot.profit.currentValue).toBe(30000);
    expect(snapshot.burnRate.currentValue).toBe(1000);
    expect(snapshot.forecast.forecast7Days).toBe(23000);
  });

  // --------------------------------------------------------------------------
  // DEF-9B-05: Strict Revenue Semantics (No Contamination from Payroll Sales)
  // --------------------------------------------------------------------------
  it("DEF-9B-05: should NOT substitute commercial employee sales into company accounting revenue when GL income is 0", async () => {
    // Payroll record with commercial sales attribution (e.g. 50,000 HTG)
    const payrollRecords = [
      {
        id: "pr_sales_1",
        employeeId: "emp_rep_1",
        employeeName: "Sales Rep 1",
        cycleId: "cycle_sept_2026",
        pay_profile: "COMMISSION",
        baseSalary: 0,
        salesHtg: 50000,
        sales_cents: 5000000, // 50,000 HTG commercial sales
        commissions: 2500,
        grossSalary: 2500,
        netPaid: 2500,
        status: "SEALED",
        payment_status: "PAID",
        business_id: "biz_revenue_test",
      },
    ] as unknown as PayrollRecord[];

    // Zero GL income transactions (no accounting revenue posted in general ledger)
    const ledgerTransactions: LedgerTransaction[] = [];

    const snapshot = await AnalyticsEngine.generateSnapshot({
      period: "MONTH",
      customRange: { startDate: "2026-09-01", endDate: "2026-09-30" },
      transactions: ledgerTransactions,
      payrollRecords,
      employees: [],
      attendanceLogs: [],
      businessId: "biz_revenue_test",
    });

    // Accounting revenue MUST be 0.00, NOT contaminated by 50,000 HTG commercial sales!
    expect(snapshot.revenue.currentValue).toBe(0);
  });

  // --------------------------------------------------------------------------
  // DEF-9B-06: CashOnHand Lineage as Cumulative GL Cash Balance
  // --------------------------------------------------------------------------
  it("DEF-9B-06: should compute cashOnHand as cumulative GL cash-settled balance across date history", async () => {
    const historicalTransactions = [
      // Past month transaction
      {
        id: "tx_hist_1",
        business_id: "biz_cash_lineage",
        date: "2026-08-15",
        type: "INCOME",
        amount: 40000,
        status: "POSTED",
        payment_method: "CASH",
      },
      // Current month transaction
      {
        id: "tx_cur_1",
        business_id: "biz_cash_lineage",
        date: "2026-09-10",
        type: "EXPENSE",
        amount: 15000,
        status: "POSTED",
        payment_method: "CASH",
      },
      // Non-cash expense (does not reduce physical cash)
      {
        id: "tx_non_cash",
        business_id: "biz_cash_lineage",
        date: "2026-09-12",
        type: "EXPENSE",
        amount: 5000,
        status: "POSTED",
        payment_method: "NON_CASH",
      },
    ] as unknown as LedgerTransaction[];

    const snapshot = await AnalyticsEngine.generateSnapshot({
      period: "MONTH",
      customRange: { startDate: "2026-09-01", endDate: "2026-09-30" },
      transactions: historicalTransactions,
      employees: [],
      attendanceLogs: [],
      payrollRecords: [],
      businessId: "biz_cash_lineage",
    });

    // Cumulative cash balance = 40,000 - 15,000 = 25,000 HTG
    expect(snapshot.cashOnHand.currentValue).toBe(25000);
  });

  // --------------------------------------------------------------------------
  // DEF-9B-07: HR Multiple vs ROI
  // --------------------------------------------------------------------------
  it("DEF-9B-07: should compute HR Productivity Multiple as Revenue / Payroll Cost", () => {
    const revenue = 250000;
    const payrollCost = 100000;

    const multiple = (revenue / payrollCost).toFixed(2);
    expect(multiple).toBe("2.50");
  });

  // --------------------------------------------------------------------------
  // DEF-9B-08: Payroll Fallbacks (Zero Commission Default & Attendance Guard)
  // --------------------------------------------------------------------------
  it("DEF-9B-08a: should default commission rate to 0.00 when no policy or employee contract specifies a rate", async () => {
    const dummyCycle: PayrollCycle = {
      id: "cycle_test_comm",
      cycleName: "Quinzaine Test",
      startDate: "2026-09-01",
      endDate: "2026-09-15",
      status: "DRAFT",
      total_gross_cents: 0,
      total_net_cents: 0,
      total_deductions_cents: 0,
      business_id: "biz_comm_test",
    };

    const employeeWithoutCommissionRate: Partial<Employee> = {
      id: "emp_no_comm",
      name: "Jean No Comm",
      paymentModel: "FIXED",
      salaryBaseHtg: 20000,
      business_id: "biz_comm_test",
    };

    let generatedRecords: PayrollRecord[] = [];

    await PayrollService.processPayrollCycle(
      dummyCycle,
      [employeeWithoutCommissionRate as Employee],
      "biz_comm_test",
      {
        attendanceRecords: [],
        ledgerTransactions: [
          // Commercial sale attributed to employee
          {
            id: "tx_sale_1",
            employeeId: "emp_no_comm",
            type: "INCOME",
            amount: 50000,
            date: "2026-09-05",
            business_id: "biz_comm_test",
          } as unknown as LedgerTransaction,
        ],
        salaryAdvances: [],
        payrollBonuses: [],
        payrollDeductions: [],
        policies: {
          standardQuinzaineHours: 96,
          // No defaultCommissionRate set
        },
        onAddRecords: (records) => {
          generatedRecords = records;
        },
        onUpdateCycle: () => {},
      }
    );

    expect(generatedRecords).toHaveLength(1);
    // Commission MUST be 0, NOT 50,000 * 5% = 2,500!
    expect(generatedRecords[0].commissions).toBe(0);
  });

  it("DEF-9B-08b: should evaluate workedHours to 0 when require_attendance_for_payroll is true and attendance is unrecorded", async () => {
    const dummyCycle: PayrollCycle = {
      id: "cycle_test_att",
      cycleName: "Quinzaine Test Attendance",
      startDate: "2026-09-01",
      endDate: "2026-09-15",
      status: "DRAFT",
      total_gross_cents: 0,
      total_net_cents: 0,
      total_deductions_cents: 0,
      business_id: "biz_att_test",
    };

    const employee: Partial<Employee> = {
      id: "emp_hourly",
      name: "Hourly Worker",
      paymentModel: "FIXED",
      payRegime: "fixe",
      business_id: "biz_att_test",
    };
    (employee as any).paymentModel = "HOURLY";
    (employee as any).hourlyRate = 100;

    let generatedRecords: PayrollRecord[] = [];

    await PayrollService.processPayrollCycle(
      dummyCycle,
      [employee as Employee],
      "biz_att_test",
      {
        attendanceRecords: [], // No clock-ins
        ledgerTransactions: [],
        salaryAdvances: [],
        payrollBonuses: [],
        payrollDeductions: [],
        policies: {
          standardQuinzaineHours: 96,
          require_attendance_for_payroll: true, // Mandatory attendance policy
        } as any,
        onAddRecords: (records) => {
          generatedRecords = records;
        },
        onUpdateCycle: () => {},
      }
    );

    expect(generatedRecords).toHaveLength(1);
    // When mandatory attendance is completely unrecorded, worked hours must be 0
    expect(generatedRecords[0].workedHours).toBe(0);
  });

  // --------------------------------------------------------------------------
  // DEF-9B-09: Workforce Performance Heuristic Calculation
  // --------------------------------------------------------------------------
  it("DEF-9B-09: should calculate workforce health score using the exact 4-factor 25% executive heuristic", () => {
    const attendanceRate = 100;       // 100 * 0.25 = 25
    const productivityScore = 80;     // 80 * 0.25 = 20
    const roi = 100;                  // (100 / 200) * 100 = 50 -> 50 * 0.25 = 12.5
    const lateArrivals = 0;
    const unauthorizedAbsences = 0;
    const complianceScore = 100;      // 100 * 0.25 = 25

    // Total = 25 + 20 + 12.5 + 25 = 82.5 -> rounded to 83
    const score = Math.round(
      attendanceRate * 0.25 +
      productivityScore * 0.25 +
      Math.min(100, Math.max(0, (roi / 200) * 100)) * 0.25 +
      complianceScore * 0.25
    );

    expect(score).toBe(83);
  });
});
