import { describe, it, expect } from "vitest";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { BusinessSettingsService } from "../../services/business/BusinessSettingsService";
import { LedgerTransaction, PayrollRecord, PayrollCycle, AttendanceRecord, Employee } from "../../types";

describe("Workforce & Analytics SSOT Integration", () => {
  const range = {
    startDate: "2026-07-01",
    endDate: "2026-07-15",
  };

  const cycleMap = new Map<string, PayrollCycle>();
  cycleMap.set("cycle_q1", {
    id: "cycle_q1",
    startDate: "2026-07-01",
    endDate: "2026-07-15",
    status: "PAID",
    label: "Q1",
  } as PayrollCycle);

  it("strictly excludes all payroll-related transactions from operational expenses (Anti-Double-Count)", () => {
    const mixedTxs: LedgerTransaction[] = [
      // True operational expenses
      {
        id: "tx_rent",
        business_id: "biz_001",
        type: "EXPENSE",
        category: "Rent",
        description: "Bureaux Port-au-Prince",
        amount: 25000,
        status: "POSTED",
        date: "2026-07-05",
      } as LedgerTransaction,
      {
        id: "tx_util",
        business_id: "biz_001",
        type: "EXPENSE",
        category: "Utilities",
        description: "Électricité EDH",
        amount: 5000,
        status: "POSTED",
        date: "2026-07-10",
      } as LedgerTransaction,
      // Operational bonus outside of payroll cycle
      {
        id: "tx_vendor_bonus",
        business_id: "biz_001",
        type: "BONUS",
        description: "Prime ponctuelle fournisseur",
        amount: 1500,
        status: "POSTED",
        date: "2026-07-08",
      } as LedgerTransaction,

      // Payroll-related transactions (MUST BE EXCLUDED from operational expenses)
      {
        id: "tx_pay_accrual",
        business_id: "biz_001",
        type: "PAYROLL",
        description: "Payroll Accrual Cycle Q1",
        amount: 100000,
        status: "POSTED",
        date: "2026-07-15",
      } as LedgerTransaction,
      {
        id: "tx_pay_disburse",
        business_id: "biz_001",
        type: "EXPENSE",
        category: "Payroll",
        description: "Virement Salaires",
        amount: 80000,
        status: "POSTED",
        date: "2026-07-15",
      } as LedgerTransaction,
      {
        id: "tx_pay_cycle_linked",
        business_id: "biz_001",
        type: "EXPENSE",
        category: "Operations",
        description: "Disbursement",
        metadata: { payrollCycleId: "cycle_q1" },
        amount: 20000,
        status: "POSTED",
        date: "2026-07-15",
      } as LedgerTransaction,
    ];

    const opExpenses = AnalyticsEngine.computeOperationalExpenses(mixedTxs, range, "biz_001");

    // Only rent (25000) + utilities (5000) + vendor bonus (1500) = 31500
    expect(opExpenses).toBe(31500);
  });

  it("calculates payroll cost exclusively from sealed / validated payroll records with proration", () => {
    const payrollRecords: PayrollRecord[] = [
      {
        id: "pr_1",
        business_id: "biz_001",
        employeeId: "emp_1",
        cycleId: "cycle_q1",
        period_start: "2026-07-01",
        period_end: "2026-07-15",
        grossSalary: 50000,
        gross_salary_cents: 5000000,
        commission_cents: 1000000, // 10,000 HTG
        penalties: 0,
        status: "VALIDATED",
        isExcluded: false,
      } as unknown as PayrollRecord,
      {
        id: "pr_2",
        business_id: "biz_001",
        employeeId: "emp_2",
        cycleId: "cycle_q1",
        period_start: "2026-07-01",
        period_end: "2026-07-15",
        grossSalary: 30000,
        gross_salary_cents: 3000000,
        commission_cents: 500000, // 5,000 HTG
        penalties: 1000,
        status: "PAID",
        isExcluded: false,
      } as unknown as PayrollRecord,
      // Cancelled record: must be excluded
      {
        id: "pr_cancelled",
        business_id: "biz_001",
        employeeId: "emp_3",
        cycleId: "cycle_q1",
        period_start: "2026-07-01",
        period_end: "2026-07-15",
        grossSalary: 40000,
        gross_salary_cents: 4000000,
        status: "CANCELLED",
        isExcluded: false,
      } as unknown as PayrollRecord,
    ];

    // Without employer taxes
    const costWithoutTaxes = AnalyticsEngine.computePayrollCost(payrollRecords, range, false, cycleMap);
    // pr_1: 50000 gross. pr_2: 30000 gross. Total = 80000
    expect(costWithoutTaxes).toBe(80000);

    // Total expenses must be exactly operational expenses (31500) + payroll cost (80000) = 111500
    const totalExpenses = 31500 + costWithoutTaxes;
    expect(totalExpenses).toBe(111500);
  });

  it("calculates attendance rate dynamically based on worked hours over expected hours without penalties", () => {
    // 15 days range (11 working days Monday-Friday, standard 8h/day = 88h or 96h quinzaine standard)
    const standardQuinzaineHours = BusinessSettingsService.DEFAULT_STANDARD_QUINZAINE_HOURS; // 96h
    expect(standardQuinzaineHours).toBe(96);

    const expectedHours = AnalyticsEngine.getExpectedWorkingHours(range.startDate, range.endDate, 8, 96);
    expect(expectedHours).toBe(96);

    // If an employee worked 96 hours out of 96 expected hours -> attendance is 100%
    const workedHours = 96;
    const rate = Math.min(100, Math.max(0, parseFloat(((workedHours / expectedHours) * 100).toFixed(1))));
    expect(rate).toBe(100);

    // If employee worked 72 hours out of 96 expected hours -> 75%
    const partialWorked = 72;
    const partialRate = Math.min(100, Math.max(0, parseFloat(((partialWorked / expectedHours) * 100).toFixed(1))));
    expect(partialRate).toBe(75);
  });

  it("calculates HR ROI and Payroll to Revenue ratio accurately", () => {
    const revenue = 500000;
    const payrollCost = 100000;

    const roi = AnalyticsEngine.computeHRROI(revenue, payrollCost);
    expect(roi).toBe(5); // 500,000 / 100,000 = 5.0x

    const ratio = AnalyticsEngine.computePayrollRatio(payrollCost, revenue);
    expect(ratio).toBe(20); // (100,000 / 500,000) * 100 = 20%
  });
});
