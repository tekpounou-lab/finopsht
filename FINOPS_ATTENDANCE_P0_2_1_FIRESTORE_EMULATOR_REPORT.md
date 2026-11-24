# FINOPS ERP — ATTENDANCE P0.2.1 FIRESTORE EMULATOR VALIDATION REPORT

**Validation ID:** `FINOPS-ATTENDANCE-P0.2.1`  
**Mode:** CI-Only Isolated Firestore Emulator Validation — Strictly Read-Only Application  
**Rules File Evaluated:** `/firestore.rules` (`2162` lines)  
**Rules SHA256:** `d460959d3547383bb7825a01a974aa9a1207597de18d02283acc3bf636224d98`  
**Target Reference (Unmodified / Not Connected):** Firebase Project `finopsht` / Database `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`  
**Isolated Emulator Project:** `finops-p021-emulator-test` (`127.0.0.1:8088`, `cloud-firestore-emulator-v1.22.0.jar`, Eclipse Temurin JRE `21.0.13.1+2-LTS`)  
**Application & Rules Mutated:** **NONE** (`0` files modified in `/src/`, `/firestore.rules`, `/firebase.json`, `/package.json`)  
**Evidence Classification:** `PROVEN_INTEGRATION` (Live Firestore Emulator via `@firebase/rules-unit-testing@^5.0.2`; **NOT** `PROVEN_RUNTIME`)

---

## FINAL STOP GATE VERDICT: `FAIL`

Live Firestore Emulator validation executed cleanly (`45/45` P0.2.1 scenarios + `11` diagnostic probes + `7` existing repository financial rules emulator tests) and **uncovered two critical/high runtime defects in `/firestore.rules`** that were invisible to P0.2's regex-based unit tests and mocked Express tests:

1. **CRITICAL / HIGH (`T-01-06` — `GAP-ATT-01` Residual Bypass):** A tenant `MANAGER` can update their **own** `/employees/{empId}` document in live Firestore to self-grant `authorizedBranchIds`, `authorizedBranches`, `explicitAttendanceDelegation`, `delegatedEmployeeIds`, and even `role: "OWNER"` (`ALLOWED_UNEXPECTEDLY`).
   - *Root Cause:* `firestore.rules:897` grants full tenant employee-update authority to `isTenantAdminOrManager(getBusinessId(resource.data))` (which includes `'manager'` at `lines 180-181`) **without** a `request.auth.uid != ...` self-protection guard (unlike `users/{userId}` at `firestore.rules:620`) and **without** restricting authorization-sensitive fields (`role`, `permissions`, `authorizedBranchIds`, `authorizedBranches`, `authorizedDepartmentIds`, `authorizedTeamIds`, `explicitAttendanceDelegation`, `delegatedEmployeeIds`, `delegatedBranchIds`) to `OWNER` / `SUPER_ADMIN`.
   - *Backend Mitigation vs Rules Exposure:* `ServerAttendanceService.resolveTrustedActor` (`lines 344-377`) reads delegation/scope arrays exclusively from `users/{uid}` (where `MGR_USERS_SELF_ESCALATE` was `DENIED` at `L580`), mitigating immediate API privilege escalation. However, at the Firestore Security Rules layer, **`GAP-ATT-01` is NOT fully closed for `MANAGER`**.

