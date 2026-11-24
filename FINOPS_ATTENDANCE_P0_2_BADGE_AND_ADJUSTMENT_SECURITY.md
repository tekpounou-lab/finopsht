# FINOPS ERP — ATTENDANCE P0.2 BADGE CRYPTOGRAPHY & ADJUSTMENT SECURITY

**Audit ID:** `FINOPS-ATTENDANCE-P0.2`  
**Scope:** `GAP-ATT-06`, `GAP-ATT-07`, `GAP-ATT-08`  
**Verification Basis:** `PROVEN_STATIC` + `PROVEN_UNIT` + `PROVEN_INTEGRATION` (mocked Express `createApp()` HTTP pipeline)

---

## 1. Cryptographic QR / NFC Badge Hardening (`GAP-ATT-07 — CLOSED`)

### A. Client Kiosk Validation (`src/domains/attendance/clientActorResolver.ts:120-227`)
- **P0.1 Defect Resolved:** Previously `verifyScannedBadgeSecurity` wrapped signature comparison inside `if (signature)`, permitting unsigned plain-ID QR strings to pass client checks even when an `ACTIVE` signed badge existed.
- **P0.2 Controls Implemented:**
  1. **Tenant Isolation (`lines 139-154`):** Validates `emp` canonical `business_id` and `payloadBusinessId` against `currentBusinessId`; rejects mismatches with `CROSS_TENANT`.
  2. **Ambiguous Active Badge Rejection (`lines 156-167`):** Checks `allEmployeeBadges`; if `> 1` badge has `status === "ACTIVE"` for the employee, fails closed with `AMBIGUOUS_ACTIVE_BADGES`.
  3. **Active Badge Verification (`lines 171-217`):**
     - Verifies badge belongs to `currentBusinessId`.
     - Rejects `REVOKED` / `SUSPENDED` badges (`BADGE_REVOKED`) and expired `expiresAt` (`BADGE_EXPIRED`).
     - **Requires non-empty `signature` (`lines 197-203`)** — missing signature on an `ACTIVE` badge returns `INVALID_SIGNATURE`.
     - Compares `trimmedSig` strictly against persisted `activeBadge.signature` or `activeBadge.tokenHash` (`lines 205-217`), rejecting weak forged strings.
  4. **Signed QR Requirement When No Badge Doc Cached (`lines 218-224`):** When `requireSignature === true` (default for QR scans in `useQRScanner.ts:203` and `UnifiedAttendanceKioskModal.tsx:380`), unsigned QR payloads fail closed with `INVALID_SIGNATURE`.

### B. Server Badge Verification (`src/domains/attendance/ServerAttendanceService.ts:473-604`)
- **P0.1 Defect Resolved:** Previously `verifyBadgeIfProvided` returned early when `badgeId`, `qrSignature`, and `badgePayload` were omitted even for `method === "QR"`.
- **P0.2 Controls Implemented:**
  1. **Mandatory Verification for `QR` and `NFC` (`lines 484-491`):** `isBadgeMethod = normalizedMethod === "QR" || normalizedMethod === "NFC"`. Only `MANUAL` / `BIOMETRIC` without badge fields can skip badge lookup; `QR` and `NFC` **always** require badge verification.
  2. **Payload Integrity (`lines 493-528`):** Rejects malformed JSON (`403 FORGED_BADGE_PAYLOAD`), `employee_id != targetEmployeeId` (`403 FORGED_BADGE_PAYLOAD`), and `business_id != canonicalBusinessId` (`403 FORBIDDEN_TENANT_CLAIM`).
  3. **Mandatory Cryptographic Signature (`lines 530-540`):** Rejects missing `qrSignature` / `parsedPayload.signature` with `403 INVALID_BADGE_SIGNATURE`.
  4. **Duplicate Active Badge Guard (`lines 542-559`):** Queries `employee_badges` for `targetEmployeeId`; if `activeEmpBadges.length > 1`, rejects with `409 AMBIGUOUS_ACTIVE_BADGES`.
  5. **State, Tenant, Ownership, Expiry & Signature Match (`lines 561-603`):**
     - Missing badge doc -> `404 BADGE_NOT_FOUND`.
     - Cross-tenant badge -> `403 CROSS_TENANT_ATTENDANCE_DENIED`.
     - Wrong `employeeId` -> `403 FORGED_BADGE_PAYLOAD`.
     - `status !== "ACTIVE"` -> `403 BADGE_NOT_ACTIVE`.
     - Expired `expiresAt` -> `403 BADGE_EXPIRED`.
     - Signature mismatch against `badgeDoc.signature` / `badgeDoc.tokenHash` -> `403 INVALID_BADGE_SIGNATURE`.
- **Token Entropy (`src/repositories/BadgeRepository.ts:69-83`):** Uses `globalThis.crypto.getRandomValues` / `crypto.randomUUID` for badge IDs and signatures. *(Note: `EmployeeRepository.createEmployee` lines 600-622 still generates a deterministic onboarding `btoa` preview signature; server verification validates equality against the persisted Firestore `employee_badges` document, so an attacker cannot forge a badge without write access to `employee_badges`, which is restricted to `isTenantAdminOrManager` in `firestore.rules:1408`.)*
- **Verified By Tests:** `AttendanceP02SecurityRemediation.test.ts` Tests `4.1`, `4.2`, `4.3`, `4.4` (`PROVEN_UNIT` + `PROVEN_INTEGRATION`).

