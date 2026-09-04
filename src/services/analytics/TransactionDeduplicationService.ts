// src/services/analytics/TransactionDeduplicationService.ts
import { LedgerTransaction } from "../../types";
import { AnalyticsProcessedRepository } from "../../repositories/AnalyticsProcessedRepository";

export function sha256Sync(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57, h3 = 0xfae12012, h4 = 0x07a125b9;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
    h3 = Math.imul(h3 ^ ch, 3242174889);
    h4 = Math.imul(h4 ^ ch, 997334689);
  }
  const toHex = (n: number) => {
    return (n >>> 0).toString(16).padStart(8, "0");
  };
  const part1 = toHex(h1 ^ (h2 >>> 5));
  const part2 = toHex(h2 ^ (h3 << 3));
  const part3 = toHex(h3 ^ (h4 >>> 7));
  const part4 = toHex(h4 ^ (h1 << 9));
  const part5 = toHex(Math.imul(h1, h3) ^ h2);
  const part6 = toHex(Math.imul(h2, h4) ^ h3);
  const part7 = toHex(Math.imul(h3, h1) ^ h4);
  const part8 = toHex(Math.imul(h4, h2) ^ h1);
  return (part1 + part2 + part3 + part4 + part5 + part6 + part7 + part8).toLowerCase();
}

export class TransactionDeduplicationService {
  /**
   * Generates a unique deterministic signature (fingerprint) of the transaction.
   */
  public static generateTransactionFingerprint(transaction: LedgerTransaction): string {
    const businessId = transaction.business_id || (transaction as any).businessId || "";
    const transactionDate = transaction.date || "";
    const amount = transaction.amount || (transaction.amount_cents ? transaction.amount_cents / 100 : 0);
    const type = transaction.type || "";
    const employeeId = (transaction as any).employeeId || transaction.employee_id || "";
    const departmentId = (transaction as any).departmentId || transaction.department_id || "";
    
    const rawString = `${businessId}_${transactionDate}_${amount}_${type}_${employeeId}_${departmentId}`;
    return sha256Sync(rawString);
  }

  /**
   * Checks if a transaction signature has already been processed.
   */
  public static async isTransactionDuplicate(businessId: string, fingerprint: string): Promise<boolean> {
    // Check if any processed transaction has this fingerprint
    // For simplicity, we can load processed transaction signatures or maintain a lookup
    // Since isProcessed is usually mapped by ID, let's query the analytics_processed_transactions
    // collection to see if any doc contains this fingerprint.
    const path = "analytics_processed_transactions";
    try {
      const { db } = await import("../../lib/firebase");
      const { collection, query, where, getDocs, limit } = await import("firebase/firestore");
      const q = query(
        collection(db, path),
        where("businessId", "==", businessId),
        where("fingerprint", "==", fingerprint),
        limit(1)
      );
      const snap = await getDocs(q);
      return !snap.empty;
    } catch (e) {
      console.error("[TransactionDeduplicationService] Duplicate check failed:", e);
      return false;
    }
  }

  /**
   * Marks a transaction as processed with its generated fingerprint.
   */
  public static async markTransactionProcessed(
    businessId: string, 
    transactionId: string, 
    fingerprint: string
  ): Promise<void> {
    await AnalyticsProcessedRepository.markProcessed(businessId, transactionId, fingerprint);
  }

  /**
   * Fetches processed transaction IDs for a date range.
   */
  public static async getProcessedTransactions(
    businessId: string, 
    startDate: string, 
    endDate: string
  ): Promise<string[]> {
    return AnalyticsProcessedRepository.getProcessedByDateRange(businessId, startDate, endDate);
  }
}
