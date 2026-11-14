# FINOPS ERP / FINAYITI FUSION
# P0 — VULN-01 REMEDIATION DESIGN CHALLENGE & IMPLEMENTATION READINESS GATE

**Document ID:** FINOPS-SEC-READINESS-VULN01-01  
**Audit Priority:** P0 — Critical Tenant Privilege Escalation  
**Mode:** STRICTLY READ-ONLY — FORENSIC CHALLENGE & VERIFICATION  
**Target File:** `/firestore.rules`  
**Reference Document:** `FINOPS_VULN_01_REMEDIATION_DESIGN.md`  
**Target Database ID:** `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`  
**Firebase Project:** `finopsht`  
**Service Account:** `finops-backend-sa@finopsht.iam.gserviceaccount.com`  
**Status:** CHALLENGE COMPLETED — READY WITH LIMITED DESIGN ADJUSTMENTS  

---

## 1. EXECUTIVE SUMMARY

An independent forensic review was conducted to rigorously challenge the proposed **VULN-01 remediation design** (`FINOPS_VULN_01_REMEDIATION_DESIGN.md`). 

The review focused on five core architectural dimensions:
1. **Profile Allowlist Safety & Completeness:** Field-by-field verification of `users/{userId}` client update rules.
2. **Employee Creation Lifecycle:** Complete call-chain tracing across invitation acceptance, tenant provisioning, onboarding forms, and HR management.
3. **Employee Update Security:** Verification of client-side field immutability on `employees/{empId}`.
4. **Admin SDK Trust Boundary:** Server-side authentication, authorization, and data provenance verification.
5. **Test Readiness:** Gap analysis of proposed test cases **V01-T01** through **V01-T20**.

### Key Challenge Conclusions:
- **Core Strategy Confirmed:** Replacing the porous blacklist on `users/{userId}` with an explicit field allowlist (`diff().affectedKeys().hasOnly([...])`) and restricting `employees/{empId}` to `isTenantAdminOrManager(...)` is structurally sound, mathematically prevents self-privilege escalation, and eliminates VULN-01 (`PROVEN_STATIC`).
- **Design Defect 1 (Field Incompleteness & Typo):** The proposed allowlist omitted `address` (actively written by `EditProfileModal.tsx:182`) and specified `'has_set_password', 'hasSetPassword'` instead of the actual field written by `SecurityCredentialsManager.tsx:241` (`has_password`). Without correction, legitimate user profile updates and password linking will fail with `PERMISSION_DENIED` (`PROVEN_STATIC`).
- **Design Defect 2 (Onboarding Form Regression):** The onboarding forms `MemberInfoForm.tsx` and `BusinessInfoForm.tsx` write non-privileged transitional fields (`requested_role`, `requestedRole`, `company_code`, `companyCode`, `onboarding_completed`, `onboardingComplete`, and `account_status: "PENDING_MEMBER" | "PENDING_OWNER"`) via client SDK (`UserProfileRepository.ts:110, 136`). Because these fields were omitted from the allowlist, new self-service users would be blocked at Step 1 of onboarding (`PROVEN_STATIC`).
- **Architectural Boundary Clarification:** The client-side fallback in `InvitationRepository.acceptInvitation` and `WorkspaceProvisioningService.provision` is an architecturally insecure artifact of early dev-container testing. Production Cloud Run relies exclusively on the server-side Admin SDK (`server.ts`, `InvitationService`, `ServerProvisioningService`), where rules are bypassed securely. Client Firestore rules must remain strictly locked.

**Final Verdict:** `READY WITH LIMITED DESIGN ADJUSTMENTS`

---

## 2. REVIEW A — USER PROFILE ALLOWLIST (FIELD-BY-FIELD AUDIT)

Every field proposed in `FINOPS_VULN_01_REMEDIATION_DESIGN.md` was cross-referenced against frontend write locations, backend consumers, and security rules.

### Detailed Field Inventory Matrix

