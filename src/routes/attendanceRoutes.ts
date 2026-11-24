import { Router, Response } from "express";
import {
  authenticateToken,
  AuthenticatedRequest
} from "../modules/workflow/approval/serverAuthMiddleware";
import { FinopsException } from "../modules/runtime/FinopsException";
import { getAdminFirestore } from "../lib/firebaseAdmin";
import { ServerAttendanceService } from "../domains/attendance/ServerAttendanceService";

export const attendanceRouter = Router();

function mapAttendanceErrorStatus(code: string): number {
  if (code === "UNAUTHORIZED" || code === "UNAUTHENTICATED_ACTOR") {
    return 401;
  }
  if (code === "AUTH_VERIFICATION_UNAVAILABLE" || code === "PAYROLL_LOCK_CHECK_FAILED") {
    return 503;
  }
  if (
    code === "CROSS_TENANT_ATTENDANCE_DENIED" ||
    code === "FORBIDDEN_TENANT_CLAIM" ||
    code === "IDENTITY_SPOOFING_DETECTED" ||
    code === "ROLE_SPOOFING_DETECTED" ||
    code === "INACTIVE_ACTOR" ||
    code === "INVALID_OR_MISSING_ROLE" ||
    code === "FORBIDDEN_ATTENDANCE_ROLE" ||
    code === "TELLER_SELF_ATTENDANCE_ONLY" ||
    code === "SELF_ATTENDANCE_ONLY" ||
    code === "BRANCH_SCOPE_VIOLATION" ||
    code === "MISSING_BRANCH_SCOPE" ||
    code === "SUPERVISOR_SCOPE_VIOLATION" ||
    code === "SUPERVISOR_SCOPE_MISSING" ||
    code === "CANNOT_RECORD_HIGHER_PRIVILEGE_TARGET" ||
    code === "OVERRIDE_FORBIDDEN_FOR_ROLE" ||
    code === "DELETE_FORBIDDEN_FOR_ROLE" ||
    code === "ADJUSTMENT_APPROVAL_FORBIDDEN" ||
    code === "MAKER_CHECKER_VIOLATION" ||
    code === "INVALID_BADGE_SIGNATURE" ||
    code === "FORGED_BADGE_PAYLOAD" ||
    code === "BADGE_NOT_ACTIVE" ||
    code === "BADGE_EXPIRED"
  ) {
    return 403;
  }
  if (
    code === "TARGET_EMPLOYEE_NOT_FOUND" ||
    code === "SESSION_NOT_FOUND" ||
    code === "BADGE_NOT_FOUND" ||
    code === "ADJUSTMENT_NOT_FOUND"
  ) {
    return 404;
  }
  if (
    code === "ALREADY_CHECKED_IN" ||
    code === "SESSION_ALREADY_COMPLETED" ||
    code === "AMBIGUOUS_ACTIVE_BADGES" ||
    code === "ADJUSTMENT_ALREADY_PROCESSED" ||
    code === "IDEMPOTENCY_KEY_CONFLICT"
  ) {
    return 409;
  }
  if (code === "PAYROLL_PERIOD_LOCKED") {
    return 423;
  }
  if (
    code === "MISSING_TARGET_TENANT_CONTEXT" ||
    code === "TARGET_EMPLOYEE_INACTIVE" ||
    code === "INVALID_ATTENDANCE_DATE" ||
    code === "INVALID_CHECKOUT_TIME" ||
    code === "INVALID_ADJUSTMENT_HOURS" ||
    code === "INVALID_BULK_IMPORT" ||
    code === "INVALID_RECORD_IDS" ||
    code === "REASON_REQUIRED"
  ) {
    return 422;
  }
  return 400;
}

function handleAttendanceRouteError(res: Response, err: unknown): void {
  if (err instanceof FinopsException) {
    const status = mapAttendanceErrorStatus(err.code);
    res.status(status).json({
      success: false,
      error: err.code,
      code: err.code,
      message: err.message
    });
    return;
  }
  console.error("[AttendanceRoute] Unexpected error:", err);
  res.status(500).json({
    success: false,
    error: "INTERNAL_SERVER_ERROR",
    message: "Failed to process attendance request."
  });
}

