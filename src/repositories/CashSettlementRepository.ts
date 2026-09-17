import { db } from "../lib/firebase";
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  query, 
  where 
} from "firebase/firestore";
import { CashSettlement } from "../types/cash-basis";

export class CashSettlementRepository {
  static async getByBusiness(businessId: string): Promise<CashSettlement[]> {
    if (!db) {
      return this.getMockSettlements(businessId);
    }
    try {
      const q = query(collection(db, "cash_settlements"), where("business_id", "==", businessId));
      const snap = await getDocs(q);
      if (snap.empty) {
        return this.getMockSettlements(businessId);
      }
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as CashSettlement));
    } catch (err) {
      console.warn("Firestore cash_settlements read fallback to mock", err);
      return this.getMockSettlements(businessId);
    }
  }

  static async save(settlement: CashSettlement): Promise<void> {
    if (!db) return;
    try {
      const ref = doc(db, "cash_settlements", settlement.id);
      await setDoc(ref, settlement, { merge: true });
    } catch (err) {
      console.error("Error saving cash settlement", err);
    }
  }

  private static getMockSettlements(businessId: string): CashSettlement[] {
    return [
      {
        id: `cs_${businessId}_1`,
        business_id: businessId,
        date: "2026-09-02",
        type: "CASH_IN",
        amount_cents: 25000000, // 250,000 HTG
        currency: "HTG",
        method: "BANK_TRANSFER",
        reference: "VIR-SOG-8841",
        category: "SALES_COLLECTION",
        created_at: "2026-09-02T10:00:00Z",
        created_by: "System"
      },
      {
        id: `cs_${businessId}_2`,
        business_id: businessId,
        date: "2026-09-05",
        type: "CASH_IN",
        amount_cents: 23500000, // 235,000 HTG
        currency: "HTG",
        method: "MOBILE_MONEY",
        reference: "MONCASH-9912",
        category: "SALES_COLLECTION",
        created_at: "2026-09-05T14:30:00Z",
        created_by: "System"
      },
      {
        id: `cs_${businessId}_3`,
        business_id: businessId,
        date: "2026-09-10",
        type: "CASH_OUT",
        amount_cents: 14500000, // 145,000 HTG payroll paid
        currency: "HTG",
        method: "BANK_TRANSFER",
        reference: "PAYROLL-SEP-26",
        category: "PAYROLL_PAYMENT",
        created_at: "2026-09-10T09:15:00Z",
        created_by: "System"
      },
      {
        id: `cs_${businessId}_4`,
        business_id: businessId,
        date: "2026-09-12",
        type: "CASH_OUT",
        amount_cents: 8200000, // 82,000 HTG supplier paid
        currency: "HTG",
        method: "CASH",
        reference: "SUPPLIER-INV-44",
        category: "SUPPLIER_PAYMENT",
        created_at: "2026-09-12T11:00:00Z",
        created_by: "System"
      }
    ];
  }
}