2. **HIGH (`M-01`, `M-02`, `M-03`, `M-04`, `M-06`, `M-07`, `M-08`, `M-09` — CEL 1,000-Expression Limit Exhaustion at `firestore.rules:541`):** Every non-`SUPER_ADMIN` client `create` on `/attendance_justifications/{id}` fails unconditionally in live Firestore with:
   `7 PERMISSION_DENIED: Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached. for 'create' @ L541`
   - *Root Cause:* Firestore Security Rules expand functions by **call-by-name (macro inlining)**. Passing `getBusinessId(data)` (which itself calls `hasConsistentTenantFields(data)` at `lines 45-59`) into `isTenantScoped(getBusinessId(data))` (`lines 145-162`), `isBusinessOwner(bizId)` (`lines 90-118`), and `isValidActiveTenantEmployeeForAttendance(empId, getBusinessId(data))` (`lines 353-370`) re-expands `getBusinessId(data)` ~20+ times inside `canWriteAttendanceForEmployee` (`lines 380-450`), exceeding Firestore's hard **1,000 expressions per rule evaluation** limit.
   - *Production Impact:* `AttendanceRepository.submitJustification` (`src/repositories/AttendanceRepository.ts:684-711`) writes directly to `attendance_justifications` from the client SDK and is **100% broken for all non-`SUPER_ADMIN` roles** (`OWNER`, `MANAGER`, `SUPERVISOR`, `HEAD_TELLER`, `SENIOR_TELLER`, `JUNIOR_TELLER`, `EMPLOYEE`).
   - *Masking Effect on Negative Tests:* Diagnostic probing (`probe_details.mjs`) proved that negative tests on `attendance_justifications` `create` with a valid `business_id` (`T-02-05`..`T-02-08`, `M-05`, `M-10`, `M-12`, `T-06-02`) were denied by hitting the 1,000-expression cap (`hit1000=true`) rather than cleanly reaching the `recordedBy`/`actorId`/`status` and role checks, whereas invalid/conflicting tenant payloads (`T-03-01`..`T-03-03`) genuinely evaluated to `false` before hitting the cap.

---

## 1. Execution Summary

| Suite | Executed | Passed | Failed | Skipped | Evidence Classification |
|---|---:|---:|---:|---:|---|
| P0.2.1 Attendance Rules Emulator Suite (`run_rules_suite.mjs`) | `45` | `36` | `9` | `0` | `PROVEN_INTEGRATION` |
| P0.2.1 Diagnostic CEL & Self-Escalation Probes (`probe_details.mjs`) | `11` | `N/A` (diagnostic) | `N/A` | `0` | `PROVEN_INTEGRATION` |
| Existing Repo Emulator Suite (`src/tests/emulator/firestoreRules.test.ts` w/ `--hookTimeout=30000`) | `7` | `6` | `1` | `0` | `PROVEN_INTEGRATION` |

*Note on Existing Repo Emulator Suite:* With Vitest's default `10000ms` hook timeout, `beforeAll` timed out compiling the `2162`-line `firestore.rules`. Re-running with `--hookTimeout=30000` completed all `7` tests: `6` passed, `1` failed (`test 4`: `forensic_logs` client `create` by a teller unexpectedly succeeded via `canCreateAuditLog` at `firestore.rules:513`), and tests `6`–`7` also emitted `maximum of 1000 expressions` warnings on `branch_safes` (`L1033`), `exchange_rates` (`L971`), and `cash_tills` (`L1001`).

---

## 2. Gap-by-Gap Live Emulator Closure Status

