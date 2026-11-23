# FINOPS ERP / FINAYITI FUSION — P0 POST-DEPLOYMENT API 500 & FIRESTORE 403 FORENSIC AUDIT REPORT

**Audit ID:** `FINOPS-P0-API-FIRESTORE-INCIDENT-01`  
**Mode:** STRICT READ-ONLY FORENSIC AUDIT (Zero source, config, rule, IAM, or database modifications)  
**Target Firebase Project:** `finopsht`  
**Target Firestore Database:** `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`  
**Audit Date:** 2026-11-21  

---

## 1. EXECUTIVE SUMMARY & ARCHITECTURAL VERDICT

The production incidents observed after deployment are **NOT caused by a single root cause**, and they have **ZERO causal link** to the recent `OWNER` General Ledger authorization fix (`FINOPS-RBAC-OWNER-GENERAL-LEDGER-ACCESS`).

Instead, forensic inspection proves **four distinct, independent defect clusters** across three layers (Vercel serverless packaging/runtime, Firestore Security Rules null-resource evaluation, and un-scoped client background telemetry):

| Incident | Production Symptom | Root Cause Cluster | Evidence Classification |
| :--- | :--- | :--- | :--- |
| **A — BI Advisor API** | `POST /api/cfo/analyze` -> `HTTP 500: A server error has occurred` / `FUNCTION_INVOCATION_FAILED` (Vercel `iad1`, Request ID `284fw-1795280564074-1d876d98f4e7`); frontend falls back to `FinancialRatioEngine`. | **Cluster 1 (Vercel Serverless Packaging & Runtime Crash):** Native Node 22 ESM fails on extensionless imports in `api/index.ts:1` & `server.ts`, client browser SDK (`firebase/auth`, `firebase/firestore`, `idb`, `import.meta.env`) is pulled into `/api/index.ts` via `AICFOAuditService.ts:1 -> src/lib/firebase.ts`, and `firebaseAdmin.ts` ignores `.env.example`'s `FIREBASE_ADMIN_PRIVATE_KEY`/`FIREBASE_ADMIN_CLIENT_EMAIL`. | `PROVEN_STATIC`, `PROVEN_LOG` (prompt), `PROVEN_RUNTIME` (local `node`/`tsc`/`esbuild`), `BLOCKED` (live Vercel logs/env) |
| **B — Invitation Acceptance** | `POST /api/invitations/accept` -> HTTP 500 -> `EnterpriseIdentityOrchestrator` client fallback -> Firestore HTTP 403 -> acceptance fails. | **Cluster 1 + Cluster 2 (Broken Backend + Intentionally Forbidden Client Fallback):** Backend `/api/invitations/accept` runs inside the same crashed Vercel `/api/index.ts` function; the frontend fallback (`InvitationRepository.acceptInvitation`) then attempts 3 privileged mutations (`invitations` update, `employees` create/privilege-update, `users` role/tenant/`ACTIVE` status update) that `firestore.rules` explicitly denies to non-admin users. | `PROVEN_STATIC`, `PROVEN_LOG` (prompt), `PROVEN_UNIT` (`PhaseD1AuthMultiTenant.test.ts` on mocked Express) |
| **C1 — Health Snapshot 403s** | `enterprise_health_snapshots/JOB_ENGINE` & `MONITORING_SERVICE` writes denied (`Missing or insufficient permissions`). | **Cluster 3 (Missing Tenant Scope in Client Background Heartbeats):** `JobEngine.start()` (`JobEngine.ts:89-94`) and `MonitoringService.startReporting()` (`MonitoringService.ts:65-71`) omit `businessId` when calling `AdminRepository.reportHealth(...)`, causing `getBusinessId(request.resource.data)` to return `'none'` and fail `firestore.rules:1399` (`isTenantScoped('none') == false`). | `PROVEN_STATIC`, `PROVEN_LOG` (prompt) |
| **C2 — Firestore `batchGet` 403** | Firestore `:batchGet` RPC returns HTTP 403 (`Missing or insufficient permissions`). | **Cluster 4 (Null-Resource Evaluation Bug in `firestore.rules`):** ~60+ `match` blocks in `firestore.rules` evaluate `getBusinessId(resource.data)` on `allow read` without checking `resource != null` (or `resource == null`). On any `getDoc(...)` (`:batchGet`) for a non-existent document ID, Firestore Rules evaluate `resource.data` against `null`, crashing rule evaluation and returning HTTP 403 instead of `{ exists: false }`. | `PROVEN_STATIC`, `PROVEN_LOG` (prompt), `BLOCKED` (live Firestore Emulator — no Java JRE) |
| **D — Currency Rate Fallback** | `CurrencyRateRepository` falls back to `DEFAULT_RATE_GRID_VALUES`. | **Direct Downstream Consequence of Cluster 4 (`C2`):** `CurrencyRateRepository.getTodayRatesWithFallback` (`CurrencyRateRepository.ts:215-216`) runs `getDoc(doc(db, "daily_exchange_rate_grids", fx_grid_${businessId}_${todayStr}))` inside the same `try` block as the historical fallback query (`lines 237-245`). When today's doc does not exist, `firestore.rules:725` evaluates `resource.data` on `null`, throwing HTTP 403 (`batchGet`) **before** line 237 executes, skipping historical inheritance and jumping straight to `DEFAULT_RATE_GRID_VALUES`. | `PROVEN_STATIC`, `PROVEN_LOG` (prompt), `PROVEN_UNIT` (masked by `CurrencyRateRepository.test.ts:18` mock) |

