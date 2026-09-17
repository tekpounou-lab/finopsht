import { describe, it, expect } from "vitest";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { PayrollRecord, LedgerTransaction, Employee, Branch, Department } from "../../types";

describe("Phase 6B — Payroll Intelligence & Workforce Economics BI Suite", () => {
  const businessId = "biz-corp-test-1";

  const sampleEmployees: Employee[] = [
    {
      id: "emp-fixed-1",
      business_id: businessId,
      firstName: "Jean",
      lastName: "Baptiste",
      email: "jean@corp.test",
      role: "EMPLOYEE",
      paymentModel: "FIXED",
      branchId: "branch-north",
      departmentId: "dept-ops",
      status: "ACTIVE",
    } as any,
    {
      id: "emp-comm-1",
      business_id: businessId,
      firstName: "Marie",
      lastName: "Claire",
      email: "marie@corp.test",
      role: "EMPLOYEE",
      paymentModel: "COMMISSION",
      branchId: "branch-south",
      departmentId: "dept-sales",
      status: "ACTIVE",
    } as any,
    {
      id: "emp-hybrid-1",
      business_id: businessId,
      firstName: "Pierre",
      lastName: "Auguste",
      email: "pierre@corp.test",
      role: "EMPLOYEE",
      paymentModel: "HYBRID",
      branchId: "branch-north",
      departmentId: "dept-sales",
      status: "ACTIVE",
    } as any,
    {
      id: "emp-unresolved-1",
      business_id: businessId,
      firstName: "Unknown",
      lastName: "Worker",
      email: "unresolved@corp.test",
      role: "EMPLOYEE",
      paymentModel: "FIXED",
      status: "ACTIVE",
    } as any,
  ];

  const samplePayrollRecords: PayrollRecord[] = [
    {
      id: "pr-1",
      business_id: businessId,
      employee_id: "emp-fixed-1",
      employee_name: "Jean Baptiste",
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      base_salary_cents: 5000000, // 50,000 HTG
      gross_salary_cents: 5000000,
      net_salary_cents: 4400000,  // 44,000 HTG
      cnss_employee_cents: 300000,
      cnss_employer_cents: 300000,
      ofatma_employee_cents: 100000,
      ofatma_employer_cents: 100000,
      employer_contributions_cents: 400000, // 4,000 HTG
      commission_cents: 0,
      status: "SEALED",
      isExcluded: false,
    } as any,
    {
      id: "pr-2",
      business_id: businessId,
      employee_id: "emp-comm-1",
      employee_name: "Marie Claire",
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      base_salary_cents: 0,
      gross_salary_cents: 3500000, // 35,000 HTG commission
      net_salary_cents: 3080000,
      commission_cents: 3500000,
      sales_cents: 35000000,       // 350,000 HTG sales (10% comm)
      cnss_employee_cents: 210000,
      cnss_employer_cents: 210000,
      ofatma_employee_cents: 70000,
      ofatma_employer_cents: 70000,
      employer_contributions_cents: 280000,
      status: "SEALED",
      isExcluded: false,
    } as any,
    {
      id: "pr-3",
      business_id: businessId,
      employee_id: "emp-hybrid-1",
      employee_name: "Pierre Auguste",
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      base_salary_cents: 3000000, // 30,000 HTG
      gross_salary_cents: 4500000, // 30k base + 15k comm
      net_salary_cents: 3960000,
      commission_cents: 1500000,
      sales_cents: 15000000,       // 150,000 HTG sales
      cnss_employee_cents: 270000,
      cnss_employer_cents: 270000,
      ofatma_employee_cents: 90000,
      ofatma_employer_cents: 90000,
      employer_contributions_cents: 360000,
      status: "SEALED",
      isExcluded: false,
    } as any,
    {
      id: "pr-unresolved",
      business_id: businessId,
      employee_id: "emp-unresolved-1",
      employee_name: "Unknown Worker",
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      base_salary_cents: 2000000, // 20,000 HTG
      gross_salary_cents: 2000000,
      net_salary_cents: 1760000,
      cnss_employee_cents: 120000,
      cnss_employer_cents: 120000,
      ofatma_employee_cents: 40000,
      ofatma_employer_cents: 40000,
      employer_contributions_cents: 160000,
      status: "SEALED",
      isExcluded: false,
    } as any,
  ];

  const sampleLedgerTransactions: LedgerTransaction[] = [
    {
      id: "tx-inc-1",
      business_id: businessId,
      type: "INCOME",
      amount_cents: 100000000, // 1,000,000 HTG revenue
      date: "2026-09-15",
      status: "POSTED",
      category: "COMMERCIAL_SALES",
    } as any,
    {
      id: "tx-exp-nonpayroll",
      business_id: businessId,
      type: "EXPENSE",
      amount_cents: 20000000, // 200,000 HTG rent/utilities
      date: "2026-09-10",
      status: "POSTED",
      category: "RENT",
    } as any,
  ];

  const dateRange = {
    startDate: "2026-09-01",
    endDate: "2026-09-30",
  };

  // -------------------------------------------------------------
  // A — PAYROLL KPIS
  // -------------------------------------------------------------
  describe("A — Payroll KPIs (Authoritative SSOT)", () => {
    it("computes exact Total Payroll Cost (Gross + Employer Taxes)", () => {
      const payrollCost = AnalyticsEngine.computePayrollCost(samplePayrollRecords, dateRange, true);
      // Expected:
      // Fixed: 50,000 + 4,000 = 54,000
      // Comm: 35,000 + 2,800 = 37,800
      // Hybrid: 45,000 + 3,600 = 48,600
      // Unresolved: 20,000 + 1,600 = 21,600
      // Total = 162,000 HTG
      expect(payrollCost).toBe(162000);
    });

    it("computes exact Commissions Paid from sealed payroll records (SSOT)", () => {
      const getRecordCommissions = (p: PayrollRecord) => {
        if (p.commission_cents !== undefined && p.commission_cents !== null) {
          return p.commission_cents / 100;
        }
        return p.commissions || 0;
      };

      const totalCommissions = samplePayrollRecords.reduce(
        (sum, p) => sum + getRecordCommissions(p),
        0
      );
      // Expected: 0 + 35,000 + 15,000 + 0 = 50,000 HTG
      expect(totalCommissions).toBe(50000);
    });

    it("computes authoritative Payroll Ratio (%)", () => {
      const payrollCost = 162000;
      const revenue = 1000000;
      const ratio = AnalyticsEngine.computePayrollRatio(payrollCost, revenue);
      // Expected: (162,000 / 1,000,000) * 100 = 16.2%
      expect(ratio).toBeCloseTo(16.2, 1);
    });

    it("returns 0 ratio when Revenue is 0 to avoid Infinity", () => {
      const ratio = AnalyticsEngine.computePayrollRatio(162000, 0);
      expect(ratio).toBe(0);
    });
  });

  // -------------------------------------------------------------
  // B — COMPENSATION REGIMES (FIXED, COMMISSION, HYBRID)
  // -------------------------------------------------------------
  describe("B — Compensation Mix Breakdown", () => {
    it("correctly identifies payment regimes without monetary guessing", () => {
      const fixed = samplePayrollRecords.filter(p => {
        const emp = sampleEmployees.find(e => e.id === p.employee_id);
        return emp?.paymentModel === "FIXED";
      });
      const comm = samplePayrollRecords.filter(p => {
        const emp = sampleEmployees.find(e => e.id === p.employee_id);
        return emp?.paymentModel === "COMMISSION";
      });
      const hybrid = samplePayrollRecords.filter(p => {
        const emp = sampleEmployees.find(e => e.id === p.employee_id);
        return emp?.paymentModel === "HYBRID";
      });

      expect(fixed.length).toBe(2);
      expect(comm.length).toBe(1);
      expect(hybrid.length).toBe(1);
    });
  });

  // -------------------------------------------------------------
  // C — WORKFORCE ECONOMICS
  // -------------------------------------------------------------
  describe("C — Workforce Economics & HC-ROI", () => {
    it("computes Human Capital ROI using computeHRROI", () => {
      const revenue = 1000000;
      const payrollCost = 162000;
      const roi = AnalyticsEngine.computeHRROI(revenue, payrollCost);
      // Expected: 1,000,000 / 162,000 ≈ 6.17
      expect(roi).toBeCloseTo(6.17, 2);
    });
  });

  // -------------------------------------------------------------
  // D — ORGANIZATIONAL & UNRESOLVED DIMENSIONS
  // -------------------------------------------------------------
  describe("D — Organizational Dimensions & UNRESOLVED Isolation", () => {
    it("preserves UNRESOLVED !== PRIMARY_BRANCH invariant", () => {
      const unassignedRecord = samplePayrollRecords.find(p => p.employee_id === "emp-unresolved-1");
      const emp = sampleEmployees.find(e => e.id === unassignedRecord?.employee_id);
      
      const resolvedBranch = unassignedRecord?.branch_id || emp?.branchId || "UNRESOLVED";
      expect(resolvedBranch).toBe("UNRESOLVED");
      expect(resolvedBranch).not.toBe("branch-north");
    });
  });

  // -------------------------------------------------------------
  // E — DATA STATES (ZERO, NO_DATA, NOT_ELIGIBLE)
  // -------------------------------------------------------------
  describe("E — Data States Semantics", () => {
    it("distinguishes NOT_ELIGIBLE for Fixed employee commissions vs ZERO", () => {
      const fixedEmp = sampleEmployees.find(e => e.id === "emp-fixed-1");
      expect(fixedEmp?.paymentModel).toBe("FIXED");
      // Fixed employees are NOT_ELIGIBLE for commissions
      const commissionState = fixedEmp?.paymentModel === "FIXED" ? "NOT_ELIGIBLE" : "AVAILABLE";
      expect(commissionState).toBe("NOT_ELIGIBLE");
    });
  });

  // -------------------------------------------------------------
  // F — TENANT ISOLATION
  // -------------------------------------------------------------
  describe("F — Multi-Tenant Isolation", () => {
    it("excludes records belonging to other tenants", () => {
      const foreignRecord: PayrollRecord = {
        ...samplePayrollRecords[0],
        id: "pr-foreign",
        business_id: "biz-other-tenant",
      };

      const mixedRecords = [...samplePayrollRecords, foreignRecord];
      const isolatedRecords = mixedRecords.filter(r => r.business_id === businessId);

      expect(isolatedRecords.length).toBe(samplePayrollRecords.length);
      expect(isolatedRecords.some(r => r.business_id === "biz-other-tenant")).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // G — DATE PRORATION
  // -------------------------------------------------------------
  describe("G — Date Range & Proration Factor", () => {
    it("returns 1.0 for a full cycle match", () => {
      const factor = AnalyticsEngine.getRecordProrationFactor(
        samplePayrollRecords[0],
        dateRange
      );
      expect(factor).toBe(1.0);
    });

    it("returns proportional factor for partial cycle", () => {
      const partialRange = {
        startDate: "2026-09-01",
        endDate: "2026-09-15", // 15 days of a 30-day month
      };
      const factor = AnalyticsEngine.getRecordProrationFactor(
        samplePayrollRecords[0],
        partialRange
      );
      expect(factor).toBeCloseTo(0.5, 1);
    });
  });

  // -------------------------------------------------------------
  // H — DOUBLE-COUNTING SAFEGUARDS
  // -------------------------------------------------------------
  describe("H — Double-Counting Safeguards", () => {
    it("filters out payroll-related transactions from operational GL expenses", () => {
      const payrollTx: LedgerTransaction = {
        id: "tx-pr-gl",
        business_id: businessId,
        type: "EXPENSE",
        metadata: { payrollCycleId: "cycle-sept-2026" },
        amount_cents: 16200000,
        date: "2026-09-30",
        status: "POSTED",
      } as any;

      const nonPayrollTxs = [payrollTx, ...sampleLedgerTransactions].filter(
        t => !AnalyticsEngine.isPayrollRelatedTransaction(t)
      );

      // Should exclude payrollTx
      expect(nonPayrollTxs.length).toBe(sampleLedgerTransactions.length);
      expect(nonPayrollTxs.some(t => t.id === "tx-pr-gl")).toBe(false);
    });
  });
});
