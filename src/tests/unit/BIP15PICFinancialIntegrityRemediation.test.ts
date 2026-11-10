import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { LedgerCashAdapter } from "../../domains/cash/adapters/LedgerCashAdapter";
import { CashBasisEngine } from "../../domains/cash/engine/CashBasisEngine";
import {
  createDefaultExecutiveFilters,
  loadPersistedExecutiveFilters,
} from "../../domains/analytics/context/ExecutiveFilterContext";
import {
  selectSimplifiedMetrics,
  selectExpertMetrics,
  selectCashBasisExpertMetrics,
} from "../../domains/performance/selectors";
import { calculateDateRangeForPeriod } from "../../hooks/usePerformanceData";
import {
  Employee,
  LedgerTransaction,
  PayrollRecord,
  Department,
  Branch,
} from "../../types";
import { RawPerformanceDataSet, PICFilters } from "../../domains/performance/types";

const BIZ_ID = "biz_finops_audit_01";

const baseEmployees: Employee[] = [
  {
    id: "emp_1",
    business_id: BIZ_ID,
    name: "Jean Baptiste",
    email: "jean@finops.ht",
    branchId: "br_1",
    departmentId: "dept_sales",
    role: "EMPLOYEE",
    paymentModel: "FIXED",
    baseSalary: 50000,
    status: "ACTIVE",
  },
  {
    id: "emp_2",
    business_id: BIZ_ID,
    name: "Marie Claire",
    email: "marie@finops.ht",
    branchId: "br_1",
    departmentId: "dept_ops",
    role: "EMPLOYEE",
    paymentModel: "FIXED",
    baseSalary: 40000,
    status: "ACTIVE",
  },
];

const baseBranches: Branch[] = [
  { id: "br_1", business_id: BIZ_ID, name: "Port-au-Prince Siège" },
];

const baseDepartments: Department[] = [
  { id: "dept_sales", business_id: BIZ_ID, name: "Ventes & Commercial" },
  { id: "dept_ops", business_id: BIZ_ID, name: "Opérations" },
];

function installMockLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const mockStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: mockStorage,
    configurable: true,
    writable: true,
  });
  return mockStorage;
}

