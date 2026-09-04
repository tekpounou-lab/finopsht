# FINOPS ERP — Enterprise Architecture Specification

## Overview

FINOPS ERP is built as an enterprise-grade, multi-tenant SaaS application designed for long-term scalability, strict data consistency, and modular domain separation. The core architecture follows **Domain-Driven Design (DDD)**, **CQRS-light patterns**, **Persistence-First State Management**, and the **Repository Pattern**.

---

## 1. Core Architectural Pillars

### 1.1 Single Source of Truth (SSOT)
- Every business entity (e.g., `Employee`, `Business`, `LedgerTransaction`, `PayrollCycle`) has a single canonical location in Firestore.
- In-memory state and UI caches are strictly secondary projections derived from the SSOT repository layer.

### 1.2 Persistence First
- Unsaved local UI state is restricted to form inputs in progress.
- All domain state changes are committed to persistent storage or event streams before being confirmed in the client layer.

### 1.3 Repository Pattern
- Direct Firestore calls (`getDoc`, `getDocs`, `setDoc`, `updateDoc`) inside React components or hooks are strictly prohibited.
- All data persistence is encapsulated within dedicated repository classes in `src/repositories/`.

### 1.4 Domain Services
- Pure business logic, calculations, and complex validations reside inside Domain Services (`src/services/` or `src/components/payroll/services/`), completely detached from React render lifecycles.

### 1.5 Event-Driven Architecture
- Asynchronous state mutations publish events via `EventBus` (`src/modules/runtime/EventBus.ts`).
- Subscribed modules react asynchronously to audit, index, or project analytical metrics.

### 1.6 Snapshot Strategy
- High-volume transaction streams (e.g., ledger lines, attendance clocks) are periodically rolled up into immutably sealed Snapshots (`SnapshotEngine.ts`) to maintain query speed and predictable memory bounds.

---

## 2. Structural Layering & Data Flow

```
[ UI Component / View ]
         │
         ▼
  [ Custom Hook / UI State ]
         │
         ▼
  [ Business / Domain Service ] ──(Emits)──► [ EventBus ]
         │                                       │
         ▼                                       ▼
  [ Repository Layer ] ◄───────────────── [ Audit / Analytics ]
         │
         ▼
  [ Firestore DB / LocalCache ]
```

---

## 3. CQRS & Read/Write Separation
- **Command Path**: Commands mutate state through Repositories, executing strict validation and emitting domain events.
- **Query Path**: Reads use pure selectors or cached projections derived from real-time snapshots, avoiding expensive re-computation during render passes.

---

## 4. Multi-Tenancy Architecture
- Every document in Firestore contains a mandatory `business_id` attribute.
- Multi-tenancy isolation is enforced at the Repository, Security Rules, and Query levels.
