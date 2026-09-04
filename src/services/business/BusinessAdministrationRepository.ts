import { db } from "../../lib/firebase";
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  deleteDoc,
  serverTimestamp
} from "firebase/firestore";
import { Business, Branch, Department } from "../../types";
import { finopsEventOrchestrator } from "../finopsEventOrchestrator";

import { DepartmentRepository, BranchRepository } from "../../repositories/organization";
import { OrganizationIntegrityService } from "../../domains/organization/services/OrganizationIntegrityService";

export class BusinessAdministrationRepository {
  /**
   * BUSINESS PROFILE
   */
  static async updateBusinessProfile(businessId: string, data: Partial<Business>): Promise<void> {
    const bizRef = doc(db, "businesses", businessId);
    await updateDoc(bizRef, {
      ...data,
      updatedAt: serverTimestamp()
    });
  }

  /**
   * BRANCH MANAGEMENT
   */
  static async listBranches(businessId: string): Promise<Branch[]> {
    return BranchRepository.listByBusiness(businessId);
  }

  static async saveBranch(businessId: string, branch: Partial<Branch>): Promise<void> {
    if (branch.id) {
      await BranchRepository.update(branch.id, { ...branch, business_id: businessId });
    } else {
      await BranchRepository.create({
        business_id: businessId,
        name: branch.name || "Nouvelle Succursale",
        code: branch.code,
        address: branch.address,
        location: branch.location,
        is_active: branch.is_active !== undefined ? branch.is_active : true,
        status: branch.status || "ACTIVE"
      });
    }
  }

  static async deleteBranch(branchId: string): Promise<void> {
    await BranchRepository.delete(branchId);
  }

  /**
   * DEPARTMENT MANAGEMENT
   */
  static async listDepartments(businessId: string): Promise<Department[]> {
    return DepartmentRepository.listByBusiness(businessId);
  }

  static async saveDepartment(businessId: string, dept: Partial<Department>): Promise<void> {
    if (dept.id) {
      await DepartmentRepository.update(dept.id, { ...dept, business_id: businessId });
    } else {
      await DepartmentRepository.create({
        business_id: businessId,
        name: dept.name || "Nouveau Département",
        code: dept.code,
        branch_id: dept.branch_id,
        is_active: dept.is_active !== undefined ? dept.is_active : true,
        status: dept.status || "ACTIVE"
      });
    }
  }

  static async deleteDepartment(deptId: string, businessId?: string): Promise<void> {
    const dept = await DepartmentRepository.getById(deptId);
    const targetBizId = businessId || dept?.business_id;

    if (targetBizId) {
      const result = await OrganizationIntegrityService.deleteDepartmentAndCascade(
        targetBizId,
        deptId,
        { force: false, reassignToDeptId: "d_admin" }
      );
      if (!result.success) {
        throw new Error(result.message);
      }
    } else {
      await DepartmentRepository.delete(deptId);
    }
  }

  /**
   * BUSINESS SETTINGS (Centralized SSOT)
   */
  static async getSettings(businessId: string): Promise<any> {
    const snap = await getDoc(doc(db, "business_settings", businessId));
    return snap.exists() ? snap.data() : null;
  }

  static async updateSettings(businessId: string, data: any): Promise<void> {
    await setDoc(doc(db, "business_settings", businessId), {
      ...data,
      business_id: businessId,
      updatedAt: serverTimestamp()
    }, { merge: true });

    try {
      finopsEventOrchestrator.emit("AUTHORIZATION", businessId, {
        action: "ROLES_AND_PERMISSIONS_UPDATED",
        business_id: businessId
      });
    } catch (e) {
      console.warn("Failed to emit audit event", e);
    }
  }

  /**
   * ROLES & PERMISSIONS
   */
  static async listRoles(businessId: string): Promise<any[]> {
    const q = query(collection(db, "roles"), where("business_id", "==", businessId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  static async saveRole(businessId: string, role: any): Promise<void> {
    const id = role.id || role.code || doc(collection(db, "roles")).id;
    await setDoc(doc(db, "roles", id), {
      ...role,
      business_id: businessId,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  /**
   * SUBSCRIPTION & FEATURES
   */
  static async getSubscription(businessId: string): Promise<any> {
    const snap = await getDoc(doc(db, "subscriptions", businessId));
    return snap.exists() ? snap.data() : null;
  }

  static async getFeatures(businessId: string): Promise<any> {
    const snap = await getDoc(doc(db, "features", businessId));
    return snap.exists() ? snap.data() : null;
  }

  static async updateFeatures(businessId: string, features: any): Promise<void> {
    await setDoc(doc(db, "features", businessId), {
      ...features,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }
}
