import { Employee } from "../../../types";
import { CashTill, CurrencyCode } from "../../../types/cashManagement";

export interface TillAssignmentEligibilityResult {
  isEligible: boolean;
  reason?: string;
  code: 
    | "ELIGIBLE"
    | "INACTIVE_STATUS"
    | "CROSS_TENANT_VIOLATION"
    | "UNAUTHORIZED_ROLE"
    | "DUPLICATE_CURRENCY_ASSIGNMENT"
    | "SAFE_ASSIGNMENT_FORBIDDEN";
}

export interface InvitationEligibilityResult {
  isEligible: boolean;
  reason?: string;
  code:
    | "ELIGIBLE"
    | "ALREADY_HAS_ACTIVE_ACCOUNT"
    | "PENDING_INVITATION_EXISTS"
    | "TERMINATED_OR_ARCHIVED";
}

/**
 * FINOPS ERP — Domain Service: Employee Cash & Till Eligibility Service
 * 
 * Enforces strict separation between:
 * 1. INVITATION ELIGIBILITY (Needs onboarding invitation token to access the platform)
 * 2. TILL ASSIGNMENT ELIGIBILITY (Operational authorization to hold and operate a physical cash drawer)
 * 
 * Invariant: Never use `!user_id` as a generic requirement for teller assignment.
 * An active employee with an existing valid user account or HR record is assignable
 * if they meet active employment and role criteria.
 */
export class EmployeeCashEligibilityService {
  private static AUTHORIZED_TELLER_ROLES = new Set([
    "TELLER",
    "JUNIOR_TELLER",
    "SENIOR_TELLER",
    "HEAD_TELLER",
    "POLYVALENT",
    "VENDEUR",
    "CASHIER",
    "CAISSIER",
    "MANAGER",
    "OWNER",
    "ADMIN",
    "SUPER_ADMIN",
    "EMPLOYEE"
  ]);

  /**
   * Evaluates if an employee is eligible to receive an onboarding invitation.
   */
  public static isEligibleForInvitation(
    employee: Employee,
    existingInvitations: Array<{ email?: string; status?: string; employeeId?: string }> = []
  ): InvitationEligibilityResult {
    const status = (employee.status || "").toUpperCase();
    if (status === "TERMINATED" || status === "ARCHIVED") {
      return {
        isEligible: false,
        reason: "Collaborateur archivé ou dont le contrat a pris fin.",
        code: "TERMINATED_OR_ARCHIVED"
      };
    }

    // If employee already has a linked active user account and is ACTIVE, no invitation needed
    const hasActiveUserAccount = Boolean(
      (employee.userId && employee.userId.trim() !== "") ||
      (employee.firebase_uid && employee.firebase_uid.trim() !== "") ||
      (employee.uid && employee.uid.trim() !== "")
    );

    if (hasActiveUserAccount && status === "ACTIVE") {
      return {
        isEligible: false,
        reason: "Le collaborateur possède déjà un compte utilisateur actif lié.",
        code: "ALREADY_HAS_ACTIVE_ACCOUNT"
      };
    }

    const cleanEmail = (employee.email || "").toLowerCase().trim();
    const hasPendingInvite = existingInvitations.some((inv) => {
      const invEmail = (inv.email || "").toLowerCase().trim();
      const st = (inv.status || "").toUpperCase();
      const matchesEmp = inv.employeeId === employee.id || (cleanEmail && invEmail === cleanEmail);
      return matchesEmp && (st === "PENDING" || st === "SENT");
    });

    if (hasPendingInvite) {
      return {
        isEligible: false,
        reason: "Une invitation active est déjà en attente pour ce collaborateur.",
        code: "PENDING_INVITATION_EXISTS"
      };
    }

    return {
      isEligible: true,
      code: "ELIGIBLE"
    };
  }

