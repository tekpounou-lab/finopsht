# FINOPS ERP — Event-Driven Architecture Specification

## Overview

FINOPS ERP employs an asynchronous, event-driven architecture (EDA) to decouple services, maintain ledger auditability, and feed real-time analytical projections. This document specifies the event model, transactional outbox patterns, distributed message queue interfaces, and idempotency guarantees.

---

## 1. The Standardized Event Schema

Every system event inherits from the expanded `RuntimeEvent` model. To ensure high-fidelity distributed tracing, every event must specify its source emitting system, business context, and the authenticated human actor responsible for triggering it.

### 1.1 Base Event Interface
```typescript
export interface RuntimeEvent {
  eventId: string;               // Unique UUID/KSUID identifier
  timestamp: string;             // ISO-8601 UTC timestamp
  correlationId: string;         // Root request tracker across distributed systems
  causationId?: string;          // Direct cause event identifier (for workflow chains)
  actorId: string;               // Firebase Auth User UID (Authenticated human)
  businessId: string;            // Active tenant context (Partition key)
  module: string;                // Top-level module (e.g., "WORKFORCE", "PAYROLL")
  aggregate: string;             // Context aggregate (e.g., "EMPLOYEE", "LEDGER")
  type: string;                  // Standard snake_case event type for backwards compatibility
  eventType: string;             // High-fidelity discriminated union type (e.g., "EMPLOYEE_CREATED")
  source: string;                // Emitting source service/repository (e.g., "EmployeeRepository")
  version: string;               // Event schema semantic version (e.g., "1.0.0")
  payload: Record<string, any>;  // Structurally validated payload
  status: "PENDING" | "PROCESSED" | "FAILED";
  metadata?: Record<string, any>;
}
```

### 1.2 Structured Event Schema Catalog
The table below maps standard event types to their verified schemas and payload expectations:

| Event Type (`eventType`) | Module / Domain | Payload Contents | Key Consumer |
| :--- | :--- | :--- | :--- |
| `EMPLOYEE_CREATED` | Workforce | `{ employee: Employee }` | AuditEngine, Analytics |
| `EMPLOYEE_SUSPENDED` | Workforce | `{ employeeId: string, reason: string }` | Payroll, Notification |
| `ATTENDANCE_CLOCKED` | Workforce | `{ logId: string, timestamp: string, mode: "IN"\|"OUT" }` | PayrollCalculationEngine |
| `TRANSACTION_COMMITTED` | Accounting | `{ txId: string, entries: LedgerEntry[] }` | ForensicAuditVault, GeneralLedger |
| `PAYROLL_APPROVED` | Payroll | `{ cycleId: string, totalGross: number, taxONA: number }` | TransactionEngine (Auto-Posting) |

---

## 2. The Transactional Outbox Pattern

To prevent "dual-write" consistency issues—where database writes succeed but event dispatch fails—all critical domain events use a **Transactional Outbox**.

```
[ Domain Operation ]
         │
         ├──► Write State (e.g., /employees/EMP_001)
         │                                               (Atomically bound in same Batch)
         └──► Write Event (e.g., /event_outbox/EVT_001) ───+
                                                            │
  +---------------------------------------------------------+
  │
  ▼  (Cloud Firestore trigger: onCreate)
[ Cloud Function: finopsEventOrchestrator ]
  │
  ├──► Publish to GCP Pub/Sub (Topic: finops-erp-events)
  │
  ▼  (Upon Successful Pub/Sub Acknowledgement)
[ Mark Outbox Event as PROCESSED / Delete ]
```

### 2.1 Client Responsibility: Outbox Writer
The client application must **never** publish critical state change events directly over insecure HTTP channels. Instead, the repository layer writes the state mutation and the event document into Firestore as a single atomic batch or transaction.

- **Firestore Collection**: `/businesses/{businessId}/event_outbox/{eventId}`
- **Security Check**: Write privileges restricted strictly to users with matching `business_id` credentials via Firestore rules.

