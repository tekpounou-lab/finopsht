# FINOPS ERP — ATTENDANCE P0.1 TRANSACTIONAL INTEGRITY & PAYROLL PROTECTION REVIEW

**Audit ID:** `FINOPS-ATTENDANCE-P0.1`  
**Scope:** `ServerAttendanceService.ts`, `AttendanceRepository.ts`, `MassImportModal.tsx`, `AttendanceLedger.tsx`, `MyWorkspace.tsx`, `offlineSync.ts`, `AttendanceLock.test.ts`  
**Verification Basis:** Static code review (`PROVEN_STATIC`) + unit/mocked integration test audit (`PROVEN_UNIT` / `PROVEN_INTEGRATION`)

---

## 1. Atomic Transaction Boundary Analysis

### A. Server API Path (`ServerAttendanceService.ts`)

| Operation | Collections Written Inside `adminDb.runTransaction` | Collections Written OUTSIDE `runTransaction` | Integrity Verdict |
|---|---|---|---|
| **`checkInWithAdmin`** (`lines 763-801`) | `attendance_status/{targetId}` (`merge: true`), `attendance_sessions/{sessionId}`, `attendance_logs/{sessionId}`, `attendance_records/{sessionId}`, `attendance_events/{eventId}` | `audit_logs/{auditId}` (`lines 787-801`, wrapped in `try/catch { console.warn }` at `lines 128-153`) | **PARTIAL (`GAP-ATT-09`)** — Core state and `attendance_events` are atomic, but `audit_logs` is non-atomic and silently ignored on failure. |
| **`checkOutWithAdmin`** (`lines 928-1095`) | `attendance_sessions/{sessionId}`, `attendance_logs/{sessionId}`, `attendance_records/{sessionId}`, `attendance_status/{targetId}`, `attendance_events/{eventId}` | Pre-reads (`attendance_status`, `attendance_sessions`, `payroll_cycles`) + `audit_logs/{auditId}` (`lines 1082-1095`) | **PARTIAL (`GAP-ATT-09`, `GAP-ATT-10`, `GAP-ATT-11`)** — See concurrency defects below. |
| **`overrideAttendanceWithAdmin`** (`lines 1169-1185`) | `attendance_logs/{recordId}`, `attendance_records/{recordId}` | `payroll_cycles` check (`line 1142`), `audit_logs/{auditId}` (`lines 1176-1185`). Does NOT update `attendance_sessions`, `attendance_events`, or `attendance_status`. | **PARTIAL (`GAP-ATT-09`, `GAP-ATT-10`)** — Lacks `attendance_events` and atomic `audit_logs`; does not reconcile `attendance_sessions`. |

### B. Client Repository & Direct-Write Paths (`AttendanceRepository.ts`)

| Method | Lines | Transaction / Batch Scope | Integrity Defects |
|---|---|---|---|
| **`checkIn` / `checkOut` (direct fallback)** | `448-485`, `752-795` | `runTransaction(db, ...)` writes `attendance_status`, `attendance_sessions`, `attendance_logs`, `attendance_records`, `attendance_events`. | Only reached when `!auth.currentUser` or `preferDirectFirestore` (or unexpected 200 payload missing `.session`). Does NOT re-verify badges; `verifyPeriodLock` uses 30s cache + single-field `business_id` query. |
| **`createAdjustmentRequest`** | `882-910` | Single `setDoc` on `attendance_adjustment_requests`. | **GAP-ATT-08:** Omits `business_id` (writes camelCase `businessId` only) and omits `verifyPeriodLock`. |
| **`approveAdjustmentRequest`** | `915-979` | `runTransaction` updates `attendance_sessions`, `attendance_logs`, `attendance_adjustment_requests`. | **GAP-ATT-08:** No `AttendanceAuthorizationService` RBAC check, no Maker-Checker check (`requestedBy !== actor.id`), skips `verifyPeriodLock` if `attendance_sessions` doc is absent, and leaves `attendance_records` stale (no update). |
| **`updateRecord` / `saveRecord`** | `1020-1035`, `1062-1085` | Two separate non-atomic `await setDoc(...)` calls (`attendance_logs` then `attendance_records`). | **Partial-write failure risk:** if second `setDoc` fails, `attendance_logs` and `attendance_records` diverge. `updateRecord` only runs `verifyPeriodLock` if `snap.exists()` is true (`lines 1024-1031`), so creating a new record via `updateRecord` (as `AttendanceLedger.handleGlobalOverrideSave` does at `line 811`!) **skips `verifyPeriodLock`**! |
| **`batchSaveRecords`** | `1037-1060` | `writeBatch` on `attendance_logs` + `attendance_records`. | Limited to 500 ops / 250 records (`MassImportModal` writes 2 docs per record — >250 valid rows exceeds Firestore batch limit of 500 writes!). No `attendance_events` audit entry. |
| **`batchDeleteRecords`** | `1122-1140` | `writeBatch` deleting only `attendance_logs`. | **Deletes only `attendance_logs`**, leaving orphaned records in `attendance_records` and `attendance_sessions`; **never calls `verifyPeriodLock`** (OWNER can delete attendance records inside a `SEALED`/`PAID` payroll cycle!). |

