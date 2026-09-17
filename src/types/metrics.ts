/**
 * Tri-state metric status representing explicit calculation states:
 * - VALID_VALUE: Metric calculated successfully with real data.
 * - NO_DATA: Metric could not be computed due to missing/empty dataset (distinct from 0).
 * - CALCULATION_ERROR: Exception occurred during pipeline execution.
 */
export type MetricStatus = "VALID_VALUE" | "NO_DATA" | "CALCULATION_ERROR";

export interface CalculatedMetric<T = number> {
  value: T | null;
  status: MetricStatus;
  errorMessage?: string;
  isAvailable: boolean;
}

/**
 * Wraps raw numeric or generic values into explicit CalculatedMetric<T> containers.
 */
export function createCalculatedMetric<T>(
  value: T | null | undefined,
  error?: string
): CalculatedMetric<T> {
  if (error) {
    return {
      value: null,
      status: "CALCULATION_ERROR",
      errorMessage: error,
      isAvailable: false
    };
  }
  if (value === null || value === undefined || (typeof value === "number" && isNaN(value))) {
    return {
      value: null,
      status: "NO_DATA",
      isAvailable: false
    };
  }
  return {
    value,
    status: "VALID_VALUE",
    isAvailable: true
  };
}

/**
 * Formats metric for display, returning fallback (default "N/A" or "—") when NO_DATA or ERROR,
 * preserving explicit 0 when VALID_VALUE with value === 0.
 */
export function formatMetricDisplay(
  metric: CalculatedMetric<number> | number | null | undefined,
  formatter: (val: number) => string,
  noDataFallback: string = "N/A"
): string {
  if (metric === null || metric === undefined) return noDataFallback;
  
  if (typeof metric === "number") {
    if (isNaN(metric)) return noDataFallback;
    return formatter(metric);
  }

  if (metric.status === "CALCULATION_ERROR") {
    return metric.errorMessage ? `Error (${metric.errorMessage})` : "Erreur";
  }

  if (metric.status === "NO_DATA" || metric.value === null || isNaN(metric.value)) {
    return noDataFallback;
  }

  return formatter(metric.value);
}
