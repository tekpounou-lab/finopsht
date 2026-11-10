# FINOPS ERP — Security, Audit & Cryptographic Standards

## Overview

Security in FINOPS ERP covers multi-tenant isolation, cryptographically signed forensic audit logs, sensitive action verification, and strict Firestore Security Rules.

---

## 1. SHA-256 Forensic Audit Vault

- All high-security actions (Payroll locking, manual salary override, ledger posting, system configuration edits) emit a signed `ForensicLog` record.
- **Hash Signature Format**:
  $$\text{Signature} = \text{SHA256::}(\text{businessId} + \text{userId} + \text{action} + \text{timestamp} + \text{payload})$$
- The `SaaSLicensingConsole.tsx` (Phase 5 Vault) provides an automated integrity verification tool to detect tampered log chains.

---

## 2. Pessimistic Locking Strategy & Safety Interlocks

- During final payroll calculation, the tenant's payroll cycle transitions to `PESSIMISTIC_LOCKED`.
- While in `PESSIMISTIC_LOCKED` state, timecard modifications, bonus additions, and leave approvals are rejected at both the UI and Repository levels.
- **Auto-Expiration Timeout**: To prevent indefinite lockouts due to network failures or abandoned sessions, the locking mechanism implements an active TTL. The duration is configurable by an administrator (default 30 minutes, options from 5 minutes to 2 hours). A background cleanup daemon (SRE Cron Daemon) monitors active locks and automatically releases stale locks, logging `CYCLE_LOCK_AUTO_EXPIRED` to the Forensic Audit Vault with a SHA-256 seal.
- **Emergency Bypass & Override**: In critical situations (e.g., synchronization failure or force majeure), an authorized system administrator can invoke an emergency bypass. This manual override requires entering a legal justification, which immediately forces a lock release and publishes a cryptographically signed `CYCLE_LOCK_FORCE_RELEASED` log to the Forensic Vault.

---

## 3. Firestore Security Enforcement

- Security rules in `firestore.rules` prohibit cross-tenant access (`resource.data.business_id == request.auth.token.business_id`).
- Write operations on sealed records (e.g. sealed payroll cycles, posted ledger transactions) are rejected at the database engine level.

---

## 4. Super Admin Security Center & SecurityRepository (SSOT)

- **Collection**: `/security_alerts/{alertId}` (Firestore SSOT).
- **System Config**: `/system_config/platform_security_policy` (Global multi-tenant security policies).
- **SecurityRepository API**:
  - `getSecurityAlerts()`, `createSecurityAlert()`, `acknowledgeSecurityAlert()`, `resolveSecurityAlert()`
  - `suspendUserAccount()`, `resetUserMFA()`
  - `getSecurityPolicy()`, `updateSecurityPolicy()`
  - `verifyVaultIntegrity()`: real-time SHA-256 validation across forensic log entries.
- **Zero Mock Data Directive**: All alerts, incident resolutions, user suspensions, and global policies are persisted directly to Firestore with cryptographically signed forensic audit logs.

---

## 5. Server Authentication, IDOR Prevention & Multi-Tenant Isolation (Phase D1 / D1.1 / D1.2)

- **Firebase ID Token Revocation & Status Verification (`serverAuthMiddleware.ts`)**:
  - All protected `/api/*` endpoints verify Firebase ID tokens via `getAdminAuth().verifyIdToken(token, true)` (`checkRevoked = true`).
  - Explicitly distinguishes and rejects revoked tokens (`401 TOKEN_REVOKED`), disabled Firebase Auth accounts (`401 USER_DISABLED`), and suspended Firestore user records (`403 ACCOUNT_SUSPENDED`).
  - Eliminated synthetic `biz_${uid}` fallbacks; non-SuperAdmin requests without a verified, active tenant binding are rejected (`403 TENANT_BINDING_REQUIRED` or `403 TENANT_INACTIVE`).
  - Hybrid identity/tenant attribution is forbidden: if both Custom Claims and `users/{uid}` specify a tenant or role, any discrepancy is rejected (`403 TENANT_MISMATCH`).
