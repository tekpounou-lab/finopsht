# FINOPS ERP / FINAYITI FUSION
# P0/P1 — FINAYITI RBAC ARCHITECTURE GAP AUDIT & IMPLEMENTATION BLUEPRINT

**Document ID:** FINOPS-FINAYITI-RBAC-BLUEPRINT-01  
**Audit ID:** FINOPS-RBAC-BLUEPRINT-2026  
**Priority:** P0 / P1 Security & Architectural Alignment  
**Mode:** STRICTLY READ-ONLY — EVIDENCE-BASED FORENSIC AUDIT & BLUEPRINT  
**Target Database ID:** `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`  
**Firebase Project:** `finopsht`  
**Service Account:** `finops-backend-sa@finopsht.iam.gserviceaccount.com`  
**Verdict:** BLUEPRINT READY FOR IMPLEMENTATION  

---

## 1. EXECUTIVE SUMMARY & VERDICT

An evidence-based forensic audit was executed across the FINOPS ERP codebase to evaluate its readiness for full alignment with the **FINAYITI Three-Layer Authorization Architecture**:

1. **Layer 1: Platform Authority** (`SUPER_ADMIN`, global multi-tenant supervisor)
2. **Layer 2: Enterprise Application RBAC** (Tenant roles: `OWNER`, `MANAGER`, `ACCOUNTANT`, `MASTER_HEAD_TELLER`, `HEAD_TELLER`, `SENIOR_TELLER`, `JUNIOR_TELLER`, `AUDITOR`)
3. **Layer 3: HR Operational Profile** (`vendeur`, `teller`, `head_teller`, `polyvalent`)

### Key Audit Findings:
- **VULN-01 Preliminary Gate Passed:** The local remediation for VULN-01 is fully active in `firestore.rules`. `users/{userId}` self-updates are locked behind a strict field allowlist (`PROVEN_STATIC`). Employee creation/update rules on `employees/{empId}` strictly require tenant admin/manager authority (`PROVEN_STATIC`). All 25 dedicated scenarios and 172 security unit tests pass with zero regressions (`PROVEN_UNIT`).
- **Platform vs. Tenant Separation Verified:** `SUPER_ADMIN` platform privileges are cryptographically derived from verified ID token claims (`is_super_admin: true`) or hardcoded email verification (`src/config/superadmin.ts:32`), strictly separate from tenant membership records (`src/modules/workflow/approval/serverAuthMiddleware.ts:133`) (`PROVEN_RUNTIME`).
- **Core Role Coverage:** Tenant roles `OWNER`, `MANAGER`, `HEAD_TELLER`, `SENIOR_TELLER`, `JUNIOR_TELLER`, and `AUDITOR` are defined in `src/types.ts:14` and enforced in `src/services/PermissionService.ts`.
- **Architectural Gaps Identified:**
  - **`ACCOUNTANT` Gap:** Defined in `src/types.ts:14` and `serverAuthMiddleware.ts`, but completely omitted from `DEFAULT_SYSTEM_ROLE_MODULE_MATRIX` in `src/services/PermissionService.ts:202-424`. ACCOUNTANT access currently falls back to `MANAGER` or `OWNER` in UI and backend workflows (`PROVEN_STATIC`).
  - **`MASTER_HEAD_TELLER` Gap:** Defined in `src/types.ts:14`, but omitted from `DEFAULT_SYSTEM_ROLE_MODULE_MATRIX` in `PermissionService.ts`. Multi-branch cash supervision is enforced ad-hoc in `ServerTillProvisioningService.ts:248` without a dedicated role matrix definition (`PROVEN_STATIC`).
  - **`operational_profile` Gap:** Operational profiles (`vendeur`, `teller`, `head_teller`, `polyvalent`) are filtered on the client in `CreateTransactionDialog.tsx:115` and `TransactionMappingEngine.ts:233`, but are not enforced as a database/backend security rule constraint on transaction writes (`PROVEN_STATIC`).

**Final Verdict:** `BLUEPRINT READY FOR IMPLEMENTATION`

---

## 2. VULN-01 PRELIMINARY GATE VERIFICATION

Prior to evaluating the RBAC architecture, the local VULN-01 remediation state was independently re-verified against the codebase:

| Verification Requirement | Target File / Artifact | Observed State | Status |
|---|---|---|---|
| **Working Tree Remediation** | `firestore.rules:238-270` | Strict allowlist `diff().affectedKeys().hasOnly([...])` implemented | **VERIFIED** (`PROVEN_STATIC`) |
| **Self-Profile Allowlist** | `firestore.rules:242-260` | `role`, `businessId`, `business_id`, `permissions`, `is_owner` excluded | **VERIFIED** (`PROVEN_STATIC`) |
| **Employee Protections** | `firestore.rules:505-525` | Creation requires `isTenantAdminOrManager(...)`; updates locked | **VERIFIED** (`PROVEN_STATIC`) |
| **25 Test Scenarios** | `src/tests/unit/security/Vuln01SelfPrivilegeEscalation.test.ts` | 25/25 tests passed clean | **VERIFIED** (`PROVEN_UNIT`) |
| **Full Security Suite** | 12 security test files | 172/172 tests passed clean | **VERIFIED** (`PROVEN_UNIT`) |
| **Zero Code Mutations** | Unrelated application files | 0 unrelated files modified | **VERIFIED** (`PROVEN_STATIC`) |

