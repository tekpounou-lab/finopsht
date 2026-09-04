
import { EventBus } from "../runtime/EventBus";
import { RuntimeEngine } from "../runtime/RuntimeEngine";
import { NotificationRepository } from "../../repositories/NotificationRepository";
import { Role } from "../../types";
import { NotificationType, NotificationSeverity } from "../../types/notifications";

export interface NotificationPayload {
  userId?: string;
  businessId: string;
  targetRoles?: Role[];
  type: "INFO" | "SUCCESS" | "WARNING" | "ERROR" | NotificationType;
  severity?: NotificationSeverity;
  title: string;
  message: string;
  actionUrl?: string;
  module: string;
  sourceId?: string;
}

class EnterpriseNotificationEngine {
  private static instance: EnterpriseNotificationEngine;

  private constructor() {}

  public static getInstance(): EnterpriseNotificationEngine {
    if (!EnterpriseNotificationEngine.instance) {
      EnterpriseNotificationEngine.instance = new EnterpriseNotificationEngine();
    }
    return EnterpriseNotificationEngine.instance;
  }

  public async send(payload: NotificationPayload): Promise<void> {
    console.log(`[NotificationEngine] Sending ${payload.type}: ${payload.title} to ${payload.userId || "Business " + payload.businessId}`);

    // Map payload type/severity
    let mappedType: NotificationType = "INFO";
    let mappedSeverity: NotificationSeverity = "INFO";

    if (payload.type === "ERROR" || payload.type === "CRITICAL") {
      mappedType = "CRITICAL";
      mappedSeverity = "CRITICAL";
    } else if (payload.type === "WARNING") {
      mappedType = "ALERT";
      mappedSeverity = "HIGH";
    } else if (payload.type === "FINANCE" || payload.type === "PAYROLL") {
      mappedType = payload.type;
      mappedSeverity = "MEDIUM";
    } else if (payload.type === "HR" || payload.type === "ATTENDANCE" || payload.type === "SECURITY") {
      mappedType = payload.type;
      mappedSeverity = "INFO";
    }

    if (payload.severity) {
      mappedSeverity = payload.severity;
    }

    try {
      if (payload.businessId) {
        await NotificationRepository.create({
          businessId: payload.businessId,
          targetUserId: payload.userId,
          targetRoles: payload.targetRoles,
          type: mappedType,
          severity: mappedSeverity,
          title: payload.title,
          message: payload.message,
          sourceId: payload.sourceId,
          actionUrl: payload.actionUrl,
          metadata: { module: payload.module }
        });
      }
    } catch (err) {
      console.warn("[NotificationEngine] Firestore notification persist warning:", err);
    }
    
    EventBus.publish(EventBus.createEvent({
      correlationId: `notif_${Date.now()}`,
      businessId: payload.businessId,
      module: "NOTIFICATION",
      aggregate: "MESSAGE",
      type: "NotificationSent",
      payload
    }));
  }

  public async broadcastToBusiness(
    businessId: string, 
    title: string, 
    message: string, 
    module: string,
    targetRoles?: Role[]
  ): Promise<void> {
    await this.send({
      businessId,
      type: "INFO",
      title,
      message,
      module,
      targetRoles
    });
  }
}

export const NotificationEngine = EnterpriseNotificationEngine.getInstance();
