
import React, { useEffect } from "react";
import { useIdentity } from "../modules/identity/IdentityContext";
import { useAuth } from "../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { WaitingRoom as EnterpriseWaitingRoom, WaitingRoomStatus } from "../components/onboarding/WaitingRoom";

export default function WaitingRoom() {
  const { identity, loading: identityLoading, setRequestedRole } = useIdentity();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const businessStatus = identity?.business?.status;
  const isOwner = 
    identity?.role === "OWNER" || 
    identity?.employee?.role === "OWNER" || 
    identity?.requested_role === "OWNER" || 
    identity?.business?.owner_id === user?.uid ||
    Boolean(identity?.pendingBusiness) ||
    (identity as any)?.userProfile?.accountStatus === "PENDING_OWNER";

  // Auto-redirect to dashboard when business is active & onboarding complete
  useEffect(() => {
    const isBizActive = identity?.business?.status === "ACTIVE" || identity?.business?.status === "APPROVED" || identity?.pendingBusiness?.status === "APPROVED";
    if (!identityLoading && isBizActive && (identity?.onboardingStatus === "COMPLETED" || !identity?.onboardingStatus)) {
      if (identity?.role === "EMPLOYEE" || identity?.employee?.role === "EMPLOYEE") {
        navigate("/workspace");
      } else if (identity?.role === "MANAGER") {
        navigate("/manager");
      } else if (identity?.role === "SUPERVISOR") {
        navigate("/supervisor");
      } else {
        navigate("/dashboard");
      }
    }
  }, [identity, identityLoading, navigate]);

  const getStatus = (): WaitingRoomStatus => {
    const bSt = (businessStatus as string) || "";
    const isBizPending = bSt === "PENDING" || bSt === "PENDING_APPROVAL" || bSt === "WAITING_APPROVAL" || bSt === "WAITING" || Boolean(identity?.pendingBusiness);
    if (isOwner && (isBizPending || !bSt)) return "WAITING_SUPERADMIN_APPROVAL";
    if (identity?.invitation?.status === "PENDING") return "INVITATION_PENDING";
    return "WAITING_FOR_INVITATION";
  };

  const handleBack = async () => {
    try {
      await setRequestedRole("UNASSIGNED");
    } catch (e) {
      console.warn("[WaitingRoom] Reset role failed:", e);
    }
    navigate("/onboarding-choice");
  };

  const handleCreateBusiness = async () => {
    try {
      await setRequestedRole("OWNER");
    } catch (e) {
      console.warn("[WaitingRoom] Set owner role failed:", e);
    }
    navigate("/onboarding-choice");
  };

  const handleExploreDemo = () => {
    navigate("/dashboard");
  };

  const handleGoToSuperAdmin = () => {
    navigate("/platform");
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <EnterpriseWaitingRoom
      email={identity?.email || user?.email || ""}
      status={getStatus()}
      isOwner={isOwner}
      businessName={identity?.pendingBusiness?.businessName || identity?.business?.name}
      businessId={identity?.pendingBusiness?.id || identity?.business?.id}
      onBack={handleBack}
      onEditMemberInfo={() => navigate("/onboarding-choice")}
      onCreateBusiness={handleCreateBusiness}
      onExploreDemo={handleExploreDemo}
      onGoToSuperAdmin={handleGoToSuperAdmin}
      onLogout={handleLogout}
    />
  );
}
