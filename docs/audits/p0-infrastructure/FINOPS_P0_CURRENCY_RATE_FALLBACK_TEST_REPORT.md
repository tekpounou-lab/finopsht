# FINOPS P0 — Currency Rate Repository Fallback Remediation Test Report

**Task ID:** `FINOPS-P0-API-FIRESTORE-REMEDIATION-01`  
**Target File:** `src/repositories/CurrencyRateRepository.ts`  
**Test Suites:**
- `src/tests/unit/CentralExchangeRatesModule.test.ts` (18/18 passed — `PROVEN_UNIT`)
- `src/tests/unit/security/P0ApiFirestoreRemediation.test.ts` — Fix C tests (5/5 passed — `PROVEN_UNIT`)

---

## 1. Root Cause Fixed

Previously, `CurrencyRateRepository.getTodayRatesWithFallback` and `CurrencyRateRepository.syncYesterdayRatesToToday` wrapped both:
1. Today's single-document `getDoc(doc(db, "daily_exchange_rate_grids", docId))`, and
2. Historical query fallback `resilientGetDocs(...)`

inside a single `try/catch` block that treated exceptions uniformly or fell through to `DEFAULT_RATE_GRID_VALUES`. When `getDoc` hit a Firestore `permission-denied` error (due to missing-document `resource.data` null dereference) or auth/network failure, the shared catch masked the root error or aborted historical fallback improperly.

---

## 2. Implemented Changes

1. **Pure Date Helper Decoupling:** Re-exported `getHaitiDateString` and `getPreviousHaitiDateString` from `src/utils/dateUtils.ts` (`CurrencyRateRepository.ts:18-20`).
2. **Error Classification Helpers (`CurrencyRateRepository.ts:22-40`):**
   - `isFirestorePermissionOrAuthError(err)`: detects `permission-denied`, `permission_denied`, `missing or insufficient permissions`, `unauthenticated`, `auth/`.
   - `isFirestoreNotFoundError(err)`: detects `not-found` / `not_found`.
3. **Isolated `try/catch` Boundaries (`getTodayRatesWithFallback` & `syncYesterdayRatesToToday`):**
   - Today's `getDoc(ref)` executes in its own `try/catch`. Permission, auth, network, and unexpected errors throw immediately without silently falling back to statutory defaults. Only `!snap.exists()` or genuine `not-found` proceeds to historical fallback.
   - Historical `resilientGetDocs` executes in a second isolated `try/catch`. Permission, auth, network, and unexpected errors propagate loudly; only an empty historical query returns `DEFAULT_RATE_GRID_VALUES`.

---

## 3. Observed Test Results

| Test Case | Suite | Observed Result | Evidence Tag |
|---|---|---|---|
| Missing today doc (`exists() === false`) -> inherits historical grid | `P0ApiFirestoreRemediation.test.ts` | PASSED (`141.5`, `is_inherited: true`, `fallbackDate: "2026-11-20"`) | `PROVEN_UNIT` |
| Today `getDoc` throws `not-found` -> inherits historical grid | `P0ApiFirestoreRemediation.test.ts` | PASSED (`139.0`) | `PROVEN_UNIT` |
| Today `getDoc` throws `permission-denied` -> propagates error, skips fallback query | `P0ApiFirestoreRemediation.test.ts` | PASSED (rejected with `/Missing or insufficient permissions/`, `resilientGetDocs` 0 calls) | `PROVEN_UNIT` |
| Missing today doc + historical query throws `permission-denied` -> propagates error | `P0ApiFirestoreRemediation.test.ts` | PASSED (rejected with `/Missing or insufficient permissions/`) | `PROVEN_UNIT` |
| `syncYesterdayRatesToToday` throws `permission-denied` -> propagates, zero `setDoc` writes | `P0ApiFirestoreRemediation.test.ts` | PASSED (rejected, `setDoc` 0 calls) | `PROVEN_UNIT` |
| Full Central Exchange Rates domain suite (LOCAL lock, RBAC, tenant isolation, inheritance, batch write) | `CentralExchangeRatesModule.test.ts` | PASSED (18/18 tests, 209ms) | `PROVEN_UNIT` |

---

## 4. Environment & Emulator Status

- **Live Firestore Emulator Rule Evaluation:** `BLOCKED` (`java` runtime not installed in this container: `JAVA_NOT_INSTALLED`).
- **Firestore Rules Alignment (`firestore.rules:786-800`):** `allow get` on `daily_exchange_rate_grids/{gridId}` explicitly allows `(resource == null && isOwnTenantDailyRateGridId(gridId))` so missing today grid reads for a tenant's own `fx_grid_<businessId>_YYYY-MM-DD` succeed cleanly (`PROVEN_STATIC`).
