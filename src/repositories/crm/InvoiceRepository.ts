import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, onSnapshot, runTransaction, QueryConstraint } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { Invoice, InvoiceStatus, InvoicePayment } from "../../types/crm";
import { LedgerTransaction } from "../../types";
import { PaginatedRepository, PaginatedResult } from "../PaginatedRepository";

export const InvoiceRepository = {
  /**
   * Saves or updates an Invoice document under tenant scope
   */
  async saveInvoice(invoice: Invoice, dbInstance?: any): Promise<void> {
    const firestore = dbInstance || db;
    const path = `businesses/${invoice.businessId}/invoices/${invoice.id}`;
    try {
      const docRef = doc(firestore, "businesses", invoice.businessId, "invoices", invoice.id);
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
  async getInvoiceById(businessId: string, invoiceId: string, dbInstance?: any): Promise<Invoice | null> {
    const firestore = dbInstance || db;
    const path = `businesses/${businessId}/invoices/${invoiceId}`;
    try {
      const docRef = doc(firestore, "businesses", businessId, "invoices", invoiceId);
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
   * Atomically posts a payment event ledger transaction and updates invoice state
   * (paidAmount, balance, status, payments array) in a single Firestore transaction.
   * Enforces partial payments, idempotency on payment event ID, and balance invariants.
   */
  async recordInvoicePaymentAtomic(
    businessId: string,
    invoiceId: string,
    paymentTx: LedgerTransaction,
    paymentMethod: NonNullable<Invoice["paymentMethod"]>,
    dbInstance?: any
  ): Promise<{ alreadyPaid: boolean; alreadyProcessed: boolean; updatedInvoice?: Invoice }> {
    const firestore = dbInstance || db;
    const invoiceRef = doc(firestore, "businesses", businessId, "invoices", invoiceId);
    const ledgerRef = doc(firestore, "businesses", businessId, "ledger", paymentTx.id);

    try {
      let alreadyProcessed = false;
      let finalInvoice: Invoice | undefined;

      await runTransaction(firestore, async (transaction) => {
        const invSnap = await transaction.get(invoiceRef);
        if (!invSnap.exists()) {
          throw new Error(`Facture [${invoiceId}] introuvable.`);
        }
        const invData = invSnap.data() as Invoice;

        // Security / Tenant Isolation check
        if (invData.businessId !== businessId || paymentTx.business_id !== businessId) {
          throw new Error(`Accès refusé: Violation d'isolation multi-tenant (${businessId}).`);
        }

        const existingPayments = invData.payments || [];

        // Check if ledger transaction record already exists directly in Firestore
        const ledgerSnap = await transaction.get(ledgerRef);
        if (ledgerSnap.exists()) {
          alreadyProcessed = true;
          finalInvoice = invData;
          return;
        }

        // Check idempotency: by payment Tx ID or paymentEventId metadata
        const paymentEventId = (paymentTx.metadata?.paymentEventId as string) || paymentTx.id;
        const idempotencyKey = (paymentTx.metadata?.idempotencyKey as string) || paymentEventId;
        const paymentAmount = Number(paymentTx.amount) || 0;

        const conflictingPayment = existingPayments.find(
          (p) => ((p.idempotencyKey && p.idempotencyKey === idempotencyKey) || p.id === paymentEventId) && Math.abs(p.amount - paymentAmount) > 0.001
        );
        if (conflictingPayment) {
          throw new Error(
            `Conflit d'idempotence: Une tentative de paiement avec la clé "${idempotencyKey}" existe déjà avec un montant différent (${conflictingPayment.amount} HTG vs ${paymentAmount} HTG requis).`
          );
        }

        const isDuplicate = existingPayments.some(
          (p) => p.id === paymentEventId || p.transactionId === paymentTx.id || (p.idempotencyKey && p.idempotencyKey === idempotencyKey)
        );

        if (isDuplicate || (invData.isPaid && (invData.balance === 0 || invData.balance === undefined))) {
          alreadyProcessed = true;
          finalInvoice = invData;
          return;
        }

        if (!Number.isFinite(paymentAmount) || isNaN(paymentAmount) || paymentAmount <= 0) {
          throw new Error(`Le montant du paiement doit être un nombre valide supérieur à 0 (montant fourni: ${paymentAmount}).`);
        }

        const totalAmount = Number(invData.totalAmount) || 0;
        const currentPaidAmount = Number(invData.paidAmount ?? invData.amountPaid ?? 0);
        const currentBalance = invData.balance !== undefined ? Number(invData.balance) : Math.max(0, totalAmount - currentPaidAmount);

        // Strict invariant check: Payment cannot exceed outstanding balance
        if (paymentAmount > currentBalance + 0.001) {
          throw new Error(
            `Erreur de surpaiement: Le montant du paiement (${paymentAmount} HTG) dépasse le solde restant (${currentBalance} HTG) pour la facture ${invData.invoiceNumber}.`
          );
        }

        const newPaidAmount = Math.min(totalAmount, currentPaidAmount + paymentAmount);
        const newBalance = Math.max(0, totalAmount - newPaidAmount);
        const newIsPaid = newBalance <= 0.001;
        const newStatus: InvoiceStatus = newIsPaid ? "PAID" : "PARTIALLY_PAID";
        const now = new Date().toISOString();

        const newPaymentEvent: InvoicePayment = {
          id: paymentEventId,
          invoiceId,
          amount: paymentAmount,
          paymentDate: paymentTx.date || now.split("T")[0],
          paymentMethod,
          transactionId: paymentTx.id,
          idempotencyKey,
          notes: paymentTx.description,
          recordedBy: paymentTx.metadata?.collectedByUid ? {
            uid: paymentTx.metadata.collectedByUid,
            email: paymentTx.metadata.collectedByEmail || "",
          } : undefined,
          createdAt: now,
        };

        const updatedPayments = [...existingPayments, newPaymentEvent];

        // Post Ledger Transaction
        transaction.set(ledgerRef, paymentTx, { merge: true });

        // Update Invoice status & balance tracking
        const updates: Partial<Invoice> = {
          status: newStatus,
          isPaid: newIsPaid,
          paidAmount: newPaidAmount,
          amountPaid: newPaidAmount,
          balance: newBalance,
          payments: updatedPayments,
          ...(newIsPaid ? { paidAt: now } : (invData.paidAt ? { paidAt: invData.paidAt } : {})),
          paymentMethod,
          paymentTransactionId: paymentTx.id,
          updatedAt: now,
        };

        transaction.update(invoiceRef, updates);
        finalInvoice = { ...invData, ...updates };
      });

      return { alreadyPaid: alreadyProcessed, alreadyProcessed, updatedInvoice: finalInvoice };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `businesses/${businessId}/invoices/${invoiceId}`);
      throw error;
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
