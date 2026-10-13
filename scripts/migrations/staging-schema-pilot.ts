/**
 * FINOPS ERP / FINAYITI FUSION — PHASE 5C
 * STAGING SCHEMA MIGRATION PILOT & ROLLBACK ENGINE
 * 
 * ENVIRONMENT SAFETY:
 * - Operates strictly on isolated Staging / Test fixtures or Staging Firestore namespace.
 * - Enforces pre-migration JSON snapshot exports with SHA256 cryptographic verification.
 * - Circuit breaker halts execution on 0.01% error or schema anomaly.
 * - Quarantine queue records conflicts without destroying source records.
 * - Zero field deletions. All historical fields are preserved.
 */

import { createHash } from "crypto";

export type StagingDocumentStatus = 
  | "PENDING"
  | "VALIDATED"
  | "MIGRATED_SUCCESS"
  | "QUARANTINED"
  | "ROLLED_BACK"
  | "ABORTED_CIRCUIT_BREAKER";

export interface StagingSnapshot {
  batchId: string;
  collection: string;
  environment: "STAGING" | "TEST_FIXTURE";
  createdAt: string;
  documents: Record<string, Record<string, any>>;
  sha256Hash: string;
}

export interface StagingPilotRecord {
  batchId: string;
  docId: string;
  collection: string;
  environment: "STAGING" | "TEST_FIXTURE";
  beforeState: Record<string, any>;
  proposedState: Record<string, any>;
  afterState: Record<string, any>;
  status: StagingDocumentStatus;
  reason?: string;
  timestamp: string;
}

export interface QuarantineRecord {
  docId: string;
  collection: string;
  businessId: string;
  reason: string;
  sourceDocSnapshot: Record<string, any>;
  quarantinedAt: string;
}

export class StagingSchemaPilotEngine {
  private static MAX_BATCH_SIZE = 50;

  /**
   * Calculates SHA256 hash for a given object payload with deep key sorting.
   */
  static computeSha256(data: any): string {
    const deepSort = (obj: any): any => {
      if (obj === null || typeof obj !== "object") return obj;
      if (Array.isArray(obj)) return obj.map(deepSort);
      const sorted: Record<string, any> = {};
      for (const key of Object.keys(obj).sort()) {
        sorted[key] = deepSort(obj[key]);
      }
      return sorted;
    };
    const jsonStr = JSON.stringify(deepSort(data));
    return createHash("sha256").update(jsonStr).digest("hex");
  }

  /**
   * Creates an isolated pre-migration snapshot with SHA256 hash.
   */
  static createSnapshot(
    batchId: string,
    collection: string,
    documents: Record<string, Record<string, any>>,
    environment: "STAGING" | "TEST_FIXTURE" = "STAGING"
  ): StagingSnapshot {
    const docsCopy = JSON.parse(JSON.stringify(documents));
    const rawSnapshot = {
      batchId,
      collection,
      environment,
      createdAt: new Date().toISOString(),
      documents: docsCopy
    };
    const sha256Hash = this.computeSha256(rawSnapshot.documents);

    return {
      ...rawSnapshot,
      sha256Hash
    };
  }

  /**
   * Verifies SHA256 hash integrity of a snapshot.
   */
  static verifySnapshotIntegrity(snapshot: StagingSnapshot): boolean {
    const computedHash = this.computeSha256(snapshot.documents);
    return computedHash === snapshot.sha256Hash;
  }

  /**
   * Restores original state from snapshot (Rollback Protocol).
   */
  static restoreBackupSnapshot(
    snapshot: StagingSnapshot,
    currentDocs: Record<string, Record<string, any>>
  ): { restoredDocs: Record<string, Record<string, any>>; restoredCount: number } {
    if (!this.verifySnapshotIntegrity(snapshot)) {
      throw new Error("INVALID_SHA256_HASH: Snapshot integrity check failed. Rollback aborted to prevent corruption.");
    }

    const restoredDocs = JSON.parse(JSON.stringify(currentDocs));
    let restoredCount = 0;

    for (const [docId, originalDoc] of Object.entries(snapshot.documents)) {
      restoredDocs[docId] = JSON.parse(JSON.stringify(originalDoc));
      restoredCount++;
    }

    return { restoredDocs, restoredCount };
  }

