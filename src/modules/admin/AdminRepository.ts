
import { db, logFirestoreError, OperationType, auth, serverTimestamp } from "../../lib/firebase";
import { collection, doc, setDoc, query, where, onSnapshot, getDocs, orderBy } from "firebase/firestore";
import { ModuleHealth, EnterpriseIncident, HealthScopeOptions } from "./types";

const INVALID_TENANT_IDS = new Set(["", "none", "default", "biz_default", "global", "system", "undefined", "null"]);

export function isValidHealthTenantId(id?: string | null): boolean {
  if (typeof id !== "string") return false;
  const trimmed = id.trim();
  return trimmed.length > 0 && !INVALID_TENANT_IDS.has(trimmed.toLowerCase());
}

export class AdminRepository {
  private static INCIDENTS_COLLECTION = "enterprise_incidents";
  private static HEALTH_COLLECTION = "enterprise_health_snapshots";

  public static async reportHealth(health: ModuleHealth): Promise<void> {
    if (!auth.currentUser) {
      return;
    }

    const validBizId = isValidHealthTenantId(health.businessId) ? String(health.businessId).trim() : null;
    if (!validBizId && !health.isPlatformMonitor) {
      // Never issue unscoped enterprise_health_snapshots/JOB_ENGINE or MONITORING_SERVICE writes
      return;
    }

    const moduleName = String(health.name || "UNKNOWN").trim();
    // Matches firestore.rules: id == (getBusinessId(request.resource.data) + '_' + request.resource.data.get('name', ''))
    const docId = validBizId ? `${validBizId}_${moduleName}` : moduleName;
    const path = `${this.HEALTH_COLLECTION}/${docId}`;

    try {
      const ref = doc(db, this.HEALTH_COLLECTION, docId);
      const lastUpdateValue =
        typeof health.lastUpdate === "string"
          ? health.lastUpdate
          : health.lastUpdate instanceof Date
            ? health.lastUpdate.toISOString()
            : new Date().toISOString();

      const cleanData: any = {
        name: moduleName,
        status: String(health.status || "GREEN"),
        lastUpdate: lastUpdateValue,
        updatedAt: serverTimestamp()
      };

      if (health.metrics && typeof health.metrics === "object") {
        try {
          cleanData.metrics = JSON.parse(JSON.stringify(health.metrics));
        } catch {
          cleanData.metrics = {};
        }
      }

      if (validBizId) {
        cleanData.business_id = validBizId;
        cleanData.businessId = validBizId;
      }

      await setDoc(ref, cleanData);
    } catch (error) {
      logFirestoreError(error, OperationType.WRITE, path);
    }
  }

  public static async createIncident(incident: EnterpriseIncident): Promise<void> {
    if (!auth.currentUser) {
      return;
    }
    const validBizId = isValidHealthTenantId(incident.businessId) ? String(incident.businessId).trim() : null;
    if (!validBizId) {
      return;
    }
    const path = `${this.INCIDENTS_COLLECTION}/${incident.id}`;
    try {
      const ref = doc(db, this.INCIDENTS_COLLECTION, incident.id);
      await setDoc(ref, {
        ...incident,
        businessId: validBizId,
        business_id: validBizId // Ensure snake_case for rules
      });
    } catch (error) {
      logFirestoreError(error, OperationType.WRITE, path);
    }
  }

  public static async getActiveIncidents(businessId: string): Promise<EnterpriseIncident[]> {
    if (!isValidHealthTenantId(businessId)) return [];
    try {
      const q = query(
        collection(db, this.INCIDENTS_COLLECTION),
        where("businessId", "==", businessId.trim()),
        where("status", "in", ["OPEN", "INVESTIGATING"]),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => d.data() as EnterpriseIncident);
    } catch (error) {
      logFirestoreError(error, OperationType.GET, this.INCIDENTS_COLLECTION);
      return [];
    }
  }

  public static subscribeToHealth(
    callback: (health: ModuleHealth[]) => void,
    options?: HealthScopeOptions
  ): () => void {
    try {
      if (!auth.currentUser) {
        return () => {};
      }

      const validBizId = isValidHealthTenantId(options?.businessId)
        ? String(options?.businessId).trim()
        : null;

      if (!options?.isSuperAdmin && !validBizId) {
        // Avoid unscoped collection LIST query that violates multi-tenant rules
        return () => {};
      }

      const q = validBizId
        ? query(collection(db, this.HEALTH_COLLECTION), where("business_id", "==", validBizId))
        : collection(db, this.HEALTH_COLLECTION);

      return onSnapshot(
        q,
        (snapshot) => {
          const healthData = snapshot.docs.map(d => d.data() as ModuleHealth);
          callback(healthData);
        },
        (error) => {
          console.warn("[AdminRepository] Warning in subscribeToHealth:", error);
          logFirestoreError(error, OperationType.GET, this.HEALTH_COLLECTION);
        }
      );
    } catch (error) {
      logFirestoreError(error, OperationType.GET, this.HEALTH_COLLECTION);
      return () => {};
    }
  }
}
