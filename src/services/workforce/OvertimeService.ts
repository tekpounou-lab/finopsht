import { db } from "../../lib/firebase";
import { 
  doc, 
  getDoc, 
  setDoc, 
  getDocs, 
  collection, 
  query, 
  where, 
  runTransaction 
} from "firebase/firestore";
import { Employee } from "../../types";
import { WorkforceAuditService } from "./WorkforceAuditService";

export interface OvertimeRequest {
  id: string;
  requestId: string;
  business_id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
  totalHours: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export const OvertimeService = {
  /**
   * Request overtime hours (Employee self-service)
   */
  async requestOvertime(params: {
    businessId: string;
    employeeId: string;
    date: string;
    startTime: string;
    endTime: string;
    reason: string;
    actor: { id: string; name: string; role: string };
  }): Promise<OvertimeRequest> {
    const { businessId, employeeId, date, startTime, endTime, reason, actor } = params;

    // Check active status of the employee
    let empSnap = await getDoc(doc(db, "employees", employeeId));
    if (!empSnap.exists() && businessId) {
      empSnap = await getDoc(doc(db, `businesses/${businessId}/employees`, employeeId));
    }
    let empName = actor.name || "Employé";
    if (empSnap.exists()) {
      const employee = empSnap.data() as Employee;
      empName = employee.name || empName;
      const isEmpActive = employee.status === "ACTIVE" || employee.isActive === true || employee.status === undefined;
      if (employee.status && !isEmpActive) {
        throw new Error("Action interdite : cet employé est inactif.");
      }
    }

    // Calculate total hours
    const startStr = `${date}T${startTime}:00`;
    const endStr = `${date}T${endTime}:00`;
    const start = new Date(startStr);
    const end = new Date(endStr);
    let diffMs = end.getTime() - start.getTime();
    if (diffMs < 0) {
      // If end time is past midnight
      const nextDay = new Date(new Date(date).getTime() + 86400000).toISOString().split('T')[0];
      const endStrNextDay = `${nextDay}T${endTime}:00`;
      diffMs = new Date(endStrNextDay).getTime() - start.getTime();
    }
    const totalHours = Number((diffMs / 3600000).toFixed(2));
    if (isNaN(totalHours) || totalHours <= 0) {
      throw new Error("L'heure de fin doit être postérieure à l'heure de début.");
    }

    const requestId = `ot_${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = new Date().toISOString();

    const otRequest: OvertimeRequest = {
      id: requestId,
      requestId,
      business_id: businessId,
      employeeId,
      employeeName: empName,
      date,
      startTime,
      endTime,
      totalHours,
      reason,
      status: "PENDING",
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await setDoc(doc(db, "overtime_requests", requestId), otRequest);

    await WorkforceAuditService.logTransition({
      action: "OVERTIME_REQUESTED",
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      employeeId,
      businessId,
      before: null,
      after: otRequest
    });

    return otRequest;
  },

  /**
   * Evaluate overtime request (APPROVED or REJECTED)
   */
  async evaluateOvertime(params: {
    businessId: string;
    requestId: string;
    action: "APPROVE" | "REJECT";
    rejectionReason?: string;
    actor: { id: string; name: string; role: string };
  }): Promise<void> {
    const { businessId, requestId, action, rejectionReason, actor } = params;
    const otRef = doc(db, "overtime_requests", requestId);

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(otRef);
      if (!snap.exists()) {
        throw new Error("Demande d'heures supplémentaires introuvable.");
      }

      const request = snap.data() as OvertimeRequest;
      if (request.status !== "PENDING") {
        throw new Error(`La demande est déjà traitée (${request.status}).`);
      }

      const timestamp = new Date().toISOString();
      const targetStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";

      const updates: Partial<OvertimeRequest> = {
        status: targetStatus,
        updatedAt: timestamp,
        approvedBy: actor.name,
        approvedAt: targetStatus === "APPROVED" ? timestamp : undefined,
        rejectionReason: targetStatus === "REJECTED" ? (rejectionReason || "Refusé par le manager") : undefined
      };

      transaction.update(otRef, updates);
    });

    const finalSnap = await getDoc(otRef);
    if (finalSnap.exists()) {
      const updatedOt = finalSnap.data() as OvertimeRequest;
      await WorkforceAuditService.logTransition({
        action: action === "APPROVE" ? "OVERTIME_APPROVED" : "OVERTIME_REJECTED",
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        employeeId: updatedOt.employeeId,
        businessId,
        before: { id: requestId, status: "PENDING" },
        after: updatedOt
      });
    }
  },

  /**
   * Get list of overtime requests
   */
  async getOvertimeRequests(businessId: string): Promise<OvertimeRequest[]> {
    const q = query(collection(db, "overtime_requests"), where("business_id", "==", businessId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as OvertimeRequest);
  }
};