---

## 2. EVIDENCE CLASSIFICATION INVENTORY

Every claim in this audit is strictly bounded by the following verification levels:

| Evidence Tag | Scope Verified in This Audit |
| :--- | :--- |
| `PROVEN_STATIC` | Direct inspection of `api/index.ts`, `vercel.json`, `package.json`, `tsconfig.json`, `.env.example`, `firebase-applet-config.json`, `server.ts`, `src/lib/firebaseAdmin.ts`, `src/lib/firebase.ts`, `src/modules/workflow/approval/serverAuthMiddleware.ts`, `src/services/cfo/AICFOAuditService.ts`, `src/components/bi/hooks/useBIAiAdvisor.ts`, `src/utils/safeFetch.ts`, `src/modules/identity/EnterpriseIdentityOrchestrator.ts`, `src/repositories/InvitationRepository.ts`, `src/services/business/InvitationService.ts`, `src/modules/admin/AdminRepository.ts`, `src/modules/admin/MonitoringService.ts`, `src/modules/runtime/JobEngine.ts`, `src/modules/runtime/SynchronizationEngine.ts`, `src/repositories/CurrencyRateRepository.ts`, `src/services/auth/resolvers.ts`, `firestore.rules` (lines 1–1709), `node_modules/body-parser/lib/types/json.js`. |
| `PROVEN_LOG` | Production browser/platform telemetry supplied in the incident brief (`[useBIAiAdvisor] API report response unavailable`, `HTTP 500: A server error has occurred`, `FUNCTION_INVOCATION_FAILED`, `iad1`, Request ID `284fw-1795280564074-1d876d98f4e7`; `POST /api/invitations/accept` HTTP 500 -> client 403; Firestore `batchGet` 403; `enterprise_health_snapshots/JOB_ENGINE` & `MONITORING_SERVICE` 403; `CurrencyRateRepository` fallback). |
| `PROVEN_RUNTIME` | Local Node `v22.23.2` execution proofs: `node -e 'import("./api/index.ts")'` -> `ERR_MODULE_NOT_FOUND` (`../server`); `npx tsc --noEmit --module NodeNext --moduleResolution NodeNext api/index.ts` -> `TS2835`; `npx esbuild api/index.ts --bundle --platform=node --format=cjs --packages=external` -> 13 warnings (`"import.meta" is not available with "cjs"` in `src/lib/firebase.ts:18-23`); `npx esbuild ... --format=esm` -> proves client `firebase/*` & `idb` in API dependency graph; `npx tsx` -> loads `createApp()` only under `tsx` loader. |
| `PROVEN_UNIT` | Executed Vitest suites (mocked Firestore/Auth): `OwnerGeneralLedgerAccess.test.tsx` (14/14 PASS), `PhaseD1AuthMultiTenant.test.ts` (30/30 PASS), `CentralExchangeRatesModule.test.ts` (18/18 PASS), `CurrencyRateRepository.test.ts` (5/5 PASS), `P0FinalHardeningInvitationClaims.test.ts` (9/9 PASS), `CloudRunPackagingAndAdcIntegrity.test.ts` (7/7 PASS), `PhaseD4B24RulesHardening.test.ts` (15/15 PASS). Legacy regex test `tests/unit/FirestoreRulesModGov8.test.ts` FAILED 2/6 assertions (`audit_logs` L38, `workflow_definitions` L61) due to outdated test expectations after rules hardening. |
| `INFERRED` | Exact internal Vercel Lambda crash stack trace (whether Vercel failed at cold-start ESM resolution, `body-parser` stream handling, `import.meta`, or missing `FIREBASE_SERVICE_ACCOUNT_KEY` ADC timeout) cannot be isolated to a single line without live Vercel runtime logs, though **multiple independently fatal defects** are `PROVEN_STATIC` / `PROVEN_RUNTIME` on `api/index.ts`. |
| `BLOCKED` | 1) Live Vercel deployment logs for Request ID `284fw-1795280564074-1d876d98f4e7` and live Vercel environment variables (`GEMINI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_KEY`, `NODE_VERSION`); 2) Live Firestore Emulator execution (`java` runtime is not installed in this container); 3) Live Firebase project `finopsht` deployed rules hash, live `users`/`invitations`/`daily_exchange_rate_grids` document state, and GCP IAM bindings. |

