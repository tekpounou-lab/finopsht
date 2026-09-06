import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  onSnapshot, 
  serverTimestamp 
} from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType } from "../lib/firebase";
import { PendingBusiness } from "../types";
import { ForensicLogRepository } from "./ForensicLogRepository";
import { WorkspaceProvisioningService } from "../services/business/WorkspaceProvisioningService";
import { NotificationEngine } from "../modules/workflow/NotificationEngine";

export const PendingBusinessRepository = {
  /**
   * Creates a new pending business document requested by a founder.
   */
  async create(
    data: Omit<PendingBusiness, "id" | "createdAt" | "updatedAt" | "status"> & {
      status?: PendingBusiness["status"];
    }
  ): Promise<PendingBusiness> {
    const pendingId = `pbiz_${data.ownerUid || Date.now()}`;
    const docRef = doc(db, "pending_businesses", pendingId);

    const newRecord: Record<string, any> = {
      id: pendingId,
      ownerUid: data.ownerUid,
      owner_uid: data.ownerUid,
      ownerEmail: data.ownerEmail.toLowerCase().trim(),
      owner_email: data.ownerEmail.toLowerCase().trim(),
      ownerName: data.ownerName || "",
      businessName: data.businessName,
      taxId: data.taxId || "",
      industry: data.industry || "General",
      selectedPlan: data.selectedPlan || "STARTER",
      status: "PENDING",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      console.debug("[PendingBusinessRepository] Writing pending business to /pending_businesses:", {
        pendingId,
        docPath: `/pending_businesses/${pendingId}`,
        record: newRecord
      });
      await setDoc(docRef, newRecord);

      // Cryptographic forensic log
      const log = await ForensicLogRepository.createAndSignLog({
        business_id: "global",
        action: "PENDING_BUSINESS_CREATED",
        actorId: data.ownerUid,
        timestamp: new Date().toISOString(),
        details: JSON.stringify({
          pendingBusinessId: pendingId,
          businessName: data.businessName,
          selectedPlan: data.selectedPlan,
          ownerEmail: data.ownerEmail
        })
      });
      await ForensicLogRepository.writeForensicLog(log).catch(err => 
        console.warn("[PendingBusinessRepository] Forensic log non-fatal error:", err)
      );

      // Notify Super Admins of new pending business application
      await NotificationEngine.send({
        businessId: "PLATFORM_ROOT",
        targetRoles: ["SUPER_ADMIN"],
        type: "CRITICAL",
        severity: "HIGH",
        title: "Nouvelle Demande d'Entreprise En Attente",
        message: `L'entreprise "${data.businessName}" (${data.ownerEmail}) a soumis une demande d'inscription.`,
        module: "TENANT_PROVISIONING"
      }).catch(err => console.warn("[PendingBusinessRepository] Notification creation warning:", err));

      return {
        ...newRecord,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as PendingBusiness;
    } catch (error) {
      throw handleFirestoreError(error, OperationType.WRITE, `pending_businesses/${pendingId}`);
    }
  },

  /**
   * Retrieves a pending business by its unique document ID.
   */
  async getById(id: string): Promise<PendingBusiness | null> {
    if (!id || !auth.currentUser) return null;
    try {
      const docRef = doc(db, "pending_businesses", id);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as PendingBusiness;
    } catch (error) {
      throw handleFirestoreError(error, OperationType.GET, `pending_businesses/${id}`);
    }
  },

  /**
   * Retrieves a pending business by the owner's Firebase UID.
   */
  async getByOwnerUid(ownerUid: string): Promise<PendingBusiness | null> {
    if (!ownerUid || !auth.currentUser) return null;
    try {
      // First check direct ID convention
      const directRef = doc(db, "pending_businesses", `pbiz_${ownerUid}`);
      const directSnap = await getDoc(directRef);
      if (directSnap.exists()) {
        return { id: directSnap.id, ...directSnap.data() } as PendingBusiness;
      }

      // Query by ownerUid
      const q = query(
        collection(db, "pending_businesses"), 
        where("ownerUid", "==", ownerUid)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        return { id: snap.docs[0].id, ...snap.docs[0].data() } as PendingBusiness;
      }

      // Fallback to snake_case owner_uid
      const qSnake = query(
        collection(db, "pending_businesses"), 
        where("owner_uid", "==", ownerUid)
      );
      const snapSnake = await getDocs(qSnake);
      if (!snapSnake.empty) {
        return { id: snapSnake.docs[0].id, ...snapSnake.docs[0].data() } as PendingBusiness;
      }

      return null;
    } catch (error) {
      console.warn(`[PendingBusinessRepository] Non-fatal lookup error for owner ${ownerUid}:`, error);
      return null;
    }
  },

  /**
   * Listens in real-time to the pending business document for a specific owner UID.
   */
  listenByOwnerUid(
    ownerUid: string, 
    onUpdate: (data: PendingBusiness | null) => void
  ): () => void {
    if (!ownerUid || !auth.currentUser) {
      onUpdate(null);
      return () => {};
    }
    const directRef = doc(db, "pending_businesses", `pbiz_${ownerUid}`);
    
    return onSnapshot(
      directRef,
      (docSnap) => {
        if (docSnap.exists()) {
          onUpdate({ id: docSnap.id, ...docSnap.data() } as PendingBusiness);
        } else {
          // If direct document not found, listen via query
          const q = query(
            collection(db, "pending_businesses"), 
            where("ownerUid", "==", ownerUid)
          );
          getDocs(q).then((qSnap) => {
            if (!qSnap.empty) {
              onUpdate({ id: qSnap.docs[0].id, ...qSnap.docs[0].data() } as PendingBusiness);
            } else {
              onUpdate(null);
            }
          }).catch(() => onUpdate(null));
        }
      },
      (error) => {
        console.warn(`[PendingBusinessRepository] Listener error for owner ${ownerUid}:`, error);
        onUpdate(null);
      }
    );
  },

  /**
   * Retrieves all pending businesses with status "PENDING" for Super Admin review.
   */
  async getAllPending(): Promise<PendingBusiness[]> {
    if (!auth.currentUser) return [];
    try {
      const q = query(
        collection(db, "pending_businesses"), 
        where("status", "==", "PENDING")
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as PendingBusiness));
    } catch (error) {
      throw handleFirestoreError(error, OperationType.LIST, "pending_businesses");
    }
  },

  /**
   * Listens in real-time to all pending business applications (for Super Admin dashboard).
   */
  listenAllPending(onUpdate: (data: PendingBusiness[]) => void): () => void {
    if (!auth.currentUser) {
      onUpdate([]);
      return () => {};
    }
    console.debug("[PendingBusinessRepository] Starting listenAllPending query on collection 'pending_businesses' with filter status == 'PENDING'");
    const q = query(
      collection(db, "pending_businesses"), 
      where("status", "==", "PENDING")
    );

    return onSnapshot(
      q,
      (snapshot) => {
        console.debug(`[PendingBusinessRepository] listenAllPending snapshot received. Docs count: ${snapshot.docs.length}`);
        const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PendingBusiness));
        onUpdate(records);
      },
      (error) => {
        console.error("[PendingBusinessRepository] listenAllPending query error:", error);
        onUpdate([]);
      }
    );
  },

  /**
   * Approves a pending business, provisioning the workspace if not yet provisioned,
   * linking it to the businessId and updating the owner's status to ACTIVE.
   */
  async approve(
    id: string, 
    adminUid: string, 
    businessId?: string,
    approvalNote?: string
  ): Promise<{ businessId: string }> {
    const docRef = doc(db, "pending_businesses", id);
    try {
      const beforeSnap = await getDoc(docRef);
      const beforeData = beforeSnap.exists() ? beforeSnap.data() as PendingBusiness : null;

      if (!beforeData) {
        throw new Error(`Demande d'entreprise introuvable: ${id}`);
      }

      let finalBusinessId = businessId || beforeData.businessId;

      // If business is not yet provisioned, provision it atomically now
      if (!finalBusinessId) {
        const founder = {
          uid: beforeData.ownerUid,
          email: beforeData.ownerEmail,
          name: beforeData.ownerName || beforeData.ownerEmail
        };
        const provResult = await WorkspaceProvisioningService.provision(founder, beforeData.businessName, {
          nif: beforeData.taxId,
          domain: beforeData.industry
        });
        finalBusinessId = provResult.businessId;
      }

      // Update pending_businesses document
      await updateDoc(docRef, {
        status: "APPROVED",
        businessId: finalBusinessId,
        approvedBy: adminUid,
        approvedAt: serverTimestamp(),
        approvalNote: approvalNote || "Demande approuvée par le Super Admin",
        updatedAt: serverTimestamp()
      });

      // Update owner's userProfile doc & business doc to ACTIVE
      try {
        const userDocRef = doc(db, "users", beforeData.ownerUid);
        await updateDoc(userDocRef, {
          accountStatus: "ACTIVE",
          account_status: "ACTIVE",
          business_id: finalBusinessId,
          role: "OWNER",
          updatedAt: serverTimestamp()
        });

        const bizDocRef = doc(db, "businesses", finalBusinessId);
        await updateDoc(bizDocRef, {
          status: "ACTIVE",
          updatedAt: serverTimestamp()
        }).catch(() => {});

        const subDocRef = doc(db, "subscriptions", finalBusinessId);
        await updateDoc(subDocRef, {
          status: "ACTIVE",
          updatedAt: serverTimestamp()
        }).catch(() => {});
      } catch (err) {
        console.warn("[PendingBusinessRepository] User profile/business status update warning:", err);
      }

      // Forensic Log
      const log = await ForensicLogRepository.createAndSignLog({
        business_id: finalBusinessId,
        action: "PENDING_BUSINESS_APPROVED",
        actorId: adminUid,
        timestamp: new Date().toISOString(),
        details: JSON.stringify({
          pendingBusinessId: id,
          businessId: finalBusinessId,
          approvedBy: adminUid,
          approvalNote
        }),
        beforeState: beforeData,
        afterState: { ...beforeData, status: "APPROVED", businessId: finalBusinessId }
      });
      await ForensicLogRepository.writeForensicLog(log).catch(err =>
        console.warn("[PendingBusinessRepository] Forensic log write failed:", err)
      );

      // Notify Owner of approval
      if (beforeData?.ownerUid) {
        await NotificationEngine.send({
          businessId: finalBusinessId,
          userId: beforeData.ownerUid,
          targetRoles: ["OWNER"],
          type: "INFO",
          severity: "MEDIUM",
          title: "Entreprise Approuvée",
          message: `Félicitations! Votre espace d'entreprise "${beforeData.businessName}" a été validé et activé.`,
          module: "TENANT_PROVISIONING"
        }).catch(err => console.warn("[PendingBusinessRepository] Approval notification warning:", err));
      }

      return { businessId: finalBusinessId };
    } catch (error) {
      throw handleFirestoreError(error, OperationType.WRITE, `pending_businesses/${id}`);
    }
  },

  /**
   * Rejects a pending business application with a mandatory reason.
   */
  async reject(
    id: string, 
    adminUid: string, 
    reason: string
  ): Promise<void> {
    const docRef = doc(db, "pending_businesses", id);
    try {
      const beforeSnap = await getDoc(docRef);
      const beforeData = beforeSnap.exists() ? beforeSnap.data() as PendingBusiness : null;

      await updateDoc(docRef, {
        status: "REJECTED",
        rejectionReason: reason,
        approvedBy: adminUid,
        updatedAt: serverTimestamp()
      });

      // Update owner's userProfile doc to REJECTED
      if (beforeData?.ownerUid) {
        try {
          const userDocRef = doc(db, "users", beforeData.ownerUid);
          await updateDoc(userDocRef, {
            accountStatus: "REJECTED",
            updatedAt: serverTimestamp()
          });
        } catch (err) {
          console.warn("[PendingBusinessRepository] User profile status update warning:", err);
        }
      }

      // Forensic Log
      const log = await ForensicLogRepository.createAndSignLog({
        business_id: "global",
        action: "PENDING_BUSINESS_REJECTED",
        actorId: adminUid,
        timestamp: new Date().toISOString(),
        details: JSON.stringify({
          pendingBusinessId: id,
          rejectedBy: adminUid,
          reason
        }),
        beforeState: beforeData,
        afterState: { ...beforeData, status: "REJECTED", rejectionReason: reason }
      });
      await ForensicLogRepository.writeForensicLog(log).catch(err =>
        console.warn("[PendingBusinessRepository] Forensic log write failed:", err)
      );

      // Notify Owner of rejection
      if (beforeData?.ownerUid) {
        await NotificationEngine.send({
          businessId: beforeData.businessId || "PLATFORM_ROOT",
          userId: beforeData.ownerUid,
          targetRoles: ["OWNER"],
          type: "CRITICAL",
          severity: "HIGH",
          title: "Demande d'Entreprise Refusée",
          message: `Votre demande d'inscription pour "${beforeData.businessName}" a été refusée. Raison: ${reason}`,
          module: "TENANT_PROVISIONING"
        }).catch(err => console.warn("[PendingBusinessRepository] Rejection notification warning:", err));
      }
    } catch (error) {
      throw handleFirestoreError(error, OperationType.WRITE, `pending_businesses/${id}`);
    }
  }
};