---

## 2. Explicit Delegation Scope Closure (`GAP-ATT-06 — CLOSED_STATIC_AND_UNIT_PENDING_EMULATOR`)

- **Backend Domain (`AttendanceAuthorizationService.ts:349-370`):**
  - `hasExplicitTellerDelegation`:
    - Allows if target ID is explicitly in `actor.delegatedEmployeeIds`.
    - Otherwise, when `actor.explicitAttendanceDelegation === true`:
      - If `actor.delegatedBranchIds` is non-empty, requires `targetBranchId` to be included in `delegatedBranchIds`.
      - Otherwise computes `actorBranches = getActorAuthorizedBranchSet(actor)` and **fails closed** (`return false`) when `actorBranches.size === 0 || !targetBranchId`.
- **Trusted Actor Source (`ServerAttendanceService.ts:344-377`):** Reads `explicitAttendanceDelegation`, `delegatedEmployeeIds`, `delegatedBranchIds`, `authorizedBranchIds`, `authorizedDepartmentIds`, and `authorizedTeamIds` **exclusively** from server-protected `users/{uid}`.
- **Firestore Rules Alignment (`firestore.rules:321-338, 429-445`):** Mirrors `delegatedEmployeeIds`, `delegatedBranchIds`, `authorizedBranchIds`, `authorizedBranches`, and non-empty `getActorBranchId()`.
- **Verified By Tests:** `AttendanceP02SecurityRemediation.test.ts` Tests `2.1`, `2.2` and `P0RbacOperationalRolesVerification.test.ts` (`12/12`).

---

## 3. Adjustment Workflow, Maker-Checker & Payroll Lock Enforcement (`GAP-ATT-08 — CLOSED_STATIC_AND_UNIT_PENDING_EMULATOR`)

### A. Creation (`POST /api/attendance/adjustments` — `ServerAttendanceService.ts:1950-2062`)
1. Validates `sessionId`, `requestedHours` in `[0, 24]` (`422 INVALID_ADJUSTMENT_HOURS`), and non-empty `reason` (`422 REASON_REQUIRED`).
2. Authorizes actor via `authorizeAndResolveContext(..., "check_in", ...)`: self-service employees/tellers can request for themselves; `SUPERVISOR`/`MANAGER`/`OWNER` within authorized scope; `AUDITOR` denied.
3. Inside `adminDb.runTransaction`:
   - Loads `attendance_sessions/{sessionId}` and `attendance_logs/{sessionId}`, verifying tenant parity and target `employeeId` ownership.
   - Verifies date via `verifyPayrollPeriodUnlockedInTransaction` (`423 PAYROLL_PERIOD_LOCKED`).
   - Persists `attendance_adjustment_requests/{requestId}` with **both** `business_id` and `businessId` set to `canonicalBusinessId`, `status: "REQUESTED"`, `requestedBy: actor.uid`, `recordedBy: actor.uid`, and transactional `audit_logs` entry.

### B. Approval / Rejection (`POST /api/attendance/adjustments/approve` — `ServerAttendanceService.ts:2064-2293`)
1. **Strict RBAC Gate (`lines 2096-2106`):** Authorizes `action: "approve_adjustment"` in `AttendanceAuthorizationService.ts:586-607` — strictly limited to `OWNER`, `ADMIN`, `OWNER_ADMIN`, `MANAGER`, and `SUPER_ADMIN`. **`SUPERVISOR`, `TEAM_LEADER`, `HEAD_TELLER`, tellers, and `EMPLOYEE` are rejected (`403 ADJUSTMENT_APPROVAL_FORBIDDEN`); `AUDITOR` is rejected (`403 FORBIDDEN_ATTENDANCE_ROLE`).**
2. **Replay Guard (`lines 2133-2138`):** Transactionally verifies `tRequest.status === "REQUESTED"`; re-approving returns `409 ADJUSTMENT_ALREADY_PROCESSED`.
3. **Maker-Checker Enforcement (`lines 2140-2146`):** Enforces `String(tRequest.requestedBy || "").trim() === actor.uid` -> throws `403 MAKER_CHECKER_VIOLATION` even for `OWNER` or `MANAGER` who initiated the request!
4. **Transactional Payroll Lock (`lines 2161-2179`):** Resolves date and verifies `verifyPayrollPeriodUnlockedInTransaction` inside `runTransaction`.
5. **SSOT Synchronization (`lines 2181-2290`):** When `APPROVED`, atomically updates `attendance_sessions`, `attendance_logs`, `attendance_records` (preventing payroll SSOT drift), `attendance_events`, `attendance_adjustment_requests` (`status: "APPROVED"`, `approvedBy: actor.uid`), and `audit_logs`.
6. **Client & Rules Hardening:** `AttendanceRepository.createAdjustmentRequest`/`approveAdjustmentRequest` route exclusively to `/api/attendance/adjustments*` (`lines 483-542`), and `firestore.rules:1413-1417` enforces `allow create, update, delete: if false;`.
- **Verified By Tests:** `AttendanceP02SecurityRemediation.test.ts` Tests `5.1`, `5.2`, `5.3` (`PROVEN_INTEGRATION` mocked).