---

## 3. CAUSAL CORRELATION CHECK — OWNER GENERAL LEDGER ACCESS FIX

- **Hypothesis Tested:** Did the recent `FINOPS-RBAC-OWNER-GENERAL-LEDGER-ACCESS` change cause any of Incidents A, B, C, or D?
- **Conclusion:** **DISPROVEN — ZERO CAUSAL LINK (`PROVEN_STATIC` + `PROVEN_UNIT`).**
- **Proof:**
  1. `OwnerGeneralLedgerAccess.test.tsx` (14/14 passing) exercises `PermissionService.ts`, `src/services/auth/resolvers.ts` (`NavigationBuilder`), `routeResolver.ts`, `AccessResolver.ts`, `IdentityContext.tsx`, `useNavigation.ts`, `Sidebar.tsx`, `LedgerHeader.tsx`, and `DoubleEntryTable.tsx`.
  2. None of those UI/RBAC files touch `/api/index.ts`, `vercel.json`, `server.ts`, `src/lib/firebaseAdmin.ts`, `src/services/cfo/AICFOAuditService.ts`, `src/services/business/InvitationService.ts`, `src/repositories/InvitationRepository.ts`, `src/modules/admin/AdminRepository.ts`, `src/repositories/CurrencyRateRepository.ts`, or `firestore.rules`.
  3. Notice also `server.ts`, `firestore.rules`, `api/index.ts`, `src/lib/firebaseAdmin.ts`, `src/services/PermissionService.ts`, and `src/modules/identity/IdentityContext.tsx` all coexist in the workspace, and `PhaseD1AuthMultiTenant.test.ts` (30/30 passing) confirms the Express `/api/cfo/analyze` and `/api/invitations/accept` route handlers work cleanly when `createApp()` runs under Vitest with mocked `firebaseAdmin`.

---

## 4. SECTION 10 — DIRECT ANSWERS TO MANDATORY QUESTIONS

