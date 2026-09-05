// TypeScript definitions for FinOps (Tek Pou Nou) ERP System

import type { 
  Business, 
  Branch, 
  Department, 
  BusinessUnit, 
  CostCenter, 
  Role as CustomRole, 
  BusinessSettings, 
  EmployeeDepartmentLink 
} from "./types/organization";

export type Role = "OWNER" | "MANAGER" | "SUPERVISOR" | "EMPLOYEE" | "SUPER_ADMIN" | "UNASSIGNED";
export type UserRole = Role;

export type { 
  Business, 
  Branch, 
  Department, 
  BusinessUnit, 
  CostCenter, 
  CustomRole, 
  BusinessSettings, 
  EmployeeDepartmentLink 
};
export type { 
  AppNotification, 
  CreateNotificationDTO, 
  NotificationFilters, 
  NotificationQueryOptions, 
  NotificationType, 
  NotificationSeverity 
} from "./types/notifications";
export type {
  Lead,
  LeadStatus,
  LeadSource,
  Prospect,
  InvoiceLine,
  Proforma,
  ProformaStatus,
  Invoice,
  InvoiceStatus,
  InvoiceTemplate
} from "./types/crm";

export interface EmployeeDepartmentAssignment {
  id: string;
  employeeId?: string;
  employee_id?: string;
  departmentId?: string;
  department_id?: string;
  role?: string;
  primary: boolean;
  allocationPercentage?: number; // e.g. 70, 30
  allocation_percentage?: number;
  startDate?: string;
  start_date?: string;
  endDate?: string;
  end_date?: string;
  status: "ACTIVE" | "INACTIVE" | "PENDING";
}

export interface UserProfile {
  id: string;
  uid?: string;
  email: string;
  name: string;
  displayName?: string;
  phoneNumber?: string;
  phone?: string;
  role: Role;
  requested_role?: "MEMBER" | "OWNER" | Role | string;
  requestedRole?: "MEMBER" | "OWNER" | Role | string;
  businessId?: string;
  business_id?: string;
  branchId?: string;
  departmentId?: string;
  avatarUrl?: string;
  employeeId?: string;
  employee_id?: string;
  accountStatus?: "NEW_USER" | "PENDING_MEMBER" | "PENDING_OWNER" | "ACTIVE" | "REJECTED" | string;
  account_status?: "NEW_USER" | "PENDING_MEMBER" | "PENDING_OWNER" | "ACTIVE" | "REJECTED" | string;
  businessStatus?: string;
  business_status?: string;
  status?: string;
  onboardingComplete?: boolean;
  onboarding_completed?: boolean;
  createdAt?: any;
  updatedAt?: any;
  created_at?: any;
  updated_at?: any;
}

export type User = UserProfile;

export interface Employee {
  id: string; // The immutable employeeId (maps to the Firestore doc ID)
  uid?: string; // firebaseUid
  firebase_uid?: string;
  businessId?: string;
  branchId: string;
  departmentId: string;
  name: string;
  displayName?: string;
  email: string;
  role: Role;
  baseSalary: number; // Integer (Gourdes)
  salaryBaseHtg?: number;
  paymentModel: "FIXED" | "COMMISSION" | "HYBRID";
  phone?: string;
  position?: string;
  contractType?: "cdi" | "cdd" | "freelance";
  payRegime?: "fixe" | "commission" | "hybrid";
  commissionRate?: number;
  onboardingComplete?: boolean;
  isActive?: boolean;
  hireDate?: string;
  branchName?: string;
  departmentName?: string;

  // Backward compatibility legacy fields
  business_id?: string;
  branch_id?: string;
  department_id?: string;
  department_name?: string;
  branch_name?: string;
  commission_rate?: number;
  employee_id?: string;
  email_history?: string[];

