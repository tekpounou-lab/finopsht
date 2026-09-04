export type DimensionType = 'business' | 'branch' | 'department' | 'employee' | 'category' | 'product' | 'service' | 'date';

export type KPIFormat = 'currency' | 'percentage' | 'number' | 'ratio';
export type KPIImportance = 'low' | 'medium' | 'high' | 'critical';

export interface KPI {
  id: string;
  name: string;
  description: string;
  formula: (facts: BusinessFact[]) => number;
  dimensions: DimensionType[];
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  format: KPIFormat;
  color: string; // e.g., 'emerald', 'rose', 'indigo', 'amber'
  threshold?: number;
  target?: number;
  tolerance?: number;
  importance: KPIImportance;
  owner: string; // e.g., 'CFO', 'HR', 'CEO', 'Operations'
  source: string; // e.g., 'ledger', 'payroll', 'attendance'
  category: 'revenue' | 'expense' | 'profitability' | 'efficiency' | 'hr';
}

export interface BusinessFact {
  id: string;
  businessId: string;
  branchId?: string;
  departmentId?: string;
  employeeId?: string;
  type: 'transaction' | 'payroll' | 'attendance';
  amount: number;
  date: Date;
  category?: string;     // e.g. 'INCOME', 'EXPENSE', 'PAYROLL', 'ADVANCE'
  subcategory?: string;  // e.g. 'Consulting', 'Office Supplies', 'Bonus'
  product?: string;      // e.g. 'SaaS License', 'Enterprise Support'
  service?: string;      // e.g. 'Installation', 'Training'
  metadata: Record<string, any>; // contains extra context like hoursWorked, attendanceStatus, etc.
}

export interface AnalyticsResult {
  kpiId: string;
  value: number;
  dimension: DimensionType;
  dimensionId: string;
  period: string; // e.g., '2026-07', '2026-W28'
  trend?: 'up' | 'down' | 'stable';
  growthPercentage?: number;
}

export interface ExplainabilityNode {
  label: string;
  value: number;
  percentage: number;
  subNodes?: ExplainabilityNode[];
  factIds?: string[];
}

export interface DrilldownResult {
  kpiId: string;
  dimension: DimensionType;
  totalValue: number;
  breakdown: {
    id: string;
    name: string;
    value: number;
    percentage: number;
  }[];
  justification: string; // Dynamic semantic explanation of the metric's change
}
