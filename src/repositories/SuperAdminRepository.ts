import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  limit, 
  orderBy, 
  serverTimestamp 
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { ForensicLog, PayrollCycle, Employee, Business } from "../types";
import { EventBus } from "../modules/runtime/EventBus";
import { ForensicLogRepository } from "./ForensicLogRepository";
import { PayrollRepository } from "./PayrollRepository";
import { EmployeeRepository } from "./EmployeeRepository";
import { FeatureResolver } from "../services/FeatureResolver";

export interface SuperAdminActor {
  uid: string;
  email: string;
  name: string;
  role: "SUPER_ADMIN";
}

export const SuperAdminRepository = {
  /**
   * Cross-tenant query: Fetches all tenant business profiles with pagination and logging.
   */
  async getTenants(limitTo: number = 100): Promise<Business[]> {
    const path = "businesses";
    try {
      const q = query(
        collection(db, "businesses"),
        limit(limitTo)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Business));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  /**
   * Cross-tenant query: Fetches audit logs across all business tenants for SuperAdmin inspection.
   */
  async getGlobalAuditLogs(limitTo: number = 100, tenantIdFilter?: string): Promise<ForensicLog[]> {
    return await ForensicLogRepository.listGlobalLogs(limitTo, tenantIdFilter);
  },

  /**
   * SuperAdmin Force Action: Force Unseal a Sealed Payroll Cycle.
   * Creates a SHA-256 signed ForensicLog BEFORE reverting state via PayrollRepository.
   */
  async forceUnsealPayrollCycle(
    businessId: string,
    cycleId: string,
    reason: string,
    actor: SuperAdminActor
  ): Promise<void> {
    if (!businessId || !cycleId) {
      throw new Error("SuperAdmin Error: businessId and cycleId are required for force unseal.");
    }
    if (!reason || reason.trim().length < 10) {
      throw new Error("SuperAdmin Error: A typed justification of at least 10 characters is required for force unseal.");
    }

    // 1. Get before state
    const existingCycle = await PayrollRepository.getCycleById(cycleId);
    if (!existingCycle) {
      throw new Error(`Payroll cycle [${cycleId}] not found.`);
    }

    const timestamp = new Date().toISOString();

    // 2. Prepare & sign Forensic Log
    const forensicLog = await ForensicLogRepository.createAndSignLog({
      business_id: businessId,
      action: "SUPERADMIN_FORCE_UNSEAL",
      actorId: actor.uid,
      userName: actor.name,
      userRole: actor.role,
      userEmail: actor.email,
      timestamp,
      details: `[SUPER_ADMIN FORCE UNSEAL] Cycle ${existingCycle.cycleName} (${cycleId}) unsealed. Reason: ${reason}`,
      beforeState: existingCycle,
      afterState: { ...existingCycle, status: "LOCKED", unsealedAt: timestamp, unsealedBy: actor.uid, unsealReason: reason }
    });

    // 3. Rollback / revert cycle using atomic repository method
    await PayrollRepository.rollbackCycleAtomic({
      cycle: existingCycle,
      reversalTransactions: [],
      forensicLog,
      rollbackReason: `SUPERADMIN_FORCE_UNSEAL: ${reason}`,
      userId: actor.uid
    });

    // 4. Emit typed EventBus event
    EventBus.publish(EventBus.createEvent({
      correlationId: `superadmin_unseal_${cycleId}_${Date.now()}`,
      businessId,
      actorId: actor.uid,
      module: "PAYROLL",
      aggregate: "PayrollCycle",
      type: "SUPERADMIN_FORCE_UNSEAL",
      payload: {
        cycleId,
        businessId,
        reason,
        actorId: actor.uid,
        actorEmail: actor.email
      }
    }));

    // 5. Invalidate tenant cache
    FeatureResolver.clearCache(businessId);
  },

  /**
   * SuperAdmin Force Action: Override Employee Salary.
   * Writes SHA-256 signed ForensicLog before updating record via EmployeeRepository.
   */
  async overrideEmployeeSalary(
    businessId: string,
    employeeId: string,
    newSalaryHTG: number,
    reason: string,
    actor: SuperAdminActor
  ): Promise<void> {
    if (!reason || reason.trim().length < 10) {
      throw new Error("SuperAdmin Error: A typed justification of at least 10 characters is required.");
    }

    const employeeRef = doc(db, "businesses", businessId, "employees", employeeId);
    const snap = await getDoc(employeeRef);
    if (!snap.exists()) {
      throw new Error(`Employee [${employeeId}] not found in tenant [${businessId}].`);
    }

    const beforeState = snap.data();
    const timestamp = new Date().toISOString();

    // Prepare Forensic Log
    const forensicLog = await ForensicLogRepository.createAndSignLog({
      business_id: businessId,
      action: "SUPERADMIN_OVERRIDE_EMPLOYEE_SALARY",
      actorId: actor.uid,
      userName: actor.name,
      userRole: actor.role,
      userEmail: actor.email,
      timestamp,
      details: `[SUPER_ADMIN SALARY OVERRIDE] Employee ${beforeState.name} (${employeeId}) salary adjusted to ${newSalaryHTG} HTG. Reason: ${reason}`,
      beforeState: { baseSalary: beforeState.baseSalary || beforeState.salaryBaseHtg },
      afterState: { baseSalary: newSalaryHTG }
    });

    // Write forensic log
    await ForensicLogRepository.writeForensicLog(forensicLog);

    // Update record via repository
    await EmployeeRepository.updateEmployee(
      employeeId,
      {
        baseSalary: newSalaryHTG,
        salaryBaseHtg: newSalaryHTG,
        business_id: businessId
      },
      actor
    );

    // Emit Event
    EventBus.publish(EventBus.createEvent({
      correlationId: `superadmin_salary_${employeeId}_${Date.now()}`,
      businessId,
      actorId: actor.uid,
      module: "WORKFORCE",
      aggregate: "EMPLOYEE",
      type: "SUPERADMIN_SALARY_OVERRIDE",
      payload: {
        employeeId,
        businessId,
        newSalaryHTG,
        reason,
        actorId: actor.uid
      }
    }));

    FeatureResolver.clearCache(businessId);
  },

  /**
   * SuperAdmin Action: Schedules a Tenant Business for Deletion (Deletion Safety Pattern).
   * Marks business as SCHEDULED_FOR_DELETION and creates an archive snapshot instead of immediate destruction.
   */
  async scheduleTenantForDeletion(
    businessId: string,
    reason: string,
    actor: SuperAdminActor
  ): Promise<void> {
    if (!reason || reason.trim().length < 10) {
      throw new Error("SuperAdmin Error: Justification of at least 10 characters is required for tenant deletion.");
    }

    const bizRef = doc(db, "businesses", businessId);
    const snap = await getDoc(bizRef);
    if (!snap.exists()) {
      throw new Error(`Business tenant [${businessId}] not found.`);
    }

    const beforeState = snap.data();
    const timestamp = new Date().toISOString();
    const scheduledDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days statutory retention

    // 1. Prepare & write Forensic Log
    const forensicLog = await ForensicLogRepository.createAndSignLog({
      business_id: businessId,
      action: "SUPERADMIN_TENANT_SCHEDULED_FOR_DELETION",
      actorId: actor.uid,
      userName: actor.name,
      userRole: actor.role,
      userEmail: actor.email,
      timestamp,
      details: `[SUPER_ADMIN DELETION SCHEDULED] Business ${beforeState.name} (${businessId}) scheduled for deletion on ${scheduledDate}. Reason: ${reason}`,
      beforeState,
      afterState: { ...beforeState, status: "SCHEDULED_FOR_DELETION", scheduledDeletionDate: scheduledDate }
    });

    await ForensicLogRepository.writeForensicLog(forensicLog);

    // 2. Archive tenant state snapshot in business_archives
    const archiveRef = doc(db, "business_archives", `archive_biz_${businessId}_${Date.now()}`);
    await setDoc(archiveRef, {
      ...beforeState,
      archivedAt: timestamp,
      archivedBy: actor.uid,
      reason,
      status: "SCHEDULED_FOR_DELETION",
      scheduledDeletionDate: scheduledDate
    });

    // 3. Mark active business document as SCHEDULED_FOR_DELETION (Never delete instantly!)
    await setDoc(bizRef, {
      status: "SCHEDULED_FOR_DELETION",
      scheduledDeletionDate: scheduledDate,
      deletionReason: reason,
      updatedAt: timestamp
    }, { merge: true });

    // 4. Emit Event
    EventBus.publish(EventBus.createEvent({
      correlationId: `superadmin_del_biz_${businessId}`,
      businessId,
      actorId: actor.uid,
      module: "ORGANIZATION",
      aggregate: "BUSINESS",
      type: "SUPERADMIN_TENANT_DELETED",
      payload: {
        businessId,
        businessName: beforeState.name,
        scheduledDeletionDate: scheduledDate,
        reason,
        actorId: actor.uid
      }
    }));

    FeatureResolver.clearCache(businessId);
  },

  /**
   * SuperAdmin Action: Updates tenant licensing and feature flags via FeatureResolver.
   */
  async updateTenantLicensingAndModules(
    businessId: string,
    modules: Record<string, boolean>,
    actor: SuperAdminActor
  ): Promise<void> {
    const timestamp = new Date().toISOString();

    const forensicLog = await ForensicLogRepository.createAndSignLog({
      business_id: businessId,
      action: "SUPERADMIN_LICENSE_UPDATE",
      actorId: actor.uid,
      userName: actor.name,
      userRole: actor.role,
      userEmail: actor.email,
      timestamp,
      details: `[SUPER_ADMIN MODULE TOGGLE] Feature flags updated for tenant ${businessId}`,
      afterState: { modules }
    });

    await ForensicLogRepository.writeForensicLog(forensicLog);

    // Save features via FeatureResolver
    await FeatureResolver.saveFeatures(businessId, modules as any);

    // Update tenant_modules on business document
    const bizRef = doc(db, "businesses", businessId);
    await setDoc(bizRef, {
      tenant_modules: modules,
      updatedAt: timestamp
    }, { merge: true });

    EventBus.publish(EventBus.createEvent({
      correlationId: `superadmin_features_${businessId}`,
      businessId,
      actorId: actor.uid,
      module: "ORGANIZATION",
      aggregate: "BUSINESS",
      type: "SUPERADMIN_LICENSE_UPDATE",
      payload: { businessId, modules }
    }));
  }
};
