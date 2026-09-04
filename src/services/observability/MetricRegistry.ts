export type MetricCategory = 
  | "runtime" 
  | "firestore" 
  | "ai" 
  | "workflow" 
  | "financial" 
  | "security" 
  | "devops"
  | "outbox";

export interface MetricEntry {
  id: string;
  category: MetricCategory;
  name: string;
  value: number;
  unit: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface SystemSnapshot {
  timestamp: string;
  overallScore: number;
  runtime: {
    avgRenderTimeMs: number;
    slowComponentCount: number;
    reRenderCount: number;
    fps: number;
    memoryHeapMB: number;
    cpuLoadPct: number;
    contextUpdateCount: number;
    score: number;
  };
  firestore: {
    readsPerMin: number;
    writesPerMin: number;
    deletesPerMin: number;
    activeListeners: number;
    cacheHitRatioPct: number;
    avgQueryLatencyMs: number;
    estimatedCostUsd: number;
    score: number;
  };
  ai: {
    promptCount: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    avgLatencyMs: number;
    cacheHitRatioPct: number;
    fallbackRatePct: number;
    quotaUsedPct: number;
    modelsUsed: string[];
    score: number;
  };
  workflow: {
    pendingJobsCount: number;
    processingJobsCount: number;
    failedJobsCount: number;
    retryRatePct: number;
    avgLatencyMs: number;
    circuitBreakerState: "CLOSED" | "OPEN" | "HALF_OPEN";
    workerHealthPct: number;
    score: number;
    contention?: {
      abortedCount: number;
      failedPreconditionCount: number;
      resourceExhaustedCount: number;
      unavailableCount: number;
      deadlineExceededCount: number;
      totalRetriesExecuted: number;
    };
  };
  financial: {
    generalLedgerBalanced: boolean;
    payrollReconciled: boolean;
    journalBalanced: boolean;
    orphanTransactionsCount: number;
    duplicateTransactionsCount: number;
    writingIntegrityScore: number;
    sha256SealedRunsCount: number;
    score: number;
  };
  security: {
    rbacViolationsCount: number;
    permissionDenialsCount: number;
    activeUserSessionsCount: number;
    roleChangesCount: number;
    crossTenantAttemptsCount: number;
    firestoreRulesDenialsCount: number;
    auditTrailLogsCount: number;
    score: number;
  };
  devops: {
    bundleSizeBytes: number;
    totalChunksCount: number;
    largestRouteName: string;
    largestRouteBytes: number;
    filesOver400LocCount: number;
    testCoveragePct: number;
    unusedDepsCount: number;
    technicalDebtScore: number;
    score: number;
  };
  outbox?: {
    avgLatencyMs: number;
    maxLatencyMs: number;
    queueDepth: number;
    duplicateEventsPrevented: number;
    score: number;
  };
}

class MetricRegistryClass {
  private metrics: MetricEntry[] = [];
  private maxHistorySize = 500;
  private currentSnapshot: SystemSnapshot | null = null;
  private snapshotHistory: SystemSnapshot[] = [];

  /**
   * Records a raw metric entry into the registry.
   */
  public recordMetric(metric: Omit<MetricEntry, "id" | "timestamp">): MetricEntry {
    const entry: MetricEntry = {
      ...metric,
      id: "m_" + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString()
    };

    this.metrics.push(entry);
    if (this.metrics.length > this.maxHistorySize) {
      this.metrics.shift();
    }

    return entry;
  }

  /**
   * Returns recorded metrics, optionally filtered by category.
   */
  public getMetrics(category?: MetricCategory): MetricEntry[] {
    if (!category) return [...this.metrics];
    return this.metrics.filter(m => m.category === category);
  }

  /**
   * Stores the latest calculated system snapshot.
   */
  public setSnapshot(snapshot: SystemSnapshot): void {
    this.currentSnapshot = snapshot;
    this.snapshotHistory.push(snapshot);
    if (this.snapshotHistory.length > 50) {
      this.snapshotHistory.shift();
    }
  }

  /**
   * Gets the most recent system snapshot.
   */
  public getLatestSnapshot(): SystemSnapshot | null {
    return this.currentSnapshot;
  }

  /**
   * Returns historical snapshot trend data for graphs.
   */
  public getHistoricalSnapshots(): SystemSnapshot[] {
    return [...this.snapshotHistory];
  }

  /**
   * Clears registry data (useful for testing or resets).
   */
  public clear(): void {
    this.metrics = [];
    this.currentSnapshot = null;
    this.snapshotHistory = [];
  }
}

export const MetricRegistry = new MetricRegistryClass();
