import { BankStatementLine, BankReconciliation } from "../../types/accounting";
import { LedgerTransaction } from "../../types";

export class BankReconciliationEngine {
  /**
   * Performs automatic smart reconciliation between bank statement lines and ledger transactions.
   * Matches by:
   * 1. Exact amount and exact date
   * 2. Exact amount within date window (+/- 3 days)
   * 3. Reference or check number matching
   */
  public static reconcile(
    statementLines: BankStatementLine[],
    ledgerTransactions: LedgerTransaction[],
    businessId: string,
    bankAccountCode: string = "1010_BANK",
    openingBalanceCents: number = 0,
    closingBalanceCents: number = 0
  ): BankReconciliation {
    const bankTransactions = ledgerTransactions.filter((tx) => {
      if (tx.business_id !== businessId) return false;
      return tx.debit_account === bankAccountCode || tx.credit_account === bankAccountCode;
    });

    const usedTxIds = new Set<string>();
    let reconciledCount = 0;

    const reconciledLines: BankStatementLine[] = statementLines.map((line) => {
      const lineDate = new Date(line.date).getTime();
      const lineAmountAbs = Math.abs(line.amountCents);
      const isDeposit = line.amountCents >= 0;

      // 1. Try exact match (amount, direction, date)
      let matchedTx = bankTransactions.find((tx) => {
        if (usedTxIds.has(tx.id)) return false;
        const txAmountCents = tx.amount_cents || Math.round((tx.amount || 0) * 100);
        if (txAmountCents !== lineAmountAbs) return false;

        const isTxDeposit = tx.debit_account === bankAccountCode;
        if (isDeposit !== isTxDeposit) return false;

        const txDate = new Date(tx.date).getTime();
        const diffDays = Math.abs(lineDate - txDate) / (1000 * 60 * 60 * 24);
        return diffDays < 1;
      });

      if (matchedTx) {
        usedTxIds.add(matchedTx.id);
        reconciledCount++;
        return {
          ...line,
          matchedTransactionId: matchedTx.id,
          reconciliationStatus: "EXACT_MATCH",
          matchConfidenceScore: 100
        };
      }

      // 2. Try window match (+/- 4 days)
      matchedTx = bankTransactions.find((tx) => {
        if (usedTxIds.has(tx.id)) return false;
        const txAmountCents = tx.amount_cents || Math.round((tx.amount || 0) * 100);
        if (txAmountCents !== lineAmountAbs) return false;

        const isTxDeposit = tx.debit_account === bankAccountCode;
        if (isDeposit !== isTxDeposit) return false;

        const txDate = new Date(tx.date).getTime();
        const diffDays = Math.abs(lineDate - txDate) / (1000 * 60 * 60 * 24);
        return diffDays <= 4;
      });

      if (matchedTx) {
        usedTxIds.add(matchedTx.id);
        reconciledCount++;
        return {
          ...line,
          matchedTransactionId: matchedTx.id,
          reconciliationStatus: "SUGGESTED_MATCH",
          matchConfidenceScore: 85
        };
      }

      // 3. Try description/reference fuzzy match if available
      if (line.reference) {
        matchedTx = bankTransactions.find((tx) => {
          if (usedTxIds.has(tx.id)) return false;
          const desc = (tx.description || "").toLowerCase();
          const ref = (line.reference || "").toLowerCase();
          return ref.length >= 3 && desc.includes(ref);
        });

        if (matchedTx) {
          usedTxIds.add(matchedTx.id);
          reconciledCount++;
          return {
            ...line,
            matchedTransactionId: matchedTx.id,
            reconciliationStatus: "SUGGESTED_MATCH",
            matchConfidenceScore: 70
          };
        }
      }

      return {
        ...line,
        reconciliationStatus: line.reconciliationStatus || "UNMATCHED",
        matchConfidenceScore: 0
      };
    });

    // Calculate ledger balance from all transactions up to statement date
    let calculatedLedgerBalanceCents = 0;
    bankTransactions.forEach((tx) => {
      const amt = tx.amount_cents || Math.round((tx.amount || 0) * 100);
      if (tx.debit_account === bankAccountCode) {
        calculatedLedgerBalanceCents += amt;
      }
      if (tx.credit_account === bankAccountCode) {
        calculatedLedgerBalanceCents -= amt;
      }
    });

    const discrepancy = closingBalanceCents - (calculatedLedgerBalanceCents + openingBalanceCents);
    const unreconciledCount = reconciledLines.length - reconciledCount;

    return {
      id: `recon_${businessId}_${Date.now()}`,
      businessId,
      bankAccountCode,
      statementStartDate: statementLines[0]?.date || new Date().toISOString(),
      statementEndDate: statementLines[statementLines.length - 1]?.date || new Date().toISOString(),
      statementOpeningBalanceCents: openingBalanceCents,
      statementClosingBalanceCents: closingBalanceCents,
      ledgerOpeningBalanceCents: 0,
      ledgerClosingBalanceCents: calculatedLedgerBalanceCents,
      statementLines: reconciledLines,
      reconciledCount,
      unreconciledCount,
      discrepancyDeltaCents: discrepancy,
      isBalanced: discrepancy === 0 && unreconciledCount === 0,
      status: discrepancy === 0 && unreconciledCount === 0 ? "COMPLETED" : "IN_PROGRESS"
    };
  }
}
