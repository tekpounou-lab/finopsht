# FINOPS ERP — Architectural Changelog

## [4.6.0] - 2026-11-06
### Enacted & Verified (BI-P1.5 — PIC Financial Integrity & Temporal Filter Remediation)
- **DEF-TF-01 (Temporal Filter Unbounded / Open-Ended Semantics & Caller Propagation)**:
  - Added `"ALL"` to `AnalyticsPeriod` (`src/domains/analytics/types/index.ts`) and removed the silent current-calendar-month fallback in `AnalyticsEngine.getPeriodRanges` (`src/domains/analytics/services/AnalyticsEngine.ts`) when `period` is `"CUSTOM"` or `"ALL"` with empty or partial `startDate`/`endDate`.
  - Updated `AnalyticsEngine.generateSnapshot` and `computeOperationalExpenses` to support unbounded (`""`..`""`) and single-bound open-ended ranges, guard previous-period comparisons via `hasPreviousPeriod` (preventing duplicate prior-period fabrication), and derive dataset-scoped effective cash, attendance, and trend bounds while preserving `NO_DATA` semantics on empty datasets.
  - Preserved cleared `""` date bounds across `AnalyticsContext.tsx`, `useBIDataAggregation.ts`, `usePerformanceData.ts`, and `ExecutiveFilterContext.tsx` (`filterPayrolls`), and aligned `selectExpertMetrics` (`src/domains/performance/selectors/index.ts`) and `usePerformanceData.ts` with `selectSimplifiedMetrics` so both `CASH` and `ACCRUAL` accounting modes propagate consistently to `AnalyticsEngine.generateSnapshot`.
- **DEF-REV-01 (Subledger Department Revenue Isolation)**:
  - Removed `salesFromPayroll` (`payroll_records.sales_cents` / `salesHtg`) from `departmentPerformance[].revenue` in `AnalyticsEngine.ts` while preserving commercial sales attribution on `employeeScorecards[].salesVolume`, and aligned `departmentPerformance[].revenue` with mode-aware accounting SSOT (`CanonicalCashEngine` inflows in `CASH` mode; all posted non-reversed `isIncomeTx(t)` entries in `ACCRUAL` mode).
- **DEF-CASH-01 (Cash-Basis & Accrual Inflow Guardrails)**:
  - Hardened `LedgerCashAdapter.adaptTransaction` (`src/domains/cash/adapters/LedgerCashAdapter.ts`) so non-revenue Treasury debits (payroll/social/bonus/penalty/compensation entries, `2xxx`/`42x–49x`/`5xxx`/`6xxx`/clearing/payable/tax credit accounts, and non-revenue types such as `TRANSFER`, `EXPENSE`, `REFUND`, `CORRECTION`, `ADJUSTMENT`, `ADVANCE`) are classified as `IGNORED` instead of `INFLOW`, while preserving `REVERSED` audit records (`0` net cash impact) and legitimate `PAYROLL_RECOVERY` repayments against `1310_EMPLOYEE_RECEIVABLES`.
  - Hardened `AnalyticsEngine.isIncomeTx` to exclude payroll/non-revenue types and restrict Class 4 credit account matching to `^4[01]\d*` (excluding PCG `421`/`431`/`44x`).
- **DEF-LS-01 (Session-Scoped & Validated `localStorage` Filter Persistence)**:
  - Hardened `ExecutiveFilterContext.tsx` (`createDefaultExecutiveFilters`, `loadPersistedExecutiveFilters`, `resetFilters`, `clearPersistedFilters`) with 12-hour TTL, cross-day expiration, legacy `v2` cleanup, ISO calendar & `startDate <= endDate` validation, and preservation of active same-day custom and cleared `"All Dates"` selections.

## [4.5.1] - 2026-10-29
### Enacted & Verified (Phase D3.1 — Post-D3-R Targeted Security & Financial Integrity Remediation)
- **D3.1-A (Remediates `D3-R-01` — Operator & Approver Anti-Spoofing)**:
  - Hardened `POST /api/cash/sessions/close` and `POST /api/cash/sessions/reopen` (`server.ts`) and `TillSessionEngine.evaluateClosure` / `evaluateReopen` (`src/domains/cash/services/TillSessionEngine.ts`) to reject any client-supplied `body.operatorId !== req.user.uid` or `body.approverId !== req.user.uid` with `403 IDENTITY_SPOOFING_DETECTED`, deriving `operatorId` and `approverId` strictly from `req.user.uid`.
