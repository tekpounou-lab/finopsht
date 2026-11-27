# FINOPS ERP — ATTENDANCE P0.1 FIRESTORE SECURITY RULES REVIEW

**Audit ID:** `FINOPS-ATTENDANCE-P0.1`  
**Target File:** `/firestore.rules` (`2141` lines)  
**Verification Status:** `PROVEN_STATIC` (source inspection + regex unit assertions) | **Live Emulator Runtime:** `BLOCKED` (`which java` -> `NO_JAVA`)

---

## 1. Independent Assessment of Claims Made in P0

The P0 remediation report (`FINOPS_ATTENDANCE_P0_FIRESTORE_RULES_VERIFICATION.md`) accurately reflects that:
1. `isTenantAdminOrManager(bizId)` (`firestore.rules:152-175`) was preserved untouched (no `head_teller` or `master_head_teller` added).
2. Dedicated helpers (`getActorRoleLower`, `getActorDepartmentId`, `isAttendanceSupervisor`, `hasExplicitAttendanceDelegation`, `isAttendanceSelfTarget`, `isValidActiveTenantEmployeeForAttendance`, `canWriteAttendanceForEmployee`) were added (`lines 288-405`).
3. `attendance_status/{id}` `allow get` was made null-safe for initial check-ins (`lines 1429-1434`), and `allow create`/`allow update` use `canWriteAttendanceForEmployee(id, request.resource.data)` (`lines 1436-1440`).
4. Zero overlapping `/businesses/{bizId}/attendance*` subcollection match blocks exist, and the root catch-all `match /{document=**} { allow read, write: if false; }` (`lines 2134-2136`) remains intact.

**However, independent security line-by-line review uncovered 7 material defects across `/firestore.rules` (1 CRITICAL, 3 HIGH, 3 MEDIUM):**

---

## 2. Concrete Rule Defects & Security Gaps

### [GAP-ATT-01 — CRITICAL] Self-Privilege Escalation in `match /employees/{empId}` (`firestore.rules:847-863`)
- **Code (`firestore.rules:850-862`):**
  ```
  allow update: if isAuthenticated() && (
    ...
    (
      (
        resource.data.get('firebase_uid', '') == request.auth.uid ||
        resource.data.get('uid', '') == request.auth.uid ||
        (getAuthEmail() != '' && resource.data.get('email', '').lower() == getAuthEmail().lower()) ||
        (getAuthEmail() != '' && resource.data.get('normalizedEmail', '').lower() == getAuthEmail().lower())
      ) &&
      !request.resource.data.diff(resource.data).affectedKeys().hasAny([
        'businessId', 'business_id', 'role', 'permissions', 'salary', 'baseSalary', 'salary_base_htg',
        'status', 'isActive', 'firebase_uid', 'uid', 'email', 'normalizedEmail',
        'branchId', 'branch_id', 'departmentId', 'department_id', 'operational_profile', 'operationalProfile'
      ])
    )
  );
  ```
- **Vulnerability:** Uses a **denylist** that **omits** `explicitAttendanceDelegation`, `attendanceDelegated`, `delegatedEmployeeIds`, `delegatedBranchIds`, `authorizedBranchIds`, `authorizedBranches`, `authorizedDepartmentIds`, `authorizedTeamIds`, `managerId`, and `supervisorId`.
- **Exploit Chain:** `ServerAttendanceService.resolveTrustedActor` (`src/domains/attendance/ServerAttendanceService.ts:248-281`) reads all of these fields from `empData` (`/employees/{uid}`). An authenticated `HEAD_TELLER` can write `{ explicitAttendanceDelegation: true }` or `{ delegatedEmployeeIds: [...] }` to their own `employees/{empId}` doc via client Firestore SDK, and a `MANAGER` or `SUPERVISOR` can write `authorizedBranchIds` / `authorizedDepartmentIds` / `authorizedTeamIds` to expand their scope across the entire business! *(Note: `users/{userId}` at `firestore.rules:537-556` correctly uses a strict allowlist and is NOT vulnerable to this self-edit.)*
- **Evidence Tag:** `PROVEN_STATIC`

### [GAP-ATT-02 — HIGH] Self-Service Tampering & Optional `recordedBy`/`actorId` (`firestore.rules:359-361, 1365-1425`)
- **Optional Audit Attribution (`lines 359-361`):**
  ```
  (!('recordedBy' in data) || data.recordedBy == request.auth.uid) &&
  (!('actorId' in data) || data.actorId == request.auth.uid) &&
  (!('performedBy' in data) || data.performedBy == request.auth.uid)
  ```
  Because of `!('field' in data)`, any direct client `create` or `update` can omit `recordedBy`, `actorId`, and `performedBy` entirely.
