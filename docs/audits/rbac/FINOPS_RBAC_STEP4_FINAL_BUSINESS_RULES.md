# FINOPS ERP / FINAYITI FUSION
## RBAC STEP 4 — FINAL BUSINESS RULES & OPERATIONAL PROFILE ALIGNMENT
### AUTHORITATIVE BUSINESS SPECIFICATION (READ-ONLY AUDIT DELIVERABLE)

**Audit ID:** `FINOPS-RBAC-STEP4-FINAL-ALIGNMENT-02`  
**Status:** Read-Only Validation Complete (No Source Modifications Performed)  
**Target Repository:** FINOPS ERP / FINAYITI Fusion  
**Firebase Project:** `finopsht`  
**Firestore Database:** `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`  
**Supersedes:** Section 2 & Section 4 assumptions in `FINOPS_RBAC_STEP4_READINESS_AUDIT.md` (`FINOPS-RBAC-STEP4-READINESS-01`) where prior assumptions conflicted with definitive business rules.

---

## 1. ARCHITECTURAL CONCLUSION — NO HYBRID `EMPLOYEE-TELLER` ROLE

- **Question:** Does the current FINOPS ERP / FINAYITI architecture support the definitive separation between `EMPLOYEE`, `TELLER`, and `operational_profile` without introducing an `EMPLOYEE-TELLER` hybrid role?
- **Answer:** **YES.** The existing data and authorization architecture already separates RBAC `role` (`src/types.ts:14`, `PermissionService.ts`, Firebase Custom Claims / `memberships` / `employees`) from `operational_profile` (persisted on employee records and protected from self-modification in `firestore.rules:522`).
- **Rule:** An `EMPLOYEE-TELLER` hybrid role or combined identity **MUST NOT** be created. Commercial operations (`EMPLOYEE`) and cash operations (`TELLER` hierarchy) are strictly partitioned by `role` and validated against a strict `role × operational_profile` compatibility whitelist.

---

## 2. CANONICAL OPERATIONAL PROFILES

### 2.1 Definitive Canonical Set
The authoritative `OperationalProfile` value set for operational staff is strictly:
1. **`vendeur`** — Commercial sales only.
2. **`polyvalent`** — Commercial sales and services only (never cash/teller).
3. **`teller`** — Dedicated cash counter / teller operations only (subject to role-specific cash limits and supervisory scope).

### 2.2 Deprecation / Retirement of Role-Conflated Profiles
- **Current Conflict (`src/types/transactionTypes.ts:14-20`, `src/services/cash/transactionMappingEngine.ts:233-381`, `src/components/cash/TransactionTypeEditorDialog.tsx:46-53`):**
  The current code defines `OperationalProfile = "vendeur" | "teller" | "polyvalent" | "head_teller" | "manager" | "owner"`, conflating RBAC organizational roles (`head_teller`, `manager`, `owner`) with operational profiles, and assigns `OWNER/ADMIN/SUPER_ADMIN/MANAGER` to `"polyvalent"`.
- **Target Rule:**
  - `head_teller`, `manager`, and `owner` MUST be retired from employee `operational_profile` assignment.
  - Role-based supervisory/executive authority (`HEAD_TELLER`, `MASTER_HEAD_TELLER`, `MANAGER`, `OWNER`, `ADMIN`, `SUPER_ADMIN`) comes from **RBAC `role` + explicit permissions**, never from an `operational_profile` masquerading as a role.
  - Non-operational / non-cash oversight roles (`ACCOUNTANT`, `AUDITOR`, `SUPERVISOR`, `HR_MANAGER`, `PAYROLL_MANAGER`, `DIRECTOR`, `TEAM_LEADER`) do not receive `vendeur`, `polyvalent`, or `teller` privileges via profile escalation; if `operational_profile` is unset/null for pure back-office roles, they MUST fail closed on profile-gated commercial and teller operations unless explicitly authorized by RBAC role permissions.

