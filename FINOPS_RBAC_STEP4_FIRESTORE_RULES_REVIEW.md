# FINOPS ERP / FINAYITI FUSION
## RBAC STEP 4 — FIRESTORE SECURITY RULES REVIEW

**Review ID:** `FINOPS-RBAC-STEP4-RULES-01`  
**File Reviewed:** `/firestore.rules`  
**Firebase Project:** `finopsht`  
**Firestore Database:** `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`  
**Deployment Status:** LOCAL FILE ONLY — Production `deploy_firebase` NOT executed (per strict prohibition).

---

## 1. SUMMARY OF HARDENING CHANGES IN `/firestore.rules`

### 1.1 Removed `head_teller` from `isTenantAdminOrManager(bizId)`
- **Previous Gap (`S4-TEL-03`, `S4-TEL-06`):** `isTenantAdminOrManager(bizId)` previously included `'head_teller'`, allowing a `HEAD_TELLER` to bypass backend service restrictions and directly mutate `employees/{empId}`, `invitations/{inviteId}`, `branch_safes/{id}`, `payroll_records`, and `business_settings` via the Firestore client SDK.
- **Remediation:** `isTenantAdminOrManager(bizId)` now strictly allows `['owner', 'admin', 'manager', 'owner_admin']` (plus `isBusinessOwner` / `isSuperAdmin`). All teller roles (`HEAD_TELLER`, `MASTER_HEAD_TELLER`, `SENIOR_TELLER`, `JUNIOR_TELLER`, `TELLER`) are excluded from administrative/HR/safe-admin client writes.

### 1.2 Hardened `isTenantCashOperator(bizId)` (CEL Precedence Fix + `master_head_teller`)
- **Finding & Remediation:** Added `'master_head_teller'` to the allowed cash operator role list in `isTenantCashOperator(bizId)` and wrapped the entire role disjunction in explicit parentheses:
  ```cel
  (
    request.auth.token.get('role', '').lower() in ['owner', 'admin', 'manager', 'head_teller', 'senior_teller', 'junior_teller', 'teller', 'owner_admin', 'master_head_teller'] ||
    (hasUserData() && (
      getMyProfile().get('role', '').lower() in ['owner', 'admin', 'manager', 'head_teller', 'senior_teller', 'junior_teller', 'teller', 'owner_admin', 'master_head_teller']
    ))
  )
  ```
  Because CEL binds `&&` tighter than `||`, wrapping the role disjunction in parentheses guarantees that `businessId == bizId` tenant scoping can **never** be bypassed by `master_head_teller` or `hasUserData()`.

### 1.3 Added Role × `operational_profile` Compatibility CEL Helpers
- `hasNoProfileConflict(data)`: Rejects documents containing both `operational_profile` and `operationalProfile` with disagreeing values (while treating both `null` as non-conflicting).
- `resolvedProfileLower(data)`: Resolves non-null string `operational_profile` / `operationalProfile` to lowercase, returns `'__invalid__'` for non-string values, and `''` when absent or `null`.
- `isValidRoleProfileCompatibility(data)`: Enforces the exact authoritative matrix at the Firestore Rules layer:
  - `EMPLOYEE` requires `resolvedProfileLower(data) in ['vendeur', 'polyvalent']` (rejects `'teller'`, missing, retired pseudo-profiles, and invalid values).
  - `['JUNIOR_TELLER', 'SENIOR_TELLER', 'HEAD_TELLER', 'MASTER_HEAD_TELLER', 'TELLER']` requires `resolvedProfileLower(data) == 'teller'` (rejects `'vendeur'`, `'polyvalent'`, `'barber'`, missing, and retired pseudo-profiles).
  - All other roles (Executive & Oversight roles) require `resolvedProfileLower(data) == ''` (cannot carry commercial, teller, or retired pseudo-profiles).

### 1.4 Collection Write Enforcement
- **`/users/{userId}`:**
  - `allow create`: Self-creation forbids setting `operational_profile` / `operationalProfile`, restricts `role` to `EMPLOYEE` or empty, and forbids `businessId`/`tenantId` assignment.
  - `allow update`: Self-update whitelist strictly excludes `role`, `operational_profile`, `operationalProfile`, `permissions`, `businessId`, `business_id`. Cross-user updates by `isTenantAdminOrManager` enforce `isValidRoleProfileCompatibility(request.resource.data)` whenever `role`, `operational_profile`, or `operationalProfile` is modified.
- **`/employees/{empId}`:**
  - `allow create`: Enforces `isTenantAdminOrManager(getBusinessId(request.resource.data)) && isValidRoleProfileCompatibility(request.resource.data)`.
  - `allow update`: Admin/Manager updates modifying `role`, `operational_profile`, or `operationalProfile` enforce `isValidRoleProfileCompatibility(request.resource.data)`. Employee self-updates explicitly deny modifying `operational_profile` and `operationalProfile` (alongside `role`, `permissions`, `salary`, `businessId`, etc.).
- **`/invitations/{inviteId}`:**
  - `allow create` / `allow update`: Enforce `isValidRoleProfileCompatibility(request.resource.data)` for tenant admins/managers.
- **`/internal_transfers/{id}`, `/cash_transfers/{id}`, `/teller_transactions/{id}`, `/customer_transfers/{id}`, `/idempotency_keys/{id}`, `/payout_idempotency_locks/{id}`:**
  - Remain strictly locked against all client SDK writes (`allow create, update, delete: if false;`), forcing all treasury transfers and approvals through the hardened Express server endpoints + Admin SDK engines.

---

## 2. VERIFICATION & KNOWN ENVIRONMENT LIMITATION

- **Static / Regex Verification:** Verified via `PhaseD4B24RulesHardening.test.ts`, `P0SecurityRemediation.test.ts`, `P0FinalHardeningInvitationClaims.test.ts`, `Vuln01SelfPrivilegeEscalation.test.ts`, `FirestoreRulesModGov8.test.ts`, and `RbacStep4OperationalProfileEnforcement.test.ts`.
- **Emulator Runtime Note:** Live Firestore Rules Emulator execution requires Java JRE (`which java`), which is absent in this container environment (`PhaseD4B24RulesHardening.test.ts` documents this prerequisite). Syntax and CEL expression semantics were verified by manual inspection and rule-structure assertions. Production deployment was strictly withheld pending review.
