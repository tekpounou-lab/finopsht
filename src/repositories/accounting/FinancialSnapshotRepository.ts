import { collection, query, where, getDocs, doc, setDoc, limit, orderBy } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { FinancialSnapshot } from "../../types/accounting";

export const FinancialSnapshotRepository = {
  /**
   * Saves a financial snapshot to Firestore.
   */
  async save(snapshot: FinancialSnapshot): Promise<void> {
    const path = `financial_snapshots/${snapshot.id}`;
    try {
      const docRef = doc(db, "financial_snapshots", snapshot.id);
      await setDoc(docRef, snapshot, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  /**
   * Retrieves snapshots for a business.
   */
  async listByBusiness(businessId: string, limitCount: number = 20): Promise<FinancialSnapshot[]> {
    if (!businessId) return [];
    const path = "financial_snapshots";
    try {
      const q = query(
        collection(db, "financial_snapshots"),
        where("businessId", "==", businessId),
        limit(limitCount)
      );
      const snap = await getDocs(q);
      const items = snap.docs.map((d) => d.data() as FinancialSnapshot);
      return items.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  /**
   * Retrieves latest snapshot for a business.
   */
  async getLatest(businessId: string): Promise<FinancialSnapshot | null> {
    const items = await this.listByBusiness(businessId, 1);
    return items.length > 0 ? items[0] : null;
  }
};