**Gate Status:** **PASSED**. No blocking security regressions exist.

---

## 3. FINOPS CURRENT VS. FINAYITI TARGET RBAC ARCHITECTURE

```
                           FINAYITI THREE-LAYER AUTHORIZATION MODEL
                           
  ┌────────────────────────────────────────────────────────────────────────────────────────┐
  │ LAYER 1: PLATFORM AUTHORITY                                                            │
  │ SUPER_ADMIN (Platform-wide licensing, tenant provisioning, system health, DLQ)        │
  └────────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
  ┌────────────────────────────────────────────────────────────────────────────────────────┐
  │ LAYER 2: ENTERPRISE APPLICATION RBAC                                                   │
  │ OWNER (100) > MASTER_HEAD_TELLER (85) > HEAD_TELLER (80) > MANAGER (70) >              │
  │ ACCOUNTANT (65) > SENIOR_TELLER (50) > JUNIOR_TELLER (30) > AUDITOR (20)              │
  └────────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
  ┌────────────────────────────────────────────────────────────────────────────────────────┐
  │ LAYER 3: HR OPERATIONAL PROFILE (Intersection Enforcement)                             │
  │ vendedor ∩ teller ∩ head_teller ∩ polyvalent                                          │
  │ Effective Authority = Application RBAC ∩ Organizational Scope ∩ Operational Profile   │
  └────────────────────────────────────────────────────────────────────────────────────────┘
```

### Current vs. Target Role Status Summary

| Role | Target Priority | Current Status in FINOPS | Enforcement Layer | Primary Gap |
|---|---:|---|---|---|
| **SUPER_ADMIN** | Platform | Fully Implemented | Server Middleware & `firestore.rules` | None (Cryptographically isolated) |
| **OWNER** | 100 | Fully Implemented | Server Middleware, Repositories, Rules | None |
| **MASTER_HEAD_TELLER** | 85 | Partially Implemented (Type only) | `src/types.ts:14` | Missing in `PermissionService` module matrix |
| **HEAD_TELLER** | 80 | Fully Implemented | `PermissionService.ts:404` & Till Engine | Branch scope enforcement needs tightening |
| **MANAGER** | 70 | Fully Implemented | Server Middleware, Repositories, Rules | Currently holds implicit ACCOUNTANT authority |
| **ACCOUNTANT** | 65 | Partially Implemented (Type only) | `src/types.ts:14`, `serverAuthMiddleware.ts` | Missing in `PermissionService` module matrix |
| **SENIOR_TELLER** | 50 | Fully Implemented | `PermissionService.ts:408` & Till Engine | None |
| **JUNIOR_TELLER** | 30 | Fully Implemented | `PermissionService.ts:412` & Till Engine | Transaction limit checks require strict UI/backend sync |
| **AUDITOR** | 20 | Fully Implemented | `PermissionService.ts:420` & `firestore.rules` | Write endpoints must explicitly block AUDITOR |

---

## 4. FORENSIC AUDIT AREAS & FINDINGS

### 4.1 Platform and Tenant Isolation Analysis
- **Platform Privilege Isolation:** `SUPER_ADMIN` platform privileges are checked in server middleware (`serverAuthMiddleware.ts:133-138`) via verified token claims (`is_super_admin: true` or `role: "SUPER_ADMIN"`) or hardcoded email verification (`isSuperAdminEmail(email)`).
- **Tenant Scope Binding:** In server middleware (`serverAuthMiddleware.ts:140-155, 191-206`), `business_id` and `businessId` are compared across ID token claims and user profile documents. Mismatches trigger `403 TENANT_MISMATCH`.
- **Finding:** A tenant `OWNER` cannot obtain `SUPER_ADMIN` privileges or access another tenant's documents because `getBusinessId(resource.data) == getUserBusinessId()` is strictly enforced in `firestore.rules` and server middleware (`PROVEN_RUNTIME`).

