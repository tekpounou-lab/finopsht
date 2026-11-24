# FINOPS ERP — ATTENDANCE P0.2 TRANSACTIONAL INTEGRITY & PAYROLL PROTECTION REPORT

**Audit ID:** `FINOPS-ATTENDANCE-P0.2`  
**Scope:** `GAP-ATT-09`, `GAP-ATT-10`, `GAP-ATT-11`, `GAP-ATT-04`, `GAP-ATT-05`  
**Verification Basis:** `PROVEN_STATIC` + `PROVEN_INTEGRATION` (mocked Admin SDK `runTransaction` rollback tests in `AttendanceP02SecurityRemediation.test.ts` & `AttendanceLock.test.ts`)

---

## 1. Atomic Transaction Boundaries (`GAP-ATT-09 — CLOSED`)

Every server attendance mutation in `src/domains/attendance/ServerAttendanceService.ts` executes inside `adminDb.runTransaction` with **reads strictly preceding writes** and uses `recordAuditEventInTransaction` (`lines 207-227`), which performs `transaction.set(adminDb.collection("audit_logs").doc(auditId), payload)` **without `try/catch` swallowing**. Any failure in `audit_logs` persistence rolls back all attendance state changes atomically.

| Operation (`ServerAttendanceService`) | Transactional Pre-Write Reads | Atomic Transactional Writes | Verified Rollback / Behavior |
|---|---|---|---|
| `checkInWithAdmin` (`947-1099`) | `attendance_idempotency`, `payroll_cycles` (snake+camel), `attendance_status`, prior `attendance_sessions` & `attendance_logs` | Prior-day session flag updates (`FLAGGED` + `attendance_events`), `attendance_status`, `attendance_sessions`, `attendance_logs`, `attendance_records`, `attendance_events`, `audit_logs`, `attendance_idempotency` | `PROVEN_INTEGRATION` (Test `6.1` confirms thrown `audit_logs` error aborts check-in with zero partial docs committed) |
| `checkOutWithAdmin` (`1231-1452`) | `attendance_idempotency`, `attendance_sessions`, `attendance_logs`, `attendance_status`, `payroll_cycles` (snake+camel) | `attendance_sessions` (`COMPLETED`), `attendance_logs`, `attendance_records`, `attendance_status` (conditional `activeSessionId: null`), `attendance_events`, `audit_logs`, `attendance_idempotency` | `PROVEN_INTEGRATION` (Test `6.1`, `6.3`) |
| `overrideAttendanceWithAdmin` (`1516-1644`) | `attendance_logs`, `attendance_records`, `attendance_sessions`, `payroll_cycles` (snake+camel, both target date & existing record date) | `attendance_logs`, `attendance_records`, `attendance_sessions` (if exists), `attendance_events`, `audit_logs` | `PROVEN_INTEGRATION` (Test `3.1`) |
| `bulkImportAttendanceWithAdmin` (`1760-1782`) | Chunked (`<= 100` records -> `<= 201` writes + payroll reads per txn): `payroll_cycles` (snake+camel per chunk date) | `attendance_logs`, `attendance_records`, `audit_logs` | `PROVEN_INTEGRATION` (Test `6.4`) |
| `deleteAttendanceWithAdmin` (`1831-1942`) | `attendance_logs`, `attendance_records`, `attendance_sessions`, `attendance_status`, `payroll_cycles` (snake+camel per record date) | Deletes across `attendance_logs`, `attendance_records`, `attendance_sessions`, conditional `activeSessionId: null` reset, `attendance_events` (`RECORD_VOIDED`), `audit_logs` | `PROVEN_INTEGRATION` (Test `6.4`) |
| `createAdjustmentRequestWithAdmin` (`1996-2059`) | `attendance_sessions`, `attendance_logs`, `payroll_cycles` (snake+camel) | `attendance_adjustment_requests` (`REQUESTED`), `audit_logs` | `PROVEN_INTEGRATION` (Test `5.1`, `5.2`) |
| `approveAdjustmentRequestWithAdmin` (`2120-2290`) | `attendance_adjustment_requests`, `attendance_sessions`, `attendance_logs`, `attendance_records`, `payroll_cycles` (snake+camel) | `attendance_sessions`, `attendance_logs`, `attendance_records`, `attendance_events`, `attendance_adjustment_requests` (`APPROVED`/`REJECTED`), `audit_logs` | `PROVEN_INTEGRATION` (Test `5.1`, `5.2`, `5.3`) |

