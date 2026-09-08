// src/modules/runtime/FinopsException.ts

export interface ExceptionContext {
  businessId: string;           // Active tenant context
  actorId: string;              // Firebase Auth User UID (Authenticated human)
  module: string;               // Domain module (e.g., "PAYROLL", "LEDGER", "WORKFORCE")
  operation: string;            // Name of the throwing function or action
  correlationId: string;        // Request tracking ID
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  errorCode: string;            // Standard alphanumeric error code
  [key: string]: any;           // Extensible metadata
}

/**
 * Enterprise Exception Class.
 * Enforces metadata structure to make debugging and security auditing highly traceable.
 */
export class FinopsException extends Error {
  public readonly context: ExceptionContext;
  public readonly originalError?: Error;
  public readonly code: string;

  constructor(
    messageOrCode: string,
    contextOrMessage?: ExceptionContext | Partial<ExceptionContext> | string,
    originalError?: Error
  ) {
    let resolvedMessage: string;
    let resolvedCode: string;
    let resolvedContext: ExceptionContext;

    if (typeof contextOrMessage === "string") {
      // Called as: new FinopsException("CYCLE_ALREADY_SEALED", "Ce cycle est déjà scellé.")
      resolvedCode = messageOrCode;
      resolvedMessage = contextOrMessage;
      resolvedContext = {
        businessId: "BIZ_MAIN",
        actorId: "SYSTEM",
        module: "PAYROLL",
        operation: "execute",
        correlationId: `corr_${Date.now()}`,
        severity: "HIGH",
        errorCode: resolvedCode,
      };
    } else {
      resolvedMessage = messageOrCode;
      resolvedCode = (contextOrMessage as any)?.errorCode || "FINOPS_ERROR";
      resolvedContext = {
        businessId: contextOrMessage?.businessId || "BIZ_MAIN",
        actorId: contextOrMessage?.actorId || "SYSTEM",
        module: contextOrMessage?.module || "PAYROLL",
        operation: contextOrMessage?.operation || "execute",
        correlationId: contextOrMessage?.correlationId || `corr_${Date.now()}`,
        severity: contextOrMessage?.severity || "HIGH",
        errorCode: resolvedCode,
        ...(contextOrMessage || {}),
      };
    }

    super(resolvedMessage);
    this.name = "FinopsException";
    this.code = resolvedCode;
    this.context = resolvedContext;
    this.originalError = originalError;
    
    // Ensure accurate stack trace in modern engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FinopsException);
    }
  }
}