### 2.3 Legacy Alias Rule (`barber`)
- **Current State:** `barber` is referenced in department normalization/aliasing (`src/domains/organization/services/DepartmentAliasEngine.ts:89-90`, `DepartmentIntegrityService.ts:154`, `src/utils/nameResolvers.ts:63`) and documentation (`FINOPS_RBAC_STEP4_READINESS_AUDIT.md:34`), but is **NOT** implemented in `TransactionMappingEngine`.
- **Target Rule:**
  - `barber` is accepted **solely** as a read/migration legacy alias mapping strictly to **`vendeur`** (Sales only) for `EMPLOYEE` records during legacy backfill/normalization.
  - `barber` MUST NEVER map to `polyvalent` or `teller`, MUST NEVER be accepted for `TELLER` roles, and MUST NOT be exposed as an active UI option for new assignments.

### 2.4 Fail-Closed Rule for Missing, Null, Empty, Malformed, or Unknown Profiles
- **Current P0 Vulnerabilities:**
  - `TransactionMappingEngine.resolveOperationalProfile(undefined/""/"UNKNOWN_ROLE")` (`src/services/cash/transactionMappingEngine.ts:278`) silently defaults to `"vendeur"`.
  - `TransactionMappingEngine.isOperationAllowedForProfile(typeItem, profile)` (`src/services/cash/transactionMappingEngine.ts:319`) executes `(profile || "vendeur")`.
  - `TransactionMappingEngine.filterTypesByProfile(types, profile)` (`src/services/cash/transactionMappingEngine.ts:396, 433-435`) returns **all active transaction types** when `!profile` and returns **`true`** in the `switch` `default` branch for unrecognized profiles.
- **Target Rule:**
  - Missing, `null`, `undefined`, `""`, whitespace-only, non-string, malformed, or unknown `operational_profile` values MUST **FAIL CLOSED (`DENY`)** on all profile-restricted operations (Sales, Services, Cash Intake, Cash Payout, Till Session Open/Close/Reopen, Till Assignment, Transaction Type execution).
  - No silent fallback to `"vendeur"`, `"polyvalent"`, or `"teller"` is permitted at runtime.

---

## 3. ROLE-SPECIFIC AUTHORITATIVE RULES

### 3.1 `EMPLOYEE` (Ordinary Commercial Employees)
- Represents commercial / service staff ONLY.
- **Valid `operational_profile` values:** `vendeur` or `polyvalent` (plus legacy read alias `barber` -> `vendeur`).
- **`EMPLOYEE + vendeur`:**
  - `ALLOW`: Commercial **Sales** (`Sales` category / authorized commercial sales capture).
  - `DENY`: **Services** (`Services` category), **Cash / Teller** operations (`Money Transfer`, `Mobile Transfer`, `Currency Exchange`, Till Assignment, Till Open/Close/Reopen, Cash Intake, Cash Payout, Internal Cash Transfers).
  - **Current Conflict:** `TransactionMappingEngine.isOperationAllowedForProfile` (`lines 332-339`) and `filterTypesByProfile` (`lines 412-413`) currently grant `"vendeur"` access to `"Services"` (`tt_sys_3101`), validated by `OperationalProfileWorkflow.test.ts:45-59`. This MUST be corrected so `vendeur` permits `Sales` ONLY.
- **`EMPLOYEE + polyvalent`:**
  - `ALLOW`: Commercial **Sales** AND **Services** (`Sales` + `Services`).
  - `DENY`: **ALL Cash / Teller operations** (Till assignment, Till session open/close/reopen, Cash Intake, Cash Payout, Money Transfer, Mobile Transfer, Currency Exchange, Internal Transfers).
  - **Current Conflict:** `TransactionMappingEngine` (`lines 16, 35, 92, 111, 130, 168, 354-367, 420-427`) grants `"polyvalent"` access to `Money Transfer`, `Mobile Transfer`, and `Currency Exchange`, and `EmployeeCashEligibilityService.ts:44, 52` includes `"EMPLOYEE"`, `"POLYVALENT"`, `"VENDEUR"` in `AUTHORIZED_TELLER_ROLES`. Both MUST be removed.
- **Invariant:** Selecting `polyvalent` MUST NEVER grant cash or teller privileges to an `EMPLOYEE`.

