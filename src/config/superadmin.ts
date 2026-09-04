/**
 * Super Admin Configuration & Helper Utilities
 * Single Source of Truth for Super Admin Email and authorization checks.
 */

export const DEFAULT_SUPER_ADMIN_EMAIL = "tekpounou@gmail.com";

/**
 * Resolves the Super Admin email address from environment variables or default constant.
 */
export const getSuperAdminEmail = (): string => {
  const envEmail = 
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPER_ADMIN_EMAIL) ||
    (typeof process !== "undefined" && (process.env?.VITE_SUPER_ADMIN_EMAIL || process.env?.SUPER_ADMIN_EMAIL));
  return (envEmail || DEFAULT_SUPER_ADMIN_EMAIL).toLowerCase().trim();
};

export const SUPER_ADMIN_EMAIL = getSuperAdminEmail();

/**
 * List of authorized Super Admin emails
 */
export const SUPER_ADMIN_EMAILS: ReadonlySet<string> = new Set([
  DEFAULT_SUPER_ADMIN_EMAIL,
  "admin@finops.com",
  "superadmin@finops.com",
]);

/**
 * Helper to check if a given email belongs to a Super Admin platform supervisor.
 */
export const isSuperAdminEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();
  return cleanEmail === getSuperAdminEmail() || SUPER_ADMIN_EMAILS.has(cleanEmail);
};
