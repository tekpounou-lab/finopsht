
import { EventBus } from "../runtime/EventBus";
import { AdminRepository, isValidHealthTenantId } from "./AdminRepository";
import { ModuleHealth } from "./types";

export class MonitoringService {
  private static instance: MonitoringService;
  private currentBusinessId: string | null = null;
  private isPlatformMode: boolean = false;
  private reportingInterval: any = null;
  private eventUnsubscribe: (() => void) | null = null;
  private metrics = {
    eventsProcessed: 0,
    errorsCaught: 0,
    lastEventTime: Date.now()
  };

  public static async start(): Promise<void> {
    const inst = this.getInstance();
    console.log("[MonitoringService] Enterprise Monitoring Starting...");

    // Subscribe once to all events to track system health
    if (!inst.eventUnsubscribe) {
      inst.eventUnsubscribe = EventBus.subscribe("*", async (event) => {
        inst.processEvent(event);
      });
    }

    // Start periodic health reporting
    inst.startReporting();
  }

  public static setBusinessId(businessId: string | null): void {
    const inst = this.getInstance();
    inst.currentBusinessId = isValidHealthTenantId(businessId) ? String(businessId).trim() : null;
  }

  public static setBusinessContext(businessId: string | null, options?: { isSuperAdmin?: boolean }): void {
    const inst = this.getInstance();
    inst.currentBusinessId = isValidHealthTenantId(businessId) ? String(businessId).trim() : null;
    inst.isPlatformMode = Boolean(options?.isSuperAdmin);
  }

  public static stop(): void {
    const inst = this.getInstance();
    if (inst.reportingInterval) {
      clearInterval(inst.reportingInterval);
      inst.reportingInterval = null;
    }
    if (inst.eventUnsubscribe) {
      inst.eventUnsubscribe();
      inst.eventUnsubscribe = null;
    }
    inst.currentBusinessId = null;
    inst.isPlatformMode = false;
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
    const { severity, message } = event.payload || {};
    const scopedBusinessId = isValidHealthTenantId(event.businessId)
      ? String(event.businessId).trim()
      : this.currentBusinessId;

    if (!scopedBusinessId) {
      return;
    }

    if (severity === "CRITICAL" || severity === "HIGH") {
      // Auto-create incident for critical errors
      await AdminRepository.createIncident({
        id: `inc_${Math.random().toString(36).substring(2, 11)}`,
        businessId: scopedBusinessId,
        module: event.module,
        severity,
        priority: severity === "CRITICAL" ? "P0" : "P1",
        status: "OPEN",
        title: `Automatic Incident: ${String(message || "RuntimeError").substring(0, 50)}...`,
        description: String(message || "Unknown runtime error"),
        timeline: [{ timestamp: new Date().toISOString(), message: "Incident auto-created by MonitoringService", type: "SYSTEM" }],
        affectedModules: [event.module],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }

  public async reportCurrentHealth(): Promise<void> {
    if (!this.currentBusinessId && !this.isPlatformMode) {
      return;
    }
    const health: ModuleHealth = {
      name: "MONITORING_SERVICE",
      businessId: this.currentBusinessId || undefined,
      isPlatformMonitor: this.isPlatformMode && !this.currentBusinessId,
      status: this.metrics.errorsCaught > 0 ? "YELLOW" : "GREEN",
      lastUpdate: new Date().toISOString(),
      metrics: { ...this.metrics }
    };
    await AdminRepository.reportHealth(health);
  }

  private startReporting() {
    if (this.reportingInterval) {
      clearInterval(this.reportingInterval);
      this.reportingInterval = null;
    }
    this.reportingInterval = setInterval(async () => {
      try {
        await this.reportCurrentHealth();
      } catch {
        // Prevent background interval error from bubbling up
      }
    }, 60000); // Report every minute
  }
}
