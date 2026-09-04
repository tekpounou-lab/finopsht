import { Role } from "../../types";
import { PermissionService } from "../PermissionService";

export type AppTab =
  | "platform"
  | "tenants"
  | "plans"
  | "licences"
  | "security"
  | "planning"
  | "attendance"
  | "personnel"
  | "performance"
  | "pic"
  | "payroll"
  | "ledger"
  | "organization"
  | "documents"
  | "crm"
  | "leads"
  | "prospects"
  | "proformas"
  | "invoices"
  | "invoice_template"
  | "forensic"
  | "audit"
  | "reliability"
  | "dlq"
  | "health"
  | "recovery"
  | "aicfo"
  | "settings"
  | "employeeSpace"
  | "notifications"
  | "bi"
  | "instructions"
  | "leave";

/**
 * Enterprise Route & Access Resolver
 * Implements deterministic workspace tab mapping according to tenant role authorization
 */
export function resolveDefaultTabForRole(role: Role | string): AppTab {
  switch (role) {
    case "SUPER_ADMIN":
      return "platform";
    case "OWNER":
    case "ADMIN":
      return "bi";
    case "MANAGER":
      return "planning";
    case "SUPERVISOR":
      return "attendance";
    case "EMPLOYEE":
      return "employeeSpace";
    default:
      return "employeeSpace";
  }
}

/**
 * Returns list of authorized tabs for a specific organizational role.
 * Strictly enforces that forensic audit, system health, reliability & DLQ, and disaster recovery
 * are accessible exclusively by SUPER_ADMIN.
 */
export function getAuthorizedTabsForRole(role: Role | string): AppTab[] {
  const commonTabs: AppTab[] = ["notifications", "instructions"];

  switch (role) {
    case "SUPER_ADMIN":
      return [
        "platform",
        "tenants",
        "plans",
        "licences",
        "security",
        "organization",
        "personnel",
        "performance",
        "pic",
        "planning",
        "attendance",
        "payroll",
        "ledger",
        "crm",
        "leads",
        "prospects",
        "proformas",
        "invoices",
        "invoice_template",
        "documents",
        "employeeSpace",
        "forensic",
        "audit",
        "reliability",
        "dlq",
        "health",
        "recovery",
        "aicfo",
        "bi",
        "settings",
        "leave",
        ...commonTabs,
      ];
    case "OWNER":
    case "ADMIN":
      return [
        "organization",
        "personnel",
        "performance",
        "pic",
        "planning",
        "attendance",
        "payroll",
        "ledger",
        "crm",
        "leads",
        "prospects",
        "proformas",
        "invoices",
        "invoice_template",
        "documents",
        "aicfo",
        "bi",
        "settings",
        "leave",
        "employeeSpace",
        ...commonTabs,
      ];
    case "MANAGER":
      return [
        "organization",
        "personnel",
        "performance",
        "pic",
        "planning",
        "attendance",
        "payroll",
        "ledger",
        "crm",
        "leads",
        "prospects",
        "proformas",
        "invoices",
        "documents",
        "aicfo",
        "bi",
        "settings",
        "leave",
        "employeeSpace",
        ...commonTabs,
      ];
    case "SUPERVISOR":
      return [
        "attendance",
        "planning",
        "performance",
        "employeeSpace",
        ...commonTabs,
      ];
    case "EMPLOYEE":
      return [
        "employeeSpace",
        ...commonTabs,
      ];
    default:
      return ["employeeSpace", ...commonTabs];
  }
}
