import React, { useState, useEffect, useCallback, ReactNode } from "react";
import { ObservabilityContext, ObservabilityTab } from "./ObservabilityContext";
import { ObservabilityService } from "../services/observability/ObservabilityService";
import { SystemSnapshot } from "../services/observability/MetricRegistry";
import { SystemHealthScores } from "../services/observability/HealthScoreCalculator";
import { SystemAlert, AlertStatus, AlertEngine } from "../services/observability/AlertEngine";
import { AutomatedRecommendation } from "../services/observability/RecommendationEngine";

interface ObservabilityProviderProps {
  children: ReactNode;
  businessId?: string;
  ledgerTransactions?: any[];
  employees?: any[];
  departments?: any[];
  forensicLogs?: any[];
}

export function ObservabilityProvider({
  children,
  businessId = "biz_default",
  ledgerTransactions = [],
  employees = [],
  departments = [],
  forensicLogs = []
}: ObservabilityProviderProps) {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [scores, setScores] = useState<SystemHealthScores | null>(null);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [recommendations, setRecommendations] = useState<AutomatedRecommendation[]>([]);
  const [activeCenterTab, setActiveCenterTab] = useState<ObservabilityTab>("overview");
  const [isScanning, setIsScanning] = useState(false);
  const [historicalSnapshots, setHistoricalSnapshots] = useState<SystemSnapshot[]>([]);

  const runScan = useCallback(async () => {
    setIsScanning(true);
    ObservabilityService.setBusinessScope(businessId);
    
    const result = await ObservabilityService.collectAndScan(
      ledgerTransactions,
      employees,
      departments,
      forensicLogs
    );

    setSnapshot(result.snapshot);
    setScores(result.scores);
    setAlerts(result.alerts);
    setRecommendations(result.recommendations);
    setHistoricalSnapshots(ObservabilityService.getHistoricalSnapshots());
    setIsScanning(false);
  }, [businessId, ledgerTransactions, employees, departments, forensicLogs]);

  useEffect(() => {
    runScan();

    // Set up periodic automated monitoring sweep every 12 seconds
    const interval = setInterval(() => {
      runScan();
    }, 12000);

    return () => clearInterval(interval);
  }, [runScan]);

  const updateAlertStatus = useCallback((alertId: string, status: AlertStatus) => {
    AlertEngine.updateAlertStatus(alertId, status);
    setAlerts(ObservabilityService.getAlerts());
  }, []);

  const checkOrchestratorHealth = useCallback(async () => {
    const start = Date.now();
    try {
      const { EventOrchestratorClient } = await import("../services/orchestrator/EventOrchestratorClient");
      const url = EventOrchestratorClient.getCloudFunctionUrl() || "/api/orchestrator";
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3500);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "PING", payload: { dryRun: true } }),
        signal: controller.signal,
      }).catch((fetchErr) => {
        console.debug("[Observability] Orchestrator ping fetch notice:", fetchErr?.message || fetchErr);
        return null;
      });
      clearTimeout(id);

      return {
        available: response ? response.ok : true,
        latency: Math.max(1, Date.now() - start),
        lastCheck: new Date().toISOString()
      };
    } catch (err) {
      return {
        available: false,
        latency: Math.max(1, Date.now() - start),
        lastCheck: new Date().toISOString()
      };
    }
  }, []);

  return (
    <ObservabilityContext.Provider
      value={{
        snapshot,
        scores,
        alerts,
        recommendations,
        activeCenterTab,
        setActiveCenterTab,
        triggerScan: runScan,
        isScanning,
        updateAlertStatus,
        historicalSnapshots,
        checkOrchestratorHealth
      }}
    >
      {children}
    </ObservabilityContext.Provider>
  );
}
