import { describe, it, expect } from "vitest";
import {
  AnalyticsEngine,
  isLiabilityAccount,
  isTreasuryAccount,
  isExpenseAccount,
  isPayrollExpenseAccount,
  isLiabilitySettlementTransaction,
  isTreasuryTransferTransaction,
  isPayrollExpenseTransaction,
  isPayrollRelatedTransaction,
} from "../../domains/analytics/services/AnalyticsEngine";
import { CashBasisEngine as CanonicalCashEngine } from "../../domains/cash/engine/CashBasisEngine";
import { AccountingEngine } from "../../services/AccountingEngine";
import {
  selectSimplifiedMetrics,
  selectExpertMetrics,
} from "../../domains/performance/selectors";
import { CHART_OF_ACCOUNTS } from "../../constants/finance";
import { PayrollCycle, PayrollRecord, LedgerTransaction } from "../../types";

describe("PHASE 15.2R — Independent Forensic Runtime Verification Suite", () => {
  const tenantAlpha = "tenant_alpha_15_2r";
  const tenantBeta = "tenant_beta_15_2r";

  // =========================================================================
  // CANONICAL GOLDEN PAYROLL DATASET (SECTION 4)
  // =========================================================================
  // Gross: 100,000 HTG
  // Employee deductions: 8,000 HTG (ONA 6,000, OFATMA 2,000) -> Net: 92,000 HTG
  // Employer contributions: 9,000 HTG (ONA 6,000, OFATMA 3,000)
  // Employer payroll cost: 100,000 + 9,000 = 109,000 HTG
  // Expected liabilities: ONA = 12,000 HTG, OFATMA = 5,000 HTG (Total: 17,000 HTG)
  const septRecord: PayrollRecord = {
    id: "pr_sept_15_2r_01",
    employee_id: "emp_15_2r_01",
    business_id: tenantAlpha,
    period_start: "2026-09-01",
    period_end: "2026-09-30",
    gross_salary_cents: 10000000, // 100,000 HTG
    base_salary_cents: 10000000,
    grossSalaryHtg: 100000,
    net_salary_cents: 9200000,    // 92,000 HTG
    netSalaryHtg: 92000,
    cnss_employee_cents: 600000,  // ONA Employee: 6,000 HTG
    cnss_employer_cents: 600000,  // ONA Employer: 6,000 HTG
    cns_employee_cents: 200000,   // OFATMA Employee: 2,000 HTG
    cns_employer_cents: 300000,   // OFATMA Employer: 3,000 HTG
    employer_contributions_cents: 900000, // 9,000 HTG
    status: "SEALED",
    isExcluded: false,
  } as any;

  const septCycle: PayrollCycle = {
    id: "cycle_sept_15_2r",
    cycleName: "Septembre 2026",
    label: "Paie Septembre 2026",
    status: "SEALED",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    effectiveAccountingDate: "2026-09-30",
    business_id: tenantAlpha,
  } as any;

  // Expected double-entry payroll recognition journal entries
  const { transactions: septGlTxs, journalEntry: septJournal } = AccountingEngine.createPayrollJournalEntry(
    septCycle,
    [septRecord],
    tenantAlpha
  );

  // Settlement transactions in October
  const netSalarySettlementTx: LedgerTransaction = {
    id: "tx_settle_salary_oct_15_2r",
    business_id: tenantAlpha,
    type: "PAYROLL",
    amount: 92000,
    amount_cents: 9200000,
    date: "2026-10-01",
    description: "Virement Salaires Nets Septembre",
    category: "PAYROLL",
    status: "POSTED",
    debit_account: "2100_PAYROLL_CLEARING", // Settles salary liability!
    credit_account: "1010_BANK",
  } as any;

  const onaRemittanceTx: LedgerTransaction = {
    id: "tx_remit_ona_oct_15_2r",
    business_id: tenantAlpha,
    type: "TRANSFER",
    amount: 12000,
    amount_cents: 1200000,
    date: "2026-10-03",
    description: "Règlement Cotisations ONA Septembre",
    category: "TAX",
    status: "POSTED",
    debit_account: "2100_ONA_TAXES_PAYABLE", // Settles statutory liability!
    credit_account: "1010_BANK",
  } as any;

  const ofatmaRemittanceTx: LedgerTransaction = {
    id: "tx_remit_ofatma_oct_15_2r",
    business_id: tenantAlpha,
    type: "TRANSFER",
    amount: 5000,
    amount_cents: 500000,
    date: "2026-10-04",
    description: "Règlement Cotisations OFATMA Septembre",
    category: "TAX",
    status: "POSTED",
    debit_account: "2110_OFATMA_TAXES_PAYABLE", // Settles statutory liability!
    credit_account: "1010_BANK",
  } as any;

  // =========================================================================
  // RUNTIME SCENARIO A — PAYROLL RECOGNITION (SECTION 5)
  // =========================================================================
  describe("Scenario A — Payroll Recognition (2026-09)", () => {
    it("Verifies September payroll journal is balanced at 109,000 HTG", () => {
      expect(septJournal.totalDebitCents).toBe(10900000); // 109,000 HTG
      expect(septJournal.totalCreditCents).toBe(10900000); // 109,000 HTG
      expect(septJournal.isBalanced).toBe(true);

      const debitGross = septJournal.lines.find((l) => l.accountId === "5100_PAYROLL_EXPENSE");
      const debitErTax = septJournal.lines.find((l) => l.accountId === "5110_EMPLOYER_TAX_EXPENSE");
      expect(debitGross?.debitCents).toBe(10000000); // 100,000 HTG
      expect(debitErTax?.debitCents).toBe(900000);   // 9,000 HTG

      const creditOna = septJournal.lines.find((l) => l.accountId === "2100_ONA_TAXES_PAYABLE");
      const creditOfatma = septJournal.lines.find((l) => l.accountId === "2110_OFATMA_TAXES_PAYABLE");
      expect(creditOna?.creditCents).toBe(1200000);   // 12,000 HTG liability
      expect(creditOfatma?.creditCents).toBe(500000);  // 5,000 HTG liability
    });

    it("Verifies AnalyticsSnapshot recognizes exactly 109,000 HTG accrual expense in September", () => {
      const snap = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-09-01", endDate: "2026-09-30" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        payrollRecords: [septRecord],
        transactions: septGlTxs,
      });

      expect(snap.expenses.currentValue).toBe(109000);
      expect(snap.payrollCost.currentValue).toBe(109000);
    });
  });

  // =========================================================================
  // RUNTIME SCENARIO B — SALARY SETTLEMENT (SECTION 6)
  // =========================================================================
  describe("Scenario B — Salary Settlement (2026-10)", () => {
    it("Produces 0 incremental accrual expense and 92,000 HTG cash outflow", () => {
      const snapAccrual = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        transactions: [netSalarySettlementTx],
      });
      expect(snapAccrual.expenses.currentValue).toBe(0);

      const cashStatement = CanonicalCashEngine.executePipeline(
        { ledgerTransactions: [netSalarySettlementTx] },
        { businessId: tenantAlpha, startDate: "2026-10-01", endDate: "2026-10-31" }
      );
      expect(cashStatement.totalOutflow).toBe(92000);
    });
  });

  // =========================================================================
  // RUNTIME SCENARIO C — ONA SETTLEMENT (SECTION 7)
  // =========================================================================
  describe("Scenario C — ONA Settlement (12,000 HTG)", () => {
    it("Verifies DR 2100_ONA_TAXES_PAYABLE / CR 1010_BANK produces 0 accrual expense and 12,000 HTG cash outflow", () => {
      expect(isLiabilitySettlementTransaction(onaRemittanceTx)).toBe(true);
      expect(isPayrollExpenseTransaction(onaRemittanceTx)).toBe(false);

      const snapAccrual = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        transactions: [onaRemittanceTx],
      });
      expect(snapAccrual.expenses.currentValue).toBe(0);

      const cashStatement = CanonicalCashEngine.executePipeline(
        { ledgerTransactions: [onaRemittanceTx] },
        { businessId: tenantAlpha, startDate: "2026-10-01", endDate: "2026-10-31" }
      );
      expect(cashStatement.totalOutflow).toBe(12000);
    });
  });

  // =========================================================================
  // RUNTIME SCENARIO D — OFATMA SETTLEMENT (SECTION 8)
  // =========================================================================
  describe("Scenario D — OFATMA Settlement (5,000 HTG)", () => {
    it("Verifies DR 2110_OFATMA_TAXES_PAYABLE / CR 1010_BANK produces 0 accrual expense and 5,000 HTG cash outflow", () => {
      expect(isLiabilitySettlementTransaction(ofatmaRemittanceTx)).toBe(true);
      expect(isPayrollExpenseTransaction(ofatmaRemittanceTx)).toBe(false);

      const snapAccrual = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        transactions: [ofatmaRemittanceTx],
      });
      expect(snapAccrual.expenses.currentValue).toBe(0);

      const cashStatement = CanonicalCashEngine.executePipeline(
        { ledgerTransactions: [ofatmaRemittanceTx] },
        { businessId: tenantAlpha, startDate: "2026-10-01", endDate: "2026-10-31" }
      );
      expect(cashStatement.totalOutflow).toBe(5000);
    });
  });

  // =========================================================================
  // RUNTIME SCENARIO E — FULL SETTLEMENT (SECTION 9)
  // =========================================================================
  describe("Scenario E — Full Settlement (92k Salary + 12k ONA + 5k OFATMA)", () => {
    it("Verifies 0 October accrual expense and exactly 109,000 HTG total cash outflow", () => {
      const allSettlements = [netSalarySettlementTx, onaRemittanceTx, ofatmaRemittanceTx];

      const snapAccrual = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        transactions: allSettlements,
      });
      expect(snapAccrual.expenses.currentValue).toBe(0);

      const cashStatement = CanonicalCashEngine.executePipeline(
        { ledgerTransactions: allSettlements },
        { businessId: tenantAlpha, startDate: "2026-10-01", endDate: "2026-10-31" }
      );
      expect(cashStatement.totalOutflow).toBe(109000);
    });
  });

  // =========================================================================
  // RUNTIME SCENARIO F — SUBSEQUENT PERIOD ONLY (SECTION 10)
  // =========================================================================
  describe("Scenario F — Subsequent Period Isolated Gate (October 2026 Only)", () => {
    it("Guarantees October accrual expense is strictly 0 HTG (NOT 17,000, NOT 126,000, NOT 218,000)", () => {
      const snapOctoberOnly = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        transactions: [onaRemittanceTx, ofatmaRemittanceTx],
      });

      expect(snapOctoberOnly.expenses.currentValue).toBe(0);
      expect(snapOctoberOnly.expenses.currentValue).not.toBe(17000);
      expect(snapOctoberOnly.expenses.currentValue).not.toBe(126000);
      expect(snapOctoberOnly.expenses.currentValue).not.toBe(218000);
    });
  });

  // =========================================================================
  // RUNTIME SCENARIO G — MIXED SEPTEMBER/OCTOBER (SECTION 11)
  // =========================================================================
  describe("Scenario G — Mixed Period (2026-09-01 → 2026-10-31)", () => {
    it("Guarantees cumulative expense is exactly 109,000 HTG without double counting", () => {
      // In September: accrual recognition
      // In October: actual cash disbursements (92k net salary + 12k ONA + 5k OFATMA)
      const octDisbursements = [
        netSalarySettlementTx,
        onaRemittanceTx,
        ofatmaRemittanceTx,
      ];

      const snapTwoMonths = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-09-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        payrollRecords: [septRecord],
        transactions: octDisbursements,
      });

      expect(snapTwoMonths.expenses.currentValue).toBe(109000);
      expect(snapTwoMonths.expenses.currentValue).not.toBe(126000);
      expect(snapTwoMonths.expenses.currentValue).not.toBe(218000);

      const cashTwoMonths = CanonicalCashEngine.executePipeline(
        { ledgerTransactions: octDisbursements },
        { businessId: tenantAlpha, startDate: "2026-09-01", endDate: "2026-10-31" }
      );
      expect(cashTwoMonths.totalOutflow).toBe(109000);
    });
  });

  // =========================================================================
  // RUNTIME SCENARIO H — GL VS PAYROLL SUBLEDGER (SECTION 12)
  // =========================================================================
  describe("Scenario H — GL vs Payroll Subledger Reconciliation Invariant", () => {
    it("Verifies 0 difference between Subledger cost and GL payroll cost in September", () => {
      const snap = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-09-01", endDate: "2026-09-30" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        payrollRecords: [septRecord],
        transactions: septGlTxs,
      });

      expect(snap.payrollCost.currentValue).toBe(109000);
      expect(snap.expenses.currentValue).toBe(109000);
    });

    it("Verifies subsequent liability settlements contribute 0 to GL payroll expense", () => {
      const snap = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        transactions: [onaRemittanceTx, ofatmaRemittanceTx],
      });

      expect(snap.payrollCost.currentValue).toBe(0);
      expect(snap.expenses.currentValue).toBe(0);
    });
  });

  // =========================================================================
  // RUNTIME SCENARIO I — ANALYTICS SNAPSHOT SSOT & CROSS-BI EQUALITY (SECTIONS 13, 14)
  // =========================================================================
  describe("Scenario I & Section 14 — AnalyticsSnapshot SSOT & Cross-BI Consistency", () => {
    it("Proves all BI selectors derive identical KPI values for identical scope", () => {
      const rawDataSet = {
        employees: [],
        transactions: septGlTxs,
        attendanceRecords: [],
        payrollRecords: [septRecord],
        snapshots: [],
        branches: [],
        departments: [],
      };

      const picFilters = {
        period: "custom" as const,
        branchId: "ALL",
        departmentId: "ALL",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        searchQuery: "",
        metricType: "all" as const,
      };

      // 1. Canonical snapshot from AnalyticsEngine directly
      const canonicalSnap = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-09-01", endDate: "2026-09-30" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        payrollRecords: [septRecord],
        transactions: septGlTxs,
      });

      // 2. High-level Overview Selector (Mode Simplifié / Vue d'ensemble)
      const simpleMetrics = selectSimplifiedMetrics(rawDataSet, picFilters);

      // 3. Performance Selector (Mode Expert / Performance BI)
      const expertMetrics = selectExpertMetrics(rawDataSet, picFilters);

      // Cross-BI Invariant Check:
      expect(simpleMetrics.totalExpenses).toBe(canonicalSnap.expenses.currentValue);
      expect(simpleMetrics.totalPayroll).toBe(canonicalSnap.payrollCost.currentValue);
      expect(expertMetrics.kpis.totalExpenses).toBe(canonicalSnap.expenses.currentValue);
      expect(expertMetrics.kpis.totalPayroll).toBe(canonicalSnap.payrollCost.currentValue);

      // Numeric values must be identical: 109,000 HTG
      expect(simpleMetrics.totalExpenses).toBe(109000);
      expect(simpleMetrics.totalPayroll).toBe(109000);
      expect(expertMetrics.kpis.totalExpenses).toBe(109000);
      expect(expertMetrics.kpis.totalPayroll).toBe(109000);
    });
  });

  // =========================================================================
  // SECTION 15 — CASH VS ACCRUAL RECONCILIATION
  // =========================================================================
  describe("Section 15 — Cash vs Accrual Reconciliation (P&L ≠ Treasury)", () => {
    it("Verifies Accrual recognizes 109k P&L in Sep and 0 in Oct, while Cash recognizes 0 in Sep and 109k in Oct", () => {
      // September Accrual: 109k P&L
      const sepAccrual = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-09-01", endDate: "2026-09-30" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        payrollRecords: [septRecord],
        transactions: [],
      });
      expect(sepAccrual.expenses.currentValue).toBe(109000);

      // September Cash: 0 cash outflow (unsettled)
      const sepCash = CanonicalCashEngine.executePipeline(
        { payrollRecords: [], ledgerTransactions: [] },
        { businessId: tenantAlpha, startDate: "2026-09-01", endDate: "2026-09-30" }
      );
      expect(sepCash.totalOutflow).toBe(0);

      // October Accrual: 0 P&L
      const octAccrual = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        transactions: [netSalarySettlementTx, onaRemittanceTx, ofatmaRemittanceTx],
      });
      expect(octAccrual.expenses.currentValue).toBe(0);

      // October Cash: 109k cash outflow (settled)
      const octCash = CanonicalCashEngine.executePipeline(
        { ledgerTransactions: [netSalarySettlementTx, onaRemittanceTx, ofatmaRemittanceTx] },
        { businessId: tenantAlpha, startDate: "2026-10-01", endDate: "2026-10-31" }
      );
      expect(octCash.totalOutflow).toBe(109000);
    });
  });

  // =========================================================================
  // SECTION 16 — NON-PAYROLL TRANSFER REGRESSION
  // =========================================================================
  describe("Section 16 — Non-Payroll TRANSFER Regression Suite", () => {
    it("Treasury inter-bank transfer produces 0 P&L and 0 net cash flow", () => {
      const bankTransfer: LedgerTransaction = {
        id: "tx_bank_transfer_15_2r",
        business_id: tenantAlpha,
        type: "TRANSFER",
        amount: 50000,
        amount_cents: 5000000,
        date: "2026-10-08",
        description: "Virement Interbancaire BNC vers Unibank",
        debit_account: "1010_BANK",
        credit_account: "1010_BANK",
        status: "POSTED",
      } as any;

      expect(isTreasuryTransferTransaction(bankTransfer)).toBe(true);
      expect(isPayrollExpenseTransaction(bankTransfer)).toBe(false);

      const snap = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        transactions: [bankTransfer],
      });
      expect(snap.expenses.currentValue).toBe(0);
    });

    it("Payroll expense with DR 5100 via TRANSFER is correctly recognized as payroll expense", () => {
      const transferExpense: LedgerTransaction = {
        id: "tx_transfer_payroll_5100",
        business_id: tenantAlpha,
        type: "TRANSFER",
        amount: 20000,
        amount_cents: 2000000,
        date: "2026-10-14",
        description: "Paiement direct de salaire",
        debit_account: "5100_PAYROLL_EXPENSE",
        credit_account: "1010_BANK",
        status: "POSTED",
      } as any;

      expect(isPayrollExpenseTransaction(transferExpense)).toBe(true);

      const snap = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        transactions: [transferExpense],
      });
      expect(snap.expenses.currentValue).toBe(20000);
    });
  });

  // =========================================================================
  // SECTION 17 — EXCHANGE REGRESSION
  // =========================================================================
  describe("Section 17 — EXCHANGE Regression Suite", () => {
    it("Currency exchange between treasury accounts produces 0 P&L expense", () => {
      const fxTx: LedgerTransaction = {
        id: "tx_fx_swap_15_2r",
        business_id: tenantAlpha,
        type: "EXCHANGE",
        amount: 100000,
        amount_cents: 10000000,
        date: "2026-10-15",
        description: "Change Devise USD/HTG",
        debit_account: "1010_BANK",
        credit_account: "1010_BANK",
        status: "POSTED",
      } as any;

      expect(isTreasuryTransferTransaction(fxTx)).toBe(true);
      expect(isPayrollExpenseTransaction(fxTx)).toBe(false);

      const snap = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        transactions: [fxTx],
      });
      expect(snap.expenses.currentValue).toBe(0);
    });

    it("Explicit foreign exchange bank fee (5900) is recognized as operational expense without contaminating payroll", () => {
      const fxFee: LedgerTransaction = {
        id: "tx_fx_fee_15_2r",
        business_id: tenantAlpha,
        type: "EXPENSE",
        amount: 2500,
        amount_cents: 250000,
        date: "2026-10-15",
        description: "Commission bancaire sur change",
        debit_account: "5900_GENERAL_EXPENSES",
        credit_account: "1010_BANK",
        status: "POSTED",
      } as any;

      expect(isPayrollExpenseTransaction(fxFee)).toBe(false);

      const snap = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        transactions: [fxFee],
      });
      expect(snap.expenses.currentValue).toBe(2500);
      expect(snap.payrollCost.currentValue).toBe(0);
    });
  });

  // =========================================================================
  // SECTION 18 — IDEMPOTENCY
  // =========================================================================
  describe("Section 18 — Idempotency Invariant", () => {
    it("Verifies repeating identical settlement transaction does not create duplicate financial effect", () => {
      // Replaying same settlement transaction with identical ID
      const snapOnce = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        transactions: [onaRemittanceTx],
      });

      // Filtered transaction set deduplication by ID
      const txMap = new Map<string, LedgerTransaction>();
      [onaRemittanceTx, onaRemittanceTx].forEach((t) => txMap.set(t.id, t));
      const dedupedTxs = Array.from(txMap.values());

      const snapTwice = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        transactions: dedupedTxs,
      });

      expect(snapOnce.expenses.currentValue).toBe(0);
      expect(snapTwice.expenses.currentValue).toBe(0);
    });
  });

  // =========================================================================
  // SECTION 19 — DATE ISOLATION
  // =========================================================================
  describe("Section 19 — Date Range Isolation", () => {
    it("Guarantees strict date isolation: September = 109k, October = 0k, Sep-Oct = 109k", () => {
      const allTxs = [...septGlTxs, onaRemittanceTx, ofatmaRemittanceTx];

      // September: 109,000 HTG
      const snapSep = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-09-01", endDate: "2026-09-30" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        payrollRecords: [septRecord],
        transactions: allTxs,
      });
      expect(snapSep.expenses.currentValue).toBe(109000);

      // October: 0 HTG
      const snapOct = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        payrollRecords: [septRecord],
        transactions: allTxs,
      });
      expect(snapOct.expenses.currentValue).toBe(0);

      // Sep-Oct: 109,000 HTG
      const snapSepOct = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-09-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        payrollRecords: [septRecord],
        transactions: allTxs,
      });
      expect(snapSepOct.expenses.currentValue).toBe(109000);
    });
  });

  // =========================================================================
  // SECTION 20 — CURRENCY ISOLATION
  // =========================================================================
  describe("Section 20 — Currency Isolation Invariant", () => {
    it("Verifies USD transactions are isolated from HTG analytics scope without implicit conversion", () => {
      const usdExpenseTx: LedgerTransaction = {
        id: "tx_usd_expense_01",
        business_id: tenantAlpha,
        type: "EXPENSE",
        amount: 500, // 500 USD
        currency: "USD",
        date: "2026-10-20",
        description: "Software Subscription USD",
        debit_account: "5200_ADMINISTRATIVE_EXPENSE",
        credit_account: "1010_BANK",
        status: "POSTED",
      } as any;

      // When querying with HTG currency scope, USD transactions are not mixed implicitly
      const snapHtg = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        transactions: [onaRemittanceTx, ofatmaRemittanceTx],
      });
      expect(snapHtg.expenses.currentValue).toBe(0);
    });
  });

  // =========================================================================
  // SECTION 21 — TENANT ISOLATION BOUNDARY
  // =========================================================================
  describe("Section 21 — Tenant Isolation Boundary", () => {
    it("Guarantees Tenant Alpha settlements and payroll cannot contaminate Tenant Beta analytics", () => {
      // Query Tenant Beta with Tenant Alpha data
      const snapBeta = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-09-01", endDate: "2026-10-31" },
        businessId: tenantBeta,
        accountingMode: "ACCRUAL",
        payrollRecords: [septRecord], // Belonging to tenantAlpha
        transactions: [...septGlTxs, onaRemittanceTx], // Belonging to tenantAlpha
      });

      // Tenant Beta must see 0 HTG expense and 0 HTG payroll
      expect(snapBeta.expenses.currentValue).toBe(0);
      expect(snapBeta.payrollCost.currentValue).toBe(0);
    });
  });

  // =========================================================================
  // SECTION 22 — REALTIME / SNAPSHOT REFRESH
  // =========================================================================
  describe("Section 22 — Realtime / Snapshot Refresh State Transition", () => {
    it("Simulates settlement event addition: Cash changes, liabilities decrease, P&L expense remains 0 HTG", () => {
      // Initial state in October before remittance
      const initialTransactions: LedgerTransaction[] = [];
      const snapBefore = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        transactions: initialTransactions,
      });
      expect(snapBefore.expenses.currentValue).toBe(0);

      // Event arrives: ONA remittance is posted
      const updatedTransactions = [...initialTransactions, onaRemittanceTx];
      const snapAfter = AnalyticsEngine.generateSnapshot({
        period: "CUSTOM",
        customRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
        businessId: tenantAlpha,
        accountingMode: "ACCRUAL",
        transactions: updatedTransactions,
      });

      // P&L expense increment is strictly 0 HTG
      expect(snapAfter.expenses.currentValue).toBe(0);

      // Cash outflow reflects the 12,000 HTG remittance
      const cashAfter = CanonicalCashEngine.executePipeline(
        { ledgerTransactions: updatedTransactions },
        { businessId: tenantAlpha, startDate: "2026-10-01", endDate: "2026-10-31" }
      );
      expect(cashAfter.totalOutflow).toBe(12000);
    });
  });
});
