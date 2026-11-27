# FINOPS ERP — ATTENDANCE P0 FIRESTORE SECURITY RULES VERIFICATION

**Task:** `FINOPS ERP — ATTENDANCE P0 REMEDIATION: OWNER BADGE KIOSK PERMISSION DENIAL`  
**Target File:** `firestore.rules`  
**Firebase Project / Database (Reference Only — NOT Deployed):** `finopsht` / `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`  
**Verification Mode:** Local Static & Structural Verification (`PROVEN_STATIC`); Live Firestore Emulator Runtime Verification (`BLOCKED` — `NO_JAVA` in container environment)

---

## 1. Root Cause Confirmed in `firestore.rules` (Before Remediation)

1. **Missing `business_id` on `/attendance_status/{id}` Writes (`AttendanceRepository.ts`):**
   - Previous client writes to `attendance_status/{employeeId}` omitted `business_id` / `businessId`.
   - Under `match /attendance_status/{id}`, `allow update` checked `isTenantScoped(getBusinessId(resource.data))` and `isTenantScoped(getBusinessId(request.resource.data))`, returning `false` when `business_id` resolved to `'none'`.
2. **Non-Null-Safe `allow get` on `/attendance_status/{id}`:**
   - First-ever check-in for an employee executes `transaction.get(doc(db, "attendance_status", employeeId))` when `resource == null`.
   - Previous `allow get` only checked `resource != null && isTenantScoped(getBusinessId(resource.data))`, causing Firestore to reject the initial `transaction.get` with `Missing or insufficient permissions.` for an `OWNER` scanning another employee.
3. **Weak Role & Scope Enforcement on Attendance Collections:**
   - Previous rules allowed any `isTenantScoped(...)` member (including `JUNIOR_TELLER`, `SENIOR_TELLER`, `EMPLOYEE`, and `AUDITOR`) to create/update `attendance_logs`, `attendance_records`, `attendance_sessions`, `attendance_events`, and `attendance` for ANY employee in the tenant.
   - `SUPERVISOR` had no dedicated canonical helper, and `MANAGER` branch scope / `HEAD_TELLER` self-only constraints were absent at the Firestore rule layer.
   - `employee_badges/{badgeId}` permitted `allow write` for any `isTenantScoped(...)` user.

---

## 2. Remediated Helpers & Rules Implemented (`firestore.rules`)

### A. Preserved Core Helper (Non-Regression Invariant)
- `isTenantAdminOrManager(bizId)` (`firestore.rules:152-175`) remains **strictly unmodified** (`['owner', 'admin', 'manager', 'owner_admin']` only — **never** includes `'head_teller'` or `'master_head_teller'`, preserving `RbacStep4OperationalProfileEnforcement.test.ts`).

### B. Dedicated Attendance Helpers (`firestore.rules:288-405`)
- `getActorRoleLower()` (`288-292`): Resolves canonical lowercase role from `request.auth.token.role` or `/users/$(request.auth.uid)`.
- `getActorDepartmentId()` (`294-300`): Resolves `department_id` / `departmentId` from token or user profile.
- `isAttendanceSupervisor(bizId)` (`302-307`): Distinct helper requiring `isTenantScoped(bizId) && getActorRoleLower() == 'supervisor'` (never maps `SUPERVISOR` to `MANAGER` or `HEAD_TELLER`).
- `hasExplicitAttendanceDelegation(bizId)` (`309-316`): Requires `getActorRoleLower() in ['head_teller', 'master_head_teller']` AND `getMyProfile().get('explicitAttendanceDelegation', false) == true`.
- `isAttendanceSelfTarget(empId)` (`318-329`): Matches `empId == request.auth.uid`, actor `employeeId`/`employee_id`, or `employees/$(empId)` `firebase_uid`/`uid`/`userId == request.auth.uid`.
- `isValidActiveTenantEmployeeForAttendance(empId, bizId)` (`331-347`): Fails closed if `employees/$(empId)` lacks matching `bizId`, is inactive/suspended/terminated/deleted/disabled/archived, or `active == false`.
- `canWriteAttendanceForEmployee(empId, data)` (`349-405`):
  - Enforces non-empty canonical `getBusinessId(data)` and `isTenantScoped(getBusinessId(data))`.
  - Explicitly blocks `['auditor', 'guest', 'unassigned', 'accountant', '']`.
  - Verifies active tenant employee via `isValidActiveTenantEmployeeForAttendance(empId, getBusinessId(data))`.
  - Anti-spoofing: requires `!('recordedBy' in data) || data.recordedBy == request.auth.uid`, `!('actorId' in data) || data.actorId == request.auth.uid`, and `!('performedBy' in data) || data.performedBy == request.auth.uid`.
  - Enforces role policy:
    - `OWNER` / `ADMIN` / `OWNER_ADMIN` (`isBusinessOwner` or role check): any active employee in same business across all branches.
    - `MANAGER`: self OR active non-OWNER/non-SUPER_ADMIN employee in matching `branchId`.
    - `SUPERVISOR`: self OR active non-OWNER/non-SUPER_ADMIN employee with `managerId`/`supervisorId == request.auth.uid` OR matching `branchId` (+ `departmentId` when configured).
    - `HEAD_TELLER` / `MASTER_HEAD_TELLER`: self ONLY, unless `hasExplicitAttendanceDelegation(...)` + branch match.
    - `SENIOR_TELLER` / `JUNIOR_TELLER` / `TELLER` / `EMPLOYEE`: `isAttendanceSelfTarget(empId)` ONLY.

