import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, orderBy, onSnapshot } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { Lead, LeadStatus } from "../../types/crm";

export const LeadRepository = {
  /**
   * Creates or updates a Lead in Firestore under tenant scope
   */
  async saveLead(lead: Lead): Promise<void> {
    const path = `businesses/${lead.businessId}/leads/${lead.id}`;
    try {
      const docRef = doc(db, "businesses", lead.businessId, "leads", lead.id);
      await setDoc(docRef, {
        ...lead,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  /**
   * Retrieves a single lead by ID
   */
  async getLeadById(businessId: string, leadId: string): Promise<Lead | null> {
    const path = `businesses/${businessId}/leads/${leadId}`;
    try {
      const docRef = doc(db, "businesses", businessId, "leads", leadId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as Lead;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
      return null;
    }
  },

  /**
   * Lists all leads for a business with optional status filtering
   */
  async listLeadsByBusiness(businessId: string, status?: LeadStatus): Promise<Lead[]> {
    const path = `businesses/${businessId}/leads`;
    try {
      const colRef = collection(db, "businesses", businessId, "leads");
      let q = query(colRef);
      if (status) {
        q = query(colRef, where("status", "==", status));
      }
      const snap = await getDocs(q);
      const leads: Lead[] = [];
      snap.forEach((d) => {
        leads.push(d.data() as Lead);
      });
      return leads.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  /**
   * Realtime subscription for leads in a business
   */
  subscribeToLeads(businessId: string, onUpdate: (leads: Lead[]) => void, onError?: (err: Error) => void) {
    const path = `businesses/${businessId}/leads`;
    const colRef = collection(db, "businesses", businessId, "leads");
    return onSnapshot(
      colRef,
      (snapshot) => {
        const leads: Lead[] = [];
        snapshot.forEach((d) => {
          leads.push(d.data() as Lead);
        });
        leads.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        onUpdate(leads);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, path);
        if (onError) onError(error as Error);
      }
    );
  },

  /**
   * Updates lead qualification score and notes
   */
  async qualifyLead(businessId: string, leadId: string, leadScore: number, notes?: string): Promise<void> {
    const path = `businesses/${businessId}/leads/${leadId}`;
    try {
      const docRef = doc(db, "businesses", businessId, "leads", leadId);
      await updateDoc(docRef, {
        leadScore: Math.min(100, Math.max(0, leadScore)),
        ...(notes !== undefined ? { notes } : {}),
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  /**
   * Converts a Lead into a Prospect or Client
   */
  async convertLeadStatus(businessId: string, leadId: string, newStatus: LeadStatus): Promise<void> {
    const path = `businesses/${businessId}/leads/${leadId}`;
    try {
      const docRef = doc(db, "businesses", businessId, "leads", leadId);
      const updateData: Partial<Lead> = {
        status: newStatus,
        updatedAt: new Date().toISOString(),
        convertedAt: new Date().toISOString()
      };
      await updateDoc(docRef, updateData);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  /**
   * Deletes a lead
   */
  async deleteLead(businessId: string, leadId: string): Promise<void> {
    const path = `businesses/${businessId}/leads/${leadId}`;
    try {
      const docRef = doc(db, "businesses", businessId, "leads", leadId);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
};