attendanceRouter.post(
  "/check-in",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: "UNAUTHORIZED",
          message: "Authentication required."
        });
      }

      const body = req.body || {};
      if (typeof body.employeeId !== "string" || !body.employeeId.trim()) {
        return res.status(400).json({
          success: false,
          error: "INVALID_EMPLOYEE_ID",
          message: "employeeId is required."
        });
      }

      const adminDb = getAdminFirestore();
      const result = await ServerAttendanceService.checkInWithAdmin(adminDb, req.user, body);
      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (err) {
      handleAttendanceRouteError(res, err);
    }
  }
);

attendanceRouter.post(
  "/check-out",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: "UNAUTHORIZED",
          message: "Authentication required."
        });
      }

      const body = req.body || {};
      if (
        (typeof body.sessionId !== "string" || !body.sessionId.trim()) &&
        (typeof body.employeeId !== "string" || !body.employeeId.trim())
      ) {
        return res.status(400).json({
          success: false,
          error: "INVALID_SESSION_OR_EMPLOYEE",
          message: "sessionId or employeeId is required."
        });
      }

      const adminDb = getAdminFirestore();
      const result = await ServerAttendanceService.checkOutWithAdmin(adminDb, req.user, body);
      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (err) {
      handleAttendanceRouteError(res, err);
    }
  }
);

attendanceRouter.post(
  "/override",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: "UNAUTHORIZED",
          message: "Authentication required."
        });
      }

      const body = req.body || {};
      if (typeof body.employeeId !== "string" || !body.employeeId.trim()) {
        return res.status(400).json({
          success: false,
          error: "INVALID_EMPLOYEE_ID",
          message: "employeeId is required."
        });
      }

      const adminDb = getAdminFirestore();
      const result = await ServerAttendanceService.overrideAttendanceWithAdmin(
        adminDb,
        req.user,
        body
      );
      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (err) {
      handleAttendanceRouteError(res, err);
    }
  }
);

attendanceRouter.post(
  "/bulk-import",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: "UNAUTHORIZED",
          message: "Authentication required."
        });
      }

      const body = req.body || {};
      const adminDb = getAdminFirestore();
      const result = await ServerAttendanceService.bulkImportAttendanceWithAdmin(
        adminDb,
        req.user,
        body
      );
      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (err) {
      handleAttendanceRouteError(res, err);
    }
  }
);

attendanceRouter.post(
  "/delete",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: "UNAUTHORIZED",
          message: "Authentication required."
        });
      }

      const body = req.body || {};
      const adminDb = getAdminFirestore();
      const result = await ServerAttendanceService.deleteAttendanceWithAdmin(
        adminDb,
        req.user,
        body
      );
      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (err) {
      handleAttendanceRouteError(res, err);
    }
  }
);

attendanceRouter.post(
  "/adjustments",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: "UNAUTHORIZED",
          message: "Authentication required."
        });
      }

      const body = req.body || {};
      if (typeof body.employeeId !== "string" || !body.employeeId.trim()) {
        return res.status(400).json({
          success: false,
          error: "INVALID_EMPLOYEE_ID",
          message: "employeeId is required."
        });
      }

      const adminDb = getAdminFirestore();
      const result = await ServerAttendanceService.createAdjustmentRequestWithAdmin(
        adminDb,
        req.user,
        body
      );
      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (err) {
      handleAttendanceRouteError(res, err);
    }
  }
);

attendanceRouter.post(
  "/adjustments/approve",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: "UNAUTHORIZED",
          message: "Authentication required."
        });
      }

      const body = req.body || {};
      if (typeof body.requestId !== "string" || !body.requestId.trim()) {
        return res.status(400).json({
          success: false,
          error: "INVALID_REQUEST_ID",
          message: "requestId is required."
        });
      }

      const adminDb = getAdminFirestore();
      const result = await ServerAttendanceService.approveAdjustmentRequestWithAdmin(
        adminDb,
        req.user,
        body
      );
      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (err) {
      handleAttendanceRouteError(res, err);
    }
  }
);
