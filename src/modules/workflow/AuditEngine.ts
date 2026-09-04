
import { db } from "../../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { EventBus } from "../runtime/EventBus";

export interface AuditLogEntry {
  businessId: string;
  actorId?: string;
  module: string;
  aggregate: string;
  action: string;
  entityId: string;
  beforeState?: any;
  afterState?: any;
  metadata?: any;
  severity: "INFO" | "WARNING" | "CRITICAL";
}

class EnterpriseAuditEngine {
  private static instance: EnterpriseAuditEngine;

  private constructor() {}

  public static getInstance(): EnterpriseAuditEngine {
    if (!EnterpriseAuditEngine.instance) {
      EnterpriseAuditEngine.instance = new EnterpriseAuditEngine();
    }
    return EnterpriseAuditEngine.instance;
  }

  public async log(entry: AuditLogEntry): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(`[AuditEngine] [${entry.severity}] ${entry.module}:${entry.action} on ${entry.entityId}`);

    try {
      await addDoc(collection(db, "enterprise_audit_logs"), {
        ...entry,
        timestamp,
        created_at: serverTimestamp()
      });

      EventBus.publish(EventBus.createEvent({
        correlationId: `audit_${Date.now()}`,
        businessId: entry.businessId,
        module: "AUDIT",
        aggregate: "LOG",
        type: "AuditLogged",
        payload: { action: entry.action, entityId: entry.entityId }
      }));
    } catch (err) {
      console.error("[AuditEngine] Failed to persist audit log:", err);
    }
  }
}

export const AuditEngine = EnterpriseAuditEngine.getInstance();
