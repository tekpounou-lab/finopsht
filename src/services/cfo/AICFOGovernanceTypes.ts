export type DataClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";

export type PermissionResult = "ALLOW" | "PARTIAL_MASKED" | "DENIED";

export type AIResponseType = "GEMINI_AI" | "HEURISTIC_FALLBACK" | "SECURITY_REFUSAL";

export interface IdentityUserContext {
  userId: string;
  userName: string;
  userEmail?: string;
  role: string; // OWNER, MANAGER, SUPERVISOR, TELLER, HEAD_TELLER, EMPLOYEE, SUPER_ADMIN, etc.
  businessId: string;
  branchId?: string | null;
  departmentId?: string | null;
}

export interface RoleGovernancePolicy {
  role: string;
  maxClassificationAllowed: DataClassification;
  allowedDataCategories: string[];
  restrictedFields: string[];
  branchBound: boolean; // Must filter by user's branch
  departmentBound: boolean; // Must filter by user's department
  individualSalaryVisible: boolean; // Can view individual employee salary
  companyProfitVisible: boolean; // Can view overall company net profit
  payrollTotalsVisible: boolean; // Can view aggregated payroll
  allowedQueryExamples: string[];
  deniedQueryExamples: string[];
}

export interface EvaluationResult {
  allowed: boolean;
  permissionResult: PermissionResult;
  refusalMessage?: string;
  refusalReason?: string;
  securityLevel: DataClassification;
  dataAccessed: string[];
  sanitizedQuery?: string;
  policy: RoleGovernancePolicy;
}

export interface AICFOAuditLog {
  id: string;
  business_id: string;
  user_id: string;
  user_name: string;
  role: string;
  branch_id?: string | null;
  department_id?: string | null;
  question: string;
  data_accessed: string[];
  permission_result: PermissionResult;
  ai_response_type: AIResponseType;
  timestamp: string;
  security_level: DataClassification;
  refusal_reason?: string;
}
