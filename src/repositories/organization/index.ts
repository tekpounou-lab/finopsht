import { doc, updateDoc, collection, query, where, addDoc, deleteDoc, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Business, Branch, Department, Role, BusinessSettings, BusinessUnit, CostCenter } from "../../types/organization";
import { 
  IBusinessRepository, 
  IBranchRepository, 
  IDepartmentRepository, 
  IRoleRepository, 
  IBusinessSettingsRepository,
  IBusinessUnitRepository,
  ICostCenterRepository
} from "./types";
import { resilientGetDoc, resilientGetDocs } from "../../utils/resilientFirestore";
import { EventBus } from "../../modules/runtime/EventBus";
import { 
  mapBranch, 
  mapDepartment, 
  mapBusinessUnit, 
  mapCostCenter, 
  toCamelCase, 
  toSnakeCase 
} from "../../utils/caseConverter";
import { IntegrityValidator } from "../../services/integrity/ForeignKeyIntegrityValidator";

export const BusinessRepository: IBusinessRepository = {
  async getById(id: string): Promise<Business | null> {
    const snap = await resilientGetDoc(doc(db, "businesses", id));
    return snap.exists() ? ({ id: snap.id, ...toCamelCase(snap.data()), ...snap.data() } as Business) : null;
  },
  async update(id: string, data: Partial<Business>): Promise<void> {
    await updateDoc(doc(db, "businesses", id), { ...data, updated_at: new Date().toISOString() });
    
    EventBus.publish(EventBus.createEvent({
      correlationId: `update_biz_${id}`,
      businessId: id,
      module: "ORGANIZATION",
      aggregate: "BUSINESS",
      type: "BusinessUpdated",
      payload: { id, updates: data }
    }));
  }
};

