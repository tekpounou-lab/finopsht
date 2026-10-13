import { describe, it, expect } from "vitest";
import { StagingSchemaPilotEngine } from "../../../scripts/migrations/staging-schema-pilot";

describe("Phase 5C — Staging Schema Migration Pilot & Rollback Engine", () => {
  it("1. Creates snapshot and computes valid SHA256 hash", () => {
    const docs = {
      doc_1: { business_id: "biz_alpha", name: "Alpha Corp" },
      doc_2: { business_id: "biz_beta", name: "Beta LLC" }
    };
    const snap = StagingSchemaPilotEngine.createSnapshot("batch_001", "businesses", docs, "STAGING");

    expect(snap.batchId).toBe("batch_001");
    expect(snap.sha256Hash).toBeDefined();
    expect(snap.sha256Hash.length).toBe(64);
    expect(StagingSchemaPilotEngine.verifySnapshotIntegrity(snap)).toBe(true);
  });

  it("2. Detects snapshot hash tampering and aborts rollback", () => {
    const docs = { doc_1: { business_id: "biz_alpha" } };
    const snap = StagingSchemaPilotEngine.createSnapshot("batch_002", "businesses", docs, "STAGING");

    // Tamper payload after hash calculation
    snap.documents["doc_1"].business_id = "biz_TAMPERED";

    expect(StagingSchemaPilotEngine.verifySnapshotIntegrity(snap)).toBe(false);
    expect(() => StagingSchemaPilotEngine.restoreBackupSnapshot(snap, {})).toThrowError("INVALID_SHA256_HASH");
  });

  it("3. Performs exact snapshot restoration (Rollback)", () => {
    const originalDocs = {
      emp_100: { id: "emp_100", name: "Jean Baptiste", baseSalary: 25000 }
    };
    const snap = StagingSchemaPilotEngine.createSnapshot("batch_003", "employees", originalDocs, "STAGING");

    const modifiedDocs = {
      emp_100: { id: "emp_100", name: "Jean Baptiste", baseSalary: 30000 }
    };

    const { restoredDocs, restoredCount } = StagingSchemaPilotEngine.restoreBackupSnapshot(snap, modifiedDocs);
    expect(restoredCount).toBe(1);
    expect(restoredDocs.emp_100.baseSalary).toBe(25000);
  });

  it("4. Successfully migrates a batch of synthetic documents preserving historical fields", () => {
    const syntheticBatch: Record<string, Record<string, any>> = {};
    for (let i = 1; i <= 50; i++) {
      syntheticBatch[`doc_${i}`] = {
        id: `doc_${i}`,
        businessId: "biz_staging_alpha",
        cycleId: `cyc_${i}`,
        baseSalary: 15000,
        base_salary_cents: 1500000,
        legacyFieldToPreserve: `legacy_val_${i}`
      };
    }

    const res = StagingSchemaPilotEngine.runPilot("batch_50_pilot", "payroll_records", syntheticBatch, "STAGING");

    expect(res.success).toBe(true);
    expect(res.circuitBreakerTriggered).toBe(false);
    expect(res.auditTrail.length).toBe(50);
    expect(Object.keys(res.migratedDocs).length).toBe(50);
    expect(res.migratedDocs["doc_1"].legacyFieldToPreserve).toBe("legacy_val_1");
    expect(res.migratedDocs["doc_1"].schemaVersion).toBe(2);
    expect(res.migratedDocs["doc_1"].payroll_cycle_id).toBe("cyc_1");
  });

  it("5. Triggers Circuit Breaker on Tenant Mismatch and rolls back", () => {
    const docs = {
      doc_ok: { business_id: "biz_100", businessId: "biz_100" },
      doc_bad: { business_id: "biz_100", businessId: "biz_999" } // Mismatch!
    };

    const res = StagingSchemaPilotEngine.runPilot("batch_tenant_err", "employees", docs, "STAGING");

    expect(res.success).toBe(false);
    expect(res.circuitBreakerTriggered).toBe(true);
    expect(res.abortReason).toContain("CIRCUIT_BREAKER: Tenant ID mismatch");
    expect(res.quarantine.length).toBe(1);
    expect(res.quarantine[0].docId).toBe("doc_bad");
    // Restored to original
    expect(res.migratedDocs["doc_ok"].schemaVersion).toBeUndefined();
  });

  it("6. Triggers Circuit Breaker on Salary Factor-100 Mismatch and rolls back", () => {
    const docs = {
      emp_bad: { baseSalary: 25000, base_salary_cents: 25000 } // Error: 250 Gourdes vs 2,500,000 cents
    };

    const res = StagingSchemaPilotEngine.runPilot("batch_salary_err", "employees", docs, "STAGING");

    expect(res.success).toBe(false);
    expect(res.circuitBreakerTriggered).toBe(true);
    expect(res.abortReason).toContain("CIRCUIT_BREAKER: Salary factor-100 mismatch");
    expect(res.quarantine.length).toBe(1);
  });

  it("7. Triggers Circuit Breaker on Missing Ledger Currency and rolls back", () => {
    const docs = {
      tx_bad: { amount: 1000, amount_cents: 100000 } // Missing currency
    };

    const res = StagingSchemaPilotEngine.runPilot("batch_currency_err", "ledger_transactions", docs, "STAGING");

    expect(res.success).toBe(false);
    expect(res.circuitBreakerTriggered).toBe(true);
    expect(res.abortReason).toContain("CIRCUIT_BREAKER: Missing currency field");
  });

  it("8. Skips already migrated documents (Idempotency)", () => {
    const docs = {
      doc_already_migrated: { business_id: "biz_100", businessId: "biz_100", schemaVersion: 2 }
    };

    const res = StagingSchemaPilotEngine.runPilot("batch_idempotent", "employees", docs, "STAGING");

    expect(res.success).toBe(true);
    expect(res.auditTrail[0].status).toBe("VALIDATED");
    expect(res.auditTrail[0].reason).toContain("Idempotent skip");
  });

  it("9. Enforces maximum batch size limit of 50", () => {
    const hugeBatch: Record<string, Record<string, any>> = {};
    for (let i = 1; i <= 51; i++) {
      hugeBatch[`doc_${i}`] = { id: `doc_${i}` };
    }

    expect(() => StagingSchemaPilotEngine.runPilot("batch_huge", "employees", hugeBatch, "STAGING")).toThrowError(
      "BATCH_SIZE_EXCEEDED"
    );
  });
});