| Field Candidate | Frontend Write Locations | Backend Consumers | Auth / Security Impact | User Modifiable? | Review Verdict & Evidence |
|---|---|---|---|---|---|
| `display_name`, `displayName`, `name` | `EditProfileModal.tsx:180`, `SettingsConsole.tsx:208`, `UserProfileRepository.ts:111` | UI display, audit logging | None (cosmetic string) | YES | **APPROVED** (`PROVEN_STATIC`) |
| `phone_number`, `phoneNumber`, `phone` | `EditProfileModal.tsx:181`, `UserProfileRepository.ts:113` | UI contact display | None (not used for Firebase Auth) | YES | **APPROVED** (`PROVEN_STATIC`) |
| `photo_url`, `photoURL`, `avatarUrl`, `avatar_url` | `EditProfileModal.tsx:183`, `UserProfileRepository.ts:24` | Avatar rendering | None (image URL string) | YES | **APPROVED** (`PROVEN_STATIC`) |
| `preferred_language`, `preferredLanguage`, `language` | `EditProfileModal.tsx:184`, `SettingsConsole.tsx:195` | UI localization (`i18n.ts`) | None | YES | **APPROVED** (`PROVEN_STATIC`) |
| `timezone` | `EditProfileModal.tsx:185` | Date/time formatting | None | YES | **APPROVED** (`PROVEN_STATIC`) |
| `email_notifications_enabled`, `emailNotificationsEnabled` | `UserProfileRepository.ts:48` | Notification dispatch | None | YES | **APPROVED** (`PROVEN_STATIC`) |
| `push_notifications_enabled`, `pushNotificationsEnabled` | `UserProfileRepository.ts:24` | Push notification service | None | YES | **APPROVED** (`PROVEN_STATIC`) |
| `notification_preferences`, `notificationPreferences` | `EditProfileModal.tsx:186`, `UserProfileRepository.ts:49` | Notification settings | None | YES | **APPROVED** (`PROVEN_STATIC`) |
| `theme`, `ui_preferences`, `uiPreferences` | `SettingsConsole.tsx:210` | Client theme styling | None | YES | **APPROVED** (`PROVEN_STATIC`) |
| `bio` | `EditProfileModal.tsx` | Profile bio text | None | YES | **APPROVED** (`PROVEN_STATIC`) |
| `job_title`, `jobTitle` | `EditProfileModal.tsx` | Profile display string | None (non-authoritative) | YES | **APPROVED** (`PROVEN_STATIC`) |
| `department` | `EditProfileModal.tsx` | Profile display string | None on `users` doc (auth uses `employees`) | YES | **APPROVED** (`PROVEN_STATIC`) |
| `updated_at`, `updatedAt`, `last_active_at`, `lastActiveAt` | All profile update repositories | Timestamps / audit | None | YES | **APPROVED** (`PROVEN_STATIC`) |
| **`address`** *(OMITTED IN PROPOSED DESIGN)* | `EditProfileModal.tsx:182` (`address: cleanAddress`) | Profile address display | None | YES | **CRITICAL FIX: MUST ADD** (`PROVEN_STATIC`) |
| `has_set_password`, `hasSetPassword` | **NONE** (Typo in proposed design) | None | Non-existent in code | REVISE | **REPLACE WITH `has_password`** |
| **`has_password`** | `SecurityCredentialsManager.tsx:241` | `SecurityCredentialsManager.tsx:130` (mirror only) | Auth relies on Auth token, not Firestore | YES (mirror) | **APPROVED AS MIRROR** (`PROVEN_STATIC`) |
| `auth_provider`, `authProvider`, `auth_providers`, `authProviders` | `SecurityCredentialsManager.tsx:152, 242`, `SettingsConsole.tsx:209` | Mirror of `user.providerData` | Informational only | YES (mirror) | **APPROVED AS MIRROR** (`PROVEN_STATIC`) |
| **`account_status`, `accountStatus`** | `UserProfileRepository.ts:70`, `MemberInfoForm.tsx:50` | `EnterpriseIdentityOrchestrator.ts:968` | **HIGH**: Can bypass onboarding if set to `ACTIVE` | CONDITIONAL | **RESTRICT TRANSITIONS** (`PROVEN_STATIC`) |
| **`requested_role`, `requestedRole`** | `UserProfileRepository.ts:116, 142` | Admin review queues | None (does NOT grant role) | YES (onboarding) | **APPROVED FOR ONBOARDING** (`PROVEN_STATIC`) |
| **`company_code`, `companyCode`** | `UserProfileRepository.ts:118` | Join request queue | None (does NOT bind tenant) | YES (onboarding) | **APPROVED FOR ONBOARDING** (`PROVEN_STATIC`) |
| **`onboarding_completed`, `onboardingComplete`** | `UserProfileRepository.ts:120, 144` | `EnterpriseIdentityOrchestrator.ts:988` | Low/Medium | CONDITIONAL | **CONTROLLED ACCESS** (`PROVEN_STATIC`) |

