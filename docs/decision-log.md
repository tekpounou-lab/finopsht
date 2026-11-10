# FINOPS ERP — Architecture Decision Records (ADR)

## ADR-001: Encapsulation of Firestore Access in Repository Pattern
- **Date**: 2026-07-21
- **Status**: Accepted
- **Context**: Direct Firestore calls inside React components led to duplicate code, missing error handling, and broken multi-tenant scoping.
- **Decision**: Ban direct Firestore SDK calls in React components/hooks. All persistence operations must go through `src/repositories/`.
- **Consequences**: Improved testability, centralized error handling via `handleFirestoreError`, enforced multi-tenancy.

---

## ADR-002: Survival Floor Protection in Payroll Engine
- **Date**: 2026-07-24
- **Status**: Accepted
- **Context**: Statutory labor laws require a minimum net living wage (15,000 HTG floor) after taxes and salary advances.
- **Decision**: Implemented automatic survival floor calculation inside `PayrollCalculationEngine.ts`.
- **Consequences**: Net payouts below 15,000 HTG are flagged and adjusted if gross pay satisfies eligibility rules.

---

## ADR-003: Cryptographic SHA-256 Audit Seals on Financial Transactions
- **Date**: 2026-07-26
- **Status**: Accepted
- **Context**: Financial audits require immutable proof against database record tampering.
- **Decision**: Every posted ledger entry and sealed payroll cycle calculates a SHA-256 signature combining record attributes and timestamps.
- **Consequences**: Forensics console can detect database modification anomalies instantly.

---

## ADR-004: In-Flight Request Deduplication in Resilient Firestore Layer
- **Date**: 2026-08-27
- **Status**: Accepted
- **Context**: Simultaneous component mounts and identity resolution cycles triggered duplicate network reads for identical document paths and queries.
- **Decision**: Integrated in-flight promise maps (`inFlightDocPromises`, `inFlightQueryPromises`) and 20s memory caching into `resilientFirestore.ts`.
- **Consequences**: Eliminated network thundering herd problem; concurrent identical reads share a single promise and cached result.

---

## ADR-005: Deterministic Local Heuristic Fallback for AI CFO Engine
- **Date**: 2026-08-27
- **Status**: Accepted
- **Context**: When cloud AI API quotas (429) or monthly spend caps are reached, executive users experienced service disruption.
- **Decision**: Implemented automatic fallback routing in `server.ts` to `FinancialRatioEngine.ts` whenever the Gemini API returns quota or spending cap warnings.
- **Consequences**: Zero downtime for financial analytics; users receive accurate deterministic ratios and financial health indicators offline.

---

## ADR-006: Direct Manual Employee Registration & Waiting Room State Machine
- **Date**: 2026-08-27
- **Status**: Accepted
- **Context**: Employees without Google accounts (e.g. iCloud users) needed a straightforward sign-up path, while preventing uninvited users from accessing sensitive tenant data.
- **Decision**: Added direct email/password sign-up in `UnifiedAuthPortal`. If an active invitation is detected, it is accepted automatically; otherwise, users are placed into `/waiting-room` with real-time Firestore listeners for owner approval.
- **Consequences**: Seamless employee onboarding without mandatory third-party OAuth, while preserving strict multi-tenant isolation.

---

## ADR-007: Device Hardware Time Synchronization for Kiosk QR Attendance
- **Date**: 2026-08-27
- **Status**: Accepted
- **Context**: Cloud server latency and regional time drift caused discrepancy in employee clock-in records on physical kiosk terminals.
- **Decision**: Embedded local device machine timestamping and timezone anchoring (`America/Port-au-Prince`) in `qrAttendanceService.ts` and `KioskAttendance.tsx`.
- **Consequences**: Accurate, dispute-free punch logs with offline-tolerant queuing.

---

