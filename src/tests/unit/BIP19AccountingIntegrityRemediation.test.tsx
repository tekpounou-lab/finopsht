import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AccrualBasisEngine } from "../../domains/analytics/services/AccrualBasisEngine";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { CashBasisEngine } from "../../domains/cash/engine/CashBasisEngine";
import { InvoiceCashAdapter } from "../../domains/cash/adapters/InvoiceCashAdapter";
import { PayrollCashAdapter } from "../../domains/cash/adapters/PayrollCashAdapter";
import { NormalizedAmountResolver, type NormalizationContext } from "../../domains/analytics/utils/NormalizedAmountResolver";
import { ExecutiveFilterProvider } from "../../domains/analytics/context/ExecutiveFilterContext";
import { AnalyticsFilterProvider } from "../../contexts/AnalyticsFilterContext";
import { ReconciliationBridge } from "../../components/analytics/ReconciliationBridge";
import { ExecutiveAttendance } from "../../components/executive/ExecutiveAttendance";
import { ExecutiveTreasury } from "../../components/executive/ExecutiveTreasury";
import { BIPayrollTab } from "../../components/bi/components/BIPayrollTab";
import { BIExecutiveKpis } from "../../components/bi/components/BIExecutiveKpis";
import { AnalyticsSnapshot, KPIComparison } from "../../domains/analytics/types";
import { LedgerTransaction, PayrollRecord, Employee, Branch, Department, PayrollCycle } from "../../types";
import type { Invoice } from "../../types/crm";

const BIZ_ID = "biz_p19_remediation";

const makeKpi = <T extends number | null>(currentValue: T, previousValue: T = 0 as T): KPIComparison<T> => ({
  currentValue,
  previousValue,
  difference: (typeof currentValue === "number" && typeof previousValue === "number" ? currentValue - previousValue : null) as T,
  differencePercentage: 0 as T,
  trend: "STABLE",
  direction: "NEUTRAL",
  state: currentValue === null ? "NO_DATA" : currentValue === 0 ? "VALID_ZERO" : "VALID_VALUE",
});

const buildBaseSnapshot = (overrides: Partial<AnalyticsSnapshot> = {}): AnalyticsSnapshot => ({
  period: "CUSTOM",
  customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
  generatedAt: "2026-10-31T00:00:00.000Z",
  revenue: makeKpi(100000),
  quickbooksSalesRevenue: makeKpi(0),
  expenses: makeKpi(60000),
  operationalExpenses: makeKpi(60000),
  totalExpenses: makeKpi(60000),
  profit: makeKpi(40000),
  netCashFlow: makeKpi(35000),
  cashOnHand: makeKpi(80000),
  burnRate: makeKpi(2000),
  payrollCost: makeKpi(40000),
  activeStaff: makeKpi(3),
  attendanceRate: makeKpi(87.5 as number | null),
  attendanceFrequency: makeKpi(90 as number | null),
  latenessRate: makeKpi(5 as number | null),
  absenceRate: makeKpi(12.5 as number | null),
  avgHoursWorked: makeKpi(8 as number | null),
  advanceExposure: makeKpi(0),
  commissionsPaid: makeKpi(0),
  payrollAggregates: {
    payrollPaid: 40000,
    commissionsPaid: 0,
    cnssContributions: 0,
    cnsContributions: 0,
    employerChargesSocials: 0,
    totalEmploymentCost: 40000,
  },
  branchPerformance: [],
  departmentPerformance: [],
  employeeScorecards: [],
  historicalTrends: [],
  expenseBreakdown: [],
  forecast: { forecast7Days: 10000, forecast15Days: 20000, forecast30Days: 40000 },
  anomalies: [],
  businessHealthScore: 80,
  profitMargin: 40,
  payrollCostRatio: 40,
  isSocialTaxEnabled: true,
  ...overrides,
});

