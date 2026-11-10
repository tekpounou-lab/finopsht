import { db } from "../lib/firebase";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit
} from "firebase/firestore";
import { CustomerTransfer } from "../types/cashManagement";

export class CustomerTransferRepository {
  private static COLLECTION = "customer_transfers";

  static async getByReference(business_id: string, reference: string): Promise<CustomerTransfer | null> {
    if (!db || !business_id || !reference) return null;
    try {
      const q = query(
        collection(db, this.COLLECTION),
        where("business_id", "==", business_id),
        where("reference", "==", reference.trim().toUpperCase()),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) return null;
      const doc = snap.docs[0];
      return { id: doc.id, ...doc.data() } as CustomerTransfer;
    } catch (err) {
      console.error("Firestore getByReference error:", err);
      return null;
    }
  }

  static async getById(id: string): Promise<CustomerTransfer | null> {
    if (!db || !id) return null;
    try {
      const ref = doc(db, this.COLLECTION, id);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as CustomerTransfer;
    } catch (err) {
      console.error("Firestore getById error:", err);
      return null;
    }
  }

  static async save(transfer: CustomerTransfer): Promise<void> {
    if (!db || !transfer.id) return;
    try {
      const ref = doc(db, this.COLLECTION, transfer.id);
      await setDoc(ref, transfer, { merge: true });
    } catch (err) {
      console.error("Firestore save customer transfer error:", err);
      throw err;
    }
  }

  static async getRecent(business_id: string, count: number = 20): Promise<CustomerTransfer[]> {
    if (!db || !business_id) return [];
    try {
      const q = query(
        collection(db, this.COLLECTION),
        where("business_id", "==", business_id),
        orderBy("created_at", "desc"),
        limit(count)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomerTransfer));
    } catch (err) {
      console.error("Firestore getRecent customer transfers error:", err);
      return [];
    }
  }
}
