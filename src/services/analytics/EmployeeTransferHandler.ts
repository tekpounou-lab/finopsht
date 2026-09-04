// src/services/analytics/EmployeeTransferHandler.ts
import { db, auth } from "../../lib/firebase";
import { collection, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import { EmployeeDepartmentActivityRepository } from "../../repositories/AnalyticsRepository";
import { SnapshotRebuildService } from "../SnapshotRebuildService";

export class EmployeeTransferHandler {
  private static listeners = new Map<string, () => void>();

  /**
   * Listens to the employees collection in real-time for any department changes.
   */
  public static listenForEmployeeDepartmentChanges(businessId: string): void {
    if (!businessId || !auth.currentUser) {
      return;
    }
    if (this.listeners.has(businessId)) {
      return; // Already listening
    }

    const q = query(
      collection(db, "employees"),
      where("business_id", "==", businessId)
    );

    // Track initial load vs updates to prevent triggering on first snapshot fetch
    let isInitialLoad = true;
    const employeeCache = new Map<string, string>(); // employeeId -> departmentId

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (isInitialLoad) {
        snapshot.docs.forEach((d) => {
          const emp = d.data();
          const deptId = emp.departmentId || emp.department_id || "";
          employeeCache.set(d.id, deptId);
        });
        isInitialLoad = false;
        return;
      }

      for (const change of snapshot.docChanges()) {
        if (change.type === "modified") {
          const employeeId = change.doc.id;
          const empData = change.doc.data();
          const newDeptId = empData.departmentId || empData.department_id || "";
          const oldDeptId = employeeCache.get(employeeId) || "";

          if (newDeptId && oldDeptId && newDeptId !== oldDeptId) {
            console.log(`[EmployeeTransferHandler] Transfer detected for employee ${employeeId}: ${oldDeptId} -> ${newDeptId}`);
            employeeCache.set(employeeId, newDeptId);
            
            // Handle the transfer
            await this.handleEmployeeTransfer(employeeId, oldDeptId, newDeptId, businessId);
          }
        } else if (change.type === "added") {
          const empData = change.doc.data();
          const deptId = empData.departmentId || empData.department_id || "";
          employeeCache.set(change.doc.id, deptId);
        } else if (change.type === "removed") {
          employeeCache.delete(change.doc.id);
        }
      }
    }, (err) => {
      console.warn("[EmployeeTransferHandler] Snapshot error:", err);
    });

    this.listeners.set(businessId, unsubscribe);
  }

  /**
   * Unsubscribes active listeners for a business
   */
  public static stopListening(businessId: string): void {
    const unsub = this.listeners.get(businessId);
    if (unsub) {
      unsub();
      this.listeners.delete(businessId);
    }
  }

  /**
   * Updates employee_department_activity mappings on employee transfer and triggers partial rebuild
   */
  public static async handleEmployeeTransfer(
    employeeId: string, 
    oldDepartmentId: string, 
    newDepartmentId: string,
    businessId: string
  ): Promise<void> {
    console.log(`[EmployeeTransferHandler] Processing transfer mappings for employee ${employeeId} to department ${newDepartmentId}`);

    // Fetch department details for names
    const deptRef = doc(db, "departments", newDepartmentId);
    const deptSnap = await getDoc(deptRef);
    let departmentName = "New Department";
    let branchId = "main";

    if (deptSnap.exists()) {
      const data = deptSnap.data();
      departmentName = data.name || departmentName;
      branchId = data.branch_id || data.branchId || branchId;
    }

    const empRef = doc(db, "employees", employeeId);
    const empSnap = await getDoc(empRef);
    let employeeName = "Employee";
    if (empSnap.exists()) {
      employeeName = empSnap.data().name || employeeName;
    }

    // Upsert the activity record for the new department assignment
    await EmployeeDepartmentActivityRepository.upsert(businessId, {
      business_id: businessId,
      businessId,
      employee_id: employeeId,
      employeeId,
      employeeName,
      department_id: newDepartmentId,
      departmentId: newDepartmentId,
      department_name: departmentName,
      departmentName,
      branch_id: branchId,
      branchId,
      branchName: branchId === "main" ? "Main Branch" : "Branch " + branchId,
      first_sale_at: new Date().toISOString(),
      last_sale_at: new Date().toISOString(),
      sales_count: 0,
      sales_amount: 0,
      commission_amount: 0,
      last_payroll_cycle: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Trigger partial recalculation for this employee
    await this.recalculateEmployeeAttributions(employeeId, businessId);
  }

  /**
   * Recalculates all operational attributions for a single employee
   */
  public static async recalculateEmployeeAttributions(employeeId: string, businessId: string): Promise<void> {
    console.log(`[EmployeeTransferHandler] Recalculating attributions for employee ${employeeId}`);
    await SnapshotRebuildService.rebuildForEmployee(businessId, employeeId);
  }
}
