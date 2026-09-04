export type ResolvedRouteType =
  | "/"
  | "/onboarding-choice"
  | "/accept-invitation"
  | "/waiting-approval"
  | "/approval-pending"
  | "/workspace"
  | "/dashboard"
  | "/manager"
  | "/supervisor"
  | "/create-business"
  | "/onboarding"
  | "/force-logout"
  | "/account-recovery"
  | "/super-admin";

export interface FlowStatePayload {
  isAuthenticated: boolean;
  hasProfile: boolean;
  role: "OWNER" | "MANAGER" | "SUPERVISOR" | "EMPLOYEE" | "UNASSIGNED" | "SUPER_ADMIN" | null;
  business_id: string | null;
  onboarding_completed: boolean;
  account_status: "NEW_USER" | "PENDING_INVITATION" | "WAITING_APPROVAL" | "ACTIVE" | "SUSPENDED" | null;
  invitation_status: "NONE" | "PENDING" | "ACCEPTED" | null;
  hasPendingInvitation: boolean;
  business_status?: "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED" | "REJECTED" | null;
  requested_role?: string | null;
}

export function resolveAuthRoute(payload: FlowStatePayload): ResolvedRouteType {
  const {
    isAuthenticated,
    hasProfile,
    role,
    business_id,
    onboarding_completed,
    account_status,
    invitation_status,
    hasPendingInvitation,
    business_status,
    requested_role,
  } = payload;

  const bId = business_id && business_id !== "" ? business_id : null;

  const normRole = (role || "").toUpperCase();
  const normAccountStatus = (account_status || "").toUpperCase();
  const normInvitationStatus = (invitation_status || "").toUpperCase();
  const normRequestedRole = (requested_role || "").toUpperCase();
  const normBusinessStatus = (business_status || "").toUpperCase();

  console.log("[AuthFlowResolver DIAGNOSTICS]", {
    resolvedRole: role,
    normRole,
    resolvedRequestedRole: requested_role,
    resolvedOnboardingCompleted: onboarding_completed,
    resolvedBusinessId: bId,
    resolvedAccountStatus: account_status,
    resolvedBusinessStatus: business_status,
    hasPendingInvitation,
  });

  // 1. Auth existence
  if (!isAuthenticated) {
    console.log("[AuthFlowResolver] ➔ REDIRECTING to landing (Not Authenticated)");
    return "/";
  }

  // Early Super Admin check to prevent tenant lockouts
  if (normRole === "SUPER_ADMIN") {
    console.log("[AuthFlowResolver] ➔ SUCCESSFUL SUPER ADMIN ROUTING: Redirecting to /super-admin");
    return "/super-admin";
  }

  // 2. Profile existence and suspended check
  if (!hasProfile) {
    console.log("[AuthFlowResolver] ➔ REDIRECTING to onboarding choice (No Profile Exist)");
    return "/onboarding-choice";
  }

  if (normAccountStatus === "SUSPENDED") {
    console.log("[AuthFlowResolver] ➔ REDIRECTING to force logout (Suspended Status)");
    return "/force-logout";
  }

  // 3. Pending invitation checks takes highest active precedence
  if (hasPendingInvitation || normAccountStatus === "PENDING_INVITATION" || normInvitationStatus === "PENDING") {
    console.log("[AuthFlowResolver] ➔ REDIRECTING to accept-invitation (Pending Invitation)");
    return "/accept-invitation";
  }

  // ONBOARDING CHOICE VS SETUP STATE
  // If the user has no business yet and hasn't fully completed onboarding
  if (!bId && !onboarding_completed) {
    // Check if the user has explicitly selected to create a business
    if (normRequestedRole === "OWNER" || normRole === "OWNER") {
      console.log("[AuthFlowResolver] ➔ REDIRECTING to create-business (Owner requested, no business yet)");
      return "/create-business";
    }

    if (
      normRequestedRole === "EMPLOYEE" ||
      normRole === "EMPLOYEE" ||
      normRequestedRole === "SUPERVISOR" ||
      normRole === "SUPERVISOR" ||
      normAccountStatus === "WAITING_APPROVAL"
    ) {
      console.log("[AuthFlowResolver] ➔ REDIRECTING to waiting-approval (Employee/Supervisor requested, no business yet)");
      return "/waiting-approval";
    }

    // New/unresolved user who has NOT explicitly chosen a role yet (both role=OWNER default or UNASSIGNED)
    console.log("[AuthFlowResolver] ➔ REDIRECTING to onboarding choice (Unresolved onboarding state)");
    return "/onboarding-choice";
  }

  // 4. Validated Multi-tenant Business and Active Role routing
  if (bId) {
    if (normBusinessStatus === "SUSPENDED") {
      console.log("[AuthFlowResolver] ➔ REDIRECTING to force logout (Business status is SUSPENDED)");
      return "/force-logout";
    }

    // Owner but business is pending or rejected
    if (normRole === "OWNER" && (normBusinessStatus === "PENDING_APPROVAL" || normBusinessStatus === "REJECTED")) {
      console.log("[AuthFlowResolver] ➔ REDIRECTING to approval-pending (Business status: " + business_status + ")");
      return "/approval-pending";
    }

    if (normRole === "OWNER") {
      console.log("[AuthFlowResolver] ➔ SUCCESSFUL ESCAPE ROUTING: Owner linked with valid business_id redirecting to /dashboard");
      return "/dashboard";
    }
    if (normRole === "MANAGER") {
      console.log("[AuthFlowResolver] ➔ SUCCESSFUL ESCAPE ROUTING: Manager linked with valid business_id redirecting to /manager");
      return "/manager";
    }
    if (normRole === "SUPERVISOR") {
      if (normAccountStatus === "ACTIVE" || normInvitationStatus === "ACCEPTED") {
        console.log("[AuthFlowResolver] ➔ SUCCESSFUL ESCAPE ROUTING: Supervisor linked with active status redirecting to /supervisor");
        return "/supervisor";
      } else {
        console.log("[AuthFlowResolver] Supervisor has business_id but status is " + account_status + ", redirecting to waiting-approval");
        return "/waiting-approval";
      }
    }
    if (normRole === "EMPLOYEE") {
      if (normAccountStatus === "ACTIVE" || normInvitationStatus === "ACCEPTED") {
        console.log("[AuthFlowResolver] ➔ SUCCESSFUL ESCAPE ROUTING: Employee linked with active status redirecting to /workspace");
        return "/workspace";
      } else {
        console.log("[AuthFlowResolver] Employee has business_id but status is " + account_status + ", redirecting to waiting-approval");
        return "/waiting-approval";
      }
    }
  }

  // 5. Approval State checks for users without business_id
  if (normAccountStatus === "WAITING_APPROVAL") {
    console.log("[AuthFlowResolver] ➔ REDIRECTING to waiting approval (Pending Approval Status)");
    return "/waiting-approval";
  }

  if ((normRole === "EMPLOYEE" || normRole === "SUPERVISOR") && !bId) {
    console.log("[AuthFlowResolver] ➔ REDIRECTING to waiting approval (Employee/Supervisor without Business)");
    return "/waiting-approval";
  }

  // 6. Onboarding Fallback & Choices
  if (normRole === "OWNER" && !bId) {
    console.log("[AuthFlowResolver] ➔ REDIRECTING to create-business (Owner without Business)");
    return "/create-business";
  }

  if (!role || normRole === "UNASSIGNED" || normAccountStatus === "NEW_USER") {
    console.log("[AuthFlowResolver] ➔ REDIRECTING to onboarding choice (No Role or NEW_USER status)");
    return "/onboarding-choice";
  }

  console.warn("[AuthFlowResolver] Unknown / orphaned user state fallback to onboarding-choice");
  return "/onboarding-choice";
}