### 3.2 `TELLER` Hierarchy (`JUNIOR_TELLER`, `SENIOR_TELLER`, `HEAD_TELLER`, `MASTER_HEAD_TELLER`)
- Teller roles constitute a dedicated cash-operations function, strictly separated from ordinary commercial `EMPLOYEE` roles.
- **Required `operational_profile`:** Strictly **`teller`** (only valid profile).
- **Capabilities:** Authorized cash operations only, bounded by role-specific limits and scope:
  - `JUNIOR_TELLER + teller`: Till operations (`cash.view`, `cash.operate`, Intake/Payout/FX/Own Till Session Close), NO `cash.transfer`, NO supervisory reopen/approval.
  - `SENIOR_TELLER + teller`: Till operations + `cash.transfer` initiation (`ServerInternalTransferEngine` request), NO supervisory transfer approval/reopen.
  - `HEAD_TELLER + teller`: Branch till/safe supervision, `cash.view`, `cash.operate`, `cash.transfer`, supervisory till closure/reopen (`TillSessionEngine`), branch-scoped internal transfer review/approval (Maker-Checker enforced).
  - `MASTER_HEAD_TELLER + teller`: Multi-branch till supervision, `cash.view`, `cash.operate`, `cash.transfer`, till provisioning (`ServerTillProvisioningService`), till closure/reopen supervision (`TillSessionEngine`). *(See Section 6 for separate unresolved internal-transfer approval authority finding.)*
- **Strict Negative Boundaries for ALL `TELLER` Roles:**
  - MUST NOT automatically receive **Sales** (`Sales`) or **Services** (`Services`) operational privileges. *(Current conflict: `DEFAULT_SYSTEM_TRANSACTION_TYPES` `tt_sys_3001` & `tt_sys_3101` include `"head_teller"`, `TransactionMappingEngine.resolveOperationalProfile('HEAD_TELLER')` returns `"head_teller"` which allows Sales & Services, and `isProfileSwitchAllowed('HEAD_TELLER', 'vendeur')` returns `true`.)*
  - MUST NOT receive vendor/commercial privileges.
  - MUST NOT receive HR employee administration (`manage_employees`, `invite_employees`, `employee.*`). *(Current conflict: `firestore.rules:139-140` includes `'head_teller'` inside `isTenantAdminOrManager(bizId)`, granting `HEAD_TELLER` Firestore write/delete access on `employees`, `invitations`, `cash_settlements`, `business_settings`, etc.!)*
  - MUST NOT receive Payroll administration (`manage_payroll`, `validate_payroll`, `lock_payroll`, `payroll.*`).
  - MUST NOT receive General Ledger posting/modification permissions (`write_ledger`, `journal.post`, `ledger.write`). *(Note: `Sidebar.tsx:85` and `FinanceLedger.tsx:422` currently expose the General Ledger UI save button to `HEAD_TELLER`, `SENIOR_TELLER`, `JUNIOR_TELLER` despite `PermissionService` denying `write_ledger`.)*
  - Note on `TELLER` self-service vs admin: Tellers may view their own employee space/documents/payslips/attendance check-in as an employee subject (`view_employee_space`, `view_documents`), which is self-service read/attendance—NOT HR personnel administration and NOT commercial `Sales`/`Services` logging (`MySalesAndExpensesSection` must be restricted so `TELLER` cannot log commercial `Sales` or `Services` unless explicitly governed, and `Sales/Services` commission flows belong to `EMPLOYEE`).

### 3.3 Legacy `TELLER` Role String
- `TELLER` exists in `src/types.ts:14`, `PermissionService.ts:455`, `InvitationService.ts:10`, `ServerTransferIntakeEngine.ts:37`, `TillSessionEngine.ts:75`, `firestore.rules:165`.
- **Rule:** Treat generic `TELLER` strictly as a legacy cash-operator role requiring `operational_profile = "teller"` (never `vendeur`/`polyvalent`), and deprecate creating new users with generic `TELLER` in favor of `JUNIOR_TELLER` / `SENIOR_TELLER` / `HEAD_TELLER` / `MASTER_HEAD_TELLER`.

---

## 4. EXPLICIT FORBIDDEN COMBINATIONS (ZERO SILENT FALLBACK)

