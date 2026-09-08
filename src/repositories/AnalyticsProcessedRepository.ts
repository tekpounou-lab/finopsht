// src/repositories/AnalyticsProcessedRepository.ts
import { db } from "../lib/firebase";
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  query, 
  where, 
  deleteDoc,
  writeBatch
} from "firebase/firestore";
import { isQuotaExceededError } from "../utils/resilientFirestore";

export class AnalyticsProcessedRepository {
  static async markProcessed(
    businessId: string, 
    transactionId: string, 
    fingerprint: string
  ): Promise<void> {
    try {
      const docRef = doc(db, "analytics_processed_transactions", transactionId);
      await setDoc(docRef, {
        businessId,
        business_id: businessId,
        transactionId,
        fingerprint,
        processedAt: new Date().toISOString()
      });
    } catch (e) {
      if (isQuotaExceededError(e)) {
        console.warn("[AnalyticsProcessedRepository] Firestore quota limit exceeded on markProcessed. Gracefully recorded locally.");
        return;
      }
      throw e;
    }
  }

  static async isProcessed(businessId: string, transactionId: string): Promise<boolean> {
    try {
      const docRef = doc(db, "analytics_processed_transactions", transactionId);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) return false;
      const data = docSnap.data();
      return data.businessId === businessId || data.business_id === businessId;
    } catch (e) {
      if (isQuotaExceededError(e)) {
        console.warn("[AnalyticsProcessedRepository] Firestore quota limit exceeded on isProcessed. Falling back to false.");
        return false;
      }
      return false;
    }
  }

  static async getProcessedByDateRange(
    businessId: string, 
    startDate: string, 
    endDate: string
  ): Promise<string[]> {
    try {
      const q = query(
        collection(db, "analytics_processed_transactions"),
        where("businessId", "==", businessId)
      );
      const snap = await getDocs(q);
      const results: string[] = [];
      snap.forEach((doc) => {
        const data = doc.data();
        if (data.processedAt >= startDate && data.processedAt <= endDate) {
          results.push(doc.id);
        }
      });
      return results;
    } catch (e) {
      if (isQuotaExceededError(e)) {
        console.warn("[AnalyticsProcessedRepository] Firestore quota limit exceeded on getProcessedByDateRange. Returning empty array fallback.");
        return [];
      }
      return [];
    }
  }

  static async cleanupOldProcessed(businessId: string, olderThanDays: number): Promise<number> {
    try {
      const q = query(
        collection(db, "analytics_processed_transactions"),
        where("businessId", "==", businessId)
      );
      const snap = await getDocs(q);
      const cutOff = new Date();
      cutOff.setDate(cutOff.getDate() - olderThanDays);
      const cutOffStr = cutOff.toISOString();

      const batch = writeBatch(db);
      let count = 0;
      snap.forEach((doc) => {
        const data = doc.data();
        if (data.processedAt < cutOffStr) {
          batch.delete(doc.ref);
          count++;
        }
      });
      if (count > 0) {
        await batch.commit();
      }
      return count;
    } catch (e) {
      if (isQuotaExceededError(e)) {
        console.warn("[AnalyticsProcessedRepository] Firestore quota limit exceeded on cleanupOldProcessed.");
        return 0;
      }
      return 0;
    }
  }
}
