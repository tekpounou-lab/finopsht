# FINOPS ERP — Firestore Database Architecture

## Overview

FINOPS ERP uses Cloud Firestore as its primary persistent database. The database layout is strictly multi-tenant, structured around top-level tenant collections and scoped subcollections.

---

## 1. Top-Level Collection Schema

```
/businesses/{businessId}
  ├── /employees/{employeeId}
  ├── /payroll_cycles/{cycleId}
  │     └── /payslips/{payslipId}
  ├── /ledger_transactions/{txId}
  ├── /attendances/{attendanceId}
  ├── /leaves/{leaveId}
  ├── /forensic_logs/{logId}
  ├── /settings/tax_config
  └── /settings/features
```

---

## 2. Key Collections & Schema Summary

### 2.1 `/businesses/{businessId}`
- **Document ID**: `businessId`
- **Fields**: `name`, `taxId`, `plan`, `licensingStatus`, `createdAt`, `updatedAt`

### 2.2 `/businesses/{businessId}/employees/{employeeId}`
- **Document ID**: `employeeId`
- **Fields**: `firstName`, `lastName`, `email`, `departmentId`, `baseSalaryHTG`, `status`, `cnssNumber`

### 2.3 `/businesses/{businessId}/payroll_cycles/{cycleId}`
- **Document ID**: `cycleId`
- **Fields**: `periodKey` (e.g. `2026-07`), `status` (`DRAFT` | `LOCKED` | `SEALED`), `totalGrossHTG`, `totalNetHTG`, `auditSeal`, `createdAt`

### 2.4 `/businesses/{businessId}/ledger_transactions/{txId}`
- **Document ID**: `txId`
- **Fields**: `transactionDate`, `description`, `entries` (array of debit/credit lines), `signature` (SHA-256 seal)

### 2.5 `/businesses/{businessId}/settings/features`
- **Document ID**: `features`
- **Fields**: `businessId`, `features` (Record of active features/modules), `updatedAt`
- **Caching & Resolution Strategy**: Governed by the `FeatureResolver` engine. Implements a 5-minute thread-safe in-memory cache to eliminate redundant, expensive read requests, with automatic cache eviction on writes. Supports dual-read fallback resolution to `features/{businessId}`.

---

## 3. Realtime Listeners & Query Optimization

- **Listener Encapsulation**: All `onSnapshot` subscriptions must be managed inside Custom Hooks (`src/hooks/`) or Repositories, with cleanup functions returned in `useEffect`.
- **In-Flight Request Deduplication**: `resilientGetDoc` and `resilientGetDocs` track concurrent active promises (`inFlightDocPromises`, `inFlightQueryPromises`), collapsing concurrent reads for the identical path or query into a single network execution.
- **Short-Term Memory Cache**: Evaluates reads against an in-memory cache (20s TTL) before issuing Firestore network round-trips.
- **Compound Indexes**: Complex queries filtering by `business_id` + `status` + `timestamp` are declared in `firestore.indexes.json`.
- **Long-Polling Fallback**: For environments behind proxies or restricted networks, `experimentalAutoDetectLongPolling` is enabled in `src/lib/firebase.ts`.

---

## 4. High-Throughput Write Strategy: Distributed Sharding

To respect Firestore's 1 write/sec per document limit during peak workloads (e.g. payroll cycle processing, bank transactions, mass attendance scans):

- **Distributed Counters (`DistributedCounterService`)**: High-frequency aggregate tallies (e.g. `payroll_cycles/{cycleId}/totalNet_shards/{shardId}`) partition write traffic across $N$ shards (default: 10 shards).
- **Random Shard Routing**: Increments pick a random shard index $0 \le i < N$, eliminating lock contention.
- **Period Consolidation**: Upon cycle closure or lock (`SEALED`), shards are summed and reconciled to the root document.

---

## 5. Analytical Workloads & BigQuery Synchronization

- **Append-Only Event Sourcing**: Journal entries and forensic logs are immutable (`append-only`), preventing in-place write contention on hot balance sheets.
- **Data Warehouse Stream**: High-volume collections (`ledger_transactions`, `attendances`, `forensic_logs`) utilize the **Firebase to BigQuery Extension** for complex cross-period SQL analytics, OLAP queries, and multi-year forecasting without incurring expensive Firestore read operations.

---

## 6. Security Rules & Multi-Tenancy

- Security rules in `firestore.rules` enforce that authenticated users can only access data where `request.auth.token.business_id == resource.data.business_id`.

