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

export interface AbsenceEvent {
  id: string;
  businessId: string;
  employeeId: string;
  employeeName: string;
  date: string;
  type: "UNEXCUSED_ABSENCE" | "CRITICAL_LATE" | "EARLY_LEAVE";
  minutes?: number;
  status: "PENDING_JUSTIFICATION" | "JUSTIFIED" | "REJECTED_JUSTIFICATION";
  justification?: string;
  justifiedBy?: string;
  justifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const AttendanceIntegrationService = {
  /**
   * Safe transaction to log absence or tardiness
   */
  async createAbsenceEvent(params: {
    businessId: string;
    employeeId: string;
    date: string;
    type: "UNEXCUSED_ABSENCE" | "CRITICAL_LATE" | "EARLY_LEAVE";
    minutes?: number;
  }): Promise<AbsenceEvent> {
    const { businessId, employeeId, date, type, minutes } = params;

    // Check active status of the employee
    let empSnap = await getDoc(doc(db, "employees", employeeId));
    if (!empSnap.exists() && businessId) {
      empSnap = await getDoc(doc(db, `businesses/${businessId}/employees`, employeeId));
    }
    const empData = empSnap.exists() ? (empSnap.data() as Employee) : null;
    const employeeName = empData?.name || "Employé";

    // Guard against duplicate event on the same day for same type
    const q = query(
      collection(db, "absence_events"),
      where("businessId", "==", businessId),
      where("employeeId", "==", employeeId),
      where("date", "==", date),
      where("type", "==", type)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs[0].data() as AbsenceEvent;
    }

    const eventId = `abs_${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = new Date().toISOString();

    const newEvent: AbsenceEvent = {
      id: eventId,
      businessId,
      employeeId,
      employeeName,
      date,
      type,
      minutes,
      status: "PENDING_JUSTIFICATION",
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await setDoc(doc(db, "absence_events", eventId), newEvent);

    await WorkforceAuditService.logTransition({
      action: "ABSENCE_CONFIRMED",
      actorId: "system_attendance",
      actorName: "Moteur de Présence",
      actorRole: "SYSTEM",
      employeeId,
      businessId,
      before: null,
      after: newEvent
    });

    return newEvent;
  },

  /**
   * Submit a justification for absence/tardiness (Employee self-service)
   */
  async submitJustification(params: {
    businessId: string;
    eventId: string;
    justification: string;
    actor: { id: string; name: string; role: string };
  }): Promise<void> {
    const { businessId, eventId, justification, actor } = params;
    const ref = doc(db, "absence_events", eventId);

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) {
        throw new Error("Événement d'absence/retard introuvable.");
      }

      const event = snap.data() as AbsenceEvent;
      if (event.status === "JUSTIFIED") {
        throw new Error("Cet événement est déjà justifié.");
      }

      transaction.update(ref, {
        justification,
        updatedAt: new Date().toISOString()
      });
    });

    await WorkforceAuditService.logTransition({
      action: "DELAY_JUSTIFIED",
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      employeeId: actor.id,
      businessId,
      before: { id: eventId, status: "PENDING_JUSTIFICATION" },
      after: { id: eventId, status: "PENDING_JUSTIFICATION", justification }
    });
  },

  /**
   * Process a justification (Approve / Reject)
   */
  async processJustification(params: {
    businessId: string;
    eventId: string;
    action: "APPROVE" | "REJECT";
    actor: { id: string; name: string; role: string };
  }): Promise<void> {
    const { businessId, eventId, action, actor } = params;
    const ref = doc(db, "absence_events", eventId);

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) {
        throw new Error("Événement d'absence/retard introuvable.");
      }

      const event = snap.data() as AbsenceEvent;
      const targetStatus = action === "APPROVE" ? "JUSTIFIED" : "REJECTED_JUSTIFICATION";
      const timestamp = new Date().toISOString();

      transaction.update(ref, {
        status: targetStatus,
        justifiedBy: actor.name,
        justifiedAt: timestamp,
        updatedAt: timestamp
      });
    });

    const finalSnap = await getDoc(ref);
    if (finalSnap.exists()) {
      const updatedEvent = finalSnap.data() as AbsenceEvent;
      await WorkforceAuditService.logTransition({
        action: action === "APPROVE" ? "DELAY_JUSTIFIED" : "ABSENCE_CONFIRMED",
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        employeeId: updatedEvent.employeeId,
        businessId,
        before: { id: eventId, status: "PENDING_JUSTIFICATION" },
        after: updatedEvent
      });
    }
  },

  /**
   * Fetch absence events
   */
  async getAbsenceEvents(businessId: string): Promise<AbsenceEvent[]> {
    const q = query(collection(db, "absence_events"), where("businessId", "==", businessId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as AbsenceEvent);
  }
};
