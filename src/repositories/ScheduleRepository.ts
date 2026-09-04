import { db, auth } from "../lib/firebase";
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  deleteDoc,
  addDoc,
  collection, 
  query, 
  where, 
  getDocs, 
  writeBatch,
  serverTimestamp
} from "firebase/firestore";
import { Shift } from "../components/planning/types";
import { EmployeeAuditService } from "../services/audit/EmployeeAuditService";
import { EventBus } from "../modules/runtime/EventBus";
import { TransactionEngine } from "../modules/runtime/TransactionEngine";
import { PlanningDomainService } from "../domains/planning/services/PlanningDomainService";

export const ScheduleRepository = {
  /**
   * Checks if a target date is inside a LOCKED, SEALED, or PAID payroll cycle.
   * Throws an error if period is locked to enforce immutability of historical shifts.
   */
  async verifyPeriodLock(businessId: string, dateStr: string): Promise<void> {
    if (!businessId || !dateStr) return;

    const q = query(
      collection(db, "payroll_cycles"),
      where("business_id", "==", businessId),
      where("status", "in", ["LOCKED", "PESSIMISTIC_LOCKED", "SEALED", "PAID"])
    );

    const snapshot = await getDocs(q);
    for (const docSnap of snapshot.docs) {
      const cycle = docSnap.data();
      const startDate = cycle.period_start || cycle.startDate || "";
      const endDate = cycle.period_end || cycle.endDate || "";

      if (startDate && endDate && dateStr >= startDate && dateStr <= endDate) {
        throw new Error(
          `Impossible de modifier la planification : la période de paie du ${dateStr} est verrouillée/scellée (${cycle.status}).`
        );
      }
    }
  },

  /**
   * Fetches all shifts for a business tenant
   */
  async getShiftsByBusiness(businessId: string): Promise<Shift[]> {
    const q = query(
      collection(db, "shifts"), 
      where("business_id", "==", businessId)
    );
    const snap = await getDocs(q);
    const rawShifts = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Shift))
      .filter(s => (s as any).status !== 'CANCELLED' && (s as any).void !== true);

    const currentUser = auth.currentUser;
    if (!currentUser) return rawShifts;

    // Fetch the logged-in user's employee record to determine their actor profile
    const empQuery = query(
      collection(db, "employees"),
      where("business_id", "==", businessId),
      where("email", "==", currentUser.email || "")
    );
    const empSnap = await getDocs(empQuery);

    let actor = {
      id: currentUser.uid,
      role: "EMPLOYEE",
    };

    if (!empSnap.empty) {
      const empData = empSnap.docs[0].data();
      actor = {
        id: empSnap.docs[0].id,
        role: empData.role || "EMPLOYEE",
        branchId: empData.branchId,
        departmentId: empData.departmentId,
      } as any;
    }

    // Fetch all employees in business to resolve team members, branch, or manager constraints
    const allEmpsQuery = query(collection(db, "employees"), where("business_id", "==", businessId));
    const allEmpsSnap = await getDocs(allEmpsQuery);
    const employees = allEmpsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    return PlanningDomainService.filterVisibleShifts(rawShifts, actor, employees);
  },

  /**
   * Helper to query shifts for a specific employee and date range (Attendance/Payroll SSOT lookup)
   */
  async getShiftsByEmployeeAndDateRange(
    businessId: string,
    employeeId: string,
    startDate: string,
    endDate: string
  ): Promise<Shift[]> {
    const q = query(
      collection(db, "shifts"),
      where("business_id", "==", businessId),
      where("employeeId", "==", employeeId)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Shift))
      .filter(s => 
        (s as any).status !== 'CANCELLED' && 
        (s as any).void !== true && 
        s.date >= startDate && 
        s.date <= endDate
      );
  },

  /**
   * Helper to lookup a single scheduled shift for an employee on a given date
   */
  async getShiftByEmployeeAndDate(
    businessId: string,
    employeeId: string,
    dateStr: string
  ): Promise<Shift | null> {
    const q = query(
      collection(db, "shifts"),
      where("business_id", "==", businessId),
      where("employeeId", "==", employeeId),
      where("date", "==", dateStr)
    );
    const snap = await getDocs(q);
    const validDocs = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Shift))
      .filter(s => (s as any).status !== 'CANCELLED' && (s as any).void !== true);

    return validDocs.length > 0 ? validDocs[0] : null;
  },

  /**
   * Transactional creation of a single shift
   */
  async createShift(
    shiftData: Omit<Shift, "id"> & { id?: string },
    actor: { id: string; name: string; role: string }
  ): Promise<Shift> {
    // 1. Period lock check
    await this.verifyPeriodLock(shiftData.business_id, shiftData.date);

    // 2. Role validation
    await PlanningDomainService.validateShiftAssignmentById(shiftData.employeeId);

    const shiftId = shiftData.id || `shf_${Math.random().toString(36).substring(2, 9)}`;
    const newShift: Shift = {
      status: 'SCHEDULED',
      ...shiftData,
      id: shiftId
    };

    await setDoc(doc(db, "shifts", shiftId), newShift);

    await EmployeeAuditService.logTransition({
      employeeId: shiftData.employeeId,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      business_id: shiftData.business_id,
      action: "CREATE_SHIFT",
      beforeState: null,
      afterState: { shiftId, date: shiftData.date, startTime: shiftData.startTime, endTime: shiftData.endTime },
      severity: "info"
    });

    EventBus.publish(EventBus.createEvent({
      correlationId: `shift_create_${shiftId}`,
      actorId: actor.id,
      businessId: shiftData.business_id,
      module: "SCHEDULING",
      aggregate: "SHIFT",
      type: "ScheduleCreated",
      payload: newShift
    }));

    return newShift;
  },

  /**
   * Updates an existing shift with Period Lock verification
   */
  async updateShift(
    shiftId: string,
    updates: Partial<Shift>,
    actor: { id: string; name: string; role: string }
  ): Promise<void> {
    if (updates.employeeId) {
      await PlanningDomainService.validateShiftAssignmentById(updates.employeeId);
    }
    const shiftRef = doc(db, "shifts", shiftId);
    const snap = await getDoc(shiftRef);
    if (!snap.exists()) throw new Error("Planification introuvable.");

    const beforeState = snap.data() as Shift;
    const businessId = beforeState.business_id;

    // Period Lock Check for original date and new date (if changed)
    await this.verifyPeriodLock(businessId, beforeState.date);
    if (updates.date && updates.date !== beforeState.date) {
      await this.verifyPeriodLock(businessId, updates.date);
    }

    await TransactionEngine.execute("updateShift", "PENDING", async (transaction) => {
      transaction.update(shiftRef, updates);

      await EmployeeAuditService.logTransition({
        employeeId: beforeState.employeeId,
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        business_id: beforeState.business_id,
        action: "UPDATE_SHIFT",
        beforeState: { shiftId, date: beforeState.date, startTime: beforeState.startTime, endTime: beforeState.endTime },
        afterState: { shiftId, ...updates },
        severity: "info"
      });
    }, { shiftId, updates });

    EventBus.publish(EventBus.createEvent({
      correlationId: `shift_update_${shiftId}`,
      actorId: actor.id,
      businessId,
      module: "SCHEDULING",
      aggregate: "SHIFT",
      type: "ScheduleUpdated",
      payload: { shiftId, updates }
    }));
  },

  /**
   * Soft-deletes / voids an existing shift (preserves historical audit trail)
   */
  async deleteShift(shiftId: string, actor: { id: string; name: string; role: string }): Promise<void> {
    const shiftRef = doc(db, "shifts", shiftId);
    const snap = await getDoc(shiftRef);
    if (!snap.exists()) return;
    const shift = snap.data() as Shift;

    // Period lock check
    await this.verifyPeriodLock(shift.business_id, shift.date);

    // Soft delete: status CANCELLED and void flag set
    await updateDoc(shiftRef, {
      status: "CANCELLED",
      void: true,
      cancelledBy: actor.id,
      cancelledAt: new Date().toISOString()
    });

    await EmployeeAuditService.logTransition({
      employeeId: shift.employeeId,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      business_id: shift.business_id,
      action: "DELETE_SHIFT",
      beforeState: { shiftId, date: shift.date, status: shift.status },
      afterState: { shiftId, date: shift.date, status: "CANCELLED", void: true },
      severity: "warning"
    });

    EventBus.publish(EventBus.createEvent({
      correlationId: `shift_delete_${shiftId}`,
      actorId: actor.id,
      businessId: shift.business_id,
      module: "SCHEDULING",
      aggregate: "SHIFT",
      type: "ScheduleDeleted",
      payload: { shiftId, status: "CANCELLED" }
    }));
  },

  /**
   * Fetches shift templates for a business tenant
   */
  async getShiftTemplates(businessId: string): Promise<any[]> {
    const q = query(collection(db, "shift_templates"), where("businessId", "==", businessId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  /**
   * Saves or updates a shift template
   */
  async saveShiftTemplate(templateId: string, templateData: any): Promise<void> {
    const ref = doc(db, "shift_templates", templateId);
    await setDoc(ref, { id: templateId, ...templateData, updatedAt: new Date().toISOString() }, { merge: true });
  },

  /**
   * Deletes a shift template
   */
  async deleteShiftTemplate(templateId: string): Promise<void> {
    const ref = doc(db, "shift_templates", templateId);
    await deleteDoc(ref);
  },

  /**
   * Saves an employee assignment
   */
  async saveEmployeeAssignment(assignment: any): Promise<void> {
    if (assignment.employeeId) {
      await PlanningDomainService.validateShiftAssignmentById(assignment.employeeId);
    }
    const ref = doc(db, "employee_assignments", assignment.id);
    await setDoc(ref, assignment, { merge: true });
  },

  /**
   * Deletes an employee assignment
   */
  async deleteEmployeeAssignment(assignmentId: string): Promise<void> {
    const ref = doc(db, "employee_assignments", assignmentId);
    await deleteDoc(ref);
  },

  /**
   * Creates a shift change request
   */
  async createShiftChangeRequest(request: any): Promise<void> {
    const requestRef = collection(db, "shift_change_requests");
    await addDoc(requestRef, request);
  },

  /**
   * Bulk save shifts (for AI-powered Auto-Schedule or copy-week actions) with Period Lock checks
   */
  async bulkSaveShifts(
    shifts: Shift[],
    actor: { id: string; name: string; role: string }
  ): Promise<void> {
    if (!shifts || shifts.length === 0) return;

    // 1. Period Lock Check for all unique (business_id, date) pairs
    const uniqueLockPairs = Array.from(new Set(shifts.map(s => `${s.business_id}:::${s.date}`)));
    for (const pair of uniqueLockPairs) {
      const [bizId, dateStr] = pair.split(":::");
      await this.verifyPeriodLock(bizId, dateStr);
    }

    // 2. Role validation for all target employees
    const employeeIds = Array.from(new Set(shifts.map(s => s.employeeId)));
    await Promise.all(employeeIds.map(id => PlanningDomainService.validateShiftAssignmentById(id)));

    const batch = writeBatch(db);
    
    shifts.forEach(shift => {
      const ref = doc(db, "shifts", shift.id);
      batch.set(ref, shift, { merge: true });
    });

    await batch.commit();

    if (shifts.length > 0) {
      const business_id = shifts[0].business_id;
      await EmployeeAuditService.logTransition({
        employeeId: "bulk_scheduling",
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        business_id,
        action: "BULK_SHIFTS_SAVED",
        beforeState: null,
        afterState: { bulkCount: shifts.length },
        severity: "info"
      });

      EventBus.publish(EventBus.createEvent({
        correlationId: `shift_bulk_${Date.now()}`,
        actorId: actor.id,
        businessId: business_id,
        module: "SCHEDULING",
        aggregate: "SHIFT",
        type: "SchedulesBulkSaved",
        payload: { count: shifts.length }
      }));
    }
  }
};

