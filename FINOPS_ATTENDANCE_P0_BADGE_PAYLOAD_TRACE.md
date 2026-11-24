# FINOPS ERP — ATTENDANCE P0 BADGE PAYLOAD & END-TO-END TRACE

**Task:** `FINOPS ERP — ATTENDANCE P0 REMEDIATION: OWNER BADGE KIOSK PERMISSION DENIAL`  
**Target Flow:** Authenticated `OWNER` (or authorized `MANAGER` / `SUPERVISOR`) scans another employee's QR/NFC badge (`emp_alpha_b1`) in the Unified QR/Badge Kiosk or Attendance Ledger.

---

## 1. Before vs. After Defect Trace

### Broken Pre-Remediation Behavior
1. **Operator Identity Impersonation (Client UI):**
   - `UnifiedAttendanceKioskModal.tsx`, `useQRScanner.ts`, and `AttendanceLedger.tsx` previously constructed `actor: { id: emp.id, name: emp.name, role: emp.role }`, replacing the authenticated `OWNER` operator with the scanned `EMPLOYEE`.
2. **Broken Cross-Tenant Boolean & Badge Signature Bypass:**
   - Cross-tenant check previously used `&&` (`current_business_id && businessId !== current_business_id && emp.business_id !== current_business_id`), letting cross-tenant payloads pass if one field matched.
   - Signature check previously accepted `|| status === "ACTIVE"`, bypassing cryptographic signature comparison on active badges.
3. **Missing `business_id` in `attendance_status/{empId}` + Null-Safe `get` Failure (Direct Firestore Path):**
   - `AttendanceRepository.checkIn` wrote `{ employeeId, activeSessionId, lastCheckIn, ... }` into `attendance_status/{employeeId}` **without `business_id` / `businessId`**, while `firestore.rules` failed `allow get` when `attendance_status/{empId}` did not yet exist (`resource == null`) and failed `allow update` when `business_id` evaluated to `'none'`.
4. **Silent Caller Tenant Fallback (`AttendanceRepository.verifyEmployeeActive`):**
   - Previously fell back to `businessId` passed by the caller when `employee` lacked `business_id`, hiding tenant data integrity defects.
5. **No Server-Authoritative Attendance API:**
   - Attendance writes bypassed backend verification completely.

---

## 2. Remediated End-to-End Badge Scan & Payload Trace

### Step 1: Badge Scan & Parse (Client UI / Hook)
- **Entry points:**
  - `src/components/attendance/UnifiedAttendanceKioskModal.tsx` (`processSecureScan`)
  - `src/hooks/useQRScanner.ts` (`processSecureScan`)
  - `src/pages/AttendanceLedger.tsx` (`processSecureScan`)
- Parses JSON / Base64 JSON / `FINOPS::...` / `BADGE::...` / raw ID badge payload to extract `{ employeeId, businessId, branchId, signature }`, then locates `emp` in `employees` via `findEmployeeByQrPayload`.

### Step 2: Client Security Pre-Checks (`src/domains/attendance/clientActorResolver.ts`)
1. `verifyScannedBadgeSecurity({ emp, activeBadge, signature, payloadBusinessId, currentBusinessId })` (`lines 115-180`):
   - Extracts canonical `empBiz = extractCanonicalBusinessId(emp)`. Rejects missing or mismatched tenant (`!currentBusinessId || !empBiz || empBiz !== currentBusinessId`).
   - Rejects mismatched `payloadBusinessId` using strict inequality (`payloadBusinessId && payloadBusinessId.trim() !== currentBusinessId`) — **OR** logic, no `&&` flaw.
   - Verifies badge is not `REVOKED` / `SUSPENDED` / expired.
   - Verifies signature against `activeBadge.signature`, `activeBadge.tokenHash`, or deterministic HMAC **without** any `|| status === "ACTIVE"` bypass.
2. `resolveClientAuthenticatedActor({ currentUser, currentRole, currentBusinessId, employees })` (`lines 17-87`):
   - Resolves the real logged-in Firebase Auth user (`auth.currentUser?.uid`) and canonical role (`OWNER`, `MANAGER`, `SUPERVISOR`, `HEAD_TELLER`, etc.) — **never** impersonating `emp`.
3. `authorizeAttendanceAction({ action, actor, targetEmployee: toTrustedAttendanceTarget(emp), claimedBusinessId: current_business_id })`:
   - Client pre-flight RBAC check before network submission (`AttendanceAuthorizationService.ts:363-835`).

### Step 3: Repository Dispatch (`src/repositories/AttendanceRepository.ts`)
- Calls `AttendanceRepository.checkIn(...)` (`lines 213-495`) or `AttendanceRepository.checkOut(...)` (`lines 500-835`).
- **Primary Path (`auth?.currentUser?.getIdToken` present & `!preferDirectFirestore`):**
  - Sends authenticated `POST /api/attendance/check-in` (or `/api/attendance/check-out`) via `safeFetchJson` (automatically attaches `Authorization: Bearer <Firebase ID Token>` and `x-business-id`).
  - Redundant `AttendanceRepository.saveRecord(..., { uid: emp.id })` calls in `AttendanceLedger.tsx` were removed.

