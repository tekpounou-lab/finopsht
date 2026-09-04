import { collection, doc, setDoc, serverTimestamp, query, where, getDocs, limit } from "firebase/firestore";
import { db, handleFirestoreError, OperationType, auth } from "../../lib/firebase";
import { computeSHA256Signature } from "../../repositories/ForensicLogRepository";
import { EventBus } from "../../modules/runtime/EventBus";
import { LogSanitizer } from "./LogSanitizer";
import { CSRFService } from "./CSRFService";
import { logger } from "../observability/Logger";

export type SecurityAuditEventType =
  | "TENANT_SWITCH"
  | "DATA_ACCESS"
  | "AUTH_STATE_CHANGE"
  | "IDENTITY_RESOLUTION"
  | "ISOLATION_VIOLATION_BLOCKED"
  | "SESSION_PURGE"
  | "ROLE_ESCALATION_BLOCKED"
  | "COMPANY_REGISTRATION_VERIFIED"
  | "TOKEN_ROTATION";

export interface SecurityAuditLog {
  id: string;
  eventType: SecurityAuditEventType;
  business_id: string;
  previous_business_id?: string | null;
  target_business_id?: string | null;
  actor_uid: string;
  actor_email?: string | null;
  actor_role?: string | null;
  collection_name?: string;
  operation_type?: string;
  status: "SUCCESS" | "BLOCKED" | "WARNING" | "AUDIT_OK";
  reason?: string;
  details?: Record<string, any>;
  signature: string;
  timestamp: string;
  client_session_id?: string;
  _server_timestamp?: any;
}

export class SecurityAuditLogger {
  private static readonly COLLECTION = "security_audit_logs";
  private static readonly MAX_MEM_LOGS = 100;
  private static recentLogs: SecurityAuditLog[] = [];

