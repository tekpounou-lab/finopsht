
import { auth, db, handleFirestoreError, logFirestoreError, OperationType, withFirestoreRetry } from "../../../lib/firebase";
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  getDoc, 
  query, 
  where, 
  getDocs 
} from "firebase/firestore";
import { ApprovalInstance, ApprovalPolicy } from "./types";
import { CacheInvalidationService } from "../../../services/performance/CacheInvalidationService";

export class ApprovalRepository {
  private static INSTANCE_COLLECTION = "approval_instances";
  private static POLICY_COLLECTION = "approval_policies";
  private static cache = new Map<string, { data: any; timestamp: number }>();
  private static CACHE_TTL_MS = 30000;

  public static invalidateCache(): void {
    this.cache.clear();
  }

  static async saveInstance(instance: ApprovalInstance): Promise<void> {
    if (!auth.currentUser || !instance?.id || !instance?.businessId) {
      return;
    }
    const path = `${this.INSTANCE_COLLECTION}/${instance.id}`;
    const payload = {
      ...instance,
      business_id: instance.businessId || (instance as any).business_id,
      businessId: instance.businessId || (instance as any).business_id,
      updatedAt: new Date().toISOString()
    };
    try {
      await withFirestoreRetry(
        () => setDoc(doc(db, this.INSTANCE_COLLECTION, instance.id), payload),
        { tag: "ApprovalRepository.saveInstance" }
      );
      this.invalidateCache();
      CacheInvalidationService.sweepLocal(instance.businessId);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  static async getInstance(id: string): Promise<ApprovalInstance | null> {
    if (!id) {
      return null;
    }
    const cacheKey = `appr_${id}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const snap = await withFirestoreRetry(
        () => getDoc(doc(db, this.INSTANCE_COLLECTION, id)),
        { tag: "ApprovalRepository.getInstance" }
      );
      if (!snap.exists()) return null;
      const data = snap.data() as ApprovalInstance;
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      logFirestoreError(error, OperationType.GET, `${this.INSTANCE_COLLECTION}/${id}`);
      return null;
    }
  }

  static async findPolicy(businessId: string, entityType: string): Promise<ApprovalPolicy | null> {
    if (!businessId || !entityType) {
      return null;
    }
    const cacheKey = `pol_${businessId}_${entityType}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const q = query(
        collection(db, this.POLICY_COLLECTION),
        where("businessId", "==", businessId),
        where("entityType", "==", entityType)
      );
      const snap = await withFirestoreRetry(
        () => getDocs(q),
        { tag: "ApprovalRepository.findPolicy" }
      );
      if (snap.empty) return null;
      const data = snap.docs[0].data() as ApprovalPolicy;
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      logFirestoreError(error, OperationType.GET, this.POLICY_COLLECTION);
      return null;
    }
  }

  static async updateInstance(id: string, updates: Partial<ApprovalInstance>): Promise<void> {
    if (!auth.currentUser || !id) {
      return;
    }
    const path = `${this.INSTANCE_COLLECTION}/${id}`;
    try {
      await withFirestoreRetry(
        () => updateDoc(doc(db, this.INSTANCE_COLLECTION, id), {
          ...updates,
          updatedAt: new Date().toISOString()
        }),
        { tag: "ApprovalRepository.updateInstance" }
      );
      this.invalidateCache();
      if (updates.businessId) {
        CacheInvalidationService.sweepLocal(updates.businessId);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  // Idempotent policy seeding
  static async seedPolicy(policy: ApprovalPolicy): Promise<void> {
    if (!auth.currentUser) {
      return;
    }
    const path = `${this.POLICY_COLLECTION}/${policy.id}`;
    try {
      const existing = await this.findPolicy(policy.businessId, policy.entityType);
      if (!existing) {
        await withFirestoreRetry(
          () => setDoc(doc(db, this.POLICY_COLLECTION, policy.id), policy),
          { tag: "ApprovalRepository.seedPolicy" }
        );
        this.invalidateCache();
        CacheInvalidationService.sweepLocal(policy.businessId);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
}

