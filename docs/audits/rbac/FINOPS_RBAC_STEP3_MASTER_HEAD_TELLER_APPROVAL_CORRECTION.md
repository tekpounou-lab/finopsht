# FINOPS ERP / FINAYITI FUSION
## RBAC STEP 3 CORRECTION — `MASTER_HEAD_TELLER` INTERNAL TRANSFER-APPROVAL AUTHORITY RESTRICTION

**Correction ID:** `FINOPS-RBAC-STEP3-MHT-APPROVAL-CORRECTION-01`  
**Scope:** Mandatory removal of internal transfer approval/rejection authority from `MASTER_HEAD_TELLER` while preserving multi-branch cash operations, transfer initiation, till supervision, till closure/reopen, and till provisioning.  
**Status:** IMPLEMENTED & VERIFIED LOCALLY  

---

## 1. AUTHORITATIVE REQUIREMENT

Under the corrected Step 3 & Step 4 governance rules:
1. `MASTER_HEAD_TELLER` (`operational_profile: "teller"`) **MUST NEVER** approve or reject internal treasury transfers (neither self-initiated nor peer-initiated) across any backend route, domain engine, permission matrix, or UI queue.
2. `MASTER_HEAD_TELLER` **RETAINS**:
   - `cash.view`
   - `cash.operate` (own/supervised till intake & payout)
   - `cash.transfer` (initiating internal transfer requests)
   - `cash.supervise` (multi-branch cash & till supervision)
   - Till auto-provisioning (`ServerTillProvisioningService`)
   - Till closure & reopen supervision (`TillSessionEngine`)
3. `transfer.approve` (and internal transfer `approve` / `reject` endpoints & engines) is restricted strictly to:
   - `SUPER_ADMIN`
   - `OWNER`
   - `ADMIN`
   - `MANAGER`
   - `HEAD_TELLER` (branch-scoped, subject to Maker-Checker `initiator_id !== effectiveApproverId` and `operational_profile === "teller"`).

---

## 2. EXACT CODE CHANGES IMPLEMENTED

| Layer | File | Change Applied |
|---|---|---|
| **SSOT Policy** | `/src/domains/rbac/operationalProfilePolicy.ts` | Defined `INTERNAL_TRANSFER_APPROVER_ROLES = Set(["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER", "HEAD_TELLER"])` (excluding `MASTER_HEAD_TELLER`), while keeping `MASTER_HEAD_TELLER` in `TILL_SUPERVISOR_ROLES`. Added `canApproveInternalTransferRole(rawRole)` explicitly returning `false` for `MASTER_HEAD_TELLER`. |
| **Server Verifier** | `/src/domains/rbac/serverEmployeeProfileVerifier.ts` | Capability `"transfer_approve"` enforces `canApproveInternalTransferRole(resolvedRole)` (throws HTTP 403 `FORBIDDEN_ROLE` for `MASTER_HEAD_TELLER`), while `"cash"`, `"transfer_initiate"`, and `"till_supervise"` permit `MASTER_HEAD_TELLER` with `operational_profile === "teller"`. |
| **Permission Matrix** | `/src/services/PermissionService.ts` | Excluded `MASTER_HEAD_TELLER` from `transfer.approve` in both the `ROLE_PERMISSION_MATRIX` and `PermissionService.can()` (explicit guard at lines 655–657 and 809–814). Preserved `cash.view`, `cash.operate`, `cash.transfer`, and `cash.supervise` for `MASTER_HEAD_TELLER`. |
| **Internal Transfer Engine** | `/src/domains/cash/services/ServerInternalTransferEngine.ts` | Removed `"MASTER_HEAD_TELLER"` from `SUPERVISOR_TRANSFER_ROLES` (lines 78–84), while keeping `"MASTER_HEAD_TELLER"` in `AUTHORIZED_TRANSFER_INITIATOR_ROLES`. Both `approveTransfer` and `rejectTransfer` enforce `!canApproveInternalTransferRole(approverRole)` + `verifyServerEmployeeOperationalProfile(..., capability: "transfer_approve")`. |
| **Transfer API Routes** | `/src/routes/transferRoutes.ts` | `POST /api/cash/transfers/internal/:transferId/approve` and `POST /api/cash/transfers/internal/:transferId/reject` explicitly reject `MASTER_HEAD_TELLER` with HTTP `403 FORBIDDEN_ROLE` before and during server profile verification. |
| **Frontend Approval UI** | `/src/components/cash/ApprovalQueueWidget.tsx`, `/src/components/cash/CashConsole.tsx` | Gated internal transfer Approve/Reject UI controls strictly via `PermissionService.can("transfer.approve")` / `canApproveInternalTransferRole(role)`, preventing `MASTER_HEAD_TELLER` from seeing or triggering transfer approval/rejection actions while retaining till reopen/supervision UI. |
| **Security Tests** | `/src/tests/unit/security/RbacStep3MasterHeadTellerSecurity.test.ts`, `/src/tests/unit/security/RbacStep4OperationalProfileEnforcement.test.ts` | Updated `MHT-T09`, `MHT-T21`, `MHT-T26`, and added `S4-MHT-01`..`S4-MHT-03` asserting `MASTER_HEAD_TELLER` receives `403 FORBIDDEN_ROLE` on `transfer_approve`, `ServerInternalTransferEngine.approveTransfer`, `ServerInternalTransferEngine.rejectTransfer`, and `PermissionService.can("transfer.approve")`, while retaining `cash.operate`, `cash.transfer`, `till_supervise`, and `transfer_initiate` when `operational_profile === "teller"`. |

---

## 3. BEFORE / AFTER MATRIX FOR `MASTER_HEAD_TELLER`

| Capability | Prior Step 3 State | Corrected State (Current) |
|---|---|---|
| `cash.view` / `cash.operate` (with `teller` profile) | Allowed | **Allowed** (with `operational_profile === "teller"` verified server-side) |
| `cash.transfer` (Initiate Internal Transfer Request) | Allowed | **Allowed** (with `operational_profile === "teller"` verified server-side) |
| `cash.supervise` / Till Closure & Reopen Supervision | Allowed | **Allowed** (with `operational_profile === "teller"` verified server-side) |
| Till Auto-Provisioning (`ServerTillProvisioningService`) | Allowed | **Allowed** (with `operational_profile === "teller"` verified server-side) |
| `transfer.approve` (Approve Internal Transfer) | Allowed | **DENIED (HTTP 403 `FORBIDDEN_ROLE`)** |
| Reject Internal Transfer | Allowed | **DENIED (HTTP 403 `FORBIDDEN_ROLE`)** |
