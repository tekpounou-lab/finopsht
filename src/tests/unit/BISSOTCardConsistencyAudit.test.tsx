import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AccrualBasisEngine } from "../../domains/analytics/services/AccrualBasisEngine";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { ExecutiveRecommendationEngine } from "../../domains/analytics/services/ExecutiveRecommendationEngine";
import { ExecutiveAlertEngine } from "../../domains/analytics/services/ExecutiveAlertEngine";
import { ExecutiveScoreEngine } from "../../domains/analytics/services/ExecutiveScoreEngine";
import { ExecutiveFilterProvider } from "../../domains/analytics/context/ExecutiveFilterContext";
import { AnalyticsFilterProvider } from "../../contexts/AnalyticsFilterContext";
import { BIExecutiveKpis } from "../../components/bi/components/BIExecutiveKpis";
import { ExecutiveDepartmentExpenses } from "../../components/executive/ExecutiveDepartmentExpenses";
import { ExecutivePayroll } from "../../components/executive/ExecutivePayroll";
import { ExecutiveStaffLeaderboard } from "../../components/executive/ExecutiveStaffLeaderboard";
import { ExecutiveAIAdvisor } from "../../components/executive/ExecutiveAIAdvisor";
import { ExecutiveAttendance } from "../../components/executive/ExecutiveAttendance";
import { ReconciliationBridge } from "../../components/analytics/ReconciliationBridge";
import { AnalyticsSnapshot, KPIComparison } from "../../domains/analytics/types";
import { LedgerTransaction, PayrollRecord, Employee, Branch, Department, PayrollCycle } from "../../types";

const BIZ_ID = "biz_ssot_card_audit";

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
  customRange: { startDate: "2026-08-01", endDate: "2026-08-31" },
  generatedAt: "2026-08-31T00:00:00.000Z",
  revenue: makeKpi(100000),
  quickbooksSalesRevenue: makeKpi(0),
  expenses: makeKpi(150000),
  operationalExpenses: makeKpi(150000),
  totalExpenses: makeKpi(150000),
  profit: makeKpi(-50000),
  netCashFlow: makeKpi(-40000),
  cashOnHand: makeKpi(35000),
  burnRate: makeKpi(5000),
  payrollCost: makeKpi(120000),
  activeStaff: makeKpi(4),
  attendanceRate: makeKpi(87.5 as number | null),
  attendanceFrequency: makeKpi(90 as number | null),
  latenessRate: makeKpi(5),
  absenceRate: makeKpi(12.5),
  avgHoursWorked: makeKpi(8),
  advanceExposure: makeKpi(2000),
  commissionsPaid: makeKpi(10000),
  payrollAggregates: {
    payrollPaid: 100000,
    commissionsPaid: 10000,
    cnssContributions: 6000,
    cnsContributions: 2000,
    employerChargesSocials: 10000,
    totalEmploymentCost: 120000,
  },
  branchPerformance: [
    {
      branchId: "br_1",
      branchName: "Succursale Nord",
      revenue: 100000,
      expenses: 150000,
      payrollCost: 120000,
      nonPayrollExpenses: 30000,
      profit: -50000,
      margin: -50,
      attendanceRate: 87.5,
      attendanceFrequency: 90,
      employeeCount: 4,
      efficiencyScore: 60,
    },
  ],
  departmentPerformance: [
    {
      departmentId: "dept_ops",
      departmentName: "Opérations",
      expenses: 100000,
      payrollCost: 80000,
      nonPayrollExpenses: 20000,
      employeeCount: 2,
      attendanceRate: 87.5,
      attendanceFrequency: 90,
      averageHours: 8,
      revenue: 70000,
      margin: -43,
    },
    {
      departmentId: "dept_sales",
      departmentName: "Ventes",
      expenses: 50000,
      payrollCost: 40000,
      nonPayrollExpenses: 10000,
      employeeCount: 2,
      attendanceRate: 87.5,
      attendanceFrequency: 90,
      averageHours: 8,
      revenue: 30000,
      margin: -67,
    },
  ],
  employeeScorecards: [
    {
      employeeId: "emp_1",
      employeeName: "Jean Marc",
      branchId: "br_1",
      departmentId: "dept_ops",
      attendanceConsistencyScore: 95,
      latenessScore: 0,
      productivityIndex: 92,
      overtimeHours: 2,
      totalHours: 160,
      baseSalary: 50000,
      commissions: 5000,
      netPaid: 48000,
      payrollCost: 55000,
      underperformanceSignal: false,
      salesVolume: 40000,
    },
  ],
  historicalTrends: [],
  expenseBreakdown: [],
  forecast: { forecast7Days: -85000, forecast15Days: -125000, forecast30Days: -200000 },
  anomalies: [],
  businessHealthScore: 52,
  profitMargin: -50,
  payrollCostRatio: 120,
  isSocialTaxEnabled: true,
  ...overrides,
});

