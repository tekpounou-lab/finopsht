# FINOPS ERP / FINAYITI FUSION
## RBAC STEP 4 — OPERATIONAL PROFILE SERVER-SIDE ENFORCEMENT & STEP 3 `MASTER_HEAD_TELLER` APPROVAL CORRECTION
### CONTROLLED LOCAL IMPLEMENTATION REPORT

**Implementation ID:** `FINOPS-RBAC-STEP4-IMPLEMENTATION-01`  
**Execution Date:** November 14, 2026  
**Mode:** CONTROLLED LOCAL IMPLEMENTATION (No Production Deployment, No Git Commit/Push)  
**Target Repository:** FINOPS ERP / FINAYITI Fusion  
**Firebase Project:** `finopsht`  
**Firestore Database:** `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`  
**Verdict:** **PASS — STEP 4 LOCAL IMPLEMENTATION + STEP 3 MHT CORRECTION VERIFIED (WITH DOCUMENTED PRE-DEPLOYMENT PREREQUISITES)**

---

## 1. EXECUTIVE SUMMARY & VERDICT

The controlled local implementation of **RBAC Step 4 (Server-Side `operational_profile` Enforcement & Strict `EMPLOYEE` / `TELLER` Separation)** and the mandatory **Step 3 `MASTER_HEAD_TELLER` Internal Transfer-Approval Authority Correction** is complete and locally verified.

### Key Architectural Outcomes
1. **Single Source of Truth Policy (`/src/domains/rbac/operationalProfilePolicy.ts`):**
   - Canonical `OperationalProfile` strictly bounded to `"vendeur" | "polyvalent" | "teller"`.
   - Retired pseudo-profiles (`"head_teller"`, `"manager"`, `"owner"`) rejected across policy, schemas, repositories, UI selectors, and Firestore rules.
   - `EMPLOYEE` commercial model strictly separated from cash: `EMPLOYEE + vendeur` (Sales only), `EMPLOYEE + polyvalent` (Sales + Services; **Cash strictly DENIED**).
   - Dedicated `TELLER` roles (`JUNIOR_TELLER`, `SENIOR_TELLER`, `HEAD_TELLER`, `MASTER_HEAD_TELLER`, legacy `TELLER`) require `operational_profile === "teller"` and are strictly denied commercial Sales/Services, HR, Payroll, and General Ledger permissions.
   - All **9 forbidden role × profile combinations** (`EMPLOYEE + teller`, `{JUNIOR,SENIOR,HEAD,MASTER_HEAD}_TELLER + {vendeur,polyvalent}`) fail closed with `FORBIDDEN_ROLE_PROFILE_COMBINATION` and zero silent fallback.
   - Legacy `"barber"` alias mapped strictly to `"vendeur"` on `EMPLOYEE` read/import/migration flows (`allowLegacyBarberAlias: true`), and blocked on all `TELLER` roles and new UI/API invitations (`allowLegacyBarberAlias: false`).
   - Dual-field conflicts (`operational_profile` vs `operationalProfile`) and missing/null/empty/malformed profiles fail closed (`CONFLICTING_OPERATIONAL_PROFILE_FIELDS`, `MISSING_OPERATIONAL_PROFILE`, `INVALID_OPERATIONAL_PROFILE`).
2. **Server-Side Enforcement (`/src/domains/rbac/serverEmployeeProfileVerifier.ts`):**
   - Every protected cash, transfer, till session, and till auto-provisioning route & engine resolves authoritative `users/{uid}` and `employees` documents via Firebase Admin SDK, validates `ACTIVE` status, tenant isolation (`business_id`), role/profile anti-spoofing (`claimedRole`, `claimedProfile`), dual-field consistency, and operation-specific capability.
3. **Step 3 `MASTER_HEAD_TELLER` Internal Transfer-Approval Correction (`/FINOPS_RBAC_STEP3_MASTER_HEAD_TELLER_APPROVAL_CORRECTION.md`):**
   - `MASTER_HEAD_TELLER` is strictly **DENIED** `transfer.approve` and internal transfer `approve` / `reject` actions (HTTP `403 FORBIDDEN_ROLE`) across `operationalProfilePolicy`, `PermissionService`, `serverEmployeeProfileVerifier`, `ServerInternalTransferEngine`, `transferRoutes`, `ApprovalQueueWidget`, and `CashConsole`, while retaining `cash.view`, `cash.operate`, `cash.transfer` (initiation), `cash.supervise`, till closure/reopen supervision, and till auto-provisioning.