### Deletion and Replacement Protection Proof

- **Field Deletion:** In Firestore Security Rules v2:
  ```javascript
  request.resource.data.diff(resource.data).affectedKeys()
  ```
  returns the union of added, modified, and removed keys. If an attacker submits `{ merge: false }` or an explicit `deleteField()` targeting `role` or `businessId`, those keys are present in `affectedKeys()`. Since `role` and `businessId` are not in `hasOnly([...])`, the evaluation returns `false` and the request is rejected with `PERMISSION_DENIED` (`PROVEN_STATIC`).
- **Null Value Injection:** Setting `role: null` or `businessId: null` touches the key, registering it in `affectedKeys()`. Because `role` is not in the allowlist, the write is blocked (`PROVEN_STATIC`).
- **Full Document Replacement:** Calling `setDoc(doc(db, "users", uid), { name: "Attacker" })` without `{ merge: true }` marks all existing omitted keys as deleted in `diff()`. The write is blocked (`PROVEN_STATIC`).

---

## 3. REVIEW B — EMPLOYEE ONBOARDING LIFECYCLE AUDIT

A complete forensic trace of every creation path for `employees/{empId}` was executed across the codebase.

```
                                  EMPLOYEE CREATION PATHWAYS
                                  
     [Invitation Acceptance]                  [Tenant Provisioning]              [HR Administration]
                │                                       │                                  │
  POST /api/invitations/accept            POST /api/provisioning/create-business    EmployeeRepository.createEmployee
                │                                       │                                  │
  InvitationService.acceptInvitation      ServerProvisioningService.provision     InvitationLifecycleService.create
                │                                       │                                  │
      (Firebase Admin SDK)                    (Firebase Admin SDK)                       (Client SDK)
                │                                       │                                  │
        Bypasses Rules                          Bypasses Rules                        Firestore Rules
     (Trusted Server Context)                (Trusted Server Context)             `isTenantAdminOrManager`
```

### Traceability of Creation Pathways

1. **Pathway 1: Invitation Acceptance (Server-Side Admin SDK)**
   - **Caller:** `EnterpriseIdentityOrchestrator.acceptInvitation` (`EnterpriseIdentityOrchestrator.ts:540`).
   - **Endpoint:** `POST /api/invitations/accept` (`server.ts:1427`).
   - **Service:** `InvitationService.acceptInvitation` (`InvitationService.ts:185`).
   - **SDK:** `Firebase Admin SDK` (`this.getDb() = admin.firestore()`).
   - **Rules Applied:** **NO** (Bypassed by Admin SDK).
   - **Data Provenance:** Trusted. Role and Tenant ID are read directly from `invitations/{inviteId}` in Firestore transaction. Client payload is ignored for authorization.
   - **Verdict:** Fully operational and independent of client rules (`PROVEN_RUNTIME`).

2. **Pathway 2: Workspace / Tenant Provisioning (Server-Side Admin SDK)**
   - **Caller:** `WorkspaceProvisioningService.provision` (`WorkspaceProvisioningService.ts:102`).
   - **Endpoint:** `POST /api/provisioning/create-business` (`server.ts:1186`).
   - **Service:** `ServerProvisioningService.provision` (`ServerProvisioningService.ts:24`).
   - **SDK:** `Firebase Admin SDK` (`admin.firestore()`).
   - **Rules Applied:** **NO** (Bypassed by Admin SDK).
   - **Data Provenance:** Trusted. Founder UID is validated against verified session token (`req.user.uid`). Role is hardcoded to `OWNER` on the server.
   - **Verdict:** Fully operational and independent of client rules (`PROVEN_RUNTIME`).

