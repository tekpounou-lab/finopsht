# FINOPS ERP — Architectural Changelog

## [2.6.0] - 2026-09-01
### Added & Documented (Phase 3 — Typed EventBus Architecture, Automated Integrity Tests, & Data Model Specification)
- **Typed EventBus & Message Schemas (`src/types/events.ts`)**:
  - Defined universal generic interface `FinopsEvent<T>` containing `type`, `businessId`, `payload`, `timestamp`, and `correlationId`.
  - Created standardized strongly-typed domain payloads (`InvoicePostedEventPayload`, `InvoicePaidEventPayload`, `PayrollApprovedEventPayload`, `EmployeeCreatedEventPayload`, `EmployeeSuspendedEventPayload`, `AttendanceClockedEventPayload`, `TransactionCommittedEventPayload`, `SnapshotGeneratedEventPayload`, `OrphanTransactionsRemediatedPayload`).
  - Upgraded `EnterpriseEventBus` (`src/modules/runtime/EventBus.ts`) with generic publication and subscription mechanisms (`EventBus.publish<T>()`, `EventBus.subscribe<T>()`), automatic correlation IDs, and deduplication.
- **Automated Integrity Testing Suite (`src/tests/integration/AutomatedIntegrityAndEventBusPhase3.test.ts`)**:
  - Full automated Vitest suite verifying cross-collection financial consistency (Invoice totals $\leftrightarrow$ General Ledger receivables, Settlement $\leftrightarrow$ Bank debit), payroll invariants (Cycle aggregates $\leftrightarrow$ Payslip sums), absence of orphan records, and Firestore multi-tenant invariants.
- **Complete Data Model & SSOT Reference (`docs/architecture/data-model.md`)**:
  - Updated comprehensive ER Diagram with multi-tenant partitioning, collection cardinalities (1:1, 1:N, N:M), and event lifecycle flow.
  - Added exhaustive Foreign Key catalog with integrity validation rules and ON DELETE behaviors.
  - Consolidated SSOT evaluation matrix outlining single-source data storage and dynamic projection engines.

## [2.5.0] - 2026-09-01
### Added & Standardized (Phase 2 — Naming Uniformity & Referential Integrity Constraints)
- **Bidirectional Naming Standardization (`src/utils/caseConverter.ts`)**:
  - Implemented universal deep mapping utilities (`toCamelCase`, `toSnakeCase`, `snakeToCamel`, `camelToSnake`).
  - Created explicit domain entity mappers: `mapBranch`, `mapDepartment`, `mapBusinessUnit`, `mapCostCenter`, `mapEmployee`, `mapAttendanceRecord`, `mapPayrollCycle`.
  - Upgraded all Organization, Employee, and Attendance repositories to transform Firestore `snake_case` properties into clean TypeScript `camelCase` domain models while preserving backward compatibility.
- **Referential & Foreign Key Integrity Validation Engine (`src/services/integrity/ForeignKeyIntegrityValidator.ts`)**:
  - Added strict pre-write foreign key validation verifying existence and tenant alignment for `businessId`, `departmentId`, `employeeId`, and `branchId`.
  - Incorporated a 15-second in-memory validation cache to maintain high-speed QR check-ins and high-frequency writes without latency penalty.
  - Implemented explicit forensic diagnostic errors (`ForeignKeyIntegrityViolationError`) detailing the missing foreign ID and referenced collection.
  - Exposed verification trigger endpoint (`POST /api/integrity/validate-foreign-keys`) on Express backend.
- **Phase 2 Integration Test Suite (`src/tests/integration/NamingAndIntegrityPhase2.test.ts`)**:
  - Full automated Vitest coverage verifying deep case transformations, entity mapping, and foreign key integrity constraint rejections and passes.

