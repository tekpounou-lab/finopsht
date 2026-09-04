import { useMemo } from "react";
import { useAuth, FlowState } from "../hooks/useAuth";
import { IdentitySnapshot } from "../modules/identity/types";
import { Role } from "../types";
import { NavigationTargetResult } from "./types";
import { isSuperAdminEmail } from "../config/superadmin";

/**
 * Pure calculation function to determine the target route and context
 * strictly driven by the authoritative FlowState.
 *
 * Invariant:
 * Final identity resolution ➔ FlowState ➔ Target Route.
 */
export function resolveTargetRoute(params: {
  flowState: FlowState;
  identity: IdentitySnapshot | null;
  role: Role | null;
  user: any | null;
}): NavigationTargetResult {
  const { flowState, identity, role, user } = params;

  // 1. Unauthenticated or terminal logout states
  if (!user || flowState === "LANDING" || flowState === "LOGGED_OUT") {
    return {
      targetPath: "/login",
      reason: "Unauthenticated session",
      isProtected: false
    };
  }

  // 2. Loading state: Identity resolution in flight
  if (flowState === "LOADING") {
    return {
      targetPath: "/resolve",
      reason: "Identity resolution in flight",
      isProtected: true
    };
  }

  // 3. Terminal error state
  if (flowState === "ERROR") {
    return {
      targetPath: "/resolve",
      reason: "Identity resolution encountered terminal error",
      isProtected: true
    };
  }

  // 3.5 Direct Super Admin recognition (Platform Supervisor) only if not in pending business creation or onboarding choice
  if (
    flowState !== "BUSINESS_PENDING" && 
    flowState !== "UNREGISTERED" && 
    flowState !== "OWNER_ONBOARDING" && 
    (isSuperAdminEmail(user?.email) || (role as string) === "SUPER_ADMIN" || (identity?.role as string) === "SUPER_ADMIN")
  ) {
    return {
      targetPath: "/platform",
      reason: "Super Admin platform supervisor authorized",
      isProtected: true,
      requiredRole: "SUPER_ADMIN"
    };
  }

  // 4. Authoritative FlowState mapping
  switch (flowState) {
    case "SUPER_ADMIN_ACTIVE":
      if (role && (role as string) !== "SUPER_ADMIN") {
        console.warn(`[NavigationInvariant] Contradiction: flowState is SUPER_ADMIN_ACTIVE but role is ${role}`);
      }
      return {
        targetPath: "/platform",
        reason: "Super Admin Platform access confirmed",
        isProtected: true,
        requiredRole: "SUPER_ADMIN"
      };

    case "OWNER_ACTIVE":
      if (role && role !== "OWNER") {
        console.warn(`[NavigationInvariant] Contradiction: flowState is OWNER_ACTIVE but role is ${role}`);
      }
      return {
        targetPath: "/dashboard",
        reason: "Active Business Owner workspace",
        isProtected: true,
        requiredRole: "OWNER"
      };

    case "MANAGER_ACTIVE":
      if (role && role !== "MANAGER") {
        console.warn(`[NavigationInvariant] Contradiction: flowState is MANAGER_ACTIVE but role is ${role}`);
      }
      return {
        targetPath: "/manager",
        reason: "Active Manager portal",
        isProtected: true,
        requiredRole: "MANAGER"
      };

    case "SUPERVISOR_ACTIVE":
      if (role && role !== "SUPERVISOR") {
        console.warn(`[NavigationInvariant] Contradiction: flowState is SUPERVISOR_ACTIVE but role is ${role}`);
      }
      return {
        targetPath: "/supervisor",
        reason: "Active Supervisor portal",
        isProtected: true,
        requiredRole: "SUPERVISOR"
      };

    case "EMPLOYEE_ACTIVE":
      if (role && role !== "EMPLOYEE") {
        console.warn(`[NavigationInvariant] Contradiction: flowState is EMPLOYEE_ACTIVE but role is ${role}`);
      }
      return {
        targetPath: "/workspace",
        reason: "Active Employee self-service workspace",
        isProtected: true,
        requiredRole: "EMPLOYEE"
      };

    case "INVITED_PENDING":
      return {
        targetPath: "/accept-invitation",
        reason: "Pending enterprise invitation awaiting acceptance",
        isProtected: true
      };

    case "BUSINESS_PENDING":
      console.debug("[resolveTargetRoute] Authoritative mapping BUSINESS_PENDING -> /waiting-room");
      return {
        targetPath: "/waiting-room",
        reason: "Created business workspace is pending approval or awaiting invitation",
        isProtected: true
      };

    case "OWNER_ONBOARDING":
      return {
        targetPath: "/onboarding",
        reason: "Owner business creation wizard required",
        isProtected: true
      };

    case "UNREGISTERED":
      return {
        targetPath: "/onboarding-choice",
        reason: "New user identity requires workspace selection",
        isProtected: true
      };

    case "INITIAL_IDENTITY":
    default:
      if (identity?.requested_role === "EMPLOYEE" && !identity?.business?.id) {
        return {
          targetPath: "/waiting-room",
          reason: "Employee registered awaiting enterprise invitation",
          isProtected: true
        };
      }
      return {
        targetPath: "/resolve",
        reason: "Initial identity verification route",
        isProtected: true
      };
  }
}

/**
 * Hook to retrieve the current calculated target route reactively.
 */
export function useTargetRoute(): NavigationTargetResult {
  const { flowState, identity, role, user } = useAuth();

  return useMemo(() => {
    return resolveTargetRoute({ flowState, identity, role, user });
  }, [flowState, identity, role, user]);
}
