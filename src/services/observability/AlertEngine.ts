import { SystemSnapshot } from "./MetricRegistry";

export type AlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type AlertStatus = "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";

export interface SystemAlert {
  id: string;
  category: "runtime" | "firestore" | "ai" | "workflow" | "financial" | "security" | "devops" | "outbox";
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  description: string;
  timestamp: string;
  metricName?: string;
  metricValue?: number | string;
  threshold?: number | string;
  recommendedAction?: string;
}

class AlertEngineClass {
  private alerts: SystemAlert[] = [];

  /**
   * Scans a system snapshot and generates active alerts based on enterprise threshold rules.
   */
  public evaluate(snapshot: SystemSnapshot): SystemAlert[] {
    const newAlerts: SystemAlert[] = [];
    const now = new Date().toISOString();

    // 1. Runtime Performance Checks
    if (snapshot.runtime.memoryHeapMB > 150) {
      newAlerts.push({
        id: "alt_mem_" + Date.now(),
        category: "runtime",
        severity: "HIGH",
        status: "ACTIVE",
        title: "High Memory Heap Usage",
        description: `JS Heap memory is at ${snapshot.runtime.memoryHeapMB} MB (Threshold: >150 MB). Potential memory leak or uncollected DOM nodes.`,
        timestamp: now,
        metricName: "memoryHeapMB",
        metricValue: `${snapshot.runtime.memoryHeapMB} MB`,
        threshold: "> 150 MB",
        recommendedAction: "Use VirtualizedTable for large datasets and cleanup unneeded component event listeners."
      });
    }

    if (snapshot.runtime.fps < 45) {
      newAlerts.push({
        id: "alt_fps_" + Date.now(),
        category: "runtime",
        severity: "MEDIUM",
        status: "ACTIVE",
        title: "Frame Rate Degradation",
        description: `Viewport frame rate dropped to ${snapshot.runtime.fps} FPS (Threshold: <45 FPS). Scroll fluidity impacted.`,
        timestamp: now,
        metricName: "fps",
        metricValue: `${snapshot.runtime.fps} FPS`,
        threshold: "< 45 FPS",
        recommendedAction: "Optimize re-renders using React.memo() and debounced event handlers."
      });
    }

    // 2. Firestore Observatory Checks
    if (snapshot.firestore.activeListeners > 20) {
      newAlerts.push({
        id: "alt_listeners_" + Date.now(),
        category: "firestore",
        severity: "HIGH",
        status: "ACTIVE",
        title: "Excessive Active Firestore Listeners",
        description: `Active real-time listeners reached ${snapshot.firestore.activeListeners} (Threshold: >20). Listener churn consumes connection bandwidth.`,
        timestamp: now,
        metricName: "activeListeners",
        metricValue: snapshot.firestore.activeListeners,
        threshold: "> 20",
        recommendedAction: "Consolidate duplicate listeners into SubscriptionRegistry or realtimeManager ref-counted streams."
      });
    }

    if (snapshot.firestore.avgQueryLatencyMs > 350) {
      newAlerts.push({
        id: "alt_fs_lat_" + Date.now(),
        category: "firestore",
        severity: "MEDIUM",
        status: "ACTIVE",
        title: "Elevated Firestore Query Latency",
        description: `Average query roundtrip duration is ${snapshot.firestore.avgQueryLatencyMs} ms (Threshold: >350 ms).`,
        timestamp: now,
        metricName: "avgQueryLatencyMs",
        metricValue: `${snapshot.firestore.avgQueryLatencyMs} ms`,
        threshold: "> 350 ms",
        recommendedAction: "Verify compound indexes in firestore.indexes.json and limit page query bounds."
      });
    }

    // 3. AI Operations Checks
    if (snapshot.ai.quotaUsedPct >= 80) {
      const isCritical = snapshot.ai.quotaUsedPct >= 95;
      newAlerts.push({
        id: "alt_ai_quota_" + Date.now(),
        category: "ai",
        severity: isCritical ? "CRITICAL" : "HIGH",
        status: "ACTIVE",
        title: isCritical ? "AI Service Quota Exceeded / Critical" : "AI Service Quota Warning (>=80%)",
        description: `Gemini AI service spending cap usage is at ${snapshot.ai.quotaUsedPct}% (Threshold: >=80%).`,
        timestamp: now,
        metricName: "quotaUsedPct",
        metricValue: `${snapshot.ai.quotaUsedPct}%`,
        threshold: ">= 80%",
        recommendedAction: "Enable response caching in AiCfoPredictiveService or fallback to local FinancialRatioEngine rules."
      });
    }

    if (snapshot.ai.fallbackRatePct > 20) {
      newAlerts.push({
        id: "alt_ai_fallback_" + Date.now(),
        category: "ai",
        severity: "MEDIUM",
        status: "ACTIVE",
        title: "Elevated AI Service Fallback Rate",
        description: `AI CFO requests falling back to local heuristic engines at a rate of ${snapshot.ai.fallbackRatePct}% (Threshold: >20%).`,
        timestamp: now,
        metricName: "fallbackRatePct",
        metricValue: `${snapshot.ai.fallbackRatePct}%`,
        threshold: "> 20%",
        recommendedAction: "Inspect GEMINI_API_KEY rate limits and verify model quota allocations."
      });
    }

    // 4. Workflow Operations Checks
    if (snapshot.workflow.circuitBreakerState === "OPEN") {
      newAlerts.push({
        id: "alt_cb_open_" + Date.now(),
        category: "workflow",
        severity: "CRITICAL",
        status: "ACTIVE",
        title: "Circuit Breaker OPEN in Workflow Engine",
        description: "Workflow orchestrator tripped to OPEN state due to repeated upstream execution failures.",
        timestamp: now,
        metricName: "circuitBreakerState",
        metricValue: "OPEN",
        threshold: "!= OPEN",
        recommendedAction: "Verify background worker health and manually reset circuit breaker state after resolving queue saturation."
      });
    }

    if (snapshot.workflow.failedJobsCount > 0) {
      newAlerts.push({
        id: "alt_jobs_failed_" + Date.now(),
        category: "workflow",
        severity: "HIGH",
        status: "ACTIVE",
        title: "Failed Workflow Orchestration Jobs Detected",
        description: `${snapshot.workflow.failedJobsCount} job(s) failed and deferring to retry queue.`,
        timestamp: now,
        metricName: "failedJobsCount",
        metricValue: snapshot.workflow.failedJobsCount,
        threshold: "> 0",
        recommendedAction: "Inspect DLQ details in System Health Console and trigger retry queue processing."
      });
    }

    // 5. Financial Integrity Checks
    if (!snapshot.financial.generalLedgerBalanced || !snapshot.financial.journalBalanced) {
      newAlerts.push({
        id: "alt_fin_unbalanced_" + Date.now(),
        category: "financial",
        severity: "CRITICAL",
        status: "ACTIVE",
        title: "Unbalanced General Ledger or Journal Detected",
        description: "Double-entry accounting invariant failure: Sum(Debits) != Sum(Credits) in active ledger transactions.",
        timestamp: now,
        metricName: "generalLedgerBalanced",
        metricValue: "UNBALANCED",
        threshold: "BALANCED",
        recommendedAction: "Block financial posting approvals immediately and audit pending transaction journal entries."
      });
    }

    if (snapshot.financial.orphanTransactionsCount > 0) {
      newAlerts.push({
        id: "alt_fin_orphan_" + Date.now(),
        category: "financial",
        severity: "HIGH",
        status: "ACTIVE",
        title: "Orphan Financial Transactions Found",
        description: `${snapshot.financial.orphanTransactionsCount} transaction(s) lack required department or employee linkages.`,
        timestamp: now,
        metricName: "orphanTransactionsCount",
        metricValue: snapshot.financial.orphanTransactionsCount,
        threshold: "0",
        recommendedAction: "Re-assign cost centers or employees to orphan records in Finance Ledger."
      });
    }

    // 6. Security Operations Checks
    if (snapshot.security.rbacViolationsCount > 0 || snapshot.security.permissionDenialsCount > 5) {
      newAlerts.push({
        id: "alt_sec_rbac_" + Date.now(),
        category: "security",
        severity: "HIGH",
        status: "ACTIVE",
        title: "Elevated RBAC / Permission Violations",
        description: `Detected ${snapshot.security.rbacViolationsCount} RBAC violation(s) and ${snapshot.security.permissionDenialsCount} permission denial(s).`,
        timestamp: now,
        metricName: "permissionDenialsCount",
        metricValue: snapshot.security.permissionDenialsCount,
        threshold: "> 5",
        recommendedAction: "Review PermissionService logs and verify role claims assignment for active users."
      });
    }

    if (snapshot.security.crossTenantAttemptsCount > 0) {
      newAlerts.push({
        id: "alt_sec_tenant_" + Date.now(),
        category: "security",
        severity: "CRITICAL",
        status: "ACTIVE",
        title: "Cross-Tenant Access Attempt Detected",
        description: "Security rules or repository query caught an unauthorized attempt to query across tenant boundaries.",
        timestamp: now,
        metricName: "crossTenantAttemptsCount",
        metricValue: snapshot.security.crossTenantAttemptsCount,
        threshold: "0",
        recommendedAction: "Audit user session context and enforce business_id scoping on all Firestore queries."
      });
    }

    // 7. Developer Operations Checks
    if (snapshot.devops.filesOver400LocCount > 0) {
      newAlerts.push({
        id: "alt_dev_loc_" + Date.now(),
        category: "devops",
        severity: "LOW",
        status: "ACTIVE",
        title: "Modularity Standard Warning (>400 LOC)",
        description: `${snapshot.devops.filesOver400LocCount} code file(s) exceed the 400 lines of code architecture limit.`,
        timestamp: now,
        metricName: "filesOver400LocCount",
        metricValue: snapshot.devops.filesOver400LocCount,
        threshold: "0",
        recommendedAction: "Refactor large files into modular domain subcomponents according to docs/coding-standards.md."
      });
    }

    // 8. Transactional Outbox Checks
    if (snapshot.outbox) {
      if (snapshot.outbox.avgLatencyMs > 500) {
        newAlerts.push({
          id: "alt_outbox_latency_" + Date.now(),
          category: "outbox",
          severity: "HIGH",
          status: "ACTIVE",
          title: "Elevated Transactional Outbox Write Latency",
          description: `Average transactional outbox write latency is ${snapshot.outbox.avgLatencyMs}ms (Threshold: >500ms). One-by-one Firestore writes are causing high transaction durations.`,
          timestamp: now,
          metricName: "outbox_write_latency_ms",
          metricValue: `${snapshot.outbox.avgLatencyMs}ms`,
          threshold: "> 500ms",
          recommendedAction: "Spike detected! Batch events or group writes during high-concurrency payroll runs to minimize transactional overhead."
        });
      }

      if (snapshot.outbox.queueDepth > 10) {
        newAlerts.push({
          id: "alt_outbox_depth_" + Date.now(),
          category: "outbox",
          severity: "MEDIUM",
          status: "ACTIVE",
          title: "Pending Outbox Queue Backlog",
          description: `There are ${snapshot.outbox.queueDepth} pending events currently in the transactional outbox waiting to be processed.`,
          timestamp: now,
          metricName: "outbox_queue_depth",
          metricValue: snapshot.outbox.queueDepth,
          threshold: "> 10",
          recommendedAction: "Inspect event processor listener health and verify Firestore subscription stream connectivity."
        });
      }
    }

    this.alerts = newAlerts;
    return [...this.alerts];
  }

  /**
   * Returns current active alerts.
   */
  public getAlerts(): SystemAlert[] {
    return [...this.alerts];
  }

  /**
   * Acknowledges or resolves an alert by ID.
   */
  public updateAlertStatus(id: string, status: AlertStatus): void {
    const alert = this.alerts.find(a => a.id === id);
    if (alert) {
      alert.status = status;
    }
  }
}

export const AlertEngine = new AlertEngineClass();