## ADR-008: Cash Basis Foundation — Canonical NormalizedCashMovement & Central Treasury Classification
- **Date**: 2026-09-12
- **Status**: Accepted
- **Context**: BI Simple Mode figures previously relied on mock fallbacks, lacked a deterministic treasury account classifier, and lacked a unified canonical model for cash settlements across modules.
- **Decision**: Implemented Phase 1 of the Cash Basis Foundation:
  1. Created canonical in-memory read model `NormalizedCashMovement` (DTO) with strict Zod validation (`NormalizedCashMovementSchema`).
  2. Implemented `TreasuryClassification` using the validated Hybrid Strategy (Option E: Chart of Accounts codes `1000_CASH`, `1010_BANK`, prefix `10`, explicit payment methods `CASH`, `BANK`, `MOBILE_MONEY`, and token heuristics).
  3. Established pure deterministic ID generation `generateCashMovementId` without random timestamps or mock fallbacks.
  4. Enforced strict financial integrity rules: no silent zeroing of corrupt data, integer cents precision (`amountCents`), multi-tenancy preservation (`businessId`), and non-impact of internal transfers on consolidated cash flow.
- **Consequences**: Foundation established for Phase 2 adapters (`PayrollCashAdapter`, `InvoiceCashAdapter`, `LedgerCashAdapter`) without modifying existing accrual engines or database schemas.

---

## ADR-009: Formal Certified Baseline & Financial Core Architecture Freeze (v4.0)
- **Date**: 2026-09-14
- **Status**: Accepted
- **Context**: FINOPS ERP / FINAYITI Fusion v4.0 completed its comprehensive accounting/SSOT certification cycle (342/342 unit/integration tests passing, 0 TypeScript errors, clean production build, verified Firestore security rules and OCC concurrency). To prepare for Phase 6 product expansion without risking regression of the certified financial core, a formal architecture freeze and change-control policy is required.
- **Decision**: Formally enacted the Certified Baseline specification in `docs/FINOPS_CERTIFIED_BASELINE.md`:
  1. Classified system components into strict **Change-Control Governance Levels** (Level 0 Frozen Core, Level 1 Restricted Engine & Security, Level 2 Canonical Domain Services, Level 3 Presentation & BI, Level 4 Platform Extensions & Adapters), decoupling change-control governance from component type/importance.
  2. Mandated that `AnalyticsEngine` and derived financial KPI calculations remain subject to mandatory formal re-certification upon any change.
  3. Established a 5-tier **Audit Taxonomy** distinguishing invariants that are **CERTIFIED** (empirically proven in Phase 5 audit), **PROTECTED** (non-negotiable architectural rules), **VERIFIED** (regression-tested during freeze), **DEFERRED** (known Phase 6 roadmap items like FX gain/loss), and **OPEN** (outside certified core).
  4. Established the canonical General Ledger (`ledger_transactions`) as the single source of truth (SSOT) from which all analytics and reporting derive.
  5. Formally closed Phase 5 and enacted the "Certified Core Extension" governance model for Phase 6.
- **Consequences**: Guaranteed protection of certified accounting logic and financial invariants during all future Phase 6 product iterations.

---

## ADR-010: Strict Separation of Payroll Expense Recognition from Balance Sheet Liability Settlements (DEF-15.1-01)
- **Date**: 2026-10-05
- **Status**: Accepted
- **Context**: In Phase 15.1, forensic auditing revealed defect `DEF-15.1-01`: `AnalyticsEngine.isPayrollRelatedTransaction()` treated all transactions with `type === "TRANSFER"` or `type === "EXCHANGE"` as payroll-related transactions. As a consequence, subsequent statutory liability settlements (e.g. `DEBIT 2100_ONA_TAXES_PAYABLE / CREDIT 1010_BANK` or `DEBIT 2110_OFATMA_TAXES_PAYABLE / CREDIT 1010_BANK`) were incorrectly aggregated into `curGlPayrollExp`, creating a second fictitious P&L expense in later periods.
- **Decision**: Implemented canonical accounting class evaluation:
  1. Classified transactions based on economic effect using Chart of Accounts semantics (Class 2 Liabilities vs. Class 5 Expenses vs. Class 10 Treasury Assets).
  2. Defined `isLiabilityAccount` to identify Class 2 balance sheet liability accounts (`2100_ONA_TAXES_PAYABLE`, `2110_OFATMA_TAXES_PAYABLE`, `2100_PAYROLL_CLEARING`, `2000_ACCOUNTS_PAYABLE`, `2200_TAXES_PAYABLE`).
  3. Defined `isPayrollExpenseTransaction` to enforce that debits to Class 2 liability accounts are recognized as liability settlements (reducing balance sheet liabilities) and produce exactly 0 HTG additional P&L expense.
  4. Preserved legitimate payroll expense recognition for debits to Class 5 accounts (`5100_PAYROLL_EXPENSE`, `5110_EMPLOYER_TAX_EXPENSE`, `5000_PAYROLL_EXPENSE`).
  5. Preserved the treasury cash pipeline in `CanonicalCashEngine`, ensuring actual cash outflows (e.g. 17,000 HTG for statutory remittances) continue to be recognized accurately under cash-basis accounting.
