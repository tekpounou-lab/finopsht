# FINOPS ERP — Enterprise Snapshot Engine Specification

## Overview

FINOPS ERP relies on pre-computed snapshots to deliver sub-100ms dashboard speeds and instant workspace boot-ups. By calculating metrics asynchronously and caching configurations, the system eliminates expensive, real-time collection scanning on Firestore, providing zero-compute queries.

This document defines the snapshot categories, their schemas, frequency, storage structures, and retention policies.

---

## 1. Snapshot Ecosystem Classification

The platform manages three distinct categories of snapshots:

```
                          [ Raw System Data ]
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  Configuration   │      │   Performance    │      │   Payroll Run    │
│  Workspace Boot  │      │  Multi-Period    │      │ Fiscal Freeze    │
└────────┬─────────┘      └────────┬─────────┘      └────────┬─────────┘
         │                         │                         │
         ▼                         ▼                         ▼
/business_snapshots       /employee_performance     /payroll_records
Fast startup cache        /department_performance   Immutable audits
```

### 1.1 Category A: Configuration Snapshots (`BusinessSnapshot`)
Aggregates the physical structure and settings of a business. Used to boot the React workspace instantly without querying 6 separate collections.
- **Scope**: Tenant-wide configurations.
- **Frequency**: On-demand (whenever organization structures, settings, or feature flags update).

### 1.2 Category B: Performance Snapshots (Operational & Financial KPIs)
Aggregates transactional and operational logs (sales, commissions, ledger entries, attendance clocks) into time-bucketed performance summaries.
- **Scope**: Employee, Department, Branch, and Business aggregations.
- **Frequency**: Nightly batch runs (01:00 UTC) and on-demand administrative triggers (e.g., following a bulk data import).

### 1.3 Category C: Payroll Run Snapshots (`EmployeeSalesSummary` & `EmployeeAttendanceSnapshot`)
Captures and freezes performance variables specifically for a given payroll cycle. Once a cycle is locked or sealed, these snapshots are permanent and legally binding.
- **Scope**: Employee payroll parameters (hours worked, missing hours, penalties, commissions).
- **Frequency**: End-of-cycle payroll calculation execution.

---

## 2. Production Database Collections & TTL Storage

To prevent infinite database expansion and control storage costs, FINOPS ERP enforces strict **Time-To-Live (TTL)** rotation policies. Since Firestore supports automatic document deletion via a timestamp field, every rotation-eligible snapshot contains an `expiresAt` field.

| Snapshot Type | Collection Path | Retention (TTL) | Expiration Logic (`expiresAt`) |
| :--- | :--- | :--- | :--- |
| **Workspace Config** | `/business_snapshots/{businessId}` | Permanent | Never expires (single doc overwritten) |
| **Daily Performance** | `/businesses/{businessId}/employee_performance_snapshots` | 90 Days | `generatedAt + 90 days` |
| **Weekly Performance** | `/businesses/{businessId}/employee_performance_snapshots` | 365 Days | `generatedAt + 365 days` |
| **Monthly Performance** | `/businesses/{businessId}/employee_performance_snapshots` | Permanent | Never expires (Fiscal Archive) |
| **Quarterly Performance**| `/businesses/{businessId}/employee_performance_snapshots` | Permanent | Never expires (Fiscal Archive) |
| **Yearly Performance** | `/businesses/{businessId}/employee_performance_snapshots` | Permanent | Never expires (Fiscal Archive) |
| **Payroll Runs** | `/businesses/{businessId}/payroll_records` | Permanent | Never expires (Legal Audit Trail) |

---

## 3. High-Fidelity Schema Definitions

### 3.1 Expiration Metadata Wrapper
Every rotation-eligible snapshot must include the `expiresAt` field mapped to a Firestore TTL index:

```typescript
export interface SnapshotExpiryMetadata {
  generatedAt: string;          // ISO-8601 creation timestamp
  expiresAt: string | null;     // ISO-8601 expiration target (null if permanent)
  isPermanent: boolean;         // Safety flag for analytical archives
}
```

### 3.2 Workspace Configuration Snapshot
Stored at the top-level `/business_snapshots/{businessId}` document.

```typescript
export interface BusinessSnapshot {
  id: string;                   // Matches businessId
  business: Business;           // Business registration master
  branches: Branch[];           // Physical branches
  departments: Department[];   // Home and Operational departments
  roles: Role[];               // Custom security roles
  permissions: Permission[];   // Unified RBAC permission rules
  featureFlags: Record<string, boolean>; // Tenant entitlements
  subscription: Subscription;   // Billing plan details
  timestamp: string;            // Sync date
  version: number;              // Milliseconds sequence tracker
}
```

---

## 4. Automatic Rotation & TTL Implementation

### 4.1 Firestore native TTL
To enable Firestore's native TTL:
1. Ensure the Google Cloud Console has Firestore TTL enabled.
2. Direct the TTL index to point to the `expiresAt` field inside snapshot collections.
3. The GCP background service automatically deletes documents whose `expiresAt` timestamp is in the past.

### 4.2 Client-Side Purging (Fallback)
If native cloud TTL is pending, administrative jobs or workspace boots can trigger a client-side cleanup for local collections.

```typescript
import { db } from "../../lib/firebase";
import { collection, query, where, getDocs, writeBatch, doc } from "firebase/firestore";

export class SnapshotRetentionManager {
  /**
   * Scrapes old daily/weekly snapshots that have exceeded their expiration thresholds.
   */
  public static async executeCleanup(businessId: string): Promise<number> {
    const nowIso = new Date().toISOString();
    const batch = writeBatch(db);
    let deletedCount = 0;

    // Daily snapshots filter
    const collectionsToClean = [
      "employee_performance_snapshots",
      "department_performance_snapshots",
      "branch_performance_snapshots"
    ];

    for (const collName of collectionsToClean) {
      const q = query(
        collection(db, collName),
        where("business_id", "==", businessId),
        where("expiresAt", "<=", nowIso)
      );

      const snap = await getDocs(q);
      snap.docs.forEach((doc) => {
        batch.delete(doc.ref);
        deletedCount++;
      });
    }

    if (deletedCount > 0) {
      await batch.commit();
      console.log(`[SnapshotRetentionManager] Successfully purged ${deletedCount} expired snapshots.`);
    }

    return deletedCount;
  }
}
```

---

## 5. Incremental Synchronization Flow

To keep performance snapshots accurate with minimal compute lag, a **reactive accumulation pipeline** is established:

```
[ Raw Mutation: e.g. New Transaction ]
                  │
                  ▼
[ EventBus.publish("TRANSACTION_COMMITTED") ]
                  │
                  ▼
[ Background Snapshot Rebuild Scheduler ]
  - Invalidates local sessionStorage metrics cache
  - Schedules partial segment rebuild (Debounced by 30 seconds)
  - Invokes `SnapshotRebuildService.rebuildAllSnapshots()`
```

This guarantees that while standard cron jobs calculate official snapshots overnight, active client sessions receive real-time, high-fidelity updates without manual refreshes.
