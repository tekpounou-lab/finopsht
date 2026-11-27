# FINOPS P0 — Invitation Backend Authority Test Report

**Task ID:** `FINOPS-P0-API-FIRESTORE-REMEDIATION-01`  
**Modified Files:**
- `src/modules/identity/EnterpriseIdentityOrchestrator.ts`
- `src/modules/identity/IdentityContext.tsx`

**Backend Endpoints Verified:**
- `POST /api/invitations/accept` (`server.ts:1580` -> `InvitationService.acceptInvitation`)
- `POST /api/invitations/reject` (`server.ts:1687` -> `InvitationService.rejectInvitation`)
- `POST /api/invitations/reconcile-claims` (`server.ts:1655` -> `InvitationService.reconcileClaimsForUser`)

**Test Suites:**
- `src/tests/unit/security/P0ApiFirestoreRemediation.test.ts` — Fix E tests (3/3 passed — `PROVEN_UNIT`)
- `src/tests/unit/security/P0FinalHardeningInvitationClaims.test.ts` (9/9 passed — `PROVEN_UNIT`)

---

## 1. Root Cause Fixed

Previously, when `POST /api/invitations/accept` failed with HTTP `500`/`502`, `EnterpriseIdentityOrchestrator.acceptInvitation` fell back to client-side `InvitationRepository.acceptInvitation` Firestore writes, which Firestore rules rightly rejected with HTTP `403` because client users cannot self-assign `role`, `businessId`, or `employees` privilege bindings. In addition, `rejectInvitation` and `reconcileIdentityDocs` performed direct client Firestore mutations, and `IdentityContext.tsx` swallowed certain invitation errors instead of propagating them to callers.

---

## 2. Implemented Controls

1. **Zero Client Fallback in `acceptInvitation` (`EnterpriseIdentityOrchestrator.ts:542-586`):**
   - Calls `POST /api/invitations/accept` with Firebase ID Bearer token.
   - Any non-`2xx` HTTP response parses the backend error message and throws directly; `InvitationRepository` fallback is completely removed.
2. **Backend Authority for `rejectInvitation` (`EnterpriseIdentityOrchestrator.ts:591-617`):**
   - Calls `POST /api/invitations/reject` with Bearer token instead of client `updateDoc(db, "invitations", ...)`.
3. **No Unauthorized Client Mutations in `migrateInvitationIfNeeded` & `reconcileIdentityDocs` (`EnterpriseIdentityOrchestrator.ts:804-839`):**
   - `migrateInvitationIfNeeded` is a client no-op.
   - `reconcileIdentityDocs` calls `POST /api/invitations/reconcile-claims` with Bearer token instead of writing `users` or `employees` privilege fields from the client SDK.
4. **Honest Error Propagation in `IdentityContext.tsx` (`lines 611-635`):**
   - Both `acceptInvitation` and `rejectInvitation` require an authenticated `user` (`throw new Error("AUTH_REQUIRED")`), set React error state on failure, and rethrow the error (`throw err;`).

---

## 3. Observed Test Results

| Test Case | Suite | Observed Result | Evidence Tag |
|---|---|---|---|
| `acceptInvitation` throws on HTTP `500` with zero client `setDoc`/`updateDoc` calls | `P0ApiFirestoreRemediation.test.ts` | PASSED (`Backend invitation error` thrown, 0 Firestore client writes) | `PROVEN_UNIT` |
| `rejectInvitation` posts to `/api/invitations/reject` with zero client `updateDoc` calls | `P0ApiFirestoreRemediation.test.ts` | PASSED (`fetch` called with `POST /api/invitations/reject`, 0 Firestore client writes) | `PROVEN_UNIT` |
| `IdentityContext.tsx` rethrows `acceptInvitation` and `rejectInvitation` errors | `P0ApiFirestoreRemediation.test.ts` | PASSED (`throw err;` verified) | `PROVEN_STATIC` |
| Full backend invitation lookup, acceptance, rejection, and custom claims sync API | `P0FinalHardeningInvitationClaims.test.ts` | PASSED (9/9 tests on `createApp()` HTTP endpoints) | `PROVEN_INTEGRATION` |
