
export type WorkflowStatus = "PENDING" | "RUNNING" | "WAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED" | "ROLLBACK_IN_PROGRESS" | "ROLLED_BACK";
export type StepStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED" | "COMPENSATED";

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  triggerEvent: string;
  version: string;
  isActive: boolean;
  compensationStrategy?: "AUTOMATIC" | "MANUAL" | "NONE";
}

export interface WorkflowInstance {
  id: string;
  definitionId: string;
  businessId: string;
  entityId: string;
  entityType: string;
  status: WorkflowStatus;
  currentStep: string;
  startedAt: string;
  updatedAt: string;
  correlationId: string;
  history: WorkflowHistoryEntry[];
  metadata?: Record<string, any>;
  compensationData?: Record<string, any>;
}

export interface WorkflowHistoryEntry {
  timestamp: string;
  type: "STEP_STARTED" | "STEP_COMPLETED" | "STATUS_CHANGED" | "ERROR" | "COMPENSATION_STARTED" | "COMPENSATION_COMPLETED";
  stepName?: string;
  payload?: any;
  message: string;
}

export interface WorkflowDeadLetter {
  id: string;
  workflowInstanceId: string;
  businessId: string;
  error: string;
  stack?: string;
  lastState: any;
  timestamp: string;
  resolved: boolean;
}

export interface WorkflowStepDefinition {
  name: string;
  onEvent: string;
  type: "MANUAL" | "AUTOMATIC" | "APPROVAL" | "SYSTEM";
}