- **Consequences**: Complete elimination of double-counting in subsequent periods. Profit vs. Net Cash Flow semantic separation is formally preserved. Accrual snapshots reflect true economic expenses without contamination from treasury or balance sheet settlement events.

---

## ADR-011: Phase 15.2R Independent Runtime Verification & Closure of DEF-15.1-01
- **Date**: 2026-10-07
- **Status**: Accepted (Verified with Limitations)
- **Context**: Following remediation of DEF-15.1-01 in Phase 15.2, Phase 15.2R executed an independent forensic runtime verification to establish accounting invariants, SSOT alignment, and regression immunity across all financial and BI layers.
- **Decision**: Formally recorded the Phase 15.2R verdict and test inventory:
  1. **Accounting Invariants Formally Verified**:
     - Canonical September payroll recognized at exactly 109,000 HTG (100,000 HTG gross + 9,000 HTG employer taxes).
     - Net salary and statutory liability settlements (92,000 HTG salary + 12,000 HTG ONA + 5,000 HTG OFATMA = 109,000 HTG) produce exactly 0 HTG additional P&L expense and 109,000 HTG Treasury cash outflow.
     - Subsequent period isolation verified: October-only statutory settlements yield 0 HTG P&L expense.
     - Mixed-period reconciliation verified: September through October cumulative P&L expense remains exactly 109,000 HTG without double counting.
     - Zero difference between payroll subledger and GL payroll expense.
     - Cross-BI consistency verified across `AnalyticsEngine`, `selectSimplifiedMetrics`, and `selectExpertMetrics`.
     - Non-payroll `TRANSFER` and `EXCHANGE` regression suites verified.
  2. **Test Scope & Documentation Reconciliation**:
     - Reconciled Phase 15 regression test suites totaling 70/70 passing tests:
       - `Phase151CashReconciliationGate.test.ts`: 13 tests
       - `Phase152PayrollLiabilityRemediation.test.ts`: 21 tests
       - `Phase15FinancialReconciliationAudit.test.ts`: 15 tests
       - `Phase152RIndependentRuntimeVerification.test.ts`: 21 tests
     - Clarified that an earlier report swapped test counts between `Phase152PayrollLiabilityRemediation.test.ts` (21 tests) and `Phase15FinancialReconciliationAudit.test.ts` (15 tests); the total suite count remains strictly 70/70.
  3. **Evidence Classification & Limitations**:
     - Accounting logic, P&L neutrality, cash outflow, and BI consistency are certified at `PROVEN_UNIT / PROVEN_INTEGRATION` level.
     - Real Firestore production persistence, Firestore security-rule enforcement, authenticated cross-tenant DB isolation, and live websocket listeners remain classified as `LIMITED / NOT SUFFICIENTLY DEMONSTRATED`.
     - Physical network socket drops and unknown-commit recovery remain `NOT_TESTED`.
     - Phase 15.2R is formally closed as `VERIFIED WITH LIMITATIONS`. DEF-15.1-01 is CLOSED / REMEDIATED. No further changes to `AnalyticsEngine` are justified without an evidence-focused live runtime certification phase.



---

