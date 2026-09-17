import { describe, it, expect } from "vitest";
import {
  matchesDateFilter,
  toDateOnly,
  resolveAnalyticsTxDate,
  resolveAnalyticsAttendanceDate,
  resolveAnalyticsPayrollDate,
} from "../../utils/dateNormalization";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { LedgerTransaction, Employee, AttendanceRecord, PayrollRecord, Branch, Department } from "../../types";

describe("Forensic Date Filtering & Boundary Integrity", () => {
  describe("matchesDateFilter Unit Tests", () => {
    it("should reject records with missing or invalid date when filter is active", () => {
      expect(matchesDateFilter(undefined, "2026-03-01", "2026-03-31")).toBe(false);
      expect(matchesDateFilter(null, "2026-03-01", "2026-03-31")).toBe(false);
      expect(matchesDateFilter("", "2026-03-01", "2026-03-31")).toBe(false);
      expect(matchesDateFilter("invalid-date", "2026-03-01", "2026-03-31")).toBe(false);
    });

    it("should accept any record when no date filters are set", () => {
      expect(matchesDateFilter(undefined, undefined, undefined)).toBe(true);
      expect(matchesDateFilter(null, "", "")).toBe(true);
      expect(matchesDateFilter("2026-03-15", undefined, undefined)).toBe(true);
    });

    it("should accurately test boundary conditions (start, inside, end, before, after)", () => {
      const start = "2026-03-01";
      const end = "2026-03-31";

      expect(matchesDateFilter("2026-03-01", start, end)).toBe(true);
      expect(matchesDateFilter("2026-03-15", start, end)).toBe(true);
      expect(matchesDateFilter("2026-03-31", start, end)).toBe(true);
      expect(matchesDateFilter("2026-02-28", start, end)).toBe(false);
      expect(matchesDateFilter("2026-04-01", start, end)).toBe(false);
    });

    it("should handle ISO datetime strings with timezone correctly", () => {
      expect(matchesDateFilter("2026-03-15T18:30:00.000Z", "2026-03-01", "2026-03-31")).toBe(true);
      expect(matchesDateFilter("2026-04-01T00:00:00.000Z", "2026-03-01", "2026-03-31")).toBe(false);
    });
  });

  describe("Date Resolvers", () => {
    it("resolveAnalyticsTxDate selects correct date based on cash vs accrual mode", () => {
      const tx = {
        date: "2026-03-10",
        effectiveDate: "2026-03-15",
        accountingDate: "2026-03-20",
      };

      // In Cash-Basis (isCashBasis = true) -> prefers effectiveDate/paymentDate
      expect(resolveAnalyticsTxDate(tx as any, true)).toBe("2026-03-15");
      // In Accrual-Basis (isCashBasis = false) -> prefers accountingDate
      expect(resolveAnalyticsTxDate(tx as any, false)).toBe("2026-03-20");
    });

    it("resolveAnalyticsAttendanceDate resolves attendance date", () => {
      const att1: Partial<AttendanceRecord> = { date: "2026-03-12" };
      const att2: Partial<AttendanceRecord> = { timestamp: "2026-03-14T08:00:00Z" } as any;
      expect(resolveAnalyticsAttendanceDate(att1 as AttendanceRecord)).toBe("2026-03-12");
      expect(resolveAnalyticsAttendanceDate(att2 as AttendanceRecord)).toBe("2026-03-14");
    });

    it("resolveAnalyticsPayrollDate resolves paymentDate in cash mode and period_end in accrual mode", () => {
      const p = {
        period_start: "2026-03-01",
        period_end: "2026-03-31",
        paymentDate: "2026-04-05",
      };
      expect(resolveAnalyticsPayrollDate(p as any, true)).toBe("2026-04-05");
      expect(resolveAnalyticsPayrollDate(p as any, false)).toBe("2026-03-31");
    });
  });

  describe("AnalyticsEngine Snapshot Generation with Strict Boundary Filtering", () => {
    const businessId = "biz-test-01";

    const employees: Employee[] = [
      {
        id: "emp-1",
        business_id: businessId,
        firstName: "Jean",
        lastName: "Baptiste",
        name: "Jean Baptiste",
        email: "jean@example.com",
        branchId: "branch-1",
        departmentId: "dept-1",
        status: "ACTIVE",
        baseSalary: 50000,
        paymentModel: "MONTHLY",
        role: "TELLER",
      } as unknown as Employee,
    ];

    const branches: Branch[] = [{ id: "branch-1", name: "Port-au-Prince", business_id: businessId }];
    const departments: Department[] = [{ id: "dept-1", name: "Operations", business_id: businessId }];

    const transactions: LedgerTransaction[] = [
      {
        id: "tx-in-range",
        business_id: businessId,
        type: "INCOME",
        amount: 100000,
        date: "2026-03-15",
        status: "POSTED",
      } as LedgerTransaction,
      {
        id: "tx-before-range",
        business_id: businessId,
        type: "INCOME",
        amount: 50000,
        date: "2026-02-15",
        status: "POSTED",
      } as LedgerTransaction,
      {
        id: "tx-after-range",
        business_id: businessId,
        type: "INCOME",
        amount: 80000,
        date: "2026-04-10",
        status: "POSTED",
      } as LedgerTransaction,
      {
        id: "tx-no-date",
        business_id: businessId,
        type: "INCOME",
        amount: 30000,
        date: undefined as any,
        status: "POSTED",
      } as LedgerTransaction,
    ];

    it("should strictly include only transactions within the date filter in revenue calculations", () => {
      const snapshot = AnalyticsEngine.generateSnapshot(
        "CUSTOM",
        { startDate: "2026-03-01", endDate: "2026-03-31" },
        employees,
        transactions,
        [],
        [],
        branches,
        departments,
        undefined,
        businessId
      );

      // Only tx-in-range (100,000) should be included!
      // tx-before-range (50,000), tx-after-range (80,000), and tx-no-date (30,000) must NOT leak.
      expect(snapshot.revenue.currentValue).toBe(100000);
    });

    it("should never leak future transactions into cash on hand calculation", () => {
      const allTx: LedgerTransaction[] = [
        {
          id: "tx-past-inc",
          business_id: businessId,
          type: "INCOME",
          amount: 200000,
          date: "2026-03-10",
          status: "POSTED",
        } as LedgerTransaction,
        {
          id: "tx-past-exp",
          business_id: businessId,
          type: "EXPENSE",
          amount: 50000,
          date: "2026-03-12",
          status: "POSTED",
        } as LedgerTransaction,
        {
          id: "tx-future-inc",
          business_id: businessId,
          type: "INCOME",
          amount: 500000,
          date: "2026-05-01",
          status: "POSTED",
        } as LedgerTransaction,
      ];

      const snapshot = AnalyticsEngine.generateSnapshot(
        "CUSTOM",
        { startDate: "2026-03-01", endDate: "2026-03-31" },
        employees,
        allTx,
        [],
        [],
        branches,
        departments,
        undefined,
        businessId
      );

      // Cash on hand up to 2026-03-31 should be 200,000 - 50,000 = 150,000
      // 500,000 future income must NOT leak into cash on hand!
      expect(snapshot.cashOnHand.currentValue).toBe(150000);
    });
  });
});
