import crypto from "crypto";
import { PayrollSourceSnapshot } from "./types";

export class ApprovalHashingService {
  /**
   * Generates a deterministic mutex lock ID for an active entity approval.
   * Lock ID = "lock_" + SHA256(business_id + "_PAYROLL_" + cycleId).substring(0, 24)
   */
  public static computeLockId(businessId: string, entityType: "PAYROLL", entityId: string): string {
    const raw = `${businessId}_${entityType}_${entityId}`;
    const hash = crypto.createHash("sha256").update(raw, "utf8").digest("hex");
    return `lock_${hash.substring(0, 24)}`;
  }

  /**
   * Generates a deterministic idempotency key for financial execution.
   * idempotencyKey = "tx_exec_" + SHA256(business_id + "|" + instanceId + "|" + cycleId + "|" + sourceHash).substring(0, 20)
   */
  public static computeIdempotencyKey(
    businessId: string,
    instanceId: string,
    cycleId: string,
    sourceHash: string
  ): string {
    const raw = `${businessId}|${instanceId}|${cycleId}|${sourceHash}`;
    const hash = crypto.createHash("sha256").update(raw, "utf8").digest("hex");
    return `tx_exec_${hash.substring(0, 20)}`;
  }

  /**
   * Computes the cryptographic payload fingerprint (sourceHash) for a payroll cycle.
   * Enforces canonical serialization with deterministically ordered employees by ID.
   */
  public static computePayrollSourceHash(snapshot: PayrollSourceSnapshot): string {
    // Sort employees deterministically by employeeId
    const sortedEmployees = [...(snapshot.employees || [])].sort((a, b) =>
      a.employeeId.localeCompare(b.employeeId)
    );

    const canonicalObject = {
      business_id: snapshot.business_id,
      cycleId: snapshot.cycleId,
      currency: snapshot.currency,
      effectiveAccountingDate: snapshot.effectiveAccountingDate,
      totalGrossCents: Math.round(snapshot.totalGrossCents || 0),
      totalNetCents: Math.round(snapshot.totalNetCents || 0),
      totalEmployerDeductionsCents: Math.round(snapshot.totalEmployerDeductionsCents || 0),
      employees: sortedEmployees.map((e) => ({
        employeeId: e.employeeId,
        grossCents: Math.round(e.grossCents || 0),
        netCents: Math.round(e.netCents || 0),
        employerTaxesCents: Math.round(e.employerTaxesCents || 0),
        employeeDeductionsCents: Math.round(e.employeeDeductionsCents || 0),
        advancesCents: Math.round(e.advancesCents || 0)
      }))
    };

    const canonicalJson = JSON.stringify(canonicalObject);
    return crypto.createHash("sha256").update(canonicalJson, "utf8").digest("hex");
  }

  /**
   * Derives monotonic sourceVersion for a payroll cycle.
   * sourceVersion = cycle.status + "_" + cycle.calculated_at
   */
  public static computePayrollSourceVersion(status: string, calculatedAt: string): string {
    return `${status}_${calculatedAt}`;
  }
}
