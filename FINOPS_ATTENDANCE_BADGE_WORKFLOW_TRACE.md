# FINOPS ERP — Attendance Badge Kiosk Workflow Trace

**Audit ID:** `FINOPS-ATTENDANCE-BADGE-TRACE-01`  
**Target Module:** QR Badge Kiosk & Attendance Logging Flow  

---

## 1. End-to-End Workflow Trace (UI -> Service -> Repository -> Firestore)

1. **Initiation (UI Layer):**
   - User opens `UnifiedAttendanceKioskModal.tsx` or scans an employee QR badge via `useQRScanner.ts`.
   - The QR scanner decodes the payload (`employee_id`, `business_id`, `branch_id`, `signature`, `role`).
2. **Simulation & Validation Layer (`qrAttendanceService.ts`):**
   - `processQRScanSimulation` verifies tenant isolation (`business_id === currentBusinessId`), employee existence, badge signature integrity, and role/branch matching.
3. **Repository Execution (`AttendanceRepository.ts`):**
   - Calls `AttendanceRepository.verifyPeriodLock(businessId, dateStr)` to ensure the target date does not fall within a `LOCKED`, `SEALED`, or `PAID` payroll cycle.
   - Calls `AttendanceRepository.verifyEmployeeActive(businessId, employeeId)` to confirm the employee is active.
   - Executes Firestore write to `attendance_logs` or `attendance_records` (setting `business_id`, `branch_id`, `employeeId`, `checkIn` / `checkOut`, timestamps, and audit metadata).
4. **Firestore Security Rules Enforcement (`firestore.rules`):**
   - Evaluates `match /attendance_logs/{recordId}`:
     - `allow create: if isAuthenticated() && (isSuperAdmin() || isTenantScoped(getBusinessId(request.resource.data)));`
     - `allow update: if isAuthenticated() && (isSuperAdmin() || isTenantAdminOrManager(getBusinessId(resource.data)));`
   - **Root Cause of Reported Failure:** If an OWNER or MANAGER records another employee's attendance, but the incoming request payload (`request.resource.data`) or token claims (`request.auth.token.businessId`) omit or mismatch `business_id`, or if `isTenantScoped()` fails because the actor lacks proper tenant association in custom claims or user profile doc, Firestore returns `Missing or insufficient permissions.`

---

## 2. Actor Differentiation & Privilege Checks
- **Self-Service vs. Delegated Entry:** Ordinary employees and tellers performing self-service clock-in submit payloads tied to their own UID. Privileged actors (OWNER, MANAGER, SUPERVISOR) operating the kiosk on behalf of team members must pass tenant-scoped payloads where `business_id` matches their authenticated business context.
