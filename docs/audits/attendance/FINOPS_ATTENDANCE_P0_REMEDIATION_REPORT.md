# FINOPS ERP — ATTENDANCE P0 REMEDIATION REPORT

**Task ID:** `FINOPS-ATTENDANCE-P0-REMEDIATION`  
**Priority:** P0  
**Scope:** Local source code, local `firestore.rules`, and automated local tests ONLY  
**Firebase Project / Database (Reference Only — NOT Deployed):** `finopsht` / `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`  

---

## 1. Executive Summary & Root Cause Findings

When an authenticated `OWNER` attempted to record another employee's attendance via badge scan, Firestore returned `Missing or insufficient permissions.` due to **five compounding defects**:

1. **Missing `business_id` on `/attendance_status/{employeeId}` Writes:** `AttendanceRepository.checkIn` and `checkOut` wrote `/attendance_status/{employeeId}` without `business_id` / `businessId`, failing `isTenantScoped(getBusinessId(...))` in `firestore.rules`.
2. **Non-Null-Safe First Check-In `get` on `/attendance_status/{employeeId}`:** `match /attendance_status/{id}` rejected `transaction.get` whenever the status document did not yet exist (`resource == null`), blocking an employee's initial check-in.
3. **UI Operator Impersonation:** `UnifiedAttendanceKioskModal.tsx`, `useQRScanner.ts`, and `AttendanceLedger.tsx` passed the **scanned employee** (`emp`) as `actor` (`actor: { id: emp.id, name: emp.name, role: emp.role }`) instead of the authenticated `OWNER`, and `AttendanceLedger.tsx` executed redundant `AttendanceRepository.saveRecord(..., { uid: emp.id })` writes.
4. **Silent Fallback & Missing Server Authority:** `AttendanceRepository.verifyEmployeeActive` fell back to caller-supplied `businessId` when an employee doc lacked `business_id`; `verifyPeriodLock` lacked fail-closed protection on first query errors; badge verification accepted `|| status === "ACTIVE"` bypassing signature comparison and used `&&` instead of `||` for cross-tenant payload mismatch; and no `/api/attendance/*` Admin SDK endpoints existed.
5. **Missing Attendance RBAC Boundaries in `firestore.rules` & Permission Matrices:** `firestore.rules` allowed any `isTenantScoped` member (`EMPLOYEE`, `TELLER`, `AUDITOR`) to write attendance logs/sessions for other employees, and lacked a distinct canonical `SUPERVISOR` rule or `HEAD_TELLER` self-only boundary.

---

## 2. Implemented Corrections

### A. Single Source of Truth Domain Policy & Server API
- **`src/domains/attendance/AttendanceAuthorizationService.ts`** *(Created)*
  - Exports pure policy engine `authorizeAttendanceAction`, `normalizeCanonicalAttendanceRole`, `extractCanonicalBusinessId`, `isActorSelfTarget`, and `isEntityInactive`.
  - Enforces:
    - `OWNER` / `ADMIN` / `OWNER_ADMIN` / `SUPER_ADMIN`: self + all branches of same verified business.
    - `MANAGER`: self + active non-OWNER/non-SUPER_ADMIN employees strictly within authorized branch(es).
    - `SUPERVISOR`: preserved as a **distinct canonical role** (never mapped to `MANAGER` or `HEAD_TELLER`); self + active non-OWNER/non-SUPER_ADMIN direct reports or matching branch/department team scope.
    - `HEAD_TELLER` / `MASTER_HEAD_TELLER`: self allowed; third-party attendance **denied** unless `explicitAttendanceDelegation === true` is set on the trusted server actor profile.
    - `SENIOR_TELLER`, `JUNIOR_TELLER`, `TELLER`, `EMPLOYEE`: self check-in/out **only**.
    - `AUDITOR`, `ACCOUNTANT`, `GUEST`, `UNASSIGNED`, unknown roles: **denied**.
    - Rejects client spoofing (`claimedActorId`, `claimedActorRole`, `claimedBusinessId`, `claimedTargetUid`), inactive targets, and missing canonical `business_id` (`fail-closed`).
