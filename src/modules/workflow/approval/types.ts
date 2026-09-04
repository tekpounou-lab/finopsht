
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface ApprovalStep {
  id: string;
  level: number;
  roleRequired: string; // e.g., "MANAGER", "HR", "OWNER"
  assignedTo?: string[]; // Specific user IDs if applicable
  status: ApprovalStatus;
  actedBy?: string;
  actedAt?: string;
  comment?: string;
}

export interface ApprovalInstance {
  id: string;
  businessId: string;
  workflowInstanceId: string;
  entityId: string;
  entityType: string;
  policyId: string;
  initiatorId?: string;
  status: ApprovalStatus;
  currentLevel: number;
  steps: ApprovalStep[];
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalPolicy {
  id: string;
  businessId: string;
  name: string;
  entityType: string;
  minLevels: number;
  steps: {
    level: number;
    roleRequired: string;
  }[];
}
