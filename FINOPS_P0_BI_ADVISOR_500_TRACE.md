# INCIDENT A — BI ADVISOR API (`POST /api/cfo/analyze`) HTTP 500 `FUNCTION_INVOCATION_FAILED` FORENSIC TRACE

**Audit ID:** `FINOPS-P0-API-FIRESTORE-INCIDENT-01`  
**Mode:** STRICT READ-ONLY  
**Vercel Telemetry (Reported):** Region `iad1` | Request ID `284fw-1795280564074-1d876d98f4e7` | `HTTP 500: A server error has occurred` / `FUNCTION_INVOCATION_FAILED`

---

## 1. END-TO-END CALL TRACE

1. **UI Hook Trigger (`PROVEN_STATIC`):**
   - `src/components/bi/hooks/useBIAiAdvisor.ts:51-114` (`handleGenerateAiReport`, also auto-triggered via `useEffect` at lines 116-120).
   - Line 98 calls `await safeFetchJson("/api/cfo/analyze", { method: "POST", ... })`.
2. **Fetch & Header Injection (`PROVEN_STATIC`):**
   - `src/utils/safeFetch.ts:12-81` attaches `X-Requested-With: XMLHttpRequest`, `X-Client-Session-Id`, `X-CSRF-Token`, `Content-Type: application/json`, and `Authorization: Bearer ${idToken}` (lines 31-35).
   - Lines 68-81 read `response.text()`:
     - If `trimmed` starts with `{` or `[`, it parses JSON and throws `parsedErr.error || parsedErr.message` (lines 72-78).
     - Otherwise (plain text!), line 80 throws **`HTTP ${response.status}: ${trimmed.slice(0, 200)}`**.
   - **Critical Forensic Deduction (`PROVEN_STATIC` + `PROVEN_LOG`):** Because the browser receives `HTTP 500: A server error has occurred` + `FUNCTION_INVOCATION_FAILED`, the response body was **Vercel's plain-text serverless crash page**, NOT JSON from Express (`server.ts:2399`, `server.ts:2585`, or `api/index.ts:26` all return JSON!).
3. **Fallback Activation (`PROVEN_STATIC` + `PROVEN_LOG`):**
   - `useBIAiAdvisor.ts:106-110` catches the thrown error, logs `[useBIAiAdvisor] API report response unavailable, activating FinancialRatioEngine fallback:`, and executes `FinancialRatioEngine.calculate(payload, ...)` locally in the browser.
4. **Vercel Edge Routing (`PROVEN_STATIC`):**
   - `vercel.json:6-10` rewrites `src: "/api/(.*)"` to `dest: "/api"`, invoking `/api/index.ts`.
   - `vercel.json:3-4` sets `"buildCommand": "npm run build"`, which executes `vite build && esbuild server.ts ... --outfile=dist/server.cjs`. **Note:** `dist/server.cjs` is the Cloud Run standalone entrypoint (`package.json:9`), NOT `/api/index.ts`, which Vercel compiles independently via `@vercel/node`.

---

## 2. WHY THE EXPRESS HANDLER NEVER RAN (OR CRASHED AT PLATFORM BOUNDARY)

### Proof that Express Route Logic Itself Handles Errors Without Plain-Text 500 (`PROVEN_STATIC` + `PROVEN_UNIT`)
- `serverAuthMiddleware.ts:246-250, 385-389, 539-544, 594-599`: Every `firebase-admin` Firestore failure inside `authenticateToken` / `authenticateIdentityOnly` returns **JSON `503 AUTH_VERIFICATION_UNAVAILABLE`**, never plain-text 500. Invalid tokens return JSON `401`.
- `server.ts:2096-2115`: If `GEMINI_API_KEY` is missing (`ai === null`), `/api/cfo/analyze` executes `FinancialRatioEngine.calculate(req.body, "Non Activée")` and returns **HTTP 200 JSON**!
- `server.ts:2371-2403`: Any runtime error during Gemini prompt building/generation is caught and falls back to `FinancialRatioEngine.calculate(...)` returning **HTTP 200 JSON** (or JSON `500 INTERNAL_SERVER_ERROR` if fallback itself throws).
- `api/index.ts:23-32`: Even a `createApp()` rejection inside `handler()` returns JSON `{ error: "Erreur interne...", success: false }`.
- `PhaseD1AuthMultiTenant.test.ts` (30/30 passing, `PROVEN_UNIT`) confirms `/api/cfo/analyze` works on real `createApp()` when loaded under Vitest/tsx with mocked Admin SDK.

