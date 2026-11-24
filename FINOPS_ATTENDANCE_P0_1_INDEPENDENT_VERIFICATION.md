# FINOPS ERP — ATTENDANCE P0.1 INDEPENDENT SECURITY VERIFICATION

**Verification ID:** `FINOPS-ATTENDANCE-P0.1`  
**Mode:** STRICT READ-ONLY INDEPENDENT AUDIT (Zero code, rule, test, config, or production modifications)  
**Target Reference:** Firebase Project `finopsht` / Firestore Database `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`  
**Git Metadata Baseline:** Unavailable (`test -d .git` -> `NO_GIT`; baseline established directly from current workspace files and P0 report artifacts).

---

## FINAL VERDICT: `FAIL` (P0.1 Independent Production-Readiness Gate)

### Executive Rationale
The P0 remediation genuinely resolved the immediate runtime blocker where an `OWNER` scanning a badge failed on `attendance_status` (`business_id` missing, non-null-safe initial `get`, and `actor = emp` UI impersonation), and established a strong server-side core (`AttendanceAuthorizationService`, `ServerAttendanceService`, `attendanceRoutes`).

However, independent verification **cannot approve production readiness (`FAIL`)** because direct inspection across UI, API, Firebase Auth, Firestore rules, client fallbacks, and transactions identified **14 concrete code defects (1 `CRITICAL`, 7 `HIGH`, 6 `MEDIUM`)** plus **1 `BLOCKED` runtime gate (`NO_JAVA`)**:

1. **CRITICAL (`GAP-ATT-01`):** `firestore.rules:850-862` lets any authenticated employee update their own `employees/{empId}` document with a denylist that omits `explicitAttendanceDelegation`, `delegatedEmployeeIds`, `delegatedBranchIds`, `authorizedBranchIds`, `authorizedDepartmentIds`, and `authorizedTeamIds` — fields trusted by `ServerAttendanceService.resolveTrustedActor` (`lines 248-281`), enabling **self-privilege escalation**.
2. **HIGH (`GAP-ATT-02`, `GAP-ATT-03`, `GAP-ATT-04`):** `firestore.rules` permits self-target direct `update` across `attendance_logs`, `attendance_records`, `attendance_sessions`, and `attendance` (allowing employees to tamper with `realHours`/`checkOut`/`status`), makes `recordedBy`/`actorId`/`performedBy` optional, allows conflicting `businessId` vs `business_id` in `getBusinessId`, and has zero payroll lock enforcement.
3. **HIGH (`GAP-ATT-05`, `GAP-ATT-08`):** Multiple live UI/repository workflows (`AttendanceLedger` overrides/recalc/deletes/auto-repair, `MyWorkspace` clock-in/out, `MassImportModal`, `AttendanceRepository.createAdjustmentRequest`/`approveAdjustmentRequest`) **bypass `/api/attendance/*`** entirely, and adjustment approval lacks RBAC, Maker-Checker separation, and period-lock guarantees.
4. **HIGH (`GAP-ATT-06`, `GAP-ATT-07`):** `HEAD_TELLER` with `explicitAttendanceDelegation: true` and empty `branchId` gets tenant-wide authority (`AttendanceAuthorizationService.ts:355`); client `verifyScannedBadgeSecurity` skips signature checks when `signature === ""` (`clientActorResolver.ts:158`) and server `verifyBadgeIfProvided` skips badge verification when `method: "QR"` omits badge fields (`ServerAttendanceService.ts:390-393`).
5. **BLOCKED (`GAP-ATT-15`):** `which java` -> `NO_JAVA`. Zero live Firestore Emulator tests ran; all `AttendanceP0RbacRemediation.test.ts` HTTP/Firestore checks used mocked in-memory Maps and regex assertions.

---

## 1. Inspection Baseline & P0 Artifact Audit

