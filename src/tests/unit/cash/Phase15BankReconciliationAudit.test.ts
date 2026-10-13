import { describe, it, expect } from "vitest";
import { BankStatementImportService, RawStatementRow } from "../../../services/accounting/BankStatementImportService";
import { BankReconciliationEngine } from "../../../services/accounting/BankReconciliationEngine";
import { CashBasisEngine } from "../../../domains/cash/engine/CashBasisEngine";
import { LedgerTransaction } from "../../../types";
import { BankStatementLine } from "../../../types/accounting";

describe("PHASE 1.5 — Bank Reconciliation & Cash Control Audit Suite", () => {
  const TENANT_ALPHA = "tenant_alpha_bank_15";
  const TENANT_BETA = "tenant_beta_bank_15";

  // Fixtures
  const rawRowsAlpha: RawStatementRow[] = [
    {
      date: "2026-10-01",
      description: "Dépôt client Alpha Corp",
      amount: 150000,
      reference: "DEP-1001",
      currency: "HTG",
      balance: 150000,
    },
    {
      date: "2026-10-05",
      description: "Virement Fournisseur Beta",
      debit: 45000,
      reference: "VIR-2002",
      currency: "HTG",
      balance: 105000,
    },
    {
      date: "2026-10-10",
      description: "Frais de tenue de compte mensuels",
      amount: -1500,
      reference: "FEE-3003",
      currency: "HTG",
      balance: 103500,
    },
    {
      date: "INVALID-DATE",
      description: "Ligne corrompue",
      amount: 1000,
      currency: "HTG",
    },
    {
      date: "2026-10-12",
      description: "Transaction en USD erronée",
      amount: 500,
      currency: "USD",
    },
  ];

  const ledgerTxAlphaList: LedgerTransaction[] = [
    {
      id: "tx_alpha_01",
      business_id: TENANT_ALPHA,
      date: "2026-10-01",
      description: "Paiement client Alpha Corp",
      amount: 150000,
      amount_cents: 15000000,
      type: "INCOME",
      status: "POSTED",
      debit_account: "1010_BANK",
      credit_account: "1200_RECEIVABLE",
      currency: "HTG",
    } as any,
    {
      id: "tx_alpha_02",
      business_id: TENANT_ALPHA,
      date: "2026-10-06", // 1 day window
      description: "Règlement fournisseur Beta",
      amount: 45000,
      amount_cents: 4500000,
      type: "EXPENSE",
      status: "POSTED",
      debit_account: "2000_PAYABLE",
      credit_account: "1010_BANK",
      currency: "HTG",
    } as any,
    {
      id: "tx_alpha_transit_deposit",
      business_id: TENANT_ALPHA,
      date: "2026-10-25",
      description: "Chèque déposé non encore compensé",
      amount: 80000,
      amount_cents: 8000000,
      type: "INCOME",
      status: "POSTED",
      debit_account: "1010_BANK",
      credit_account: "1200_RECEIVABLE",
      currency: "HTG",
    } as any,
    {
      id: "tx_alpha_outstanding_check",
      business_id: TENANT_ALPHA,
      date: "2026-10-28",
      description: "Chèque émis non encore débité",
      amount: 25000,
      amount_cents: 2500000,
      type: "EXPENSE",
      status: "POSTED",
      debit_account: "6000_EXPENSE",
      credit_account: "1010_BANK",
      currency: "HTG",
    } as any,
  ];

  // =========================================================================
  // 1. PHASE B: STATEMENT IMPORT & VALIDATION
  // =========================================================================
  describe("1. Phase B — Statement Import & Validation", () => {
    it("Parses rows, validates tenant boundary and extracts valid vs invalid lines", () => {
      const result = BankStatementImportService.parseAndValidateRows(rawRowsAlpha, {
        businessId: TENANT_ALPHA,
        currency: "HTG",
      });

      expect(result.businessId).toBe(TENANT_ALPHA);
      expect(result.validCount).toBe(3);
      expect(result.invalidCount).toBe(2); // 1 invalid date + 1 USD mismatch
      expect(result.totalDepositsCents).toBe(15000000);
      expect(result.totalWithdrawalsCents).toBe(4650000); // 45,000 + 1,500
      expect(result.invalidLines.some((l) => l.validationError === "INVALID_DATE")).toBe(true);
      expect(result.invalidLines.some((l) => l.validationError?.includes("CURRENCY_MISMATCH"))).toBe(true);
    });

    it("Parses raw CSV string input seamlessly", () => {
      const csv = `Date,Description,Amount,Reference,Currency
2026-10-01,"Recette Vente Tills",50000,REF-101,HTG
2026-10-02,"Achat Fournitures",-12000,REF-102,HTG`;

      const result = BankStatementImportService.parseCSVString(csv, {
        businessId: TENANT_ALPHA,
        currency: "HTG",
      });

      expect(result.validCount).toBe(2);
      expect(result.totalDepositsCents).toBe(5000000);
      expect(result.totalWithdrawalsCents).toBe(1200000);
    });

    it("Detects duplicate bank statement lines and flags them as IGNORED", () => {
      const existingLine: BankStatementLine = {
        id: "existing_01",
        date: "2026-10-01",
        description: "Dépôt client Alpha Corp",
        amountCents: 15000000,
        reference: "DEP-1001",
        reconciliationStatus: "UNMATCHED",
        currency: "HTG",
      };

      const result = BankStatementImportService.parseAndValidateRows(rawRowsAlpha, {
        businessId: TENANT_ALPHA,
        currency: "HTG",
        existingLines: [existingLine],
      });

      expect(result.duplicateCount).toBe(1);
      expect(result.duplicateLines[0].validationError).toBe("DUPLICATE_ENTRY");
    });
  });

  // =========================================================================
  // 2. PHASE C: MATCHING ALGORITHM & RECONCILIATION
  // =========================================================================
  describe("2. Phase C — Matching Algorithm & Reconciliation", () => {
    it("Performs exact and window matching on statement lines", () => {
      const importResult = BankStatementImportService.parseAndValidateRows(rawRowsAlpha, {
        businessId: TENANT_ALPHA,
        currency: "HTG",
      });

      const reconciliation = BankReconciliationEngine.reconcile(
        importResult.validLines,
        ledgerTxAlphaList,
        TENANT_ALPHA,
        "1010_BANK",
        0,
        10350000, // 103,500 HTG closing balance
        { currency: "HTG" }
      );

      expect(reconciliation.businessId).toBe(TENANT_ALPHA);
      expect(reconciliation.reconciledCount).toBe(2); // Deposit + Vendor payment
      
      const exactMatch = reconciliation.statementLines.find((l) => l.reference === "DEP-1001");
      expect(exactMatch?.reconciliationStatus).toBe("EXACT_MATCH");
      expect(exactMatch?.matchedTransactionId).toBe("tx_alpha_01");

      const windowMatch = reconciliation.statementLines.find((l) => l.reference === "VIR-2002");
      expect(windowMatch?.reconciliationStatus).toBe("SUGGESTED_MATCH");
      expect(windowMatch?.matchedTransactionId).toBe("tx_alpha_02");
    });

    it("Supports manual match, manual unmatch, and marking as disputed", () => {
      const importResult = BankStatementImportService.parseAndValidateRows(rawRowsAlpha, {
        businessId: TENANT_ALPHA,
        currency: "HTG",
      });

      let recon = BankReconciliationEngine.reconcile(
        importResult.validLines,
        ledgerTxAlphaList,
        TENANT_ALPHA,
        "1010_BANK",
        0,
        10350000
      );

      const feeLine = recon.statementLines.find((l) => l.reference === "FEE-3003")!;
      expect(feeLine.reconciliationStatus).toBe("UNMATCHED");

      // Mark fee line as disputed
      recon = BankReconciliationEngine.markLineDisputed(recon, feeLine.id, "Frais contestés avec la banque");
      const disputedLine = recon.statementLines.find((l) => l.id === feeLine.id);
      expect(disputedLine?.reconciliationStatus).toBe("DISPUTED");

      // Manual unmatch exact match
      const exactLine = recon.statementLines.find((l) => l.reference === "DEP-1001")!;
      recon = BankReconciliationEngine.manualUnmatchLine(recon, exactLine.id);
      const unmatchedLine = recon.statementLines.find((l) => l.id === exactLine.id);
      expect(unmatchedLine?.reconciliationStatus).toBe("UNMATCHED");

      // Manual re-match
      recon = BankReconciliationEngine.manualMatchLine(recon, exactLine.id, "tx_alpha_01");
      const rematchedLine = recon.statementLines.find((l) => l.id === exactLine.id);
      expect(rematchedLine?.reconciliationStatus).toBe("MANUAL_MATCH");
    });
  });

  // =========================================================================
  // 3. PHASE D: DISCREPANCIES & CASH CONTROL BREAKDOWN
  // =========================================================================
  describe("3. Phase D — Discrepancies & Cash Control Breakdown", () => {
    it("Calculates deposits in transit, outstanding checks, unrecorded fees, and unexplained differences", () => {
      const importResult = BankStatementImportService.parseAndValidateRows(rawRowsAlpha, {
        businessId: TENANT_ALPHA,
        currency: "HTG",
      });

      // Statement closing balance: 103,500 HTG (10,350,000 cents)
      // Ledger bank transactions total: 150,000 - 45,000 + 80,000 - 25,000 = 160,000 HTG (16,000,000 cents)
      // Discrepancy delta = 103,500 - 160,000 = -56,500 HTG (-5,650,000 cents)
      const recon = BankReconciliationEngine.reconcile(
        importResult.validLines,
        ledgerTxAlphaList,
        TENANT_ALPHA,
        "1010_BANK",
        0,
        10350000,
        { currency: "HTG" }
      );

      expect(recon.discrepancyDeltaCents).toBe(-5650000);
      expect(recon.breakdown).toBeDefined();

      const bd = recon.breakdown!;
      // Deposits in transit: tx_alpha_transit_deposit (80,000 HTG = 8,000,000 cents)
      expect(bd.depositsInTransitCents).toBe(8000000);

      // Outstanding checks: tx_alpha_outstanding_check (25,000 HTG = 2,500,000 cents)
      expect(bd.outstandingChecksCents).toBe(2500000);

      // Unrecorded bank fees: FEE-3003 (1,500 HTG = 150,000 cents)
      expect(bd.unrecordedBankFeesCents).toBe(150000);

      // Discrepancy check: -56,500 = -(80,000) + 25,000 + 1,500 - unexplained
      // unexplained = -56,500 - (-80,000 + 25,000 + 1,500) = 0!
      expect(bd.unexplainedDifferenceCents).toBe(0);
    });
  });

  // =========================================================================
  // 4. MULTI-TENANT & MULTI-CURRENCY ISOLATION
  // =========================================================================
  describe("4. Multi-Tenant & Multi-Currency Isolation Guards", () => {
    it("Enforces tenant isolation (Tenant Alpha cannot reconcile Tenant Beta transactions)", () => {
      const ledgerBeta: LedgerTransaction = {
        id: "tx_beta_01",
        business_id: TENANT_BETA,
        date: "2026-10-01",
        description: "Dépôt client Alpha Corp",
        amount: 150000,
        amount_cents: 15000000,
        type: "INCOME",
        status: "POSTED",
        debit_account: "1010_BANK",
        credit_account: "1200_RECEIVABLE",
        currency: "HTG",
      } as any;

      const importResult = BankStatementImportService.parseAndValidateRows(rawRowsAlpha, {
        businessId: TENANT_ALPHA,
        currency: "HTG",
      });

      const reconAlpha = BankReconciliationEngine.reconcile(
        importResult.validLines,
        [ledgerBeta], // Passing ONLY Tenant Beta transactions
        TENANT_ALPHA,
        "1010_BANK",
        0,
        15000000
      );

      // 0 matched lines because Tenant Beta transaction is strictly ignored for Tenant Alpha!
      expect(reconAlpha.reconciledCount).toBe(0);
      expect(reconAlpha.statementLines.every((l) => l.reconciliationStatus === "UNMATCHED")).toBe(true);
    });

    it("Enforces currency isolation (HTG statement does not reconcile against USD transactions when required)", () => {
      const ledgerUSD: LedgerTransaction = {
        id: "tx_usd_01",
        business_id: TENANT_ALPHA,
        date: "2026-10-01",
        description: "Dépôt client Alpha Corp",
        amount: 150000,
        amount_cents: 15000000,
        type: "INCOME",
        status: "POSTED",
        debit_account: "1010_BANK",
        credit_account: "1200_RECEIVABLE",
        currency: "USD",
      } as any;

      const importResult = BankStatementImportService.parseAndValidateRows(rawRowsAlpha, {
        businessId: TENANT_ALPHA,
        currency: "HTG",
      });

      const reconHTG = BankReconciliationEngine.reconcile(
        importResult.validLines,
        [ledgerUSD],
        TENANT_ALPHA,
        "1010_BANK",
        0,
        15000000,
        { currency: "HTG", requireCurrencyMatch: true }
      );

      expect(reconHTG.reconciledCount).toBe(0);
    });
  });

  // =========================================================================
  // 5. CANONICAL CASH BASIS ENGINE INVARIANT INTEGRITY
  // =========================================================================
  describe("5. Canonical Cash Basis Engine Invariant Integrity", () => {
    it("Verifies that bank reconciliation does NOT distort canonical CashBasisEngine calculations", () => {
      // Execute canonical CashBasisEngine on ledger transactions
      const canonicalStatement = CashBasisEngine.executePipeline(
        { ledgerTransactions: ledgerTxAlphaList },
        { businessId: TENANT_ALPHA, startDate: "2026-10-01", endDate: "2026-10-31", currency: "HTG" }
      );

      expect(canonicalStatement.totalInflow).toBe(230000); // 150,000 + 80,000
      expect(canonicalStatement.totalOutflow).toBe(70000);  // 45,000 + 25,000
      expect(canonicalStatement.netCashFlow).toBe(160000);

      // Perform bank reconciliation
      const importResult = BankStatementImportService.parseAndValidateRows(rawRowsAlpha, {
        businessId: TENANT_ALPHA,
        currency: "HTG",
      });

      const recon = BankReconciliationEngine.reconcile(
        importResult.validLines,
        ledgerTxAlphaList,
        TENANT_ALPHA,
        "1010_BANK",
        0,
        10350000,
        { currency: "HTG" }
      );

      // Re-query canonical CashBasisEngine post reconciliation
      const postReconStatement = CashBasisEngine.executePipeline(
        { ledgerTransactions: ledgerTxAlphaList },
        { businessId: TENANT_ALPHA, startDate: "2026-10-01", endDate: "2026-10-31", currency: "HTG" }
      );

      // Reconciling bank statements must NEVER alter the underlying cash basis cash flow calculations
      expect(postReconStatement.totalInflow).toBe(canonicalStatement.totalInflow);
      expect(postReconStatement.totalOutflow).toBe(canonicalStatement.totalOutflow);
      expect(postReconStatement.netCashFlow).toBe(canonicalStatement.netCashFlow);
    });
  });
});
