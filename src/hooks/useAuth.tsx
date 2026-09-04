import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { Role, Employee } from "../types";
import { useIdentity } from "../modules/identity/IdentityContext";
import { isSuperAdminEmail } from "../config/superadmin";
import { IdentitySnapshot } from "../modules/identity/types";
import { EnterpriseIdentityOrchestrator } from "../modules/identity/EnterpriseIdentityOrchestrator";

export type FlowState =
  | "LOADING"
  | "LANDING"
  | "EMPLOYEE_ACTIVE"
  | "OWNER_ACTIVE"
  | "MANAGER_ACTIVE"
  | "SUPERVISOR_ACTIVE"
  | "SUPER_ADMIN_ACTIVE"
  | "INVITED_PENDING"
  | "OWNER_ONBOARDING"
  | "BUSINESS_PENDING"
  | "UNREGISTERED"
  | "INITIAL_IDENTITY"
  | "LOGGED_OUT"
  | "ERROR";

export interface OrchestrationState {
  user: any | null;
  dbUser: any | null | undefined;
  dbEmployee: Employee | null;
  invitation: any | null;
  role: Role | null;
  flowState: FlowState;
  targetRoute: string;
  isResolved: boolean;
  logout: () => Promise<void>;
  businessDoc: any | null;
  authLoading: boolean;
  profileLoading: boolean;
  error: string | null;
  retry: () => Promise<void>;
  identity: IdentitySnapshot | null;
}

const AuthContext = createContext<OrchestrationState | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { identity, loading: identityLoading, stage: identityStage, error: identityError, refresh } = useIdentity();

  const flowState = useMemo<FlowState>(() => {
    // 1. Unauthenticated state
    if (!auth.currentUser && !identityLoading && identityStage === "NOT_STARTED") {
      return "LANDING";
    }

    // 2. Loading state: Identity resolution or authentication still in flight
    if (identityLoading || identityStage === "LOADING" || (auth.currentUser && !identity && !identityError)) {
      return "LOADING";
    }

    // 3. Error state
    if (
      identityError || 
      identity?.orchestratorState === "ERROR" || 
      identity?.terminalError === "NETWORK_OFFLINE" || 
      identity?.terminalError === "TIMEOUT_ERROR" || 
      identityStage === "ERROR"
    ) {
      return "ERROR";
    }

    // 4. Authoritative Resolved Identity
    if (identity && auth.currentUser) {
      const role = identity.role as string;
      const businessId = identity.business?.id || "";
      const onboardingStatus = identity.onboardingStatus;
      const bizStatus = identity.business?.status;
      
      const isSuperUser = role === "SUPER_ADMIN" || isSuperAdminEmail(auth.currentUser.email);

      const bStatus = (bizStatus as string) || "";
      const oStatus = (onboardingStatus as string) || "";

      const isBizActive = bStatus === "ACTIVE" || bStatus === "APPROVED";
      const isBizPending = (
        bStatus === "PENDING" || 
        bStatus === "PENDING_APPROVAL" || 
        bStatus === "WAITING_APPROVAL" || 
        bStatus === "WAITING" || 
        oStatus === "WAITING" ||
        oStatus === "PENDING_APPROVAL"
      ) && !isBizActive;

      // 4a. Pending Business Workspace (Takes priority when business is initiated and pending approval)
      if (isBizPending) {
        return "BUSINESS_PENDING";
      }

      // 4b. Super Admin platform access ALWAYS takes absolute priority when no pending business
      if (isSuperUser && (!businessId || role === "SUPER_ADMIN")) {
        return "SUPER_ADMIN_ACTIVE";
      }

      // 4c. Active Enterprise Member (Owner / Manager / Supervisor / Employee)
      if (businessId && (isBizActive || onboardingStatus === "COMPLETED")) {
        switch (role) {
          case "OWNER":
            return "OWNER_ACTIVE";
          case "MANAGER":
            return "MANAGER_ACTIVE";
          case "SUPERVISOR":
            return "SUPERVISOR_ACTIVE";
          case "EMPLOYEE":
            return "EMPLOYEE_ACTIVE";
          default:
            return "EMPLOYEE_ACTIVE";
        }
      }

      // 4d. Pending Invitations (or active invitation detected)
      if ((identity.invitation && (identity.invitation.status === "SENT" || identity.invitation.status === "PENDING")) || onboardingStatus === "JOINING") {
        return "INVITED_PENDING";
      }

      // 4e. Owner without business workspace
      if ((role === "OWNER" || identity.requested_role === "OWNER") && !businessId) {
        return "OWNER_ONBOARDING";
      }

      // 4f. Employee without business workspace who explicitly requested EMPLOYEE
      if ((role === "EMPLOYEE" || identity.requested_role === "EMPLOYEE") && !businessId && !identity.invitation) {
        return "BUSINESS_PENDING";
      }

      // 4g. New User / Unregistered User
      if (!businessId && !identity.employee && !identity.invitation) {
        return "UNREGISTERED";
      }

      // 4h. Fallback for pending onboarding wizard
      if (onboardingStatus === "PENDING_ONBOARDING") {
        return "OWNER_ONBOARDING";
      }

      return "INITIAL_IDENTITY";
    }

    return "LANDING";
  }, [auth.currentUser, identity, identityLoading, identityStage, identityError]);

  useEffect(() => {
    console.log(`[FlowState] Computed flowState: ${flowState} (UID: ${auth.currentUser?.uid || "anonymous"}, role: ${identity?.role}, bizStatus: ${identity?.business?.status}, onboarding: ${identity?.onboardingStatus})`);
  }, [flowState, auth.currentUser?.uid, identity?.role, identity?.business?.status, identity?.onboardingStatus]);

  const logout = async () => {
    console.log("[Auth] User initiated logout");
    EnterpriseIdentityOrchestrator.clearSessionCache();
    await signOut(auth);
  };

  const targetRoute = useMemo(() => {
    switch (flowState) {
      case "SUPER_ADMIN_ACTIVE":
        return "/platform";
      case "OWNER_ACTIVE":
        return "/dashboard";
      case "MANAGER_ACTIVE":
        return "/manager";
      case "SUPERVISOR_ACTIVE":
        return "/supervisor";
      case "EMPLOYEE_ACTIVE":
        return "/workspace";
      case "INVITED_PENDING":
        return "/accept-invitation";
      case "BUSINESS_PENDING":
        return "/waiting-room";
      case "OWNER_ONBOARDING":
        return "/onboarding";
      case "UNREGISTERED":
        return "/onboarding-choice";
      default:
        return "/resolve";
    }
  }, [flowState]);

  const isResolved = flowState !== "LOADING" && identityStage !== "LOADING" && !identityLoading;

  const value = useMemo(() => ({
    user: auth.currentUser,
    dbUser: identity ? {
      ...identity,
      id: identity.user_uid,
      account_status: identity.identityStatus,
      onboarding_completed: identity.onboardingStatus === "COMPLETED"
    } : null,
    dbEmployee: identity?.employee || null,
    invitation: identity?.invitation || null,
    role: (identity?.role as Role) || null,
    flowState,
    targetRoute,
    isResolved,
    logout,
    businessDoc: identity?.business || null,
    authLoading: identityLoading,
    profileLoading: identityLoading,
    error: identityError || (identity?.orchestratorState === "ERROR" ? (identity?.terminalError || "PROFILE_RESOLUTION_ERROR") : null),
    retry: refresh,
    identity
  }), [identity, identityLoading, identityStage, identityError, flowState, targetRoute, isResolved, refresh]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
};
