import { Router, Response } from "express";
import {
  authenticateToken,
  AuthenticatedRequest,
  isInvalidTenantId
} from "../modules/workflow/approval/serverAuthMiddleware";
import {
  AUTHORIZED_CASH_OPERATOR_ROLES,
  ServerTransferIntakeEngine,
  computeServerHMACSignature
} from "../domains/cash/services/ServerTransferIntakeEngine";
import { ServerTransferPayoutEngine } from "../domains/cash/services/ServerTransferPayoutEngine";
import {
  ServerInternalTransferEngine,
  ServerActorContext
} from "../domains/cash/services/ServerInternalTransferEngine";
import { FinopsException } from "../modules/runtime/FinopsException";
import { getAdminFirestore } from "../lib/firebaseAdmin";
import {
  ServerProfileVerificationError,
  verifyServerEmployeeOperationalProfile
} from "../domains/rbac/serverEmployeeProfileVerifier";
import { canApproveInternalTransferRole } from "../domains/rbac/operationalProfilePolicy";

export const transferRouter = Router();

function mapFinopsExceptionStatus(code: string): number {
  if (
    code === "TENANT_ISOLATION_VIOLATION" ||
    code === "UNAUTHORIZED_SESSION_OPERATOR" ||
    code === "SESSION_TILL_MISMATCH" ||
    code === "FORBIDDEN_ROLE" ||
    code === "FORBIDDEN_TENANT_ACCESS" ||
    code === "MAKER_CHECKER_VIOLATION" ||
    code === "FORBIDDEN_OPERATIONAL_PROFILE" ||
    code === "CONFLICTING_OPERATIONAL_PROFILE_FIELDS" ||
    code === "RETIRED_OPERATIONAL_PROFILE" ||
    code === "MISSING_OPERATIONAL_PROFILE" ||
    code === "INVALID_OPERATIONAL_PROFILE" ||
    code === "FORBIDDEN_BARBER_ALIAS" ||
    code === "FORBIDDEN_ROLE_PROFILE_COMBINATION" ||
    code === "ROLE_SPOOFING_DETECTED" ||
    code === "OPERATIONAL_PROFILE_SPOOFING_DETECTED" ||
    code === "INACTIVE_ACTOR" ||
    code === "INVALID_OR_MISSING_ROLE" ||
    code === "OVERSIGHT_ROLE_OPERATIONAL_DENY" ||
    code === "FORBIDDEN_EMPLOYEE_CASH_ACCESS"
  ) {
    return 403;
  }
  if (
    code === "TRANSFER_NOT_FOUND" ||
    code === "TILL_NOT_FOUND" ||
    code === "ENTITY_NOT_FOUND" ||
    code === "SESSION_NOT_FOUND"
  ) {
    return 404;
  }
  if (
    code.includes("DUPLICATE") ||
    code === "TRANSFER_ALREADY_PAID" ||
    code === "TRANSFER_ALREADY_FINALIZED"
  ) {
    return 409;
  }
  if (
    code === "INSUFFICIENT_FUNDS" ||
    code === "SESSION_NOT_ACTIVE" ||
    code === "BRANCH_MISMATCH" ||
    code === "CURRENCY_MISMATCH"
  ) {
    return 422;
  }
  return 400;
}

function resolveAuthorizedTenantForRoute(
  req: AuthenticatedRequest,
  res: Response
): string | null {
  const user = req.user!;
  const params = req.body || {};
  const requestedBizIdRaw =
    params.businessId ||
    params.business_id ||
    (req.query && ((req.query.businessId as string) || (req.query.business_id as string))) ||
    (req.params && (req.params.businessId || req.params.business_id)) ||
    "";
  const requestedBizId = typeof requestedBizIdRaw === "string" ? requestedBizIdRaw.trim() : "";
  const headerBizRaw = req.headers["x-business-id"];
  const headerBiz = typeof headerBizRaw === "string" ? headerBizRaw.trim() : "";

  if (user.isSuperAdmin) {
    const targetBiz = requestedBizId || headerBiz || user.business_id || "";
    if (!targetBiz || isInvalidTenantId(targetBiz)) {
      res.status(400).json({
        error: "MISSING_TENANT_CONTEXT",
        message: "SuperAdmin must specify a valid target businessId."
      });
      return null;
    }
    return targetBiz;
  }

  if (
    (requestedBizId && requestedBizId !== user.business_id) ||
    (headerBiz && headerBiz !== user.business_id)
  ) {
    res.status(403).json({
      error: "FORBIDDEN_TENANT_ACCESS",
      message: "Client is not authorized to operate on another tenant."
    });
    return null;
  }

  return user.business_id;
}