  // Workforce Identity Platform V1 SSOT additions
  normalizedEmail?: string;
  emailHistory?: string[];
  status?: "DRAFT" | "INVITED" | "PENDING_ACCEPTANCE" | "ACTIVE" | "SUSPENDED" | "TERMINATED" | "ARCHIVED" | "ON_LEAVE" | "PENDING";
  badgeId?: string;
  managerId?: string;
  departmentAssignments?: EmployeeDepartmentAssignment[];
  primaryDepartmentId?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface EmployeeDepartmentActivity {
  id?: string;
  business_id: string;
  businessId?: string;
  employee_id: string;
  employeeId?: string;
  employeeName?: string;
  department_id: string;
  departmentId?: string;
  department_name: string;
  departmentName?: string;
  branch_id: string;
  branchId?: string;
  branchName?: string;
  first_sale_at: string;
  last_sale_at: string;
  sales_count: number;
  sales_amount: number;
  salesAmount?: number;
  commission_amount: number;
  commissionAmount?: number;
  serviceHours?: number;
  last_payroll_cycle: string;
  lastPayrollCycle?: string;
  created_at: string;
  createdAt?: string;
  updated_at: string;
  updatedAt?: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  business_id: string;
  branchId: string;
  departmentId?: string;
  date: string; // YYYY-MM-DD
  checkIn: string; // HH:MM:SS
  checkOut: string | null; // HH:MM:SS
  plannedHours: number;
  realHours: number;
  variance: number; // real - planned (hours): positive for overtime (+), negative for shortfall (-)
  status: "NORMAL" | "LATE" | "ABSENT" | "OVERTIME" | "PENDING_VERIFICATION";
  overrideReason?: string;
  overrideBy?: string;
}

export interface PayrollCycle {
  id: string;
  business_id: string;
  cycleName: string; // e.g. "Quinzaine 1 - Mai 2026"
  cycleType?: "REGULAR_FIRST_HALF" | "REGULAR_SECOND_HALF" | "BONUS";
  effectiveAccountingDate?: string; // Financial effective posting date (e.g. YYYY-MM-15 or YYYY-MM-LASTDAY)
  label?: "Q1" | "Q2";
  month?: number;
  year?: number;
  startDate: string;
  endDate: string;
  start_date?: string;
  end_date?: string;
  status: "DRAFT" | "VALIDATED" | "LOCKED" | "PAID" | "REOPEN_REQUESTED" | "REOPEN_APPROVED";
  reopenReason?: string;
  reopenRequestedBy?: string;
  reopenRequestedAt?: any;
  generated_by?: string;
  validatedBy?: string;
  validatedAt?: any;
  disbursedAt?: string;
  disbursedBy?: string;
  created_at?: any;
  updated_at?: any;
  excludedEmployeeIds?: string[];
}

export interface PayrollRecord {
  id: string;
  cycleId: string;
  payroll_cycle_id?: string;
  business_id: string;
  employeeId: string;
  employee_id?: string;
  employeeName: string;
  branch_id?: string;
  department_id?: string;
  pay_profile?: "FIXED" | "COMMISSION" | "HYBRID";
  globalPerformanceScore?: number;
  attendanceScore?: number;
  productivityRatio?: number;
  theoretical_quincena_base_cents?: number;
  attendance_adjustment_cents?: number;
  overtime_cents?: number;
  worked_minutes?: number;
  base_salary_cents?: number;
  commission_cents?: number;
  commission_rate?: number;
  commission_rate_stored?: number;
  commission_rate_used?: number;
  sales_cents?: number;
  bonuses_cents?: number;
  penalties_cents?: number;
  debts_deduction_cents?: number;
  cnss_employee_cents?: number;
  cnss_employer_cents?: number;
  cns_employee_cents?: number;
  ofatma_employer_cents?: number;
  gross_salary_cents?: number;
  net_salary_cents?: number;
  projected_net_salary_cents?: number;
  isExcluded?: boolean;
  grossSalary: number; // base salary matching the cycle/pay schema
  cnssDeduction: number; // 6% CNSS employer/employee distribution
  cnsDeduction: number; // 2% CNS
  commissions: number;
  advancesTreated: number; // Ledger advances subtracted
  netPaid: number; // Integer: Gross + Commissions - deductions - advances
  status: "PENDING" | "APPROVED" | "PAID" | "DRAFT" | "VALIDATED" | "LOCKED" | "CORRECTED";
  hashSignature: string; // Crypto or simple signature trace
  protectionRuleEnforced?: boolean;
  performance_bonus_cents?: number;
  custom_override_bonus_cents?: number;
  custom_override_commission_cents?: number;
  generated_at?: any;
  updated_at?: any;
}

export interface LedgerTransaction {
  id: string;
  businessId?: string;
  business_id?: string;
  branchId: string;
  branch_id?: string;
  departmentId?: string;
  department_id?: string;
  employeeId?: string; // Linked employee (optional)
  employee_id?: string;
  branchCode?: string;
  branch_code?: string;
  branchName?: string;
  branch_name?: string;
  departmentCode?: string;
  department_code?: string;
  departmentName?: string;
  department_name?: string;
  employeeEmail?: string;
  employee_email?: string;
  employeeName?: string;
  employee_name?: string;
  importBatchId?: string;
  commissionClaimed?: boolean;
  commission_claimed?: boolean;
  commissionSummaryId?: string;
  commission_summary_id?: string;
  type: "INCOME" | "EXPENSE" | "ADVANCE" | "TRANSFER" | "REFUND" | "CORRECTION" | "PAYROLL" | "BONUS" | "PENALTY" | "ADJUSTMENT" | "REVERSAL" | "COMPENSATION";
  amount: number; // Integer in Gourdes (backward compatibility)
  amount_cents: number; // Stored in cents (double safety precision)
  amountCents?: number;
  description: string;
  date: string;
  category: string;
  isImmutable: boolean;
  signerId: string;
  currency: "HTG" | "USD";
  status: "PENDING" | "POSTED" | "LOCKED" | "REVERSED";
  paymentMethod?: "CASH" | "BANK" | "MONCASH" | "NATCASH" | "CARD" | "WIRE" | "NON_CASH";
  payment_method?: string;
  source: "MANUAL" | "CSV_IMPORT" | "PAYROLL_ENGINE" | "SYSTEM" | "AI_AUTOMATION";
  debit_account?: string; // Double entry tracking
  credit_account?: string; // Double entry tracking
  debitAccount?: string;
  creditAccount?: string;
  debit?: number; // Debit leg amount (e.g. Gourdes)
  credit?: number; // Credit leg amount (e.g. Gourdes)
  debit_cents?: number;
  credit_cents?: number;
  debitCents?: number;
  creditCents?: number;
  referenceTransactionId?: string; // ID of the original transaction when reversed or corrected
  isLocked?: boolean;
  metadata?: {
    importedBy?: string;
    payrollCycleId?: string;
    correctionOf?: string;
    [key: string]: any;
  };
  createdBy?: string;
  createdAt?: any;
  updatedAt?: any;
  created_at?: any;
  updated_at?: any;
}

export interface LedgerEntry {
  id: string;
  business_id: string;
  transaction_id: string;
  previous_balance_cents: number;
  delta_cents: number;
  balance_after_cents: number;
  currency: "HTG" | "USD";
  entry_type: "DEBIT" | "CREDIT";
  immutable_hash: string;
  created_at: string;
}

export interface Debt {
  id: string;
  business_id: string;
  employee_id: string;
  originating_transaction_id: string;
  original_amount_cents: number;
  remaining_balance_cents: number;
  status: "ACTIVE" | "PARTIALLY_PAID" | "SETTLED";
  created_at: string;
  updated_at: string;
}

export interface ForensicLog {
  id: string;
  timestamp: any;
  userId?: string;
  userName: string;
  userRole: Role | string;
  userEmail?: string;
  business_id: string;
  action: string; // e.g. "PAYROLL_LOCK", "ATTENDANCE_OVERRIDE", "LEDGER_ADD"
  beforeState?: string | any; // JSON String or object state
  afterState?: string | any; // JSON String or object state
  details?: string;
  ipAddress?: string;
  userAgent?: string;
  signature: string; // Hash signature representing the state transitions
  actorId?: string;
  branchId?: string;
  entityType?: string;
  entityId?: string;
  metadata?: any;
  severity?: "info" | "warning" | "critical" | "AUDIT_GRADE";
  hash?: string;
}

export type SecurityAlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type SecurityAuditEventType =
  | "TENANT_SWITCH"
  | "DATA_ACCESS"
  | "AUTH_STATE_CHANGE"
  | "IDENTITY_RESOLUTION"
  | "ISOLATION_VIOLATION_BLOCKED"
  | "SESSION_PURGE"
  | "ROLE_ESCALATION_BLOCKED"
  | "COMPANY_REGISTRATION_VERIFIED";

export interface SecurityAuditLog {
  id: string;
  eventType: SecurityAuditEventType;
  business_id: string;
  previous_business_id?: string | null;
  target_business_id?: string | null;
  actor_uid: string;
  actor_email?: string | null;
  actor_role?: string | null;
  collection_name?: string;
  operation_type?: string;
  status: "SUCCESS" | "BLOCKED" | "WARNING" | "AUDIT_OK";
  reason?: string;
  details?: Record<string, any>;
  signature: string;
  timestamp: string;
  client_session_id?: string;
  _server_timestamp?: any;
}

export type SecurityAlertType =
  | "FAILED_LOGIN"
  | "UNUSUAL_IP"
  | "PRIVILEGE_ESCALATION"
  | "PAYROLL_REOPEN_HI"
  | "SUSPICIOUS_DATA_ACCESS"
  | "TENANT_BOUNDARY_VIOLATION"
  | "MFA_BYPASS_ATTEMPT"
  | "ACCOUNT_LOCKED"
  | "FORENSIC_SEAL_MISMATCH"
  | "POLICY_VIOLATION";

export type SecurityAlertStatus = "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";

export interface SecurityAlert {
  id: string;
  type: SecurityAlertType | string;
  user: string;
  userId?: string;
  tenant: string;
  tenantId?: string;
  detail: string;
  severity: SecurityAlertSeverity;
  time: string;
  ip: string;
  status: SecurityAlertStatus;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  signature?: string;
}

export interface PlatformSecurityPolicy {
  id: string;
  mfaMandatoryForOwners: boolean;
  mfaMandatoryForAll: boolean;
  superAdminIpRestrictions: string[];
  ipRestrictionEnabled: boolean;
  sessionTimeoutMinutes: number;
  maxFailedLoginAttempts: number;
  autoLockoutEnabled: boolean;
  enforceForensicSignatures: boolean;
  strictMultiTenantIsolation: boolean;
  complianceFrameworks: {
    soc2: boolean;
    gdpr: boolean;
    iso27001: boolean;
    pciDss: boolean;
  };
  lastAuditedAt?: string;
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
}

export interface AnalyticsSnapshot {
  id: string;
  business_id?: string;
  businessId?: string; // Support both
  snapshotDate?: string;
  employeeCount?: number;
  attendanceRate?: number;
  payrollCost?: number;
  turnoverRate?: number;
  cashFlow?: number;
  netProfit?: number;
  timestamp?: string;
  periodKey?: string;
  generatedAt?: string;
  metrics?: {
    revenue: {
      totalHTG: number;
      byDepartment: Record<string, number>;
      byBranch: Record<string, number>;
      byEmployee: Record<string, number>;
      growthRate: number; // period-over-period
    };
    expenses: {
      totalHTG: number;
      byCategory: Record<string, number>;
      byDepartment: Record<string, number>;
      payrollTotal: number;
      operationalTotal: number;
    };
    profit: {
      netHTG: number;
      margin: number; // percentage
      operatingProfit: number;
      netProfit: number;
    };
    attendance: {
      overallRate: number;
      lateRate: number;
      absenceRate: number;
      overtimeHours: number;
      byEmployee: Record<string, { rate: number; lateCount: number; absenceCount: number }>;
    };
    workforce: {
      activeEmployees: number;
      departments: number;
      branches: number;
      turnoverRate: number;
      averageTenure: number; // months
    };
    forecast: {
      burnRate: number; // HTG per day
      runwayDays: number;
      projectedRevenue: number;
      projectedExpenses: number;
      confidenceScore: number;
    };
  };
  signature?: string; // SHA-256 seal
  createdAt?: string;
  updatedAt?: string;
}

export interface ERPEvent {
  id: string; // The primary key
  eventId?: string;
  eventType?: string;
  sourceModule?: string;
  timestamp: string;
  processedAt?: string;
  type: "HR" | "ATTENDANCE" | "PAYROLL" | "LEDGER" | "ORGANIZATION" | "INVITATION" | string;
  business_id: string;
  entityId?: string;
  employeeId?: string;
  payload?: any;
  status?: "PROCESSED" | "FAILED" | "DLQ" | "REPLAYED" | "PENDING" | "PROCESSING" | "SUCCESS" | "COMPENSATED" | "DEAD_LETTER" | string;
  errorMessage?: string;
  retryCount?: number;
  replayCount?: number;
  idempotencyKey?: string;
  executionDurationMs?: number;
  correlationId?: string;
  parentEventId?: string;
  checksum?: string;
  title?: string;
  desc?: string;
  severity?: string;
}

export interface Invitation {
  id: string;
  business_id: string;
  businessId?: string;
  business_name?: string;
  businessName?: string;
  employeeId?: string;
  employee_id?: string;
  firebase_uid?: string;
  email: string;
  normalizedEmail?: string;
  email_history?: string[];
  name?: string;
  phone?: string;
  position?: string;
  paymentModel?: "FIXED" | "COMMISSION" | "HYBRID";
  baseSalary?: number;
  commissionRate?: number;
  role: Role;
  branchId: string;
  branch_name?: string;
  departmentId: string;
  department_name?: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED" | "REJECTED" | "SENT";
  invitedAt: string;
  invitedBy?: string;
  token?: string; // unique transaction token
  expiresAt?: string; // invitation expiration date
  acceptedAt?: any;
  rejectedAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface PendingBusiness {
  id: string; // Document ID (ou requestId)
  ownerUid: string; // Firebase Auth UID du demandeur
  owner_uid?: string;
  ownerEmail: string;
  owner_email?: string;
  ownerName?: string;
  businessName: string;
  taxId?: string; // Numéro fiscal (NIF / CIF)
  industry?: string;
  selectedPlan: "STARTER" | "PROFESSIONAL" | "BUSINESS" | "ENTERPRISE";
  status: "PENDING" | "APPROVED" | "REJECTED";
  businessId?: string; // Renseigné lors de l'approbation
  rejectionReason?: string; // Si rejeté
  approvalNote?: string;
  approvedBy?: string; // UID du Super Admin
  approvedAt?: any;
  createdAt: any;
  updatedAt: any;
}

export interface EmployeeBadge {
  id: string;
  employeeId: string;
  business_id: string;
  branchId: string;
  branch_name?: string;
  departmentId: string;
  department_name?: string;
  role: string;
  issuedAt: string;
  signature: string; // HMAC SHA256 simulation signature
  qrPayload: string; // JSON payload represented as QR string
}

export interface EmployeeContract {
  id: string;
  employeeId: string;
  business_id: string;
  fileUrl: string; // Simulated file link
  contractType: "cdi" | "cdd" | "freelance";
  payRegime: "fixe" | "commission" | "hybrid";
  salaryBaseHtg: number;
  commissionRate?: number;
  generatedAt: string;
  status: "active" | "terminated";
}

export interface LeaveRecord {
  id: string;
  business_id: string;
  employeeId: string;
  employeeName: string;
  departmentId?: string;
  type: "SICK" | "VACATION" | "PERSONAL" | "ANNUAL_LEAVE" | "SICK_LEAVE" | "SPECIAL_LEAVE" | "MATERNITY_LEAVE" | "UNPAID_LEAVE" | string;
  leaveType?: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "PAYROLL_SYNCED" | "SUBMITTED" | "MANAGER_REVIEW" | "DRAFT" | "ARCHIVED";
  processedBy?: string;
  totalDays?: number;
  rejectionReason?: string;
  attachmentUrl?: string;
  updatedAt?: any;
  createdAt?: any;
  submittedBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  leavePolicyId?: string;
}

export interface LeaveBalanceItem {
  leaveType: string;
  entitlementDays: number;
  accruedDays: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
  carriedOverDays?: number;
}

export interface LeaveBalance {
  id: string; // `${business_id}_${employeeId}_${year}`
  business_id: string;
  employeeId: string;
  employeeName?: string;
  year: number;
  balances: Record<string, LeaveBalanceItem>;
  updatedAt: string;
}

export interface LeavePolicy {
  id: string;
  business_id: string;
  leaveType: string;
  name: string;
  paid: boolean;
  requiresApproval: boolean;
  maxDaysPerYear: number;
  requiresDocument: boolean;
  maxCarryoverDays?: number;
  allowHalfDay?: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveApprovalLog {
  id: string;
  leaveId: string;
  business_id: string;
  employeeId: string;
  action: "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED" | "STATUS_CHANGED";
  beforeStatus?: string;
  afterStatus: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  rejectionReason?: string;
  timestamp: string;
}

export interface OvertimeRequest {
  id: string;
  requestId: string;
  business_id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
  totalHours: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AbsenceEvent {
  id: string;
  businessId: string;
  employeeId: string;
  employeeName: string;
  date: string;
  type: "UNEXCUSED_ABSENCE" | "CRITICAL_LATE" | "EARLY_LEAVE";
  minutes?: number;
  status: "PENDING_JUSTIFICATION" | "JUSTIFIED" | "REJECTED_JUSTIFICATION";
  justification?: string;
  justifiedBy?: string;
  justifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollHRSnapshot {
  employee_id: string;
  display_name: string;
  employee_name?: string;
  email: string;
  contract_type: string;
  pay_regime: "FIXED" | "COMMISSION" | "HYBRID";
  salary_base: number;
  commission_rate: number;
  primary_branch: string;
  primary_department: string;
  branch_id?: string;
  department_id?: string;
  job_title?: string;
  hire_date?: string;
}

export interface PayrollSalesSnapshot {
  sales_total: number;
  transaction_count: number;
  sales_by_department?: Record<string, number>;
  commission_rate: number;
  commission_amount: number;
  source?: string;
}

export interface PayrollAttendanceSnapshot {
  expected_hours: number;
  worked_hours: number;
  extra_hours: number;
  missing_hours: number;
  prime_amount: number;
  penalty_amount: number;
  prime_hours?: number;
  penalty_hours?: number;
  prime?: number;
  penalty?: number;
}

export interface PayrollManualAdjustmentItem {
  id: string;
  type: "BONUS" | "DEDUCTION" | "ADJUSTMENT";
  amount: number;
  reason: string;
  notes?: string;
}

export interface PayrollAdjustmentsSnapshot {
  manual_bonus: number;
  manual_deduction: number;
  advances?: number;
  bonus?: number;
  deduction?: number;
  items?: any[];
  manual_adjustments?: PayrollManualAdjustmentItem[];
}

export interface PayrollInputSnapshot {
  id: string;
  snapshot_id?: string;
  business_id: string;
  employee_id: string;
  employeeId: string;
  employeeName: string;
  payroll_cycle_id: string;
  cycleId: string;
  cycleName: string;

  created_at?: string;
  generated_at?: string;
  generatedAt: string;
  generated_by?: string;
  period_start?: string;
  period_end?: string;
  version?: number;
  status?: "DRAFT" | "LOCKED" | "REGENERATED" | "APPROVED" | "PAID";
  hash?: string;
  hashSignature?: string;

  source_counts?: {
    attendance_records: number;
    ledger_transactions: number;
    adjustments_count?: number;
  };
  attendance_version?: number | string;
  ledger_version?: number | string;
  employee_version?: number | string;

  hr?: PayrollHRSnapshot;
  sales?: PayrollSalesSnapshot;
  attendance?: PayrollAttendanceSnapshot;
  adjustments?: PayrollAdjustmentsSnapshot;

  workedHours: number;
  scheduledHours: number;
  overtimeHours: number;
  nightHours: number;
  weekendHours: number;
  holidayHours: number;
  netPayrollHours: number;
  baseSalaryHtg: number;
  leaveCompensationHtg: number;
  bonusesHtg: number;
  commissionsHtg: number;
  salesHtg?: number;
  latePenaltiesHtg: number;
  absencePenaltiesHtg: number;
  advancesHtg: number;
  deductionsHtg: {
    cnss: number;
    cns: number;
    other: number;
    total: number;
  };
  grossSalaryHtg: number;
  netSalaryHtg: number;
  attendanceScore: number;
  punctualityScore: number;
  scheduleCompliance: number;
  leaveCompliance: number;
  overtimeContribution: number;
  productivityScore: number;
  overallWorkforceScore: number;
  payrollStatus: "DRAFT" | "APPROVED" | "LOCKED" | "REGENERATED" | "PAID";
  approvedBy?: string;
  approvedAt?: string;
}

export interface SalaryStructure {
  id: string;
  businessId: string;
  business_id?: string;
  employeeId: string;
  employee_id?: string;
  baseSalaryCents: number;
  base_salary_cents?: number;
  paymentInterval: "WEEKLY" | "BIWEEKLY" | "SEMIMONTHLY" | "MONTHLY" | "CUSTOM";
  salary_interval?: "WEEKLY" | "BIWEEKLY" | "SEMIMONTHLY" | "MONTHLY" | "CUSTOM";
  hourlyRateCents: number;
  dailyRateCents: number;
  currency: "HTG" | "USD";
  payment_currency?: "HTG" | "USD";
  socialTaxEligible: boolean;
  social_tax_eligible?: boolean;
  insuranceContributionCents: number;
  insurance_cents?: number;
  payment_method?: "BANK" | "CASH" | "MOBILE_MONEY" | "CHEQUE";
  bank_name?: string;
  bank_account_number?: string;
  updatedAt: string;
  updated_at?: string;
}

export interface PayrollProfile {
  id: string;
  businessId: string;
  employeeId: string;
  paymentMethod: "BANK" | "CASH" | "MOBILE_MONEY" | "CHEQUE";
  bankName?: string;
  bankAccount?: string;
  mobileProvider?: string;
  mobileNumber?: string;
  updatedAt: string;
}

export interface SalaryAdvance {
  id: string;
  businessId: string;
  business_id?: string;
  employeeId: string;
  employee_id?: string;
  employeeName: string;
  employee_name?: string;
  amountCents: number;
  advance_amount_cents?: number;
  installments: number;
  remainingCents: number;
  balance_cents?: number;
  installmentAmountCents: number;
  recovery_installment_cents?: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "FULLY_REPAID" | string;
  approvedBy?: string;
  approvedAt?: string;
  requestedAt: string;
  created_at?: string;
  reason?: string;
}

export interface PayrollBonus {
  id: string;
  businessId: string;
  business_id?: string;
  employeeId: string;
  employee_id?: string;
  employeeName?: string;
  employee_name?: string;
  amountCents: number;
  bonus_amount_cents?: number;
  category: "PERFORMANCE" | "HOLIDAY" | "CHRISTMAS" | "ATTENDANCE" | "COMMISSION" | "SPOT" | "MANUAL" | "RECURRING" | string;
  description: string;
  reason?: string;
  date: string;
  payroll_cycle_id?: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | string;
  created_at?: string;
}

export interface PayrollDeduction {
  id: string;
  businessId: string;
  business_id?: string;
  employeeId: string;
  employee_id?: string;
  employeeName?: string;
  employee_name?: string;
  amountCents: number;
  deduction_amount_cents?: number;
  category: "TAX" | "INSURANCE" | "LOAN" | "ADVANCE" | "ABSENCE" | "LATE_PENALTY" | "DISCIPLINARY" | "CUSTOM" | string;
  description: string;
  reason?: string;
  date: string;
  payroll_cycle_id?: string;
  status: "ACTIVE" | "PROCESSED" | string;
  created_at?: string;
}
export interface Membership {
  id: string; // businessId_uid
  uid: string;
  business_id: string;
  role: Role;
  permissions: string[];
  status: "ACTIVE" | "SUSPENDED" | "PENDING";
  joinedAt: string;
  updatedAt: string;
  employee_id?: string;
  branch_id?: string;
  department_id?: string;
}

export interface Payslip {
  id: string;
  employeeId: string;
  business_id: string;
  period: string;
  amount_cents: number;
  status: "DRAFT" | "PUBLISHED" | "PAID";
  generatedAt: string;
  pdfUrl?: string;
}

export interface CompensationModelConfig {
  id?: string;
  employeeId: string;
  business_id: string;
  type: "FIXED" | "HOURLY" | "COMMISSION" | "PERCENTAGE" | "HYBRID";
  baseSalaryHtg: number;
  hourlyRateHtg: number;
  commissionRate: number;
  revenuePercentage: number;
  updatedAt?: any;
}

export interface PayrollPolicyConfig {
  id: string;
  business_id: string;
  scope: "COMPANY" | "DEPARTMENT" | "ROLE";
  scopeId: string;
  expectedHours: number;
  latenessToleranceMinutes: number;
  overtimeMultiplier: number;
  lateDeductionHtg: number;
  absenceDeductionHtg: number;
  updatedAt?: any;
}

export interface RoleKpi {
  id: string;
  name: string;
  weight: number;
  target: string;
  description: string;
  currentValue?: number;
}

export interface RoleProfile {
  id: string;
  business_id: string;
  title: string;
  kpis: RoleKpi[];
  updatedAt?: any;
}

export interface BusinessSnapshot {
  id: string; // businessId
  business: Business;
  branches: Branch[];
  departments: Department[];
  roles: any[]; // Data-driven roles
  permissions: any[]; // Permission matrix
  featureFlags: any;
  subscription: any;
  timestamp: string;
  version: number;
}

export interface Shift {
  id: string;
  business_id: string;
  employeeId: string;
  employeeName?: string;
  branchId?: string;
  departmentId?: string;
  startTime: string;
  endTime: string;
  date: string;
  plannedHours: number;
  status?: string;
  notes?: string;
}

export interface CorrectionRecord {
  id?: string;
  correction_type: string;
  reason: string;
  amount_cents: number;
  employee_id?: string;
  created_at?: string;
}

// === ENTERPRISE DOCUMENT MANAGEMENT SYSTEM (EDMS) TYPES ===
export type EDMSDocumentType = 
  | "EMPLOYMENT_CONTRACT"
  | "PAYSLIP"
  | "EMPLOYMENT_CERTIFICATE"
  | "SERVICE_RECORD"
  | "PROMOTION_LETTER"
  | "TRANSFER_LETTER"
  | "SALARY_CERTIFICATE"
  | "VACATION_APPROVAL"
  | "LEAVE_APPROVAL"
  | "DISCIPLINARY_LETTER"
  | "POLICY_ACCEPTANCE"
  | "TAX_DOCUMENT"
  | "CNSS_DOCUMENT"
  | "PERFORMANCE_REVIEW"
  | "TRAINING_CERTIFICATE"
  | "TERMINATION_LETTER"
  | "CUSTOM_DOCUMENT"
  | "SYSTEM_REPORT";

export type EDMSDocumentStatus = 
  | "DRAFT" 
  | "UPLOADED" 
  | "GENERATED" 
  | "ACTIVE" 
  | "VERIFIED" 
  | "SIGNED" 
  | "SUPERSEDED" 
  | "ARCHIVED" 
  | "RETENTION_LOCKED" 
  | "REVOKED" 
  | "EXPIRED";

export interface EDMSDocumentAuditEntry {
  action: 
    | "GENERATED" 
    | "UPLOADED"
    | "VIEWED" 
    | "DOWNLOADED" 
    | "PRINTED" 
    | "REGENERATED" 
    | "REVOKED" 
    | "SUPERSEDED"
    | "DELETED" 
    | "VERIFIED"
    | "ARCHIVED"
    | "RETENTION_LOCKED";
  userId: string;
  userName: string;
  userRole: string;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
  version: number;
  details?: string;
}

export interface EDMSDocument {
  id: string; // document_id
  documentType: EDMSDocumentType;
  employeeId: string;
  employeeName?: string;
  employeeEmail?: string;
  businessId: string; // business_id
  workspaceId: string;
  reference: string;
  title: string;
  status: EDMSDocumentStatus;
  version: number;
  mimeType: string;
  storagePath: string;
  storageProvider: "FIREBASE_STORAGE" | "CLOUD_STORAGE_LOCAL_VAULT";
  fileSize: number; // bytes
  checksum: string; // SHA256 checksum
  signature: string; // Digital seal / signature
  generatedAt: string;
  generatedBy: string;
  signed: boolean;
  signedAt?: string;
  expiresAt?: string;
  linkedEntityId?: string; // Optional linkage to specific payroll_cycle, contract, leave, etc.
  linkedEntityType?: "employee" | "payroll_cycle" | "payslip" | "contract" | "leave_request" | "tax_form" | "business";
  supersededBy?: string; // Reference ID of the new document that superseded this version
  supersededAt?: string; // ISO Timestamp when this document was superseded
  retentionExpiryDate?: string; // ISO Timestamp when statutory retention requirement expires
  isSealed?: boolean; // Flag indicating document is locked/sealed against any modifications
  metadata?: Record<string, any>;
  audit: EDMSDocumentAuditEntry[];
  dataUrl?: string; // Embedded base64 / blob URL for instant preview & download
  downloadUrl?: string; // Cloud Storage signed or public download URL
  parentId?: string; // Link to previous version if regenerated
}

// === ENTERPRISE WORKFORCE PERFORMANCE ARCHITECTURE TYPES ===

export interface EmployeeDepartmentHistory {
  id: string;
  business_id: string;
  employee_id: string;
  home_department_id: string;
  branch_id: string;
  manager_id?: string;
  position: string;
  commission_plan_id?: string;
  base_salary: number;
  effective_start_date: string; // YYYY-MM-DD
  effective_end_date?: string | null; // null if current
  change_reason: "PROMOTION" | "TRANSFER" | "RESTRUCTURING" | "RE-HIRE";
  approved_by: string;
  created_at?: any;
}

export interface CommissionRule {
  rule_id: string;
  product_category?: string;
  operational_department_id?: string;
  min_sale_amount?: number;
  commission_type: "PERCENTAGE" | "FLAT_FEE" | "TIERED";
  rate_value: number; // e.g. 5.5 for 5.5%
  tiers?: Array<{ min_threshold: number; rate: number }>;
}

export interface CommissionPlan {
  id: string;
  business_id: string;
  name: string;
  version: number;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  effective_start_date: string;
  effective_end_date?: string | null;
  rules: CommissionRule[];
  default_rate?: number;
  approved_by: string;
  approved_at?: any;
  created_at?: any;
  updated_at?: any;
}

export interface EmployeePerformanceSnapshot {
  id: string; // {business_id}_{employee_id}_{period_type}_{period_key}
  business_id: string;
  employee_id: string;
  employee_name: string;
  home_department_id: string;
  home_branch_id: string;
  period_type: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  period_key: string; // e.g., "2026-08" or "2026-Q3"
  
  // Financial Attribution
  total_revenue_generated: number;
  total_gross_margin: number;
  total_units_sold: number;
  transaction_count: number;
  average_ticket: number;
  
  // Cross-Department Sales Breakdown
  operational_department_distribution: Record<string, {
    department_name: string;
    departmentName?: string;
    revenue: number;
    percentage: number;
  }>;
  
  // Labor & Commission Cost
  allocated_base_payroll: number;
  total_commission_earned: number;
  total_labor_cost: number; // Payroll + Commission
  labor_cost_percentage: number; // (Labor Cost / Revenue Generated) * 100
  profit_generated: number; // Revenue - Direct Labor - Direct Expenses
  
  // Operational Metrics
  days_worked: number;
  total_hours_real: number;
  attendance_score: number; // 0 - 100%
  productivity_index: number; // Revenue per worked hour
  
  // Enterprise Rankings
  department_rank: number;
  branch_rank: number;
  business_rank: number;
  
  // Intelligence
  trend_vs_prior_period: number; // percentage change
  ai_recommendation?: string;
  created_at?: any;
}

export interface DepartmentPerformanceSnapshot {
  id: string; // {business_id}_{department_id}_{period_type}_{period_key}
  business_id: string;
  department_id: string;
  department_name: string;
  branch_id: string;
  period_type: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  period_key: string;
  
  // Financial P&L Breakdown
  operational_revenue: number; // Revenue credited to this dept as Operational Dept
  direct_expenses: number;
  indirect_expenses_allocated: number;
  
  // Workforce Payroll Allocation
  home_employee_payroll_cost: number; // Base salary of employees whose Home Dept is this
  commission_payout_cost: number; // Commissions paid to sales in this Operational Dept
  total_direct_labor_cost: number;
  
  // Profitability Metrics
  gross_margin: number;
  gross_margin_percentage: number;
  contribution_margin: number; // Operational Revenue - Total Direct Labor - Direct Expenses
  operating_margin: number;
  operating_margin_percentage: number;
  
  // Workforce Productivity
  headcount_home: number; // Home department active headcount
  active_selling_employees: number; // Distinct employees generating revenue in this dept
  
  // Intelligence & Trends
  revenue_trend: number;
  margin_trend: number;
  forecasted_next_period_revenue?: number;
  ai_performance_narrative?: string;
  created_at?: any;
}

export interface BranchPerformanceSnapshot {
  id: string;
  business_id: string;
  branch_id: string;
  branch_name: string;
  period_type: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  period_key: string;
  total_revenue: number;
  total_payroll_cost: number;
  total_commission_cost: number;
  contribution_margin: number;
  headcount: number;
  department_count: number;
  created_at?: any;
}

export interface BusinessPerformanceSnapshot {
  id: string;
  business_id: string;
  period_type: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  period_key: string;
  total_revenue: number;
  total_labor_cost: number;
  gross_margin: number;
  net_profit: number;
  total_headcount: number;
  ai_executive_summary?: string;
  created_at?: any;
}

export interface EmployeeSalesSummary {
  id: string; // ess_${business_id}_${payroll_cycle_id}_${employee_id}
  business_id: string;
  payroll_cycle_id: string;
  employee_id: string;
  employee_email?: string;
  included_transaction_ids?: string[]; // Transactions claimed by this summary
  gross_sales: number;
  transaction_count: number;
  department_breakdown: Record<string, {
    departmentId: string;
    departmentName?: string;
    salesAmount: number;
    transactionCount: number;
  }>;
  commission_rate: number;
  calculated_commission: number;
  generated_at: string;
  is_frozen?: boolean;
}

export interface EmployeeAttendanceSnapshot {
  id: string; // att_snap_${business_id}_${payroll_cycle_id}_${employee_id}
  business_id: string;
  payroll_cycle_id: string;
  employee_id: string;
  employee_email?: string;
  expected_hours: number;
  worked_hours: number;
  missing_hours: number;
  extra_hours: number;
  hourly_rate: number;
  prime_amount: number;
  penality_amount: number;
  attendance_score: number;
  status?: string;
  generated_at: string;
  is_frozen?: boolean;
}

export interface WorkforcePerformanceSnapshot {
  id: string;
  businessId: string;
  periodKey: string;
  employeeId: string;
  employeeName: string;
  departmentId: string;
  departmentName: string;
  branchId: string;
  branchName: string;
  metrics: {
    revenueGenerated: number;
    commissionEarned: number;
    attendanceRate: number;
    lateCount: number;
    absenceCount: number;
    overtimeHours: number;
    basePayroll: number;
    totalCompensation: number;
    performanceScore: number; // 0-100
  };
  signature: string;
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentAlias {
  id: string;
  businessId: string;
  business_id?: string;
  departmentId: string;
  aliases?: string[]; // e.g., ["Salon", "Barber Shop", "Coiffure"]
  alias?: string;
  isActive?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export * from "./types/events";









