# FINOPS ERP — ATTENDANCE P0.2 CLIENT BYPASS, OFFLINE SYNC & RBAC PARITY AUDIT

**Audit ID:** `FINOPS-ATTENDANCE-P0.2`  
**Scope:** `GAP-ATT-05`, `GAP-ATT-12`, `GAP-ATT-13`, `GAP-ATT-14`  
**Verification Basis:** `PROVEN_STATIC` (source & grep inspection across `src/`) + `PROVEN_UNIT` + `PROVEN_INTEGRATION` (mocked Express `createApp()` HTTP endpoints) + `PROVEN_BUILD` (`dist/server.cjs` & `api/_server.cjs`)

---

## 1. Closure of Direct-Firestore Client Bypass Paths (`GAP-ATT-05 — CLOSED`)

| P0.1 Bypass Path | Remediation Implemented in P0.2 | Target Server Endpoint | Verification Status |
|---|---|---|---|
| `AttendanceRepository.checkIn` / `checkOut` silent fallback (`preferDirectFirestore` or `!apiResp.session`) | `AttendanceRepository.ts:250-313, 351-415`: Explicitly throws `MUTATION_BYPASS_DENIED` if `preferDirectFirestore` is truthy; throws fail-closed if `!auth.currentUser` or `!apiResp?.session` (zero fallback to `setDoc`/`runTransaction(db, ...)`). | `POST /api/attendance/check-in`<br>`POST /api/attendance/check-out` | `PROVEN_UNIT`, `PROVEN_INTEGRATION` (`AttendanceP02SecurityRemediation` 3.2, `AttendanceP0RbacRemediation`) |
| `AttendanceLedger.tsx` overrides (`handleOverrideSubmit`, `handleGlobalOverrideSave`, `handleRecalculate`) & `AttendanceRepository.updateRecord` / `saveRecord` | `AttendanceRepository.ts:583-679` & `AttendanceLedger.tsx:737-862`: All overrides and recalculations call `/api/attendance/override` via `safeFetchJson` requiring `auth.currentUser` and fail closed on non-success. | `POST /api/attendance/override` | `PROVEN_STATIC`, `PROVEN_INTEGRATION` (`AttendanceP02SecurityRemediation` 3.1) |
| `AttendanceLedger.tsx` (`confirmDeleteSelected`) & `AttendanceRepository.batchDeleteRecords` | `AttendanceRepository.ts:724-757` & `AttendanceLedger.tsx:903-938`: Routes deletion through `/api/attendance/delete` (enforcing `OWNER`/`ADMIN`/`OWNER_ADMIN`/`SUPER_ADMIN` only, tenant isolation, transactional payroll lock, and deletion across `attendance_logs` + `attendance_records` + `attendance_sessions`). | `POST /api/attendance/delete` | `PROVEN_STATIC`, `PROVEN_INTEGRATION` (`AttendanceP02SecurityRemediation` 6.4) |
| `MassImportModal.tsx` (`handleConfirmImport`) & `AttendanceRepository.batchSaveRecords` | `AttendanceRepository.ts:616-636` & `MassImportModal.tsx:572-576`: Routes bulk import through `/api/attendance/bulk-import` (enforcing `OWNER`/`MANAGER` RBAC, branch scope, chunked `100`-record transactions, payroll lock per unique date, and transactional `audit_logs`). | `POST /api/attendance/bulk-import` | `PROVEN_STATIC`, `PROVEN_INTEGRATION` (`AttendanceP02SecurityRemediation` 6.4) |
| `MyWorkspace.tsx` employee self clock-in/out | `MyWorkspace.tsx:408-494`: Calls `AttendanceRepository.checkIn` & `checkOut` using authenticated actor identity (`auth.currentUser.uid`). | `POST /api/attendance/check-in`<br>`POST /api/attendance/check-out` | `PROVEN_STATIC` |
| `AttendanceRepository.createAdjustmentRequest` & `approveAdjustmentRequest` | `AttendanceRepository.ts:483-542`: Routed to `/api/attendance/adjustments` and `/api/attendance/adjustments/approve`. | `POST /api/attendance/adjustments`<br>`POST /api/attendance/adjustments/approve` | `PROVEN_STATIC`, `PROVEN_INTEGRATION` |
| `EmployeeRepository.saveAttendanceLog` | `EmployeeRepository.ts:702-705`: Delegates to `AttendanceRepository.saveRecord` -> `/api/attendance/override`. | `POST /api/attendance/override` | `PROVEN_STATIC` |
| `AttendanceLedger.tsx` uncontrolled `useEffect` date auto-repair | Removed completely; zero `setDoc`/`updateDoc`/`deleteDoc`/`writeBatch`/`runTransaction` calls exist in `AttendanceLedger.tsx`. | N/A (Removed) | `PROVEN_STATIC` (grep verified) |

### Grep Audit of Remaining Client `setDoc` in Attendance Modules
A repository grep (`grep -nE "setDoc|updateDoc|deleteDoc|writeBatch|runTransaction" src/components/attendance/MassImportModal.tsx src/pages/AttendanceLedger.tsx src/pages/employee/MyWorkspace.tsx src/repositories/AttendanceRepository.ts`) confirmed:
- `AttendanceLedger.tsx`: **0** direct Firestore mutation calls.
- `MyWorkspace.tsx`: **0** direct Firestore mutation calls.
- `MassImportModal.tsx`: **0** direct Firestore mutation calls (only an unused import `setDoc` on line 25).
- `AttendanceRepository.ts`: Only `getRules` / `saveRules` (`attendance_rules` lines 567, 573) and `submitJustification` (`attendance_justifications` line 698, enforcing `auth.currentUser.uid`, `status: "PENDING"`, `recordedBy`, `actorId`).
- All 8 authoritative attendance collections are additionally locked server-side in `firestore.rules:1413-1463` (`allow create, update, delete: if false;`).

