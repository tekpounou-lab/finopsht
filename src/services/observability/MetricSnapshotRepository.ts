import { db } from "../../lib/firebase";
import { collection, addDoc, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { SystemSnapshot } from "./MetricRegistry";

class MetricSnapshotRepositoryClass {
  private localSnapshots: SystemSnapshot[] = [];

  /**
   * Persists a system snapshot locally and to Firestore for long-term trends.
   */
  public async saveSnapshot(businessId: string, snapshot: SystemSnapshot): Promise<void> {
    this.localSnapshots.push(snapshot);
    if (this.localSnapshots.length > 100) {
      this.localSnapshots.shift();
    }

    if (!businessId) return;

    try {
      const snapRef = collection(db, "businesses", businessId, "metric_snapshots");
      await addDoc(snapRef, {
        ...snapshot,
        business_id: businessId,
        createdAt: snapshot.timestamp
      });
    } catch (e) {
      // Graceful fallback to memory if offline or permissions restricted
      console.warn("[MetricSnapshotRepository] Persisting snapshot to Firestore deferred:", e);
    }
  }

  /**
   * Fetches historical snapshot records for trend charts.
   */
  public async getHistoricalSnapshots(businessId: string, maxCount = 20): Promise<SystemSnapshot[]> {
    if (!businessId) {
      return [...this.localSnapshots].slice(-maxCount);
    }

    try {
      const snapRef = collection(db, "businesses", businessId, "metric_snapshots");
      const q = query(snapRef, orderBy("createdAt", "desc"), limit(maxCount));
      const snap = await getDocs(q);

      const list: SystemSnapshot[] = [];
      snap.forEach(docSnap => {
        list.push(docSnap.data() as SystemSnapshot);
      });

      if (list.length > 0) {
        return list.reverse();
      }
    } catch (e) {
      console.warn("[MetricSnapshotRepository] Historical fetch fallback to local memory:", e);
    }

    return [...this.localSnapshots].slice(-maxCount);
  }
}

export const MetricSnapshotRepository = new MetricSnapshotRepositoryClass();