- **D3.1-B, D3.1-C & D3.1-D (Remediates `D3-R-02` — Frontend Server API Migration, Transactional Reads & Outbox Synchronization)**:
  - Migrated `TillSessionModal.tsx` (`src/components/cash/TillSessionModal.tsx`) from client-side `TillSessionEngine.closeSession(...)` to `TillSessionEngine.closeSessionViaApi(...)` (`POST /api/cash/sessions/close` with Bearer token and `x-business-id` header).
  - Updated `TillSessionEngine.closeSessionWithAdmin` so all document and collection queries (`sessionRef`, `tillRef`, `varianceGlRef`, `outboxRef`, `teller_transactions`, `internal_transfers`, `customer_transfers`) run via `tx.get(...)` before any `tx.set(...)` inside `adminDb.runTransaction`.
  - Synchronized `varianceLedgerTx` enrichment (`sanitizeAndEnrichLedgerTransaction`, `validateLedgerForeignKeys`) and deterministic `businesses/${businessId}/event_outbox/evt_tx_gl_variance_${sessionId}` creation across both Admin SDK and client paths (with deterministic outbox cleanup on client rollback).
- **D3.1-E & D3.1-F (Remediates `D3-R-03` — Mandatory Denomination Breakdown & Canonical HTG/USD Matrix)**:
  - Updated `TillSessionEngine.validateDenominationBreakdown` to reject `denominationBreakdown === undefined` with `400 INVALID_DENOMINATION_BREAKDOWN` whenever `actualClosingCents > 0`, while allowing `undefined` or `{}` when `actualClosingCents === 0`.
  - Exported `CANONICAL_HTG_DENOMINATIONS` (`[1000, 500, 250, 100, 50, 25, 10, 5, 2, 1]`) and `CANONICAL_USD_DENOMINATIONS` (`[100, 50, 20, 10, 5, 2, 1]`) from `TillSessionEngine.ts` and wired them into `TillSessionModal.tsx` so `2` and `1` HTG coins are supported in UI and backend.
- **D3.1-G & D3.1-H (Remediates `D3-R-04` — Requester Identity Verification & Signed Forensic Audit Trail)**:
  - Verified `requesterId` in `reopenSessionWithAdmin` / `reopenSession` against `employees/${requesterId}` and `users/${requesterId}` for existence (`404 REQUESTER_NOT_FOUND`), tenant isolation (`403 TENANT_ISOLATION_VIOLATION`), active status (`403 INACTIVE_REQUESTER`), and allowed role (`403 UNAUTHORIZED_REQUESTER_ROLE`).
  - Added `TillSessionEngine.recordAdminForensicEvent` emitting cryptographically signed `ForensicLog` records (`TILL_SESSION_CLOSED`, `TILL_SESSION_CLOSE_REFUSED`, `TILL_SESSION_REOPENED`, `TILL_SESSION_REOPEN_REFUSED`) via `ForensicLogRepository`.
- **D3.1-I (Adversarial Security & Financial Integrity Verification)**:
  - Expanded `src/tests/unit/security/PhaseD3TillClosureSecurityAndIntegrity.test.ts` to 21 test blocks covering all 33 mandatory adversarial cases (`88/88` tests passing across all 6 cash and security suites).

## [4.5.0] - 2026-10-29
### Enacted & Verified (Phase D3 — Transactional Till Session Closure, Pending Transfer Blockade & Variance Accounting Integrity)
- **D3-A (Pending Operations & Transfers Blockade Before Closure)**:
  - Hardened `TillSessionEngine.closeSession` and `TillSessionEngine.closeSessionWithAdmin` (`src/domains/cash/services/TillSessionEngine.ts`, `POST /api/cash/sessions/close` in `server.ts`) to inspect all `internal_transfers`, `customer_transfers`, and `teller_transactions` without swallowing Firestore read errors, blocking closure with `409 PENDING_TRANSFERS_BLOCKADE` whenever any relevant transfer or operation is still pending or in progress (`PENDING_APPROVAL`, `APPROVED`, `PENDING`, `PROCESSING`, `IN_PROGRESS`, `IN_TRANSIT`, `ON_HOLD`).
