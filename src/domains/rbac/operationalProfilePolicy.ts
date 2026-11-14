/**
 * FINOPS ERP / FINAYITI FUSION
 * SINGLE SOURCE OF TRUTH — RBAC ROLE × OPERATIONAL PROFILE POLICY (STEP 4 + STEP 3 CORRECTION)
 *
 * Authoritative Business Rules:
 * 1. Canonical OperationalProfile union: "vendeur" | "polyvalent" | "teller" ONLY.
 *    Retired pseudo-profiles ("head_teller", "manager", "owner") MUST be rejected.
 * 2. EMPLOYEE (commercial employee):
 *    - "vendeur" (or legacy "barber" read/migration alias -> "vendeur"): Sales ALLOW, Services DENY, Cash DENY.
 *    - "polyvalent": Sales ALLOW, Services ALLOW, Cash DENY (never unlocks cash/teller!).
 *    - "teller" or missing/unknown/malformed: DENY ALL (incompatible combination / fail-closed).
 * 3. TELLER roles ("JUNIOR_TELLER", "SENIOR_TELLER", "HEAD_TELLER", "MASTER_HEAD_TELLER", legacy "TELLER"):
 *    - "teller": Sales DENY, Services DENY, Cash ALLOW (subject to role-specific RBAC & limits).
 *    - "vendeur", "polyvalent", "barber", retired profiles, or missing/unknown/malformed: DENY ALL.
 * 4. Executive RBAC roles ("OWNER", "MANAGER", "ADMIN", "SUPER_ADMIN"):
 *    - Authority derives strictly from RBAC role + explicit permissions, never pseudo-profiles.
 *    - Must not carry retired or employee/teller operational profiles.
 * 5. Oversight / non-operational roles ("ACCOUNTANT", "AUDITOR", "SUPERVISOR", "UNASSIGNED", etc.):
 *    - Fail closed (DENY) on commercial employee (sales/services) and teller cash operations.
 * 6. MASTER_HEAD_TELLER Internal Transfer Approval Correction (Step 3 fix):
 *    - MASTER_HEAD_TELLER CAN operate cash, initiate transfers (cash.transfer), supervise tills/closures (cash.supervise),
 *      and auto-provision tills, but MUST NEVER approve or reject internal transfers (transfer.approve = DENY).
 *    - Only SUPER_ADMIN, OWNER, ADMIN, MANAGER, HEAD_TELLER can hold transfer.approve.
 */

export const CANONICAL_OPERATIONAL_PROFILES = ["vendeur", "polyvalent", "teller"] as const;
export type CanonicalOperationalProfile = (typeof CANONICAL_OPERATIONAL_PROFILES)[number];

export const RETIRED_OPERATIONAL_PROFILES = new Set<string>([
  "head_teller",
  "manager",
  "owner"
]);

export const COMMERCIAL_EMPLOYEE_ROLES = new Set<string>(["EMPLOYEE"]);

export const TELLER_ROLES = new Set<string>([
  "JUNIOR_TELLER",
  "SENIOR_TELLER",
  "HEAD_TELLER",
  "MASTER_HEAD_TELLER",
  "TELLER"
]);

export const EXECUTIVE_RBAC_ROLES = new Set<string>([
  "OWNER",
  "MANAGER",
  "ADMIN",
  "SUPER_ADMIN"
]);

export const OVERSIGHT_NON_OPERATIONAL_ROLES = new Set<string>([
  "ACCOUNTANT",
  "AUDITOR",
  "SUPERVISOR",
  "UNASSIGNED",
  "DIRECTOR",
  "HR_MANAGER",
  "PAYROLL_MANAGER",
  "TEAM_LEADER",
  "GUEST"
]);

/**
 * Authoritative roles allowed to approve or reject internal transfers (with Maker-Checker enforcement).
 * Explicitly EXCLUDES MASTER_HEAD_TELLER, JUNIOR_TELLER, SENIOR_TELLER, TELLER, EMPLOYEE, ACCOUNTANT, AUDITOR.
 */
export const INTERNAL_TRANSFER_APPROVER_ROLES = new Set<string>([
  "SUPER_ADMIN",
  "OWNER",
  "ADMIN",
  "MANAGER",
  "HEAD_TELLER"
]);

