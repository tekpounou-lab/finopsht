# FINOPS ERP / FINAYITI FUSION
## RBAC STEP 4 — BOUNDED IMPLEMENTATION SCOPE & ARCHITECTURE PLAN
### READ-ONLY DESIGN & MIGRATION SPECIFICATION

**Audit ID:** `FINOPS-RBAC-STEP4-FINAL-ALIGNMENT-02`  
**Impact Classification:** **HIGH** (Modifies core RBAC/profile enforcement, cash eligibility, employee schemas/UI, bulk imports, invitations, and `firestore.rules`)  
**Mode:** Read-Only Plan — **NO CODE CHANGES PERFORMED IN THIS AUDIT**

---

## 1. OBJECTIVE

Implement definitive, fail-closed, server-authoritative separation between:
- **`EMPLOYEE`** (`vendeur` = Sales only; `polyvalent` = Sales + Services; strictly zero Cash/Teller rights),
- **`TELLER`** (`JUNIOR_TELLER`, `SENIOR_TELLER`, `HEAD_TELLER`, `MASTER_HEAD_TELLER` with mandatory `operational_profile = "teller"`, zero automatic Sales/Services/HR-admin/Payroll/GL rights),
- **Canonical `operational_profile` domain** (`vendeur | polyvalent | teller`, plus legacy `barber -> vendeur` only for `EMPLOYEE` backfill/normalization),
without creating an `EMPLOYEE-TELLER` hybrid role.

---

## 2. PREREQUISITE GOVERNANCE GATE (BEFORE STEP 4 IMPLEMENTATION)

1. **Confirm `MASTER_HEAD_TELLER` Transfer Approval Authority (Step 3 Regression Finding):**
   - Product/Security owner must decide explicitly:
     - **Option A:** `MASTER_HEAD_TELLER` IS authorized to approve/reject internal transfers & reopen tills -> add explicit `"cash.approve"` / `"transfer.approve"` (and `"till.reopen"`) capability to `PermissionService.ts` & `PermissionRepository`, keep `SUPERVISOR_TRANSFER_ROLES` / `AUTHORIZED_REOPEN_ROLES` aligned.
     - **Option B:** `MASTER_HEAD_TELLER` is NOT authorized to approve internal transfers -> remove `"MASTER_HEAD_TELLER"` from `SUPERVISOR_TRANSFER_ROLES` (`ServerInternalTransferEngine.ts:75`) and `CashTransferEngine.ts:341`.
2. **Confirm `MANAGER` / `OWNER` Operational Execution Model:**
   - Confirm whether `MANAGER` and `OWNER` execute Sales, Services, and Cash transactions strictly via their **RBAC `role`** (independent of `operational_profile`, subject to Maker-Checker and subscription gates), retiring `"manager"`, `"owner"`, and `"head_teller"` from `OperationalProfile`.
3. **Confirm Commercial Sales vs Services Entrypoint for `EMPLOYEE`:**
   - Currently `PermissionService.ts:373-403` sets `crm: false`, `invoices: false`, `ledger: false`, and `FinanceLedger.tsx:422` omits `EMPLOYEE`, so `EMPLOYEE` enters sales via `MyWorkspace.tsx:720-735` -> `MySalesAndExpensesSection.tsx:272-322` (`LedgerRepository.save`). Step 4 must enforce `vendeur` (Sales only) vs `polyvalent` (Sales + Services) cleanly in that flow **and** in `CreateTransactionDialog.tsx` / `FinanceLedger.tsx` / server/repository boundaries.

---

## 3. BOUNDED FILE-BY-FILE IMPLEMENTATION SCOPE

### Layer 1: Canonical Types & Pure Compatibility Domain Policy (SSOT)
1. **`src/types.ts`**
   - Line `14`: Add `"MASTER_HEAD_TELLER"` to `export type Role` union.
   - Lines `106-165` (`Employee` interface, plus `UserProfile` / `Invitation` types): Add `operational_profile?: OperationalProfile` (and optional `operationalProfile?: OperationalProfile` compatibility alias).
