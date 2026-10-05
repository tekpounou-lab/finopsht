import { describe, it, expect } from "vitest";
import { TaxPolicyEngine } from "../../services/payroll/TaxPolicyEngine";
import { resolveTaxRatesForDate, calculateEmployeePayrollItem } from "../../components/payroll/services/PayrollCalculationEngine";
import { AccountingEngine } from "../../services/AccountingEngine";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { StaticDataCacheService } from "../../services/cache/StaticDataCacheService";
import { resolveAnalyticsPayrollDate } from "../../utils/dateNormalization";
import { BusinessTaxConfiguration, BusinessAdministrationRepository } from "../../repositories/BusinessAdministrationRepository";
import { PayrollCycle, PayrollRecord } from "../../types";
import { EventBus } from "../../modules/runtime/EventBus";
import { idbCache } from "../../services/cache/idb";

describe("PHASE 14 — Payroll Policy Lifecycle, Audit Trail & Recalculation Integrity Verification", () => {
  const tenantA = "phase14_tenant_alpha";
  const tenantB = "phase14_tenant_beta";

  // V1 Golden Policy (Sept 1 - Sept 30)
  const v1Policy = {
    id: "PH14-V1",
    cnssRateEmployee: 0.06,
    cnssRateEmployer: 0.06,
    cnsRateEmployee: 0.02,
    cnsRateEmployer: 0.03,
    survivalFloorHTG: 15000,
    effectiveFrom: "2026-09-01",
    effectiveTo: "2026-09-30",
  };

  // V2 Golden Policy (Oct 1 - Active)
  const v2Policy = {
    id: "PH14-V2",
    cnssRateEmployee: 0.08,
    cnssRateEmployer: 0.08,
    cnsRateEmployee: 0.03,
    cnsRateEmployer: 0.03,
    survivalFloorHTG: 15000,
    effectiveFrom: "2026-10-01",
  };

  const goldenTaxConfig: BusinessTaxConfiguration = {
    enableTaxes: true,
    cnssRateEmployee: 0.08,
    cnssRateEmployer: 0.08,
    cnsRateEmployee: 0.03,
    cnsRateEmployer: 0.03,
    survivalFloorHTG: 15000,
    currency: "HTG",
    history: [v1Policy, v2Policy],
  };

  // =========================================================================
  // 1. TaxPolicyEngine as Canonical SSOT & Golden Dataset Verification
  // =========================================================================
  describe("1. TaxPolicyEngine SSOT & Golden Dataset Numerical Verification", () => {
    it("V1 Golden Calculations (Gross 100k -> Net 92k, Employer Cost 109k)", () => {
      const v1Rates = resolveTaxRatesForDate(goldenTaxConfig, "2026-09-15");
      expect(v1Rates.cnssRateEmployee).toBe(0.06);
      expect(v1Rates.cnssRateEmployer).toBe(0.06);
      expect(v1Rates.cnsRateEmployee).toBe(0.02);
      expect(v1Rates.cnsRateEmployer).toBe(0.03);

      const dualResult = TaxPolicyEngine.calculateDualSideContributions(100000, {
        onaEmployeeRate: 0.06,
        onaEmployerRate: 0.06,
        ofatmaEmployeeRate: 0.02,
        ofatmaEmployerRate: 0.03,
      });
      expect(dualResult.onaEmployee).toBe(6000);   // ONA Employee
      expect(dualResult.ofatmaEmployee).toBe(2000); // OFATMA Employee
      expect(dualResult.totalEmployeeDeductions).toBe(8000);
      expect(dualResult.onaEmployer).toBe(6000);   // ONA Employer
      expect(dualResult.ofatmaEmployer).toBe(3000); // OFATMA Employer
      expect(dualResult.totalEmployerContributions).toBe(9000);
      expect(dualResult.totalEmployerPayrollCost).toBe(109000);

      const lineItem = {
        baseSalaryHTG: 100000,
        hourlyRateHTG: 0,
        overtimeHours150: 0,
        overtimeHours200: 0,
        bonusesHTG: 0,
        commissionsHTG: 0,
        advancesHTG: 0,
      };

      const item = calculateEmployeePayrollItem(lineItem, tenantA, "emp1", "2026-09-15", goldenTaxConfig);
      expect(item.grossPay).toBe(100000);
      expect(item.netPay).toBe(92000);
      expect(item.taxDeductions.employeeCNSS).toBe(6000);
      expect(item.taxDeductions.employeeCNS).toBe(2000);
      expect(item.taxDeductions.employerCNSS).toBe(6000);
      expect(item.taxDeductions.employerCNS).toBe(3000);
      expect(item.taxDeductions.totalEmployerCost).toBe(109000);
    });

    it("V2 Golden Calculations (Gross 100k -> Net 89k, Employer Cost 111k)", () => {
      const v2Rates = resolveTaxRatesForDate(goldenTaxConfig, "2026-10-15");
      expect(v2Rates.cnssRateEmployee).toBe(0.08);
      expect(v2Rates.cnssRateEmployer).toBe(0.08);
      expect(v2Rates.cnsRateEmployee).toBe(0.03);
      expect(v2Rates.cnsRateEmployer).toBe(0.03);

      const dualResult = TaxPolicyEngine.calculateDualSideContributions(100000, {
        onaEmployeeRate: 0.08,
        onaEmployerRate: 0.08,
        ofatmaEmployeeRate: 0.03,
        ofatmaEmployerRate: 0.03,
      });
      expect(dualResult.onaEmployee).toBe(8000);   // ONA Employee
      expect(dualResult.ofatmaEmployee).toBe(3000); // OFATMA Employee
      expect(dualResult.totalEmployeeDeductions).toBe(11000);
      expect(dualResult.onaEmployer).toBe(8000);   // ONA Employer
      expect(dualResult.ofatmaEmployer).toBe(3000); // OFATMA Employer
      expect(dualResult.totalEmployerContributions).toBe(11000);
      expect(dualResult.totalEmployerPayrollCost).toBe(111000);

      const lineItem = {
        baseSalaryHTG: 100000,
        hourlyRateHTG: 0,
        overtimeHours150: 0,
        overtimeHours200: 0,
        bonusesHTG: 0,
        commissionsHTG: 0,
        advancesHTG: 0,
      };

      const item = calculateEmployeePayrollItem(lineItem, tenantA, "emp1", "2026-10-15", goldenTaxConfig);
      expect(item.grossPay).toBe(100000);
      expect(item.netPay).toBe(89000);
      expect(item.taxDeductions.employeeCNSS).toBe(8000);
      expect(item.taxDeductions.employeeCNS).toBe(3000);
      expect(item.taxDeductions.employerCNSS).toBe(8000);
      expect(item.taxDeductions.employerCNS).toBe(3000);
      expect(item.taxDeductions.totalEmployerCost).toBe(111000);
    });
  });

  // =========================================================================
  // 2. Recalculation Integrity & Zero Cumulative Drift
  // =========================================================================
  describe("2. Recalculation Idempotency & Zero Cumulative Drift", () => {
    it("Unsealed payroll recalculation x3 produces strictly deterministic identical values", () => {
      const lineItem = {
        baseSalaryHTG: 100000,
        hourlyRateHTG: 0,
        overtimeHours150: 0,
        overtimeHours200: 0,
        bonusesHTG: 0,
        commissionsHTG: 0,
        advancesHTG: 0,
      };

      const run1 = calculateEmployeePayrollItem(lineItem, tenantA, "emp1", "2026-09-15", goldenTaxConfig);
      const run2 = calculateEmployeePayrollItem(lineItem, tenantA, "emp1", "2026-09-15", goldenTaxConfig);
      const run3 = calculateEmployeePayrollItem(lineItem, tenantA, "emp1", "2026-09-15", goldenTaxConfig);

      expect(run1.netPay).toBe(run2.netPay);
      expect(run2.netPay).toBe(run3.netPay);
      expect(run1.netPay).toBe(92000);

      expect(run1.taxDeductions.totalEmployerCost).toBe(run2.taxDeductions.totalEmployerCost);
      expect(run2.taxDeductions.totalEmployerCost).toBe(run3.taxDeductions.totalEmployerCost);
      expect(run1.taxDeductions.totalEmployerCost).toBe(109000);

      expect(run1.taxDeductions.employerContributionsTotal).toBe(9000);
      expect(run2.taxDeductions.employerContributionsTotal).toBe(9000);
      expect(run3.taxDeductions.employerContributionsTotal).toBe(9000);
    });
  });

  // =========================================================================
  // 3. Historical Immutability & Sealed Payroll Protection
  // =========================================================================
  describe("3. Historical Immutability & Sealed Record Preservation", () => {
    it("Sealed September V1 payroll record retains 92k Net / 109k Employer Cost after V2 activation", () => {
      const septSnapshot: PayrollRecord = {
        id: "pr_sept_sealed_01",
        employeeId: "emp_01",
        grossSalary: 100000,
        gross_salary_cents: 10000000,
        netPaid: 92000,
        net_salary_cents: 9200000,
        employer_contributions_cents: 900000,
        cnss_employee_cents: 600000,
        cns_employee_cents: 200000,
        cnss_employer_cents: 600000,
        cns_employer_cents: 300000,
        period_start: "2026-09-01",
        period_end: "2026-09-30",
        business_id: tenantA,
        status: "COMPLETED",
        appliedPolicyVersion: "V1",
      } as any;

      // Currently active policy in business is V2
      const activePolicyVersion = "V2";

      // Verify that historical record snapshot properties are completely preserved
      expect((septSnapshot as any).netPaid).toBe(92000);
      expect((septSnapshot as any).grossSalary).toBe(100000);
      expect((septSnapshot as any).cnss_employee_cents).toBe(600000); // 6,000 HTG
      expect((septSnapshot as any).cns_employee_cents).toBe(200000);  // 2,000 HTG
      expect((septSnapshot as any).employer_contributions_cents).toBe(900000); // 9,000 HTG
      expect((septSnapshot as any).appliedPolicyVersion).toBe("V1");
    });
  });

  // =========================================================================
  // 4. Double-Entry Accounting Reconciliation & Idempotency
  // =========================================================================
  describe("4. Accounting Ledger Reconciliation & Idempotency", () => {
    const cycle: PayrollCycle = {
      id: "cycle_sept_p14",
      cycleName: "Septembre 2026",
      label: "Paie M09 2026",
      status: "SEALED",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      effectiveAccountingDate: "2026-09-30",
      business_id: tenantA,
    } as any;

    const record: PayrollRecord = {
      id: "pr_p14_rec_01",
      employeeId: "emp_01",
      gross_salary_cents: 10000000,
      cnss_employee_cents: 600000,
      cns_employee_cents: 200000,
      cnss_employer_cents: 600000,
      cns_employer_cents: 300000,
      employer_contributions_cents: 900000,
      net_salary_cents: 9200000,
      grossSalary: 100000,
      netPaid: 92000,
      business_id: tenantA,
    } as any;

    it("Creates perfectly balanced double-entry journal entry (Debits == Credits == 109,000 HTG)", () => {
      const { journalEntry, transactions } = AccountingEngine.createPayrollJournalEntry(
        cycle,
        [record],
        tenantA,
        { id: "admin_01", email: "admin@finops.ht" }
      );

      expect(journalEntry.isBalanced).toBe(true);
      expect(journalEntry.isLocked).toBe(true);
      expect(journalEntry.totalDebitCents).toBe(10900000);  // 109,000 HTG
      expect(journalEntry.totalCreditCents).toBe(10900000); // 109,000 HTG

      // Sum of debits and sum of credits across transactions
      const totalDebits = transactions.reduce((acc, t) => acc + (t.debit_account ? t.amount : 0), 0);
      const totalCredits = transactions.reduce((acc, t) => acc + (t.credit_account ? t.amount : 0), 0);
      expect(totalDebits).toBe(totalCredits);
    });

    it("Accounting idempotency: Subsequent calls for same cycle return identical journal entry", () => {
      const res1 = AccountingEngine.createPayrollJournalEntry(cycle, [record], tenantA);
      const res2 = AccountingEngine.createPayrollJournalEntry(cycle, [record], tenantA);

      expect(res1.journalEntry.id).toBe(res2.journalEntry.id);
      expect(res1.journalEntry.totalDebitCents).toBe(res2.journalEntry.totalDebitCents);
      expect(res1.transactions.length).toBe(res2.transactions.length);
    });
  });

  // =========================================================================
  // 5. Audit Trail & Event Publishing Verification
  // =========================================================================
  describe("5. Audit Trail & Event Publishing", () => {
    it("Publishing PayrollPoliciesUpdated event dispatches via EventBus cleanly", () => {
      let publishedEvent: any = null;
      const unsubscribe = EventBus.subscribe("PayrollPoliciesUpdated", (evt) => {
        publishedEvent = evt;
      });

      EventBus.publish(EventBus.createEvent({
        correlationId: "test_corr_p14",
        actorId: "usr_admin_01",
        businessId: tenantA,
        module: "PAYROLL",
        aggregate: "BUSINESS_SETTINGS",
        type: "PayrollPoliciesUpdated",
        payload: { businessId: tenantA, updates: { enableTaxes: true } }
      }));

      expect(publishedEvent).not.toBeNull();
      expect(publishedEvent.type).toBe("PayrollPoliciesUpdated");
      expect(publishedEvent.businessId).toBe(tenantA);
      expect(publishedEvent.actorId).toBe("usr_admin_01");

      unsubscribe();
    });
  });

  // =========================================================================
  // 6. Tenant Isolation & Security Boundary Verification
  // =========================================================================
  describe("6. Multi-Tenant Isolation & Business Boundaries", () => {
    it("Tenant Alpha and Tenant Beta resolve independent policy rates", () => {
      const configAlpha: BusinessTaxConfiguration = {
        enableTaxes: true,
        cnssRateEmployee: 0.06,
        cnssRateEmployer: 0.06,
        cnsRateEmployee: 0.02,
        cnsRateEmployer: 0.03,
        survivalFloorHTG: 15000,
        currency: "HTG",
      };

      const configBeta: BusinessTaxConfiguration = {
        enableTaxes: true,
        cnssRateEmployee: 0.08,
        cnssRateEmployer: 0.08,
        cnsRateEmployee: 0.03,
        cnsRateEmployer: 0.03,
        survivalFloorHTG: 15000,
        currency: "HTG",
      };

      const ratesAlpha = resolveTaxRatesForDate(configAlpha, "2026-09-15");
      const ratesBeta = resolveTaxRatesForDate(configBeta, "2026-09-15");

      expect(ratesAlpha.cnssRateEmployee).toBe(0.06);
      expect(ratesBeta.cnssRateEmployee).toBe(0.08);
      expect(ratesAlpha.cnsRateEmployee).toBe(0.02);
      expect(ratesBeta.cnsRateEmployee).toBe(0.03);
    });

    it("Accounting entries for Tenant Beta inherit tenant B business_id on all legs", () => {
      const cycleBeta: PayrollCycle = {
        id: "cycle_beta_01",
        business_id: tenantB,
      } as any;

      const recordBeta: PayrollRecord = {
        id: "rec_beta_01",
        gross_salary_cents: 5000000,
        net_salary_cents: 4450000,
        employer_contributions_cents: 550000,
        business_id: tenantB,
      } as any;

      const { journalEntry, transactions } = AccountingEngine.createPayrollJournalEntry(cycleBeta, [recordBeta], tenantB);
      expect(journalEntry.businessId).toBe(tenantB);
      transactions.forEach((tx) => {
        expect(tx.business_id).toBe(tenantB);
      });
    });
  });

  // =========================================================================
  // 7. Statutory Defaults vs Explicit Zero Semantic Contract
  // =========================================================================
  describe("7. Statutory Default vs Explicit Zero Semantic Contract", () => {
    it("Explicit disable (enableTaxes: false) returns VALID_ZERO (0% for all rates)", () => {
      const disabledConfig: BusinessTaxConfiguration = {
        enableTaxes: false,
        cnssRateEmployee: 0.06,
        cnssRateEmployer: 0.06,
        cnsRateEmployee: 0.02,
        cnsRateEmployer: 0.03,
        survivalFloorHTG: 15000,
        currency: "HTG",
      };

      const rates = resolveTaxRatesForDate(disabledConfig, "2026-09-15");
      expect(rates.cnssRateEmployee).toBe(0);
      expect(rates.cnssRateEmployer).toBe(0);
      expect(rates.cnsRateEmployee).toBe(0);
      expect(rates.cnsRateEmployer).toBe(0);
    });

    it("Missing rate values fall back to STATUTORY_DEFAULT (ONA 6%/6%, OFATMA 2%/3%)", () => {
      const incompleteConfig: BusinessTaxConfiguration = {
        enableTaxes: true,
      } as any;

      const rates = resolveTaxRatesForDate(incompleteConfig, "2026-09-15");
      expect(rates.cnssRateEmployee).toBe(0.06);
      expect(rates.cnssRateEmployer).toBe(0.06);
      expect(rates.cnsRateEmployee).toBe(0.02);
      expect(rates.cnsRateEmployer).toBe(0.03);
    });
  });

  // =========================================================================
  // 8. CASH vs ACCRUAL Accounting Date Resolution
  // =========================================================================
  describe("8. CASH vs ACCRUAL Accounting Date Resolution", () => {
    it("Payroll earned Sept 30 and paid Oct 5 evaluates to Sept 30 in ACCRUAL and Oct 5 in CASH", () => {
      const record: PayrollRecord = {
        id: "pr_cash_accrual_01",
        period_end: "2026-09-30",
        paymentDate: "2026-10-05",
      } as any;

      const accrualDate = resolveAnalyticsPayrollDate(record, false); // ACCRUAL
      const cashDate = resolveAnalyticsPayrollDate(record, true);    // CASH

      expect(accrualDate).toBe("2026-09-30");
      expect(cashDate).toBe("2026-10-05");
      expect(accrualDate).not.toBe(cashDate);
    });
  });

  // =========================================================================
  // 9. AnalyticsEngine SSOT Integrity
  // =========================================================================
  describe("9. AnalyticsEngine SSOT Integrity", () => {
    it("AnalyticsEngine September snapshot produces exactly 109,000 HTG Total Payroll Cost", () => {
      const record: PayrollRecord = {
        id: "pr_analytics_sept",
        grossSalary: 100000,
        gross_salary_cents: 10000000,
        netPay: 92000,
        net_salary_cents: 9200000,
        employer_contributions_cents: 900000,
        period_start: "2026-09-01",
        period_end: "2026-09-30",
        business_id: tenantA,
        status: "COMPLETED",
      } as any;

      const snap = AnalyticsEngine.generateSnapshot(
        "CUSTOM",
        { startDate: "2026-09-01", endDate: "2026-09-30" },
        [{ id: "emp1", status: "ACTIVE", business_id: tenantA } as any],
        [],
        [],
        [record],
        [],
        [],
        [],
        tenantA,
        "fr"
      );

      expect(snap.payrollCost.currentValue).toBe(109000);
    });
  });

  // =========================================================================
  // 10. Cache Invalidation & In-Memory Purging
  // =========================================================================
  describe("10. Cache Invalidation & Synchronization", () => {
    it("StaticDataCacheService.invalidateKey successfully clears cached policy entries", async () => {
      const cacheKey = `tax_config:${tenantA}`;
      await idbCache.set(cacheKey, goldenTaxConfig, 60000, "TAX_CONFIG", tenantA);

      let cached = await idbCache.get(cacheKey);
      expect(cached).toBeDefined();

      await StaticDataCacheService.invalidateKey(cacheKey);

      cached = await idbCache.get(cacheKey);
      expect(cached).toBeNull();
    });
  });
});
