import { db } from "../../../lib/firebase";
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  writeBatch 
} from "firebase/firestore";
import { MetricRegistry } from "../../observability/MetricRegistry";

export interface SnapshotPrunePolicy {
  retentionDays: number;        // Default 30 days retention for snapshots
  dailyRetentionDays: number;   // 30 days
  weeklyRetentionDays: number;  // 90 days
  // Monthly / Fiscal / Annual snapshots are preserved indefinitely
}

export const DEFAULT_RETENTION_POLICY: SnapshotPrunePolicy = {
  retentionDays: 30,
  dailyRetentionDays: 30,
  weeklyRetentionDays: 90,
};

export class SnapshotRetentionManager {
  private static instance: SnapshotRetentionManager;
  private daemonTimer: any = null;

  private constructor() {}

  public static getInstance(): SnapshotRetentionManager {
    if (!SnapshotRetentionManager.instance) {
      SnapshotRetentionManager.instance = new SnapshotRetentionManager();
    }
    return SnapshotRetentionManager.instance;
  }

  /**
   * Evaluates snapshot retention criteria:
   * - metric_snapshots & daily snapshots older than 30 days => Delete
   * - Weekly snapshots older than 90 days => Delete
   * - Monthly / Fiscal / Annual snapshots => Keep permanently
   */
  public isSnapshotExpired(
    generatedAtStr: string | number, 
    periodStr: string = "DAILY", 
    policy: SnapshotPrunePolicy = DEFAULT_RETENTION_POLICY
  ): boolean {
    let timestampMs: number;
    if (typeof generatedAtStr === "number") {
      timestampMs = generatedAtStr;
    } else {
      const snapDate = new Date(generatedAtStr);
      if (isNaN(snapDate.getTime())) return false;
      timestampMs = snapDate.getTime();
    }

    const ageInDays = (Date.now() - timestampMs) / (1000 * 60 * 60 * 24);
    const normalizedPeriod = String(periodStr).toUpperCase();

    // Monthly, Fiscal, Annual, Custom, or Lifetime are kept permanently
    if (
      normalizedPeriod.includes("MONTH") || 
      normalizedPeriod.includes("FISCAL") || 
      normalizedPeriod.includes("YEAR") ||
      normalizedPeriod.includes("ANNUAL") ||
      normalizedPeriod === "THIS_MONTH" ||
      normalizedPeriod === "LAST_MONTH"
    ) {
      return false;
    }

    // Weekly snapshots retention (90 days)
    if (normalizedPeriod.includes("WEEK") || normalizedPeriod === "7D") {
      return ageInDays > policy.weeklyRetentionDays;
    }

    // Default snapshot & metric retention (30 days)
    return ageInDays > (policy.retentionDays || policy.dailyRetentionDays || 30);
  }

  /**
   * Sweeps and prunes expired snapshots across all metric and performance snapshot collections.
   */
  public async purgeExpiredSnapshots(
    businessId: string = "biz_default", 
    policy: SnapshotPrunePolicy = DEFAULT_RETENTION_POLICY
  ): Promise<{ purgedCount: number; scannedCount: number; collectionsProcessed: string[] }> {
    console.log(`[SnapshotRetention] Starting 30-day snapshot retention sweep for tenant ${businessId}...`);
    let purgedCount = 0;
    let scannedCount = 0;

    const collectionsToPrune = [
      "metric_snapshots",
      "analytics_snapshots",
      "employee_performance_snapshots",
      "department_performance_snapshots",
      "branch_performance_snapshots",
      "business_performance_snapshots",
      "workforce_snapshots"
    ];

    for (const colName of collectionsToPrune) {
      try {
        const colRef = collection(db, colName);

        const q1 = query(colRef, where("businessId", "==", businessId));
        const q2 = query(colRef, where("business_id", "==", businessId));

        const [snap1, snap2] = await Promise.all([
          getDocs(q1).catch(() => null),
          getDocs(q2).catch(() => null)
        ]);

        const allDocs = new Map<string, any>();
        snap1?.docs.forEach(d => allDocs.set(d.id, d));
        snap2?.docs.forEach(d => allDocs.set(d.id, d));

        if (allDocs.size === 0) continue;

        let batch = writeBatch(db);
        let batchCount = 0;

        for (const [_, docSnap] of allDocs.entries()) {
          scannedCount++;
          const data = docSnap.data();
          const generatedAt = data.generatedAt || data.createdAt || data.timestamp || data._server_timestamp;
          const period = data.period || data.granularity || data.frequency || "DAILY";

          if (generatedAt && this.isSnapshotExpired(generatedAt, period, policy)) {
            batch.delete(docSnap.ref);
            purgedCount++;
            batchCount++;

            if (batchCount >= 450) {
              await batch.commit();
              batch = writeBatch(db);
              batchCount = 0;
            }
          }
        }

        if (batchCount > 0) {
          await batch.commit();
        }
      } catch (err: any) {
        console.warn(`[SnapshotRetention] Error sweeping collection ${colName}:`, err?.message || err);
      }
    }

    console.log(`[SnapshotRetention] 30-day Retention sweep complete for ${businessId}. Scanned: ${scannedCount}, Purged: ${purgedCount}.`);

    try {
      MetricRegistry.recordMetric({
        category: "firestore",
        name: "snapshots_pruned_total",
        value: purgedCount,
        unit: "count"
      });
    } catch {}

    return { purgedCount, scannedCount, collectionsProcessed: collectionsToPrune };
  }

  /**
   * Starts background daemon to execute periodic snapshot TTL rotation sweeps.
   */
  public startDaemon(
    businessId: string = "biz_default",
    intervalMs: number = 21600000, // 6 hours
    policy: SnapshotPrunePolicy = DEFAULT_RETENTION_POLICY
  ): void {
    if (this.daemonTimer) return;

    // Run initial sweep after 15 seconds
    setTimeout(() => {
      this.purgeExpiredSnapshots(businessId, policy).catch(err => {
        console.warn("[SnapshotRetention] Initial background sweep failed:", err);
      });
    }, 15000);

    // Schedule recurring sweeps
    this.daemonTimer = setInterval(() => {
      this.purgeExpiredSnapshots(businessId, policy).catch(err => {
        console.warn("[SnapshotRetention] Recurring background sweep failed:", err);
      });
    }, intervalMs);

    console.log(`[SnapshotRetention] Retention Daemon initialized. Interval: ${Math.round(intervalMs / 3600000)}h, Policy: 90d (Daily), 365d (Weekly).`);
  }

  public stopDaemon(): void {
    if (this.daemonTimer) {
      clearInterval(this.daemonTimer);
      this.daemonTimer = null;
      console.log("[SnapshotRetention] Retention Daemon stopped.");
    }
  }
}

export const SnapshotRetention = SnapshotRetentionManager.getInstance();
