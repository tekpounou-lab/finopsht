export interface PerformanceMetric {
  id: string;
  category: "query" | "render" | "repository" | "subscription";
  name: string;
  durationMs: number;
  timestamp: string;
  metadata?: Record<string, any>;
}

export class PerformanceService {
  private static metrics: PerformanceMetric[] = [];
  private static maxLogSize = 100;
  private static activeSubscriptions = new Set<string>();

  /**
   * Tracks query / execution duration.
   */
  public static async trackExecution<T>(
    category: "query" | "repository" | "render",
    name: string,
    executor: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = performance.now();
    try {
      const result = await executor();
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

      this.logMetric({
        id: Math.random().toString(36).substring(2, 9),
        category,
        name,
        durationMs,
        timestamp: new Date().toISOString(),
        metadata
      });

      if (durationMs > 300 && process.env.NODE_ENV !== "production") {
        console.warn(`[FINOPS Perf Warning] Slow ${category} detected: ${name} took ${durationMs}ms`);
      }

      return result;
    } catch (error) {
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      this.logMetric({
        id: Math.random().toString(36).substring(2, 9),
        category,
        name: `${name} (FAILED)`,
        durationMs,
        timestamp: new Date().toISOString(),
        metadata: { ...metadata, error: String(error) }
      });
      throw error;
    }
  }

  /**
   * Registers a realtime subscription listener.
   */
  public static registerSubscription(subscriptionKey: string): () => void {
    this.activeSubscriptions.add(subscriptionKey);
    if (process.env.NODE_ENV !== "production") {
      console.log(`[FINOPS Perf] Active realtime subscriptions: ${this.activeSubscriptions.size}`);
    }

    return () => {
      this.activeSubscriptions.delete(subscriptionKey);
    };
  }

  /**
   * Records a raw metric entry.
   */
  public static logMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);
    if (this.metrics.length > this.maxLogSize) {
      this.metrics.shift();
    }
  }

  /**
   * Retrieves current metrics report.
   */
  public static getReport() {
    const totalMs = this.metrics.reduce((acc, m) => acc + m.durationMs, 0);
    const avgMs = this.metrics.length > 0 ? Math.round((totalMs / this.metrics.length) * 100) / 100 : 0;
    const slowCount = this.metrics.filter((m) => m.durationMs > 300).length;

    let memoryMB = 0;
    if (typeof window !== "undefined" && (window.performance as any)?.memory) {
      memoryMB = Math.round(((window.performance as any).memory.usedJSHeapSize / (1024 * 1024)) * 100) / 100;
    }

    return {
      activeSubscriptionsCount: this.activeSubscriptions.size,
      totalMetricsLogged: this.metrics.length,
      averageExecutionTimeMs: avgMs,
      slowQueriesCount: slowCount,
      usedJSHeapSizeMB: memoryMB,
      recentMetrics: [...this.metrics].slice(-20)
    };
  }
}