2. **`src/types/transactionTypes.ts`**
   - Lines `14-20`: Narrow `OperationalProfile` to `"vendeur" | "polyvalent" | "teller"` (remove role-conflated `"head_teller" | "manager" | "owner"`). Keep a separate explicit constant/type only if needed for legacy read-time deprecation mapping.
3. **New Pure Policy Module (or inside `src/services/cash/transactionMappingEngine.ts` + server-shared domain validator, e.g. `src/domains/rbac/operationalProfilePolicy.ts`)**:
   - Define:
     - `CANONICAL_OPERATIONAL_PROFILES = ["vendeur", "polyvalent", "teller"]`
     - `TELLER_ROLES = new Set(["JUNIOR_TELLER", "SENIOR_TELLER", "HEAD_TELLER", "MASTER_HEAD_TELLER", "TELLER"])`
     - `normalizeLegacyOperationalProfile(rawProfile, role)`: handles `barber -> vendeur` ONLY when `role === "EMPLOYEE"`; never converts the 9 forbidden combinations or unknown strings.
     - `validateRoleOperationalProfileCompatibility(role, rawProfile)`:
       - Explicitly rejects all **9 forbidden combinations** (`EMPLOYEE+teller`, `{JUNIOR,SENIOR,HEAD,MASTER_HEAD}_TELLER+{vendeur,polyvalent}`, plus `TELLER+{vendeur,polyvalent}` and `TELLER+barber`) with deterministic error code `INCOMPATIBLE_ROLE_OPERATIONAL_PROFILE`.
       - Rejects missing/null/empty/malformed/unknown profiles on operational roles with `MISSING_OR_INVALID_OPERATIONAL_PROFILE` (fail-closed).
4. **`src/services/cash/transactionMappingEngine.ts`**
   - Lines `8-218` (`DEFAULT_SYSTEM_TRANSACTION_TYPES`):
     - `tt_sys_3001` (Sales): `allowedProfiles: ["vendeur", "polyvalent"]` (remove `"head_teller"`, `"manager"`, `"owner"` from `OperationalProfile[]`; executive role override handled by RBAC role check, not profile spoofing).
     - `tt_sys_3101` (Services): `allowedProfiles: ["polyvalent"]` (**REMOVE `"vendeur"`** and `"head_teller"`).
     - `tt_sys_1001`, `2001`, `4001`, `4002`, `5001`, `80001` (Cash / Transfers / FX): `allowedProfiles: ["teller"]` (**REMOVE `"polyvalent"`** and `"head_teller"`).
     - `tt_sys_6001` (Operating Expenses) & `tt_sys_1910` (Internal Transfers) & `tt_sys_2910` (Clearing): Gate via RBAC roles (`HEAD_TELLER`+ for `1910`, `MANAGER/OWNER` for `6001/2910`), not pseudo-profiles.
   - Lines `233-279` (`resolveOperationalProfile`): Remove silent default `"vendeur"` fallback (`line 278`) and remove `OWNER/MANAGER -> "polyvalent"`, `HEAD_TELLER -> "head_teller"`. Fail closed (`null` / error) when profile is missing/unknown for operational staff.
   - Lines `285-306` (`canSwitchProfile`, `isProfileSwitchAllowed`): Remove `HEAD_TELLER` switching to `"vendeur"` (`line 302`); restrict teller roles strictly to `"teller"`.
   - Lines `311-381` (`isOperationAllowedForProfile`):
     - Remove `|| "vendeur"` (`line 319`).
     - Remove `"Services"` from `case "vendeur"` (`line 333`).
     - Restrict `case "polyvalent"` to `"Sales" | "Services"` ONLY (remove `"Money Transfer" | "Mobile Transfer" | "Currency Exchange"` at `lines 358-360`).
     - Remove `case "head_teller"` / `owner` / `manager` shortcuts (handle executive role bypass explicitly via RBAC role gate, never via profile).
     - Ensure `default` fails closed.
   - Lines `392-437` (`filterTypesByProfile`):
     - Fix `if (!profile) return []` (fail closed instead of returning all active types at `line 396`).
     - Fix `default: return false` (fail closed instead of `return true` at `line 434`).
     - Align `vendeur` (`Sales` only), `polyvalent` (`Sales | Services` only), `teller` (`Money Transfer | Mobile Transfer | Currency Exchange`).

