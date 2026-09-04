import { SystemSnapshot } from "./MetricRegistry";
import { SystemAlert } from "./AlertEngine";

export interface SystemHealthScores {
  overall: number;
  runtime: number;
  firestore: number;
  ai: number;
  workflow: number;
  financial: number;
  security: number;
  devops: number;
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
}

class HealthScoreCalculatorClass {
  /**
   * Calculates dynamic health scores across all 7 operational domains and an overall system grade.
   */
  public calculate(
    metricsData: Partial<SystemSnapshot>,
    alerts: SystemAlert[]
  ): SystemHealthScores {
    // 1. Runtime Score
    let runtimeScore = 100;
    const memory = metricsData.runtime?.memoryHeapMB || 0;
    const fps = metricsData.runtime?.fps || 60;
    const avgRender = metricsData.runtime?.avgRenderTimeMs || 10;
    if (memory > 150) runtimeScore -= 20;
    if (fps < 45) runtimeScore -= 20;
    if (avgRender > 30) runtimeScore -= 15;
    runtimeScore = Math.max(0, runtimeScore);

    // 2. Firestore Score
    let firestoreScore = 100;
    const listeners = metricsData.firestore?.activeListeners || 0;
    const latency = metricsData.firestore?.avgQueryLatencyMs || 50;
    const cacheHit = metricsData.firestore?.cacheHitRatioPct || 90;
    if (listeners > 20) firestoreScore -= 25;
    if (latency > 300) firestoreScore -= 15;
    if (cacheHit < 70) firestoreScore -= 10;
    firestoreScore = Math.max(0, firestoreScore);

    // 3. AI Score
    let aiScore = 100;
    const quota = metricsData.ai?.quotaUsedPct || 0;
    const fallbackRate = metricsData.ai?.fallbackRatePct || 0;
    if (quota >= 95) aiScore -= 45;
    else if (quota >= 80) aiScore -= 25;
    if (fallbackRate > 20) aiScore -= 20;
    aiScore = Math.max(0, aiScore);

    // 4. Workflow Score
    let workflowScore = 100;
    const cbState = metricsData.workflow?.circuitBreakerState || "CLOSED";
    const failedJobs = metricsData.workflow?.failedJobsCount || 0;
    if (cbState === "OPEN") workflowScore -= 50;
    else if (cbState === "HALF_OPEN") workflowScore -= 25;
    if (failedJobs > 0) workflowScore -= Math.min(30, failedJobs * 10);
    workflowScore = Math.max(0, workflowScore);

    // 5. Financial Score
    let financialScore = 100;
    const ledgerBalanced = metricsData.financial?.generalLedgerBalanced ?? true;
    const journalBalanced = metricsData.financial?.journalBalanced ?? true;
    const orphans = metricsData.financial?.orphanTransactionsCount || 0;
    if (!ledgerBalanced) financialScore -= 50;
    if (!journalBalanced) financialScore -= 30;
    if (orphans > 0) financialScore -= Math.min(20, orphans * 5);
    financialScore = Math.max(0, financialScore);

    // 6. Security Score
    let securityScore = 100;
    const rbacVio = metricsData.security?.rbacViolationsCount || 0;
    const permDenials = metricsData.security?.permissionDenialsCount || 0;
    const crossTenant = metricsData.security?.crossTenantAttemptsCount || 0;
    if (crossTenant > 0) securityScore -= 60;
    if (rbacVio > 0) securityScore -= 25;
    if (permDenials > 10) securityScore -= 15;
    securityScore = Math.max(0, securityScore);

    // 7. DevOps Score
    let devopsScore = 100;
    const locFiles = metricsData.devops?.filesOver400LocCount || 0;
    const debtScore = metricsData.devops?.technicalDebtScore || 10;
    if (locFiles > 5) devopsScore -= 15;
    if (debtScore > 30) devopsScore -= 20;
    devopsScore = Math.max(0, devopsScore);

    // Alert Penalty Deductions
    const criticalAlertsCount = alerts.filter(a => a.severity === "CRITICAL" && a.status === "ACTIVE").length;
    const highAlertsCount = alerts.filter(a => a.severity === "HIGH" && a.status === "ACTIVE").length;

    // Weighted Overall Score
    const weightedBase =
      runtimeScore * 0.15 +
      firestoreScore * 0.15 +
      aiScore * 0.10 +
      workflowScore * 0.15 +
      financialScore * 0.20 +
      securityScore * 0.15 +
      devopsScore * 0.10;

    let overall = Math.round(weightedBase - (criticalAlertsCount * 15 + highAlertsCount * 5));
    overall = Math.max(0, Math.min(100, overall));

    // Grade Determination
    let grade: "A+" | "A" | "B" | "C" | "D" | "F" = "A+";
    if (overall >= 95) grade = "A+";
    else if (overall >= 88) grade = "A";
    else if (overall >= 78) grade = "B";
    else if (overall >= 65) grade = "C";
    else if (overall >= 50) grade = "D";
    else grade = "F";

    return {
      overall,
      runtime: Math.round(runtimeScore),
      firestore: Math.round(firestoreScore),
      ai: Math.round(aiScore),
      workflow: Math.round(workflowScore),
      financial: Math.round(financialScore),
      security: Math.round(securityScore),
      devops: Math.round(devopsScore),
      grade
    };
  }
}

export const HealthScoreCalculator = new HealthScoreCalculatorClass();
