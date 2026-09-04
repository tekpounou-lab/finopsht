# FINOPS ERP — Site Reliability Engineering (SRE) Disaster Recovery Playbook

**Status**: Active — Enterprise SRE Reference  
**Classification**: Internal / Confidential SRE Operations  
**Platform**: Firebase (Firestore) + React + Cloud Run  
**Target RTO**: < 15 Minutes  
**Target RPO**: < 1 Minute (Zero Data Loss using Transactional Outbox & Event Playback)

---

## Executive Summary & System Resilience

In an enterprise-grade financial ERP platform, data integrity and recoverability are paramount. FINOPS ERP is engineered with a **Persistence-First, Event-Driven** design. In the event of catastrophic data corruption, multi-tenant database split-brain, or accidental administrative deletion, Site Reliability Engineers (SREs) can reconstruct a tenant's complete state back to any specific millisecond or historical date $T$.

This document outlines the step-by-step restoration pipeline, utilizing the **SnapshotEngine**, the **Transactional Outbox Event Ledger**, the **Currency & Exchange Rate Engine (CERE)**, and the **Forensic Audit Signature Vault**.

---

## 1. The Recovery Blueprint

To restore a tenant (`businessId`) to a target timestamp $T_{\text{target}}$:

```
                  [ Catastrophic Event at T_event ]
                                 │
                                 ▼
                     [ 1. SRE Freeze Active UI ]
                                 │
                                 ▼
                 [ 2. Retrieve Configuration Snapshot ]
                   - Get closest BusinessSnapshot <= T_target
                                 │
                                 ▼
                   [ 3. Replay Historical Events ]
                   - Scan event_outbox from T_snapshot to T_target
                                 │
                                 ▼
                 [ 4. Resolve Point-in-Time Rates ]
                   - Look up BRH/Admin Exchange Rates @ Date(T)
                   - Enforce statutory tax rules (ONA 6%, OFATMA 2%)
                                 │
                                 ▼
                    [ 5. Recalculate State Snapshots ]
                   - Re-run Performance & Ledger aggregations
                                 │
                                 ▼
                 [ 6. Seal and Verify Forensic Vault ]
                   - Validate SHA-256 Ledger signature chains
```

---

## 2. Step-by-Step Restoration Runbook

### Step 1: Emergency Quarantine & Freeze
Before starting the state reconstruction, the affected tenant's workspace must be locked to prevent concurrent writes.
1. Set the tenant's license status to `LOCKED` in `/businesses/{businessId}`.
2. The `FeatureResolver` and `PermissionService` will immediately deny access, rendering the React workspace read-only for all employee accounts.

### Step 2: Extract Nearest Configuration Snapshot
Configuration snapshots (`BusinessSnapshot`) preserve the physical hierarchy of the business (branches, departments, roles, feature flags).
- Locate the target configuration snapshot in `/business_snapshots/{businessId}`.
- If the current active snapshot is corrupted or represents a post-disaster state, query the historical archive from `/businesses/{businessId}/snapshots_history` representing the latest valid configuration before or at $T_{\text{target}}$.
- Restore the values of `Business`, `Branch[]`, `Department[]`, and `Role[]` to their state at $T_{\text{target}}$.

### Step 3: Outbox Event Playback (State Reconstitution)
Every state mutation (timecards, transactions, transfers) is atomically captured in the `/businesses/{businessId}/event_outbox` subcollection via the `persistAndPublishWithTransaction` API. 
- SREs execute the `EventLogPlaybackJob` with parameters `(businessId, startTimestamp, endTimestamp)`.
- The playback engine reads events ordered by `timestamp` ascending:
  ```typescript
  const q = query(
    collection(db, "businesses", businessId, "event_outbox"),
    where("timestamp", ">=", T_snapshot),
    where("timestamp", "<=", T_target),
    orderBy("timestamp", "asc")
  );
  ```
- Events are dispatched to their respective domain handlers (e.g., `PayrollCalculationEngine`, `AccountingLedgerService`) to progressively update standard tables.

### Step 4: Resolve Point-in-Time Currency and Tax Rates
During event playback, historical currency rates and tax schedules must be dynamically resolved to maintain absolute compliance.

