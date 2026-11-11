import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, getAdminAuth } from "../../lib/firebaseAdmin";
import { isInvalidTenantId } from "../../modules/workflow/approval/serverAuthMiddleware";

export const ASSIGNABLE_INVITE_ROLES = new Set([
  "EMPLOYEE",
  "JUNIOR_TELLER",
  "SENIOR_TELLER",
  "HEAD_TELLER",
  "TELLER",
  "AUDITOR",
  "MANAGER",
  "ADMIN",
  "OWNER"
]);

export const INVITE_SENDER_ROLES = new Set([
  "OWNER",
  "ADMIN",
  "MANAGER",
  "SUPER_ADMIN"
]);

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
    sender: {
      uid: string;
      name: string;
      role?: string;
      business_id?: string;
      isSuperAdmin?: boolean;
    }
  ): Promise<string> {
    if (!businessId || !email || !sender?.uid) {
      throw new Error("MISSING_INVITATION_DETAILS");
    }

    if (!sender.isSuperAdmin && (!sender.business_id || sender.business_id !== businessId)) {
      throw new Error("FORBIDDEN_TENANT_ACCESS");
    }

    const senderRole = (sender.role || "").trim().toUpperCase();
    if (!sender.isSuperAdmin && (!senderRole || !INVITE_SENDER_ROLES.has(senderRole))) {
      throw new Error("FORBIDDEN_ROLE");
    }

    const targetRole = (role || "EMPLOYEE").trim().toUpperCase();
    if (targetRole === "SUPER_ADMIN" || !ASSIGNABLE_INVITE_ROLES.has(targetRole)) {
      throw new Error("FORBIDDEN_ROLE_ASSIGNMENT");
    }

    if (
      !sender.isSuperAdmin &&
      senderRole === "MANAGER" &&
      (targetRole === "OWNER" || targetRole === "ADMIN")
    ) {
      throw new Error("FORBIDDEN_ROLE_ASSIGNMENT");
    }

    const db = this.getDb();
    const inviteId = `inv_${Math.random().toString(36).substring(2, 11)}`;
    const now = FieldValue.serverTimestamp();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const normalizedEmail = email.toLowerCase().trim();

    const invitation = {
      id: inviteId,
      business_id: businessId,
      businessId: businessId,
      email: normalizedEmail,
      normalizedEmail,
      role: targetRole,
      status: "PENDING",
      senderId: sender.uid,
      senderName: sender.name,
      expiresAt,
      createdAt: now,
      updatedAt: now
    };

    await db.runTransaction(async (transaction) => {
      const inviteRef = db.doc(`invitations/${inviteId}`);
      transaction.set(inviteRef, invitation);
      transaction.set(db.collection("forensic_logs").doc(), {
        business_id: businessId,
        businessId: businessId,
        userId: sender.uid,
        userName: sender.name,
        action: "INVITATION_SENT",
        payload: { inviteId, invitedEmail: normalizedEmail, role: targetRole, expiresAt },
        timestamp: now,
        severity: "info"
      });
    });

    return inviteId;
  }

  /**
   * Retrieves public metadata for an invitation by ID or token.
   * Returns only sanitized public display fields (no secrets, UIDs, or internal PII).
   */
  static async getInvitationPublicMetadata(tokenOrId: string): Promise<{
    id: string;
    businessId: string;
    businessName: string;
    role: string;
    senderName: string;
    status: string;
    expiresAt?: string;
    isExpired: boolean;
  } | null> {
    if (!tokenOrId) return null;
    const db = this.getDb();
    const cleanToken = String(tokenOrId).trim();

    let inviteDoc = await db.doc(`invitations/${cleanToken}`).get();
    if (!inviteDoc.exists) {
      const snap = await db.collection("invitations").where("token", "==", cleanToken).limit(1).get();
      if (!snap.empty) {
        inviteDoc = snap.docs[0];
      }
    }

    if (!inviteDoc.exists) {
      return null;
    }

    const data = inviteDoc.data() || {};
    const businessId = String(data.businessId || data.business_id || "");
    const rawExpiry = data.expiresAt || data.expires_at;
    let isExpired = false;
    let expiresAtIso: string | undefined = undefined;

    if (rawExpiry) {
      const expiryMs = typeof rawExpiry?.toMillis === "function" ? rawExpiry.toMillis() : Date.parse(String(rawExpiry));
      if (!Number.isNaN(expiryMs)) {
        expiresAtIso = new Date(expiryMs).toISOString();
        if (expiryMs < Date.now()) {
          isExpired = true;
        }
      }
    }

    let businessName = "FINOPS Enterprise";
    if (businessId) {
      try {
        const bizDoc = await db.doc(`businesses/${businessId}`).get();
        if (bizDoc.exists) {
          businessName = bizDoc.data()?.name || bizDoc.data()?.companyName || businessName;
        }
      } catch (e) {
        // Fallback to default name safely
      }
    }

    return {
      id: inviteDoc.id,
      businessId,
      businessName,
      role: String(data.role || "EMPLOYEE").toUpperCase(),
      senderName: String(data.senderName || "Un administrateur"),
      status: String(data.status || "PENDING").toUpperCase(),
      expiresAt: expiresAtIso,
      isExpired
    };
  }

  /**
   * Accepts a pending invitation and creates employee/membership records.
   */
  static async acceptInvitation(
    inviteId: string,
    user: {
      uid: string;
      email: string;
      name: string;
      emailVerified?: boolean;
      existingBusinessId?: string;
      isSuperAdmin?: boolean;
    }
  ): Promise<void> {
    if (!inviteId || !user?.uid || !user?.email) {
      throw new Error("MISSING_ACCEPTANCE_DETAILS");
    }

    if (user.emailVerified !== true) {
      throw new Error("EMAIL_VERIFICATION_REQUIRED");
    }

    const db = this.getDb();
    const now = FieldValue.serverTimestamp();
    const normalizedUserEmail = user.email.toLowerCase().trim();

    let acceptedBusinessId = "";
    let acceptedRole = "";
    let acceptedMembershipId = "";

    await db.runTransaction(async (transaction) => {
      const inviteRef = db.doc(`invitations/${inviteId}`);
      const userRef = db.doc(`users/${user.uid}`);

      const [inviteDoc, userDoc] = await Promise.all([
        transaction.get(inviteRef),
        transaction.get(userRef)
      ]);

      if (!inviteDoc.exists) throw new Error("INVITATION_NOT_FOUND");

      const inviteData = inviteDoc.data()!;
      if (inviteData.status !== "PENDING") throw new Error("INVITATION_NOT_PENDING");

      const rawExpiry = inviteData.expiresAt || inviteData.expires_at;
      if (rawExpiry) {
        const expiryMs =
          typeof rawExpiry?.toMillis === "function"
            ? rawExpiry.toMillis()
            : Date.parse(String(rawExpiry));
        if (!Number.isNaN(expiryMs) && expiryMs < Date.now()) {
          throw new Error("INVITATION_EXPIRED");
        }
      }

      const invitedEmail = String(
        inviteData.email || inviteData.normalizedEmail || ""
      )
        .toLowerCase()
        .trim();
      if (!invitedEmail || invitedEmail !== normalizedUserEmail) {
        throw new Error("INVITATION_RECIPIENT_MISMATCH");
      }

      const targetRole = String(inviteData.role || "EMPLOYEE")
        .trim()
        .toUpperCase();
      if (targetRole === "SUPER_ADMIN" || !ASSIGNABLE_INVITE_ROLES.has(targetRole)) {
        throw new Error("FORBIDDEN_ROLE_ASSIGNMENT");
      }

      const invBizSnake =
        typeof inviteData.business_id === "string" ? inviteData.business_id.trim() : "";
      const invBizCamel =
        typeof inviteData.businessId === "string" ? inviteData.businessId.trim() : "";
      if (invBizSnake && invBizCamel && invBizSnake !== invBizCamel) {
        throw new Error("INVALID_INVITATION_TENANT");
      }

      const businessId = invBizSnake || invBizCamel || "";
      if (!businessId || isInvalidTenantId(businessId)) {
        throw new Error("INVALID_INVITATION_TENANT");
      }

      const callerClaimBiz =
        typeof user.existingBusinessId === "string" ? user.existingBusinessId.trim() : "";
      if (
        callerClaimBiz &&
        !isInvalidTenantId(callerClaimBiz) &&
        callerClaimBiz !== businessId
      ) {
        throw new Error("TENANT_CONFLICT_EXISTING_MEMBERSHIP");
      }

      if (userDoc.exists) {
        const existingUserData = userDoc.data() || {};
        const uBiz1 =
          typeof existingUserData.business_id === "string" ? existingUserData.business_id.trim() : "";
        const uBiz2 =
          typeof existingUserData.businessId === "string" ? existingUserData.businessId.trim() : "";
        if (
          uBiz1 &&
          uBiz2 &&
          !isInvalidTenantId(uBiz1) &&
          !isInvalidTenantId(uBiz2) &&
          uBiz1 !== uBiz2
        ) {
          throw new Error("TENANT_CONFLICT_EXISTING_MEMBERSHIP");
        }
        const existingBizId = uBiz1 || uBiz2;
        const existingBizStatus = String(
          existingUserData.businessStatus || existingUserData.business_status || ""
        ).toUpperCase();
        if (
          existingBizId &&
          !isInvalidTenantId(existingBizId) &&
          existingBizId !== businessId &&
          existingBizStatus !== "CANCELLED"
        ) {
          throw new Error("TENANT_CONFLICT_EXISTING_MEMBERSHIP");
        }
      }

      acceptedBusinessId = businessId;
      acceptedRole = targetRole;

      const employeeId = `emp_${Math.random().toString(36).substring(2, 11)}`;
      const membershipId = `${businessId}_${user.uid}`;
      acceptedMembershipId = membershipId;

      // 1. Update Invitation
      transaction.update(inviteRef, {
        status: "ACCEPTED",
        acceptedAt: now,
        acceptedByUid: user.uid,
        updatedAt: now
      });

      // 2. Create Employee
      const employeeData = {
        id: employeeId,
        business_id: businessId,
        businessId: businessId,
        uid: user.uid,
        firebase_uid: user.uid,
        email: normalizedUserEmail,
        normalizedEmail: normalizedUserEmail,
        name: user.name,
        role: targetRole,
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
        businessId: businessId,
        role: targetRole,
        status: "ACTIVE",
        joinedAt: now,
        updatedAt: now,
        employee_id: employeeId,
        customClaimsSynced: false
      };
      transaction.set(db.doc(`memberships/${membershipId}`), membershipData);

      // 4. Update User Profile
      transaction.set(
        userRef,
        {
          business_id: businessId,
          businessId: businessId,
          employee_id: employeeId,
          employeeId: employeeId,
          role: targetRole,
          account_status: "ACTIVE",
          accountStatus: "ACTIVE",
          onboarding_completed: true,
          onboardingComplete: true,
          customClaimsSynced: false,
          updatedAt: now
        },
        { merge: true }
      );

      // 5. Audit Log
      transaction.set(db.collection("forensic_logs").doc(), {
        business_id: businessId,
        businessId: businessId,
        userId: user.uid,
        userName: user.name,
        action: "INVITATION_ACCEPTED",
        payload: { inviteId, employeeId, role: targetRole },
        timestamp: now,
        severity: "success"
      });
    });

    // 6. Update Custom Claims with sync state recording
    try {
      const auth = getAdminAuth();
      await auth.setCustomUserClaims(user.uid, {
        business_id: acceptedBusinessId,
        businessId: acceptedBusinessId,
        role: acceptedRole
      });

      // Record successful claims sync in Firestore
      const syncNow = FieldValue.serverTimestamp();
      await Promise.all([
        db.doc(`users/${user.uid}`).update({
          customClaimsSynced: true,
          customClaimsSyncedAt: syncNow,
          customClaimsError: null
        }),
        db.doc(`memberships/${acceptedMembershipId}`).update({
          customClaimsSynced: true,
          customClaimsSyncedAt: syncNow,
          customClaimsError: null
        })
      ]);
    } catch (err: any) {
      console.error("[InvitationService] Custom Claims sync failed after Firestore write:", err);
      const errMessage = err?.message || String(err);
      const syncNow = FieldValue.serverTimestamp();
      await Promise.all([
        db.doc(`users/${user.uid}`).update({
          customClaimsSynced: false,
          customClaimsError: errMessage,
          customClaimsFailedAt: syncNow
        }).catch(() => {}),
        db.doc(`memberships/${acceptedMembershipId}`).update({
          customClaimsSynced: false,
          customClaimsError: errMessage,
          customClaimsFailedAt: syncNow
        }).catch(() => {})
      ]);
      throw new Error("CUSTOM_CLAIMS_SYNC_FAILED");
    }
  }

  /**
   * Idempotent reconciliation of Firebase Auth Custom Claims with Firestore User Profile / Membership.
   */
  static async reconcileCustomClaims(
    targetUid: string,
    actor: { uid: string; isSuperAdmin?: boolean }
  ): Promise<{ success: boolean; businessId: string; role: string }> {
    if (!targetUid || !actor?.uid) {
      throw new Error("MISSING_RECONCILIATION_DETAILS");
    }

    if (!actor.isSuperAdmin && actor.uid !== targetUid) {
      throw new Error("UNAUTHORIZED_RECONCILIATION_ATTEMPT");
    }

    const db = this.getDb();
    const userDoc = await db.doc(`users/${targetUid}`).get();
    if (!userDoc.exists) {
      throw new Error("USER_PROFILE_NOT_FOUND");
    }

    const userData = userDoc.data() || {};
    const businessId = String(userData.business_id || userData.businessId || "").trim();
    const role = String(userData.role || "").trim().toUpperCase();

    if (!businessId || isInvalidTenantId(businessId) || !role) {
      throw new Error("NO_VALID_TENANT_MEMBERSHIP");
    }

    const membershipId = `${businessId}_${targetUid}`;
    const memDoc = await db.doc(`memberships/${membershipId}`).get();
    if (!memDoc.exists) {
      throw new Error("MEMBERSHIP_RECORD_NOT_FOUND");
    }

    const memData = memDoc.data() || {};
    if (memData.uid !== targetUid || (memData.business_id !== businessId && memData.businessId !== businessId)) {
      throw new Error("TENANT_MEMBERSHIP_MISMATCH");
    }

    const auth = getAdminAuth();
    await auth.setCustomUserClaims(targetUid, {
      business_id: businessId,
      businessId: businessId,
      role: role
    });

    const now = FieldValue.serverTimestamp();
    await Promise.all([
      db.doc(`users/${targetUid}`).update({
        customClaimsSynced: true,
        customClaimsSyncedAt: now,
        customClaimsError: null
      }),
      db.doc(`memberships/${membershipId}`).update({
        customClaimsSynced: true,
        customClaimsSyncedAt: now,
        customClaimsError: null
      })
    ]);

    return {
      success: true,
      businessId,
      role
    };
  }

  /**
   * Rejects an invitation after verifying status and recipient/admin authorization inside a transaction.
   */
  static async rejectInvitation(
    inviteId: string,
    actor:
      | string
      | {
          uid: string;
          email?: string;
          emailVerified?: boolean;
          role?: string;
          business_id?: string;
          isSuperAdmin?: boolean;
        }
  ): Promise<void> {
    if (!inviteId || !actor) {
      throw new Error("MISSING_REJECTION_DETAILS");
    }

    const actorObj = typeof actor === "string" ? { uid: actor } : actor;
    const db = this.getDb();
    const now = FieldValue.serverTimestamp();

    await db.runTransaction(async (transaction) => {
      const inviteRef = db.doc(`invitations/${inviteId}`);
      const inviteDoc = await transaction.get(inviteRef);
      if (!inviteDoc.exists) throw new Error("INVITATION_NOT_FOUND");

      const inviteData = inviteDoc.data()!;
      if (inviteData.status !== "PENDING") {
        throw new Error("INVITATION_NOT_PENDING");
      }

      const inviteEmail = String(
        inviteData.email || inviteData.normalizedEmail || ""
      )
        .toLowerCase()
        .trim();
      const inviteBizId = inviteData.business_id || inviteData.businessId || "";
      const actorEmail = (actorObj.email || "").toLowerCase().trim();
      const actorRole = (actorObj.role || "").trim().toUpperCase();

      const isAuthorizedTenantAdmin = Boolean(
        actorObj.isSuperAdmin ||
          (inviteBizId &&
            actorObj.business_id === inviteBizId &&
            INVITE_SENDER_ROLES.has(actorRole))
      );
      const isRecipient = Boolean(
        actorEmail &&
          inviteEmail &&
          actorEmail === inviteEmail &&
          actorObj.emailVerified !== false
      );

      if (!isRecipient && !isAuthorizedTenantAdmin) {
        if (actorEmail && inviteEmail && actorEmail === inviteEmail && actorObj.emailVerified === false) {
          throw new Error("EMAIL_VERIFICATION_REQUIRED");
        }
        throw new Error("UNAUTHORIZED_INVITATION_ACTION");
      }

      transaction.update(inviteRef, {
        status: "REJECTED",
        rejectedAt: now,
        rejectedByUid: actorObj.uid,
        updatedAt: now
      });
    });
  }
}