### Step 4: Server Authentication & Trusted Context Resolution
1. **Middleware:** `authenticateToken` (`src/modules/workflow/approval/serverAuthMiddleware.ts:314-618`) verifies Firebase ID token cryptographic signature/revocation, user profile in Firestore `users/{uid}`, account/business active status, and populates `req.user` (`uid`, `role`, `business_id`, `branch_id`, `isSuperAdmin`).
2. **Route:** `src/routes/attendanceRoutes.ts` (`POST /api/attendance/check-in`, `/check-out`, `/override`, mounted at `/api/attendance` in `server.ts:742`).
3. **Trusted Actor Resolution:** `ServerAttendanceService.resolveTrustedActor(adminDb, req.user)` (`ServerAttendanceService.ts:156-285`):
   - Reads `/users/{req.user.uid}` and actor's `/employees/*` doc from Admin Firestore.
   - Rejects conflicting `token` vs `user doc` `business_id` (`CROSS_TENANT_ATTENDANCE_DENIED`) or `role` (`ROLE_SPOOFING_DETECTED`).
   - Resolves `explicitAttendanceDelegation`, `authorizedBranchIds`, `authorizedDepartmentIds`, `authorizedTeamIds` strictly from server-persisted docs (never from request body).
4. **Trusted Target Employee Resolution:** `ServerAttendanceService.resolveTrustedTargetEmployee(adminDb, input.employeeId, actor)` (`lines 287-378`):
   - Reads `/employees/{employeeId}` (or `/businesses/{actor.business_id}/employees/{employeeId}`, `firebase_uid` query, or strictly `selfUserSnap` when `cleanEmpId === actor.uid`).
   - Calls `extractCanonicalBusinessId(empData)` — fails closed with HTTP `422 MISSING_TARGET_TENANT_CONTEXT` if missing or contradictory. **Zero fallback to caller tenant.**
5. **Canonical RBAC Policy Evaluation:** `authorizeAttendanceAction` (`AttendanceAuthorizationService.ts:363-835`):
   - Rejects spoofed `actorId`, `actor.role`, or `claimedBusinessId` (`403 ROLE_SPOOFING_DETECTED`, `IDENTITY_SPOOFING_DETECTED`, `FORBIDDEN_TENANT_CLAIM`).
   - Enforces tenant isolation, inactive target check (`422 TARGET_EMPLOYEE_INACTIVE`), and exact role rules (`OWNER`, branch-scoped `MANAGER`, distinct canonical `SUPERVISOR`, delegable-only `HEAD_TELLER`, self-only tellers/`EMPLOYEE`).
   - Writes immutable `audit_logs` record on every refusal and success.
6. **Badge Verification & Payroll Lock Guard (`ServerAttendanceService.ts:380-523`):**
   - `verifyBadgeIfProvided`: checks `employee_badges` doc exists, belongs to target `canonicalBusinessId` and `targetEmployeeId`, is `ACTIVE`, unexpired, and matches `qrSignature` exactly.
   - `verifyPayrollPeriodUnlocked`: queries `payroll_cycles` for `canonicalBusinessId`; fails closed (`503`) if DB fails; blocks `LOCKED`, `PESSIMISTIC_LOCKED`, `SEALED`, `PAID` (`423 PAYROLL_PERIOD_LOCKED`).

### Step 5: Atomic Persistence Payload (`ServerAttendanceService.ts:667-785`)
Inside `adminDb.runTransaction`:
- **`attendance_status/{target.id}`** (`merge: true`):
  ```json
  {
    "employeeId": "emp_alpha_b1",
    "business_id": "biz_alpha",
    "businessId": "biz_alpha",
    "branchId": "br_1",
    "departmentId": "dept_ops",
    "activeSessionId": "sess_<hex>",
    "lastCheckIn": "<ISO>",
    "lastCheckInDate": "YYYY-MM-DD",
    "lastCheckInTime": "HH:MM:SS",
    "deviceId": "...",
    "recordedBy": "owner_alpha",
    "recordedByRole": "OWNER",
    "updatedAt": "<ISO>"
  }
  ```
- **`attendance_sessions/{sessionId}`**, **`attendance_logs/{sessionId}`**, **`attendance_records/{sessionId}`**, **`attendance_events/{eventId}`**: all persisted atomically with canonical `business_id`, `businessId`, `employeeId`, `branchId`, `recordedBy: actor.uid`, `recordedByRole`, `actorId: actor.uid`.
- **Direct Firestore Fallback (`preferDirectFirestore` or offline/unmocked client unit path):** `AttendanceRepository.checkIn` & `checkOut` (`AttendanceRepository.ts:448-469`, `752-769`) now write the identical canonical `business_id`, `businessId`, `employeeId`, `branchId`, `recordedBy`, `recordedByRole`, and `actorId` fields to `attendance_status/{employeeId}` and fail closed on missing `business_id` or period-lock DB errors.
