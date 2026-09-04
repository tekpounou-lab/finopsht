import React from "react";
import { OnboardingOrchestrator } from "../components/onboarding/OnboardingOrchestrator";
import { OnboardingGuard } from "../components/onboarding/OnboardingGuard";
import { useAuth } from "../hooks/useAuth";

/**
 * ResolveRoute
 * Guards entry into onboarding or redirects active enterprise users to their dashboard.
 * Global navigation is handled authoritatively by AuthNavigationEngine.
 */
export const ResolveRoute: React.FC = () => {
  const { flowState, isResolved, identity, businessDoc } = useAuth();

  // Active enterprise flow states or users whose company is already registered
  // should display a clean transition state rather than flashing onboarding
  const isEnterpriseActive = [
    "SUPER_ADMIN_ACTIVE",
    "OWNER_ACTIVE",
    "MANAGER_ACTIVE",
    "SUPERVISOR_ACTIVE",
    "EMPLOYEE_ACTIVE",
    "BUSINESS_PENDING",
    "INVITED_PENDING"
  ].includes(flowState);

  const isCompanyRegistered = Boolean(
    identity?.business?.id ||
    identity?.onboardingStatus === "COMPLETED" ||
    businessDoc?.id ||
    identity?.employee?.id
  );

  const showLoadingRedirect = !isResolved || isEnterpriseActive || isCompanyRegistered;

  return (
    <OnboardingGuard>
      {showLoadingRedirect ? (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 font-sans text-center">
          <div className="relative w-16 h-16 mb-4 flex items-center justify-center bg-slate-900 rounded-2xl border border-slate-800 shadow-xl">
            <div className="w-6 h-6 border-2 border-transparent border-t-cyan-500 rounded-full animate-spin" />
          </div>
          <span className="font-mono text-xs uppercase tracking-widest text-cyan-400 font-bold mb-1">
            Redirection FINOPS ERP
          </span>
          <p className="text-xs text-slate-400">
            Chargement de votre espace de travail...
          </p>
        </div>
      ) : (
        <OnboardingOrchestrator />
      )}
    </OnboardingGuard>
  );
};

// Re-export standard guards from the centralized navigation module
export { ProtectedRoute, SuperAdminRoute, BusinessRoute } from "../navigation/RouteGuards";
