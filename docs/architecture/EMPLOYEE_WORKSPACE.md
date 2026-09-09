# EMPLOYEE WORKSPACE ARCHITECTURE & ISOLATION SPECIFICATION

**Document Version:** 1.0  
**Status:** Active  
**Module:** Espace Collaborateur (`MyWorkspace`)  
**Domain:** Identity, RBAC, Multi-Tenancy & Data Isolation

---

## 1. Overview & Objective

The **Espace Collaborateur** (`MyWorkspace.tsx`) is the personal employee portal within FINOPS ERP. It displays personal human resources, payroll, attendance, leave, schedule, and document records for the currently authenticated user.

This document defines the strict identity resolution pipeline and multi-tenant data isolation mechanisms that guarantee **zero cross-user data leakage**.

---

## 2. Core Identity Resolution Pipeline (SSOT)

To prevent regression where an administrative user (e.g. `OWNER`, `MANAGER`, `ADMIN`) or logged-in user without a staff directory entry views another employee's records (e.g., falling back to `employees[0]`), identity resolution follows a strict 4-tier priority cascade powered by `useIdentity()`:

```
[Authenticated User] 
        │
        ▼
Tier 1: IdentitySnapshot (`identity.employee`)
        │ (If present, matches against staff directory or uses snapshot)
        ▼
Tier 2: Direct Match in Staff Directory (`employees` array)
        │ (Matches by `firebase_uid === user_uid`, `id === user_uid`, or `email`)
        ▼
Tier 3: Validated Props Match (`employee` prop explicitly matching authenticated `user_uid` or `email`)
        │
        ▼
Tier 4: Synthesized Self-Profile (Fallback for `OWNER` / `ADMIN` without directory entry)
```

### Strict Prohibition of Fallbacks
- **`employees[0]` Fallback Banned**: Neither `DashboardShell` nor `MyWorkspace` may pass or set `employees[0]` as the default employee for the logged-in user.
- **`baseEmployee` Leakage Banned**: Dataset filters must NEVER use OR-conditions matching an arbitrary fallback employee ID (such as `a.employeeId === baseEmployee.id`). All queries and filters MUST strictly match `resolvedEmployee.id`, `resolvedEmployee.firebase_uid`, or `resolvedEmployee.email`.

---

## 3. Data Isolation & Sub-Component Scoping

All datasets rendered within `MyWorkspace` are filtered strictly by tenant (`business_id`) AND employee identity (`employeeId` / `user_uid` / `email`).

### 3.1 Payroll (`myPayroll` / `MyPayrollSection`)
- **Collection**: `payroll_records` / `payslips`
- **Filter Criteria**:
  - `p.employeeId === resolvedEmployee.id` OR `p.employee_id === resolvedEmployee.id` OR `p.user_uid === resolvedEmployee.id` OR `p.employee_email === resolvedEmployee.email`
  - AND `p.business_id === resolvedEmployee.business_id`
  - AND `p.status` in valid execution states (`["SEALED", "CALCULATED", "POSTED", "COMPLETED", "VALIDATED", "APPROVED", "PAID", "LOCKED", "DRAFT", "PENDING", "CORRECTED"]`)

### 3.2 Attendance (`myAttendance` / `MyAttendanceSection`)
- **Collection**: `attendance_logs`
- **Filter Criteria**:
  - `a.employeeId === resolvedEmployee.id` OR `a.employee_id === resolvedEmployee.id` OR `a.employee_email === resolvedEmployee.email`
  - AND `a.business_id === resolvedEmployee.business_id`

### 3.3 Documents (`MyDocumentsSection`)
- **Collection**: `edms_documents`
- **Repository Call**: `DocumentRepository.getEmployeeDocuments(businessId, employeeId)`
- **Scope**: Scoped strictly to the logged-in employee's `business_id` and `resolvedEmployee.id`.

### 3.4 Leaves (`myLeaves`) & Shifts (`myShifts`)
- **Collections**: `leave_requests`, `work_shifts`
- **Scope**: Filtered strictly by `resolvedEmployee.id` and `resolvedEmployee.email`.

---

## 4. Role-Based Access Control (RBAC) & Workspace Boundaries

| Role | Espace Collaborateur View | Manager/Supervisor Space Access |
|---|---|---|
| `EMPLOYEE` | Sees personal attendance, payslips, leaves, schedule & documents | Hidden |
| `MANAGER` | Sees personal information | Visible (`Espace Superviseur` tab enabled) |
| `SUPERVISOR` | Sees personal information | Visible (`Espace Superviseur` tab enabled) |
| `OWNER` | Sees personal information / Owner profile | Visible (`Espace Superviseur` tab enabled) |
| `SUPER_ADMIN` | Sees personal information / Admin profile | Visible |

---

## 5. Audit Logging & Observability

`MyWorkspace` emits an explicit debug log on resolution to enable rapid inspection of identity bindings:

```ts
console.debug(
  `[MyWorkspace] Loading workspace data for employeeId: ${resolvedEmployee.id}, email: ${resolvedEmployee.email}, businessId: ${resolvedEmployee.business_id}, role: ${resolvedEmployee.role}`
);
```

---

## 6. Verification Checklist

- [x] Logged-in OWNER sees their own profile and records (or empty sets if no personal payslips exist) without defaulting to `employees[0]`.
- [x] Standard EMPLOYEE sees only their own payslips, attendance, and documents.
- [x] Cross-tenant isolation enforced via mandatory `business_id` filter across all repository calls.
- [x] Compilation (`tsc --noEmit`) and build verified without errors.
