import { Router, Response } from "express";
import { getAdminFirestore } from "../../../lib/firebaseAdmin";
import {
  authenticateToken,
  AuthenticatedRequest,
  isInvalidTenantId
} from "./serverAuthMiddleware";
import { ServerApprovalGateway } from "./ServerApprovalGateway";
import { ApprovalExecutionWorker } from "./ApprovalExecutionWorker";
import { ApprovalInitiateSchema, ApprovalDecideSchema, ApprovalCancelSchema } from "./schemas";

export const approvalRouter = Router();

// Apply server authentication to all approval gateway routes
approvalRouter.use(authenticateToken);

function resolveApprovalTenant(req: AuthenticatedRequest, res: Response): string | null {
  const user = req.user!;
  const bodyBiz1 = typeof req.body?.businessId === "string" ? req.body.businessId.trim() : "";
  const bodyBiz2 = typeof req.body?.business_id === "string" ? req.body.business_id.trim() : "";
  if (bodyBiz1 && bodyBiz2 && bodyBiz1 !== bodyBiz2) {
    res.status(403).json({
      error: "FORBIDDEN_TENANT_ACCESS",
      message: "Contradictory businessId and business_id in request body."
    });
    return null;
  }

  const bodyBiz = bodyBiz1 || bodyBiz2;
  const headerBizRaw = req.headers["x-business-id"];
  const headerBiz = typeof headerBizRaw === "string" ? headerBizRaw.trim() : "";

  if (bodyBiz && headerBiz && bodyBiz !== headerBiz) {
    res.status(403).json({
      error: "FORBIDDEN_TENANT_ACCESS",
      message: "Contradictory tenant identifiers between header and body."
    });
    return null;
  }

  if (user.isSuperAdmin) {
    const targetBiz = bodyBiz || headerBiz || user.business_id || "";
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
    (bodyBiz && bodyBiz !== user.business_id) ||
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

/**
 * POST /api/approvals/payroll/initiate
 * Initiates an approval instance with an atomic mutex lock.
 */
approvalRouter.post("/payroll/initiate", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = resolveApprovalTenant(req, res);
    if (!businessId) return;

    const parseResult = ApprovalInitiateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        details: parseResult.error.format()
      });
    }

    const { cycleId } = parseResult.data;
    const user = req.user!;
    const firestore = getAdminFirestore();
    const gateway = new ServerApprovalGateway(firestore);

    const result = await gateway.initiatePayrollApproval({
      businessId,
      cycleId,
      requesterId: user.uid,
      requesterRole: user.role
    });

    return res.status(201).json({
      success: true,
      ...result
    });
  } catch (err: any) {
    const message = err?.message || String(err);
    if (message.includes("ACTIVE_APPROVAL_ALREADY_EXISTS")) {
      return res.status(409).json({
        error: "ACTIVE_APPROVAL_ALREADY_EXISTS",
        message: "An active approval workflow already exists for this payroll cycle."
      });
    }
    if (message.includes("PAYROLL_CYCLE_NOT_FOUND")) {
      return res.status(404).json({
        error: "PAYROLL_CYCLE_NOT_FOUND",
        message: "Payroll cycle not found."
      });
    }
    if (message.includes("TENANT_MISMATCH")) {
      return res.status(403).json({
        error: "TENANT_MISMATCH",
        message: "Payroll cycle does not belong to the authorized tenant."
      });
    }
    if (message.includes("INVALID_CYCLE_STATUS")) {
      return res.status(400).json({
        error: "INVALID_CYCLE_STATUS",
        message: "Payroll cycle is not in a valid status for approval initiation."
      });
    }

    return res.status(500).json({
      error: "INITIATION_FAILED",
      message: "Failed to initiate payroll approval."
    });
  }
});

/**
 * POST /api/approvals/:instanceId/decide
 * Records an approval step decision (APPROVE/REJECT) with maker-checker checks.
 */
