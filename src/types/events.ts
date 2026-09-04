/**
 * FINOPS ERP — Event Type Definitions & Schemas
 * Standardized interface for Enterprise EventBus, Outbox, and Messaging Pipelines.
 */

export interface FinopsEvent<T = any> {
  /**
   * The event type identifier (e.g. "INVOICE_POSTED", "EMPLOYEE_CREATED", "InvoicePosted").
   */
  type: string;

  /**
   * The tenant identifier (partition key). Multi-tenant isolation requires this to be present.
   */
  businessId: string;

  /**
   * Strongly typed domain payload.
   */
  payload: T;

  /**
   * ISO-8601 UTC timestamp of when the event occurred.
   */
  timestamp: string;

  /**
   * Distributed tracing identifier tracking the root operation across services.
   */
  correlationId: string;

  /**
   * Unique event identifier (UUID or KSUID).
   */
  eventId?: string;

  /**
   * Identifier of the event that directly caused this event in a workflow chain.
   */
  causationId?: string;

  /**
   * Authenticated user ID (or "system") triggering the event.
   */
  actorId?: string;

  /**
   * Top-level architectural module (e.g. "CRM", "ACCOUNTING", "WORKFORCE", "PAYROLL", "SYSTEM").
   */
  module?: string;

  /**
   * Aggregate root context (e.g. "INVOICE", "EMPLOYEE", "LEDGER", "SNAPSHOT").
   */
  aggregate?: string;

  /**
   * Standardized uppercase discriminated event type (e.g. "INVOICE_POSTED").
   */
  eventType?: string;

  /**
   * Emitting source component/service.
   */
  source?: string;

  /**
   * Semantic version of the event schema.
   */
  version?: string;

  /**
   * Processing lifecycle status.
   */
  status?: "PENDING" | "PROCESSED" | "FAILED";

  /**
   * Contextual metadata and telemetry headers.
   */
  metadata?: Record<string, any>;
}

export type FinopsEventCallback<T = any> = (event: FinopsEvent<T>) => void | Promise<void>;

// ==========================================
// Domain-Specific Typed Event Payloads
// ==========================================

export interface InvoicePostedEventPayload {
  invoiceId: string;
  businessId: string;
  leadId?: string;
  leadName?: string;
  totalAmountHtg: number;
  subtotalHtg: number;
  taxAmountHtg: number;
  issuedAt: string;
  branchId?: string;
  departmentId?: string;
  accountingTransactionId?: string;
}

export interface InvoicePaidEventPayload {
  invoiceId: string;
  businessId: string;
  amountPaid: number;
  paymentMethod: string;
  paidAt: string;
  paymentTransactionId?: string;
}

export interface ProformaConvertedEventPayload {
  proformaId: string;
  invoiceId: string;
  businessId: string;
  leadId: string;
}

export interface EmployeeCreatedEventPayload {
  employeeId: string;
  businessId: string;
  name: string;
  departmentId?: string;
  branchId?: string;
  salaryBaseHtg?: number;
}

export interface EmployeeSuspendedEventPayload {
  employeeId: string;
  businessId: string;
  reason?: string;
  actorId?: string;
}

export interface EmployeeReactivatedEventPayload {
  employeeId: string;
  businessId: string;
  actorId?: string;
}

export interface AttendanceClockedEventPayload {
  logId: string;
  employeeId: string;
  businessId: string;
  timestamp: string;
  mode: "IN" | "OUT";
  branchId?: string;
}

export interface TransactionCommittedEventPayload {
  txId: string;
  businessId: string;
  journalEntryId?: string;
  debitAccount: string;
  creditAccount: string;
  amountCents: number;
  entries?: Array<{
    accountNumber: string;
    debitAmount: number;
    creditAmount: number;
  }>;
}

export interface PayrollApprovedEventPayload {
  cycleId: string;
  businessId: string;
  periodStart: string;
  periodEnd: string;
  totalGross: number;
  totalNet: number;
  totalONA: number;
  totalOFATMA: number;
  payslipCount: number;
}

export interface SnapshotGeneratedEventPayload {
  snapshotId: string;
  businessId: string;
  period: string;
  calculatedAt: string;
  totalRevenue?: number;
  totalExpenses?: number;
}

export interface OrphanTransactionsRemediatedPayload {
  businessId: string;
  remediatedCount: number;
  defaultBranchId: string;
  defaultDepartmentId: string;
  sha256Seal: string;
}

export interface FeatureFlagUpdatedPayload {
  businessId: string;
  featureKey: string;
  enabled: boolean;
  updatedBy?: string;
}

/**
 * Registry mapping standard event type strings to their typed payload structures.
 */
export interface FinopsEventPayloadMap {
  "INVOICE_POSTED": InvoicePostedEventPayload;
  "InvoicePosted": InvoicePostedEventPayload;
  "INVOICE_PAID": InvoicePaidEventPayload;
  "InvoicePaid": InvoicePaidEventPayload;
  "PROFORMA_CONVERTED": ProformaConvertedEventPayload;
  "EMPLOYEE_CREATED": EmployeeCreatedEventPayload;
  "EMPLOYEE_SUSPENDED": EmployeeSuspendedEventPayload;
  "EMPLOYEE_ACTIVATED": EmployeeReactivatedEventPayload;
  "ATTENDANCE_CLOCKED": AttendanceClockedEventPayload;
  "TRANSACTION_COMMITTED": TransactionCommittedEventPayload;
  "PAYROLL_APPROVED": PayrollApprovedEventPayload;
  "SNAPSHOT_GENERATED": SnapshotGeneratedEventPayload;
  "ORPHAN_TRANSACTIONS_REMEDIATED": OrphanTransactionsRemediatedPayload;
  "FEATURE_FLAG_UPDATED": FeatureFlagUpdatedPayload;
}