/**
 * Authoritative roles allowed to supervise till lifecycle (closure supervision, till reopen, auto-provisioning).
 * Includes MASTER_HEAD_TELLER for multi-branch till supervision while EXCLUDING internal transfer approval.
 */
export const TILL_SUPERVISOR_ROLES = new Set<string>([
  "HEAD_TELLER",
  "MASTER_HEAD_TELLER",
  "MANAGER",
  "OWNER",
  "ADMIN",
  "SUPER_ADMIN"
]);

export type OperationalCapability = "sales" | "services" | "cash";

export interface ProfileCompatibilityResult {
  valid: boolean;
  normalizedRole: string | null;
  normalizedProfile: CanonicalOperationalProfile | null;
  legacyAliasApplied?: boolean;
  code:
    | "VALID"
    | "INVALID_OR_MISSING_ROLE"
    | "MISSING_OPERATIONAL_PROFILE"
    | "INVALID_OPERATIONAL_PROFILE"
    | "RETIRED_OPERATIONAL_PROFILE"
    | "FORBIDDEN_BARBER_ALIAS"
    | "FORBIDDEN_ROLE_PROFILE_COMBINATION"
    | "CONFLICTING_OPERATIONAL_PROFILE_FIELDS";
  reason: string;
}

export interface OperationalCapabilityDecision {
  allowed: boolean;
  normalizedRole: string | null;
  normalizedProfile: CanonicalOperationalProfile | null;
  code: string;
  reason: string;
}

/**
 * Normalizes a raw RBAC role string safely. Fails closed (returns null) on missing, empty, or non-string values.
 */
