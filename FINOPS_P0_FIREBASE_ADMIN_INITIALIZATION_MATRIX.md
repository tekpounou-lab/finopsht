# FINOPS P0 — Firebase Admin SDK Initialization Matrix

**Task ID:** `FINOPS-P0-API-FIRESTORE-REMEDIATION-01`  
**Target Module:** `src/lib/firebaseAdmin.ts`  
**Target Firebase Project:** `finopsht`  
**Target Named Firestore Database:** `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`  
**Evidence Status:** `PROVEN_STATIC` + `PROVEN_UNIT` (`P0ApiFirestoreRemediation.test.ts`, `FirebaseAdminSdkP0Integrity.test.ts`, `CloudRunPackagingAndAdcIntegrity.test.ts`)

---

## 1. Summary of Remediation

Prior to remediation, `src/lib/firebaseAdmin.ts` used static ESM JSON import (`import firebaseConfig from "../../firebase-applet-config.json" with { type: "json" }`) and did not cleanly resolve split Vercel credentials (`FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`), Base64/JSON `FIREBASE_SERVICE_ACCOUNT_KEY` payloads, or fail-fast sanitized Vercel errors without falling back to GCP Metadata ADC hangs or leaking key material.

The remediated `resolveFirebaseAdminConfig`, `normalizeAdminPrivateKey`, `readFirebaseAppletConfig`, `getAdminApp`, `getAdminFirestore`, and `getAdminAuth` provide deterministic, secret-safe resolution across Cloud Run, Vercel Node 22 ESM, and Local development runtimes.

---

## 2. Initialization Resolution Matrix

| Priority | Runtime Condition | Environment Variables Evaluated | Credential Source Identifier | Project & Named DB Binding | Failure / Rejection Mode | Verification Evidence |
|---:|---|---|---|---|---|---|
| **0** | Cloud Run (`K_SERVICE` set and not starting with `ais-`) | `K_SERVICE`, `GOOGLE_CLOUD_PROJECT` | `cloud_run_adc` (`applicationDefault()`) | `finopsht` / `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a` | Throws `ADC_INITIALIZATION_FAILED` (no secret exposure) | `PROVEN_UNIT` (`P0ApiFirestoreRemediation.test.ts`) |
| **1** | Vercel / Local (`FIREBASE_ADMIN_CLIENT_EMAIL` or `FIREBASE_ADMIN_PRIVATE_KEY` set) | `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` | `env_split_key` (`cert(...)` with `\n` normalization & outer-quote stripping) | `finopsht` / `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a` | Throws `FIREBASE_ADMIN_PROJECT_MISMATCH`, `FIREBASE_ADMIN_INCOMPLETE_ENV`, or `FIREBASE_ADMIN_INVALID_KEY_FORMAT` (no private key printed) | `PROVEN_UNIT` (`P0ApiFirestoreRemediation.test.ts`) |
| **2** | Local / Container (`GOOGLE_APPLICATION_CREDENTIALS` set) | `GOOGLE_APPLICATION_CREDENTIALS` | `google_application_credentials` (`cert(keyData)`) | Matches `keyData.project_id === targetProjectId` (`finopsht`) | Warns and skips mismatched foreign project key files without crashing | `PROVEN_STATIC` (`src/lib/firebaseAdmin.ts:192-221`) |
| **3** | Vercel / Container (`FIREBASE_SERVICE_ACCOUNT_KEY` set) | `FIREBASE_SERVICE_ACCOUNT_KEY` (raw JSON or Base64 JSON) | `service_account_json_env` (`cert(keyData)`) | Matches `keyData.project_id === targetProjectId` (`finopsht`) | Throws `FIREBASE_ADMIN_PROJECT_MISMATCH` or `FIREBASE_ADMIN_INVALID_SERVICE_ACCOUNT_KEY` on Vercel | `PROVEN_UNIT` (`P0ApiFirestoreRemediation.test.ts`) |
| **4** | Vercel (`VERCEL === "1"` or `VERCEL_ENV` set) with no credentials above | `VERCEL`, `VERCEL_ENV` | Fail-fast guard (skips local files and GCP Metadata ADC) | `finopsht` | Throws sanitized `FIREBASE_ADMIN_NOT_CONFIGURED` | `PROVEN_UNIT` (`P0ApiFirestoreRemediation.test.ts`) |
| **5** | Local dev workspace key file present | `service-account-key.json`, `*-firebase-adminsdk-*.json`, `*service-account*.json` | `local_key_file` (`cert(keyData)`) | Strictly skips foreign projects (e.g. `tek-pou-nou-tpn !== finopsht`) | Logs project mismatch warning and skips foreign key | `PROVEN_UNIT` (`CloudRunPackagingAndAdcIntegrity.test.ts`) |
| **6** | Local fallback (non-Vercel, non-Cloud Run) | Local ADC (`gcloud auth application-default`) | `local_adc_fallback` (`applicationDefault()`) | `finopsht` / `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a` | Logs sanitized warning; never falls back to client SDK | `PROVEN_UNIT` (`FirebaseAdminSdkP0Integrity.test.ts`) |

---

## 3. Security & Packaging Guarantees

1. **Zero Client SDK Proxy Fallback:** `getAdminFirestore()` returns a native `firebase-admin/firestore` `Firestore` instance bound to database `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a` (`PROVEN_UNIT`: `FirebaseAdminSdkP0Integrity.test.ts` 5/5 passed).
2. **Foreign Key Exclusion:** `.gcloudignore` and `.gitignore` exclude `*-firebase-adminsdk-*.json`, `service-account*.json`, and `tek-pou-nou-tpn-*.json`, while `resolveFirebaseAdminConfig()` validates `project_id === "finopsht"` (`PROVEN_UNIT`: `CloudRunPackagingAndAdcIntegrity.test.ts` 7/7 passed).
3. **No Secret Leakage in Errors:** Error paths (`FIREBASE_ADMIN_INVALID_KEY_FORMAT`, `FIREBASE_ADMIN_NOT_CONFIGURED`, `FIREBASE_ADMIN_INVALID_SERVICE_ACCOUNT_KEY`) never echo `FIREBASE_ADMIN_PRIVATE_KEY` or `FIREBASE_SERVICE_ACCOUNT_KEY` payloads (`PROVEN_UNIT`: verified in `P0ApiFirestoreRemediation.test.ts`).
4. **Live Vercel Production Credentials:** `NOT_TESTED` in this local sandbox (production Vercel env vars were intentionally not modified or accessed per strict safety boundary).