  /**
   * Records a security audit log to Firestore with a SHA-256 cryptographic seal
   * and strict PII data masking.
   */
  static async log(params: {
    eventType: SecurityAuditEventType;
    business_id?: string | null;
    previous_business_id?: string | null;
    target_business_id?: string | null;
    actor_uid?: string | null;
    actor_email?: string | null;
    actor_role?: string | null;
    collection_name?: string;
    operation_type?: string;
    status?: "SUCCESS" | "BLOCKED" | "WARNING" | "AUDIT_OK";
    reason?: string;
    details?: Record<string, any>;
  }): Promise<SecurityAuditLog> {
    const timestamp = new Date().toISOString();
    const logId = `saudit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const effectiveBizId = params.business_id || params.target_business_id || "GLOBAL";
    const effectiveUid = params.actor_uid || auth.currentUser?.uid || "ANONYMOUS";
    const effectiveEmail = params.actor_email || auth.currentUser?.email || null;
    const effectiveStatus = params.status || "SUCCESS";

    // Sanitize any PII inside reason and details before signing and saving
    const sanitizedReason = params.reason ? LogSanitizer.sanitizeString(params.reason) : undefined;
    const sanitizedDetails = params.details ? LogSanitizer.sanitizePayload(params.details) : {};
    const maskedEmail = effectiveEmail ? LogSanitizer.maskEmail(effectiveEmail) : null;
    const clientSessionId = CSRFService.getSessionId();

    const signaturePayload = {
      id: logId,
      eventType: params.eventType,
      business_id: effectiveBizId,
      previous_business_id: params.previous_business_id || null,
      target_business_id: params.target_business_id || null,
      actor_uid: effectiveUid,
      timestamp,
      status: effectiveStatus,
      collection: params.collection_name || "N/A",
      details: sanitizedDetails
    };

    const signature = await computeSHA256Signature(signaturePayload);

    const logEntry: SecurityAuditLog = {
      id: logId,
      eventType: params.eventType,
      business_id: effectiveBizId,
      previous_business_id: params.previous_business_id || null,
      target_business_id: params.target_business_id || null,
      actor_uid: effectiveUid,
      actor_email: maskedEmail,
      actor_role: params.actor_role || null,
      collection_name: params.collection_name,
      operation_type: params.operation_type,
      status: effectiveStatus,
      reason: sanitizedReason,
      details: sanitizedDetails,
      signature,
      timestamp,
      client_session_id: clientSessionId
    };

    // Buffer in memory for instant local diagnostics
    this.recentLogs.unshift(logEntry);
    if (this.recentLogs.length > this.MAX_MEM_LOGS) {
      this.recentLogs.pop();
    }

    logger.security(params.eventType, {
      id: logId,
      business_id: effectiveBizId,
      actor: LogSanitizer.maskUid(effectiveUid),
      status: effectiveStatus,
      reason: sanitizedReason
    });

    // Publish event locally for real-time security consoles
    try {
      EventBus.publish(
        EventBus.createEvent({
          correlationId: `saudit_${logId}`,
          businessId: effectiveBizId,
          module: "SECURITY",
          aggregate: "AUDIT_LOG",
          type: "SecurityAuditLogged",
          payload: logEntry
        })
      );
    } catch (_) {}

    // Asynchronously write to Firestore
    try {
      const logRef = doc(db, this.COLLECTION, logId);
      await setDoc(logRef, {
        ...logEntry,
        _server_timestamp: serverTimestamp()
      });
    } catch (err: any) {
      // Non-blocking fallback if offline or write deferred
      if (auth.currentUser) {
        logger.warn(`[SecurityAuditLogger] Firestore log deferred (${params.eventType}):`, err?.message || err);
      }
    }

    return logEntry;
  }

  /**
   * Helper: Logs a tenant-switching event
   */
  static async logTenantSwitch(params: {
    fromTenantId?: string | null;
    toTenantId?: string | null;
    actorUid?: string | null;
    actorEmail?: string | null;
    actorRole?: string | null;
    status?: "SUCCESS" | "BLOCKED" | "WARNING";
    reason?: string;
    details?: Record<string, any>;
  }): Promise<SecurityAuditLog> {
    logger.info(
      `[SecurityAudit] Tenant Switch: ${LogSanitizer.maskBusinessId(params.fromTenantId)} ➔ ${LogSanitizer.maskBusinessId(params.toTenantId)} (Status: ${params.status || "SUCCESS"}, UID: ${LogSanitizer.maskUid(params.actorUid)})`
    );

    return this.log({
      eventType: "TENANT_SWITCH",
      business_id: params.toTenantId || params.fromTenantId || "GLOBAL",
      previous_business_id: params.fromTenantId,
      target_business_id: params.toTenantId,
      actor_uid: params.actorUid,
      actor_email: params.actorEmail,
      actor_role: params.actorRole,
      status: params.status || "SUCCESS",
      reason: params.reason || `Tenant switch ${LogSanitizer.maskBusinessId(params.fromTenantId)} -> ${LogSanitizer.maskBusinessId(params.toTenantId)}`,
      details: {
        ...params.details,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "SSR",
        session_id: CSRFService.getSessionId()
      }
    });
  }

  /**
   * Helper: Logs a data access query verification
   */
  static async logDataAccess(params: {
    businessId: string;
    collectionName: string;
    operationType: "LIST" | "GET" | "SUBSCRIBE" | "WRITE" | "DELETE";
    recordCount?: number;
    enforcedTenantId: string;
    status?: "SUCCESS" | "BLOCKED" | "WARNING" | "AUDIT_OK";
    details?: Record<string, any>;
  }): Promise<SecurityAuditLog> {
    const isMismatch = params.businessId !== params.enforcedTenantId;
    const status = params.status || (isMismatch ? "BLOCKED" : "AUDIT_OK");

    return this.log({
      eventType: isMismatch ? "ISOLATION_VIOLATION_BLOCKED" : "DATA_ACCESS",
      business_id: params.enforcedTenantId,
      collection_name: params.collectionName,
      operation_type: params.operationType,
      status,
      reason: isMismatch
        ? `Tenant boundary mismatch: requested ${LogSanitizer.maskBusinessId(params.businessId)} vs enforced ${LogSanitizer.maskBusinessId(params.enforcedTenantId)}`
        : `Authorized query on ${params.collectionName}`,
      details: {
        recordCount: params.recordCount,
        ...params.details
      }
    });
  }

  /**
   * Helper: Logs an auth state change / session purge
   */
  static async logAuthStateChange(params: {
    action: "LOGIN" | "LOGOUT" | "SESSION_PURGE" | "IDENTITY_REFRESH";
    actorUid?: string | null;
    actorEmail?: string | null;
    details?: Record<string, any>;
  }): Promise<SecurityAuditLog> {
    return this.log({
      eventType: params.action === "SESSION_PURGE" ? "SESSION_PURGE" : "AUTH_STATE_CHANGE",
      business_id: "GLOBAL",
      actor_uid: params.actorUid,
      actor_email: params.actorEmail,
      status: "SUCCESS",
      reason: `Auth state event: ${params.action}`,
      details: params.details
    });
  }

  /**
   * Queries security audit logs for a specific business or globally
   */
  static async listLogs(businessId?: string, limitCount = 50): Promise<SecurityAuditLog[]> {
    try {
      const colRef = collection(db, this.COLLECTION);
      let q;
      if (businessId && businessId !== "ALL" && businessId !== "GLOBAL") {
        q = query(colRef, where("business_id", "==", businessId), limit(limitCount));
      } else {
        q = query(colRef, limit(limitCount));
      }

      const snap = await getDocs(q);
      const logs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as SecurityAuditLog));
      return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, this.COLLECTION);
      return this.recentLogs.filter((l) => !businessId || businessId === "ALL" || l.business_id === businessId);
    }
  }

  /**
   * Retrieves recent in-memory logs for zero-latency UI inspection
   */
  static getRecentLogs(businessId?: string): SecurityAuditLog[] {
    if (!businessId || businessId === "ALL") return [...this.recentLogs];
    return this.recentLogs.filter((l) => l.business_id === businessId || l.business_id === "GLOBAL");
  }
}
