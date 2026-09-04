
import { RuntimeState, RuntimeStatus, ModuleRegistration } from "./types";
import { EventBus } from "./EventBus";
import { SynchronizationEngine } from "./SynchronizationEngine";
import { WorkflowEngine } from "../workflow/WorkflowEngine";
import { JobEngine } from "./JobEngine";
import { ObservabilityPlatform } from "./ObservabilityPlatform";
import { MonitoringService } from "../admin/MonitoringService";
import { MessageQueue } from "./EnterpriseMessageQueue";
import { SnapshotRetention } from "../../services/business/snapshot/SnapshotRetentionManager";
import { SnapshotRebuildService } from "../../services/SnapshotRebuildService";

class EnterpriseRuntimeEngine {
  private static instance: EnterpriseRuntimeEngine;
  private state: RuntimeState;
  private modules: Map<string, ModuleRegistration> = new Map();
  private heartbeatInterval: any;
  private isInitialized = false;

  private constructor() {
    this.state = {
      status: "BOOT",
      bootTime: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      activeModules: [],
      errors: []
    };
  }

  public static getInstance(): EnterpriseRuntimeEngine {
    if (!EnterpriseRuntimeEngine.instance) {
      EnterpriseRuntimeEngine.instance = new EnterpriseRuntimeEngine();
    }
    return EnterpriseRuntimeEngine.instance;
  }

  public async bootstrap(): Promise<void> {
    if (this.isInitialized) {
      console.warn("[RuntimeEngine] Already initialized. Skipping duplicate bootstrap.");
      return;
    }
    
    try {
      this.isInitialized = true;
      this.transitionTo("INITIALIZING");
      console.log("[RuntimeEngine] Enterprise Runtime Booting...");

      // Register Core Modules
      this.registerModule({
        name: "SYNC_ENGINE",
        version: "1.0.0",
        onShutdown: async () => SynchronizationEngine.stopSync()
      });

      this.registerModule({
        name: "SNAPSHOT_REBUILD_ENGINE",
        version: "1.0.0",
        onInitialize: async () => SnapshotRebuildService.startListener()
      });

      this.registerModule({
        name: "WORKFLOW_ENGINE",
        version: "1.0.0",
        onInitialize: async () => WorkflowEngine.start(),
        onShutdown: async () => WorkflowEngine.shutdown()
      });

      this.registerModule({
        name: "JOB_ENGINE",
        version: "1.0.0",
        onInitialize: async () => JobEngine.start(),
        onShutdown: async () => JobEngine.shutdown()
      });

      this.registerModule({
        name: "OBSERVABILITY",
        version: "1.0.0",
        onInitialize: async () => ObservabilityPlatform.start()
      });

      this.registerModule({
        name: "MONITORING",
        version: "1.0.0",
        onInitialize: async () => MonitoringService.start()
      });

      // GC and Snapshot Retention Daemons are dynamically started by BusinessContext once the tenant is resolved.


      // Initialize Registered Modules
      for (const [name, module] of this.modules) {
        if (module.onInitialize) {
          console.log(`[RuntimeEngine] Initializing Module: ${name}`);
          await module.onInitialize();
        }
      }

      // Start Heartbeat
      this.startHeartbeat();

      this.transitionTo("REGISTERING_MODULES");
      
      this.transitionTo("READY");
      this.transitionTo("RUNNING");

      EventBus.publish(EventBus.createEvent({
        correlationId: "system_boot",
        module: "RUNTIME",
        aggregate: "SYSTEM",
        type: "RuntimeStarted",
        payload: { bootTime: this.state.bootTime }
      }));

    } catch (err: any) {
      console.error("[RuntimeEngine] Bootstrap failed:", err);
      this.reportError("CRITICAL", `Bootstrap failed: ${err.message}`, "RUNTIME");
      this.transitionTo("DEGRADED");
    }
  }

  public registerModule(module: ModuleRegistration): void {
    this.modules.set(module.name, module);
    this.state.activeModules.push(module.name);
    console.log(`[RuntimeEngine] Module Registered: ${module.name} v${module.version}`);
    
    EventBus.publish(EventBus.createEvent({
      correlationId: "system_reg",
      module: "RUNTIME",
      aggregate: "MODULE",
      type: "ModuleLoaded",
      payload: { moduleName: module.name, version: module.version }
    }));
  }

  private transitionTo(status: RuntimeStatus): void {
    const oldStatus = this.state.status;
    console.log(`[RuntimeEngine] Transition: ${oldStatus} -> ${status}`);
    this.state.status = status;
    
    EventBus.publish(EventBus.createEvent({
      correlationId: "lifecycle",
      module: "RUNTIME",
      aggregate: "LIFECYCLE",
      type: "RuntimeStatusChanged",
      payload: { oldStatus, newStatus: status }
    }));
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    
    this.heartbeatInterval = setInterval(() => {
      this.state.lastHeartbeat = new Date().toISOString();
      EventBus.publish(EventBus.createEvent({
        correlationId: "heartbeat",
        module: "RUNTIME",
        aggregate: "HEALTH",
        type: "Heartbeat",
        payload: { timestamp: this.state.lastHeartbeat }
      }));
    }, 30000); // 30s heartbeat
  }

  public reportError(severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", message: string, module?: string): void {
    console.error(`[RuntimeEngine] [${severity}] ${module ? `[${module}] ` : ""}${message}`);
    this.state.errors.push({ timestamp: new Date().toISOString(), message, module });
    
    EventBus.publish(EventBus.createEvent({
      correlationId: "error",
      module: module || "RUNTIME",
      aggregate: "ERROR",
      type: "RuntimeError",
      payload: { severity, message }
    }));
  }

  public getState(): RuntimeState {
    return { ...this.state };
  }

  public async shutdown(): Promise<void> {
    this.transitionTo("SHUTDOWN");
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    console.log("[RuntimeEngine] Enterprise Runtime Shutdown.");
  }
}

export const RuntimeEngine = EnterpriseRuntimeEngine.getInstance();
