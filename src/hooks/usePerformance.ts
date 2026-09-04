import { useEffect, useRef } from "react";
import { PerformanceService } from "../services/performance/PerformanceService";

export function useRenderPerformance(componentName: string) {
  const renderStartTime = useRef<number>(performance.now());

  useEffect(() => {
    const durationMs = Math.round((performance.now() - renderStartTime.current) * 100) / 100;
    PerformanceService.logMetric({
      id: Math.random().toString(36).substring(2, 9),
      category: "render",
      name: componentName,
      durationMs,
      timestamp: new Date().toISOString()
    });
  });
}
