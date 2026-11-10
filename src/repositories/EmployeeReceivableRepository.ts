import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import {
  EmployeeReceivable,
  EmployeeReceivableRepayment,
  LedgerTransaction,
} from "../types";
import {
  EmployeeReceivableService,
  ApproveProposalParams,
  RecordRepaymentParams,
  resolveReceivableTenantId,
} from "../services/payroll/EmployeeReceivableService";
import { FinopsException } from "../modules/runtime/FinopsException";

const COLLECTION = "employee_receivables";

export const EmployeeReceivableRepository = {
  /**
   * Fetches all employee receivables for a business tenant from Firestore.
   * On the server (or when adminDb is provided), uses Firebase Admin SDK exclusively
   * and propagates errors instead of silently swallowing them into [].
   */
  async listReceivablesByBusiness(
    businessId: string,
    adminDb?: any
  ): Promise<EmployeeReceivable[]> {
    if (!businessId) return [];

    const isServerRuntime = Boolean(adminDb) || typeof window === "undefined";
    if (isServerRuntime) {
      let resolvedAdminDb = adminDb;
      if (!resolvedAdminDb) {
        const adminModulePath = "../lib/firebaseAdmin";
        const { getAdminFirestore } = await import(/* @vite-ignore */ adminModulePath);
        resolvedAdminDb = getAdminFirestore();
      }

      const [camelSnap, snakeSnap] = await Promise.all([
        resolvedAdminDb.collection(COLLECTION).where("businessId", "==", businessId).get(),
        resolvedAdminDb.collection(COLLECTION).where("business_id", "==", businessId).get(),
      ]);

      const byId = new Map<string, EmployeeReceivable>();
      const allDocs = [...(camelSnap?.docs || []), ...(snakeSnap?.docs || [])];
      for (const docSnap of allDocs) {
        const rawData = typeof docSnap.data === "function" ? docSnap.data() : docSnap;
        const docTenant = resolveReceivableTenantId({ ...rawData, id: docSnap.id });
        if (docTenant === businessId) {
          byId.set(docSnap.id, {
            ...rawData,
            id: docSnap.id,
            businessId,
          } as EmployeeReceivable);
        }
      }

      return Array.from(byId.values()).sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
    }

    try {
      const q = query(collection(db, COLLECTION), where("businessId", "==", businessId));
      const snapshot = await getDocs(q);
      const items: EmployeeReceivable[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as EmployeeReceivable);
      });
      return items.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (err) {
      console.warn(`[EmployeeReceivableRepository] Error reading receivables for business ${businessId}:`, err);
      return [];
    }
  },

  /**
   * Fetches a single employee receivable by ID.
   */
  async getReceivableById(receivableId: string): Promise<EmployeeReceivable | null> {
    if (!receivableId) return null;
    try {
      const docRef = doc(db, COLLECTION, receivableId);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) return null;
      return { id: docSnap.id, ...docSnap.data() } as EmployeeReceivable;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `${COLLECTION}/${receivableId}`);
      return null;
    }
  },

  /**
   * Saves or updates an employee receivable in Firestore.
   */
  async saveReceivable(receivable: EmployeeReceivable): Promise<void> {
    if (!receivable.id) {
      throw new FinopsException("INVALID_RECEIVABLE_ID", "ID de créance requis pour la persistance.");
    }
    const docRef = doc(db, COLLECTION, receivable.id);
    try {
      await setDoc(docRef, { ...receivable, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${COLLECTION}/${receivable.id}`);
    }
  },

  /**
   * Approves an overpayment recovery proposal with Maker-Checker validation and persists the result.
   */
  async approveProposal(
    receivableId: string,
    params: ApproveProposalParams,
    existingProposal?: EmployeeReceivable
  ): Promise<{
    approvedReceivable: EmployeeReceivable;
    ledgerTransactions: LedgerTransaction[];
  }> {
    const proposal = existingProposal || (await this.getReceivableById(receivableId));
    if (!proposal) {
      throw new FinopsException("RECEIVABLE_NOT_FOUND", `Proposition de recouvrement ${receivableId} introuvable.`);
    }

    // Call domain service for validation, Maker-Checker rules, GL balance checks
    const { approvedReceivable, journalEntry, ledgerTransactions } =
      EmployeeReceivableService.approveProposal(proposal, params);

    // Persist approved receivable
    await this.saveReceivable(approvedReceivable);

    // Persist resulting ledger transactions
    for (const tx of ledgerTransactions) {
      const txRef = doc(db, "ledger_transactions", tx.id);
      await setDoc(txRef, tx, { merge: true }).catch((err) => {
        console.warn(`[EmployeeReceivableRepository] Warning writing ledger tx ${tx.id}:`, err);
      });
    }

    return { approvedReceivable, ledgerTransactions };
  },

  /**
   * Records an employee repayment against an approved receivable and persists repayment & GL entries.
   */
  async recordRepayment(
    receivableId: string,
    params: RecordRepaymentParams,
    existingReceivable?: EmployeeReceivable
  ): Promise<{
    updatedReceivable: EmployeeReceivable;
    repayment: EmployeeReceivableRepayment;
  }> {
    const receivable = existingReceivable || (await this.getReceivableById(receivableId));
    if (!receivable) {
      throw new FinopsException("RECEIVABLE_NOT_FOUND", `Créance employé ${receivableId} introuvable.`);
    }

    // Call domain service to execute repayment reconciliation and create GL entries
    const { updatedReceivable, repayment, journalEntry } = EmployeeReceivableService.recordRepayment(
      receivable,
      params
    );

    // Persist updated receivable state with repayment record
    await this.saveReceivable(updatedReceivable);

    return { updatedReceivable, repayment };
  },
};