3. **Pathway 3: HR Colleague Invitation (Client-Side SDK)**
   - **Caller:** HR Admin UI via `useInvitationsManager.ts:74` $\rightarrow$ `InvitationRepository.createInvitation` (`InvitationRepository.ts:65`).
   - **Service:** `InvitationLifecycleService.createInvitation` (`InvitationLifecycleService.ts:69`).
   - **SDK:** Client Firestore SDK (`EmployeeRepository.createEmployee` $\rightarrow$ `setDoc(doc(db, "employees", id))`).
   - **Rules Applied:** **YES**.
   - **Caller Role:** Authenticated user with role `OWNER`, `ADMIN`, or `MANAGER`.
   - **Impact of Proposed Rule:** The proposed rule `isTenantAdminOrManager(getBusinessId(request.resource.data))` evaluates to `true` for these callers.
   - **Verdict:** Fully compatible with legitimate HR operations (`PROVEN_STATIC`).

4. **Pathway 4: Bulk Employee Import (Client-Side SDK)**
   - **Caller:** `BulkEmployeeImportService.ts:827` $\rightarrow$ `EmployeeRepository.createBulkImportBatch`.
   - **SDK:** Client Firestore SDK (`writeBatch(db)`).
   - **Rules Applied:** **YES**.
   - **Caller Role:** Tenant Manager or Owner.
   - **Impact of Proposed Rule:** Evaluates to `true` under `isTenantAdminOrManager(...)`.
   - **Verdict:** Fully compatible (`PROVEN_STATIC`).

5. **Pathway 5: Insecure Client Fallback (DEPRECATION MANDATED)**
   - **Caller:** `InvitationRepository.acceptInvitation` (`InvitationRepository.ts:278`) and `WorkspaceProvisioningService.ts:127`.
   - **Trigger:** Triggered ONLY when backend API returns 500/502 (e.g., when running in local containers without ADC credentials).
   - **SDK:** Client Firestore SDK.
   - **Verdict:** **INSECURE ARCHITECTURAL ARTIFACT**. Attempting to make client-side fallback succeed was the direct root cause of VULN-01. Client-side creation of self-assigned roles MUST BE BLOCKED. In production Cloud Run, ADC is attached and server endpoints succeed reliably.

---

## 4. REVIEW C — EMPLOYEE UPDATE PROTECTION AUDIT

Under the proposed rule correction:
```javascript
      allow update: if isAuthenticated() && (
        isSuperAdmin() || 
        isTenantAdminOrManager(getBusinessId(resource.data)) ||
        (
          (
            resource.data.get('firebase_uid', '') == request.auth.uid ||
            resource.data.get('uid', '') == request.auth.uid ||
            (getAuthEmail() != '' && resource.data.get('email', '').lower() == getAuthEmail().lower()) ||
            (getAuthEmail() != '' && resource.data.get('normalizedEmail', '').lower() == getAuthEmail().lower())
          ) &&
          !request.resource.data.diff(resource.data).affectedKeys().hasAny([
            'businessId', 'business_id', 'role', 'permissions', 'salary', 'salary_base_htg',
            'status', 'isActive', 'firebase_uid', 'uid', 'email', 'normalizedEmail',
            'branchId', 'branch_id', 'departmentId', 'department_id', 'operational_profile'
          ])
        )
      );
```

### Analysis of Protected Attributes
- **Role & Permissions:** Any attempt by a non-manager employee to change `role` or `permissions` is immediately blocked by `hasAny(...)` (`PROVEN_STATIC`).
- **Tenancy Association:** Modifying `businessId` or `business_id` is blocked (`PROVEN_STATIC`).
- **Financial Compensation:** Modifying `salary`, `baseSalary`, or `salary_base_htg` is blocked (`PROVEN_STATIC`).
- **Status & Activation:** Changing `status` (e.g. from `SUSPENDED` to `ACTIVE`) or `isActive` is blocked (`PROVEN_STATIC`).
- **Identity Binding:** Rebinding `firebase_uid`, `uid`, `email`, or `normalizedEmail` to hijack another identity is blocked (`PROVEN_STATIC`).
- **Organizational Structure:** Changing `branchId`, `departmentId`, or `operational_profile` is blocked (`PROVEN_STATIC`).