describe("BI & Executive SSOT Card Consistency Audit", () => {
  describe("1. AccrualBasisEngine Dimensional Filtering, Proration & Statutory Taxes", () => {
    const employees: Employee[] = [
      { id: "e1", business_id: BIZ_ID, name: "Alice", branchId: "br_a", departmentId: "dept_sales", status: "ACTIVE", role: "EMPLOYEE", baseSalary: 20000 } as any,
      { id: "e2", business_id: BIZ_ID, name: "Bob", branchId: "br_b", departmentId: "dept_ops", status: "ACTIVE", role: "EMPLOYEE", baseSalary: 30000 } as any,
    ];
    const cycles: PayrollCycle[] = [
      { id: "cyc_aug", business_id: BIZ_ID, startDate: "2026-08-01", endDate: "2026-08-30", status: "COMPLETED" } as any,
    ];
    const payrolls: PayrollRecord[] = [
      {
        id: "pr_e1",
        business_id: BIZ_ID,
        employeeId: "e1",
        cycleId: "cyc_aug",
        // grossSalary already includes commission per payroll engine contract; must NOT double-count commissions
        grossSalary: 25000,
        commissions: 5000,
        cnss_employer_cents: 0,
        ofatma_employer_cents: 0,
        status: "PAID",
      } as any,
      {
        id: "pr_e2",
        business_id: BIZ_ID,
        employeeId: "e2",
        cycleId: "cyc_aug",
        grossSalary: 30000,
        commissions: 0,
        cnss_employer_cents: 180000, // 1,800 HTG
        ofatma_employer_cents: 60000, // 600 HTG
        status: "PAID",
      } as any,
      {
        id: "pr_cancelled",
        business_id: BIZ_ID,
        employeeId: "e1",
        cycleId: "cyc_aug",
        grossSalary: 99999,
        status: "CANCELLED",
      } as any,
    ];
    const txs: LedgerTransaction[] = [
      { id: "tx_inc_a", business_id: BIZ_ID, date: "2026-08-10", type: "INCOME", amount: 80000, employeeId: "e1", cost_center_id: "br_a", status: "POSTED" } as any,
      { id: "tx_exp_a", business_id: BIZ_ID, date: "2026-08-12", type: "EXPENSE", amount: 12000, employeeId: "e1", status: "POSTED" } as any,
      { id: "tx_pen_a", business_id: BIZ_ID, date: "2026-08-13", type: "PENALTY", amount: 2000, employeeId: "e1", status: "POSTED" } as any,
      { id: "tx_inc_untagged", business_id: BIZ_ID, date: "2026-08-14", type: "INCOME", amount: 50000, status: "POSTED" } as any,
      { id: "tx_exp_b", business_id: BIZ_ID, date: "2026-08-15", type: "EXPENSE", amount: 9000, branch_id: "br_b", department_id: "dept_ops", status: "POSTED" } as any,
    ];

    it("enforces branch/employee/transactionType filtering, excludes untagged/cancelled, subtracts penalties, and avoids commission double-counting", async () => {
      const snap = await AccrualBasisEngine.generateSnapshot(
        BIZ_ID,
        {
          startDate: "2026-08-01",
          endDate: "2026-08-30",
          branchId: "br_a",
        },
        txs,
        payrolls,
        employees,
        { businessSettings: { payroll_policies: { enableTaxes: true } }, payrollCycles: cycles }
      );

      // Revenue for br_a via cost_center_id + employee inheritance = 80,000 (excludes br_b & untagged 50,000)
      expect(snap.revenueRecognized).toBe(80000);
      // Expenses for br_a via employee inheritance = 12,000 EXPENSE - 2,000 PENALTY = 10,000
      expect(snap.expensesAccrued).toBe(10000);
      // Payroll for br_a (pr_e1 only; pr_cancelled excluded; commissions not double-counted; explicit 0 employer tax respected -> DEF-9C-08)
      expect(snap.payrollAccrued.total).toBe(25000);
      expect(snap.payrollAccrued.employerContributions).toBe(0);
      expect(snap.byEmployee).toHaveLength(1);
      expect(snap.byEmployee[0].employeeId).toBe("e1");
      expect(snap.byEmployee[0].totalCost).toBe(25000);
    });

    it("prorates payroll costs across sub-period ranges and respects disabled social taxes", async () => {
      const snapHalf = await AccrualBasisEngine.generateSnapshot(
        BIZ_ID,
        {
          startDate: "2026-08-01",
          endDate: "2026-08-15", // 15 / 30 = 0.5
          branchId: "br_b",
        },
        txs,
        payrolls,
        employees,
        { businessSettings: { payroll_policies: { enableTaxes: false } }, payrollCycles: cycles }
      );

      // 30,000 gross * 0.5 = 15,000; taxes disabled -> 0 employerContributions
      expect(snapHalf.payrollAccrued.total).toBe(15000);
      expect(snapHalf.payrollAccrued.employerContributions).toBe(0);
    });

    it("filters accurately by transactionType in AccrualBasisEngine", async () => {
      const snapIncomeOnly = await AccrualBasisEngine.generateSnapshot(
        BIZ_ID,
        { startDate: "2026-08-01", endDate: "2026-08-30", transactionType: "INCOME" },
        txs,
        payrolls,
        employees,
        { payrollCycles: cycles }
      );
      expect(snapIncomeOnly.revenueRecognized).toBe(130000);
      expect(snapIncomeOnly.expensesAccrued).toBe(0);
    });
  });

  describe("2. AnalyticsEngine branchPerformance & departmentPerformance SSOT", () => {
    it("resolves branch cost_center_id and employee branch fallback and subtracts PENALTY in departmentPerformance", () => {
      const branches: Branch[] = [{ id: "br_north", name: "Nord", business_id: BIZ_ID } as any];
      const departments: Department[] = [{ id: "dept_ops", name: "Opérations", business_id: BIZ_ID } as any];
      const employees: Employee[] = [
        { id: "e1", name: "Marc", business_id: BIZ_ID, branchId: "br_north", departmentId: "dept_ops", status: "ACTIVE", role: "EMPLOYEE" } as any,
      ];
      const txs: LedgerTransaction[] = [
        { id: "t1", business_id: BIZ_ID, date: "2026-08-10", type: "INCOME", amount: 50000, cost_center_id: "br_north", departmentId: "dept_ops", status: "POSTED" } as any,
        { id: "t2", business_id: BIZ_ID, date: "2026-08-11", type: "EXPENSE", amount: 10000, employeeId: "e1", departmentId: "dept_ops", status: "POSTED" } as any,
        { id: "t3", business_id: BIZ_ID, date: "2026-08-12", type: "PENALTY", amount: 1500, employeeId: "e1", departmentId: "dept_ops", status: "POSTED" } as any,
      ];

      const snap = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-08-01", endDate: "2026-08-31" },
        employees,
        transactions: txs,
        branches,
        departments,
        businessId: BIZ_ID,
      });

      const brNorth = snap.branchPerformance.find((b) => b.branchId === "br_north");
      expect(brNorth?.revenue).toBe(50000);
      expect(brNorth?.nonPayrollExpenses).toBe(8500);

      const deptOps = snap.departmentPerformance.find((d) => d.departmentId === "dept_ops");
      expect(deptOps?.nonPayrollExpenses).toBe(8500);
      expect(snap.expenses.currentValue).toBe(8500);
    });
  });

  describe("3. UI Card Consistency & Rendering Audit", () => {
    it("renders BIExecutiveKpis decoupled from isSimplifiedMode, respecting accountingBasis, isSocialTaxEnabled, and N/D forecast fallback", () => {
      const snapshot = buildBaseSnapshot({ forecast: undefined as any });
      const html = renderToStaticMarkup(
        <ExecutiveFilterProvider>
          <AnalyticsFilterProvider>
            <BIExecutiveKpis
              tbi={{
                netMargin: "Marge nette",
                payrollMass: "Masse salariale",
                activeStaff: "Effectif actif",
                attendanceRate: "Assiduité",
              }}
              totalRevenue={100000}
              totalExpenses={150000}
              netProfit={-50000}
              profitMarginPercentage={-50}
              payrollAggregates={snapshot.payrollAggregates}
              isSocialTaxEnabled={false}
              activeEmployeesCount={4}
              attendanceAggregates={{
                attendanceRate: 87.5,
                attendanceFrequency: 90,
                latenessRate: 5,
                absenceRate: 12.5,
                avgHours: 8,
                overrides: 0,
              }}
              totalAdvancesPending={2000}
              biSnapshot={snapshot}
              handleSaveSnapshot={() => {}}
              isSimplifiedMode={true}
              accountingBasis="ACCRUAL"
              accrualSnapshot={{
                period: { startDate: "2026-08-01", endDate: "2026-08-31" },
                revenueRecognized: 111111,
                expensesAccrued: 22222,
                payrollAccrued: {
                  grossSalary: 33333,
                  employerContributions: 0,
                  commissions: 0,
                  bonuses: 0,
                  total: 33333,
                  paid: 0,
                  payable: 33333,
                },
                netIncome: 55556,
                grossMargin: 50,
                operatingMargin: 50,
                workingCapital: {
                  accountsReceivable: 111111,
                  accountsPayable: 22222,
                  cash: 0,
                  total: 88889,
                },
                byDepartment: [],
                byEmployee: [],
                reconciliation: {
                  cashRevenue: 0,
                  accrualRevenue: 111111,
                  varianceRevenue: -111111,
                  cashPayroll: 0,
                  accrualPayroll: 33333,
                  variancePayroll: -33333,
                  cashExpenses: 0,
                  accrualExpenses: 22222,
                  varianceExpenses: -22222,
                },
              }}
            />
          </AnalyticsFilterProvider>
        </ExecutiveFilterProvider>
      );

      // Even though isSimplifiedMode=true, accountingBasis="ACCRUAL" must drive Card 1-4 labels & values
      expect(html).toContain("Comptabilité d&#x27;exercice");
      expect(html).toContain("Factures reçues et passifs");
      expect(html).toContain("33,333");
      // Tax disabled -> subtitle must omit cotisations patronales
      expect(html).toContain("RH : Salaires bruts engagés");
      expect(html).not.toContain("+ cotisations patronales");
      // Forecast null/missing -> N/D instead of 0 HTG
      expect(html).toContain("N/D");
    });

    it("renders ExecutiveDepartmentExpenses with nonPayrollExpenses for Exploitation GL without corrupting Toutes button total", () => {
      const snapshot = buildBaseSnapshot();
      const html = renderToStaticMarkup(
        <ExecutiveDepartmentExpenses snapshot={snapshot} currency="USD" accountingBasis="CASH" />
      );

      expect(html).toContain("Toutes (150,000 USD)");
      expect(html).toContain("Paie décaissée :");
      expect(html).toContain("20,000 USD");
    });

    it("renders ExecutivePayroll without 100% clamp on payrollRatio and separates employer social charges", () => {
      const snapshot = buildBaseSnapshot(); // payroll 120,000 / revenue 100,000 => 120%
      const html = renderToStaticMarkup(
        <ExecutivePayroll snapshot={snapshot} isSocialTaxEnabled={true} currency="HTG" accountingBasis="ACCRUAL" />
      );

      expect(html).toContain("120%");
      expect(html).toContain("Cotisations patronales :");
      expect(html).toContain("10,000 HTG");
    });

    it("renders ExecutiveStaffLeaderboard with resolved branch name and never falls back to unfiltered employees", () => {
      const snapshotWithScorecards = buildBaseSnapshot();
      const htmlWithData = renderToStaticMarkup(
        <ExecutiveStaffLeaderboard
          snapshot={snapshotWithScorecards}
          branches={[{ id: "br_1", name: "Succursale Nord" }]}
          currency="USD"
        />
      );
      expect(htmlWithData).toContain("Succursale Nord");
      expect(htmlWithData).toContain("48,000 USD");
      expect(htmlWithData).not.toContain("Bureau Central");

      const emptySnapshot = buildBaseSnapshot({ employeeScorecards: [] });
      const htmlEmpty = renderToStaticMarkup(
        <ExecutiveStaffLeaderboard
          snapshot={emptySnapshot}
          employees={[{ id: "leak_emp", name: "Should Not Leak", salary: 99999 }]}
          branches={[]}
          currency="HTG"
        />
      );
      expect(htmlEmpty).not.toContain("Should Not Leak");
      expect(htmlEmpty).toContain("Aucun registre de présence ou de paie pour cette sélection.");
    });

    it("renders ExecutiveAIAdvisor & ReconciliationBridge without +- signs on negative numbers and preserves 1-decimal ExecutiveAttendance", () => {
      const snapshot = buildBaseSnapshot(); // profit -50,000, payrollRatio 120%, attendance 87.5%
      const advisorHtml = renderToStaticMarkup(
        <ExecutiveAIAdvisor snapshot={snapshot} currency="USD" accountingBasis="ACCRUAL" />
      );
      expect(advisorHtml).not.toContain("+-");
      expect(advisorHtml).toContain("-50,000 USD");
      expect(advisorHtml).toContain("120%");

      const attHtml = renderToStaticMarkup(<ExecutiveAttendance snapshot={snapshot} />);
      expect(attHtml).toContain("87.5%");

      const bridgeHtml = renderToStaticMarkup(
        <ReconciliationBridge
          currency="USD"
          snapshot={{
            period: { startDate: "2026-08-01", endDate: "2026-08-31" },
            revenueRecognized: 1000,
            expensesAccrued: 500,
            payrollAccrued: {
              grossSalary: 300,
              employerContributions: 0,
              commissions: 0,
              bonuses: 0,
              total: 300,
              paid: 300,
              payable: 0,
            },
            netIncome: 200,
            grossMargin: 50,
            operatingMargin: 20,
            workingCapital: {
              accountsReceivable: 0,
              accountsPayable: 0,
              cash: 1200,
              total: 1200,
            },
            byDepartment: [],
            byEmployee: [],
            reconciliation: {
              cashRevenue: 1200,
              accrualRevenue: 1000,
              varianceRevenue: -200,
              cashPayroll: 450,
              accrualPayroll: 300,
              variancePayroll: -150,
              cashExpenses: 700,
              accrualExpenses: 500,
              varianceExpenses: -200,
            },
          }}
        />
      );
      expect(bridgeHtml).not.toContain("+-");
      expect(bridgeHtml).toContain("-150 USD");
      expect(bridgeHtml).toContain("-200 USD");
    });

    it("supports custom currency parameter in ExecutiveRecommendationEngine, ExecutiveAlertEngine, and ExecutiveScoreEngine", () => {
      const snapshot = buildBaseSnapshot({
        revenue: makeKpi(40000, 100000),
        cashOnHand: makeKpi(15000),
      });
      snapshot.revenue.differencePercentage = -60;

      const recs = ExecutiveRecommendationEngine.generateRecommendations(snapshot, "USD");
      expect(recs.find((r) => r.id === "rec_cash_reserve")?.description).toContain("15,000 USD");

      const alerts = ExecutiveAlertEngine.generateAlerts(snapshot, "USD");
      expect(alerts.find((a) => a.id === "alert_rev_drop")?.description).toContain("40,000 USD");

      const scores = ExecutiveScoreEngine.calculateScorecards(snapshot, "USD");
      expect(scores.find((s) => s.name === "Cash Flow Security")?.explanation).toContain("15,000 USD");
    });
  });
});
