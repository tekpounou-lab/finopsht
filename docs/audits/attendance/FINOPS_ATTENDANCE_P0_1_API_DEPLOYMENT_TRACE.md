# FINOPS ERP — ATTENDANCE P0.1 API & DEPLOYMENT TRACE

**Audit ID:** `FINOPS-ATTENDANCE-P0.1`  
**Mode:** STRICT READ-ONLY VERIFICATION  
**Target Environment:** Vercel Serverless + Node/Express (`server.ts`) + Firebase Admin SDK  
**Firebase Project / DB (Reference Only):** `finopsht` / `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`

---

## 1. Vercel Routing & Serverless Packaging Trace

| Layer | File & Line Refs | Observed Behavior | Evidence Tag |
|---|---|---|---|
| **Vercel Routing** | `vercel.json:1-20` | Routes `/api/(.*)` -> `/api` (`dest: "/api"`), serves static assets via `filesystem`, and falls back to `/index.html`. Build runs `npm run build`, output directory `dist`. | `PROVEN_STATIC` |
| **Build Pipeline** | `package.json:8` | `npm run build` executes: `vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --define:import.meta=undefined --sourcemap --outfile=dist/server.cjs && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --define:import.meta=undefined --sourcemap --outfile=api/_server.cjs`. | `PROVEN_STATIC` |
| **Vercel Entrypoint** | `api/index.ts:10-112` | Uses `createRequire(import.meta.url)` (Node 22 ESM compatible) to dynamically load `api/_server.cjs` (or `dist/server.cjs`), calls `mod.createApp()`, rewrites `req.url` from `x-invoke-path` / `x-matched-path` preserving query strings (`lines 45-61`), normalizes pre-parsed buffers/strings with `req._body = true` (`lines 65-80`), and awaits Express response completion (`lines 88-93`). | `PROVEN_STATIC` |
| **Bundle Content Check** | `api/_server.cjs:11186, 12541`; `dist/server.cjs:11186, 12541` | `grep -nE "attendanceRoutes\|registerAttendanceRoutes" server.ts api/_server.cjs dist/server.cjs` confirms `attendanceRouter` (`src/routes/attendanceRoutes.ts`) is compiled into both `api/_server.cjs` and `dist/server.cjs`. | `PROVEN_STATIC` |
| **Auto-Boot Guard** | `server.ts:2721-2727` | Standalone `app.listen` is suppressed when `process.env.VERCEL`, `process.env.VITEST`, or `NODE_ENV === "test"` is set, preventing port binding crashes in Vercel serverless invocations. | `PROVEN_STATIC` |

---

## 2. Express Middleware Chain & Firebase Admin Initialization Trace

### A. Firebase Admin Resolution (`src/lib/firebaseAdmin.ts`)
- `readFirebaseAppletConfig()` (`lines 50-91`): Dynamically reads `firebase-applet-config.json` from disk (no static ESM JSON import) with fallback constants `projectId = "finopsht"`, `firestoreDatabaseId = "ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a"`.
- `resolveFirebaseAdminConfig()` (`lines 113-325`):
  - Enforces `FIREBASE_ADMIN_PROJECT_ID === targetProjectId` (`lines 122-127`).
  - On Cloud Run (`K_SERVICE` non-`ais-`), strictly enforces ADC (`lines 142-157`).
  - On Vercel (`VERCEL === "1"` or `VERCEL_ENV`), supports `FIREBASE_ADMIN_CLIENT_EMAIL` + `FIREBASE_ADMIN_PRIVATE_KEY` (with PEM `\n` normalization, `lines 97-107, 160-189`) or `FIREBASE_SERVICE_ACCOUNT_KEY` JSON/base64 (`lines 224-258`).
  - **Fail-closed on Vercel** when credentials are missing (`lines 261-265` throws `FIREBASE_ADMIN_NOT_CONFIGURED` instead of hanging on GCP metadata server).
- `getAdminFirestore()` (`lines 347-354`): Binds to named Firestore database `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a` via `getFirestore(app, dbId)`.

### B. CORS, Rate Limiting, & CSRF Middleware (`server.ts:280-391`)
- **CORS (`lines 280-316`):** Sets `credentials: true` and permits `Authorization`, `X-CSRF-Token`, `X-Requested-With`, `x-business-id`, `X-Client-Session-Id`. *(Observation: unknown origins hit fallback `callback(null, true)` at `line 298` — permissive origin policy, though endpoints remain Bearer-token protected.)*
- **Rate Limiter (`lines 342-356`):** 120 reqs/min per IP across `/api`. *(Note: in-memory per serverless instance; no distributed store.)*
- **CSRF Middleware (`lines 370-391`):** For state-changing methods (`POST`), blocks only if `hasCookieSession && !clientCsrfToken && !requestedWith && !req.headers["authorization"]`. Attendance calls from `safeFetchJson` (`src/utils/safeFetch.ts:16-37`) attach `X-Requested-With`, `X-CSRF-Token`, and `Authorization: Bearer <ID Token>`.

