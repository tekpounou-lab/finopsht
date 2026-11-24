import type { Firestore } from "firebase-admin/firestore";
import crypto from "crypto";
import { FinopsException } from "../../modules/runtime/FinopsException";
import { AuthenticatedUser } from "../../modules/workflow/approval/serverAuthMiddleware";
import {
  AttendanceActionKind,
  AttendanceAuthorizationDecision,
  TrustedAttendanceActor,
  TrustedAttendanceTarget,
  authorizeAttendanceAction,
  extractCanonicalBranchId,
  extractCanonicalBusinessId,
  extractCanonicalDepartmentId,
  isEntityInactive,
  isInvalidAttendanceTenantId,
  normalizeCanonicalAttendanceRole
} from "./AttendanceAuthorizationService";
import { toDateOnly } from "../../utils/dateNormalization";

export interface ServerAttendanceCheckInInput {
  employeeId: string;
  businessId?: string;
  business_id?: string;
  branchId?: string;
  branch_id?: string;
  method?: "QR" | "NFC" | "MANUAL" | "BIOMETRIC";
  deviceId?: string;
  location?: string;
  locationGeo?: { latitude: number; longitude: number; accuracy?: number } | null;
  deviceDate?: string;
  deviceTime?: string;
  deviceTimezone?: string;
  deviceInfo?: string;
  actorId?: string;
  actor?: { id?: string; name?: string; role?: string } | null;
  recordedBy?: string;
  badgeId?: string;
  qrSignature?: string;
  badgePayload?: string | Record<string, unknown> | null;
  overrideTimestamp?: string | Date;
}

export interface ServerAttendanceCheckOutInput {
  sessionId?: string;
  employeeId?: string;
  businessId?: string;
  business_id?: string;
  method?: "QR" | "NFC" | "MANUAL" | "BIOMETRIC";
  deviceId?: string;
  locationGeo?: { latitude: number; longitude: number; accuracy?: number } | null;
  deviceDate?: string;
  deviceTime?: string;
  deviceTimezone?: string;
  deviceInfo?: string;
  actorId?: string;
  actor?: { id?: string; name?: string; role?: string } | null;
  recordedBy?: string;
  badgeId?: string;
  qrSignature?: string;
  badgePayload?: string | Record<string, unknown> | null;
  overrideTimestamp?: string | Date;
}

export interface ServerAttendanceOverrideInput {
  recordId?: string;
  employeeId: string;
  businessId?: string;
  business_id?: string;
  date: string;
  checkIn?: string;
  checkOut?: string | null;
  status?: string;
  reason: string;
  actorId?: string;
  actor?: { id?: string; name?: string; role?: string } | null;
}

export interface ServerAttendanceBulkImportInput {
  businessId?: string;
  business_id?: string;
  records: Array<{
    id?: string;
    employeeId: string;
    date: string;
    checkIn?: string | null;
    checkOut?: string | null;
    plannedHours?: number;
    realHours?: number;
    variance?: number;
    status?: string;
    overrideReason?: string;
    branchId?: string;
    departmentId?: string;
  }>;
  actorId?: string;
  actor?: { id?: string; name?: string; role?: string } | null;
}

export interface ServerAttendanceDeleteInput {
  recordIds: string[];
  businessId?: string;
  business_id?: string;
  reason?: string;
  actorId?: string;
  actor?: { id?: string; name?: string; role?: string } | null;
}

export interface ServerAttendanceCreateAdjustmentInput {
  sessionId: string;
  employeeId: string;
  businessId?: string;
  business_id?: string;
  requestedHours: number;
  reason: string;
  actorId?: string;
  actor?: { id?: string; name?: string; role?: string } | null;
}

export interface ServerAttendanceApproveAdjustmentInput {
  requestId: string;
  decision?: "APPROVED" | "REJECTED";
  rejectionReason?: string;
  businessId?: string;
  business_id?: string;
  actorId?: string;
  actor?: { id?: string; name?: string; role?: string } | null;
}

const LOCKED_PAYROLL_STATUSES = new Set<string>([
  "LOCKED",
  "PESSIMISTIC_LOCKED",
  "SEALED",
  "PAID"
]);

function formatUtcDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatUtcTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function normalizeStringArray(val: unknown): string[] | null {
  if (!Array.isArray(val)) return null;
  const cleaned = val
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());
  return cleaned.length > 0 ? cleaned : null;
}

function toRecordData(snap: any): Record<string, any> | null {
  if (!snap || !snap.exists) return null;
  const data = typeof snap.data === "function" ? snap.data() : null;
  return data ? { id: snap.id, ...data } : null;
}

function buildAuditDoc(params: {
  businessId: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetEmployeeId?: string;
  result: "SUCCESS" | "REFUSED";
  errorCode?: string;
  details: string;
  metadata?: Record<string, unknown>;
}): { auditId: string; payload: Record<string, unknown> } {
  const nowIso = new Date().toISOString();
  const auditId = `aud_att_${crypto.randomUUID()}`;
  return {
    auditId,
    payload: {
      id: auditId,
      business_id: params.businessId || "global",
      businessId: params.businessId || "global",
      module: "ATTENDANCE",
      action: params.action,
      result: params.result,
      errorCode: params.errorCode || null,
      actorId: params.actorId,
      actorName: params.actorName,
      actorRole: params.actorRole,
      targetEmployeeId: params.targetEmployeeId || null,
      details: params.details,
      metadata: params.metadata || null,
      timestamp: nowIso,
      createdAt: nowIso
    }
  };
}

function sanitizeIdempotencyKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return crypto.createHash("sha256").update(trimmed).digest("hex").slice(0, 32);
}

