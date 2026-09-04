# FINOPS ERP — Role-Based Access Control (RBAC) & Permission Matrix

## Overview

FINOPS ERP implements a multi-tier RBAC system managed by `PermissionService` (`src/services/PermissionService.ts`). Permissions are enforced across UI routes, action buttons, and repository write operations.

---

## 1. Role Hierarchy

1. `SUPER_ADMIN`: Universal sovereign control across all tenants, licensing configurations, global tax rates, system infrastructure, and forensic audit logs.
2. `OWNER`: Sovereign control within their specific business tenant (`business_id`). Full access to all 14 business ERP modules (HR, Organization, Performance, Documents, Planning, Attendance, Leaves, Payroll V3, General Ledger, BI, AI CFO, Settings, and Custom Roles). Cannot perform cross-tenant system actions.
3. `ADMIN`: Full tenant operational administration (HR, Payroll, Accounting, Settings). Cannot modify global SRE parameters or system-level tax defaults.
4. `MANAGER`: Departmental & branch management, operational timecards, leave request authorization, branch payroll preparation.
5. `SUPERVISOR`: Team operational monitoring, shift schedules, on-ground attendance QR scanning and live attendance verification.
6. `EMPLOYEE`: Self-service portal access (view own payslips, submit leave requests, view personal clock-ins).

---

## 2. Permission Matrix Summary

| Permission Action | SUPER_ADMIN | OWNER | ADMIN | MANAGER | SUPERVISOR | EMPLOYEE |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `manage_system_config` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `manage_global_tax` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `force_unseal_payroll` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `delete_business` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `manage_licensing` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `view_forensic_logs` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `manage_payroll_cycles` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `seal_payroll_cycle` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `approve_leaves` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| `edit_employee_salary` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `view_own_payslips` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `attendance.scan` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| `planning.read` | ✓ | ✓ | ✓ | ✓ (Branch) | ✓ (Branch) | ✓ (Own) |
| `planning.write` | ✓ | ✓ | ✓ | ✓ (Branch) | ✓ (Branch) | ✗ |
| `manage_settings` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |

---

## 3. Dynamic Role-to-Module Access Matrix (`roleModuleMatrix`)

Tenant administrators can customize module-level access per role directly from the **Business Admin Center (`ROLES` section)**.

- **Storage**: Stored within `business_settings.roleModuleMatrix` (`Record<RoleId, Record<ModuleId, boolean>>`).
- **Enforcement**: Evaluated via `PermissionService.hasRoleModuleAccess(role, moduleId)` which factors in:
  1. Sovereign Bypass (`SUPER_ADMIN` / `OWNER`)
  2. Global Tenant Feature Flags
  3. Subscription Plan Constraints (e.g. `STARTER` plan restrictions)
  4. Custom configured overrides in `roleModuleMatrix`
  5. Canonical default fallbacks

```tsx
// Dynamic module resolution in NavigationBuilder and Route Guards:
if (!PermissionService.hasRoleModuleAccess(userRole, "payroll")) {
  // Tab is dynamically hidden and direct route navigation is blocked
}
```

---

## 4. Enforcement Pattern in React

```tsx
import { PermissionService } from "../services/PermissionService";

if (!PermissionService.can("manage_payroll_cycles")) {
  return <AccessDeniedBanner message="Droits insuffisants pour gérer les cycles de paie." />;
}
```