## ADR-012: Reservation of ERP Module & Feature Activation to Super Admin and Subscription Plans
- **Date**: 2026-10-23
- **Status**: Accepted
- **Context**: In the tenant administration center (`BusinessAdministrationCenter`), tenant owners and managers previously had access to global module toggle switches, creating a governance mismatch with Firestore rules (`match /features/{businessId} { allow write: if isSuperAdmin(); }`) and SaaS licensing boundaries.
- **Decision**:
  1. Enforced that global module and feature activation across workspaces is strictly reserved for the platform `SUPER_ADMIN` or determined automatically by the tenant's `subscription.plan` (`STARTER`, `PROFESSIONAL`, `BUSINESS`, `ENTERPRISE`).
  2. Blocked arbitrary feature mutation by non-Super-Admins in `BusinessAdministrationRepository.updateFeatures`.
  3. Updated `ModulesAndFeaturesSection` and `FeatureSubscriptionSection`:
     - Global switches are interactive only for `SUPER_ADMIN`.
     - Workspace `OWNER` users view plan inclusion badges or "Upgrade Requis" prompts.
     - Role-module authorization (`RoleModuleMatrixGrid` / RBAC) is manageable by `OWNER` strictly for modules active for their business.
---

## ADR-013: Operational RH Profile-Driven Desk Transactions & Catalog Segmentation (RH-PROFILE-01)
- **Date**: 2026-10-23
- **Status**: Accepted
- **Context**: In the Operational Desk ("Guichet Opérationnel — Nouvelle Transaction"), operational profile badges (`VENDEUR`, `TELLER`, `POLYVALENT`, `HEAD`) were displayed, but clicking or changing profiles did not constrain the form. The form was pre-filled with hardcoded values (`INCOME`, `Sales`, `Entrée en caisse (+1)`, `Imputation Automatique`), allowing tellers to post sales operations and sales staff to post money transfers without validation.
- **Decision**:
  1. **Deterministic Operational Profile Resolution**: Added `TransactionMappingEngine.resolveOperationalProfile(role, position)` to map organizational roles and position titles to operational profiles (`vendeur`, `teller`, `polyvalent`, `head_teller`). Default fallback is least-privilege (`vendeur`).
  2. **Profile-Driven Catalog Segmentation**: Added `TransactionMappingEngine.filterTypesByProfile` and `isOperationAllowedForProfile` enforcing the operational matrix:
     - `VENDEUR`: Strictly limited to `Sales` and `Services`.
     - `TELLER`: Strictly limited to `Money Transfer`, `Mobile Transfer`, and `Currency Exchange`.
     - `POLYVALENT`: Union of operational desk operations (`Sales`, `Services`, `Money Transfer`, `Mobile Transfer`, `Currency Exchange`); strictly excludes `Operating Expenses` and `Clearing`.
     - `HEAD_TELLER`: Operational categories + `Operating Expenses` (`6001`) + `Internal Transfers` (`1910`); strictly excludes `Clearing`.
     - `MANAGER` / `OWNER`: Full access to all active transaction types including `Clearing` (`2910`).
  3. **Zero Pre-fill & Dynamic Reset**: Replaced hardcoded initial state with empty/unselected defaults (`type: ''`, `category: ''`, `debit_account: ''`, `credit_account: ''`). Cash flow indicators accurately reflect unselected state (`En attente de sélection d'une opération`). Switching operational profile automatically cleanses incompatible operations and resets form state.
  4. **Privilege Escalation Prevention**: Added `canSwitchProfile(currentRole)` and `isProfileSwitchAllowed(currentRole, targetProfile)`. Operational staff (`JUNIOR_TELLER`, `SENIOR_TELLER`, standard staff) cannot switch away from their profile. Only supervisors (`HEAD_TELLER`, `MANAGER`, `OWNER`, `SUPER_ADMIN`) can switch profile contexts.
  5. **Defense-in-Depth Validation**: Enforced validation at both the modal layer (`handleSubmit` in `CreateTransactionDialog`) and page layer (`handleSaveTransaction` in `FinanceLedger`).
- **Consequences**: Strict segregation of duties at retail and banking desk points; complete prevention of cross-domain transaction misallocation; preserved double-entry accounting integrity without impacting production Firestore schema or security rules.

---

