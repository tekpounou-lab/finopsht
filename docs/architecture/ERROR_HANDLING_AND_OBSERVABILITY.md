# FINOPS ERP — Centralized Error Handling & Observability Specification

## Overview

In an enterprise-grade financial ERP, error handling is not just about logging messages; it is an active forensic and recovery system. Due to the high sensitivity of multi-tenant transactions and real-time ledger accounting, errors must be structured, typed, traceable, and secure.

This document specifies the **Enterprise Exception Model**, standard propagation channels, contextual tracing rules, and integration guidelines for our observability and alerting pipelines.

---

## 1. The Unified Exception Model: `FinopsException`

All custom and standard system failures must be caught, translated, and thrown as instances of `FinopsException`. This guarantees that every exception carries critical operational context—allowing administrators to instantly trace which tenant, user, system, and request caused the fault.

```
                           [ System Failure ]
                                   │
                                   ▼
                +------------------------------------+
                |        FinopsException             |
                +-----------------+------------------+
                                  |
                ┌─────────────────┼──────────────────┐
                ▼                 ▼                  ▼
          [ Forensic ]      [ Trace Context ]  [ Operational ]
          - Tenant ID       - Correlation ID   - Severity (HIGH, etc)
          - Auth User UID   - Causation ID     - Domain Module
          - SHA-256 Sig     - Source Module    - Semantic Error Code
```

### 1.1 `FinopsException` Type Schema

```typescript
export interface ExceptionContext {
  businessId: string;           // Active tenant context
  actorId: string;              // Firebase Auth User UID (Authenticated human)
  module: string;               // Domain module (e.g., "PAYROLL", "LEDGER")
  operation: string;            // Name of the throwing function/operation
  correlationId: string;        // Request tracking ID
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  errorCode: string;            // Standard alphanumeric error code (e.g., "LEDGER_UNBALANCED")
}
```

```typescript
export class FinopsException extends Error {
  public readonly context: ExceptionContext;
  public readonly originalError?: Error;

  constructor(message: string, context: ExceptionContext, originalError?: Error) {
    super(message);
    this.name = "FinopsException";
    this.context = context;
    this.originalError = originalError;
    
    // Ensure accurate stack trace in modern V8 runtimes
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FinopsException);
    }
  }
}
```

---

## 2. Standardized Error Code Registry

To prevent ambiguous "Something went wrong" messages and enable automated recovery, the platform maintains a typed registry of error codes:

| Error Code | Severity | Description | Actionable Resolution Strategy |
| :--- | :--- | :--- | :--- |
| `AUTH_SESSION_EXPIRED` | Low | Auth session expired | Redirect to login with state preserving |
| `RBAC_PERMISSION_DENIED`| High | User attempted unauthorized action | Flag Security Operations, trigger warning |
| `LEDGER_UNBALANCED` | High | General Ledger double-entry mismatch | Block transaction write, raise critical audit alert |
| `FORENSIC_INTEGRITY_VIOLATION` | Critical | Ledger block hash checksum mismatch | Freeze tenant database namespace, paging on-call |
| `OUTBOX_QUEUE_BLOCKED` | High | Transactional outbox failed to flush | Run immediate automated retries, alert team |
| `SNAPSHOT_MUTATION_ERR` | Medium | Pre-computed rollup mutation failed | Queue rebuild task, log degraded mode |

---

## 3. Propagation & Telemetry Routing Flow

When a `FinopsException` is thrown, the catching block or centralized middleware must route it through the `ExceptionOrchestrator`.

```
                    [ Catch FinopsException ]
                                │
                                ▼
               +----------------------------------+
               |      ExceptionOrchestrator       |
               +----------------+-----------------+
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
  [ EventBus.publish ]   [ Console Logger ]   [ Persistent Store ]
  Dispatches to UI       Styled diagnostic    Saves CRITICAL errors
  listeners              logs                 to `/forensic_vault`
```

### 3.1 Orchestration Handler
```typescript
export class ExceptionOrchestrator {
  /**
   * Translates any caught object into a typed FinopsException and publishes its diagnostic telemetry.
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
      finopsError = new FinopsException(message, resolvedContext, error instanceof Error ? error : undefined);
    }

    // 1. Emit to Local EventBus for immediate UI tracking & alerting
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
        stack: finopsError.stack
      }
    }));

    // 2. Report to centralized RuntimeEngine error logs
    RuntimeEngine.reportError(
      resolvedContext.severity,
      `[${resolvedContext.errorCode}] [${resolvedContext.operation}]: ${finopsError.message}`,
      resolvedContext.module
    );

    // 3. If critical, write to Forensic Audit logs collection for physical persistence
    if (resolvedContext.severity === "CRITICAL" || resolvedContext.severity === "HIGH") {
      this.persistForensicError(finopsError);
    }

    return finopsError;
  }

  private static async persistForensicError(error: FinopsException): Promise<void> {
    try {
      await forensicAuditVault.logSecurityEvent({
        businessId: error.context.businessId,
        actorId: error.context.actorId,
        action: "CRITICAL_EXCEPTION",
        resource: error.context.module,
        status: "FAILED",
        details: {
          message: error.message,
          errorCode: error.context.errorCode,
          operation: error.context.operation,
          stack: error.stack
        }
      });
    } catch (e) {
      console.error("[ExceptionOrchestrator] Failed to persist exception forensically:", e);
    }
  }
}
```

---

## 4. Multi-Tenant Safety & Data Redaction

Security guidelines require that no personal identifier data (PII) or tenant-sensitive parameters are leaked into telemetry logs.

1. **Parameter Stripping**: During `ExceptionOrchestrator.handle()`, payload values are serialized. Any object key matching standard PII targets (such as `ssn`, `password`, `bank_account`, `salary_amount`) is automatically replaced with `[REDACTED]`.
2. **Context Integrity Checks**: Exceptions occurring in tenant `A` must never contain or write tracing records into tenant `B`'s collection path. The orchestrator validates that `businessId` perfectly aligns with the authenticated session context.