### Question 1: Why does `POST /api/cfo/analyze` fail with HTTP 500 `FUNCTION_INVOCATION_FAILED` in Vercel `iad1`?
- **Answer:** Because the HTTP 500 is a **Vercel serverless platform crash (`FUNCTION_INVOCATION_FAILED`)** occurring **before** the Express route handler in `server.ts:1987-2405` can return a JSON response (`PROVEN_STATIC` + `PROVEN_RUNTIME`).
- **Evidence:**
  - `server.ts:1987-2405` wraps `/api/cfo/analyze` in `try/catch` that falls back to `FinancialRatioEngine.calculate()` (`res.json(fallbackPayload)` at line 2396) or returns JSON `{ error: "INTERNAL_SERVER_ERROR" }` (line 2399); `api/index.ts:26` also returns JSON on `catch`; `serverAuthMiddleware.ts:247, 385` returns JSON `503 AUTH_VERIFICATION_UNAVAILABLE` if Firestore Admin fails.
  - `src/utils/safeFetch.ts:71-80` only formats `"HTTP 500: A server error has occurred..."` when the response body does **not** start with `{` or `[` — matching Vercel's plain-text `FUNCTION_INVOCATION_FAILED` body.
  - At least **three concrete defects** break `/api/index.ts` under Vercel's `@vercel/node` pipeline:
    1. `package.json:5` declares `"type": "module"`, while `api/index.ts:1` (`import { createApp } from "../server"`), `server.ts:8-47`, and `src/lib/firebaseAdmin.ts:7` use extensionless TS imports and raw JSON imports without `with { type: "json" }`. Native Node 22 ESM throws `ERR_MODULE_NOT_FOUND` (`PROVEN_RUNTIME`), and `tsc --moduleResolution NodeNext` fails with `TS2835` (`PROVEN_RUNTIME`).
    2. `server.ts:12` imports `AICFOAuditService.ts`, whose line 1 imports `../../lib/firebase` — dragging the browser Firebase Web SDK (`firebase/app`, `firebase/auth`, `firebase/firestore`, `firebase/functions`, `firebase/storage`, `idb`) and `import.meta.env` into `/api/index.ts` at module load (`PROVEN_STATIC` + `PROVEN_RUNTIME` via `esbuild`).
    3. `src/lib/firebaseAdmin.ts` ignores `FIREBASE_ADMIN_PRIVATE_KEY` / `FIREBASE_ADMIN_CLIENT_EMAIL` documented in `.env.example:8-9`, falling back on Vercel to `applicationDefault()` (which has no GCP metadata server on Vercel) unless `FIREBASE_SERVICE_ACCOUNT_KEY` was explicitly populated (`PROVEN_STATIC`; live Vercel env/logs are `BLOCKED`).
  - *(Detailed trace: `FINOPS_P0_BI_ADVISOR_500_TRACE.md`)*

### Question 2: Why does `POST /api/invitations/accept` return HTTP 500, and why does the client fallback return HTTP 403?
- **Answer:**
  - **Backend HTTP 500:** `POST /api/invitations/accept` routes through the exact same Vercel `vercel.json:8-9` (`"/api/(.*)" -> "/api"`) serverless entrypoint `/api/index.ts` that crashes with `FUNCTION_INVOCATION_FAILED` (and additionally, inside `InvitationService.ts:443-559`, if Admin SDK ever throws `PERMISSION_DENIED`, the server itself tries to `import("../../lib/firebase")` and execute an unauthenticated client `runTransaction` from Node!).
  - **Client Fallback HTTP 403 (`PROVEN_STATIC`):** When `/api/invitations/accept` returns `500` or `502`, `EnterpriseIdentityOrchestrator.acceptInvitation` (`src/modules/identity/EnterpriseIdentityOrchestrator.ts:574-590`) falls back to `InvitationRepository.acceptInvitation` (`src/repositories/InvitationRepository.ts:274-392`), which runs a client Firestore `runTransaction` executing three writes that `firestore.rules` explicitly denies to an invited non-admin user:
    1. `update` on `invitations/{inviteId}` (`InvitationRepository.ts:337-342`) -> denied by `firestore.rules:700-703` (requires `isSuperAdmin()` or `isTenantAdminOrManager`).
    2. `set(..., { merge: true })` on `employees/{empId}` (`InvitationRepository.ts:365`) -> denied by `firestore.rules:663-683` (`create` requires `isTenantAdminOrManager`; self-`update` forbids modifying `businessId`, `business_id`, `role`, `status`, `isActive`, `firebase_uid`, `uid`, `email`, `normalizedEmail`).
    3. `set(..., { merge: true })` on `users/{uid}` (`InvitationRepository.ts:391`) -> denied by `firestore.rules:372-419` (self-`update` `affectedKeys().hasOnly(...)` rejects `businessId`, `business_id`, `employeeId`, `employee_id`, `role`, `businessStatus`, `business_status`, AND lines 397-401 forbid setting `accountStatus`/`account_status` to `"ACTIVE"`).
  - *(Detailed trace: `FINOPS_P0_INVITATION_ACCEPTANCE_500_403_TRACE.md`)*