export const BranchRepository: IBranchRepository = {
  async listByBusiness(businessId: string): Promise<Branch[]> {
    const q = query(collection(db, "branches"), where("business_id", "==", businessId));
    const snap = await resilientGetDocs(q, `branches_${businessId}`);
    return snap.docs.map(d => mapBranch<Branch>({ id: d.id, ...d.data() }));
  },
  async getById(id: string): Promise<Branch | null> {
    const snap = await resilientGetDoc(doc(db, "branches", id));
    return snap.exists() ? mapBranch<Branch>({ id: snap.id, ...snap.data() }) : null;
  },
  async create(data: Omit<Branch, "id" | "created_at" | "updated_at">): Promise<string> {
    const bizId = data.business_id || (data as any).businessId || "global";
    if (bizId && bizId !== "global") {
      await IntegrityValidator.validateBusinessExists(bizId);
    }

    const payload = {
      ...data,
      business_id: bizId,
      businessId: bizId,
      is_active: data.is_active !== undefined ? data.is_active : ((data as any).isActive !== undefined ? (data as any).isActive : true),
      isActive: data.is_active !== undefined ? data.is_active : ((data as any).isActive !== undefined ? (data as any).isActive : true),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const ref = await addDoc(collection(db, "branches"), payload);
    
    EventBus.publish(EventBus.createEvent({
      correlationId: `create_branch_${ref.id}`,
      businessId: bizId,
      module: "ORGANIZATION",
      aggregate: "BRANCH",
      type: "BranchCreated",
      payload: { id: ref.id, ...payload }
    }));

    return ref.id;
  },
  async update(id: string, data: Partial<Branch>): Promise<void> {
    const updates = { ...data, updated_at: new Date().toISOString() };
    if ((data as any).isActive !== undefined) {
      (updates as any).is_active = (data as any).isActive;
    }
    await updateDoc(doc(db, "branches", id), updates);
    
    const bizId = data.business_id || (data as any).businessId;
    if (bizId) {
      EventBus.publish(EventBus.createEvent({
        correlationId: `update_branch_${id}`,
        businessId: bizId,
        module: "ORGANIZATION",
        aggregate: "BRANCH",
        type: "BranchUpdated",
        payload: { id, updates: data }
      }));
    }
  },
  async delete(id: string): Promise<void> {
    const branchDoc = await this.getById(id);
    await deleteDoc(doc(db, "branches", id));
    
    if (branchDoc?.business_id || branchDoc?.businessId) {
      EventBus.publish(EventBus.createEvent({
        correlationId: `delete_branch_${id}`,
        businessId: branchDoc.business_id || branchDoc.businessId || "global",
        module: "ORGANIZATION",
        aggregate: "BRANCH",
        type: "BranchDeleted",
        payload: { id, name: branchDoc.name }
      }));
    }
  }
};

export const DepartmentRepository: IDepartmentRepository = {
  async listByBusiness(businessId: string): Promise<Department[]> {
    const q = query(collection(db, "departments"), where("business_id", "==", businessId));
    const snap = await resilientGetDocs(q, `departments_${businessId}`);
    return snap.docs.map(d => mapDepartment<Department>({ id: d.id, ...d.data() }));
  },
  async getById(id: string): Promise<Department | null> {
    const snap = await resilientGetDoc(doc(db, "departments", id));
    return snap.exists() ? mapDepartment<Department>({ id: snap.id, ...snap.data() }) : null;
  },
  async create(data: Omit<Department, "id" | "created_at" | "updated_at">): Promise<string> {
    const bizId = data.business_id || (data as any).businessId;
    if (!bizId) {
      throw new Error("Multi-Tenancy Violation: business_id is required when creating a Department.");
    }

    // Integrity constraint check: validate parent business and optional branch/unit
    await IntegrityValidator.validateBusinessExists(bizId);
    const branchId = data.branch_id || (data as any).branchId;
    if (branchId) {
      await IntegrityValidator.validateBranchExists(bizId, branchId);
    }

    const payload = { 
      ...data, 
      business_id: bizId,
      businessId: bizId,
      branch_id: branchId,
      branchId: branchId,
      status: data.status || "ACTIVE",
      is_active: data.is_active !== undefined ? data.is_active : ((data as any).isActive !== undefined ? (data as any).isActive : true),
      isActive: data.is_active !== undefined ? data.is_active : ((data as any).isActive !== undefined ? (data as any).isActive : true),
      created_at: new Date().toISOString(), 
      updated_at: new Date().toISOString() 
    };

    const ref = await addDoc(collection(db, "departments"), payload);

    EventBus.publish(EventBus.createEvent({
      correlationId: `create_dept_${ref.id}`,
      businessId: bizId,
      module: "ORGANIZATION",
      aggregate: "DEPARTMENT",
      type: "DepartmentCreated",
      payload: { id: ref.id, name: data.name, code: data.code, businessId: bizId }
    }));

    return ref.id;
  },
  async update(id: string, data: Partial<Department>): Promise<void> {
    const dept = await this.getById(id);
    const updates = { ...data, updated_at: new Date().toISOString() };
    if ((data as any).isActive !== undefined) {
      (updates as any).is_active = (data as any).isActive;
    }
    await updateDoc(doc(db, "departments", id), updates);
    
    const bizId = data.business_id || (data as any).businessId || dept?.business_id || dept?.businessId;
    if (bizId) {
      EventBus.publish(EventBus.createEvent({
        correlationId: `update_dept_${id}`,
        businessId: bizId,
        module: "ORGANIZATION",
        aggregate: "DEPARTMENT",
        type: "DepartmentUpdated",
        payload: { id, updates: data }
      }));
    }
  },
  async delete(id: string): Promise<void> {
    const dept = await this.getById(id);
    await deleteDoc(doc(db, "departments", id));
    
    if (dept?.business_id) {
      EventBus.publish(EventBus.createEvent({
        correlationId: `delete_dept_${id}`,
        businessId: dept.business_id,
        module: "ORGANIZATION",
        aggregate: "DEPARTMENT",
        type: "DepartmentDeleted",
        payload: { id, name: dept.name, businessId: dept.business_id }
      }));
    }
  },
  async deleteWithIntegrityCheck(
    businessId: string, 
    departmentId: string, 
    options: { force?: boolean; reassignToDeptId?: string; actorId?: string } = {}
  ): Promise<{ success: boolean; reassignedCount: number; message: string }> {
    // 1. Check active assigned employees in Firestore
    const empQuery = query(
      collection(db, "employees"), 
      where("business_id", "==", businessId),
      where("departmentId", "==", departmentId)
    );
    const empSnap = await getDocs(empQuery);
    const activeEmployees = empSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    if (activeEmployees.length > 0 && !options.force && !options.reassignToDeptId) {
      return {
        success: false,
        reassignedCount: 0,
        message: `Suppression bloquée : ${activeEmployees.length} employé(s) sont toujours assignés à ce département. Veuillez d'abord les réassigner ou confirmer la réassignation automatique.`
      };
    }

    let reassignedCount = 0;
    const targetDeptId = options.reassignToDeptId || "d_admin";

    // 2. Reassign employees if needed
    for (const emp of activeEmployees) {
      await updateDoc(doc(db, "employees", emp.id), {
        departmentId: targetDeptId,
        department_id: targetDeptId,
        updatedAt: new Date().toISOString()
      });
      reassignedCount++;

      EventBus.publish(EventBus.createEvent({
        correlationId: `emp_transferred_dept_del_${emp.id}`,
        actorId: options.actorId || "SYSTEM",
        businessId,
        module: "ORGANIZATION",
        aggregate: "EMPLOYEE",
        type: "EmployeeTransferred",
        payload: {
          employeeId: emp.id,
          employeeName: emp.name,
          oldDepartmentId: departmentId,
          newDepartmentId: targetDeptId,
          businessId
        }
      }));
    }

    // 3. Delete department document
    await deleteDoc(doc(db, "departments", departmentId));

    EventBus.publish(EventBus.createEvent({
      correlationId: `dept_deleted_integrity_${departmentId}`,
      actorId: options.actorId || "SYSTEM",
      businessId,
      module: "ORGANIZATION",
      aggregate: "DEPARTMENT",
      type: "DepartmentDeleted",
      payload: {
        departmentId,
        reassignedEmployeesCount: reassignedCount,
        targetDeptId
      }
    }));

    return {
      success: true,
      reassignedCount,
      message: `Département supprimé avec succès. ${reassignedCount} employé(s) ont été réassigné(s) vers '${targetDeptId}'.`
    };
  }
};

export const BusinessUnitRepository: IBusinessUnitRepository = {
  async listByBusiness(businessId: string): Promise<BusinessUnit[]> {
    const q = query(collection(db, "business_units"), where("business_id", "==", businessId));
    const snap = await resilientGetDocs(q, `business_units_${businessId}`);
    return snap.docs.map(d => mapBusinessUnit<BusinessUnit>({ id: d.id, ...d.data() }));
  },
  async getById(id: string): Promise<BusinessUnit | null> {
    const snap = await resilientGetDoc(doc(db, "business_units", id));
    return snap.exists() ? mapBusinessUnit<BusinessUnit>({ id: snap.id, ...snap.data() }) : null;
  },
  async create(data: Omit<BusinessUnit, "id" | "created_at" | "updated_at">): Promise<string> {
    const bizId = data.business_id || (data as any).businessId;
    if (!bizId) {
      throw new Error("Multi-Tenancy Violation: business_id is required when creating a Business Unit.");
    }
    await IntegrityValidator.validateBusinessExists(bizId);

    const payload = {
      ...data,
      business_id: bizId,
      businessId: bizId,
      status: data.status || "ACTIVE",
      is_active: data.is_active !== undefined ? data.is_active : ((data as any).isActive !== undefined ? (data as any).isActive : true),
      isActive: data.is_active !== undefined ? data.is_active : ((data as any).isActive !== undefined ? (data as any).isActive : true),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const ref = await addDoc(collection(db, "business_units"), payload);

    EventBus.publish(EventBus.createEvent({
      correlationId: `create_bu_${ref.id}`,
      businessId: bizId,
      module: "ORGANIZATION",
      aggregate: "BUSINESS_UNIT",
      type: "BusinessUnitCreated",
      payload: { id: ref.id, name: data.name, code: data.code, businessId: bizId }
    }));

    return ref.id;
  },
  async update(id: string, data: Partial<BusinessUnit>): Promise<void> {
    const unit = await this.getById(id);
    const updates = { ...data, updated_at: new Date().toISOString() };
    if ((data as any).isActive !== undefined) {
      (updates as any).is_active = (data as any).isActive;
    }
    await updateDoc(doc(db, "business_units", id), updates);

    const bizId = data.business_id || (data as any).businessId || unit?.business_id || (unit as any)?.businessId;
    if (bizId) {
      EventBus.publish(EventBus.createEvent({
        correlationId: `update_bu_${id}`,
        businessId: bizId,
        module: "ORGANIZATION",
        aggregate: "BUSINESS_UNIT",
        type: "BusinessUnitUpdated",
        payload: { id, updates: data }
      }));
    }
  },
  async delete(id: string): Promise<void> {
    const unit = await this.getById(id);
    await deleteDoc(doc(db, "business_units", id));

    const bizId = unit?.business_id || (unit as any)?.businessId;
    if (bizId) {
      EventBus.publish(EventBus.createEvent({
        correlationId: `delete_bu_${id}`,
        businessId: bizId,
        module: "ORGANIZATION",
        aggregate: "BUSINESS_UNIT",
        type: "BusinessUnitDeleted",
        payload: { id, name: unit.name, businessId: bizId }
      }));
    }
  },
  async deactivateWithCascade(businessId: string, unitId: string, actorId: string = "SYSTEM"): Promise<{ affectedDepartments: number; affectedCostCenters: number }> {
    let affectedDepartments = 0;
    let affectedCostCenters = 0;

    // 1. Deactivate Business Unit itself
    await updateDoc(doc(db, "business_units", unitId), {
      status: "INACTIVE",
      is_active: false,
      updated_at: new Date().toISOString()
    });

    // 2. Cascade deactivate linked Departments
    const deptQ = query(
      collection(db, "departments"), 
      where("business_id", "==", businessId),
      where("business_unit_id", "==", unitId)
    );
    const deptSnap = await getDocs(deptQ);
    for (const d of deptSnap.docs) {
      await updateDoc(doc(db, "departments", d.id), {
        status: "INACTIVE",
        is_active: false,
        updated_at: new Date().toISOString()
      });
      affectedDepartments++;
    }

    // 3. Cascade deactivate linked Cost Centers
    const ccQ = query(
      collection(db, "cost_centers"), 
      where("business_id", "==", businessId),
      where("business_unit_id", "==", unitId)
    );
    const ccSnap = await getDocs(ccQ);
    for (const c of ccSnap.docs) {
      await updateDoc(doc(db, "cost_centers", c.id), {
        status: "INACTIVE",
        is_active: false,
        updated_at: new Date().toISOString()
      });
      affectedCostCenters++;
    }

    EventBus.publish(EventBus.createEvent({
      correlationId: `bu_deactivated_cascade_${unitId}`,
      actorId,
      businessId,
      module: "ORGANIZATION",
      aggregate: "BUSINESS_UNIT",
      type: "BusinessUnitDeactivatedCascade",
      payload: { unitId, affectedDepartments, affectedCostCenters }
    }));

    return { affectedDepartments, affectedCostCenters };
  }
};

export const CostCenterRepository: ICostCenterRepository = {
  async listByBusiness(businessId: string): Promise<CostCenter[]> {
    const q = query(collection(db, "cost_centers"), where("business_id", "==", businessId));
    const snap = await resilientGetDocs(q, `cost_centers_${businessId}`);
    return snap.docs.map(d => mapCostCenter<CostCenter>({ id: d.id, ...d.data() }));
  },
  async getById(id: string): Promise<CostCenter | null> {
    const snap = await resilientGetDoc(doc(db, "cost_centers", id));
    return snap.exists() ? mapCostCenter<CostCenter>({ id: snap.id, ...snap.data() }) : null;
  },
  async create(data: Omit<CostCenter, "id" | "created_at" | "updated_at">): Promise<string> {
    const bizId = data.business_id || (data as any).businessId;
    if (!bizId) {
      throw new Error("Multi-Tenancy Violation: business_id is required when creating a Cost Center.");
    }
    await IntegrityValidator.validateBusinessExists(bizId);
    const deptId = data.department_id || (data as any).departmentId;
    if (deptId) {
      await IntegrityValidator.validateDepartmentExists(bizId, deptId);
    }

    const payload = {
      ...data,
      business_id: bizId,
      businessId: bizId,
      budget: data.budget || 0,
      allocated_amount: data.allocated_amount || 0,
      currency: data.currency || "USD",
      status: data.status || "ACTIVE",
      is_active: data.is_active !== undefined ? data.is_active : ((data as any).isActive !== undefined ? (data as any).isActive : true),
      isActive: data.is_active !== undefined ? data.is_active : ((data as any).isActive !== undefined ? (data as any).isActive : true),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const ref = await addDoc(collection(db, "cost_centers"), payload);

    EventBus.publish(EventBus.createEvent({
      correlationId: `create_cc_${ref.id}`,
      businessId: bizId,
      module: "ORGANIZATION",
      aggregate: "COST_CENTER",
      type: "CostCenterCreated",
      payload: { id: ref.id, name: data.name, code: data.code, budget: data.budget, businessId: bizId }
    }));

    return ref.id;
  },
  async update(id: string, data: Partial<CostCenter>): Promise<void> {
    const cc = await this.getById(id);
    const updates = { ...data, updated_at: new Date().toISOString() };
    if ((data as any).isActive !== undefined) {
      (updates as any).is_active = (data as any).isActive;
    }
    await updateDoc(doc(db, "cost_centers", id), updates);

    const bizId = data.business_id || (data as any).businessId || cc?.business_id || (cc as any)?.businessId;
    if (bizId) {
      EventBus.publish(EventBus.createEvent({
        correlationId: `update_cc_${id}`,
        businessId: bizId,
        module: "ORGANIZATION",
        aggregate: "COST_CENTER",
        type: "CostCenterUpdated",
        payload: { id, updates: data }
      }));
    }
  },
  async delete(id: string): Promise<void> {
    const cc = await this.getById(id);
    await deleteDoc(doc(db, "cost_centers", id));

    if (cc?.business_id) {
      EventBus.publish(EventBus.createEvent({
        correlationId: `delete_cc_${id}`,
        businessId: cc.business_id,
        module: "ORGANIZATION",
        aggregate: "COST_CENTER",
        type: "CostCenterDeleted",
        payload: { id, name: cc.name, businessId: cc.business_id }
      }));
    }
  },
  async reallocateBudget(businessId: string, costCenterId: string, newBudget: number, actorId: string = "SYSTEM"): Promise<void> {
    const cc = await this.getById(costCenterId);
    if (!cc) throw new Error(`Cost Center ${costCenterId} not found.`);

    const oldBudget = cc.budget;
    await updateDoc(doc(db, "cost_centers", costCenterId), {
      budget: newBudget,
      updated_at: new Date().toISOString()
    });

    EventBus.publish(EventBus.createEvent({
      correlationId: `reallocate_budget_cc_${costCenterId}`,
      actorId,
      businessId,
      module: "ORGANIZATION",
      aggregate: "COST_CENTER",
      type: "COST_CENTER_BUDGET_UPDATED",
      payload: {
        costCenterId,
        costCenterName: cc.name,
        oldBudget,
        newBudget,
        delta: newBudget - oldBudget,
        currency: cc.currency
      }
    }));
  }
};

export const RoleRepository: IRoleRepository = {
  async listByBusiness(businessId: string): Promise<Role[]> {
    const q = query(collection(db, "roles"), where("business_id", "==", businessId));
    const snap = await resilientGetDocs(q, `roles_${businessId}`);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Role));
  },
  async getById(id: string): Promise<Role | null> {
    const snap = await resilientGetDoc(doc(db, "roles", id));
    return snap.exists() ? { id: snap.id, ...snap.data() } as Role : null;
  },
  async update(id: string, data: Partial<Role>): Promise<void> {
    await updateDoc(doc(db, "roles", id), { ...data, updated_at: new Date().toISOString() });
  }
};

export const BusinessSettingsRepository: IBusinessSettingsRepository = {
  async getByBusiness(businessId: string): Promise<BusinessSettings | null> {
    const snap = await resilientGetDoc(doc(db, "business_settings", businessId));
    return snap.exists() ? { id: snap.id, ...snap.data() } as BusinessSettings : null;
  },
  async update(businessId: string, data: Partial<BusinessSettings>): Promise<void> {
    await updateDoc(doc(db, "business_settings", businessId), { ...data, updated_at: new Date().toISOString() });
    
    EventBus.publish(EventBus.createEvent({
      correlationId: `update_settings_${businessId}`,
      businessId: businessId,
      module: "ORGANIZATION",
      aggregate: "SETTINGS",
      type: "SettingsChanged",
      payload: { businessId, updates: data }
    }));
  }
};
