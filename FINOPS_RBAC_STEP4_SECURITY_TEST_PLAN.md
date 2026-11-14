# FINOPS ERP / FINAYITI FUSION
## RBAC STEP 4 — SECURITY TEST PLAN
### READ-ONLY SPECIFICATION FOR IMPLEMENTATION VERIFICATION

**Audit ID:** `FINOPS-RBAC-STEP4-FINAL-ALIGNMENT-02`  
**Current Verified Security Baseline (Observed Prior to Step 4):** `17` test files, `287/287` tests passing (`vitest run src/tests/unit/security src/tests/unit/cash/OperationalProfileWorkflow.test.ts src/tests/unit/cash/TellerAndTillManagementScenarios.test.ts`).  
**Note:** Tests marked `[TO BE IMPLEMENTED IN STEP 4]` define mandatory verification coverage for the future authorized Step 4 implementation turn.

---

## 1. TEST SUITE 1 — ROLE × OPERATIONAL PROFILE COMPATIBILITY (THE 9 FORBIDDEN COMBINATIONS)

Every test below MUST assert **explicit rejection** (`isValid: false`, error code `INCOMPATIBLE_ROLE_OPERATIONAL_PROFILE`, HTTP `400/403`) with **NO silent fallback, coercion, or normalization**:

| Test ID | Input `role` | Input `operational_profile` | Expected Result | Target Enforcement Point |
|---|---|---|---|---|
| `S4-COMP-01` | `EMPLOYEE` | `vendeur` | `ALLOW` (`vendeur`) | Policy Validator, Invite, Employee Edit, Bulk Import |
| `S4-COMP-02` | `EMPLOYEE` | `polyvalent` | `ALLOW` (`polyvalent`) | Policy Validator, Invite, Employee Edit, Bulk Import |
| `S4-COMP-03` | `EMPLOYEE` | `teller` | **REJECT** (Forbidden #1) | Policy Validator, Invite, Employee Edit, Bulk Import |
| `S4-COMP-04` | `JUNIOR_TELLER` | `vendeur` | **REJECT** (Forbidden #2) | Policy Validator, Invite, Employee Edit, Bulk Import |
| `S4-COMP-05` | `JUNIOR_TELLER` | `polyvalent` | **REJECT** (Forbidden #3) | Policy Validator, Invite, Employee Edit, Bulk Import |
| `S4-COMP-06` | `SENIOR_TELLER` | `vendeur` | **REJECT** (Forbidden #4) | Policy Validator, Invite, Employee Edit, Bulk Import |
| `S4-COMP-07` | `SENIOR_TELLER` | `polyvalent` | **REJECT** (Forbidden #5) | Policy Validator, Invite, Employee Edit, Bulk Import |
| `S4-COMP-08` | `HEAD_TELLER` | `vendeur` | **REJECT** (Forbidden #6) | Policy Validator, Invite, Employee Edit, Bulk Import, Profile Switch |
| `S4-COMP-09` | `HEAD_TELLER` | `polyvalent` | **REJECT** (Forbidden #7) | Policy Validator, Invite, Employee Edit, Bulk Import |
| `S4-COMP-10` | `MASTER_HEAD_TELLER` | `vendeur` | **REJECT** (Forbidden #8) | Policy Validator, Invite, Employee Edit, Bulk Import |
| `S4-COMP-11` | `MASTER_HEAD_TELLER` | `polyvalent` | **REJECT** (Forbidden #9) | Policy Validator, Invite, Employee Edit, Bulk Import |
| `S4-COMP-12` | `JUNIOR_TELLER` / `SENIOR_TELLER` / `HEAD_TELLER` / `MASTER_HEAD_TELLER` | `teller` | `ALLOW` (`teller`) | Policy Validator, Invite, Employee Edit, Bulk Import |
| `S4-COMP-13` | `TELLER` (Legacy) | `vendeur` / `polyvalent` | **REJECT** | Policy Validator |
| `S4-COMP-14` | `EMPLOYEE` | `head_teller` / `manager` / `owner` | **REJECT** (Retired role-profiles) | Policy Validator, TransactionTypeEditorDialog |

---

## 2. TEST SUITE 2 — FAIL-CLOSED MISSING, NULL, EMPTY, MALFORMED & UNKNOWN PROFILES

| Test ID | Scenario | Expected Result |
|---|---|---|
| `S4-FAIL-01` | `operational_profile` is `undefined`, `null`, `""`, or `"   "` on `EMPLOYEE` | **FAIL CLOSED (`DENY`)** on Sales, Services, Cash; NO default to `vendeur` |
| `S4-FAIL-02` | `operational_profile` is `undefined`, `null`, `""`, or `"   "` on `JUNIOR_TELLER`/`SENIOR_TELLER`/`HEAD_TELLER`/`MASTER_HEAD_TELLER` | **FAIL CLOSED (`DENY`)** on `/api/cash/transfers/*`, `/api/cash/sessions/close`, `ServerTillProvisioningService`, `EmployeeCashEligibilityService` |
| `S4-FAIL-03` | `operational_profile` is malformed (`123`, `{}`, `["teller"]`, `"ADMIN"`, `"__proto__"`, `"VENDEUR_PLUS"`) | **FAIL CLOSED (`DENY`)** everywhere; `filterTypesByProfile` returns `[]` |
| `S4-FAIL-04` | `TransactionMappingEngine.isOperationAllowedForProfile(op, undefined)` or `filterTypesByProfile(types, undefined)` | Returns `{ isAllowed: false }` and `[]` respectively (no return of all active types) |

---

## 3. TEST SUITE 3 — LEGACY `barber` ALIAS BOUNDARY

| Test ID | Scenario | Expected Result |
|---|---|---|
| `S4-BARB-01` | Legacy `EMPLOYEE` record with `operational_profile: "barber"` normalized at ingress/read | Maps strictly to `vendeur` -> `ALLOW` Sales, `DENY` Services, `DENY` Cash |
| `S4-BARB-02` | `TELLER` role (`JUNIOR_TELLER`, `SENIOR_TELLER`, `HEAD_TELLER`, `MASTER_HEAD_TELLER`) with `operational_profile: "barber"` | **REJECT** explicitly (never mapped to `teller` or `vendeur` for a teller) |
| `S4-BARB-03` | New UI creation/invitation attempt selecting `"barber"` | Not selectable in UI; rejected as deprecated if injected on new writes unless explicit migration flag |

---

## 4. TEST SUITE 4 — `EMPLOYEE` (`vendeur` vs `polyvalent`) FUNCTIONAL & CASH ISOLATION

| Test ID | Actor & Profile | Attempted Action | Expected Result |
|---|---|---|---|
| `S4-EMP-01` | `EMPLOYEE + vendeur` | Record Commercial Sale (`Sales` / `tt_sys_3001`) | `ALLOW` |
| `S4-EMP-02` | `EMPLOYEE + vendeur` | Record Service (`Services` / `tt_sys_3101`) in `TransactionMappingEngine`, `MySalesAndExpensesSection`, or `CreateTransactionDialog` | **DENY** |
| `S4-EMP-03` | `EMPLOYEE + polyvalent` | Record Commercial Sale (`Sales`) | `ALLOW` |
| `S4-EMP-04` | `EMPLOYEE + polyvalent` | Record Commercial Service (`Services`) | `ALLOW` |
| `S4-EMP-05` | `EMPLOYEE + polyvalent` | Execute Cash Intake (`/api/cash/transfers/intake`), Cash Payout (`/api/cash/transfers/payout`), Money Transfer, Mobile Transfer, or Currency Exchange | **DENY (`403 FORBIDDEN`)** |
| `S4-EMP-06` | `EMPLOYEE + polyvalent` (and `EMPLOYEE + vendeur`) | Till assignment (`EmployeeCashEligibilityService.isEligibleForTillAssignment`) or `ServerTillProvisioningService.autoProvisionTillsForBusiness` | **DENY (`UNAUTHORIZED_ROLE`)** — zero tills provisioned/assigned |
| `S4-EMP-07` | `EMPLOYEE + polyvalent` | Till Session Open / Close (`/api/cash/sessions/close`) / Reopen / Internal Transfer Request | **DENY (`403 FORBIDDEN`)** |
| `S4-EMP-08` | `EMPLOYEE + vendeur` | Client spoofs `operational_profile: "polyvalent"` or `"teller"` in request body/UI state | **DENY** — server reads trusted Firestore `employees` record & rejects mismatch |

---

## 5. TEST SUITE 5 — `TELLER` HIERARCHY STRICT ISOLATION & ROLE BOUNDARIES

| Test ID | Actor & Profile | Attempted Action | Expected Result |
|---|---|---|---|
| `S4-TEL-01` | `JUNIOR_TELLER + teller` | Own active till cash intake/payout/FX/session close | `ALLOW` |
| `S4-TEL-02` | `JUNIOR_TELLER / SENIOR_TELLER / HEAD_TELLER / MASTER_HEAD_TELLER + teller` | Record `Sales` (`tt_sys_3001`), `Services` (`tt_sys_3101`), or switch UI profile to `vendeur`/`polyvalent` | **DENY** |
| `S4-TEL-03` | Any `TELLER` role (`+ teller`) | HR Employee Admin (`create/update/delete employee`, `invite_employees`) | **DENY** (Service + `firestore.rules` after removing `'head_teller'` from `isTenantAdminOrManager`) |
| `S4-TEL-04` | Any `TELLER` role (`+ teller`) | Payroll Admin (`manage_payroll`, `payroll.calculate`, `payroll.approve`, `payroll.lock`) | **DENY** |
| `S4-TEL-05` | Any `TELLER` role (`+ teller`) | General Ledger Posting (`write_ledger`, `journal.post`, `FinanceLedger` save, `Sidebar` `ledger`) | **DENY** |
| `S4-TEL-06` | `HEAD_TELLER` | Firestore write to `employees/{id}`, `invitations/{id}`, `business_settings/{id}`, `branch_safes/{id}` | **DENY** (Verify `isTenantAdminOrManager` regression fix in `firestore.rules`) |
| `S4-TEL-07` | `TELLER` role | Attempt `MySalesAndExpensesSection` `handleSaveSale` | **DENY** (Tellers cannot record commercial sales/commissions) |

---

## 6. TEST SUITE 6 — SERVER API BYPASS, BULK IMPORT, INVITATION & RULES ENFORCEMENT

| Test ID | Attack / Bypass Vector | Expected Result |
|---|---|---|
| `S4-BYP-01` | Authenticated `EMPLOYEE` posts directly to `/api/cash/transfers/intake`, `/payout`, `/internal/request`, `/api/cash/sessions/close`, `/api/cash/tills/auto-provision` with spoofed `operational_profile: "teller"` in body | **HTTP 403** — server checks both role and Firestore persisted `operational_profile` |
| `S4-BYP-02` | Authenticated `HEAD_TELLER` with tampered Firestore employee doc (`operational_profile: "vendeur"`) calls `/api/cash/transfers/intake` | **HTTP 403** — incompatibility detected server-side and fails closed |
| `S4-BYP-03` | Bulk CSV import (`BulkEmployeeImportService`) containing rows: (`JUNIOR_TELLER` + `vendeur`), (`EMPLOYEE` + `teller`), (`MASTER_HEAD_TELLER` + `polyvalent`), (`EMPLOYEE` + missing profile) | **REJECTED WITH ROW ERRORS** — NO silent downgrade to `EMPLOYEE` and NO silent coercion |
| `S4-BYP-04` | Bulk CSV import row with `role: JUNIOR_TELLER, operational_profile: teller` | Preserves `role: JUNIOR_TELLER` (not downgraded to `EMPLOYEE`) and `operational_profile: teller` |
| `S4-BYP-05` | `/api/invitations/send` with `role: EMPLOYEE, operational_profile: teller` or `role: HEAD_TELLER, operational_profile: vendeur` | **HTTP 400/403** — invitation rejected before persistence |
| `S4-BYP-06` | Self-escalation: Employee attempts client Firestore update to `employees/{self}` modifying `operational_profile` or `role` (`firestore.rules:522`) | **DENIED by Firestore Rules** |

---

## 7. TEST SUITE 7 — STEP 3 `MASTER_HEAD_TELLER` REGRESSION & UNRESOLVED APPROVAL BOUNDARY

| Test ID | Scenario | Expected Result |
|---|---|---|
| `S4-MHT-01` | `MASTER_HEAD_TELLER + teller` executes cash intake, payout, till supervision, and till auto-provisioning across authorized tenant branches | `ALLOW` (tenant-scoped, no cross-tenant leak) |
| `S4-MHT-02` | `MASTER_HEAD_TELLER` with `operational_profile: null` or `"vendeur"` attempts cash operations | **DENY** (fail-closed) |
| `S4-MHT-03` | `MASTER_HEAD_TELLER` internal transfer approval (`POST /api/cash/transfers/internal/:id/approve`) | **GOVERNED BY EXPLICIT BUSINESS DECISION**: Either explicitly backed by a dedicated `"cash.transfer.approve"` / `"cash.approve"` permission (with Maker-Checker `initiator_id !== approverId` enforced) OR explicitly removed from `SUPERVISOR_TRANSFER_ROLES` and returning **403**. Never inferred from `"cash.transfer"`. |
| `S4-MHT-04` | Non-regression of Steps 1–3 (`ACCOUNTANT` least-privilege + Payroll Checker Maker-Checker; `OWNER`/`MANAGER` isolation; `AUDITOR` strict read-only) | `100% PASS` across all existing security suites (`RbacStep1`, `RbacStep2`, `Vuln01`, `PhaseD4B24`, `P0RbacOperationalRolesVerification`) |