- **D3-B (Transactional Atomicity, Concurrency Locks, RBAC & Idempotency)**:
  - Added per-session and per-till concurrency locks, transactional verification (`runTransaction` / `adminDb.runTransaction`), and compensating rollback guarantees (`state_before === state_after`) across `till_sessions`, `cash_tills`, and `ledger_transactions`.
  - Enforced multi-tenant ownership (`TENANT_ISOLATION_VIOLATION`), operator/supervisor RBAC (`FORBIDDEN_ROLE`, `UNAUTHORIZED_SESSION_OPERATOR`), active session status (`SESSION_ALREADY_CLOSED`), and deterministic variance GL ID (`gl_variance_${sessionId}`) preventing duplicate variance entries on retry or concurrent calls.
- **D3-C (Denomination Breakdown, Currency Separation & SSOT Variance Validation)**:
  - Added `TillSessionEngine.validateDenominationBreakdown` enforcing currency-specific denominations (`HTG` vs `USD`), safe integer counts, and exact equality between denomination sum and `actualClosingCents` (`400 DENOMINATION_TOTAL_MISMATCH`).
  - Enforced server-side reconstruction of $S_{\text{theo}} = \text{opening\_balance\_cents} + \sum \text{inflows\_cents} - \sum \text{outflows\_cents}$, verified `till.balance_cents === expectedClosingCents` (`409 TILL_BALANCE_DIVERGENCE`), and posted balanced variance entries strictly to approved account `2910` against `1010` (`HTG`) or `1020` (`USD`).
- **D3-D (Controlled Reopening & Historical GL Immutability)**:
  - Hardened `TillSessionEngine.reopenSession` and `TillSessionEngine.reopenSessionWithAdmin` (`POST /api/cash/sessions/reopen`) with tenant isolation, Maker-Checker separation (`requesterId !== approverId` and `approverId !== prevSession.teller_id`), supervisor RBAC (`HEAD_TELLER`, `MANAGER`, `OWNER`, `SUPER_ADMIN`), mandatory justification, and deterministic reopened session ID (`sess_reopen_${previousSessionId}`), rejecting repeated reopen attempts (`409 SESSION_ALREADY_REOPENED`) while preserving historical closure data and `gl_variance_${previousSessionId}` immutable.
- **D3-E & D3-F (Adversarial Security & Accounting Test Suite)**:
  - Created `src/tests/unit/security/PhaseD3TillClosureSecurityAndIntegrity.test.ts` covering all 16 mandatory scenarios (16/16 passing; 83/83 passing across all 6 cash and security suites).

## [4.4.0] - 2026-10-29
### Enacted & Verified (Phase D2 — Controlled Server-Side Migration of Till Auto-Provisioning)
- **D2-A (Authenticated Server Route & RBAC)**:
  - Added `ServerTillProvisioningService` (`src/services/business/ServerTillProvisioningService.ts`) and `POST /api/cash/tills/auto-provision` (`server.ts`) using `authenticateToken`, `resolveServerRouteTenant`, `TILL_PROVISIONING_AUTHORIZED_ROLES` (`OWNER`, `ADMIN`, `MANAGER`, `HEAD_TELLER`, `SUPER_ADMIN`), and `getAdminFirestore()`.
- **D2-B (Transactional Idempotency, Anti-Overwrite & Zero Financial Side Effects)**:
  - Enforced per-tenant concurrency serialization and `db.runTransaction` read-before-write verification across `employees`, `cash_tills`, and `branch_safes`.
  - Preserved existing tenant tills and safes without overwriting `balance_cents`, `status`, `active_session_id`, or timestamps; blocked cross-tenant document/employee ID overwrites (`403 TENANT_OVERWRITE_FORBIDDEN`); guaranteed zero fictitious cash movements or General Ledger entries.
- **D2-C (Frontend & Repository Migration)**:
  - Migrated `CashManagementRepository.autoProvisionTillsForBusiness` (`src/repositories/CashManagementRepository.ts`) and `CashConsole.tsx` to invoke `POST /api/cash/tills/auto-provision` with Bearer authentication and explicit error propagation, eliminating direct client-side Firestore writes for this flow.
