import { db } from "../lib/firebase";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  setDoc, 
  doc, 
  serverTimestamp,
  orderBy,
  limit
} from "firebase/firestore";
import {
  EmployeeDepartmentHistory,
  CommissionPlan,
  EmployeePerformanceSnapshot,
  DepartmentPerformanceSnapshot,
  BranchPerformanceSnapshot,
  BusinessPerformanceSnapshot
} from "../types";
import { resilientGetDocs } from "../utils/resilientFirestore";

export class WorkforcePerformanceRepository {
  /**
   * Log employee department transfer or position update history
   */
  static async logDepartmentHistory(
    historyRecord: Omit<EmployeeDepartmentHistory, "id"> & { id?: string }
  ): Promise<string> {
    const docId = historyRecord.id || `dept_hist_${historyRecord.employee_id}_${Date.now()}`;
    const docRef = doc(db, "employee_department_history", docId);
    
    await setDoc(docRef, {
      ...historyRecord,
      id: docId,
      created_at: serverTimestamp()
    }, { merge: true });

    return docId;
  }

  /**
   * Get employee department assignment history
   */
  static async getEmployeeDepartmentHistory(
    businessId: string,
    employeeId: string
  ): Promise<EmployeeDepartmentHistory[]> {
    const q = query(
      collection(db, "employee_department_history"),
      where("business_id", "==", businessId),
      where("employee_id", "==", employeeId)
    );
    const snap = await resilientGetDocs(q, `dept_history_${businessId}_${employeeId}`);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as EmployeeDepartmentHistory));
  }

  /**
   * Save or Update Commission Plan
   */
  static async saveCommissionPlan(plan: CommissionPlan): Promise<void> {
    const docRef = doc(db, "commission_plans", plan.id);
    await setDoc(docRef, {
      ...plan,
      updated_at: serverTimestamp()
    }, { merge: true });
  }

  /**
   * List Commission Plans for a business
   */
  static async listCommissionPlans(businessId: string): Promise<CommissionPlan[]> {
    const q = query(
      collection(db, "commission_plans"),
      where("business_id", "==", businessId)
    );
    const snap = await resilientGetDocs(q, `commission_plans_${businessId}`);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CommissionPlan));
  }

  /**
   * Save Employee Performance Snapshot
   */
  static async saveEmployeeSnapshot(snapshot: EmployeePerformanceSnapshot): Promise<void> {
    const docRef = doc(db, "employee_performance_snapshots", snapshot.id);
    await setDoc(docRef, {
      ...snapshot,
      created_at: serverTimestamp()
    }, { merge: true });
  }

  /**
   * Get Employee Performance Snapshots for a period
   */
  static async getEmployeeSnapshots(
    businessId: string,
    periodKey: string
  ): Promise<EmployeePerformanceSnapshot[]> {
    const q = query(
      collection(db, "employee_performance_snapshots"),
      where("business_id", "==", businessId),
      where("period_key", "==", periodKey)
    );
    const snap = await resilientGetDocs(q, `emp_snapshots_${businessId}_${periodKey}`);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as EmployeePerformanceSnapshot));
  }

  /**
   * Save Department Performance Snapshot
   */
  static async saveDepartmentSnapshot(snapshot: DepartmentPerformanceSnapshot): Promise<void> {
    const docRef = doc(db, "department_performance_snapshots", snapshot.id);
    await setDoc(docRef, {
      ...snapshot,
      created_at: serverTimestamp()
    }, { merge: true });
  }

  /**
   * Get Department Performance Snapshots for a period
   */
  static async getDepartmentSnapshots(
    businessId: string,
    periodKey: string
  ): Promise<DepartmentPerformanceSnapshot[]> {
    const q = query(
      collection(db, "department_performance_snapshots"),
      where("business_id", "==", businessId),
      where("period_key", "==", periodKey)
    );
    const snap = await resilientGetDocs(q, `dept_snapshots_${businessId}_${periodKey}`);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as DepartmentPerformanceSnapshot));
  }

  /**
   * Save Branch Performance Snapshot
   */
  static async saveBranchSnapshot(snapshot: BranchPerformanceSnapshot): Promise<void> {
    const docRef = doc(db, "branch_performance_snapshots", snapshot.id);
    await setDoc(docRef, {
      ...snapshot,
      created_at: serverTimestamp()
    }, { merge: true });
  }

  /**
   * Save Business Executive Snapshot
   */
  static async saveBusinessSnapshot(snapshot: BusinessPerformanceSnapshot): Promise<void> {
    const docRef = doc(db, "business_performance_snapshots", snapshot.id);
    await setDoc(docRef, {
      ...snapshot,
      created_at: serverTimestamp()
    }, { merge: true });
  }
}
