import { getAdminFirestore } from "../../lib/firebaseAdmin";
import { EventBus } from "../../modules/runtime/EventBus";
import { AICFOAuditLog } from "./AICFOGovernanceTypes";

/**
 * Server-only AI CFO Audit Service using Firebase Admin SDK.
 * Strictly isolated from browser Firebase SDK (firebase/firestore, src/lib/firebase).
 */
export class AICFOServerAuditService {
  /**
   * Log an AI CFO Query & Security Audit entry into Firestore (Admin SDK) and runtime EventBus.
   * Non-blocking on Firestore write failure so AI / heuristic responses are never corrupted.
   */
  public static async logAudit(
    auditEntry: Omit<AICFOAuditLog, "id" | "timestamp">,
    adminDb?: any
  ): Promise<string> {
    const logId = `cfo_audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = new Date().toISOString();

    const fullEntry: AICFOAuditLog = {
      id: logId,
      timestamp,
      ...auditEntry
    };

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
      console.warn("[AICFOServerAuditService] EventBus publish warning:", e);
    }

    try {
      const db = adminDb || getAdminFirestore();
      const coll = db.collection("ai_cfo_audit_logs");
      if (typeof coll?.doc === "function") {
        await coll.doc(logId).set(fullEntry);
      } else if (typeof coll?.add === "function") {
        await coll.add(fullEntry);
      }
    } catch (e: any) {
      console.warn(
        "[AICFOServerAuditService] Admin Firestore audit save warning (non-blocking):",
        e?.message || e
      );
    }

    return logId;
  }
}