- **Inspected Deliverables:** `FINOPS_ATTENDANCE_P0_REMEDIATION_REPORT.md`, `FINOPS_ATTENDANCE_P0_RBAC_TEST_MATRIX.csv`, `FINOPS_ATTENDANCE_P0_FIRESTORE_RULES_VERIFICATION.md`, `FINOPS_ATTENDANCE_P0_BADGE_PAYLOAD_TRACE.md`.
- **Baseline Limitation:** `.git` directory is absent (`NO_GIT`); file diffs could not be generated from Git history. Verification was conducted directly against full current source files on disk.
- **Test Evidence Audit (Re-executed Read-Only):**
  - `npx vitest run src/tests/unit/security/AttendanceP0RbacRemediation.test.ts src/tests/unit/AttendanceLock.test.ts src/tests/unit/security/PhaseD4B24RulesHardening.test.ts`: **3 files, 41/41 tests passed**.
  - **Honest Evidence Assessment:** `AttendanceP0RbacRemediation.test.ts` (`lines 6-253`) mocks `../../../lib/firebaseAdmin`, `firebase/firestore`, and `../../../lib/firebase` using in-memory `Map` stores (`mockAdminStore`, `mockClientStore`) and validates `firestore.rules` solely via regex (`lines 950-992`). Thus scenarios `ATT-P0-01`..`ATT-P0-21` prove Express + domain/service TypeScript logic with mocked persistence (`PROVEN_INTEGRATION` mocked / `PROVEN_UNIT`), **NOT** live Firebase Auth JWKS or live Firestore Security Rules (`BLOCKED`).

---

## 2. Canonical Role Policy & Permission Matrix Verification

| Role | Server API (`/api/attendance/*`) | Client `PermissionService` / `PermissionRepository` | `role.permissions.ts` (`hasPermission`) | `firestore.rules` | Alignment Verdict |
|---|---|---|---|---|---|
| **`OWNER` / `ADMIN`** | Allowed self + all branches of same business; overrides allowed (`AttendanceAuthorizationService.ts:574-584`). | `attendance.record_self`, `attendance.record_others`, `override_attendance` (`repositories/index.ts:301-312`). | `canOverrideAttendance: true` (`55-67`). | Allowed across verified tenant (`363-364`). | **PASS** (except direct `employees` self-escalation & `GAP-ATT-03` dual-field risk) |
| **`MANAGER`** | Allowed self + active non-OWNER/non-SUPER_ADMIN within `authorizedBranchIds`/`branchId` (`648-708`). Overrides allowed. | `attendance.record_self`, `attendance.record_others`, `override_attendance`. | `canOverrideAttendance: true` (`68-80`). | Branch match via scalar `getActorBranchId()` (`365-373`). | **PARTIAL** (`firestore.rules` misses multi-branch `authorizedBranchIds` array; `employees` self-edit lets MANAGER add branches, `GAP-ATT-01`) |
| **`SUPERVISOR`** | Distinct canonical role (`259-269`, never mapped to `MANAGER` or `HEAD_TELLER`); self + branch/team/direct-report scope (`710-811`). Overrides denied (`553-571`). | `SUPERVISOR` distinct entry (`322-324`), **BUT** includes `override_attendance` so `PermissionService.can("attendance.override")` returns `true` (`976`)! | `canOverrideAttendance: false` (`88`). | Distinct `isAttendanceSupervisor` (`302-307`), **BUT** `allow update` on `attendance_adjustment_requests` & `attendance_justifications` allows `SUPERVISOR` approval (`500, 1354`). | **PARTIAL / GAP-ATT-14** (`TEAM_LEADER` is also aliased identically to `SUPERVISOR` in `AttendanceAuthorizationService.ts:711` but lacks `attendance.record_others` in `PermissionRepository`) |
| **`HEAD_TELLER` / `MASTER_HEAD_TELLER`** | Self allowed; others denied (`TELLER_SELF_ATTENDANCE_ONLY`) unless `explicitAttendanceDelegation` (`611-645`). **DEFECT (`GAP-ATT-06`):** empty `actorBranches` + `explicitAttendanceDelegation: true` grants tenant-wide access (`355`). | `PermissionRepository` grants `override_attendance` (`339, 343`), making `PermissionService.can("attendance.override")` return `true`! | Role completely **omitted** from `ROLE_PERMISSIONS` (`hasPermission` returns `false`). | `hasExplicitAttendanceDelegation` checks `users/{uid}` flag + scalar `getActorBranchId()`; diverges from `delegatedEmployeeIds`/`delegatedBranchIds`. | **FAIL (`GAP-ATT-01`, `GAP-ATT-06`, `GAP-ATT-14`)** |
| **`SENIOR_TELLER` / `JUNIOR_TELLER` / `TELLER`** | Self only (`587-608`). | `attendance.record_self` only (`345-353`). | Omitted from `ROLE_PERMISSIONS`. | Self-target only (`401`), **BUT** allows `update` on own existing logs (`GAP-ATT-02`). | **PARTIAL (`GAP-ATT-02`, `GAP-ATT-14`)** |
| **`EMPLOYEE`** | Self only (`587-608`). | `attendance.record_self` only (`357-359`). | `canOverrideAttendance: false`. | Self-target only (`401`), **BUT** allows `update` on own existing logs (`GAP-ATT-02`). | **PARTIAL (`GAP-ATT-02`)** |
| **`AUDITOR` / `ACCOUNTANT` / Unknown** | Denied (`403 FORBIDDEN_ATTENDANCE_ROLE`, `535-550`). `normalizeCanonicalAttendanceRole` fails closed (`261-269`). | `AUDITOR_MUTATION_CAPS` blocks attendance caps (`819-843`). | Omitted -> `false`. | Explicitly blocked (`357`). | **PASS** |

