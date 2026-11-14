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
  | "reports"
  | "cash"
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
    case "JUNIOR_TELLER":
    case "SENIOR_TELLER":
    case "HEAD_TELLER":
    case "MASTER_HEAD_TELLER":
    case "ACCOUNTANT":
    case "AUDITOR":
      return "ledger";
    case "EMPLOYEE":
      return "employeeSpace";
    default:
      return "employeeSpace";
  }
}

/**
 * Returns list of authorized tabs for a specific organizational role.
 * Strictly enforces that system health, reliability & DLQ, and disaster recovery
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
        "reports",
        "cash",
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
        "cash",
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
        "reports",
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
        "cash",
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
        "reports",
        "employeeSpace",
        ...commonTabs,
      ];
    case "SUPERVISOR":
      return [
        "attendance",
        "planning",
        "performance",
        "employeeSpace",
        "documents",
        "leave",
        ...commonTabs,
      ];
    case "JUNIOR_TELLER":
    case "SENIOR_TELLER":
      return [
        "ledger",
        "cash",
        "attendance",
        "leave",
        "documents",
        "employeeSpace",
        ...commonTabs,
      ];
    case "HEAD_TELLER":
    case "MASTER_HEAD_TELLER":
      return [
        "bi",
        "ledger",
        "cash",
        "reports",
        "attendance",
        "planning",
        "performance",
        "leave",
        "documents",
        "employeeSpace",
        ...commonTabs,
      ];
    case "ACCOUNTANT":
      return [
        "bi",
        "ledger",
        "cash",
        "reports",
        "payroll",
        "crm",
        "invoices",
        "proformas",
        "performance",
        "aicfo",
        "documents",
        "leave",
        "employeeSpace",
        ...commonTabs,
      ];
    case "AUDITOR":
      return [
        "bi",
        "organization",
        "personnel",
        "attendance",
        "planning",
        "leave",
        "payroll",
        "ledger",
        "cash",
        "reports",
        "crm",
        "performance",
        "aicfo",
        "forensic",
        "audit",
        "documents",
        "employeeSpace",
        ...commonTabs,
      ];
    case "EMPLOYEE":
      return [
        "employeeSpace",
        "documents",
        "attendance",
        "leave",
        ...commonTabs,
      ];
    default:
      return ["employeeSpace", ...commonTabs];
  }
}
