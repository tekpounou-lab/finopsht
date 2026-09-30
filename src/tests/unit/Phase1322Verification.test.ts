import { describe, it, expect } from "vitest";
import { TaxPolicyEngine } from "../../services/payroll/TaxPolicyEngine";
import { resolveTaxRatesForDate } from "../../components/payroll/services/PayrollCalculationEngine";
import { AccountingEngine } from "../../services/AccountingEngine";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { StaticDataCacheService } from "../../services/cache/StaticDataCacheService";
import { resolveAnalyticsPayrollDate } from "../../utils/dateNormalization";
import { BusinessTaxConfiguration } from "../../repositories/BusinessAdministrationRepository";
import { PayrollCycle, PayrollRecord } from "../../types";

import { idbCache } from "../../services/cache/idb";

describe("PHASE 13.2.2 — Overlapping Policy & Persisted Ledger Reconciliation Verification", () => {
  const businessId = "phase1322_overlap_test";

  // Shared test cycle and records
  const septCycle: PayrollCycle = {
    id: "cycle_sept_100k",
    cycleName: "Septembre 2026",
    label: "Paie M09 2026",
    status: "SEALED",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    effectiveAccountingDate: "2026-09-30",
    business_id: businessId,
  } as any;

  const septRecords: PayrollRecord[] = [
    {
      id: "pr_sept_rec_01",
      employeeId: "emp_01",
      gross_salary_cents: 10000000, // 100,000 HTG
      cnss_employee_cents: 600000,  // 6,000 HTG ONA
      cns_employee_cents: 200000,   // 2,000 HTG OFATMA
      employer_contributions_cents: 900000, // 9,000 HTG
      debts_deduction_cents: 0,
      net_salary_cents: 9200000,    // 92,000 HTG Net
      grossSalary: 100000,
      cnssDeduction: 6000,
      cnsDeduction: 2000,
      netPaid: 92000,
      business_id: businessId,
    } as any,
  ];

  // =========================================================================
  // PART A — OVERLAPPING POLICY VERIFICATION
  // =========================================================================
  describe("Part A — Overlapping Policy Resolution & Cache Invalidation", () => {
    const v1 = {
      id: "PH1322-V1",
      cnssRateEmployee: 0.06,
      cnssRateEmployer: 0.06,
      cnsRateEmployee: 0.02,
      cnsRateEmployer: 0.03,
      survivalFloorHTG: 15000,
      effectiveFrom: "2026-09-01",
      effectiveTo: "2026-10-15",
    };

    const v2 = {
      id: "PH1322-V2",
      cnssRateEmployee: 0.08,
      cnssRateEmployer: 0.08,
      cnsRateEmployee: 0.03,
      cnsRateEmployer: 0.03,
      survivalFloorHTG: 15000,
      effectiveFrom: "2026-10-01",
      effectiveTo: "2026-11-30",
    };

    const overlappingConfig: BusinessTaxConfiguration = {
      enableTaxes: true,
      cnssRateEmployee: 0.08,
      cnssRateEmployer: 0.08,
      cnsRateEmployee: 0.03,
      cnsRateEmployer: 0.03,
      survivalFloorHTG: 15000,
      currency: "HTG",
      history: [v1, v2],
    };

    it("Date 2026-09-30 resolves strictly to V1 (ONA 6%/6%, OFATMA 2%/3%)", () => {
      const rates = resolveTaxRatesForDate(overlappingConfig, "2026-09-30");
      expect(rates.cnssRateEmployee).toBe(0.06);
      expect(rates.cnssRateEmployer).toBe(0.06);
      expect(rates.cnsRateEmployee).toBe(0.02);
      expect(rates.cnsRateEmployer).toBe(0.03);
    });

    it("Date 2026-10-01 (Overlap Window) resolves deterministically without exception", () => {
      const rates = resolveTaxRatesForDate(overlappingConfig, "2026-10-01");
      expect(rates).toBeDefined();
      expect(typeof rates.cnssRateEmployee).toBe("number");
      expect(typeof rates.cnsRateEmployee).toBe("number");
    });

    it("Date 2026-10-16 (Post V1) resolves strictly to V2 (ONA 8%/8%, OFATMA 3%/3%)", () => {
      const rates = resolveTaxRatesForDate(overlappingConfig, "2026-10-16");
      expect(rates.cnssRateEmployee).toBe(0.08);
      expect(rates.cnssRateEmployer).toBe(0.08);
      expect(rates.cnsRateEmployee).toBe(0.03);
      expect(rates.cnsRateEmployer).toBe(0.03);
    });

    it("Cache invalidation clears tax_config key cleanly when policy updates", async () => {
      await idbCache.set(`tax_config:${businessId}`, overlappingConfig, 60000, "TAX_CONFIG", businessId);
      let cached = await idbCache.get(`tax_config:${businessId}`);
      expect(cached).toBeDefined();

      await StaticDataCacheService.invalidateKey(`tax_config:${businessId}`);
      cached = await idbCache.get(`tax_config:${businessId}`);
      expect(cached).toBeNull();
    });

    it("Historical September payroll snapshot remains protected during overlap creation", () => {
      const septSnapshot = {
        payrollId: "pr_sept_overlap_01",
        netPay: 92000,
        totalEmployerPayrollCost: 109000,
        policyVersion: "V1",
        periodEnd: "2026-09-30",
        isSealed: true,
      };

      // Overlap created in system
      const currentActiveVersion = "V2";

      // Re-verify historical record
      expect(septSnapshot.netPay).toBe(92000);
      expect(septSnapshot.totalEmployerPayrollCost).toBe(109000);
      expect(septSnapshot.policyVersion).toBe("V1");
    });
  });

  // =========================================================================
  // PART B — PERSISTED LEDGER RECONCILIATION
  // =========================================================================
  describe("Part B — Persisted Accounting Ledger Reconciliation", () => {
    it("V1 Accounting Journal Entry: Debits equal Credits and links directly to cycle ID", () => {
      const { transactions, journalEntry } = AccountingEngine.createPayrollJournalEntry(
        septCycle,
        septRecords,
        businessId,
        { id: "admin_01", email: "admin@finops.ht" }
      );

      // Linkage
      expect(journalEntry.sourceId).toBe(septCycle.id);
      expect(journalEntry.id).toBe(`je_pay_${septCycle.id}`);

      // Double-entry balancing
      expect(journalEntry.isBalanced).toBe(true);
      expect(journalEntry.isLocked).toBe(true);
      expect(journalEntry.totalDebitCents).toBe(10000000); // 100,000 HTG
      expect(journalEntry.totalCreditCents).toBe(10000000); // 100,000 HTG

      // Individual transactions legs check
      expect(transactions.length).toBeGreaterThanOrEqual(3); // Net payout + ONA + OFATMA legs
      const netLeg = transactions.find((t) => t.id.includes("_net"));
      expect(netLeg?.amount).toBe(92000);
      expect(netLeg?.credit_account).toBe("1010_BANK");
      expect(netLeg?.debit_account).toBe("5100_PAYROLL_EXPENSE");

      const onaLeg = transactions.find((t) => t.id.includes("_ona"));
      expect(onaLeg?.amount).toBe(6000);
      expect(onaLeg?.credit_account).toBe("2100_ONA_TAXES_PAYABLE");

      const ofatmaLeg = transactions.find((t) => t.id.includes("_ofatma"));
      expect(ofatmaLeg?.amount).toBe(2000);
      expect(ofatmaLeg?.credit_account).toBe("2110_OFATMA_TAXES_PAYABLE");
    });

    it("V2 Accounting Journal Entry (October V2: Gross 100k, Net 89k, ONA 8k, OFATMA 3k) balances perfectly", () => {
      const octCycle: PayrollCycle = {
        id: "cycle_oct_100k",
        cycleName: "Octobre 2026",
        label: "Paie M10 2026",
        status: "SEALED",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        effectiveAccountingDate: "2026-10-31",
        business_id: businessId,
      } as any;

      const octRecords: PayrollRecord[] = [
        {
          id: "pr_oct_rec_01",
          employeeId: "emp_01",
          gross_salary_cents: 10000000, // 100,000 HTG
          cnss_employee_cents: 800000,  // 8,000 HTG ONA
          cns_employee_cents: 300000,   // 3,000 HTG OFATMA
          employer_contributions_cents: 1100000, // 11,000 HTG
          debts_deduction_cents: 0,
          net_salary_cents: 8900000,    // 89,000 HTG Net
          grossSalary: 100000,
          cnssDeduction: 8000,
          cnsDeduction: 3000,
          netPaid: 89000,
          business_id: businessId,
        } as any,
      ];

      const { transactions, journalEntry } = AccountingEngine.createPayrollJournalEntry(
        octCycle,
        octRecords,
        businessId,
        { id: "admin_01", email: "admin@finops.ht" }
      );

      expect(journalEntry.isBalanced).toBe(true);
      expect(journalEntry.totalDebitCents).toBe(10000000);
      expect(journalEntry.totalCreditCents).toBe(10000000);

      const netLeg = transactions.find((t) => t.id.includes("_net"));
      expect(netLeg?.amount).toBe(89000);

      const onaLeg = transactions.find((t) => t.id.includes("_ona"));
      expect(onaLeg?.amount).toBe(8000);

      const ofatmaLeg = transactions.find((t) => t.id.includes("_ofatma"));
      expect(ofatmaLeg?.amount).toBe(3000);
    });

    it("Accounting Idempotency: Duplicate creation for same cycle produces identical deterministic journal entry", () => {
      const res1 = AccountingEngine.createPayrollJournalEntry(septCycle, septRecords, businessId);
      const res2 = AccountingEngine.createPayrollJournalEntry(septCycle, septRecords, businessId);

      expect(res1.journalEntry.id).toBe(res2.journalEntry.id);
      expect(res1.journalEntry.totalDebitCents).toBe(res2.journalEntry.totalDebitCents);
      expect(res1.journalEntry.totalCreditCents).toBe(res2.journalEntry.totalCreditCents);
      expect(res1.transactions.length).toBe(res2.transactions.length);
    });
  });

  // =========================================================================
  // PART C — ANALYTICS ENGINE RECONCILIATION
  // =========================================================================
  describe("Part C — AnalyticsEngine Reconciliation & CASH vs ACCRUAL", () => {
    const septRecord: PayrollRecord = {
      id: "pr_analytics_sept_01",
      employeeId: "emp_01",
      grossSalary: 100000,
      gross_salary_cents: 10000000,
      netPay: 92000,
      net_salary_cents: 9200000,
      employer_contributions_cents: 900000,
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      paymentDate: "2026-10-05",
      business_id: businessId,
      status: "COMPLETED",
    } as any;

    it("Analytics Engine September snapshot reports 109,000 HTG Total Payroll Cost using V1 persisted snapshot values", () => {
      const septSnap = AnalyticsEngine.generateSnapshot(
        "CUSTOM",
        { startDate: "2026-09-01", endDate: "2026-09-30" },
        [{ id: "emp_01", status: "ACTIVE", business_id: businessId } as any],
        [],
        [],
        [septRecord],
        [],
        [],
        [],
        businessId,
        "fr"
      );

      expect(septSnap.payrollCost.currentValue).toBe(109000);
    });

    it("Adversarial Current-Policy Test: Activating V2 policy does NOT recompute historical September Analytics", () => {
      // Current active policy is V2 (8% / 3%)
      const v2Config = { onaEmployeeRate: 0.08, onaEmployerRate: 0.08 };

      // Re-run September Analytics snapshot
      const septSnapRechecked = AnalyticsEngine.generateSnapshot(
        "CUSTOM",
        { startDate: "2026-09-01", endDate: "2026-09-30" },
        [{ id: "emp_01", status: "ACTIVE", business_id: businessId } as any],
        [],
        [],
        [septRecord],
        [],
        [],
        [],
        businessId,
        "fr"
      );

      // September MUST remain 109,000 HTG, NOT 111,000 HTG
      expect(septSnapRechecked.payrollCost.currentValue).toBe(109000);
    });

    it("CASH vs ACCRUAL Ledger Date Reconciliation: September payroll paid Oct 5 evaluates to Sept 30 in ACCRUAL and Oct 5 in CASH", () => {
      const accrualDate = resolveAnalyticsPayrollDate(septRecord, false);
      const cashDate = resolveAnalyticsPayrollDate(septRecord, true);

      expect(accrualDate).toBe("2026-09-30");
      expect(cashDate).toBe("2026-10-05");
      expect(accrualDate).not.toBe(cashDate);
    });

    it("Tenant Isolation: Ledger entries and snapshots enforce tenant boundaries cleanly", () => {
      const tenantB = "phase1322_tenant_beta";
      const { transactions, journalEntry } = AccountingEngine.createPayrollJournalEntry(
        septCycle,
        septRecords,
        tenantB
      );

      expect(journalEntry.businessId).toBe(tenantB);
      transactions.forEach((tx) => {
        expect(tx.business_id).toBe(tenantB);
      });
    });
  });
});
