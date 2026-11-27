# INCIDENT B — INVITATION ACCEPTANCE HTTP 500 -> CLIENT FALLBACK HTTP 403 FORENSIC TRACE

**Audit ID:** `FINOPS-P0-API-FIRESTORE-INCIDENT-01`  
**Mode:** STRICT READ-ONLY  
**Observed Flow:** `POST /api/invitations/accept` returns HTTP 500 -> `EnterpriseIdentityOrchestrator` triggers client-side fallback -> Firestore commit returns HTTP 403 -> invitation acceptance fails.

---

## 1. PHASE 1 — WHY `POST /api/invitations/accept` RETURNS HTTP 500

1. **Client Request (`PROVEN_STATIC`):**
   - `EnterpriseIdentityOrchestrator.acceptInvitation(invitationId, user)` (`src/modules/identity/EnterpriseIdentityOrchestrator.ts:543-563`) calls `fetch("/api/invitations/accept", { method: "POST", headers: { Authorization: "Bearer " + idToken }, ... })`.
2. **Vercel Serverless Routing & Crash (`PROVEN_STATIC` + `PROVEN_RUNTIME`):**
   - `vercel.json:8-9` routes `/api/invitations/accept` -> `/api` (`api/index.ts`).
   - `/api/index.ts` imports `../server` (`server.ts`) and executes inside the **exact same broken Vercel `@vercel/node` bundle** documented in `FINOPS_P0_BI_ADVISOR_500_TRACE.md` (ESM extensionless imports, browser `firebase.ts` `import.meta.env` / SDK initialization at module load, and Vercel Admin credential mismatch).
   - Just like `/api/cfo/analyze`, `PhaseD1AuthMultiTenant.test.ts` (tests 6 & 8, `PROVEN_UNIT`) proves the `server.ts:1575-1647` handler and `InvitationService.acceptInvitation` work cleanly in isolation when `createApp()` loads in Node/Vitest with valid Firestore/Auth.
3. **Additional Server-Side Defect Inside `InvitationService.ts` (`PROVEN_STATIC`):**
   - Even if `/api/index.ts` boots, `src/services/business/InvitationService.ts:443-559` has a broken catch block:
     - Line 445 checks `if (errMsg.includes("PERMISSION_DENIED") || adminErr?.code === 7 || ...)`.
     - Line 447 dynamically imports `../../lib/firebase` (the **client Web SDK**, which has **no signed-in `auth.currentUser`** inside the Node serverless process!) and executes `clientRunTransaction(clientDb, ...)` at line 450.
     - That unauthenticated client write from Node triggers Firestore `PERMISSION_DENIED`, which bubbles to `server.ts:1619-1646` and falls through to line 1645: `res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to accept invitation." })`.

---

## 2. PHASE 2 — WHY THE CLIENT-SIDE FALLBACK DETERMINISTICALLY RETURNS HTTP 403

When `response.status === 500 || response.status === 502`, `EnterpriseIdentityOrchestrator.acceptInvitation` (`src/modules/identity/EnterpriseIdentityOrchestrator.ts:574-591`) intentionally triggers a client-side fallback:

```ts
// src/modules/identity/EnterpriseIdentityOrchestrator.ts:574-581
if (response.status === 500 || response.status === 502) {
  await InvitationRepository.acceptInvitation(invitationId, { ... });
}
```

Inside `InvitationRepository.acceptInvitation` (`src/repositories/InvitationRepository.ts:274-392`), the client executes `runTransaction(db, async (transaction) => { ... })` attempting **three simultaneous Firestore mutations** as the invited end-user (who does **not** yet belong to the target business and is **not** an `OWNER` / `ADMIN` / `MANAGER` / `SUPER_ADMIN`).

**Every single one of these three writes violates `firestore.rules` (`PROVEN_STATIC`):**

### Write 1 — Update `invitations/{invitationId}` (`InvitationRepository.ts:337-342`)
- **Client Payload:** `{ status: "ACCEPTED", acceptedAt: nowIso, uid: user.uid, updatedAt: serverTimestamp() }`.
- **Rule Evaluated (`firestore.rules:700-703`):**
  ```javascript
  allow update: if isAuthenticated() && (
    isSuperAdmin() || 
    (isTenantAdminOrManager(getBusinessId(resource.data)) && (...))
  );
  ```
- **Outcome:** **HTTP 403 `PERMISSION_DENIED`**. The invited recipient is neither `SUPER_ADMIN` nor `isTenantAdminOrManager` of the inviting business.