- **`src/domains/attendance/ServerAttendanceService.ts`** *(Created)*
  - Resolves trusted actor from Firebase Auth + Admin Firestore `users/{uid}` and `employees/{uid}`; resolves target employee from Admin Firestore; validates badge signature, active status, expiry, and tenant without any `ACTIVE` bypass; verifies `payroll_cycles` lock status (`LOCKED`, `PESSIMISTIC_LOCKED`, `SEALED`, `PAID`, fail-closed on DB errors); performs atomic transactions setting canonical `business_id`, `businessId`, `employeeId`, `branchId`, `recordedBy`, `recordedByRole`, and `actorId` across `attendance_status`, `attendance_sessions`, `attendance_logs`, `attendance_records`, and `attendance_events`; writes immutable `audit_logs` on success and refusal.
- **`src/routes/attendanceRoutes.ts`** *(Created)* & **`server.ts`** *(Updated, lines 32 & 742)*
  - Exposes `POST /api/attendance/check-in`, `POST /api/attendance/check-out`, and `POST /api/attendance/override` behind `authenticateToken`.

### B. Firestore Security Rules (`firestore.rules`)
- Preserved `isTenantAdminOrManager(bizId)` **untouched** (`'head_teller'` not added).
- Added `getActorRoleLower`, `getActorDepartmentId`, `isAttendanceSupervisor`, `hasExplicitAttendanceDelegation`, `isAttendanceSelfTarget`, `isValidActiveTenantEmployeeForAttendance`, and `canWriteAttendanceForEmployee` (`lines 288-405`).
- Made `/attendance_status/{id}` `allow get` null-safe for first check-ins (`lines 1429-1434`) and enforced `canWriteAttendanceForEmployee` + canonical `business_id` + `employeeId` immutability on `create`/`update` (`lines 1436-1441`).
- Hardened `/attendance_logs`, `/attendance_records`, `/attendance_sessions`, `/attendance_events`, `/attendance`, `/attendance_justifications`, `/attendance_adjustment_requests` with `canWriteAttendanceForEmployee(...)`, and narrowed `/employee_badges/{badgeId}` writes to `isTenantAdminOrManager` (`line 1342`).

### C. Client Repository, Kiosk UI, Hooks & Permission Matrix
- **`src/domains/attendance/clientActorResolver.ts`** *(Created)*: Resolves authenticated operator identity (`resolveClientAuthenticatedActor`) and enforces strict badge verification (`verifyScannedBadgeSecurity`).
- **`src/repositories/AttendanceRepository.ts`** *(Updated)*: Dispatches `checkIn` / `checkOut` through `/api/attendance/check-in` and `/api/attendance/check-out` when `auth.currentUser` is present; hardens direct Firestore fallback with `authorizeAttendanceAction`, canonical `business_id`/`recordedBy` on `attendance_status`, strict `verifyEmployeeActive` (no caller tenant fallback), and fail-closed `verifyPeriodLock`.
- **`src/components/attendance/UnifiedAttendanceKioskModal.tsx`**, **`src/hooks/useQRScanner.ts`**, **`src/pages/AttendanceLedger.tsx`** *(Updated)*: Removed `actor = emp` impersonation, fixed `&&` -> `||` tenant badge mismatch check, removed `|| status === "ACTIVE"` signature bypass, removed redundant `saveRecord(..., { uid: emp.id })` writes, and added RBAC pre-checks.
- **`src/components/staff/EmployeeDirectory.tsx`**, **`src/components/attendance/AttendanceOverrideDialog.tsx`**, **`src/pages/employee/MyWorkspace.tsx`** *(Updated)*: Removed hardcoded `"b1"` / `"u1"` / `"e1"` / `"e2"` fallbacks; aligned `MyWorkspace` `recordedBy` with `auth.currentUser?.uid`.
- **`src/services/PermissionService.ts` & `src/repositories/index.ts`** *(Updated)*: Added `"attendance.record_self"`, `"attendance.record_others"`, `"attendance.manage"`, `"attendance.delegate_others"` to `TENANT_ERP_CAPABILITIES` and `AUDITOR_MUTATION_CAPS`; distinguished `attendance.record_self` vs `attendance.record_others` while preserving `HEAD_TELLER` `override_attendance` compatibility.

---

## 3. Verification Evidence

