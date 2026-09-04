import { describe, it, expect } from "vitest";
import {
  selectFilteredDataSet,
  selectSimplifiedMetrics,
  selectExpertMetrics,
} from "../../domains/performance/selectors";
import { calculateDateRangeForPeriod } from "../../hooks/usePerformanceData";
import { RawPerformanceDataSet, PICFilters } from "../../domains/performance/types";

describe("Performance Intelligence Center (PIC) Module", () => {
  const mockDataSet: RawPerformanceDataSet = {
    employees: [
      { id: "e1", name: "Jean Baptiste", email: "jean@finops.ht", branchId: "b1", departmentId: "d1", baseSalary: 50000, status: "ACTIVE" },
      { id: "e2", name: "Marie Claire", email: "marie@finops.ht", branchId: "b1", departmentId: "d2", baseSalary: 40000, status: "ACTIVE" },
      { id: "e3", name: "Pierre Richard", email: "pierre@finops.ht", branchId: "b2", departmentId: "d1", baseSalary: 45000, status: "INACTIVE" },
    ],
    transactions: [
      { id: "tx1", business_id: "biz1", branchId: "b1", departmentId: "d1", type: "INCOME", amount: 150000, date: "2026-08-10T10:00:00Z" },
      { id: "tx2", business_id: "biz1", branchId: "b1", departmentId: "d2", type: "EXPENSE", amount: 30000, date: "2026-08-12T10:00:00Z" },
      { id: "tx3", business_id: "biz1", branchId: "b2", departmentId: "d1", type: "INCOME", amount: 80000, date: "2026-07-01T10:00:00Z" },
    ],
    payrollRecords: [
      { id: "p1", employeeId: "e1", branchId: "b1", departmentId: "d1", grossSalary: 50000, netPay: 43000, paymentDate: "2026-08-15", commissionAmount: 5000 },
      { id: "p2", employeeId: "e2", branchId: "b1", departmentId: "d2", grossSalary: 40000, netPay: 34500, paymentDate: "2026-08-15", commissionAmount: 2000 },
    ],
    attendanceRecords: [
      { id: "a1", employeeId: "e1", branchId: "b1", status: "PRESENT", hoursWorked: 8, date: "2026-08-10" },
      { id: "a2", employeeId: "e2", branchId: "b1", status: "PRESENT", hoursWorked: 8, date: "2026-08-10" },
      { id: "a3", employeeId: "e3", branchId: "b2", status: "ABSENT", hoursWorked: 0, date: "2026-08-10" },
    ],
    branches: [
      { id: "b1", name: "Port-au-Prince Siège" },
      { id: "b2", name: "Cap-Haïtien Succursale" },
    ],
    departments: [
      { id: "d1", name: "Ventes & Marketing" },
      { id: "d2", name: "Opérations & Finance" },
    ],
    snapshots: [],
  };

  const defaultFilters: PICFilters = {
    period: "30d",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    branchId: "ALL",
    departmentId: "ALL",
    metricType: "all",
    searchQuery: "",
  };

  it("1. Correctly calculates date ranges for standard presets", () => {
    const range30 = calculateDateRangeForPeriod("30d");
    expect(range30.startDate).toBeDefined();
    expect(range30.endDate).toBeDefined();
    expect(range30.startDate < range30.endDate).toBe(true);

    const range7 = calculateDateRangeForPeriod("7d");
    expect(range7.startDate).toBeDefined();
    expect(range7.startDate < range7.endDate).toBe(true);
  });

  it("2. Filters data correctly by branch ID", () => {
    const branchFilters: PICFilters = {
      ...defaultFilters,
      branchId: "b1",
    };

    const filtered = selectFilteredDataSet(mockDataSet, branchFilters);
    expect(filtered.employees.length).toBe(2);
    expect(filtered.employees.every((e) => e.branchId === "b1")).toBe(true);
    expect(filtered.transactions.length).toBe(2);
    expect(filtered.payrollRecords.length).toBe(2);
  });

  it("3. Filters data correctly by department ID", () => {
    const deptFilters: PICFilters = {
      ...defaultFilters,
      departmentId: "d1",
    };

    const filtered = selectFilteredDataSet(mockDataSet, deptFilters);
    expect(filtered.employees.length).toBe(2);
    expect(filtered.employees.every((e) => e.departmentId === "d1")).toBe(true);
    expect(filtered.transactions.length).toBe(1); // tx1 (in August)
    expect(filtered.payrollRecords.length).toBe(1); // p1
  });

  it("4. Filters data accurately by date range", () => {
    const dateFilters: PICFilters = {
      ...defaultFilters,
      startDate: "2026-08-11",
      endDate: "2026-08-20",
    };

    const filtered = selectFilteredDataSet(mockDataSet, dateFilters);
    expect(filtered.transactions.length).toBe(1); // tx2 on 2026-08-12
    expect(filtered.payrollRecords.length).toBe(2); // p1 and p2 on 2026-08-15
  });

  it("5. Computes simplified metrics accurately for Mode Simplifié", () => {
    const metrics = selectSimplifiedMetrics(mockDataSet, defaultFilters);
    expect(metrics.isDataAvailable).toBe(true);
    expect(metrics.totalPayroll).toBe(90000); // 50000 + 40000
    expect(metrics.totalCommissions).toBe(7000); // 5000 + 2000
    expect(metrics.totalRevenue).toBe(150000); // tx1 in Aug
    expect(metrics.totalExpenses).toBe(30000); // tx2 in Aug
    expect(metrics.netProfit).toBe(120000);
    expect(metrics.profitMargin).toBe(80);
    expect(metrics.activeHeadcount).toBe(2);
  });

  it("6. Handles empty state when filters match no data", () => {
    const emptyFilters: PICFilters = {
      ...defaultFilters,
      branchId: "non_existent_branch",
    };

    const metrics = selectSimplifiedMetrics(mockDataSet, emptyFilters);
    expect(metrics.isDataAvailable).toBe(false);
    expect(metrics.totalRecordsCount).toBe(0);
  });

  it("7. Computes expert breakdowns and cross-table matrix for Mode Expert", () => {
    const expert = selectExpertMetrics(mockDataSet, defaultFilters);
    expect(expert.isDataAvailable).toBe(true);
    expect(expert.departments.length).toBeGreaterThanOrEqual(2);
    expect(expert.branches.length).toBeGreaterThanOrEqual(1);
    expect(expert.employeeRankings.length).toBe(3);
    expect(expert.crossTableMatrix.length).toBeGreaterThanOrEqual(1);
  });
});
