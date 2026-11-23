/**
 * Environment-neutral Super Admin constants and server-safe helpers.
 * Never imports Vite's import.meta.env so Node.js/Vercel server bundles stay clean.
 */

export const DEFAULT_SUPER_ADMIN_EMAIL = "tekpounou@gmail.com";

export const SUPER_ADMIN_EMAILS: ReadonlySet<string> = new Set([
  DEFAULT_SUPER_ADMIN_EMAIL,
  "admin@finops.com",
  "superadmin@finops.com",
]);

export const getServerSuperAdminEmail = (): string => {
  const envEmail =
    typeof process !== "undefined"
      ? process.env?.VITE_SUPER_ADMIN_EMAIL || process.env?.SUPER_ADMIN_EMAIL
      : undefined;
  return (envEmail || DEFAULT_SUPER_ADMIN_EMAIL).toLowerCase().trim();
};

export const isServerSuperAdminEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();
  return cleanEmail === getServerSuperAdminEmail() || SUPER_ADMIN_EMAILS.has(cleanEmail);
};
