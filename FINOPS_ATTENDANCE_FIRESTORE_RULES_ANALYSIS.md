# FINOPS ERP — Attendance Firestore Rules Analysis

**Audit ID:** `FINOPS-ATTENDANCE-RULES-ANALYSIS-01`  
**Target Collections:** `attendance_adjustment_requests`, `attendance_logs`, `attendance_records`, `attendance_sessions`, `attendance_events`, `attendance`, `attendance_status`  

---

## 1. Rule-by-Rule Security Evaluation

| Collection Path | Operation | Rule Expression Summary | Security Assessment |
|---|---|---|---|
| `/attendance_logs/{recordId}` | `get` / `list` | Authenticated + SuperAdmin OR TenantScoped(resource.data) | Secure (Tenant isolated) |
| `/attendance_logs/{recordId}` | `create` | Authenticated + SuperAdmin OR TenantScoped(request.resource.data) | **Vulnerability Vector:** Requires `request.resource.data` to contain a valid `business_id` matching the actor's tenant. If a client omits `business_id` or sends a mismatched ID, creation is denied with `Missing or insufficient permissions.` |
| `/attendance_logs/{recordId}` | `update` / `delete` | Authenticated + SuperAdmin OR isTenantAdminOrManager(resource.data) | Secure (Restricted to tenant admins/managers) |
| `/attendance_records/{id}` | `create`, `update` | Authenticated + SuperAdmin OR TenantScoped(request.resource.data) | Secure (Tenant scoped) |
| `/attendance_records/{id}` | `delete` | `false` | Secure (Immutable records) |
| `/attendance_sessions/{id}` | `create`, `update` | Authenticated + SuperAdmin OR TenantScoped(request.resource.data) | Secure |
| `/attendance_events/{id}` | `create` | Authenticated + SuperAdmin OR TenantScoped(request.resource.data) | Secure |
| `/attendance_events/{id}` | `update`, `delete` | `false` | Secure (Tamper-proof immutable audit events) |

---

## 2. Payroll Period Protection
- Both application services (`AttendanceRepository.verifyPeriodLock`) and transaction guards verify that target attendance dates do not fall within locked payroll cycles.