---

## 2. Payroll Lock Protection & TOCTOU Closure (`GAP-ATT-10 — CLOSED`)

1. **Inside-Transaction Verification (`verifyPayrollPeriodUnlockedInTransaction`, `ServerAttendanceService.ts:638-671`):**
   - Queries **both** `where("business_id", "==", canonicalBusinessId)` and `where("businessId", "==", canonicalBusinessId)` via `transaction.get(...)` inside `runTransaction`, closing the TOCTOU window between lock check and commit and catching legacy camelCase `payroll_cycles` documents.
   - Deduplicates merged cycle docs by `docId` (`evaluateLockedPayrollCycles`, `lines 606-636`).
   - Blocks `LOCKED`, `PESSIMISTIC_LOCKED`, `SEALED`, and `PAID` statuses with `423 PAYROLL_PERIOD_LOCKED`.
   - **Fail-Closed Guarantees:**
     - DB query errors inside `transaction.get` throw `503 PAYROLL_LOCK_CHECK_FAILED` (`lines 659-664`).
     - A locked cycle missing `startDate`/`periodStart` or `endDate`/`periodEnd` throws `503 PAYROLL_LOCK_CHECK_FAILED` (`lines 623-628`).
2. **Client Advisory Pre-Check (`AttendanceRepository.verifyPeriodLock`, `lines 91-149`):**
   - Also queries both `business_id` and `businessId` in parallel (`Promise.all`), uses a reduced `5s` cache (down from `30s`) that is invalidated immediately after mutations, and fails closed on Firestore read errors or missing cycle bounds.
3. **Verified By Tests:** `AttendanceP02SecurityRemediation.test.ts` Tests `6.2`, `6.4` and `AttendanceLock.test.ts` (`3/3`).

---

## 3. Session Lifecycle, Stale Reconciliation & Idempotency (`GAP-ATT-11 — CLOSED`)

1. **Prior-Day Unclosed `ACTIVE` Session Reconciliation (`ServerAttendanceService.ts:979-1055`):**
   - Same-day duplicate check-in continues to throw `409 ALREADY_CHECKED_IN`.
   - If `existingStatus.activeSessionId` belongs to a different/prior day and `stalePriorSessionData.status === "ACTIVE"`, `checkInWithAdmin` atomically marks the stale prior `attendance_sessions` doc as `status: "FLAGGED"` (`flaggedReason: "AUTO_FLAGGED_UNCLOSED_PRIOR_DAY_SESSION"`, `supersededBySessionId: sessionId`), updates `attendance_logs` & `attendance_records` (`autoFlagged: true`, `unclosedPriorSession: true`), and records a `PRIOR_SESSION_FLAGGED` event before pointing `attendance_status.activeSessionId` to the new session.
2. **Conditional `activeSessionId` Clearing on Check-Out (`ServerAttendanceService.ts:1371-1377`):**
   - `checkOutWithAdmin` reads `attendance_status` inside `runTransaction` and sets `activeSessionId: null` **only** when `existingStatus?.activeSessionId === initialSessionId`, preventing late check-out of a flagged prior session from wiping out a newer active session pointer.
3. **Invalid Check-Out Timestamp Rejection (`ServerAttendanceService.ts:1278-1283`):**
   - When `overrideTimestamp` is supplied and `localNow.getTime() <= checkInTs.getTime()`, fails closed with `422 INVALID_CHECKOUT_TIME`.
4. **Transactional Idempotency Ledger (`ServerAttendanceService.ts:825-826, 949-961, 1088-1098, 1224-1225, 1232-1244, 1441-1451`):**
   - Reads `attendance_idempotency/{ci|co}_{businessId}_{sha256(key)}` inside `runTransaction`.
   - Matching `employeeId` + `action` returns the previously stored response with `idempotentReplay: true` without creating duplicate sessions/events/audit records.
   - Reusing the same `idempotencyKey` for a different employee or action rejects with `409 IDEMPOTENCY_KEY_CONFLICT`.
5. **Verified By Tests:** `AttendanceP02SecurityRemediation.test.ts` Test `6.3` (`PROVEN_INTEGRATION` mocked).
