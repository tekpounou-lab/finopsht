/**
 * FINOPS ERP — Performance Intelligence Data Integrity & Filter Integration Test Suite
 *
 * Verifies exact data integrity, date range filtering, mode semantics, zero-observation guards,
 * currency consistency, and cross-tab filter propagation for Performance Intelligence.
 */

import { describe, it, expect } from "vitest";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { ExecutiveAlertEngine } from "../../domains/analytics/services/ExecutiveAlertEngine";
import { FinancialRatioEngine } from "../../services/cfo/FinancialRatioEngine";
import { selectSimplifiedMetrics, selectExpertMetrics } from "../../domains/performance/selectors";
import type { Employee, LedgerTransaction, AttendanceRecord, PayrollRecord, Branch, Department } from "../../types";

describe("Performance Intelligence Data Integrity & Cross-Tab Verification", () => {
  // Mock Data Setup
  const mockBranches: Branch[] = [
    { id: "b_cap", name: "Cap-Haïtien", business_id: "biz_test_01", status: "ACTIVE" },
    { id: "b_paup", name: "Port-au-Prince", business_id: "biz_test_01", status: "ACTIVE" },
  ];

  const mockDepartments: Department[] = [
    { id: "dept_sales", name: "Ventes", business_id: "biz_test_01" },
    { id: "dept_ops", name: "Opérations", business_id: "biz_test_01" },
  ];

  const mockEmployees: Employee[] = [
    {
      id: "emp_1",
      name: "Jean Baptiste",
      email: "jean@test.com",
      branchId: "b_cap",
      departmentId: "dept_sales",
      role: "SENIOR_TELLER",
      status: "ACTIVE",
      isActive: true,
      business_id: "biz_test_01",
      baseSalary: 25000,
      paymentModel: "FIXED",
      contractualHoursPerWeek: 40,
      workingDaysPerWeek: 5,
    } as any,
    {
      id: "emp_2",
      name: "Marie Claire",
      email: "marie@test.com",
      branchId: "b_paup",
      departmentId: "dept_ops",
      role: "JUNIOR_TELLER",
      status: "ACTIVE",
      isActive: true,
      business_id: "biz_test_01",
      baseSalary: 20000,
      paymentModel: "FIXED",
      contractualHoursPerWeek: 40,
      workingDaysPerWeek: 5,
    } as any,
  ];

  // Historical transactions in early September 2026
  const mockHistoricalTransactions: LedgerTransaction[] = [
    {
      id: "tx_hist_1",
      business_id: "biz_test_01",
      branchId: "b_cap",
      departmentId: "dept_sales",
      type: "INCOME",
      amount: 50000,
      amount_cents: 5000000,
      currency: "HTG",
      date: "2026-09-01",
      status: "POSTED",
      isSettled: true,
      debit_account: "1000_CASH",
      credit_account: "4000_REVENUE",
      description: "Sample income",
      category: "VENTE",
      isImmutable: true,
      createdBy: "usr_system",
      createdAt: "2026-09-01T10:00:00Z",
      signerId: "sys_signer",
      source: "MANUAL",
    },
    {
      id: "tx_hist_2",
      business_id: "biz_test_01",
      branchId: "b_paup",
      departmentId: "dept_ops",
      type: "EXPENSE",
      amount: 10000,
      amount_cents: 1000000,
      currency: "HTG",
      date: "2026-09-10",
      status: "POSTED",
      isSettled: true,
      debit_account: "5000_EXPENSE",
      credit_account: "1000_CASH",
      description: "Sample expense",
      category: "OPEX",
      isImmutable: true,
      createdBy: "usr_system",
      createdAt: "2026-09-10T10:00:00Z",
      signerId: "sys_signer",
      source: "MANUAL",
    },
  ];

  // 1. Scenario 1: Date Range Filtering in Simple Mode (Cash Basis) for Empty Period
  it("Scenario 1: Returns 0.00 HTG inflows/outflows for date range with zero transactions (Simple / CASH Mode)", () => {
    const emptyPeriodRange = { startDate: "2026-09-26", endDate: "2026-10-26" };

    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: emptyPeriodRange,
      employees: mockEmployees,
      transactions: mockHistoricalTransactions, // transactions are outside range
      attendanceLogs: [],
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz_test_01",
      accountingMode: "CASH",
    });

    expect(snapshot.revenue.currentValue).toBe(0);
    expect(snapshot.expenses.currentValue).toBe(0);
    expect(snapshot.profit.currentValue).toBe(0);
    expect(snapshot.revenue.state).toBe("VALID_ZERO");
    expect(snapshot.expenses.state).toBe("VALID_ZERO");
  });

  // 2. Scenario 2: Date Range Filtering in Expert Mode (Accrual Basis) for Empty Period
  it("Scenario 2: Returns 0.00 HTG revenue/expenses for date range with zero transactions (Expert / ACCRUAL Mode)", () => {
    const emptyPeriodRange = { startDate: "2026-09-26", endDate: "2026-10-26" };

    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: emptyPeriodRange,
      employees: mockEmployees,
      transactions: mockHistoricalTransactions,
      attendanceLogs: [],
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz_test_01",
      accountingMode: "ACCRUAL",
    });

    expect(snapshot.revenue.currentValue).toBe(0);
    expect(snapshot.expenses.currentValue).toBe(0);
    expect(snapshot.profit.currentValue).toBe(0);
  });

  // 3. Scenario 3: Historical Treasury Balance Persistence
  it("Scenario 3: Preserves historical cumulative cash balance as of end date even during empty periods", () => {
    const emptyPeriodRange = { startDate: "2026-09-26", endDate: "2026-10-26" };

    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: emptyPeriodRange,
      employees: mockEmployees,
      transactions: mockHistoricalTransactions, // 50,000 in - 10,000 out = 40,000 HTG historical balance
      attendanceLogs: [],
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz_test_01",
      accountingMode: "CASH",
    });

    // Cumulative historical cash on hand should be 40,000 HTG
    expect(snapshot.cashOnHand.currentValue).toBe(40000);
  });

  // 4. Scenario 4: Zero-Observation Attendance Guard
  it("Scenario 4: Returns 0% attendance and 0% absenteeism when no attendance records exist for the period", () => {
    const emptyPeriodRange = { startDate: "2026-09-26", endDate: "2026-10-26" };

    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: emptyPeriodRange,
      employees: mockEmployees,
      transactions: [],
      attendanceLogs: [], // No attendance logs in period
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz_test_01",
      accountingMode: "CASH",
    });

    expect(snapshot.attendanceRate.currentValue).toBe(0);
    expect(snapshot.attendanceRate.state).toBe("VALID_ZERO");
    expect(snapshot.attendanceFrequency!.currentValue).toBe(0);
    expect(snapshot.attendanceFrequency!.state).toBe("VALID_ZERO");
    expect(snapshot.absenceRate.currentValue).toBe(0);
    expect(snapshot.latenessRate.currentValue).toBe(0);
  });

  // 5. Scenario 5: Active Staff KPI in Empty Period
  it("Scenario 5: Active staff count in period reflects 0 workers active in period when no attendance/payroll exists", () => {
    const emptyPeriodRange = { startDate: "2026-09-26", endDate: "2026-10-26" };

    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: emptyPeriodRange,
      employees: mockEmployees,
      transactions: [],
      attendanceLogs: [],
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz_test_01",
      accountingMode: "CASH",
    });

    expect(snapshot.activeStaff.currentValue).toBe(0);
  });

  // 6. Scenario 6: ExecutiveAlertEngine False Alarm Suppression
  it("Scenario 6: ExecutiveAlertEngine suppresses false revenue drop and 100% absenteeism alerts on empty periods", () => {
    const emptyPeriodRange = { startDate: "2026-09-26", endDate: "2026-10-26" };

    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: emptyPeriodRange,
      employees: mockEmployees,
      transactions: [],
      attendanceLogs: [],
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz_test_01",
      accountingMode: "CASH",
    });

    const alerts = ExecutiveAlertEngine.generateAlerts(snapshot);

    const hasFalseRevenueDropAlert = alerts.some((a) => a.id === "alert_rev_drop");
    const hasFalseAbsenteeismAlert = alerts.some((a) => a.id === "alert_absenteeism_rising");
    const hasFalseLowAttendanceAlert = alerts.some((a) => a.id === "alert_low_attendance");

    expect(hasFalseRevenueDropAlert).toBe(false);
    expect(hasFalseAbsenteeismAlert).toBe(false);
    expect(hasFalseLowAttendanceAlert).toBe(false);
  });

  // 7. Scenario 7: Branch Scope Isolation
  it("Scenario 7: Strictly isolates transactions to the selected branch when branch filter is applied", () => {
    const periodRange = { startDate: "2026-09-01", endDate: "2026-09-30" };

    const capOnlyTxs = mockHistoricalTransactions.filter((t) => t.branchId === "b_cap");

    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: periodRange,
      employees: mockEmployees.filter((e) => e.branchId === "b_cap"),
      transactions: capOnlyTxs,
      attendanceLogs: [],
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz_test_01",
      accountingMode: "CASH",
    });

    // Cap-Haïtien branch has 50,000 HTG revenue
    expect(snapshot.revenue.currentValue).toBe(50000);
    expect(snapshot.expenses.currentValue).toBe(0);
  });

  // 8. Scenario 8: Department Scope Isolation
  it("Scenario 8: Strictly isolates transactions to the selected department when department filter is applied", () => {
    const periodRange = { startDate: "2026-09-01", endDate: "2026-09-30" };

    const opsOnlyTxs = mockHistoricalTransactions.filter((t) => t.departmentId === "dept_ops");

    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: periodRange,
      employees: mockEmployees.filter((e) => e.departmentId === "dept_ops"),
      transactions: opsOnlyTxs,
      attendanceLogs: [],
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz_test_01",
      accountingMode: "ACCRUAL",
    });

    // Opérations department has 10,000 HTG expense and 0 revenue
    expect(snapshot.revenue.currentValue).toBe(0);
    expect(snapshot.expenses.currentValue).toBe(10000);
  });

  // 9. Scenario 9: FinancialRatioEngine Semantic State Handling
  it("Scenario 9: FinancialRatioEngine returns ZERO / NO_DATA semantic states for empty snapshots without errors", () => {
    const emptySnapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: "2026-09-26", endDate: "2026-10-26" },
      employees: mockEmployees,
      transactions: [],
      attendanceLogs: [],
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz_test_01",
      accountingMode: "CASH",
    });

    const report = FinancialRatioEngine.calculate({
      business: { id: "biz_test_01", currency: "HTG" },
      snapshot: emptySnapshot,
    });

    expect(report.metrics.profit_ratio).toBe("INDÉTERMINÉ (0/0)");
    expect(report.semantic_states?.revenue).toBe("ZERO");
    expect(report.semantic_states?.expense).toBe("ZERO");
  });

  // 10. Scenario 10: Idempotency & Re-entrancy
  it("Scenario 10: Repeated snapshot calculations with identical parameters yield identical results", () => {
    const params = {
      period: "CUSTOM" as const,
      customRange: { startDate: "2026-09-01", endDate: "2026-09-30" },
      employees: mockEmployees,
      transactions: mockHistoricalTransactions,
      attendanceLogs: [],
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz_test_01",
      accountingMode: "ACCRUAL" as const,
    };

    const run1 = AnalyticsEngine.generateSnapshot(params);
    const run2 = AnalyticsEngine.generateSnapshot(params);

    expect(run1.revenue.currentValue).toBe(run2.revenue.currentValue);
    expect(run1.expenses.currentValue).toBe(run2.expenses.currentValue);
    expect(run1.profit.currentValue).toBe(run2.profit.currentValue);
    expect(run1.cashOnHand.currentValue).toBe(run2.cashOnHand.currentValue);
  });

  // 11. Scenario 11: Non-Computable (null / NO_DATA) Attendance When Contractual Profile Is Incomplete
  it("Scenario 11: Returns null (NO_DATA) instead of 0% or 95% when contractual hours are not configured", () => {
    const periodRange = { startDate: "2026-09-01", endDate: "2026-09-30" };
    const unconfiguredEmployees: Employee[] = mockEmployees.map(
      ({ contractualHoursPerWeek, workingDaysPerWeek, ...rest }: any) => rest
    );

    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: periodRange,
      employees: unconfiguredEmployees,
      transactions: mockHistoricalTransactions,
      attendanceLogs: [],
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz_test_01",
      accountingMode: "ACCRUAL",
    });

    expect(snapshot.attendanceRate.currentValue).toBeNull();
    expect(snapshot.attendanceRate.state).toBe("NO_DATA");
    expect(snapshot.attendanceFrequency!.currentValue).toBeNull();
    expect(snapshot.attendanceFrequency!.state).toBe("NO_DATA");

    const raw = {
      employees: unconfiguredEmployees,
      transactions: mockHistoricalTransactions,
      payrollRecords: [],
      attendanceRecords: [],
      snapshots: [],
      branches: mockBranches,
      departments: mockDepartments,
    };
    const filters = {
      period: "custom" as const,
      startDate: periodRange.startDate,
      endDate: periodRange.endDate,
      branchId: "ALL",
      departmentId: "ALL",
      metricType: "all" as const,
      searchQuery: "",
      accountingBasis: "ACCRUAL" as const,
    };

    const simplified = selectSimplifiedMetrics(raw, filters);
    const expert = selectExpertMetrics(raw, filters);

    expect(simplified.attendanceRate).toBeNull();
    expect(expert.branches.every((b) => b.attendanceRate === null)).toBe(true);
    expect(expert.departments.every((d) => d.attendanceRate === null)).toBe(true);
  });
});