  /**
   * Runs the controlled 50-document pilot migration on synthetic staging documents.
   */
  static runPilot(
    batchId: string,
    collection: string,
    syntheticDocs: Record<string, Record<string, any>>,
    environment: "STAGING" | "TEST_FIXTURE" = "STAGING"
  ): {
    success: boolean;
    snapshot: StagingSnapshot;
    migratedDocs: Record<string, Record<string, any>>;
    auditTrail: StagingPilotRecord[];
    quarantine: QuarantineRecord[];
    circuitBreakerTriggered: boolean;
    abortReason?: string;
  } {
    const docKeys = Object.keys(syntheticDocs);
    if (docKeys.length > this.MAX_BATCH_SIZE) {
      throw new Error(`BATCH_SIZE_EXCEEDED: Staging pilot batch size ${docKeys.length} exceeds maximum limit of ${this.MAX_BATCH_SIZE}.`);
    }

    // 1. Create Pre-Migration Snapshot
    const snapshot = this.createSnapshot(batchId, collection, syntheticDocs, environment);
    
    const migratedDocs = JSON.parse(JSON.stringify(syntheticDocs));
    const auditTrail: StagingPilotRecord[] = [];
    const quarantine: QuarantineRecord[] = [];

    let circuitBreakerTriggered = false;
    let abortReason: string | undefined;

    const isoNow = new Date().toISOString();

    for (const docId of docKeys) {
      const raw = migratedDocs[docId];
      const beforeState = JSON.parse(JSON.stringify(raw));

      // Check Idempotency: skip if already migrated
      if (raw.schemaVersion && raw.schemaVersion >= 2) {
        auditTrail.push({
          batchId,
          docId,
          collection,
          environment,
          beforeState,
          proposedState: beforeState,
          afterState: beforeState,
          status: "VALIDATED",
          reason: "Idempotent skip: Document already at schemaVersion >= 2.",
          timestamp: isoNow
        });
        continue;
      }

      // CIRCUIT BREAKER CHECKS:

      // Check 1: Tenant Mismatch
      if (raw.business_id && raw.businessId && raw.business_id !== raw.businessId) {
        circuitBreakerTriggered = true;
        abortReason = `CIRCUIT_BREAKER: Tenant ID mismatch in doc '${docId}' (business_id='${raw.business_id}' vs businessId='${raw.businessId}').`;
      }

      // Check 2: Salary Factor-100 Discrepancy
      if (!circuitBreakerTriggered && raw.baseSalary !== undefined && raw.base_salary_cents !== undefined) {
        const expectedCents = Math.round(raw.baseSalary * 100);
        if (expectedCents !== raw.base_salary_cents) {
          circuitBreakerTriggered = true;
          abortReason = `CIRCUIT_BREAKER: Salary factor-100 mismatch in doc '${docId}' (baseSalary=${raw.baseSalary} vs base_salary_cents=${raw.base_salary_cents}).`;
        }
      }

      // Check 3: Missing Currency in Ledger Transaction
      if (!circuitBreakerTriggered && collection === "ledger_transactions" && !raw.currency) {
        circuitBreakerTriggered = true;
        abortReason = `CIRCUIT_BREAKER: Missing currency field in ledger transaction doc '${docId}'.`;
      }

      if (circuitBreakerTriggered) {
        // Quarantine conflicted document without deleting original
        quarantine.push({
          docId,
          collection,
          businessId: raw.business_id || raw.businessId || "UNKNOWN",
          reason: abortReason || "Circuit breaker trigger",
          sourceDocSnapshot: beforeState,
          quarantinedAt: isoNow
        });

        auditTrail.push({
          batchId,
          docId,
          collection,
          environment,
          beforeState,
          proposedState: beforeState,
          afterState: beforeState,
          status: "ABORTED_CIRCUIT_BREAKER",
          reason: abortReason,
          timestamp: isoNow
        });

        break; // Stop batch immediately upon circuit breaker trigger
      }

      // Perform Safe Canonical Transformation (Preserving ALL historical fields)
      const proposedState = JSON.parse(JSON.stringify(beforeState));
      proposedState.schemaVersion = 2;
      proposedState.business_id = raw.business_id || raw.businessId || "";
      proposedState.businessId = proposedState.business_id;

      if (collection === "payroll_records" && raw.cycleId) {
        proposedState.payroll_cycle_id = raw.cycleId; // Dual-write
      }

      if (collection === "ledger_transactions" && raw.amount !== undefined) {
        proposedState.amount_cents = raw.amount_cents ?? Math.round(raw.amount * 100);
      }

      migratedDocs[docId] = proposedState;

      auditTrail.push({
        batchId,
        docId,
        collection,
        environment,
        beforeState,
        proposedState,
        afterState: proposedState,
        status: "MIGRATED_SUCCESS",
        reason: "Canonical normalization applied safely with historical field preservation.",
        timestamp: isoNow
      });
    }

    if (circuitBreakerTriggered) {
      // Automatic Rollback of current batch upon Circuit Breaker Trigger
      const { restoredDocs } = this.restoreBackupSnapshot(snapshot, syntheticDocs);
      return {
        success: false,
        snapshot,
        migratedDocs: restoredDocs,
        auditTrail,
        quarantine,
        circuitBreakerTriggered: true,
        abortReason
      };
    }

    // Verify Document Count Match
    const beforeCount = Object.keys(syntheticDocs).length;
    const afterCount = Object.keys(migratedDocs).length;

    if (beforeCount !== afterCount) {
      const { restoredDocs } = this.restoreBackupSnapshot(snapshot, syntheticDocs);
      return {
        success: false,
        snapshot,
        migratedDocs: restoredDocs,
        auditTrail,
        quarantine,
        circuitBreakerTriggered: true,
        abortReason: `CIRCUIT_BREAKER: Document count mismatch (before: ${beforeCount}, after: ${afterCount}). Batch rolled back.`
      };
    }

    return {
      success: true,
      snapshot,
      migratedDocs,
      auditTrail,
      quarantine,
      circuitBreakerTriggered: false
    };
  }
}
