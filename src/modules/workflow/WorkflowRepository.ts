
import { auth, db, handleFirestoreError, logFirestoreError, OperationType, withFirestoreRetry } from "../../lib/firebase";
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  updateDoc, 
  query, 
  where, 
  getDocs,
  limit,
  orderBy
} from "firebase/firestore";
import { WorkflowInstance, WorkflowDefinition, WorkflowStatus } from "./types";
import { CacheInvalidationService } from "../../services/performance/CacheInvalidationService";

export class WorkflowRepository {
  private static INSTANCE_COLLECTION = "workflow_instances";
  private static DEFINITION_COLLECTION = "workflow_definitions";
  private static cache = new Map<string, { data: any; timestamp: number }>();
  private static CACHE_TTL_MS = 30000;

  public static invalidateCache(): void {
    this.cache.clear();
  }

  static async saveInstance(instance: WorkflowInstance): Promise<void> {
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
        { tag: "WorkflowRepository.saveInstance" }
      );
      this.invalidateCache();
      CacheInvalidationService.sweepLocal(instance.businessId);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  static async getInstance(id: string): Promise<WorkflowInstance | null> {
    if (!id) {
      return null;
    }
    const cacheKey = `inst_${id}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const snap = await withFirestoreRetry(
        () => getDoc(doc(db, this.INSTANCE_COLLECTION, id)),
        { tag: "WorkflowRepository.getInstance" }
      );
      if (!snap.exists()) return null;
      const data = snap.data() as WorkflowInstance;
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      logFirestoreError(error, OperationType.GET, `${this.INSTANCE_COLLECTION}/${id}`);
      return null;
    }
  }

  static async updateInstanceStatus(id: string, status: WorkflowStatus, historyEntry?: any): Promise<void> {
    if (!auth.currentUser || !id) {
      return;
    }
    const path = `${this.INSTANCE_COLLECTION}/${id}`;
    try {
      const ref = doc(db, this.INSTANCE_COLLECTION, id);
      const snap = await withFirestoreRetry(
        () => getDoc(ref),
        { tag: "WorkflowRepository.updateInstanceStatus:get" }
      );
      if (!snap.exists()) return;
      const current = snap.data() as WorkflowInstance;
      
      const newHistory = historyEntry ? [...(current.history || []), historyEntry] : current.history;
      await withFirestoreRetry(
        () => updateDoc(ref, {
          status,
          updatedAt: new Date().toISOString(),
          history: newHistory
        }),
        { tag: "WorkflowRepository.updateInstanceStatus:update" }
      );
      this.invalidateCache();
      CacheInvalidationService.sweepLocal(current.businessId);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  static async findActiveByEntity(entityId: string, businessId: string): Promise<WorkflowInstance[]> {
    if (!businessId || !entityId) {
      return [];
    }
    try {
      const q = query(
        collection(db, this.INSTANCE_COLLECTION),
        where("businessId", "==", businessId),
        where("entityId", "==", entityId),
        where("status", "in", ["PENDING", "RUNNING", "WAITING_APPROVAL"])
      );
      const snap = await withFirestoreRetry(
        () => getDocs(q),
        { tag: "WorkflowRepository.findActiveByEntity" }
      );
      return snap.docs.map(d => d.data() as WorkflowInstance);
    } catch (error) {
      logFirestoreError(error, OperationType.GET, this.INSTANCE_COLLECTION);
      return [];
    }
  }

  static async findAllActive(businessId: string): Promise<WorkflowInstance[]> {
    if (!businessId) {
      return [];
    }
    try {
      const q = query(
        collection(db, this.INSTANCE_COLLECTION),
        where("businessId", "==", businessId),
        where("status", "in", ["PENDING", "RUNNING", "WAITING_APPROVAL"])
      );
      const snap = await withFirestoreRetry(
        () => getDocs(q),
        { tag: "WorkflowRepository.findAllActive" }
      );
      return snap.docs.map(d => d.data() as WorkflowInstance);
    } catch (error) {
      logFirestoreError(error, OperationType.GET, this.INSTANCE_COLLECTION);
      return [];
    }
  }

  static async listInstances(businessId: string, filterStatus?: string, limitTo: number = 50): Promise<WorkflowInstance[]> {
    if (!businessId) {
      return [];
    }
    try {
      let q;
      if (filterStatus && filterStatus !== "ALL") {
        q = query(
          collection(db, this.INSTANCE_COLLECTION),
          where("businessId", "==", businessId),
          where("status", "==", filterStatus),
          limit(limitTo)
        );
      } else {
        q = query(
          collection(db, this.INSTANCE_COLLECTION),
          where("businessId", "==", businessId),
          limit(limitTo)
        );
      }
      const snap = await withFirestoreRetry(
        () => getDocs(q),
        { tag: "WorkflowRepository.listInstances" }
      );
      return snap.docs.map(d => d.data() as WorkflowInstance);
    } catch (error) {
      logFirestoreError(error, OperationType.GET, this.INSTANCE_COLLECTION);
      return [];
    }
  }

  // Definition Management
  static async saveDefinition(definition: WorkflowDefinition & { businessId?: string; business_id?: string }): Promise<void> {
    if (!auth.currentUser || !definition?.id) {
      return;
    }
    const path = `${this.DEFINITION_COLLECTION}/${definition.id}`;
    try {
      await withFirestoreRetry(
        () => setDoc(doc(db, this.DEFINITION_COLLECTION, definition.id), definition),
        { tag: "WorkflowRepository.saveDefinition" }
      );
      this.invalidateCache();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  static async getDefinition(id: string): Promise<WorkflowDefinition | null> {
    if (!id) {
      return null;
    }
    try {
      const snap = await withFirestoreRetry(
        () => getDoc(doc(db, this.DEFINITION_COLLECTION, id)),
        { tag: "WorkflowRepository.getDefinition" }
      );
      return snap.exists() ? (snap.data() as WorkflowDefinition) : null;
    } catch (error) {
      logFirestoreError(error, OperationType.GET, `${this.DEFINITION_COLLECTION}/${id}`);
      return null;
    }
  }

  static async listDefinitions(businessId: string): Promise<WorkflowDefinition[]> {
    if (!businessId) {
      return [];
    }
    try {
      const q = query(
        collection(db, this.DEFINITION_COLLECTION),
        where("businessId", "==", businessId)
      );
      const snap = await withFirestoreRetry(
        () => getDocs(q),
        { tag: "WorkflowRepository.listDefinitions" }
      );
      return snap.docs.map(d => d.data() as WorkflowDefinition);
    } catch (error) {
      logFirestoreError(error, OperationType.GET, this.DEFINITION_COLLECTION);
      return [];
    }
  }

  // Idempotent Seeding Helper
  static async seedDefaultWorkflows(businessId: string): Promise<void> {
    if (!auth.currentUser) {
      return;
    }
    const leaveWfId = `wf_leave_${businessId}`;
    const onboardingWfId = `wf_onboarding_${businessId}`;

    const existingLeave = await this.getDefinition(leaveWfId);
    if (!existingLeave) {
      await this.saveDefinition({
        id: leaveWfId,
        businessId,
        business_id: businessId,
        name: "Approbation de Congés",
        description: "Processus d'approbation multi-niveaux pour les demandes de congés",
        triggerEvent: "LeaveRequested",
        version: "1.0.0",
        isActive: true,
        compensationStrategy: "AUTOMATIC"
      });
    }

    const existingOnboarding = await this.getDefinition(onboardingWfId);
    if (!existingOnboarding) {
      await this.saveDefinition({
        id: onboardingWfId,
        businessId,
        business_id: businessId,
        name: "Onboarding Employé",
        description: "Processus d'intégration et d'activation des nouveaux employés",
        triggerEvent: "EmployeeCreated",
        version: "1.0.0",
        isActive: true,
        compensationStrategy: "NONE"
      });
    }
  }
}