### Write 2 — Create/Merge `employees/{empId}` (`InvitationRepository.ts:345-365`)
- **Client Payload:** Sets `id`, `uid`, `firebase_uid`, `email`, `normalizedEmail`, `businessId`, `business_id`, `branchId`, `departmentId`, `status: "ACTIVE"`, `isActive: true`, `role`, `operational_profile`, etc.
- **Rule Evaluated (`firestore.rules:663-683`):**
  - **If `employees/{empId}` does not exist (`create`, lines 663-666):**
    `allow create` requires `isSuperAdmin() || (isTenantAdminOrManager(getBusinessId(request.resource.data)) && isValidRoleProfileCompatibility(...))`. **DENIED (HTTP 403)**.
  - **If `employees/{empId}` was pre-created (`update`, lines 667-683):**
    Self-update explicitly rejects changes to any of:
    `'businessId', 'business_id', 'role', 'permissions', 'salary', 'baseSalary', 'salary_base_htg', 'status', 'isActive', 'firebase_uid', 'uid', 'email', 'normalizedEmail', 'branchId', 'branch_id', 'departmentId', 'department_id', 'operational_profile', 'operationalProfile'`.
    `InvitationRepository.ts:345-364` writes nearly all of these restricted fields -> **DENIED (HTTP 403)**.
  - *(Note also: even reading `employees/{empId}` at line 306 hits the `resource == null` `batchGet` 403 bug in `firestore.rules:651-662` if `empId` doesn't exist yet!)*

### Write 3 — Create/Merge `users/{uid}` (`InvitationRepository.ts:368-391`)
- **Client Payload:** Sets `employeeId`, `employee_id`, `businessId`, `business_id`, `branchId`, `departmentId`, `role`, `operational_profile`, `accountStatus: "ACTIVE"`, `account_status: "ACTIVE"`, `businessStatus: "ACTIVE"`, `business_status: "ACTIVE"`, `onboardingComplete: true`, `onboarding_completed: true`.
- **Rule Evaluated (`firestore.rules:353-420`):**
  - **If `users/{uid}` does not exist (`create`, lines 353-371):** Requires `role` to be `'EMPLOYEE'` or `''`, **forbids** `'operational_profile'`/`'operationalProfile'`, and requires `businessId`/`business_id` to be empty `''`. **DENIED (HTTP 403)**.
  - **If `users/{uid}` already exists (`update`, lines 372-419):**
    1. `affectedKeys().hasOnly([...])` (lines 376-395) **excludes** `'employeeId'`, `'employee_id'`, `'businessId'`, `'business_id'`, `'branchId'`, `'departmentId'`, `'role'`, `'operational_profile'`, `'operationalProfile'`, `'businessStatus'`, `'business_status'`. **DENIED (HTTP 403)**.
    2. Lines 397-401 explicitly restrict `account_status` and `accountStatus` on self-update to `['NEW_USER', 'PENDING_MEMBER', 'PENDING_OWNER', 'WAITING_APPROVAL']`. Setting `"ACTIVE"` is **DENIED (HTTP 403)**.

---

## 3. SECONDARY CLIENT-SIDE 403 & SCHEMA DRIFT DEFECTS IN ORCHESTRATOR (`PROVEN_STATIC`)

Even outside `InvitationRepository.acceptInvitation`, `EnterpriseIdentityOrchestrator` contains two legacy client-side repair routines that also violate hardened `firestore.rules`:
1. **`migrateInvitationIfNeeded` (`EnterpriseIdentityOrchestrator.ts:832-866`):** Calls `updateDoc` on `invitations/{id}` (forbidden by `firestore.rules:700-703`) and `employees/{id}` setting `email`, `normalizedEmail`, `uid` (all in the forbidden `hasAny([...])` list at `firestore.rules:679`).
2. **`reconcileIdentityDocs` (`EnterpriseIdentityOrchestrator.ts:872-937`):** Calls `batch.commit()` setting `employeeId`, `businessId`, `businessStatus`, `role`, `accountStatus: "ACTIVE"` on `users/{uid}` (forbidden by `firestore.rules:376-401`) and `uid`, `email`, `businessId` on `employees/{id}` (forbidden by `firestore.rules:677-681`).
3. **Fallback vs Server Schema Drift (`PROVEN_STATIC`):**
   - `InvitationService.ts:360-405` (authoritative server path) sets `acceptedByUid`, creates `memberships/{businessId}_{uid}`, creates `employees/emp_*` with random ID, and calls `auth.setCustomUserClaims(user.uid, { business_id, businessId, role })`.
   - `InvitationRepository.ts:300, 337-391` (client fallback) writes `uid` (not `acceptedByUid`), uses `emp_${user.uid}` when `employee_id` is absent, creates **no** `memberships` document, and sets **no** Custom Claims.

---

## 4. ARCHITECTURAL ASSESSMENT

`firestore.rules` denying `InvitationRepository.acceptInvitation` is an **intended, mandatory security control** (`Phase D` RBAC / tenant-binding hardening preventing arbitrary users from forging their own `role`, `businessId`, and `ACTIVE` membership from the browser). The root failure is **Incident B's backend HTTP 500** breaking the authoritative `POST /api/invitations/accept` endpoint and forcing execution into an obsolete client fallback that can never succeed under hardened rules.