## ADR-014: Phase D1 / D1.1 / D1.2 Server Authentication, IDOR Prevention & Multi-Tenant Hardening
- **Date**: 2026-10-29
- **Status**: Accepted & Verified
- **Context**: Independent security reviews (D1-R and D1.1-R) identified server-side authentication, authorization, IDOR, and SDK usage defects across Express routes and domain services, including potential cross-tenant employee overwrite via `options.employeeId`, single-tenant invariant bypass when `business_id` existed only in Custom Claims, unauthenticated AI CFO endpoints, unauthenticated Firebase Web SDK usage on server routes, RBAC matrix drift on payroll receivables, dual-field (`businessId` vs `business_id`) ambiguity, and raw `err.message` exposure.
- **Decision**:
  1. **Revocation-Checked Authentication & Strict Tenant Binding**: Enforced `verifyIdToken(token, true)` in `serverAuthMiddleware.ts`, removed synthetic `biz_${uid}` fallbacks, rejected hybrid Claims/Firestore identity resolution, and verified active business status.
  2. **Transactional Anti-Overwrite & Single-Tenant Invariant (`D1.1-R-01`, `D1.1-R-02`)**: Enforced transactional existence/ownership verification on `employees/{employeeId}` and `businesses/{businessId}` in `ServerProvisioningService.ts`, and checked `req.user.business_id` from Custom Claims in both `ServerProvisioningService.ts` and `InvitationService.ts`.
  3. **AI CFO Route Protection (`D1.1-R-03`)**: Protected `/api/cfo/analyze` and `/api/cfo/narrative` with `authenticateToken`, removed unprefixed `/cfo/*` aliases, and bound `resolvedUserContext` strictly to `req.user`.
  4. **Firebase Admin SDK on Server Paths (`D1.1-R-04`)**: Migrated server-side execution in `EmployeeReceivableRepository`, `SnapshotRetentionManager`, `DataCleanupAndSSOTService`, and `ForeignKeyIntegrityValidator` to `getAdminFirestore()`.
  5. **Unified RBAC & Dual-Field Tenant Consistency (`D1.1-R-05`)**: Exported canonical receivable role sets from `EmployeeReceivableService.ts`, aligned `server.ts` and service checks, and rejected contradictory `businessId` vs `business_id` fields across routes, services, and repositories.
  6. **Error Sanitization & Real-App Integration Testing (`D1.1-R-06`)**: Removed raw `err.message` exposure across `serverApprovalRoutes.ts` and `server.ts`, and refactored `PhaseD1AuthMultiTenant.test.ts` to mount and test the real `createApp()` from `server.ts`.
- **Consequences**: Complete server-side tenant isolation, zero cross-tenant IDOR mutation across cash, payroll receivables, provisioning, invitations, maintenance, and AI CFO routes, verified by 75/75 passing security and integration tests against the real Express application.

---

## ADR-015: Phase D2 Migration of Till Auto-Provisioning to Controlled Server-Side Admin SDK Path
- **Date**: 2026-10-29
- **Status**: Accepted & Verified
- **Context**: `CashManagementRepository.autoProvisionTillsForBusiness` previously performed direct client-side Firestore writes (`setDoc` with `{ merge: true }`) to `cash_tills` and `branch_safes` without server-side RBAC, transactional read-before-write ownership verification, or server-enforced idempotency.
- **Decision**:
  1. **Dedicated Server Service (`ServerTillProvisioningService.ts`) & Route (`POST /api/cash/tills/auto-provision`)**: Created `ServerTillProvisioningService.autoProvisionTillsForBusiness` using `getAdminFirestore()` and `db.runTransaction(...)`, exposed via `POST /api/cash/tills/auto-provision` protected by `authenticateToken` and `resolveServerRouteTenant`.
  2. **Explicit RBAC Enforcement**: Restricted till auto-provisioning to `TILL_PROVISIONING_AUTHORIZED_ROLES` (`OWNER`, `ADMIN`, `MANAGER`, `HEAD_TELLER`, `SUPER_ADMIN`), rejecting `JUNIOR_TELLER`, `SENIOR_TELLER`, `TELLER`, `AUDITOR`, and `EMPLOYEE` with `403 FORBIDDEN_ROLE`.
  3. **Transactional Idempotency & Anti-Overwrite**: Inside `db.runTransaction` (and a per-tenant concurrency lock), all candidate `employees/{id}`, `cash_tills/{id}`, and `branch_safes/{id}` documents are read before any write. Cross-tenant document or employee IDs are rejected (`403 TENANT_OVERWRITE_FORBIDDEN`), existing tenant tills and safes are preserved untouched without resetting `balance_cents`, `status`, or `active_session_id`, and zero fictitious cash movements or GL entries are created.
  4. **Frontend Migration (`CashManagementRepository.ts`, `CashConsole.tsx`)**: Removed direct client-side `setDoc` writes from `autoProvisionTillsForBusiness` in favor of authenticated `POST /api/cash/tills/auto-provision` calls with explicit error propagation.
