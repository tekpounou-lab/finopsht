# FINOPS ERP — Centralized Integration & Smoke Testing Specification

## Overview

FINOPS ERP relies on a dual-layer test suite to ensure financial correctness, multi-tenant isolation, and data-integrity guarantees. This specification defines the integration testing methodology using the **Firebase Local Emulator Suite** and defines the core **Smoke Test Protocol** for critical user journeys (e.g., complete payroll processing cycles).

---

## 1. Multi-Layer Testing Architecture

```
         +-------------------------------------------------------+
         |                     User Interface                    |
         +---------------------------┬---------------------------+
                                     │
                                     ▼
         +-------------------------------------------------------+
         |                    Services Layer                     |
         +---------------------------┬---------------------------+
                                     │
         ┌───────────────────────────┴───────────────────────────┐
         ▼                                                       ▼
+------------------+                                    +------------------+
|   Unit Tests     |                                    | Integration Tests|
| (Vitest mocks)   |                                    | (Firebase Local  |
+------------------+                                    |  Emulator)       |
                                                        +--------┬---------+
                                                                 │
                                                                 ▼
                                                        +------------------+
                                                        |  Database State  |
                                                        |  (Real Queries)  |
                                                        +------------------+
```

1. **Unit Testing (Vitest)**: Tests isolated calculations, pure business logic, tax equations (ONA, OFATMA), and cryptographic hashing. Fast execution (<1s).
2. **Repository Integration (Firestore Local Emulator)**: Runs actual Firestore query planners, transaction pipelines, and index verifiers. Prevents regressions in complex query lookups (e.g., fetching clock-ins on a specific date boundary).
3. **End-to-End Smoke Testing**: Orchestrates multiple repositories and services to execute a full business workflow (such as enrolling an employee, logging clock cards, computing payroll, locking the cycle, and auditing Ledger credits).

---

## 2. Firebase Emulator Integration Setup

For real query validation, tests run against the local Firestore Emulator port `8080`.

### 2.1 Initialization & Environment Configuration

During test runner initiation, the database helper automatically routes calls to the active emulator if detected:

```typescript
import { initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

const firebaseConfig = {
  projectId: "finops-erp-emulator",
  apiKey: "mock-api-key",
  authDomain: "finops-erp-emulator.firebaseapp.com"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

if (process.env.FIRESTORE_EMULATOR_HOST) {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  connectFirestoreEmulator(db, host, parseInt(port, 10));
  console.log(`[Test Environment] Successfully connected to Firestore Emulator at ${host}:${port}`);
}
```

---

## 3. The Full Payroll Cycle Smoke Test Protocol

The smoke test validates the integrity of the three core pillars of FINOPS ERP (Workforce -> Payroll -> Ledger):

```
+──────────────────────────+
│  1. Business & HR Setup  │ Enroll tenant unit & add Employee contract
+─────────────┬────────────+
              │
              ▼
+──────────────────────────+
│  2. Clock Card Logging   │ Append attendance time entries
+─────────────┬────────────+
              │
              ▼
+──────────────────────────+
│   3. Payroll Execution   │ Compute Gross & Deduct ONA (6%) / OFATMA (2%)
+─────────────┬────────────+
              │
              ▼
+──────────────────────────+
│   4. Double-Entry Audit  │ Generate General Ledger Credits
+──────────────────────────+
```

### 3.1 Step 1: Tenant & Personnel Provisioning
Creates a target `Business` (tenant partition), a physical `Branch`, a `Department`, and a new `Employee` with an active `EmployeeContract` specifying base salary.

### 3.2 Step 2: Timecard Generation
Logs standard clock sessions (check-ins and check-outs) to register hours worked and verify overtime calculation boundaries.

### 3.3 Step 3: Calculation & Social Deductions
Runs the `PayrollEngine`, asserting that:
- Gross salary perfectly accounts for hours worked.
- Social security deductions (ONA 6%, OFATMA 2%) are correctly computed and match the statutory survival floors.

### 3.4 Step 4: General Ledger Transaction Posting
Emits ledger entries using `AccountingEngine`, verifying that the double-entry balance matches perfectly (Debits = Credits) and the resulting block is cryptographically sealed using a SHA-256 hash.