---

## 2. Offline Queue Identity & Sync Hardening (`GAP-ATT-12 — CLOSED`)

Inspecting `/src/lib/offlineSync.ts:54-175`:
1. **No Unauthenticated Queuing (`lines 57-60`):** `queueAttendanceLog` requires `actorUid = record.actorId || auth?.currentUser?.uid` and throws `AUTH_REQUIRED` if absent.
2. **No Unauthenticated Sync (`lines 81-84`):** `syncAttendanceQueue` returns immediately if `!auth?.currentUser?.uid` — it never fabricates or impersonates `"EMPLOYEE"`.
3. **No Cross-Operator Impersonation (`lines 98-103`):** During sync, enforces `record.actorId === sessionActorUid` (rejecting mismatched operator queues with `PERMISSION_ERROR`).
4. **Preserved Context & Cryptographic Badge Fields (`lines 114-150`):** Preserves `branchId`, `badgeId`, `qrSignature`, `badgePayload`, and deterministic `idempotencyKey` (`offline_${record.id}`), and routes synced check-ins/check-outs through hardened `AttendanceRepository.checkIn` / `checkOut` -> `/api/attendance/*`.
5. **Verified by Tests:** `AttendanceP02SecurityRemediation.test.ts` Test 6.5 (`PROVEN_UNIT` / `PROVEN_INTEGRATION`).

---

## 3. UI Audit Attribution & Auto-Repair Removal (`GAP-ATT-13 — CLOSED`)

- `AttendanceLedger.tsx:720-988` (`handleOverrideSubmit`, `handleGlobalOverrideSave`, `handleRecalculate`, `confirmDeleteSelected`, `handleExportExcel`) and `MassImportModal.tsx:568-640` (`handleConfirmImport`):
  - All `'e1'`, `'e2'`, and `'admin_sys'` fallbacks removed and replaced with `resolvedActorId = auth?.currentUser?.uid || currentUser?.id || ""` and `resolvedActorName`.
  - Grep confirms zero occurrences of `'e1'`, `'e2'`, or `'admin_sys'` across `AttendanceLedger.tsx`, `MyWorkspace.tsx`, `MassImportModal.tsx`, `UnifiedAttendanceKioskModal.tsx`, `useQRScanner.ts`, and `offlineSync.ts`.

---

## 4. Client vs Server RBAC Matrix Parity (`GAP-ATT-14 — CLOSED`)

Verified alignment across `AttendanceAuthorizationService.ts`, `role.permissions.ts`, `PermissionRepository` (`src/repositories/index.ts:299-376`), and `PermissionService.ts:966-1000`:

| Canonical Role | `role.permissions.ts` (`canOverrideAttendance`) | `PermissionRepository.defaultPermissionsMap` | `PermissionService.can("attendance.override")` | `AttendanceAuthorizationService` |
|---|---|---|---|---|
| `OWNER` / `ADMIN` / `OWNER_ADMIN` / `SUPER_ADMIN` | `true` (`29-80`) | `override_attendance`, `attendance.record_self`, `attendance.record_others` (`300-312`) | `true` | Full business self + others + `override` + `bulk_import` + `delete` + `approve_adjustment` |
| `MANAGER` | `true` (`94-106`) | `override_attendance`, `attendance.record_self`, `attendance.record_others` (`317-321`) | `true` | Branch-scoped others + `override` + `bulk_import` + `approve_adjustment` (`delete` denied) |
| `SUPERVISOR` | `false` (`107-119`) | `log_attendance`, `attendance.record_self`, `attendance.record_others` (**no** `override_attendance`, `322-324`) | `false` | Distinct role: team/branch/direct-report `check_in`/`check_out`; `override`/`bulk_import`/`delete`/`approve_adjustment` denied |
| `TEAM_LEADER` | `false` (`120-132`) | `log_attendance`, `attendance.record_self`, `attendance.record_others` (`334-336`) | `false` | Team/branch-scoped `check_in`/`check_out`; management mutations denied |
| `HEAD_TELLER` / `MASTER_HEAD_TELLER` | `false` (`172-197`) | `log_attendance`, `attendance.record_self` (**no** `override_attendance`, `337-344`) | `false` | Self-service only unless strict non-empty `explicitAttendanceDelegation` (`GAP-ATT-06` fixed); overrides denied |
| `SENIOR_TELLER` / `JUNIOR_TELLER` / `TELLER` / `EMPLOYEE` | `false` (`198-236, 250-262`) | `log_attendance`, `attendance.record_self` (`345-359`) | `false` | Self-service only |
| `AUDITOR` / `ACCOUNTANT` / `GUEST` | `false` (`159-171, 237-249, 263-275`) | Zero attendance write permissions (`328-330, 354-362`) | `false` | All attendance mutations denied (`403 FORBIDDEN_ATTENDANCE_ROLE`) |

Additionally, `PermissionRepository.getRolePermissions` (`src/repositories/index.ts:370-376`) runs `sanitizeDynamicPermissions` to strip `override_attendance`, `attendance.override`, and `attendance.approve` from any dynamic Firestore role override if the role is not in `["SUPER_ADMIN", "OWNER", "ADMIN", "OWNER_ADMIN", "MANAGER"]`.
