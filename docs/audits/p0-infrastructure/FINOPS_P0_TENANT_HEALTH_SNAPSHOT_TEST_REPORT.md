# FINOPS P0 — Tenant-Scoped Health Snapshot Test Report

**Task ID:** `FINOPS-P0-API-FIRESTORE-REMEDIATION-01`  
**Modified Files:**
- `src/modules/admin/types.ts`
- `src/modules/admin/AdminRepository.ts`
- `src/modules/admin/MonitoringService.ts`
- `src/modules/runtime/JobEngine.ts`
- `src/modules/runtime/RuntimeEngine.ts`
- `src/modules/runtime/SynchronizationEngine.ts`
- `src/components/admin/ControlTower.tsx`
- `src/contexts/BusinessContext.tsx`
- `firestore.rules` (`/enterprise_health_snapshots/{id}`)

**Test Suite:** `src/tests/unit/security/P0ApiFirestoreRemediation.test.ts` — Fix D tests (6/6 passed — `PROVEN_UNIT`)

---

## 1. Root Cause Fixed

Previously:
1. `JobEngine` and `MonitoringService` reported health without `businessId`, causing `AdminRepository.reportHealth` to write unscoped documents `enterprise_health_snapshots/JOB_ENGINE` and `enterprise_health_snapshots/MONITORING_SERVICE` without `business_id`.
2. Even when `businessId` was present, `AdminRepository.reportHealth` formed `${health.name}_${health.businessId}` rather than `${businessId}_${moduleName}`.
3. `SynchronizationEngine.registerHealthHeartbeat` passed `serverTimestamp()` into `lastUpdate`, which `String(health.lastUpdate)` coerced to `"[object Object]"`.
4. `ControlTower` called `AdminRepository.subscribeToHealth(setHealthData)` without tenant scoping, triggering an unscoped collection `LIST` against `enterprise_health_snapshots`.
5. `MonitoringService.handleSystemError` fell back to `businessId: "SYSTEM"`, causing unauthorized `enterprise_incidents` writes.

---

## 2. Implemented Controls

1. **`AdminRepository.ts` (`isValidHealthTenantId`, `reportHealth`, `createIncident`, `subscribeToHealth`):**
   - Rejects empty, `"none"`, `"default"`, `"biz_default"`, `"global"`, `"system"`, `"undefined"`, `"null"` tenant IDs.
   - `reportHealth` skips writes cleanly if neither a valid `businessId` nor `isPlatformMonitor: true` is set.
   - Tenant health doc IDs follow `${validBizId}_${moduleName}`, aligning 1:1 with `firestore.rules` (`id == (getBusinessId(request.resource.data) + '_' + request.resource.data.get('name', ''))`).
   - Ensures `lastUpdate` is always a valid ISO string.
   - `subscribeToHealth` skips unscoped `LIST` queries when `!options?.isSuperAdmin && !validBizId`, and uses `where("business_id", "==", validBizId)` for tenant actors.
   - `createIncident` skips writes when `businessId` is not a valid tenant ID.
2. **Lifecycle Propagation (`BusinessContext.tsx` -> `RuntimeEngine.ts` -> `JobEngine.ts` & `MonitoringService.ts`):**
   - `BusinessContext` sets `RuntimeEngine.setBusinessContext(business_id, { isSuperAdmin })` once authenticated and active, and resets to `null` on logout/cleanup.
   - `JobEngine.shutdown()` and `MonitoringService.stop()` clear background health reporting intervals and reset tenant context.
   - `SynchronizationEngine` clears previous heartbeat intervals and sends ISO timestamps (`new Date().toISOString()`).
3. **`ControlTower.tsx`:**
   - Subscribes via `useIdentity()` with `{ businessId: identity?.business?.id || null, isSuperAdmin: role === "SUPER_ADMIN" }`.

---

## 3. Observed Test Results

| Test Case | Suite | Observed Result | Evidence Tag |
|---|---|---|---|
| Unscoped `reportHealth` (`undefined`, `"none"`, `"SYSTEM"`) skips Firestore write | `P0ApiFirestoreRemediation.test.ts` | PASSED (`mockSetDoc` 0 calls) | `PROVEN_UNIT` |
| Tenant-scoped `reportHealth` writes `enterprise_health_snapshots/biz_alpha_JOB_ENGINE` with `business_id` & ISO `lastUpdate` | `P0ApiFirestoreRemediation.test.ts` | PASSED (`lastUpdate` string, never `"[object Object]"`) | `PROVEN_UNIT` |
| `subscribeToHealth` without SuperAdmin or valid `businessId` skips `onSnapshot` | `P0ApiFirestoreRemediation.test.ts` | PASSED (`mockOnSnapshot` 0 calls) | `PROVEN_UNIT` |
| `subscribeToHealth` for tenant user adds `where("business_id", "==", "biz_alpha")` | `P0ApiFirestoreRemediation.test.ts` | PASSED (`mockWhere` + `mockQuery` verified) | `PROVEN_UNIT` |
| `RuntimeEngine.setBusinessContext` routes tenant scope to `JobEngine` & `MonitoringService` and clears on `null` | `P0ApiFirestoreRemediation.test.ts` | PASSED (`biz_beta_JOB_ENGINE`, `biz_beta_MONITORING_SERVICE`, 0 writes after reset) | `PROVEN_UNIT` |
| `AdminRepository.createIncident` skips `"SYSTEM"` incidents | `P0ApiFirestoreRemediation.test.ts` | PASSED (`mockSetDoc` 0 calls) | `PROVEN_UNIT` |

---

## 4. Emulator Limitation

- Live Firestore rules execution against the Firestore Emulator is `BLOCKED` due to missing `java` binary (`JAVA_NOT_INSTALLED`), though static rule assertions confirm alignment (`PROVEN_STATIC`).