- **Consequences**: Complete elimination of client-side till auto-provisioning writes, strict transactional idempotency under repeated and concurrent calls, and zero cross-tenant overwrite risk.

---

## ADR-016: Phase D3 Transactional Till Closure, Pending Operations Blockade & Variance Accounting Integrity
- **Date**: 2026-10-29
- **Status**: Accepted & Verified
- **Context**: `TillSessionEngine.closeSession` previously filtered `internal_transfers` only by `status === "EXECUTED"` (allowing a till to be closed while transfers were `PENDING_APPROVAL`, `IN_TRANSIT`, or `PROCESSING`), lacked concurrency locks and transactional rollback guarantees across `till_sessions`, `cash_tills`, and `ledger_transactions`, did not validate `denominationBreakdown` totals or currency-specific denominations against `actualClosingCents`, and allowed `reopenSession` to be invoked repeatedly on an already-reopened session using non-deterministic `Date.now()` IDs.
- **Decision**:
  1. **Pending Operations Blockade (`D3-A`)**: `TillSessionEngine.closeSession` and `closeSessionWithAdmin` (`POST /api/cash/sessions/close`) inspect all `internal_transfers`, `customer_transfers`, and `teller_transactions` for the tenant without swallowing Firestore read errors, rejecting closure with `409 PENDING_TRANSFERS_BLOCKADE` if any operation involving the till or session is in a non-terminal/pending state.
  2. **Transactional Atomicity, Concurrency & Rollback (`D3-B`)**: Enforced per-session and per-till locks (`acquireLocks`), Firestore transactions (`runTransaction` / `adminDb.runTransaction`), and compensating rollback guarantees so any failure in session, till, or GL persistence restores `state_before === state_after` with zero orphan `event_outbox` or `ledger_transactions` records.
  3. **Strict Denomination, Currency & SSOT Variance Validation (`D3-C`)**: Validated safe integer cents, `HTG` vs `USD` denomination sets and sum equality (`DENOMINATION_TOTAL_MISMATCH`), `till.balance_cents === expectedClosingCents` (`TILL_BALANCE_DIVERGENCE`), and balanced variance postings exclusively to approved account `2910` (`gl_variance_${sessionId}`) without inventing unapproved accounts (`2911`/`2912`, deferred to `[REQUIRES ACCOUNTING APPROVAL]` / Phase D5).
  4. **Idempotent Maker-Checker Session Reopening (`D3-D`)**: Hardened `reopenSession` and `reopenSessionWithAdmin` (`POST /api/cash/sessions/reopen`) with tenant isolation, Maker-Checker separation (`requesterId !== approverId` and `approverId !== prevSession.teller_id`), supervisor RBAC, and deterministic ID `sess_reopen_${previousSessionId}`, rejecting duplicate reopen attempts with `409 SESSION_ALREADY_REOPENED` while preserving historical `gl_variance_${previousSessionId}` immutable.
- **Consequences**: Complete transactional and accounting integrity for Till closures and variances, verified by 16/16 adversarial and integrity tests in `PhaseD3TillClosureSecurityAndIntegrity.test.ts` and 83/83 passing tests across all cash and security suites.

---