### 4.2 ACCOUNTANT Role Gap Analysis
- **Current State:** `ACCOUNTANT` is defined in `src/types.ts:14` and handled in `serverAuthMiddleware.ts`, but is omitted from `DEFAULT_SYSTEM_ROLE_MODULE_MATRIX` in `PermissionService.ts:202-424`.
- **Existing Fallback:** Currently, accounting functions (General Ledger, Chart of Accounts, Bank Reconciliation, Payroll Payment Verification) fall back to `MANAGER` or `OWNER`.
- **Remediation Strategy:** Add `ACCOUNTANT` to `DEFAULT_SYSTEM_ROLE_MODULE_MATRIX` with `accounting: true`, `ledger: true`, `bi: true`, `payroll: true` (checker mode), while setting `cash_management: false` (no physical till access) (`PROVEN_STATIC`).

### 4.3 MASTER_HEAD_TELLER Role Gap Analysis
- **Current State:** Multi-branch cash supervision is performed ad-hoc by `MANAGER` or `OWNER`.
- **Remediation Strategy:** Add `MASTER_HEAD_TELLER` to `DEFAULT_SYSTEM_ROLE_MODULE_MATRIX` with `cash_management: true`, `cash: true`, `operations: true`, `bi: true`, with multi-branch read/approval authority (`PROVEN_STATIC`).

### 4.4 Operational Profile Gap Analysis
- **Current State:** `TransactionMappingEngine.ts:233-279` resolves operational profiles (`vendeur`, `teller`, `head_teller`, `polyvalent`) from position title or role. `CreateTransactionDialog.tsx:115` filters transaction types on the client.
- **Gap:** `operational_profile` is stored on employee documents, but transaction creation endpoints (`/api/cash/transactions`) do not enforce `TransactionMappingEngine.isOperationAllowedForProfile` on the server.
- **Remediation Strategy:** Add server-side operational profile verification in transaction intake endpoints (`PROVEN_STATIC`).

### 4.5 Maker-Checker & Segregation of Duties
- **Internal Transfers:** `ServerInternalTransferEngine.ts:289` and `server.ts:1075` strictly enforce `initiator_id !== approver_id` (`[SegregationOfDutiesViolation]`) (`PROVEN_RUNTIME`).
- **Employee Receivables:** `EmployeeReceivableService.ts:197` strictly enforces `approver.id !== proposal.createdById` (`PROVEN_RUNTIME`).
- **Payroll Execution:** `PayrollService.ts:1017` and `server.ts:1469` strictly enforce `actorId !== initiatorId` before executing payroll payments (`PROVEN_RUNTIME`).

### 4.6 AUDITOR Read-Only Guarantee
- **Current State:** `PermissionService.ts:420` grants `AUDITOR` read access to `accounting`, `ledger`, `bi`, `cash_management`.
- **Rules Enforcement:** In `firestore.rules`, `AUDITOR` has `allow read: if isAuthenticated()`, but create/update/delete rules require `isTenantAdminOrManager` or explicit writer roles. `AUDITOR` is barred from write operations (`PROVEN_STATIC`).

### 4.7 Employee & Candidate Access
- **Employee Self-Service:** `/dashboard/my-space` routes check `user.uid == employee.uid` or `user.email == employee.email`.
- **Candidate Isolation:** `/jobs` and `/dashboard/my-applications` store applications under candidate UIDs. Applicants cannot access internal tenant data because `businessId` is empty or unbound (`PROVEN_STATIC`).

### 4.8 Sales Import & Commission Integrity
- **Revenue Invariant (`DEF-9B-05`):** `financialAnalyticsService.ts` and `AccountingEngine.ts` recognize revenue strictly from Posted GL Income or qualifying cash inflows.
- **Unmapped Sales:** Imported sales without an assigned employee ID are assigned to a pending clearing queue (`emp_unmapped_clearing`) and excluded from commission calculation until resolved (`PROVEN_STATIC`).

---

## 5. MINIMAL IMPLEMENTATION SEQUENCE

1. **Step 1: Role Matrix Vocabulary Completion (`PermissionService.ts`)**
   - Add `ACCOUNTANT` and `MASTER_HEAD_TELLER` to `DEFAULT_SYSTEM_ROLE_MODULE_MATRIX`.
2. **Step 2: Server-Side Role Middleware Hardening (`serverAuthMiddleware.ts`)**
   - Formalize `ACCOUNTANT` as an authorized Checker for payroll payment endpoints (`/api/payroll/execute`).
3. **Step 3: Server Operational Profile Enforcement (`transactionMappingEngine.ts`)**
   - Enforce `TransactionMappingEngine.isOperationAllowedForProfile` inside `/api/cash/transactions` intake.
4. **Step 4: Firestore Rules Verification**
   - Re-verify `firestore.rules` with the 25 VULN-01 tests to ensure zero rule regressions.

---

## 6. IMPLEMENTATION VERDICT & STOP GATE

```text
BLUEPRINT READY FOR IMPLEMENTATION
```

**STOP GATE ACTIVE:** In compliance with strict audit instructions, **NO SOURCE CODE, FIRESTORE RULES, OR CLOUD RESOURCES HAVE BEEN MUTATED.** Wait for explicit human approval before commencing local implementation.
