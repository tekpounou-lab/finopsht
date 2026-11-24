import { auth } from "../../lib/firebase";
import { Employee, EmployeeBadge } from "../../types";
import {
  TrustedAttendanceActor,
  TrustedAttendanceTarget,
  extractCanonicalBusinessId,
  normalizeCanonicalAttendanceRole
} from "./AttendanceAuthorizationService";

export interface ResolveClientActorParams {
  currentUser?: any;
  currentRole?: string | null;
  currentBusinessId?: string | null;
  employees?: Employee[];
}

export function resolveClientAuthenticatedActor(
  params: ResolveClientActorParams
): TrustedAttendanceActor {
  const firebaseUser = auth?.currentUser || null;
  const uid =
    (firebaseUser?.uid && String(firebaseUser.uid).trim()) ||
    (params.currentUser?.uid && String(params.currentUser.uid).trim()) ||
    (params.currentUser?.id && String(params.currentUser.id).trim()) ||
    "";

  const employees = Array.isArray(params.employees) ? params.employees : [];
  const operatorEmp = uid
    ? employees.find(
        (e) =>
          e.firebase_uid === uid ||
          (e as any).uid === uid ||
          e.id === uid ||
          (params.currentUser?.employeeId && e.id === params.currentUser.employeeId)
      )
    : undefined;

  const rawRole =
    params.currentRole ||
    params.currentUser?.role ||
    operatorEmp?.role ||
    null;

  const canonicalRole = normalizeCanonicalAttendanceRole(rawRole);
  const businessId =
    extractCanonicalBusinessId({
      business_id: params.currentBusinessId || params.currentUser?.business_id || operatorEmp?.business_id,
      businessId: params.currentUser?.businessId
    }) || null;

  return {
    uid,
    email: firebaseUser?.email || params.currentUser?.email || operatorEmp?.email || null,
    displayName:
      firebaseUser?.displayName ||
      params.currentUser?.displayName ||
      params.currentUser?.name ||
      operatorEmp?.name ||
      firebaseUser?.email ||
      uid,
    role: canonicalRole,
    business_id: businessId,
    businessId,
    isSuperAdmin: canonicalRole === "SUPER_ADMIN",
    employeeId: operatorEmp?.id || params.currentUser?.employeeId || null,
    branchId:
      params.currentUser?.branchId ||
      params.currentUser?.branch_id ||
      operatorEmp?.branchId ||
      null,
    departmentId:
      params.currentUser?.departmentId ||
      params.currentUser?.department_id ||
      operatorEmp?.departmentId ||
      null,
    authorizedBranchIds: params.currentUser?.authorizedBranchIds || (operatorEmp as any)?.authorizedBranchIds || null,
    authorizedDepartmentIds: params.currentUser?.authorizedDepartmentIds || (operatorEmp as any)?.authorizedDepartmentIds || null,
    authorizedTeamIds: params.currentUser?.authorizedTeamIds || (operatorEmp as any)?.authorizedTeamIds || null,
    delegatedEmployeeIds: params.currentUser?.delegatedEmployeeIds || (operatorEmp as any)?.delegatedEmployeeIds || null,
    delegatedBranchIds: params.currentUser?.delegatedBranchIds || (operatorEmp as any)?.delegatedBranchIds || null,
    explicitAttendanceDelegation: Boolean(
      params.currentUser?.explicitAttendanceDelegation ||
      (operatorEmp as any)?.explicitAttendanceDelegation
    ),
    status: params.currentUser?.status || operatorEmp?.status || "ACTIVE"
  };
}

export function toTrustedAttendanceTarget(emp: Employee): TrustedAttendanceTarget {
  return {
    id: emp.id,
    uid: (emp as any).uid || null,
    firebase_uid: emp.firebase_uid || null,
    userId: (emp as any).userId || null,
    email: emp.email || null,
    name: emp.name || null,
    role: emp.role || null,
    business_id: emp.business_id || null,
    businessId: (emp as any).businessId || null,
    branchId: emp.branchId || null,
    departmentId: emp.departmentId || null,
    managerId: emp.managerId || null,
    supervisorId: (emp as any).supervisorId || null,
    status: emp.status || "ACTIVE",
    active: emp.isActive
  };
}