- **D2-D (Real-App Security & Idempotency Test Suite)**:
  - Added `src/tests/unit/security/PhaseD2TillProvisioningSecurity.test.ts` mounted on the real `await createApp()` covering all 12 mandatory adversarial, RBAC, cross-tenant, idempotency, concurrency, and rollback scenarios.

## [4.3.0] - 2026-10-29
### Enacted & Verified (Phase D1 / D1.1 / D1.2 — Authentication, Authorization, IDOR & Multi-Tenant Hardening)
- **D1.1-R-01 (Cross-Tenant Employee Overwrite Prevention)**:
  - Hardened `ServerProvisioningService.provision` (`src/services/business/ServerProvisioningService.ts`) and `POST /api/provisioning/create-business` (`server.ts`) to validate `options.employeeId` and `options.businessId`, read `employees/${employeeId}` inside `db.runTransaction`, and block any cross-tenant or cross-user overwrite with `403 TENANT_OVERWRITE_FORBIDDEN`.
- **D1.1-R-02 (Single-Tenant Membership Invariant via Custom Claims)**:
  - Enforced single-tenant membership checks against `req.user.business_id` (Custom Claims) in `server.ts`, `ServerProvisioningService.provision`, and `InvitationService.acceptInvitation`, preventing tenant hopping even when `users/{uid}` is absent or `options.businessId` is omitted (`403 USER_ALREADY_BOUND_TO_TENANT`, `403 TENANT_CONFLICT_EXISTING_MEMBERSHIP`).
- **D1.1-R-03 (AI CFO Authentication & Context Binding)**:
  - Protected `POST /api/cfo/analyze` and `POST /api/cfo/narrative` with `authenticateToken`, removed unprefixed `/cfo/analyze` and `/cfo/narrative` route aliases, blocked `userContext.userId` spoofing (`403 IDENTITY_SPOOFING_DETECTED`) and cross-tenant `businessId` (`403 FORBIDDEN_TENANT_ACCESS`), and derived `resolvedUserContext` (`userId`, `userEmail`, `role`, `businessId`) strictly from `req.user`.
- **D1.1-R-04 (Server-Side Firebase Admin SDK Execution)**:
  - Migrated server execution paths in `EmployeeReceivableRepository.ts`, `SnapshotRetentionManager.ts`, `DataCleanupAndSSOTService.ts`, and `ForeignKeyIntegrityValidator.ts` from the unauthenticated Web SDK to `getAdminFirestore()`, supporting both root collections and `businesses/{businessId}/{collection}` subcollections with strict tenant ownership verification.
- **D1.1-R-05 (Unified RBAC & Dual-Field `businessId` / `business_id` Consistency)**:
  - Exported canonical `RECEIVABLE_READ_ROLES`, `RECEIVABLE_APPROVE_ROLES` (including `"ADMIN"`), `RECEIVABLE_REPAYMENT_ROLES` (including `"ACCOUNTANT"` and `"FINANCE"`, excluding `"TELLER"`/`"SENIOR_TELLER"`), and `resolveReceivableTenantId` from `EmployeeReceivableService.ts` and wired them into `server.ts`.
  - Enforced dual-field `businessId` / `business_id` consistency across `server.ts`, `serverApprovalRoutes.ts`, `EmployeeReceivableService.ts`, `EmployeeReceivableRepository.ts`, `InvitationService.ts`, and `ForeignKeyIntegrityValidator.ts`.
- **D1.1-R-06 (Error Response Sanitization & Real `createApp()` Security Test Suite)**:
  - Sanitized 4xx/500 error responses in `serverApprovalRoutes.ts` and `server.ts` so raw `err.message` strings are never leaked to clients.
  - Updated `src/tests/unit/security/PhaseD1AuthMultiTenant.test.ts` to mount and test the real `createApp()` from `server.ts` across 30 tests (75/75 passing across all 6 security/integration suites).

