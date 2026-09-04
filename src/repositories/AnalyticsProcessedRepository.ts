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
  orderBy, 
  deleteDoc,
  writeBatch
} from "firebase/firestore";

export class AnalyticsProcessedRepository {
  static async markProcessed(
    businessId: string, 
    transactionId: string, 
    fingerprint: string
  ): Promise<void> {
    const docRef = doc(db, "analytics_processed_transactions", transactionId);
    await setDoc(docRef, {
      businessId,
      business_id: businessId,
      transactionId,
      fingerprint,
      processedAt: new Date().toISOString()
    });
  }

  static async isProcessed(businessId: string, transactionId: string): Promise<boolean> {
    const docRef = doc(db, "analytics_processed_transactions", transactionId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return false;
    const data = docSnap.data();
    return data.businessId === businessId || data.business_id === businessId;
  }

  static async getProcessedByDateRange(
    businessId: string, 
    startDate: string, 
    endDate: string
  ): Promise<string[]> {
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
  }

  static async cleanupOldProcessed(businessId: string, olderThanDays: number): Promise<number> {
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
  }
}
