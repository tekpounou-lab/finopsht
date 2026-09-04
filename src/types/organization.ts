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
  /** Legacy alias for ownerId */
  owner_id?: string;
  settings?: any;
  currency?: string;
  defaultCurrency?: string;
  status: "ACTIVE" | "APPROVED" | "SUSPENDED" | "PENDING" | "PENDING_APPROVAL" | "WAITING_APPROVAL" | "WAITING" | "INACTIVE" | "REJECTED" | "ARCHIVED" | "MAINTENANCE" | "READ_ONLY";
  industry?: string;
  createdAt?: any;
  updatedAt?: any;
  /** Legacy alias for createdAt */
  created_at?: any;
  /** Legacy alias for updatedAt */
  updated_at?: any;
}

/**
 * Physical division or geographical location of a Business enterprise.
 */
export interface Branch {
  id: string;
  businessId?: string;
  /** Legacy alias for businessId */
  business_id?: string;
  name: string;
  code?: string;
  address?: string;
  location?: string;
  isActive?: boolean;
  /** Legacy alias for isActive */
  is_active?: boolean;
  status?: "ACTIVE" | "INACTIVE";
  createdAt?: any;
  updatedAt?: any;
  /** Legacy alias for createdAt */
  created_at?: any;
  /** Legacy alias for updatedAt */
  updated_at?: any;
}

/**
 * Organizational department dividing staff functions and cost tracking.
 */
export interface Department {
  id: string;
  businessId?: string;
  /** Legacy alias for businessId */
  business_id?: string;
  branchId?: string;
  /** Legacy alias for branchId */
  branch_id?: string;
  businessUnitId?: string;
  costCenterId?: string;
  name: string;
  code?: string;
  aliases?: string[];
  budget?: number;
  isActive?: boolean;
  /** Legacy alias for isActive */
  is_active?: boolean;
  status?: "ACTIVE" | "INACTIVE";
  managerId?: string;
  metadata?: Record<string, any>;
  createdAt?: any;
  updatedAt?: any;
  /** Legacy alias for createdAt */
  created_at?: any;
  /** Legacy alias for updatedAt */
  updated_at?: any;
  normalizedName?: string;
  /** Legacy alias for normalizedName */
  normalized_name?: string;
  source?: string;
  isSystemGenerated?: boolean;
  /** Legacy alias for isSystemGenerated */
  is_system_generated?: boolean;
  createdBy?: string;
  /** Legacy alias for createdBy */
  created_by?: string;
}

/**
 * Strategic business unit grouping related departments or operations.
 */
export interface BusinessUnit {
  id: string;
  businessId?: string;
  /** Legacy alias for businessId */
  business_id?: string;
  name: string;
  code: string;
  description?: string;
  managerId?: string;
  status: "ACTIVE" | "INACTIVE";
  isActive?: boolean;
  /** Legacy alias for isActive */
  is_active?: boolean;
  createdAt?: any;
  updatedAt?: any;
  /** Legacy alias for createdAt */
  created_at?: any;
  /** Legacy alias for updatedAt */
  updated_at?: any;
}

/**
 * Cost center for financial cost accounting and budget allocation.
 */
export interface CostCenter {
  id: string;
  businessId?: string;
  /** Legacy alias for businessId */
  business_id?: string;
  businessUnitId?: string;
  departmentId?: string;
  /** Legacy alias for departmentId */
  department_id?: string;
  name: string;
  code: string;
  budget: number;
  allocatedAmount?: number;
  /** Legacy alias for allocatedAmount */
  allocated_amount?: number;
  currency: string;
  status: "ACTIVE" | "INACTIVE";
  isActive?: boolean;
  /** Legacy alias for isActive */
  is_active?: boolean;
  managerId?: string;
  createdAt?: any;
  updatedAt?: any;
  /** Legacy alias for createdAt */
  created_at?: any;
  /** Legacy alias for updatedAt */
  updated_at?: any;
}

/**
 * Custom role definition with granular permission grants.
 */
export interface Role {
  id: string;
  business_id: string;
  name: string; // e.g., "MANAGER", "ACCOUNTANT"
  permissions: string[];
  dashboard_widget_ids: string[];
  is_system_role: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Enterprise settings for a specific Business tenant.
 */
export interface BusinessSettings {
  id: string;
  business_id: string;
  company_name: string;
  logo_url?: string;
  timezone: string;
  currency: "HTG" | "USD";
  fiscal_year_start_month: number;
  working_days: number[];
  updated_at: string;
}

/**
 * Relational link binding an employee to a department assignment.
 */
export interface EmployeeDepartmentLink {
  id?: string;
  business_id: string;
  employee_id: string;
  department_id: string;
  relation_type: "PRIMARY" | "SALES" | "SUPERVISION";
  first_transaction?: string;
  last_transaction?: string;
  sales_amount: number;
  sales_count: number;
  created_at: string;
  updated_at: string;
}

