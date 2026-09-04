
import { EventBus } from "../runtime/EventBus";
import { AdminRepository } from "./AdminRepository";
import { ModuleHealth, HealthStatus } from "./types";

export class MonitoringService {
  private static instance: MonitoringService;
  private metrics = {
    eventsProcessed: 0,
    errorsCaught: 0,
    lastEventTime: Date.now()
  };

  public static async start(): Promise<void> {
    console.log("[MonitoringService] Enterprise Monitoring Starting...");
    
    // Subscribe to all events to track system health
    EventBus.subscribe("*", async (event) => {
      this.getInstance().processEvent(event);
    });

    // Start periodic health reporting
    this.getInstance().startReporting();
  }

  private static getInstance(): MonitoringService {
    if (!this.instance) this.instance = new MonitoringService();
    return this.instance;
  }

  private processEvent(event: any) {
    this.metrics.eventsProcessed++;
    this.metrics.lastEventTime = Date.now();

    if (event.type === "RuntimeError") {
      this.metrics.errorsCaught++;
      this.handleSystemError(event);
    }
  }

  private async handleSystemError(event: any) {
    const { severity, message } = event.payload;
    if (severity === "CRITICAL" || severity === "HIGH") {
      // Auto-create incident for critical errors
      await AdminRepository.createIncident({
        id: `inc_${Math.random().toString(36).substring(2, 11)}`,
        businessId: event.businessId || "SYSTEM",
        module: event.module,
        severity,
        priority: severity === "CRITICAL" ? "P0" : "P1",
        status: "OPEN",
        title: `Automatic Incident: ${message.substring(0, 50)}...`,
        description: message,
        timeline: [{ timestamp: new Date().toISOString(), message: "Incident auto-created by MonitoringService", type: "SYSTEM" }],
        affectedModules: [event.module],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }

  private startReporting() {
    setInterval(async () => {
      const health: ModuleHealth = {
        name: "MONITORING_SERVICE",
        status: this.metrics.errorsCaught > 0 ? "YELLOW" : "GREEN",
        lastUpdate: new Date().toISOString(),
        metrics: { ...this.metrics }
      };
      await AdminRepository.reportHealth(health);
    }, 60000); // Report every minute
  }
}