| Check | Scope / Command | Outcome | Evidence Tag |
|---|---|---|---|
| **New Attendance RBAC & Kiosk Suite** | `npx vitest run src/tests/unit/security/AttendanceP0RbacRemediation.test.ts` | **23/23 PASSED** (All 18 policy scenarios, HTTP `createApp()` routes, badge signature verification, direct repo fallback, `PermissionService`/`PermissionRepository`, static `firestore.rules`) | `PROVEN_INTEGRATION` / `PROVEN_UNIT` |
| **Security & RBAC Regression Suite (12 Files)** | `npx vitest run ...` (including `AttendanceLock`, `P0RbacOperationalRolesVerification`, `RbacStep1PermissionMatrices`, `RbacStep4OperationalProfileEnforcement`, `PhaseD4B24RulesHardening`, `Phase20SecurityRbacTenantIsolation`, `Vuln01SelfPrivilegeEscalation`, `P0ApiFirestoreRemediation`, `CloudRunPackagingAndAdcIntegrity`, `OwnerGeneralLedgerAccess`, `P0SecurityRemediation`) | **12/12 files PASSED (188/188 tests PASSED)** | `PROVEN_INTEGRATION` / `PROVEN_UNIT` |
| **TypeScript Typecheck (`tsc --noEmit`)** | `lint_applet` | **PASSED (0 errors)** | `PROVEN_STATIC` |
| **Production Build & Server Bundle Audit** | `compile_applet` + `npm run build` + `grep` on `dist/server.cjs` & `api/_server.cjs` | **PASSED** (`dist/server.cjs` & `api/_server.cjs` built at `608.0kb`; `CLEAN_SERVER_BUNDLE` — zero `import.meta.env`, `firebase/firestore`, or `firebase/auth` leaks) | `PROVEN_STATIC` |
| **Live Firestore Emulator Rules Run** | `which java \|\| echo "NO_JAVA"` | **`BLOCKED`** (`NO_JAVA` in container runtime; rules validated statically in `AttendanceP0RbacRemediation.test.ts` & `PhaseD4B24RulesHardening.test.ts`) | `BLOCKED` |
| **Production Deployment / Mutation** | Deploy rules, modify claims, or write prod Firestore | **NOT EXECUTED** (strictly prohibited by task safety boundaries) | `NOT_TESTED` |

---

## 4. Deliverables & Modified/Created Files

- **Created Reports (Workspace Root):**
  - `FINOPS_ATTENDANCE_P0_REMEDIATION_REPORT.md`
  - `FINOPS_ATTENDANCE_P0_RBAC_TEST_MATRIX.csv`
  - `FINOPS_ATTENDANCE_P0_FIRESTORE_RULES_VERIFICATION.md`
  - `FINOPS_ATTENDANCE_P0_BADGE_PAYLOAD_TRACE.md`
- **Created Source & Tests:**
  - `src/domains/attendance/AttendanceAuthorizationService.ts`
  - `src/domains/attendance/ServerAttendanceService.ts`
  - `src/domains/attendance/clientActorResolver.ts`
  - `src/routes/attendanceRoutes.ts`
  - `src/tests/unit/security/AttendanceP0RbacRemediation.test.ts`
- **Modified Source & Rules:**
  - `server.ts`, `firestore.rules`, `src/repositories/AttendanceRepository.ts`, `src/repositories/index.ts`, `src/services/PermissionService.ts`, `src/components/attendance/UnifiedAttendanceKioskModal.tsx`, `src/hooks/useQRScanner.ts`, `src/pages/AttendanceLedger.tsx`, `src/components/staff/EmployeeDirectory.tsx`, `src/components/attendance/AttendanceOverrideDialog.tsx`, `src/pages/employee/MyWorkspace.tsx`.

---

## 5. Next Operational Steps (Human Authorization Required)

1. Run live `@firebase/rules-unit-testing` against `firestore.rules` in a JDK-enabled CI/local environment to upgrade `PROVEN_STATIC` Firestore rule checks to `PROVEN_RUNTIME`.
2. Deploy `firestore.rules` and the updated Node/Express backend in a controlled release window.
3. Audit any pre-existing legacy `attendance_status` documents lacking `business_id` if read-by-list queries are used; new updates automatically backfill canonical `business_id`.
