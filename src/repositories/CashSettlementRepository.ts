import { db } from "../lib/firebase";
import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  query, 
  where 
} from "firebase/firestore";
import { CashSettlement } from "../types/cash-basis";

export class CashSettlementRepository {
  static async getByBusiness(businessId: string): Promise<CashSettlement[]> {
    if (!db || !businessId) {
      return [];
    }
    try {
      const q = query(collection(db, "cash_settlements"), where("business_id", "==", businessId));
      const snap = await getDocs(q);
      if (snap.empty) {
        return [];
      }
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as CashSettlement));
    } catch (err) {
      console.error("Firestore cash_settlements read error:", err);
      return [];
    }
  }

  static async save(settlement: CashSettlement): Promise<void> {
    if (!db || !settlement.id) return;
    try {
      const ref = doc(db, "cash_settlements", settlement.id);
      await setDoc(ref, settlement, { merge: true });
    } catch (err) {
      console.error("Error saving cash settlement:", err);
      throw err;
    }
  }
}