describe("BI-P1.5 — PIC Financial Integrity & Temporal Filter Remediation", () => {
  // =========================================================================
  // 1. DEF-TF-01: AnalyticsEngine Temporal Filter & Unbounded Range Handling
  // =========================================================================
  describe("DEF-TF-01 — Temporal Filter Resolution & Unbounded / Open-Ended Ranges", () => {
    it("never falls back to current calendar month when CUSTOM range has empty startDate/endDate or period is ALL", () => {
      const novRefDate = new Date("2026-11-06T12:00:00.000Z");

      const emptyCustom = AnalyticsEngine.getPeriodRanges(
        "CUSTOM",
        { startDate: "", endDate: "" },
        novRefDate
      );
      expect(emptyCustom.current).toEqual({ startDate: "", endDate: "" });
      expect(emptyCustom.previous).toEqual({ startDate: "", endDate: "" });

      const undefinedCustom = AnalyticsEngine.getPeriodRanges(
        "CUSTOM",
        undefined,
        novRefDate
      );
      expect(undefinedCustom.current).toEqual({ startDate: "", endDate: "" });
      expect(undefinedCustom.previous).toEqual({ startDate: "", endDate: "" });

      const allPeriod = AnalyticsEngine.getPeriodRanges(
        "ALL",
        undefined,
        novRefDate
      );
      expect(allPeriod.current).toEqual({ startDate: "", endDate: "" });
      expect(allPeriod.previous).toEqual({ startDate: "", endDate: "" });
    });

    it("preserves exact open-ended single-bound dates without calendar-month fabrication", () => {
      const novRefDate = new Date("2026-11-06T12:00:00.000Z");

      const startOnly = AnalyticsEngine.getPeriodRanges(
        "CUSTOM",
        { startDate: "2026-07-01T00:00:00Z", endDate: "" },
        novRefDate
      );
      expect(startOnly.current).toEqual({ startDate: "2026-07-01", endDate: "" });
      expect(startOnly.previous).toEqual({ startDate: "", endDate: "" });

      const endOnly = AnalyticsEngine.getPeriodRanges(
        "CUSTOM",
        { startDate: "", endDate: "2026-07-31T23:59:59Z" },
        novRefDate
      );
      expect(endOnly.current).toEqual({ startDate: "", endDate: "2026-07-31" });
      expect(endOnly.previous).toEqual({ startDate: "", endDate: "" });
    });

    it("incidente E2E: July payroll committed with empty/all date filter in November NEVER leaks payroll into Revenue (ACCRUAL & CASH)", () => {
      const novRefDate = new Date("2026-11-06T12:00:00.000Z");
      const julyPayrolls: PayrollRecord[] = [
        {
          id: "pay_jul_1",
          business_id: BIZ_ID,
          employeeId: "emp_1",
          branch_id: "br_1",
          department_id: "dept_sales",
          grossSalary: 150000,
          netPaid: 130000,
          salesHtg: 450000,
          paymentDate: "2026-07-31",
          period_start: "2026-07-01",
          period_end: "2026-07-31",
          status: "PAID",
        } as any,
      ];

      // Even if GL has payroll accrual/settlement entries in July (no revenue transactions)
      const julyPayrollTxs: LedgerTransaction[] = [
        {
          id: "tx_pay_accrual_jul",
          business_id: BIZ_ID,
          date: "2026-07-31",
          type: "PAYROLL",
          category: "PAYROLL",
          amount: 150000,
          debit_account: "6100_SALARIES",
          credit_account: "2100_PAYROLL_CLEARING",
          status: "POSTED",
        } as any,
        {
          id: "tx_pay_disburse_jul",
          business_id: BIZ_ID,
          date: "2026-07-31",
          paymentDate: "2026-07-31",
          type: "PAYROLL",
          category: "PAYROLL",
          amount: 130000,
          debit_account: "2100_PAYROLL_CLEARING",
          credit_account: "1010_BANK",
          payment_method: "BANK_TRANSFER",
          status: "POSTED",
        } as any,
      ];

      for (const accountingMode of ["ACCRUAL", "CASH"] as const) {
        const snapUnbounded = AnalyticsEngine.generateSnapshot({
          period: "CUSTOM",
          customRange: { startDate: "", endDate: "" },
          employees: baseEmployees,
          transactions: julyPayrollTxs,
          payrollRecords: julyPayrolls,
          branches: baseBranches,
          departments: baseDepartments,
          businessId: BIZ_ID,
          referenceDate: novRefDate,
          accountingMode,
        });

        expect(snapUnbounded.revenue.currentValue).toBe(0);
        expect(snapUnbounded.revenue.previousValue).toBe(0);
        expect(snapUnbounded.payrollCost.currentValue).toBe(150000);
        expect(snapUnbounded.expenses.currentValue).toBeGreaterThan(0);
        expect(snapUnbounded.profit.currentValue).toBeLessThan(0);
        expect(snapUnbounded.historicalTrends.length).toBeGreaterThan(0);
        expect(
          snapUnbounded.historicalTrends.every(
            (pt) => !Number.isNaN(pt.gross) && !Number.isNaN(pt.net)
          )
        ).toBe(true);
      }
    });

    it("includes historical July revenue and expenses when 'All Dates' ({ startDate: '', endDate: '' }) is selected in November", () => {
      const novRefDate = new Date("2026-11-06T12:00:00.000Z");
      const julyTxs: LedgerTransaction[] = [
        {
          id: "tx_rev_jul",
          business_id: BIZ_ID,
          date: "2026-07-15",
          paymentDate: "2026-07-15",
          branchId: "br_1",
          departmentId: "dept_sales",
          type: "INCOME",
          category: "SALES",
          amount: 250000,
          debit_account: "1000_CASH",
          credit_account: "4100_SALES",
          payment_method: "CASH",
          status: "POSTED",
        } as any,
        {
          id: "tx_exp_jul",
          business_id: BIZ_ID,
          date: "2026-07-20",
          paymentDate: "2026-07-20",
          branchId: "br_1",
          departmentId: "dept_ops",
          type: "EXPENSE",
          category: "UTILITIES",
          amount: 25000,
          debit_account: "5300_UTILITIES",
          credit_account: "1000_CASH",
          payment_method: "CASH",
          status: "POSTED",
        } as any,
      ];
      const julyPayrolls: PayrollRecord[] = [
        {
          id: "pay_jul_2",
          business_id: BIZ_ID,
          employeeId: "emp_2",
          branch_id: "br_1",
          department_id: "dept_ops",
          grossSalary: 40000,
          netPaid: 35000,
          paidAt: "2026-07-31",
          paymentDate: "2026-07-31",
          period_start: "2026-07-16",
          period_end: "2026-07-31",
          status: "PAID",
        } as any,
      ];

      // Accrual snapshot on "ALL" / empty customRange
      const snapAccrual = AnalyticsEngine.generateSnapshot({
        period: "ALL",
        employees: baseEmployees,
        transactions: julyTxs,
        payrollRecords: julyPayrolls,
        branches: baseBranches,
        departments: baseDepartments,
        businessId: BIZ_ID,
        referenceDate: novRefDate,
        accountingMode: "ACCRUAL",
      });

      expect(snapAccrual.revenue.currentValue).toBe(250000);
      expect(snapAccrual.revenue.previousValue).toBe(0);
      expect(snapAccrual.payrollCost.currentValue).toBe(40000);
      expect(snapAccrual.expenses.currentValue).toBe(65000); // 25,000 + 40,000
      expect(snapAccrual.profit.currentValue).toBe(185000);
      expect(snapAccrual.cashOnHand.currentValue).toBe(225000); // 250,000 - 25,000

      // Cash snapshot on empty customRange
      const snapCash = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "", endDate: "" },
        employees: baseEmployees,
        transactions: julyTxs,
        payrollRecords: julyPayrolls,
        branches: baseBranches,
        departments: baseDepartments,
        businessId: BIZ_ID,
        referenceDate: novRefDate,
        accountingMode: "CASH",
      });

      expect(snapCash.revenue.currentValue).toBe(250000);
      expect(snapCash.revenue.previousValue).toBe(0);
      expect(snapCash.netCashFlow.currentValue).toBe(190000); // 250,000 - (25,000 + 35,000)

      // PIC selectors with period: "all" must align 100% with SSOT
      const rawPIC: RawPerformanceDataSet = {
        employees: baseEmployees,
        transactions: julyTxs,
        payrollRecords: julyPayrolls,
        attendanceRecords: [],
        branches: baseBranches,
        departments: baseDepartments,
        snapshots: [],
      };
      const allRange = calculateDateRangeForPeriod("all");
      expect(allRange).toEqual({ startDate: "", endDate: "" });

      const picFilters: PICFilters = {
        period: "all",
        startDate: allRange.startDate,
        endDate: allRange.endDate,
        branchId: "ALL",
        departmentId: "ALL",
        metricType: "all",
        searchQuery: "",
        accountingBasis: "CASH",
      };
      const simplified = selectSimplifiedMetrics(rawPIC, picFilters);
      const expertCash = selectCashBasisExpertMetrics(rawPIC, picFilters);
      const expertCashDirect = selectExpertMetrics(rawPIC, picFilters);
      const expertAccrual = selectExpertMetrics(rawPIC, {
        ...picFilters,
        accountingBasis: "ACCRUAL",
      });

      expect(simplified.totalRevenue).toBe(250000);
      expect(expertCash.kpis.totalRevenue).toBe(250000);
      expect(expertCashDirect.kpis.totalRevenue).toBe(250000);
      expect(expertCashDirect.kpis.netProfit).toBe(190000);
      expect(
        expertCashDirect.departments.find((d) => d.departmentId === "dept_sales")?.revenue
      ).toBe(250000);
      expect(expertAccrual.kpis.totalRevenue).toBe(250000);
    });
  });

  // =========================================================================
  // 2. DEF-REV-01: Subledger Department Revenue Contamination
  // =========================================================================
  describe("DEF-REV-01 — Subledger Department Revenue Isolation", () => {
    it("never adds payroll sales_cents/salesHtg into departmentPerformance[].revenue (ACCRUAL & CASH)", () => {
      const payrollWithCommercialSales: PayrollRecord[] = [
        {
          id: "pay_comm_1",
          business_id: BIZ_ID,
          employeeId: "emp_1",
          department_id: "dept_sales",
          grossSalary: 50000,
          sales_cents: 5000000, // 50,000 HTG commercial attribution (must stay on employee scorecard ONLY)
          paymentDate: "2026-07-31",
          period_start: "2026-07-01",
          period_end: "2026-07-31",
          status: "PAID",
        } as any,
      ];

      for (const accountingMode of ["ACCRUAL", "CASH"] as const) {
        const snap = AnalyticsEngine.generateSnapshot({
          period: "CUSTOM",
          customRange: { startDate: "2026-07-01", endDate: "2026-07-31" },
          employees: baseEmployees,
          transactions: [],
          payrollRecords: payrollWithCommercialSales,
          branches: baseBranches,
          departments: baseDepartments,
          businessId: BIZ_ID,
          accountingMode,
        });

        const salesDept = snap.departmentPerformance.find(
          (d) => d.departmentId === "dept_sales"
        );
        expect(salesDept).toBeDefined();
        expect(salesDept!.revenue).toBe(0);
        expect(snap.revenue.currentValue).toBe(0);

        // Employee scorecard still tracks commercial salesVolume for commissions/productivity
        const empScore = snap.employeeScorecards.find(
          (e) => e.employeeId === "emp_1"
        );
        expect(empScore).toBeDefined();
        expect(empScore!.salesVolume).toBe(50000);
      }
    });

    it("sums genuine employee-linked GL/Cash income into departmentPerformance[].revenue without dropping it when payroll sales exist", () => {
      const payrollWithCommercialSales: PayrollRecord[] = [
        {
          id: "pay_comm_2",
          business_id: BIZ_ID,
          employeeId: "emp_1",
          department_id: "dept_sales",
          grossSalary: 50000,
          sales_cents: 5000000, // 50,000 HTG commercial sales attribution
          paymentDate: "2026-07-31",
          period_start: "2026-07-01",
          period_end: "2026-07-31",
          status: "PAID",
        } as any,
      ];

      const postedSalesIncome: LedgerTransaction[] = [
        {
          id: "tx_gl_sale_1",
          business_id: BIZ_ID,
          date: "2026-07-18",
          paymentDate: "2026-07-18",
          departmentId: "dept_sales",
          employeeId: "emp_1",
          type: "INCOME",
          category: "SALES",
          amount: 75000,
          debit_account: "1000_CASH",
          credit_account: "4100_SALES",
          payment_method: "CASH",
          status: "POSTED",
        } as any,
      ];

      for (const accountingMode of ["ACCRUAL", "CASH"] as const) {
        const snap = AnalyticsEngine.generateSnapshot({
          period: "CUSTOM",
          customRange: { startDate: "2026-07-01", endDate: "2026-07-31" },
          employees: baseEmployees,
          transactions: postedSalesIncome,
          payrollRecords: payrollWithCommercialSales,
          branches: baseBranches,
          departments: baseDepartments,
          businessId: BIZ_ID,
          accountingMode,
        });

        const salesDept = snap.departmentPerformance.find(
          (d) => d.departmentId === "dept_sales"
        );
        expect(salesDept).toBeDefined();
        // Strictly 75,000 GL/Cash revenue (NEVER 50,000 + 75,000 = 125,000, and NEVER 0)
        expect(salesDept!.revenue).toBe(75000);
        expect(snap.revenue.currentValue).toBe(75000);
      }
    });
  });

  // =========================================================================
  // 3. DEF-CASH-01: LedgerCashAdapter & Accrual Income Classification Spill
  // =========================================================================
  describe("DEF-CASH-01 — LedgerCashAdapter & Accrual Inflow Guardrails", () => {
    it("blocks non-revenue Treasury-debit entries (payroll, clearing/liabilities, PCG 421/431, transfers, penalties, refunds) from Cash Inflows", () => {
      const nonRevenueTxs: LedgerTransaction[] = [
        {
          id: "tx_nr_payroll",
          business_id: BIZ_ID,
          date: "2026-07-31",
          type: "PAYROLL",
          category: "PAYROLL",
          amount: 120000,
          debit_account: "1010_BANK",
          credit_account: "2100_PAYROLL_CLEARING",
          payment_method: "BANK_TRANSFER",
          status: "POSTED",
        } as any,
        {
          id: "tx_nr_pcg_421",
          business_id: BIZ_ID,
          date: "2026-07-31",
          type: "OTHER" as any,
          category: "SALARY_ADJUSTMENT",
          amount: 35000,
          debit_account: "1000_CASH",
          credit_account: "421_PERSONNEL_REMUNERATIONS",
          payment_method: "CASH",
          status: "POSTED",
        } as any,
        {
          id: "tx_nr_pcg_431",
          business_id: BIZ_ID,
          date: "2026-07-31",
          type: "OTHER" as any,
          category: "ONA_CONTRIBUTION",
          amount: 15000,
          debit_account: "1010_BANK",
          credit_account: "431_ONA_SOCIAL_SECURITY",
          payment_method: "BANK_TRANSFER",
          status: "POSTED",
        } as any,
        {
          id: "tx_nr_transfer",
          business_id: BIZ_ID,
          date: "2026-07-25",
          type: "TRANSFER",
          category: "TREASURY_TRANSFER",
          amount: 80000,
          debit_account: "1010_BANK",
          credit_account: "2100_CLEARING",
          payment_method: "BANK_TRANSFER",
          status: "POSTED",
        } as any,
        {
          id: "tx_nr_penalty",
          business_id: BIZ_ID,
          date: "2026-07-22",
          type: "PENALTY" as any,
          category: "LATE_PENALTY",
          amount: 5000,
          debit_account: "1000_CASH",
          credit_account: "6100_SALARIES",
          payment_method: "CASH",
          status: "POSTED",
        } as any,
        {
          id: "tx_nr_expense_refund",
          business_id: BIZ_ID,
          date: "2026-07-19",
          type: "EXPENSE",
          category: "OFFICE_SUPPLIES",
          amount: 4500,
          debit_account: "1000_CASH",
          credit_account: "6050_SUPPLIES",
          payment_method: "CASH",
          status: "POSTED",
        } as any,
      ];

      for (const tx of nonRevenueTxs) {
        const res = LedgerCashAdapter.adaptTransaction(tx, { businessId: BIZ_ID });
        expect(res.status).toBe("IGNORED");
        expect(res.movement).toBeUndefined();
      }

      const cashStmt = CashBasisEngine.executePipeline(
        {
          payrollRecords: [],
          ledgerTransactions: nonRevenueTxs,
        },
        {
          businessId: BIZ_ID,
          startDate: "2026-07-01",
          endDate: "2026-07-31",
        }
      );
      expect(cashStmt.totalInflow).toBe(0);
    });

    it("preserves legitimate cash inflows (cash sales, receivable collections, employee receivable repayments) and reversed audit records", () => {
      const validTxs: LedgerTransaction[] = [
        {
          id: "tx_valid_sale",
          business_id: BIZ_ID,
          date: "2026-07-10",
          type: "INCOME",
          category: "SALES",
          amount: 100000,
          debit_account: "1000_CASH",
          credit_account: "4000_OPERATING_REVENUE",
          payment_method: "CASH",
          status: "POSTED",
        } as any,
        {
          id: "tx_valid_ar_collection",
          business_id: BIZ_ID,
          date: "2026-07-12",
          type: "INCOME",
          category: "INVOICE_PAYMENT",
          amount: 50000,
          debit_account: "1010_BANK",
          credit_account: "1200_ACCOUNTS_RECEIVABLE",
          payment_method: "BANK_TRANSFER",
          status: "POSTED",
        } as any,
        {
          id: "tx_valid_emp_recovery",
          business_id: BIZ_ID,
          date: "2026-07-14",
          type: "INCOME",
          category: "PAYROLL_RECOVERY",
          source: "PAYROLL_ENGINE",
          amount: 10000,
          debit_account: "1000_CASH",
          credit_account: "1310_EMPLOYEE_RECEIVABLES",
          payment_method: "CASH",
          status: "POSTED",
        } as any,
        {
          id: "tx_audit_reversal",
          business_id: BIZ_ID,
          date: "2026-07-15",
          type: "REVERSAL" as any,
          category: "REVERSAL",
          amount: 20000,
          debit_account: "1000_CASH",
          credit_account: "5200_RENT",
          payment_method: "CASH",
          status: "REVERSED",
        } as any,
      ];

      const saleRes = LedgerCashAdapter.adaptTransaction(validTxs[0], { businessId: BIZ_ID });
      expect(saleRes.status).toBe("VALID");
      expect(saleRes.movement?.direction).toBe("INFLOW");

      const arRes = LedgerCashAdapter.adaptTransaction(validTxs[1], { businessId: BIZ_ID });
      expect(arRes.status).toBe("VALID");
      expect(arRes.movement?.direction).toBe("INFLOW");

      const recRes = LedgerCashAdapter.adaptTransaction(validTxs[2], { businessId: BIZ_ID });
      expect(recRes.status).toBe("VALID");
      expect(recRes.movement?.direction).toBe("INFLOW");

      const revRes = LedgerCashAdapter.adaptTransaction(validTxs[3], { businessId: BIZ_ID });
      expect(revRes.status).toBe("VALID");
      expect(revRes.movement?.status).toBe("REVERSED");

      const cashStmt = CashBasisEngine.executePipeline(
        {
          payrollRecords: [],
          ledgerTransactions: validTxs,
        },
        {
          businessId: BIZ_ID,
          startDate: "2026-07-01",
          endDate: "2026-07-31",
        }
      );
      expect(cashStmt.totalInflow).toBe(160000); // 100,000 + 50,000 + 10,000 (reversed has 0 cash impact)
    });

    it("rejects PCG 421/431/44x credit accounts from Accrual revenue in AnalyticsEngine", () => {
      const txs: LedgerTransaction[] = [
        {
          id: "tx_acc_421",
          business_id: BIZ_ID,
          date: "2026-07-31",
          type: "OTHER" as any,
          category: "PAYROLL_LIABILITY",
          amount: 95000,
          credit: 95000,
          debit_account: "641_SALAIRES",
          credit_account: "421_PERSONNEL",
          status: "POSTED",
        } as any,
        {
          id: "tx_acc_701",
          business_id: BIZ_ID,
          date: "2026-07-20",
          type: "OTHER" as any,
          category: "MERCHANDISE",
          amount: 120000,
          debit_account: "411_CLIENTS",
          credit_account: "701_VENTES",
          status: "POSTED",
        } as any,
      ];

      const snap = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-07-01", endDate: "2026-07-31" },
        employees: baseEmployees,
        transactions: txs,
        payrollRecords: [],
        branches: baseBranches,
        departments: baseDepartments,
        businessId: BIZ_ID,
        accountingMode: "ACCRUAL",
      });

      expect(snap.revenue.currentValue).toBe(120000);
    });
  });

  // =========================================================================
  // 4. DEF-LS-01: ExecutiveFilterContext localStorage Session & Date Guardrails
  // =========================================================================
  describe("DEF-LS-01 — ExecutiveFilterContext localStorage Restoration & Staleness Guards", () => {
    const originalStorage = globalThis.localStorage;

    beforeEach(() => {
      installMockLocalStorage();
    });

    afterEach(() => {
      Object.defineProperty(globalThis, "localStorage", {
        value: originalStorage,
        configurable: true,
        writable: true,
      });
    });

    it("discards stale prior-day July filter dates and legacy v2 keys when loading on a new day", () => {
      const novRefDate = new Date("2026-11-06T10:00:00.000Z");
      const freshDefaults = createDefaultExecutiveFilters(novRefDate);

      localStorage.setItem(
        "finops_executive_filters_v2",
        JSON.stringify({ startDate: "2026-07-01", endDate: "2026-07-31" })
      );
      localStorage.setItem(
        "finops_executive_filters_v3",
        JSON.stringify({
          startDate: "2026-07-01",
          endDate: "2026-07-31",
          accountingBasis: "ACCRUAL",
          presentationMode: "EXPERT",
          _persistedAt: new Date("2026-07-31T16:00:00.000Z").getTime(),
          _persistedDate: "2026-07-31",
        })
      );

      const restored = loadPersistedExecutiveFilters(novRefDate);

      // Legacy key removed
      expect(localStorage.getItem("finops_executive_filters_v2")).toBeNull();
      // Stale July dates replaced with fresh trailing 30-day window anchored on novRefDate
      expect(restored.startDate).toBe(freshDefaults.startDate);
      expect(restored.endDate).toBe(freshDefaults.endDate);
      expect(restored.startDate).not.toBe("2026-07-01");
      // Safe non-temporal user preferences preserved
      expect(restored.accountingBasis).toBe("ACCRUAL");
      expect(restored.presentationMode).toBe("EXPERT");
    });

    it("discards legacy un-timestamped v3 entries and expired (>12h) same-day entries", () => {
      const refDate = new Date("2026-11-06T22:00:00.000Z");
      const freshDefaults = createDefaultExecutiveFilters(refDate);

      // Un-timestamped legacy v3 entry
      localStorage.setItem(
        "finops_executive_filters_v3",
        JSON.stringify({
          startDate: "2026-07-01",
          endDate: "2026-07-31",
        })
      );
      const fromUnstamped = loadPersistedExecutiveFilters(refDate);
      expect(fromUnstamped.startDate).toBe(freshDefaults.startDate);
      expect(fromUnstamped.endDate).toBe(freshDefaults.endDate);

      // Same-day entry older than 12 hours (13 hours ago)
      localStorage.setItem(
        "finops_executive_filters_v3",
        JSON.stringify({
          startDate: "2026-07-01",
          endDate: "2026-07-31",
          _persistedAt: refDate.getTime() - 13 * 60 * 60 * 1000,
          _persistedDate: "2026-11-06",
        })
      );
      const fromExpired = loadPersistedExecutiveFilters(refDate);
      expect(fromExpired.startDate).toBe(freshDefaults.startDate);
      expect(fromExpired.endDate).toBe(freshDefaults.endDate);
    });

    it("preserves active same-day (<12h) valid custom dates AND explicit cleared 'All Dates' ('', '')", () => {
      const refDate = new Date("2026-11-06T14:00:00.000Z");

      // Active same-day custom range
      localStorage.setItem(
        "finops_executive_filters_v3",
        JSON.stringify({
          startDate: "2026-10-01",
          endDate: "2026-10-31",
          _persistedAt: refDate.getTime() - 2 * 60 * 60 * 1000,
          _persistedDate: "2026-11-06",
        })
      );
      const activeCustom = loadPersistedExecutiveFilters(refDate);
      expect(activeCustom.startDate).toBe("2026-10-01");
      expect(activeCustom.endDate).toBe("2026-10-31");

      // Active same-day explicit "All Dates" ("", "")
      localStorage.setItem(
        "finops_executive_filters_v3",
        JSON.stringify({
          startDate: "",
          endDate: "",
          _persistedAt: refDate.getTime() - 30 * 60 * 1000,
          _persistedDate: "2026-11-06",
        })
      );
      const activeCleared = loadPersistedExecutiveFilters(refDate);
      expect(activeCleared.startDate).toBe("");
      expect(activeCleared.endDate).toBe("");
    });

    it("rejects inverted or invalid calendar dates even within an active session", () => {
      const refDate = new Date("2026-11-06T14:00:00.000Z");
      const freshDefaults = createDefaultExecutiveFilters(refDate);

      // Inverted range (startDate > endDate)
      localStorage.setItem(
        "finops_executive_filters_v3",
        JSON.stringify({
          startDate: "2026-10-31",
          endDate: "2026-10-01",
          _persistedAt: refDate.getTime() - 10 * 60 * 1000,
          _persistedDate: "2026-11-06",
        })
      );
      const invertedRes = loadPersistedExecutiveFilters(refDate);
      expect(invertedRes.startDate).toBe(freshDefaults.startDate);
      expect(invertedRes.endDate).toBe(freshDefaults.endDate);

      // Invalid calendar day (Feb 30)
      localStorage.setItem(
        "finops_executive_filters_v3",
        JSON.stringify({
          startDate: "2026-02-30",
          endDate: "2026-03-05",
          _persistedAt: refDate.getTime() - 10 * 60 * 1000,
          _persistedDate: "2026-11-06",
        })
      );
      const invalidCalRes = loadPersistedExecutiveFilters(refDate);
      expect(invalidCalRes.startDate).toBe(freshDefaults.startDate);
      expect(invalidCalRes.endDate).toBe(freshDefaults.endDate);
    });
  });
});