export interface BadgeVerificationResult {
  valid: boolean;
  reasonCode?:
    | "CROSS_TENANT"
    | "BADGE_REVOKED"
    | "BADGE_EXPIRED"
    | "INVALID_SIGNATURE"
    | "AMBIGUOUS_ACTIVE_BADGES";
  message?: string;
}

export function verifyScannedBadgeSecurity(params: {
  emp: Employee;
  activeBadge?: EmployeeBadge | any;
  allEmployeeBadges?: Array<EmployeeBadge | any>;
  signature?: string;
  payloadBusinessId?: string;
  currentBusinessId: string;
  requireSignature?: boolean;
}): BadgeVerificationResult {
  const {
    emp,
    activeBadge,
    allEmployeeBadges,
    signature,
    payloadBusinessId,
    currentBusinessId,
    requireSignature = true
  } = params;

  const empBiz = extractCanonicalBusinessId(emp);
  if (!currentBusinessId || !empBiz || empBiz !== currentBusinessId) {
    return {
      valid: false,
      reasonCode: "CROSS_TENANT",
      message: "Violation d'isolation multi-tenant : identité ou entreprise invalide."
    };
  }

  if (payloadBusinessId && payloadBusinessId.trim() !== currentBusinessId) {
    return {
      valid: false,
      reasonCode: "CROSS_TENANT",
      message: "Violation d'isolation multi-tenant : le badge appartient à une autre entreprise."
    };
  }

  if (Array.isArray(allEmployeeBadges)) {
    const activeCount = allEmployeeBadges.filter(
      (b) => b && b.employeeId === emp.id && String(b.status || "").toUpperCase() === "ACTIVE"
    ).length;
    if (activeCount > 1) {
      return {
        valid: false,
        reasonCode: "AMBIGUOUS_ACTIVE_BADGES",
        message: "Plusieurs badges actifs détectés pour cet employé : vérification refusée."
      };
    }
  }

  const trimmedSig = typeof signature === "string" ? signature.trim() : "";

  if (activeBadge) {
    const badgeBiz = extractCanonicalBusinessId(activeBadge);
    if (badgeBiz && badgeBiz !== currentBusinessId) {
      return {
        valid: false,
        reasonCode: "CROSS_TENANT",
        message: "Violation d'isolation multi-tenant : le badge appartient à une autre entreprise."
      };
    }

    const badgeStatus = String(activeBadge.status || "").toUpperCase();
    if (badgeStatus === "REVOKED" || badgeStatus === "SUSPENDED") {
      return {
        valid: false,
        reasonCode: "BADGE_REVOKED",
        message: `Badge refusé : statut ${badgeStatus}.`
      };
    }
    if (activeBadge.expiresAt && new Date(activeBadge.expiresAt).getTime() < Date.now()) {
      return {
        valid: false,
        reasonCode: "BADGE_EXPIRED",
        message: "Badge expiré."
      };
    }

    if (!trimmedSig) {
      return {
        valid: false,
        reasonCode: "INVALID_SIGNATURE",
        message: "Signature cryptographique du badge requise pour ce collaborateur."
      };
    }

    const expectedSig = typeof activeBadge.signature === "string" ? activeBadge.signature.trim() : "";
    const expectedHash = typeof activeBadge.tokenHash === "string" ? activeBadge.tokenHash.trim() : "";
    const matches =
      (expectedSig !== "" && expectedSig === trimmedSig) ||
      (expectedHash !== "" && expectedHash === trimmedSig);

    if (!matches) {
      return {
        valid: false,
        reasonCode: "INVALID_SIGNATURE",
        message: "Signature cryptographique du badge invalide ou falsifiée."
      };
    }
  } else if (requireSignature && !trimmedSig) {
    return {
      valid: false,
      reasonCode: "INVALID_SIGNATURE",
      message: "Badge QR non signé refusé : aucun badge actif signé n'est vérifiable."
    };
  }

  return { valid: true };
}
