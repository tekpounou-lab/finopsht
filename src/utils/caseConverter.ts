/**
 * FINOPS ERP — Entity Case Converter & SSOT Mapper Utility (Phase 2.1)
 * 
 * Provides automated, lossless bidirectional transformation between:
 * - Firestore standard snake_case storage schema (business_id, branch_id, created_at)
 * - TypeScript application domain camelCase models (businessId, branchId, createdAt)
 */

/**
 * Converts a snake_case or kebab-case string to camelCase.
 */
export function snakeToCamel(str: string): string {
  if (!str || typeof str !== "string") return str;
  return str.replace(/([-_][a-z0-9])/gi, ($1) =>
    $1.toUpperCase().replace("-", "").replace("_", "")
  );
}

/**
 * Converts a camelCase string to snake_case.
 */
export function camelToSnake(str: string): string {
  if (!str || typeof str !== "string") return str;
  return str
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}

/**
 * Checks if a value is a plain JavaScript object (excluding null, Array, Date, RegExp, etc.)
 */
function isPlainObject(obj: any): boolean {
  if (obj === null || typeof obj !== "object") return false;
  if (Array.isArray(obj)) return false;
  if (obj instanceof Date) return false;
  if (typeof obj.toDate === "function") return false; // Firestore Timestamp
  if (obj._methodName) return false; // Firestore FieldValue
  return Object.prototype.toString.call(obj) === "[object Object]";
}

/**
 * Deeply transforms all object keys from snake_case to camelCase.
 */
export function toCamelCase<T = any>(input: any): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => toCamelCase(item)) as unknown as T;
  }

  if (isPlainObject(input)) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(input)) {
      const camelKey = snakeToCamel(key);
      result[camelKey] = toCamelCase(value);
    }
    return result as T;
  }

  return input;
}

/**
 * Deeply transforms all object keys from camelCase to snake_case for Firestore storage.
 */
export function toSnakeCase<T = any>(input: any): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => toSnakeCase(item)) as unknown as T;
  }

  if (isPlainObject(input)) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(input)) {
      const snakeKey = camelToSnake(key);
      result[snakeKey] = toSnakeCase(value);
    }
    return result as T;
  }

  return input;
}

/**
 * Domain entity mappers with dual property backward-compatibility & strict typing
 */

export function mapBranch<T = any>(raw: any): T {
  if (!raw) return raw;
  const data = toCamelCase<any>(raw);
  const businessId = data.businessId || raw.business_id || "";
  const isActive = data.isActive !== undefined ? data.isActive : (raw.is_active !== undefined ? raw.is_active : true);
  const createdAt = data.createdAt || raw.created_at || raw.createdAt;
  const updatedAt = data.updatedAt || raw.updated_at || raw.updatedAt;

  return {
    ...data,
    id: raw.id || data.id,
    businessId,
    business_id: businessId,
    isActive,
    is_active: isActive,
    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt,
  } as T;
}

export function mapDepartment<T = any>(raw: any): T {
  if (!raw) return raw;
  const data = toCamelCase<any>(raw);
  const businessId = data.businessId || raw.business_id || "";
  const branchId = data.branchId || raw.branch_id || undefined;
  const businessUnitId = data.businessUnitId || raw.business_unit_id || undefined;
  const costCenterId = data.costCenterId || raw.cost_center_id || undefined;
  const managerId = data.managerId || raw.manager_id || undefined;
  const isActive = data.isActive !== undefined ? data.isActive : (raw.is_active !== undefined ? raw.is_active : true);
  const createdAt = data.createdAt || raw.created_at || raw.createdAt;
  const updatedAt = data.updatedAt || raw.updated_at || raw.updatedAt;

  return {
    ...data,
    id: raw.id || data.id,
    businessId,
    business_id: businessId,
    branchId,
    branch_id: branchId,
    businessUnitId,
    business_unit_id: businessUnitId,
    costCenterId,
    cost_center_id: costCenterId,
    managerId,
    manager_id: managerId,
    isActive,
    is_active: isActive,
    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt,
  } as T;
}