- **Single-Tenant Membership Invariant & Anti-Overwrite Provisioning (`ServerProvisioningService.ts`, `InvitationService.ts`)**:
  - `POST /api/provisioning/create-business` and `POST /api/invitations/accept` enforce single-tenant membership across both Firestore `users/{uid}` and Firebase Auth Custom Claims (`req.user.business_id`), even when `users/{uid}` does not yet exist (`403 USER_ALREADY_BOUND_TO_TENANT` / `403 TENANT_CONFLICT_EXISTING_MEMBERSHIP`).
  - Inside `db.runTransaction`, `ServerProvisioningService.provision` reads `businesses/${businessId}` and `employees/${employeeId}` before writing, rejecting any cross-tenant or cross-user overwrite via `options.businessId` or `options.employeeId` (`403 TENANT_OVERWRITE_FORBIDDEN`).
- **AI CFO Endpoint Authentication & Context Binding (`server.ts`)**:
  - `POST /api/cfo/analyze` and `POST /api/cfo/narrative` require `authenticateToken`; unprefixed `/cfo/*` route aliases have been removed.
  - `resolvedUserContext` (`userId`, `userEmail`, `role`, `businessId`) is derived exclusively from `req.user`, blocking client-side `userContext` role escalation, UID spoofing (`403 IDENTITY_SPOOFING_DETECTED`), and cross-tenant `businessId` targeting (`403 FORBIDDEN_TENANT_ACCESS`).
- **Admin SDK Server Persistence & Dual-Field Tenant Consistency**:
  - Server-side execution paths for `EmployeeReceivableRepository`, `SnapshotRetentionManager`, `DataCleanupAndSSOTService`, and `ForeignKeyIntegrityValidator` use `getAdminFirestore()` (`firebase-admin`) instead of the unauthenticated Web SDK.
  - Contradictory dual-field tenant identifiers (`businessId !== business_id`) in request payloads or persisted documents are rejected with `403 FORBIDDEN_TENANT_ACCESS` / `TENANT_ISOLATION_VIOLATION`.
- **Sanitized Error Responses**:
  - Express route handlers and the global `/api` error handler sanitize all 4xx/500 responses so raw internal `err.message` strings are never leaked to clients.

---

## 6. Server-Controlled Till & Safe Auto-Provisioning (Phase D2)

- **Controlled Server Route (`POST /api/cash/tills/auto-provision`)**:
  - Migrated `CashManagementRepository.autoProvisionTillsForBusiness` from client-side Firestore `setDoc` writes to a dedicated server route (`server.ts`) backed by `ServerTillProvisioningService` (`src/services/business/ServerTillProvisioningService.ts`) and Firebase Admin SDK (`getAdminFirestore()`).
  - Enforces `authenticateToken` (`verifyIdToken(token, true)`), resolves the tenant strictly from `req.user` via `resolveServerRouteTenant` (with controlled `SUPER_ADMIN` override), and enforces RBAC via `TILL_PROVISIONING_AUTHORIZED_ROLES` (`OWNER`, `ADMIN`, `MANAGER`, `HEAD_TELLER`, `SUPER_ADMIN`), rejecting unauthorized roles (`JUNIOR_TELLER`, `SENIOR_TELLER`, `TELLER`, `AUDITOR`, `EMPLOYEE`) with `403 FORBIDDEN_ROLE`.
- **Transactional Idempotency, Anti-Overwrite & Zero Financial Side Effects**:
  - Executes inside a per-tenant lock and `db.runTransaction`, reading all candidate `employees/{id}`, `cash_tills/{id}`, and `branch_safes/{id}` documents before any write.
  - Rejects any document ID or employee ID already bound to another tenant with `403 TENANT_OVERWRITE_FORBIDDEN` (`state_before === state_after`).
  - Preserves existing tills and safes of the same tenant without overwriting critical fields (`balance_cents`, `status`, `active_session_id`, `created_at`, `updated_at`), and never creates fictitious cash movements, sessions, or General Ledger entries.

---

## 7. Transactional Till Session Closure, Pending Transfer Blockade & Variance Accounting Integrity (Phase D3 & D3.1)

- **Strict Operator & Approver Identity Binding (`D3.1-A`, Remediates `D3-R-01`)**:
  - `POST /api/cash/sessions/close` and `POST /api/cash/sessions/reopen` never trust `body.operatorId` or `body.approverId` from the client.
  - Any request supplying `body.operatorId !== req.user.uid` (on close) or `body.approverId !== req.user.uid` (on reopen) is immediately rejected with `403 IDENTITY_SPOOFING_DETECTED`, logged to `forensic_logs`, and leaves financial state untouched (`state_before === state_after`).
  - `operatorId` and `approverId` are derived exclusively from `req.user.uid`, ensuring `gl_variance_${sessionId}.signerId` and `closed_by` / `reopened_by` are cryptographically bound to the authenticated Firebase user.
