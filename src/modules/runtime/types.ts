
import { FinopsEvent, FinopsEventCallback } from "../../types/events";

export type { FinopsEvent, FinopsEventCallback };

export type RuntimeStatus = 
  | "BOOT" 
  | "INITIALIZING" 
  | "REGISTERING_MODULES" 
  | "RESOLVING_BUSINESS" 
  | "BUILDING_CONTEXT" 
  | "READY" 
  | "RUNNING" 
  | "DEGRADED" 
  | "RECOVERING" 
  | "SHUTDOWN";

export interface RuntimeEvent extends FinopsEvent {
  eventId?: string;
  timestamp: string;
  correlationId: string;
  causationId?: string;
  actorId?: string;
  businessId: string;
  module?: string;
  aggregate?: string;
  type: string;
  eventType?: string;
  source?: string;
  payload: any;
  metadata?: Record<string, any>;
  version?: string;
  status?: "PENDING" | "PROCESSED" | "FAILED";
}

export type EventCallback<T = any> = (event: FinopsEvent<T>) => void | Promise<void>;

export interface ModuleRegistration {
  name: string;
  version: string;
  dependencies?: string[];
  onInitialize?: () => Promise<void>;
  onReady?: () => Promise<void>;
  onShutdown?: () => Promise<void>;
}

export interface RuntimeState {
  status: RuntimeStatus;
  bootTime: string;
  lastHeartbeat: string;
  activeModules: string[];
  errors: Array<{ timestamp: string; message: string; module?: string }>;
}
