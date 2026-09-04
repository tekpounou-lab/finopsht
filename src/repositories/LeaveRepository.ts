import { db } from "../lib/firebase";
import { 
  doc, 
  setDoc, 
  getDoc,
  collection, 
  query, 
  where, 
  getDocs,
  runTransaction,
  serverTimestamp 
} from "firebase/firestore";
import { LeaveRecord, LeaveBalance, LeavePolicy, LeaveApprovalLog, Employee, PayrollCycle } from "../types";
import { EmployeeAuditService } from "../services/audit/EmployeeAuditService";
import { EventBus } from "../modules/runtime/EventBus";
import { LEAVE_TYPES_CONFIG, calculateLeaveDays, mapLegacyLeaveType } from "../services/workforce/LeaveManagementService";

export const LeaveRepository = {
  /**
   * Fetches all leaves for a business tenant from SSOT `/leave_requests` (and fallback `/leaves`)
   */
  async getLeavesByBusiness(businessId: string): Promise<LeaveRecord[]> {
    const q1 = query(collection(db, "leave_requests"), where("business_id", "==", businessId));
    const snap1 = await getDocs(q1);
    if (!snap1.empty) {
      return snap1.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRecord));
    }
    const q2 = query(collection(db, "leaves"), where("business_id", "==", businessId));
    const snap2 = await getDocs(q2);
    return snap2.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRecord));
  },

  /**
   * Fetches leaves for a specific employee
   */
  async getLeavesByEmployee(businessId: string, employeeId: string): Promise<LeaveRecord[]> {
    const q = query(
      collection(db, "leave_requests"),
      where("business_id", "==", businessId),
      where("employeeId", "==", employeeId)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRecord));
    }
    const q2 = query(
      collection(db, "leaves"),
      where("business_id", "==", businessId),
      where("employeeId", "==", employeeId)
    );
    const snap2 = await getDocs(q2);
    return snap2.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRecord));
  },

  /**
   * Fetches single leave request
   */
  async getLeaveById(leaveId: string): Promise<LeaveRecord | null> {
    const ref1 = doc(db, "leave_requests", leaveId);
    const snap1 = await getDoc(ref1);
    if (snap1.exists()) {
      return { id: snap1.id, ...snap1.data() } as LeaveRecord;
    }
    const ref2 = doc(db, "leaves", leaveId);
    const snap2 = await getDoc(ref2);
    if (snap2.exists()) {
      return { id: snap2.id, ...snap2.data() } as LeaveRecord;
    }
    return null;
  },

  /**
   * Fetches active leave policies for tenant
   */
  async getLeavePolicies(businessId: string): Promise<LeavePolicy[]> {
    const q = query(collection(db, "leave_policies"), where("business_id", "==", businessId));
    const snap = await getDocs(q);
    if (snap.empty) {
      // Return default configuration
      return Object.entries(LEAVE_TYPES_CONFIG).map(([key, config]) => ({
        id: `pol_${businessId}_${key}`,
        business_id: businessId,
        leaveType: key,
        name: config.name,
        paid: config.paid,
        requiresApproval: config.requiresApproval,
        maxDaysPerYear: config.maxDaysPerYear,
        requiresDocument: config.requiresDocument,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));
    }
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as LeavePolicy));
  },

  /**
   * Retrieves or initializes the LeaveBalance for an employee
   */
  async getLeaveBalance(businessId: string, employeeId: string, year: number): Promise<LeaveBalance> {
    const balanceId = `${businessId}_${employeeId}_${year}`;
    const ref = doc(db, "leave_balances", balanceId);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      return snap.data() as LeaveBalance;
    }

    return await this.initializeEmployeeBalance(businessId, employeeId, year);
  },

  /**
   * Initializes default leave balance for an employee based on active policies
   */
  async initializeEmployeeBalance(
    businessId: string,
    employeeId: string,
    year: number,
    employeeName?: string
  ): Promise<LeaveBalance> {
    const balanceId = `${businessId}_${employeeId}_${year}`;
    const policies = await this.getLeavePolicies(businessId);
    const balances: Record<string, any> = {};

    for (const pol of policies) {
      balances[pol.leaveType] = {
        leaveType: pol.leaveType,
        entitlementDays: pol.maxDaysPerYear,
        accruedDays: pol.maxDaysPerYear,
        usedDays: 0,
        pendingDays: 0,
        remainingDays: pol.maxDaysPerYear,
        carriedOverDays: 0
      };
    }

    const newBalance: LeaveBalance = {
      id: balanceId,
      business_id: businessId,
      employeeId,
      employeeName: employeeName || "Employé",
      year,
      balances,
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, "leave_balances", balanceId), newBalance);
    return newBalance;
  },

  /**
   * Checks if the employee is on approved leave for a specific date
   */
  async isEmployeeOnApprovedLeave(businessId: string, employeeId: string, dateStr: string): Promise<boolean> {
    const leaves = await this.getLeavesByEmployee(businessId, employeeId);
    const targetDate = new Date(dateStr);
    return leaves.some(l => {
      if (l.status !== "APPROVED" && l.status !== "PAYROLL_SYNCED") return false;
      const start = new Date(l.startDate);
      const end = new Date(l.endDate);
      return targetDate >= start && targetDate <= end;
    });
  },

  /**
   * Create a new leave request (Employee self-service or admin manual entry)
   */
  async createLeaveRequest(
    leaveData: Omit<LeaveRecord, "id"> & { id?: string },
    actor: { id: string; name: string; role: string }
  ): Promise<LeaveRecord> {
    const businessId = leaveData.business_id;
    const employeeId = leaveData.employeeId;
    const mappedType = mapLegacyLeaveType(leaveData.type || leaveData.leaveType || "ANNUAL_LEAVE");
    const requestedDays = leaveData.totalDays || calculateLeaveDays(leaveData.startDate, leaveData.endDate);

    // 1. Employee Active check
    let empSnap = await getDoc(doc(db, "employees", employeeId));
    if (!empSnap.exists() && businessId) {
      empSnap = await getDoc(doc(db, `businesses/${businessId}/employees`, employeeId));
    }
    if (empSnap.exists()) {
      const emp = empSnap.data() as Employee;
      if (emp.status === "TERMINATED" || emp.status === "SUSPENDED" || emp.isActive === false) {
        throw new Error("Impossible de créer une demande de congé pour un employé inactif ou résilié.");
      }
    }

    // 2. Period lock check (Check if payroll cycle covering dates is LOCKED or SEALED)
    const cycleQuery = query(
      collection(db, "payroll_cycles"),
      where("business_id", "==", businessId),
      where("status", "in", ["LOCKED", "SEALED", "PAID"])
    );
    const cycleSnap = await getDocs(cycleQuery);
    const lockedCycles = cycleSnap.docs.map(d => d.data() as PayrollCycle);
    const isLocked = lockedCycles.some(c => {
      const cStart = new Date(c.startDate || c.start_date || "");
      const cEnd = new Date(c.endDate || c.end_date || "");
      const rStart = new Date(leaveData.startDate);
      const rEnd = new Date(leaveData.endDate);
      return (rStart <= cEnd && rEnd >= cStart);
    });

    if (isLocked) {
      throw new Error("Période verrouillée : le cycle de paie couvrant ces dates est déjà clôturé/scellé.");
    }

    // 3. Overlap check
    const existingLeaves = await this.getLeavesByEmployee(businessId, employeeId);
    const hasOverlap = existingLeaves.some(l => {
      if (l.status === "CANCELLED" || l.status === "REJECTED" || l.status === "ARCHIVED") return false;
      const s1 = new Date(l.startDate);
      const e1 = new Date(l.endDate);
      const s2 = new Date(leaveData.startDate);
      const e2 = new Date(leaveData.endDate);
      return s1 <= e2 && s2 <= e1;
    });

    if (hasOverlap) {
      throw new Error("Une demande de congé existe déjà sur cette période.");
    }

    // 4. Balance check
    const currentYear = new Date(leaveData.startDate).getFullYear();
    const leaveBal = await this.getLeaveBalance(businessId, employeeId, currentYear);
    const typeBal = leaveBal.balances[mappedType];
    
    if (typeBal) {
      const remaining = typeBal.remainingDays;
      if (requestedDays > remaining) {
        throw new Error(`Solde de congé insuffisant (${remaining} jour(s) disponible(s) pour ${LEAVE_TYPES_CONFIG[mappedType]?.name || mappedType}).`);
      }
    }

    const leaveId = leaveData.id || `lv_${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = new Date().toISOString();

    const newLeave: LeaveRecord = {
      ...leaveData,
      id: leaveId,
      type: mappedType,
      leaveType: mappedType,
      status: leaveData.status || "SUBMITTED",
      totalDays: requestedDays,
      createdAt: timestamp,
      updatedAt: timestamp,
      submittedBy: actor.name
    };

    // Atomic write to `/leave_requests` and `/leaves` SSOT
    await runTransaction(db, async (transaction) => {
      transaction.set(doc(db, "leave_requests", leaveId), newLeave);
      transaction.set(doc(db, "leaves", leaveId), newLeave);
    });

    // Write approval log
    const approvalLog: LeaveApprovalLog = {
      id: `appr_${leaveId}_${Date.now()}`,
      leaveId,
      business_id: businessId,
      employeeId,
      action: "SUBMITTED",
      afterStatus: newLeave.status,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      timestamp
    };
    await setDoc(doc(db, "leave_approvals", approvalLog.id), approvalLog);

    await EmployeeAuditService.logTransition({
      employeeId,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      business_id: businessId,
      action: "INVITATION_UPDATED",
      beforeState: null,
      afterState: { leaveId, type: mappedType, status: newLeave.status },
      severity: "info"
    });

    EventBus.publish(EventBus.createEvent({
      correlationId: `leave_req_${leaveId}`,
      actorId: actor.id,
      businessId,
      module: "LEAVE",
      aggregate: "LEAVE",
      type: "LeaveRequested",
      payload: newLeave
    }));

    return newLeave;
  },

  /**
   * Internal method for the Workflow Engine or Service to apply state change and update balance
   */
  async _applyStatusChange(
    leaveId: string,
    status: "APPROVED" | "REJECTED" | "CANCELLED",
    actor: { id: string; name: string; role: string },
    rejectionReason?: string
  ): Promise<void> {
    const leaveRef1 = doc(db, "leave_requests", leaveId);
    const leaveRef2 = doc(db, "leaves", leaveId);

    await runTransaction(db, async (transaction) => {
      let snap = await transaction.get(leaveRef1);
      if (!snap.exists()) {
        snap = await transaction.get(leaveRef2);
      }
      if (!snap.exists()) throw new Error("Demande de congé introuvable.");

      const beforeState = snap.data() as LeaveRecord;
      const businessId = beforeState.business_id;
      const employeeId = beforeState.employeeId;
      const leaveType = beforeState.type || beforeState.leaveType || "ANNUAL_LEAVE";
      const totalDays = beforeState.totalDays || calculateLeaveDays(beforeState.startDate, beforeState.endDate);
      const year = new Date(beforeState.startDate).getFullYear();

      // CONSTITUTIONAL GOVERNANCE: Separation of duties
      if (status === "APPROVED" || status === "REJECTED") {
        const reqId = beforeState.employeeId;
        if (reqId && actor.id && actor.id !== "SYSTEM" && (reqId === actor.id || reqId === (actor as any).employeeId)) {
          throw new Error("Règle de séparation des pouvoirs : L'employé ne peut pas autoriser ou refuser sa propre demande de congé. L'aval d'un supérieur est obligatoire.");
        }
      }

      const timestamp = new Date().toISOString();
      const updates = {
        status,
        processedBy: actor.name,
        approvedBy: status === "APPROVED" ? actor.name : (beforeState.approvedBy || ""),
        approvedAt: status === "APPROVED" ? timestamp : (beforeState.approvedAt || ""),
        rejectionReason: status === "REJECTED" ? (rejectionReason || "Refusé par la direction") : (beforeState.rejectionReason || ""),
        updatedAt: timestamp
      };

      transaction.update(leaveRef1, updates);
      transaction.update(leaveRef2, updates);

      // Handle atomic balance adjustments
      if (status === "APPROVED" && beforeState.status !== "APPROVED") {
        const balRef = doc(db, "leave_balances", `${businessId}_${employeeId}_${year}`);
        const balSnap = await transaction.get(balRef);
        if (balSnap.exists()) {
          const balData = balSnap.data() as LeaveBalance;
          const currentBal = balData.balances[leaveType];
          if (currentBal) {
            const newUsed = (currentBal.usedDays || 0) + totalDays;
            const newRemaining = Math.max(0, currentBal.entitlementDays - newUsed);
            transaction.update(balRef, {
              [`balances.${leaveType}.usedDays`]: newUsed,
              [`balances.${leaveType}.remainingDays`]: newRemaining,
              updatedAt: timestamp
            });
          }
        }
      } else if ((status === "CANCELLED" || status === "REJECTED") && beforeState.status === "APPROVED") {
        // Refund balance
        const balRef = doc(db, "leave_balances", `${businessId}_${employeeId}_${year}`);
        const balSnap = await transaction.get(balRef);
        if (balSnap.exists()) {
          const balData = balSnap.data() as LeaveBalance;
          const currentBal = balData.balances[leaveType];
          if (currentBal) {
            const newUsed = Math.max(0, (currentBal.usedDays || 0) - totalDays);
            const newRemaining = currentBal.entitlementDays - newUsed;
            transaction.update(balRef, {
              [`balances.${leaveType}.usedDays`]: newUsed,
              [`balances.${leaveType}.remainingDays`]: newRemaining,
              updatedAt: timestamp
            });
          }
        }
      }

      // Write immutable approval log
      const logRef = doc(db, "leave_approvals", `appr_${leaveId}_${Date.now()}`);
      transaction.set(logRef, {
        id: logRef.id,
        leaveId,
        business_id: businessId,
        employeeId,
        action: status,
        beforeStatus: beforeState.status,
        afterStatus: status,
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        rejectionReason: rejectionReason || "",
        timestamp
      });
    });

    const updatedLeave = await this.getLeaveById(leaveId);
    if (updatedLeave) {
      await EmployeeAuditService.logTransition({
        employeeId: updatedLeave.employeeId,
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        business_id: updatedLeave.business_id,
        action: "INVITATION_UPDATED",
        beforeState: { leaveId, status: "SUBMITTED" },
        afterState: { leaveId, status },
        severity: "info"
      });
    }
  },

  /**
   * Evaluates leave request
   */
  async evaluateLeave(params: {
    businessId: string;
    leaveId: string;
    action: "APPROVE" | "REJECT";
    rejectionReason?: string;
    actor: { id: string; name: string; role: string };
  }): Promise<void> {
    const { leaveId, action, rejectionReason, actor } = params;
    const targetStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";
    await this._applyStatusChange(leaveId, targetStatus, actor, rejectionReason);
  },

  /**
   * Cancel or withdraw request
   */
  async cancelLeave(params: {
    businessId: string;
    leaveId: string;
    actor: { id: string; name: string; role: string };
  }): Promise<void> {
    const { leaveId, actor } = params;
    await this._applyStatusChange(leaveId, "CANCELLED", actor);
  }
};