| Gap ID | Scope Tested in Emulator | Live Emulator Result | Closure Status | Key Proof & Caveats |
|---|---|---|---|---|
| `GAP-ATT-01` | `T-01-01`..`T-01-12` + `probe_details.mjs` | `11/12` passed, **`1` failed (`T-01-06`)** | **FAIL (`OPEN_FOR_MANAGER`)** | `EMPLOYEE`, `SUPERVISOR`, and `HEAD_TELLER` self-escalation on `employees/{empId}` & `users/{uid}` is **DENIED**; `MANAGER` self-escalation on `users/{uid}` is **DENIED** (`L620`); however **`MANAGER` self-escalation on `employees/{empId}` (`authorizedBranchIds`, `authorizedBranches`, `explicitAttendanceDelegation`, `delegatedEmployeeIds`, `role: 'OWNER'`) is `ALLOWED` (`L897`)**. |
| `GAP-ATT-02` | `T-02-01`..`T-02-08` + `probe_details.mjs` | `8/8` assertions returned expected allow/deny; **caveat on `T-02-05`..`T-02-08`** | **PARTIAL PASS** | All 8 authoritative collections (`attendance_logs`, `attendance_records`, `attendance_sessions`, `attendance_events`, `attendance`, `attendance_status`, `attendance_adjustment_requests`, `attendance_idempotency`) block all direct client writes (`if false;`, `L1413-1463`) for both `EMPLOYEE` and `OWNER` (`PROVEN_INTEGRATION`). Null-safe `attendance_status/{id}` `get` (`T-02-04`) works. However, `attendance_justifications` `create` tests `T-02-05`..`T-02-08` were denied by the 1,000-expression cap on `L541` rather than deterministic rule predicates. |
| `GAP-ATT-03` | `T-03-01`..`T-03-06` + `probe_details.mjs` | `6/6` passed | **PASS** (`PROVEN_INTEGRATION`) | Conflicting `business_id` vs `businessId`, camelCase-only `businessId`, empty/`"none"` `business_id`, cross-tenant reads across all attendance collections, and unauthenticated reads/writes are all genuinely **DENIED** (`false` before expression cap). |
| `GAP-ATT-04` | `T-04-01`..`T-04-02` + `OBS-04-03` | `2/2` passed + **`OBS-04-03` discrepancy** | **PARTIAL PASS** | Direct client attendance writes during `LOCKED`, `PESSIMISTIC_LOCKED`, `SEALED`, `PAID` are **DENIED** (`if false;`), and `payroll_cycles` update/delete on `LOCKED`/`SEALED`/`PAID` are **DENIED** (`L1540, L1557`). **Discrepancy (`OBS-04-03`):** `payroll_cycles/{cycleId}` `update` when `status == 'PESSIMISTIC_LOCKED'` was **ALLOWED** in rules because `L1540` omits `'PESSIMISTIC_LOCKED'`, whereas `ServerAttendanceService.ts:129-134` locks attendance writes on `'PESSIMISTIC_LOCKED'`. |
| `GAP-ATT-06` | `M-04`, `M-05` | `M-05` (`DENY`) passed; **`M-04` (`ALLOW`) failed** | **FAIL (Rules L541)** | Empty-branch `HEAD_TELLER` delegation is denied (`M-05`), but valid `HEAD_TELLER` delegation justification `create` (`M-04`) failed due to the 1,000-expression cap on `L541`. Backend delegation logic remains verified only via P0.2 unit/Express tests (`PROVEN_UNIT`/`PROVEN_INTEGRATION` mocked). |
| `GAP-ATT-08` | `T-05-01`..`T-05-02` | `2/2` passed | **PASS** (`PROVEN_INTEGRATION`) | Direct `attendance_adjustment_requests` `create`/`update`/`delete` is **DENIED** for all roles (`L1416`, forcing Maker-Checker via Admin SDK); `attendance_justifications` `update` (approval) is **ALLOWED** for same-tenant `OWNER`/`MANAGER` and **DENIED** for `SUPERVISOR`, `HEAD_TELLER`, `EMPLOYEE`, `AUDITOR`, and cross-tenant `OWNER`. |
| `GAP-ATT-12` | `T-06-01`..`T-06-03` | `3/3` passed (caveat on `T-06-02`) | **PARTIAL PASS** | Legacy offline payloads on `attendance_logs`/`attendance_justifications` missing `business_id` and direct `attendance_status` mutations (`T-06-01`, `T-06-03`) are **DENIED**; `T-06-02` (`actorId` spoofing on `attendance_justifications` `create`) denied via 1,000-expression cap at `L541`. |
| Role Matrix (`L541`) | `M-01`..`M-12` + `OBS-M-11` | `4/12` passed, **`8/12` failed** | **FAIL** | All `ALLOW` matrix cases (`OWNER`, `MANAGER`, `SUPERVISOR`, `HEAD_TELLER` valid/self, `SENIOR_TELLER`, `JUNIOR_TELLER`, `EMPLOYEE`) failed on `attendance_justifications` `create` due to the 1,000-expression cap at `L541`. `OBS-M-11`: `firestore.rules:392,446` lacks an allowlist of canonical roles (unlike `ServerAttendanceService`), though runtime evaluation hit the 1,000-expression limit. |

---