## [4.2.1] - 2026-10-07
### Enacted & Verified (Phase 15.2R — Independent Runtime Verification & Phase Closure)
- **Official Phase Verdict**: `VERIFIED WITH LIMITATIONS`.
- **Defect Resolution**: `DEF-15.1-01 — CLOSED / REMEDIATED`.
- **Accounting Invariants Verified**:
  - Full statutory liability settlements (DR 2100_ONA_TAXES_PAYABLE / CR 1010_BANK, DR 2110_OFATMA_TAXES_PAYABLE / CR 1010_BANK) produce 0 HTG additional P&L expense, valid treasury cash outflows, and proper liability reductions.
  - Net salary settlements (DR 2100_PAYROLL_CLEARING / CR 1010_BANK) produce 0 HTG additional P&L expense and 92,000 HTG cash outflow.
  - Canonical Golden Payroll V1 expense strictly maintained at 109,000 HTG.
  - Subsequent-period protection: October-only remittances yield 0 HTG P&L expense (rejects 17k, 109k, 126k, 218k).
  - Mixed-period reconciliation: Cumulative September–October expense remains exactly 109,000 HTG.
  - GL vs Payroll Subledger variance is 0 HTG.
  - Non-payroll TRANSFER and EXCHANGE regressions validated: general transfers and FX conversions produce 0 HTG P&L expense while genuine expenses (5100, 5900) remain recognized.
  - Cross-BI consistency: `AnalyticsEngine`, `selectSimplifiedMetrics`, and `selectExpertMetrics` produce identical figures for identical scope.
- **Evidence & Test Inventory Reconciliation**:
  - Phase 15 regression test suites (70/70 passing):
    - `Phase151CashReconciliationGate.test.ts`: 13/13 passing
    - `Phase152PayrollLiabilityRemediation.test.ts`: 21/21 passing
    - `Phase15FinancialReconciliationAudit.test.ts`: 15/15 passing
    - `Phase152RIndependentRuntimeVerification.test.ts`: 21/21 passing
  - Documented evidence boundary: application logic verified under test; real Firestore persistence, security rules, and socket disconnection recovery remain classified as `LIMITED` or `NOT_TESTED`.
  - Added ADR-011 to `docs/decision-log.md`.

## [4.2.0] - 2026-10-05
### Enacted & Validated (Phase 15.2 — Payroll Liability Settlement Remediation & DEF-15.1-01 Fix)
- **Remediation of Defect DEF-15.1-01**:
  - Eliminated erroneous blanket classification of `TRANSFER` and `EXCHANGE` transactions as payroll expenses in `AnalyticsEngine.isPayrollRelatedTransaction()`.
  - Implemented canonical chart-of-accounts evaluation distinguishing Class 2 Liabilities (`2100_ONA_TAXES_PAYABLE`, `2110_OFATMA_TAXES_PAYABLE`, `2100_PAYROLL_CLEARING`, `2000_ACCOUNTS_PAYABLE`, `2200_TAXES_PAYABLE`), Class 5 Expenses (`5100_PAYROLL_EXPENSE`, `5110_EMPLOYER_TAX_EXPENSE`, `5000_PAYROLL_EXPENSE`), and Class 10 Treasury Assets (`1010_BANK`, `1000_CASH`).
  - Enforced that balance sheet liability settlements produce exactly 0 HTG additional P&L expense, while preserving true cash outflow recognition in the canonical cash pipeline (`CanonicalCashEngine`).
  - Added guards to `computeOperationalExpenses` ensuring liability settlements and treasury movements cannot contaminate operational expenses even if labeled with type `EXPENSE`.
- **Verification & Test Suites**:
  - Created `src/tests/unit/Phase152PayrollLiabilityRemediation.test.ts` (21/21 tests passing).
  - Updated `src/tests/unit/Phase151CashReconciliationGate.test.ts` to assert resolved 0 HTG accrual expense on statutory remittances (13/13 tests passing).
  - Added ADR-010 to `docs/decision-log.md`.
  - Validated clean TypeScript compilation (`tsc --noEmit`) and clean production build.

