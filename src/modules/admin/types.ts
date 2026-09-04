
export type HealthStatus = "GREEN" | "YELLOW" | "RED";

export interface ModuleHealth {
  name: string;
  businessId?: string;
  status: HealthStatus;
  lastUpdate: any;
  message?: string;
  metrics?: Record<string, any>;
}

export interface RuntimeMetrics {
  bootTime: any;
  uptime: number; // in ms
  moduleCount: number;
  eventRate: number; // events/sec
  jobSuccessRate: number;
  activeWorkflows: number;
}

export interface EnterpriseIncident {
  id: string;
  businessId: string;
  module: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  priority: "P0" | "P1" | "P2" | "P3";
  status: "OPEN" | "INVESTIGATING" | "RESOLVED" | "ARCHIVED";
  title: string;
  description: string;
  timeline: { timestamp: any; message: string; type: string }[];
  affectedModules: string[];
  ownerId?: string;
  createdAt: any;
  updatedAt: any;
}

export interface HealthScore {
  total: number; // 0-100
  components: Record<string, number>;
}
