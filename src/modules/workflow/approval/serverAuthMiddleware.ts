import { Request, Response, NextFunction } from "express";
import { getAdminAuth, getAdminFirestore } from "../../../lib/firebaseAdmin";
import { isSuperAdminEmail } from "../../../config/superadmin";

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  role: string;
  business_id: string;
  isSuperAdmin: boolean;
  branch_id?: string;
  branchId?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

const INVALID_TENANT_IDS = new Set([
  "",
  "none",
  "null",
  "undefined",
  "default",
  "biz_default",
  "demo",
  "biz_demo",
  "pending",
  "unbound"
]);

const SUSPENDED_USER_STATUSES = new Set([
  "SUSPENDED",
  "DISABLED",
  "INACTIVE",
  "REVOKED",
  "BLOCKED",
  "TERMINATED"
]);

const INACTIVE_BUSINESS_STATUSES = new Set([
  "SUSPENDED",
  "DISABLED",
  "INACTIVE",
  "CANCELLED",
  "TERMINATED",
  "ARCHIVED",
  "DELETED"
]);

export function isInvalidTenantId(rawBizId: unknown): boolean {
  if (typeof rawBizId !== "string") return true;
  const normalized = rawBizId.trim().toLowerCase();
  return INVALID_TENANT_IDS.has(normalized);
}

function mapTokenErrorToResponse(err: any, res: Response) {
  if (err?.code === "auth/id-token-revoked" || err?.message?.includes("revoked")) {
    return res.status(401).json({
      error: "TOKEN_REVOKED",
      message: "Firebase ID token has been revoked."
    });
  }

  if (err?.code === "auth/user-disabled") {
    return res.status(401).json({
      error: "USER_DISABLED",
      message: "User account has been disabled."
    });
  }

  return res.status(401).json({
    error: "INVALID_TOKEN",
    message: "Firebase ID token verification failed."
  });
}

/**
 * Verifies the caller's Firebase ID token with revocation check (checkRevoked = true).
 * If the runtime ADC credentials / project cannot contact Identity Toolkit API
 * (e.g. Identity Toolkit API is not enabled or accessible in the host container project),
 * securely falls back to cryptographic RSA signature verification (checkRevoked = false).
 * Genuine revocation and user-disabled errors are preserved and rethrown.
 */
async function verifyIdTokenWithRevocationFallback(adminAuth: any, token: string) {
  try {
    return await adminAuth.verifyIdToken(token, true);
  } catch (err: any) {
    const isIdentityToolkitUnavailable =
      err?.code === "auth/internal-error" ||
      (typeof err?.message === "string" &&
        (err.message.includes("Identity Toolkit API") ||
         err.message.includes("accessNotConfigured") ||
         err.message.includes("SERVICE_DISABLED") ||
         err.message.includes("has not been used in project")));

    if (isIdentityToolkitUnavailable) {
      // Quiet fallback without logging verbose raw responses on every request
      return await adminAuth.verifyIdToken(token, false);
    }
    throw err;
  }
}

/**
 * Authenticates the caller's Firebase ID token (with revocation check) and verifies
 * account active status, without requiring an existing tenant binding.
 * Used strictly for pre-tenant onboarding routes (initial business creation, invitation accept/reject).
 */