- **Unrestricted Self-Updates (`lines 1365-1425`):**
  `attendance_logs`, `attendance_records`, `attendance_sessions`, and `attendance` all authorize `allow update` whenever `canWriteAttendanceForEmployee(...)` is true. Because `canWriteAttendanceForEmployee` permits `isAttendanceSelfTarget(empId)` (`line 401`) for `EMPLOYEE`, `JUNIOR_TELLER`, `SENIOR_TELLER`, `HEAD_TELLER`, etc., **any employee can use Firestore client SDK `updateDoc` / `setDoc` directly to modify their own `checkIn`, `checkOut`, `realHours`, `variance`, `status`, or `overrideReason`** after clock-in/out!
- **Evidence Tag:** `PROVEN_STATIC`

### [GAP-ATT-03 — HIGH] `getBusinessId(data)` Precedence & Conflicting Tenant Keys (`firestore.rules:45-47`)
- **`getBusinessId(data)` (`lines 45-47`):** Evaluates `businessId` before `business_id` without requiring equality when both are present.
- **Impact:** A client creating a document with `{ businessId: "biz_actor", business_id: "biz_victim" }` passes `isTenantScoped(getBusinessId(data))` while writing a document whose canonical snake_case `business_id` targets another tenant. (Note: `hasNoProfileConflict` exists for `operational_profile` at `lines 423-427`, but no equivalent check exists in `getBusinessId` or `canWriteAttendanceForEmployee`.)
- **Evidence Tag:** `PROVEN_STATIC`

### [GAP-ATT-04 — HIGH] No Payroll Period Lock Guard in Firestore Rules (`firestore.rules:1346-1442`)
- None of the attendance match blocks verify whether a date is inside a `LOCKED`, `PESSIMISTIC_LOCKED`, `SEALED`, or `PAID` payroll cycle. While `payroll_cycles/{cycleId}` itself protects sealed cycles from modification (`lines 1518-1520`), direct client writes to `attendance_logs` / `attendance_records` / `attendance_sessions` for a closed payroll date are NOT blocked by Firestore rules if an authorized actor bypasses `AttendanceRepository.verifyPeriodLock`.
- **Evidence Tag:** `PROVEN_STATIC`

### [GAP-ATT-06 — HIGH (Divergence)] `hasExplicitAttendanceDelegation` & `SUPERVISOR` Rule Divergence (`firestore.rules:309-316, 374-400`)
- `hasExplicitAttendanceDelegation(bizId)` (`lines 309-316`) only checks `getMyProfile().get('explicitAttendanceDelegation', false) == true` + single `getActorBranchId()` equality (`line 398`), ignoring `delegatedEmployeeIds`, `delegatedBranchIds`, `authorizedBranchIds`, and `permissions: ["attendance.delegate_others"]` supported by `ServerAttendanceService.ts:248-281` and `AttendanceAuthorizationService.ts:341-361`.
- Furthermore, in `isAttendanceSupervisor` rules (`lines 386-388`): if `getActorDepartmentId() == ''`, a `SUPERVISOR` is allowed across **all** employees in `getActorBranchId()`, whereas `AttendanceAuthorizationService.ts:749-759` only denies if both branch AND dept AND directReport are empty; and if the `SUPERVISOR` has `authorizedBranchIds` / `authorizedDepartmentIds` arrays (multi-branch/multi-team), `firestore.rules` only checks single scalar `getActorBranchId()` / `getActorDepartmentId()`.

### [GAP-ATT-08 — MEDIUM/HIGH] `SUPERVISOR` Allowed to Approve `attendance_adjustment_requests` & `attendance_justifications` (`firestore.rules:500, 1354`)
- `attendance_adjustment_requests` `allow update` (`lines 1351-1357`) allows `(isTenantAdminOrManager(...) || isAttendanceSupervisor(...))` without enforcing Maker-Checker (`request.auth.uid != resource.data.requestedBy`) or blocking `SUPERVISOR` overrides (whereas `role.permissions.ts:88` and `AttendanceAuthorizationService.ts:553-570` restrict overrides to `OWNER`/`MANAGER`/`ADMIN`/`SUPER_ADMIN`).

