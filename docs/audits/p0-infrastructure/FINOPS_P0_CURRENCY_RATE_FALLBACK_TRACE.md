# INCIDENT D — `CurrencyRateRepository` FALLBACK TO DEFAULT RATE GRID FORENSIC TRACE

**Audit ID:** `FINOPS-P0-API-FIRESTORE-INCIDENT-01`  
**Mode:** STRICT READ-ONLY  
**Observed Symptom:** `CurrencyRateRepository` logs `[CurrencyRateRepository] Fallback to default rate grid:` and returns hardcoded `DEFAULT_RATE_GRID_VALUES` (`ACHAT_CLIENT: 132.0`, `VENTE_CLIENT: 136.5`, `BRH: 134.25`, etc.) instead of inheriting the business's previous valid rate grid.

---

## 1. FORENSIC CONCLUSION (`PROVEN_STATIC`)

**Incident D IS directly caused by Incident C2 (Firestore `batchGet` HTTP 403 on missing document reads), combined with an unisolated `try/catch` block inside `CurrencyRateRepository.getTodayRatesWithFallback`.**

It is **NOT** caused by a missing Firestore index or by `getRatesForPeriod` failing.

---

## 2. LINE-BY-LINE EXECUTION TRACE

File: `src/repositories/CurrencyRateRepository.ts:205-288` (`getTodayRatesWithFallback`)

1. **Line 209–210:** Computes deterministic daily document ID:
   ```ts
   const todayStr = targetDateStr || getHaitiDateString();
   const docId = `fx_grid_${businessId}_${todayStr}`;
   ```
2. **Line 212–216 (Step 1 — Direct `getDoc` lookup):**
   ```ts
   try {
     if (db) {
       // 1. Check exact match for targetDate
       const ref = doc(db, this.GRIDS_COLLECTION, docId);
       const snap = await getDoc(ref);
   ```
   - `getDoc(ref)` dispatches a Firestore `:batchGet` RPC for `daily_exchange_rate_grids/fx_grid_${businessId}_${todayStr}`.
3. **Rule Evaluation (`firestore.rules:724-725`):**
   ```javascript
   match /daily_exchange_rate_grids/{gridId} {
     allow read: if isAuthenticated() && (isSuperAdmin() || isTenantScoped(getBusinessId(resource.data)));
   ```
   - **Case 1 (Today's grid exists):** `resource` is non-null, `getBusinessId(resource.data)` matches `businessId`, `isTenantScoped` passes -> returns today's grid.
   - **Case 2 (Today's grid has NOT been created yet — normal start-of-day state for any non-SuperAdmin user):**
     `resource` is `null`. Firestore Security Rules attempt to evaluate `resource.data` inside `getBusinessId(resource.data)` **without a `resource != null` guard** -> Security Rules evaluation fails -> Firestore returns **HTTP 403 `FirebaseError: Missing or insufficient permissions`** on `:batchGet`!
4. **Control-Flow Short-Circuit (`CurrencyRateRepository.ts:216 -> 268-270`):**
   - Because `await getDoc(ref)` throws `FirebaseError (permission-denied)` at line 216, **lines 237–266 (Step 2: historical inheritance query `resilientGetDocs(query(collection(db, "daily_exchange_rate_grids"), where("businessId", "==", businessId), where("effectiveDate", "<=", todayStr), orderBy("effectiveDate", "desc"), limit(1)))`) NEVER EXECUTE!**
   - Execution immediately jumps to `catch (err)` at **line 268**:
     ```ts
     } catch (err) {
       console.warn("[CurrencyRateRepository] Fallback to default rate grid:", err);
     }
     ```
5. **Lines 273–287:** Returns hardcoded `DEFAULT_RATE_GRID_VALUES` (`actorId: "SYSTEM_FALLBACK"`), silently discarding any prior day's custom tenant rates in Firestore!

---

## 3. AFFECTED CALLERS & RELATED METHODS (`PROVEN_STATIC`)

| Method / Caller | Location | Impact |
| :--- | :--- | :--- |
| `CurrencyRateRepository.getTodayRatesWithFallback` | `src/repositories/CurrencyRateRepository.ts:205-288` | Aborts before historical fallback when today's doc is absent -> returns static `DEFAULT_RATE_GRID_VALUES`. |
| `CurrencyRateRepository.getRateAtDate` / `getLatestRate` / `convert` | `src/repositories/CurrencyRateRepository.ts:562-603, 773-787` | Delegates to `getTodayRatesWithFallback` -> caches & computes conversions using default `134.25` instead of tenant's latest grid. |
| `CurrencyRateRepository.syncYesterdayRatesToToday` | `src/repositories/CurrencyRateRepository.ts:294-381` | **Line 304** executes `await getDoc(ref)` on `fx_grid_${businessId}_${todayStr}` with **no `try/catch`** -> throws uncaught HTTP 403 `PERMISSION_DENIED` whenever today's grid doesn't exist yet! |
| Active UI / Engine Consumers | `TodayRatesEditor.tsx:142,182`, `TellerTransactionModal.tsx:65`, `TellerTransactionEngine.ts:226,239,255`, `useBIDataAggregation.ts:102`, `ReportCenterConsole.tsx:148` | Cash & BI views silently fall back to `DEFAULT_RATE_GRID_VALUES` (or fail auto-inheritance). |
| `CurrencyRateRepository.getRatesForPeriod` | `src/repositories/CurrencyRateRepository.ts:793-822` | Uses `query(..., where("businessId", "==", businessId), ...)` + `resilientGetDocs` (Firestore `:runQuery`, not `getDoc` `:batchGet`), so `list` only evaluates existing documents and is **unaffected** by the null-resource `getDoc` bug. |

---

## 4. WHY UNIT TESTS MISSED THIS (`PROVEN_UNIT`)

- `src/tests/repositories/CurrencyRateRepository.test.ts` (5/5 passing) and `src/tests/unit/CentralExchangeRatesModule.test.ts` (18/18 passing) were both executed and verified.
- In `CurrencyRateRepository.test.ts:18`, `firebase/firestore` is mocked with:
  ```ts
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false, data: () => null }))
  ```
- Because the unit test mock resolves `{ exists: () => false }` instead of simulating Firestore Rules' `PERMISSION_DENIED` rejection on `resource == null`, lines 237–245 ran in unit tests while failing in live production Firestore.
