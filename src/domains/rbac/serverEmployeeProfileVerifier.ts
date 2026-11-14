import {
  CanonicalOperationalProfile,
  EXECUTIVE_RBAC_ROLES,
  OVERSIGHT_NON_OPERATIONAL_ROLES,
  TELLER_ROLES,
  COMMERCIAL_EMPLOYEE_ROLES,
  canApproveInternalTransferRole,
  canSuperviseTillLifecycleRole,
  evaluateOperationalProfileAccess,
  extractRawOperationalProfileFromRecord,
  normalizeOperationalProfile,
  normalizeRole,
  validateRoleOperationalProfileCompatibility
} from "./operationalProfilePolicy";

const INACTIVE_STATUSES = new Set<string>([
  "INACTIVE",
  "SUSPENDED",
  "TERMINATED",
  "DISABLED",
  "REVOKED",
  "ARCHIVED"
]);

export type ServerProfileCapability =
  | "cash"
  | "till_supervise"
  | "transfer_initiate"
  | "transfer_approve"
  | "commercial_sales"
  | "commercial_services";

export interface VerifiedServerOperationalActor {
  uid: string;
  employeeId?: string;
  businessId: string;
  role: string;
  operationalProfile: CanonicalOperationalProfile | null;
  status: string;
}

export class ServerProfileVerificationError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(code: string, message: string, statusCode = 403) {
    super(`${code}: ${message}`);
    this.name = "ServerProfileVerificationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

async function safeGetDoc(adminDb: any, collectionPath: string, docId: string): Promise<any | null> {
  if (!adminDb || !docId) return null;
  try {
    if (typeof adminDb.doc === "function") {
      const snap = await adminDb.doc(`${collectionPath}/${docId}`).get();
      if (snap && snap.exists) {
        return { id: snap.id || docId, ...(typeof snap.data === "function" ? snap.data() : snap.data) };
      }
    } else if (typeof adminDb.collection === "function") {
      const snap = await adminDb.collection(collectionPath).doc(docId).get();
      if (snap && snap.exists) {
        return { id: snap.id || docId, ...(typeof snap.data === "function" ? snap.data() : snap.data) };
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function safeFindEmployeeRecord(
  adminDb: any,
  uid: string,
  businessId?: string,
  email?: string
): Promise<any | null> {
  if (!adminDb || !uid) return null;

  const matchesTenant = (docData: any): boolean => {
    if (!docData) return false;
    if (!businessId) return true;
    const docBiz = String(docData.business_id || docData.businessId || "").trim();
    return !docBiz || docBiz === businessId;
  };

  // 1. Direct employees/{uid}
  const direct = await safeGetDoc(adminDb, "employees", uid);
  if (direct && matchesTenant(direct)) {
    return direct;
  }

  // 2. Subcollection businesses/{businessId}/employees/{uid}
  if (businessId) {
    const subDirect = await safeGetDoc(adminDb, `businesses/${businessId}/employees`, uid);
    if (subDirect) {
      return subDirect;
    }
  }

  // 3. Query by firebase_uid / uid / email if `.where` is supported by AdminDb / mock
  if (typeof adminDb.collection === "function") {
    const empCol = adminDb.collection("employees");
    if (empCol && typeof empCol.where === "function") {
      for (const field of ["firebase_uid", "uid"]) {
        try {
          const snap = await empCol.where(field, "==", uid).get();
          const docs = snap?.docs || [];
          for (const d of docs) {
            const data = typeof d.data === "function" ? d.data() : d.data;
            if (data && matchesTenant(data)) {
              return { id: d.id, ...data };
            }
          }
        } catch {
          // ignore query mismatch on mocks
        }
      }
      if (email) {
        const cleanEmail = email.trim().toLowerCase();
        for (const field of ["email", "normalizedEmail"]) {
          try {
            const snap = await empCol.where(field, "==", cleanEmail).get();
            const docs = snap?.docs || [];
            for (const d of docs) {
              const data = typeof d.data === "function" ? d.data() : d.data;
              if (data && matchesTenant(data)) {
                return { id: d.id, ...data };
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }
  }

  return null;
}

function assertRecordActive(record: any, sourceLabel: string): string {
  if (!record) return "ACTIVE";
  const rawStatus = String(record.status || record.employmentStatus || "ACTIVE")
    .trim()
    .toUpperCase();
  if (
    INACTIVE_STATUSES.has(rawStatus) ||
    record.isActive === false ||
    record.is_active === false ||
    record.disabled === true ||
    record.suspendedAt != null
  ) {
    throw new ServerProfileVerificationError(
      "INACTIVE_ACTOR",
      `Le profil ${sourceLabel} est inactif ou suspendu (${rawStatus}).`,
      403
    );
  }
  return rawStatus;
}

/**
 * Authoritative Server-Side Enforcement of RBAC Role × operational_profile.
 * Always resolves persisted `users/{uid}` and `employees` state from Admin Firestore
 * when available, prevents client role/profile spoofing, and fails closed.
 */
export async function verifyServerEmployeeOperationalProfile(args: {
  adminDb: any;
  uid: string;
  email?: string;
  businessId?: string;
  actorRole?: string;
  isSuperAdmin?: boolean;
  claimedRole?: unknown;
  claimedProfile?: unknown;
  capability: ServerProfileCapability;
  allowLegacyBarberAlias?: boolean;
}): Promise<VerifiedServerOperationalActor> {
  const uid = String(args.uid || "").trim();
  if (!uid) {
    throw new ServerProfileVerificationError("UNAUTHORIZED", "Acteur non authentifié.", 401);
  }

  const businessId = String(args.businessId || "").trim();
  const userDoc = await safeGetDoc(args.adminDb, "users", uid);
  const employeeDoc = await safeFindEmployeeRecord(args.adminDb, uid, businessId || undefined, args.email);

  if (userDoc) {
    assertRecordActive(userDoc, "utilisateur");
    if (businessId && !args.isSuperAdmin) {
      const userBiz = String(userDoc.business_id || userDoc.businessId || "").trim();
      if (userBiz && userBiz !== businessId) {
        throw new ServerProfileVerificationError(
          "FORBIDDEN_TENANT_ACCESS",
          "Violation d'isolation multi-tenant sur le compte utilisateur.",
          403
        );
      }
    }
  }

  if (employeeDoc) {
    assertRecordActive(employeeDoc, "employé");
    if (businessId && !args.isSuperAdmin) {
      const empBiz = String(employeeDoc.business_id || employeeDoc.businessId || "").trim();
      if (!empBiz || empBiz !== businessId) {
        throw new ServerProfileVerificationError(
          "FORBIDDEN_TENANT_ACCESS",
          "Violation d'isolation multi-tenant sur la fiche employé.",
          403
        );
      }
    }
  }

  // Authoritative role resolution: persisted employee/user role takes precedence if present, then middleware verified actorRole
  const persistedRole = normalizeRole(employeeDoc?.role) || normalizeRole(userDoc?.role);
  const resolvedRole = persistedRole || normalizeRole(args.actorRole);

  if (!resolvedRole) {
    throw new ServerProfileVerificationError(
      "FORBIDDEN_ROLE",
      "Rôle RBAC introuvable ou non vérifié (fail-closed).",
      403
    );
  }

  // Role escalation anti-spoofing if middleware role and persisted role conflict
  const actorMiddlewareRole = normalizeRole(args.actorRole);
  if (
    !args.isSuperAdmin &&
    actorMiddlewareRole &&
    persistedRole &&
    actorMiddlewareRole !== persistedRole
  ) {
    throw new ServerProfileVerificationError(
      "FORBIDDEN_ROLE",
      `Conflit entre le rôle authentifié (${actorMiddlewareRole}) et le rôle persisté (${persistedRole}).`,
      403
    );
  }

  // Reject client-supplied claimedRole spoofing
  if (args.claimedRole !== undefined && args.claimedRole !== null && String(args.claimedRole).trim() !== "") {
    const claimed = normalizeRole(args.claimedRole);
    if (!claimed || claimed !== resolvedRole) {
      throw new ServerProfileVerificationError(
        "ROLE_SPOOFING_DETECTED",
        `Tentative de substitution de rôle rejetée : '${String(args.claimedRole)}' vs '${resolvedRole}'.`,
        403
      );
    }
  }

  // Extract authoritative operational_profile (employees takes precedence over users, detect conflicts)
  const empProfileInfo = extractRawOperationalProfileFromRecord(employeeDoc);
  const userProfileInfo = extractRawOperationalProfileFromRecord(userDoc);

  if (empProfileInfo.conflict || userProfileInfo.conflict) {
    throw new ServerProfileVerificationError(
      "CONFLICTING_OPERATIONAL_PROFILE_FIELDS",
      "Incohérence détectée entre 'operational_profile' et 'operationalProfile'.",
      403
    );
  }

  let authoritativeRawProfile: unknown = undefined;
  if (empProfileInfo.hasValue && userProfileInfo.hasValue) {
    const eNorm = normalizeOperationalProfile(empProfileInfo.rawValue, {
      role: resolvedRole,
      allowLegacyBarberAlias: args.allowLegacyBarberAlias !== false
    });
    const uNorm = normalizeOperationalProfile(userProfileInfo.rawValue, {
      role: resolvedRole,
      allowLegacyBarberAlias: args.allowLegacyBarberAlias !== false
    });
    if (!eNorm || !uNorm || eNorm !== uNorm) {
      throw new ServerProfileVerificationError(
        "FORBIDDEN_OPERATIONAL_PROFILE",
        "Conflit ou profil opérationnel invalide entre l'utilisateur et sa fiche employé.",
        403
      );
    }
    authoritativeRawProfile = empProfileInfo.rawValue;
  } else if (empProfileInfo.hasValue) {
    authoritativeRawProfile = empProfileInfo.rawValue;
  } else if (userProfileInfo.hasValue) {
    authoritativeRawProfile = userProfileInfo.rawValue;
  }

  // Validate compatibility of resolvedRole x authoritativeRawProfile
  const compat = validateRoleOperationalProfileCompatibility(resolvedRole, authoritativeRawProfile, {
    allowLegacyBarberAlias: args.allowLegacyBarberAlias !== false,
    allowMissingForExecutiveOrOversight: true
  });

  if (!compat.valid) {
    throw new ServerProfileVerificationError(compat.code, compat.reason, 403);
  }

  // Reject client-supplied claimedProfile spoofing
  if (
    args.claimedProfile !== undefined &&
    args.claimedProfile !== null &&
    String(args.claimedProfile).trim() !== ""
  ) {
    const claimedNorm = normalizeOperationalProfile(args.claimedProfile, {
      role: resolvedRole,
      allowLegacyBarberAlias: false
    });
    if (!claimedNorm || claimedNorm !== compat.normalizedProfile) {
      throw new ServerProfileVerificationError(
        "OPERATIONAL_PROFILE_SPOOFING_DETECTED",
        `Tentative de substitution de profil opérationnel rejetée ('${String(args.claimedProfile)}').`,
        403
      );
    }
  }

  // Capability enforcement
  if (args.isSuperAdmin || resolvedRole === "SUPER_ADMIN") {
    return {
      uid,
      employeeId: employeeDoc?.id,
      businessId,
      role: resolvedRole,
      operationalProfile: compat.normalizedProfile,
      status: "ACTIVE"
    };
  }

  // Explicit Step 3 Correction: MASTER_HEAD_TELLER MUST NEVER approve or reject internal transfers
  if (args.capability === "transfer_approve") {
    if (!canApproveInternalTransferRole(resolvedRole)) {
      throw new ServerProfileVerificationError(
        "FORBIDDEN_ROLE",
        `Le rôle [${resolvedRole}] n'est pas autorisé à approuver ou rejeter les transferts internes.`,
        403
      );
    }
    if (TELLER_ROLES.has(resolvedRole) && compat.normalizedProfile !== "teller") {
      throw new ServerProfileVerificationError(
        "FORBIDDEN_OPERATIONAL_PROFILE",
        `Le rôle [${resolvedRole}] exige un profil opérationnel 'teller' valide pour superviser un transfert.`,
        403
      );
    }
    return {
      uid,
      employeeId: employeeDoc?.id,
      businessId,
      role: resolvedRole,
      operationalProfile: compat.normalizedProfile,
      status: "ACTIVE"
    };
  }

  if (args.capability === "till_supervise") {
    if (!canSuperviseTillLifecycleRole(resolvedRole)) {
      throw new ServerProfileVerificationError(
        "FORBIDDEN_ROLE",
        `Le rôle [${resolvedRole}] n'est pas autorisé à superviser ou provisionner les caisses.`,
        403
      );
    }
    if (TELLER_ROLES.has(resolvedRole) && compat.normalizedProfile !== "teller") {
      throw new ServerProfileVerificationError(
        "FORBIDDEN_OPERATIONAL_PROFILE",
        `Le rôle [${resolvedRole}] exige le profil opérationnel 'teller' pour superviser une caisse.`,
        403
      );
    }
    return {
      uid,
      employeeId: employeeDoc?.id,
      businessId,
      role: resolvedRole,
      operationalProfile: compat.normalizedProfile,
      status: "ACTIVE"
    };
  }

  if (args.capability === "transfer_initiate") {
    if (resolvedRole === "JUNIOR_TELLER") {
      throw new ServerProfileVerificationError(
        "FORBIDDEN_ROLE",
        "Un guichetier JUNIOR_TELLER ne peut pas initier un transfert interne (cash.transfer requis).",
        403
      );
    }
    if (OVERSIGHT_NON_OPERATIONAL_ROLES.has(resolvedRole) || COMMERCIAL_EMPLOYEE_ROLES.has(resolvedRole)) {
      throw new ServerProfileVerificationError(
        "FORBIDDEN_ROLE",
        `Le rôle [${resolvedRole}] n'est pas habilité à initier un transfert de caisse.`,
        403
      );
    }
    if (EXECUTIVE_RBAC_ROLES.has(resolvedRole)) {
      return {
        uid,
        employeeId: employeeDoc?.id,
        businessId,
        role: resolvedRole,
        operationalProfile: null,
        status: "ACTIVE"
      };
    }
    if (TELLER_ROLES.has(resolvedRole) && compat.normalizedProfile === "teller") {
      return {
        uid,
        employeeId: employeeDoc?.id,
        businessId,
        role: resolvedRole,
        operationalProfile: "teller",
        status: "ACTIVE"
      };
    }
    throw new ServerProfileVerificationError(
      "FORBIDDEN_OPERATIONAL_PROFILE",
      "Profil opérationnel 'teller' requis pour initier un transfert de caisse.",
      403
    );
  }

  const mappedCap =
    args.capability === "commercial_sales"
      ? "sales"
      : args.capability === "commercial_services"
      ? "services"
      : "cash";

  const decision = evaluateOperationalProfileAccess(resolvedRole, authoritativeRawProfile, mappedCap, {
    allowLegacyBarberAlias: args.allowLegacyBarberAlias !== false,
    allowExecutiveRoleBypass: true
  });

  if (!decision.allowed) {
    const errCode =
      COMMERCIAL_EMPLOYEE_ROLES.has(resolvedRole) || OVERSIGHT_NON_OPERATIONAL_ROLES.has(resolvedRole)
        ? mappedCap === "cash"
          ? "FORBIDDEN_ROLE"
          : decision.code
        : "FORBIDDEN_OPERATIONAL_PROFILE";
    throw new ServerProfileVerificationError(errCode, decision.reason, 403);
  }

  return {
    uid,
    employeeId: employeeDoc?.id,
    businessId,
    role: resolvedRole,
    operationalProfile: decision.normalizedProfile,
    status: "ACTIVE"
  };
}