## [2.4.0] - 2026-09-01
### Added & Hardened (Phase 1 — Core Security, SSOT, & Storage Remediation)
- **Cross-Tenant Security Enforcement (`firestore.rules`)**:
  - Implemented strict multi-tenant boundary checks across all collections (`isTenantScoped`, `isTenantAdminOrManager`).
  - Guaranteed that authenticated business owners and admins cannot read, query, or mutate documents belonging to external tenant `business_id` spaces.
  - Hardened forensic audit vault collections (`forensic_logs`, `audit_logs`, `attendance_events`) with strict immutable protections against modification and deletion.
- **Single Source of Truth (SSOT) Architecture (`src/services/business/DataCleanupAndSSOTService.ts`)**:
  - Eliminated redundant summary fields (`totalRevenue`, `totalExpenses`, `cachedLedgerTotal`, `redundantSummary`) across `invoices`, `proformas`, and `payroll_cycles`.
  - Shifted invoice/proforma totals to dynamic real-time calculations directly from line items (`items`), while anchoring financial accounting exclusively on the General Ledger (`ledger_transactions`).
  - Added batch database cleanup migration utility and Express maintenance endpoint (`POST /api/maintenance/ssot-cleanup`).
- **Automated Snapshot 30-Day Retention Engine (`src/services/business/snapshot/SnapshotRetentionManager.ts`)**:
  - Implemented automated 30-day TTL expiration policy for `metric_snapshots`, `analytics_snapshots`, and daily performance metrics.
  - Permanently preserved annual, fiscal year, and monthly audit snapshots for historical compliance.
  - Exposed Cloud Function / scheduled cron API endpoint (`POST /api/maintenance/prune-snapshots`).
- **Comprehensive Verification Suite (`src/tests/integration/CrossTenantAndSSOTPhase1.test.ts`)**:
  - Vitest test coverage confirming tenant isolation, line-item dynamic totals calculation, and snapshot TTL evaluation.

## [2.3.0] - 2026-08-28
### Added
- **Centralized Finance & Tax Constants (`src/constants/finance.ts`)**: Single Source of Truth for statutory tax rules (ONA, OFATMA), statutory rates (6% ONA employee/employer, 2% OFATMA employee, 3% employer), Standard Chart of Accounts (COA), currency parameters, and overtime multipliers (1.5x, 2.0x).
- **Tax Terminology Harmonization (ONA / CNSS & OFATMA / CNS)**: Authoritative normalization dictionary and alias resolver (`resolveTaxAuthority`), eliminating legacy nomenclature conflicts across payroll and general ledger modules.
- **Zod Semantic Validation**: Implemented strict runtime validation schemas for monetary amounts (`AmountHtgSchema`, `AmountCentsSchema`), tax rates (`PercentageRateSchema`, `TaxRateConfigSchema`), payroll line items, and double-entry equilibrium verification (`validateDoubleEntryEquilibrium`).
- **Comprehensive Unit Testing (`src/tests/unit/FinanceConstants.test.ts`)**: Full Vitest test suite verifying tax rates, alias resolution, monetary conversions, and Zod bounds.

## [2.2.0] - 2026-08-27
### Added
- **Manual Employee Self-Registration & Waiting Room**: Direct registration flow supporting iCloud (`@icloud.com`, `@me.com`) and standard email/password accounts without third-party OAuth, with automatic invitation matching and real-time waiting room state machine routing (`/waiting-room`).
- **Kiosk QR Pointage & Local Device Hardware Clocks**: Real-time QR attendance kiosk with device hardware timestamp capture and timezone anchoring (`America/Port-au-Prince`), eliminating clock drift and ensuring reliable offline check-in records.
- **In-Flight Firestore Promise Deduplication**: Integrated concurrent request coalescing (`inFlightDocPromises`, `inFlightQueryPromises`) into `resilientFirestore.ts`, eliminating duplicate reads during simultaneous identity resolution cycles.
- **AI CFO Deterministic Fallback Relais**: Automated fallback to `FinancialRatioEngine` heuristics whenever API quotas (429) or monthly spend caps are reached, maintaining uninterrupted financial intelligence for executives.
- **Mock Simulator Logging Governance**: Filtered and centralized mock attendance & kiosk logs under `VITE_ENABLE_MOCK_LOGS=true` debug level, keeping production and development consoles clean.