## [4.1.0] - 2026-09-16
### Enacted & Validated (Forensic BI Date-Integrity Remediation & SSOT Alignment)
- **Forensic Root Cause Remediation**:
  - **RC-01 & RC-04 (Inclusive Fall-Through Elimination)**: Replaced permissive `if (!date) return true;` pattern with canonical `matchesDateFilter` in `src/utils/dateNormalization.ts`. Records lacking valid dates are strictly excluded whenever a date range filter is active.
  - **RC-02 (Canonical Date Resolvers)**: Standardized multi-field date extraction across all domains:
    - `resolveAnalyticsTxDate`: Enforces cash-basis (settlement/payment date) vs accrual-basis (accounting date) rules.
    - `resolveAnalyticsAttendanceDate`: Enforces pointage/work date vs document metadata dates.
    - `resolveAnalyticsPayrollDate`: Enforces payment disbursement date vs accrual period end.
  - **RC-03 & RC-05 (SSOT Alignment in `Vue d'ensemble`)**: Connected `useBIDataAggregation` directly to `AnalyticsEngine.generateSnapshot` (`computedSnapshot`/`effectiveSnapshot`) for filtered views, eliminating dual calculation drift.
  - **RC-06 (Active Headcount Leakage Fix)**: Prevented total enterprise employee roster fallback from leaking into filtered periods with no attendance/payroll activity.
  - **Trend Bucket Asymmetry & Cash-on-Hand Protection**: Corrected future transaction date leakage in `AnalyticsEngine` cash-on-hand calculation and unified custom period bucket matching.
- **Verification & Test Suite**:
  - Added dedicated forensic test suite `src/tests/unit/ForensicDateFilteringIntegrity.test.ts` (9 tests passing).

## [4.0.0] - 2026-09-14
### Enacted & Certified (FINOPS v4.0 Certified Baseline & Architecture Freeze)
- **Official Certification Verdict**: `A — ACCOUNTING SAFE / SSOT CERTIFIED — WITHIN AUDITED SCOPE`.
- **Audit Taxonomy Introduced**:
  - Distinguishes **CERTIFIED** (Phase 5 empirical audit proof, 18/18 P0 gates), **PROTECTED** (architectural rules such as append-only reversals and maker-checker), **VERIFIED** (regression-tested during freeze), **DEFERRED** (Phase 6 roadmap), and **OPEN** (external scope).
  - Clarified Haitian statutory payroll rules as technically verified under test while maintaining independence from external statutory regulatory audits.
- **Change-Control Governance Hierarchy**:
  - Established 5 change-control governance levels (Level 0 Frozen Core, Level 1 Restricted Engine & Security, Level 2 Canonical Domain Services, Level 3 Presentation & BI, Level 4 Platform Extensions & Adapters), decoupling change control from component type.
  - Enacted mandatory formal re-certification gate for `AnalyticsEngine` and derived financial KPI calculations.
- **Phase 6 Governance Model Codified**:
  - Formally closed Phase 5. Phase 6 operates strictly under the "Certified Core Extension" model: develop *around* the Certified Core without modifying or redefining core accounting mechanics.
- **Formal Certified Baseline Specification**:
  - Published comprehensive baseline specification in `docs/FINOPS_CERTIFIED_BASELINE.md`.
  - Added ADR-009 to `docs/decision-log.md`.
- **Audit Verification Results**:
  - `tsc --noEmit`: 0 errors across entire workspace.
  - Vitest regression suite: 59/59 test suites passed, 342/342 tests passing.
  - Full production build: Clean client and server bundles (`dist/`, `dist/server.cjs`).
  - Runtime health: HTTP 200 on `/` and `/api/health`.

## [2.10.0] - 2026-09-12

### Added & Validated (Cash Basis Architecture — Phase 1 Foundation & Phase 2 Adapters)
- **Phase 1: Canonical Contract & Treasury Classification**:
  - Implemented `NormalizedCashMovement` canonical contract with strict Zod validation schema (`src/domains/cash/validation/normalizedCashMovement.schema.ts`).
  - Implemented hybrid `TreasuryClassification` engine (`src/domains/cash/classification/TreasuryClassification.ts`) matching SSOT chart of accounts codes (`1000_CASH`, `1010_BANK`), Class 10 prefixes, and explicit payment methods.
  - Implemented deterministic ID generation (`generateCashMovementId`) incorporating direction and optional payment events.
  - Added 25 unit tests covering contract invariants and classification logic.
- **Phase 2: Operational Source Adapters (`src/domains/cash/adapters/`)**:
  - `PayrollCashAdapter`: Normalizes actual disbursed payroll records (`OUTFLOW`, `PAYROLL`) using true settlement dates (`paidAt`, `disbursedAt`). Strictly rejects accrual end dates.
  - `InvoiceCashAdapter`: Normalizes actual cash collections from customer invoices (`INFLOW`, `INVOICE_COLLECTION`), supporting multiple partial payment events and linking to transaction IDs. Strictly ignores unpaid accrual invoices.
  - `LedgerCashAdapter`: Normalizes General Ledger entries touching treasury accounts, classifies internal transfers (`TRANSFER`), supports both consolidated transfer movements and split legs (`OUTFLOW`/`INFLOW`), and extracts deduplication metadata.
  - Added 21 unit tests in `src/tests/unit/cash/CashAdapters.test.ts` (46 cash unit tests total, 100% passing).