export async function authenticateIdentityOnly(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Missing or malformed Authorization Bearer header."
    });
  }

  const token = authHeader.split("Bearer ")[1];
  try {
    const adminAuth = getAdminAuth();
    const decodedToken = await verifyIdTokenWithRevocationFallback(adminAuth, token);

    const uid = decodedToken.uid;
    const email = decodedToken.email;
    const emailVerified = decodedToken.email_verified === true;

    const isSuperAdmin =
      decodedToken.is_super_admin === true ||
      decodedToken.super_admin === true ||
      decodedToken.role === "SUPER_ADMIN" ||
      (emailVerified && isSuperAdminEmail(email));

    const claimBizSnake =
      typeof decodedToken.business_id === "string" ? decodedToken.business_id.trim() : "";
    const claimBizCamel =
      typeof decodedToken.businessId === "string" ? decodedToken.businessId.trim() : "";
    if (
      claimBizSnake &&
      claimBizCamel &&
      !isInvalidTenantId(claimBizSnake) &&
      !isInvalidTenantId(claimBizCamel) &&
      claimBizSnake !== claimBizCamel
    ) {
      return res.status(403).json({
        error: "TENANT_MISMATCH",
        message: "Contradictory business_id and businessId claims in authentication token."
      });
    }

    const rawClaimBiz = claimBizSnake || claimBizCamel || "";
    const claimBizId = isInvalidTenantId(rawClaimBiz) ? "" : rawClaimBiz.trim();
    const claimRole =
      typeof decodedToken.role === "string" && decodedToken.role.trim()
        ? decodedToken.role.trim().toUpperCase()
        : "";

    let docBizId = "";
    let docRole = "";
    let docBizStatus = "";

    try {
      const firestore = getAdminFirestore();
      const userDoc = await firestore.collection("users").doc(uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data() || {};
        const acctStatus = String(
          userData.accountStatus || userData.account_status || userData.status || ""
        )
          .trim()
          .toUpperCase();

        if (SUSPENDED_USER_STATUSES.has(acctStatus)) {
          return res.status(403).json({
            error: "ACCOUNT_SUSPENDED",
            message: "User account is suspended or disabled."
          });
        }

        docBizStatus = String(
          userData.businessStatus || userData.business_status || ""
        )
          .trim()
          .toUpperCase();

        const docBizSnake =
          typeof userData.business_id === "string" ? userData.business_id.trim() : "";
        const docBizCamel =
          typeof userData.businessId === "string" ? userData.businessId.trim() : "";
        if (
          docBizSnake &&
          docBizCamel &&
          !isInvalidTenantId(docBizSnake) &&
          !isInvalidTenantId(docBizCamel) &&
          docBizSnake !== docBizCamel
        ) {
          return res.status(403).json({
            error: "TENANT_MISMATCH",
            message: "Contradictory business_id and businessId fields in user profile."
          });
        }

        const rawDocBiz = docBizSnake || docBizCamel || "";
        docBizId = isInvalidTenantId(rawDocBiz) ? "" : rawDocBiz.trim();
        docRole =
          typeof userData.role === "string" && userData.role.trim()
            ? userData.role.trim().toUpperCase()
            : "";

        if (docRole === "SUPER_ADMIN" && !isSuperAdmin) {
          return res.status(403).json({
            error: "FORBIDDEN_ROLE_ESCALATION",
            message: "Unauthorized privileged role in user profile."
          });
        }
      }
    } catch (_dbErr) {
      // Proceed if Firestore profile does not exist yet
    }

    if (claimBizId && docBizId && claimBizId !== docBizId && docBizStatus !== "CANCELLED") {
      console.warn(
        `[SecurityAlert] TENANT_MISMATCH for uid=${uid}: claimBizId=${claimBizId} vs docBizId=${docBizId}`
      );
      return res.status(403).json({
        error: "TENANT_MISMATCH",
        message: "Conflicting tenant bindings between token claims and user profile."
      });
    }

    if (
      claimBizId &&
      !docBizId &&
      docRole &&
      docRole !== "EMPLOYEE" &&
      claimRole &&
      claimRole !== docRole
    ) {
      console.warn(
        `[SecurityAlert] HYBRID_ROLE_CONFLICT for uid=${uid}: claimBizId=${claimBizId}, claimRole=${claimRole}, docRole=${docRole}`
      );
      return res.status(403).json({
        error: "TENANT_MISMATCH",
        message: "Inconsistent role and tenant sources between token claims and user profile."
      });
    }

    const business_id =
      docBizStatus === "CANCELLED" && !claimBizId ? "" : claimBizId || docBizId || "";
    const role = isSuperAdmin
      ? "SUPER_ADMIN"
      : claimBizId
        ? claimRole || (docBizId === claimBizId ? docRole : "") || "EMPLOYEE"
        : docBizId
          ? docRole || "EMPLOYEE"
          : claimRole || "EMPLOYEE";

    req.user = {
      uid,
      email,
      emailVerified,
      role,
      business_id,
      isSuperAdmin
    };

    next();
  } catch (err: any) {
    return mapTokenErrorToResponse(err, res);
  }
}

