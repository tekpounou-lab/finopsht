/**
 * FINOPS ERP — Data Integrity & SSOT Validation Schemas (Zod)
 * 
 * Provides runtime schema enforcement for cross-module entities:
 * CRM (Leads, Proformas, Invoices), General Ledger (Transactions),
 * Workforce (Employees, Attendance, Leave, Shifts), Organization (Business, Branch, Dept, CostCenter),
 * and Payroll Engine V3.
 */

import { z } from "zod";
import { AmountCentsSchema } from "../constants/finance";
import { toCamelCase } from "../utils/caseConverter";

// ============================================================================
// 0. EXCEPTION & ERROR HANDLING
// ============================================================================

export class FinopsException extends Error {
  public readonly code: string;
  public readonly details?: any;
  public readonly entityName?: string;
  public readonly statusCode: number;

  constructor(
    message: string,
    code: string = "VALIDATION_ERROR",
    details?: any,
    entityName?: string,
    statusCode: number = 400
  ) {
    super(message);
    this.name = "FinopsException";
    this.code = code;
    this.details = details;
    this.entityName = entityName;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, FinopsException.prototype);
  }
}

/**
 * Validates data against a Zod schema or throws a formatted FinopsException.
 */
export function validateOrThrow<T>(
  schema: z.ZodType<T>,
  data: unknown,
  entityName: string = "Entity"
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues || (result.error as any).errors || [];
    const errorDetails = issues.map((e: any) => ({
      path: Array.isArray(e.path) ? e.path.join(".") : String(e.path || ""),
      message: e.message,
      code: e.code
    }));
    const message = `[${entityName}] Validation failed: ${errorDetails.map((d: any) => `${d.path}: ${d.message}`).join("; ")}`;
    throw new FinopsException(message, "SCHEMA_VALIDATION_ERROR", errorDetails, entityName, 422);
  }
  return result.data;
}

/**
 * Known obsolete or duplicate fields that should be rejected or purged.
 */
export const OBSOLETE_FIELDS_MAP: Record<string, string[]> = {
  BUSINESS: ["owner_id", "owner_employee_id", "created_at", "updated_at", "onboarding_completed", "default_currency"],
  BRANCH: ["business_id", "is_active", "created_at", "updated_at"],
  DEPARTMENT: ["business_id", "branch_id", "is_active", "created_at", "updated_at", "manager_id", "cost_center_id", "business_unit_id"],
  EMPLOYEE: [
    "branch_id", 
    "department_id", 
    "business_id", 
    "employee_name", 
    "firebase_uid", 
    "salaryBaseHtg", 
    "salary_base_htg",
    "hourly_rate_htg",
    "hourlyRateHtg",
    "payment_model",
    "hire_date",
    "shift_id",
    "is_active",
    "created_at",
    "updated_at"
  ],
  USER: ["business_id", "branch_id", "department_id", "employee_id", "display_name", "onboarding_completed", "updated_at"],
  INVOICE: ["amountPaid", "isPaid", "totalGrossHtg"],
  PAYROLL_CYCLE: ["totalGrossHtg", "totalNetHtg"],
  PROFORMA: ["isConverted"],
  LEAD: ["display_name"],
  ATTENDANCE: ["total_hours", "employee_name"]
};

/**
 * Checks if data contains any forbidden obsolete or unmigrated fields.
 */
export function detectObsoleteFields(entityName: string, data: Record<string, any>): string[] {
  if (!data || typeof data !== "object") return [];
  const normalizedEntity = entityName.toUpperCase().split("_")[0];
  const obsoleteList = OBSOLETE_FIELDS_MAP[normalizedEntity] || OBSOLETE_FIELDS_MAP[entityName.toUpperCase()] || [];
  return obsoleteList.filter(field => field in data && data[field] !== undefined);
}

/**
 * Sanitizes input (converts snake_case to camelCase), rejects obsolete fields,
 * and validates against the entity schema.
 */