### Question 3: Why does Firestore `batchGet` return HTTP 403?
- **Answer:** The Firestore Web SDK executes `getDoc(docRef)` over the `:batchGet` RPC endpoint. In `firestore.rules`, **61 `match` blocks** evaluate `getBusinessId(resource.data)` (or `resource.data.get(...)`) on `allow read` **without first guarding `resource != null` (or `resource == null`)** (`PROVEN_STATIC`). Whenever any authenticated non-SuperAdmin client executes `getDoc(...)` / `resilientGetDoc(...)` against a document ID that **does not yet exist in Firestore**, `resource` is `null`, evaluating `resource.data` fails in Firestore Security Rules, and Firestore returns **HTTP 403 `Missing or insufficient permissions`** on `:batchGet` instead of an empty `{ exists: false }` snapshot.
- Confirmed active triggers include:
  - `daily_exchange_rate_grids/{gridId}` (`firestore.rules:725`) via `CurrencyRateRepository.getTodayRatesWithFallback` (`line 216`)
  - `employees/{empId}` (`firestore.rules:651-662`) via `EnterpriseIdentityOrchestrator` (`lines 375, 662, 1059`), `AttendanceRepository` (`lines 147, 151`), `ForeignKeyIntegrityValidator` (`lines 107, 115`)
  - `onboarding_requests/req_{uid}` (`firestore.rules:1392`) via `src/services/auth/resolvers.ts:161`
  - *(Full mapping: `FINOPS_P0_FIRESTORE_403_PERMISSION_MATRIX.csv`)*

### Question 4: Why are `enterprise_health_snapshots/JOB_ENGINE` and `enterprise_health_snapshots/MONITORING_SERVICE` writes denied?
- **Answer:** `firestore.rules:1399` enforces `allow write: if isAuthenticated() && (isSuperAdmin() || isTenantScoped(getBusinessId(request.resource.data)));`. `AdminRepository.reportHealth` (`src/modules/admin/AdminRepository.ts:15, 35-40`) only sets `docId = "${health.name}_${health.businessId}"` and writes `business_id`/`businessId` **when `health.businessId` is truthy**. Unlike `SynchronizationEngine.ts:238-244` (which passes `businessId: this.currentBusinessId`), both `JobEngine.start()` (`src/modules/runtime/JobEngine.ts:89-94`) and `MonitoringService.startReporting()` (`src/modules/admin/MonitoringService.ts:65-71`) omit `businessId`. Consequently, writes target the unscoped document IDs `JOB_ENGINE` and `MONITORING_SERVICE` with no `business_id` field, `getBusinessId(request.resource.data)` returns `'none'`, and `isTenantScoped('none')` returns `false` -> deterministic HTTP 403 (`PROVEN_STATIC`). (In addition, `AdminRepository.subscribeToHealth` at line 84 queries the entire `enterprise_health_snapshots` collection with no tenant `where` filter, causing `list` 403 for non-SuperAdmins.)

