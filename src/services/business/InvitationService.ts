import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, getAdminAuth } from "../../lib/firebaseAdmin";
import { isInvalidTenantId } from "../../modules/workflow/approval/serverAuthMiddleware";
import {
  extractRawOperationalProfileFromRecord,
  validateRoleOperationalProfileCompatibility
} from "../../domains/rbac/operationalProfilePolicy";

export const ASSIGNABLE_INVITE_ROLES = new Set([
  "EMPLOYEE",
  "JUNIOR_TELLER",
  "SENIOR_TELLER",
  "HEAD_TELLER",
  "MASTER_HEAD_TELLER",
  "TELLER",
  "ACCOUNTANT",
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

export const INACTIVE_BUSINESS_STATUSES = new Set([
  "SUSPENDED",
  "DISABLED",
  "INACTIVE",
  "CANCELLED",
  "TERMINATED",
  "ARCHIVED",
  "DELETED"
]);

export interface AcceptInvitationResult {
  success: true;
  alreadyAccepted: boolean;
  inviteId: string;
  businessId: string;
  businessName: string;
  role: string;
  membershipId: string;
  employeeId: string;
}

function isValidFirestoreDocId(rawId: unknown): rawId is string {
  if (typeof rawId !== "string") return false;
  const trimmed = rawId.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") return false;
  if (trimmed.includes("/") || trimmed.includes("\\")) return false;
  return true;
}

export class InvitationService {
  /**
   * Helper to get Firestore instance with exact project & database binding.
   */
  private static getDb() {
    return getAdminFirestore();
  }

  /**
   * Resolves an invitation document ID safely from either an invitation doc ID or a token value.
   */
  private static async resolveInvitationDocId(db: FirebaseFirestore.Firestore, rawTokenOrId: string): Promise<string | null> {
    if (!isValidFirestoreDocId(rawTokenOrId)) {
      return null;
    }
    const cleanToken = rawTokenOrId.trim();
    const directDoc = await db.doc(`invitations/${cleanToken}`).get();
    if (directDoc.exists) {
      return directDoc.id;
    }

    const col = db.collection("invitations") as any;
    const baseQuery = col.where("token", "==", cleanToken);
    const snap = typeof baseQuery.limit === "function" ? await baseQuery.limit(1).get() : await baseQuery.get();
    if (snap && !snap.empty && Array.isArray(snap.docs) && snap.docs.length > 0) {
      return snap.docs[0].id;
    }
    return null;
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
    },
    operationalProfile?: string
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

    const compat = validateRoleOperationalProfileCompatibility(targetRole, operationalProfile, {
      allowLegacyBarberAlias: false,
      allowMissingForExecutiveOrOversight: true
    });
    if (!compat.valid) {
      throw new Error(compat.code);
    }

    const db = this.getDb();
    const inviteId = `inv_${Math.random().toString(36).substring(2, 11)}`;
    const now = FieldValue.serverTimestamp();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const normalizedEmail = email.toLowerCase().trim();

    let resolvedBusinessName = "";
    try {
      const bizDoc = await db.doc(`businesses/${businessId}`).get();
      if (bizDoc.exists) {
        resolvedBusinessName = String(bizDoc.data()?.name || bizDoc.data()?.companyName || "").trim();
      }
    } catch {
      // Non-fatal: business name enrichment is best-effort
    }

    const invitation: Record<string, any> = {
      id: inviteId,
      business_id: businessId,
      businessId: businessId,
      ...(resolvedBusinessName
        ? {
            business_name: resolvedBusinessName,
            businessName: resolvedBusinessName
          }
        : {}),
      email: normalizedEmail,
      normalizedEmail,
      role: targetRole,
      ...(compat.normalizedProfile
        ? {
            operational_profile: compat.normalizedProfile,
            operationalProfile: compat.normalizedProfile
          }
        : {}),
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
        payload: {
          inviteId,
          invitedEmail: normalizedEmail,
          role: targetRole,
          operationalProfile: compat.normalizedProfile,
          expiresAt
        },
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
    if (!isValidFirestoreDocId(tokenOrId)) return null;
    const db = this.getDb();
    const cleanToken = String(tokenOrId).trim();

    let inviteDoc = await db.doc(`invitations/${cleanToken}`).get();
    if (!inviteDoc.exists) {
      const col = db.collection("invitations") as any;
      const baseQuery = col.where("token", "==", cleanToken);
      const snap = typeof baseQuery.limit === "function" ? await baseQuery.limit(1).get() : await baseQuery.get();
      if (snap && !snap.empty && Array.isArray(snap.docs) && snap.docs.length > 0) {
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

    let businessName = String(data.businessName || data.business_name || "").trim() || "FINOPS Enterprise";
    if (businessId && isValidFirestoreDocId(businessId)) {
      try {
        const bizDoc = await db.doc(`businesses/${businessId}`).get();
        if (bizDoc.exists) {
          businessName = bizDoc.data()?.name || bizDoc.data()?.companyName || businessName;
        }
      } catch {
        // Fallback to cached/default name safely
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
   * Accepts a pending (or idempotently already-accepted by the same user) invitation
   * and creates/activates employee, membership, and user records atomically.
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
  ): Promise<AcceptInvitationResult> {
    if (!inviteId || !user?.uid || !user?.email) {
      throw new Error("MISSING_ACCEPTANCE_DETAILS");
    }

    if (!isValidFirestoreDocId(inviteId)) {
      throw new Error("INVALID_INVITATION_ID");
    }

    const db = this.getDb();
    const cleanInviteInput = inviteId.trim();
    const resolvedInviteId = (await this.resolveInvitationDocId(db, cleanInviteInput)) || cleanInviteInput;
    const now = FieldValue.serverTimestamp();
    const normalizedUserEmail = user.email.toLowerCase().trim();

    let acceptedBusinessId = "";
    let acceptedBusinessName = "";
    let acceptedRole = "";
    let acceptedMembershipId = "";
    let acceptedEmployeeId = "";
    let alreadyAccepted = false;

    await db.runTransaction(async (transaction) => {
      const inviteRef = db.doc(`invitations/${resolvedInviteId}`);
      const userRef = db.doc(`users/${user.uid}`);

      const [inviteDoc, userDoc] = await Promise.all([
        transaction.get(inviteRef),
        transaction.get(userRef)
      ]);

      if (!inviteDoc.exists) throw new Error("INVITATION_NOT_FOUND");

      const inviteData = inviteDoc.data()!;
      const rawStatus = String(inviteData.status || "").trim().toUpperCase();

      const rawExpiry = inviteData.expiresAt || inviteData.expires_at;
      if (rawExpiry && rawStatus !== "ACCEPTED") {
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
      if (!businessId || isInvalidTenantId(businessId) || !isValidFirestoreDocId(businessId)) {
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

      const existingUserData = userDoc.exists ? userDoc.data() || {} : {};
      if (userDoc.exists) {
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

      const bizRef = db.doc(`businesses/${businessId}`);
      const membershipId = `${businessId}_${user.uid}`;
      const membershipRef = db.doc(`memberships/${membershipId}`);

      const preLinkedEmpIdRaw = String(
        inviteData.employeeId || inviteData.employee_id || ""
      ).trim();
      const hasValidPreLinkedEmpId = Boolean(preLinkedEmpIdRaw && isValidFirestoreDocId(preLinkedEmpIdRaw));
      if (preLinkedEmpIdRaw && !hasValidPreLinkedEmpId) {
        throw new Error("INVALID_INVITATION_TENANT");
      }
      const preEmpRef = hasValidPreLinkedEmpId ? db.doc(`employees/${preLinkedEmpIdRaw}`) : null;

      const [bizDoc, memDoc, preEmpDoc] = await Promise.all([
        transaction.get(bizRef),
        transaction.get(membershipRef),
        preEmpRef ? transaction.get(preEmpRef) : Promise.resolve(null)
      ]);

      if (!bizDoc.exists) {
        throw new Error("BUSINESS_NOT_FOUND");
      }

      const bizData = bizDoc.data() || {};
      const bizStatus = String(bizData.status || "").trim().toUpperCase();
      if (INACTIVE_BUSINESS_STATUSES.has(bizStatus)) {
        throw new Error("BUSINESS_INACTIVE");
      }

      const businessName =
        String(
          bizData.name ||
            bizData.companyName ||
            bizData.businessName ||
            inviteData.businessName ||
            inviteData.business_name ||
            businessId
        ).trim() || businessId;

      const inviteProfileInfo = extractRawOperationalProfileFromRecord(inviteData);
      if (inviteProfileInfo.conflict) {
        throw new Error("CONFLICTING_OPERATIONAL_PROFILE_FIELDS");
      }
      const profileCompat = validateRoleOperationalProfileCompatibility(
        targetRole,
        inviteProfileInfo.rawValue,
        {
          allowLegacyBarberAlias: true,
          allowMissingForExecutiveOrOversight: true
        }
      );
      if (!profileCompat.valid) {
        throw new Error(profileCompat.code);
      }

      const profileFields = profileCompat.normalizedProfile
        ? {
            operational_profile: profileCompat.normalizedProfile,
            operationalProfile: profileCompat.normalizedProfile
          }
        : {};

      // Idempotency branch: already accepted by the SAME authenticated user
      if (rawStatus === "ACCEPTED") {
        const acceptedByUid = String(inviteData.acceptedByUid || inviteData.uid || "").trim();
        const memData = memDoc.exists ? memDoc.data() || {} : null;
        const memMatchesUser = Boolean(
          memData &&
            memData.uid === user.uid &&
            (memData.business_id === businessId || memData.businessId === businessId)
        );

        if (acceptedByUid && acceptedByUid !== user.uid) {
          throw new Error("INVITATION_NOT_PENDING");
        }
        if (!acceptedByUid && !memMatchesUser) {
          throw new Error("INVITATION_NOT_PENDING");
        }

        const existingEmpId =
          String(
            memData?.employee_id ||
              memData?.employeeId ||
              existingUserData.employee_id ||
              existingUserData.employeeId ||
              preLinkedEmpIdRaw ||
              `emp_${user.uid}`
          ).trim();

        alreadyAccepted = true;
        acceptedBusinessId = businessId;
        acceptedBusinessName = businessName;
        acceptedRole = targetRole;
        acceptedMembershipId = membershipId;
        acceptedEmployeeId = existingEmpId;
        return;
      }

      if (rawStatus !== "PENDING" && rawStatus !== "SENT") {
        throw new Error("INVITATION_NOT_PENDING");
      }

      let preEmpData: Record<string, any> | null = null;
      if (preEmpDoc && preEmpDoc.exists) {
        preEmpData = preEmpDoc.data() || {};
        const preEmpBiz = String(preEmpData.business_id || preEmpData.businessId || "").trim();
        if (preEmpBiz && preEmpBiz !== businessId) {
          throw new Error("INVALID_INVITATION_TENANT");
        }
        const preEmpUid = String(preEmpData.uid || preEmpData.firebase_uid || "").trim();
        if (preEmpUid && preEmpUid !== user.uid) {
          throw new Error("TENANT_CONFLICT_EXISTING_MEMBERSHIP");
        }
      }

      const existingMemData = memDoc.exists ? memDoc.data() || {} : null;
      const employeeId =
        (existingMemData && String(existingMemData.employee_id || existingMemData.employeeId || "").trim()) ||
        (hasValidPreLinkedEmpId ? preLinkedEmpIdRaw : "") ||
        `emp_${Math.random().toString(36).substring(2, 11)}`;

      acceptedBusinessId = businessId;
      acceptedBusinessName = businessName;
      acceptedRole = targetRole;
      acceptedMembershipId = membershipId;
      acceptedEmployeeId = employeeId;

      // 1. Update Invitation
      transaction.update(inviteRef, {
        status: "ACCEPTED",
        acceptedAt: now,
        acceptedByUid: user.uid,
        businessName,
        business_name: businessName,
        employeeId,
        employee_id: employeeId,
        updatedAt: now
      });

      // 2. Create or Activate Employee (reusing pre-linked employee record if present)
      const employeeData = {
        ...(preEmpData || {}),
        id: employeeId,
        business_id: businessId,
        businessId: businessId,
        ...(inviteData.branchId ? { branchId: inviteData.branchId } : {}),
        ...(inviteData.departmentId ? { departmentId: inviteData.departmentId } : {}),
        uid: user.uid,
        firebase_uid: user.uid,
        email: normalizedUserEmail,
        normalizedEmail: normalizedUserEmail,
        name: (preEmpData?.name && String(preEmpData.name).trim()) || user.name,
        displayName: (preEmpData?.displayName && String(preEmpData.displayName).trim()) || user.name,
        role: targetRole,
        ...profileFields,
        status: "ACTIVE",
        isActive: true,
        onboardingComplete: true,
        createdAt: preEmpData?.createdAt || now,
        updatedAt: now
      };
      transaction.set(db.doc(`employees/${employeeId}`), employeeData, { merge: true });

      // 3. Create / Merge Membership
      const membershipData = {
        id: membershipId,
        uid: user.uid,
        business_id: businessId,
        businessId: businessId,
        role: targetRole,
        ...profileFields,
        status: "ACTIVE",
        joinedAt: existingMemData?.joinedAt || now,
        updatedAt: now,
        employee_id: employeeId,
        employeeId: employeeId,
        customClaimsSynced: false
      };
      transaction.set(membershipRef, membershipData, { merge: true });

      // 4. Update User Profile
      transaction.set(
        userRef,
        {
          id: user.uid,
          uid: user.uid,
          email: normalizedUserEmail,
          name: existingUserData?.name || user.name,
          displayName: existingUserData?.displayName || user.name,
          business_id: businessId,
          businessId: businessId,
          ...(inviteData.branchId ? { branchId: inviteData.branchId, branch_id: inviteData.branchId } : {}),
          ...(inviteData.departmentId ? { departmentId: inviteData.departmentId, department_id: inviteData.departmentId } : {}),
          employee_id: employeeId,
          employeeId: employeeId,
          role: targetRole,
          ...profileFields,
          account_status: "ACTIVE",
          accountStatus: "ACTIVE",
          business_status: bizData.status || "ACTIVE",
          businessStatus: bizData.status || "ACTIVE",
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
        payload: {
          inviteId: resolvedInviteId,
          employeeId,
          role: targetRole,
          operationalProfile: profileCompat.normalizedProfile
        },
        timestamp: now,
        severity: "success"
      });
    });

    // 6. Update Custom Claims with sync state recording (also reconciles on idempotent retry)
    try {
      const auth = getAdminAuth();
      await auth.setCustomUserClaims(user.uid, {
        business_id: acceptedBusinessId,
        businessId: acceptedBusinessId,
        role: acceptedRole
      });

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
      console.error("[InvitationService] Custom Claims sync failed after Firestore write:", err?.message || err);
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

    return {
      success: true,
      alreadyAccepted,
      inviteId: resolvedInviteId,
      businessId: acceptedBusinessId,
      businessName: acceptedBusinessName,
      role: acceptedRole,
      membershipId: acceptedMembershipId,
      employeeId: acceptedEmployeeId
    };
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