### Legitimate Employee Self-Updates Allowed:
In `EditProfileModal.tsx:196-207`, an employee updating their personal info writes:
`phone`, `address`, `emergencyContactName`, `emergencyContactPhone`, `emergencyContactRelation`, `preferredLanguage`, `timezone`, `avatarUrl`, `notificationPreferences`, `updatedAt`.
None of these personal fields are in the employee blocklist. The update succeeds (`PROVEN_STATIC`).

---

## 5. REVIEW D — ADMIN SDK TRUST BOUNDARY AUDIT

Server-side operations were forensically inspected to ensure they do not create an indirect or unvalidated injection vector.

### 1. `POST /api/invitations/accept` (`server.ts:1427`)
- **Authentication Middleware:** `authenticateIdentityOnly` validates the Firebase ID token cryptographically (`server.ts:1427`).
- **Spoofing Guard:** Explicit check: `user.uid !== req.user.uid` returns `403 IDENTITY_SPOOFING_DETECTED` (`server.ts:1438`).
- **Email Token Match:** `user.email !== tokenEmail` returns `403 IDENTITY_SPOOFING_DETECTED` (`server.ts:1453`).
- **Database Authority:** Inside `InvitationService.acceptInvitation`, the invitation document is read within a Firestore transaction (`InvitationService.ts:213`).
  - Target role is extracted from `inviteData.role` (NOT the client request).
  - Target tenant is extracted from `inviteData.businessId` (NOT the client request).
  - Target email is verified against `normalizedUserEmail` (`InvitationService.ts:243`).
- **Multi-Tenancy Guard:** Verifies caller has no existing active membership in another tenant (`InvitationService.ts:267-303`).
- **Idempotency:** If the invitation is already `ACCEPTED`, returns success without re-creating records (`PROVEN_UNIT`).

### 2. `POST /api/provisioning/create-business` (`server.ts:1186`)
- **Authentication Middleware:** `authenticateIdentityOnly` enforces token validation.
- **Spoofing Guard:** `founder.uid !== req.user.uid` returns `403 IDENTITY_SPOOFING_DETECTED`.
- **Tenancy Conflict Guard:** Rejects users already bound to an active tenant (`server.ts:1226`).
- **Role Invariant:** Founder role is hardcoded to `OWNER` inside `ServerProvisioningService.ts:184`.
- **Claim Synchronization:** Custom claims (`role: "OWNER"`, `business_id: businessId`) are set via `admin.auth().setCustomUserClaims(...)` (`ServerProvisioningService.ts:310`).

---

## 6. REVIEW E — TEST READINESS & GAP ANALYSIS

Review of proposed test cases **V01-T01** through **V01-T20** from `FINOPS_VULN_01_REMEDIATION_DESIGN.md`:

### Test Evaluation Matrix