### C. Route Mounting & Token Authentication (`server.ts:744`, `src/modules/workflow/approval/serverAuthMiddleware.ts:314-618`, `src/routes/attendanceRoutes.ts`)
1. `server.ts:744` mounts `app.use("/api/attendance", attendanceRouter)`.
2. Every attendance route (`POST /api/attendance/check-in`, `/check-out`, `/override` at `attendanceRoutes.ts:85, 119, 156`) applies `authenticateToken`:
   - Extracts `Authorization: Bearer <token>` (`lines 319-327`).
   - Verifies token via `adminAuth.verifyIdToken(token, true)` (`checkRevoked = true`, falling back to `false` only if Identity Toolkit API is unavailable in host runtime, `lines 86-104`).
   - Fetches `/users/{uid}` from Admin Firestore (`lines 384-455`) — fails closed with `503 AUTH_VERIFICATION_UNAVAILABLE` if Firestore read fails (`lines 456-461`).
   - Enforces `SUSPENDED_USER_STATUSES` (`403 ACCOUNT_SUSPENDED`), `INACTIVE_BUSINESS_STATUSES` on both user profile and `/businesses/{business_id}` (`403 TENANT_INACTIVE`), `business_id` vs `businessId` consistency (`403 TENANT_MISMATCH`), `branch_id` vs `branchId` consistency (`403 BRANCH_MISMATCH`), `role` conflict protection (`lines 482-497`), and `x-business-id` header match (`403 FORBIDDEN_TENANT_ACCESS` for non-SuperAdmins, `lines 550-563`).
   - Populates `req.user` (`uid`, `email`, `role`, `business_id`, `isSuperAdmin`, `branch_id`).

---

## 3. Attendance Request Lifecycle & API Gaps

### A. Primary UI Flow vs Alternative Client Flows
1. **Tested Kiosk/Scanner Path (`UnifiedAttendanceKioskModal.tsx`, `useQRScanner.ts`, `AttendanceLedger.tsx` QR scan):**
   - Calls `AttendanceRepository.checkIn` / `checkOut` (`src/repositories/AttendanceRepository.ts:272, 558`).
   - When `auth.currentUser` is present and `!preferDirectFirestore`, dispatches `POST /api/attendance/check-in` or `/check-out` via `safeFetchJson`.
   - **Verified Working in Mocked Express Tests (`AttendanceP0RbacRemediation.test.ts`):** `createApp()` handles HTTP requests and enforces `ServerAttendanceService` + `AttendanceAuthorizationService`.

2. **Verified Gaps in Deployment & Routing Coverage:**
   - **GAP-ATT-05 (`HIGH`) — Unmigrated Client Paths Bypass `/api/attendance/*`:**
     - `AttendanceLedger.tsx:765, 811, 854` (`handleOverrideSubmit`, `handleGlobalOverrideSave`, `handleRecalculate`) call `AttendanceRepository.updateRecord` (direct Firestore writes) instead of `POST /api/attendance/override`.
     - `AttendanceLedger.tsx:906` calls `AttendanceRepository.batchDeleteRecords` directly on Firestore.
     - `AttendanceLedger.tsx:157-187` (`auto-repair useEffect`) directly calls `setDoc` / `deleteDoc` on `attendance_logs`.
     - `MyWorkspace.tsx:440, 461` calls `AttendanceRepository.saveRecord` directly on Firestore instead of `/api/attendance/check-in` & `/check-out`.
     - `MassImportModal.tsx:542` calls `AttendanceRepository.batchSaveRecords` directly on Firestore.
     - `AttendanceRepository.ts:882-979` (`createAdjustmentRequest`, `approveAdjustmentRequest`) and `EmployeeRepository.ts:702` (`saveAttendanceLog`) write directly to Firestore.
     - **Impact:** Backend route `/api/attendance/override` exists (`attendanceRoutes.ts:156`) and is tested, yet **zero UI components call `/api/attendance/override`** in production!
   - **GAP-ATT-07 (`HIGH`) — Server `QR` Method Allows Badge Bypass When Badge Fields Omitted:**
     - `ServerAttendanceService.ts:390-393`: `verifyBadgeIfProvided` returns immediately if `badgeId`, `qrSignature`, and `badgePayload` are all omitted — even when `input.method === "QR"`. An authenticated caller hitting `POST /api/attendance/check-in` directly with `{ employeeId, method: "QR" }` skips all badge active/expiry/signature checks.
   - **GAP-ATT-12 (`MEDIUM`) — `AttendanceRepository` Silent Fallthrough Risk + Unhandled Error Format Mismatch:**
     - `AttendanceRepository.ts:293` & `578`: If `/api/attendance/*` returns a `200` response lacking `.session` (e.g., malformed proxy payload), execution falls through to direct Firestore client writes instead of failing closed.
     - Conversely, `safeFetchJson` (`src/utils/safeFetch.ts:74-75`) parses JSON error responses as `new Error(parsedErr.error || parsedErr.message)`, throwing raw error codes like `"PAYROLL_PERIOD_LOCKED"` or `"BRANCH_SCOPE_VIOLATION"` instead of localized `message`, though callers still reject safely (`throw`).
   - **Runtime Unverified (`NOT_TESTED` / `BLOCKED`):**
     - `api/index.ts` executing against live Vercel environment variables (`VERCEL=1`, real Firebase Auth JWKS / Identity Toolkit / real `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a` Firestore DB) could not be tested in this read-only local container.

---

## 4. API & Deployment Verification Summary

- `npm run build` (`vite build` + `esbuild` CJS bundles `dist/server.cjs` and `api/_server.cjs` at `608.0kb`): **`PROVEN_STATIC` / `PROVEN_BUILD`** (attendance routes confirmed present in compiled bundles; `import.meta.env` / client SDK absent from server bundles).
- `createApp()` Express HTTP route testing (`POST /api/attendance/check-in`, `/check-out`, `/override`): **`PROVEN_INTEGRATION` (with mocked Firebase Admin SDK / in-memory store)** (`23/23` tests pass in `AttendanceP0RbacRemediation.test.ts`).
- Live Vercel Serverless execution (`api/index.ts` + real Firebase Auth + live Firestore DB): **`NOT_TESTED`** (no live production deployment or Vercel runtime in container).