4. **Firestore Rules Hardening (`/firestore.rules` & `/FINOPS_RBAC_STEP4_FIRESTORE_RULES_REVIEW.md`):**
   - Removed `'head_teller'` from `isTenantAdminOrManager(bizId)`.
   - Added `'master_head_teller'` inside explicit parenthesized disjunction in `isTenantCashOperator(bizId)` preventing CEL `||`/`&&` precedence bypass.
   - Added `hasNoProfileConflict`, `resolvedProfileLower`, and `isValidRoleProfileCompatibility` enforcement on `/users/{userId}`, `/employees/{empId}`, and `/invitations/{inviteId}`.

---

## 2. AUTHORITATIVE STEP 4 ROLE × OPERATIONAL PROFILE MATRIX

| RBAC Role | `operational_profile` | Sales | Services | Cash / Tills | Internal Transfer Initiation | Internal Transfer Approve / Reject | Till Supervision & Provisioning |
|---|---|---|---|---|---|---|---|
| `EMPLOYEE` | `vendeur` (`barber` read/import alias) | **ALLOW** | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** |
| `EMPLOYEE` | `polyvalent` | **ALLOW** | **ALLOW** | **DENY** | **DENY** | **DENY** | **DENY** |
| `EMPLOYEE` | `teller` / retired / missing | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** |
| `JUNIOR_TELLER` | `teller` | **DENY** | **DENY** | **ALLOW** (own till) | **DENY** | **DENY** | **DENY** |
| `SENIOR_TELLER` | `teller` | **DENY** | **DENY** | **ALLOW** | **ALLOW** | **DENY** | **DENY** |
| `HEAD_TELLER` | `teller` | **DENY** | **DENY** | **ALLOW** | **ALLOW** | **ALLOW** (Maker-Checker) | **ALLOW** (branch) |
| `MASTER_HEAD_TELLER` | `teller` | **DENY** | **DENY** | **ALLOW** | **ALLOW** | **DENY (`403 FORBIDDEN_ROLE`)** | **ALLOW** (multi-branch) |
| `{JUNIOR,SENIOR,HEAD,MASTER_HEAD}_TELLER` | `vendeur` / `polyvalent` / `barber` / missing | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** |
| `OWNER` / `ADMIN` / `MANAGER` / `SUPER_ADMIN` | Executive RBAC (no pseudo-profile) | RBAC | RBAC | RBAC | RBAC | **ALLOW** (Maker-Checker) | **ALLOW** |
| `ACCOUNTANT` / `AUDITOR` / `SUPERVISOR` | Oversight / non-operational | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** |

*(Full compatibility table documented in `/FINOPS_RBAC_STEP4_ROLE_PROFILE_COMPATIBILITY_MATRIX.csv`.)*

---

## 3. COMPLETE INVENTORY OF CREATED & MODIFIED FILES

### Created Core & Security Test Files
1. `src/domains/rbac/operationalProfilePolicy.ts` — Canonical SSOT policy, normalization, compatibility validation, capability decisions, and `INTERNAL_TRANSFER_APPROVER_ROLES` / `TILL_SUPERVISOR_ROLES`.
2. `src/domains/rbac/serverEmployeeProfileVerifier.ts` — Authoritative Firebase Admin SDK profile/role verifier with active-status, tenant-isolation, conflict-detection, and anti-spoofing enforcement.
3. `src/tests/unit/security/RbacStep4OperationalProfileEnforcement.test.ts` — 20 security verification tests covering all 9 forbidden pairs, Step 3 MHT transfer-approval restriction, capability enforcement, spoofing detection, bulk import, schema validation, and rules structure.

