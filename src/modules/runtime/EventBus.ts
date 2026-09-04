
import { RuntimeEvent, EventCallback, FinopsEvent, FinopsEventCallback } from "./types";

class EnterpriseEventBus {
  private static instance: EnterpriseEventBus;
  private subscribers: Map<string, Set<FinopsEventCallback<any>>> = new Map();
  private history: FinopsEvent[] = [];
  private recentEventSignatures: Map<string, number> = new Map();
  private eventHistory: Map<string, { timestamp: number; payloadChecksum: string }> = new Map();
  private readonly MAX_HISTORY = 1000;
  private readonly DEDUP_WINDOW_MS = 1500;

  private constructor() {}

  public static getInstance(): EnterpriseEventBus {
    if (!EnterpriseEventBus.instance) {
      EnterpriseEventBus.instance = new EnterpriseEventBus();
    }
    return EnterpriseEventBus.instance;
  }

  /**
   * Publish an event to all subscribers with loop protection, deduplication, and tenant scoping enforcement.
   */
  public publish<T = any>(event: FinopsEvent<T> | RuntimeEvent): void {
    // 1. Resolve and enforce business_id scoping
    const isSystemEvent = 
      event.module === "SYSTEM" || 
      event.module === "RUNTIME" || 
      event.module === "CORE" ||
      event.aggregate === "SYSTEM" || 
      event.aggregate === "LIFECYCLE" || 
      event.aggregate === "HEALTH" || 
      event.aggregate === "MODULE" ||
      event.type === "SYSTEM_INIT" ||
      event.type === "ModuleLoaded" ||
      event.type === "RuntimeStatusChanged" ||
      event.type === "Heartbeat";

    const bizId = event.businessId || (event.payload as any)?.business_id || (event.payload as any)?.businessId;
    if (bizId && bizId !== "global") {
      event.businessId = bizId;
      if (event.payload && typeof event.payload === "object") {
        (event.payload as any).business_id = bizId;
        (event.payload as any).businessId = bizId;
      }
    } else if (!isSystemEvent) {
      console.error(`[EventBus] REJECTED un-scoped domain event '${event.type}' (${event.module}/${event.aggregate}) with invalid businessId '${bizId}'. Domain events must be tenant-scoped.`);
      return;
    }

    const now = Date.now();
    let payloadSignature = "";
    try {
      if (event.payload) payloadSignature = JSON.stringify(event.payload);
    } catch (e) {}

    const signature = `${event.type}:${event.businessId || 'global'}:${payloadSignature || event.correlationId || event.eventId}`;

    // Clean old signatures
    if (this.recentEventSignatures.size > 500) {
      for (const [key, timestamp] of this.recentEventSignatures.entries()) {
        if (now - timestamp > this.DEDUP_WINDOW_MS) {
          this.recentEventSignatures.delete(key);
        }
      }
    }

    // Check duplicate
    const lastSeen = this.recentEventSignatures.get(signature);
    if (lastSeen && now - lastSeen < this.DEDUP_WINDOW_MS) {
      console.debug(`[EventBus] Deduplicated duplicate event emission: ${signature}`);
      return;
    }

    this.recentEventSignatures.set(signature, now);
    const checksum = payloadSignature || event.correlationId || event.eventId;
    this.eventHistory.set(event.type, { timestamp: now, payloadChecksum: checksum });
    console.log(`[EventBus] Publishing: ${event.type} from ${event.module || 'EventBus'}`);
    
    // Track history
    this.history.push({ ...event });
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift();
    }

    // Notify type-specific subscribers
    const typeSubscribers = this.subscribers.get(event.type);
    if (typeSubscribers) {
      typeSubscribers.forEach(callback => {
        try {
          callback(event);
        } catch (err) {
          console.error(`[EventBus] Error in subscriber for ${event.type}:`, err);
        }
      });
    }

    // Notify wildcard subscribers
    const wildcardSubscribers = this.subscribers.get("*");
    if (wildcardSubscribers) {
      wildcardSubscribers.forEach(callback => {
        try {
          callback(event);
        } catch (err) {
          console.error(`[EventBus] Error in wildcard subscriber:`, err);
        }
      });
    }
  }

  /**
   * Subscribe to a specific event type or all events ("*").
   */
  public subscribe<T = any>(type: string, callback: FinopsEventCallback<T>): () => void {
    if (!this.subscribers.has(type)) {
      this.subscribers.set(type, new Set());
    }
    
    this.subscribers.get(type)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      const subs = this.subscribers.get(type);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscribers.delete(type);
        }
      }
    };
  }

  public getHistory(): FinopsEvent[] {
    return [...this.history];
  }

  /**
   * Helper to create a standardized event
   */
  public createEvent<T = any>(params: {
    type: string;
    businessId?: string;
    payload?: T;
    correlationId?: string;
    causationId?: string;
    actorId?: string;
    module?: string;
    aggregate?: string;
    eventType?: string;
    source?: string;
    metadata?: Record<string, any>;
    status?: "PENDING" | "PROCESSED" | "FAILED";
    version?: string;
    [key: string]: any;
  }): FinopsEvent<T> & RuntimeEvent {
    const correlationId = params.correlationId || `corr_${Math.random().toString(36).substring(2, 11)}`;
    const businessId = params.businessId || (params.payload as any)?.business_id || (params.payload as any)?.businessId || "biz_default";
    return {
      eventId: `evt_${Math.random().toString(36).substring(2, 11)}`,
      timestamp: new Date().toISOString(),
      status: params.status || "PENDING",
      version: params.version || "1.0.0",
      eventType: params.eventType || params.type.replace(/([A-Z])/g, "_$1").toUpperCase().replace(/^_/, ""),
      source: params.source || "EventBus",
      module: params.module || "SYSTEM",
      aggregate: params.aggregate || "GENERAL",
      correlationId,
      businessId,
      payload: (params.payload || {}) as T,
      ...params
    } as FinopsEvent<T> & RuntimeEvent;
  }
}

export const EventBus = EnterpriseEventBus.getInstance();
