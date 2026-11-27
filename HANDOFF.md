# FINOPS ERP / FINAYITI Fusion — Agent Handoff & Continuation Guide

**Last Updated:** 2026-11-27  
**App Name (`metadata.json`):** `FinOps (Tek Pou Nou)`  
**Firebase Project:** `finopsht` (Project Number: `231531725507`)  
**Named Firestore Database:** `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`  
**Production Deployment Policy:** Do **NOT** deploy to Vercel, deploy Firestore rules, modify IAM/secrets, or commit/push without explicit user authorization.

---

## 1. Start Here (For Any Coding Agent)

Read these files in order before writing code:
1. [`GEMINI.md`](./GEMINI.md) — Master engineering constitution (architecture-first, repository pattern, multi-tenancy, Maker-Checker, RBAC).
2. [`HANDOFF.md`](./HANDOFF.md) (this file) — Current runtime reality, recent changes, container gotchas, and exact next tasks.
3. [`docs/FINOPS_CERTIFIED_BASELINE.md`](./docs/FINOPS_CERTIFIED_BASELINE.md) — Frozen accounting core & change-control governance levels (`Level 0`–`Level 4`).
4. [`docs/README.md`](./docs/README.md) — Index of domain architecture specs, ADRs, and categorized audit reports.

---

## 2. Where We Left Off (Current State)

### A. Vercel OIDC / Google Workload Identity Federation (WIF) for Firebase Admin
Implemented passwordless server-side authentication on Vercel without static service-account JSON keys (`ADR-019`):
- **Core Module:** `src/lib/firebaseAdmin.ts`
  - Added `vercel_wif` credential resolution using `@vercel/oidc` (`getVercelOidcToken()`), `google-auth-library` (`ExternalAccountClient`, `GoogleAuth`), and `@google-cloud/firestore`.
  - Added `buildVercelWifExternalAccountConfig()` and `VercelWifCredential` (implements `firebase-admin/app` `Credential`).
  - **Lazy token acquisition:** `getVercelOidcToken()` is **never** invoked at module initialization or inside `buildVercelWifExternalAccountConfig()`; it is only called inside `subject_token_supplier.getSubjectToken()` when an actual token exchange occurs.
  - **Named DB strictness:** `getAdminFirestore()` uses dedicated `@google-cloud/firestore` with `GoogleAuth` + `ExternalAccountClient` when `vercel_wif` is active (because `firebase-admin/firestore` rejects custom `Credential` implementations) and **always** binds to `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a` (refuses `(default)`).
  - Preserved `cloud_run_adc` (when `K_SERVICE` is set and not `ais-*`), `env_split_key`, `google_application_credentials`, `service_account_json_env`, `local_key_file`, and `local_adc_fallback`.
  - Fails fast on Vercel (`VERCEL === "1"` or `VERCEL_ENV`) if neither complete WIF config nor static fallback credentials are present.
- **Vercel Serverless Entrypoint:** `api/index.ts` + `vercel.json`
  - Wraps Express `createApp()` from `api/_server.cjs` (produced by `npm run build`), normalizes `x-invoke-path` / `x-matched-path` URLs and pre-parsed JSON bodies (`req._body = true`), and sanitizes init errors without leaking tokens or keys.
- **Dependencies Added (`package.json`):**
  - `@google-cloud/firestore`: `^7.11.6`
  - `@vercel/oidc`: `^5.0.0`
  - `google-auth-library`: `^10.9.1`
