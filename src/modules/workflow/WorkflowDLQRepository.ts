
import { auth, db, handleFirestoreError, logFirestoreError, OperationType } from "../../lib/firebase";
import { collection, doc, setDoc, query, where, getDocs, updateDoc } from "firebase/firestore";
import { WorkflowDeadLetter } from "./types";

export class WorkflowDLQRepository {
  private static COLLECTION = "workflow_dead_letters";

  public static async capture(deadLetter: WorkflowDeadLetter): Promise<void> {
    if (!auth.currentUser || !deadLetter?.id) return;
    const path = `${this.COLLECTION}/${deadLetter.id}`;
    try {
      const ref = doc(db, this.COLLECTION, deadLetter.id);
      await setDoc(ref, {
        ...deadLetter,
        business_id: deadLetter.businessId || (deadLetter as any).business_id,
        businessId: deadLetter.businessId || (deadLetter as any).business_id,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  public static async findUnresolved(businessId: string): Promise<WorkflowDeadLetter[]> {
    if (!businessId) return [];
    try {
      const q = query(
        collection(db, this.COLLECTION),
        where("businessId", "==", businessId),
        where("resolved", "==", false)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => d.data() as WorkflowDeadLetter);
    } catch (error) {
      logFirestoreError(error, OperationType.GET, this.COLLECTION);
      return [];
    }
  }

  public static async resolve(id: string): Promise<void> {
    if (!auth.currentUser || !id) return;
    const path = `${this.COLLECTION}/${id}`;
    try {
      const ref = doc(db, this.COLLECTION, id);
      await updateDoc(ref, {
        resolved: true,
        resolvedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
}
