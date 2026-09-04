/**
 * System Performance & Health Observability Utility
 */
export interface PerformanceMetric {
  name: string;
  durationMs: number;
  timestamp: string;
  metadata?: Record<string, any>;
}

class SystemPerformanceMonitor {
  private static instance: SystemPerformanceMonitor;
  private metrics: PerformanceMetric[] = [];
  private readonly MAX_METRICS = 200;

  private constructor() {}

  public static getInstance(): SystemPerformanceMonitor {
    if (!SystemPerformanceMonitor.instance) {
      SystemPerformanceMonitor.instance = new SystemPerformanceMonitor();
    }
    return SystemPerformanceMonitor.instance;
  }

  public recordMetric(name: string, durationMs: number, metadata?: Record<string, any>): void {
    const metric: PerformanceMetric = {
      name,
      durationMs: Math.round(durationMs),
      timestamp: new Date().toISOString(),
      metadata
    };

    this.metrics.push(metric);
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics.shift();
    }

    if (durationMs > 1000) {
      console.warn(`[PerformanceMonitor][SLOW_OPERATION] ${name} took ${Math.round(durationMs)}ms`, metadata);
    } else {
      console.log(`[PerformanceMonitor] ${name}: ${Math.round(durationMs)}ms`);
    }
  }

  public measure<T>(name: string, fn: () => Promise<T>, metadata?: Record<string, any>): Promise<T> {
    const start = performance.now();
    return fn().then(
      (res) => {
        this.recordMetric(name, performance.now() - start, metadata);
        return res;
      },
      (err) => {
        this.recordMetric(name, performance.now() - start, { ...metadata, error: true, message: err?.message });
        throw err;
      }
    );
  }

  public getSummary(): { count: number; avgDurationMs: number; slowOperations: PerformanceMetric[] } {
    if (this.metrics.length === 0) {
      return { count: 0, avgDurationMs: 0, slowOperations: [] };
    }

    const total = this.metrics.reduce((acc, m) => acc + m.durationMs, 0);
    const avgDurationMs = Math.round(total / this.metrics.length);
    const slowOperations = this.metrics.filter((m) => m.durationMs > 1000);

    return {
      count: this.metrics.length,
      avgDurationMs,
      slowOperations
    };
  }
}

export const performanceMonitor = SystemPerformanceMonitor.getInstance();