- **Environment Template (`.env.example`):**
  - Documented `GCP_PROJECT_NUMBER`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`, `GCP_SERVICE_ACCOUNT_EMAIL`, `FIREBASE_ADMIN_PROJECT_ID` (intentionally no `VERCEL_OIDC_TOKEN` entry).
- **Security Unit Tests:** `src/tests/unit/security/VercelWifFirebaseAdmin.test.ts` (12 tests covering config validation, lazy OIDC invocation, WIF token exchange, named DB binding, Cloud Run ADC preservation, and static fallback preservation).

### B. Root Workspace Cleanup & Documentation Organization
- Removed 16 obsolete one-off scratch/patch/debug scripts from `/` after confirming zero live references in `src/`, `tests/`, `scripts/`, `api/`, `functions/`, `server.ts`, or configs (`dummy.txt`, `fix*.cjs`, `patch*.cjs`, `test-*.js`).
- Reorganized 97 root `FINOPS_*` audit/matrix/diff files into categorized subdirectories under `docs/audits/`:
  - `docs/audits/attendance/` (24 files)
  - `docs/audits/business-intelligence/` (21 files)
  - `docs/audits/p0-infrastructure/` (19 files)
  - `docs/audits/rbac/` (33 files)
- Preserved all essential root files (`package.json`, `package-lock.json`, `bun.lock`, `firebase-applet-config.json`, `firebase-blueprint.json`, `firebase.json`, `firestore.indexes.json`, `firestore.rules`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `vercel.json`, `server.ts`, `.gcloudignore`, `.eslintrc.cjs`, `.env.example`, `metadata.json`, `index.html`, `GEMINI.md`, `README.md`).

### C. Reproducible Docker Configuration (Development & Validation)
- Added multi-stage `Dockerfile` (pinned `node:22.14.0-bookworm-slim`, `npm ci`, `builder` stage running `npm run build`, optional `prod-preview` stage, and default `dev` stage running `npm run dev` on `0.0.0.0:${PORT:-3000}` as non-root `node`).
- Added `.dockerignore` excluding `node_modules/`, `dist/`, `api/_server.cjs*`, `.env*` (except `.env.example`), Firebase key JSONs, and scratch artifacts.
- Synchronized `package-lock.json` via `npm install --package-lock-only` and verified `npm ci --dry-run` passes.
- Note: Docker CLI/daemon (`docker`) is not installed in the AI Studio container, so `docker build` / `docker run` runtime container tests must be executed in a Docker-enabled host/CI environment.

---

## 3. Critical Technical Facts & Discrepancies to Know

1. **Named Firestore Database Is Mandatory:**
   - Do **NOT** rely on `docs/deployment.md` where it lists `(default)` as the Firestore database ID. That table reflects an earlier planned template.
   - Real runtime config (`firebase-applet-config.json` & `src/lib/firebaseAdmin.ts`) strictly uses `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`.
2. **`bun.lock` vs. `package-lock.json`:**
   - `package-lock.json` has been synchronized with `package.json` via `npm install --package-lock-only` (`npm ci --dry-run` verified). Whenever new packages are added in AI Studio (which updates `bun.lock`), re-run `npm install --package-lock-only` so `npm ci` stays reproducible.
3. **Linting Behavior (`package.json` vs `.eslintrc.cjs`):**
   - `package.json` defines `"lint": "tsc --noEmit"`. `.eslintrc.cjs` exists at root, but `eslint` is not installed in `package.json`.
   - In AI Studio, always verify TypeScript with `npx tsc --noEmit` sequentially.
4. **Low-Memory Container Constraints (4–5 GB RAM, 0 Swap):**
   - **NEVER** run `npm run build`, `tsc --noEmit`, and `vitest` concurrently. Run heavy commands strictly **one at a time**.
   - Always pass `--maxWorkers=1` to Vitest (`npx vitest run --maxWorkers=1`) to prevent worker OOM kills.
5. **No `.git` Directory in AI Studio Container:**
   - The synced `/app/applet` workspace does not include `.git/`, so `git status` / `git diff` commands are unavailable in this runtime.
6. **Non-Negotiable Domain Guardrails:**
   - All Firestore client persistence goes through `src/repositories/` (never directly from React components).
   - Server routes requiring privileged writes use `getAdminFirestore()` / `getAdminAuth()` and `serverAuthMiddleware.ts` (`verifyIdToken(token, true)`).
   - Maker-Checker (`requesterId !== approverId`) and multi-tenant isolation (`business_id`) must remain enforced server-side and in `firestore.rules`.
   - Never weaken `firestore.rules` to allow client writes to `users`, `employees`, `invitations`, or membership/tenant identity collections.

---

## 4. Exact Pending Next Steps

1. **Docker Build & Container Runtime Verification (Host with Docker Engine):**
   - Run `docker build -t finops-erp:dev .`, start with `-e PORT=3000 --env-file .env.local`, verify `/api/health`, `/`, `/src/main.tsx`, `npx tsc --noEmit`, targeted security Vitest suites, image size, and `docker history` / `docker inspect` (zero secrets/WIF tokens baked into image layers).
2. **Full Repository Test Sweep & Dependency Audit (Local):**
   - Run full Vitest suite sequentially: `npx vitest run --maxWorkers=1`
   - Run `npm audit` and review advisory output.
3. **Verify GCP & Vercel Production WIF Configuration (Authorized Ops Step Only):**
   - Confirm GCP APIs enabled on `finopsht` (`231531725507`): `sts.googleapis.com`, `iamcredentials.googleapis.com`, `firestore.googleapis.com`, `identitytoolkit.googleapis.com`.
   - Confirm Vercel Production environment variables are set (and not overridden by stale/corrupt `FIREBASE_ADMIN_PRIVATE_KEY` or `FIREBASE_SERVICE_ACCOUNT_KEY` unless fallback is intended):
     - `GCP_PROJECT_NUMBER=231531725507`
     - `GCP_WORKLOAD_IDENTITY_POOL_ID=vercel-finops`
     - `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=vercel-finops`
     - `GCP_SERVICE_ACCOUNT_EMAIL=finops-backend-sa@finopsht.iam.gserviceaccount.com`
     - `FIREBASE_ADMIN_PROJECT_ID=finopsht`
4. **Authorized Post-Deploy Smoke Verification:**
   - After explicit deployment approval, verify `/api/health`, `GET /api/invitations/lookup?token=...` (test fixture), and `POST /api/invitations/accept` in production without exposing tokens or altering real user records.
5. **Product Roadmap Continuity:**
   - Refer to [`docs/roadmap.md`](./docs/roadmap.md) and [`GEMINI.md`](./GEMINI.md) §26 for Sprint 10+ priorities (multi-currency FX engine hardening, bulk-import workflows, billing/subscriptions stabilization, offline sync hardening).
