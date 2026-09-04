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

  constructor(message: string, context: ExceptionContext, originalError?: Error) {
    super(message);
    this.name = "FinopsException";
    this.context = context;
    this.originalError = originalError;
    
    // Ensure accurate stack trace in modern engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FinopsException);
    }
  }
}