export const ServerAttendanceService = {
  recordAuditEventInTransaction(
    transaction: any,
    adminDb: Firestore,
    params: {
      businessId: string;
      actorId: string;
      actorName: string;
      actorRole: string;
      action: string;
      targetEmployeeId?: string;
      result: "SUCCESS" | "REFUSED";
      errorCode?: string;
      details: string;
      metadata?: Record<string, unknown>;
    }
  ): string {
    const { auditId, payload } = buildAuditDoc(params);
    // Mandatory transactional audit: NO try/catch swallowing so failure aborts transaction
    transaction.set(adminDb.collection("audit_logs").doc(auditId), payload);
    return auditId;
  },

  async recordAuditEvent(
    adminDb: Firestore,
    params: {
      businessId: string;
      actorId: string;
      actorName: string;
      actorRole: string;
      action: string;
      targetEmployeeId?: string;
      result: "SUCCESS" | "REFUSED";
      errorCode?: string;
      details: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    try {
      const { auditId, payload } = buildAuditDoc(params);
      await adminDb.collection("audit_logs").doc(auditId).set(payload);
    } catch (err) {
      console.warn("[ServerAttendanceService] Audit log write warning:", err);
    }
  },

  async resolveTrustedActor(
    adminDb: Firestore,
    reqUser: AuthenticatedUser
  ): Promise<TrustedAttendanceActor> {
    const uid = typeof reqUser.uid === "string" ? reqUser.uid.trim() : "";
    if (!uid) {
      throw new FinopsException("UNAUTHORIZED", "Authenticated actor UID is missing.");
    }

    const userSnap = await adminDb.collection("users").doc(uid).get();
    const userData = toRecordData(userSnap);

    if (userData && isEntityInactive(userData)) {
      throw new FinopsException("INACTIVE_ACTOR", "Actor user profile is inactive or suspended.");
    }

    // Attempt to locate actor's employee record for branch/department/team scoping
    let empData: Record<string, any> | null = null;
    const directEmpSnap = await adminDb.collection("employees").doc(uid).get();
    empData = toRecordData(directEmpSnap);

    if (!empData) {
      const empIdHint =
        (typeof userData?.employeeId === "string" && userData.employeeId.trim()) ||
        (typeof userData?.employee_id === "string" && userData.employee_id.trim()) ||
        null;
      if (empIdHint) {
        const hintSnap = await adminDb.collection("employees").doc(empIdHint).get();
        empData = toRecordData(hintSnap);
      }
    }

    if (!empData) {
      try {
        const byFirebaseUidSnap = await adminDb
          .collection("employees")
          .where("firebase_uid", "==", uid)
          .limit(1)
          .get();
        if (!byFirebaseUidSnap.empty) {
          empData = toRecordData(byFirebaseUidSnap.docs[0]);
        }
      } catch {
        // Fallback index tolerance
      }
    }

    const tokenBiz = !isInvalidAttendanceTenantId(reqUser.business_id)
      ? reqUser.business_id.trim()
      : null;
    const docBiz = extractCanonicalBusinessId(userData);
    const empBiz = extractCanonicalBusinessId(empData);

    // Reject tenant conflicts across trusted sources
    if (tokenBiz && docBiz && tokenBiz !== docBiz) {
      throw new FinopsException(
        "CROSS_TENANT_ATTENDANCE_DENIED",
        "Actor token business_id conflicts with user profile business_id."
      );
    }

    const canonicalActorBiz = tokenBiz || docBiz || empBiz || null;
    const tokenRole = normalizeCanonicalAttendanceRole(reqUser.role);
    const docRole = normalizeCanonicalAttendanceRole(userData?.role);

    if (!reqUser.isSuperAdmin && tokenRole && docRole && tokenRole !== docRole) {
      throw new FinopsException(
        "ROLE_SPOOFING_DETECTED",
        "Actor role claim conflicts with persisted user role."
      );
    }

    const effectiveRole = reqUser.isSuperAdmin
      ? "SUPER_ADMIN"
      : docRole || tokenRole || normalizeCanonicalAttendanceRole(empData?.role);

    if (!effectiveRole) {
      throw new FinopsException("INVALID_OR_MISSING_ROLE", "Actor lacks a valid canonical role.");
    }

    if (empData && isEntityInactive(empData)) {
      throw new FinopsException("INACTIVE_ACTOR", "Actor employee record is inactive or suspended.");
    }

    const actorBranch =
      extractCanonicalBranchId(empData) ||
      extractCanonicalBranchId(userData) ||
      (typeof reqUser.branch_id === "string" && reqUser.branch_id.trim() ? reqUser.branch_id.trim() : null);

    const actorDept =
      extractCanonicalDepartmentId(empData) || extractCanonicalDepartmentId(userData);

    // GAP-ATT-01: Read delegation and multi-branch/team scope EXCLUSIVELY from server-protected users/{uid}
    // (Never trust mutable self-profile employee fields for authorization expansion)
    const explicitAttendanceDelegation =
      userData?.explicitAttendanceDelegation === true ||
      userData?.attendanceDelegated === true ||
      (Array.isArray(userData?.permissions) &&
        userData.permissions.includes("attendance.delegate_others"));

    return {
      uid,
      email: reqUser.email || userData?.email || null,
      displayName: userData?.displayName || userData?.name || empData?.name || reqUser.email || uid,
      role: effectiveRole,
      business_id: canonicalActorBiz,
      businessId: canonicalActorBiz,
      isSuperAdmin: Boolean(reqUser.isSuperAdmin),
      employeeId: empData?.id || userData?.employeeId || null,
      branchId: actorBranch,
      departmentId: actorDept,
      authorizedBranchIds:
        normalizeStringArray(userData?.authorizedBranchIds) ||
        normalizeStringArray(userData?.authorizedBranches) ||
        null,
      authorizedDepartmentIds:
        normalizeStringArray(userData?.authorizedDepartmentIds) || null,
      authorizedTeamIds:
        normalizeStringArray(userData?.authorizedTeamIds) || null,
      delegatedEmployeeIds:
        normalizeStringArray(userData?.delegatedEmployeeIds) || null,
      delegatedBranchIds:
        normalizeStringArray(userData?.delegatedBranchIds) || null,
      explicitAttendanceDelegation,
      status: userData?.status || empData?.status || "ACTIVE"
    };
  },

  async resolveTrustedTargetEmployee(
    adminDb: Firestore,
    employeeId: string,
    actor: TrustedAttendanceActor
  ): Promise<TrustedAttendanceTarget> {
    const cleanEmpId = typeof employeeId === "string" ? employeeId.trim() : "";
    if (!cleanEmpId) {
      throw new FinopsException("TARGET_EMPLOYEE_NOT_FOUND", "Target employeeId is required.");
    }

    let empData: Record<string, any> | null = null;

    // 1. Canonical root employees/{employeeId}
    const rootEmpSnap = await adminDb.collection("employees").doc(cleanEmpId).get();
    empData = toRecordData(rootEmpSnap);

    // 2. Legacy business subcollection businesses/{bizId}/employees/{employeeId}
    if (!empData && actor.business_id) {
      const subEmpSnap = await adminDb
        .collection("businesses")
        .doc(actor.business_id)
        .collection("employees")
        .doc(cleanEmpId)
        .get();
      empData = toRecordData(subEmpSnap);
    }

    // 3. Query employees where firebase_uid == cleanEmpId or uid == cleanEmpId
    if (!empData) {
      try {
        const q = await adminDb
          .collection("employees")
          .where("firebase_uid", "==", cleanEmpId)
          .limit(1)
          .get();
        if (!q.empty) {
          empData = toRecordData(q.docs[0]);
        }
      } catch {
        // Ignore query fallback errors
      }
    }

    // 4. Self-service fallback ONLY when target is actor's own UID and user profile exists with canonical business_id
    if (!empData && cleanEmpId === actor.uid) {
      const selfUserSnap = await adminDb.collection("users").doc(actor.uid).get();
      const selfUserData = toRecordData(selfUserSnap);
      if (selfUserData) {
        empData = {
          ...selfUserData,
          id: actor.uid,
          uid: actor.uid,
          firebase_uid: actor.uid,
          name: selfUserData.displayName || selfUserData.name || actor.displayName || actor.email || actor.uid
        };
      }
    }

    if (!empData) {
      throw new FinopsException(
        "TARGET_EMPLOYEE_NOT_FOUND",
        `Trusted employee record for '${cleanEmpId}' was not found.`
      );
    }

    // Fail closed if trusted employee record lacks canonical business_id (NO silent fallback!)
    const canonicalBizId = extractCanonicalBusinessId(empData);
    if (!canonicalBizId) {
      throw new FinopsException(
        "MISSING_TARGET_TENANT_CONTEXT",
        "Target employee record is missing a valid canonical business_id."
      );
    }

    return {
      id: empData.id || cleanEmpId,
      uid: empData.uid || null,
      firebase_uid: empData.firebase_uid || null,
      userId: empData.userId || null,
      email: empData.email || null,
      name: empData.name || empData.displayName || empData.fullName || cleanEmpId,
      role: empData.role || null,
      business_id: canonicalBizId,
      businessId: canonicalBizId,
      branchId: extractCanonicalBranchId(empData),
      departmentId: extractCanonicalDepartmentId(empData),
      managerId: typeof empData.managerId === "string" ? empData.managerId.trim() : null,
      supervisorId: typeof empData.supervisorId === "string" ? empData.supervisorId.trim() : null,
      status: empData.status || "ACTIVE",
      active: empData.active
    };
  },

  async verifyBadgeIfProvided(
    adminDb: Firestore,
    canonicalBusinessId: string,
    targetEmployeeId: string,
    params: {
      method?: string;
      badgeId?: string;
      qrSignature?: string;
      badgePayload?: string | Record<string, unknown> | null;
    }
  ): Promise<void> {
    const normalizedMethod = String(params.method || "QR").trim().toUpperCase();
    const isBadgeMethod = normalizedMethod === "QR" || normalizedMethod === "NFC";
    const hasBadgeData = Boolean(
      params.badgeId || params.qrSignature || params.badgePayload
    );

    // GAP-ATT-07: QR and NFC methods MUST NEVER skip cryptographic verification when badge fields are omitted
    if (!isBadgeMethod && !hasBadgeData) return;

    let parsedPayload: Record<string, unknown> | null = null;
    if (typeof params.badgePayload === "string" && params.badgePayload.trim()) {
      try {
        parsedPayload = JSON.parse(params.badgePayload);
      } catch {
        throw new FinopsException("FORGED_BADGE_PAYLOAD", "Malformed badge QR payload.");
      }
    } else if (params.badgePayload && typeof params.badgePayload === "object") {
      parsedPayload = params.badgePayload;
    }

    const payloadEmpId =
      typeof parsedPayload?.employee_id === "string"
        ? parsedPayload.employee_id.trim()
        : typeof parsedPayload?.employeeId === "string"
          ? parsedPayload.employeeId.trim()
          : "";
    if (payloadEmpId && payloadEmpId !== targetEmployeeId) {
      throw new FinopsException(
        "FORGED_BADGE_PAYLOAD",
        "Badge payload employee_id does not match target employee."
      );
    }

    const payloadBizId =
      typeof parsedPayload?.business_id === "string"
        ? parsedPayload.business_id.trim()
        : typeof parsedPayload?.businessId === "string"
          ? parsedPayload.businessId.trim()
          : "";
    if (payloadBizId && payloadBizId !== canonicalBusinessId) {
      throw new FinopsException(
        "FORBIDDEN_TENANT_CLAIM",
        "Badge payload business_id does not match canonical target business_id."
      );
    }

    const providedSig =
      (typeof params.qrSignature === "string" && params.qrSignature.trim()) ||
      (typeof parsedPayload?.signature === "string" && parsedPayload.signature.trim()) ||
      "";

    if (!providedSig) {
      throw new FinopsException(
        "INVALID_BADGE_SIGNATURE",
        "Cryptographic badge signature is required for QR/NFC attendance."
      );
    }

    // Check for ambiguous duplicate ACTIVE badges across employee_badges
    const empBadgesSnap = await adminDb
      .collection("employee_badges")
      .where("employeeId", "==", targetEmployeeId)
      .get();
    const empBadges = empBadgesSnap.empty
      ? []
      : (empBadgesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Record<string, any>[]);
    const activeEmpBadges = empBadges.filter(
      (b) => String(b.status || "").toUpperCase() === "ACTIVE"
    );

    if (activeEmpBadges.length > 1) {
      throw new FinopsException(
        "AMBIGUOUS_ACTIVE_BADGES",
        "Multiple active badges exist for target employee; cryptographic check rejected."
      );
    }

    let badgeDoc: Record<string, any> | null = null;
    if (params.badgeId && typeof params.badgeId === "string" && params.badgeId.trim()) {
      const snap = await adminDb.collection("employee_badges").doc(params.badgeId.trim()).get();
      badgeDoc = toRecordData(snap);
    } else if (activeEmpBadges.length === 1) {
      badgeDoc = activeEmpBadges[0];
    } else if (empBadges.length > 0) {
      badgeDoc = empBadges[0];
    }

    if (!badgeDoc) {
      throw new FinopsException("BADGE_NOT_FOUND", "No issued badge exists for this employee.");
    }

    const badgeBiz = extractCanonicalBusinessId(badgeDoc);
    if (!badgeBiz || badgeBiz !== canonicalBusinessId) {
      throw new FinopsException("CROSS_TENANT_ATTENDANCE_DENIED", "Badge belongs to another business.");
    }

    if (badgeDoc.employeeId !== targetEmployeeId) {
      throw new FinopsException("FORGED_BADGE_PAYLOAD", "Badge does not belong to target employee.");
    }

    if (String(badgeDoc.status || "").toUpperCase() !== "ACTIVE") {
      throw new FinopsException(
        "BADGE_NOT_ACTIVE",
        `Badge cannot be used because status is ${badgeDoc.status || "UNKNOWN"}.`
      );
    }

    if (badgeDoc.expiresAt && new Date(badgeDoc.expiresAt).getTime() < Date.now()) {
      throw new FinopsException("BADGE_EXPIRED", "Employee badge has expired.");
    }

    const storedSig = typeof badgeDoc.signature === "string" ? badgeDoc.signature.trim() : "";
    const storedHash = typeof badgeDoc.tokenHash === "string" ? badgeDoc.tokenHash.trim() : "";
    const sigMatches =
      (storedSig !== "" && storedSig === providedSig) ||
      (storedHash !== "" && storedHash === providedSig);

    if (!sigMatches) {
      throw new FinopsException("INVALID_BADGE_SIGNATURE", "Badge cryptographic signature verification failed.");
    }
  },

  evaluateLockedPayrollCycles(
    cycleDocs: Array<{ id?: string; data: () => Record<string, any> }>,
    normalizedDate: string
  ): void {
    const seen = new Set<string>();
    for (const cycleDoc of cycleDocs) {
      const docId = cycleDoc.id || "";
      if (docId && seen.has(docId)) continue;
      if (docId) seen.add(docId);

      const cycle = cycleDoc.data() || {};
      const status = String(cycle.status || "").trim().toUpperCase();
      if (!LOCKED_PAYROLL_STATUSES.has(status)) {
        continue;
      }
      const start = toDateOnly(cycle.startDate || cycle.periodStart || cycle.period_start);
      const end = toDateOnly(cycle.endDate || cycle.periodEnd || cycle.period_end);
      if (!start || !end) {
        throw new FinopsException(
          "PAYROLL_LOCK_CHECK_FAILED",
          `Cycle de paie verrouillé (${docId || status}) avec bornes de dates manquantes.`
        );
      }
      if (normalizedDate >= start && normalizedDate <= end) {
        throw new FinopsException(
          "PAYROLL_PERIOD_LOCKED",
          `La période de paie (${start} - ${end}) est verrouillée (${status}). Pointage refusé.`
        );
      }
    }
  },

  async verifyPayrollPeriodUnlockedInTransaction(
    transaction: any,
    adminDb: Firestore,
    canonicalBusinessId: string,
    dateStr: string
  ): Promise<void> {
    const normalizedDate = toDateOnly(dateStr);
    if (!normalizedDate) {
      throw new FinopsException("INVALID_ATTENDANCE_DATE", "Invalid attendance date.");
    }

    const qSnake = adminDb.collection("payroll_cycles").where("business_id", "==", canonicalBusinessId);
    const qCamel = adminDb.collection("payroll_cycles").where("businessId", "==", canonicalBusinessId);

    let snapSnake: any;
    let snapCamel: any;
    try {
      [snapSnake, snapCamel] = await Promise.all([
        transaction.get(qSnake),
        transaction.get(qCamel)
      ]);
    } catch (err: any) {
      throw new FinopsException(
        "PAYROLL_LOCK_CHECK_FAILED",
        `Unable to verify transactional payroll lock status safely: ${err?.message || "DB error"}`
      );
    }

    const combinedDocs = [
      ...(snapSnake?.docs || []),
      ...(snapCamel?.docs || [])
    ];
    this.evaluateLockedPayrollCycles(combinedDocs, normalizedDate);
  },

  async verifyPayrollPeriodUnlocked(
    adminDb: Firestore,
    canonicalBusinessId: string,
    dateStr: string
  ): Promise<void> {
    const normalizedDate = toDateOnly(dateStr);
    if (!normalizedDate) {
      throw new FinopsException("INVALID_ATTENDANCE_DATE", "Invalid attendance date.");
    }

    let snapSnake: any;
    let snapCamel: any;
    try {
      [snapSnake, snapCamel] = await Promise.all([
        adminDb.collection("payroll_cycles").where("business_id", "==", canonicalBusinessId).get(),
        adminDb.collection("payroll_cycles").where("businessId", "==", canonicalBusinessId).get()
      ]);
    } catch (err: any) {
      throw new FinopsException(
        "PAYROLL_LOCK_CHECK_FAILED",
        `Unable to verify payroll lock status safely: ${err?.message || "DB error"}`
      );
    }

    const combinedDocs = [
      ...(snapSnake?.docs || []),
      ...(snapCamel?.docs || [])
    ];
    this.evaluateLockedPayrollCycles(combinedDocs, normalizedDate);
  },

  async authorizeAndResolveContext(
    adminDb: Firestore,
    reqUser: AuthenticatedUser,
    action: AttendanceActionKind,
    input: {
      employeeId: string;
      claimedBusinessId?: string | null;
      claimedActorId?: string | null;
      claimedActorRole?: string | null;
      claimedTargetUid?: string | null;
    }
  ): Promise<{
    actor: TrustedAttendanceActor;
    target: TrustedAttendanceTarget;
    decision: AttendanceAuthorizationDecision;
  }> {
    const actor = await this.resolveTrustedActor(adminDb, reqUser);
    const target = await this.resolveTrustedTargetEmployee(adminDb, input.employeeId, actor);

    const decision = authorizeAttendanceAction({
      action,
      actor,
      targetEmployee: target,
      claimedBusinessId: input.claimedBusinessId,
      claimedActorId: input.claimedActorId,
      claimedActorRole: input.claimedActorRole,
      claimedTargetUid: input.claimedTargetUid
    });

    if (!decision.allowed) {
      await this.recordAuditEvent(adminDb, {
        businessId: decision.canonicalBusinessId || actor.business_id || "global",
        actorId: actor.uid,
        actorName: actor.displayName || actor.email || actor.uid,
        actorRole: String(decision.canonicalRole || actor.role || "UNKNOWN"),
        action: `ATTENDANCE_${action.toUpperCase()}_DENIED`,
        targetEmployeeId: target.id,
        result: "REFUSED",
        errorCode: decision.code,
        details: decision.reason
      });

      throw new FinopsException(decision.code, decision.reason);
    }

    return { actor, target, decision };
  },

  async checkInWithAdmin(
    adminDb: Firestore,
    reqUser: AuthenticatedUser,
    input: ServerAttendanceCheckInInput
  ): Promise<any> {
    const claimedBusinessId =
      typeof input.businessId === "string" && input.businessId.trim()
        ? input.businessId.trim()
        : typeof input.business_id === "string" && input.business_id.trim()
          ? input.business_id.trim()
          : null;

    const claimedActorId =
      (typeof input.actorId === "string" && input.actorId.trim()) ||
      (typeof input.recordedBy === "string" && input.recordedBy.trim()) ||
      (typeof input.actor?.id === "string" && input.actor.id.trim()) ||
      null;

    const claimedActorRole =
      typeof input.actor?.role === "string" && input.actor.role.trim()
        ? input.actor.role.trim()
        : null;

    const { actor, target, decision } = await this.authorizeAndResolveContext(
      adminDb,
      reqUser,
      "check_in",
      {
        employeeId: input.employeeId,
        claimedBusinessId,
        claimedActorId,
        claimedActorRole
      }
    );

    const canonicalBusinessId = decision.canonicalBusinessId!;
    const canonicalBranchId =
      decision.canonicalBranchId ||
      (typeof input.branchId === "string" && input.branchId.trim()) ||
      (typeof input.branch_id === "string" && input.branch_id.trim()) ||
      "BRANCH_DEFAULT";

    const method = input.method || "QR";
    await this.verifyBadgeIfProvided(adminDb, canonicalBusinessId, target.id, {
      method,
      badgeId: input.badgeId,
      qrSignature: input.qrSignature,
      badgePayload: input.badgePayload
    });

    const localNow = input.overrideTimestamp ? new Date(input.overrideTimestamp) : new Date();
    const localIso = localNow.toISOString();
    const dateStr = (input.deviceDate && toDateOnly(input.deviceDate)) || formatUtcDate(localNow);
    const timeStr = input.deviceTime || formatUtcTime(localNow);
    const tzStr = input.deviceTimezone || "UTC";
    const infoStr = input.deviceInfo || "FINOPS-SERVER-API";
    const deviceId = input.deviceId || "KIOSK-API";
    const location = input.location || "Kiosk Terminal";

    let isUnplanned = false;
    try {
      const shiftSnap = await adminDb
        .collection("shifts")
        .where("business_id", "==", canonicalBusinessId)
        .where("employeeId", "==", target.id)
        .where("date", "==", dateStr)
        .limit(1)
        .get();
      if (shiftSnap.empty) isUnplanned = true;
    } catch {
      isUnplanned = true;
    }

    const idemHash = sanitizeIdempotencyKey((input as any).idempotencyKey);
    const idemDocId = idemHash ? `ci_${canonicalBusinessId}_${idemHash}` : null;

    const sessionId = `sess_${crypto.randomBytes(6).toString("hex")}`;
    const eventId = `ev_${crypto.randomBytes(6).toString("hex")}`;
    const auditHash = crypto
      .createHash("sha256")
      .update(`${sessionId}|${canonicalBusinessId}|${target.id}|${actor.uid}|${localIso}`)
      .digest("hex");

    const formattedGeo =
      input.locationGeo &&
      typeof input.locationGeo.latitude === "number" &&
      typeof input.locationGeo.longitude === "number" &&
      !isNaN(input.locationGeo.latitude) &&
      !isNaN(input.locationGeo.longitude)
        ? {
            latitude: input.locationGeo.latitude,
            longitude: input.locationGeo.longitude,
            accuracy: input.locationGeo.accuracy || 0
          }
        : null;

    const newSession: Record<string, any> = {
      sessionId,
      employeeId: target.id,
      employeeUid: target.firebase_uid || target.uid || null,
      businessId: canonicalBusinessId,
      business_id: canonicalBusinessId,
      branchId: canonicalBranchId,
      departmentId: target.departmentId || null,
      recordedBy: actor.uid,
      recordedByRole: decision.canonicalRole,
      actorId: actor.uid,
      checkIn: {
        timestamp: localIso,
        method,
        deviceId,
        location,
        locationGeo: formattedGeo,
        deviceDate: dateStr,
        deviceTime: timeStr,
        deviceTimezone: tzStr,
        deviceInfo: infoStr
      },
      checkOut: null,
      status: "ACTIVE",
      totalMinutes: 0,
      overtimeMinutes: 0,
      createdAt: localIso,
      unplanned: isUnplanned
    };

    const legacyRecord: Record<string, any> = {
      id: sessionId,
      employeeId: target.id,
      employeeUid: target.firebase_uid || target.uid || null,
      employeeName: target.name || target.id,
      business_id: canonicalBusinessId,
      businessId: canonicalBusinessId,
      branchId: canonicalBranchId,
      departmentId: target.departmentId || "DEPT_DEFAULT",
      date: dateStr,
      checkIn: timeStr,
      checkOut: null,
      plannedHours: isUnplanned ? 0 : 8,
      realHours: 0,
      variance: isUnplanned ? 0 : -8,
      status: "NORMAL",
      unplanned: isUnplanned,
      deviceId,
      deviceTimezone: tzStr,
      recordedBy: actor.uid,
      recordedByRole: decision.canonicalRole,
      actorId: actor.uid,
      updatedAt: localIso
    };

    const statusDoc: Record<string, any> = {
      employeeId: target.id,
      business_id: canonicalBusinessId,
      businessId: canonicalBusinessId,
      branchId: canonicalBranchId,
      departmentId: target.departmentId || null,
      activeSessionId: sessionId,
      lastCheckIn: localIso,
      lastCheckInDate: dateStr,
      lastCheckInTime: timeStr,
      deviceId,
      recordedBy: actor.uid,
      recordedByRole: decision.canonicalRole,
      actorId: actor.uid,
      updatedAt: localIso
    };

    const eventDoc: Record<string, any> = {
      eventId,
      action: "CHECK_IN",
      employeeId: target.id,
      business_id: canonicalBusinessId,
      businessId: canonicalBusinessId,
      branchId: canonicalBranchId,
      performedBy: actor.uid,
      performedByRole: decision.canonicalRole,
      actorId: actor.uid,
      timestamp: localIso,
      previousState: null,
      newState: JSON.stringify({
        sessionId,
        employeeId: target.id,
        business_id: canonicalBusinessId,
        branchId: canonicalBranchId,
        date: dateStr,
        checkIn: timeStr,
        method
      }),
      deviceInfo: infoStr,
      auditHash
    };

    let idempotentResult: any = null;

    await adminDb.runTransaction(async (transaction: any) => {
      // 1. ALL transactional reads BEFORE any writes
      const idemRef = idemDocId ? adminDb.collection("attendance_idempotency").doc(idemDocId) : null;
      const idemSnap = idemRef ? await transaction.get(idemRef) : null;
      if (idemSnap?.exists) {
        const stored = idemSnap.data();
        if (stored?.employeeId !== target.id || stored?.action !== "CHECK_IN") {
          throw new FinopsException(
            "IDEMPOTENCY_KEY_CONFLICT",
            "Idempotency key already used for a different attendance operation."
          );
        }
        idempotentResult = stored.response;
        return;
      }

      await this.verifyPayrollPeriodUnlockedInTransaction(
        transaction,
        adminDb,
        canonicalBusinessId,
        dateStr
      );

      const statusRef = adminDb.collection("attendance_status").doc(target.id);
      const statusSnap = await transaction.get(statusRef);
      const existingStatus = statusSnap?.exists ? statusSnap.data() : null;

      let stalePriorSessionRef: any = null;
      let stalePriorSessionData: Record<string, any> | null = null;
      let stalePriorLogRef: any = null;
      let stalePriorLogData: Record<string, any> | null = null;

      if (existingStatus?.activeSessionId) {
        const prevDate =
          existingStatus.lastCheckInDate ||
          (existingStatus.lastCheckIn ? String(existingStatus.lastCheckIn).split("T")[0] : "");
        if (prevDate === dateStr) {
          throw new FinopsException(
            "ALREADY_CHECKED_IN",
            "L'employé a déjà une session de pointage active pour aujourd'hui."
          );
        }

        // GAP-ATT-11: Reconcile and flag unclosed prior-day session instead of stranding ACTIVE
        const prevSessionId = String(existingStatus.activeSessionId).trim();
        if (prevSessionId) {
          stalePriorSessionRef = adminDb.collection("attendance_sessions").doc(prevSessionId);
          stalePriorLogRef = adminDb.collection("attendance_logs").doc(prevSessionId);
          const [prevSessSnap, prevLogSnap] = await Promise.all([
            transaction.get(stalePriorSessionRef),
            transaction.get(stalePriorLogRef)
          ]);
          stalePriorSessionData = toRecordData(prevSessSnap);
          stalePriorLogData = toRecordData(prevLogSnap);
        }
      }

      // 2. Atomic writes (including mandatory audit_logs inside transaction)
      if (stalePriorSessionRef && stalePriorSessionData && stalePriorSessionData.status === "ACTIVE") {
        transaction.set(
          stalePriorSessionRef,
          {
            status: "FLAGGED",
            flaggedReason: "AUTO_FLAGGED_UNCLOSED_PRIOR_DAY_SESSION",
            supersededBySessionId: sessionId,
            flaggedAt: localIso,
            updatedAt: localIso
          },
          { merge: true }
        );
        if (stalePriorLogRef && stalePriorLogData) {
          transaction.set(
            stalePriorLogRef,
            {
              autoFlagged: true,
              unclosedPriorSession: true,
              flaggedReason: "AUTO_FLAGGED_UNCLOSED_PRIOR_DAY_SESSION",
              updatedAt: localIso
            },
            { merge: true }
          );
          transaction.set(
            adminDb.collection("attendance_records").doc(stalePriorSessionData.sessionId || stalePriorLogData.id),
            {
              autoFlagged: true,
              unclosedPriorSession: true,
              flaggedReason: "AUTO_FLAGGED_UNCLOSED_PRIOR_DAY_SESSION",
              updatedAt: localIso
            },
            { merge: true }
          );
        }
        const flagEvId = `ev_flag_${crypto.randomBytes(5).toString("hex")}`;
        transaction.set(adminDb.collection("attendance_events").doc(flagEvId), {
          eventId: flagEvId,
          action: "PRIOR_SESSION_FLAGGED",
          employeeId: target.id,
          business_id: canonicalBusinessId,
          businessId: canonicalBusinessId,
          branchId: canonicalBranchId,
          performedBy: actor.uid,
          actorId: actor.uid,
          timestamp: localIso,
          previousState: JSON.stringify({ activeSessionId: existingStatus.activeSessionId, status: "ACTIVE" }),
          newState: JSON.stringify({ flaggedSessionId: existingStatus.activeSessionId, status: "FLAGGED", supersededBySessionId: sessionId }),
          deviceInfo: infoStr,
          auditHash
        });
      }

      transaction.set(statusRef, statusDoc, { merge: true });
      transaction.set(adminDb.collection("attendance_sessions").doc(sessionId), newSession);
      transaction.set(adminDb.collection("attendance_logs").doc(sessionId), legacyRecord);
      transaction.set(adminDb.collection("attendance_records").doc(sessionId), legacyRecord);
      transaction.set(adminDb.collection("attendance_events").doc(eventId), eventDoc);

      const auditId = this.recordAuditEventInTransaction(transaction, adminDb, {
        businessId: canonicalBusinessId,
        actorId: actor.uid,
        actorName: actor.displayName || actor.email || actor.uid,
        actorRole: String(decision.canonicalRole),
        action: "ATTENDANCE_CHECK_IN",
        targetEmployeeId: target.id,
        result: "SUCCESS",
        details: `Check-in recorded for ${target.id} (${dateStr} ${timeStr}) via ${method}.`,
        metadata: {
          sessionId,
          branchId: canonicalBranchId,
          isSelfTarget: decision.isSelfTarget,
          flaggedPriorSessionId: stalePriorSessionData?.status === "ACTIVE" ? existingStatus?.activeSessionId : null
        }
      });

      const responsePayload = {
        session: newSession,
        record: legacyRecord,
        status: statusDoc,
        auditEventId: eventId,
        auditLogId: auditId
      };

      if (idemRef) {
        transaction.set(idemRef, {
          idempotencyKey: idemDocId,
          action: "CHECK_IN",
          business_id: canonicalBusinessId,
          employeeId: target.id,
          actorId: actor.uid,
          createdAt: localIso,
          response: responsePayload
        });
      }
    });

    if (idempotentResult) {
      return { ...idempotentResult, idempotentReplay: true };
    }

    return {
      session: newSession,
      record: legacyRecord,
      status: statusDoc,
      auditEventId: eventId
    };
  },

  async checkOutWithAdmin(
    adminDb: Firestore,
    reqUser: AuthenticatedUser,
    input: ServerAttendanceCheckOutInput
  ): Promise<any> {
    const claimedBusinessId =
      typeof input.businessId === "string" && input.businessId.trim()
        ? input.businessId.trim()
        : typeof input.business_id === "string" && input.business_id.trim()
          ? input.business_id.trim()
          : null;

    const claimedActorId =
      (typeof input.actorId === "string" && input.actorId.trim()) ||
      (typeof input.recordedBy === "string" && input.recordedBy.trim()) ||
      (typeof input.actor?.id === "string" && input.actor.id.trim()) ||
      null;

    const claimedActorRole =
      typeof input.actor?.role === "string" && input.actor.role.trim()
        ? input.actor.role.trim()
        : null;

    let initialSessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
    let preSessionData: Record<string, any> | null = null;
    let preLegacyData: Record<string, any> | null = null;

    if (!initialSessionId && input.employeeId) {
      const statusSnap = await adminDb.collection("attendance_status").doc(input.employeeId.trim()).get();
      const statusData = toRecordData(statusSnap);
      if (statusData?.activeSessionId) {
        initialSessionId = String(statusData.activeSessionId).trim();
      }
    }

    if (!initialSessionId) {
      throw new FinopsException("SESSION_NOT_FOUND", "Session de pointage active introuvable.");
    }

    const preSessSnap = await adminDb.collection("attendance_sessions").doc(initialSessionId).get();
    const preLegacySnap = await adminDb.collection("attendance_logs").doc(initialSessionId).get();
    preSessionData = toRecordData(preSessSnap);
    preLegacyData = toRecordData(preLegacySnap);

    if (!preSessionData && !preLegacyData) {
      throw new FinopsException("SESSION_NOT_FOUND", "Session ou journal de pointage introuvable.");
    }

    const targetEmployeeId =
      (preSessionData?.employeeId as string) ||
      (preLegacyData?.employeeId as string) ||
      (typeof input.employeeId === "string" ? input.employeeId.trim() : "");

    if (input.employeeId && input.employeeId.trim() !== targetEmployeeId) {
      throw new FinopsException(
        "IDENTITY_SPOOFING_DETECTED",
        "Requested employeeId does not match the active attendance session owner."
      );
    }

    const { actor, target, decision } = await this.authorizeAndResolveContext(
      adminDb,
      reqUser,
      "check_out",
      {
        employeeId: targetEmployeeId,
        claimedBusinessId,
        claimedActorId,
        claimedActorRole
      }
    );

    const canonicalBusinessId = decision.canonicalBusinessId!;
    const sessionBiz =
      extractCanonicalBusinessId(preSessionData) || extractCanonicalBusinessId(preLegacyData);
    if (sessionBiz && sessionBiz !== canonicalBusinessId) {
      throw new FinopsException(
        "CROSS_TENANT_ATTENDANCE_DENIED",
        "Session business_id does not match canonical target employee business_id."
      );
    }

    const method = input.method || "QR";
    await this.verifyBadgeIfProvided(adminDb, canonicalBusinessId, target.id, {
      method,
      badgeId: input.badgeId,
      qrSignature: input.qrSignature,
      badgePayload: input.badgePayload
    });

    const localNow = input.overrideTimestamp ? new Date(input.overrideTimestamp) : new Date();
    const localIso = localNow.toISOString();
    const dateStrToday = (input.deviceDate && toDateOnly(input.deviceDate)) || formatUtcDate(localNow);
    const timeStrToday = input.deviceTime || formatUtcTime(localNow);
    const tzStr = input.deviceTimezone || "UTC";
    const infoStr = input.deviceInfo || "FINOPS-SERVER-API";
    const deviceId = input.deviceId || preSessionData?.checkIn?.deviceId || "KIOSK-API";

    const formattedGeo =
      input.locationGeo &&
      typeof input.locationGeo.latitude === "number" &&
      typeof input.locationGeo.longitude === "number" &&
      !isNaN(input.locationGeo.latitude) &&
      !isNaN(input.locationGeo.longitude)
        ? {
            latitude: input.locationGeo.latitude,
            longitude: input.locationGeo.longitude,
            accuracy: input.locationGeo.accuracy || 0
          }
        : null;

    const idemHash = sanitizeIdempotencyKey((input as any).idempotencyKey);
    const idemDocId = idemHash ? `co_${canonicalBusinessId}_${idemHash}` : null;

    let updatedSession: Record<string, any> | null = null;
    let idempotentResult: any = null;
    const eventId = `ev_${crypto.randomBytes(6).toString("hex")}`;

    await adminDb.runTransaction(async (transaction: any) => {
      const idemRef = idemDocId ? adminDb.collection("attendance_idempotency").doc(idemDocId) : null;
      const idemSnap = idemRef ? await transaction.get(idemRef) : null;
      if (idemSnap?.exists) {
        const stored = idemSnap.data();
        if (stored?.employeeId !== target.id || stored?.action !== "CHECK_OUT") {
          throw new FinopsException(
            "IDEMPOTENCY_KEY_CONFLICT",
            "Idempotency key already used for a different attendance operation."
          );
        }
        idempotentResult = stored.response;
        return;
      }

      const sessRef = adminDb.collection("attendance_sessions").doc(initialSessionId);
      const legacyRef = adminDb.collection("attendance_logs").doc(initialSessionId);
      const statusRef = adminDb.collection("attendance_status").doc(target.id);

      const [curSessSnap, curLegacySnap, curStatusSnap] = await Promise.all([
        transaction.get(sessRef),
        transaction.get(legacyRef),
        transaction.get(statusRef)
      ]);

      const sessionData = toRecordData(curSessSnap);
      const legacyData = toRecordData(curLegacySnap);
      const existingStatus = toRecordData(curStatusSnap);

      if (!sessionData && !legacyData) {
        throw new FinopsException("SESSION_NOT_FOUND", "Session de pointage introuvable.");
      }
      if (sessionData?.status === "COMPLETED" || (legacyData?.checkOut && !sessionData)) {
        throw new FinopsException("SESSION_ALREADY_COMPLETED", "Cette session est déjà clôturée.");
      }

      let checkInTs: Date;
      if (sessionData?.checkIn?.timestamp?.toDate) {
        checkInTs = sessionData.checkIn.timestamp.toDate();
      } else if (sessionData?.checkIn?.timestamp) {
        checkInTs = new Date(sessionData.checkIn.timestamp);
      } else if (legacyData?.date && legacyData?.checkIn) {
        checkInTs = new Date(`${legacyData.date}T${legacyData.checkIn}`);
      } else {
        checkInTs = new Date(localNow.getTime() - 60000);
      }

      if (input.overrideTimestamp && localNow.getTime() <= checkInTs.getTime()) {
        throw new FinopsException(
          "INVALID_CHECKOUT_TIME",
          "L'heure de sortie ne peut pas être antérieure ou égale à l'heure d'entrée."
        );
      }

      const dateStr =
        sessionData?.checkIn?.deviceDate || legacyData?.date || formatUtcDate(checkInTs);

      // Transactional payroll lock check (GAP-ATT-10)
      await this.verifyPayrollPeriodUnlockedInTransaction(
        transaction,
        adminDb,
        canonicalBusinessId,
        dateStr
      );

      const diffMs = Math.max(60000, localNow.getTime() - checkInTs.getTime());
      const totalMinutes = Math.max(1, Math.round(diffMs / 60000));
      const workedHours = Number((totalMinutes / 60).toFixed(2));
      const plannedHours =
        legacyData?.plannedHours !== undefined ? Number(legacyData.plannedHours) : 8;
      const variance = Number((workedHours - plannedHours).toFixed(2));
      const canonicalBranchId =
        decision.canonicalBranchId ||
        sessionData?.branchId ||
        legacyData?.branchId ||
        "BRANCH_DEFAULT";

      updatedSession = {
        sessionId: initialSessionId,
        employeeId: target.id,
        employeeUid: target.firebase_uid || target.uid || null,
        businessId: canonicalBusinessId,
        business_id: canonicalBusinessId,
        branchId: canonicalBranchId,
        recordedBy: actor.uid,
        recordedByRole: decision.canonicalRole,
        actorId: actor.uid,
        checkIn: sessionData?.checkIn || {
          timestamp: checkInTs.toISOString(),
          method,
          deviceId,
          location: "Kiosk Terminal",
          deviceDate: dateStr,
          deviceTime: legacyData?.checkIn || formatUtcTime(checkInTs),
          deviceTimezone: tzStr,
          deviceInfo: infoStr
        },
        checkOut: {
          timestamp: localIso,
          method,
          locationGeo: formattedGeo,
          deviceDate: dateStrToday,
          deviceTime: timeStrToday,
          deviceTimezone: tzStr,
          deviceInfo: infoStr
        },
        status: "COMPLETED",
        totalMinutes,
        updatedAt: localIso
      };

      const updatedLegacy = {
        id: initialSessionId,
        employeeId: target.id,
        employeeUid: target.firebase_uid || target.uid || null,
        employeeName: legacyData?.employeeName || target.name || target.id,
        business_id: canonicalBusinessId,
        businessId: canonicalBusinessId,
        branchId: canonicalBranchId,
        departmentId: target.departmentId || legacyData?.departmentId || "DEPT_DEFAULT",
        date: dateStr,
        checkIn:
          legacyData?.checkIn ||
          sessionData?.checkIn?.deviceTime ||
          formatUtcTime(checkInTs),
        checkOut: timeStrToday,
        plannedHours,
        realHours: workedHours,
        variance,
        status: "NORMAL",
        unplanned: Boolean(legacyData?.unplanned),
        deviceId,
        deviceTimezone: tzStr,
        recordedBy: actor.uid,
        recordedByRole: decision.canonicalRole,
        actorId: actor.uid,
        updatedAt: localIso
      };

      // GAP-ATT-11: Only clear activeSessionId if attendance_status still points to THIS sessionId
      const shouldClearActiveSession = existingStatus?.activeSessionId === initialSessionId;
      const statusDoc: Record<string, any> = {
        employeeId: target.id,
        business_id: canonicalBusinessId,
        businessId: canonicalBusinessId,
        branchId: canonicalBranchId,
        ...(shouldClearActiveSession ? { activeSessionId: null } : {}),
        lastCheckOut: localIso,
        lastCheckOutDate: dateStrToday,
        lastCheckOutTime: timeStrToday,
        recordedBy: actor.uid,
        recordedByRole: decision.canonicalRole,
        actorId: actor.uid,
        updatedAt: localIso
      };

      const auditHash = crypto
        .createHash("sha256")
        .update(`${initialSessionId}|CHECK_OUT|${canonicalBusinessId}|${target.id}|${actor.uid}|${localIso}`)
        .digest("hex");

      const eventDoc = {
        eventId,
        action: "CHECK_OUT",
        employeeId: target.id,
        business_id: canonicalBusinessId,
        businessId: canonicalBusinessId,
        branchId: canonicalBranchId,
        performedBy: actor.uid,
        performedByRole: decision.canonicalRole,
        actorId: actor.uid,
        timestamp: localIso,
        previousState: JSON.stringify(sessionData || legacyData),
        newState: JSON.stringify(updatedSession),
        deviceInfo: infoStr,
        auditHash
      };

      transaction.set(sessRef, updatedSession, { merge: true });
      transaction.set(legacyRef, updatedLegacy, { merge: true });
      transaction.set(
        adminDb.collection("attendance_records").doc(initialSessionId),
        updatedLegacy,
        { merge: true }
      );
      transaction.set(statusRef, statusDoc, { merge: true });
      transaction.set(adminDb.collection("attendance_events").doc(eventId), eventDoc);

      const auditId = this.recordAuditEventInTransaction(transaction, adminDb, {
        businessId: canonicalBusinessId,
        actorId: actor.uid,
        actorName: actor.displayName || actor.email || actor.uid,
        actorRole: String(decision.canonicalRole),
        action: "ATTENDANCE_CHECK_OUT",
        targetEmployeeId: target.id,
        result: "SUCCESS",
        details: `Check-out recorded for ${target.id} (${dateStrToday} ${timeStrToday}).`,
        metadata: {
          sessionId: initialSessionId,
          isSelfTarget: decision.isSelfTarget,
          clearedActiveSession: shouldClearActiveSession
        }
      });

      const responsePayload = {
        session: updatedSession,
        auditEventId: eventId,
        auditLogId: auditId
      };

      if (idemRef) {
        transaction.set(idemRef, {
          idempotencyKey: idemDocId,
          action: "CHECK_OUT",
          business_id: canonicalBusinessId,
          employeeId: target.id,
          actorId: actor.uid,
          createdAt: localIso,
          response: responsePayload
        });
      }
    });

    if (idempotentResult) {
      return { ...idempotentResult, idempotentReplay: true };
    }

    return {
      session: updatedSession,
      auditEventId: eventId
    };
  },

  async overrideAttendanceWithAdmin(
    adminDb: Firestore,
    reqUser: AuthenticatedUser,
    input: ServerAttendanceOverrideInput & {
      realHours?: number;
      plannedHours?: number;
      variance?: number;
      branchId?: string;
    }
  ): Promise<any> {
    if (!input.reason || !input.reason.trim()) {
      throw new FinopsException("REASON_REQUIRED", "Override reason is required.");
    }

    const claimedBusinessId =
      typeof input.businessId === "string" && input.businessId.trim()
        ? input.businessId.trim()
        : typeof input.business_id === "string" && input.business_id.trim()
          ? input.business_id.trim()
          : null;

    const claimedActorId =
      (typeof input.actorId === "string" && input.actorId.trim()) ||
      (typeof input.actor?.id === "string" && input.actor.id.trim()) ||
      null;

    const { actor, target, decision } = await this.authorizeAndResolveContext(
      adminDb,
      reqUser,
      "override",
      {
        employeeId: input.employeeId,
        claimedBusinessId,
        claimedActorId,
        claimedActorRole: input.actor?.role || null
      }
    );

    const canonicalBusinessId = decision.canonicalBusinessId!;
    const normalizedDate = toDateOnly(input.date);
    if (!normalizedDate) {
      throw new FinopsException("INVALID_ATTENDANCE_DATE", "Valid YYYY-MM-DD attendance date is required.");
    }

    const recordId =
      (typeof input.recordId === "string" && input.recordId.trim()) ||
      `att_${target.id}_${normalizedDate}`;
    const nowIso = new Date().toISOString();
    const eventId = `ev_${crypto.randomBytes(6).toString("hex")}`;

    let finalRecord: Record<string, any> | null = null;

    await adminDb.runTransaction(async (transaction: any) => {
      const logRef = adminDb.collection("attendance_logs").doc(recordId);
      const recRef = adminDb.collection("attendance_records").doc(recordId);
      const sessRef = adminDb.collection("attendance_sessions").doc(recordId);

      const [logSnap, recSnap, sessSnap] = await Promise.all([
        transaction.get(logRef),
        transaction.get(recRef),
        transaction.get(sessRef)
      ]);
      await this.verifyPayrollPeriodUnlockedInTransaction(
        transaction,
        adminDb,
        canonicalBusinessId,
        normalizedDate
      );

      const existingLog = toRecordData(logSnap) || toRecordData(recSnap) || {};
      if (existingLog.business_id && existingLog.business_id !== canonicalBusinessId) {
        throw new FinopsException("CROSS_TENANT_ATTENDANCE_DENIED", "Record belongs to another business.");
      }
      if (existingLog.date && toDateOnly(existingLog.date) !== normalizedDate) {
        // Also ensure existing record date isn't locked
        await this.verifyPayrollPeriodUnlockedInTransaction(
          transaction,
          adminDb,
          canonicalBusinessId,
          String(existingLog.date)
        );
      }

      const plannedHours =
        typeof input.plannedHours === "number"
          ? input.plannedHours
          : typeof existingLog.plannedHours === "number"
            ? existingLog.plannedHours
            : 8;
      const realHours =
        typeof input.realHours === "number"
          ? input.realHours
          : typeof existingLog.realHours === "number"
            ? existingLog.realHours
            : 0;
      const variance =
        typeof input.variance === "number"
          ? input.variance
          : Number((realHours - plannedHours).toFixed(2));

      finalRecord = {
        id: recordId,
        employeeId: target.id,
        employeeName: target.name || existingLog.employeeName || target.id,
        business_id: canonicalBusinessId,
        businessId: canonicalBusinessId,
        branchId: decision.canonicalBranchId || existingLog.branchId || input.branchId || "BRANCH_DEFAULT",
        departmentId: target.departmentId || existingLog.departmentId || "DEPT_DEFAULT",
        date: normalizedDate,
        checkIn: input.checkIn !== undefined ? input.checkIn : (existingLog.checkIn ?? null),
        checkOut: input.checkOut !== undefined ? input.checkOut : (existingLog.checkOut ?? null),
        plannedHours,
        realHours,
        variance,
        status: input.status || existingLog.status || "NORMAL",
        overrideReason: input.reason.trim(),
        overrideBy: decision.canonicalRole,
        overriddenBy: actor.uid,
        overriddenByRole: decision.canonicalRole,
        recordedBy: actor.uid,
        actorId: actor.uid,
        updatedAt: nowIso
      };

      transaction.set(logRef, finalRecord, { merge: true });
      transaction.set(recRef, finalRecord, { merge: true });

      if (sessSnap?.exists) {
        const totalMinutes = Math.max(0, Math.round(realHours * 60));
        const overtimeMinutes = Math.max(0, Math.round((realHours - plannedHours) * 60));
        transaction.set(
          sessRef,
          {
            business_id: canonicalBusinessId,
            businessId: canonicalBusinessId,
            totalMinutes,
            overtimeMinutes,
            overriddenBy: actor.uid,
            overrideReason: input.reason.trim(),
            recordedBy: actor.uid,
            actorId: actor.uid,
            updatedAt: nowIso
          },
          { merge: true }
        );
      }

      const auditHash = crypto
        .createHash("sha256")
        .update(`${recordId}|OVERRIDE|${canonicalBusinessId}|${target.id}|${actor.uid}|${nowIso}`)
        .digest("hex");

      transaction.set(adminDb.collection("attendance_events").doc(eventId), {
        eventId,
        action: "MANUAL_ADJUSTMENT",
        employeeId: target.id,
        business_id: canonicalBusinessId,
        businessId: canonicalBusinessId,
        branchId: finalRecord.branchId,
        performedBy: actor.uid,
        performedByRole: decision.canonicalRole,
        actorId: actor.uid,
        timestamp: nowIso,
        previousState: JSON.stringify(existingLog || null),
        newState: JSON.stringify(finalRecord),
        deviceInfo: "FINOPS-SERVER-API",
        auditHash
      });

      this.recordAuditEventInTransaction(transaction, adminDb, {
        businessId: canonicalBusinessId,
        actorId: actor.uid,
        actorName: actor.displayName || actor.email || actor.uid,
        actorRole: String(decision.canonicalRole),
        action: "ATTENDANCE_OVERRIDE",
        targetEmployeeId: target.id,
        result: "SUCCESS",
        details: `Attendance override recorded for ${target.id} on ${normalizedDate}: ${input.reason.trim()}`,
        metadata: { recordId, eventId, realHours, status: finalRecord.status }
      });
    });

    return { record: finalRecord, auditEventId: eventId };
  },

  async bulkImportAttendanceWithAdmin(
    adminDb: Firestore,
    reqUser: AuthenticatedUser,
    input: ServerAttendanceBulkImportInput
  ): Promise<{ importedCount: number; recordIds: string[] }> {
    const records = Array.isArray(input.records) ? input.records : [];
    if (records.length === 0) {
      throw new FinopsException("INVALID_BULK_IMPORT", "At least one attendance record is required.");
    }

    const claimedBusinessId =
      typeof input.businessId === "string" && input.businessId.trim()
        ? input.businessId.trim()
        : typeof input.business_id === "string" && input.business_id.trim()
          ? input.business_id.trim()
          : null;

    const claimedActorId =
      (typeof input.actorId === "string" && input.actorId.trim()) ||
      (typeof input.actor?.id === "string" && input.actor.id.trim()) ||
      null;

    const actor = await this.resolveTrustedActor(adminDb, reqUser);
    const prepared: Array<{
      recordId: string;
      normalizedDate: string;
      docData: Record<string, any>;
      target: TrustedAttendanceTarget;
      canonicalBusinessId: string;
    }> = [];
    const uniqueDates = new Set<string>();
    let firstBusinessId = actor.business_id || claimedBusinessId || "";

    for (const raw of records) {
      const target = await this.resolveTrustedTargetEmployee(adminDb, raw.employeeId, actor);
      const decision = authorizeAttendanceAction({
        action: "bulk_import",
        actor,
        targetEmployee: target,
        claimedBusinessId,
        claimedActorId,
        claimedActorRole: input.actor?.role || null
      });
      if (!decision.allowed) {
        await this.recordAuditEvent(adminDb, {
          businessId: decision.canonicalBusinessId || actor.business_id || "global",
          actorId: actor.uid,
          actorName: actor.displayName || actor.email || actor.uid,
          actorRole: String(decision.canonicalRole || actor.role || "UNKNOWN"),
          action: "ATTENDANCE_BULK_IMPORT_DENIED",
          targetEmployeeId: target.id,
          result: "REFUSED",
          errorCode: decision.code,
          details: decision.reason
        });
        throw new FinopsException(decision.code, decision.reason);
      }

      const normalizedDate = toDateOnly(raw.date);
      if (!normalizedDate) {
        throw new FinopsException("INVALID_ATTENDANCE_DATE", `Invalid attendance date for ${target.id}.`);
      }

      const canonicalBusinessId = decision.canonicalBusinessId!;
      firstBusinessId = canonicalBusinessId;
      uniqueDates.add(normalizedDate);

      const recordId =
        (typeof raw.id === "string" && raw.id.trim()) ||
        `att_bulk_${target.id}_${normalizedDate.replace(/-/g, "")}`;
      const plannedHours = typeof raw.plannedHours === "number" ? raw.plannedHours : 8;
      const realHours = typeof raw.realHours === "number" ? raw.realHours : 0;
      const variance =
        typeof raw.variance === "number"
          ? raw.variance
          : Number((realHours - plannedHours).toFixed(2));
      const nowIso = new Date().toISOString();

      prepared.push({
        recordId,
        normalizedDate,
        target,
        canonicalBusinessId,
        docData: {
          id: recordId,
          employeeId: target.id,
          employeeName: target.name || target.id,
          business_id: canonicalBusinessId,
          businessId: canonicalBusinessId,
          branchId: decision.canonicalBranchId || raw.branchId || "BRANCH_DEFAULT",
          departmentId: target.departmentId || raw.departmentId || "DEPT_DEFAULT",
          date: normalizedDate,
          checkIn: raw.checkIn ?? null,
          checkOut: raw.checkOut ?? null,
          plannedHours,
          realHours,
          variance,
          status: raw.status || "NORMAL",
          overrideReason: raw.overrideReason || "Bulk imported via Enterprise Server API",
          overrideBy: decision.canonicalRole,
          recordedBy: actor.uid,
          recordedByRole: decision.canonicalRole,
          actorId: actor.uid,
          updatedBy: actor.uid,
          updatedAt: nowIso
        }
      });
    }

    // Chunk in groups of 100 records (<= 202 writes + audit per transaction)
    const CHUNK_SIZE = 100;
    for (let i = 0; i < prepared.length; i += CHUNK_SIZE) {
      const chunk = prepared.slice(i, i + CHUNK_SIZE);
      const chunkDates = Array.from(new Set(chunk.map((c) => c.normalizedDate)));
      await adminDb.runTransaction(async (transaction: any) => {
        for (const d of chunkDates) {
          await this.verifyPayrollPeriodUnlockedInTransaction(transaction, adminDb, firstBusinessId, d);
        }
        for (const item of chunk) {
          transaction.set(adminDb.collection("attendance_logs").doc(item.recordId), item.docData, { merge: true });
          transaction.set(adminDb.collection("attendance_records").doc(item.recordId), item.docData, { merge: true });
        }
        this.recordAuditEventInTransaction(transaction, adminDb, {
          businessId: firstBusinessId,
          actorId: actor.uid,
          actorName: actor.displayName || actor.email || actor.uid,
          actorRole: String(actor.role || "UNKNOWN"),
          action: "ATTENDANCE_BULK_IMPORT",
          result: "SUCCESS",
          details: `Bulk imported ${chunk.length} attendance record(s).`,
          metadata: { recordIds: chunk.map((c) => c.recordId), dates: Array.from(uniqueDates) }
        });
      });
    }

    return {
      importedCount: prepared.length,
      recordIds: prepared.map((p) => p.recordId)
    };
  },

  async deleteAttendanceWithAdmin(
    adminDb: Firestore,
    reqUser: AuthenticatedUser,
    input: ServerAttendanceDeleteInput
  ): Promise<{ deletedCount: number; recordIds: string[] }> {
    const recordIds = Array.isArray(input.recordIds)
      ? input.recordIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim())
      : [];
    if (recordIds.length === 0) {
      throw new FinopsException("INVALID_RECORD_IDS", "At least one attendance recordId is required.");
    }

    const claimedBusinessId =
      typeof input.businessId === "string" && input.businessId.trim()
        ? input.businessId.trim()
        : typeof input.business_id === "string" && input.business_id.trim()
          ? input.business_id.trim()
          : null;

    const actor = await this.resolveTrustedActor(adminDb, reqUser);
    const canonicalRole = normalizeCanonicalAttendanceRole(actor.role);
    if (!canonicalRole || (!actor.isSuperAdmin && !["OWNER", "ADMIN", "OWNER_ADMIN", "SUPER_ADMIN"].includes(canonicalRole))) {
      await this.recordAuditEvent(adminDb, {
        businessId: actor.business_id || "global",
        actorId: actor.uid,
        actorName: actor.displayName || actor.email || actor.uid,
        actorRole: String(canonicalRole || actor.role || "UNKNOWN"),
        action: "ATTENDANCE_DELETE_DENIED",
        result: "REFUSED",
        errorCode: "DELETE_FORBIDDEN_FOR_ROLE",
        details: `Role ${actor.role} cannot delete attendance records.`
      });
      throw new FinopsException("DELETE_FORBIDDEN_FOR_ROLE", `Role ${actor.role} cannot delete attendance records.`);
    }

    if (claimedBusinessId && actor.business_id && !actor.isSuperAdmin && claimedBusinessId !== actor.business_id) {
      throw new FinopsException("FORBIDDEN_TENANT_CLAIM", "Claimed businessId conflicts with actor business_id.");
    }

    const nowIso = new Date().toISOString();

    await adminDb.runTransaction(async (transaction: any) => {
      const loadedRecords: Array<{
        id: string;
        data: Record<string, any>;
        hasLog: boolean;
        hasRec: boolean;
        hasSess: boolean;
        statusDoc: Record<string, any> | null;
      }> = [];

      const datesToCheck = new Set<string>();
      const businessIdsChecked = new Set<string>();

      for (const id of recordIds) {
        const logRef = adminDb.collection("attendance_logs").doc(id);
        const recRef = adminDb.collection("attendance_records").doc(id);
        const sessRef = adminDb.collection("attendance_sessions").doc(id);

        const [logSnap, recSnap, sessSnap] = await Promise.all([
          transaction.get(logRef),
          transaction.get(recRef),
          transaction.get(sessRef)
        ]);
        const logData = toRecordData(logSnap);
        const recData = toRecordData(recSnap);
        const sessData = toRecordData(sessSnap);
        const combined = logData || recData || sessData;
        if (!combined) {
          throw new FinopsException("SESSION_NOT_FOUND", `Attendance record '${id}' not found.`);
        }

        const targetBiz = extractCanonicalBusinessId(combined);
        if (!targetBiz || (!actor.isSuperAdmin && actor.business_id && targetBiz !== actor.business_id)) {
          throw new FinopsException("CROSS_TENANT_ATTENDANCE_DENIED", "Cannot delete attendance record belonging to another tenant.");
        }
        businessIdsChecked.add(targetBiz);

        const recDate = toDateOnly(combined.date || combined.checkIn?.deviceDate);
        if (!recDate) {
          throw new FinopsException("INVALID_ATTENDANCE_DATE", `Record '${id}' lacks a valid date for payroll lock verification.`);
        }
        datesToCheck.add(`${targetBiz}::${recDate}`);

        let statusDoc: Record<string, any> | null = null;
        if (combined.employeeId) {
          const stSnap = await transaction.get(adminDb.collection("attendance_status").doc(combined.employeeId));
          statusDoc = toRecordData(stSnap);
        }

        loadedRecords.push({
          id,
          data: combined,
          hasLog: Boolean(logData),
          hasRec: Boolean(recData),
          hasSess: Boolean(sessData),
          statusDoc
        });
      }

      for (const item of datesToCheck) {
        const [biz, dt] = item.split("::");
        await this.verifyPayrollPeriodUnlockedInTransaction(transaction, adminDb, biz, dt);
      }

      for (const item of loadedRecords) {
        if (item.hasLog) {
          transaction.delete(adminDb.collection("attendance_logs").doc(item.id));
        }
        if (item.hasRec) {
          transaction.delete(adminDb.collection("attendance_records").doc(item.id));
        }
        if (item.hasSess) {
          transaction.delete(adminDb.collection("attendance_sessions").doc(item.id));
        }
        if (item.statusDoc?.activeSessionId === item.id && item.data.employeeId) {
          transaction.set(
            adminDb.collection("attendance_status").doc(item.data.employeeId),
            { activeSessionId: null, updatedAt: nowIso, recordedBy: actor.uid },
            { merge: true }
          );
        }
      }

      const auditBiz = Array.from(businessIdsChecked)[0] || actor.business_id || "global";
      const eventId = `ev_del_${crypto.randomBytes(5).toString("hex")}`;
      transaction.set(adminDb.collection("attendance_events").doc(eventId), {
        eventId,
        action: "RECORD_VOIDED",
        employeeId: loadedRecords[0]?.data.employeeId || null,
        business_id: auditBiz,
        businessId: auditBiz,
        performedBy: actor.uid,
        performedByRole: canonicalRole,
        actorId: actor.uid,
        timestamp: nowIso,
        previousState: JSON.stringify({ recordIds }),
        newState: JSON.stringify({ deleted: true, recordIds }),
        deviceInfo: "FINOPS-SERVER-API",
        auditHash: crypto.createHash("sha256").update(`DELETE|${auditBiz}|${recordIds.join(",")}|${nowIso}`).digest("hex")
      });

      this.recordAuditEventInTransaction(transaction, adminDb, {
        businessId: auditBiz,
        actorId: actor.uid,
        actorName: actor.displayName || actor.email || actor.uid,
        actorRole: String(canonicalRole),
        action: "ATTENDANCE_BATCH_DELETED",
        result: "SUCCESS",
        details: `Deleted ${loadedRecords.length} attendance record(s).`,
        metadata: { recordIds, reason: input.reason || null }
      });
    });

    return {
      deletedCount: recordIds.length,
      recordIds
    };
  },

  async createAdjustmentRequestWithAdmin(
    adminDb: Firestore,
    reqUser: AuthenticatedUser,
    input: ServerAttendanceCreateAdjustmentInput
  ): Promise<{ request: Record<string, any> }> {
    const sessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
    if (!sessionId) {
      throw new FinopsException("SESSION_NOT_FOUND", "sessionId is required.");
    }
    if (typeof input.requestedHours !== "number" || isNaN(input.requestedHours) || input.requestedHours < 0 || input.requestedHours > 24) {
      throw new FinopsException("INVALID_ADJUSTMENT_HOURS", "requestedHours must be between 0 and 24.");
    }
    if (!input.reason || !input.reason.trim()) {
      throw new FinopsException("REASON_REQUIRED", "Adjustment reason is required.");
    }

    const claimedBusinessId =
      typeof input.businessId === "string" && input.businessId.trim()
        ? input.businessId.trim()
        : typeof input.business_id === "string" && input.business_id.trim()
          ? input.business_id.trim()
          : null;

    const claimedActorId =
      (typeof input.actorId === "string" && input.actorId.trim()) ||
      (typeof input.actor?.id === "string" && input.actor.id.trim()) ||
      null;

    // Authorize requester: self or authorized operational supervisor/manager/owner
    const { actor, target, decision } = await this.authorizeAndResolveContext(
      adminDb,
      reqUser,
      "check_in",
      {
        employeeId: input.employeeId,
        claimedBusinessId,
        claimedActorId,
        claimedActorRole: input.actor?.role || null
      }
    );

    const canonicalBusinessId = decision.canonicalBusinessId!;
    const requestId = `adj_${crypto.randomBytes(6).toString("hex")}`;
    const nowIso = new Date().toISOString();
    let createdRequest: Record<string, any> = {};

    await adminDb.runTransaction(async (transaction: any) => {
      const sessRef = adminDb.collection("attendance_sessions").doc(sessionId);
      const logRef = adminDb.collection("attendance_logs").doc(sessionId);
      const [sessSnap, logSnap] = await Promise.all([
        transaction.get(sessRef),
        transaction.get(logRef)
      ]);
      const sessionData = toRecordData(sessSnap);
      const legacyData = toRecordData(logSnap);
      const baseDoc = sessionData || legacyData;

      if (!baseDoc) {
        throw new FinopsException("SESSION_NOT_FOUND", "Target attendance session or log not found.");
      }

      const sessBiz = extractCanonicalBusinessId(baseDoc);
      if (!sessBiz || sessBiz !== canonicalBusinessId) {
        throw new FinopsException("CROSS_TENANT_ATTENDANCE_DENIED", "Session belongs to another business.");
      }
      if (baseDoc.employeeId && baseDoc.employeeId !== target.id) {
        throw new FinopsException("IDENTITY_SPOOFING_DETECTED", "Session does not belong to target employee.");
      }

      const dateStr =
        toDateOnly(baseDoc.checkIn?.deviceDate || baseDoc.date || baseDoc.checkIn?.timestamp);
      if (!dateStr) {
        throw new FinopsException("INVALID_ATTENDANCE_DATE", "Target session lacks a valid date.");
      }

      await this.verifyPayrollPeriodUnlockedInTransaction(transaction, adminDb, canonicalBusinessId, dateStr);

      createdRequest = {
        requestId,
        id: requestId,
        sessionId,
        employeeId: target.id,
        business_id: canonicalBusinessId,
        businessId: canonicalBusinessId,
        branchId: decision.canonicalBranchId || baseDoc.branchId || "BRANCH_DEFAULT",
        date: dateStr,
        requestedHours: Number(input.requestedHours),
        status: "REQUESTED",
        reason: input.reason.trim(),
        requestedBy: actor.uid,
        requestedByRole: decision.canonicalRole,
        recordedBy: actor.uid,
        actorId: actor.uid,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      transaction.set(adminDb.collection("attendance_adjustment_requests").doc(requestId), createdRequest);
      this.recordAuditEventInTransaction(transaction, adminDb, {
        businessId: canonicalBusinessId,
        actorId: actor.uid,
        actorName: actor.displayName || actor.email || actor.uid,
        actorRole: String(decision.canonicalRole),
        action: "ATTENDANCE_ADJUSTMENT_REQUESTED",
        targetEmployeeId: target.id,
        result: "SUCCESS",
        details: `Adjustment requested (${requestId}) for session ${sessionId}: ${input.requestedHours}h`,
        metadata: { requestId, sessionId, date: dateStr }
      });
    });

    return { request: createdRequest };
  },

  async approveAdjustmentRequestWithAdmin(
    adminDb: Firestore,
    reqUser: AuthenticatedUser,
    input: ServerAttendanceApproveAdjustmentInput
  ): Promise<{ request: Record<string, any> }> {
    const requestId = typeof input.requestId === "string" ? input.requestId.trim() : "";
    if (!requestId) {
      throw new FinopsException("ADJUSTMENT_NOT_FOUND", "requestId is required.");
    }

    const decisionKind = input.decision === "REJECTED" ? "REJECTED" : "APPROVED";

    const reqSnap = await adminDb.collection("attendance_adjustment_requests").doc(requestId).get();
    const preRequest = toRecordData(reqSnap);
    if (!preRequest) {
      throw new FinopsException("ADJUSTMENT_NOT_FOUND", "Demande d'ajustement introuvable.");
    }

    const targetEmployeeId = String(preRequest.employeeId || "").trim();
    const claimedBusinessId =
      typeof input.businessId === "string" && input.businessId.trim()
        ? input.businessId.trim()
        : typeof input.business_id === "string" && input.business_id.trim()
          ? input.business_id.trim()
          : null;

    const claimedActorId =
      (typeof input.actorId === "string" && input.actorId.trim()) ||
      (typeof input.actor?.id === "string" && input.actor.id.trim()) ||
      null;

    // Role & branch scope authorization via canonical policy (OWNER/ADMIN/OWNER_ADMIN/MANAGER only; SUPERVISOR & TELLER denied)
    const { actor, target, decision } = await this.authorizeAndResolveContext(
      adminDb,
      reqUser,
      "approve_adjustment",
      {
        employeeId: targetEmployeeId,
        claimedBusinessId,
        claimedActorId,
        claimedActorRole: input.actor?.role || null
      }
    );

    const canonicalBusinessId = decision.canonicalBusinessId!;
    const reqBiz = extractCanonicalBusinessId(preRequest);
    if (!reqBiz || reqBiz !== canonicalBusinessId) {
      throw new FinopsException(
        "CROSS_TENANT_ATTENDANCE_DENIED",
        "Adjustment request belongs to another business."
      );
    }

    const nowIso = new Date().toISOString();
    let finalRequest: Record<string, any> = {};

    await adminDb.runTransaction(async (transaction: any) => {
      const adjRef = adminDb.collection("attendance_adjustment_requests").doc(requestId);
      const tReqSnap = await transaction.get(adjRef);
      const tRequest = toRecordData(tReqSnap);
      if (!tRequest) {
        throw new FinopsException("ADJUSTMENT_NOT_FOUND", "Demande d'ajustement introuvable.");
      }

      const tBiz = extractCanonicalBusinessId(tRequest);
      if (!tBiz || tBiz !== canonicalBusinessId) {
        throw new FinopsException("CROSS_TENANT_ATTENDANCE_DENIED", "Adjustment request belongs to another business.");
      }

      if (tRequest.status !== "REQUESTED") {
        throw new FinopsException(
          "ADJUSTMENT_ALREADY_PROCESSED",
          `Cette demande a déjà été traitée (statut: ${tRequest.status}).`
        );
      }

      // GAP-ATT-08: Strict Maker-Checker separation (requester CANNOT approve own adjustment)
      if (String(tRequest.requestedBy || "").trim() === actor.uid) {
        throw new FinopsException(
          "MAKER_CHECKER_VIOLATION",
          "Violation Maker-Checker : l'initiateur de la demande ne peut pas l'approuver."
        );
      }

      const sessRef = adminDb.collection("attendance_sessions").doc(tRequest.sessionId);
      const legacyRef = adminDb.collection("attendance_logs").doc(tRequest.sessionId);
      const recRef = adminDb.collection("attendance_records").doc(tRequest.sessionId);

      const [tSessSnap, tLegacySnap, tRecSnap] = await Promise.all([
        transaction.get(sessRef),
        transaction.get(legacyRef),
        transaction.get(recRef)
      ]);
      const tSession = toRecordData(tSessSnap);
      const tLegacy = toRecordData(tLegacySnap);
      const tRec = toRecordData(tRecSnap);

      const dateStr = toDateOnly(
        tRequest.date ||
          tSession?.checkIn?.deviceDate ||
          tLegacy?.date ||
          tSession?.checkIn?.timestamp
      );
      if (!dateStr) {
        throw new FinopsException(
          "INVALID_ATTENDANCE_DATE",
          "Impossible de vérifier la période de paie : date manquante sur la demande."
        );
      }

      await this.verifyPayrollPeriodUnlockedInTransaction(
        transaction,
        adminDb,
        canonicalBusinessId,
        dateStr
      );

      if (decisionKind === "APPROVED") {
        if (!tSession && !tLegacy && !tRec) {
          throw new FinopsException("SESSION_NOT_FOUND", "Session de pointage cible introuvable pour ajustement.");
        }

        const requestedHours = Number(tRequest.requestedHours || 0);
        const plannedHours =
          typeof tLegacy?.plannedHours === "number"
            ? tLegacy.plannedHours
            : typeof tRec?.plannedHours === "number"
              ? tRec.plannedHours
              : 8;
        const totalMinutes = Math.round(requestedHours * 60);
        const variance = Number((requestedHours - plannedHours).toFixed(2));
        const overtimeMinutes = Math.max(0, Math.round(variance * 60));

        if (tSession) {
          transaction.set(
            sessRef,
            {
              business_id: canonicalBusinessId,
              businessId: canonicalBusinessId,
              totalMinutes,
              overtimeMinutes,
              status: "COMPLETED",
              approvedBy: actor.uid,
              recordedBy: actor.uid,
              actorId: actor.uid,
              updatedAt: nowIso
            },
            { merge: true }
          );
        }

        const syncedRecordUpdate = {
          business_id: canonicalBusinessId,
          businessId: canonicalBusinessId,
          realHours: requestedHours,
          variance,
          status: "NORMAL",
          overrideBy: decision.canonicalRole,
          overrideReason: tRequest.reason,
          approvedBy: actor.uid,
          recordedBy: actor.uid,
          actorId: actor.uid,
          updatedAt: nowIso
        };

        if (tLegacy) {
          transaction.set(legacyRef, syncedRecordUpdate, { merge: true });
        }
        // Always update/create attendance_records so SSOT never diverges from attendance_logs
        transaction.set(
          recRef,
          {
            id: tRequest.sessionId,
            employeeId: target.id,
            employeeName: tLegacy?.employeeName || tRec?.employeeName || target.name || target.id,
            branchId: decision.canonicalBranchId || tLegacy?.branchId || tSession?.branchId || "BRANCH_DEFAULT",
            date: dateStr,
            plannedHours,
            ...syncedRecordUpdate
          },
          { merge: true }
        );

        const eventId = `ev_adj_${crypto.randomBytes(5).toString("hex")}`;
        transaction.set(adminDb.collection("attendance_events").doc(eventId), {
          eventId,
          action: "MANUAL_ADJUSTMENT",
          employeeId: target.id,
          business_id: canonicalBusinessId,
          businessId: canonicalBusinessId,
          branchId: decision.canonicalBranchId || "BRANCH_DEFAULT",
          performedBy: actor.uid,
          performedByRole: decision.canonicalRole,
          actorId: actor.uid,
          timestamp: nowIso,
          previousState: JSON.stringify({ requestId, status: tRequest.status }),
          newState: JSON.stringify({ requestId, status: "APPROVED", requestedHours, variance }),
          deviceInfo: "FINOPS-SERVER-API",
          auditHash: crypto.createHash("sha256").update(`${requestId}|APPROVE|${actor.uid}|${nowIso}`).digest("hex")
        });
      }

      finalRequest = {
        ...tRequest,
        business_id: canonicalBusinessId,
        businessId: canonicalBusinessId,
        status: decisionKind,
        approvedBy: actor.uid,
        approvedByRole: decision.canonicalRole,
        ...(decisionKind === "REJECTED" && input.rejectionReason ? { rejectionReason: input.rejectionReason.trim() } : {}),
        updatedAt: nowIso
      };

      transaction.set(adjRef, finalRequest, { merge: true });

      this.recordAuditEventInTransaction(transaction, adminDb, {
        businessId: canonicalBusinessId,
        actorId: actor.uid,
        actorName: actor.displayName || actor.email || actor.uid,
        actorRole: String(decision.canonicalRole),
        action: `ATTENDANCE_ADJUSTMENT_${decisionKind}`,
        targetEmployeeId: target.id,
        result: "SUCCESS",
        details: `Adjustment request ${requestId} ${decisionKind} by ${actor.uid} (requestedBy=${tRequest.requestedBy}).`,
        metadata: { requestId, sessionId: tRequest.sessionId, date: dateStr }
      });
    });

    return { request: finalRequest };
  }
};