export function normalizeRole(rawRole: unknown): string | null {
  if (typeof rawRole !== "string") return null;
  const trimmed = rawRole.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function isKnownSystemRole(rawRole: unknown): boolean {
  const role = normalizeRole(rawRole);
  if (!role) return false;
  return (
    COMMERCIAL_EMPLOYEE_ROLES.has(role) ||
    TELLER_ROLES.has(role) ||
    EXECUTIVE_RBAC_ROLES.has(role) ||
    OVERSIGHT_NON_OPERATIONAL_ROLES.has(role)
  );
}

export function isTellerRole(rawRole: unknown): boolean {
  const role = normalizeRole(rawRole);
  return role !== null && TELLER_ROLES.has(role);
}

export function isCommercialEmployeeRole(rawRole: unknown): boolean {
  const role = normalizeRole(rawRole);
  return role !== null && COMMERCIAL_EMPLOYEE_ROLES.has(role);
}

export function isExecutiveRbacRole(rawRole: unknown): boolean {
  const role = normalizeRole(rawRole);
  return role !== null && EXECUTIVE_RBAC_ROLES.has(role);
}

export function isOversightRole(rawRole: unknown): boolean {
  const role = normalizeRole(rawRole);
  return role !== null && OVERSIGHT_NON_OPERATIONAL_ROLES.has(role);
}

/**
 * Normalizes a raw operational_profile string strictly.
 * - Fails closed (returns null) on missing, null, undefined, non-string, whitespace, unknown, or retired values.
 * - Legacy "barber" alias is accepted ONLY when `allowLegacyBarberAlias !== false` AND `role === "EMPLOYEE"`,
 *   mapping strictly to "vendeur".
 */
export function normalizeOperationalProfile(
  rawProfile: unknown,
  options?: { role?: unknown; allowLegacyBarberAlias?: boolean }
): CanonicalOperationalProfile | null {
  if (typeof rawProfile !== "string") return null;
  const cleaned = rawProfile.trim().toLowerCase();
  if (!cleaned) return null;

  if (RETIRED_OPERATIONAL_PROFILES.has(cleaned)) {
    return null;
  }

  if (cleaned === "barber") {
    const allowAlias = options?.allowLegacyBarberAlias !== false;
    const role = normalizeRole(options?.role);
    if (allowAlias && role === "EMPLOYEE") {
      return "vendeur";
    }
    return null;
  }

  if (cleaned === "vendeur" || cleaned === "polyvalent" || cleaned === "teller") {
    return cleaned;
  }

  return null;
}

/**
 * Extracts raw operational_profile / operationalProfile from a record and detects conflicting dual fields.
 */
export function extractRawOperationalProfileFromRecord(record: any): {
  hasValue: boolean;
  rawValue: unknown;
  conflict: boolean;
} {
  if (!record || typeof record !== "object") {
    return { hasValue: false, rawValue: undefined, conflict: false };
  }

  const snake = record.operational_profile;
  const camel = record.operationalProfile;

  const hasSnake = snake !== undefined && snake !== null && String(snake).trim() !== "";
  const hasCamel = camel !== undefined && camel !== null && String(camel).trim() !== "";

  if (hasSnake && hasCamel) {
    const sNorm = typeof snake === "string" ? snake.trim().toLowerCase() : String(snake);
    const cNorm = typeof camel === "string" ? camel.trim().toLowerCase() : String(camel);
    if (sNorm !== cNorm) {
      return { hasValue: true, rawValue: snake, conflict: true };
    }
    return { hasValue: true, rawValue: snake, conflict: false };
  }

  if (hasSnake) return { hasValue: true, rawValue: snake, conflict: false };
  if (hasCamel) return { hasValue: true, rawValue: camel, conflict: false };

  // Preserve explicit non-empty/malformed non-string or empty strings if explicitly present
  if (snake !== undefined) return { hasValue: false, rawValue: snake, conflict: false };
  if (camel !== undefined) return { hasValue: false, rawValue: camel, conflict: false };

  return { hasValue: false, rawValue: undefined, conflict: false };
}

/**
 * Validates compatibility between an RBAC role and an operational_profile.
 * Zero silent coercion of incompatible pairs. Fails closed on missing/malformed inputs.
 */
export function validateRoleOperationalProfileCompatibility(
  rawRole: unknown,
  rawProfile: unknown,
  options?: {
    allowLegacyBarberAlias?: boolean;
    allowMissingForExecutiveOrOversight?: boolean;
  }
): ProfileCompatibilityResult {
  const role = normalizeRole(rawRole);
  if (!role || !isKnownSystemRole(role)) {
    return {
      valid: false,
      normalizedRole: role,
      normalizedProfile: null,
      code: "INVALID_OR_MISSING_ROLE",
      reason: `Rôle RBAC invalide ou manquant [${String(rawRole ?? "")}].`
    };
  }

  const allowAlias = options?.allowLegacyBarberAlias !== false;
  const allowMissingForExecOrOversight = options?.allowMissingForExecutiveOrOversight !== false;

  const isMissingRaw =
    rawProfile === undefined ||
    rawProfile === null ||
    (typeof rawProfile === "string" && rawProfile.trim() === "");

  if (COMMERCIAL_EMPLOYEE_ROLES.has(role)) {
    if (isMissingRaw) {
      return {
        valid: false,
        normalizedRole: role,
        normalizedProfile: null,
        code: "MISSING_OPERATIONAL_PROFILE",
        reason: "Un collaborateur EMPLOYEE doit posséder un profil opérationnel valide ('vendeur' ou 'polyvalent')."
      };
    }
    if (typeof rawProfile !== "string") {
      return {
        valid: false,
        normalizedRole: role,
        normalizedProfile: null,
        code: "INVALID_OPERATIONAL_PROFILE",
        reason: "Le profil opérationnel doit être une chaîne de caractères valide."
      };
    }

    const cleaned = rawProfile.trim().toLowerCase();
    if (RETIRED_OPERATIONAL_PROFILES.has(cleaned)) {
      return {
        valid: false,
        normalizedRole: role,
        normalizedProfile: null,
        code: "RETIRED_OPERATIONAL_PROFILE",
        reason: `Le pseudo-profil obsolète '${cleaned}' est interdit.`
      };
    }

    if (cleaned === "barber") {
      if (!allowAlias) {
        return {
          valid: false,
          normalizedRole: role,
          normalizedProfile: null,
          code: "FORBIDDEN_BARBER_ALIAS",
          reason: "L'alias hérité 'barber' est remplacé par 'vendeur'."
        };
      }
      return {
        valid: true,
        normalizedRole: role,
        normalizedProfile: "vendeur",
        legacyAliasApplied: true,
        code: "VALID",
        reason: "Alias hérité 'barber' normalisé vers 'vendeur' pour EMPLOYEE."
      };
    }

    if (cleaned === "vendeur" || cleaned === "polyvalent") {
      return {
        valid: true,
        normalizedRole: role,
        normalizedProfile: cleaned,
        code: "VALID",
        reason: `Combinaison valide EMPLOYEE + ${cleaned}.`
      };
    }

    if (cleaned === "teller") {
      return {
        valid: false,
        normalizedRole: role,
        normalizedProfile: null,
        code: "FORBIDDEN_ROLE_PROFILE_COMBINATION",
        reason: "Combinaison interdite : un collaborateur EMPLOYEE ne peut jamais porter le profil 'teller'."
      };
    }

    return {
      valid: false,
      normalizedRole: role,
      normalizedProfile: null,
      code: "INVALID_OPERATIONAL_PROFILE",
      reason: `Profil opérationnel inconnu ou invalide [${rawProfile}].`
    };
  }

  if (TELLER_ROLES.has(role)) {
    if (isMissingRaw) {
      return {
        valid: false,
        normalizedRole: role,
        normalizedProfile: null,
        code: "MISSING_OPERATIONAL_PROFILE",
        reason: `Le rôle caissier [${role}] exige impérativement le profil opérationnel 'teller'.`
      };
    }
    if (typeof rawProfile !== "string") {
      return {
        valid: false,
        normalizedRole: role,
        normalizedProfile: null,
        code: "INVALID_OPERATIONAL_PROFILE",
        reason: "Le profil opérationnel doit être une chaîne de caractères valide ('teller')."
      };
    }

    const cleaned = rawProfile.trim().toLowerCase();
    if (RETIRED_OPERATIONAL_PROFILES.has(cleaned)) {
      return {
        valid: false,
        normalizedRole: role,
        normalizedProfile: null,
        code: "RETIRED_OPERATIONAL_PROFILE",
        reason: `Le pseudo-profil obsolète '${cleaned}' est interdit pour les rôles caissiers; utilisez exclusivement 'teller'.`
      };
    }

    if (cleaned === "barber") {
      return {
        valid: false,
        normalizedRole: role,
        normalizedProfile: null,
        code: "FORBIDDEN_BARBER_ALIAS",
        reason: `Combinaison interdite : l'alias hérité 'barber' ne peut jamais être attribué au rôle [${role}].`
      };
    }

    if (cleaned === "teller") {
      return {
        valid: true,
        normalizedRole: role,
        normalizedProfile: "teller",
        code: "VALID",
        reason: `Combinaison valide ${role} + teller.`
      };
    }

    if (cleaned === "vendeur" || cleaned === "polyvalent") {
      return {
        valid: false,
        normalizedRole: role,
        normalizedProfile: null,
        code: "FORBIDDEN_ROLE_PROFILE_COMBINATION",
        reason: `Combinaison interdite : un rôle caissier [${role}] ne peut pas porter le profil commercial '${cleaned}'.`
      };
    }

    return {
      valid: false,
      normalizedRole: role,
      normalizedProfile: null,
      code: "INVALID_OPERATIONAL_PROFILE",
      reason: `Profil opérationnel inconnu ou invalide [${rawProfile}] pour le rôle [${role}].`
    };
  }

  // Executive RBAC roles & Non-operational Oversight roles MUST NOT hold commercial/teller/retired pseudo-profiles
  if (isMissingRaw && allowMissingForExecOrOversight) {
    return {
      valid: true,
      normalizedRole: role,
      normalizedProfile: null,
      code: "VALID",
      reason: `Rôle [${role}] autorisé sans profil opérationnel (autorité dérivée uniquement du rôle RBAC).`
    };
  }

  if (typeof rawProfile !== "string") {
    return {
      valid: false,
      normalizedRole: role,
      normalizedProfile: null,
      code: "INVALID_OPERATIONAL_PROFILE",
      reason: `Profil opérationnel invalide pour le rôle [${role}].`
    };
  }

  const cleaned = rawProfile.trim().toLowerCase();
  if (RETIRED_OPERATIONAL_PROFILES.has(cleaned)) {
    return {
      valid: false,
      normalizedRole: role,
      normalizedProfile: null,
      code: "RETIRED_OPERATIONAL_PROFILE",
      reason: `Le pseudo-profil obsolète '${cleaned}' est interdit; utilisez exclusivement les rôles RBAC.`
    };
  }

  if (cleaned === "barber") {
    return {
      valid: false,
      normalizedRole: role,
      normalizedProfile: null,
      code: "FORBIDDEN_BARBER_ALIAS",
      reason: `L'alias hérité 'barber' est réservé aux anciens enregistrements EMPLOYEE uniquement.`
    };
  }

  return {
    valid: false,
    normalizedRole: role,
    normalizedProfile: null,
    code: "FORBIDDEN_ROLE_PROFILE_COMBINATION",
    reason: `Le rôle [${role}] ne peut pas être associé au profil opérationnel '${cleaned}'.`
  };
}

/**
 * Evaluates operational capability ("sales" | "services" | "cash") strictly against Role × OperationalProfile.
 * Fails closed on any missing, invalid, retired, or incompatible role/profile combination.
 */
export function evaluateOperationalProfileAccess(
  rawRole: unknown,
  rawProfile: unknown,
  capability: OperationalCapability,
  options?: {
    allowLegacyBarberAlias?: boolean;
    allowExecutiveRoleBypass?: boolean;
  }
): OperationalCapabilityDecision {
  const role = normalizeRole(rawRole);
  if (!role || !isKnownSystemRole(role)) {
    return {
      allowed: false,
      normalizedRole: role,
      normalizedProfile: null,
      code: "INVALID_OR_MISSING_ROLE",
      reason: "Accès refusé : rôle RBAC absent ou inconnu (fail-closed)."
    };
  }

  // Executive RBAC roles (OWNER, MANAGER, ADMIN, SUPER_ADMIN)
  if (EXECUTIVE_RBAC_ROLES.has(role)) {
    const compat = validateRoleOperationalProfileCompatibility(role, rawProfile, {
      allowLegacyBarberAlias: false,
      allowMissingForExecutiveOrOversight: true
    });
    if (!compat.valid) {
      return {
        allowed: false,
        normalizedRole: role,
        normalizedProfile: null,
        code: compat.code,
        reason: compat.reason
      };
    }
    if (options?.allowExecutiveRoleBypass === true) {
      return {
        allowed: true,
        normalizedRole: role,
        normalizedProfile: null,
        code: "ALLOWED_EXECUTIVE_RBAC_ROLE",
        reason: `Autorisé par rôle RBAC exécutif [${role}].`
      };
    }
    return {
      allowed: false,
      normalizedRole: role,
      normalizedProfile: null,
      code: "EXECUTIVE_REQUIRES_EXPLICIT_RBAC_CHECK",
      reason: `Le rôle exécutif [${role}] ne passe pas par un profil opérationnel employé.`
    };
  }

  // Oversight / Non-operational roles (ACCOUNTANT, AUDITOR, SUPERVISOR, UNASSIGNED, etc.) fail closed
  if (OVERSIGHT_NON_OPERATIONAL_ROLES.has(role)) {
    return {
      allowed: false,
      normalizedRole: role,
      normalizedProfile: null,
      code: "OVERSIGHT_ROLE_OPERATIONAL_DENY",
      reason: `Accès opérationnel refusé pour le rôle de contrôle/non-opérationnel [${role}].`
    };
  }

  const compat = validateRoleOperationalProfileCompatibility(role, rawProfile, {
    allowLegacyBarberAlias: options?.allowLegacyBarberAlias !== false,
    allowMissingForExecutiveOrOversight: false
  });

  if (!compat.valid || !compat.normalizedProfile) {
    return {
      allowed: false,
      normalizedRole: role,
      normalizedProfile: null,
      code: compat.code,
      reason: compat.reason
    };
  }

  const profile = compat.normalizedProfile;

  // EMPLOYEE strict commercial matrix
  if (COMMERCIAL_EMPLOYEE_ROLES.has(role)) {
    if (capability === "cash") {
      return {
        allowed: false,
        normalizedRole: role,
        normalizedProfile: profile,
        code: "FORBIDDEN_EMPLOYEE_CASH_ACCESS",
        reason: `Un collaborateur EMPLOYEE (${profile}) ne peut jamais effectuer d'opérations de caisse ou de guichet.`
      };
    }
    if (capability === "sales") {
      return {
        allowed: true,
        normalizedRole: role,
        normalizedProfile: profile,
        code: "ALLOWED_EMPLOYEE_SALES",
        reason: `Ventes autorisées pour EMPLOYEE (${profile}).`
      };
    }
    if (capability === "services") {
      if (profile === "polyvalent") {
        return {
          allowed: true,
          normalizedRole: role,
          normalizedProfile: profile,
          code: "ALLOWED_EMPLOYEE_SERVICES",
          reason: "Prestations de services autorisées pour EMPLOYEE (polyvalent)."
        };
      }
      return {
        allowed: false,
        normalizedRole: role,
        normalizedProfile: profile,
        code: "FORBIDDEN_VENDEUR_SERVICES_ACCESS",
        reason: "Un collaborateur EMPLOYEE au profil 'vendeur' est limité aux ventes et ne peut pas enregistrer de prestations de services."
      };
    }
  }

  // TELLER strict cash matrix
  if (TELLER_ROLES.has(role)) {
    if (capability === "sales" || capability === "services") {
      return {
        allowed: false,
        normalizedRole: role,
        normalizedProfile: profile,
        code: "FORBIDDEN_TELLER_COMMERCIAL_ACCESS",
        reason: `Un rôle caissier [${role}] ne peut pas effectuer d'opérations commerciales (${capability}).`
      };
    }
    if (capability === "cash" && profile === "teller") {
      return {
        allowed: true,
        normalizedRole: role,
        normalizedProfile: profile,
        code: "ALLOWED_TELLER_CASH",
        reason: `Opérations de caisse autorisées pour [${role}] avec profil 'teller'.`
      };
    }
  }

  return {
    allowed: false,
    normalizedRole: role,
    normalizedProfile: null,
    code: "DENIED_BY_DEFAULT",
    reason: "Accès opérationnel refusé par défaut (fail-closed)."
  };
}

export function canRecordCommercialSales(
  rawRole: unknown,
  rawProfile: unknown,
  options?: { allowLegacyBarberAlias?: boolean; allowExecutiveRoleBypass?: boolean }
): OperationalCapabilityDecision {
  return evaluateOperationalProfileAccess(rawRole, rawProfile, "sales", options);
}

export function canRecordCommercialServices(
  rawRole: unknown,
  rawProfile: unknown,
  options?: { allowLegacyBarberAlias?: boolean; allowExecutiveRoleBypass?: boolean }
): OperationalCapabilityDecision {
  return evaluateOperationalProfileAccess(rawRole, rawProfile, "services", options);
}

export function canOperateCashTill(
  rawRole: unknown,
  rawProfile: unknown,
  options?: { allowExecutiveRoleBypass?: boolean }
): OperationalCapabilityDecision {
  return evaluateOperationalProfileAccess(rawRole, rawProfile, "cash", {
    allowLegacyBarberAlias: false,
    allowExecutiveRoleBypass: options?.allowExecutiveRoleBypass === true
  });
}

/**
 * Step 3 Mandatory Correction Guard:
 * MASTER_HEAD_TELLER MUST NEVER approve or reject internal transfers.
 */
export function canApproveInternalTransferRole(rawRole: unknown): boolean {
  const role = normalizeRole(rawRole);
  if (!role) return false;
  if (role === "MASTER_HEAD_TELLER") return false;
  return INTERNAL_TRANSFER_APPROVER_ROLES.has(role);
}

export function canSuperviseTillLifecycleRole(rawRole: unknown): boolean {
  const role = normalizeRole(rawRole);
  if (!role) return false;
  return TILL_SUPERVISOR_ROLES.has(role);
}
