
import { db, handleFirestoreError, logFirestoreError, OperationType, auth, serverTimestamp } from "../../lib/firebase";
import { collection, doc, setDoc, getDoc, query, where, onSnapshot, getDocs, limit, orderBy } from "firebase/firestore";
import { ModuleHealth, EnterpriseIncident } from "./types";

export class AdminRepository {
  private static INCIDENTS_COLLECTION = "enterprise_incidents";
  private static HEALTH_COLLECTION = "enterprise_health_snapshots";

  public static async reportHealth(health: ModuleHealth): Promise<void> {
    if (!auth.currentUser) {
      return;
    }
    // Tenant isolation: if businessId is provided, scope to tenant
    const docId = health.businessId ? `${health.name}_${health.businessId}` : health.name;
    const path = `${this.HEALTH_COLLECTION}/${docId}`;
    
    try {
      const ref = doc(db, this.HEALTH_COLLECTION, docId);
      const cleanData: any = {
        name: String(health.name || "UNKNOWN"),
        status: String(health.status || "GREEN"),
        lastUpdate: String(health.lastUpdate || new Date().toISOString()),
        updatedAt: serverTimestamp()
      };

      if (health.metrics && typeof health.metrics === "object") {
        try {
          cleanData.metrics = JSON.parse(JSON.stringify(health.metrics));
        } catch {
          cleanData.metrics = {};
        }
      }

      if (health.businessId) {
        cleanData.business_id = String(health.businessId);
        cleanData.businessId = String(health.businessId);
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
    const path = `${this.INCIDENTS_COLLECTION}/${incident.id}`;
    try {
      const ref = doc(db, this.INCIDENTS_COLLECTION, incident.id);
      await setDoc(ref, {
        ...incident,
        business_id: incident.businessId // Ensure snake_case for rules
      });
    } catch (error) {
      logFirestoreError(error, OperationType.WRITE, path);
    }
  }

  public static async getActiveIncidents(businessId: string): Promise<EnterpriseIncident[]> {
    if (!businessId) return [];
    try {
      const q = query(
        collection(db, this.INCIDENTS_COLLECTION),
        where("businessId", "==", businessId),
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

  public static subscribeToHealth(callback: (health: ModuleHealth[]) => void): () => void {
    try {
      if (!auth.currentUser) {
        return () => {};
      }
      const q = collection(db, this.HEALTH_COLLECTION);
      return onSnapshot(q, 
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
