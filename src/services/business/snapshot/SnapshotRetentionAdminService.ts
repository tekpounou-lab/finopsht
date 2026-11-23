import { getAdminFirestore } from "../../../lib/firebaseAdmin";

export interface SnapshotPrunePolicy {
  retentionDays: number;
  dailyRetentionDays: number;
  weeklyRetentionDays: number;
}

export const DEFAULT_RETENTION_POLICY: SnapshotPrunePolicy = {
  retentionDays: 30,
  dailyRetentionDays: 30,
  weeklyRetentionDays: 90
};

const SNAPSHOT_COLLECTIONS_TO_PRUNE = [
  "metric_snapshots",
  "analytics_snapshots",
  "employee_performance_snapshots",
  "department_performance_snapshots",
  "branch_performance_snapshots",
  "business_performance_snapshots",
  "workforce_snapshots"
];

export function isSnapshotExpired(
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

  if (normalizedPeriod.includes("WEEK") || normalizedPeriod === "7D") {
    return ageInDays > policy.weeklyRetentionDays;
  }

  return ageInDays > (policy.retentionDays || policy.dailyRetentionDays || 30);
}

/**
 * Server-only Admin SDK Snapshot Retention Service.
 * Zero browser Firebase SDK or import.meta.env dependencies.
 */
export async function purgeExpiredSnapshotsWithAdmin(
  businessId: string,
  policy: SnapshotPrunePolicy = DEFAULT_RETENTION_POLICY,
  adminDb?: any
): Promise<{ purgedCount: number; scannedCount: number; collectionsProcessed: string[] }> {
  const trimmedBiz = typeof businessId === "string" ? businessId.trim() : "";
  if (
    !trimmedBiz ||
    ["none", "default", "biz_default", "demo", "biz_demo"].includes(trimmedBiz.toLowerCase())
  ) {
    throw new Error("MISSING_TENANT_CONTEXT");
  }

  const resolvedAdminDb = adminDb || getAdminFirestore();
  let purgedCount = 0;
  let scannedCount = 0;

  for (const colName of SNAPSHOT_COLLECTIONS_TO_PRUNE) {
    const colRef = resolvedAdminDb.collection(colName);
    const subColRef = resolvedAdminDb.collection(`businesses/${trimmedBiz}/${colName}`);
    const [snap1, snap2, subSnap] = await Promise.all([
      colRef.where("businessId", "==", trimmedBiz).get(),
      colRef.where("business_id", "==", trimmedBiz).get(),
      typeof subColRef?.get === "function" ? subColRef.get() : Promise.resolve({ docs: [] })
    ]);

    const allDocs = new Map<string, { snap: any; path: string }>();
    snap1?.docs?.forEach((d: any) =>
      allDocs.set(`${colName}/${d.id}`, { snap: d, path: `${colName}/${d.id}` })
    );
    snap2?.docs?.forEach((d: any) =>
      allDocs.set(`${colName}/${d.id}`, { snap: d, path: `${colName}/${d.id}` })
    );
    subSnap?.docs?.forEach((d: any) =>
      allDocs.set(`businesses/${trimmedBiz}/${colName}/${d.id}`, {
        snap: d,
        path: `businesses/${trimmedBiz}/${colName}/${d.id}`
      })
    );

    for (const [docPath, entry] of allDocs.entries()) {
      const docSnap = entry.snap;
      const data = typeof docSnap.data === "function" ? docSnap.data() : docSnap;
      const b1 = typeof data?.businessId === "string" ? data.businessId.trim() : "";
      const b2 = typeof data?.business_id === "string" ? data.business_id.trim() : "";
      if (b1 && b2 && b1 !== b2) {
        const err: any = new Error("TENANT_ISOLATION_VIOLATION");
        err.code = "TENANT_ISOLATION_VIOLATION";
        throw err;
      }
      const docBiz = b1 || b2 || (docPath.startsWith(`businesses/${trimmedBiz}/`) ? trimmedBiz : "");
      if (docBiz !== trimmedBiz) {
        continue;
      }

      scannedCount++;
      const generatedAt =
        data.generatedAt || data.createdAt || data.timestamp || data._server_timestamp;
      const period = data.period || data.granularity || data.frequency || "DAILY";

      if (generatedAt && isSnapshotExpired(generatedAt, period, policy)) {
        if (typeof docSnap.ref?.delete === "function") {
          await docSnap.ref.delete();
        } else {
          const targetRef = resolvedAdminDb.doc(docPath);
          if (typeof targetRef.delete === "function") {
            await targetRef.delete();
          }
        }
        purgedCount++;
      }
    }
  }

  return {
    purgedCount,
    scannedCount,
    collectionsProcessed: SNAPSHOT_COLLECTIONS_TO_PRUNE
  };
}
