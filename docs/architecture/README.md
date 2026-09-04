# FINOPS ERP — Enterprise Architecture Documentation Hub

**Platform**: FINOPS ERP v2.0  
**Stack**: Firebase (Firestore) + React 18 + TypeScript + Tailwind CSS  
**Core Paradigm**: Domain-Driven Design (DDD) | Repository Pattern | Persistence-First | Single Source of Truth (SSOT)  

---

## 1. Documentation Index

The `/docs/architecture/` suite defines the architectural standards, integrity mechanisms, data models, and event-driven patterns governing FINOPS ERP:

| Document | Primary Focus |
| :--- | :--- |
| **[Data Model & SSOT Specification](data-model.md)** | Canonical Firestore schema definitions, ER diagram, foreign key relationships, single source of truth rules, and zero redundant balance policies. |
| **[Event-Driven Architecture](EVENT_DRIVEN_ARCHITECTURE.md)** | Outbox pattern, domain event schemas (`INVOICE_POSTED`, `PAYROLL_CYCLE_POSTED`, `LEDGER_TRANSACTION_RECORDED`), idempotent handlers, and pub/sub guarantees. |
| **[Currency & Exchange Rate Engine](CURRENCY_AND_EXCHANGE_RATE_ENGINE.md)** | Multi-currency conversions (HTG / USD), BRH authoritative exchange rates, and historical valuation lookups. |
| **[Snapshot Engine](SNAPSHOT_ENGINE.md)** | Materialized snapshot triggers, configuration backups, performance optimizations, and TTL retention policies. |
| **[Commission Engine](COMMISSION_ENGINE.md)** | Commission calculations, tiered incentives, and payroll integration rules. |
| **[Workforce Performance Architecture](WORKFORCE_PERFORMANCE_ARCHITECTURE.md)** | Dual department attribution, performance snapshots, and team KPI aggregation. |
| **[Identity & Multi-Tenancy](IDENTITY_MAPPING_AND_TENANCY.md)** | User-to-business tenant isolation, RBAC role hierarchy (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `EMPLOYEE`), and invitation workflows. |
| **[Error Handling & Observability](ERROR_HANDLING_AND_OBSERVABILITY.md)** | Standardized error categorization, PII masking, contextual metadata logs, and forensic audit pipelines. |
| **[Integration Testing Specifications](INTEGRATION_TESTING.md)** | Automated test suites (`modules.integration.test.ts`), payroll smoke tests, and invariant assertions. |
| **[Notifications Architecture](NOTIFICATIONS_ARCHITECTURE.md)** | Real-time user notifications, alert thresholds, and multi-channel delivery. |

---

## 2. Executive Summary: Single Source of Truth (SSOT) Rules

To eliminate data discrepancies, duplicate states, and race conditions across CRM, Payroll, HR, and Accounting, FINOPS ERP enforces the following non-negotiable SSOT constraints:

### Rule 1: Financial State Derivation
* **General Ledger as Sole Authority**: Client balances, accounts receivable, revenues, and tax liabilities **MUST** be calculated dynamically by querying `ledger_transactions` (filtering by account `1200_ACCOUNTS_RECEIVABLE` for receivables and `1010_BANK` / `1000_CASH` for payments).
* **Ban on Redundant Balance Fields**: Storing mutable `client.current_balance`, `client.total_debt`, or cached invoice balance fields is strictly forbidden. Any UI needing client balance must invoke `AccountingEngine.computeClientBalanceFromLedger`.

### Rule 2: Strict Double-Entry Accounting
* Every financial movement generates balanced double-entry legs (`debit_account !== credit_account`, with identical monetary amounts in both Gourdes and `amount_cents`).
* All transactions are immutable once posted (`isImmutable: true`, `status: "POSTED"`). Modifications must follow reversal/correction entry patterns (`createReversalEntry`).

### Rule 3: Structural Attribution & Foreign Key Integrity
* Every ledger transaction **MUST** specify valid `business_id`, `branchId` (or `branch_id`), and `departmentId` (or `department_id`).
* Transactions without structural attribution are classified as **Orphans** and are remediated via `LedgerOrphanRemediationService` or `scripts/remediate_ledger_orphans.ts`, resolving default values from `business_settings`.

### Rule 4: Cryptographic Forensic Audit Vault
* All critical mutations, configuration updates, and remediation batch operations generate an immutable record in `forensic_logs` sealed with an authoritative SHA-256 digital signature (`computeSHA256Signature`).

### Rule 5: Domain Event Outbox Pattern
* Cross-module notifications (e.g. `InvoiceService` -> `AccountingEngine`) operate through transactional event outbox entries (`event_outbox` / `EventBus`) to ensure zero dropped operations during transient network outages.