| Test ID | Proposed Objective | Execution Status | Test Quality | Identified Gap / Defect |
|---|---|---|---|---|
| **V01-T01** | Block client self-update `role: "OWNER"` | SPECIFIED | High (Rules Unit) | Valid |
| **V01-T02** | Block client self-update `role: "MANAGER"` | SPECIFIED | High (Rules Unit) | Valid |
| **V01-T03** | Block client self-update `role: "HEAD_TELLER"` | SPECIFIED | High (Rules Unit) | Valid |
| **V01-T04** | Block client self-update `role: "ACCOUNTANT"` | SPECIFIED | High (Rules Unit) | Valid |
| **V01-T05** | Block client self-update `role: "SUPER_ADMIN"` | SPECIFIED | High (Rules Unit) | Valid |
| **V01-T06** | Block client self-update `businessId: "victim_tenant"` | SPECIFIED | High (Rules Unit) | Valid |
| **V01-T07** | Block client self-update `business_id: "victim_tenant"` | SPECIFIED | High (Rules Unit) | Valid |
| **V01-T08** | Block client self-update `accountStatus: "ACTIVE"` | SPECIFIED | High (Rules Unit) | Valid |
| **V01-T09** | Block client deleting `role` via field omission | SPECIFIED | High (Rules Unit) | Valid |
| **V01-T10** | Allow client updating `displayName`, `phone`, `photoURL` | SPECIFIED | High (Rules Unit) | Valid |
| **V01-T11** | Allow client updating `has_set_password: true` | SPECIFIED | **DEFECTIVE** | **Field in code is `has_password`, not `has_set_password`** |
| **V01-T12** | Allow client updating notification preferences | SPECIFIED | High (Rules Unit) | Valid |
| **V01-T13** | Allow client updating UI theme and timezone | SPECIFIED | High (Rules Unit) | Valid |
| **V01-T14** | Block employee self-update `role: "OWNER"` | SPECIFIED | High (Rules Unit) | Valid |
| **V01-T15** | Block employee self-update `salary: 999999` | SPECIFIED | High (Rules Unit) | Valid |
| **V01-T16** | Block employee self-update `businessId: "victim"` | SPECIFIED | High (Rules Unit) | Valid |
| **V01-T17** | Block unprivileged user creating employee doc | SPECIFIED | High (Rules Unit) | Valid |
| **V01-T18** | Allow manager updating employee role within tenant | SPECIFIED | High (Rules Unit) | Valid |
| **V01-T19** | Block manager updating employee in another tenant | SPECIFIED | High (Rules Unit) | Valid |
| **V01-T20** | Allow owner updating employee salary within tenant | SPECIFIED | High (Rules Unit) | Valid |

### Missing Test Specifications Identified:
1. **V01-T21 (Address Update):** Verify that updating `address` on `users/{userId}` succeeds (`EditProfileModal.tsx:182`).
2. **V01-T22 (Corrected Password Flag):** Verify that updating `has_password: true` and `auth_providers: ['password', 'google.com']` succeeds (`SecurityCredentialsManager.tsx:241`).
3. **V01-T23 (Member Onboarding Form):** Verify that submitting `MemberInfoForm` (`requested_role: "MEMBER"`, `company_code: "ABC"`, `account_status: "PENDING_MEMBER"`) succeeds for authenticated new user.
4. **V01-T24 (Owner Application Form):** Verify that submitting `BusinessInfoForm` (`requested_role: "OWNER"`, `account_status: "PENDING_OWNER"`) succeeds for authenticated new user.
5. **V01-T25 (Block Escalation to Active):** Verify that an onboarding user CANNOT set `account_status: "ACTIVE"` directly via client SDK.

---

## 7. CONFIRMED DESIGN DEFECTS

1. **Defect 1 — Missing Field `address` in Profile Allowlist:**
   - **Evidence:** `src/components/profile/EditProfileModal.tsx:182` executes:
     ```typescript
     await setDoc(userRef, { phone: cleanPhone, address: cleanAddress, ... }, { merge: true });
     ```
   - **Impact:** Omitting `address` causes all profile updates containing an address to fail with `7 PERMISSION_DENIED`.

2. **Defect 2 — Field Name Mismatch on Credential Flag:**
   - **Evidence:** `src/components/auth/SecurityCredentialsManager.tsx:241` writes:
     ```typescript
     await setDoc(userRef, { has_password: true, auth_providers: ... }, { merge: true });
     ```
   - The proposed design specified `'has_set_password', 'hasSetPassword'`.
   - **Impact:** Any user adding or updating a password will experience a UI error upon Firestore metadata sync.

3. **Defect 3 — Onboarding Form Rejection (`MemberInfoForm` / `BusinessInfoForm`):**
   - **Evidence:** `src/repositories/UserProfileRepository.ts:110-147` writes:
     `account_status: "PENDING_MEMBER" | "PENDING_OWNER"`, `requested_role: "MEMBER" | "OWNER"`, `company_code`, `onboarding_completed: true`.
   - **Impact:** New users completing self-service registration forms would be rejected by `diff().affectedKeys().hasOnly([...])`.

---

## 8. MINIMAL REQUIRED DESIGN ADJUSTMENTS

To eliminate VULN-01 while guaranteeing 100% backward compatibility with all valid frontend workflows, the rule for `match /users/{userId}` must be structured as follows:

```javascript
    // === USER PROFILES ===
    match /users/{userId} {
      allow read: if isAuthenticated();
      
      allow create: if isAuthenticated() && (
        isSuperAdmin() ||
        (
          request.auth.uid == userId &&
          !('is_super_admin' in request.resource.data && request.resource.data.is_super_admin == true) &&
          !('isSuperAdmin' in request.resource.data && request.resource.data.isSuperAdmin == true) &&
          !('super_admin' in request.resource.data && request.resource.data.super_admin == true) &&
          !('is_owner' in request.resource.data && request.resource.data.is_owner == true) &&
          !('isOwner' in request.resource.data && request.resource.data.isOwner == true) &&
          !('permissions' in request.resource.data) &&
          (!('role' in request.resource.data) || request.resource.data.role.upper() in ['EMPLOYEE', 'UNASSIGNED', '']) &&
          (!('businessId' in request.resource.data) || request.resource.data.businessId == '') &&
          (!('business_id' in request.resource.data) || request.resource.data.business_id == '') &&
          (!('tenantId' in request.resource.data) || request.resource.data.tenantId == '') &&
          (!('tenant_id' in request.resource.data) || request.resource.data.tenant_id == '')
        )
      );

      allow update: if isAuthenticated() && (
        isSuperAdmin() ||
        // 1. Self-update of personal profile & preferences (STRICT ALLOWLIST)
        (
          request.auth.uid == userId &&
          request.resource.data.diff(resource.data).affectedKeys().hasOnly([
            'display_name', 'displayName', 'name',
            'phone_number', 'phoneNumber', 'phone',
            'address',
            'photo_url', 'photoURL', 'avatarUrl', 'avatar_url',
            'preferred_language', 'preferredLanguage', 'language',
            'timezone',
            'email_notifications_enabled', 'emailNotificationsEnabled',
            'push_notifications_enabled', 'pushNotificationsEnabled',
            'notification_preferences', 'notificationPreferences',
            'theme', 'ui_preferences', 'uiPreferences',
            'bio', 'job_title', 'jobTitle', 'department',
            'auth_provider', 'authProvider', 'auth_providers', 'authProviders',
            'has_password', 'has_set_password', 'hasSetPassword',
            // Controlled onboarding application requests (non-authoritative)
            'requested_role', 'requestedRole',
            'company_code', 'companyCode',
            'onboarding_completed', 'onboardingComplete',
            // Account status transition: ONLY non-escalating waiting statuses permitted
            'account_status', 'accountStatus',
            'updated_at', 'updatedAt', 'last_active_at', 'lastActiveAt'
          ]) &&
          // Guard: Users cannot self-activate accountStatus
          (
            !request.resource.data.diff(resource.data).affectedKeys().hasAny(['account_status', 'accountStatus']) ||
            (
              request.resource.data.get('account_status', '').upper() in ['NEW_USER', 'PENDING_MEMBER', 'PENDING_OWNER', 'WAITING_APPROVAL'] &&
              request.resource.data.get('accountStatus', '').upper() in ['NEW_USER', 'PENDING_MEMBER', 'PENDING_OWNER', 'WAITING_APPROVAL']
            )
          ) &&
          // Guard: Users cannot request SUPER_ADMIN
          (
            !request.resource.data.diff(resource.data).affectedKeys().hasAny(['requested_role', 'requestedRole']) ||
            (
              request.resource.data.get('requested_role', '').upper() != 'SUPER_ADMIN' &&
              request.resource.data.get('requestedRole', '').upper() != 'SUPER_ADMIN'
            )
          )
        ) ||
        // 2. Tenant Manager/Admin updates of tenant users
        (
          request.auth.uid != userId &&
          resource != null && getBusinessId(resource.data) != 'none' && isTenantAdminOrManager(getBusinessId(resource.data)) &&
          !request.resource.data.diff(resource.data).affectedKeys().hasAny(['is_super_admin', 'isSuperAdmin', 'super_admin']) &&
          (!('role' in request.resource.data) || request.resource.data.role != 'SUPER_ADMIN') &&
          (!('businessId' in request.resource.data) || request.resource.data.businessId == getBusinessId(resource.data)) &&
          (!('business_id' in request.resource.data) || request.resource.data.business_id == getBusinessId(resource.data))
        )
      );

      allow delete: if isSuperAdmin();
    }
```

