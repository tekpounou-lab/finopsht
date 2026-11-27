# FINOPS ERP — ATTENDANCE RBAC & BADGE KIOSK FORENSIC AUDIT

**Audit ID:** `FINOPS-ATTENDANCE-RBAC-AUDIT-01`  
**Mode:** STRICT READ-ONLY — ZERO SOURCE OR PRODUCTION MODIFICATIONS  
**Target Module:** Workforce Attendance / Pointage / QR Badge Kiosk Workflow  
**Target Roles:** OWNER, MANAGER, SUPERVISOR, HEAD_TELLER, SENIOR_TELLER, JUNIOR_TELLER, EMPLOYEE  
**Verdict:** **PARTIAL PASS** (Static authorization and role matrices are well-defined and secure across the codebase and Firestore rules, but certain supervisor and multi-employee badge kiosk recording flows require targeted test coverage and explicit branch scoping verification).

---

## 1. Executive Summary

This forensic audit investigates the reported production symptom:
> *An authenticated user with the OWNER role attempts to record an employee's attendance using the employee's badge. Firestore returns: `Missing or insufficient permissions.`*

### Key Forensic Findings:
1. **Canonical Role Model vs. Firestore Rules:** The codebase recognizes `OWNER`, `ADMIN`, `MANAGER`, `SUPERVISOR`, `HEAD_TELLER`, `SENIOR_TELLER`, `JUNIOR_TELLER`, and `EMPLOYEE`. `firestore.rules` defines `isTenantAdminOrManager(bizId)` which correctly evaluates `owner`, `admin`, `manager`, and `owner_admin`. However, when recording attendance via `AttendanceRepository` or kiosk workflows, if an actor records attendance for another employee without tenant admin/manager privileges or proper branch-scope validation, or if the client payload lacks the required `business_id` / `branch_id` bindings, Firestore rules reject the write (`Missing or insufficient permissions.`).
2. **Badge Kiosk & Self-Service Boundary:** The Unified QR/Badge Kiosk (`UnifiedAttendanceKioskModal.tsx` / `AttendanceRepository.ts`) allows scanning employee badges. When an OWNER or MANAGER uses the kiosk to record an employee's attendance, the repository method must execute with tenant admin privileges. If the client-side session or token lacks the required claims or if `business_id` is derived incorrectly from the scanned employee rather than the authenticated actor's tenant context, tenant isolation checks fail.
3. **Payroll Period Protection:** Both `AttendanceRepository.verifyPeriodLock` and Firestore rules correctly prevent modification of attendance records attached to `LOCKED`, `PESSIMISTIC_LOCKED`, `SEALED`, or `PAID` payroll cycles.

---

## 2. Scope & Methodology

- **Static Code Analysis:** Inspected `firestore.rules`, `src/repositories/AttendanceRepository.ts`, `src/services/qrAttendanceService.ts`, `src/services/PermissionService.ts`, `src/contexts/BusinessContext.tsx`, and `src/components/attendance/UnifiedAttendanceKioskModal.tsx`.
- **RBAC Matrix Verification:** Mapped role capabilities across 7 canonical roles.
- **Rules Analysis:** Evaluated `attendance_logs`, `attendance_records`, `attendance_sessions`, `attendance_justifications`, and `attendance_events`.
- **Safety Compliance:** Strictly read-only; zero file modifications, zero deployments, zero rule pushes.
