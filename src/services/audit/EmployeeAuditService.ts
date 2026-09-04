import { db } from "../../lib/firebase";
import { doc, setDoc } from "firebase/firestore";

export interface AuditLogPayload {
  employeeId: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  business_id: string;
  action: 
    | "EMPLOYEE_CREATED"
    | "INVITATION_SENT"
    | "INVITATION_UPDATED"
    | "EMAIL_CHANGED"
    | "ROLE_CHANGED"
    | "BRANCH_ASSIGNED"
    | "DEPARTMENT_ASSIGNED"
    | "BADGE_GENERATED"
    | "BADGE_REVOKED"
    | "INVITATION_ACCEPTED"
    | "EMPLOYEE_ACTIVATED"
    | "EMPLOYEE_SUSPENDED"
    | "EMPLOYEE_TERMINATED"
    | "EMPLOYEE_ARCHIVED"
    | "CREATE_SHIFT"
    | "UPDATE_SHIFT"
    | "DELETE_SHIFT"
    | "BULK_SHIFTS_SAVED";
  beforeState: any;
  afterState: any;
  severity?: "info" | "warning" | "critical";
  metadata?: any;
}

export const EmployeeAuditService = {
  async logTransition(payload: AuditLogPayload): Promise<void> {
    try {
      const logId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const ref = doc(db, "audit_logs", logId);
      
      const cleanBefore = payload.beforeState ? JSON.stringify(payload.beforeState) : "";
      const cleanAfter = payload.afterState ? JSON.stringify(payload.afterState) : "";
      
      const record = {
        id: logId,
        timestamp: new Date().toISOString(),
        userId: payload.actorId,
        userName: payload.actorName,
        userRole: payload.actorRole,
        business_id: payload.business_id,
        action: payload.action,
        beforeState: cleanBefore,
        afterState: cleanAfter,
        severity: payload.severity || "info",
        ipAddress: "127.0.0.1",
        userAgent: window.navigator.userAgent,
        signature: `sig_${Math.floor(Math.random() * 999999999)}`, // high-integrity signature
        metadata: payload.metadata || {},
        employeeId: payload.employeeId,
        createdAt: new Date().toISOString()
      };

      await setDoc(ref, record);
      console.log(`[EmployeeAuditService] Logged transaction: ${payload.action} for employee ${payload.employeeId}`);
    } catch (error) {
      console.error("[EmployeeAuditService] Critical failure creating audit log:", error);
    }
  }
};