  /**
   * Evaluates if an employee is eligible to be assigned a physical cash till.
   * 
   * Strict Rules:
   * 1. Must belong to the specified tenant/business.
   * 2. Must be ACTIVE (not TERMINATED, ARCHIVED, or SUSPENDED).
   * 3. Role/profile must permit cash operations.
   * 4. 1-to-1 unicity: Cannot already be assigned another active till in the SAME currency!
   * 5. Does NOT depend on having or not having a user account (`!user_id` is NOT checked).
   */
  public static isEligibleForTillAssignment(
    firstArg: Employee | {
      employee: Employee;
      existingTills?: CashTill[];
      currency?: CurrencyCode;
      businessId?: string;
      excludeTillId?: string;
    },
    existingTillsArg: CashTill[] = [],
    requestedCurrencyArg: CurrencyCode = "HTG",
    targetBusinessIdArg?: string,
    currentTillIdToExcludeArg?: string
  ): TillAssignmentEligibilityResult {
    let employee: Employee;
    let existingTills: CashTill[];
    let requestedCurrency: CurrencyCode;
    let targetBusinessId: string | undefined;
    let currentTillIdToExclude: string | undefined;

    if (firstArg && typeof firstArg === "object" && "employee" in firstArg) {
      const opts = firstArg as {
        employee: Employee;
        existingTills?: CashTill[];
        currency?: CurrencyCode;
        businessId?: string;
        excludeTillId?: string;
      };
      employee = opts.employee;
      existingTills = opts.existingTills || [];
      requestedCurrency = opts.currency || "HTG";
      targetBusinessId = opts.businessId;
      currentTillIdToExclude = opts.excludeTillId;
    } else {
      employee = firstArg as Employee;
      existingTills = existingTillsArg;
      requestedCurrency = requestedCurrencyArg;
      targetBusinessId = targetBusinessIdArg;
      currentTillIdToExclude = currentTillIdToExcludeArg;
    }

    // 1. Tenant Scope Check
    if (targetBusinessId) {
      const empBiz =
        employee.business_id ||
        (employee as any).businessId ||
        (employee as any).companyId ||
        (employee as any).company_id;
      if (empBiz && empBiz !== targetBusinessId) {
        return {
          isEligible: false,
          reason: `Violation multi-tenant : L'employé appartient à une autre entreprise (${empBiz}) et n'appartient pas à cette entreprise.`,
          code: "CROSS_TENANT_VIOLATION"
        };
      }
    }

    // 2. Active Employment Status Check
    const status = (employee.status || "").toUpperCase();
    const isSuspended = status === "SUSPENDED" || (employee as any).suspendedAt != null;
    const isInactive = employee.isActive === false || (employee as any).is_active === false;

    if (status === "TERMINATED" || status === "ARCHIVED" || isSuspended || isInactive) {
      return {
        isEligible: false,
        reason: `Statut inéligible : L'employé est inactif (statut : ${status || "inactif"}) et ne peut pas se voir affecter une caisse.`,
        code: "INACTIVE_STATUS"
      };
    }

    // 3. Authorized Role Check
    const roleUpper = (employee.role || (employee as any).position || "EMPLOYEE").toUpperCase();
    if (!this.AUTHORIZED_TELLER_ROLES.has(roleUpper)) {
      return {
        isEligible: false,
        reason: `Rôle non autorisé : Le rôle [${roleUpper}] n'est pas habilité aux opérations de caisse.`,
        code: "UNAUTHORIZED_ROLE"
      };
    }

    // 4. Duplicate Active Assignment Check (Monodevise 1-to-1)
    const alreadyAssignedInCurrency = existingTills.some((t) => {
      if (currentTillIdToExclude && t.id === currentTillIdToExclude) {
        return false;
      }
      const isSameTeller =
        t.assigned_teller_id === employee.id ||
        (t.assigned_teller_name && employee.name && t.assigned_teller_name.trim().toLowerCase() === employee.name.trim().toLowerCase());
      return isSameTeller && t.currency === requestedCurrency;
    });

    if (alreadyAssignedInCurrency) {
      return {
        isEligible: false,
        reason: `Affectation multiple interdite : L'employé est déjà assigné et possède déjà un tiroir-caisse actif en devise ${requestedCurrency}.`,
        code: "DUPLICATE_CURRENCY_ASSIGNMENT"
      };
    }

    return {
      isEligible: true,
      code: "ELIGIBLE"
    };
  }

  /**
   * Filters a list of company employees to those strictly eligible for till assignment.
   * Supports both an options object: { employees, existingTills, currency, businessId, excludeTillId }
   * or positional parameters for flexibility.
   */
  public static filterEligibleTellers(
    employeesOrOptions:
      | Employee[]
      | {
          employees: Employee[];
          existingTills?: CashTill[];
          currency?: CurrencyCode;
          businessId?: string;
          excludeTillId?: string;
        },
    existingTills: CashTill[] = [],
    requestedCurrency: CurrencyCode = "HTG",
    targetBusinessId?: string,
    currentTillIdToExclude?: string
  ): Employee[] {
    if (Array.isArray(employeesOrOptions)) {
      return employeesOrOptions.filter(
        (emp) =>
          this.isEligibleForTillAssignment(
            emp,
            existingTills,
            requestedCurrency,
            targetBusinessId,
            currentTillIdToExclude
          ).isEligible
      );
    }

    const opts = employeesOrOptions || { employees: [] };
    const empList = opts.employees || [];
    const tillsList = opts.existingTills || [];
    const curr = opts.currency || "HTG";
    const bizId = opts.businessId;
    const excludeId = opts.excludeTillId;

    return empList.filter(
      (emp) =>
        this.isEligibleForTillAssignment(
          emp,
          tillsList,
          curr,
          bizId,
          excludeId
        ).isEligible
    );
  }
}
