# FINOPS ERP — ATTENDANCE P0.2.1 SECURITY NEGATIVE TESTS REPORT

**Validation ID:** `FINOPS-ATTENDANCE-P0.2.1`  
**Scope:** Negative security boundary verification in live Firestore Emulator (`cloud-firestore-emulator-v1.22.0.jar`) against `/firestore.rules` (SHA256 `d460959d3547383bb7825a01a974aa9a1207597de18d02283acc3bf636224d98`)  
**Evidence Classification:** `PROVEN_INTEGRATION`

---

## 1. Negative Test Failures & Bypass Findings

### FAIL-NEG-01 (`T-01-06` + `probe_details.mjs`): `MANAGER` Self-Privilege Escalation on `employees/{empId}` — **`ALLOWED_UNEXPECTEDLY`**
- **Tested Attack Vectors:**
  1. `mgrA1Db.collection('employees').doc('uid_mgr_a_br1').update({ authorizedBranchIds: ['br_1', 'br_2'] })` -> **ALLOWED**
  2. `mgrA1Db.collection('employees').doc('uid_mgr_a_br1').update({ authorizedBranches: ['br_2'] })` -> **ALLOWED**
  3. `mgrDb.collection('employees').doc('uid_mgr_a_br1').update({ explicitAttendanceDelegation: true, delegatedEmployeeIds: ['emp_a1'] })` -> **ALLOWED**
  4. `mgrDb.collection('employees').doc('uid_mgr_a_br1').update({ role: 'OWNER' })` -> **ALLOWED**
- **Control Comparison (`users/{uid}`):**
  - `mgrDb.collection('users').doc('uid_mgr_a_br1').update({ authorizedBranchIds: ['br_1', 'br_2'] })` -> **DENIED** (`evaluation error at L580:24` / allowlist rejection because `users/{userId}:620` enforces `request.auth.uid != userId`).
- **Root Cause (`firestore.rules:896-901`):** `employees/{empId}` `allow update` evaluates `isTenantAdminOrManager(getBusinessId(resource.data))` (which matches `role == 'manager'` at `lines 180-181`) **before** the self-service allowlist/denylist (`lines 902-928`) and lacks a `request.auth.uid != ...` exclusion. Moreover, `isValidRoleProfileCompatibility({ role: 'OWNER' })` returns `true` when `operational_profile` is omitted (`line 489`).
- **Severity Assessment:** `HIGH` at Firestore Rules layer (`GAP-ATT-01` incomplete). Partially mitigated on Express `/api/attendance/*` because `ServerAttendanceService.resolveTrustedActor` (`lines 326, 344-377`) reads scope/delegation from `users/{uid}` and prioritizes `users/{uid}.role` over `employees/{empId}.role`. Still unacceptable for production rules deployment because any client/UI reading `employees/{empId}` or fallback actor resolution with missing `users/{uid}.role` would observe tampered `role: 'OWNER'` and scope arrays.

