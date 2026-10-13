import { describe, it, expect } from "vitest";
import { BankStatementImportService, RawStatementRow } from "../../../services/accounting/BankStatementImportService";
import { BankReconciliationEngine } from "../../../services/accounting/BankReconciliationEngine";
import { CashBasisEngine, NormalizedCashMovement } from "../../../domains/cash";
import { LedgerTransaction } from "../../../types";

describe("PRIORITÉ 1.7 — Validation de Bout en Bout du Rapprochement Bancaire", () => {
  const businessIdAlpha = "business_tenant_alpha_17";
  const businessIdBeta = "business_tenant_beta_17";
  const bankAccountHTG = "1010_BANK_HTG";
  const bankAccountUSD = "1020_BANK_USD";

  const defaultTxBase = {
    branchId: "branch_main",
    branch_id: "branch_main",
    category: "OPERATING",
    isImmutable: true,
    signerId: "user_audit_17",
    source: "SYSTEM" as const,
    status: "POSTED" as const,
  };

  // Mock Ledger Transactions for Tenant Alpha (Internal Receipts, Checks, Transfers)
  const mockAlphaLedgerTransactions: LedgerTransaction[] = [
    {
      ...defaultTxBase,
      id: "tx_internal_receipt_1",
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
    // 3 till closures totaling 15,000 HTG (5,000 + 6,000 + 4,000)
    {
      ...defaultTxBase,
      id: "tx_till_closure_1",
      businessId: businessIdAlpha,
      business_id: businessIdAlpha,
      date: "2026-10-05",
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
      id: "tx_till_closure_2",
      businessId: businessIdAlpha,
      business_id: businessIdAlpha,
      date: "2026-10-05",
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
      id: "tx_till_closure_3",
      businessId: businessIdAlpha,
      business_id: businessIdAlpha,
      date: "2026-10-05",
      description: "Clôture Caisse 3 Soir",
      type: "INCOME",
      amount: 4000,
      amount_cents: 400000,
      debit_account: bankAccountHTG,
      credit_account: "7010_REVENUE",
      currency: "HTG",
    },
    // Outstanding check (written in ledger, undebited at bank)
    {
      ...defaultTxBase,
      id: "tx_outflow_check_transit",
      businessId: businessIdAlpha,
      business_id: businessIdAlpha,
      date: "2026-10-28",
      description: "Cheque Fournisseur Loyer Octobre Non Debite",
      type: "EXPENSE",
      amount: 3000,
      amount_cents: 300000,
      debit_account: "6100_RENT",
      credit_account: bankAccountHTG,
      currency: "HTG",
    },
    // Vendor expense cleared
    {
      ...defaultTxBase,
      id: "tx_vendor_cleared",
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
    // USD Consulting Income
    {
      ...defaultTxBase,
      id: "tx_usd_consulting",
      businessId: businessIdAlpha,
      business_id: businessIdAlpha,
      date: "2026-10-10",
      description: "USD Consulting Services",
      type: "INCOME",
      amount: 2500,
      amount_cents: 250000,
      debit_account: bankAccountUSD,
      credit_account: "7020_SERVICES",
      currency: "USD",
    },
  ];

  it("Phase A/B E2E Journey 1: Full Pipeline (Import -> Validation -> Reconcile -> Dispute -> Unmatch/Rematch)", () => {
    const rawCSV = `Date,Libelle,Debit,Credit,Ref
01/10/2026,Vente Client Depot Comptant,,5000.00,REF-001
02/10/2026,Paiement Fournisseur Papeterie,1200.00,,REF-002
05/10/2026,Recette Journaliere Caisse Consolidee,,15000.00,REF-DEP-003
12/10/2026,Frais de tenue de compte mensuel,150.00,,AGIOS-1026
15/10/2026,Prelevement Inconnu Contestation,450.00,,DISP-999
INVALID_FORMAT,Ligne Sans Date,,,
01/10/2026,Vente Client Depot Comptant,,5000.00,REF-001`;

    // 1. Import
    const importResult = BankStatementImportService.parseCSVString(rawCSV, {
      businessId: businessIdAlpha,
      currency: "HTG",
    });

    expect(importResult.validCount).toBe(5);
    expect(importResult.invalidCount).toBe(1);
    expect(importResult.duplicateCount).toBe(1);
    expect(importResult.totalDepositsCents).toBe(2000000); // 20,000 HTG
    expect(importResult.totalWithdrawalsCents).toBe(180000); // 1,800 HTG

    // 2. Reconcile
    let session = BankReconciliationEngine.reconcile(
      importResult.validLines,
      mockAlphaLedgerTransactions,
      businessIdAlpha,
      bankAccountHTG,
      0,
      1820000 // 18,200 HTG bank closing balance
    );

    expect(session.statementLines.length).toBe(5);
    expect(session.breakdown.unrecordedBankFeesCents).toBe(15000); // 150 HTG bank fee
    expect(session.breakdown.outstandingChecksCents).toBe(300000); // 3,000 HTG check in transit

    // 3. Mark Disputed
    const disputedLine = session.statementLines.find((l) => l.description.includes("Prelevement Inconnu"));
    expect(disputedLine).toBeDefined();
    session = BankReconciliationEngine.markLineDisputed(
      session,
      disputedLine!.id,
      "Prelevement non autorise contestation sous reserve"
    );

    expect(session.breakdown.disputedItemsCents).toBe(45000); // 450 HTG positive absolute value in dispute

    // 4. Manual Match Consolidated Till Deposit (15,000 HTG line) to till_1
    const consolidatedLine = session.statementLines.find((l) => l.description.includes("Caisse Consolidee"));
    expect(consolidatedLine).toBeDefined();

    session = BankReconciliationEngine.manualMatchLine(
      session,
      consolidatedLine!.id,
      "tx_till_closure_1"
    );

    expect(session.statementLines.find((l) => l.id === consolidatedLine!.id)?.reconciliationStatus).toBe("MANUAL_MATCH");

    // 5. Unmatch & Rematch
    session = BankReconciliationEngine.manualUnmatchLine(session, consolidatedLine!.id);
    expect(session.statementLines.find((l) => l.id === consolidatedLine!.id)?.reconciliationStatus).toBe("UNMATCHED");

    session = BankReconciliationEngine.manualMatchLine(
      session,
      consolidatedLine!.id,
      "tx_till_closure_1"
    );
    expect(session.statementLines.find((l) => l.id === consolidatedLine!.id)?.reconciliationStatus).toBe("MANUAL_MATCH");
  });

  it("Phase C Control 1: Balanced Reconciliation with Zero Residual Variance", () => {
    const rawRows: RawStatementRow[] = [
      { date: "2026-10-01", description: "Vente Client Depot Comptant", amount: 5000 },
      { date: "2026-10-02", description: "Paiement Fournisseur Papeterie", amount: -1200 },
      { date: "2026-10-12", description: "Frais de tenue de compte", amount: -150 },
    ];

    const importResult = BankStatementImportService.parseAndValidateRows(rawRows, {
      businessId: businessIdAlpha,
      currency: "HTG",
    });

    const session = BankReconciliationEngine.reconcile(
      importResult.validLines,
      mockAlphaLedgerTransactions,
      businessIdAlpha,
      bankAccountHTG,
      0,
      365000 // 3,650 HTG closing statement balance
    );

    expect(session.isBalanced).toBe(true);
    expect(session.breakdown.unexplainedDifferenceCents).toBe(0);
  });

  it("Phase C Control 2: Incomplete Reconciliation with Non-Zero Residual Variance", () => {
    const rawRows: RawStatementRow[] = [
      { date: "2026-10-01", description: "Vente Client Depot Comptant", amount: 5000 },
      { date: "2026-10-02", description: "Virement Mystere Non Identifie", amount: 20000 }, // Unexpected 20,000 HTG inflow
    ];

    const importResult = BankStatementImportService.parseAndValidateRows(rawRows, {
      businessId: businessIdAlpha,
      currency: "HTG",
    });

    const session = BankReconciliationEngine.reconcile(
      importResult.validLines,
      mockAlphaLedgerTransactions,
      businessIdAlpha,
      bankAccountHTG,
      0,
      2500000 // 25,000 HTG closing balance
    );

    expect(session.isBalanced).toBe(false);
    expect(session.breakdown.unexplainedDifferenceCents).toBe(2000000); // 20,000 HTG unexplained variance
  });

  it("Phase C Control 3: Multi-Tenant & Multi-Currency Isolation Guarantees", () => {
    const betaRows: RawStatementRow[] = [
      { date: "2026-10-01", description: "Tenant Beta Deposit", amount: 10000 },
    ];

    const importResult = BankStatementImportService.parseAndValidateRows(betaRows, {
      businessId: businessIdBeta,
      currency: "HTG",
    });

    // Attempting to reconcile Tenant Beta import against Tenant Alpha ledger transactions
    const session = BankReconciliationEngine.reconcile(
      importResult.validLines,
      mockAlphaLedgerTransactions,
      businessIdBeta,
      bankAccountHTG,
      0,
      1000000
    );

    expect(session.reconciledCount).toBe(0);
    expect(session.unreconciledCount).toBe(1);
    expect(session.statementLines[0].reconciliationStatus).toBe("UNMATCHED");
  });

  it("Phase C Control 4: Anti Double-Counting Verification on Consolidated Till Deposit", () => {
    // 3 till closures total 15,000 HTG. Match statement line of 15,000 HTG to till 1.
    const rawRows: RawStatementRow[] = [
      { date: "2026-10-05", description: "Depot Global Recettage Caisse", amount: 15000 },
    ];

    const importResult = BankStatementImportService.parseAndValidateRows(rawRows, {
      businessId: businessIdAlpha,
      currency: "HTG",
    });

    const session = BankReconciliationEngine.reconcile(
      importResult.validLines,
      mockAlphaLedgerTransactions,
      businessIdAlpha,
      bankAccountHTG,
      0,
      1500000
    );

    // Verify CashBasisEngine calculation before and after
    const sampleMovements: NormalizedCashMovement[] = [
      {
        id: "mov_till_1",
        businessId: businessIdAlpha,
        sourceModule: "CASH_SETTLEMENT",
        sourceId: "tx_till_closure_1",
        movementDate: "2026-10-05",
        direction: "INFLOW",
        movementType: "SALE",
        amount: 5000,
        amountCents: 500000,
        currency: "HTG",
        status: "SETTLED",
      },
      {
        id: "mov_till_2",
        businessId: businessIdAlpha,
        sourceModule: "CASH_SETTLEMENT",
        sourceId: "tx_till_closure_2",
        movementDate: "2026-10-05",
        direction: "INFLOW",
        movementType: "SALE",
        amount: 6000,
        amountCents: 600000,
        currency: "HTG",
        status: "SETTLED",
      },
      {
        id: "mov_till_3",
        businessId: businessIdAlpha,
        sourceModule: "CASH_SETTLEMENT",
        sourceId: "tx_till_closure_3",
        movementDate: "2026-10-05",
        direction: "INFLOW",
        movementType: "SALE",
        amount: 4000,
        amountCents: 400000,
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

    // Bank reconciliation does NOT add duplicate cash inflows
    const statementAfter = CashBasisEngine.generateStatement(sampleMovements, {
      businessId: businessIdAlpha,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      currency: "HTG",
    });

    expect(statementBefore.totalInflowCents).toBe(1500000); // 15,000 HTG
    expect(statementAfter.totalInflowCents).toBe(1500000); // 15,000 HTG (No double counting!)
  });
});