## ADR-017: Phase D3.1 Post-D3-R Targeted Security & Financial Integrity Remediation (`D3-R-01` to `D3-R-04`)
- **Date**: 2026-10-29
- **Status**: Accepted & Verified
- **Context**: Independent security review `finops_phase_d3_r_independent_security_review.md` identified four findings blocking Phase D3 sign-off: `D3-R-01` (operator spoofing via `body.operatorId` in `POST /api/cash/sessions/close`), `D3-R-02` (`TillSessionModal.tsx` still calling client-side `closeSession`, out-of-transaction writes and orphan `event_outbox` risk on rollback, and non-transactional query reads in `closeSessionWithAdmin`), `D3-R-03` (`denominationBreakdown` optional when `actualClosingCents > 0` and missing `2` and `1` HTG coins in `TillSessionModal.tsx`), and `D3-R-04` (unverified `requesterId` in `reopenSession` and missing `ForensicLog` records on Admin SDK paths).
- **Decision**:
  1. **Operator & Approver Anti-Spoofing (`D3.1-A`)**: `POST /api/cash/sessions/close` and `POST /api/cash/sessions/reopen` reject any `body.operatorId !== req.user.uid` or `body.approverId !== req.user.uid` with `403 IDENTITY_SPOOFING_DETECTED`, derive `operatorId` and `approverId` exclusively from `req.user.uid`, and verify `authenticatedUid` inside `evaluateClosure` / `evaluateReopen`.
  2. **Frontend Migration, Full Transactional Reads & Deterministic Outbox (`D3.1-B`, `D3.1-C`, `D3.1-D`)**: Migrated `TillSessionModal.tsx` to `TillSessionEngine.closeSessionViaApi` (`POST /api/cash/sessions/close`); routed all document and collection queries inside `closeSessionWithAdmin` through `tx.get(...)` before any writes; enriched `varianceLedgerTx` via `sanitizeAndEnrichLedgerTransaction` / `validateLedgerForeignKeys`; and wrote deterministic `businesses/${businessId}/event_outbox/evt_tx_gl_variance_${sessionId}` inside the transaction (with deterministic rollback cleanup on the client path).
  3. **Mandatory Denomination Breakdown & Canonical HTG/USD Matrix (`D3.1-E`, `D3.1-F`)**: Enforced `denominationBreakdown` as mandatory whenever `actualClosingCents > 0` (`400 INVALID_DENOMINATION_BREAKDOWN` when `undefined`), while allowing `undefined` or `{}` when `actualClosingCents === 0`, and aligned `TillSessionModal.tsx` with `CANONICAL_HTG_DENOMINATIONS` (`[1000, 500, 250, 100, 50, 25, 10, 5, 2, 1]`) and `CANONICAL_USD_DENOMINATIONS` (`[100, 50, 20, 10, 5, 2, 1]`).
  4. **Requester Identity Verification & Signed Forensic Audit Trail (`D3.1-G`, `D3.1-H`)**: Verified `requesterId` against `employees/${requesterId}` and `users/${requesterId}` for existence (`404 REQUESTER_NOT_FOUND`), tenant membership (`403 TENANT_ISOLATION_VIOLATION`), active status (`403 INACTIVE_REQUESTER`), and allowed role (`403 UNAUTHORIZED_REQUESTER_ROLE`), and emitted signed `ForensicLog` records (`TILL_SESSION_CLOSED`, `TILL_SESSION_CLOSE_REFUSED`, `TILL_SESSION_REOPENED`, `TILL_SESSION_REOPEN_REFUSED`) via `ForensicLogRepository`.
- **Consequences**: Complete closure of `D3-R-01` through `D3-R-04`, verified across 21/21 test blocks (covering all 33 adversarial cases in `D3.1-I`) in `PhaseD3TillClosureSecurityAndIntegrity.test.ts` and 88/88 passing tests across all 6 cash and security suites.

---

## ADR-018: BI-P1.5 PIC Financial Integrity, Temporal Filter Unbounded Semantics & Cash/Accrual Revenue Isolation
- **Date**: 2026-11-06
- **Status**: Accepted & Verified
- **Context**: Independent investigation `FINOPS_PIC_TEMPORAL_FILTER_REVENUE_PAYROLL_INVESTIGATION.md` identified four defects causing committed July payroll or non-revenue ledger movements to surface under Revenue or mismatch across Performance Intelligence Center (PIC) and Analytics snapshots when date filters were cleared (`period: "all"` / `startDate: "", endDate: ""`) or restored from stale `localStorage` sessions:
  1. **`DEF-TF-01` (Temporal Filter Fallback Collision)**: `AnalyticsEngine.getPeriodRanges` silently fell back to the current calendar month when `period === "CUSTOM"` had empty `startDate`/`endDate`, clashing with unbounded selector filtering (`selectFilteredDataSet`), while `AnalyticsContext`, `useBIDataAggregation`, and `usePerformanceData` coerced or dropped empty `""` date bounds.
  2. **`DEF-REV-01` (Subledger Department Revenue Contamination)**: `AnalyticsEngine.generateSnapshot` summed commercial employee sales attribution (`salesFromPayroll` from `payroll_records.sales_cents` / `salesHtg`) into `departmentPerformance[].revenue` and skipped employee-linked GL income whenever `salesFromPayroll !== 0`.
  3. **`DEF-CASH-01` (Cash-Basis & Accrual Inflow Classification Spill)**: `LedgerCashAdapter.adaptTransaction` classified any non-transfer transaction with a Class 10 Treasury debit (`isDebitTreasury && !isCreditTreasury`) as `direction: "INFLOW"`, allowing payroll clearing/liability credits (`2100_PAYROLL_CLEARING`, `421`, `431`, `44x`), penalties, refunds, or one-sided transfers to inflate Cash-Basis Revenue (`cashStatement.totalInflow`), while `AnalyticsEngine.isIncomeTx` matched any `4*` credit account prefix including French/Haitian PCG `421`/`431`/`44x`.
  4. **`DEF-LS-01` (Stale `localStorage` Filter Restoration)**: `ExecutiveFilterContext` restored `finops_executive_filters_v3` across days/sessions without expiration or calendar validation, silently re-applying historical July dates on mount.
