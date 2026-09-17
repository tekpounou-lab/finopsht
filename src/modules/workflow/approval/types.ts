export type ApprovalStatus =
  | "DRAFT"
  | "PENDING"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED"
  | "EXECUTION_PENDING"
  | "EXECUTING"
  | "EXECUTED"
  | "EXECUTION_FAILED";

export interface ApprovalStep {
  id: string;
  level: number;
  roleRequired: string; // e.g., "MANAGER", "HR", "OWNER"
  assignedTo?: string[]; // Specific user IDs if applicable
  status: "PENDING" | "APPROVED" | "REJECTED";
  actedBy?: string;
  actedAt?: string;
  comment?: string;
}

export interface ApprovalPolicy {
  id: string;
  businessId: string;
  business_id?: string;
  name: string;
  entityType: string;
  minLevels: number;
  version?: number;
  steps: {
    level: number;
    roleRequired: string;
    assignedTo?: string[];
  }[];
}

export interface ApprovalPolicySnapshot {
  policyId: string;
  policyVersion: number;
  name: string;
  minLevels: number;
  steps: {
    level: number;
    roleRequired: string;
    assignedTo?: string[];
  }[];
}

export interface PayrollSnapshotEmployee {
  employeeId: string;
  employeeName: string;
  grossCents: number;
  netCents: number;
  employerTaxesCents: number;
  employeeDeductionsCents: number;
  advancesCents: number;
}

export interface PayrollSourceSnapshot {
  cycleId: string;
  business_id: string;
  totalGrossCents: number;
  totalNetCents: number;
  totalEmployerDeductionsCents: number;
  currency: string;
  effectiveAccountingDate: string;
  employees: PayrollSnapshotEmployee[];
}

export interface ApprovalInstance {
  id: string;
  business_id: string;
  businessId: string;
  entityType: string;
  entityId: string;
  sourceDocPath?: string;
  sourceVersion?: string;
  sourceHash?: string;
  amount_cents?: number;
  currency?: string;
  accountingDimensions?: {
    departmentId?: string;
    branchId?: string;
    costCenter?: string;
  };

  policyId?: string;
  policyVersion?: number;
  policySnapshot?: ApprovalPolicySnapshot;

  requesterId?: string;
  initiatorId?: string;
  workflowInstanceId?: string;

  status: ApprovalStatus;
  currentLevel: number;
  steps: ApprovalStep[];

  idempotencyKey?: string;
  executionId?: string;

  claimedByWorker?: string;
  leaseExpiresAt?: string;

  ledgerTransactionId?: string;
  executionError?: string;
  cancellationReason?: string;

  createdAt: string;
  updatedAt: string;
  actedByUid?: string;
  actedAt?: string;
}

export interface ActiveApprovalLock {
  lockId: string;
  business_id: string;
  entityType: string;
  entityId: string;
  approvalInstanceId: string;
  status: ApprovalStatus;
  acquiredAt: string;
  updatedAt: string;
}