### C. Hardened Collection Match Blocks (`firestore.rules`)

| Collection | Lines | Read Policy (`get` / `list`) | Write Policy (`create` / `update` / `delete`) | Evidence Tag |
|---|---|---|---|---|
| `/attendance_status/{id}` | `1428-1442` | `allow get`: `isSuperAdmin() \|\| isAttendanceSelfTarget(id) \|\| (resource != null && isTenantScoped(...)) \|\| (resource == null && exists(employees/$(id)) && isTenantScoped(...))` (null-safe first check-in). `allow list`: tenant-scoped. | `allow create`: `canWriteAttendanceForEmployee(id, request.resource.data)` + matching `employeeId`. `allow update`: `canWriteAttendanceForEmployee(id, request.resource.data)` + tenant immutability (allows legacy `getBusinessId(resource.data) == 'none'` backfill). `allow delete`: `false`. | `PROVEN_STATIC` |
| `/attendance_logs/{recordId}` | `1361-1374` | `resource != null` null-safe tenant read | `create` & `update`: `canWriteAttendanceForEmployee(...)` + immutable `business_id`/`employeeId`; `delete`: `isSuperAdmin() \|\| isBusinessOwner(...)` | `PROVEN_STATIC` |
| `/attendance_records/{id}` | `1376-1389` | `resource != null` null-safe tenant read | `create` & `update`: `canWriteAttendanceForEmployee(...)` + immutable `business_id`/`employeeId`; `delete`: `false` | `PROVEN_STATIC` |
| `/attendance_sessions/{id}` | `1391-1404` | `resource != null` null-safe tenant read | `create` & `update`: `canWriteAttendanceForEmployee(...)` + immutable `business_id`/`employeeId`; `delete`: `false` | `PROVEN_STATIC` |
| `/attendance_events/{id}` | `1406-1411` | `resource != null` null-safe tenant read | `create`: `canWriteAttendanceForEmployee(...)`; `update, delete`: `false` (immutable audit ledger) | `PROVEN_STATIC` |
| `/attendance/{id}` | `1413-1426` | `resource != null` null-safe tenant read | `create` & `update`: `canWriteAttendanceForEmployee(...)` + immutable `business_id`/`employeeId`; `delete`: `false` | `PROVEN_STATIC` |
| `/attendance_justifications/{id}` | `493-505` | `resource != null` null-safe tenant read | `create`: `canWriteAttendanceForEmployee(...)`; `update`: `isTenantAdminOrManager \|\| isAttendanceSupervisor` + tenant lock | `PROVEN_STATIC` |
| `/attendance_adjustment_requests/{requestId}` | `1347-1359` | `resource != null` null-safe tenant read | `create`: `canWriteAttendanceForEmployee(...)`; `update`: `isTenantAdminOrManager \|\| isAttendanceSupervisor` + tenant lock | `PROVEN_STATIC` |
| `/employee_badges/{badgeId}` | `1332-1344` | Tenant-scoped or owner employee | `allow write`: narrowed from `isTenantScoped` to `isTenantAdminOrManager(getBusinessId(request.resource.data))` | `PROVEN_STATIC` |

**Overlapping Match Blocks Verification:**  
`grep -n "attendance" firestore.rules` confirms **zero** overlapping subcollection match blocks under `/businesses/{businessId}/...` for attendance collections; all rules sit cleanly at root collection level with catch-all `match /{document=**} { allow read, write: if false; }` at lines `2134-2136`.

---

## 3. Emulator & Deployment Status (Explicit Honest Reporting)

- **Static Verification (`PROVEN_STATIC`):** Verified by `AttendanceP0RbacRemediation.test.ts` (`Static firestore.rules Verification`) and `PhaseD4B24RulesHardening.test.ts` (both **PASS**).
- **Live Firestore Emulator Execution (`BLOCKED`):** `which java` returned `NO_JAVA` in this container environment, preventing live execution of `@firebase/rules-unit-testing` against the local Firestore Emulator.
- **Production Rules Deployment (`NOT_DEPLOYED`):** Prohibited under strict safety boundaries (`ZERO deploy_firebase`, `ZERO rpc_action`). Local `firestore.rules` is ready for human review and controlled deployment.
