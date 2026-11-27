# FINOPS ERP — ATTENDANCE P0.2 FIRESTORE SECURITY RULES REVIEW

**Audit ID:** `FINOPS-ATTENDANCE-P0.2`  
**Target File:** `/firestore.rules` (`2162` lines) & `/firebase-blueprint.json` (`1077` lines)  
**Verification Basis:** `PROVEN_STATIC` (full line-by-line rules inspection + `PhaseD4B24RulesHardening.test.ts` `15/15` + `Vuln01SelfPrivilegeEscalation.test.ts` `25/25`)  
**Live Emulator Execution:** **`BLOCKED_NO_JAVA`** (`which java` -> `NO_JAVA`; `@firebase/rules-unit-testing` did NOT execute)

---

## 1. Security Rule Hardening Implemented in P0.2

### A. Closing `GAP-ATT-01` (`CRITICAL`) — `match /employees/{empId}` Self-Privilege Escalation (`firestore.rules:865-933`)
- **P0.1 Vulnerability:** `employees/{empId}` `allow update` used only a denylist omitting `explicitAttendanceDelegation`, `delegatedEmployeeIds`, `delegatedBranchIds`, `authorizedBranchIds`, `authorizedBranches`, `authorizedDepartmentIds`, `authorizedTeamIds`, `managerId`, and `supervisorId`.
- **P0.2 Fix (`firestore.rules:902-928`):**
  1. **Strict Self-Update Allowlist (`lines 909-914`):** Self-matched employees (`firebase_uid`, `uid`, or verified matching email) may **only** touch:
     `['phone', 'phoneNumber', 'phone_number', 'address', 'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelation', 'preferredLanguage', 'timezone', 'avatarUrl', 'photoURL', 'photo_url', 'notificationPreferences', 'updatedAt']`.
  2. **Explicit Defense-in-Depth Denylist (`lines 915-927`):** Simultaneously rejects any diff affecting `businessId`, `business_id`, `tenantId`, `tenant_id`, `role`, `permissions`, `salary`, `baseSalary`, `salary_base_htg`, `status`, `isActive`, `active`, `firebase_uid`, `uid`, `userId`, `email`, `normalizedEmail`, `branchId`, `branch_id`, `departmentId`, `department_id`, `teamId`, `team_id`, `operational_profile`, `operationalProfile`, `explicitAttendanceDelegation`, `attendanceDelegated`, `delegatedEmployeeIds`, `delegatedBranchIds`, `authorizedBranchIds`, `authorizedBranches`, `authorizedDepartmentIds`, `authorizedTeamIds`, `managerId`, `supervisorId`.
  3. **Admin/Manager Update Tenant Lock (`lines 896-901`):** Requires `isTenantAdminOrManager(getBusinessId(resource.data))`, unchanged tenant ID, `hasConsistentTenantFields(request.resource.data)`, and `isValidRoleProfileCompatibility(request.resource.data)` when role/profile changes.
  4. **Double Defense on Server (`ServerAttendanceService.ts:344-377`):** Even if an employee doc contained legacy privilege fields, `resolveTrustedActor` reads delegation/scope fields exclusively from server-protected `users/{uid}` (whose self-update at `firestore.rules:580-615` is also strictly allowlisted).

### B. Closing `GAP-ATT-03` (`HIGH`) — Tenant Field Parity & `getBusinessId(data)` Consistency (`firestore.rules:45-59`)
- **P0.2 Fix:**
  - `hasConsistentTenantFields(data)` (`lines 45-53`) verifies pairwise equality across non-empty `business_id`, `businessId`, `tenant_id`, and `tenantId`.
  - `getBusinessId(data)` (`lines 55-59`) fails closed to `'none'` whenever `!hasConsistentTenantFields(data)`, and prioritizes canonical `business_id` first.
  - `canWriteAttendanceForEmployee` (`lines 384-391`) enforces `'business_id' in data && data.business_id is string && data.business_id != '' && hasConsistentTenantFields(data)`.

### C. Closing `GAP-ATT-02`, `GAP-ATT-04`, `GAP-ATT-08`, `GAP-ATT-12` (`HIGH`/`MEDIUM`) — Server-Authoritative Attendance Collections (`firestore.rules:1412-1463`)
All 8 authoritative attendance collections now prohibit direct client mutations (`allow create, update, delete: if false;`), eliminating self-service tampering (`GAP-ATT-02`), direct payroll lock bypass (`GAP-ATT-04`), client adjustment self-approval (`GAP-ATT-08`), and legacy `attendance_status.employeeId` mutation (`GAP-ATT-12`):