---

## 3. Operator Identity, Anti-Impersonation & Badge Payload Integrity

- **Token-Derived Actor Identity (`PROVEN_STATIC` / `PROVEN_INTEGRATION` mocked):**
  - `serverAuthMiddleware.ts:314-618` verifies the Bearer ID token (`checkRevoked = true` with Identity Toolkit fallback), reads `/users/{uid}`, rejects tenant/role/branch mismatches, and assigns `req.user`.
  - `ServerAttendanceService.ts:156-285` cross-checks `req.user` against `/users/{uid}` and `/employees/{uid}` and rejects client-supplied spoofing (`claimedActorId`, `claimedActorRole`, `claimedBusinessId`, `claimedTargetUid`).
  - Tested Kiosk UI (`UnifiedAttendanceKioskModal.tsx:394-474`, `useQRScanner.ts:240-276`, `AttendanceLedger.tsx:520-585`) calls `resolveClientAuthenticatedActor(...)` and passes the real operator's UID — no longer replacing `actor` with the scanned employee `emp`.
- **Remaining Identity & Badge Gaps:**
  - **`GAP-ATT-07` (`HIGH`):** In `clientActorResolver.ts:158`, `verifyScannedBadgeSecurity` only checks signature `if (signature)`, so scanning a plain-ID QR code (`signature === ""`) passes client badge validation even if an `ACTIVE` signed badge exists. On the server (`ServerAttendanceService.ts:390-393`), `POST /api/attendance/check-in` with `method: "QR"` without `badgeId`/`qrSignature`/`badgePayload` skips `verifyBadgeIfProvided` completely; and when querying by `employeeId`, line 452 fails to reject duplicate active badges.
  - **`GAP-ATT-13` (`MEDIUM`):** `AttendanceLedger.tsx:783, 872, 975` and `MassImportModal.tsx:608` still hardcode `userId: currentRole === "OWNER" ? "e1" : "e2"` in `onAddForensicLog(...)`, and `AttendanceLedger.tsx:772, 816, 860` fall back to `"admin_sys"`.
  - **`GAP-ATT-12` (`MEDIUM`):** `offlineSync.ts:74` hardcodes `actor = { id: record.employeeId, name: "Offline Sync", role: "EMPLOYEE" }`.

---

## 4. Detailed Findings & Verification Matrix Summary

See accompanying deliverables for complete line-level evidence:
- **Gap Register (15 Findings):** `/FINOPS_ATTENDANCE_P0_1_SECURITY_GAP_MATRIX.csv`
- **Vercel / Express / Admin SDK Trace:** `/FINOPS_ATTENDANCE_P0_1_API_DEPLOYMENT_TRACE.md`
- **Firestore Rules Line-by-Line Review:** `/FINOPS_ATTENDANCE_P0_1_FIRESTORE_RULES_REVIEW.md`
- **Transaction, Payroll Lock & Client Bypass Review:** `/FINOPS_ATTENDANCE_P0_1_TRANSACTION_INTEGRITY_REVIEW.md`