The following **9 explicit `Role × operational_profile` combinations** are strictly **FORBIDDEN** and MUST be rejected explicitly with a validation/authorization error (e.g., `INCOMPATIBLE_ROLE_OPERATIONAL_PROFILE`) on creation, edit, invitation, bulk import, and server/client execution — **NEVER silently normalized, coerced, or auto-converted**:

1. `EMPLOYEE + teller` -> **REJECT / DENY**
2. `JUNIOR_TELLER + vendeur` -> **REJECT / DENY**
3. `JUNIOR_TELLER + polyvalent` -> **REJECT / DENY**
4. `SENIOR_TELLER + vendeur` -> **REJECT / DENY**
5. `SENIOR_TELLER + polyvalent` -> **REJECT / DENY**
6. `HEAD_TELLER + vendeur` -> **REJECT / DENY**
7. `HEAD_TELLER + polyvalent` -> **REJECT / DENY**
8. `MASTER_HEAD_TELLER + vendeur` -> **REJECT / DENY**
9. `MASTER_HEAD_TELLER + polyvalent` -> **REJECT / DENY**

Additionally:
- Legacy `TELLER + vendeur` and `TELLER + polyvalent` -> **REJECT / DENY**.
- `EMPLOYEE + head_teller | manager | owner` -> **REJECT / DENY**.
- Any `TELLER` role + `barber` -> **REJECT / DENY** (legacy `barber` alias applies only to `EMPLOYEE`).
- Any missing/null/empty/unknown `operational_profile` -> **FAIL CLOSED** at runtime; **REQUIRED & EXPLICITLY VALIDATED** at onboarding/creation/update.

---

## 5. AUTHORITATIVE ENFORCEMENT INVARIANTS

1. **INV-STEP4-01 (No Hybrid Role):** No `EMPLOYEE-TELLER` role shall exist anywhere in types, claims, RBAC matrices, UI, or rules.
2. **INV-STEP4-02 (Strict `EMPLOYEE` Separation):** `EMPLOYEE` is restricted to `vendeur` (Sales only) or `polyvalent` (Sales + Services); `EMPLOYEE` can never hold `teller` or execute/be assigned cash operations, tills, or cash transfers.
3. **INV-STEP4-03 (Strict `TELLER` Separation):** `JUNIOR_TELLER`, `SENIOR_TELLER`, `HEAD_TELLER`, `MASTER_HEAD_TELLER` (and legacy `TELLER`) require `operational_profile = "teller"` and are denied commercial `Sales`, `Services`, HR employee admin, Payroll admin, and GL posting.
4. **INV-STEP4-04 (Explicit Rejection of 9 Forbidden Pairs):** All 9 forbidden combinations fail explicitly without silent coercion or fallback.
5. **INV-STEP4-05 (Fail-Closed Default):** Missing, null, empty, malformed, or unknown `operational_profile` always resolves to `DENY` for profile-restricted actions.
6. **INV-STEP4-06 (Server-Side Authority):** Every cash, transfer, till session, provisioning, invitation, employee mutation, and ledger API route validates **both** verified `role` (from authenticated server identity/claims/membership) **and** persisted `operational_profile` from trusted Firestore `employees` records—never trusting client-supplied `operational_profile` overrides or UI-only profile switches.
7. **INV-STEP4-07 (No Profile-Based Privilege Escalation):** `operational_profile` is an operational sub-scope within an authorized `role`, never an escalator across RBAC domains (cannot unlock cash for `EMPLOYEE`, payroll for `TELLER`, or GL for `HEAD_TELLER`).

---

## 6. SEPARATE REPORT — STEP 3 REGRESSION & UNRESOLVED `MASTER_HEAD_TELLER` TRANSFER APPROVAL AUTHORITY

During Step 4 validation, existing Step 3 code was re-audited per directive:

