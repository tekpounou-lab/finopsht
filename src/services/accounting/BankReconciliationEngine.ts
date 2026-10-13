import { BankStatementLine, BankReconciliation, BankReconciliationBreakdown } from "../../types/accounting";
import { LedgerTransaction } from "../../types";

export interface ReconcileOptions {
  currency?: string;
  currencyFilter?: string;
  requireCurrencyMatch?: boolean;
}

export class BankReconciliationEngine {
  /**
   * Performs automatic smart reconciliation between bank statement lines and ledger transactions.
   * Enforces multi-tenant isolation (businessId) and multi-currency isolation.
   */
  public static reconcile(
    statementLines: BankStatementLine[],
    ledgerTransactions: LedgerTransaction[],
    businessId: string,
    bankAccountCode: string = "1010_BANK",
    openingBalanceCents: number = 0,
    closingBalanceCents: number = 0,
    options: ReconcileOptions = {}
  ): BankReconciliation {
    const targetCurrency = (options.currency || options.currencyFilter || "HTG").toUpperCase();

    // 1. Strict Tenant & Currency Filtering
    const bankTransactions = ledgerTransactions.filter((tx) => {
      if (!tx.business_id || tx.business_id !== businessId) return false;
      const txCurrency = (tx.currency || "HTG").toUpperCase();
      if (options.requireCurrencyMatch && txCurrency !== targetCurrency) return false;
      return tx.debit_account === bankAccountCode || tx.credit_account === bankAccountCode;
    });

    const usedTxIds = new Set<string>();
    let reconciledCount = 0;

    const reconciledLines: BankStatementLine[] = statementLines.map((line) => {
      if (line.reconciliationStatus === "DISPUTED" || line.isInvalid || line.reconciliationStatus === "IGNORED") {
        return line;
      }

      // Preserve existing manual match
      if (line.reconciliationStatus === "MANUAL_MATCH" && line.matchedTransactionId) {
        usedTxIds.add(line.matchedTransactionId);
        reconciledCount++;
        return line;
      }

      const lineDate = new Date(line.date).getTime();
      const lineAmountAbs = Math.abs(line.amountCents);
      const isDeposit = line.amountCents >= 0;

      // 1. Try exact match (amount, direction, date diff < 1 day)
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
          currency: line.currency || targetCurrency,
          matchedTransactionId: matchedTx.id,
          reconciliationStatus: "EXACT_MATCH",
          matchConfidenceScore: 100,
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
          currency: line.currency || targetCurrency,
          matchedTransactionId: matchedTx.id,
          reconciliationStatus: "SUGGESTED_MATCH",
          matchConfidenceScore: 85,
        };
      }

      // 3. Try description/reference fuzzy match
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
            currency: line.currency || targetCurrency,
            matchedTransactionId: matchedTx.id,
            reconciliationStatus: "SUGGESTED_MATCH",
            matchConfidenceScore: 70,
          };
        }
      }

      return {
        ...line,
        currency: line.currency || targetCurrency,
        reconciliationStatus: line.reconciliationStatus || "UNMATCHED",
        matchConfidenceScore: 0,
      };
    });

    // Calculate ledger balance from bank transactions
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

    const netLedgerClosingCents = openingBalanceCents + calculatedLedgerBalanceCents;
    const discrepancy = closingBalanceCents - netLedgerClosingCents;

    // Calculate itemized control breakdown
    let depositsInTransitCents = 0;
    let outstandingChecksCents = 0;

    bankTransactions.forEach((tx) => {
      if (!usedTxIds.has(tx.id)) {
        const amt = tx.amount_cents || Math.round((tx.amount || 0) * 100);
        if (tx.debit_account === bankAccountCode) {
          depositsInTransitCents += amt; // Inflow in ledger not yet cleared in bank
        } else if (tx.credit_account === bankAccountCode) {
          outstandingChecksCents += amt; // Outflow in ledger not yet cleared in bank
        }
      }
    });

    let unrecordedBankFeesCents = 0;
    let disputedItemsCents = 0;

    reconciledLines.forEach((line) => {
      if (line.reconciliationStatus === "DISPUTED") {
        disputedItemsCents += Math.abs(line.amountCents);
      } else if (line.reconciliationStatus === "UNMATCHED" && line.amountCents < 0) {
        const desc = (line.description || "").toLowerCase();
        if (
          desc.includes("frais") ||
          desc.includes("agios") ||
          desc.includes("fee") ||
          desc.includes("commission") ||
          desc.includes("taxe") ||
          desc.includes("service charge")
        ) {
          unrecordedBankFeesCents += Math.abs(line.amountCents);
        }
      }
    });

    // Bank Statement Balance = Ledger Balance - depositsInTransit + outstandingChecks - unrecordedBankFees + unexplainedDifference
    // Therefore: unexplainedDifference = discrepancy + depositsInTransit - outstandingChecks + unrecordedBankFees
    const unexplainedDifferenceCents =
      discrepancy + depositsInTransitCents - outstandingChecksCents + unrecordedBankFeesCents;

    const breakdown: BankReconciliationBreakdown = {
      depositsInTransitCents,
      outstandingChecksCents,
      unrecordedBankFeesCents,
      disputedItemsCents,
      unexplainedDifferenceCents,
    };

    const validLinesCount = reconciledLines.filter((l) => !l.isInvalid && l.reconciliationStatus !== "IGNORED").length;
    const unreconciledCount = validLinesCount - reconciledCount;

    return {
      id: `recon_${businessId}_${Date.now()}`,
      businessId,
      bankAccountCode,
      currency: targetCurrency,
      statementStartDate: statementLines[0]?.date || new Date().toISOString().substring(0, 10),
      statementEndDate: statementLines[statementLines.length - 1]?.date || new Date().toISOString().substring(0, 10),
      statementOpeningBalanceCents: openingBalanceCents,
      statementClosingBalanceCents: closingBalanceCents,
      ledgerOpeningBalanceCents: openingBalanceCents,
      ledgerClosingBalanceCents: netLedgerClosingCents,
      statementLines: reconciledLines,
      reconciledCount,
      unreconciledCount,
      discrepancyDeltaCents: discrepancy,
      isBalanced: unexplainedDifferenceCents === 0,
      status: unexplainedDifferenceCents === 0 ? "COMPLETED" : "IN_PROGRESS",
      breakdown,
    };
  }

  /**
   * Recalculates breakdown and status after manual line actions.
   */
  private static recalculateSession(
    reconciliation: BankReconciliation,
    updatedLines: BankStatementLine[]
  ): BankReconciliation {
    let disputedItemsCents = 0;
    let unrecordedBankFeesCents = 0;
    let reconciledCount = 0;

    updatedLines.forEach((line) => {
      if (line.reconciliationStatus === "EXACT_MATCH" || line.reconciliationStatus === "SUGGESTED_MATCH" || line.reconciliationStatus === "MANUAL_MATCH") {
        reconciledCount++;
      } else if (line.reconciliationStatus === "DISPUTED") {
        disputedItemsCents += Math.abs(line.amountCents);
      } else if (line.reconciliationStatus === "UNMATCHED" && line.amountCents < 0) {
        const desc = (line.description || "").toLowerCase();
        if (
          desc.includes("frais") ||
          desc.includes("agios") ||
          desc.includes("fee") ||
          desc.includes("commission") ||
          desc.includes("taxe") ||
          desc.includes("service charge")
        ) {
          unrecordedBankFeesCents += Math.abs(line.amountCents);
        }
      }
    });

    const validLinesCount = updatedLines.filter((l) => !l.isInvalid && l.reconciliationStatus !== "IGNORED").length;
    const unreconciledCount = validLinesCount - reconciledCount;

    const unexplainedDifferenceCents =
      reconciliation.discrepancyDeltaCents +
      reconciliation.breakdown.depositsInTransitCents -
      reconciliation.breakdown.outstandingChecksCents +
      unrecordedBankFeesCents;

    const updatedBreakdown: BankReconciliationBreakdown = {
      ...reconciliation.breakdown,
      unrecordedBankFeesCents,
      disputedItemsCents,
      unexplainedDifferenceCents,
    };

    return {
      ...reconciliation,
      statementLines: updatedLines,
      reconciledCount,
      unreconciledCount,
      isBalanced: unexplainedDifferenceCents === 0,
      status: unexplainedDifferenceCents === 0 ? "COMPLETED" : "IN_PROGRESS",
      breakdown: updatedBreakdown,
    };
  }

  /**
   * Manually matches a statement line to a transaction.
   */
  public static manualMatchLine(
    reconciliation: BankReconciliation,
    statementLineId: string,
    transactionId: string
  ): BankReconciliation {
    const updatedLines = reconciliation.statementLines.map((line) => {
      if (line.id === statementLineId) {
        return {
          ...line,
          matchedTransactionId: transactionId,
          reconciliationStatus: "MANUAL_MATCH" as const,
          matchConfidenceScore: 100,
        };
      }
      return line;
    });

    return BankReconciliationEngine.recalculateSession(reconciliation, updatedLines);
  }

  /**
   * Manually unmatches a statement line.
   */
  public static manualUnmatchLine(
    reconciliation: BankReconciliation,
    statementLineId: string
  ): BankReconciliation {
    const updatedLines = reconciliation.statementLines.map((line) => {
      if (line.id === statementLineId) {
        return {
          ...line,
          matchedTransactionId: undefined,
          reconciliationStatus: "UNMATCHED" as const,
          matchConfidenceScore: 0,
        };
      }
      return line;
    });

    return BankReconciliationEngine.recalculateSession(reconciliation, updatedLines);
  }

  /**
   * Marks a statement line as disputed.
   */
  public static markLineDisputed(
    reconciliation: BankReconciliation,
    statementLineId: string,
    reason?: string
  ): BankReconciliation {
    const updatedLines = reconciliation.statementLines.map((line) => {
      if (line.id === statementLineId) {
        return {
          ...line,
          reconciliationStatus: "DISPUTED" as const,
          validationError: reason || "Line marked as disputed",
        };
      }
      return line;
    });

    return BankReconciliationEngine.recalculateSession(reconciliation, updatedLines);
  }
}
