import { KPIComparison } from "../types";

export interface ComparisonDetails<T extends number | null = number> {
  current: T;
  previous: T;
  difference: T;
  percentage: T;
  trend: "UP" | "DOWN" | "STABLE";
  direction: "UP" | "DOWN" | "NEUTRAL";
  isPositive: boolean;
  isNegative: boolean;
  isNeutral: boolean;
}

export const AnalyticsComparisonEngine = {
  /**
   * Computes comprehensive comparison metrics between current and previous values.
   * This aligns with Sprint BI Core Part 6 rules.
   */
  compute(current: number, previous: number): ComparisonDetails {
    const difference = current - previous;
    const percentage = previous !== 0 ? (difference / previous) * 100 : 0;

    let trend: "UP" | "DOWN" | "STABLE" = "STABLE";
    if (difference > 0.01) {
      trend = "UP";
    } else if (difference < -0.01) {
      trend = "DOWN";
    }

    let direction: "UP" | "DOWN" | "NEUTRAL" = "NEUTRAL";
    if (difference > 0.01) {
      direction = "UP";
    } else if (difference < -0.01) {
      direction = "DOWN";
    }

    return {
      current,
      previous,
      difference,
      percentage,
      trend,
      direction,
      isPositive: difference > 0.01,
      isNegative: difference < -0.01,
      isNeutral: Math.abs(difference) <= 0.01,
    };
  },

  /**
   * Wraps an existing KPIComparison object to provide the additional calculated properties.
   */
  wrap<T extends number | null = number>(kpi: KPIComparison<T>): ComparisonDetails<T> {
    const difference = kpi.difference;
    const percentage = kpi.differencePercentage;
    const diffNum = typeof difference === "number" ? difference : 0;

    return {
      current: kpi.currentValue,
      previous: kpi.previousValue,
      difference,
      percentage,
      trend: kpi.trend,
      direction: kpi.direction,
      isPositive: typeof difference === "number" && diffNum > 0.01,
      isNegative: typeof difference === "number" && diffNum < -0.01,
      isNeutral: difference === null || Math.abs(diffNum) <= 0.01,
    };
  }
};
