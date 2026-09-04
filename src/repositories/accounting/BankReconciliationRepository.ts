import { collection, query, where, getDocs, doc, setDoc, limit } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { BankReconciliation } from "../../types/accounting";

export const BankReconciliationRepository = {
  /**
   * Saves a bank reconciliation session to Firestore.
   */
  async save(reconciliation: BankReconciliation): Promise<void> {
    const path = `bank_reconciliations/${reconciliation.id}`;
    try {
      const docRef = doc(db, "bank_reconciliations", reconciliation.id);
      await setDoc(docRef, reconciliation, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  /**
   * Retrieves bank reconciliations for a business.
   */
  async listByBusiness(businessId: string, limitCount: number = 20): Promise<BankReconciliation[]> {
    if (!businessId) return [];
    const path = "bank_reconciliations";
    try {
      const q = query(
        collection(db, "bank_reconciliations"),
        where("businessId", "==", businessId),
        limit(limitCount)
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as BankReconciliation);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  }
};
