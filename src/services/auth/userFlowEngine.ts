import { Business, Invitation, Employee, Role } from "../../types";

export type FlowDestination =
  | "ONBOARDING_CREATE_BUSINESS"
  | "ONBOARDING_RESUME"
  | "EMPLOYEE_SPACE"
  | "MANAGER_DASHBOARD"
  | "SUPERVISOR_DASHBOARD"
  | "OWNER_DASHBOARD"
  | "ACCEPT_INVITATION";

export interface UserFlowState {
  hasBusinesses: boolean;
  hasActiveMembership: boolean;
  isOnboardingComplete: boolean;
  pendingInvitations: Invitation[];
  recommendedDestination: FlowDestination;
  reason: string;
}

/**
 * Enterprise User Identity Engine
 * Dynamically determines the next step in the user journey based on the multi-tenant sandbox state.
 */
export function determineUserNextStep(
  userEmail: string,
  userRole: Role,
  businesses: Business[],
  employees: Employee[],
  invitations: Invitation[],
  userId?: string,
  employeeId?: string
): UserFlowState {
  const emailLower = userEmail ? userEmail.toLowerCase().trim() : "";

  // 1. Check for pending invitations
  const pendingInvites = invitations.filter(
    (inv) => 
      inv.status === "PENDING" && (
        (inv.email && inv.email.toLowerCase().trim() === emailLower) ||
        (employeeId && inv.employeeId === employeeId) ||
        (userId && (inv as any).firebase_uid === userId)
      )
  );

  // 2. Check memberships (employees matching this email OR firebase_uid OR employeeId)
  const userMemberships = employees.filter(
    (emp) =>
      (emp.email && emp.email.toLowerCase().trim() === emailLower) ||
      (emp.normalizedEmail && emp.normalizedEmail === emailLower) ||
      (userId && (emp.firebase_uid === userId || emp.uid === userId)) ||
      (employeeId && emp.id === employeeId)
  );

  const hasActiveMembership = userMemberships.length > 0;
  const isOwner = userRole === "OWNER" || userMemberships.some((m) => m.role === "OWNER");

  // Determine if owner has configured businesses
  const ownBusinesses = businesses.length;
  const hasBusinesses = ownBusinesses > 0;

  // Let's determine onboarding completion for this user/membership
  let isOnboardingComplete = true;
  if (hasActiveMembership) {
    // If any active staff member is not onboardingComplete
    const incompleteMember = userMemberships.find((m) => m.onboardingComplete === false);
    if (incompleteMember) {
      isOnboardingComplete = false;
    }
  } else if (isOwner && !hasBusinesses) {
    isOnboardingComplete = false;
  }

  // LOGIC MATRIX
  if (pendingInvites.length > 0) {
    return {
      hasBusinesses,
      hasActiveMembership,
      isOnboardingComplete,
      pendingInvitations: pendingInvites,
      recommendedDestination: "ACCEPT_INVITATION",
      reason: "L'utilisateur dispose de contrats d'invitations en attente sur l'ERP.",
    };
  }

  if (isOwner && !hasBusinesses) {
    return {
      hasBusinesses: false,
      hasActiveMembership: false,
      isOnboardingComplete: false,
      pendingInvitations: [],
      recommendedDestination: "ONBOARDING_CREATE_BUSINESS",
      reason: "Compte créateur détecté sans structure d'entreprise associée. Redirection vers le wizard de création.",
    };
  }

  if (hasActiveMembership && !isOnboardingComplete) {
    return {
      hasBusinesses,
      hasActiveMembership,
      isOnboardingComplete: false,
      pendingInvitations: [],
      recommendedDestination: "ONBOARDING_RESUME",
      reason: "Profil d'onboarding partiel ou contrat non complété.",
    };
  }

  // Standard Routing according to active Workspace Role
  let recommendedDestination: FlowDestination = "EMPLOYEE_SPACE";
  if (userRole === "OWNER") {
    recommendedDestination = "OWNER_DASHBOARD";
  } else if (userRole === "MANAGER") {
    recommendedDestination = "MANAGER_DASHBOARD";
  } else if (userRole === "SUPERVISOR") {
    recommendedDestination = "SUPERVISOR_DASHBOARD";
  } else {
    recommendedDestination = "EMPLOYEE_SPACE";
  }

  return {
    hasBusinesses,
    hasActiveMembership,
    isOnboardingComplete,
    pendingInvitations: [],
    recommendedDestination,
    reason: `Rôle membre ${userRole} vérifié et actif. Redirection vers son espace dédié.`,
  };
}