### Modified Backend Routes, Middleware, Services, Repositories & Validation
4. `firestore.rules` — `isTenantAdminOrManager` (`head_teller` removed), parenthesized `isTenantCashOperator` (`master_head_teller`), `hasNoProfileConflict`, `resolvedProfileLower`, `isValidRoleProfileCompatibility` across `/users`, `/employees`, `/invitations`.
5. `server.ts` — Profile conflict detection, `claimedRole`/`claimedProfile` forwarding, and HTTP 403 `PROFILE_SECURITY_ERROR_CODES` mapping across `/api/cash/tills/auto-provision`, `/api/cash/sessions/close`, `/api/cash/sessions/reopen`, `/api/invitations/send`, and `/api/invitations/accept`.
6. `src/routes/transferRoutes.ts` — Server-side operational profile verification on `/intake`, `/payout`, `/internal/request`, `/internal/:transferId/approve`, and `/internal/:transferId/reject` plus explicit `MASTER_HEAD_TELLER` / `canApproveInternalTransferRole` guards.
7. `src/services/PermissionService.ts` — Excluded `MASTER_HEAD_TELLER` from `transfer.approve` while preserving `cash.view`, `cash.operate`, `cash.transfer`, `cash.supervise`.
8. `src/domains/cash/services/ServerTransferIntakeEngine.ts` — Enforced `verifyServerEmployeeOperationalProfile(..., capability: "cash")` and canonical `"teller"` profile.
9. `src/domains/cash/services/ServerTransferPayoutEngine.ts` — Enforced `verifyServerEmployeeOperationalProfile(..., capability: "cash")` and canonical `"teller"` profile.
10. `src/domains/cash/services/ServerInternalTransferEngine.ts` — Removed `MASTER_HEAD_TELLER` from `SUPERVISOR_TRANSFER_ROLES`; enforced `transfer_initiate` on `requestTransfer` and `transfer_approve` + `canApproveInternalTransferRole` on `approveTransfer`/`rejectTransfer`.
11. `src/domains/cash/services/TillSessionEngine.ts` — Enforced `TELLER + "teller"` / `till_supervise` across `openSession`, `closeSessionWithAdmin`, `reopenSession`, and `reopenSessionWithAdmin` + anti-spoofing and requester compatibility checks.
12. `src/domains/cash/services/TellerTransactionEngine.ts` — Enforced `canOperateCashTill` and canonical `"teller"` profile compatibility.
13. `src/domains/cash/services/CashTransferEngine.ts` — Enforced compatibility on initiation (`validateRoleOperationalProfileCompatibility`) and excluded `MASTER_HEAD_TELLER` via `canApproveInternalTransferRole` on `approveTransfer` / `rejectTransfer`.
14. `src/domains/cash/services/TransferIntakeEngine.ts` & `src/domains/cash/services/TransferPayoutEngine.ts` — Enforced `canOperateCashTill` with explicit `operational_profile` / `operationalProfile`.
15. `src/domains/cash/services/EmployeeCashEligibilityService.ts` — Enforced exclusive `TELLER` role + `operational_profile === "teller"` for till eligibility; strictly rejected `EMPLOYEE` (`vendeur`/`polyvalent`), conflicts, and missing profiles.
16. `src/services/business/ServerTillProvisioningService.ts` — Enforced `TILL_SUPERVISOR_ROLES` + `verifyServerEmployeeOperationalProfile(..., capability: "till_supervise")` and authoritative Firestore employee eligibility filtering.
17. `src/services/business/InvitationService.ts` & `src/services/auth/InvitationLifecycleService.ts` — Blocked forbidden pairs and `"barber"` alias at invitation creation (`allowLegacyBarberAlias: false`), re-validated at acceptance (`allowLegacyBarberAlias: true`), and persisted canonical dual fields.
18. `src/services/workforce/BulkEmployeeImportService.ts` — Strict role resolution (no silent downgrade), dual-field conflict check, `validateRoleOperationalProfileCompatibility` row validation, and canonical profile persistence.
19. `src/services/cash/transactionMappingEngine.ts` — Enforced `EMPLOYEE` (`vendeur`/`polyvalent`) vs `TELLER` (`teller`) boundary, decoupled executive roles, retired pseudo-profiles, and fail-closed defaults.
20. `src/repositories/EmployeeRepository.ts`, `src/repositories/InvitationRepository.ts`, `src/repositories/TransactionTypeRepository.ts`, `src/validations/integritySchemas.ts`, `src/utils/seedTransfers.ts` — Enforced canonical role/profile compatibility, conflict checks, and clean seed data (`operational_profile: "teller"`).

### Modified UI Components & Pages
21. `src/components/cash/ApprovalQueueWidget.tsx` & `src/components/cash/CashConsole.tsx` — Gated internal transfer Approve/Reject controls via `canApproveInternalTransferRole` & `PermissionService.can("transfer.approve")`, excluding `MASTER_HEAD_TELLER` from transfer approval while preserving till supervision.
22. `src/components/cash/TransactionTypeEditorDialog.tsx` — Restricted selectable profiles to canonical `"vendeur"`, `"polyvalent"`, `"teller"` (retired pseudo-profiles removed).
23. `src/components/organization/InvitationManagement.tsx` & `src/components/staff/EditEmployeeDialog.tsx` — Dynamically constrained `operational_profile` selectors based on `EMPLOYEE` (`vendeur`/`polyvalent`) vs `TELLER` (`teller` locked) vs Executive/Oversight (none), excluding legacy `barber` and retired pseudo-profiles.
24. `src/pages/employee/components/MySalesAndExpensesSection.tsx` & `src/pages/FinanceLedger.tsx` — Applied Step 4 commercial sales/services & operational profile guards.