describe("BI-P1.9 Controlled Accounting Integrity Remediation", () => {
  const rateGrid: NormalizationContext = {
    "2026-10-10": {
      id: "rate_oct_10",
      business_id: BIZ_ID,
      date: "2026-10-10",
      rates: { BRH: 130, CANADA: 95, EURO: 140, PESO: 2.2 },
    } as any,
    "2026-10-15": {
      id: "rate_oct_15",
      business_id: BIZ_ID,
      date: "2026-10-15",
      rates: { BRH: 132, CANADA: 96, EURO: 142, PESO: 2.25 },
    } as any,
  };

  describe("1. FX Provenance & Normalization (NormalizedAmountResolver)", () => {
    it("prioritizes explicit transaction rate over grid and marks fallback provenance cleanly", () => {
      const explicitRes = NormalizedAmountResolver.resolveWithProvenance(
        100,
        "USD",
        "2026-10-15",
        rateGrid,
        "BRH",
        136
      );
      expect(explicitRes.amountHTG).toBe(13600);
      expect(explicitRes.rateSource).toBe("EXPLICIT_TX_RATE");
      expect(explicitRes.usedFallback).toBe(false);

      const exactGridRes = NormalizedAmountResolver.resolveWithProvenance(100, "USD", "2026-10-15", rateGrid);
      expect(exactGridRes.amountHTG).toBe(13200);
      expect(exactGridRes.rateSource).toBe("DAILY_GRID_EXACT");
      expect(exactGridRes.usedFallback).toBe(false);

      const priorGridRes = NormalizedAmountResolver.resolveWithProvenance(100, "USD", "2026-10-20", rateGrid);
      expect(priorGridRes.amountHTG).toBe(13200);
      expect(priorGridRes.rateSource).toBe("DAILY_GRID_PRIOR");
      expect(priorGridRes.rateDateUsed).toBe("2026-10-15");

      const fallbackRes = NormalizedAmountResolver.resolveWithProvenance(100, "USD", "2026-10-01", {});
      expect(fallbackRes.amountHTG).toBe(13425);
      expect(fallbackRes.rateSource).toBe("DEFAULT_FALLBACK");
      expect(fallbackRes.usedFallback).toBe(true);
    });
  });

  describe("2. ACC-01, ACC-03, ACC-04, P1-03 & RECON-01 in AccrualBasisEngine & AnalyticsEngine", () => {
    const employees: Employee[] = [
      { id: "e_ops", business_id: BIZ_ID, name: "Alice", branchId: "br_1", departmentId: "dep_ops", status: "ACTIVE", role: "EMPLOYEE" } as any,
    ];
    const branches: Branch[] = [{ id: "br_1", business_id: BIZ_ID, name: "Port-au-Prince" } as any];
    const departments: Department[] = [
      { id: "dep_ops", business_id: BIZ_ID, name: "Opérations" } as any,
      { id: "dep_sales", business_id: BIZ_ID, name: "Ventes" } as any,
    ];
    const cycles: PayrollCycle[] = [
      { id: "cyc_oct", business_id: BIZ_ID, startDate: "2026-10-01", endDate: "2026-10-31", status: "COMPLETED" } as any,
    ];

    it("ACC-01: classifies type:OTHER credit 4100_SERVICE_REV strictly as revenue (never expense) in both engines", async () => {
      const txs: LedgerTransaction[] = [
        { id: "t_inc", business_id: BIZ_ID, date: "2026-10-05", type: "INCOME", amount: 25000, branchId: "br_1", departmentId: "dep_sales", status: "POSTED" } as any,
        {
          id: "t_other_rev",
          business_id: BIZ_ID,
          date: "2026-10-06",
          type: "OTHER",
          credit_account: "4100_SERVICE_REV",
          amount: 5000,
          branchId: "br_1",
          departmentId: "dep_sales",
          status: "POSTED",
        } as any,
        { id: "t_exp", business_id: BIZ_ID, date: "2026-10-07", type: "EXPENSE", amount: 6000, branchId: "br_1", departmentId: "dep_ops", status: "POSTED" } as any,
      ];

      const accrualSnap = await AccrualBasisEngine.generateSnapshot(
        BIZ_ID,
        { startDate: "2026-10-01", endDate: "2026-10-31" },
        txs,
        [],
        employees,
        { payrollCycles: cycles }
      );
      expect(accrualSnap.revenueRecognized).toBe(30000);
      expect(accrualSnap.expensesAccrued).toBe(6000);
      expect(accrualSnap.netIncome).toBe(24000);

      const analyticsSnap = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        employees,
        transactions: txs,
        branches,
        departments,
        businessId: BIZ_ID,
        accountingMode: "ACCRUAL",
      });
      expect(analyticsSnap.revenue.currentValue).toBe(30000);
      expect(analyticsSnap.expenses.currentValue).toBe(6000);
      expect(analyticsSnap.profit.currentValue).toBe(24000);
    });

    it("ACC-03: respects snake_case enable_social_taxes: false in AccrualBasisEngine", async () => {
      const payrolls: PayrollRecord[] = [
        {
          id: "pr_1",
          business_id: BIZ_ID,
          employeeId: "e_ops",
          cycleId: "cyc_oct",
          grossSalary: 100000,
          netPaid: 94000,
          cnss_employer_cents: 600000,
          ofatma_employer_cents: 300000,
          status: "PAID",
          paidAt: "2026-10-28",
        } as any,
      ];

      const snapOff = await AccrualBasisEngine.generateSnapshot(
        BIZ_ID,
        { startDate: "2026-10-01", endDate: "2026-10-31" },
        [],
        payrolls,
        employees,
        { businessSettings: { enable_social_taxes: false }, payrollCycles: cycles }
      );
      expect(snapOff.payrollAccrued.employerContributions).toBe(0);
      expect(snapOff.payrollAccrued.total).toBe(100000);

      const snapOn = await AccrualBasisEngine.generateSnapshot(
        BIZ_ID,
        { startDate: "2026-10-01", endDate: "2026-10-31" },
        [],
        payrolls,
        employees,
        { businessSettings: { enable_social_taxes: true }, payrollCycles: cycles }
      );
      expect(snapOn.payrollAccrued.employerContributions).toBe(9000);
      expect(snapOn.payrollAccrued.total).toBe(109000);
    });

    it("ACC-04 & P1-03: normalizes USD GL & payroll to HTG across KPIs, byDepartment, and GL-only departments", async () => {
      const txs: LedgerTransaction[] = [
        {
          id: "t_usd_inc",
          business_id: BIZ_ID,
          date: "2026-10-15",
          type: "INCOME",
          amount: 100,
          currency: "USD",
          exchange_rate: 135,
          branchId: "br_1",
          departmentId: "dep_sales",
          status: "POSTED",
        } as any,
        {
          id: "t_htg_exp",
          business_id: BIZ_ID,
          date: "2026-10-15",
          type: "EXPENSE",
          amount: 2000,
          currency: "HTG",
          branchId: "br_1",
          departmentId: "dep_sales",
          status: "POSTED",
        } as any,
      ];

      const payrolls: PayrollRecord[] = [
        {
          id: "pr_usd",
          business_id: BIZ_ID,
          employeeId: "e_ops",
          cycleId: "cyc_oct",
          grossSalary: 100,
          netPaid: 90,
          currency: "USD",
          exchange_rate: 132,
          cnss_employer_cents: 0,
          ofatma_employer_cents: 0,
          status: "PAID",
          paidAt: "2026-10-15",
        } as any,
      ];

      const accrualSnap = await AccrualBasisEngine.generateSnapshot(
        BIZ_ID,
        { startDate: "2026-10-01", endDate: "2026-10-31" },
        txs,
        payrolls,
        employees,
        { payrollCycles: cycles, normalizationContext: rateGrid }
      );

      // 100 USD * 135 = 13,500 HTG revenue
      expect(accrualSnap.revenueRecognized).toBe(13500);
      expect(accrualSnap.expensesAccrued).toBe(2000);
      // 100 USD * 132 = 13,200 HTG payroll (explicit 0 employer contributions preserved)
      expect(accrualSnap.payrollAccrued.total).toBe(13200);
      // GL-only department dep_sales MUST appear in byDepartment
      const salesDept = accrualSnap.byDepartment.find((d) => d.departmentId === "dep_sales");
      expect(salesDept).toBeDefined();
      expect(salesDept?.revenue).toBe(13500);
      expect(salesDept?.expenses).toBe(2000);
      expect(salesDept?.netIncome).toBe(11500);

      // AnalyticsEngine ACCRUAL must align departmentPerformance payroll to normalized HTG (13,200, not raw 100)
      const analyticsSnap = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        employees,
        transactions: txs,
        payrollRecords: payrolls,
        branches,
        departments,
        payrollCycles: cycles,
        businessId: BIZ_ID,
        accountingMode: "ACCRUAL",
        normalizationContext: rateGrid,
      });
      const opsDept = analyticsSnap.departmentPerformance.find((d) => d.departmentId === "dep_ops");
      expect(analyticsSnap.payrollCost.currentValue).toBe(13200);
      expect(opsDept?.payrollCost).toBe(13200);
    });

    it("RECON-01: AccrualBasisEngine reconciliation includes paid CRM invoices in cashRevenue & excludes unpaid APPROVED payroll from cashPayroll", async () => {
      const invoices: Invoice[] = [
        {
          id: "inv_paid_1",
          businessId: BIZ_ID,
          invoiceNumber: "INV-001",
          clientName: "Client A",
          issueDate: "2026-10-02",
          totalAmount: 10000,
          amountPaid: 7000,
          status: "PARTIALLY_PAID",
          currency: "HTG",
          paymentDate: "2026-10-12",
          isPaid: false,
        } as any,
      ];
      const txs: LedgerTransaction[] = [
        {
          id: "tx_gl_inc",
          business_id: BIZ_ID,
          date: "2026-10-10",
          type: "INCOME",
          debit_account: "1000_CASH",
          credit_account: "4000_SALES",
          payment_method: "CASH",
          amount: 12000,
          isSettled: true,
          status: "POSTED",
        } as any,
      ];
      const payrolls: PayrollRecord[] = [
        {
          id: "pr_approved_unpaid",
          business_id: BIZ_ID,
          employeeId: "e_ops",
          cycleId: "cyc_oct",
          grossSalary: 15000,
          netPaid: 14000,
          cnss_employer_cents: 0,
          ofatma_employer_cents: 0,
          status: "APPROVED",
        } as any,
      ];

      const snap = await AccrualBasisEngine.generateSnapshot(
        BIZ_ID,
        { startDate: "2026-10-01", endDate: "2026-10-31" },
        txs,
        payrolls,
        employees,
        { payrollCycles: cycles, invoices }
      );

      // Cash revenue includes 12,000 settled GL inflow + 7,000 partial invoice payment = 19,000
      expect(snap.reconciliation.cashRevenue).toBe(19000);
      // Unpaid APPROVED payroll is accrued (15,000) but NOT disbursed in cash (0)
      expect(snap.reconciliation.accrualPayroll).toBe(15000);
      expect(snap.reconciliation.cashPayroll).toBe(0);
      expect(snap.reconciliation.variancePayroll).toBe(15000);
      expect(snap.reconciliation.varianceRevenue).toBe(snap.reconciliation.accrualRevenue - snap.reconciliation.cashRevenue);
    });
  });

  describe("3. CASH-02, CASH-03 & CASH-04 in CashBasisEngine, Adapters & AnalyticsEngine", () => {
    const employees: Employee[] = [
      { id: "e1", business_id: BIZ_ID, name: "Marc", branchId: "br_1", departmentId: "dep_1", status: "ACTIVE", role: "EMPLOYEE" } as any,
    ];
    const branches: Branch[] = [{ id: "br_1", business_id: BIZ_ID, name: "Siège" } as any];
    const departments: Department[] = [{ id: "dep_1", business_id: BIZ_ID, name: "Ops" } as any];
    const cycles: PayrollCycle[] = [
      { id: "cyc_oct_1", business_id: BIZ_ID, startDate: "2026-10-01", endDate: "2026-10-31", status: "COMPLETED" } as any,
    ];

    it("InvoiceCashAdapter handles PARTIALLY_PAID snake_case fields & rejects missing settlement date", () => {
      const partialRes = InvoiceCashAdapter.adaptInvoice({
        id: "inv_snake",
        business_id: BIZ_ID,
        invoice_number: "FAC-202",
        status: "PARTIALLY_PAID",
        total_amount: 20000,
        amount_paid: 5000,
        paid_at: "2026-10-14",
        currency: "HTG",
      } as any);
      expect(partialRes.status).toBe("VALID");
      expect(partialRes.movement?.amount).toBe(5000);
      expect(partialRes.movement?.movementDate).toBe("2026-10-14");

      const incompleteRes = InvoiceCashAdapter.adaptInvoice({
        id: "inv_nodate",
        business_id: BIZ_ID,
        status: "PAID",
        totalAmount: 5000,
        issueDate: "2026-10-01",
      } as any);
      expect(incompleteRes.status).toBe("INCOMPLETE");
    });

    it("CASH-02: deduplicates cycle payroll vs GL PAYROLL_ENGINE while preserving separate 2xxx tax settlements", () => {
      const payrolls: PayrollRecord[] = [
        {
          id: "pr_paid",
          business_id: BIZ_ID,
          employeeId: "e1",
          cycleId: "cyc_oct_1",
          grossSalary: 50000,
          netPaid: 45000,
          paymentDate: "2026-10-15",
          status: "PAID",
          currency: "HTG",
        } as any,
        {
          id: "pr_unpaid",
          business_id: BIZ_ID,
          employeeId: "e1",
          cycleId: "cyc_oct_1",
          grossSalary: 20000,
          netPaid: 18000,
          status: "APPROVED",
          currency: "HTG",
        } as any,
      ];

      // Confirm PayrollCashAdapter resolves paymentDate even when paidAt is absent
      const adaptedPr = PayrollCashAdapter.adaptRecord(payrolls[0]);
      expect(adaptedPr.status).toBe("VALID");
      expect(adaptedPr.movement?.movementDate).toBe("2026-10-15");

      const txs: LedgerTransaction[] = [
        {
          id: "tx_gl_payroll_dup",
          business_id: BIZ_ID,
          date: "2026-10-15",
          type: "PAYROLL",
          source: "PAYROLL_ENGINE",
          debit_account: "6100_SALARIES",
          credit_account: "1010_BANK",
          payment_method: "BANK_TRANSFER",
          referenceId: "cyc_oct_1",
          metadata: { linkedCycleId: "cyc_oct_1" },
          amount: 45000,
          isSettled: true,
          status: "POSTED",
          currency: "HTG",
        } as any,
        {
          id: "tx_tax_ona",
          business_id: BIZ_ID,
          date: "2026-10-16",
          type: "EXPENSE",
          debit_account: "2100_ONA_PAYABLE",
          credit_account: "1010_BANK",
          payment_method: "BANK_TRANSFER",
          metadata: { linkedCycleId: "cyc_oct_1" },
          amount: 3000,
          isSettled: true,
          status: "POSTED",
          currency: "HTG",
        } as any,
      ];

      const cashPipe = CashBasisEngine.executePipeline(
        { payrollRecords: payrolls, payrollCycles: cycles, invoices: [], ledgerTransactions: txs },
        { businessId: BIZ_ID, startDate: "2026-10-01", endDate: "2026-10-31", currency: "HTG" }
      );
      // 45,000 netPaid + 3,000 ONA tax settlement = 48,000 (GL payroll dup suppressed, unpaid APPROVED ignored)
      expect(cashPipe.suppressedMovements.length).toBe(1);
      expect(cashPipe.totalOutflow).toBe(48000);

      const analyticsCash = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        employees,
        transactions: txs,
        payrollRecords: payrolls,
        payrollCycles: cycles,
        branches,
        departments,
        businessId: BIZ_ID,
        accountingMode: "CASH",
      });
      expect(analyticsCash.expenses.currentValue).toBe(48000);
      // Unpaid APPROVED payroll (20,000) excluded in CASH payrollCost; disbursed pr_paid gross (50,000) preserved per BIP15
      expect(analyticsCash.payrollCost.currentValue).toBe(50000);
    });

    it("CASH-03 & CASH-04: AnalyticsEngine(CASH) includes CRM invoices & consolidates USD + HTG via FX rates", () => {
      const invoices: Invoice[] = [
        {
          id: "inv_usd",
          businessId: BIZ_ID,
          invoiceNumber: "INV-USD-1",
          status: "PAID",
          totalAmount: 100,
          amountPaid: 100,
          currency: "USD",
          exchange_rate: 135,
          paidAt: "2026-10-15",
          isPaid: true,
        } as any,
      ];
      const txs: LedgerTransaction[] = [
        {
          id: "tx_htg_in",
          business_id: BIZ_ID,
          date: "2026-10-15",
          type: "INCOME",
          debit_account: "1000_CASH",
          credit_account: "4000_SALES",
          payment_method: "CASH",
          amount: 10000,
          currency: "HTG",
          isSettled: true,
          status: "POSTED",
        } as any,
        {
          id: "tx_usd_out",
          business_id: BIZ_ID,
          date: "2026-10-15",
          type: "EXPENSE",
          debit_account: "6200_OPEX",
          credit_account: "1010_BANK",
          payment_method: "BANK_TRANSFER",
          amount: 50,
          currency: "USD",
          isSettled: true,
          status: "POSTED",
        } as any,
      ];

      const snap = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        employees,
        transactions: txs,
        invoices,
        branches,
        departments,
        businessId: BIZ_ID,
        accountingMode: "CASH",
        normalizationContext: rateGrid,
      });

      // Inflows: 10,000 HTG + (100 USD * 135 explicit rate) = 23,500 HTG
      expect(snap.revenue.currentValue).toBe(23500);
      // Outflows: 50 USD * 132 grid rate on 2026-10-15 = 6,600 HTG
      expect(snap.expenses.currentValue).toBe(6600);
      expect(snap.netCashFlow.currentValue).toBe(16900);
      expect(snap.profit.currentValue).toBe(16900);
    });
  });

  describe("4. UI Card Consistency & SSOT Guards", () => {
    it("ReconciliationBridge computes dynamic reconciliation badge and AP > AR working capital note", () => {
      const htmlMismatchAndApHigh = renderToStaticMarkup(
        <ReconciliationBridge
          currency="HTG"
          snapshot={{
            period: { startDate: "2026-10-01", endDate: "2026-10-31" },
            revenueRecognized: 50000,
            expensesAccrued: 40000,
            payrollAccrued: { grossSalary: 10000, employerContributions: 0, commissions: 0, bonuses: 0, total: 10000, paid: 0, payable: 10000 },
            netIncome: 0,
            grossMargin: 0,
            operatingMargin: 0,
            workingCapital: { accountsReceivable: 5000, accountsPayable: 25000, cash: 10000, total: -10000 },
            byDepartment: [],
            byEmployee: [],
            reconciliation: {
              cashRevenue: 45000,
              accrualRevenue: 50000,
              varianceRevenue: 999, // intentional tie-out mismatch
              cashPayroll: 0,
              accrualPayroll: 10000,
              variancePayroll: 10000,
              cashExpenses: 15000,
              accrualExpenses: 40000,
              varianceExpenses: 25000,
            },
          }}
        />
      );
      expect(htmlMismatchAndApHigh).toContain("ÉCART À VÉRIFIER");
      expect(htmlMismatchAndApHigh).not.toContain("RÉCONCILIÉ (SSOT)");
      expect(htmlMismatchAndApHigh).toContain("Vos dettes fournisseurs (AP) dépassent vos créances clients (AR)");
    });

    it("ExecutiveAttendance renders N/D when absenceRate is null instead of synthesizing 100 - attendanceRate", () => {
      const snap = buildBaseSnapshot({
        attendanceRate: makeKpi(87.5 as number | null),
        absenceRate: makeKpi(null as number | null),
      });
      const html = renderToStaticMarkup(<ExecutiveAttendance snapshot={snap} />);
      expect(html).toContain("87.5%");
      expect(html).toContain("Taux d&#x27;absence constaté :");
      expect(html).toContain(">N/D<");
      expect(html).not.toContain("12.5%");
    });

    it("ExecutiveTreasury hides Bénéfice Net accrual row in CASH mode and shows it in ACCRUAL mode", () => {
      const snap = buildBaseSnapshot({ profit: makeKpi(40000), netCashFlow: makeKpi(35000) });
      const htmlCash = renderToStaticMarkup(
        <ExecutiveFilterProvider>
          <ExecutiveTreasury snapshot={snap} currency="HTG" accountingBasis="CASH" />
        </ExecutiveFilterProvider>
      );
      expect(htmlCash).toContain("Variation de Trésorerie (Cash)");
      expect(htmlCash).toContain("+35,000 HTG");
      expect(htmlCash).not.toContain("Bénéfice Net :");

      const htmlAccrual = renderToStaticMarkup(
        <ExecutiveFilterProvider>
          <ExecutiveTreasury snapshot={snap} currency="HTG" accountingBasis="ACCRUAL" />
        </ExecutiveFilterProvider>
      );
      expect(htmlAccrual).toContain("Bénéfice Net :");
      expect(htmlAccrual).toContain("Flux Net de Trésorerie :");
    });

    it("BIPayrollTab displays CASH (Encaissement) in CASH + EXPERT mode (isSimplifiedMode=false)", () => {
      const html = renderToStaticMarkup(
        <BIPayrollTab
          isSocialTaxEnabled={true}
          isSimplifiedMode={false}
          accountingBasis="CASH"
          selectedCurrency="HTG"
          filteredPayrolls={[]}
        />
      );
      expect(html).toContain("CASH (Encaissement)");
      expect(html).not.toContain("ACCRUAL (Engagement)");
    });

    it("BIExecutiveKpis preserves HTG unit when no USD FX rate is supplied and never relabels raw HTG as USD", () => {
      const snap = buildBaseSnapshot();
      const html = renderToStaticMarkup(
        <ExecutiveFilterProvider>
          <AnalyticsFilterProvider>
            <BIExecutiveKpis
              tbi={{
                revenue: "Revenus",
                expenses: "Dépenses",
                netProfit: "Bénéfice",
                profitMargin: "Marge",
                activeStaff: "Effectif",
                attendanceRate: "Assiduité",
                absenteeismRate: "Absentéisme",
                debtExposure: "Dettes",
                projection7Days: "Prévision 7j",
                burnRateLabel: "Burn rate",
                executiveKpis: "KPIs",
                avgWorkHours: "Heures moy.",
                allBranches: "Toutes",
                operationalStatus: "Actif",
                auditOverrides: "ajustements",
                glDeductions: "Déductions",
                incompleteConfig: "Config incomplète",
                noData: "Aucune donnée",
              }}
              totalRevenue={135000}
              totalExpenses={67500}
              netProfit={67500}
              profitMarginPercentage={50}
              isSocialTaxEnabled={true}
              activeEmployeesCount={3}
              attendanceAggregates={{
                attendanceRate: 87.5,
                attendanceFrequency: 90,
                latenessRate: 5,
                absenceRate: 12.5,
                avgHours: 8,
                overrides: 0,
              }}
              totalAdvancesPending={0}
              biSnapshot={snap}
              handleSaveSnapshot={() => {}}
              accountingBasis="ACCRUAL"
              usdToHtgRate={135}
            />
          </AnalyticsFilterProvider>
        </ExecutiveFilterProvider>
      );
      expect(html).toContain("135,000");
      expect(html).toContain("HTG");
    });
  });
});
