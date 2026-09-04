import { db } from "../../lib/firebase";
import { collection, addDoc } from "firebase/firestore";
import { EventBus } from "../../modules/runtime/EventBus";
import { AICFOAuditLog } from "./AICFOGovernanceTypes";

export class AICFOAuditService {
  /**
   * Log an AI CFO Query & Security Audit entry into Firestore and runtime EventBus.
   */
  public static async logAudit(auditEntry: Omit<AICFOAuditLog, "id" | "timestamp">): Promise<string> {
    const logId = `cfo_audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = new Date().toISOString();

    const fullEntry: AICFOAuditLog = {
      id: logId,
      timestamp,
      ...auditEntry
    };

    // 1. Emit to Runtime EventBus for real-time observability
    try {
      EventBus.publish(
        EventBus.createEvent({
          type: "AI_CFO_AUDIT_LOGGED",
          correlationId: logId,
          businessId: auditEntry.business_id,
          module: "AI_CFO_GOVERNANCE",
          aggregate: "AI_CFO",
          payload: fullEntry,
          metadata: {
            severity: auditEntry.permission_result === "DENIED" ? "HIGH" : "INFO"
          }
        })
      );
    } catch (e) {
      console.warn("[AICFOAuditService] EventBus publish error:", e);
    }

    // 2. Persist to Firestore ai_cfo_audit_logs collection (only in browser environment)
    try {
      if (typeof window !== "undefined" && db) {
        await addDoc(collection(db, "ai_cfo_audit_logs"), fullEntry);
      }
    } catch (e) {
      console.warn("[AICFOAuditService] Firestore audit save error (non-blocking fallback):", e);
    }

    return logId;
  }
}
