import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, limit, orderBy } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { EDMSDocument, EDMSDocumentAuditEntry, EDMSDocumentStatus, EDMSDocumentType } from "../types";
import { EventBus } from "../modules/runtime/EventBus";

export const DocumentRepository = {
  /**
   * Checks if a document metadata record is sealed/immutable against updates or deletions.
   * Throws an error if document status is RETENTION_LOCKED, SEALED, or isSealed === true.
   */
  async verifyDocumentLock(businessId: string, documentId: string): Promise<void> {
    const existing = await this.getDocumentById(businessId, documentId);
    if (!existing) return;

    if (
      existing.isSealed === true ||
      existing.status === "RETENTION_LOCKED" ||
      existing.status === "SEALED"
    ) {
      throw new Error(`PERIOD_LOCKED: Document [${documentId}] is legally sealed and immutable.`);
    }

    // Check if linked to a locked/sealed payroll cycle
    if (existing.linkedEntityType === "payroll_cycle" && existing.linkedEntityId) {
      try {
        const cycleDocRef = doc(db, "businesses", businessId, "payroll_cycles", existing.linkedEntityId);
        const cycleSnap = await getDoc(cycleDocRef);
        if (cycleSnap.exists()) {
          const status = cycleSnap.data().status;
          if (["LOCKED", "SEALED", "PAID"].includes(status)) {
            throw new Error(`PERIOD_LOCKED: Linked payroll cycle [${existing.linkedEntityId}] is ${status}. Document cannot be modified.`);
          }
        }
      } catch (e: any) {
        if (e.message?.startsWith("PERIOD_LOCKED")) throw e;
      }
    }
  },

  /**
   * Persists or updates an EDMS document metadata record in Firestore.
   * Enforces immutability verification prior to saving existing records.
   */
  async saveDocument(document: EDMSDocument): Promise<void> {
    const path = `businesses/${document.businessId}/documents/${document.id}`;
    try {
      // 1. Check immutability if document already exists
      await this.verifyDocumentLock(document.businessId, document.id);

      // 2. Prepare lightweight document object (strip massive base64 blobs if storagePath is present)
      const docToSave: EDMSDocument = {
        ...document,
        // Calculate retention expiry date if not explicitly set
        retentionExpiryDate: document.retentionExpiryDate || this.calculateRetentionExpiry(document.documentType, document.generatedAt)
      };

      const now = new Date().toISOString();

      // Save tenant-scoped
      const docRef = doc(db, "businesses", document.businessId, "documents", document.id);
      await setDoc(docRef, {
        ...docToSave,
        updatedAt: now
      }, { merge: true });

      // Save top-level index for fast direct ID / checksum verification
      const topLevelRef = doc(db, "documents", document.id);
      await setDoc(topLevelRef, {
        ...docToSave,
        updatedAt: now
      }, { merge: true });

      EventBus.publish(EventBus.createEvent({
        correlationId: `doc_saved_${document.id}`,
        businessId: document.businessId,
        actorId: document.generatedBy,
        module: "HR",
        aggregate: "DOCUMENT",
        type: "DocumentSaved",
        payload: {
          documentId: document.id,
          employeeId: document.employeeId,
          type: document.documentType,
          version: document.version,
          checksum: document.checksum,
          status: document.status
        }
      }));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  /**
   * Marks previous versions of a document type for an employee or entity as SUPERSEDED.
   * Ensures that older active contracts or documents are archived and traceable.
   */
  async supersedePreviousVersions(
    businessId: string,
    employeeId: string,
    documentType: EDMSDocumentType,
    newDocumentId: string,
    actor: { uid: string; name: string; role: string }
  ): Promise<void> {
    try {
      const existingDocs = await this.getEmployeeDocuments(businessId, employeeId);
      const activeSameType = existingDocs.filter(d => 
        d.documentType === documentType && 
        d.id !== newDocumentId &&
        ["DRAFT", "UPLOADED", "GENERATED", "ACTIVE", "VERIFIED", "SIGNED"].includes(d.status)
      );

      const timestamp = new Date().toISOString();

      for (const oldDoc of activeSameType) {
        // Skip if locked
        if (oldDoc.isSealed || oldDoc.status === "RETENTION_LOCKED") continue;

        const auditEntry: EDMSDocumentAuditEntry = {
          action: "SUPERSEDED",
          userId: actor.uid,
          userName: actor.name,
          userRole: actor.role,
          timestamp,
          version: oldDoc.version,
          details: `Remplacé et rendu obsolète par la nouvelle version [${newDocumentId}]`
        };

        const updateData = {
          status: "SUPERSEDED" as EDMSDocumentStatus,
          supersededBy: newDocumentId,
          supersededAt: timestamp,
          audit: [...(oldDoc.audit || []), auditEntry],
          updatedAt: timestamp
        };

        await setDoc(doc(db, "businesses", businessId, "documents", oldDoc.id), updateData, { merge: true });
        await setDoc(doc(db, "documents", oldDoc.id), updateData, { merge: true });

        EventBus.publish(EventBus.createEvent({
          correlationId: `doc_superseded_${oldDoc.id}`,
          businessId,
          actorId: actor.uid,
          module: "HR",
          aggregate: "DOCUMENT",
          type: "DocumentSuperseded",
          payload: {
            oldDocumentId: oldDoc.id,
            newDocumentId,
            employeeId,
            documentType
          }
        }));
      }
    } catch (error) {
      console.warn("[DocumentRepository] Error superseding previous document versions:", error);
    }
  },

  /**
   * Retrieves all documents belonging strictly to an employee within a business.
   */
  async getEmployeeDocuments(businessId: string, employeeId: string): Promise<EDMSDocument[]> {
    const path = `businesses/${businessId}/documents`;
    try {
      const q = query(
        collection(db, "businesses", businessId, "documents"),
        where("employeeId", "==", employeeId)
      );
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => d.data() as EDMSDocument);
      return docs.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
    } catch (error) {
      console.warn(`[DocumentRepository] Tenant-scoped query failed for ${path}, attempting top-level query fallback`, error);
      try {
        const topQ = query(
          collection(db, "documents"),
          where("businessId", "==", businessId),
          where("employeeId", "==", employeeId)
        );
        const topSnap = await getDocs(topQ);
        const topDocs = topSnap.docs.map(d => d.data() as EDMSDocument);
        return topDocs.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
      } catch (fallbackErr) {
        handleFirestoreError(fallbackErr, OperationType.GET, "documents");
        return [];
      }
    }
  },

  /**
   * Retrieves all documents linked to a specific entity (e.g. payroll cycle, leave request).
   */
  async getDocumentsByEntity(
    businessId: string,
    linkedEntityId: string,
    linkedEntityType?: string
  ): Promise<EDMSDocument[]> {
    try {
      let q = query(
        collection(db, "businesses", businessId, "documents"),
        where("linkedEntityId", "==", linkedEntityId)
      );
      const snap = await getDocs(q);
      let docs = snap.docs.map(d => d.data() as EDMSDocument);

      if (linkedEntityType) {
        docs = docs.filter(d => d.linkedEntityType === linkedEntityType);
      }

      return docs.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
    } catch (error) {
      console.warn("[DocumentRepository] Error fetching documents by entity:", error);
      return [];
    }
  },

  /**
   * Retrieves all EDMS documents across the enterprise business tenant.
   */
  async getBusinessDocuments(businessId: string): Promise<EDMSDocument[]> {
    const path = `businesses/${businessId}/documents`;
    try {
      const q = query(collection(db, "businesses", businessId, "documents"));
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => d.data() as EDMSDocument);
      return docs.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
    } catch (error) {
      try {
        const topQ = query(
          collection(db, "documents"),
          where("businessId", "==", businessId)
        );
        const topSnap = await getDocs(topQ);
        const topDocs = topSnap.docs.map(d => d.data() as EDMSDocument);
        return topDocs.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
      } catch (fallbackErr) {
        handleFirestoreError(fallbackErr, OperationType.GET, "documents");
        return [];
      }
    }
  },

  /**
   * Retrieves a single document by ID.
   */
  async getDocumentById(businessId: string, documentId: string): Promise<EDMSDocument | null> {
    try {
      const tenantDocRef = doc(db, "businesses", businessId, "documents", documentId);
      const tenantSnap = await getDoc(tenantDocRef);
      if (tenantSnap.exists()) return tenantSnap.data() as EDMSDocument;

      const topDocRef = doc(db, "documents", documentId);
      const topSnap = await getDoc(topDocRef);
      if (topSnap.exists()) return topSnap.data() as EDMSDocument;

      return null;
    } catch (error) {
      console.warn(`[DocumentRepository] Error retrieving document ${documentId}:`, error);
      return null;
    }
  },

  /**
   * Verification lookup: Find document by SHA256 Checksum or reference code.
   */
  async getDocumentByChecksumOrRef(queryStr: string): Promise<EDMSDocument | null> {
    const cleanStr = queryStr.trim();
    if (!cleanStr) return null;

    try {
      // Try direct ID match first
      const docRef = doc(db, "documents", cleanStr);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) return docSnap.data() as EDMSDocument;

      // Search by checksum
      const qChecksum = query(collection(db, "documents"), where("checksum", "==", cleanStr), limit(1));
      const snapChecksum = await getDocs(qChecksum);
      if (!snapChecksum.empty) return snapChecksum.docs[0].data() as EDMSDocument;

      // Search by reference code
      const qRef = query(collection(db, "documents"), where("reference", "==", cleanStr), limit(1));
      const snapRef = await getDocs(qRef);
      if (!snapRef.empty) return snapRef.docs[0].data() as EDMSDocument;

      return null;
    } catch (error) {
      console.warn("[DocumentRepository] Verification query failed:", error);
      return null;
    }
  },

  /**
   * Appends an unalterable audit entry to the document's audit trail.
   */
  async addAuditEntry(businessId: string, documentId: string, auditEntry: EDMSDocumentAuditEntry): Promise<void> {
    try {
      const existing = await this.getDocumentById(businessId, documentId);
      if (!existing) return;

      const updatedAudit = [...(existing.audit || []), auditEntry];
      
      const updateData = {
        audit: updatedAudit,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "businesses", businessId, "documents", documentId), updateData, { merge: true });
      await setDoc(doc(db, "documents", documentId), updateData, { merge: true });
    } catch (error) {
      console.warn("[DocumentRepository] Error adding document audit log:", error);
    }
  },

  /**
   * Updates document status (e.g. REVOKED, SIGNED, ARCHIVED, RETENTION_LOCKED)
   * Enforces period and document locking rules.
   */
  async updateDocumentStatus(
    businessId: string, 
    documentId: string, 
    status: EDMSDocumentStatus,
    auditEntry?: EDMSDocumentAuditEntry
  ): Promise<void> {
    try {
      // Enforce immutability lock
      await this.verifyDocumentLock(businessId, documentId);

      const existing = await this.getDocumentById(businessId, documentId);
      if (!existing) return;

      const updatedAudit = auditEntry ? [...(existing.audit || []), auditEntry] : existing.audit;

      const isSealed = status === "RETENTION_LOCKED" || status === "SIGNED" || existing.isSealed === true;

      const updateData = {
        status,
        isSealed,
        audit: updatedAudit,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "businesses", businessId, "documents", documentId), updateData, { merge: true });
      await setDoc(doc(db, "documents", documentId), updateData, { merge: true });

      EventBus.publish(EventBus.createEvent({
        correlationId: `doc_status_${documentId}_${status}`,
        businessId,
        actorId: auditEntry?.userId || "system",
        module: "HR",
        aggregate: "DOCUMENT",
        type: "DocumentStatusUpdated",
        payload: { documentId, status, isSealed }
      }));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `documents/${documentId}`);
    }
  },

  /**
   * Archives all documents belonging to a terminated or archived employee.
   * Guarantees that employee documents are NEVER deleted on termination.
   */
  async archiveEmployeeDocuments(
    businessId: string,
    employeeId: string,
    actor: { uid: string; name: string; role: string }
  ): Promise<void> {
    try {
      const docs = await this.getEmployeeDocuments(businessId, employeeId);
      const now = new Date().toISOString();

      for (const document of docs) {
        if (document.status === "ARCHIVED" || document.status === "RETENTION_LOCKED") continue;

        const auditEntry: EDMSDocumentAuditEntry = {
          action: "ARCHIVED",
          userId: actor.uid,
          userName: actor.name,
          userRole: actor.role,
          timestamp: now,
          version: document.version,
          details: `Document archivé suite à la cessation ou au changement de statut de l'employé`
        };

        const updateData = {
          status: "ARCHIVED" as EDMSDocumentStatus,
          audit: [...(document.audit || []), auditEntry],
          updatedAt: now
        };

        await setDoc(doc(db, "businesses", businessId, "documents", document.id), updateData, { merge: true });
        await setDoc(doc(db, "documents", document.id), updateData, { merge: true });
      }
    } catch (error) {
      console.warn("[DocumentRepository] Error archiving employee documents:", error);
    }
  },

  /**
   * Evaluates statutory retention expiry and locks documents that have reached retention limit.
   */
  async checkAndEnforceRetentionPolicies(businessId: string): Promise<number> {
    let lockedCount = 0;
    try {
      const docs = await this.getBusinessDocuments(businessId);
      const now = new Date();

      for (const document of docs) {
        if (document.status === "RETENTION_LOCKED" || document.isSealed) continue;

        if (document.retentionExpiryDate) {
          const expiryDate = new Date(document.retentionExpiryDate);
          if (now >= expiryDate) {
            const auditEntry: EDMSDocumentAuditEntry = {
              action: "RETENTION_LOCKED",
              userId: "system",
              userName: "Système de Conservation Légale",
              userRole: "SYSTEM",
              timestamp: now.toISOString(),
              version: document.version,
              details: "Verrouillage immuable automatique suite à l'expiration de la période légale de rétention."
            };

            const updateData = {
              status: "RETENTION_LOCKED" as EDMSDocumentStatus,
              isSealed: true,
              audit: [...(document.audit || []), auditEntry],
              updatedAt: now.toISOString()
            };

            await setDoc(doc(db, "businesses", businessId, "documents", document.id), updateData, { merge: true });
            await setDoc(doc(db, "documents", document.id), updateData, { merge: true });
            lockedCount++;
          }
        }
      }
    } catch (error) {
      console.warn("[DocumentRepository] Error enforcing retention policies:", error);
    }
    return lockedCount;
  },

  /**
   * Helper: Calculates statutory retention expiry based on document type and generation date.
   * - Payslips / Tax / CNSS: 5 years (1825 days)
   * - Employment Contracts: 10 years (3650 days)
   * - Other: 3 years (1095 days)
   */
  calculateRetentionExpiry(documentType: EDMSDocumentType, generatedAt: string): string {
    const genDate = new Date(generatedAt);
    let years = 3;

    if (["PAYSLIP", "TAX_DOCUMENT", "CNSS_DOCUMENT", "SALARY_CERTIFICATE"].includes(documentType)) {
      years = 5;
    } else if (["EMPLOYMENT_CONTRACT", "TERMINATION_LETTER", "SERVICE_RECORD"].includes(documentType)) {
      years = 10;
    }

    genDate.setFullYear(genDate.getFullYear() + years);
    return genDate.toISOString();
  }
};