## [2.1.0] - 2026-07-27
### Added (Sprint 8 — Enterprise Observability Platform)
- Built `src/services/observability/` core infrastructure: `MetricRegistry`, `AlertEngine`, `RecommendationEngine`, `HealthScoreCalculator`, `MetricSnapshotRepository`, and `ObservabilityService`.
- Built React telemetry context and provider (`ObservabilityContext`, `ObservabilityProvider`) with automatic 12-second periodic scans.
- Built 8 domain-specific Observability Centers in `src/components/observability/`:
  - `RuntimePerformanceCenter`: React render profiling, re-renders, FPS, and memory consumption.
  - `FirestoreObservatory`: Realtime reads/writes, listener lifecycle, and query latency.
  - `AiOperationsCenter`: Gemini token tracking, prompt latency, quota usage, and cost estimation.
  - `WorkflowCenter`: Event queue depth, processing latency, and circuit breaker status.
  - `FinancialIntegrityCenter`: GL double-entry balancing, payroll reconciliation, and invariant checks.
  - `SecurityOperationsCenter`: RBAC violation monitoring, Firestore permission checks, and tenant isolation.
  - `DevOpsDashboard`: Bundle size profiling, modularity index, and component lines audit.
  - `RecommendationConsole`: Actionable system optimization steps.
- Integrated unified Executive System Health Center (`SystemHealthCenter.tsx`) into `SystemHealthConsole.tsx`.

## [2.0.0] - 2026-07-27
### Added (Sprint 6 & 7 Completion)
- Established Vitest automated test suite (`src/tests/`) covering Payroll Engine, Double-Entry Accounting Engine, Permission Service, Performance Service, and UI Virtualized Table components.
- Integrated `VirtualizedTable` for seamless high-performance rendering of 10,000+ data rows with 60 FPS viewport windowing.
- Synchronized `SubscriptionRegistry` with `PerformanceService` for realtime Firestore listener registration and memory monitoring.
- Created complete Enterprise Governance Hub (`docs/architecture/ARCHITECTURE_MAPS.md`, `docs/governance/`, `docs/development/`, `docs/AI_DEVELOPMENT_GUIDE.md`, and `docs/roadmap/FUTURE_SPRINT_BACKLOG.md`).
- Designed the Enterprise System Health Center & Observability Architecture (`docs/architecture/OBSERVABILITY_SYSTEM_HEALTH.md`) covering Runtime Performance, Firestore Observatory, AI Operations, Workflow Operations, Financial Integrity, SOC, and DevOps.
- Fully verified 0 TypeScript compilation errors, 0 build errors, and 100% test pass rate.

## [1.6.0] - 2026-07-27
### Added
- Created Enterprise Knowledge Hub in `/docs/` with 20 modular architecture specifications.
- Refactored `GEMINI.md` into concise Project Orchestrator (< 300 lines).
- Isolated `BusinessAdministrationRepository` in `src/repositories/` for business settings and tax rate management.
- Integrated Phase 5 Forensic Vault, Pessimistic Cycle Lock, and Dry-Run calculation engine into `SaaSLicensingConsole.tsx`.
- Enabled `experimentalAutoDetectLongPolling` in `src/lib/firebase.ts` for network resilience.

### Changed
- Standardized all repository exports under `src/repositories/index.ts`.
- Consolidated tax calculation formulas in `PayrollCalculationEngine.ts`.

---

## [1.5.0] - 2026-07-26
### Added
- Unified Payroll V3 architecture (`docs/PAYROLL_V3_ARCHITECTURE.md`).
- SHA-256 cryptographic seal generation on ledger transactions.
- Permission Matrix integration via `PermissionService.ts`.

---

## [1.0.0] - 2026-07-20
### Added
- Initial FINOPS ERP multi-tenant SaaS architecture release.
- Core HR, Attendance, Payroll, and General Ledger modules.
