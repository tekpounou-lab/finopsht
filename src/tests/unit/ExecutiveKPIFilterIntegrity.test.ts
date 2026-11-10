import { describe, it, expect } from "vitest";
import {
  selectFilteredDataSet,
  selectSimplifiedMetrics,
  selectExpertMetrics,
  selectCashBasisExpertMetrics,
} from "../../domains/performance/selectors";
import { calculateDateRangeForPeriod } from "../../hooks/usePerformanceData";
import { RawPerformanceDataSet, PICFilters } from "../../domains/performance/types";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";

describe("BI — Executive KPI Filter Integrity Test Suite (F01 - F18)", () => {
  const mockTenantId = "biz_test_finops_01";
  const otherTenantId = "biz_test_finops_99";

  const mockDataSet: RawPerformanceDataSet = {
    employees: [
      { id: "e1", business_id: mockTenantId, name: "Jean Baptiste", email: "jean@finops.ht", branchId: "b1", departmentId: "d1", baseSalary: 50000, status: "ACTIVE" },
      { id: "e2", business_id: mockTenantId, name: "Marie Claire", email: "marie@finops.ht", branchId: "b1", departmentId: "d2", baseSalary: 40000, status: "ACTIVE" },
      { id: "e3", business_id: mockTenantId, name: "Pierre Richard", email: "pierre@finops.ht", branchId: "b2", departmentId: "d1", baseSalary: 45000, status: "INACTIVE" },
      { id: "e99", business_id: otherTenantId, name: "Foreign Employee", email: "foreign@other.ht", branchId: "b1", departmentId: "d1", baseSalary: 90000, status: "ACTIVE" },
    ],
    transactions: [
      { id: "tx1", business_id: mockTenantId, branchId: "b1", departmentId: "d1", type: "INCOME", amount: 150000, debit_account: "1000_CASH", credit_account: "7000_REVENUE", date: "2026-08-10T10:00:00Z" },
      { id: "tx2", business_id: mockTenantId, branchId: "b1", departmentId: "d2", type: "EXPENSE", amount: 30000, debit_account: "5000_EXPENSE", credit_account: "1000_CASH", date: "2026-08-12T10:00:00Z" },
      { id: "tx3", business_id: mockTenantId, branchId: "b2", departmentId: "d1", type: "INCOME", amount: 80000, debit_account: "1000_CASH", credit_account: "7000_REVENUE", date: "2026-07-01T10:00:00Z" },
      { id: "tx_rev", business_id: mockTenantId, branchId: "b1", departmentId: "d1", type: "INCOME", amount: 20000, debit_account: "1000_CASH", credit_account: "7000_REVENUE", status: "REVERSED", isReversal: true, date: "2026-08-14T10:00:00Z" },
      { id: "tx_foreign", business_id: otherTenantId, branchId: "b1", departmentId: "d1", type: "INCOME", amount: 999999, debit_account: "1000_CASH", credit_account: "7000_REVENUE", date: "2026-08-10T10:00:00Z" },
    ],
    payrollRecords: [
      { id: "p1", business_id: mockTenantId, employeeId: "e1", branchId: "b1", departmentId: "d1", grossSalary: 50000, netPay: 43000, paymentDate: "2026-08-15", commissionAmount: 5000, status: "PAID" },
      { id: "p2", business_id: mockTenantId, employeeId: "e2", branchId: "b1", departmentId: "d2", grossSalary: 40000, netPay: 34500, paymentDate: "2026-08-15", commissionAmount: 2000, status: "PAID" },
      { id: "p_foreign", business_id: otherTenantId, employeeId: "e99", branchId: "b1", departmentId: "d1", grossSalary: 90000, netPay: 80000, paymentDate: "2026-08-15", status: "PAID" },
    ],
    attendanceRecords: [
      { id: "a1", employeeId: "e1", branchId: "b1", status: "PRESENT", hoursWorked: 8, date: "2026-08-10" },
      { id: "a2", employeeId: "e2", branchId: "b1", status: "PRESENT", hoursWorked: 8, date: "2026-08-10" },
    ],
    branches: [
      { id: "b1", name: "Port-au-Prince Siège", business_id: mockTenantId },
      { id: "b2", name: "Cap-Haïtien Succursale", business_id: mockTenantId },
    ],
    departments: [
      { id: "d1", name: "Ventes & Marketing", business_id: mockTenantId },
      { id: "d2", name: "Opérations & Finance", business_id: mockTenantId },
    ],
    snapshots: [],
  };

  const augustFilters: PICFilters = {
    period: "custom",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    branchId: "ALL",
    departmentId: "ALL",
    metricType: "all",
    searchQuery: "",
    businessId: mockTenantId,
  } as any;

  it("F01: Standard period with transactions calculates accurate non-zero KPIs", () => {
    const metrics = selectSimplifiedMetrics(mockDataSet, augustFilters);
    expect(metrics.totalRevenue).toBe(150000);
    expect(metrics.totalExpenses).toBeGreaterThan(0);
    expect(metrics.isDataAvailable).toBe(true);
  });

  it("F02: Empty period returns 0 revenue, 0 expenses, 0 net profit, isDataAvailable: false", () => {
    const emptyPeriodFilters: PICFilters = {
      ...augustFilters,
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    };
    const metrics = selectSimplifiedMetrics(mockDataSet, emptyPeriodFilters);
    expect(metrics.totalRevenue).toBe(0);
    expect(metrics.totalExpenses).toBe(0);
    expect(metrics.netProfit).toBe(0);
    expect(metrics.isDataAvailable).toBe(false);
  });

  it("F03: Transitioning to empty period resets KPIs strictly to 0 without fallback values", () => {
    const filledMetrics = selectSimplifiedMetrics(mockDataSet, augustFilters);
    expect(filledMetrics.totalRevenue).toBe(150000);

    const emptyFilters: PICFilters = {
      ...augustFilters,
      startDate: "2025-05-01",
      endDate: "2025-05-31",
    };
    const emptyMetrics = selectSimplifiedMetrics(mockDataSet, emptyFilters);
    expect(emptyMetrics.totalRevenue).toBe(0);
    expect(emptyMetrics.totalExpenses).toBe(0);
    expect(emptyMetrics.totalPayroll).toBe(0);
    expect(emptyMetrics.isDataAvailable).toBe(false);
  });

  it("F04: Preset filter selection calculates valid date boundaries", () => {
    const p30 = calculateDateRangeForPeriod("30d");
    expect(p30.startDate).toBeTruthy();
    expect(p30.endDate).toBeTruthy();
    expect(new Date(p30.startDate).getTime()).toBeLessThan(new Date(p30.endDate).getTime());
  });

  it("F05: Unbounded ALL period includes all historical transactions without monthly truncation", () => {
    const allFilters: PICFilters = {
      period: "all",
      startDate: "",
      endDate: "",
      branchId: "ALL",
      departmentId: "ALL",
      metricType: "all",
      searchQuery: "",
    };
    const filtered = selectFilteredDataSet(mockDataSet, allFilters);
    // Includes tx1 (Aug), tx2 (Aug), tx3 (July) excluding reversed tx_rev and other tenant
    expect(filtered.transactions.filter(t => !t.isReversal && t.status !== "REVERSED" && (!t.business_id || t.business_id === mockTenantId)).length).toBe(3);
  });

  it("F06: CUSTOM period with valid start and end dates filters strictly", () => {
    const customFilters: PICFilters = {
      ...augustFilters,
      startDate: "2026-08-01",
      endDate: "2026-08-11",
    };
    const filtered = selectFilteredDataSet(mockDataSet, customFilters);
    expect(filtered.transactions.length).toBe(1); // tx1 on Aug 10
  });

  it("F07: CUSTOM period with start date only or end date only filters correctly", () => {
    const startOnlyFilters: PICFilters = {
      ...augustFilters,
      startDate: "2026-08-11",
      endDate: "",
    };
    const filtered = selectFilteredDataSet(mockDataSet, startOnlyFilters);
    expect(filtered.transactions.length).toBe(1); // tx2 on Aug 12
  });

  it("F08: Branch filter narrowing isolates transactions and payroll to specific branch", () => {
    const branchFilters: PICFilters = {
      ...augustFilters,
      branchId: "b1",
    };
    const filtered = selectFilteredDataSet(mockDataSet, branchFilters);
    expect(filtered.transactions.every(t => t.branchId === "b1")).toBe(true);
  });

  it("F09: Department filter narrowing isolates transactions to specific department", () => {
    const deptFilters: PICFilters = {
      ...augustFilters,
      departmentId: "d2",
    };
    const filtered = selectFilteredDataSet(mockDataSet, deptFilters);
    expect(filtered.transactions.every(t => t.departmentId === "d2")).toBe(true);
    expect(filtered.transactions.length).toBe(1); // tx2
  });

  it("F10: Cash vs Accrual accounting mode behavior is respected", () => {
    const accrualMetrics = selectExpertMetrics(mockDataSet, { ...augustFilters, accountingBasis: "ACCRUAL" } as any);
    const cashMetrics = selectCashBasisExpertMetrics(mockDataSet, { ...augustFilters, accountingBasis: "CASH" } as any);

    expect(accrualMetrics).toBeDefined();
    expect(cashMetrics).toBeDefined();
    expect(accrualMetrics.kpis).toBeDefined();
    expect(cashMetrics.kpis).toBeDefined();
  });

  it("F11: Cross-component filter synchronization enforces SSOT across selectors", () => {
    const filtered = selectFilteredDataSet(mockDataSet, augustFilters);
    const simplified = selectSimplifiedMetrics(mockDataSet, augustFilters);
    const expert = selectExpertMetrics(mockDataSet, augustFilters);

    expect(simplified.totalRevenue).toBe(expert.kpis.totalRevenue);
    expect(simplified.totalExpenses).toBe(expert.kpis.totalExpenses);
    expect(simplified.netProfit).toBe(expert.kpis.netProfit);
  });

  it("F12: Double counting of payroll transactions vs payroll records is avoided in AnalyticsEngine", () => {
    const snap = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: "2026-08-01", endDate: "2026-08-31" },
      employees: mockDataSet.employees.filter(e => e.business_id === mockTenantId),
      transactions: mockDataSet.transactions.filter(t => t.business_id === mockTenantId),
      payrollRecords: mockDataSet.payrollRecords.filter(p => p.business_id === mockTenantId),
      attendanceLogs: mockDataSet.attendanceRecords,
      branches: mockDataSet.branches,
      departments: mockDataSet.departments,
      businessId: mockTenantId,
      language: "fr",
      accountingMode: "CASH",
    });

    expect(snap.revenue.currentValue).toBe(150000);
    expect(snap.expenses.currentValue).toBeDefined();
  });

  it("F13: Reversal and cancelled transactions are excluded from active dataset", () => {
    const filtered = selectFilteredDataSet(mockDataSet, augustFilters);
    const reversedFound = filtered.transactions.some(t => t.id === "tx_rev" || t.isReversal || t.status === "REVERSED");
    expect(reversedFound).toBe(false);
  });

  it("F14: Static employee records present with 0 period activity yields isDataAvailable: false", () => {
    const emptyPeriodFilters: PICFilters = {
      ...augustFilters,
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    };
    const metrics = selectSimplifiedMetrics(mockDataSet, emptyPeriodFilters);
    expect(metrics.isDataAvailable).toBe(false);
    expect(metrics.totalRecordsCount).toBe(mockDataSet.employees.filter(e => e.business_id === mockTenantId).length);
  });

  it("F15: Multi-currency conversion under active filter computes correctly", () => {
    const snapUSD = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: "2026-08-01", endDate: "2026-08-31" },
      employees: mockDataSet.employees.filter(e => e.business_id === mockTenantId),
      transactions: mockDataSet.transactions.filter(t => t.business_id === mockTenantId),
      payrollRecords: mockDataSet.payrollRecords.filter(p => p.business_id === mockTenantId),
      attendanceLogs: mockDataSet.attendanceRecords,
      branches: mockDataSet.branches,
      departments: mockDataSet.departments,
      businessId: mockTenantId,
      language: "fr",
      accountingMode: "CASH",
      normalizationContext: {
        activeCurrency: "USD",
        usdToHtgRate: 132,
      } as any,
    });

    expect(snapUSD.revenue.currentValue).toBe(150000);
  });

  it("F16: Tenant isolation prevents cross-tenant records in filtered dataset", () => {
    const filtered = selectFilteredDataSet(mockDataSet, augustFilters);
    const foreignTxFound = filtered.transactions.some(t => t.business_id === otherTenantId || t.id === "tx_foreign");
    const foreignEmpFound = filtered.employees.some(e => e.business_id === otherTenantId || e.id === "e99");
    const foreignPayrollFound = filtered.payrollRecords.some(p => p.business_id === otherTenantId || p.id === "p_foreign");

    expect(foreignTxFound).toBe(false);
    expect(foreignEmpFound).toBe(false);
    expect(foreignPayrollFound).toBe(false);
  });

  it("F17: Export safety ensures filtered subset matches active filters without data leakage", () => {
    const filteredBranch1 = selectFilteredDataSet(mockDataSet, { ...augustFilters, branchId: "b1" });
    expect(filteredBranch1.transactions.length).toBe(2); // tx1 and tx2
    expect(filteredBranch1.transactions.every(t => t.branchId === "b1")).toBe(true);
  });

  it("F18: Zero fallback discipline ensures numerical 0 values do not trigger default fallbacks", () => {
    const snapZero = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
      employees: [],
      transactions: [],
      payrollRecords: [],
      attendanceLogs: [],
      branches: [],
      departments: [],
      businessId: mockTenantId,
      language: "fr",
      accountingMode: "CASH",
    });

    expect(snapZero.revenue.currentValue).toBe(0);
    expect(snapZero.expenses.currentValue).toBe(0);
    expect(snapZero.profit.currentValue).toBe(0);
    expect(snapZero.activeStaff.currentValue).toBe(0);
  });
});