| Collection Match Block | Line Refs | Read Rules | Write Rules (`create, update, delete`) | Verification |
|---|---|---|---|---|
| `/attendance_adjustment_requests/{requestId}` | `1413-1417` | `isSuperAdmin() \|\| isTenantScoped(getBusinessId(resource.data))` | `if false;` | `PROVEN_STATIC` |
| `/attendance_logs/{recordId}` | `1419-1423` | `isSuperAdmin() \|\| isTenantScoped(getBusinessId(resource.data))` | `if false;` | `PROVEN_STATIC` |
| `/attendance_records/{id}` | `1425-1429` | `isSuperAdmin() \|\| isTenantScoped(getBusinessId(resource.data))` | `if false;` | `PROVEN_STATIC` |
| `/attendance_sessions/{id}` | `1431-1435` | `isSuperAdmin() \|\| isTenantScoped(getBusinessId(resource.data))` | `if false;` | `PROVEN_STATIC` |
| `/attendance_events/{id}` | `1437-1441` | `isSuperAdmin() \|\| isTenantScoped(getBusinessId(resource.data))` | `if false;` | `PROVEN_STATIC` |
| `/attendance/{id}` | `1443-1447` | `isSuperAdmin() \|\| isTenantScoped(getBusinessId(resource.data))` | `if false;` | `PROVEN_STATIC` |
| `/attendance_status/{id}` | `1449-1458` | Null-safe `isSuperAdmin() \|\| isAttendanceSelfTarget(id) \|\| isTenantScoped(...) \|\| (resource == null && exists(employees/$(id)) && ...)` | `if false;` | `PROVEN_STATIC` |
| `/attendance_idempotency/{id}` | `1460-1463` | `isSuperAdmin() \|\| isTenantScoped(getBusinessId(resource.data))` | `if false;` | `PROVEN_STATIC` |

### D. Remaining Client-Writable Attendance-Adjacent Collections
1. **`/attendance_justifications/{id}` (`firestore.rules:538-552`):**
   - `allow create`: Enforces `canWriteAttendanceForEmployee(...)` (which now **mandates** `data.get('recordedBy', '') == request.auth.uid && data.get('actorId', '') == request.auth.uid`, canonical non-empty `business_id`, consistent tenant fields, and active target employee) **AND** `request.resource.data.get('status', '') == 'PENDING'`.
   - `allow update`: Restricted strictly to `isSuperAdmin() || isTenantAdminOrManager(...)` (removed `isAttendanceSupervisor` approval privilege) with immutable tenant checks (`getBusinessId(request.resource.data) == getBusinessId(resource.data) && hasConsistentTenantFields(request.resource.data)`).
   - `allow delete`: Restricted to `isSuperAdmin() || isTenantAdminOrManager(...)`.
2. **`/employee_badges/{badgeId}` (`firestore.rules:1393-1410`):**
   - `allow write`: Restricted to `isSuperAdmin() || isTenantAdminOrManager(getBusinessId(request.resource.data))`.
   - `allow delete`: Restricted to `isSuperAdmin()`.
3. **`/attendance_rules/{id}`:** Governed by tenant admin/manager configuration rules via `AttendanceRepository.getRules`/`saveRules`.

### E. Closing `GAP-ATT-06` (`HIGH`) — Helper Alignment (`firestore.rules:314-450`)
- `isAttendanceSupervisor(bizId)` (`lines 314-319`): Distinct role check (`getActorRoleLower() == 'supervisor'`), never conflated with `MANAGER` or `HEAD_TELLER`. Supervisor delegation scope (`lines 408-428`) checks `managerId == uid`, `supervisorId == uid`, `authorizedTeamIds`, or `canAccessTargetBranch && getActorDepartmentId() != '' && targetDept == getActorDepartmentId()`.
- `hasExplicitAttendanceDelegation(bizId)` (`lines 321-338`): Rejects empty branch scope when `explicitAttendanceDelegation == true` unless at least one of `delegatedBranchIds`, `authorizedBranchIds`, `authorizedBranches`, `getActorBranchId()`, or `delegatedEmployeeIds` is non-empty; target access (`lines 435-443`) validates exact membership in `delegatedEmployeeIds`, `delegatedBranchIds`, or `canAccessTargetBranch`.
- `canAccessTargetBranch(targetData)` (`lines 372-378`): Supports scalar `branchId` as well as multi-branch `authorizedBranchIds` and `authorizedBranches` arrays on `users/{uid}`.

---

## 2. Schema Blueprint Alignment (`/firebase-blueprint.json:1051-1074`)
Added authoritative collection entries for `/attendance_sessions/{id}`, `/attendance_records/{id}`, `/attendance_events/{id}`, `/attendance_status/{id}`, `/attendance_adjustment_requests/{requestId}`, and `/attendance_idempotency/{id}` documenting Admin-SDK-only write governance.

---

## 3. Emulator Verification Gate (`GAP-ATT-15 — BLOCKED_NO_JAVA`)
- `which java` -> **`NO_JAVA`**; `@firebase/rules-unit-testing` (`^5.0.2` in `package.json`) cannot launch the local Firestore Emulator in this container.
- **Required Before `deploy_firebase`:** Execute emulator tests in a JDK-enabled runner verifying:
  1. Employee self-update of `explicitAttendanceDelegation`, `authorizedBranchIds`, `delegatedEmployeeIds`, `role`, `salary`, or `business_id` is **DENIED**.
  2. Employee direct `setDoc`/`updateDoc` on `attendance_logs`, `attendance_records`, `attendance_sessions`, `attendance_status`, `attendance_adjustment_requests`, `attendance_idempotency` is **DENIED**.
  3. Conflicting `{ businessId: "bizA", business_id: "bizB" }` writes are **DENIED** by `getBusinessId` / `hasConsistentTenantFields`.
  4. Cross-tenant reads on all attendance collections are **DENIED**.
  5. `attendance_justifications` create with `status != "PENDING"` or supervisor update is **DENIED**.
