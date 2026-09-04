import { IdentityRepository } from "../repositories";

export interface UniquenessCheckResult {
  isUnique: boolean;
  reason?: "users" | "employees" | "pending invitations";
}

/**
 * Enforces email uniqueness inside the same business/tenant context via IdentityRepository.
 */
export async function checkEmailUniqueness(
  email: string,
  businessId: string
): Promise<UniquenessCheckResult> {
  return IdentityRepository.checkEmailUniqueness(email, businessId);
}

/**
 * Enforces global email uniqueness across the entire platform via IdentityRepository.
 */
export async function checkEmailUniquenessGlobal(
  email: string
): Promise<UniquenessCheckResult> {
  return IdentityRepository.checkEmailUniquenessGlobal(email);
}