### Created & Updated Tests (Fixtures Aligned Strictly to Canonical Step 4 Rules)
25. `src/tests/unit/security/RbacStep4OperationalProfileEnforcement.test.ts` (20 tests — **NEW**)
26. `src/tests/unit/security/RbacStep3MasterHeadTellerSecurity.test.ts` (35 tests — updated `MHT-T09`, `MHT-T21`, `MHT-T26` to assert MHT internal transfer approval denial)
27. `src/tests/unit/PermissionService.test.ts` & `src/tests/unit/cash/OperationalProfileWorkflow.test.ts`
28. Legacy cash/API tests updated strictly with canonical `TELLER` / `operational_profile: "teller"` test fixtures (zero security relaxation): `src/tests/integration/transferApi.test.ts`, `src/tests/unit/cash/P12MockDataRemediation.test.ts`, `src/tests/unit/cash/ServerInternalTransferApiRoutes.test.ts`, `src/tests/unit/cash/ServerInternalTransferEngine.test.ts`, `src/tests/unit/cash/TellerAndTillManagementScenarios.test.ts`, `src/tests/unit/cash/TransferIntakeAndPayoutLifecycle.test.ts`, `src/tests/unit/cash/TransferPayoutEngine.test.ts`, `src/tests/unit/cash/TransferPayoutEngineConcurrency.test.ts`.

---

## 4. VERIFICATION & EVIDENCE CLASSIFICATION

- **`PROVEN_BUILD` (`compile_applet`):** Vite production build succeeded with 0 errors.
- **`PROVEN_STATIC` (`lint_applet`):** TypeScript check (`tsc --noEmit`) succeeded with 0 errors.
- **`PROVEN_UNIT` & `PROVEN_INTEGRATION` (Vitest v4.1.11):**
  - Focused Step 1–4 + Security + Integration Suite: **15/15 test files passed, 255/255 tests passed** (`21.19s`).
  - Expanded Security, Cash, RBAC, Schema & Integrity Suite: **49/49 test files passed, 565/565 tests passed** (`56.80s`).
  - Baseline Step 1 (`RbacStep1PermissionMatrices.test.ts`: 18/18), Step 2 (`RbacStep2PayrollCheckerAndMakerChecker.test.ts`: 25/25), and Step 3 (`RbacStep3MasterHeadTellerSecurity.test.ts`: 35/35) verified passing alongside Step 4 (`RbacStep4OperationalProfileEnforcement.test.ts`: 20/20).
- **`NOT_EXECUTED_IN_CONTAINER` (Firestore Rules Emulator):** Live Firestore Emulator suite could not be executed in this container because Java JRE is not installed. Rules changes are validated statically via rules-structure tests and manual inspection (`/FINOPS_RBAC_STEP4_FIRESTORE_RULES_REVIEW.md`).

---

## 5. REMAINING RISKS & PRE-DEPLOYMENT PREREQUISITES

1. **Java Firestore Emulator Validation Before Production Rules Deploy:** Run `@firebase/rules-unit-testing` against `/firestore.rules` in a CI/local environment with Java 17+ JRE installed prior to deploying rules to `finopsht`.
2. **Legacy Production Data Audit & Backfill (`barber` / Missing `operational_profile` / Retired Profiles):** Before enforcing strict fail-closed rejection in production, audit existing `users` and `employees` documents in Firestore DB `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`:
   - Normalize any persisted `EMPLOYEE` with `barber` -> `vendeur`.
   - Explicitly assign `"vendeur"` or `"polyvalent"` to active `EMPLOYEE` records missing `operational_profile`.
   - Explicitly assign `"teller"` to active `{JUNIOR,SENIOR,HEAD,MASTER_HEAD}_TELLER` records missing `operational_profile`.
   - Remove retired pseudo-profiles (`"head_teller"`, `"manager"`, `"owner"`) from any legacy `operational_profile` fields and reconcile Auth Custom Claims (`reconcileCustomClaims`).

---

## 6. REQUIRED DELIVERABLES INDEX

1. `/FINOPS_RBAC_STEP4_IMPLEMENTATION_REPORT.md` (this report)
2. `/FINOPS_RBAC_STEP4_PATCH.diff`
3. `/FINOPS_RBAC_STEP4_TEST_EVIDENCE.md`
4. `/FINOPS_RBAC_STEP4_ENDPOINT_COVERAGE.csv`
5. `/FINOPS_RBAC_STEP4_ROLE_PROFILE_COMPATIBILITY_MATRIX.csv`
6. `/FINOPS_RBAC_STEP4_FIRESTORE_RULES_REVIEW.md`
7. `/FINOPS_RBAC_STEP3_MASTER_HEAD_TELLER_APPROVAL_CORRECTION.md`

---

## 7. STOP GATE STATEMENT

All local Step 4 changes and the Step 3 `MASTER_HEAD_TELLER` internal transfer-approval correction are implemented and verified locally (`565/565` targeted unit/integration tests passed, `tsc --noEmit` clean, Vite build clean).  
**No `deploy_firebase`, no production database write, and no `git commit`/`git push` have been executed.**
