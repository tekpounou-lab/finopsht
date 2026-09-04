import React, { useState, useEffect, useCallback } from "react";
import { useIdentity } from "../../modules/identity/IdentityContext";
import { useAuth } from "../../hooks/useAuth";
import { OnboardingChoice } from "./OnboardingChoice";
import { BusinessCreationWizard } from "./BusinessCreationWizard";
import { InvitationAcceptance } from "./InvitationAcceptance";
import { WaitingRoom } from "./WaitingRoom";
import { OnboardingControlBar } from "./OnboardingControlBar";
import { OfflineRecoveryCard } from "./OfflineRecoveryCard";
import { OnboardingDraftManager } from "./OnboardingDraftManager";
import { finopsEventOrchestrator } from "../../services/finopsEventOrchestrator";
import { Loader2 } from "lucide-react";

export type OnboardingActiveState = 
  | "RESOLVING" 
  | "SELECT_PATH" 
  | "CREATE" 
  | "JOIN" 
  | "WAITING_APPROVAL" 
  | "INVITATION" 
  | "OFFLINE";

export const OnboardingOrchestrator: React.FC = () => {
  const { identity, loading, setRequestedRole, refresh } = useIdentity();
  const { user } = useAuth();
  
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [wizardStep, setWizardStep] = useState(1);

  // 1. Network status listener
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      refresh();
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refresh]);

  // Determine current active state
  const computeActiveState = (): OnboardingActiveState => {
    if (isOffline || identity?.orchestratorState === "ERROR" || identity?.terminalError === "NETWORK_OFFLINE") {
      return "OFFLINE";
    }
    if (loading && !identity) return "RESOLVING";
    if (identity?.identityStatus === "INVITED" || identity?.invitation) return "INVITATION";
    
    const bizStatus = (identity?.business?.status as string) || "";
    const isBizPending = bizStatus === "PENDING" || bizStatus === "PENDING_APPROVAL" || bizStatus === "WAITING_APPROVAL" || bizStatus === "WAITING" || (identity?.onboardingStatus as string) === "WAITING";
    const isBizActive = bizStatus === "ACTIVE" || bizStatus === "APPROVED";

    if (identity?.business?.id && (isBizPending || (identity?.onboardingStatus !== "COMPLETED" && !isBizActive))) {
      return "WAITING_APPROVAL";
    }

    if (identity?.business?.id && (isBizActive || (!identity?.business?.status && identity?.onboardingStatus === "COMPLETED"))) {
      return "RESOLVING";
    }

    const requestedRole = identity?.requested_role;
    if (requestedRole === "OWNER" && !identity?.business?.id) {
      return "CREATE";
    }
    if ((requestedRole === "EMPLOYEE" || requestedRole === "SUPERVISOR") && !identity?.business?.id) {
      return "JOIN";
    }

    // Fallback if role is explicitly assigned
    if (identity?.role === "OWNER" && !identity?.business?.id) {
      return "CREATE";
    }

    return "SELECT_PATH";
  };

  const currentState = computeActiveState();

  // Audit state transitions via Enterprise EventBus only after business is provisioned
  useEffect(() => {
    if (user?.uid && currentState !== "RESOLVING") {
      const businessId = identity?.business?.id;
      // Emit persistent tenant event ONLY if business is established
      if (businessId && businessId !== "global") {
        const correlationId = `nav_${user.uid}_${currentState}_${wizardStep}`;
        finopsEventOrchestrator.emit("ONBOARDING_STATE_TRANSITION", businessId, {
          correlationId,
          business_id: businessId,
          businessId: businessId,
          userId: user.uid,
          email: user.email,
          currentState,
          wizardStep,
          timestamp: new Date().toISOString()
        }).catch(err => console.warn("[OnboardingOrchestrator] Audit emit deferred:", err));
      }

      // Save draft state snapshot locally
      OnboardingDraftManager.saveDraft(user.uid, {
        activeState: currentState === "CREATE" ? "CREATE" : currentState === "JOIN" ? "JOIN" : "SELECT_PATH",
        wizardStep
      });
    }
  }, [currentState, user?.uid, user?.email, identity?.business?.id, wizardStep]);

  // Handlers for bidirectional state control
  const handleBack = useCallback(async () => {
    if (!user?.uid) return;
    
    if (currentState === "CREATE" && wizardStep > 1) {
      setWizardStep(prev => prev - 1);
      return;
    }

    // Revert role selection back to SELECT_PATH
    await setRequestedRole("UNASSIGNED");
    setWizardStep(1);
    if (user?.uid) {
      OnboardingDraftManager.saveDraft(user.uid, {
        activeState: "SELECT_PATH",
        wizardStep: 1
      });
    }
  }, [currentState, wizardStep, user?.uid, setRequestedRole]);

  const handleSwitchPath = useCallback(async () => {
    if (!user?.uid) return;
    const targetRole = currentState === "CREATE" ? "EMPLOYEE" : "OWNER";
    await setRequestedRole(targetRole);
    setWizardStep(1);
    if (user?.uid) {
      OnboardingDraftManager.saveDraft(user.uid, {
        activeState: targetRole === "OWNER" ? "CREATE" : "JOIN",
        wizardStep: 1
      });
    }
  }, [currentState, user?.uid, setRequestedRole]);

  const handleReset = useCallback(async () => {
    if (!user?.uid) return;
    OnboardingDraftManager.clearDraft(user.uid);
    await setRequestedRole("UNASSIGNED");
    setWizardStep(1);
  }, [user?.uid, setRequestedRole]);

  const handleRetry = useCallback(() => {
    setIsOffline(!navigator.onLine);
    refresh();
  }, [refresh]);

  const canGoBack = currentState === "CREATE" || currentState === "JOIN" || currentState === "WAITING_APPROVAL";

  // Render View Body
  const renderBody = () => {
    if (isOffline || currentState === "OFFLINE") {
      const draft = user?.uid ? OnboardingDraftManager.getDraft(user.uid) : null;
      return <OfflineRecoveryCard onRetry={handleRetry} lastSavedAt={draft?.lastSavedAt} />;
    }

    if (loading || currentState === "RESOLVING") {
      return (
        <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
          <div className="relative w-16 h-16 mb-6 flex items-center justify-center bg-slate-900 rounded-2xl border border-slate-800 shadow-xl">
            <Loader2 className="animate-spin text-cyan-400" size={32} />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-cyan-400 mb-2 font-semibold">
            FINOPS Identity Resolution
          </span>
          <p className="text-sm font-medium text-slate-400">
            Initialisation sécurisée de votre identité d'entreprise...
          </p>
        </div>
      );
    }

    if (currentState === "INVITATION") {
      return <InvitationAcceptance />;
    }

    if (currentState === "WAITING_APPROVAL") {
      const isOwner = identity?.role === "OWNER" || identity?.requested_role === "OWNER" || identity?.business?.owner_id === user?.uid;
      const getWaitingStatus = (): any => {
        const st = (identity?.business?.status as string) || "";
        if (isOwner && (st === "PENDING" || st === "PENDING_APPROVAL" || st === "WAITING_APPROVAL" || st === "WAITING")) return "WAITING_SUPERADMIN_APPROVAL";
        const state = identity?.orchestratorState;
        if (state === "SNAPSHOT_RESOLVED" || state === "READY") return "BUILDING_CONTEXT";
        if (state === "BUSINESS_RESOLVED") return "PROVISIONING_WORKSPACE";
        if (state === "ERROR") return "ERROR";
        return "SYNCING_IDENTITY";
      };

      return (
        <WaitingRoom 
          email={identity?.email} 
          status={getWaitingStatus()}
          isOwner={isOwner}
          businessName={identity?.business?.name}
          businessId={identity?.business?.id}
          onBack={handleBack} 
        />
      );
    }

    if (currentState === "CREATE") {
      return (
        <BusinessCreationWizard 
          onBackToChoice={handleBack}
          onStepChanged={(s) => setWizardStep(s)}
        />
      );
    }

    if (currentState === "JOIN") {
      return (
        <WaitingRoom 
          email={identity?.email} 
          status="WAITING_FOR_INVITATION"
          isOwner={false}
          onBack={handleBack} 
        />
      );
    }

    // Default: SELECT_PATH Choice Screen
    return (
      <OnboardingChoice 
        onSelect={async (choice) => {
          if (choice === "CREATE") {
            await setRequestedRole("OWNER");
          } else {
            await setRequestedRole("EMPLOYEE");
          }
        }} 
      />
    );
  };

  const currentDraft = user?.uid ? OnboardingDraftManager.getDraft(user.uid) : null;
  const hasUnsavedData = Boolean(
    (currentDraft?.businessFormData?.businessName && currentDraft.businessFormData.businessName.trim() !== "") ||
    (currentDraft?.businessFormData?.personalName && currentDraft.businessFormData.personalName.trim() !== "") ||
    (currentDraft?.businessFormData?.nif && currentDraft.businessFormData.nif.trim() !== "") ||
    (wizardStep > 1) ||
    (currentDraft?.joinCode && currentDraft.joinCode.trim() !== "")
  );

  const draftSummary = {
    businessName: currentDraft?.businessFormData?.businessName,
    personalName: currentDraft?.businessFormData?.personalName,
    wizardStep: wizardStep,
    joinCode: currentDraft?.joinCode
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30">
      <OnboardingControlBar
        activeState={currentState}
        canGoBack={canGoBack}
        onBack={handleBack}
        onSwitchPath={currentState === "CREATE" || currentState === "JOIN" ? handleSwitchPath : undefined}
        onReset={handleReset}
        onRetry={handleRetry}
        isOffline={isOffline}
        hasUnsavedData={hasUnsavedData}
        draftSummary={draftSummary}
      />
      <main className="flex-1">
        {renderBody()}
      </main>
    </div>
  );
};
