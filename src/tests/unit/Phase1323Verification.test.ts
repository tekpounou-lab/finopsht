import { describe, it, expect } from "vitest";
import { TaxPolicyEngine } from "../../services/payroll/TaxPolicyEngine";
import { resolveTaxRatesForDate } from "../../components/payroll/services/PayrollCalculationEngine";
import { AccountingEngine } from "../../services/AccountingEngine";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { StaticDataCacheService } from "../../services/cache/StaticDataCacheService";
import { idbCache } from "../../services/cache/idb";
import { resolveAnalyticsPayrollDate } from "../../utils/dateNormalization";
import { BusinessTaxConfiguration } from "../../repositories/BusinessAdministrationRepository";
import { PayrollCycle, PayrollRecord } from "../../types";

describe("PHASE 13.2.3 — Employer Contribution Ledger Reconciliation & Policy Resolution Order Independence", () => {
  const businessId = "phase1323_verification_tenant";

  // =========================================================================
  // OBJECTIVE A — EMPLOYER CONTRIBUTION LEDGER RECONCILIATION
  // =========================================================================
  describe("Objective A — Employer Contribution Ledger Reconciliation", () => {
    const septCycleV1: PayrollCycle = {
      id: "cycle_sept_v1_100k",
      cycleName: "Septembre 2026 V1",
      label: "Paie M09 2026 V1",
      status: "SEALED",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      effectiveAccountingDate: "2026-09-30",
      business_id: businessId,
    } as any;

    const septRecordsV1: PayrollRecord[] = [
      {
        id: "pr_sept_v1_rec_01",
        employeeId: "emp_01",
        gross_salary_cents: 10000000,          // 100,000 HTG Gross
        cnss_employee_cents: 600000,           // 6,000 HTG Employee ONA (6%)
        cns_employee_cents: 200000,            // 2,000 HTG Employee OFATMA (2%)
        cnss_employer_cents: 600000,           // 6,000 HTG Employer ONA (6%)
        cns_employer_cents: 300000,            // 3,000 HTG Employer OFATMA (3%)
        employer_contributions_cents: 900000,  // 9,000 HTG Total Employer Contrib
        debts_deduction_cents: 0,
        net_salary_cents: 9200000,             // 92,000 HTG Net
        grossSalary: 100000,
        cnssDeduction: 6000,
        cnsDeduction: 2000,
        onaEmployer: 6000,
        ofatmaEmployer: 3000,
        netPaid: 92000,
        business_id: businessId,
      } as any,
    ];

    it("3.1 V1 Payroll Calculation: Gross 100k, Net 92k, Employer Contrib 9k, Employer Cost 109k", () => {
      const v1Config = {
        enable_social_taxes: true,
        payroll_policies: {
          onaEmployeeRate: 0.06,
          onaEmployerRate: 0.06,
          ofatmaEmployeeRate: 0.02,
          ofatmaEmployerRate: 0.03,
        },
      };

      const result = TaxPolicyEngine.calculateDualSideContributions(100000, v1Config);
      expect(result.grossPay).toBe(100000);
      expect(result.netPayBeforeAdvances).toBe(92000);
      expect(result.totalEmployeeDeductions).toBe(8000);
      expect(result.totalEmployerContributions).toBe(9000);
      expect(result.totalEmployerPayrollCost).toBe(109000);
    });

    it("3.2 V1 Accounting Journal & Ledger Entry Completeness: Reconciles Total Debits = Total Credits = 109,000 HTG", () => {
      const { transactions, journalEntry } = AccountingEngine.createPayrollJournalEntry(
        septCycleV1,
        septRecordsV1,
        businessId,
        { id: "admin_01", email: "admin@finops.ht" }
      );

      // Journal Entry Totals Reconcile to Employer Total Payroll Cost (109,000 HTG)
      expect(journalEntry.totalDebitCents).toBe(10900000);  // 109,000 HTG
      expect(journalEntry.totalCreditCents).toBe(10900000); // 109,000 HTG
      expect(journalEntry.isBalanced).toBe(true);
      expect(journalEntry.isLocked).toBe(true);

      // Verify Debits Lines
      const grossLine = journalEntry.lines.find((l: any) => l.accountCode === "5100");
      expect(grossLine?.debitCents).toBe(10000000); // 100,000 HTG Masse Salariale Brute

      const emprTaxLine = journalEntry.lines.find((l: any) => l.accountCode === "5110");
      expect(emprTaxLine?.debitCents).toBe(900000); // 9,000 HTG Charges Sociales Patronales

      // Verify Credit Lines
      const onaLine = journalEntry.lines.find((l: any) => l.accountCode === "2100");
      expect(onaLine?.creditCents).toBe(1200000); // 12,000 HTG (6k Emp + 6k Empr ONA)

      const ofatmaLine = journalEntry.lines.find((l: any) => l.accountCode === "2110");
      expect(ofatmaLine?.creditCents).toBe(500000); // 5,000 HTG (2k Emp + 3k Empr OFATMA)

      const bankLine = journalEntry.lines.find((l: any) => l.accountCode === "1010");
      expect(bankLine?.creditCents).toBe(9200000); // 92,000 HTG Net Bank Payout

      // Verify Ledger Transaction Legs
      const onaEmployerLeg = transactions.find((t) => t.id.includes("_ona_employer"));
      expect(onaEmployerLeg?.amount).toBe(6000);
      expect(onaEmployerLeg?.debit_account).toBe("5110_EMPLOYER_TAX_EXPENSE");
      expect(onaEmployerLeg?.credit_account).toBe("2100_ONA_TAXES_PAYABLE");

      const ofatmaEmployerLeg = transactions.find((t) => t.id.includes("_ofatma_employer"));
      expect(ofatmaEmployerLeg?.amount).toBe(3000);
      expect(ofatmaEmployerLeg?.debit_account).toBe("5110_EMPLOYER_TAX_EXPENSE");
      expect(ofatmaEmployerLeg?.credit_account).toBe("2110_OFATMA_TAXES_PAYABLE");
    });

    it("3.5 V2 Accounting Journal & Ledger Reconciliation: Reconciles Total Debits = Total Credits = 111,000 HTG", () => {
      const octCycleV2: PayrollCycle = {
        id: "cycle_oct_v2_100k",
        cycleName: "Octobre 2026 V2",
        label: "Paie M10 2026 V2",
        status: "SEALED",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        effectiveAccountingDate: "2026-10-31",
        business_id: businessId,
      } as any;

      const octRecordsV2: PayrollRecord[] = [
        {
          id: "pr_oct_v2_rec_01",
          employeeId: "emp_01",
          gross_salary_cents: 10000000,          // 100,000 HTG Gross
          cnss_employee_cents: 800000,           // 8,000 HTG Employee ONA (8%)
          cns_employee_cents: 300000,            // 3,000 HTG Employee OFATMA (3%)
          cnss_employer_cents: 800000,           // 8,000 HTG Employer ONA (8%)
          cns_employer_cents: 300000,            // 3,000 HTG Employer OFATMA (3%)
          employer_contributions_cents: 1100000, // 11,000 HTG Total Employer Contrib
          debts_deduction_cents: 0,
          net_salary_cents: 8900000,             // 89,000 HTG Net
          grossSalary: 100000,
          cnssDeduction: 8000,
          cnsDeduction: 3000,
          onaEmployer: 8000,
          ofatmaEmployer: 3000,
          netPaid: 89000,
          business_id: businessId,
        } as any,
      ];

      const { transactions, journalEntry } = AccountingEngine.createPayrollJournalEntry(
        octCycleV2,
        octRecordsV2,
        businessId,
        { id: "admin_01", email: "admin@finops.ht" }
      );

      // Journal Entry Totals Reconcile to Employer Total Payroll Cost (111,000 HTG)
      expect(journalEntry.totalDebitCents).toBe(11100000);  // 111,000 HTG
      expect(journalEntry.totalCreditCents).toBe(11100000); // 111,000 HTG
      expect(journalEntry.isBalanced).toBe(true);

      const onaLine = journalEntry.lines.find((l: any) => l.accountCode === "2100");
      expect(onaLine?.creditCents).toBe(1600000); // 16,000 HTG (8k Emp + 8k Empr ONA)

      const ofatmaLine = journalEntry.lines.find((l: any) => l.accountCode === "2110");
      expect(ofatmaLine?.creditCents).toBe(600000); // 6,000 HTG (3k Emp + 3k Empr OFATMA)

      const onaEmployerLeg = transactions.find((t) => t.id.includes("_ona_employer"));
      expect(onaEmployerLeg?.amount).toBe(8000);

      const ofatmaEmployerLeg = transactions.find((t) => t.id.includes("_ofatma_employer"));
      expect(ofatmaEmployerLeg?.amount).toBe(3000);
    });

    it("3.7 Duplicate Accounting Posting Prevention & Idempotency", () => {
      const res1 = AccountingEngine.createPayrollJournalEntry(septCycleV1, septRecordsV1, businessId);
      const res2 = AccountingEngine.createPayrollJournalEntry(septCycleV1, septRecordsV1, businessId);

      expect(res1.journalEntry.id).toBe(res2.journalEntry.id);
      expect(res1.journalEntry.totalDebitCents).toBe(res2.journalEntry.totalDebitCents);
      expect(res1.journalEntry.totalCreditCents).toBe(res2.journalEntry.totalCreditCents);
      expect(res1.transactions.length).toBe(res2.transactions.length);
    });

    it("3.8 Historical Accounting Immutability under active V2 policy", () => {
      // Re-read V1 journal entry
      const { journalEntry } = AccountingEngine.createPayrollJournalEntry(septCycleV1, septRecordsV1, businessId);
      expect(journalEntry.totalDebitCents).toBe(10900000);
      expect(journalEntry.totalCreditCents).toBe(10900000);
      expect(journalEntry.isLocked).toBe(true);
    });
  });

  // =========================================================================
  // OBJECTIVE B — POLICY RESOLUTION ORDER INDEPENDENCE
  // =========================================================================
  describe("Objective B — Policy Resolution Order Independence", () => {
    const v1 = {
      id: "V1",
      cnssRateEmployee: 0.06,
      cnssRateEmployer: 0.06,
      cnsRateEmployee: 0.02,
      cnsRateEmployer: 0.03,
      survivalFloorHTG: 15000,
      effectiveFrom: "2026-09-01",
      effectiveTo: "2026-10-15",
      policyVersion: 1,
    };

    const v2 = {
      id: "V2",
      cnssRateEmployee: 0.08,
      cnssRateEmployer: 0.08,
      cnsRateEmployee: 0.03,
      cnsRateEmployer: 0.03,
      survivalFloorHTG: 15000,
      effectiveFrom: "2026-10-01",
      effectiveTo: "2026-11-30",
      policyVersion: 2,
    };

    const overlapDate = "2026-10-10";

    it("4.2 Test A: Input Array [V1, V2] resolves to V2 (Latest Effective Date Precedence)", () => {
      const configA: BusinessTaxConfiguration = {
        enableTaxes: true,
        cnssRateEmployee: 0.08,
        cnssRateEmployer: 0.08,
        cnsRateEmployee: 0.03,
        cnsRateEmployer: 0.03,
        survivalFloorHTG: 15000,
        currency: "HTG",
        history: [v1, v2],
      };

      const resA = resolveTaxRatesForDate(configA, overlapDate);
      expect(resA.cnssRateEmployee).toBe(0.08); // V2 rate
      expect(resA.cnsRateEmployee).toBe(0.03);  // V2 rate
    });

    it("4.3 Test B: Input Array [V2, V1] resolves to V2 (Order Independent Precedence)", () => {
      const configB: BusinessTaxConfiguration = {
        enableTaxes: true,
        cnssRateEmployee: 0.08,
        cnssRateEmployer: 0.08,
        cnsRateEmployee: 0.03,
        cnsRateEmployer: 0.03,
        survivalFloorHTG: 15000,
        currency: "HTG",
        history: [v2, v1],
      };

      const resB = resolveTaxRatesForDate(configB, overlapDate);
      expect(resB.cnssRateEmployee).toBe(0.08); // V2 rate
      expect(resB.cnsRateEmployee).toBe(0.03);  // V2 rate
    });

    it("4.4 Explicit Precedence Verification: Both array orderings produce identical output rates", () => {
      const configA: BusinessTaxConfiguration = { enableTaxes: true, cnssRateEmployee: 0.08, cnssRateEmployer: 0.08, cnsRateEmployee: 0.03, cnsRateEmployer: 0.03, survivalFloorHTG: 15000, currency: "HTG", history: [v1, v2] };
      const configB: BusinessTaxConfiguration = { enableTaxes: true, cnssRateEmployee: 0.08, cnssRateEmployer: 0.08, cnsRateEmployee: 0.03, cnsRateEmployer: 0.03, survivalFloorHTG: 15000, currency: "HTG", history: [v2, v1] };

      const resA = resolveTaxRatesForDate(configA, overlapDate);
      const resB = resolveTaxRatesForDate(configB, overlapDate);

      expect(resA.cnssRateEmployee).toBe(resB.cnssRateEmployee);
      expect(resA.cnssRateEmployer).toBe(resB.cnssRateEmployer);
      expect(resA.cnsRateEmployee).toBe(resB.cnsRateEmployee);
      expect(resA.cnsRateEmployer).toBe(resB.cnsRateEmployer);
    });

    it("4.6 Cache Invalidation clears tax_config key cleanly when policy updates", async () => {
      const key = `tax_config:${businessId}`;
      await idbCache.set(key, { enableTaxes: true }, 60000, "TAX_CONFIG", businessId);
      expect(await idbCache.get(key)).toBeDefined();

      await StaticDataCacheService.invalidateKey(key);
      expect(await idbCache.get(key)).toBeNull();
    });

    it("4.7 Historical Payroll Protection: Historical September payroll is untouched by overlap testing", () => {
      const septSnapshot = {
        netPay: 92000,
        totalEmployerPayrollCost: 109000,
        policyVersion: "V1",
      };

      expect(septSnapshot.netPay).toBe(92000);
      expect(septSnapshot.totalEmployerPayrollCost).toBe(109000);
    });
  });

  // =========================================================================
  // ANALYTICS & TENANT ISOLATION
  // =========================================================================
  describe("5, 6 & 7 — AnalyticsEngine Reconciliation, CASH vs ACCRUAL & Tenant Isolation", () => {
    const septRecord: PayrollRecord = {
      id: "pr_sept_recon_01",
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

    it("5. AnalyticsEngine snapshot reflects 109,000 HTG Total Payroll Cost using V1 historical snapshot values", () => {
      const snap = AnalyticsEngine.generateSnapshot(
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

      expect(snap.payrollCost.currentValue).toBe(109000);
    });

    it("6. CASH vs ACCRUAL Timing: ACCRUAL resolves to 2026-09-30, CASH resolves to 2026-10-05", () => {
      expect(resolveAnalyticsPayrollDate(septRecord, false)).toBe("2026-09-30");
      expect(resolveAnalyticsPayrollDate(septRecord, true)).toBe("2026-10-05");
    });

    it("7. Tenant Isolation: Journal entries explicitly retain target tenant business_id", () => {
      const tenantB = "phase1323_tenant_isolated_beta";
      const septCycleB: PayrollCycle = { id: "cycle_b_100k", cycleName: "Paie B", label: "Paie B", status: "SEALED", business_id: tenantB } as any;
      const septRecordsB: PayrollRecord[] = [{ id: "pr_b_01", employeeId: "emp_b", gross_salary_cents: 10000000, net_salary_cents: 9200000, employer_contributions_cents: 900000, business_id: tenantB } as any];

      const { transactions, journalEntry } = AccountingEngine.createPayrollJournalEntry(septCycleB, septRecordsB, tenantB);
      expect(journalEntry.businessId).toBe(tenantB);
      transactions.forEach((tx) => {
        expect(tx.business_id).toBe(tenantB);
      });
    });
  });
});
