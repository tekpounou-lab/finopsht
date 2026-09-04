import React, { createContext, useContext } from "react";
import { SystemSnapshot } from "../services/observability/MetricRegistry";
import { SystemHealthScores } from "../services/observability/HealthScoreCalculator";
import { SystemAlert, AlertStatus } from "../services/observability/AlertEngine";
import { AutomatedRecommendation } from "../services/observability/RecommendationEngine";

export type ObservabilityTab = 
  | "overview" 
  | "runtime" 
  | "firestore" 
  | "ai" 
  | "workflow" 
  | "financial" 
  | "security" 
  | "devops" 
  | "outbox"
  | "recommendations";

export interface ObservabilityContextType {
  snapshot: SystemSnapshot | null;
  scores: SystemHealthScores | null;
  alerts: SystemAlert[];
  recommendations: AutomatedRecommendation[];
  activeCenterTab: ObservabilityTab;
  setActiveCenterTab: (tab: ObservabilityTab) => void;
  triggerScan: () => Promise<void>;
  isScanning: boolean;
  updateAlertStatus: (alertId: string, status: AlertStatus) => void;
  historicalSnapshots: SystemSnapshot[];
  checkOrchestratorHealth: () => Promise<{ available: boolean; latency: number; lastCheck: string }>;
}

export const ObservabilityContext = createContext<ObservabilityContextType | null>(null);

export function useObservability(): ObservabilityContextType {
  const context = useContext(ObservabilityContext);
  if (!context) {
    throw new Error("useObservability must be used within an ObservabilityProvider");
  }
  return context;
}