#### 4.1 Exchange Rate Historical Lookup
For any transaction occurring at $T$, standard spot rates cannot be used. The SRE recovery engine queries the `CurrencyRateRepository`:
- Query path: `/businesses/{businessId}/exchange_rates`
- ID resolution: `{fromCurrency}_{toCurrency}_{YYYY-MM-DD}`
- If no tenant-specific override exists for that date, resolve the default BRH rate via the `"SYSTEM"` tenant partition.
- Apply the point-in-time conversion:
  $$\text{Value}_{\text{HTG}}(T) = \text{Value}_{\text{USD}} \times \text{ExchangeRate}(T)$$

#### 4.2 Point-in-Time Tax Schedule Enforcement
Ensure statutory formulas are computed exactly as specified under government rules for the reconstructed cycle:
- **ONA Withholding**: Gross $\times$ 0.06 (both Employee and Employer portions).
- **OFATMA Withholding**: Gross $\times$ 0.02 (Employee) and Gross $\times$ 0.03 (Employer).
- **Survival Floor Validation**: If Gross $\ge$ 15,000 HTG, ensure the resulting net pay for any reconstructed payroll record does not fall below the 15,000 HTG survival floor threshold.

---

## 3. Performance & Aggregation Snapshot Rebuilding

Once raw transaction logs are restored and validated, SREs trigger a full snapshot rebuild using the `SnapshotEngine`:

```typescript
import { SnapshotEngine } from "../../services/business/snapshot/SnapshotEngine";
import { ObservabilityService } from "../../services/observability/ObservabilityService";

export class SREBackupRecoveryService {
  /**
   * Rebuilds all time-bucketed performance and configuration snapshots for a business.
   */
  public static async rebuildWorkspaceSnapshots(businessId: string): Promise<boolean> {
    console.log(`[SRE_DR] Commencing snapshot rebuild for tenant: ${businessId}`);
    
    try {
      // 1. Rebuild primary workspace configuration snapshot
      await SnapshotEngine.rebuildWorkspaceConfig(businessId);
      
      // 2. Re-trigger metrics scanning and register recovery audit logging
      await ObservabilityService.scanSystemMetrics(businessId);
      
      console.log(`[SRE_DR] Snapshot reconstruction completed successfully.`);
      return true;
    } catch (err) {
      console.error(`[SRE_DR] Snapshot rebuilding failed:`, err);
      return false;
    }
  }
}
```

This updates:
1. `/business_snapshots/{businessId}` for sub-100ms UI workspace loads.
2. Time-bucketed performance summaries (daily, weekly, monthly charts).

---

## 4. Forensic Signatures Verification & Reconciliation

Reconstructed financial ledgers must be validated to guarantee that they are forensic-grade and tamper-free.

1. **Verify Ledger Balance**: For every journal entry posted during recovery, the sum of debits must mathematically equal the sum of credits:
   $$\sum \text{Debits} = \sum \text{Credits}$$
2. **Forensic Cryptographic Signature Chain**: Re-verify SHA-256 signatures stored in the `/businesses/{businessId}/forensic_logs` or audit vaults.
3. **Outbox Idempotency Validation**: Double-check that all replayed events correspond to unique IDs and that no duplicate transactions were committed. The SRE must audit `duplicate_events_prevented` metric trends via the **Outbox Metrics Dashboard** inside the Admin Platform.

---

## 5. Emergency Rollback Recovery Checklists

### SRE Pre-flight Checklist
- [ ] Confirm `LOCKED` state is active on the tenant.
- [ ] Take a manual backup snapshot of the current state (post-corruption database dump).
- [ ] Retrieve SRE authentication credentials with `SUPER_ADMIN` authorization.

### SRE Execution Checklist
- [ ] Restore closest valid configuration snapshot.
- [ ] Run `EventLogPlaybackJob` up to $T_{\text{target}}$.
- [ ] Verify `CurrencyRateRepository` has resolved the historical rates for the recovery window.
- [ ] Execute `SREBackupRecoveryService.rebuildWorkspaceSnapshots()`.
- [ ] Execute double-entry balance check and SHA-256 seal verification.

### SRE Post-flight Checklist
- [ ] Set tenant license status back to `ACTIVE`.
- [ ] Send service restoration notification to the tenant SRE liaison.
- [ ] File an incident report detailing Root Cause Analysis (RCA) and recovery metrics.
