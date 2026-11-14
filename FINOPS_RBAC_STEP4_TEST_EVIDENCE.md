# FINOPS ERP / FINAYITI FUSION
## RBAC STEP 4 + STEP 3 MHT CORRECTION — TEST EVIDENCE REPORT

**Execution Date:** November 14, 2026  
**Test Framework:** Vitest v4.1.11  
**TypeScript Linter:** `tsc --noEmit` (`lint_applet`)  
**Production Compiler:** Vite (`compile_applet`)  
**Overall Security, RBAC & Cash Suite Status:** 100% PASSED (49/49 test files, 565/565 tests)

---

### 1. FOCUSED RBAC STEP 1–4 + SECURITY & INTEGRATION SUITE (15 FILES / 255 TESTS)

Executed after all source, rules, UI, and test fixture edits:

```text
 ✓ src/tests/unit/security/PhaseD3TillClosureSecurityAndIntegrity.test.ts  (21 tests) 566ms
 ✓ src/tests/unit/security/PhaseD2TillProvisioningSecurity.test.ts  (11 tests) 384ms
 ✓ src/tests/unit/security/P0SecurityRemediation.test.ts  (11 tests) 154ms
 ✓ src/tests/unit/security/P0FinalHardeningInvitationClaims.test.ts  (9 tests) 166ms
 ✓ src/tests/unit/security/P0RbacOperationalRolesVerification.test.ts  (12 tests) 22ms
 ✓ src/tests/unit/security/RbacStep4OperationalProfileEnforcement.test.ts  (20 tests) 53ms
 ✓ src/tests/unit/security/Vuln01SelfPrivilegeEscalation.test.ts  (25 tests) 13ms
 ✓ src/tests/integration/transferApi.test.ts  (6 tests) 54ms
 ✓ src/tests/unit/security/Phase20SecurityRbacTenantIsolation.test.ts  (17 tests) 33ms
 ✓ src/tests/unit/cash/OperationalProfileWorkflow.test.ts  (23 tests) 30ms
 ✓ src/tests/unit/security/RbacStep2PayrollCheckerAndMakerChecker.test.ts  (25 tests) 23ms
 ✓ tests/unit/FirestoreRulesModGov8.test.ts  (7 tests) 10ms
 ✓ src/tests/unit/security/RbacStep3MasterHeadTellerSecurity.test.ts  (35 tests) 26ms
 ✓ src/tests/unit/security/RbacStep1PermissionMatrices.test.ts  (18 tests) 24ms
 ✓ src/tests/unit/security/PhaseD4B24RulesHardening.test.ts  (15 tests) 20ms

 Test Files  15 passed (15)
      Tests  255 passed (255)
   Duration  21.19s (transform 3.30s, setup 312ms, import 14.63s, tests 1.58s, environment 3ms)
```

---

### 2. EXPANDED SECURITY, CASH, RBAC, SCHEMA & INTEGRITY REGRESSION SUITE (49 FILES / 565 TESTS)

Command executed:
`npx vitest run src/tests/unit/security src/tests/unit/cash src/tests/unit/PermissionService.test.ts src/tests/unit/AccessResolver.test.ts src/tests/unit/Phase21FirestoreRulesHardening.test.ts src/tests/integration/transferApi.test.ts tests/unit/FirestoreRulesModGov8.test.ts tests/unit/CanonicalSchemaNormalization.test.ts src/tests/unit/OnboardingIntegrity.test.ts src/tests/unit/IntegrityAndUnicity.test.ts src/tests/unit/PayrollSecurityFixPhase4C.test.ts src/tests/unit/Phase18ControlledAuthorizationHardening.test.ts src/tests/unit/Phase20CanonicalBusinessId.test.ts src/tests/unit/Phase20SuperAdminSelfPromotion.test.ts src/tests/unit/SuperAdminIntegrity.test.ts`

```text
 Test Files  49 passed (49)
      Tests  565 passed (565)
   Duration  56.80s (transform 3.75s, setup 976ms, import 34.18s, tests 4.98s, environment 19ms)
```