approvalRouter.post("/:instanceId/decide", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = resolveApprovalTenant(req, res);
    if (!businessId) return;

    const { instanceId } = req.params;
    const parseResult = ApprovalDecideSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        details: parseResult.error.format()
      });
    }

    const { action, comment } = parseResult.data;
    const user = req.user!;
    const firestore = getAdminFirestore();
    const gateway = new ServerApprovalGateway(firestore);

    const result = await gateway.submitStepDecision({
      businessId,
      instanceId,
      actorUid: user.uid,
      actorRole: user.role,
      action,
      comment
    });

    // If final approval was achieved, asynchronously trigger background execution
    if (result.finalApproved && result.status === "EXECUTION_PENDING") {
      const worker = new ApprovalExecutionWorker(firestore);
      worker
        .executeApprovedPayroll({
          instanceId,
          workerId: `worker_${Date.now()}`
        })
        .catch((e) => console.error(`[BackgroundExecution] Failed for ${instanceId}:`, e));
    }

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (err: any) {
    const message = err?.message || String(err);
    if (message.includes("MAKER_CHECKER_VIOLATION")) {
      return res.status(403).json({
        error: "MAKER_CHECKER_VIOLATION",
        message: "Initiator cannot approve their own payroll workflow."
      });
    }
    if (message.includes("ROLE_UNAUTHORIZED")) {
      return res.status(403).json({
        error: "ROLE_UNAUTHORIZED",
        message: "Actor role is not authorized for this approval step."
      });
    }
    if (message.includes("PAYLOAD_MUTATION_DETECTED")) {
      return res.status(409).json({
        error: "PAYLOAD_MUTATION_DETECTED",
        message: "Payroll payload has been modified since approval initiation."
      });
    }
    if (message.includes("APPROVAL_INSTANCE_NOT_FOUND")) {
      return res.status(404).json({
        error: "APPROVAL_INSTANCE_NOT_FOUND",
        message: "Approval workflow instance not found."
      });
    }
    if (message.includes("TENANT_MISMATCH")) {
      return res.status(403).json({
        error: "TENANT_MISMATCH",
        message: "Approval workflow does not belong to the authorized tenant."
      });
    }
    if (message.includes("STEP_ALREADY_ACTED") || message.includes("INVALID_APPROVAL_STATUS")) {
      return res.status(400).json({
        error: "INVALID_STATE",
        message: "Approval workflow step is not in an actionable state."
      });
    }

    return res.status(500).json({
      error: "DECISION_FAILED",
      message: "Failed to process approval decision."
    });
  }
});

/**
 * POST /api/approvals/:instanceId/cancel
 * Cancels a pending approval workflow and releases mutex lock.
 */
approvalRouter.post("/:instanceId/cancel", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = resolveApprovalTenant(req, res);
    if (!businessId) return;

    const { instanceId } = req.params;
    const parseResult = ApprovalCancelSchema.safeParse(req.body);
    const reason = parseResult.success ? parseResult.data.reason : undefined;

    const user = req.user!;
    const firestore = getAdminFirestore();
    const gateway = new ServerApprovalGateway(firestore);

    const result = await gateway.cancelApproval({
      businessId,
      instanceId,
      actorUid: user.uid,
      actorRole: user.role,
      reason
    });

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (err: any) {
    const message = err?.message || String(err);
    if (message.includes("UNAUTHORIZED_CANCEL")) {
      return res.status(403).json({
        error: "UNAUTHORIZED_CANCEL",
        message: "Actor is not authorized to cancel this approval workflow."
      });
    }
    if (message.includes("APPROVAL_INSTANCE_NOT_FOUND")) {
      return res.status(404).json({
        error: "APPROVAL_INSTANCE_NOT_FOUND",
        message: "Approval workflow instance not found."
      });
    }
    return res.status(500).json({
      error: "CANCEL_FAILED",
      message: "Failed to cancel approval workflow."
    });
  }
});

/**
 * GET /api/approvals/:instanceId
 * Fetches an approval instance document securely scoped by tenant.
 */
approvalRouter.get("/:instanceId", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { instanceId } = req.params;
    const user = req.user!;
    const firestore = getAdminFirestore();

    const docSnap = await firestore.collection("approval_instances").doc(instanceId).get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const data = docSnap.data()!;
    const docBiz1 = typeof data.business_id === "string" ? data.business_id.trim() : "";
    const docBiz2 = typeof data.businessId === "string" ? data.businessId.trim() : "";
    if (docBiz1 && docBiz2 && docBiz1 !== docBiz2) {
      return res.status(403).json({ error: "FORBIDDEN_TENANT_ACCESS" });
    }
    const docBiz = docBiz1 || docBiz2;
    if (!user.isSuperAdmin && (!docBiz || docBiz !== user.business_id)) {
      return res.status(403).json({ error: "FORBIDDEN_TENANT_ACCESS" });
    }

    return res.status(200).json({
      success: true,
      instance: data
    });
  } catch (err: any) {
    return res.status(500).json({
      error: "FETCH_FAILED",
      message: "Failed to fetch approval workflow instance."
    });
  }
});

