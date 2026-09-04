import { FlowState } from "../hooks/useAuth";
import { IdentitySnapshot } from "../modules/identity/types";
import { Role } from "../types";

export interface NavigationTargetResult {
  targetPath: string;
  reason: string;
  isProtected: boolean;
  requiredRole?: Role | "SUPER_ADMIN";
}

export interface NavigationContextState {
  targetRoute: string;
  isResolved: boolean;
  flowState: FlowState;
  identity: IdentitySnapshot | null;
  role: Role | null;
}