### Question 5: Why does `CurrencyRateRepository` fall back to its default rate grid — is it caused by the Firestore 403 or by a separate code/config defect?
- **Answer:** **It is directly caused by the Firestore `batchGet` 403 (`C2`), amplified by missing error isolation in `CurrencyRateRepository.getTodayRatesWithFallback` (`PROVEN_STATIC`).**
- **Mechanism:** In `src/repositories/CurrencyRateRepository.ts:212-270`, step 1 (`await getDoc(doc(db, "daily_exchange_rate_grids", fx_grid_${businessId}_${todayStr}))` at lines 215-216) and step 2 (the historical inheritance query `resilientGetDocs(query(collection(...), where("businessId", "==", businessId), ...))` at lines 237-245) share a **single `try/catch` block**. When today's rate grid document does not exist, `firestore.rules:725` triggers the `resource == null` `batchGet` 403. That exception **aborts execution at line 216**, completely **bypassing the historical fallback query at lines 237-245**, jumps to `catch (err)` at line 268 (`console.warn("[CurrencyRateRepository] Fallback to default rate grid:", err)`), and returns hardcoded `DEFAULT_RATE_GRID_VALUES`. `CurrencyRateRepository.test.ts:18` masked this in unit tests by mocking `getDoc` to resolve `{ exists: () => false }` rather than throwing `PERMISSION_DENIED`. *(Detailed trace: `FINOPS_P0_CURRENCY_RATE_FALLBACK_TRACE.md`)*

### Question 6: Are any of these incidents caused by the recent `OWNER` General Ledger access change?
- **Answer:** **NO (`PROVEN_STATIC` + `PROVEN_UNIT`).** Zero overlap in files, runtime paths, Express routes, or Firestore rules.

### Question 7: Are Firebase Admin SDK credentials and project bindings aligned between local/Cloud Run and Vercel?
- **Answer:** **NO (`PROVEN_STATIC`, live Vercel env `BLOCKED`).**
  - `firebase-applet-config.json` binds both client and Admin SDK (`src/lib/firebaseAdmin.ts:28, 148-152`) to `projectId: "finopsht"` and `firestoreDatabaseId: "ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a"`.
  - `.env.example:8-9` instructs operators to configure `FIREBASE_ADMIN_PRIVATE_KEY` and `FIREBASE_ADMIN_CLIENT_EMAIL` for Vercel, **but `src/lib/firebaseAdmin.ts` never reads either variable** (it only reads `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_SERVICE_ACCOUNT_KEY`, local JSON files, or `applicationDefault()`).
  - On Cloud Run (`K_SERVICE` set), `firebaseAdmin.ts:36-47` enforces GCP Metadata Server ADC (`dist/server.cjs` built via `esbuild`). On Vercel (no `K_SERVICE`, no GCP Metadata Server, and `.gitignore` excludes `*-firebase-adminsdk-*.json`), if `FIREBASE_SERVICE_ACCOUNT_KEY` is absent in Vercel env, `applicationDefault()` produces an invalid/unconfigured credential.
  - Note also a foreign service-account JSON (`tek-pou-nou-tpn-firebase-adminsdk-fbsvc-8987873e95.json`) exists in the local workspace root (`firebaseAdmin.ts:111-114` skips it due to `project_id` mismatch, and `.gitignore`/`.gcloudignore` exclude it, though no `.vercelignore` exists).

