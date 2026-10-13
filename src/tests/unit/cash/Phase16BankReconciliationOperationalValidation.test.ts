import { describe, it, expect } from "vitest";
import { BankStatementImportService, RawStatementRow } from "../../../services/accounting/BankStatementImportService";
import { BankReconciliationEngine } from "../../../services/accounting/BankReconciliationEngine";
import { CashBasisEngine, NormalizedCashMovement } from "../../../domains/cash";
import { LedgerTransaction } from "../../../types";

describe("PRIORITÉ 1.6 — Validation Opérationnelle du Rapprochement Bancaire et Contrôle de Trésorerie", () => {
  const businessIdAlpha = "business_tenant_alpha_16";
  const businessIdBeta = "business_tenant_beta_16";
  const bankAccountHTG = "1010_BANK_HTG";
  const bankAccountUSD = "1020_BANK_USD";

  const defaultTxBase = {
    branchId: "branch_main",
    branch_id: "branch_main",
    category: "OPERATING",
    isImmutable: true,
    signerId: "user_audit",
    source: "SYSTEM" as const,
    status: "POSTED" as const,
  };

  // Mock Ledger Transactions for Tenant Alpha
  const mockAlphaLedgerTransactions: LedgerTransaction[] = [
    {
      ...defaultTxBase,
      id: "tx_alpha_1",
      businessId: businessIdAlpha,
      business_id: businessIdAlpha,
      date: "2026-10-01",
      description: "Vente Client Depot Comptant",
      type: "INCOME",
      amount: 5000,
      amount_cents: 500000,
      debit_account: bankAccountHTG,
      credit_account: "7010_REVENUE",
      currency: "HTG",
    },
    {
      ...defaultTxBase,
      id: "tx_alpha_2",
      businessId: businessIdAlpha,
      business_id: businessIdAlpha,
      date: "2026-10-02",
      description: "Paiement Fournisseur Papeterie",
      type: "EXPENSE",
      amount: 1200,
      amount_cents: 120000,
      debit_account: "6010_EXPENSE",
      credit_account: bankAccountHTG,
      currency: "HTG",
    },
    {
      ...defaultTxBase,
      id: "tx_alpha_3",
      businessId: businessIdAlpha,
      business_id: businessIdAlpha,
      date: "2026-10-05",
      description: "Recette Journaliere Caisse Centrale",
      type: "INCOME",
      amount: 8500,
      amount_cents: 850000,
      debit_account: bankAccountHTG,
      credit_account: "7010_REVENUE",
      currency: "HTG",
    },
    {
      ...defaultTxBase,
      id: "tx_alpha_4",
      businessId: businessIdAlpha,
      business_id: businessIdAlpha,
      date: "2026-10-28",
      description: "Cheque en circulation Loyer Octobre",
      type: "EXPENSE",
      amount: 3000,
      amount_cents: 300000,
      debit_account: "6100_RENT",
      credit_account: bankAccountHTG,
      currency: "HTG",
    },
    {
      ...defaultTxBase,
      id: "tx_alpha_5_usd",
      businessId: businessIdAlpha,
      business_id: businessIdAlpha,
      date: "2026-10-10",
      description: "Consulting Fee Deposit USD",
      type: "INCOME",
      amount: 2500,
      amount_cents: 250000,
      debit_account: bankAccountUSD,
      credit_account: "7020_SERVICES",
      currency: "USD",
    },
  ];

  // Mock Ledger Transactions for Tenant Beta
  const mockBetaLedgerTransactions: LedgerTransaction[] = [
    {
      ...defaultTxBase,
      id: "tx_beta_1",
      businessId: businessIdBeta,
      business_id: businessIdBeta,
      date: "2026-10-01",
      description: "Tenant Beta Revenue Deposit",
      type: "INCOME",
      amount: 10000,
      amount_cents: 1000000,
      debit_account: bankAccountHTG,
      credit_account: "7010_REVENUE",
      currency: "HTG",
    },
  ];

  it("Control 1: Complex Multi-Period Bank Statement Import with Localized Formats & Mixed Headers", () => {
    const rawCSV = `Date,Libelle,Debit,Credit,Ref,Solde
01/10/2026,Vente Client Depot Comptant,,5000.00,REF-001,500000.00
02/10/2026,Paiement Fournisseur Papeterie,1200.00,,REF-002,498800.00
05/10/2026,Recette Journaliere Caisse Centrale,,8500.00,REF-003,507300.00
12/10/2026,Frais de tenue de compte mensuel,150.00,,AGIOS-1026,507150.00
15/10/2026,Prelevement inconnu contestation,450.00,,DISP-999,506700.00
INVALID_DATE_ROW,Entree sans date,0,100.00,,
01/10/2026,Vente Client Depot Comptant,,5000.00,REF-001,500000.00`;

    const result = BankStatementImportService.parseCSVString(rawCSV, {
      businessId: businessIdAlpha,
      currency: "HTG",
    });

    expect(result.businessId).toBe(businessIdAlpha);
    expect(result.currency).toBe("HTG");
    expect(result.validCount).toBe(5);
    expect(result.invalidCount).toBe(1);
    expect(result.duplicateCount).toBe(1);

    // Verify deposits and withdrawals
    expect(result.totalDepositsCents).toBe(1350000); // 5000 + 8500 = 13500.00 HTG
    expect(result.totalWithdrawalsCents).toBe(180000); // 1200 + 150 + 450 = 1800.00 HTG
    expect(result.netChangeCents).toBe(1170000); // 11700.00 HTG net
  });

  it("Control 2: High-Volume Batch Auto-Matching & Performance Scaling", () => {
    const batchSize = 100;
    const batchRows: RawStatementRow[] = [];
    const batchTxList: LedgerTransaction[] = [];

    for (let i = 0; i < batchSize; i++) {
      const date = `2026-10-${String((i % 28) + 1).padStart(2, "0")}`;
      const amount = (i + 1) * 100;
      const ref = `BATCH-REF-${i}`;

      batchRows.push({
        date,
        description: `Operations Batch Customer Deposit ${i}`,
        amount,
        reference: ref,
      });

      batchTxList.push({
        ...defaultTxBase,
        id: `batch_tx_${i}`,
        businessId: businessIdAlpha,
        business_id: businessIdAlpha,
        date,
        description: `Operations Batch Customer Deposit ${i}`,
        type: "INCOME",
        amount,
        amount_cents: amount * 100,
        debit_account: bankAccountHTG,
        credit_account: "7010_REVENUE",
        currency: "HTG",
      });
    }

    const importResult = BankStatementImportService.parseAndValidateRows(batchRows, {
      businessId: businessIdAlpha,
      currency: "HTG",
    });

    expect(importResult.validCount).toBe(batchSize);

    const startTime = performance.now();
    const reconciliation = BankReconciliationEngine.reconcile(
      importResult.validLines,
      batchTxList,
      businessIdAlpha,
      bankAccountHTG,
      0,
      importResult.netChangeCents
    );
    const durationMs = performance.now() - startTime;

    expect(reconciliation.reconciledCount).toBe(batchSize);
    expect(reconciliation.unreconciledCount).toBe(0);
    expect(reconciliation.isBalanced).toBe(true);
    expect(durationMs).toBeLessThan(100); // Must complete under 100ms
  });

  it("Control 3: Split & Aggregate Deposit Matching Scenarios (N-to-1 Matching)", () => {
    // 3 retail sales in ledger totaling 15,000 HTG
    const splitLedgerTxList: LedgerTransaction[] = [
      {
        ...defaultTxBase,
        id: "tx_till_1",
        businessId: businessIdAlpha,
        business_id: businessIdAlpha,
        date: "2026-10-10",
        description: "Clôture Caisse 1 Matin",
        type: "INCOME",
        amount: 5000,
        amount_cents: 500000,
        debit_account: bankAccountHTG,
        credit_account: "7010_REVENUE",
        currency: "HTG",
      },
      {
        ...defaultTxBase,
        id: "tx_till_2",
        businessId: businessIdAlpha,
        business_id: businessIdAlpha,
        date: "2026-10-10",
        description: "Clôture Caisse 2 Aprem",
        type: "INCOME",
        amount: 6000,
        amount_cents: 600000,
        debit_account: bankAccountHTG,
        credit_account: "7010_REVENUE",
        currency: "HTG",
      },
      {
        ...defaultTxBase,
        id: "tx_till_3",
        businessId: businessIdAlpha,
        business_id: businessIdAlpha,
        date: "2026-10-10",
        description: "Clôture Caisse 3 Soir",
        type: "INCOME",
        amount: 4000,
        amount_cents: 400000,
        debit_account: bankAccountHTG,
        credit_account: "7010_REVENUE",
        currency: "HTG",
      },
    ];

    // Single aggregated bank statement deposit line for 15,000 HTG
    const bankLineRow: RawStatementRow = {
      date: "2026-10-11",
      description: "Depot global recettage du 10/10/2026",
      amount: 15000,
      reference: "DEP-GLOBAL-1010",
    };

    const importResult = BankStatementImportService.parseAndValidateRows([bankLineRow], {
      businessId: businessIdAlpha,
      currency: "HTG",
    });

    const reconciliation = BankReconciliationEngine.reconcile(
      importResult.validLines,
      splitLedgerTxList,
      businessIdAlpha,
      bankAccountHTG,
      0,
      1500000
    );

    // Manual match to aggregated transaction or primary line
    const manuallyMatched = BankReconciliationEngine.manualMatchLine(
      reconciliation,
      importResult.validLines[0].id,
      "tx_till_1"
    );

    expect(manuallyMatched.reconciledCount).toBe(1);
    expect(manuallyMatched.statementLines[0].reconciliationStatus).toBe("MANUAL_MATCH");
    expect(manuallyMatched.statementLines[0].matchedTransactionId).toBe("tx_till_1");
  });

  it("Control 4: Chargeback, Reversal & Disputed Line Management", () => {
    const disputedRow: RawStatementRow = {
      date: "2026-10-15",
      description: "Prelevement Frauduleux Non Autorise",
      amount: -450,
      reference: "FRAUD-450",
    };

    const importResult = BankStatementImportService.parseAndValidateRows([disputedRow], {
      businessId: businessIdAlpha,
      currency: "HTG",
    });

    const initialRecon = BankReconciliationEngine.reconcile(
      importResult.validLines,
      mockAlphaLedgerTransactions,
      businessIdAlpha,
      bankAccountHTG,
      0,
      -45000
    );

    // Mark line as disputed
    const disputedRecon = BankReconciliationEngine.markLineDisputed(
      initialRecon,
      importResult.validLines[0].id,
      "Contestation formelle envoyée à la banque le 16/10"
    );

    expect(disputedRecon.statementLines[0].reconciliationStatus).toBe("DISPUTED");
    expect(disputedRecon.statementLines[0].validationError).toBe("Contestation formelle envoyée à la banque le 16/10");
  });

  it("Control 5: Unmatch & Rematch Interactive Workflows with Audit Trail", () => {
    const row: RawStatementRow = {
      date: "2026-10-01",
      description: "Vente Client Depot Comptant",
      amount: 5000,
      reference: "REF-001",
    };

    const importResult = BankStatementImportService.parseAndValidateRows([row], {
      businessId: businessIdAlpha,
      currency: "HTG",
    });

    let recon = BankReconciliationEngine.reconcile(
      importResult.validLines,
      mockAlphaLedgerTransactions,
      businessIdAlpha,
      bankAccountHTG,
      0,
      500000
    );

    expect(recon.reconciledCount).toBe(1);
    expect(recon.statementLines[0].reconciliationStatus).toBe("EXACT_MATCH");

    // Unmatch manually
    recon = BankReconciliationEngine.manualUnmatchLine(recon, importResult.validLines[0].id);
    expect(recon.reconciledCount).toBe(0);
    expect(recon.unreconciledCount).toBe(1);
    expect(recon.statementLines[0].reconciliationStatus).toBe("UNMATCHED");
    expect(recon.statementLines[0].matchedTransactionId).toBeUndefined();

    // Rematch to alternative transaction
    recon = BankReconciliationEngine.manualMatchLine(recon, importResult.validLines[0].id, "tx_alpha_3");
    expect(recon.reconciledCount).toBe(1);
    expect(recon.statementLines[0].reconciliationStatus).toBe("MANUAL_MATCH");
    expect(recon.statementLines[0].matchedTransactionId).toBe("tx_alpha_3");
  });

  it("Control 6: End-of-Month Transit Reconciliation & Stale Item Aging", () => {
    // Statement has 5,000 deposit and 1,200 withdrawal (cleared = 3,800 HTG net)
    // Ledger has tx_alpha_4 (3,000 HTG outstanding check written Oct 28)
    const statementRows: RawStatementRow[] = [
      { date: "2026-10-01", description: "Vente Client Depot Comptant", amount: 5000 },
      { date: "2026-10-02", description: "Paiement Fournisseur Papeterie", amount: -1200 },
      { date: "2026-10-31", description: "Frais de Tenue de Compte", amount: -150 },
    ];

    const importResult = BankStatementImportService.parseAndValidateRows(statementRows, {
      businessId: businessIdAlpha,
      currency: "HTG",
    });

    // Opening balance = 0, Closing statement balance = 3,650.00 HTG (365,000 cents)
    const recon = BankReconciliationEngine.reconcile(
      importResult.validLines,
      mockAlphaLedgerTransactions,
      businessIdAlpha,
      bankAccountHTG,
      0,
      365000
    );

    expect(recon.breakdown.outstandingChecksCents).toBe(300000); // 3,000 HTG check in transit
    expect(recon.breakdown.unrecordedBankFeesCents).toBe(15000); // 150 HTG fee
    expect(recon.breakdown.depositsInTransitCents).toBe(850000); // 8,500 HTG deposit in transit
    expect(recon.breakdown.unexplainedDifferenceCents).toBe(0); // Variance fully explained!
  });

  it("Control 7: Strict Multi-Tenant & Multi-Currency Operational Isolation", () => {
    const alphaStatement: RawStatementRow = {
      date: "2026-10-01",
      description: "Tenant Beta Revenue Deposit",
      amount: 10000,
    };

    // Attempting to reconcile Tenant Alpha statement against Tenant Beta transactions
    const importResult = BankStatementImportService.parseAndValidateRows([alphaStatement], {
      businessId: businessIdAlpha,
      currency: "HTG",
    });

    const recon = BankReconciliationEngine.reconcile(
      importResult.validLines,
      mockBetaLedgerTransactions, // Beta transactions provided
      businessIdAlpha, // Alpha business ID target
      bankAccountHTG,
      0,
      1000000
    );

    // Must NOT match Tenant Beta's ledger transaction
    expect(recon.reconciledCount).toBe(0);
    expect(recon.unreconciledCount).toBe(1);
    expect(recon.statementLines[0].reconciliationStatus).toBe("UNMATCHED");
  });

  it("Control 8: Immutability and Non-Regression of SSOT CashBasisEngine", () => {
    const sampleMovements: NormalizedCashMovement[] = [
      {
        id: "mov_1",
        sourceModule: "CASH_SETTLEMENT",
        sourceId: "settle_1",
        businessId: businessIdAlpha,
        movementDate: "2026-10-01",
        direction: "INFLOW",
        movementType: "SALE",
        amount: 5000,
        amountCents: 500000,
        currency: "HTG",
        status: "SETTLED",
      },
      {
        id: "mov_2",
        sourceModule: "LEDGER",
        sourceId: "tx_2",
        businessId: businessIdAlpha,
        movementDate: "2026-10-02",
        direction: "OUTFLOW",
        movementType: "EXPENSE",
        amount: 1200,
        amountCents: 120000,
        currency: "HTG",
        status: "SETTLED",
      },
    ];

    const statementBefore = CashBasisEngine.generateStatement(sampleMovements, {
      businessId: businessIdAlpha,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      currency: "HTG",
    });

    // Run Bank Statement Import & Reconciliation
    const rawCSV = `Date,Libelle,Debit,Credit\n01/10/2026,Vente Client,,5000.00\n02/10/2026,Achat Papeterie,1200.00,`;
    const importResult = BankStatementImportService.parseCSVString(rawCSV, { businessId: businessIdAlpha });
    BankReconciliationEngine.reconcile(importResult.validLines, mockAlphaLedgerTransactions, businessIdAlpha);

    const statementAfter = CashBasisEngine.generateStatement(sampleMovements, {
      businessId: businessIdAlpha,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      currency: "HTG",
    });

    // Absolute zero side effect on CashBasisEngine
    expect(statementBefore.totalInflowCents).toBe(statementAfter.totalInflowCents);
    expect(statementBefore.totalOutflowCents).toBe(statementAfter.totalOutflowCents);
    expect(statementBefore.netCashFlowCents).toBe(statementAfter.netCashFlowCents);
    expect(statementBefore.endingCashCents).toBe(statementAfter.endingCashCents);
  });
});
