import { 
  collection, 
  doc, 
  query, 
  where, 
  getDocs, 
  getDoc,
  onSnapshot, 
  runTransaction, 
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { Invitation, Employee } from "../types";
import { ForensicLogRepository } from "./ForensicLogRepository";
import { NotificationEngine } from "../modules/workflow/NotificationEngine";

export const InvitationRepository = {
  /**
   * Listens in real time to pending invitations addressed to a specific user's email.
   */
  listenPendingInvitationsByEmail(
    email: string, 
    callback: (invitations: Invitation[]) => void
  ): () => void {
    if (!email) {
      callback([]);
      return () => {};
    }

    const emailLower = email.toLowerCase().trim();

    const q = query(
      collection(db, "invitations"),
      where("email", "==", emailLower),
      where("status", "in", ["PENDING", "SENT"])
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const invites = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Invitation));
        callback(invites);
      },
      (error) => {
        console.warn(`[InvitationRepository] Listener error for email ${emailLower}:`, error);
        // Fallback: try querying without status composite filter if index missing
        const fallbackQ = query(
          collection(db, "invitations"),
          where("email", "==", emailLower)
        );
        onSnapshot(fallbackQ, (snap) => {
          const filtered = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as Invitation))
            .filter(inv => inv.status === "PENDING" || inv.status === "SENT");
          callback(filtered);
        }, (err2) => {
          console.error("[InvitationRepository] Fallback listener also failed:", err2);
          callback([]);
        });
      }
    );
  },

  /**
   * Retrieves pending invitations for an email address.
   */
  async getPendingByEmail(email: string): Promise<Invitation[]> {
    if (!email) return [];
    try {
      const emailLower = email.toLowerCase().trim();
      const q = query(
        collection(db, "invitations"),
        where("email", "==", emailLower)
      );
      const snap = await getDocs(q);
      return snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Invitation))
        .filter(inv => inv.status === "PENDING" || inv.status === "SENT");
    } catch (error) {
      throw handleFirestoreError(error, OperationType.LIST, "invitations");
    }
  },

  /**
   * Atomically accepts an invitation via Firestore transaction.
   * Links user to employee record and target business, activating the account.
   */
  async acceptInvitation(
    invitationId: string, 
    user: { uid: string; email: string; displayName?: string; name?: string }
  ): Promise<void> {
    const activeEmail = user.email.toLowerCase().trim();
    const activeName = user.displayName || user.name || "Collaborateur";

    try {
      let targetBizId = "";
      let empId = "";

      await runTransaction(db, async (transaction) => {
        const invRef = doc(db, "invitations", invitationId);
        const invSnap = await transaction.get(invRef);

        if (!invSnap.exists()) {
          throw new Error("INVITATION_NOT_FOUND");
        }

        const invitation = invSnap.data() as Invitation;
        if (invitation.status === "ACCEPTED") {
          console.warn("[InvitationRepository] Invitation already accepted. Idempotent skip.");
          return;
        }

        targetBizId = invitation.business_id || invitation.businessId || "";
        empId = invitation.employee_id || invitation.employeeId || `emp_${user.uid}`;

        const employeeRef = doc(db, "employees", empId);
        const userRef = doc(db, "users", user.uid);

        const [empSnap, userSnap] = await Promise.all([
          transaction.get(employeeRef),
          transaction.get(userRef)
        ]);

        const existingEmp = empSnap.exists() ? empSnap.data() : {};
        const existingUser = userSnap.exists() ? userSnap.data() : {};

        const nowIso = new Date().toISOString();

        // 1. Mark invitation ACCEPTED
        transaction.update(invRef, {
          status: "ACCEPTED",
          acceptedAt: nowIso,
          uid: user.uid,
          updatedAt: serverTimestamp()
        });

        // 2. Link & Activate Employee
        const empPayload = {
          ...existingEmp,
          id: empId,
          uid: user.uid,
          firebase_uid: user.uid,
          email: activeEmail,
          normalizedEmail: activeEmail,
          name: existingEmp.name || activeName,
          displayName: existingEmp.displayName || activeName,
          businessId: targetBizId,
          business_id: targetBizId,
          branchId: invitation.branchId || existingEmp.branchId || "",
          departmentId: invitation.departmentId || existingEmp.departmentId || "",
          status: "ACTIVE",
          isActive: true,
          role: invitation.role || existingEmp.role || "EMPLOYEE",
          onboardingComplete: true,
          updatedAt: serverTimestamp()
        };
        transaction.set(employeeRef, empPayload, { merge: true });

        // 3. Activate User Profile
        const userPayload = {
          ...existingUser,
          id: user.uid,
          uid: user.uid,
          email: activeEmail,
          name: activeName,
          displayName: activeName,
          employeeId: empId,
          employee_id: empId,
          businessId: targetBizId,
          business_id: targetBizId,
          branchId: invitation.branchId || existingEmp.branchId || existingUser.branchId || "",
          departmentId: invitation.departmentId || existingEmp.departmentId || existingUser.departmentId || "",
          role: invitation.role || existingEmp.role || existingUser.role || "EMPLOYEE",
          accountStatus: "ACTIVE",
          account_status: "ACTIVE",
          businessStatus: "ACTIVE",
          business_status: "ACTIVE",
          onboardingComplete: true,
          onboarding_completed: true,
          updatedAt: serverTimestamp()
        };
        transaction.set(userRef, userPayload, { merge: true });
      });

      // Clear identity caches for immediate re-orchestration
      sessionStorage.removeItem(`finops_identity_cache_${user.uid}`);
      localStorage.removeItem(`finops_identity_cache_${user.uid}`);

      // Cryptographic Forensic Log
      const log = await ForensicLogRepository.createAndSignLog({
        business_id: targetBizId || "global",
        action: "INVITATION_ACCEPTED",
        actorId: user.uid,
        timestamp: new Date().toISOString(),
        details: JSON.stringify({
          invitationId,
          employeeId: empId,
          businessId: targetBizId,
          userEmail: activeEmail
        })
      });
      await ForensicLogRepository.writeForensicLog(log).catch(err =>
        console.warn("[InvitationRepository] Forensic log write warning:", err)
      );

      if (targetBizId) {
        await NotificationEngine.send({
          businessId: targetBizId,
          targetRoles: ["OWNER", "MANAGER"],
          type: "HR",
          severity: "INFO",
          title: "Invitation Acceptée",
          message: `${activeEmail} (${activeName}) a accepté l'invitation et rejoint l'entreprise.`,
          module: "INVITATION"
        }).catch(err => console.warn("[InvitationRepository] Notification send error:", err));
      }
    } catch (error) {
      throw handleFirestoreError(error, OperationType.WRITE, `invitations/${invitationId}`);
    }
  },

  /**
   * Rejects an invitation.
   */
  async rejectInvitation(invitationId: string, user: { uid: string; email?: string }): Promise<void> {
    try {
      const invRef = doc(db, "invitations", invitationId);
      await updateDoc(invRef, {
        status: "REJECTED",
        rejectedAt: new Date().toISOString(),
        uid: user.uid,
        updatedAt: serverTimestamp()
      });

      const log = await ForensicLogRepository.createAndSignLog({
        business_id: "global",
        action: "INVITATION_REJECTED",
        actorId: user.uid,
        timestamp: new Date().toISOString(),
        details: JSON.stringify({ invitationId, rejectedBy: user.uid, email: user.email })
      });
      await ForensicLogRepository.writeForensicLog(log).catch(err =>
        console.warn("[InvitationRepository] Forensic log write warning:", err)
      );
    } catch (error) {
      throw handleFirestoreError(error, OperationType.WRITE, `invitations/${invitationId}`);
    }
  },

  /**
   * Finds an invitation by document ID or token
   */
  async getByTokenOrCode(code: string): Promise<Invitation | null> {
    if (!code) return null;
    try {
      const trimmed = code.trim();
      const directRef = doc(db, "invitations", trimmed);
      const directSnap = await getDoc(directRef);
      if (directSnap.exists()) {
        const data = { id: directSnap.id, ...directSnap.data() } as Invitation;
        if (data.status === "SENT" || data.status === "PENDING") {
          return data;
        }
      }

      const qToken = query(collection(db, "invitations"), where("token", "==", trimmed));
      const snapToken = await getDocs(qToken);
      if (!snapToken.empty) {
        const data = { id: snapToken.docs[0].id, ...snapToken.docs[0].data() } as Invitation;
        if (data.status === "SENT" || data.status === "PENDING") {
          return data;
        }
      }
      return null;
    } catch (error) {
      throw handleFirestoreError(error, OperationType.GET, "invitations");
    }
  }
};