// Endpoint 1: Inbound Remittance Intake (Leg 1 - Credit Account 2400)
transferRouter.post("/intake", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required." });
    }

    const businessId = resolveAuthorizedTenantForRoute(req, res);
    if (!businessId) return;

    const normalizedRole = (req.user.role || "").trim().toUpperCase();
    if (!req.user.isSuperAdmin && !AUTHORIZED_CASH_OPERATOR_ROLES.has(normalizedRole)) {
      return res.status(403).json({
        error: "FORBIDDEN_ROLE",
        message: `Role '${req.user.role}' is not authorized to perform cash intake operations.`
      });
    }

    const params = req.body || {};
    await verifyServerEmployeeOperationalProfile({
      adminDb: getAdminFirestore(),
      uid: req.user.uid,
      email: req.user.email,
      businessId,
      actorRole: req.user.isSuperAdmin ? "SUPER_ADMIN" : normalizedRole,
      isSuperAdmin: req.user.isSuperAdmin,
      claimedRole: params.operatorRole,
      claimedProfile: params.operational_profile ?? params.operationalProfile,
      capability: "cash"
    });
    const operatorContext = {
      uid: req.user.uid,
      name: req.user.email || req.user.uid,
      role: req.user.isSuperAdmin ? "SUPER_ADMIN" : normalizedRole,
      email: req.user.email,
      business_id: businessId
    };

    const result = await ServerTransferIntakeEngine.recordInboundTransfer(
      {
        ...params,
        businessId
      },
      operatorContext
    );

    return res.status(201).json({
      success: true,
      message: "Transfert entrant enregistré avec succès.",
      transfer: result.transfer,
      intakeGlTxId: result.intakeGlTxId
    });
  } catch (error: any) {
    console.error("[Server Transfer API] Intake Error:", error);
    if (error instanceof ServerProfileVerificationError) {
      return res.status(error.statusCode).json({
        error: error.code,
        message: error.message
      });
    }
    if (error instanceof FinopsException) {
      const statusCode = mapFinopsExceptionStatus(error.code);
      return res.status(statusCode).json({
        error: error.code,
        message: error.message
      });
    }
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Erreur interne lors de l'enregistrement du transfert."
    });
  }
});

// Endpoint 2: Transfer Payout Execution (Leg 2 - Debit Account 2400)
transferRouter.post("/payout", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required." });
    }

    const businessId = resolveAuthorizedTenantForRoute(req, res);
    if (!businessId) return;

    const normalizedRole = (req.user.role || "").trim().toUpperCase();
    if (!req.user.isSuperAdmin && !AUTHORIZED_CASH_OPERATOR_ROLES.has(normalizedRole)) {
      return res.status(403).json({
        error: "FORBIDDEN_ROLE",
        message: `Role '${req.user.role}' is not authorized to perform cash payout operations.`
      });
    }

    const params = req.body || {};
    await verifyServerEmployeeOperationalProfile({
      adminDb: getAdminFirestore(),
      uid: req.user.uid,
      email: req.user.email,
      businessId,
      actorRole: req.user.isSuperAdmin ? "SUPER_ADMIN" : normalizedRole,
      isSuperAdmin: req.user.isSuperAdmin,
      claimedRole: params.operatorRole,
      claimedProfile: params.operational_profile ?? params.operationalProfile,
      capability: "cash"
    });
    const operatorContext = {
      uid: req.user.uid,
      name: req.user.email || req.user.uid,
      role: req.user.isSuperAdmin ? "SUPER_ADMIN" : normalizedRole,
      email: req.user.email,
      business_id: businessId
    };

    const updatedTransfer = await ServerTransferPayoutEngine.executePayout(
      {
        ...params,
        businessId
      },
      operatorContext
    );

    return res.status(200).json({
      success: true,
      message: "Paiement effectué avec succès.",
      transfer: updatedTransfer
    });
  } catch (error: any) {
    console.error("[Server Transfer API] Payout Error:", error);
    if (error instanceof ServerProfileVerificationError) {
      return res.status(error.statusCode).json({
        error: error.code,
        message: error.message
      });
    }
    if (error instanceof FinopsException) {
      const statusCode = mapFinopsExceptionStatus(error.code);
      return res.status(statusCode).json({
        error: error.code,
        message: error.message
      });
    }
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Erreur interne lors du paiement du transfert."
    });
  }
});