### [GAP-ATT-12 — MEDIUM] `attendance_status/{id}` Legacy `employeeId` Update Gap (`firestore.rules:1438-1440`)
- `allow create` (`line 1437`) verifies `(!('employeeId' in request.resource.data) || request.resource.data.employeeId == id)`.
- `allow update` (`line 1440`) checks `(!('employeeId' in resource.data) || request.resource.data.get('employeeId', id) == resource.data.employeeId)`. If an existing legacy `attendance_status/{id}` doc omitted `employeeId`, `update` permits writing any arbitrary `employeeId != id`.

---

## 3. Collection-by-Collection Verification Matrix

| Collection | Rules Lines | Tenant Scoping | Role / Self-Only Enforcement | Immutability / Anti-Tamper | Runtime Emulator Status |
|---|---|---|---|---|---|
| `attendance_status/{id}` | `1428-1442` | `get`: Null-safe `exists(employees/$(id))` + `isTenantScoped`. `update`: allows backfill when legacy `getBusinessId(resource.data) == 'none'`. | `canWriteAttendanceForEmployee(id, ...)` enforced. | `delete: false`. Legacy missing `employeeId` allows mismatch on update (`GAP-ATT-12`). | `BLOCKED` (`NO_JAVA`) |
| `attendance_logs/{recordId}` | `1361-1374` | `get/list`: `isTenantScoped`. `create/update`: `getBusinessId` match. | `canWriteAttendanceForEmployee(...)`. | **FAIL (`GAP-ATT-02`)**: self-targets can directly `update` `realHours`/`variance`/`checkOut`; `delete` allows `OWNER`. No period-lock rule (`GAP-ATT-04`). | `BLOCKED` (`NO_JAVA`) |
| `attendance_records/{id}` | `1376-1389` | `get/list`: `isTenantScoped`. `create/update`: `getBusinessId` match. | `canWriteAttendanceForEmployee(...)`. | **FAIL (`GAP-ATT-02`)**: self-targets can directly `update`; `delete: false`. | `BLOCKED` (`NO_JAVA`) |
| `attendance_sessions/{id}` | `1391-1404` | `get/list`: `isTenantScoped`. `create/update`: `getBusinessId` match. | `canWriteAttendanceForEmployee(...)`. | **FAIL (`GAP-ATT-02`)**: self-targets can directly `update` `totalMinutes`/`status`; `delete: false`. | `BLOCKED` (`NO_JAVA`) |
| `attendance_events/{id}` | `1406-1411` | `get/list`: `isTenantScoped`. | `create`: `canWriteAttendanceForEmployee(...)`. | `update, delete: false` (Immutable). | `BLOCKED` (`NO_JAVA`) |
| `attendance/{id}` | `1413-1426` | `get/list`: `isTenantScoped`. | `canWriteAttendanceForEmployee(...)`. | Self-update allowed (`GAP-ATT-02`); `delete: false`. | `BLOCKED` (`NO_JAVA`) |
| `attendance_justifications/{id}` | `493-505` | `get/list`: `isTenantScoped`. | `create`: `canWriteAttendanceForEmployee`. `update`: `AdminOrManager || Supervisor`. | `delete`: `AdminOrManager`. | `BLOCKED` (`NO_JAVA`) |
| `attendance_adjustment_requests/{id}` | `1347-1359` | `get/list`: `isTenantScoped`. | `create`: `canWriteAttendanceForEmployee`. `update`: `AdminOrManager || Supervisor` (no Maker-Checker). | `delete: false` (except SuperAdmin). | `BLOCKED` (`NO_JAVA`) |
| `employee_badges/{badgeId}` | `1332-1344` | `get/list`: `isTenantScoped` or own badge. | `write`: `isTenantAdminOrManager(getBusinessId(request.resource.data))`. | Restricted appropriately (`PROVEN_STATIC`). | `BLOCKED` (`NO_JAVA`) |
| `employees/{empId}` | `818-867` | `isTenantScoped` / self-match. | `create/delete`: `isTenantAdminOrManager`. | **CRITICAL FAIL (`GAP-ATT-01`)**: self-update denylist omits delegation and scope arrays. | `BLOCKED` (`NO_JAVA`) |
| `audit_logs/{logId}` | `458-463` | `get/list`: `isTenantScoped`. | `create`: `canCreateAuditLog` (`lines 449-455`: allows any authenticated user of tenant or `'global'`). | `update, delete: false` (Immutable). | `BLOCKED` (`NO_JAVA`) |
