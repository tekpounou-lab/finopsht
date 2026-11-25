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
import { InvitationLifecycleService } from "../services/auth/InvitationLifecycleService";
import {
  extractRawOperationalProfileFromRecord,
  validateRoleOperationalProfileCompatibility
} from "../domains/rbac/operationalProfilePolicy";

export const InvitationRepository = {
  /**
   * Lists all invitations for a specific business_id
   */
  async listByBusiness(businessId: string): Promise<Invitation[]> {
    if (!businessId) return [];
    try {
      const q = query(
        collection(db, "invitations"),
        where("business_id", "==", businessId)
      );
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Invitation));
      
      // Fallback for documents saved with camelCase businessId
      if (items.length === 0) {
        const qAlt = query(
          collection(db, "invitations"),
          where("businessId", "==", businessId)
        );
        const snapAlt = await getDocs(qAlt);
        return snapAlt.docs.map(d => ({ id: d.id, ...d.data() } as Invitation));
      }
      return items;
    } catch (error) {
      throw handleFirestoreError(error, OperationType.LIST, "invitations");
    }
  },

  /**
   * Creates a new onboarding invitation and logs forensic audit entry.
   */
  async createInvitation(
    params: {
      businessId: string;
      email: string;
      name: string;
      role: Employee["role"];
      operational_profile?: Employee["operational_profile"];
      operationalProfile?: Employee["operational_profile"];
      branchId: string;
      departmentId: string;
      position?: string;
      baseSalary?: number;
      paymentModel?: Employee["paymentModel"];
    },
    actor: { id: string; name: string; role: string }
  ): Promise<{ invitation: Invitation; employee: Employee }> {
    const result = await InvitationLifecycleService.createInvitation(params, actor);

    // Write forensic audit log
    const log = await ForensicLogRepository.createAndSignLog({
      business_id: params.businessId,
      action: "INVITATION_SENT",
      actorId: actor.id,
      userName: actor.name,
      userRole: actor.role,
      timestamp: new Date().toISOString(),
      details: JSON.stringify({
        invitationId: result.invitation.id,
        email: result.invitation.email,
        role: result.invitation.role,
        operationalProfile: result.invitation.operational_profile || null,
        branchId: result.invitation.branchId,
        departmentId: result.invitation.departmentId
      })
    });
    await ForensicLogRepository.writeForensicLog(log).catch(err =>
      console.warn("[InvitationRepository] Forensic log write warning:", err)
    );

    // Notify Business Managers & Owners
    await NotificationEngine.send({
      businessId: params.businessId,
      targetRoles: ["OWNER", "MANAGER"],
      type: "HR",
      severity: "INFO",
      title: "Nouvelle Invitation Envoyée",
      message: `Invitation envoyée à ${result.invitation.email} pour le rôle ${result.invitation.role}.`,
      module: "INVITATION"
    }).catch(err => console.warn("[InvitationRepository] Notification send error:", err));

    return result;
  },

  /**
   * Revokes an active or pending invitation.
   */
  async revokeInvitation(
    invitationId: string,
    actor: { id: string; name: string; role: string }
  ): Promise<void> {
    const invRef = doc(db, "invitations", invitationId);
    const snap = await getDoc(invRef);
    let bizId = "global";
    let targetEmail = "";

    if (snap.exists()) {
      const data = snap.data() as Invitation;
      bizId = data.business_id || data.businessId || bizId;
      targetEmail = data.email || "";
    }

    await InvitationLifecycleService.cancelInvitation(invitationId, actor);

    // Cryptographic Forensic Log
    const log = await ForensicLogRepository.createAndSignLog({
      business_id: bizId,
      action: "INVITATION_REVOKED",
      actorId: actor.id,
      userName: actor.name,
      userRole: actor.role,
      timestamp: new Date().toISOString(),
      details: JSON.stringify({
        invitationId,
        revokedBy: actor.id,
        actorName: actor.name,
        targetEmail
      })
    });
    await ForensicLogRepository.writeForensicLog(log).catch(err =>
      console.warn("[InvitationRepository] Forensic log write warning:", err)
    );

    if (bizId !== "global") {
      await NotificationEngine.send({
        businessId: bizId,
        targetRoles: ["OWNER", "MANAGER"],
        type: "WARNING",
        severity: "WARNING",
        title: "Invitation Révoquée",
        message: `L'invitation pour ${targetEmail || invitationId} a été révoquée par ${actor.name}.`,
        module: "INVITATION"
      }).catch(err => console.warn("[InvitationRepository] Notification send error:", err));
    }
  },

  /**
   * Resends an invitation (refreshes token, resets expiry to +7 days, and sets status to PENDING).
   */
  async resendInvitation(
    invitationId: string,
    actor: { id: string; name: string; role: string }
  ): Promise<Invitation> {
    const updatedInvite = await InvitationLifecycleService.resendInvitation(invitationId, actor);
    const bizId = updatedInvite.business_id || updatedInvite.businessId || "global";

    // Cryptographic Forensic Log
    const log = await ForensicLogRepository.createAndSignLog({
      business_id: bizId,
      action: "INVITATION_RESENT",
      actorId: actor.id,
      userName: actor.name,
      userRole: actor.role,
      timestamp: new Date().toISOString(),
      details: JSON.stringify({
        invitationId,
        resentBy: actor.id,
        actorName: actor.name,
        targetEmail: updatedInvite.email,
        expiresAt: updatedInvite.expiresAt
      })
    });
    await ForensicLogRepository.writeForensicLog(log).catch(err =>
      console.warn("[InvitationRepository] Forensic log write warning:", err)
    );

    if (bizId !== "global") {
      await NotificationEngine.send({
        businessId: bizId,
        targetRoles: ["OWNER", "MANAGER"],
        type: "INFO",
        severity: "INFO",
        title: "Invitation Renvoyée",
        message: `L'invitation pour ${updatedInvite.email} a été relancée et prolongée par ${actor.name}.`,
        module: "INVITATION"
      }).catch(err => console.warn("[InvitationRepository] Notification send error:", err));
    }

    return updatedInvite;
  },
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
   * Client-side invitation acceptance is disabled for security.
   * All invitation acceptances must execute via EnterpriseIdentityOrchestrator -> POST /api/invitations/accept.
   */
  async acceptInvitation(
    _invitationId: string,
    _user: { uid: string; email: string; displayName?: string; name?: string }
  ): Promise<void> {
    throw new Error(
      "CLIENT_INVITATION_ACCEPTANCE_FORBIDDEN: Invitation acceptance must execute through POST /api/invitations/accept."
    );
  },

  /**
   * Client-side invitation rejection is disabled for security.
   * All invitation rejections must execute via EnterpriseIdentityOrchestrator -> POST /api/invitations/reject.
   */
  async rejectInvitation(_invitationId: string, _user: { uid: string; email?: string }): Promise<void> {
    throw new Error(
      "CLIENT_INVITATION_REJECTION_FORBIDDEN: Invitation rejection must execute through POST /api/invitations/reject."
    );
  },

  /**
   * Finds public metadata for an invitation by document ID or token via backend lookup API
   */
  async getByTokenOrCode(code: string): Promise<Invitation | null> {
    if (!code) return null;
    try {
      const trimmed = code.trim();
      const response = await fetch(`/api/invitations/lookup?token=${encodeURIComponent(trimmed)}`);
      if (response.ok) {
        const body = await response.json();
        if (body?.success && body?.invitation) {
          const inv = body.invitation;
          return {
            id: inv.id,
            business_id: inv.businessId,
            businessId: inv.businessId,
            companyName: inv.businessName,
            role: inv.role,
            senderName: inv.senderName,
            status: inv.status,
            expiresAt: inv.expiresAt,
            email: "",
            branchId: "",
            departmentId: "",
            invitedAt: inv.expiresAt || new Date().toISOString()
          } as unknown as Invitation;
        }
      }
      return null;
    } catch (error) {
      console.warn("[InvitationRepository] Public lookup API warning:", error);
      return null;
    }
  }
};