export function sanitizeAndValidate<T>(
  schema: z.ZodType<T>,
  input: unknown,
  entityName: string = "Entity"
): T {
  if (!input || typeof input !== "object") {
    throw new FinopsException(`Invalid input for ${entityName}: expected an object`, "INVALID_INPUT", null, entityName);
  }
  const detected = detectObsoleteFields(entityName, input as Record<string, any>);
  if (detected.length > 0) {
    console.warn(`[${entityName}] Obsolete fields detected and will be rejected: ${detected.join(", ")}`);
  }
  const camelData = toCamelCase(input);
  return validateOrThrow(schema, camelData, entityName);
}

// ============================================================================
// 1. COMMON & TENANCY IDENTIFIERS
// ============================================================================

export const BusinessIdSchema = z.string()
  .min(3, "businessId must be at least 3 characters")
  .refine(val => val !== "global" && val !== "none" && val !== "undefined" && val.trim() !== "", {
    message: "businessId must be a valid, non-empty tenant-scoped identifier"
  });

export const CurrencySchema = z.enum(["HTG", "USD"]);
export const IsoDateSchema = z.string().min(10, "Date must be YYYY-MM-DD").max(10);
export const IsoDateTimeSchema = z.string().min(10, "Valid ISO timestamp string required");

// ============================================================================
// 2. ORGANIZATION & TENANCY SCHEMAS
// ============================================================================

export const BusinessIntegritySchema = z.object({
  id: z.string().min(1, "Business ID is required"),
  name: z.string().min(1, "Business name is required"),
  nif: z.string().optional(),
  domain: z.string().optional(),
  ownerId: z.string().optional(),
  currency: CurrencySchema.default("HTG"),
  defaultCurrency: CurrencySchema.optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "PENDING", "PENDING_APPROVAL", "INACTIVE"]).default("ACTIVE"),
  industry: z.string().optional(),
  settings: z.any().optional(),
  onboardingComplete: z.boolean().optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional()
}).strict();

export const BranchIntegritySchema = z.object({
  id: z.string().min(1, "Branch ID is required"),
  businessId: BusinessIdSchema,
  name: z.string().min(1, "Branch name is required"),
  code: z.string().optional(),
  address: z.string().optional(),
  location: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  isActive: z.boolean().default(true),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional()
}).strict();

export const DepartmentIntegritySchema = z.object({
  id: z.string().min(1, "Department ID is required"),
  businessId: BusinessIdSchema,
  branchId: z.string().optional(),
  businessUnitId: z.string().optional(),
  costCenterId: z.string().optional(),
  name: z.string().min(1, "Department name is required"),
  code: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  budget: z.number().min(0).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  isActive: z.boolean().default(true),
  managerId: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  normalizedName: z.string().optional(),
  source: z.string().optional(),
  isSystemGenerated: z.boolean().optional(),
  createdBy: z.string().optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional()
}).strict();

export const CostCenterIntegritySchema = z.object({
  id: z.string().min(1, "Cost Center ID is required"),
  businessId: BusinessIdSchema,
  departmentId: z.string().optional(),
  name: z.string().min(1, "Cost Center name is required"),
  code: z.string().min(1, "Cost Center code is required"),
  description: z.string().optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional()
}).strict();

// ============================================================================
// 3. WORKFORCE & HR SCHEMAS
// ============================================================================

export const EmployeeRoleSchema = z.enum(["OWNER", "MANAGER", "SUPERVISOR", "EMPLOYEE", "SUPER_ADMIN", "UNASSIGNED"]);

