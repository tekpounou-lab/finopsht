import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { PerformanceService } from "../performance/PerformanceService";

export interface LedgerQueryOptions {
  startDate?: string;
  endDate?: string;
  limitTo?: number;
}

export class AccountingQueryService {
  /**
   * Queries General Ledger transactions for a business. Note: Financial transactions are mutable and never cached in memory per compliance rules.
   */
  public static async queryLedgerTransactions(
    businessId: string,
    options: LedgerQueryOptions = {}
  ): Promise<any[]> {
    if (!businessId) return [];

    return PerformanceService.trackExecution("query", `LedgerTransactions:${businessId}`, async () => {
      const path = `ledger_transactions`;
      try {
        const constraints: any[] = [where("business_id", "==", businessId)];

        if (options.limitTo) {
          constraints.push(limit(options.limitTo));
        }

        const q = query(collection(db, "ledger_transactions"), ...constraints);
        const snap = await getDocs(q);
        const txs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        if (options.startDate && options.endDate) {
          const start = new Date(options.startDate).getTime();
          const end = new Date(options.endDate).getTime();

          return txs.filter((tx: any) => {
            const date = new Date(tx.transactionDate || tx.date || tx.createdAt).getTime();
            return !isNaN(date) && date >= start && date <= end;
          });
        }

        return txs;
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, path);
        return [];
      }
    });
  }
}