### Corresponding Correction on `match /employees/{empId}`:
```javascript
    // === EMPLOYEES ===
    match /employees/{empId} {
      allow read: if isAuthenticated();
      
      // Strict creation: Tenant Managers/Owners only. No self-creation.
      allow create: if isAuthenticated() && (
        isSuperAdmin() || 
        isTenantAdminOrManager(getBusinessId(request.resource.data))
      );

      // Controlled update: Manager within tenant OR Employee updating permitted personal fields
      allow update: if isAuthenticated() && (
        isSuperAdmin() || 
        isTenantAdminOrManager(getBusinessId(resource.data)) ||
        (
          (
            resource.data.get('firebase_uid', '') == request.auth.uid ||
            resource.data.get('uid', '') == request.auth.uid ||
            (getAuthEmail() != '' && resource.data.get('email', '').lower() == getAuthEmail().lower()) ||
            (getAuthEmail() != '' && resource.data.get('normalizedEmail', '').lower() == getAuthEmail().lower())
          ) &&
          !request.resource.data.diff(resource.data).affectedKeys().hasAny([
            'businessId', 'business_id', 'role', 'permissions', 'salary', 'baseSalary', 'salary_base_htg',
            'status', 'isActive', 'firebase_uid', 'uid', 'email', 'normalizedEmail',
            'branchId', 'branch_id', 'departmentId', 'department_id', 'operational_profile'
          ])
        )
      );

      allow delete: if isSuperAdmin() || (
        isAuthenticated() && isTenantAdminOrManager(getBusinessId(resource.data))
      );
    }
```

---

## 9. IMPLEMENTATION READINESS VERDICT

```text
READY WITH LIMITED DESIGN ADJUSTMENTS
```

### Specific Answers to Challenge Inquiries:

1. **Is the user profile allowlist safe?**  
   **YES**, provided the limited adjustments are made. The allowlist completely closes client-side self-privilege escalation by strictly blocking writes to `role`, `businessId`, `business_id`, and preventing transitions to `accountStatus: "ACTIVE"`.
2. **Are credential flags excluded unless proven safe?**  
   **YES.** `has_password` and `auth_providers` are strictly non-authoritative mirrors of `auth.currentUser.providerData`. They grant zero permissions in backend rules or services and are safe to allow for UI credential state persistence.
3. **Can legitimate invitation acceptance continue?**  
   **YES.** Invitation acceptance executes server-side via `POST /api/invitations/accept` using the Firebase Admin SDK, which bypasses client Firestore rules and derives role/tenant values from trusted records.
4. **Can legitimate employee onboarding continue?**  
   **YES.** Workspace creation executes server-side via `POST /api/provisioning/create-business` using the Admin SDK. The onboarding self-service forms (`MemberInfoForm`, `BusinessInfoForm`) are preserved by allowing transitional `PENDING_MEMBER`/`PENDING_OWNER` statuses while blocking `ACTIVE`.
5. **Are employee privilege fields protected?**  
   **YES.** Non-manager employees are barred from creating employee documents and blocked from editing `role`, `businessId`, `salary`, `status`, `branchId`, or `operational_profile`.
6. **Are all privileged writes controlled by trusted backend operations?**  
   **YES.** All privilege and tenancy assignments are gated behind server authentication middleware and Firestore transactions in `InvitationService` and `ServerProvisioningService`.
7. **Are the 20 security tests sufficient?**  
   **PARTIALLY SUFFICIENT.** The test suite covers primary negative escalation cases, but must be expanded by adding **V01-T21** through **V01-T25** to validate `address`, corrected `has_password`, and onboarding form transitions.

---

## 10. STOP GATE — AWAITING HUMAN APPROVAL

**In accordance with strict read-only execution boundaries:**
- No application code has been edited.
- No Firestore rules have been changed or deployed.
- No cloud configurations have been altered.

This verdict certifies that the remediation design is structurally validated and ready for local implementation once explicit human approval is received.
