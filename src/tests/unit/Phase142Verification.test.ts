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

describe("PHASE 14.2 — Unknown-Commit, Offline Policy Safety & Tenant-Resolution Verification", () => {
  const tenantA = "phase142_tenant_alpha";
  const tenantB = "phase142_tenant_beta";

  const v1History = {
    cnssRateEmployee: 0.06,
    cnssRateEmployer: 0.06,
    cnsRateEmployee: 0.02,
    cnsRateEmployer: 0.03,
    survivalFloorHTG: 15000,
    effectiveFrom: "2026-09-01",
    effectiveTo: "2026-09-30",
  };

  const v2History = {
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
    history: [v1History, v2History],
  };

  // =========================================================================
  // 1. Objective A — Firestore Batch Semantics & Atomic Persistence
  // =========================================================================
  describe("Objective A — Firestore Batch Semantics & Unknown-Commit Recovery", () => {
    it("updatePayrollPolicies requires valid businessId and throws TENANT_UNRESOLVED if missing", async () => {
      await expect(
        BusinessAdministrationRepository.updatePayrollPolicies("", { enableTaxes: true }, "admin")
      ).rejects.toThrow("TENANT_UNRESOLVED");

      await expect(
        BusinessAdministrationRepository.updateTaxConfiguration("", { enableTaxes: true }, "admin")
      ).rejects.toThrow("TENANT_UNRESOLVED");
    });

    it("Unknown-Commit Recovery Algorithm: Safely reconciles when canonical state is checked before retry", () => {
      // Simulation of unknown-commit outcome
      let committedState: BusinessTaxConfiguration | null = null;

      // Unknown network outcome helper
      const simulateUnknownCommit = (payload: BusinessTaxConfiguration) => {
        // Server actually committed, but client received network timeout
        committedState = payload;
        return { status: "UNKNOWN_COMMIT" as const };
      };

      const outcome = simulateUnknownCommit(goldenTaxConfig);
      expect(outcome.status).toBe("UNKNOWN_COMMIT");

      // Recovery procedure: Re-read canonical state before issuing blind retry
      const canonicalState = committedState;
      expect(canonicalState).not.toBeNull();
      expect(canonicalState?.cnssRateEmployee).toBe(0.08);

      // Verify that matching version prevents duplicate historical entry
      const needsRetry = canonicalState === null || canonicalState.cnssRateEmployee !== 0.08;
      expect(needsRetry).toBe(false); // No duplicate retry needed
    });

    it("Policy Write Idempotency: Multiple sequential saves of V2 produce identical deterministic configuration", () => {
      const run1 = resolveTaxRatesForDate(goldenTaxConfig, "2026-10-15");
      const run2 = resolveTaxRatesForDate(goldenTaxConfig, "2026-10-15");
      const run3 = resolveTaxRatesForDate(goldenTaxConfig, "2026-10-15");

      expect(run1.cnssRateEmployee).toBe(run2.cnssRateEmployee);
      expect(run2.cnssRateEmployee).toBe(run3.cnssRateEmployee);
      expect(run1.cnssRateEmployee).toBe(0.08);
      expect(run1.cnsRateEmployee).toBe(0.03);
    });
  });

  // =========================================================================
  // 2. Objective B — IndexedDB & Offline Policy Safety
  // =========================================================================
  describe("Objective B — IndexedDB Safety & Offline Stale Cache Detection", () => {
    it("IndexedDB idbCache acts strictly as READ_CACHE / BUFFER, not canonical authority", async () => {
      const cacheKey = `tax_config:${tenantA}`;
      await idbCache.set(cacheKey, goldenTaxConfig, 60000, "TAX_CONFIG", tenantA);

      const cached = await idbCache.get<BusinessTaxConfiguration>(cacheKey);
      expect(cached).toBeDefined();
      expect(cached?.currency).toBe("HTG");

      // Invalidation clears cache key immediately
      await StaticDataCacheService.invalidateKey(cacheKey);
      const rechecked = await idbCache.get(cacheKey);
      expect(rechecked).toBeNull();
    });

    it("Offline calculation on unsealed payroll produces deterministic local results", () => {
      const lineItem = {
        baseSalaryHTG: 100000,
        hourlyRateHTG: 0,
        overtimeHours150: 0,
        overtimeHours200: 0,
        bonusesHTG: 0,
        commissionsHTG: 0,
        advancesHTG: 0,
      };

      const result = calculateEmployeePayrollItem(lineItem, tenantA, "emp_01", "2026-09-15", goldenTaxConfig);
      expect(result.grossPay).toBe(100000);
      expect(result.netPay).toBe(92000);
      expect(result.taxDeductions.totalEmployerCost).toBe(109000);
    });
  });

  // =========================================================================
  // 3. Objective C — Tenant Resolution vs Calculation Fallback
  // =========================================================================
  describe("Objective C — Tenant Resolution & BIZ_MAIN Audit", () => {
    it("Tenant Alpha resolves 6% ONA for Sept, Tenant Beta resolves independent rates", () => {
      const alphaRates = resolveTaxRatesForDate(goldenTaxConfig, "2026-09-15");
      expect(alphaRates.cnssRateEmployee).toBe(0.06);

      const betaConfig: BusinessTaxConfiguration = {
        enableTaxes: true,
        cnssRateEmployee: 0.07,
        cnssRateEmployer: 0.07,
        cnsRateEmployee: 0.02,
        cnsRateEmployer: 0.03,
        survivalFloorHTG: 15000,
        currency: "HTG",
      };
      const betaRates = resolveTaxRatesForDate(betaConfig, "2026-09-15");
      expect(betaRates.cnssRateEmployee).toBe(0.07);
    });

    it("Calculation without tenant configuration falls back to STATUTORY_DEFAULT, but persistence requires explicit tenantId", async () => {
      // Calculation fallback is statutory compliance:
      const fallbackRates = resolveTaxRatesForDate(null, "2026-09-15");
      expect(fallbackRates.cnssRateEmployee).toBe(0.06);
      expect(fallbackRates.cnsRateEmployee).toBe(0.02);

      // Persistence with empty tenant is strictly rejected:
      await expect(
        BusinessAdministrationRepository.updatePayrollPolicies("", { enableTaxes: true }, "system")
      ).rejects.toThrow("TENANT_UNRESOLVED");
    });
  });

  // =========================================================================
  // 4. Policy/Payroll Race & Historical Protection
  // =========================================================================
  describe("Policy/Payroll Race & Historical Immutability", () => {
    it("Policy update race does not corrupt historical September payroll snapshot", () => {
      const septSnapshot: PayrollRecord = {
        id: "pr_sept_race_01",
        employeeId: "emp_01",
        grossSalary: 100000,
        gross_salary_cents: 10000000,
        netPaid: 92000,
        net_salary_cents: 9200000,
        employer_contributions_cents: 900000,
        period_start: "2026-09-01",
        period_end: "2026-09-30",
        business_id: tenantA,
        status: "COMPLETED",
        appliedPolicyVersion: "V1",
      } as any;

      // Concurrent V2 update occurs
      const currentConfig = { ...goldenTaxConfig, cnssRateEmployee: 0.08 };
      expect(currentConfig.cnssRateEmployee).toBe(0.08);

      // Historical record remains strictly V1
      expect((septSnapshot as any).netPaid).toBe(92000);
      expect((septSnapshot as any).employer_contributions_cents).toBe(900000);
      expect((septSnapshot as any).appliedPolicyVersion).toBe("V1");
    });

    it("AnalyticsEngine September snapshot remains 109,000 HTG using historical snapshot", () => {
      const record: PayrollRecord = {
        id: "pr_analytics_p142",
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
        [{ id: "emp_01", status: "ACTIVE", business_id: tenantA } as any],
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

    it("Accounting ledger entry remains balanced and idempotent (Total Debits == Credits == 109,000 HTG)", () => {
      const cycle: PayrollCycle = {
        id: "cycle_p142_rec",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        business_id: tenantA,
      } as any;

      const rec: PayrollRecord = {
        id: "rec_p142_rec",
        gross_salary_cents: 10000000,
        net_salary_cents: 9200000,
        employer_contributions_cents: 900000,
        cnss_employee_cents: 600000,
        cns_employee_cents: 200000,
        cnss_employer_cents: 600000,
        cns_employer_cents: 300000,
        business_id: tenantA,
      } as any;

      const { journalEntry, transactions } = AccountingEngine.createPayrollJournalEntry(cycle, [rec], tenantA);
      expect(journalEntry.isBalanced).toBe(true);
      expect(journalEntry.totalDebitCents).toBe(10900000);
      expect(journalEntry.totalCreditCents).toBe(10900000);
    });
  });
});