## [2.9.0] - 2026-09-10
### Fixed & Enhanced (Personnel Profile Actions & Official Payslip Generation)
- **Personnel Profile Pane Action Buttons Integration**:
  - Connected the "Fiche HR Complète" button in `ConnectedPersonnel.tsx` directly to the `EmployeeProfileDialog` modal component, supported at both the local module layer and the parent `DashboardShell` orchestrator layer.
  - Replaced the no-op state setter in `DashboardShell.tsx` (`setFocusedEmployeeIdForProfile`) with an active state handler and rendered the full profile dialog with live employee, ledger, and payroll record bindings.
  - Fixed defensive property resolution in `DepartmentAliasEngine.ts` and `EmployeeProfileDialog.tsx` to handle legacy documents gracefully without undefined attribute errors.
- **Resilient Payslip PDF Generation (`exportPayslipPdf`)**:
  - Upgraded PDF export with error handling, loading states, and direct blob URL download fallback when standard browser popups are blocked.
  - Added user feedback toasts (`payslipToast`) notifying users upon successful PDF download or alerting them with explicit diagnostic messages.

## [2.8.0] - 2026-09-06
### Audited, Corrected & Documented (General Ledger / Grand Livre Comptable Module)
- **General Ledger Full Forensic Audit**:
  - Conducted complete audit across Firestore persistence (`ledger_transactions`), repository layers, CSV bulk import pipeline, filtering engine (`LedgerFilterEngine.ts`), and UI rendering (`FinanceLedger.tsx`).
- **Date Range & Filter Unification (SSOT)**:
  - Fixed UTC midnight date cutoff bug where transactions on the `endDate` boundary were accidentally filtered out.
  - Standardized date extraction across all formats (ISO strings, `"YYYY-MM-DD"`, timestamps, and Firestore Timestamps) using `extractTxDateString`.
  - Refactored `useLedgerTransactions` hook and `LedgerRepository.listByBusiness` to delegate filtering to `filterLedgerTransactions` in `LedgerFilterEngine.ts` (SSOT).
  - Protected `CUSTOM` date range filters from being overwritten by month picker effects.
- **Forensic Audit & Event Trail Instrumentation**:
  - Verified atomic batch writing and forensic log generation in `forensic_logs` for both manual entries and bulk CSV imports.
  - Maintained structured `console.debug` forensic logging across write preparation, event emission (`GL_IMPORT_COMPLETED`), event interception, and filter execution.
- **Architectural Documentation**:
  - Created `docs/architecture/LEDGER_MODULE.md` specifying data models, date normalization, query pipeline, security rules, and performance optimization.
  - Updated `docs/architecture/BULK_IMPORT_LEDGER.md` with audit verification details.

## [2.7.0] - 2026-09-06
### Added & Corrected (Bulk Import Visibility & Ledger Date Synchronization)
- **Automatic Date Filter Alignment**:
  - `BulkTransactionImportDialog.tsx` extracts min and max dates from imported batch and publishes `GL_IMPORT_COMPLETED` on runtime `EventBus`.
  - `FinanceLedger.tsx` automatically updates active date filters (`startDate` and `endDate`) upon receiving `GL_IMPORT_COMPLETED` or completing CSV import.
- **Persistent Filter Store (`src/contexts/FilterContext.tsx`)**:
  - Integrated `localStorage` persistence (`finops_filter_store`) for namespace filters (`gl`), preserving user date selections and active filter configurations across sessions.
- **Contextual Zero-Records Banner (`FinanceLedger.tsx`)**:
  - Enhanced the zero-records alert banner when filters yield 0 transactions while database records exist.
  - Displays global available date bounds (`allTxDates.min` to `allTxDates.max`) and provides quick actions to switch the active period or reset filters.
- **Architectural Documentation (`docs/architecture/BULK_IMPORT_LEDGER.md`)**:
  - Created architectural specification detailing import payload lifecycle, date alignment, event contracts, and filter engine rules.

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
