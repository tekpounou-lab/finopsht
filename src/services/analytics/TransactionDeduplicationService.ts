// src/services/analytics/TransactionDeduplicationService.ts
import { LedgerTransaction } from "../../types";
import { AnalyticsProcessedRepository } from "../../repositories/AnalyticsProcessedRepository";
import { isQuotaExceededError } from "../../utils/resilientFirestore";

// In-memory session set of processed fingerprints to ensure continuous duplicate prevention
// even when Firestore read operations hit daily quota limits.
const sessionProcessedFingerprints = new Set<string>();

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
    const key = `${businessId}_${fingerprint}`;
    if (sessionProcessedFingerprints.has(key)) {
      return true;
    }

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
      const exists = !snap.empty;
      if (exists) {
        sessionProcessedFingerprints.add(key);
      }
      return exists;
    } catch (e: any) {
      if (isQuotaExceededError(e)) {
        console.warn("[TransactionDeduplicationService] Quota limit exceeded for Firestore reads. Falling back to local session cache.");
        return sessionProcessedFingerprints.has(key);
      }
      console.warn("[TransactionDeduplicationService] Duplicate check notice:", e?.message || e);
      return sessionProcessedFingerprints.has(key);
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
    const key = `${businessId}_${fingerprint}`;
    sessionProcessedFingerprints.add(key);
    try {
      await AnalyticsProcessedRepository.markProcessed(businessId, transactionId, fingerprint);
    } catch (e: any) {
      if (isQuotaExceededError(e)) {
        console.warn("[TransactionDeduplicationService] Quota limit exceeded on markTransactionProcessed. Recorded locally in session cache.");
        return;
      }
      console.warn("[TransactionDeduplicationService] markProcessed warning:", e?.message || e);
    }
  }

  /**
   * Fetches processed transaction IDs for a date range.
   */
  public static async getProcessedTransactions(
    businessId: string, 
    startDate: string, 
    endDate: string
  ): Promise<string[]> {
    try {
      return await AnalyticsProcessedRepository.getProcessedByDateRange(businessId, startDate, endDate);
    } catch (e: any) {
      if (isQuotaExceededError(e)) {
        console.warn("[TransactionDeduplicationService] Quota limit exceeded on getProcessedTransactions. Returning empty array.");
        return [];
      }
      return [];
    }
  }
}
