import { Business, Branch, Department, Role, BusinessSettings, BusinessUnit, CostCenter } from "../../types/organization";

export interface IBusinessRepository {
  getById(id: string): Promise<Business | null>;
  update(id: string, data: Partial<Business>): Promise<void>;
}

export interface IBranchRepository {
  listByBusiness(businessId: string): Promise<Branch[]>;
  getById(id: string): Promise<Branch | null>;
  create(data: Omit<Branch, "id" | "created_at" | "updated_at">): Promise<string>;
  update(id: string, data: Partial<Branch>): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface IDepartmentRepository {
  listByBusiness(businessId: string): Promise<Department[]>;
  getById(id: string): Promise<Department | null>;
  create(data: Omit<Department, "id" | "created_at" | "updated_at">): Promise<string>;
  update(id: string, data: Partial<Department>): Promise<void>;
  delete(id: string): Promise<void>;
  deleteWithIntegrityCheck(businessId: string, departmentId: string, options?: { force?: boolean; reassignToDeptId?: string; actorId?: string }): Promise<{ success: boolean; reassignedCount: number; message: string }>;
}

export interface IBusinessUnitRepository {
  listByBusiness(businessId: string): Promise<BusinessUnit[]>;
  getById(id: string): Promise<BusinessUnit | null>;
  create(data: Omit<BusinessUnit, "id" | "created_at" | "updated_at">): Promise<string>;
  update(id: string, data: Partial<BusinessUnit>): Promise<void>;
  delete(id: string): Promise<void>;
  deactivateWithCascade(businessId: string, unitId: string, actorId?: string): Promise<{ affectedDepartments: number; affectedCostCenters: number }>;
}

export interface ICostCenterRepository {
  listByBusiness(businessId: string): Promise<CostCenter[]>;
  getById(id: string): Promise<CostCenter | null>;
  create(data: Omit<CostCenter, "id" | "created_at" | "updated_at">): Promise<string>;
  update(id: string, data: Partial<CostCenter>): Promise<void>;
  delete(id: string): Promise<void>;
  reallocateBudget(businessId: string, costCenterId: string, newBudget: number, actorId?: string): Promise<void>;
}

export interface IRoleRepository {
  listByBusiness(businessId: string): Promise<Role[]>;
  getById(id: string): Promise<Role | null>;
  update(id: string, data: Partial<Role>): Promise<void>;
}

export interface IBusinessSettingsRepository {
  getByBusiness(businessId: string): Promise<BusinessSettings | null>;
  update(businessId: string, data: Partial<BusinessSettings>): Promise<void>;
}