### Question 8: Are Express routes (`/api/cfo/analyze`, `/api/invitations/accept`) functioning correctly in isolation vs under Vercel?
- **Answer:** **Yes in Node/`vitest`/`tsx` isolation (`PROVEN_UNIT`: 30/30 in `PhaseD1AuthMultiTenant.test.ts`); broken under Vercel `@vercel/node` packaging (`PROVEN_STATIC` + `PROVEN_RUNTIME`).** Under `tsx` / `vitest` (or Cloud Run's bundled `dist/server.cjs`), `createApp()` loads cleanly and both routes execute deterministically. Under Vercel serverless deployment of `api/index.ts`, `"type": "module"` ESM extensionless imports (`../server`, etc.), server-side bundling of client `src/lib/firebase.ts` (`import.meta.env` + browser SDKs), `express.json()` stream interaction, and missing `FIREBASE_SERVICE_ACCOUNT_KEY` prevent reliable invocation.

### Question 9: What exact `firestore.rules` rules are failing in production vs behaving as intended security controls?
- **Answer:**
  - **Intended Security Controls (Working as Designed):**
    - `invitations/{inviteId}` `allow update` (`firestore.rules:700-703`) — intentionally blocks non-admin users from self-marking invitations `ACCEPTED`.
    - `employees/{empId}` `allow create`/`update` (`firestore.rules:663-683`) — intentionally blocks non-admin self-assignment of `businessId`, `role`, `status`, `uid`.
    - `users/{userId}` `allow update` (`firestore.rules:372-419`) — intentionally blocks client self-promotion of `role`, `businessId`, `employeeId`, or `accountStatus: "ACTIVE"`.
    - `enterprise_health_snapshots/{id}` `allow write` (`firestore.rules:1399`) — intentionally enforces tenant isolation (`isTenantScoped(getBusinessId(request.resource.data))`). The bug is in `JobEngine` & `MonitoringService` omitting `businessId`, not in the rule rejecting unscoped writes.
  - **Actual Rules Bugs (`PROVEN_STATIC`):**
    - **61 `match` blocks** (e.g., `daily_exchange_rate_grids` L725, `employees` L654, `onboarding_requests` L1392, `attendance_records`, `leaves`, `overtime_requests`, `employee_sales_summary`, etc.) dereference `resource.data` in `allow read` without guarding `resource != null` (or `resource == null`), causing HTTP 403 `:batchGet` errors whenever `getDoc` queries a non-existent document ID.

### Question 10: What is the safest remediation sequence without relaxing multi-tenant isolation or RBAC?
- **Answer:** Strictly **two-track non-weakening remediation** (detailed in `FINOPS_P0_REMEDIATION_PRIORITY_MATRIX.csv`):
  1. **P0 — Fix Vercel `/api/index.ts` Serverless Packaging & Admin Credential Loading:** Eliminate client `src/lib/firebase.ts` imports from server code (`AICFOAuditService.ts` -> use Admin SDK on server; remove client fallback inside `InvitationService.ts:447`), bundle `/api/index.ts` (or fix Node ESM/CJS build output + add `FIREBASE_ADMIN_PRIVATE_KEY`/`FIREBASE_ADMIN_CLIENT_EMAIL` support in `firebaseAdmin.ts`), and verify `/api/cfo/analyze` and `/api/invitations/accept` on Vercel. **Do NOT weaken `firestore.rules` on `invitations`, `employees`, or `users`** — client fallback must never be authorized to self-assign roles/tenants.
  2. **P0 — Fix Null-Resource Handling in `firestore.rules` (`get` on non-existent docs):** Add `(resource == null && isAuthenticated())` or split `allow get` / `allow list` safely (`resource == null` only for `get` where caller shouldn't leak cross-tenant existence, or check `id` prefix / `resource == null` carefully so `list` queries stay tenant-bound) across the affected `match` blocks (`daily_exchange_rate_grids`, `onboarding_requests`, `employees`, etc.), and fix `CurrencyRateRepository.getTodayRatesWithFallback` so `getDoc` failure never aborts the historical `resilientGetDocs` query.
  3. **P1 — Fix Unscoped Health Snapshots (`JobEngine`, `MonitoringService`, `AdminRepository`):** Inject `businessId` into `JobEngine` and `MonitoringService` health heartbeats (just like `SynchronizationEngine.ts:240`), stop reporting before tenant resolution, and add `where("businessId", "==", businessId)` to `AdminRepository.subscribeToHealth`.

---

## 5. STOP GATE

- **Strict Read-Only Compliance Verified:** Zero source files, zero `firestore.rules`, zero configs, zero dependencies, and zero production Firestore records were modified.
- **Audit Complete — Awaiting User Authorization** before applying any remediation from `FINOPS_P0_REMEDIATION_PRIORITY_MATRIX.csv`.