### Layer 2: Cash & Till Eligibility + Server-Side Enforcement
5. **`src/domains/cash/services/EmployeeCashEligibilityService.ts`**
   - Lines `38-53` (`AUTHORIZED_TELLER_ROLES`): **REMOVE** `"EMPLOYEE"`, `"POLYVALENT"`, `"VENDEUR"`, and non-canonical `"CASHIER"`, `"CAISSIER"`. Restrict strictly to canonical cash roles (`JUNIOR_TELLER`, `SENIOR_TELLER`, `HEAD_TELLER`, `MASTER_HEAD_TELLER`, legacy `TELLER`, and authorized supervisory/executive roles if policy permits till holding—note: if only tellers hold tills, keep `OWNER/MANAGER` out unless explicitly required).
   - Lines `187-195` (`isEligibleForTillAssignment`): Require verified compatible `operational_profile === "teller"` for all teller roles (fail closed if missing/null/empty/invalid).
6. **Server Cash Engines (Admin SDK Verification of Persisted `employees` Record):**
   - `src/domains/cash/services/ServerTransferIntakeEngine.ts` (lines `32-120`)
   - `src/domains/cash/services/ServerTransferPayoutEngine.ts` (lines `29-110`)
   - `src/domains/cash/services/ServerInternalTransferEngine.ts` (lines `73-180`)
   - `src/domains/cash/services/TillSessionEngine.ts` (lines `74-103` + `closeSessionWithAdmin` / `reopenSessionWithAdmin` / `openSession` paths — remove `"CASHIER"` if unapproved legacy leak, require `operational_profile === "teller"` for teller roles)
   - `src/services/business/ServerTillProvisioningService.ts` (lines `344-354`: ensure persisted employee `operational_profile` is validated via updated `EmployeeCashEligibilityService` before creating/assigning tills).
   - **Shared Server Helper:** Look up the actor's authoritative `employees` doc in Firestore (matched by `uid` / `firebase_uid` within `businessId`), validate `status === "ACTIVE"`, validate `role × operational_profile` compatibility, and deny with `403 FORBIDDEN_OPERATIONAL_PROFILE` / `MISSING_OPERATIONAL_PROFILE` if `EMPLOYEE` or missing/incompatible profile attempts cash intake, payout, transfer, or till session actions. (Executive roles `OWNER`, `ADMIN`, `MANAGER`, `SUPER_ADMIN` remain governed by RBAC role + Maker-Checker, never `EMPLOYEE` fallback.)
7. **Client-Side Cash / Ledger / Employee Sales Surfaces:**
   - `src/domains/cash/services/CashTransferEngine.ts` & `TellerTransactionEngine.ts` & `TransferIntakeEngine.ts` & `TransferPayoutEngine.ts`: Enforce role + profile check parity (and keep Firestore rules blocking direct client writes to `internal_transfers`, `teller_transactions`, `customer_transfers`, `cash_transfers`).
   - `src/pages/employee/components/MySalesAndExpensesSection.tsx` (lines `272-322` + UI modal `lines 64-70, 388-403`):
     - Require `employee.role === "EMPLOYEE"` and valid `operational_profile` (`vendeur` -> Sales only; `polyvalent` -> Sales or Services).
     - Explicitly distinguish `"Sales"` vs `"Services"` category selection (`saleCategory` / `transactionType`) so `EMPLOYEE + vendeur` cannot record `"Services"`, and `TELLER` roles cannot bypass into commercial Sales/Services logging.
   - `src/pages/FinanceLedger.tsx` (lines `420-446`) & `src/components/ledger/CreateTransactionDialog.tsx` (lines `61-130, 340-395`):
     - Remove `JUNIOR_TELLER`, `SENIOR_TELLER`, `HEAD_TELLER` from `canSave` (`FinanceLedger.tsx:422`) or restrict strictly to their `teller` operational ledger entries / accounting-approved scope so tellers cannot post general ledger entries.
     - Use the persisted employee `operational_profile` (rather than `resolveOperationalProfile(currentRole)`), block switching for non-executives, and remove `head_teller`/`manager`/`owner` tabs.
   - `src/components/cash/TransactionTypeEditorDialog.tsx` (`lines 46-53`) & `src/repositories/TransactionTypeRepository.ts`: Restrict profile tags to canonical `vendeur | polyvalent | teller` and reject saving custom types that grant `Sales`/`Services` to `teller` or `Money Transfer`/`Mobile Transfer`/`Currency Exchange` to `vendeur`/`polyvalent`.