**Conclusion:** `FUNCTION_INVOCATION_FAILED` occurred at the **Vercel `@vercel/node` module load / invocation wrapper layer**, before Express's JSON error handling could send headers.

---

## 3. PROVEN RUNTIME & PACKAGING DEFECTS IN `/api/index.ts`

### Defect A1 — ESM Module Resolution Breakage (`PROVEN_STATIC` + `PROVEN_RUNTIME`)
- `package.json:5` sets `"type": "module"`.
- `tsconfig.json` sets `"moduleResolution": "bundler"` (Vite/tsx convention, invalid for Node ESM).
- `api/index.ts:1` writes `import { createApp } from "../server";` (no `.ts`/`.js` extension).
- `server.ts:8-47` contains 30+ extensionless TypeScript imports and line 39 imports `./firebase-applet-config.json` without `with { type: "json" }`.
- **Local Proof (`PROVEN_RUNTIME` on Node `v22.23.2`):**
  - `node -e 'import("./api/index.ts")'` -> **CRASHES:** `ERR_MODULE_NOT_FOUND: Cannot find module '/app/applet/server' imported from /app/applet/api/index.ts`.
  - `npx tsc --noEmit --module NodeNext --moduleResolution NodeNext api/index.ts` -> **FAILS:** `error TS2835: Relative import paths need explicit file extensions in ECMAScript imports... Did you mean '../server.js'?`
  - Only `tsx` (dev) or `esbuild --format=cjs --define:import.meta=undefined` (Cloud Run `dist/server.cjs`) succeeds; Vercel's `@vercel/node` ESM compilation path breaks or triggers CJS/ESM interop failures unless compiled away cleanly.

### Defect A2 — Browser Firebase Web SDK & Vite Globals Bundled Into Server API (`PROVEN_STATIC` + `PROVEN_RUNTIME`)
- `server.ts:12` imports `AICFOAuditService` (`src/services/cfo/AICFOAuditService.ts`).
- `AICFOAuditService.ts:1-2` top-level imports:
  - `import { db } from "../../lib/firebase";`
  - `import { collection, addDoc } from "firebase/firestore";`
- `src/lib/firebase.ts:1-76` immediately executes **browser SDK initialization at module load time**, importing:
  - `firebase/app`, `firebase/auth`, `firebase/firestore` (`persistentLocalCache`, `persistentMultipleTabManager`, `initializeFirestore`), `firebase/functions`, `firebase/storage`, `./analytics` (`firebase/analytics`), and indirectly `idb` (via `IndexedDB` / `ResilientFirestore` / `EventBus`).
  - Uses `import.meta.env?.VITE_FIREBASE_*` (`src/lib/firebase.ts:18-25`).
