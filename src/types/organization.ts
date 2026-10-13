/**
 * FINOPS ERP — Organization & Tenancy Domain Types (SSOT)
 *
 * Defines data structures for Businesses (Tenants), Branches (Sites),
 * Departments, Cost Centers, Business Units, and Organizational Relationships.
 */

/**
 * Tenant-scoped Business entity representing a discrete enterprise in FINOPS ERP.
 */
export interface Business {
  id: string;
  name: string;
  nif?: string;
  domain?: string;
  ownerId?: string;
  owner_id?: string;
  settings?: any;
  currency?: string;
  defaultCurrency?: string;
  status: "ACTIVE" | "APPROVED" | "SUSPENDED" | "PENDING" | "PENDING_APPROVAL" | "WAITING_APPROVAL" | "WAITING" | "INACTIVE" | "REJECTED" | "ARCHIVED" | "MAINTENANCE" | "READ_ONLY";
  industry?: string;
  createdAt?: any;
  updatedAt?: any;
  created_at?: any;
  updated_at?: any;
}

/**
 * Physical division or geographical location of a Business enterprise.
 */
export interface Branch {
  id: string;
  businessId?: string;
  business_id?: string;
  name: string;
  code?: string;
  address?: string;
  location?: string;
  isActive?: boolean;
  is_active?: boolean;
  status?: "ACTIVE" | "INACTIVE";
  createdAt?: any;
  updatedAt?: any;
  created_at?: any;
  updated_at?: any;
}

/**
 * Organizational department dividing staff functions and cost tracking.
 */
export interface Department {
  id: string;
  businessId?: string;
  business_id?: string;
  branchId?: string;
  branch_id?: string;
  businessUnitId?: string;
  costCenterId?: string;
  name: string;
  code?: string;
  aliases?: string[];
  budget?: number;
  isActive?: boolean;
  is_active?: boolean;
  status?: "ACTIVE" | "INACTIVE";
  managerId?: string;
  metadata?: Record<string, any>;
  createdAt?: any;
  updatedAt?: any;
  created_at?: any;
  updated_at?: any;
  normalizedName?: string;
  normalized_name?: string;
  source?: string;
  isSystemGenerated?: boolean;
  is_system_generated?: boolean;
  createdBy?: string;
  created_by?: string;
}

/**
 * Strategic business unit grouping related departments or operations.
 */
export interface BusinessUnit {
  id: string;
  businessId?: string;
  business_id?: string;
  name: string;
  code: string;
  description?: string;
  managerId?: string;
  status: "ACTIVE" | "INACTIVE";
  isActive?: boolean;
  is_active?: boolean;
  createdAt?: any;
  updatedAt?: any;
  created_at?: any;
  updated_at?: any;
}

/**
 * Cost center for financial cost accounting and budget allocation.
 */
export interface CostCenter {
  id: string;
  businessId?: string;
  business_id?: string;
  businessUnitId?: string;
  departmentId?: string;
  department_id?: string;
  name: string;
  code: string;
  budget: number;
  allocatedAmount?: number;
  allocated_amount?: number;
  currency: string;
  status: "ACTIVE" | "INACTIVE";
  isActive?: boolean;
  is_active?: boolean;
  managerId?: string;
  createdAt?: any;
  updatedAt?: any;
  created_at?: any;
  updated_at?: any;
}

/**
 * Custom role definition with granular permission grants.
 */
export interface Role {
  id: string;
  businessId: string;
  business_id?: string;
  name: string; // e.g., "MANAGER", "ACCOUNTANT"
  permissions: string[];
  dashboardWidgetIds: string[];
  dashboard_widget_ids?: string[];
  isSystemRole: boolean;
  is_system_role?: boolean;
  createdAt: string;
  created_at?: string;
  updatedAt: string;
  updated_at?: string;
}

/**
 * Enterprise settings for a specific Business tenant.
 */
export interface BusinessSettings {
  id: string;
  businessId: string;
  business_id?: string;
  companyName: string;
  company_name?: string;
  logoUrl?: string;
  logo_url?: string;
  timezone: string;
  currency: "HTG" | "USD";
  fiscalYearStartMonth: number;
  fiscal_year_start_month?: number;
  workingDays: number[];
  working_days?: number[];
  updatedAt: string;
  updated_at?: string;
}

/**
 * Relational link binding an employee to a department assignment.
 */
export interface EmployeeDepartmentLink {
  id?: string;
  businessId?: string;
  business_id?: string;
  employeeId?: string;
  employee_id?: string;
  departmentId?: string;
  department_id?: string;
  relationType?: "PRIMARY" | "SALES" | "SUPERVISION";
  relation_type?: "PRIMARY" | "SALES" | "SUPERVISION";
  firstTransaction?: string;
  first_transaction?: string;
  lastTransaction?: string;
  last_transaction?: string;
  salesAmount?: number;
  sales_amount?: number;
  salesCount?: number;
  sales_count?: number;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}




