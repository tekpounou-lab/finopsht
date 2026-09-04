
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, getAdminAuth } from "../../lib/firebaseAdmin";
import firebaseConfig from "../../../firebase-applet-config.json";

export class InvitationService {
  /**
   * Helper to get Firestore instance with exact project & database binding.
   */
  private static getDb() {
    return getAdminFirestore();
  }

  /**
   * Sends an invitation to a colleague.
   */
  static async sendInvitation(
    businessId: string, 
    email: string, 
    role: string,
    sender: { uid: string; name: string }
  ): Promise<string> {
    const db = this.getDb();
    const inviteId = `inv_${Math.random().toString(36).substring(2, 11)}`;
    const now = FieldValue.serverTimestamp();

    const invitation = {
      id: inviteId,
      business_id: businessId,
      email: email.toLowerCase().trim(),
      role: role || "EMPLOYEE",
      status: "PENDING",
      senderId: sender.uid,
      senderName: sender.name,
      createdAt: now,
      updatedAt: now
    };

    await db.doc(`invitations/${inviteId}`).set(invitation);

    // Audit Log
    await db.collection("forensic_logs").add({
      business_id: businessId,
      userId: sender.uid,
      userName: sender.name,
      action: "INVITATION_SENT",
      payload: { inviteId, invitedEmail: email },
      timestamp: now,
      severity: "info"
    });

    return inviteId;
  }

  /**
   * Accepts a pending invitation and creates employee/membership records.
   */
  static async acceptInvitation(inviteId: string, user: { uid: string; email: string; name: string }): Promise<void> {
    const db = this.getDb();
    const now = FieldValue.serverTimestamp();

    await db.runTransaction(async (transaction) => {
      const inviteDoc = await transaction.get(db.doc(`invitations/${inviteId}`));
      if (!inviteDoc.exists) throw new Error("INVITATION_NOT_FOUND");
      
      const inviteData = inviteDoc.data()!;
      if (inviteData.status !== "PENDING") throw new Error("INVITATION_NOT_PENDING");

      const businessId = inviteData.business_id;
      const employeeId = `emp_${Math.random().toString(36).substring(2, 11)}`;
      const membershipId = `${businessId}_${user.uid}`;

      // 1. Update Invitation
      transaction.update(db.doc(`invitations/${inviteId}`), {
        status: "ACCEPTED",
        acceptedAt: now,
        acceptedByUid: user.uid,
        updatedAt: now
      });

      // 2. Create Employee
      const employeeData = {
        id: employeeId,
        business_id: businessId,
        uid: user.uid,
        firebase_uid: user.uid,
        email: user.email.toLowerCase().trim(),
        name: user.name,
        role: inviteData.role,
        status: "ACTIVE",
        isActive: true,
        createdAt: now,
        updatedAt: now
      };
      transaction.set(db.doc(`employees/${employeeId}`), employeeData);

      // 3. Create Membership
      const membershipData = {
        id: membershipId,
        uid: user.uid,
        business_id: businessId,
        role: inviteData.role,
        status: "ACTIVE",
        joinedAt: now,
        updatedAt: now,
        employee_id: employeeId
      };
      transaction.set(db.doc(`memberships/${membershipId}`), membershipData);

      // 4. Update User Profile
      transaction.set(db.doc(`users/${user.uid}`), {
        business_id: businessId,
        employee_id: employeeId,
        role: inviteData.role,
        account_status: "ACTIVE",
        onboarding_completed: true,
        updatedAt: now
      }, { merge: true });

      // 5. Audit Log
      transaction.set(db.collection("forensic_logs").doc(), {
        business_id: businessId,
        userId: user.uid,
        userName: user.name,
        action: "INVITATION_ACCEPTED",
        payload: { inviteId, employeeId },
        timestamp: now,
        severity: "success"
      });
    });

    // 6. Update Custom Claims
    const auth = getAdminAuth();
    const inviteDoc = await db.doc(`invitations/${inviteId}`).get();
    const inviteData = inviteDoc.data()!;
    await auth.setCustomUserClaims(user.uid, {
      business_id: inviteData.business_id,
      role: inviteData.role
    });
  }

  /**
   * Rejects an invitation.
   */
  static async rejectInvitation(inviteId: string, userId: string): Promise<void> {
    const db = this.getDb();
    const now = FieldValue.serverTimestamp();

    await db.doc(`invitations/${inviteId}`).update({
      status: "REJECTED",
      rejectedAt: now,
      rejectedByUid: userId,
      updatedAt: now
    });
  }
}