---

## 2. Concurrency, Idempotency & Session Lifecycle Defects

1. **Non-Transactional Session & `activeSessionId` Handling (`ServerAttendanceService.ts:768-778, 838-854, 1031-1077` — `GAP-ATT-11`):**
   - **Stale Prior-Day Session Leak:** `checkInWithAdmin` only throws `ALREADY_CHECKED_IN` if `prevDate === dateStr`. If an employee forgot to clock out on Day 1 and clocks in on Day 2, `attendance_status/{empId}.activeSessionId` is overwritten with the Day 2 `sessionId`, leaving the Day 1 `attendance_sessions` doc permanently stuck in `status: "ACTIVE"`.
   - **Unconditional `activeSessionId: null` on Check-Out:** `checkOutWithAdmin` reads `attendance_status` outside the transaction (`line 839`) and inside the transaction unconditionally writes `activeSessionId: null` (`line 1036`) without verifying `curStatus.activeSessionId === sessionId`. Checking out a prior session after a newer session started clears the active session pointer.
   - **No Idempotency Key:** Network retries on `POST /api/attendance/check-in` generate a fresh random `sessionId` and fail with `409 ALREADY_CHECKED_IN` instead of returning the idempotent result; `checkOutWithAdmin` similarly returns `409 SESSION_ALREADY_COMPLETED` on retry.

2. **Double Check-In / Race Prevention (`PROVEN_UNIT` / `PROVEN_STATIC`):**
   - Within the same `dateStr`, concurrent check-in transactions read `attendance_status/{target.id}` inside `runTransaction` (`lines 764-778`), properly preventing two `ACTIVE` check-ins on the same day under Firestore optimistic concurrency control.

---

## 3. Payroll Period Protection Analysis

- **Verified Server Lock Check (`ServerAttendanceService.ts:485-523`):**
  - Blocks `LOCKED`, `PESSIMISTIC_LOCKED`, `SEALED`, and `PAID` payroll cycles (`lines 78-83`) and fails closed with HTTP `503 PAYROLL_LOCK_CHECK_FAILED` on Firestore errors (`lines 501-506`). Tested across all 4 lock statuses (`AttendanceP0RbacRemediation.test.ts:771-787` — `PROVEN_INTEGRATION` with mocked Admin SDK).
- **Verified Payroll Protection Gaps (`GAP-ATT-04`, `GAP-ATT-05`, `GAP-ATT-10`):**
  1. **TOCTOU Window:** `verifyPayrollPeriodUnlocked` runs *before* `adminDb.runTransaction` in `checkInWithAdmin` (`631`), `checkOutWithAdmin` (`910`), and `overrideAttendanceWithAdmin` (`1142`), leaving a race window against concurrent payroll cycle locking/sealing.
  2. **Single-Field Tenant Query:** Both `ServerAttendanceService.ts:499` and `AttendanceRepository.ts:118` query `.where("business_id", "==", canonicalBusinessId)`. Any `payroll_cycles` document stored only with `businessId` (camelCase) bypasses lock detection.
  3. **UI Bypass Holes:** `AttendanceRepository.batchDeleteRecords` (`1122`), `AttendanceRepository.createAdjustmentRequest` (`882`), `AttendanceRepository.updateRecord` on new IDs (`1024`), and `AttendanceLedger.tsx:157-187` auto-repair do not check `verifyPeriodLock`, and `firestore.rules` contains **no** payroll lock guard against direct Firestore SDK writes.
  4. **30-Second Client Cache:** `AttendanceRepository.verifyPeriodLock` (`95, 112`) caches locked cycles for 30s (`periodLockCache`), allowing direct fallback writes during the 30s window after an admin locks a cycle.

---

## 4. Client Offline Queue (`src/lib/offlineSync.ts:61-120`)

- **Hardcoded Actor Impersonation (`GAP-ATT-12`):** Line 74 sets `const actor = { id: record.employeeId, name: "Offline Sync", role: "EMPLOYEE" };` and `branchId: "UNKNOWN"` (line 82).
  - If an `OWNER` queues a third-party scan while offline (`useQRScanner.ts:292-319`), `syncAttendanceQueue` later calls `AttendanceRepository.checkIn` as `actor: EMPLOYEE` (when `auth.currentUser` is absent or in fallback) or fails `IDENTITY_SPOOFING_DETECTED` (`403`) on `/api/attendance/check-in` because `actor.id !== req.user.uid` (`OWNER` UID vs `record.employeeId`)!
  - Furthermore, queued offline scans do not store `badgeId`, `qrSignature`, or `badgePayload`, bypassing badge signature verification on sync.