### Layer 3: Onboarding, Staff Lifecycle, Bulk Import & RBAC Parity
8. **Invitations (`src/services/business/InvitationService.ts`, `server.ts:1310-1495`, `src/components/organization/InvitationManagement.tsx`):**
   - `InvitationService.ts:5-15`: Add `"MASTER_HEAD_TELLER"` and `"ACCOUNTANT"` to `ASSIGNABLE_INVITE_ROLES`; accept optional/required `operational_profile` for `EMPLOYEE` and `TELLER` invites; validate via `validateRoleOperationalProfileCompatibility` on both `/api/invitations/send` and `/api/invitations/accept`; persist `operational_profile` onto created `employees/{employeeId}` (`lines 322-337, 427-442`).
   - `InvitationManagement.tsx:449-456, 675-681`: Add `MASTER_HEAD_TELLER`, `ACCOUNTANT`, `AUDITOR`; add `operational_profile` selector dynamically constrained by selected role (`EMPLOYEE` -> `vendeur | polyvalent`; `TELLER` roles -> locked `teller`; non-operational roles -> hidden/N/A).
9. **Employee Editing & Directory (`src/components/staff/EditEmployeeDialog.tsx`, `src/repositories/EmployeeRepository.ts`):**
   - `EditEmployeeDialog.tsx:144-155`: Add `MASTER_HEAD_TELLER`; add `operational_profile` field constrained by `role` with explicit rejection banner on any of the 9 forbidden pairs.
   - `EmployeeRepository.ts`: Validate `role × operational_profile` compatibility before persisting employee creation/update.
10. **Bulk Employee Import (`src/services/workforce/BulkEmployeeImportService.ts`):**
    - Lines `320-333`: Support importing explicit canonical roles (`JUNIOR_TELLER`, `SENIOR_TELLER`, `HEAD_TELLER`, `MASTER_HEAD_TELLER`, `ACCOUNTANT`, `AUDITOR`) instead of silently collapsing them to `"EMPLOYEE"`!
    - Parse `operational_profile` / `profil_operationnel` column, validate compatibility against resolved `role`, apply `barber -> vendeur` legacy alias ONLY for `EMPLOYEE`, and **reject/flag rows** with any of the 9 forbidden pairs or missing profile during import preview/commit (never silent coercion).
11. **RBAC Matrices, Routing & Sidebar (`PermissionService.ts`, `Sidebar.tsx`, `useTargetRoute.ts`, `ModulesAndFeaturesSection.tsx`):**
    - `PermissionService.ts:963-965`: Remove `"SUPERVISOR"`, `"ACCOUNTANT"`, `"AUDITOR"` from write-implied `cash`/`operations` defaults if needed (keep `AUDITOR` strictly read-only `cash.view`).
    - `Sidebar.tsx:75-111`: Add `"MASTER_HEAD_TELLER"` to cash/supervision/attendance/performance items; **remove** `JUNIOR_TELLER`, `SENIOR_TELLER`, `HEAD_TELLER` from `ledger` (`Grand Livre Comptable` at `line 85`).
    - `useTargetRoute.ts:113`: Add `"MASTER_HEAD_TELLER"` to teller operational workspace route list.
    - `ModulesAndFeaturesSection.tsx:174-182`: Add `MASTER_HEAD_TELLER` and `ACCOUNTANT` to `CONFIGURABLE_ROLES`.