- **Local Proof (`PROVEN_RUNTIME`):**
  - `npx esbuild api/index.ts --bundle --platform=node --format=cjs --packages=external` emits **13 warnings**: `"import.meta" is not available with the "cjs" output format` on `src/lib/firebase.ts:18-25`. Without `--define:import.meta=undefined` (which `package.json:8` passes for Cloud Run, **NOT** Vercel's `/api/index.ts`!), accessing `import.meta.env` in a CJS-compiled Vercel bundle evaluates `undefined.VITE_FIREBASE_PROJECT_ID` -> **`TypeError: Cannot read properties of undefined` at module import time**, producing `FUNCTION_INVOCATION_FAILED`!
  - `npx esbuild api/index.ts --bundle --platform=node --format=esm --packages=external` confirms `firebase/analytics`, `firebase/app`, `firebase/auth`, `firebase/firestore`, `firebase/functions`, `firebase/storage`, and `idb` are all pulled into the `/api/index.ts` bundle!
- Furthermore, `InvitationService.ts:447-448` dynamically imports `../../lib/firebase` and `firebase/firestore` on server `PERMISSION_DENIED`.

### Defect A3 — Firebase Admin Credential / Environment Mismatch on Vercel (`PROVEN_STATIC`)
- `.env.example:7-9` documents:
  ```env
  FIREBASE_ADMIN_PRIVATE_KEY=
  FIREBASE_ADMIN_CLIENT_EMAIL=
  ```
- `src/lib/firebaseAdmin.ts` **never reads `FIREBASE_ADMIN_PRIVATE_KEY` or `FIREBASE_ADMIN_CLIENT_EMAIL`**.
- Instead, `firebaseAdmin.ts:53-135` only checks:
  1. `GOOGLE_APPLICATION_CREDENTIALS`
  2. `FIREBASE_SERVICE_ACCOUNT_KEY` (raw JSON or base64)
  3. Local workspace `*-firebase-adminsdk-*.json` (excluded from Git via `.gitignore` and skipped if `project_id !== "finopsht"`)
  4. `applicationDefault()`
- On Vercel (`K_SERVICE` unset, no GCP Metadata Server, no local key JSON), if the operator configured `FIREBASE_ADMIN_PRIVATE_KEY` + `FIREBASE_ADMIN_CLIENT_EMAIL` per `.env.example` instead of `FIREBASE_SERVICE_ACCOUNT_KEY`, `applicationDefault()` has no valid credentials. (Note: `authenticateToken` catches Firestore errors as 503, but unhandled Admin SDK/network/ADC behavior in unguarded paths or `getAdminAuth()` can fail depending on call order.)

### Defect A4 — Vercel Routing & `express.json()` Request Stream Edge Case (`PROVEN_STATIC`, `INFERRED` at runtime)
- `vercel.json:8-9` rewrites `/api/(.*)` -> `/api`.
- `api/index.ts:12-15` attempts to restore `req.url` from `req.headers["x-invoke-path"] || req.headers["x-matched-path"] || req.url`. If Vercel passes `req.url = "/api"` without `x-invoke-path` (or passes `/api?` without the subpath), Express skips all `/api/cfo/analyze` routes and hits `app.use("/api", 404)`. (That would return JSON 404 rather than 500 `FUNCTION_INVOCATION_FAILED`, so it is secondary, not the primary 500 cause.)
- `server.ts:359` registers `app.use(express.json({ limit: "100mb" }))`; `node_modules/body-parser/lib/types/json.js:106` only bypasses stream reading if `req._body` is truthy. On `@vercel/node`, Vercel may pre-consume the request stream to populate `req.body` without setting `req._body = true`, risking stream hang/timeout (or body-parser hang until Vercel 10s/15s function timeout -> `FUNCTION_INVOCATION_FAILED`). *(Classified `INFERRED` pending live Vercel logs.)*

---

## 4. BLOCKED EVIDENCE (EXPLICIT DISCLOSURE)

- **Live Vercel Runtime Logs** for Request ID `284fw-1795280564074-1d876d98f4e7` in region `iad1`: **`BLOCKED`** (not accessible from local read-only sandbox).
- **Live Vercel Environment Variables** (`FIREBASE_SERVICE_ACCOUNT_KEY`, `FIREBASE_ADMIN_*`, `GEMINI_API_KEY`, Node.js runtime version, Vercel build output for `/api/index.ts`): **`BLOCKED`**.

Despite Vercel runtime logs being `BLOCKED`, **Defects A1 (ESM resolution) and A2 (`import.meta.env` + client `firebase/*` SDK crash in CJS serverless bundle) are `PROVEN_STATIC` and `PROVEN_RUNTIME` sufficient to deterministically crash `/api/index.ts` before `handler()` can respond.**
