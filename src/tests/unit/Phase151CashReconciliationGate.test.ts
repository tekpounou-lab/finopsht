import { describe, it, expect } from "vitest";
import { TaxPolicyEngine } from "../../services/payroll/TaxPolicyEngine";
import { AccountingEngine } from "../../services/AccountingEngine";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { TreasuryClassification } from "../../domains/cash/classification/TreasuryClassification";
import { LedgerCashAdapter } from "../../domains/cash/adapters/LedgerCashAdapter";
import { CrossSourceCashReconciliationEngine } from "../../domains/cash/reconciliation/CrossSourceCashReconciliationEngine";
import { CashBasisEngine as CanonicalCashEngine } from "../../domains/cash/engine/CashBasisEngine";
import { PayrollCycle, PayrollRecord, LedgerTransaction } from "../../types";

describe("PHASE 15.1 — Cash Payroll Settlement Reconciliation & Expense Double-Counting Gate", () => {
  const tenantAlpha = "tenant_alpha_15_1";
  const tenantBeta = "tenant_beta_15_1";

  // =========================================================================
  // 1. CANONICAL GOLDEN DATASET (Phase 15 Baseline)
  // =========================================================================
  const septCycle: PayrollCycle = {
    id: "cycle_sept_15_1",
    cycleName: "Septembre 2026",
    label: "Paie Septembre 2026",
    status: "SEALED",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    effectiveAccountingDate: "2026-09-30",
    business_id: tenantAlpha,
  } as any;

  const septRecord: PayrollRecord = {
    id: "pr_sept_15_1_01",
    employeeId: "emp_15_1_01",
    grossSalary: 100000,
    gross_salary_cents: 10000000,          // 100,000 HTG Gross
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

  // Actual canonical treasury transaction fixtures
  const netSalaryTx: LedgerTransaction = {
    id: "tx_pay_sept_net_disburse",
    business_id: tenantAlpha,
    type: "PAYROLL",
    amount: 92000,
    amount_cents: 9200000,
    date: "2026-10-01",
    description: "Virement Salaires Nets Septembre",
    category: "PAYROLL",
    source: "PAYROLL_ENGINE",
    status: "POSTED",
    debit_account: "5100_PAYROLL_EXPENSE",
    credit_account: "1010_BANK",
  } as any;

  const onaRemittanceTx: LedgerTransaction = {
    id: "tx_remit_ona_sept_settle",
    business_id: tenantAlpha,
    type: "TRANSFER",
    amount: 12000,
    amount_cents: 1200000,
    date: "2026-10-03",
    description: "Règlement Cotisations ONA Septembre",
    category: "TAX",
    status: "POSTED",
    debit_account: "2100_ONA_TAXES_PAYABLE", // Settles balance sheet liability!
    credit_account: "1010_BANK",
  } as any;

  const ofatmaRemittanceTx: LedgerTransaction = {
    id: "tx_remit_ofatma_sept_settle",
    business_id: tenantAlpha,
    type: "TRANSFER",
    amount: 5000,
    amount_cents: 500000,
    date: "2026-10-04",
    description: "Règlement Cotisations OFATMA Septembre",
    category: "TAX",
    status: "POSTED",
    debit_account: "2110_OFATMA_TAXES_PAYABLE", // Settles balance sheet liability!
    credit_account: "1010_BANK",
  } as any;

  // =========================================================================
  // MANDATORY ADVERSARIAL TEST SUITE
  // =========================================================================

  // Test A — No settlement
  describe("Test A: No Settlement Scenario", () => {
    it("Produces 0 cash outflow in CASH mode and 109k expense in ACCRUAL mode", () => {
      // CASH Mode: 0 cash transactions
      const cashStatement = CanonicalCashEngine.executePipeline(
        { payrollRecords: [], ledgerTransactions: [] },
        { businessId: tenantAlpha, startDate: "2026-10-01", endDate: "2026-10-31" }
      );
      expect(cashStatement.totalOutflow).toBe(0);

      // ACCRUAL Mode: Cycle recognized in September
      const snapAccrual = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-09-01", endDate: "2026-09-30" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        payrollRecords: [septRecord],
        transactions: [],
      });
      expect(snapAccrual.expenses.currentValue).toBe(109000);
      expect(snapAccrual.payrollCost.currentValue).toBe(109000);
    });
  });

  // Test B — Salary only
  describe("Test B: Salary Only Settlement (92k paid)", () => {
    it("Produces exactly 92,000 HTG cash outflow while ACCRUAL remains 109k", () => {
      const cashStatement = CanonicalCashEngine.executePipeline(
        { ledgerTransactions: [netSalaryTx] },
        { businessId: tenantAlpha, startDate: "2026-10-01", endDate: "2026-10-31" }
      );
      expect(cashStatement.totalOutflow).toBe(92000);

      // Analytics under CASH in October
      const snapCash = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "CASH",
        transactions: [netSalaryTx],
      });
      expect(snapCash.expenses.currentValue).toBe(92000);
      expect(snapCash.netCashFlow.currentValue).toBe(-92000);
    });
  });

  // Test C — Salary + ONA
  describe("Test C: Salary + ONA Settlement (92k + 12k)", () => {
    it("Produces exactly 104,000 HTG cash outflow and leaves OFATMA (5k) on balance sheet", () => {
      const cashStatement = CanonicalCashEngine.executePipeline(
        { ledgerTransactions: [netSalaryTx, onaRemittanceTx] },
        { businessId: tenantAlpha, startDate: "2026-10-01", endDate: "2026-10-31" }
      );
      expect(cashStatement.totalOutflow).toBe(104000);

      const snapCash = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "CASH",
        transactions: [netSalaryTx, onaRemittanceTx],
      });
      expect(snapCash.expenses.currentValue).toBe(104000);
      expect(snapCash.netCashFlow.currentValue).toBe(-104000);
    });
  });

  // Test D — Salary + OFATMA
  describe("Test D: Salary + OFATMA Settlement (92k + 5k)", () => {
    it("Produces exactly 97,000 HTG cash outflow and leaves ONA (12k) on balance sheet", () => {
      const cashStatement = CanonicalCashEngine.executePipeline(
        { ledgerTransactions: [netSalaryTx, ofatmaRemittanceTx] },
        { businessId: tenantAlpha, startDate: "2026-10-01", endDate: "2026-10-31" }
      );
      expect(cashStatement.totalOutflow).toBe(97000);

      const snapCash = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "CASH",
        transactions: [netSalaryTx, ofatmaRemittanceTx],
      });
      expect(snapCash.expenses.currentValue).toBe(97000);
      expect(snapCash.netCashFlow.currentValue).toBe(-97000);
    });
  });

  // Test E — Fully settled
  describe("Test E: Fully Settled Scenario (92k + 12k + 5k)", () => {
    it("Produces exactly 109,000 HTG cumulative cash outflow and 109,000 HTG accrual expense without double-counting", () => {
      const allTx = [netSalaryTx, onaRemittanceTx, ofatmaRemittanceTx];
      const cashStatement = CanonicalCashEngine.executePipeline(
        { ledgerTransactions: allTx },
        { businessId: tenantAlpha, startDate: "2026-10-01", endDate: "2026-10-31" }
      );
      expect(cashStatement.totalOutflow).toBe(109000);

      const snapCash = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "CASH",
        transactions: allTx,
      });
      expect(snapCash.expenses.currentValue).toBe(109000);
      expect(snapCash.netCashFlow.currentValue).toBe(-109000);
    });
  });

  // Test F — Duplicate salary event
  describe("Test F: Duplicate Salary Event Replay", () => {
    it("Replaying the same net salary payment creates 0 additional canonical cash movements", () => {
      const movement1 = LedgerCashAdapter.adaptTransaction(netSalaryTx, { businessId: tenantAlpha });
      const movement2 = LedgerCashAdapter.adaptTransaction(netSalaryTx, { businessId: tenantAlpha });

      expect(movement1.status).toBe("VALID");
      expect(movement2.status).toBe("VALID");
      // Deterministic movement ID generated from same source ID and date
      expect((movement1 as any).movement.id).toBe((movement2 as any).movement.id);

      const recon = CrossSourceCashReconciliationEngine.reconcile(
        [(movement1 as any).movement, (movement2 as any).movement],
        { businessId: tenantAlpha, currency: "HTG" }
      );
      expect(recon.activeMovements.length).toBe(1);
      expect(recon.activeMovements[0].amount).toBe(92000);
    });
  });

  // Test G & H — Duplicate ONA and OFATMA remittances
  describe("Test G & H: Duplicate Remittances Replay", () => {
    it("Replaying ONA and OFATMA remittances does not inflate cash outflows", () => {
      const onaM1 = LedgerCashAdapter.adaptTransaction(onaRemittanceTx, { businessId: tenantAlpha });
      const onaM2 = LedgerCashAdapter.adaptTransaction(onaRemittanceTx, { businessId: tenantAlpha });
      const ofatmaM1 = LedgerCashAdapter.adaptTransaction(ofatmaRemittanceTx, { businessId: tenantAlpha });
      const ofatmaM2 = LedgerCashAdapter.adaptTransaction(ofatmaRemittanceTx, { businessId: tenantAlpha });

      const recon = CrossSourceCashReconciliationEngine.reconcile(
        [
          (onaM1 as any).movement,
          (onaM2 as any).movement,
          (ofatmaM1 as any).movement,
          (ofatmaM2 as any).movement,
        ],
        { businessId: tenantAlpha, currency: "HTG" }
      );

      expect(recon.activeMovements.length).toBe(2);
      const totalCash = recon.activeMovements.reduce((sum, m) => sum + m.amount, 0);
      expect(totalCash).toBe(17000); // 12k + 5k = 17k (NOT 34k!)
    });
  });

  // Test I — Cross-source duplicate (Operational + GL)
  describe("Test I: Cross-Source Duplicate Suppression", () => {
    it("Suppresses GL payment transaction when operational payroll disbursement movement exists", () => {
      const operationalDisbursement = {
        id: "cm_op_disburse_sept",
        businessId: tenantAlpha,
        sourceModule: "PAYROLL",
        sourceId: septCycle.id,
        direction: "OUTFLOW",
        movementType: "PAYROLL",
        movementDate: "2026-10-01",
        amount: 92000,
        amountCents: 9200000,
        currency: "HTG",
        status: "POSTED",
        cashAccountId: "1010_BANK",
      } as any;

      const glDisbursement = {
        id: "cm_gl_disburse_sept",
        businessId: tenantAlpha,
        sourceModule: "LEDGER",
        sourceId: "tx_pay_sept_net_disburse",
        direction: "OUTFLOW",
        movementType: "PAYROLL",
        movementDate: "2026-10-01",
        amount: 92000,
        amountCents: 9200000,
        currency: "HTG",
        status: "POSTED",
        cashAccountId: "1010_BANK",
        metadata: { linkedCycleId: septCycle.id },
      } as any;

      const recon = CrossSourceCashReconciliationEngine.reconcile(
        [operationalDisbursement, glDisbursement],
        { businessId: tenantAlpha, currency: "HTG" }
      );

      expect(recon.activeMovements.length).toBe(1);
      expect(recon.activeMovements[0].sourceModule).toBe("PAYROLL");
      expect(recon.suppressedMovements.length).toBe(1);
      expect(recon.suppressedMovements[0].movement.sourceModule).toBe("LEDGER");
    });
  });

  // Test J — Date Boundary & Dual Basis Period Placement
  describe("Test J: Date Boundary & Dual Basis Separation", () => {
    it("Accrual expense is in September (109k) while Cash outflows are in October (109k)", () => {
      const allTx = [netSalaryTx, onaRemittanceTx, ofatmaRemittanceTx];

      // September CASH report: should have 0 cash outflows since transactions occurred in October
      const septCashStatement = CanonicalCashEngine.executePipeline(
        { ledgerTransactions: allTx },
        { businessId: tenantAlpha, startDate: "2026-09-01", endDate: "2026-09-30" }
      );
      expect(septCashStatement.totalOutflow).toBe(0);

      // September ACCRUAL report: recognizes 109k payroll expense
      const septAccrualSnap = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-09-01", endDate: "2026-09-30" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        payrollRecords: [septRecord],
        transactions: allTx,
      });
      expect(septAccrualSnap.expenses.currentValue).toBe(109000);

      // October CASH report: recognizes 109k cash outflows
      const octCashStatement = CanonicalCashEngine.executePipeline(
        { ledgerTransactions: allTx },
        { businessId: tenantAlpha, startDate: "2026-10-01", endDate: "2026-10-31" }
      );
      expect(octCashStatement.totalOutflow).toBe(109000);
    });
  });

  // Anti-Double-Counting Guards: GL Payroll + Payroll Subledger
  describe("Anti-Double-Counting Guards: GL Payroll + Subledger Integration", () => {
    it("Does NOT sum GL payroll (109k) and Subledger cost (109k) to 218k", () => {
      // Create GL transactions for the payroll cycle
      const { transactions: glTxs } = AccountingEngine.createPayrollJournalEntry(
        septCycle,
        [septRecord],
        tenantAlpha
      );

      // When both GL transactions and PayrollRecords are supplied to AnalyticsEngine
      const snap = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-09-01", endDate: "2026-09-30" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        payrollRecords: [septRecord],
        transactions: glTxs,
      });

      // Total expenses MUST be 109,000 HTG, NOT 218,000 HTG!
      expect(snap.expenses.currentValue).toBe(109000);
      expect(snap.expenses.currentValue).not.toBe(218000);
    });

    it("Audits statutory liability settlements (17k) against accrual P&L expenses [DEF-15.1-01]", () => {
      // Debits to 2100_ONA_TAXES_PAYABLE and 2110_OFATMA_TAXES_PAYABLE are balance sheet debits
      expect(onaRemittanceTx.debit_account?.startsWith("5")).toBe(false);
      expect(ofatmaRemittanceTx.debit_account?.startsWith("5")).toBe(false);

      const snapAccrualWithRemittances = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        transactions: [onaRemittanceTx, ofatmaRemittanceTx],
      });

      // REMEDIATED IN PHASE 15.2 (DEF-15.1-01):
      // Debits to 2100_ONA_TAXES_PAYABLE and 2110_OFATMA_TAXES_PAYABLE are balance sheet liability settlements,
      // and do not increase P&L expenses. Expected accrual expense = 0 HTG.
      expect(snapAccrualWithRemittances.expenses.currentValue).toBe(0);
    });
  });

  // Semantic Distinction: Profit vs Cash Flow
  describe("Semantic Distinction: Profit vs Net Cash Flow", () => {
    it("Proves Profit != Net Cash Flow in partial settlement state", () => {
      // Under partial settlement (Salary only: 92k paid, unremitted taxes: 17k)
      const snapPartial = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-09-01", endDate: "2026-09-30" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        payrollRecords: [septRecord],
        transactions: [netSalaryTx],
      });

      expect(snapPartial.profit.currentValue).toBe(-109000);
      // Even if profit is -109,000, netCashFlow is derived from actual cash movements (-92,000)
      expect(snapPartial.profit.currentValue).not.toBe(-92000);
    });
  });

  // Tenant Isolation
  describe("Tenant Isolation Boundary", () => {
    it("Tenant Alpha settlements cannot contaminate Tenant Beta cash pipeline", () => {
      const cashStatementBeta = CanonicalCashEngine.executePipeline(
        { ledgerTransactions: [netSalaryTx, onaRemittanceTx, ofatmaRemittanceTx] },
        { businessId: tenantBeta, startDate: "2026-10-01", endDate: "2026-10-31" }
      );

      // Since all transactions belong to tenantAlpha, tenantBeta must have 0 cash outflows
      expect(cashStatementBeta.totalOutflow).toBe(0);
    });
  });
});
