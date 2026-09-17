import { LedgerTransaction } from "../../types";

export interface LedgerAuditReport {
  isAuditClean: boolean;
  summary: {
    totalAnalyzed: number;
    duplicateCount: number;
    legacyKeyCount: number;
    unbalancedCount: number;
    missingAccountsCount: number;
  };
  details: {
    duplicateIds: string[];
    legacyKeyIds: string[];
    unbalancedIds: string[];
    missingAccountsIds: string[];
  };
}

export class HistoricalLedgerAuditService {
  /**
   * Performs forensic audit on historical ledger transactions to verify SSOT invariants.
   */
  public static auditLedgerTransactions(
    businessId: string,
    transactions: LedgerTransaction[]
  ): LedgerAuditReport {
    const bizTxs = transactions.filter((t) => {
      const bId = t.business_id || t.businessId;
      return !bId || bId === businessId;
    });

    const seenIds = new Set<string>();
    const duplicateIds = new Set<string>();
    const legacyKeyIds: string[] = [];
    const unbalancedIds: string[] = [];
    const missingAccountsIds: string[] = [];

    bizTxs.forEach((tx) => {
      // 1. Duplicate check
      if (seenIds.has(tx.id)) {
        duplicateIds.add(tx.id);
      } else {
        seenIds.add(tx.id);
      }

      // 2. Legacy key check (invoice-bound non-event key format, e.g. tx_pay_inv_123 without event sub-key)
      if (tx.id.startsWith("tx_pay_") && !tx.id.includes("_evt_") && !tx.id.includes("_payevt_")) {
        legacyKeyIds.push(tx.id);
      }

      // 3. Balance balance invariant (debit == credit)
      const debit = tx.debit_cents !== undefined ? tx.debit_cents / 100 : (tx.debit || tx.amount || 0);
      const credit = tx.credit_cents !== undefined ? tx.credit_cents / 100 : (tx.credit || tx.amount || 0);
      if (Math.abs(debit - credit) > 0.001) {
        unbalancedIds.push(tx.id);
      }

      // 4. Missing required accounts
      if (!tx.debit_account || !tx.credit_account) {
        missingAccountsIds.push(tx.id);
      }
    });

    const dupList = Array.from(duplicateIds);
    const isAuditClean =
      dupList.length === 0 &&
      legacyKeyIds.length === 0 &&
      unbalancedIds.length === 0 &&
      missingAccountsIds.length === 0;

    return {
      isAuditClean,
      summary: {
        totalAnalyzed: bizTxs.length,
        duplicateCount: dupList.length,
        legacyKeyCount: legacyKeyIds.length,
        unbalancedCount: unbalancedIds.length,
        missingAccountsCount: missingAccountsIds.length,
      },
      details: {
        duplicateIds: dupList,
        legacyKeyIds,
        unbalancedIds,
        missingAccountsIds,
      },
    };
  }
}