// Endpoint 3: Server-Side Forensic Log Signature Verification
transferRouter.post("/verify-log", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required." });
    }

    const { log } = req.body || {};
    if (!log || !log.signature) {
      return res.status(400).json({ verified: false, reason: "MISSING_LOG_OR_SIGNATURE" });
    }

    const logBizId = typeof log.business_id === "string" ? log.business_id.trim() : "";
    if (!logBizId || isInvalidTenantId(logBizId) || logBizId.toUpperCase() === "DEFAULT") {
      return res.status(400).json({
        verified: false,
        error: "MISSING_TENANT_CONTEXT",
        reason: "MISSING_LOG_BUSINESS_ID",
        message: "log.business_id is required and must be a valid tenant identifier."
      });
    }

    // Verify tenant scoping for non-SuperAdmin before computing any HMAC
    if (!req.user.isSuperAdmin && logBizId !== req.user.business_id) {
      return res.status(403).json({
        verified: false,
        error: "FORBIDDEN_TENANT_ACCESS",
        message: "Client is not authorized to verify forensic logs for another tenant."
      });
    }

    const signaturePayload = {
      id: log.id,
      business_id: logBizId,
      action: log.action,
      actorId: log.actorId,
      timestamp: log.timestamp,
      details: log.details,
      beforeState: log.beforeState || null,
      afterState: log.afterState || null,
      keyVersion: log.keyVersion || "v1_legacy"
    };

    if (log.keyVersion === "v2_server") {
      const expectedSignature = computeServerHMACSignature(signaturePayload);
      const isMatch = log.signature === expectedSignature;
      return res.json({
        verified: isMatch,
        trustStatus: isMatch ? "VERIFIED_SECURE_SERVER" : "VERIFICATION_FAILED",
        keyVersion: "v2_server"
      });
    }

    // Historical v1_legacy check (strictly bound to explicit logBizId, no DEFAULT fallback)
    const legacyKey = `FINOPS_FORENSIC_SEAL_V1_${logBizId}`;
    const expectedLegacySig = computeServerHMACSignature(signaturePayload, legacyKey);
    const isLegacyMatch = log.signature === expectedLegacySig;

    return res.json({
      verified: isLegacyMatch,
      trustStatus: isLegacyMatch ? "HISTORICAL_VERIFIED_EXPOSED_KEY" : "VERIFICATION_FAILED",
      keyVersion: log.keyVersion || "v1_legacy",
      warning: isLegacyMatch ? "Log signé avant l'isolation de clé serveur Phase 3." : undefined
    });
  } catch (error: any) {
    console.error("[Server Transfer API] Verify Log Error:", error);
    return res.status(500).json({
      verified: false,
      error: "INTERNAL_SERVER_ERROR",
      message: "Erreur interne lors de la vérification du journal forensique."
    });
  }
});

