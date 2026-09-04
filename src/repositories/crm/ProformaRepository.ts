import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { Proforma, ProformaStatus } from "../../types/crm";

export const ProformaRepository = {
  /**
   * Saves or updates a Proforma document under tenant scope
   */
  async saveProforma(proforma: Proforma): Promise<void> {
    const path = `businesses/${proforma.businessId}/proformas/${proforma.id}`;
    try {
      const docRef = doc(db, "businesses", proforma.businessId, "proformas", proforma.id);
      await setDoc(docRef, {
        ...proforma,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  /**
   * Retrieves a proforma by ID
   */
  async getProformaById(businessId: string, proformaId: string): Promise<Proforma | null> {
    const path = `businesses/${businessId}/proformas/${proformaId}`;
    try {
      const docRef = doc(db, "businesses", businessId, "proformas", proformaId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as Proforma;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
      return null;
    }
  },

  /**
   * Lists all proformas for a business
   */
  async listProformasByBusiness(businessId: string, status?: ProformaStatus): Promise<Proforma[]> {
    const path = `businesses/${businessId}/proformas`;
    try {
      const colRef = collection(db, "businesses", businessId, "proformas");
      let q = query(colRef);
      if (status) {
        q = query(colRef, where("status", "==", status));
      }
      const snap = await getDocs(q);
      const proformas: Proforma[] = [];
      snap.forEach((d) => {
        proformas.push(d.data() as Proforma);
      });
      return proformas.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  /**
   * Realtime subscription to proformas
   */
  subscribeToProformas(businessId: string, onUpdate: (proformas: Proforma[]) => void, onError?: (err: Error) => void) {
    const path = `businesses/${businessId}/proformas`;
    const colRef = collection(db, "businesses", businessId, "proformas");
    return onSnapshot(
      colRef,
      (snapshot) => {
        const proformas: Proforma[] = [];
        snapshot.forEach((d) => {
          proformas.push(d.data() as Proforma);
        });
        proformas.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        onUpdate(proformas);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, path);
        if (onError) onError(error as Error);
      }
    );
  },

  /**
   * Updates proforma status
   */
  async updateStatus(businessId: string, proformaId: string, status: ProformaStatus, extraData?: Partial<Proforma>): Promise<void> {
    const path = `businesses/${businessId}/proformas/${proformaId}`;
    try {
      const docRef = doc(db, "businesses", businessId, "proformas", proformaId);
      await setDoc(docRef, {
        status,
        ...(extraData || {}),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  /**
   * Deletes a proforma
   */
  async deleteProforma(businessId: string, proformaId: string): Promise<void> {
    const path = `businesses/${businessId}/proformas/${proformaId}`;
    try {
      const docRef = doc(db, "businesses", businessId, "proformas", proformaId);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
};
