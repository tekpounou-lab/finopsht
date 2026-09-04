
import { EventBus } from "./EventBus";
import { FinopsEvent } from "../../types/events";

class EnterpriseObservabilityPlatform {
  private static instance: EnterpriseObservabilityPlatform;
  private logs: FinopsEvent[] = [];
  private readonly MAX_LOGS = 5000;

  private constructor() {}

  public static getInstance(): EnterpriseObservabilityPlatform {
    if (!EnterpriseObservabilityPlatform.instance) {
      EnterpriseObservabilityPlatform.instance = new EnterpriseObservabilityPlatform();
    }
    return EnterpriseObservabilityPlatform.instance;
  }

  public start(): void {
    console.log("[Observability] Monitoring Runtime Events...");
    
    // Subscribe to all events
    EventBus.subscribe("*", (event) => {
      this.logs.push({ ...event });
      if (this.logs.length > this.MAX_LOGS) {
        this.logs.shift();
      }

      // In a real environment, we would flush critical logs to Firestore or a logging service
      if (event.type === "RuntimeError" || event.aggregate === "ERROR") {
        this.persistCriticalLog(event);
      }
    });
  }

  private persistCriticalLog(event: FinopsEvent): void {
    // Strategy: Only persist HIGH/CRITICAL errors to avoid Firestore noise
    console.warn(`[Observability] Persisting Critical Event: ${event.type}`, event.payload);
  }

  public getTrace(correlationId: string): FinopsEvent[] {
    return this.logs.filter(l => l.correlationId === correlationId);
  }

  public getLogsByModule(module: string): FinopsEvent[] {
    return this.logs.filter(l => l.module === module);
  }

  public getAllLogs(): FinopsEvent[] {
    return [...this.logs];
  }
}

export const ObservabilityPlatform = EnterpriseObservabilityPlatform.getInstance();
