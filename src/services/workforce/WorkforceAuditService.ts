import { db } from "../../lib/firebase";
import { doc, setDoc } from "firebase/firestore";

export interface WorkforceAuditPayload {
  action: 
    | "LEAVE_CREATED" 
    | "LEAVE_APPROVED" 
    | "LEAVE_REJECTED" 
    | "LEAVE_CANCELLED"
    | "OVERTIME_REQUESTED"
    | "OVERTIME_APPROVED"
    | "OVERTIME_REJECTED"
    | "ABSENCE_CONFIRMED"
    | "DELAY_JUSTIFIED";
  actorId: string;
  actorName: string;
  actorRole: string;
  employeeId: string;
  businessId: string;
  before: any;
  after: any;
  metadata?: any;
}

export const WorkforceAuditService = {
  async logTransition(payload: WorkforceAuditPayload): Promise<void> {
    try {
      const logId = `wf_audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const ref = doc(db, "audit_logs", logId);
      
      const record = {
        id: logId,
        timestamp: new Date().toISOString(),
        userId: payload.actorId,
        userName: payload.actorName,
        userRole: payload.actorRole,
        business_id: payload.businessId,
        action: payload.action,
        employeeId: payload.employeeId,
        beforeState: payload.before ? JSON.stringify(payload.before) : "",
        afterState: payload.after ? JSON.stringify(payload.after) : "",
        severity: payload.action.includes("REJECTED") || payload.action.includes("ABSENCE") ? "warning" : "info",
        ipAddress: "127.0.0.1",
        userAgent: window.navigator?.userAgent || "Server-side Engine",
        signature: `sig_wf_${Math.floor(Math.random() * 999999999)}`,
        metadata: payload.metadata || {},
        createdAt: new Date().toISOString()
      };

      await setDoc(ref, record);
      
      // Also emit an ERPEvent to trigger UI notifications for managers/owners
      try {
        const eventId = `ev_${payload.action.toLowerCase()}_${Date.now()}`;
        const eventRef = doc(db, "events", eventId);
        await setDoc(eventRef, {
          id: eventId,
          timestamp: new Date().toISOString(),
          type: payload.action.includes("LEAVE") || payload.action.includes("ABSENCE") ? "HR" : "ATTENDANCE",
          business_id: payload.businessId,
          payload: {
            action: payload.action,
            actorId: payload.actorId,
            actorName: payload.actorName,
            employeeId: payload.employeeId,
            details: payload.after ? (typeof payload.after === 'string' ? JSON.parse(payload.after) : payload.after) : {}
          },
          status: "PROCESSED",
          retryCount: 0
        });
      } catch (evErr) {
        console.warn("[WorkforceAuditService] Failed to emit ERPEvent:", evErr);
      }

      console.log(`[WorkforceAuditService] Logged wf event: ${payload.action} for employee ${payload.employeeId}`);
    } catch (error) {
      console.error("[WorkforceAuditService] Critical failure creating audit log:", error);
    }
  }
};
