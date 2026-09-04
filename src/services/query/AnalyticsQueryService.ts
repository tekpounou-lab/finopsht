import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { PerformanceService } from "../performance/PerformanceService";

export class AnalyticsQueryService {
  /**
   * Queries forensic and audit logs for workforce and system security observability.
   */
  public static async queryAuditLogs(businessId: string, limitTo = 50): Promise<any[]> {
    if (!businessId) return [];

    return PerformanceService.trackExecution("query", `AuditLogs:${businessId}`, async () => {
      const path = `forensic_logs`;
      try {
        const q = query(
          collection(db, "forensic_logs"),
          where("business_id", "==", businessId),
          limit(limitTo)
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, path);
        return [];
      }
    });
  }
}