1. **What Step 3 Implemented (`FINOPS_RBAC_STEP3_IMPLEMENTATION_REPORT.md`):**
   - Added `"MASTER_HEAD_TELLER"` to `AUTHORIZED_CASH_OPERATOR_ROLES` (`src/domains/cash/services/ServerTransferIntakeEngine.ts:36`, used by `ServerTransferPayoutEngine.ts:7, 54` and `src/routes/transferRoutes.ts:111, 168`).
   - Added `"MASTER_HEAD_TELLER"` to `SUPERVISOR_TRANSFER_ROLES` (`src/domains/cash/services/ServerInternalTransferEngine.ts:75`), granting authorization on `POST /api/cash/transfers/internal/:transferId/approve` and `POST /api/cash/transfers/internal/:transferId/reject` (`src/routes/transferRoutes.ts:342-468`), as well as `CashTransferEngine.ts:341`.
   - Added `"MASTER_HEAD_TELLER"` to `ALLOWED_CLOSURE_ROLES`, `SUPERVISOR_CLOSURE_ROLES`, and `AUTHORIZED_REOPEN_ROLES` (`src/domains/cash/services/TillSessionEngine.ts:80, 89, 98`).
   - Added `"MASTER_HEAD_TELLER"` to `TILL_PROVISIONING_AUTHORIZED_ROLES` (`src/services/business/ServerTillProvisioningService.ts:13`) and `AUTHORIZED_TELLER_ROLES` (`src/domains/cash/services/EmployeeCashEligibilityService.ts:43`).
   - Step 3 security suite (`RbacStep3MasterHeadTellerSecurity.test.ts`, 35/35 tests) passes against that code.

2. **Unresolved Approval Authority Gap Identified:**
   - **Capability Matrix Evidence (`src/services/PermissionService.ts:196-200`, `src/repositories/index.ts`):** `TENANT_ERP_CAPABILITIES` defines **only** `"cash.view"`, `"cash.operate"`, and `"cash.transfer"`. There is **NO** `"cash.approve"`, `"transfer.approve"`, `"cash.transfer.approve"`, or `"till.reopen"` permission key in `PermissionService.ts` or Step 1's explicit permission matrix.
   - **Matrix / Gap Artifacts Evidence:**
     - `.aistudio/artifacts/brain/e9a787be-5bad-4953-a0cf-559c66ef4603/FINOPS_ROLE_PERMISSION_MATRIX.csv:11` marks `MASTER_HEAD_TELLER` Safe/Vault `ALL` as `CONDITIONAL` / `NOT_TESTED`.
     - `.aistudio/artifacts/brain/e9a787be-5bad-4953-a0cf-559c66ef4603/FINOPS_FINAYITI_RBAC_GAP_MATRIX.csv:8` flagged `approve_inter_branch` as `PARTIAL` before Step 3.
   - **Additional Step 3 Gaps Observed:**
     - `src/types.ts:14` (`Role` union) STILL omits `"MASTER_HEAD_TELLER"`.
     - `src/components/dashboard/components/Sidebar.tsx:75-111` omits `MASTER_HEAD_TELLER` from `cash`, `attendance`, `planning`, `leaves`, `reports`, `performance`, `documents`, `employeeSpace`.
     - `src/navigation/useTargetRoute.ts:113` omits `MASTER_HEAD_TELLER` from `["HEAD_TELLER", "SENIOR_TELLER", "JUNIOR_TELLER", "TELLER"]`, misrouting `MASTER_HEAD_TELLER` to `/workspace` instead of `/dashboard`.
     - `firestore.rules:164-169` (`isTenantCashOperator`) omits `'master_head_teller'`, blocking direct Firestore cash till/session updates if invoked via client SDK.

3. **Governance Rule:**
   - **DO NOT infer transfer approval authority from `cash.transfer`.**
   - `MASTER_HEAD_TELLER` inclusion in `SUPERVISOR_TRANSFER_ROLES` (`ServerInternalTransferEngine.ts:75`), `CashTransferEngine.ts:341`, `SUPERVISOR_CLOSURE_ROLES`, and `AUTHORIZED_REOPEN_ROLES` (`TillSessionEngine.ts:89, 98`) MUST be treated as **UNRESOLVED / CONDITIONALLY PENDING EXPLICIT BUSINESS APPROVAL** until Product/Security sign-off confirms whether `MASTER_HEAD_TELLER` is authorized to approve internal transfers (and if so, adds an explicit `"cash.transfer.approve"` / `"cash.approve"` capability to `PermissionService.ts` rather than inferring it from `"cash.transfer"`).
