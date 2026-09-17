import { Router, Response } from "express";
import { getAdminFirestore } from "../../../lib/firebaseAdmin";
import { authenticateToken, AuthenticatedRequest } from "./serverAuthMiddleware";
import { ServerApprovalGateway } from "./ServerApprovalGateway";
import { ApprovalExecutionWorker } from "./ApprovalExecutionWorker";
import { ApprovalInitiateSchema, ApprovalDecideSchema, ApprovalCancelSchema } from "./schemas";

export const approvalRouter = Router();

// Apply server authentication to all approval gateway routes
approvalRouter.use(authenticateToken);

/**
 * POST /api/approvals/payroll/initiate
 * Initiates an approval instance with an atomic mutex lock.
 */
approvalRouter.post("/payroll/initiate", async (req: AuthenticatedRequest, res: Response) => {
  try {
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
      businessId: user.business_id,
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
      return res.status(409).json({ error: "ACTIVE_APPROVAL_ALREADY_EXISTS", message });
    }
    if (message.includes("PAYROLL_CYCLE_NOT_FOUND")) {
      return res.status(404).json({ error: "PAYROLL_CYCLE_NOT_FOUND", message });
    }
    if (message.includes("TENANT_MISMATCH")) {
      return res.status(403).json({ error: "TENANT_MISMATCH", message });
    }
    if (message.includes("INVALID_CYCLE_STATUS")) {
      return res.status(400).json({ error: "INVALID_CYCLE_STATUS", message });
    }

    return res.status(500).json({ error: "INITIATION_FAILED", message });
  }
});

/**
 * POST /api/approvals/:instanceId/decide
 * Records an approval step decision (APPROVE/REJECT) with maker-checker checks.
 */
approvalRouter.post("/:instanceId/decide", async (req: AuthenticatedRequest, res: Response) => {
  try {
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
      businessId: user.business_id,
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
      return res.status(403).json({ error: "MAKER_CHECKER_VIOLATION", message });
    }
    if (message.includes("ROLE_UNAUTHORIZED")) {
      return res.status(403).json({ error: "ROLE_UNAUTHORIZED", message });
    }
    if (message.includes("PAYLOAD_MUTATION_DETECTED")) {
      return res.status(409).json({ error: "PAYLOAD_MUTATION_DETECTED", message });
    }
    if (message.includes("APPROVAL_INSTANCE_NOT_FOUND")) {
      return res.status(404).json({ error: "APPROVAL_INSTANCE_NOT_FOUND", message });
    }
    if (message.includes("TENANT_MISMATCH")) {
      return res.status(403).json({ error: "TENANT_MISMATCH", message });
    }
    if (message.includes("STEP_ALREADY_ACTED") || message.includes("INVALID_APPROVAL_STATUS")) {
      return res.status(400).json({ error: "INVALID_STATE", message });
    }

    return res.status(500).json({ error: "DECISION_FAILED", message });
  }
});

/**
 * POST /api/approvals/:instanceId/cancel
 * Cancels a pending approval workflow and releases mutex lock.
 */
approvalRouter.post("/:instanceId/cancel", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { instanceId } = req.params;
    const parseResult = ApprovalCancelSchema.safeParse(req.body);
    const reason = parseResult.success ? parseResult.data.reason : undefined;

    const user = req.user!;
    const firestore = getAdminFirestore();
    const gateway = new ServerApprovalGateway(firestore);

    const result = await gateway.cancelApproval({
      businessId: user.business_id,
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
      return res.status(403).json({ error: "UNAUTHORIZED_CANCEL", message });
    }
    if (message.includes("APPROVAL_INSTANCE_NOT_FOUND")) {
      return res.status(404).json({ error: "APPROVAL_INSTANCE_NOT_FOUND", message });
    }
    return res.status(500).json({ error: "CANCEL_FAILED", message });
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
    if (data.business_id !== user.business_id && data.businessId !== user.business_id && !user.isSuperAdmin) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    return res.status(200).json({
      success: true,
      instance: data
    });
  } catch (err: any) {
    return res.status(500).json({ error: "FETCH_FAILED", details: err?.message });
  }
});
