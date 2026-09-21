export interface ConfigurationRecord {
  id: string;
  scope: "GLOBAL" | "TENANT";
  business_id?: string;
  category: string;
  key: string;
  value: any;
  value_type: "NUMBER" | "STRING" | "BOOLEAN" | "OBJECT" | "PERCENTAGE";
  unit?: string;
  status: "ACTIVE" | "INACTIVE";
  effective_from: string; // YYYY-MM-DD
  effective_to?: string;   // YYYY-MM-DD
  version: number;
  source: string;
  source_reference?: string;
  description?: string;
  created_at: string;
  created_by: string;
  updated_at?: string;
  updated_by?: string;
  approved_at?: string;
  approved_by?: string;
  metadata?: Record<string, any>;
}

export type ResolutionStatus =
  | "RESOLVED"
  | "NO_DATA"
  | "INACTIVE"
  | "NOT_EFFECTIVE"
  | "INVALID"
  | "FORBIDDEN";

export interface ResolutionResult {
  status: ResolutionStatus;
  value: any;
  source: "EMPLOYEE_DATA" | "TENANT_CONFIGURATION" | "GLOBAL_POLICY" | "SYSTEM_DEFAULT" | "NONE";
  version?: number;
  effectiveFrom?: string;
  effectiveTo?: string;
  configurationId?: string;
}
