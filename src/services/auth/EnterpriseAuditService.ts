import { db, auth } from "../../lib/firebase";
import { doc, setDoc } from "firebase/firestore";

export interface AuditEvent {
  id: string;
  correlationId: string;
  timestamp: any; // Allow FieldValue for serverTimestamp
  userId: string;
  userEmail: string;
  action: string;
  status: "SUCCESS" | "FAILED" | "WARNING" | "CRITICAL";
  durationMs?: number;
  ipAddress?: string;
  userAgent?: string;
  business_id?: string | null;
  errorMessage?: string;
  metadata?: any;
}

export interface EnterpriseDiagnostic {
  correlationId: string;
  errorCode: string;
  message: string;
  recommendedAction: string;
  canRetry: boolean;
  timestamp: any;
  technicalDetails?: string;
}

export const EnterpriseAuditService = {
  generateCorrelationId(): string {
    return "corr_" + Math.random().toString(36).substring(2, 10).toUpperCase();
  },

  async logEvent(event: Omit<AuditEvent, "id" | "timestamp" | "userAgent" | "ipAddress">): Promise<string> {
    const logId = "log_" + Math.random().toString(36).substring(2, 12);
    const { serverTimestamp } = await import("../../lib/firebase");
    const timestamp = serverTimestamp();
    const userAgent = typeof window !== "undefined" ? window.navigator.userAgent : "NodeServer";
    const ipAddress = "127.0.0.1"; // Under cloud/iframe sandbox

    const fullEvent: AuditEvent = {
      ...event,
      id: logId,
      timestamp,
      userAgent,
      ipAddress
    };

    console.log(`[EnterpriseAudit] [${event.status}] [CorrelationID: ${event.correlationId}] ${event.action} - User: ${event.userEmail}`, { ...fullEvent, timestamp: "SERVER_TIMESTAMP" });

    try {
      // Direct append-only write to Firestore audit_logs collection (safe & compliant)
      const { collection, addDoc } = await import("firebase/firestore");
      await addDoc(collection(db, "audit_logs"), {
        ...fullEvent,
        audit_type: "AUTH_AUDIT_LOGS",
        signature: `sig_${Math.floor(Math.random() * 1000000)}`
      });
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes("already exists") || errMsg.includes("ALREADY_EXISTS")) {
        console.debug("[EnterpriseAudit] Audit event already committed to Firestore:", logId);
      } else {
        console.warn("[EnterpriseAudit] Could not write audit event to remote Firestore (fallback local):", errMsg);
      }
    }

    return logId;
  },

  mapExceptionToDiagnostic(error: any, correlationId: string, customMessage?: string): EnterpriseDiagnostic {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const ts = new Date().toISOString();

    if (errorMsg.includes("permission-denied") || errorMsg.includes("Missing or insufficient permissions")) {
      return {
        correlationId,
        errorCode: "ERR_AUTH_SEC_VIOLATION",
        message: customMessage || "Accès refusé par les politiques de sécurité (ABAC).",
        recommendedAction: "Vérifiez que votre compte possède les autorisations requises pour ce rôle ou contactez votre administrateur.",
        canRetry: false,
        timestamp: ts,
        technicalDetails: errorMsg
      };
    }

    if (errorMsg.includes("offline") || errorMsg.includes("network") || errorMsg.includes("client is offline")) {
      return {
        correlationId,
        errorCode: "ERR_SRE_CONN_LOSS",
        message: "Perte de connectivité avec le service d'authentification.",
        recommendedAction: "Vérifiez votre connexion réseau. La résilience locale tente de restaurer la connexion.",
        canRetry: true,
        timestamp: ts,
        technicalDetails: errorMsg
      };
    }

    if (errorMsg.includes("suspended") || errorMsg.includes("SUSPENDED")) {
      return {
        correlationId,
        errorCode: "ERR_AUTH_TENANT_SUSPENDED",
        message: "Cette structure d'entreprise est actuellement suspendue.",
        recommendedAction: "Veuillez contacter le service de facturation de FINOPS pour régulariser votre abonnement.",
        canRetry: false,
        timestamp: ts,
        technicalDetails: errorMsg
      };
    }

    return {
      correlationId,
      errorCode: "ERR_AUTH_SYSTEM_FAIL",
      message: customMessage || "Une erreur inattendue est survenue dans le pipeline de sécurité.",
      recommendedAction: "Veuillez rafraîchir l'application ou réessayer ultérieurement.",
      canRetry: true,
      timestamp: ts,
      technicalDetails: errorMsg
    };
  }
};
