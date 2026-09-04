
import { db, handleFirestoreError, OperationType, auth, serverTimestamp } from "../../lib/firebase";
import { collection, doc, setDoc, getDoc, query, where, onSnapshot, getDocs, limit, orderBy } from "firebase/firestore";
import { ModuleHealth, EnterpriseIncident } from "./types";

export class AdminRepository {
  private static INCIDENTS_COLLECTION = "enterprise_incidents";
  private static HEALTH_COLLECTION = "enterprise_health_snapshots";

  public static async reportHealth(health: ModuleHealth): Promise<void> {
    if (!auth.currentUser) {
      return;
    }
    // Tenant isolation: if businessId is provided, scope to tenant; if global service, do not inject hardcoded demo
    const docId = health.businessId ? `${health.name}_${health.businessId}` : health.name;
    const path = `${this.HEALTH_COLLECTION}/${docId}`;
    
    try {
      const ref = doc(db, this.HEALTH_COLLECTION, docId);
      const data: any = {
        ...health,
        updatedAt: serverTimestamp()
      };
      if (health.businessId) {
        data.business_id = health.businessId;
        data.businessId = health.businessId;
      } else {
        delete data.businessId;
        delete data.business_id;
      }
      await setDoc(ref, data);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
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
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  public static async getActiveIncidents(businessId: string): Promise<EnterpriseIncident[]> {
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
      handleFirestoreError(error, OperationType.GET, this.INCIDENTS_COLLECTION);
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
          // If we can't subscribe due to auth delay, just return an empty unsub function
          handleFirestoreError(error, OperationType.GET, this.HEALTH_COLLECTION);
        }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, this.HEALTH_COLLECTION);
      return () => {};
    }
  }
}
