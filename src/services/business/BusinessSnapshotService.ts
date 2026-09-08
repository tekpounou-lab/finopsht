import { db } from "../../lib/firebase";
import { 
  doc, 
  collection, 
  setDoc,
  query,
  where
} from "firebase/firestore";
import { resilientGetDoc, resilientGetDocs } from "../../utils/resilientFirestore";
import { BusinessSnapshot, Business, Branch, Department } from "../../types";

export class BusinessSnapshotService {
  private static memoryCache: Map<string, BusinessSnapshot> = new Map();

  /**
   * Builds a fresh BusinessSnapshot by aggregating all business data with cache resiliency.
   */
  static async buildSnapshot(businessId: string): Promise<BusinessSnapshot> {
    console.log(`[Snapshot] Building resilient snapshot for ${businessId}`);
    
    try {
      // 1. Core Business Doc
      let business: Business;
      try {
        const bizDoc = await resilientGetDoc(doc(db, "businesses", businessId), {
          timeoutMs: 2500,
          maxRetries: 1,
          fallbackToCache: true,
          throwOnNetworkFailure: false
        });
        business = bizDoc?.exists() ? (bizDoc.data() as Business) : ({ id: businessId, name: "Enterprise" } as Business);
      } catch (bizErr) {
        console.warn("[Snapshot] Could not fetch business doc, using fallback:", bizErr);
        business = { id: businessId, name: "Enterprise" } as Business;
      }

      // 2. Organization structure (using resilientGetDocs with cache fallback)
      let branches: Branch[] = [];
      try {
        const branchesSnap = await resilientGetDocs(
          query(collection(db, "branches"), where("business_id", "==", businessId)),
          `branches_${businessId}`,
          { fallbackToCache: true, throwOnNetworkFailure: false }
        );
        branches = branchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Branch));
      } catch (brErr) {
        console.warn("[Snapshot] Non-fatal branches fetch issue:", brErr);
      }

      let departments: Department[] = [];
      try {
        const deptsSnap = await resilientGetDocs(
          query(collection(db, "departments"), where("business_id", "==", businessId)),
          `depts_${businessId}`,
          { fallbackToCache: true, throwOnNetworkFailure: false }
        );
        departments = deptsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Department));
      } catch (deptErr) {
        console.warn("[Snapshot] Non-fatal departments fetch issue:", deptErr);
      }

      // 3. Sub-configs
      let featureFlags = {};
      try {
        const flagsDoc = await resilientGetDoc(doc(db, "features", businessId), {
          timeoutMs: 2000,
          maxRetries: 1,
          fallbackToCache: true,
          throwOnNetworkFailure: false
        });
        if (flagsDoc?.exists()) featureFlags = flagsDoc.data() || {};
      } catch (e) {
        console.warn("[Snapshot] Features fetch skipped:", e);
      }

      let subscription = {};
      try {
        const subDoc = await resilientGetDoc(doc(db, "subscriptions", businessId), {
          timeoutMs: 2000,
          maxRetries: 1,
          fallbackToCache: true,
          throwOnNetworkFailure: false
        });
        if (subDoc?.exists()) subscription = subDoc.data() || {};
      } catch (e) {
        console.warn("[Snapshot] Subscription fetch skipped:", e);
      }

      // 4. Roles & Permissions
      let roles: any[] = [];
      try {
        const rolesSnap = await resilientGetDocs(
          query(collection(db, "roles"), where("business_id", "==", businessId)),
          `roles_${businessId}`,
          { fallbackToCache: true, throwOnNetworkFailure: false }
        );
        roles = rolesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (roleErr) {
        console.warn("[Snapshot] Non-fatal roles fetch issue:", roleErr);
      }

      const snapshot: BusinessSnapshot = {
        id: businessId,
        business,
        branches,
        departments,
        roles,
        permissions: [],
        featureFlags,
        subscription,
        timestamp: new Date().toISOString(),
        version: Date.now()
      };

      // Store in memory cache for instant fallback
      this.memoryCache.set(businessId, snapshot);

      // Attempt to persist snapshot for fast loading, ignore quota/write errors
      try {
        await setDoc(doc(db, "business_snapshots", businessId), snapshot, { merge: true });
      } catch (persistErr) {
        console.warn("[Snapshot] Could not persist snapshot to Firestore (continuing with cached state):", persistErr);
      }
      
      return snapshot;
    } catch (globalErr) {
      console.warn("[Snapshot] buildSnapshot fallback triggered due to error:", globalErr);
      const existing = this.memoryCache.get(businessId);
      if (existing) return existing;
      
      return {
        id: businessId,
        business: { id: businessId, name: "Enterprise" } as Business,
        branches: [],
        departments: [],
        roles: [],
        permissions: [],
        featureFlags: {},
        subscription: {},
        timestamp: new Date().toISOString(),
        version: Date.now()
      };
    }
  }

  /**
   * Retrieves the current snapshot for a business.
   */
  static async getSnapshot(businessId: string): Promise<BusinessSnapshot | null> {
    if (this.memoryCache.has(businessId)) {
      return this.memoryCache.get(businessId)!;
    }
    try {
      const snapDoc = await resilientGetDoc(doc(db, "business_snapshots", businessId), {
        timeoutMs: 2500,
        maxRetries: 1,
        fallbackToCache: true,
        throwOnNetworkFailure: false
      });
      if (snapDoc && snapDoc.exists()) {
        const data = snapDoc.data() as BusinessSnapshot;
        this.memoryCache.set(businessId, data);
        return data;
      }
    } catch (err) {
      console.warn("[Snapshot] getSnapshot fallback:", err);
    }
    return null;
  }
}
