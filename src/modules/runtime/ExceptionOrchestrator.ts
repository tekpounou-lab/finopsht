// src/modules/runtime/ExceptionOrchestrator.ts

import { FinopsException, ExceptionContext } from "./FinopsException";
import { EventBus } from "./EventBus";
import { RuntimeEngine } from "./RuntimeEngine";
import { AuditService } from "../../services/audit/AuditService";

/**
 * Centered gateway for all system errors.
 * Ensures metadata is enriched, logs are secure, PII is masked, and critical events are forensically recorded.
 */
export class ExceptionOrchestrator {
  private static readonly PII_KEYS = ["ssn", "password", "salary", "bank_account", "tin", "address"];

  /**
   * Safe PII and Sensitive Data Redaction Utility
   */
  public static redactPII(payload: Record<string, any> | undefined): Record<string, any> {
    if (!payload) return {};
    
    try {
      const copy = JSON.parse(JSON.stringify(payload));
      
      const redact = (obj: any) => {
        if (!obj || typeof obj !== "object") return;
        
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            if (this.PII_KEYS.includes(key.toLowerCase())) {
              obj[key] = "[REDACTED]";
            } else if (typeof obj[key] === "object") {
              redact(obj[key]);
            }
          }
        }
      };
      
      redact(copy);
      return copy;
    } catch {
      return { _redacted_error: "Serialization failure during PII masking" };
    }
  }

  /**
   * Intercepts, structures, dispatches, and reports any caught exception.
   */
  public static handle(
    error: any,
    fallbackContext: Partial<ExceptionContext>
  ): FinopsException {
    let finopsError: FinopsException;

    const resolvedContext: ExceptionContext = {
      businessId: error?.context?.businessId || fallbackContext.businessId || "SYSTEM",
      actorId: error?.context?.actorId || fallbackContext.actorId || "SYSTEM",
      module: error?.context?.module || fallbackContext.module || "UNKNOWN",
      operation: error?.context?.operation || fallbackContext.operation || "UNKNOWN",
      correlationId: error?.context?.correlationId || fallbackContext.correlationId || `err_${Date.now()}`,
      severity: error?.context?.severity || fallbackContext.severity || "MEDIUM",
      errorCode: error?.context?.errorCode || fallbackContext.errorCode || "GENERIC_INTERNAL_ERROR"
    };

    if (error instanceof FinopsException) {
      finopsError = error;
    } else {
      const message = error instanceof Error ? error.message : String(error);
      finopsError = new FinopsException(
        message, 
        resolvedContext, 
        error instanceof Error ? error : undefined
      );
    }

    // Mask sensitive parameters to prevent PII leakage to public logs
    const safePayload = this.redactPII(finopsError.context);

    // 1. Publish error telemetry over EventBus for reactive real-time views
    EventBus.publish(EventBus.createEvent({
      correlationId: resolvedContext.correlationId,
      actorId: resolvedContext.actorId,
      businessId: resolvedContext.businessId,
      module: resolvedContext.module,
      aggregate: "ERROR",
      type: "RuntimeError",
      eventType: "EXCEPTION_LOGGED",
      source: resolvedContext.operation,
      payload: {
        message: finopsError.message,
        errorCode: resolvedContext.errorCode,
        severity: resolvedContext.severity,
        stack: finopsError.stack,
        context: safePayload
      }
    }));

    // 2. Report to primary runtime engine
    RuntimeEngine.reportError(
      resolvedContext.severity,
      `[${resolvedContext.errorCode}] [${resolvedContext.operation}]: ${finopsError.message}`,
      resolvedContext.module
    );

    // 3. For critical or high-severity errors, write to persistent audit vault
    if (resolvedContext.severity === "CRITICAL" || resolvedContext.severity === "HIGH") {
      this.persistCriticalException(finopsError);
    }

    return finopsError;
  }

  private static async persistCriticalException(error: FinopsException): Promise<void> {
    try {
      await AuditService.writeLog({
        timestamp: new Date().toISOString(),
        userId: error.context.actorId,
        business_id: error.context.businessId,
        action: `CRITICAL_EXCEPTION_${error.context.errorCode}`,
        module: error.context.module,
        operation: error.context.operation,
        severity: error.context.severity,
        message: error.message
      });
    } catch (e) {
      console.error("[ExceptionOrchestrator] Audit write fallback error:", e);
    }
  }
}