Included suites verified passing without modification to Step 4 fail-closed enforcement:
- **Step 4 Dedicated Suite (`RbacStep4OperationalProfileEnforcement.test.ts` — 20 tests):**
  - Suite 1: `EMPLOYEE + vendeur` / `polyvalent` allowed; all 9 forbidden `EMPLOYEE`/`TELLER` combinations explicitly rejected (`FORBIDDEN_ROLE_PROFILE_COMBINATION`) in policy & `EmployeeIntegritySchema`; retired pseudo-profiles (`head_teller`, `manager`, `owner`) rejected; legacy `barber` alias allowed strictly for `EMPLOYEE` read/import/migration -> `vendeur` and blocked for `TELLER` roles / new invitations.
  - Suite 2: `evaluateOperationalProfileAccess` & `TransactionMappingEngine` capability matrix (`sales`, `services`, `cash`, fail-closed missing/null/malformed/conflicting/oversight, executive RBAC decoupling).
  - Suite 3: `verifyServerEmployeeOperationalProfile` server-side enforcement (active `TELLER` + `teller` allowed; `EMPLOYEE` + `polyvalent` denied `403 FORBIDDEN_ROLE` on cash; `TELLER` with missing/mismatched profile denied `403`; role/profile spoofing rejected; dual-field & user/employee conflict rejected; inactive actor denied; `TransactionTypeRepository` & `BulkEmployeeImportService` compatibility).
  - Suite 4: Step 3 `MASTER_HEAD_TELLER` internal transfer-approval restriction (`transfer_approve` -> `403 FORBIDDEN_ROLE`, `ServerInternalTransferEngine.approveTransfer`/`rejectTransfer` denied, `PermissionService.can("transfer.approve")` = `false`, while `cash.operate`, `cash.transfer`, `till_supervise`, `transfer_initiate` with `teller` profile remain allowed).
  - Suite 5: `firestore.rules` structural parity (`head_teller` removed from `isTenantAdminOrManager`, `master_head_teller` parenthesized in `isTenantCashOperator`, `hasNoProfileConflict` & `isValidRoleProfileCompatibility` present and enforced on `/users`, `/employees`, `/invitations`, and `allow create, update, delete: if false` on transfer collections).
- **Baseline Regression Verification:**
  - Step 1: `RbacStep1PermissionMatrices.test.ts` (18/18 passed)
  - Step 2: `RbacStep2PayrollCheckerAndMakerChecker.test.ts` (25/25 passed)
  - Step 3 (with MHT approval correction): `RbacStep3MasterHeadTellerSecurity.test.ts` (35/35 passed)
  - Legacy Cash & API Suites (updated strictly with canonical `TELLER`/`teller` fixtures): `transferApi.test.ts` (6/6), `OperationalProfileWorkflow.test.ts` (23/23), `ServerInternalTransferApiRoutes.test.ts`, `ServerInternalTransferEngine.test.ts`, `TransferIntakeAndPayoutLifecycle.test.ts`, `TransferPayoutEngine.test.ts`, `TransferPayoutEngineConcurrency.test.ts`, `TellerAndTillManagementScenarios.test.ts`, `P12MockDataRemediation.test.ts`, `P11CashClosureRemediation.test.ts`.
  - Security & Rules Structure Suites: `PhaseD2TillProvisioningSecurity.test.ts` (11/11), `PhaseD3TillClosureSecurityAndIntegrity.test.ts` (21/21), `PhaseD4B24RulesHardening.test.ts` (15/15), `P0SecurityRemediation.test.ts` (11/11), `P0FinalHardeningInvitationClaims.test.ts` (9/9), `Vuln01SelfPrivilegeEscalation.test.ts` (25/25), `FirestoreRulesModGov8.test.ts` (7/7), `Phase21FirestoreRulesHardening.test.ts` (3/3).

---

### 3. COMPILATION & LINT VERIFICATION

- `compile_applet` (Vite production build): **Build succeeded - the applet is compiled**
- `lint_applet` (`$ tsc --noEmit`): **Linting completed successfully (0 errors)**

---

### 4. HONEST ENVIRONMENT LIMITATION NOTE

- **Live Firestore Emulator Tests:** Not executed in this container because Java JRE (`java`) is not installed in the container runtime environment. Rules syntax and CEL semantics were verified through static/regex rules tests (`PhaseD4B24RulesHardening.test.ts`, `FirestoreRulesModGov8.test.ts`, `Phase21FirestoreRulesHardening.test.ts`, `RbacStep4OperationalProfileEnforcement.test.ts`) and manual review documented in `/FINOPS_RBAC_STEP4_FIRESTORE_RULES_REVIEW.md`.
- **Production Deployment / Live DB Mutations:** Not executed (`deploy_firebase` and `git commit`/`git push` strictly withheld).