export const EmployeeIntegritySchema = z.object({
  id: z.string().min(1, "Employee ID is required"),
  uid: z.string().nullable().optional(),
  businessId: BusinessIdSchema,
  branchId: z.string().min(1, "Branch reference (branchId) is required"),
  departmentId: z.string().min(1, "Department reference (departmentId) is required"),
  name: z.string().min(1, "Employee name is required"),
  displayName: z.string().optional(),
  email: z.string().email("Valid employee email required"),
  normalizedEmail: z.string().optional(),
  emailHistory: z.array(z.string()).optional(),
  role: EmployeeRoleSchema.default("EMPLOYEE"),
  baseSalary: z.number().min(0, "Base salary cannot be negative"),
  paymentModel: z.enum(["FIXED", "COMMISSION", "HYBRID"]).default("FIXED"),
  phone: z.string().optional(),
  position: z.string().optional(),
  contractType: z.enum(["cdi", "cdd", "freelance"]).default("cdi"),
  payRegime: z.enum(["fixe", "commission", "hybrid"]).default("fixe"),
  commissionRate: z.number().min(0).max(100).optional(),
  status: z.enum(["DRAFT", "INVITED", "PENDING_ACCEPTANCE", "ACTIVE", "SUSPENDED", "TERMINATED", "ARCHIVED", "ON_LEAVE", "PENDING"]).default("ACTIVE"),
  isActive: z.boolean().default(true),
  onboardingComplete: z.boolean().optional(),
  hireDate: z.string().optional(),
  badgeId: z.string().optional(),
  managerId: z.string().optional(),
  branchName: z.string().optional(),
  departmentName: z.string().optional(),
  departmentAssignments: z.array(z.any()).optional(),
  primaryDepartmentId: z.string().optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional()
}).strict();

export const AttendanceRecordIntegritySchema = z.object({
  id: z.string().min(1, "Attendance record ID is required"),
  businessId: BusinessIdSchema,
  employeeId: z.string().min(1, "Employee ID is required"),
  employeeName: z.string().min(1, "Employee name is required"),
  branchId: z.string().min(1, "Branch ID is required"),
  departmentId: z.string().optional(),
  date: IsoDateSchema,
  checkIn: z.string().min(1, "Check-in time is required"),
  checkOut: z.string().nullable().optional(),
  plannedHours: z.number().min(0).default(8),
  realHours: z.number().min(0).default(0),
  variance: z.number().default(0),
  status: z.enum(["PRESENT", "LATE", "ABSENT", "ON_LEAVE", "EARLY_DEPARTURE"]).default("PRESENT"),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional()
}).strict();

export const LeaveIntegritySchema = z.object({
  id: z.string().min(1, "Leave record ID is required"),
  businessId: BusinessIdSchema,
  employeeId: z.string().min(1, "Employee ID is required"),
  leaveType: z.enum(["PAID", "UNPAID", "SICK", "MATERNITY", "SPECIAL"]).default("PAID"),
  startDate: IsoDateSchema,
  endDate: IsoDateSchema,
  daysCount: z.number().positive("Days count must be greater than 0"),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).default("PENDING"),
  reason: z.string().optional(),
  approvedBy: z.string().optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional()
}).strict();

export const ShiftIntegritySchema = z.object({
  id: z.string().min(1, "Shift ID is required"),
  businessId: BusinessIdSchema,
  branchId: z.string().min(1, "Branch ID is required"),
  departmentId: z.string().optional(),
  name: z.string().min(1, "Shift name is required"),
  startTime: z.string().min(4, "Start time HH:MM required"),
  endTime: z.string().min(4, "End time HH:MM required"),
  daysOfWeek: z.array(z.number().min(0).max(6)).default([1, 2, 3, 4, 5]),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional()
}).strict();

// ============================================================================
// 4. PAYROLL ENGINE V3 SCHEMAS
// ============================================================================

export const PayrollCycleIntegritySchema = z.object({
  id: z.string().min(1, "Payroll cycle ID is required"),
  businessId: BusinessIdSchema,
  name: z.string().min(1, "Cycle name is required"),
  period: z.string().min(4, "Period is required (e.g. 2026-03)"),
  startDate: IsoDateSchema,
  endDate: IsoDateSchema,
  cycleType: z.enum(["MONTHLY", "BI_WEEKLY", "WEEKLY"]).default("MONTHLY"),
  status: z.enum(["DRAFT", "PROCESSING", "SUBMITTED", "APPROVED", "SEALED", "CLOSED", "REVERSED"]).default("DRAFT"),
  isLocked: z.boolean().default(false),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional()
}).strict();