### FAIL-NEG-02 (`src/tests/emulator/firestoreRules.test.ts` Test 4): Direct Client `set` on `forensic_logs/{id}` — **`ALLOWED_UNEXPECTEDLY`**
- **Tested Attack Vector:** `tellerDb.collection('forensic_logs').doc('flog_forged_01').set({ business_id: 'biz_001', action: 'TRANSFER_PAYOUT_COMPLETED', signature: 'FORGED_SIGNATURE' })`
- **Observed Result:** **ALLOWED** (failed `assertFails` in `firestoreRules.test.ts:134`).
- **Root Cause (`firestore.rules:510-515`):** `match /forensic_logs/{id}` uses `allow create: if canCreateAuditLog(request.resource.data);`, which permits any tenant-scoped authenticated user (including `TELLER`) to create arbitrary `forensic_logs` documents. (Recorded as out-of-attendance-module finding from the repository's own emulator test file.)

### MASKED-NEG-03 (`T-02-05`..`T-02-08`, `T-06-02` on `attendance_justifications` `create`): Denied via 1,000-Expression Limit Rather Than Predicate Evaluation
- **Tested Attack Vectors:**
  - `T-02-05`: Omitting `recordedBy` or `actorId`
  - `T-02-06`: Forging `recordedBy` or `actorId` to `uid_owner_a`
  - `T-02-07`: Forging `performedBy` to `uid_owner_a`
  - `T-02-08`: Bypassing workflow with `status: 'APPROVED'`
  - `T-06-02`: Offline sync payload forging `actorId != auth.uid`
- **Observed Behavior:** All returned `7 PERMISSION_DENIED`, so `assertFails` passed. However, `probe_details.mjs` proved that `EMP_JUST_NO_RECORDBY` and `EMP_JUST_APPROVED` emitted:
  `Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached. for 'create' @ L541`
- **Implication:** Until the CEL AST size of `canWriteAttendanceForEmployee` is reduced below 1,000 expressions, the emulator cannot independently confirm that `recordedBy == request.auth.uid`, `actorId == request.auth.uid`, `performedBy == request.auth.uid`, and `status == 'PENDING'` are the active rejection predicates on valid-tenant payloads.

---

## 2. Verified Negative Controls (Cleanly Enforced)

| Negative Scenario | Actor(s) | Observed Result | Proof / Line Reference |
|---|---|---|---|
| Employee self-grant of `explicitAttendanceDelegation`, `attendanceDelegated`, `delegatedEmployeeIds`, `delegatedBranchIds`, `managerId`, `supervisorId`, `role`, `permissions` (`T-01-02`..`T-01-05`, `T-01-08`) | `EMPLOYEE` | **DENIED** | `firestore.rules:909-927` (`false for 'update' @ L894`) |
| Supervisor self-grant of `authorizedDepartmentIds`, `authorizedTeamIds` (`T-01-07`) | `SUPERVISOR` | **DENIED** | `firestore.rules:909-927` (`SUPERVISOR` is not in `isTenantAdminOrManager`) |
| Head Teller self-grant of `explicitAttendanceDelegation` / `delegatedEmployeeIds` on `users/{uid}` (`T-01-09`) | `HEAD_TELLER` | **DENIED** | `firestore.rules:582-618` |
| Cross-tenant employee update (`T-01-11`) & tenant migration (`T-01-12`) | `OWNER` (`biz_b` / `biz_a`) | **DENIED** | `firestore.rules:897-899` |
| Direct client create/update/delete across all 8 authoritative attendance collections (`T-02-01`..`T-02-03`, `T-05-01`, `T-06-03`) | `EMPLOYEE`, `OWNER`, `MANAGER`, `SUPERVISOR`, `HEAD_TELLER` | **DENIED** | `false for 'create'/'update'/'delete'` at `L1416, 1422, 1428, 1434, 1440, 1446, 1457, 1462` |
| Conflicting `business_id` vs `businessId`, camelCase-only `businessId`, empty/`"none"` `business_id` (`T-03-01`..`T-03-04`) | `OWNER` | **DENIED** | Evaluated genuinely to `false` (`L45-59, 384-389, 899`) |
| Cross-tenant reads across all attendance collections & queries (`T-03-05`) | `OWNER` (`biz_b`) | **DENIED** | `isTenantScoped(getBusinessId(resource.data))` |
| Unauthenticated reads & writes across attendance & employee collections (`T-03-06`) | `UNAUTH` | **DENIED** | `isAuthenticated()` (`L6-8`) |
| Payroll cycle update/delete on `LOCKED`, `SEALED`, `PAID` (`T-04-02`) | `OWNER` | **DENIED** | `firestore.rules:1540, 1557` (Note: `PESSIMISTIC_LOCKED` omitted at `L1540`, `OBS-04-03` **ALLOWED**) |
| Justification approval (`attendance_justifications` `update`) by non-managers (`T-05-02`) | `SUPERVISOR`, `HEAD_TELLER`, `EMPLOYEE`, `AUDITOR`, cross-tenant `OWNER` | **DENIED** | `firestore.rules:543-550` (`OWNER`/`MANAGER` same-tenant ALLOWED) |
| Legacy offline payloads missing `business_id` (`T-06-01`) | `EMPLOYEE` | **DENIED** | `firestore.rules:384, 1422` |
