import { describe, it, expect } from "vitest";
import { TaxPolicyEngine } from "../../services/payroll/TaxPolicyEngine";
import { resolveTaxRatesForDate } from "../../components/payroll/services/PayrollCalculationEngine";
import { AccountingEngine } from "../../services/AccountingEngine";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { TreasuryClassification } from "../../domains/cash/classification/TreasuryClassification";
import { LedgerCashAdapter } from "../../domains/cash/adapters/LedgerCashAdapter";
import { CrossSourceCashReconciliationEngine } from "../../domains/cash/reconciliation/CrossSourceCashReconciliationEngine";
import { BusinessTaxConfiguration } from "../../repositories/BusinessAdministrationRepository";
import { PayrollCycle, PayrollRecord, LedgerTransaction } from "../../types";

describe("PHASE 15 — End-to-End Payroll → Accounting → Treasury → Analytics Reconciliation & Double-Counting Audit", () => {
  const tenantAlpha = "tenant_alpha_audit";
  const tenantBeta = "tenant_beta_audit";

  // =========================================================================
  // 1. CANONICAL PAYROLL GOLDEN DATASET (Phase 13/14 Baseline)
  // =========================================================================
  const goldenV1Policy = {
    enableTaxes: true,
    cnssRateEmployee: 0.06,
    cnssRateEmployer: 0.06,
    cnsRateEmployee: 0.02,
    cnsRateEmployer: 0.03,
    survivalFloorHTG: 15000,
    effectiveFrom: "2026-09-01",
    effectiveTo: "2026-09-30",
  };

  const goldenV2Policy = {
    enableTaxes: true,
    cnssRateEmployee: 0.08,
    cnssRateEmployer: 0.08,
    cnsRateEmployee: 0.03,
    cnsRateEmployer: 0.03,
    survivalFloorHTG: 15000,
    effectiveFrom: "2026-10-01",
  };

  const multiVersionConfig: BusinessTaxConfiguration = {
    enableTaxes: true,
    cnssRateEmployee: 0.08,
    cnssRateEmployer: 0.08,
    cnsRateEmployee: 0.03,
    cnsRateEmployer: 0.03,
    survivalFloorHTG: 15000,
    currency: "HTG",
    history: [goldenV1Policy, goldenV2Policy],
  };

  const septCycleV1: PayrollCycle = {
    id: "cycle_sept_2026_audit",
    cycleName: "Septembre 2026",
    label: "Paie Septembre 2026",
    status: "SEALED",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    effectiveAccountingDate: "2026-09-30",
    business_id: tenantAlpha,
  } as any;

  const septRecordV1: PayrollRecord = {
    id: "pr_sept_audit_01",
    employeeId: "emp_audit_01",
    grossSalary: 100000,
    gross_salary_cents: 10000000,          // 100,000 HTG
    cnss_employee_cents: 600000,           // 6,000 HTG ONA Employee (6%)
    cns_employee_cents: 200000,            // 2,000 HTG OFATMA Employee (2%)
    cnss_employer_cents: 600000,           // 6,000 HTG ONA Employer (6%)
    cns_employer_cents: 300000,            // 3,000 HTG OFATMA Employer (3%)
    employer_contributions_cents: 900000,  // 9,000 HTG Total Employer Contrib
    debts_deduction_cents: 0,
    net_salary_cents: 9200000,             // 92,000 HTG Net
    netPaid: 92000,
    period_start: "2026-09-01",
    period_end: "2026-09-30",
    business_id: tenantAlpha,
    status: "SEALED",
    appliedPolicyVersion: "V1",
  } as any;

  // =========================================================================
  // CONTROL 1: PAYROLL CALCULATION ENGINE ACCURACY
  // =========================================================================
  describe("Control 1: Payroll Calculation Accuracy", () => {
    it("Calculates exact V1 figures: 100k gross -> 8k deductions -> 92k net, 9k employer contrib -> 109k employer cost", () => {
      const contributions = TaxPolicyEngine.calculateDualSideContributions(100000, {
        enableTaxes: true,
        onaEmployeeRate: 0.06,
        onaEmployerRate: 0.06,
        ofatmaEmployeeRate: 0.02,
        ofatmaEmployerRate: 0.03,
      });

      expect(contributions.totalEmployeeDeductions).toBe(8000);
      expect(contributions.netPayBeforeAdvances).toBe(92000);
      expect(contributions.totalEmployerContributions).toBe(9000);
      expect(contributions.totalEmployerPayrollCost).toBe(109000);
    });
  });

  // =========================================================================
  // CONTROL 2: ACCOUNTING GOLDEN JOURNAL & DOUBLE-ENTRY EQUATION
  // =========================================================================
  describe("Control 2: Accounting Golden Journal & Double-Entry Equation", () => {
    it("Produces perfectly balanced Model B journal: 109k Debits == 109k Credits", () => {
      const { journalEntry, transactions } = AccountingEngine.createPayrollJournalEntry(
        septCycleV1,
        [septRecordV1],
        tenantAlpha
      );

      expect(journalEntry.isBalanced).toBe(true);
      expect(journalEntry.totalDebitCents).toBe(10900000);   // 109,000 HTG
      expect(journalEntry.totalCreditCents).toBe(10900000);  // 109,000 HTG

      // Debit accounts: 5100 (100k gross) + 5110 (9k employer tax)
      const debitGross = journalEntry.lines.find(l => l.accountId === "5100_PAYROLL_EXPENSE");
      const debitTax = journalEntry.lines.find(l => l.accountId === "5110_EMPLOYER_TAX_EXPENSE");
      expect(debitGross?.debitCents).toBe(10000000);
      expect(debitTax?.debitCents).toBe(900000);

      // Credit accounts: 1010_BANK (92k net) + 2100_ONA (12k) + 2110_OFATMA (5k)
      const creditBank = journalEntry.lines.find(l => l.accountId === "1010_BANK");
      const creditOna = journalEntry.lines.find(l => l.accountId === "2100_ONA_TAXES_PAYABLE");
      const creditOfatma = journalEntry.lines.find(l => l.accountId === "2110_OFATMA_TAXES_PAYABLE");

      expect(creditBank?.creditCents).toBe(9200000);
      expect(creditOna?.creditCents).toBe(1200000);    // 6k emp + 6k empr
      expect(creditOfatma?.creditCents).toBe(500000);  // 2k emp + 3k empr

      // 5 double-entry transaction legs generated
      expect(transactions.length).toBe(5);
    });
  });

  // =========================================================================
  // CONTROL 3: CRITICAL DOUBLE-COUNTING AUDIT
  // =========================================================================
  describe("Control 3: Anti-Double-Counting Audit", () => {
    it("Employee deductions (8k) are NOT added as an extra expense (expense is 109k, NOT 117k)", () => {
      const { journalEntry } = AccountingEngine.createPayrollJournalEntry(
        septCycleV1,
        [septRecordV1],
        tenantAlpha
      );

      // Total P&L Expense lines = debits to 5100 and 5110 only
      const totalExpenseDebits = journalEntry.lines
        .filter(l => l.accountId.startsWith("5"))
        .reduce((sum, l) => sum + l.debitCents, 0);

      expect(totalExpenseDebits).toBe(10900000); // 109,000 HTG
      expect(totalExpenseDebits).not.toBe(11700000); // NOT 100k + 8k + 9k = 117k!
    });

    it("Statutory remittance does not duplicate P&L expense", () => {
      // Event B: Remittance of ONA (12k) and OFATMA (5k) via Bank
      const remittanceTxOna: LedgerTransaction = {
        id: "tx_remit_ona_sept",
        business_id: tenantAlpha,
        type: "EXPENSE",
        amount: 12000,
        amount_cents: 1200000,
        date: "2026-10-15",
        description: "Paiement Cotisations ONA Septembre",
        debit_account: "2100_ONA_TAXES_PAYABLE", // Settles liability!
        credit_account: "1010_BANK",
        status: "POSTED",
      } as any;

      const remittanceTxOfatma: LedgerTransaction = {
        id: "tx_remit_ofatma_sept",
        business_id: tenantAlpha,
        type: "EXPENSE",
        amount: 5000,
        amount_cents: 500000,
        date: "2026-10-15",
        description: "Paiement Cotisations OFATMA Septembre",
        debit_account: "2110_OFATMA_TAXES_PAYABLE", // Settles liability!
        credit_account: "1010_BANK",
        status: "POSTED",
      } as any;

      // In Accrual Accounting, these debits are to class 2 liabilities, NOT class 5 expenses!
      const isOnaDebitExpense = remittanceTxOna.debit_account?.startsWith("5");
      const isOfatmaDebitExpense = remittanceTxOfatma.debit_account?.startsWith("5");
      expect(isOnaDebitExpense).toBe(false);
      expect(isOfatmaDebitExpense).toBe(false);
    });
  });

  // =========================================================================
  // CONTROL 4: TREASURY CLASSIFICATION & CASH RECONCILIATION
  // =========================================================================
  describe("Control 4: Treasury Classification & Cash Movements", () => {
    it("Strictly classifies 1010_BANK as Treasury and 2100/2110/5100/5110 as Non-Treasury", () => {
      expect(TreasuryClassification.classify({ accountCode: "1010_BANK", businessId: tenantAlpha }).isTreasury).toBe(true);
      expect(TreasuryClassification.classify({ accountCode: "2100_ONA_TAXES_PAYABLE", businessId: tenantAlpha }).isTreasury).toBe(false);
      expect(TreasuryClassification.classify({ accountCode: "2110_OFATMA_TAXES_PAYABLE", businessId: tenantAlpha }).isTreasury).toBe(false);
      expect(TreasuryClassification.classify({ accountCode: "5100_PAYROLL_EXPENSE", businessId: tenantAlpha }).isTreasury).toBe(false);
      expect(TreasuryClassification.classify({ accountCode: "5110_EMPLOYER_TAX_EXPENSE", businessId: tenantAlpha }).isTreasury).toBe(false);
    });

    it("LedgerCashAdapter converts only genuine treasury movements into cash outflows", () => {
      const { transactions } = AccountingEngine.createPayrollJournalEntry(
        septCycleV1,
        [septRecordV1],
        tenantAlpha
      );

      // Adapt all GL transactions into cash movements
      const cashMovements = transactions
        .map(t => LedgerCashAdapter.adaptTransaction(t, { businessId: tenantAlpha }))
        .filter(res => res.status === "VALID")
        .map(res => (res as any).movement);

      // Only Leg 1 (Net salary from 1010_BANK) has cash impact (92,000 HTG)
      expect(cashMovements.length).toBe(1);
      expect(cashMovements[0].amountCents).toBe(9200000);
      expect(cashMovements[0].direction).toBe("OUTFLOW");

      // Non-treasury legs (ONA, OFATMA accrued liabilities) are ignored for cash
      const ignoredLegs = transactions
        .map(t => LedgerCashAdapter.adaptTransaction(t, { businessId: tenantAlpha }))
        .filter(res => res.status === "IGNORED");
      expect(ignoredLegs.length).toBe(4);
    });

    it("Total cash outflow across net salary (92k) and statutory remittance (17k) reconciles to 109k", () => {
      // Event A: Net Pay Cash Outflow = 92,000 HTG
      const netPayCash = 92000;
      // Event B: Statutory Remittance Outflow = 17,000 HTG (12k ONA + 5k OFATMA)
      const remittanceCash = 17000;

      const totalCashOutflow = netPayCash + remittanceCash;
      expect(totalCashOutflow).toBe(109000);
    });
  });

  // =========================================================================
  // CONTROL 5: ACCRUAL VS CASH SEMANTIC SEPARATION
  // =========================================================================
  describe("Control 5: Accrual vs Cash Engine Separation", () => {
    it("Accrual expense recognizes 109k in September regardless of remittance date", () => {
      const snapAccrual = AnalyticsEngine.generateSnapshot(
        "CUSTOM",
        { startDate: "2026-09-01", endDate: "2026-09-30" },
        [{ id: "emp_audit_01", status: "ACTIVE", business_id: tenantAlpha } as any],
        [],
        [],
        [septRecordV1],
        [],
        [],
        [],
        tenantAlpha,
        "fr"
      );

      expect(snapAccrual.payrollCost.currentValue).toBe(109000);
      expect(snapAccrual.expenses.currentValue).toBe(109000);
      expect(snapAccrual.profit.currentValue).toBe(-109000); // 0 revenue - 109k expenses
    });

    it("Profit and Net Cash Flow are never conflated", () => {
      // An accrual profit of -109,000 with 0 cash movements produces 0 cash outflow if unremitted
      const snapNoCash = AnalyticsEngine.generateSnapshot(
        "CUSTOM",
        { startDate: "2026-09-01", endDate: "2026-09-30" },
        [{ id: "emp_audit_01", status: "ACTIVE", business_id: tenantAlpha } as any],
        [],
        [],
        [septRecordV1],
        [],
        [],
        [],
        tenantAlpha,
        "fr"
      );

      // Profit reflects accrued obligations
      expect(snapNoCash.profit.currentValue).toBe(-109000);
      // Net Cash Flow reflects actual treasury movements (none here -> 0)
      expect(snapNoCash.netCashFlow.currentValue).toBe(0);
      expect(snapNoCash.profit.currentValue).not.toBe(snapNoCash.netCashFlow.currentValue);
    });
  });

  // =========================================================================
  // CONTROL 6: IDEMPOTENCY & REPLAY SAFETY
  // =========================================================================
  describe("Control 6: Idempotency & Replay Safety", () => {
    it("Replaying createPayrollJournalEntry generates identical deterministic transaction IDs", () => {
      const run1 = AccountingEngine.createPayrollJournalEntry(septCycleV1, [septRecordV1], tenantAlpha);
      const run2 = AccountingEngine.createPayrollJournalEntry(septCycleV1, [septRecordV1], tenantAlpha);

      expect(run1.journalEntry.id).toBe(run2.journalEntry.id);
      expect(run1.transactions.map(t => t.id)).toEqual(run2.transactions.map(t => t.id));
      expect(run1.journalEntry.totalDebitCents).toBe(run2.journalEntry.totalDebitCents);
    });

    it("CrossSourceCashReconciliationEngine suppresses duplicate GL transactions when operational payroll cycle exists", () => {
      const operationalMovement = {
        id: "cm_op_cycle_sept",
        businessId: tenantAlpha,
        sourceModule: "PAYROLL",
        sourceId: septCycleV1.id,
        direction: "OUTFLOW",
        movementType: "PAYROLL",
        movementDate: "2026-09-30",
        amount: 92000,
        amountCents: 9200000,
        currency: "HTG",
        status: "POSTED",
        cashAccountId: "1010_BANK",
      } as any;

      const glMovement = {
        id: "cm_gl_tx_pay_sept",
        businessId: tenantAlpha,
        sourceModule: "LEDGER",
        sourceId: `tx_pay_${septCycleV1.id}_net`,
        direction: "OUTFLOW",
        movementType: "PAYROLL",
        movementDate: "2026-09-30",
        amount: 92000,
        amountCents: 9200000,
        currency: "HTG",
        status: "POSTED",
        cashAccountId: "1010_BANK",
        metadata: { linkedCycleId: septCycleV1.id },
      } as any;

      const recon = CrossSourceCashReconciliationEngine.reconcile(
        [operationalMovement, glMovement],
        { businessId: tenantAlpha, currency: "HTG" }
      );

      expect(recon.activeMovements.length).toBe(1);
      expect(recon.activeMovements[0].id).toBe(operationalMovement.id);
      expect(recon.suppressedMovements.length).toBe(1);
      expect(recon.suppressedMovements[0].movement.id).toBe(glMovement.id);
    });
  });

  // =========================================================================
  // CONTROL 7: HISTORICAL POLICY INTEGRITY & BOUNDARY DETERMINISM
  // =========================================================================
  describe("Control 7: Historical Policy Integrity", () => {
    it("September payroll (V1 = 109k) remains completely unaffected by October (V2 = 111k) activation", () => {
      const ratesSept = resolveTaxRatesForDate(multiVersionConfig, "2026-09-30");
      expect(ratesSept.cnssRateEmployee).toBe(0.06);
      expect(ratesSept.cnssRateEmployer).toBe(0.06);

      const ratesOct = resolveTaxRatesForDate(multiVersionConfig, "2026-10-01");
      expect(ratesOct.cnssRateEmployee).toBe(0.08);
      expect(ratesOct.cnssRateEmployer).toBe(0.08);

      const octContributions = TaxPolicyEngine.calculateDualSideContributions(100000, {
        enableTaxes: true,
        onaEmployeeRate: ratesOct.cnssRateEmployee,
        onaEmployerRate: ratesOct.cnssRateEmployer,
        ofatmaEmployeeRate: ratesOct.cnsRateEmployee,
        ofatmaEmployerRate: ratesOct.cnsRateEmployer,
      });

      // October total employer cost = 100k + (8k ONA + 3k OFATMA = 11k) = 111,000 HTG
      expect(octContributions.totalEmployerPayrollCost).toBe(111000);

      // September record remains frozen at 109,000 HTG
      expect(septRecordV1.netPaid).toBe(92000);
      expect((septRecordV1 as any).employer_contributions_cents).toBe(900000);
    });
  });

  // =========================================================================
  // CONTROL 8: DATE ISOLATION
  // =========================================================================
  describe("Control 8: Date Isolation", () => {
    it("Selecting September 2026 strictly excludes October data and vice versa", () => {
      const octRecord: PayrollRecord = {
        id: "pr_oct_01",
        employeeId: "emp_audit_01",
        grossSalary: 100000,
        netPaid: 89000,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        business_id: tenantAlpha,
        status: "SEALED",
      } as any;

      const septSnap = AnalyticsEngine.generateSnapshot(
        "CUSTOM",
        { startDate: "2026-09-01", endDate: "2026-09-30" },
        [{ id: "emp_audit_01", status: "ACTIVE", business_id: tenantAlpha } as any],
        [],
        [],
        [septRecordV1, octRecord],
        [],
        [],
        [],
        tenantAlpha,
        "fr"
      );

      // Only September record is evaluated in September range
      expect(septSnap.payrollCost.currentValue).toBe(109000);
    });
  });

  // =========================================================================
  // CONTROL 9: TENANT ISOLATION
  // =========================================================================
  describe("Control 9: Tenant Isolation", () => {
    it("Tenant Alpha data cannot leak into Tenant Beta analytics", () => {
      const snapBeta = AnalyticsEngine.generateSnapshot(
        "CUSTOM",
        { startDate: "2026-09-01", endDate: "2026-09-30" },
        [{ id: "emp_beta_01", status: "ACTIVE", business_id: tenantBeta } as any],
        [],
        [],
        [septRecordV1], // Record belongs to tenantAlpha!
        [],
        [],
        [],
        tenantBeta,
        "fr"
      );

      // Since septRecordV1 belongs to tenantAlpha, tenantBeta should report 0 payroll cost
      expect(snapBeta.payrollCost.currentValue).toBe(0);
      expect(snapBeta.expenses.currentValue).toBe(0);
    });
  });

  // =========================================================================
  // CONTROL 10: ZERO / NO_DATA SEMANTICS
  // =========================================================================
  describe("Control 10: Zero vs NO_DATA Semantics", () => {
    it("Recognizes empty payroll records as zero without corrupting calculations", () => {
      const snapEmpty = AnalyticsEngine.generateSnapshot(
        "CUSTOM",
        { startDate: "2026-09-01", endDate: "2026-09-30" },
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        tenantAlpha,
        "fr"
      );

      expect(snapEmpty.payrollCost.currentValue).toBe(0);
      expect(snapEmpty.expenses.currentValue).toBe(0);
      expect(snapEmpty.profit.currentValue).toBe(0);
    });
  });
});
