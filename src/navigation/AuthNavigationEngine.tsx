import React, { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useTargetRoute } from "./useTargetRoute";

const GATEWAY_ROUTES = ["/", "/landing", "/login", "/join-company", "/resolve"];

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/workspace",
  "/manager",
  "/supervisor",
  "/platform",
  "/super-admin",
  "/waiting-room",
  "/waiting-approval",
  "/approval-pending",
  "/accept-invitation",
  "/invitation-pending",
  "/onboarding",
  "/onboarding-choice",
  "/create-business",
  "/operations",
  "/admin",
  "/dev"
];

/**
 * AuthNavigationEngine
 * Centralized, reactive navigation orchestrator.
 * Single source of truth for routing decisions after authentication & identity resolution.
 */
export const AuthNavigationEngine: React.FC = () => {
  const { flowState, user, role, isResolved } = useAuth();
  const { targetPath, reason } = useTargetRoute();
  const navigate = useNavigate();
  const location = useLocation();

  const lastAuthUidRef = useRef<string | null>(null);
  const lastRedirectKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const currentUid = user?.uid || null;

    // Reset redirect tracking whenever authenticated UID changes (sign-in, switch account, sign-out)
    if (currentUid !== lastAuthUidRef.current) {
      lastAuthUidRef.current = currentUid;
      lastRedirectKeyRef.current = null;
    }

    // 1. Authoritative gate: Wait until identity resolution is completely resolved
    if (!isResolved) {
      return;
    }

    const currentPath = location.pathname;

    // Route-state idempotency: if already on the target path, no redirect needed
    if (currentPath === targetPath) {
      return;
    }

    // 2. Unauthenticated State Management
    if (!user || flowState === "LANDING" || flowState === "LOGGED_OUT") {
      const isTryingToAccessProtected = PROTECTED_PREFIXES.some(prefix => 
        currentPath === prefix || currentPath.startsWith(prefix + "/")
      );

      if (isTryingToAccessProtected && currentPath !== "/login") {
        const redirectKey = `${currentPath}->/login_UNAUTHENTICATED`;
        if (lastRedirectKeyRef.current === redirectKey) return;
        lastRedirectKeyRef.current = redirectKey;

        console.log(`[Navigation] Redirecting unauthenticated user from ${currentPath} to /login (reason: Session expired or unauthenticated)`);
        navigate("/login", { replace: true });
      }
      return;
    }

    // 3. Authenticated State Management
    if (!targetPath) return;

    const isGateRoute = GATEWAY_ROUTES.includes(currentPath);

    const isEnterpriseActive = [
      "SUPER_ADMIN_ACTIVE",
      "OWNER_ACTIVE",
      "MANAGER_ACTIVE",
      "SUPERVISOR_ACTIVE",
      "EMPLOYEE_ACTIVE"
    ].includes(flowState);

    const isStaleIntermediateRoute = 
      isEnterpriseActive &&
      (currentPath === "/waiting-room" || 
       currentPath === "/waiting-approval" || 
       currentPath === "/onboarding" || 
       currentPath === "/create-business" || 
       currentPath === "/onboarding-choice" || 
       currentPath === "/resolve");

    // Critical: When business workspace is pending approval, user must be routed to /waiting-room
    const isPendingNeedsWaitingRoom =
      flowState === "BUSINESS_PENDING" &&
      currentPath !== "/waiting-room" &&
      currentPath !== "/waiting-approval";

    // Critical: When user is unregistered, they should not remain on protected or wizard routes
    const isUnregisteredNeedsChoice =
      flowState === "UNREGISTERED" &&
      (currentPath === "/onboarding" || 
       currentPath === "/create-business" || 
       currentPath === "/waiting-room" || 
       currentPath === "/dashboard");

    // Critical: When user has pending invitation
    const isInvitedNeedsAcceptance =
      flowState === "INVITED_PENDING" &&
      currentPath !== "/accept-invitation" &&
      currentPath !== "/invitation-pending";

    const shouldRedirect = 
      isGateRoute || 
      isStaleIntermediateRoute || 
      isPendingNeedsWaitingRoom || 
      isUnregisteredNeedsChoice || 
      isInvitedNeedsAcceptance;

    if (shouldRedirect) {
      const redirectKey = `${currentPath}->${targetPath}_${flowState}`;
      if (lastRedirectKeyRef.current === redirectKey) {
        return; // Prevent duplicate transition for identical state
      }

      lastRedirectKeyRef.current = redirectKey;
      console.debug(`[AuthNavigationEngine] Executing redirect to ${targetPath} (flowState: ${flowState}, source: ${currentPath}, role: ${role || "N/A"}, reason: ${reason})`);
      navigate(targetPath, { replace: true });
    }
  }, [flowState, user, isResolved, location.pathname, targetPath, reason, role, navigate]);

  return null;
};
