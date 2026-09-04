import { collection, query, where, getDocs, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { Employee } from "../../../types";
import { Department, BusinessUnit, CostCenter } from "../../../types/organization";
import { DepartmentRepository, BusinessUnitRepository, CostCenterRepository } from "../../../repositories/organization";
import { EventBus } from "../../../modules/runtime/EventBus";

export interface DeletionSafetyReport {
  canDelete: boolean;
  assignedEmployeesCount: number;
  assignedEmployees: Array<{ id: string; name: string; email: string }>;
  message: string;
}

export interface DepartmentCascadeResult {
  success: boolean;
  departmentId: string;
  reassignedEmployeesCount: number;
  targetDepartmentId: string;
  message: string;
}

export interface BusinessUnitCascadeResult {
  success: boolean;
  unitId: string;
  affectedDepartmentsCount: number;
  affectedCostCentersCount: number;
  message: string;
}

export class OrganizationIntegrityService {
  /**
   * Evaluates whether a department can be safely deleted without orphaning active employees.
   */
  public static async checkDepartmentDeletionSafety(
    businessId: string,
    departmentId: string
  ): Promise<DeletionSafetyReport> {
    const q = query(
      collection(db, "employees"),
      where("business_id", "==", businessId),
      where("departmentId", "==", departmentId)
    );
    const snap = await getDocs(q);
    const assignedEmployees = snap.docs.map(d => {
      const data = d.data();
      return { id: d.id, name: data.name || "Inconnu", email: data.email || "" };
    });

    const canDelete = assignedEmployees.length === 0;
    const message = canDelete
      ? "Ce département peut être supprimé en toute sécurité (aucun employé assigné)."
      : `Attention : ${assignedEmployees.length} employé(s) sont actuellement assignés à ce département.`;

    return {
      canDelete,
      assignedEmployeesCount: assignedEmployees.length,
      assignedEmployees,
      message
    };
  }

  /**
   * Deletes a department and handles assigned employees safely by either blocking or reassigning them.
   */
  public static async deleteDepartmentAndCascade(
    businessId: string,
    departmentId: string,
    options: {
      force?: boolean;
      reassignToDeptId?: string;
      actorId?: string;
    } = {}
  ): Promise<DepartmentCascadeResult> {
    const safety = await this.checkDepartmentDeletionSafety(businessId, departmentId);

    if (!safety.canDelete && !options.force && !options.reassignToDeptId) {
      return {
        success: false,
        departmentId,
        reassignedEmployeesCount: safety.assignedEmployeesCount,
        targetDepartmentId: "",
        message: `Suppression bloquée : ${safety.assignedEmployeesCount} employé(s) sont assignés à ce département. Spécifiez un département de réassignation.`
      };
    }

    const res = await DepartmentRepository.deleteWithIntegrityCheck(
      businessId,
      departmentId,
      options
    );

    return {
      success: res.success,
      departmentId,
      reassignedEmployeesCount: res.reassignedCount,
      targetDepartmentId: options.reassignToDeptId || "d_admin",
      message: res.message
    };
  }

  /**
   * Deletes or deactivates a Business Unit and cascades the status to child Departments & Cost Centers.
   */
  public static async deleteBusinessUnitAndCascade(
    businessId: string,
    unitId: string,
    options: { mode?: "SOFT_DEACTIVATE" | "HARD_DELETE"; actorId?: string } = {}
  ): Promise<BusinessUnitCascadeResult> {
    const mode = options.mode || "SOFT_DEACTIVATE";
    const actorId = options.actorId || "SYSTEM";

    if (mode === "SOFT_DEACTIVATE") {
      const cascade = await BusinessUnitRepository.deactivateWithCascade(businessId, unitId, actorId);
      return {
        success: true,
        unitId,
        affectedDepartmentsCount: cascade.affectedDepartments,
        affectedCostCentersCount: cascade.affectedCostCenters,
        message: `Business Unit désactivée. ${cascade.affectedDepartments} département(s) et ${cascade.affectedCostCenters} centre(s) de coût ont été marqués comme INACTIF.`
      };
    } else {
      // Hard delete children references / detach them
      const deptQ = query(collection(db, "departments"), where("business_id", "==", businessId), where("business_unit_id", "==", unitId));
      const deptSnap = await getDocs(deptQ);
      for (const d of deptSnap.docs) {
        await updateDoc(doc(db, "departments", d.id), { business_unit_id: "", updated_at: new Date().toISOString() });
      }

      const ccQ = query(collection(db, "cost_centers"), where("business_id", "==", businessId), where("business_unit_id", "==", unitId));
      const ccSnap = await getDocs(ccQ);
      for (const c of ccSnap.docs) {
        await updateDoc(doc(db, "cost_centers", c.id), { business_unit_id: "", updated_at: new Date().toISOString() });
      }

      await BusinessUnitRepository.delete(unitId);

      EventBus.publish(EventBus.createEvent({
        correlationId: `bu_hard_deleted_${unitId}`,
        actorId,
        businessId,
        module: "ORGANIZATION",
        aggregate: "BUSINESS_UNIT",
        type: "BusinessUnitDeleted",
        payload: { unitId, detachedDepartments: deptSnap.size, detachedCostCenters: ccSnap.size }
      }));

      return {
        success: true,
        unitId,
        affectedDepartmentsCount: deptSnap.size,
        affectedCostCentersCount: ccSnap.size,
        message: `Business Unit supprimée. ${deptSnap.size} département(s) et ${ccSnap.size} centre(s) de coût ont été détachés.`
      };
    }
  }

  /**
   * Transfers an employee between cost centers and emits an event for budget reallocations.
   */
  public static async transferEmployeeCostCenter(
    businessId: string,
    employeeId: string,
    sourceCostCenterId: string,
    targetCostCenterId: string,
    actorId: string = "SYSTEM"
  ): Promise<void> {
    await updateDoc(doc(db, "employees", employeeId), {
      costCenterId: targetCostCenterId,
      cost_center_id: targetCostCenterId,
      updatedAt: new Date().toISOString()
    });

    EventBus.publish(EventBus.createEvent({
      correlationId: `emp_cost_center_transfer_${employeeId}`,
      actorId,
      businessId,
      module: "ORGANIZATION",
      aggregate: "EMPLOYEE",
      type: "EmployeeTransferred",
      payload: {
        employeeId,
        oldCostCenterId: sourceCostCenterId,
        newCostCenterId: targetCostCenterId,
        businessId
      }
    }));
  }
}
