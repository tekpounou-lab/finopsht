/**
 * FINOPS ERP — Cash Management Integration & Multi-Currency Test Suite
 * Priority 1: Cash Management Development Verification
 *
 * Verifies:
 * 1. CashSettlementAdapter (normalization, zero-preservation, Zod compliance)
 * 2. Multi-currency strict separation (HTG vs USD isolation, zero consolidation without FX)
 * 3. Document exclusions (tx_legacy_2026_01 and emp_legacy_002)
 * 4. Cross-source deduplication (Operational Invoice/Payroll > Settlement > Ledger)
 * 5. Idempotence and deterministic movement ID generation
 */

import { describe, it, expect } from "vitest";
import {
  CashSettlementAdapter,
  LedgerCashAdapter,
  PayrollCashAdapter,
  CashBasisEngine,
  CrossSourceCashReconciliationEngine,
  getCashFlowImpact,
} from "../../../domains/cash";
import type { CashSettlement } from "../../../types/cash-basis";
import type { LedgerTransaction, PayrollRecord, PayrollCycle } from "../../../types";

describe("Priority 1: Cash Management & Multi-Currency Test Suite", () => {
  const BIZ_ID = "biz_vo5k8jqo33cZoYzZdbzu4MmA0A7x1";

  // =========================================================================
  // 1. CashSettlementAdapter Normalization Tests
  // =========================================================================
  describe("1. CashSettlementAdapter Normalization", () => {
    const validInflowSettlement: CashSettlement = {
      id: "cs_sales_001",
      business_id: BIZ_ID,
      date: "2026-09-05",
      type: "CASH_IN",
      amount_cents: 2500000, // 25,000 HTG
      currency: "HTG",
      method: "MOBILE_MONEY",
      reference: "MONCASH-9912",
      category: "SALES_COLLECTION",
      created_at: "2026-09-05T10:00:00Z",
      created_by: "Teller_1",
    };

    it("1.1. transforms a valid CASH_IN settlement into a canonical INFLOW NormalizedCashMovement", () => {
      const result = CashSettlementAdapter.adaptSettlement(validInflowSettlement);

      expect(result.status).toBe("VALID");
      expect(result.movement).toBeDefined();

      const m = result.movement!;
      expect(m.direction).toBe("INFLOW");
      expect(m.movementType).toBe("INVOICE_COLLECTION");
      expect(m.amount).toBe(25000);
      expect(m.amountCents).toBe(2500000);
      expect(m.currency).toBe("HTG");
      expect(m.paymentMethod).toBe("MONCASH");
      expect(m.status).toBe("SETTLED");
      expect(m.businessId).toBe(BIZ_ID);
      expect(getCashFlowImpact(m)).toBe(25000);
      expect(m.id).toBe(`cm_${BIZ_ID}_CASH_SETTLEMENT_cs_sales_001_2026-09-05_INFLOW`);
    });

    it("1.2. transforms a valid CASH_OUT supplier settlement into an OUTFLOW NormalizedCashMovement", () => {
      const supplierSettlement: CashSettlement = {
        id: "cs_sup_002",
        business_id: BIZ_ID,
        date: "2026-09-12",
        type: "CASH_OUT",
        amount_cents: 800000, // 8,000 HTG
        currency: "HTG",
        method: "BANK_TRANSFER",
        reference: "VIR-SOG-1200",
        category: "SUPPLIER_PAYMENT",
        created_at: "2026-09-12T11:00:00Z",
        created_by: "Finance_Mgr",
      };

      const result = CashSettlementAdapter.adaptSettlement(supplierSettlement);

      expect(result.status).toBe("VALID");
      const m = result.movement!;
      expect(m.direction).toBe("OUTFLOW");
      expect(m.movementType).toBe("SUPPLIER_PAYMENT");
      expect(m.amount).toBe(8000);
      expect(m.amountCents).toBe(800000);
      expect(getCashFlowImpact(m)).toBe(-8000);
    });

    it("1.3. preserves zero-value settlements without rejection (zero preservation)", () => {
      const zeroSettlement: CashSettlement = {
        id: "cs_zero_003",
        business_id: BIZ_ID,
        date: "2026-09-15",
        type: "CASH_IN",
        amount_cents: 0,
        currency: "HTG",
        method: "CASH",
        reference: "ADJUSTMENT-ZERO",
        category: "OTHER",
        created_at: "2026-09-15T09:00:00Z",
        created_by: "System",
      };

      const result = CashSettlementAdapter.adaptSettlement(zeroSettlement);

      expect(result.status).toBe("VALID");
      const m = result.movement!;
      expect(m.amount).toBe(0);
      expect(m.amountCents).toBe(0);
      expect(getCashFlowImpact(m)).toBe(0);
    });

    it("1.4. rejects settlement with missing or invalid currency (never guess currency)", () => {
      const missingCurrencySettlement: any = {
        id: "cs_bad_curr",
        business_id: BIZ_ID,
        date: "2026-09-10",
        type: "CASH_IN",
        amount_cents: 100000,
        currency: undefined,
        method: "CASH",
        reference: "NO-CURR",
        category: "SALES_COLLECTION",
      };

      const result = CashSettlementAdapter.adaptSettlement(missingCurrencySettlement);

      expect(result.status).toBe("INVALID");
      expect(result.rejectionReason).toContain("Missing or invalid currency");
    });

    it("1.5. rejects settlement with negative amount", () => {
      const negativeSettlement: CashSettlement = {
        id: "cs_neg_001",
        business_id: BIZ_ID,
        date: "2026-09-10",
        type: "CASH_IN",
        amount_cents: -50000,
        currency: "HTG",
        method: "CASH",
        reference: "CORRUPT-NEG",
        category: "OTHER",
        created_at: "2026-09-10T10:00:00Z",
        created_by: "System",
      };

      const result = CashSettlementAdapter.adaptSettlement(negativeSettlement);

      expect(result.status).toBe("INVALID");
      expect(result.rejectionReason).toContain("cannot be negative");
    });
  });

  // =========================================================================
  // 2. Document Exclusion Enforcement (tx_legacy_2026_01 & emp_legacy_002)
  // =========================================================================
  describe("2. Document Exclusion Enforcement", () => {
    it("2.1. LedgerCashAdapter rejects tx_legacy_2026_01 due to undefined currency", () => {
      const excludedTx: LedgerTransaction = {
        id: "tx_legacy_2026_01",
        business_id: BIZ_ID,
        branchId: "branch_main",
        isImmutable: true,
        signerId: "signer_legacy",
        source: "SYSTEM",
        type: "INCOME",
        amount: 12000,
        amount_cents: 1200000,
        date: "2026-01-15",
        description: "Transaction legacy sans devise",
        category: "SALES",
        status: "POSTED",
        debit_account: "1000_CASH",
        credit_account: "4000_REVENUE",
        currency: undefined as any,
      };

      const result = LedgerCashAdapter.adaptTransaction(excludedTx);

      expect(result.status).toBe("INVALID");
      expect(result.rejectionReason).toContain("tx_legacy_2026_01");
      expect(result.errors).toContain("currency is mandatory and cannot be inferred for excluded legacy records");
    });

    it("2.2. PayrollCashAdapter rejects emp_legacy_002 due to unresolved identity conflict", () => {
      const excludedPayrollRecord: PayrollRecord = {
        id: "pr_excluded_emp",
        cycleId: "cycle_2026_08",
        business_id: BIZ_ID,
        employeeId: "emp_legacy_002",
        grossSalary: 50000,
        netPaid: 40000,
        status: "PAID",
      } as any;

      const result = PayrollCashAdapter.adaptRecord(excludedPayrollRecord);

      expect(result.status).toBe("INVALID");
      expect(result.rejectionReason).toContain("emp_legacy_002 has an unresolved identity conflict");
    });

    it("2.3. CrossSourceCashReconciliationEngine suppresses tx_legacy_2026_01 and emp_legacy_002 if ingested", () => {
      const candidateTxMovement: any = {
        id: `cm_${BIZ_ID}_LEDGER_tx_legacy_2026_01_2026-01-15_INFLOW`,
        businessId: BIZ_ID,
        sourceModule: "LEDGER",
        sourceId: "tx_legacy_2026_01",
        movementDate: "2026-01-15",
        direction: "INFLOW",
        movementType: "SALE",
        amount: 12000,
        amountCents: 1200000,
        currency: "HTG",
        status: "SETTLED",
      };

      const candidateEmpMovement: any = {
        id: `cm_${BIZ_ID}_PAYROLL_pr_test_emp_legacy_002_2026-08-31_OUTFLOW`,
        businessId: BIZ_ID,
        sourceModule: "PAYROLL",
        sourceId: "pr_test_001",
        employeeId: "emp_legacy_002",
        movementDate: "2026-08-31",
        direction: "OUTFLOW",
        movementType: "PAYROLL",
        amount: 40000,
        amountCents: 4000000,
        currency: "HTG",
        status: "SETTLED",
      };

      const recon = CrossSourceCashReconciliationEngine.reconcile(
        [candidateTxMovement, candidateEmpMovement],
        { businessId: BIZ_ID, currency: "HTG" }
      );

      expect(recon.activeMovements).toHaveLength(0);
      expect(recon.suppressedMovements).toHaveLength(2);
      expect(recon.suppressedMovements[0].reason).toContain("unresolved schema/identity conflict");
      expect(recon.suppressedMovements[1].reason).toContain("unresolved schema/identity conflict");
    });
  });

  // =========================================================================
  // 3. Multi-Currency Strict Separation (HTG vs USD)
  // =========================================================================
  describe("3. Multi-Currency Strict Separation", () => {
    const mixedSettlements: CashSettlement[] = [
      {
        id: "cs_htg_sale_1",
        business_id: BIZ_ID,
        date: "2026-09-02",
        type: "CASH_IN",
        amount_cents: 25000000, // 250,000 HTG
        currency: "HTG",
        method: "BANK_TRANSFER",
        reference: "VIR-HTG-01",
        category: "SALES_COLLECTION",
        created_at: "2026-09-02T10:00:00Z",
        created_by: "System",
      },
      {
        id: "cs_usd_sale_1",
        business_id: BIZ_ID,
        date: "2026-09-03",
        type: "CASH_IN",
        amount_cents: 500000, // 5,000 USD
        currency: "USD",
        method: "BANK_TRANSFER",
        reference: "WIRE-USD-01",
        category: "SALES_COLLECTION",
        created_at: "2026-09-03T11:00:00Z",
        created_by: "System",
      },
      {
        id: "cs_usd_sale_2",
        business_id: BIZ_ID,
        date: "2026-09-04",
        type: "CASH_IN",
        amount_cents: 250000, // 2,500 USD
        currency: "USD",
        method: "BANK_TRANSFER",
        reference: "WIRE-USD-02",
        category: "SALES_COLLECTION",
        created_at: "2026-09-04T12:00:00Z",
        created_by: "System",
      },
      {
        id: "cs_htg_payout_1",
        business_id: BIZ_ID,
        date: "2026-09-10",
        type: "CASH_OUT",
        amount_cents: 5000000, // 50,000 HTG
        currency: "HTG",
        method: "CASH",
        reference: "EXP-HTG-01",
        category: "OTHER",
        created_at: "2026-09-10T14:00:00Z",
        created_by: "System",
      },
    ];

    it("3.1. generateMultiCurrencyStatement segregates HTG and USD into strict independent statements", () => {
      const adapted = CashSettlementAdapter.adaptBatch(mixedSettlements, { businessId: BIZ_ID }).movements;

      const multiStatement = CashBasisEngine.generateMultiCurrencyStatement(adapted, {
        businessId: BIZ_ID,
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        openingBalances: {
          HTG: 100000, // 100,000 HTG opening
          USD: 1000,   // 1,000 USD opening
        },
      });

      expect(multiStatement.currencies).toEqual(["HTG", "USD"]);
      expect(multiStatement.consolidationPolicy).toBe("STRICT_SEPARATION_NO_FX");

      // Verify HTG Statement
      const htgStmt = multiStatement.byCurrency["HTG"];
      expect(htgStmt).toBeDefined();
      expect(htgStmt.currency).toBe("HTG");
      expect(htgStmt.beginningCash).toBe(100000);
      expect(htgStmt.totalInflow).toBe(250000);
      expect(htgStmt.totalOutflow).toBe(50000);
      expect(htgStmt.netCashFlow).toBe(200000);
      expect(htgStmt.endingCash).toBe(300000); // 100,000 + 200,000

      // Verify USD Statement
      const usdStmt = multiStatement.byCurrency["USD"];
      expect(usdStmt).toBeDefined();
      expect(usdStmt.currency).toBe("USD");
      expect(usdStmt.beginningCash).toBe(1000);
      expect(usdStmt.totalInflow).toBe(7500); // 5,000 + 2,500 USD
      expect(usdStmt.totalOutflow).toBe(0);
      expect(usdStmt.netCashFlow).toBe(7500);
      expect(usdStmt.endingCash).toBe(8500); // 1,000 + 7,500

      // Absolute Rule: HTG and USD are NEVER combined into a single total
      expect((multiStatement as any).totalCash).toBeUndefined();
    });

    it("3.2. single currency pipeline execution ignores foreign currencies without mixing", () => {
      const statement = CashBasisEngine.executePipeline(
        { cashSettlements: mixedSettlements },
        {
          businessId: BIZ_ID,
          startDate: "2026-09-01",
          endDate: "2026-09-30",
          currency: "USD",
          openingBalance: 500,
        }
      );

      expect(statement.currency).toBe("USD");
      expect(statement.totalInflow).toBe(7500);
      expect(statement.totalOutflow).toBe(0);
      expect(statement.endingCash).toBe(8000); // 500 + 7,500
      expect(statement.reconciliationAudit.ignoredCount).toBe(2); // The 2 HTG records were ignored
    });
  });

  // =========================================================================
  // 4. Cross-Source Deduplication & Authority
  // =========================================================================
  describe("4. Cross-Source Deduplication & Source Authority", () => {
    it("4.1. suppresses duplicate CashSettlement when primary Operational INVOICE already accounted for it", () => {
      // Invoices source emits movement
      const invoiceMovement: any = {
        id: `cm_${BIZ_ID}_INVOICE_inv_101_2026-09-02_INFLOW`,
        businessId: BIZ_ID,
        sourceModule: "INVOICE",
        sourceId: "inv_101",
        movementDate: "2026-09-02",
        direction: "INFLOW",
        movementType: "INVOICE_COLLECTION",
        amount: 25000,
        amountCents: 2500000,
        currency: "HTG",
        status: "SETTLED",
      };

      // Settlement referencing the same invoice
      const redundantSettlement: CashSettlement = {
        id: "cs_duplicate_inv",
        business_id: BIZ_ID,
        date: "2026-09-02",
        type: "CASH_IN",
        amount_cents: 2500000,
        currency: "HTG",
        method: "BANK_TRANSFER",
        reference: "REC-INV-101",
        category: "SALES_COLLECTION",
        linked_invoice_id: "inv_101",
        created_at: "2026-09-02T10:00:00Z",
        created_by: "System",
      };

      const settlementMovement = CashSettlementAdapter.adaptSettlement(redundantSettlement).movement!;

      const recon = CrossSourceCashReconciliationEngine.reconcile(
        [invoiceMovement, settlementMovement],
        { businessId: BIZ_ID, currency: "HTG" }
      );

      expect(recon.activeMovements).toHaveLength(1);
      expect(recon.activeMovements[0].sourceModule).toBe("INVOICE");
      expect(recon.suppressedMovements).toHaveLength(1);
      expect(recon.suppressedMovements[0].reason).toContain("primary Invoice payment");
      expect(recon.suppressedMovements[0].matchedSourceId).toBe("inv_101");
    });

    it("4.2. suppresses redundant General Ledger entry when operational Cash Settlement exists", () => {
      const independentSettlement: CashSettlement = {
        id: "cs_counter_sale_99",
        business_id: BIZ_ID,
        date: "2026-09-18",
        type: "CASH_IN",
        amount_cents: 1500000,
        currency: "HTG",
        method: "CASH",
        reference: "TILL-CLOSURE-99",
        category: "SALES_COLLECTION",
        created_at: "2026-09-18T18:00:00Z",
        created_by: "Head_Teller",
      };

      const settlementMovement = CashSettlementAdapter.adaptSettlement(independentSettlement).movement!;

      const redundantLedgerTx: LedgerTransaction = {
        id: "tx_gl_till_99",
        business_id: BIZ_ID,
        type: "INCOME",
        amount: 15000,
        amount_cents: 1500000,
        date: "2026-09-18",
        description: "Clôture caisse journalière",
        category: "SALES",
        status: "POSTED",
        debit_account: "1000_CASH",
        credit_account: "4000_REVENUE",
        currency: "HTG",
        metadata: {
          linkedSettlementId: "cs_counter_sale_99",
        },
      } as any;

      const ledgerMovement = LedgerCashAdapter.adaptTransaction(redundantLedgerTx).movement!;

      const recon = CrossSourceCashReconciliationEngine.reconcile(
        [settlementMovement, ledgerMovement],
        { businessId: BIZ_ID, currency: "HTG" }
      );

      expect(recon.activeMovements).toHaveLength(1);
      expect(recon.activeMovements[0].sourceModule).toBe("CASH_SETTLEMENT");
      expect(recon.suppressedMovements).toHaveLength(1);
      expect(recon.suppressedMovements[0].movement.sourceModule).toBe("LEDGER");
      expect(recon.suppressedMovements[0].reason).toContain("operational Cash Settlement");
    });
  });

  // =========================================================================
  // 5. Idempotence & Determinism
  // =========================================================================
  describe("5. Idempotence & Determinism", () => {
    it("5.1. repeated execution of same settlements produces identical deterministic results and IDs", () => {
      const settlement: CashSettlement = {
        id: "cs_idem_001",
        business_id: BIZ_ID,
        date: "2026-09-20",
        type: "CASH_OUT",
        amount_cents: 1200000,
        currency: "HTG",
        method: "BANK_TRANSFER",
        reference: "PAY-EXP-IDEM",
        category: "OTHER",
        created_at: "2026-09-20T10:00:00Z",
        created_by: "System",
      };

      const m1 = CashSettlementAdapter.adaptSettlement(settlement).movement!;
      const m2 = CashSettlementAdapter.adaptSettlement(settlement).movement!;

      expect(m1.id).toBe(m2.id);

      const recon = CrossSourceCashReconciliationEngine.reconcile([m1, m2], {
        businessId: BIZ_ID,
        currency: "HTG",
      });

      // Deduplicated to exactly 1 active movement
      expect(recon.activeMovements).toHaveLength(1);
      expect(recon.activeMovements[0].id).toBe(m1.id);
    });
  });
});