- **Frontend Migration to Controlled Server Endpoint (`D3.1-B`, Remediates `D3-R-02`)**:
  - `TillSessionModal.tsx` invokes `TillSessionEngine.closeSessionViaApi(...)` (`POST /api/cash/sessions/close` with `Authorization: Bearer <token>` and `x-business-id`), eliminating direct client-side Firestore writes from the UI closure flow.
- **Pending Operations Blockade & Transactional Read Isolation (`D3-A`, `D3.1-D`, Remediates `D3-R-02`)**:
  - Inside `adminDb.runTransaction(async (tx) => ...)`, `TillSessionEngine.closeSessionWithAdmin` executes all document and collection queries (`sessionRef`, `tillRef`, `varianceGlRef`, `outboxRef`, `teller_transactions`, `internal_transfers`, `customer_transfers`) strictly via `tx.get(...)` before any `tx.set(...)`.
  - Any internal transfer involving the till (`source_id === till.id || destination_id === till.id`) not in a terminal state (`EXECUTED`, `REJECTED`, `CANCELLED`) or any session-linked customer transfer / teller transaction in a pending/processing state blocks closure with `409 PENDING_TRANSFERS_BLOCKADE` (`state_before === state_after`).
- **Transactional Atomicity, Outbox Synchronization & Rollback (`D3-B`, `D3.1-C`, Remediates `D3-R-02`)**:
  - Both `closeSessionWithAdmin` and `closeSession` enrich and validate `varianceLedgerTx` via `sanitizeAndEnrichLedgerTransaction` and `validateLedgerForeignKeys`, and write `till_sessions/${sessionId}`, `cash_tills/${tillId}`, `ledger_transactions/gl_variance_${sessionId}`, and `businesses/${businessId}/event_outbox/evt_tx_gl_variance_${sessionId}` atomically inside the transaction (with deterministic outbox cleanup on client rollback), preventing any partial state or orphan `event_outbox` record.
- **Mandatory Denomination Breakdown & Canonical Currency Matrix (`D3-C`, `D3.1-E`, `D3.1-F`, Remediates `D3-R-03`)**:
  - When `actualClosingCents > 0`, `denominationBreakdown` is strictly mandatory (`400 INVALID_DENOMINATION_BREAKDOWN` if `undefined` or non-object; `400 DENOMINATION_TOTAL_MISMATCH` if `{}` or mismatched sum). When `actualClosingCents === 0`, `undefined` or `{}` is accepted.
  - `CANONICAL_HTG_DENOMINATIONS` (`[1000, 500, 250, 100, 50, 25, 10, 5, 2, 1]`, including `2` and `1` HTG coins) and `CANONICAL_USD_DENOMINATIONS` (`[100, 50, 20, 10, 5, 2, 1]`) are shared between `TillSessionEngine.ts` and `TillSessionModal.tsx`.
  - Variance postings remain strictly restricted to approved account `2910` (`Compte d'Attente Écarts de Caisse`) against `1010` (`HTG`) or `1020` (`USD`).
- **Controlled Session Reopening, Requester Identity Validation & Forensic Audit Trail (`D3-D`, `D3.1-G`, `D3.1-H`, Remediates `D3-R-04`)**:
  - `POST /api/cash/sessions/reopen` (`reopenSessionWithAdmin` / `reopenSession`) verifies `requesterId` against `employees/${requesterId}` and `users/${requesterId}` inside the transaction, rejecting non-existent requesters (`404 REQUESTER_NOT_FOUND`), cross-tenant requesters (`403 TENANT_ISOLATION_VIOLATION`), inactive/suspended requesters (`403 INACTIVE_REQUESTER`), and unauthorized roles (`403 UNAUTHORIZED_REQUESTER_ROLE`).
  - Enforces Maker-Checker separation (`requesterId !== approverId` and `approverId !== prevSession.teller_id`), supervisor RBAC (`HEAD_TELLER`, `MANAGER`, `OWNER`, `SUPER_ADMIN`), deterministic ID `sess_reopen_${previousSessionId}` (`409 SESSION_ALREADY_REOPENED`), and emits signed `ForensicLog` records (`TILL_SESSION_CLOSED`, `TILL_SESSION_CLOSE_REFUSED`, `TILL_SESSION_REOPENED`, `TILL_SESSION_REOPEN_REFUSED`) via `ForensicLogRepository`.