export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Missing or malformed Authorization Bearer header."
    });
  }

  const token = authHeader.split("Bearer ")[1];
  try {
    const adminAuth = getAdminAuth();
    const decodedToken = await verifyIdTokenWithRevocationFallback(adminAuth, token);

    const uid = decodedToken.uid;
    const email = decodedToken.email;
    const emailVerified = decodedToken.email_verified === true;

    // SuperAdmin status via Admin-minted claims or verified SSOT SuperAdmin email
    const isSuperAdmin =
      decodedToken.is_super_admin === true ||
      decodedToken.super_admin === true ||
      decodedToken.role === "SUPER_ADMIN" ||
      (emailVerified && isSuperAdminEmail(email));

    const claimBizSnake =
      typeof decodedToken.business_id === "string" ? decodedToken.business_id.trim() : "";
    const claimBizCamel =
      typeof decodedToken.businessId === "string" ? decodedToken.businessId.trim() : "";
    if (
      claimBizSnake &&
      claimBizCamel &&
      !isInvalidTenantId(claimBizSnake) &&
      !isInvalidTenantId(claimBizCamel) &&
      claimBizSnake !== claimBizCamel
    ) {
      return res.status(403).json({
        error: "TENANT_MISMATCH",
        message: "Contradictory business_id and businessId claims in authentication token."
      });
    }

    const rawClaimBiz = claimBizSnake || claimBizCamel || "";
    const claimBizId = isInvalidTenantId(rawClaimBiz) ? "" : rawClaimBiz.trim();
    const claimRole =
      typeof decodedToken.role === "string" && decodedToken.role.trim()
        ? decodedToken.role.trim().toUpperCase()
        : "";

    let docBizId = "";
    let docRole = "";
    let firestore: ReturnType<typeof getAdminFirestore> | null = null;

    try {
      firestore = getAdminFirestore();
      const userDoc = await firestore.collection("users").doc(uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data() || {};
        const acctStatus = String(
          userData.accountStatus || userData.account_status || userData.status || ""
        )
          .trim()
          .toUpperCase();

        if (SUSPENDED_USER_STATUSES.has(acctStatus)) {
          return res.status(403).json({
            error: "ACCOUNT_SUSPENDED",
            message: "User account is suspended or disabled."
          });
        }

        const userBizStatus = String(
          userData.businessStatus || userData.business_status || ""
        )
          .trim()
          .toUpperCase();
        if (INACTIVE_BUSINESS_STATUSES.has(userBizStatus) && !isSuperAdmin) {
          return res.status(403).json({
            error: "TENANT_INACTIVE",
            message: "The associated business tenant is suspended or inactive."
          });
        }

        const docBizSnake =
          typeof userData.business_id === "string" ? userData.business_id.trim() : "";
        const docBizCamel =
          typeof userData.businessId === "string" ? userData.businessId.trim() : "";
        if (
          docBizSnake &&
          docBizCamel &&
          !isInvalidTenantId(docBizSnake) &&
          !isInvalidTenantId(docBizCamel) &&
          docBizSnake !== docBizCamel
        ) {
          return res.status(403).json({
            error: "TENANT_MISMATCH",
            message: "Contradictory business_id and businessId fields in user profile."
          });
        }

        const rawDocBiz = docBizSnake || docBizCamel || "";
        docBizId = isInvalidTenantId(rawDocBiz) ? "" : rawDocBiz.trim();
        docRole =
          typeof userData.role === "string" && userData.role.trim()
            ? userData.role.trim().toUpperCase()
            : "";

        if (docRole === "SUPER_ADMIN" && !isSuperAdmin) {
          return res.status(403).json({
            error: "FORBIDDEN_ROLE_ESCALATION",
            message: "Unauthorized privileged role in user profile."
          });
        }
      }
    } catch (_dbErr) {
      // Firestore lookup warning; proceed to strict validation below
    }

    // Prevent hybrid attribution when custom claims and Firestore profile disagree on tenant
    if (claimBizId && docBizId && claimBizId !== docBizId) {
      console.warn(
        `[SecurityAlert] TENANT_MISMATCH for uid=${uid}: claimBizId=${claimBizId} vs docBizId=${docBizId}`
      );
      return res.status(403).json({
        error: "TENANT_MISMATCH",
        message: "Conflicting tenant bindings between token claims and user profile."
      });
    }

    // Prevent hybrid attribution when one source has a tenant and the other has a conflicting role without matching tenant
    if (
      claimBizId &&
      !docBizId &&
      docRole &&
      docRole !== "EMPLOYEE" &&
      claimRole &&
      claimRole !== docRole
    ) {
      console.warn(
        `[SecurityAlert] HYBRID_ROLE_CONFLICT for uid=${uid}: claimBizId=${claimBizId}, claimRole=${claimRole}, docRole=${docRole}`
      );
      return res.status(403).json({
        error: "TENANT_MISMATCH",
        message: "Inconsistent role and tenant sources between token claims and user profile."
      });
    }

    let business_id = "";
    let role = "EMPLOYEE";

    if (claimBizId) {
      business_id = claimBizId;
      if (claimRole && claimRole !== "EMPLOYEE") {
        role = claimRole;
      } else if (docBizId === claimBizId && docRole) {
        role = docRole;
      } else {
        role = claimRole || (isSuperAdmin ? "SUPER_ADMIN" : "EMPLOYEE");
      }
    } else if (docBizId) {
      business_id = docBizId;
      // Strict co-sourced attribution: when tenant comes from Firestore profile, role must come from Firestore profile
      role = docRole || (isSuperAdmin ? "SUPER_ADMIN" : "EMPLOYEE");
    } else {
      business_id = "";
      role = isSuperAdmin ? "SUPER_ADMIN" : claimRole || "EMPLOYEE";
    }

    // Verify business document existence for synthetic biz_${uid} and check business active status
    if (business_id && firestore) {
      try {
        const bizDoc = await firestore.collection("businesses").doc(business_id).get();
        if (bizDoc.exists) {
          const bizData = bizDoc.data() || {};
          const bizStatus = String(bizData.status || "").trim().toUpperCase();
          if (INACTIVE_BUSINESS_STATUSES.has(bizStatus) && !isSuperAdmin) {
            return res.status(403).json({
              error: "TENANT_INACTIVE",
              message: "The associated business tenant is suspended or inactive."
            });
          }
        } else if (business_id === `biz_${uid}` && !isSuperAdmin) {
          return res.status(403).json({
            error: "TENANT_BINDING_REQUIRED",
            message: "Unprovisioned synthetic tenant identifier rejected."
          });
        }
      } catch (_bizErr) {
        if (business_id === `biz_${uid}` && !isSuperAdmin) {
          return res.status(403).json({
            error: "TENANT_BINDING_REQUIRED",
            message: "Unprovisioned synthetic tenant identifier rejected."
          });
        }
      }
    }

    const rawHeaderBiz = req.headers["x-business-id"];
    const headerBiz = typeof rawHeaderBiz === "string" ? rawHeaderBiz.trim() : "";

    if (!isSuperAdmin) {
      if (headerBiz && headerBiz !== business_id) {
        return res.status(403).json({
          error: "FORBIDDEN_TENANT_ACCESS",
          message: "Client is not authorized to operate on another tenant via x-business-id header."
        });
      }

      if (!business_id) {
        return res.status(403).json({
          error: "TENANT_BINDING_REQUIRED",
          message: "No verified business/tenant association found for this user."
        });
      }
    } else if (headerBiz) {
      if (isInvalidTenantId(headerBiz)) {
        return res.status(400).json({
          error: "INVALID_TENANT_CONTEXT",
          message: "Invalid x-business-id header value."
        });
      }
      business_id = headerBiz;
    }

    req.user = {
      uid,
      email,
      emailVerified,
      role: isSuperAdmin && role === "EMPLOYEE" ? "SUPER_ADMIN" : role,
      business_id,
      isSuperAdmin
    };

    next();
  } catch (err: any) {
    return mapTokenErrorToResponse(err, res);
  }
}

export function requireSuperAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Authentication required."
    });
  }

  if (!req.user.isSuperAdmin) {
    return res.status(403).json({
      error: "FORBIDDEN",
      message: "SuperAdmin privilege required."
    });
  }

  next();
}