// Endpoint 4: Internal Transfer Request (Phase D4-B-2.2 - Policy B / PENDING_APPROVAL)
transferRouter.post("/internal/request", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required." });
    }

    const businessId = resolveAuthorizedTenantForRoute(req, res);
    if (!businessId) return;

    const normalizedRole = (req.user.role || "").trim().toUpperCase();
    await verifyServerEmployeeOperationalProfile({
      adminDb: getAdminFirestore(),
      uid: req.user.uid,
      email: req.user.email,
      businessId,
      actorRole: req.user.isSuperAdmin ? "SUPER_ADMIN" : normalizedRole,
      isSuperAdmin: req.user.isSuperAdmin,
      claimedRole: req.body?.initiatorRole ?? req.body?.operatorRole,
      claimedProfile: req.body?.operational_profile ?? req.body?.operationalProfile,
      capability: "transfer_initiate"
    });

    const actor: ServerActorContext = {
      uid: req.user.uid,
      business_id: businessId,
      role: req.user.isSuperAdmin ? "SUPER_ADMIN" : normalizedRole,
      name: req.user.email || req.user.uid,
      email: req.user.email,
      branch_id: req.user.branch_id || req.body?.branchId || "MAIN_BRANCH"
    };

    const idempotencyKey = (req.headers["idempotency-key"] as string) || req.body?.idempotencyKey || undefined;

    const result = await ServerInternalTransferEngine.requestTransfer(
      {
        ...req.body,
        businessId,
        idempotencyKey
      },
      actor
    );

    return res.status(201).json({
      success: true,
      message: "Demande de transfert interne enregistrée avec succès.",
      transfer: result,
      transferId: result.id,
      status: result.status
    });
  } catch (error: any) {
    console.error("[Server Internal Transfer API] Request Error:", error);
    if (error instanceof ServerProfileVerificationError) {
      return res.status(error.statusCode).json({
        error: error.code,
        message: error.message
      });
    }
    if (error instanceof FinopsException) {
      const statusCode = mapFinopsExceptionStatus(error.code);
      return res.status(statusCode).json({
        error: error.code,
        message: error.message
      });
    }
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Erreur interne lors de la création de la demande de transfert."
    });
  }
});

// Endpoint 5: Internal Transfer Approval & Atomic Execution (Phase D4-B-2.2)
transferRouter.post("/internal/:transferId/approve", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required." });
    }

    const businessId = resolveAuthorizedTenantForRoute(req, res);
    if (!businessId) return;

    const transferId = req.params.transferId;
    if (!transferId || !transferId.trim()) {
      return res.status(400).json({ error: "INVALID_TRANSFER_ID", message: "L'identifiant du transfert est obligatoire." });
    }

    const normalizedRole = (req.user.role || "").trim().toUpperCase();
    if (!req.user.isSuperAdmin && (normalizedRole === "MASTER_HEAD_TELLER" || !canApproveInternalTransferRole(normalizedRole))) {
      return res.status(403).json({
        error: "FORBIDDEN_ROLE",
        message: `Role '${req.user.role}' is not authorized to approve internal transfers.`
      });
    }

    await verifyServerEmployeeOperationalProfile({
      adminDb: getAdminFirestore(),
      uid: req.user.uid,
      email: req.user.email,
      businessId,
      actorRole: req.user.isSuperAdmin ? "SUPER_ADMIN" : normalizedRole,
      isSuperAdmin: req.user.isSuperAdmin,
      claimedRole: req.body?.approverRole,
      claimedProfile: req.body?.operational_profile ?? req.body?.operationalProfile,
      capability: "transfer_approve"
    });

    const actor: ServerActorContext = {
      uid: req.user.uid,
      business_id: businessId,
      role: req.user.isSuperAdmin ? "SUPER_ADMIN" : normalizedRole,
      name: req.user.email || req.user.uid,
      email: req.user.email,
      branch_id: req.user.branch_id || req.body?.branchId || "MAIN_BRANCH"
    };

    const idempotencyKey = (req.headers["idempotency-key"] as string) || req.body?.idempotencyKey || undefined;

    const result = await ServerInternalTransferEngine.approveTransfer(
      transferId.trim(),
      {
        ...req.body,
        businessId,
        idempotencyKey
      },
      actor
    );

    return res.status(200).json({
      success: true,
      message: "Transfert interne approuvé et exécuté avec succès.",
      transfer: result,
      transferId: result.id,
      status: result.status
    });
  } catch (error: any) {
    console.error("[Server Internal Transfer API] Approve Error:", error);
    if (error instanceof ServerProfileVerificationError) {
      return res.status(error.statusCode).json({
        error: error.code,
        message: error.message
      });
    }
    if (error instanceof FinopsException) {
      const statusCode = mapFinopsExceptionStatus(error.code);
      return res.status(statusCode).json({
        error: error.code,
        message: error.message
      });
    }
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Erreur interne lors de l'approbation du transfert."
    });
  }
});