### 2.2 Server Responsibility: GCP Pub/Sub Bridge
The backend `finopsEventOrchestrator` Cloud Function is a server-side subscriber bound to Firestore collection triggers.
1. **Trigger**: list's for `onCreate` events on `/businesses/{businessId}/event_outbox/{eventId}`.
2. **Ingress Payload Translation**: Normalizes and structures the event.
3. **IAM Authentication**: Publishes securely to Google Cloud Pub/Sub under the corresponding topic.
4. **Resiliency Retry Loop**: If GCP Pub/Sub is unresponsive, the Cloud Function retries with exponential backoff.
5. **State Advancement**: Once acknowledged by GCP Pub/Sub, the outbox document is marked `PROCESSED` or removed to prevent bloat.

---

## 3. Idempotency & Deduplication Engine

Distributed message queues guarantee **at-least-once** delivery. Due to network retries, consumers may receive duplicate events. FINOPS ERP implements a **two-tiered idempotency guardian**.

```
                           [ Incoming Event ]
                                   │
                                   ▼
                +------------------------------------+
                | Tier 1: Client In-Memory Filter    | (Deduplicates within 1500ms)
                +-----------------+------------------+
                                  |
                                  | (New Event)
                                  v
                +------------------------------------+
                | Tier 2: Persistent Idempotency     |
                |         Firestore Collection       |
                +-----------------+------------------+
                                  |
                   [ Look up: eventId in processed_ids ]
                                  ├── Yes ──► [ Silently Skip & Acknowledge ]
                                  └── No  ──► [ Execute Work & Append ID ]
```

### 3.1 Tier 1: Client In-Memory Deduplication
The client-side `EventBus` maintains a sliding 1500ms deduplication window:
- Generates a compound string key: `${eventType}:${businessId}:${payloadSignature}`.
- Drops concurrent identical events emitted within the window to prevent UI-level double-render issues.

### 3.2 Tier 2: Persistent Idempotency Guardian (Firestore-Backed)
For backend-driven services and async handlers, the system relies on persistent consumer registration.

- **Firestore Registry Path**: `/businesses/{businessId}/event_processing/{consumerId}`
  - `consumerId`: Represents the microservice or processor (e.g., `"ledger_service"`, `"analytics_engine"`).

#### Document Schema:
```json
{
  "id": "ledger_service",
  "last_processed_event_id": "evt_9a3bc7ef1",
  "last_processed_timestamp": "2026-08-10T08:18:00Z",
  "processed_ids": [
    "evt_8f11b8ac4",
    "evt_9a3bc7ef1"
  ]
}
```

#### Consumption Algorithm:
Each event consumption cycle must execute inside a Firestore Transaction:
1. Read the consumer's document at `/businesses/{businessId}/event_processing/{consumerId}`.
2. Check if `incomingEvent.eventId` is present in the `processed_ids` array.
3. **If found**: Skip execution. Acknowledge and terminate.
4. **If not found**:
   - Run the domain logic (e.g., post Ledger entries).
   - Push `incomingEvent.eventId` to `processed_ids`.
   - Update `last_processed_event_id` and `last_processed_timestamp`.
   - To keep memory bounds strict and prevent array size explosion in Firestore, the `processed_ids` array implements a **sliding-window FIFO cap of 1,000 IDs**. When the length exceeds 1,000, the oldest entry is popped out.

---

## 4. Security & Authentication Scoping

### 4.1 Strict Actor Tracking
Every emitted event's `actorId` **MUST** represent the authenticated user's Firebase Auth User ID (`uid`). 
- Emitted events do **NOT** use internal `employeeId` strings for the `actorId` field. This guarantees that forensics can map actions directly back to real, logged-in individuals, preserving end-to-end security audits.

### 4.2 Partition Key Integrity
When emitting outbox events:
- The `businessId` field must match the user's active tenant scope.
- Security Rules at `/businesses/{businessId}/event_outbox/{eventId}` prevent cross-tenant spoofing by asserting that:
  ```javascript
  request.auth.uid != null && 
  get(/databases/$(database)/documents/users/$(request.auth.uid)).data.business_id == businessId
  ```