### Layer 4: Firestore Security Rules (`firestore.rules`)
12. **`firestore.rules`:**
    - Lines `139-140` (`isTenantAdminOrManager`): **REMOVE `'head_teller'`** from `['owner', 'admin', 'manager', 'head_teller', 'owner_admin']` so `HEAD_TELLER` cannot create/update/delete `employees`, `invitations`, `branch_safes`, `cash_settlements`, `business_settings`, or `roles_config`.
    - Lines `164-169` (`isTenantCashOperator`): Add `'master_head_teller'` (and verify `operational_profile == 'teller'` where employee record is linked, or move till/session state mutations to server APIs like `/api/cash/sessions/*` and `/api/cash/transfers/*`).
    - Lines `509-528` (`employees/{empId}`): Preserve line `522` protecting `operational_profile` from self-modification; add rule constraint on `create`/`update` rejecting forbidden `role × operational_profile` combinations when `operational_profile` is present.
    - Lines `710-722` (`transactions/{txId}`, `ledger_transactions/{txId}`): Restrict `create` (currently open to ANY `isTenantScoped(bizId)` user!) so `TELLER` roles cannot post arbitrary GL/Sales records and `EMPLOYEE` cannot post `Services` under `vendeur` or Cash under `polyvalent`.

---

## 4. LEGACY DATA MIGRATION & ROLLBACK RISKS

1. **Existing `employees` Documents Without `operational_profile`:**
   - Legacy `EMPLOYEE` docs without `operational_profile` will fail closed once Step 4 deploys unless migrated.
   - **Controlled Backfill Plan (Pre-Deployment / Dry-Run Audited):**
     - `EMPLOYEE` with legacy `barber` -> normalize to `vendeur`.
     - `EMPLOYEE` with missing `operational_profile` -> **do NOT blindly assign `polyvalent` or `teller`**; flag for tenant admin review or backfill via explicit verified commercial classification (`vendeur` only if purely sales-classified, never auto-assign `teller`).
     - `JUNIOR_TELLER` / `SENIOR_TELLER` / `HEAD_TELLER` / `MASTER_HEAD_TELLER` with missing `operational_profile` -> backfill `teller` ONLY after confirming zero conflict with any non-teller assignment.
2. **Existing `cash_tills` Assigned to `EMPLOYEE`:**
   - Because `EmployeeCashEligibilityService.ts:52` previously allowed `"EMPLOYEE"`, `"POLYVALENT"`, and `"VENDEUR"`, existing tills in Firestore may reference an `EMPLOYEE` ID in `assigned_teller_id`.
   - Audit and unassign/reclassify before enforcing strict `TELLER`-only runtime checks so active tills are not orphaned mid-shift.
3. **Existing `business_settings` / `transaction_types` Documents:**
   - Custom or seeded `transaction_types` in Firestore containing `allowedProfiles: ["vendeur", "polyvalent", "head_teller", ...]` must be migrated/normalized so `tt_sys_3101` (`Services`) excludes `vendeur` and cash types exclude `polyvalent`.
4. **Unit Test Refactor Impact:**
   - `src/tests/unit/cash/OperationalProfileWorkflow.test.ts` currently asserts the old contradictory rules (`vendeur` -> Sales+Services, `polyvalent` -> cash transfers, `HEAD_TELLER` -> `head_teller` & switch to `vendeur`, unknown role -> `vendeur`). Those assertions must be replaced by the definitive Step 4 assertions upon authorized implementation.

---

## 5. VALIDATION STRATEGY FOR IMPLEMENTATION PHASE

When Step 4 implementation is later authorized:
1. Run full TypeScript + build checks (`compile_applet` and `lint_applet`).
2. Execute existing security suites (`RbacStep1`, `RbacStep2`, `RbacStep3`, `P0RbacOperationalRolesVerification`, `Vuln01`, `PhaseD4B24`) to prove zero regression on Steps 1–3.
3. Execute new Step 4 security test suite covering all 9 forbidden combinations, fail-closed missing/null/empty/unknown profiles, `EMPLOYEE` (`vendeur` vs `polyvalent`) boundaries, `TELLER` isolation boundaries, `barber` legacy alias boundary, server API bypass attempts, bulk import/invite rejection, and Firestore rules assertions.
