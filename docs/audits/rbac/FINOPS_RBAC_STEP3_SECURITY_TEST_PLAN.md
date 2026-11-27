# FINOPS ERP / FINAYITI FUSION
## RBAC STEP 3 — MASTER_HEAD_TELLER SECURITY TEST PLAN

**Test Suite Reference:** `src/tests/unit/security/RbacStep3MasterHeadTellerSecurity.test.ts`  
**Execution Target:** Vitest Security Engine  
**Scenarios Count:** 35 Scenarios (`MHT-T01` through `MHT-T35`)

---

### 1. TEST SCENARIOS MATRIX (`MHT-T01` THROUGH `MHT-T35`)

| Test ID | Category | Test Objective | Enforcement Layer | Expected Outcome |
|---|---|---|---|---|
| `MHT-T01` | Role Isolation | MASTER_HEAD_TELLER does NOT inherit OWNER permissions | PermissionService | PASS - `can("manage_settings")` = false |
| `MHT-T02` | Role Isolation | MASTER_HEAD_TELLER does NOT inherit MANAGER permissions | PermissionService | PASS - `can("employee.create")` = false |
| `MHT-T03` | Role Isolation | MASTER_HEAD_TELLER does NOT inherit ACCOUNTANT permissions | PermissionService | PASS - `can("accounting.view")` = false |
| `MHT-T04` | Role Isolation | MASTER_HEAD_TELLER cannot administer tenant roles | PermissionService | PASS - `can("manage_tenant_users")` = false |
| `MHT-T05` | Role Isolation | MASTER_HEAD_TELLER cannot administer payroll | PermissionService | PASS - `can("payroll.approve")` = false |
| `MHT-T06` | Role Isolation | MASTER_HEAD_TELLER cannot post to General Ledger | PermissionService | PASS - `can("journal.post")` = false |
| `MHT-T07` | Branch Scope | Authorized multi-branch read succeeds | PermissionService & Repository | PASS - Multi-branch till list returned |
| `MHT-T08` | Branch Scope | Unauthorized branch access is denied | ServerAuthMiddleware | PASS - 403 FORBIDDEN_TENANT_ACCESS |
| `MHT-T09` | Branch Scope | Cross-tenant branch access is denied | ServerAuthMiddleware | PASS - 403 TENANT_ISOLATION_VIOLATION |
| `MHT-T10` | Branch Scope | Missing branch scope fails closed | ServerAuthMiddleware | PASS - 400 MISSING_TENANT_CONTEXT |
| `MHT-T11` | Branch Scope | Client-supplied branch IDs cannot expand tenant boundary | ServerAuthMiddleware | PASS - Header spoofing rejected |
| `MHT-T12` | Till Supervision | Authorized till status visibility succeeds | CashManagementRepository | PASS - Returns cash till details |
| `MHT-T13` | Till Supervision | Authorized opening request review succeeds | ServerTillService | PASS - Review status recorded |
| `MHT-T14` | Till Supervision | Unauthorized till opening approval is denied | ServerTillService | PASS - Role check enforced |
| `MHT-T15` | Till Supervision | Reopening approval respects operation authorization | ServerTillService | PASS - Reopen request approved |
| `MHT-T16` | Till Supervision | Closing approval respects branch scope | ServerTillService | PASS - Branch boundary verified |
| `MHT-T17` | Till Supervision | Consolidated closing excludes unauthorized branches | CashManagementRepository | PASS - Scoped filtering applied |
| `MHT-T18` | Till Supervision | Cash adjustment approval is not automatically granted | CashManagementRepository | PASS - Separate approval required |
| `MHT-T19` | Maker-Checker | Actor cannot approve their own till request | ServerTillService | PASS - Throws MAKER_CHECKER_VIOLATION |
| `MHT-T20` | Maker-Checker | Actor cannot approve their own internal transfer | ServerInternalTransferEngine | PASS - Throws MAKER_CHECKER_VIOLATION |
| `MHT-T21` | Maker-Checker | Alternate endpoint cannot bypass Maker-Checker guard | ServerApprovalGateway | PASS - Throws MAKER_CHECKER_VIOLATION |
| `MHT-T22` | Maker-Checker | Client-provided approver identity in payload is ignored | ServerInternalTransferEngine | PASS - Context UID used strictly |
| `MHT-T23` | Maker-Checker | Repeated approval cannot duplicate transfer execution | ServerInternalTransferEngine | PASS - Idempotency lock prevents replay |
| `MHT-T24` | Transfers & Sales | Source branch authorization is enforced | ServerInternalTransferEngine | PASS - Source branch validated |
| `MHT-T25` | Transfers & Sales | Destination branch must belong to same tenant | ServerInternalTransferEngine | PASS - Tenant match verified |
| `MHT-T26` | Transfers & Sales | Transfer approval is independent from creation | ServerInternalTransferEngine | PASS - Independent approval required |
| `MHT-T27` | Transfers & Sales | Transfer replay is rejected or idempotent | ServerInternalTransferEngine | PASS - Replay returns cached result |
| `MHT-T28` | Transfers & Sales | MASTER_HEAD_TELLER can submit sales imports | BulkTransactionService | PASS - Submission permitted |
| `MHT-T29` | Transfers & Sales | Sales import submission does NOT imply auto-approval | BulkTransactionService | PASS - Pending approval state |
| `MHT-T30` | Transfers & Sales | Unmapped sales do NOT generate employee commissions | CommissionEngine | PASS - Zero commission calculated |
| `MHT-T31` | Regression | ACCOUNTANT payroll Checker permissions remain intact | PermissionService & PayrollService | PASS - ACCOUNTANT payroll Checker valid |
| `MHT-T32` | Regression | Step 2 Maker-Checker restrictions remain intact | PayrollService | PASS - Step 2 Maker-Checker verified |
| `MHT-T33` | Regression | AUDITOR remains strictly read-only | PermissionService | PASS - `can("cash.operate")` = false |
| `MHT-T34` | Regression | VULN-01 self-privilege protection remains intact | firestore.rules | PASS - Self role edit blocked |
| `MHT-T35` | Regression | Unknown roles and missing authorization fail closed | PermissionService | PASS - Default DENY enforced |

---

### 2. EXECUTION & EVIDENCE INSTRUCTIONS

Upon authorization of Step 3 implementation:
1. Update `ServerTransferIntakeEngine.ts`, `ServerTransferPayoutEngine.ts`, and `ServerInternalTransferEngine.ts` to include `MASTER_HEAD_TELLER`.
2. Create `src/tests/unit/security/RbacStep3MasterHeadTellerSecurity.test.ts` executing all 35 test cases.
3. Run `npx vitest run src/tests/unit/security/` and verify 100% pass rate across all security test files.
4. Execute `compile_applet` and `lint_applet` to ensure zero compilation or linter errors.