// Endpoint 6: Internal Transfer Rejection (Phase D4-B-2.2)
transferRouter.post("/internal/:transferId/reject", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required." });
    }

    const businessId = resolveAuthorizedTenantForRoute(req, res);
    if (!businessId) return;

    const transferId = req.params.transferId;
    if (!transferId || !transferId.trim()) {
      return res.status(400).json({ error: "INVALID_TRANSFER_ID", message: "L'identifiant du transfert est obligatoire." });
    }

    const rejectionReason = req.body?.rejectionReason || req.body?.reason || "";
    if (!rejectionReason || typeof rejectionReason !== "string" || rejectionReason.trim().length < 5) {
      return res.status(400).json({
        error: "REJECTION_REASON_REQUIRED",
        message: "Un motif de rejet d'au moins 5 caractères est obligatoire pour refuser un transfert."
      });
    }

    const normalizedRole = (req.user.role || "").trim().toUpperCase();
    if (!req.user.isSuperAdmin && (normalizedRole === "MASTER_HEAD_TELLER" || !canApproveInternalTransferRole(normalizedRole))) {
      return res.status(403).json({
        error: "FORBIDDEN_ROLE",
        message: `Role '${req.user.role}' is not authorized to reject internal transfers.`
      });
    }

    await verifyServerEmployeeOperationalProfile({
      adminDb: getAdminFirestore(),
      uid: req.user.uid,
      email: req.user.email,
      businessId,
      actorRole: req.user.isSuperAdmin ? "SUPER_ADMIN" : normalizedRole,
      isSuperAdmin: req.user.isSuperAdmin,
      claimedRole: req.body?.approverRole,
      claimedProfile: req.body?.operational_profile ?? req.body?.operationalProfile,
      capability: "transfer_approve"
    });

    const actor: ServerActorContext = {
      uid: req.user.uid,
      business_id: businessId,
      role: req.user.isSuperAdmin ? "SUPER_ADMIN" : normalizedRole,
      name: req.user.email || req.user.uid,
      email: req.user.email,
      branch_id: req.user.branch_id || req.body?.branchId || "MAIN_BRANCH"
    };

    const idempotencyKey = (req.headers["idempotency-key"] as string) || req.body?.idempotencyKey || undefined;

    const result = await ServerInternalTransferEngine.rejectTransfer(
      transferId.trim(),
      {
        ...req.body,
        businessId,
        rejectionReason: rejectionReason.trim(),
        idempotencyKey
      },
      actor
    );

    return res.status(200).json({
      success: true,
      message: "Transfert interne rejeté avec succès.",
      transfer: result,
      transferId: result.id,
      status: result.status
    });
  } catch (error: any) {
    console.error("[Server Internal Transfer API] Reject Error:", error);
    if (error instanceof ServerProfileVerificationError) {
      return res.status(error.statusCode).json({
        error: error.code,
        message: error.message
      });
    }
    if (error instanceof FinopsException) {
      const statusCode = mapFinopsExceptionStatus(error.code);
      return res.status(statusCode).json({
        error: error.code,
        message: error.message
      });
    }
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Erreur interne lors du rejet du transfert."
    });
  }
});