export const PayrollRecordIntegritySchema = z.object({
  id: z.string().min(1, "Payroll record ID is required"),
  businessId: BusinessIdSchema,
  cycleId: z.string().min(1, "Cycle reference (cycleId) is required"),
  employeeId: z.string().min(1, "Employee reference (employeeId) is required"),
  employeeName: z.string().min(1, "Employee name is required"),
  baseSalary: z.number().min(0, "Base salary cannot be negative"),
  grossSalary: z.number().min(0, "Gross salary cannot be negative"),
  netSalary: z.number().min(0, "Net salary cannot be negative"),
  onaEmployee: z.number().min(0).default(0), // 6%
  onaEmployer: z.number().min(0).default(0), // 6%
  ofatma: z.number().min(0).default(0),      // 2%
  deductions: z.number().min(0).default(0),
  bonuses: z.number().min(0).default(0),
  status: z.enum(["DRAFT", "CALCULATED", "APPROVED", "PAID", "VOID"]).default("DRAFT"),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional()
}).strict();

// ============================================================================
// 5. CRM & SALES SCHEMAS
// ============================================================================

export const LeadStatusSchema = z.enum(["LEAD", "PROSPECT", "CLIENT", "LOST"]);
export const LeadSourceSchema = z.enum([
  "WEBSITE", "REFERRAL", "COLD_CALL", "CAMPAIGN", "EVENT", "PARTNER", "DIRECT", "OTHER"
]);

