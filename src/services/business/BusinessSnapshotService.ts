import { db } from "../../lib/firebase";
import { 
  doc, 
  getDoc, 
  getDocs, 
  collection, 
  setDoc,
  query,
  where
} from "firebase/firestore";
import { resilientGetDoc } from "../../utils/resilientFirestore";
import { BusinessSnapshot, Business, Branch, Department } from "../../types";

export class BusinessSnapshotService {
  /**
   * Builds a fresh BusinessSnapshot by aggregating all business data.
   */
  static async buildSnapshot(businessId: string): Promise<BusinessSnapshot> {
    console.log(`[Snapshot] Building fresh snapshot for ${businessId}`);
    
    // 1. Core Business Doc
    const bizDoc = await resilientGetDoc(doc(db, "businesses", businessId), { timeoutMs: 2500, maxRetries: 1, fallbackToCache: true, throwOnNetworkFailure: false });
    if (!bizDoc || !bizDoc.exists()) throw new Error("Business not found");
    const business = bizDoc.data() as Business;

    // 2. Organization structure
    const branchesSnap = await getDocs(query(collection(db, "branches"), where("business_id", "==", businessId)));
    const branches = branchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Branch));

    const deptsSnap = await getDocs(query(collection(db, "departments"), where("business_id", "==", businessId)));
    const departments = deptsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Department));

    // 3. Sub-configs
    const settingsDoc = await resilientGetDoc(doc(db, "business_settings", businessId), { timeoutMs: 2500, maxRetries: 1, fallbackToCache: true, throwOnNetworkFailure: false });
    const subDoc = await resilientGetDoc(doc(db, "subscriptions", businessId), { timeoutMs: 2500, maxRetries: 1, fallbackToCache: true, throwOnNetworkFailure: false });
    const flagsDoc = await resilientGetDoc(doc(db, "features", businessId), { timeoutMs: 2500, maxRetries: 1, fallbackToCache: true, throwOnNetworkFailure: false });

    // 4. Roles & Permissions
    const rolesSnap = await getDocs(query(collection(db, "roles"), where("business_id", "==", businessId)));
    const roles = rolesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const snapshot: BusinessSnapshot = {
      id: businessId,
      business,
      branches,
      departments,
      roles,
      permissions: [], // Derived matrix logic would go here
      featureFlags: flagsDoc && flagsDoc.exists() ? flagsDoc.data() || {} : {},
      subscription: subDoc && subDoc.exists() ? subDoc.data() || {} : {},
      timestamp: new Date().toISOString(),
      version: Date.now()
    };

    // Persist snapshot for fast loading
    await setDoc(doc(db, "business_snapshots", businessId), snapshot);
    
    return snapshot;
  }

  /**
   * Retrieves the current snapshot for a business.
   */
  static async getSnapshot(businessId: string): Promise<BusinessSnapshot | null> {
    const snapDoc = await resilientGetDoc(doc(db, "business_snapshots", businessId), { timeoutMs: 2500, maxRetries: 1, fallbackToCache: true, throwOnNetworkFailure: false });
    if (snapDoc && snapDoc.exists()) {
      return snapDoc.data() as BusinessSnapshot;
    }
    return null;
  }
}
