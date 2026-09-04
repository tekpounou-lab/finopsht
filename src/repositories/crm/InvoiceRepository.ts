import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, onSnapshot, QueryConstraint } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { Invoice, InvoiceStatus } from "../../types/crm";
import { PaginatedRepository, PaginatedResult } from "../PaginatedRepository";

export const InvoiceRepository = {
  /**
   * Saves or updates an Invoice document under tenant scope
   */
  async saveInvoice(invoice: Invoice): Promise<void> {
    const path = `businesses/${invoice.businessId}/invoices/${invoice.id}`;
    try {
      const docRef = doc(db, "businesses", invoice.businessId, "invoices", invoice.id);
      await setDoc(docRef, {
        ...invoice,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  /**
   * Retrieves an invoice by ID
   */
  async getInvoiceById(businessId: string, invoiceId: string): Promise<Invoice | null> {
    const path = `businesses/${businessId}/invoices/${invoiceId}`;
    try {
      const docRef = doc(db, "businesses", businessId, "invoices", invoiceId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as Invoice;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
      return null;
    }
  },

  /**
   * Lists all invoices for a business
   */
  async listInvoicesByBusiness(businessId: string, status?: InvoiceStatus): Promise<Invoice[]> {
    const path = `businesses/${businessId}/invoices`;
    try {
      const colRef = collection(db, "businesses", businessId, "invoices");
      let q = query(colRef);
      if (status) {
        q = query(colRef, where("status", "==", status));
      }
      const snap = await getDocs(q);
      const invoices: Invoice[] = [];
      snap.forEach((d) => {
        invoices.push(d.data() as Invoice);
      });
      return invoices.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  /**
   * Lists invoices for a business with Firestore cursor-based pagination.
   */
  async listInvoicesByBusinessPaginated(
    businessId: string,
    options: { pageSize?: number; lastDoc?: any; status?: InvoiceStatus } = {}
  ): Promise<PaginatedResult<Invoice>> {
    if (!businessId) {
      return { items: [], lastDoc: null, hasMore: false, totalFetched: 0 };
    }

    const constraints: QueryConstraint[] = [];
    if (options.status) {
      constraints.push(where("status", "==", options.status));
    }

    return await PaginatedRepository.getPaginated<Invoice>({
      collectionPath: `businesses/${businessId}/invoices`,
      constraints,
      pageSize: options.pageSize || 25,
      lastDoc: options.lastDoc,
      orderByField: "createdAt",
      orderDirection: "desc",
      transform: (d) => ({ id: d.id, ...d.data() } as Invoice)
    });
  },

  /**
   * Realtime subscription to invoices
   */
  subscribeToInvoices(businessId: string, onUpdate: (invoices: Invoice[]) => void, onError?: (err: Error) => void) {
    const path = `businesses/${businessId}/invoices`;
    const colRef = collection(db, "businesses", businessId, "invoices");
    return onSnapshot(
      colRef,
      (snapshot) => {
        const invoices: Invoice[] = [];
        snapshot.forEach((d) => {
          invoices.push(d.data() as Invoice);
        });
        invoices.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        onUpdate(invoices);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, path);
        if (onError) onError(error as Error);
      }
    );
  },

  /**
   * Marks invoice as paid and links payment metadata
   */
  async markInvoiceAsPaid(
    businessId: string, 
    invoiceId: string, 
    paymentMethod: NonNullable<Invoice["paymentMethod"]>,
    paymentTransactionId?: string
  ): Promise<void> {
    const path = `businesses/${businessId}/invoices/${invoiceId}`;
    try {
      const docRef = doc(db, "businesses", businessId, "invoices", invoiceId);
      await updateDoc(docRef, {
        status: "PAID",
        isPaid: true,
        paidAt: new Date().toISOString(),
        paymentMethod,
        ...(paymentTransactionId ? { paymentTransactionId } : {}),
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  /**
   * Links accounting transaction to invoice
   */
  async linkAccountingTransaction(businessId: string, invoiceId: string, transactionId: string): Promise<void> {
    const path = `businesses/${businessId}/invoices/${invoiceId}`;
    try {
      const docRef = doc(db, "businesses", businessId, "invoices", invoiceId);
      await updateDoc(docRef, {
        accountingTransactionId: transactionId,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  /**
   * Updates invoice status
   */
  async updateStatus(businessId: string, invoiceId: string, status: InvoiceStatus): Promise<void> {
    const path = `businesses/${businessId}/invoices/${invoiceId}`;
    try {
      const docRef = doc(db, "businesses", businessId, "invoices", invoiceId);
      await updateDoc(docRef, {
        status,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  /**
   * Deletes an invoice
   */
  async deleteInvoice(businessId: string, invoiceId: string): Promise<void> {
    const path = `businesses/${businessId}/invoices/${invoiceId}`;
    try {
      const docRef = doc(db, "businesses", businessId, "invoices", invoiceId);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
};