| Pillar Audited | Verdict | Primary Evidence Tag |
|---|---|---|
| 1. Remediation Artifact & Code Alignment | **PARTIAL** (core Kiosk/API matches report; unmigrated Ledger/Workspace/Adjustment/Import paths contradict claims) | `PROVEN_STATIC` |
| 2. Canonical Role Policy (`OWNER`, `MANAGER`, `SUPERVISOR`, `HEAD_TELLER`, `SENIOR_TELLER`, `JUNIOR_TELLER`, `EMPLOYEE`, `AUDITOR`) | **PARTIAL** (`HEAD_TELLER` empty-branch delegation bug `GAP-ATT-06`; client RBAC matrix drift `GAP-ATT-14`) | `PROVEN_INTEGRATION` (mocked) / `PROVEN_STATIC` |
| 3. Operator Identity & Anti-Impersonation | **PARTIAL** (Kiosk/API strong; `offlineSync` & `AttendanceLedger` `e1`/`e2` forensic logs fail `GAP-ATT-12`/`13`) | `PROVEN_INTEGRATION` (mocked) / `PROVEN_STATIC` |
| 4. Trusted Tenant & Target Resolution | **PASS on API** (`ServerAttendanceService.ts` fail-closed); **FAIL on Adjustment/Rules** (`GAP-ATT-03`, `GAP-ATT-08`) | `PROVEN_INTEGRATION` (mocked) / `PROVEN_STATIC` |
| 5. Badge QR/Payload Cryptographic Verification | **FAIL** (`if (signature)` client bypass & `method: "QR"` omitted-fields server bypass `GAP-ATT-07`) | `PROVEN_STATIC` |
| 6. Vercel Serverless & Express API Path | **PASS (Build/Mock HTTP)** / **NOT_TESTED (Live Vercel Runtime)** | `PROVEN_BUILD` / `PROVEN_STATIC` / `NOT_TESTED` |
| 7. Firestore Rules Security & Privilege Isolation | **FAIL (CRITICAL `GAP-ATT-01`, HIGH `GAP-ATT-02/03/04`)** & **BLOCKED (Emulator `NO_JAVA`)** | `PROVEN_STATIC` / `BLOCKED` |
| 8. Client Fallbacks & Alternative Write Paths | **FAIL** (6 active UI/repo bypasses around `/api/attendance/*` `GAP-ATT-05`) | `PROVEN_STATIC` |
| 9. Payroll Protection & Transactional Integrity | **FAIL** (`audit_logs` non-atomic `GAP-ATT-09`, lock TOCTOU `GAP-ATT-10`, stale session/delete lock bypasses `GAP-ATT-08/11`) | `PROVEN_STATIC` |

---

## 5. Mandatory Remediation Gate Before Production Deployment

Production deployment (`firestore.rules` deploy or Vercel release sign-off) MUST remain **blocked** until:
1. **`GAP-ATT-01` (`CRITICAL`):** Lock down `match /employees/{empId}` self-update to a strict allowlist (preventing self-modification of `explicitAttendanceDelegation`, `delegatedEmployeeIds`, `delegatedBranchIds`, `authorizedBranchIds`, `authorizedDepartmentIds`, `authorizedTeamIds`, `managerId`, `supervisorId`).
2. **`GAP-ATT-02`, `GAP-ATT-03`, `GAP-ATT-04` (`HIGH`):** Harden `firestore.rules` to prevent direct employee self-tampering (`update` on `attendance_logs`/`attendance_records`/`attendance_sessions`/`attendance`), require `recordedBy == request.auth.uid`, enforce `businessId == business_id` consistency, and restrict direct client attendance mutations.
3. **`GAP-ATT-05` & `GAP-ATT-08` (`HIGH`):** Route `AttendanceLedger` overrides/deletes, `MyWorkspace` clock-in/out, `MassImportModal`, and `createAdjustmentRequest`/`approveAdjustmentRequest` (with Maker-Checker) through Admin SDK endpoints.
4. **`GAP-ATT-06` & `GAP-ATT-07` (`HIGH`):** Remove empty-branch tenant-wide delegation fallback for `HEAD_TELLER`, require valid badge signatures when `ACTIVE` badges exist (`clientActorResolver` & `ServerAttendanceService`), and reject duplicate active badges.
5. **`GAP-ATT-09`, `GAP-ATT-10`, `GAP-ATT-11` (`MEDIUM`):** Move `audit_logs` inside `adminDb.runTransaction`, close payroll lock TOCTOU/camelCase gaps, verify `activeSessionId === sessionId` on check-out, and handle unclosed prior-day sessions.
6. **`GAP-ATT-15` (`BLOCKED`):** Execute live `@firebase/rules-unit-testing` against Firestore Emulator in a JDK-enabled runner.