export const LeadIntegritySchema = z.object({
  id: z.string().min(1, "Lead ID is required"),
  businessId: BusinessIdSchema,
  companyName: z.string().min(1, "Company name is required"),
  contactName: z.string().min(1, "Contact name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  sector: z.string().optional().or(z.literal("")),
  source: LeadSourceSchema.default("DIRECT"),
  status: LeadStatusSchema.default("LEAD"),
  leadScore: z.number().min(0).max(100).default(50),
  notes: z.string().optional(),
  assignedTo: z.string().optional(),
  estimatedValue: z.number().min(0).optional(),
  currency: CurrencySchema.default("HTG"),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional()
}).strict();

export const InvoiceLineIntegritySchema = z.object({
  id: z.string().min(1, "Line ID is required"),
  description: z.string().min(1, "Description is required"),
  quantity: z.number().positive("Quantity must be greater than 0"),
  unitPrice: z.number().min(0, "Unit price cannot be negative"),
  discountRate: z.number().min(0).max(100).default(0),
  discountAmount: z.number().min(0).optional(),
  taxRate: z.number().min(0).max(100).default(0),
  subtotal: z.number().min(0),
  taxAmount: z.number().min(0),
  total: z.number().min(0)
}).strict();

export const ProformaStatusSchema = z.enum([
  "DRAFT", "SENT", "ACCEPTED", "EXPIRED", "CONVERTED_TO_INVOICE", "REJECTED"
]);

export const ProformaIntegritySchema = z.object({
  id: z.string().min(1, "Proforma ID is required"),
  businessId: BusinessIdSchema,
  proformaNumber: z.string().min(1, "Proforma number is required"),
  leadId: z.string().optional(),
  clientName: z.string().min(1, "Client name is required"),
  clientEmail: z.string().email().optional().or(z.literal("")),
  clientPhone: z.string().optional().or(z.literal("")),
  clientAddress: z.string().optional().or(z.literal("")),
  clientNif: z.string().optional().or(z.literal("")),
  issueDate: IsoDateSchema,
  validUntil: IsoDateSchema,
  currency: CurrencySchema.default("HTG"),
  items: z.array(InvoiceLineIntegritySchema).min(1, "Proforma must contain at least one line item"),
  subtotal: z.number().min(0),
  totalDiscount: z.number().min(0).default(0),
  taxAmount: z.number().min(0).default(0),
  totalAmount: z.number().min(0, "Total amount cannot be negative"),
  status: ProformaStatusSchema.default("DRAFT"),
  notes: z.string().optional(),
  paymentTerms: z.string().optional(),
  convertedToInvoiceId: z.string().optional(),
  convertedAt: z.string().optional(),
  createdBy: z.string().optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional()
}).strict();

export const InvoiceStatusSchema = z.enum([
  "DRAFT", "SENT", "ISSUED", "PAID", "PARTIALLY_PAID", "OVERDUE", "CANCELLED"
]);

export const InvoicePaymentMethodSchema = z.enum([
  "BANK_TRANSFER", "CASH", "CHECK", "MONCASH", "NATCASH", "CARD", "OTHER"
]);

export const InvoiceIntegritySchema = z.object({
  id: z.string().min(1, "Invoice ID is required"),
  businessId: BusinessIdSchema,
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  proformaId: z.string().optional(),
  leadId: z.string().optional(),
  clientName: z.string().min(1, "Client name is required"),
  clientEmail: z.string().email().optional().or(z.literal("")),
  clientPhone: z.string().optional().or(z.literal("")),
  clientAddress: z.string().optional().or(z.literal("")),
  clientNif: z.string().optional().or(z.literal("")),
  issueDate: IsoDateSchema,
  dueDate: IsoDateSchema,
  currency: CurrencySchema.default("HTG"),
  items: z.array(InvoiceLineIntegritySchema).min(1, "Invoice must contain at least one line item"),
  subtotal: z.number().min(0),
  totalDiscount: z.number().min(0).default(0),
  taxAmount: z.number().min(0).default(0),
  totalAmount: z.number().min(0, "Total amount cannot be negative"),
  amountPaid: z.number().min(0).optional(),
  status: InvoiceStatusSchema.default("DRAFT"),
  accountingStatus: z.enum(["DRAFT", "POSTED", "REVERSED"]).optional(),
  notes: z.string().optional(),
  paymentTerms: z.string().optional(),
  isPaid: z.boolean().optional(),
  paidAt: z.string().optional(),
  paymentMethod: InvoicePaymentMethodSchema.optional(),
  payments: z.array(z.any()).optional(),
  accountingTransactionId: z.string().optional(),
  paymentTransactionId: z.string().optional(),
  createdBy: z.string().optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional()
}).strict();

// ============================================================================
// 6. GENERAL LEDGER SCHEMAS & HELPERS
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateLedgerForeignKeys(tx: Partial<any>): ValidationResult {
  const errors: string[] = [];
  const bizId = tx.businessId;
  if (!bizId || bizId === "global" || bizId === "none") {
    errors.push("Invalid Foreign Key: businessId is missing or un-scoped.");
  }
  if (tx.amountCents !== undefined && tx.amountCents <= 0) {
    errors.push("Constraint Violation: amountCents must be a strictly positive integer.");
  }
  if (tx.debitAccount && tx.creditAccount && tx.debitAccount === tx.creditAccount) {
    errors.push("Accounting Integrity Violation: debitAccount and creditAccount cannot be identical.");
  }
  return {
    isValid: errors.length === 0,
    errors
  };
}

export const LedgerTransactionIntegritySchema = z.object({
  id: z.string().min(1, "Transaction ID is required"),
  businessId: BusinessIdSchema.optional(),
  branchId: z.string().optional(),
  branchCode: z.string().optional(),
  branchName: z.string().optional(),
  departmentId: z.string().optional(),
  departmentCode: z.string().optional(),
  departmentName: z.string().optional(),
  employeeId: z.string().optional(),
  employeeEmail: z.string().optional(),
  employeeName: z.string().optional(),
  importBatchId: z.string().optional(),
  commissionClaimed: z.boolean().optional(),
  commissionSummaryId: z.string().optional(),
  type: z.enum([
    "INCOME", "EXPENSE", "PAYROLL", "ADVANCE", "REFUND", "CORRECTION",
    "ADJUSTMENT", "REVERSAL", "TRANSFER", "BONUS", "PENALTY", "COMPENSATION"
  ]),
  amount: z.number().min(0, "Amount cannot be negative"),
  amountCents: AmountCentsSchema.optional(),
  date: IsoDateSchema,
  description: z.string().min(1, "Description is required"),
  category: z.string().min(1, "Category is required"),
  signerId: z.string().default("system"),
  currency: CurrencySchema.default("HTG"),
  paymentMethod: z.enum(["CASH", "BANK", "MONCASH", "NATCASH", "CARD", "WIRE", "NON_CASH"]).optional(),
  source: z.enum([
    "MANUAL", "SYSTEM", "IMPORT", "CSV_IMPORT", "PAYROLL_ENGINE", "AI_AUTOMATION", "ORCHESTRATOR"
  ]).default("SYSTEM"),
  status: z.enum(["DRAFT", "POSTED", "REVERSED", "PENDING", "LOCKED"]).default("POSTED"),
  isImmutable: z.boolean().default(true),
  isLocked: z.boolean().optional(),
  debitAccount: z.string().min(3, "Debit account code is required").optional(),
  creditAccount: z.string().min(3, "Credit account code is required").optional(),
  debit: z.number().min(0).optional(),
  credit: z.number().min(0).optional(),
  debitCents: AmountCentsSchema.optional(),
  creditCents: AmountCentsSchema.optional(),
  referenceTransactionId: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  createdBy: z.string().optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional()
}).strict().refine(data => {
  const debitAcc = data.debitAccount;
  const creditAcc = data.creditAccount;
  if (debitAcc && creditAcc) {
    return debitAcc !== creditAcc;
  }
  return true;
}, {
  message: "Debit account and Credit account cannot be identical in double-entry accounting"
});

// ============================================================================
// 7. USER PROFILE SCHEMAS
// ============================================================================

export const UserProfileIntegritySchema = z.object({
  id: z.string().optional(),
  uid: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  name: z.string().optional(),
  displayName: z.string().optional(),
  businessId: z.string().optional(),
  employeeId: z.string().optional(),
  branchId: z.string().optional(),
  departmentId: z.string().optional(),
  role: z.string().optional(),
  requested_role: z.string().optional(),
  avatarUrl: z.string().optional(),
  status: z.string().optional(),
  accountStatus: z.enum(["ACTIVE", "PENDING", "SUSPENDED", "INACTIVE", "NEW_USER", "WAITING_APPROVAL"]).optional(),
  businessStatus: z.enum(["ACTIVE", "PENDING", "SUSPENDED", "INACTIVE", "PENDING_APPROVAL", "REJECTED"]).optional(),
  onboardingComplete: z.boolean().optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional()
}).strict();

// ============================================================================
// 8. SUBSCRIPTION & FEATURE MATRIX SCHEMAS
// ============================================================================

export const SubscriptionIntegritySchema = z.object({
  id: z.string().optional(),
  business_id: z.string().min(1, "business_id is required"),
  businessId: z.string().optional(),
  plan: z.string().min(1, "Plan code is required"),
  status: z.enum(["ACTIVE", "TRIAL", "EXPIRED", "GRACE_PERIOD", "SUSPENDED", "BLOCKED", "CANCELLED", "PENDING"]).default("ACTIVE"),
  trialEndsAt: z.string().optional(),
  expiresAt: z.string().optional(),
  seatsUsed: z.number().min(0).optional(),
  allowedLimits: z.object({
    maxEmployees: z.number().min(1),
    maxBranches: z.number().min(1).optional(),
    maxTransactions: z.number().min(1).optional(),
    featuresEnabled: z.array(z.string()).optional()
  }).optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional()
});

export const FeatureMatrixIntegritySchema = z.object({
  businessId: z.string().optional(),
  business_id: z.string().optional(),
  features: z.record(z.string(), z.boolean()).optional(),
  attendance: z.boolean().optional(),
  payroll: z.boolean().optional(),
  accounting: z.boolean().optional(),
  pos: z.boolean().optional(),
  hr: z.boolean().optional(),
  crm: z.boolean().optional(),
  bi: z.boolean().optional(),
  aiCfo: z.boolean().optional(),
  advanced_payroll: z.boolean().optional(),
  multi_branch: z.boolean().optional(),
  forensic_hash_verifier: z.boolean().optional(),
  pessimistic_lock_override: z.boolean().optional(),
  updatedAt: z.any().optional()
});