export function mapBusinessUnit<T = any>(raw: any): T {
  if (!raw) return raw;
  const data = toCamelCase<any>(raw);
  const businessId = data.businessId || raw.business_id || "";
  const managerId = data.managerId || raw.manager_id || undefined;
  const isActive = data.isActive !== undefined ? data.isActive : (raw.is_active !== undefined ? raw.is_active : true);
  const createdAt = data.createdAt || raw.created_at || raw.createdAt;
  const updatedAt = data.updatedAt || raw.updated_at || raw.updatedAt;

  return {
    ...data,
    id: raw.id || data.id,
    businessId,
    business_id: businessId,
    managerId,
    manager_id: managerId,
    isActive,
    is_active: isActive,
    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt,
  } as T;
}

export function mapCostCenter<T = any>(raw: any): T {
  if (!raw) return raw;
  const data = toCamelCase<any>(raw);
  const businessId = data.businessId || raw.business_id || "";
  const businessUnitId = data.businessUnitId || raw.business_unit_id || undefined;
  const departmentId = data.departmentId || raw.department_id || undefined;
  const managerId = data.managerId || raw.manager_id || undefined;
  const isActive = data.isActive !== undefined ? data.isActive : (raw.is_active !== undefined ? raw.is_active : true);
  const createdAt = data.createdAt || raw.created_at || raw.createdAt;
  const updatedAt = data.updatedAt || raw.updated_at || raw.updatedAt;

  return {
    ...data,
    id: raw.id || data.id,
    businessId,
    business_id: businessId,
    businessUnitId,
    business_unit_id: businessUnitId,
    departmentId,
    department_id: departmentId,
    managerId,
    manager_id: managerId,
    isActive,
    is_active: isActive,
    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt,
  } as T;
}

export function mapEmployee<T = any>(raw: any): T {
  if (!raw) return raw;
  const data = toCamelCase<any>(raw);
  const businessId = data.businessId || raw.business_id || "";
  const branchId = data.branchId || raw.branch_id || "";
  const departmentId = data.departmentId || raw.department_id || "";
  const uid = data.uid || raw.firebase_uid || raw.uid;
  const baseSalary = data.baseSalary ?? raw.salary_base_htg ?? raw.salaryBaseHtg ?? raw.baseSalary ?? 0;
  const commissionRate = data.commissionRate ?? raw.commission_rate ?? raw.commissionRate ?? 0;
  const isActive = data.isActive !== undefined ? data.isActive : (raw.is_active !== undefined ? raw.is_active : (raw.status !== "SUSPENDED" && raw.status !== "TERMINATED"));
  const createdAt = data.createdAt || raw.created_at || raw.createdAt;
  const updatedAt = data.updatedAt || raw.updated_at || raw.updatedAt;

  return {
    ...data,
    id: raw.id || data.id,
    businessId,
    business_id: businessId,
    branchId,
    branch_id: branchId,
    departmentId,
    department_id: departmentId,
    uid,
    firebase_uid: uid,
    baseSalary,
    salaryBaseHtg: baseSalary,
    commissionRate,
    commission_rate: commissionRate,
    isActive,
    is_active: isActive,
    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt,
  } as T;
}

export function mapAttendanceRecord<T = any>(raw: any): T {
  if (!raw) return raw;
  const data = toCamelCase<any>(raw);
  const businessId = data.businessId || raw.business_id || "";
  const branchId = data.branchId || raw.branch_id || "";
  const departmentId = data.departmentId || raw.department_id || undefined;
  const employeeId = data.employeeId || raw.employee_id || "";

  return {
    ...data,
    id: raw.id || data.id,
    businessId,
    business_id: businessId,
    branchId,
    branch_id: branchId,
    departmentId,
    department_id: departmentId,
    employeeId,
    employee_id: employeeId,
  } as T;
}

export function mapPayrollCycle<T = any>(raw: any): T {
  if (!raw) return raw;
  const data = toCamelCase<any>(raw);
  const businessId = data.businessId || raw.business_id || "";
  const startDate = data.startDate || raw.start_date || "";
  const endDate = data.endDate || raw.end_date || "";
  const createdAt = data.createdAt || raw.created_at || raw.createdAt;
  const updatedAt = data.updatedAt || raw.updated_at || raw.updatedAt;

  return {
    ...data,
    id: raw.id || data.id,
    businessId,
    business_id: businessId,
    startDate,
    start_date: startDate,
    endDate,
    end_date: endDate,
    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt,
  } as T;
}
