// src/tests/runtime/ExceptionOrchestrator.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FinopsException } from "../../modules/runtime/FinopsException";
import { ExceptionOrchestrator } from "../../modules/runtime/ExceptionOrchestrator";
import { EventBus } from "../../modules/runtime/EventBus";
import { AuditService } from "../../services/audit/AuditService";

// Mock Firebase & Audit Service
vi.mock("../../services/audit/AuditService", () => {
  return {
    AuditService: {
      writeLog: vi.fn(async () => {})
    }
  };
});

describe("ExceptionOrchestrator Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should correctly structure FinopsExceptions and enrich context", () => {
    const errorMsg = "The ledger balance is inconsistent.";
    const context = {
      businessId: "biz_99",
      actorId: "usr_auth_abc",
      module: "LEDGER",
      operation: "commitTransaction",
      correlationId: "cor_test_123",
      severity: "HIGH" as const,
      errorCode: "LEDGER_UNBALANCED"
    };

    const exception = new FinopsException(errorMsg, context);
    expect(exception.message).toBe(errorMsg);
    expect(exception.context.businessId).toBe("biz_99");
    expect(exception.context.severity).toBe("HIGH");
  });

  it("should automatically redact sensitive PII parameters", () => {
    const dirtyPayload = {
      user: "Alice",
      ssn: "123-45-678",
      salary: 50000,
      bank_account: "ACT-9992",
      address: {
        street: "123 Main St",
        zip: "90210"
      },
      settings: {
        theme: "light"
      }
    };

    const redacted = ExceptionOrchestrator.redactPII(dirtyPayload);

    expect(redacted.user).toBe("Alice");
    expect(redacted.ssn).toBe("[REDACTED]");
    expect(redacted.salary).toBe("[REDACTED]");
    expect(redacted.bank_account).toBe("[REDACTED]");
    expect(redacted.address).toBe("[REDACTED]"); // Nested object redaction or standard root redaction
    expect(redacted.settings.theme).toBe("light");
  });

  it("should log telemetry to EventBus and persist high/critical errors via AuditService", async () => {
    const rawError = new Error("General system fault");
    const fallback = {
      businessId: "biz_tenant_alpha",
      actorId: "usr_jane_doe",
      module: "PAYROLL",
      operation: "calculateONA",
      severity: "CRITICAL" as const,
      errorCode: "PAYROLL_TAX_CALC_FAILED"
    };

    const publishSpy = vi.spyOn(EventBus, "publish");

    const resolvedException = ExceptionOrchestrator.handle(rawError, fallback);

    expect(resolvedException).toBeInstanceOf(FinopsException);
    expect(resolvedException.message).toBe("General system fault");
    expect(resolvedException.context.errorCode).toBe("PAYROLL_TAX_CALC_FAILED");

    // EventBus check
    expect(publishSpy).toHaveBeenCalled();

    // Forensic persistence check
    expect(AuditService.writeLog).toHaveBeenCalledTimes(1);
    expect(AuditService.writeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        business_id: "biz_tenant_alpha",
        action: "CRITICAL_EXCEPTION_PAYROLL_TAX_CALC_FAILED",
        severity: "CRITICAL"
      })
    );
  });
});
