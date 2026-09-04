import { Role, Business, Employee, BusinessSnapshot } from "../../types";

export type OrchestratorState = 
  | "UNKNOWN"
  | "AUTHENTICATED"
  | "IDENTITY_RESOLUTION"
  | "USER_RESOLVED"
  | "EMPLOYEE_RESOLVED"
  | "INVITATION_RESOLVED"
  | "MEMBERSHIP_RESOLVED"
  | "BUSINESS_RESOLVED"
  | "SNAPSHOT_RESOLVED"
  | "ROLE_RESOLVED"
  | "PERMISSION_RESOLVED"
  | "FEATURE_RESOLVED"
  | "LICENSE_RESOLVED"
  | "ONBOARDING_RESOLVED"
  | "READY"
  | "ERROR";

// ... (existing error states)

export type IdentityStatus = "UNREGISTERED" | "INITIAL_IDENTITY" | "PROFILE_ONLY" | "ACTIVE" | "SUPER_ADMIN" | "SUSPENDED" | "INVITED" | "NEW_USER";
export type OnboardingStatus = "CHOICE" | "JOINING" | "CREATING" | "WAITING" | "PENDING_APPROVAL" | "COMPLETED" | "PENDING_IDENTITY" | "PENDING_WORKSPACE" | "PENDING_ONBOARDING";
export type TerminalErrorState = "AUTH_FAILED" | "IDENTITY_COLLAPSE" | "BUSINESS_NOT_FOUND" | "PERMISSION_DENIED" | "NETWORK_OFFLINE" | "NO_BUSINESS" | "DATA_INCONSISTENCY" | "TIMEOUT_ERROR";

export interface IdentitySnapshot {
  user_uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  
  employee: Employee | null;
  business: Business | null;
  businessSnapshot: BusinessSnapshot | null;
  
  role: Role | "UNASSIGNED";
  requested_role?: Role | "UNASSIGNED";
  identityStatus: IdentityStatus;
  onboardingStatus: OnboardingStatus;
  
  orchestratorState: OrchestratorState;
  terminalError?: TerminalErrorState;
  
  invitation: any | null; 
  
  permissions: string[];
  lastResolvedAt: string;
}

export interface ResolutionResult<T> {
  data: T | null;
  status: "RESOLVED" | "NOT_FOUND" | "ERROR";
  error?: string;
}