- **Decision**:
  1. **Strict Unbounded & Open-Ended Temporal Semantics (`DEF-TF-01`)**: Added `"ALL"` to `AnalyticsPeriod`, removed silent current-month fallback from `AnalyticsEngine.getPeriodRanges` for `"CUSTOM"` and `"ALL"` (returning exact bounded/open strings and empty `previous` range so no phantom prior period is fabricated), guarded `prevTxs`/`prevAttendance`/`prevPayroll`/`prevCashStatement`/`allTxsUpToPrevious` via `hasPreviousPeriod`, derived dataset-scoped effective cash/attendance/trend spans when unbounded, preserved `""` bounds across `AnalyticsContext`, `useBIDataAggregation`, and `usePerformanceData`, and aligned `selectExpertMetrics` (`src/domains/performance/selectors/index.ts`) + `usePerformanceData.ts` to propagate `accountingBasis`/`accountingMode` consistently with `selectSimplifiedMetrics`.
  2. **Pure GL/Cash Department Revenue Isolation (`DEF-REV-01`)**: Removed `salesFromPayroll` from `departmentPerformance[].revenue` in `AnalyticsEngine.ts` (preserving `employeeScorecards[].salesVolume` for commercial commission attribution) and aligned `departmentPerformance[].revenue` with mode-aware accounting SSOT (`CanonicalCashEngine` inflows in `CASH` mode; all posted non-reversed `isIncomeTx(t)` entries in `ACCRUAL` mode).
  3. **Strict Treasury Inflow & Credit Account Guardrails (`DEF-CASH-01`)**: Hardened `LedgerCashAdapter.adaptTransaction` (Case 3) to reject active (`!isReversed`) non-revenue Treasury debits (payroll/social/bonus/penalty/compensation entries, `2xxx`/`42x–49x`/`5xxx`/`6xxx`/clearing/payable/tax credit accounts, and `TRANSFER`/`EXPENSE`/`REFUND`/`CORRECTION`/`ADJUSTMENT`/`ADVANCE` types) as `IGNORED` while preserving `REVERSED` audit records (`0` net cash impact) and legitimate `PAYROLL_RECOVERY` repayments against `1310_EMPLOYEE_RECEIVABLES`; tightened `AnalyticsEngine.isIncomeTx` credit account matching to `^4[01]\d*` and `7*`.
  4. **Session-Bounded & Validated Filter Persistence (`DEF-LS-01`)**: Replaced static module-level `defaultFilters` with `createDefaultExecutiveFilters(refDate)`, stamped persisted entries with `_persistedAt` and `_persistedDate`, expired cross-day or `> 12h` or un-timestamped/legacy-v2 entries while preserving safe preferences (`accountingBasis`, `presentationMode`), validated ISO calendar dates and `startDate <= endDate`, and exposed `clearPersistedFilters` in `ExecutiveFilterContext`.
- **Consequences**: Complete elimination of payroll-to-revenue leakage across Cash and Accrual modes, 100% alignment between PIC selectors and `AnalyticsEngine` SSOT across bounded, open-ended, and unbounded (`all`) date filters, and safe cross-session filter initialization.

