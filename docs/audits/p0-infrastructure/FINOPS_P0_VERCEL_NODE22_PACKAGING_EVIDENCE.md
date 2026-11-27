# FINOPS P0 — Vercel Node 22 ESM & Server Packaging Evidence

**Task ID:** `FINOPS-P0-API-FIRESTORE-REMEDIATION-01`  
**Target Environment:** Vercel Serverless Functions (Node.js 22 ESM, `"type": "module"`) & Local/Cloud Run Node (`dist/server.cjs`)  
**Evidence Status:** `PROVEN_BUILD` + `PROVEN_STATIC` + `PROVEN_RUNTIME` (`Node v22.23.2`)

---

## 1. Root Causes Fixed

1. **Vercel Node 22 ESM Packaging Failure (`api/index.ts`):**
   - `package.json` declares `"type": "module"`, causing Node 22 on Vercel to execute `api/index.ts` in ESM mode. Extensionless TypeScript relative imports inside `server.ts` / `src/**` fail under Node 22 native ESM resolution, producing `FUNCTION_INVOCATION_FAILED` HTTP `500` on every `/api/*` request.
2. **Browser SDK & `import.meta.env` Leakage into Server Bundle (`server.ts`, `src/services/AICFOAuditService.ts`):**
   - `AICFOAuditService.ts` previously imported browser Firebase SDK (`firebase/firestore`) and `src/lib/firebase.ts` (`import.meta.env`), pulling client-only code and `idb` references into the Node backend bundle.
3. **Static ESM JSON Import (`src/lib/firebaseAdmin.ts`):**
   - Replaced static ESM JSON import of `firebase-applet-config.json` with `readFirebaseAppletConfig()` using `node:fs` / `node:path`.
4. **Vercel Rewrite Path/Query Loss & Pre-Consumed Body Hangs (`api/index.ts`):**
   - Rewrites from `vercel.json` (`/api/(.*)` -> `/api`) require reconstructing the original path from `x-invoke-path` or `x-matched-path` while preserving query parameters (`?token=...`), and setting `req._body = true` when Vercel pre-parses `Buffer` / string JSON bodies so Express `body-parser` does not hang waiting on an already-consumed stream.

---

## 2. Packaging & Entrypoint Configuration (`PROVEN_STATIC`)

| Component | File | Verified Configuration |
|---|---|---|
| Package Module Mode | `package.json:5` | `"type": "module"` |
| Build Pipeline | `package.json:8` | `vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --define:import.meta=undefined --sourcemap --outfile=dist/server.cjs && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --define:import.meta=undefined --sourcemap --outfile=api/_server.cjs` |
| Start Command | `package.json:9` | `node dist/server.cjs` |
| Vercel Routing | `vercel.json:6-18` | `buildCommand: "npm run build"`, `outputDirectory: "dist"`, `/api/(.*)` -> `/api`, `filesystem`, `/.*` -> `/index.html` |
| Vercel Serverless Wrapper | `api/index.ts:1-112` | Loads `api/_server.cjs` (fallback `dist/server.cjs`, dev fallback `../server.ts`) via `createRequire(import.meta.url)`; `normalizeVercelRequest(req)` restores path + query and sets `req._body = true`; catch block returns sanitized HTTP `500` `FUNCTION_INVOCATION_ERROR`. |

---

## 3. Build & Static Bundle Leak Scan (`PROVEN_BUILD` + `PROVEN_STATIC`)

- **`npx tsc --noEmit`:** `0` errors (`PASSED`).
- **`npm run build`:**
  - `vite build`: `PASSED` in `39.41s` (`dist/index.html` `3.35 kB` + production chunks).
  - `esbuild` -> `dist/server.cjs`: `540.6kb` (`dist/server.cjs.map` `951.3kb`) in `209ms`.
  - `esbuild` -> `api/_server.cjs`: `540.6kb` (`api/_server.cjs.map` `951.3kb`) in `195ms`.
- **Leak Scan Command:**
  ```bash
  grep -rnE "firebase/firestore|firebase/auth|\bidb\b|import\.meta\.env" dist/server.cjs api/_server.cjs
  ```
  - **Observed Result:** `CLEAN_ZERO_HITS` (`0` occurrences of browser Firestore/Auth SDKs, `idb`, or `import.meta.env`).

---

## 4. Node.js 22 ESM Live Runtime Harness (`PROVEN_RUNTIME`)

Executed under **`Node v22.23.2`** in strict ESM mode (`VERCEL=1 VERCEL_ENV=production node`) against the compiled ESM wrapper of `api/index.ts` loading `api/_server.cjs`:

| Assertion ID | Request Simulated | Observed Result | Evidence Tag |
|---|---|---|---|
| `RUNTIME_TEST_1_HEALTH_OK` | `GET /api` with `x-matched-path: /api/health` | HTTP `200`, JSON body `{"status":"ok",...}` | `PROVEN_RUNTIME` |
| `RUNTIME_TEST_2_QUERY_PRESERVED_OK` | `GET /api?token=test_tok_999` with `x-invoke-path: /api/invitations/lookup` | `req.url === "/api/invitations/lookup?token=test_tok_999"`; fails fast with sanitized HTTP `500` (no metadata hang, no secret leak) when Vercel Admin env vars are unset | `PROVEN_RUNTIME` |
| `RUNTIME_TEST_3_BODY_FORWARD_CFO_401_OK` | `POST /api/cfo/analyze` with pre-parsed string JSON body | `req._body === true`, JSON body parsed cleanly, unauthenticated request fails closed with HTTP `401` | `PROVEN_RUNTIME` |
| `RUNTIME_TEST_4_INVITATION_ACCEPT_401_OK` | `POST /api` with `x-invoke-path: /api/invitations/accept` and `Buffer` JSON body | `req.url === "/api/invitations/accept"`, `req._body === true`, unauthenticated request fails closed with HTTP `401` | `PROVEN_RUNTIME` |
| `RUNTIME_TEST_5_DIST_SERVER_CJS_OK` | `createRequire(import.meta.url)` importing `dist/server.cjs` | Module loaded cleanly and exported `createApp` function | `PROVEN_RUNTIME` |

---

## 5. Production Environment Status

- **Live Vercel Production Deployment (`vercel.app` / `iad1`):** `NOT_TESTED` in this local task (deployments and Vercel environment variable changes were intentionally excluded by safety boundaries).