## 3. Rules-vs-Backend Discrepancies Verified at Runtime

1. **AST Expression Explosion (`firestore.rules:380-450, 541`):** `canWriteAttendanceForEmployee` compiles above Firestore's 1,000-expression evaluation limit when `business_id` is well-formed, breaking `AttendanceRepository.submitJustification` for every role except `SUPER_ADMIN`. (Similar expression-budget pressure also surfaced on `branch_safes:1033`, `exchange_rates:971`, and `cash_tills:1001` in `firestoreRules.test.ts`.)
2. **`employees/{empId}` Self-Update Guard Asymmetry (`firestore.rules:897` vs `620` & `ServerAttendanceService.ts:344-377`):** `users/{userId}:620` blocks `request.auth.uid == userId` from using the admin/manager branch, whereas `employees/{empId}:897` allows `MANAGER` to mutate their own `employees` document without restriction.
3. **`payroll_cycles` `PESSIMISTIC_LOCKED` Parity Gap (`firestore.rules:1540,1557` vs `ServerAttendanceService.ts:129-134`):** `firestore.rules:1540` omits `'PESSIMISTIC_LOCKED'` from protected statuses on `payroll_cycles` update/delete, permitting client `payroll_cycles` updates while `PESSIMISTIC_LOCKED` (unlike `LOCKED`, `SEALED`, `VALIDATED`, `PAID`).
4. **Unknown Role Policy Divergence (`firestore.rules:392,446` vs `AttendanceAuthorizationService.ts:269-277`):** `canWriteAttendanceForEmployee` uses a small denylist (`['auditor', 'guest', 'unassigned', 'accountant', '']`) and falls through to `isAttendanceSelfTarget(empId)` at `L446`, whereas the server fails closed with `403 INVALID_OR_MISSING_ROLE` for unknown roles.
5. **`attendance_justifications` Update Lacks Payroll-Lock Check (`firestore.rules:543-550`):** `OWNER`/`MANAGER` updates on `attendance_justifications` are tenant-checked but do not check `payroll_cycles` status in rules (expected, since `attendance_justifications` is a non-authoritative note collection, while `attendance_adjustment_requests` uses `if false;` + Admin SDK).

---

## 4. Mandatory Action Before `deploy_firebase`

**DO NOT deploy `/firestore.rules` to `finopsht` in its current state.**

Required follow-up remediation (in a separate authorized remediation phase, not this read-only validation):
1. **Fix `GAP-ATT-01` for `MANAGER` (`firestore.rules:896-901`):** Prevent `MANAGER` from updating their own `employees/{empId}` document via the `isTenantAdminOrManager` branch (and/or restrict `role`, `permissions`, `authorizedBranchIds`, `authorizedBranches`, `authorizedDepartmentIds`, `authorizedTeamIds`, `explicitAttendanceDelegation`, `attendanceDelegated`, `delegatedEmployeeIds`, `delegatedBranchIds`, `managerId`, `supervisorId` modifications on `employees/{empId}` to `isSuperAdmin() || isBusinessOwner(...)` only).
2. **Eliminate the 1,000-Expression Limit Overflow in `canWriteAttendanceForEmployee` (`firestore.rules:45-162, 380-450`):** Inline `let` bindings (`rules_version = '2'` supports `let` in newer compilers, or refactor helpers to accept already-validated scalar `bizId` / avoid calling `getBusinessId(data)` and `isTenantScoped()`/`isSuperAdmin()`/`isBusinessOwner()` redundantly), or route `attendance_justifications` creation through an Admin SDK `/api/attendance/justifications` endpoint and lock `attendance_justifications` client writes (`if false;`), then re-run this exact emulator suite until `45/45` pass cleanly without expression exhaustion.
3. **Align `payroll_cycles` (`firestore.rules:1540, 1557`):** Add `'PESSIMISTIC_LOCKED'` to the immutable cycle status list.
4. **Audit `forensic_logs` (`firestore.rules:513`) and financial helper expression budgets (`971, 1001, 1033`)** flagged by `src/tests/emulator/firestoreRules.test.ts`.
