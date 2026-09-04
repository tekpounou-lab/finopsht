// src/services/queue/DurableQueueService.ts
/**
 * FINOPS ERP — Durable Queue & Resilience Service
 * 
 * Provides:
 * 1. Firestore Contention Diagnosis (ABORTED, FAILED_PRECONDITION, DEADLINE_EXCEEDED, RESOURCE_EXHAUSTED).
 * 2. Exponential Backoff with Full, Equal, & Decorrelated Jitter to eliminate thundering herds.
 * 3. Deterministic Event & Job ID Generation for robust idempotency across background workers and retries.
 * 4. Concurrency & Instance Saturation Profiles for Cloud Functions / Cloud Run.
 */

import { IdempotencyGuardian } from "../../modules/runtime/EnterpriseMessageQueue";
import { MetricRegistry } from "../observability/MetricRegistry";

export type JitterStrategy = "FULL" | "EQUAL" | "DECORRELATED";

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterStrategy?: JitterStrategy;
  onRetry?: (attempt: number, delayMs: number, error: any) => void;
  shouldRetry?: (error: any) => boolean;
}

export interface ContentionDiagnostics {
  abortedCount: number;
  failedPreconditionCount: number;
  resourceExhaustedCount: number;
  unavailableCount: number;
  deadlineExceededCount: number;
  totalRetriesExecuted: number;
  deferralCount: number;
  lastContentionTimestamp: string | null;
  contentionHotspots: Record<string, number>;
}

export interface CloudConcurrencyProfile {
  serviceName: string;
  runtime: "cloud_run" | "cloud_function_2nd_gen";
  concurrency: number;
  maxInstances: number;
  minInstances: number;
  cpu: number | string;
  memory: string;
  timeoutSeconds: number;
  maxBatchSize: number;
  partitionRateLimit: number;
}

// Enterprise Standard Concurrency Profiles
export const ENTERPRISE_CONCURRENCY_PROFILES: Record<string, CloudConcurrencyProfile> = {
  LEDGER_POSTING_WORKER: {
    serviceName: "finops-ledger-posting-worker",
    runtime: "cloud_function_2nd_gen",
    concurrency: 16, // Optimal to prevent transaction lock contention on tenant root accounts
    maxInstances: 30,
    minInstances: 1,
    cpu: 1,
    memory: "512Mi",
    timeoutSeconds: 120,
    maxBatchSize: 100,
    partitionRateLimit: 500 // Firestore 500 writes/sec rule
  },
  PAYROLL_CYCLE_PROCESSOR: {
    serviceName: "finops-payroll-processor",
    runtime: "cloud_run",
    concurrency: 80,
    maxInstances: 50,
    minInstances: 1,
    cpu: 2,
    memory: "1Gi",
    timeoutSeconds: 300,
    maxBatchSize: 250,
    partitionRateLimit: 500
  },
  ANALYTICS_SNAPSHOT_BUILDER: {
    serviceName: "finops-analytics-snapshot",
    runtime: "cloud_function_2nd_gen",
    concurrency: 8,
    maxInstances: 20,
    minInstances: 0,
    cpu: 1,
    memory: "1Gi",
    timeoutSeconds: 180,
    maxBatchSize: 500,
    partitionRateLimit: 300
  },
  FORENSIC_AUDIT_STREAM: {
    serviceName: "finops-audit-vault-stream",
    runtime: "cloud_function_2nd_gen",
    concurrency: 32,
    maxInstances: 40,
    minInstances: 1,
    cpu: 1,
    memory: "512Mi",
    timeoutSeconds: 60,
    maxBatchSize: 100,
    partitionRateLimit: 500
  }
};

export class DurableQueueService {
  private static instance: DurableQueueService;

  private diagnostics: ContentionDiagnostics = {
    abortedCount: 0,
    failedPreconditionCount: 0,
    resourceExhaustedCount: 0,
    unavailableCount: 0,
    deadlineExceededCount: 0,
    totalRetriesExecuted: 0,
    deferralCount: 0,
    lastContentionTimestamp: null,
    contentionHotspots: {}
  };

  private constructor() {}

  public static getInstance(): DurableQueueService {
    if (!DurableQueueService.instance) {
      DurableQueueService.instance = new DurableQueueService();
    }
    return DurableQueueService.instance;
  }

  /**
   * Evaluates whether an error is a Firestore contention or transient retryable error.
   */
  public isContentionError(error: any): boolean {
    if (!error) return false;
    const msg = String(error.message || error.code || error).toLowerCase();
    const code = error.code || "";

    return (
      code === "failed-precondition" ||
      code === "aborted" ||
      code === "resource-exhausted" ||
      code === "unavailable" ||
      code === "deadline-exceeded" ||
      msg.includes("aborted") ||
      msg.includes("failed-precondition") ||
      msg.includes("failed_precondition") ||
      msg.includes("contention") ||
      msg.includes("too much contention") ||
      msg.includes("transaction lock") ||
      msg.includes("lock timeout") ||
      msg.includes("concurrency") ||
      msg.includes("resource exhausted") ||
      msg.includes("429") ||
      msg.includes("quota") ||
      msg.includes("unavailable") ||
      msg.includes("503") ||
      msg.includes("deadline exceeded") ||
      msg.includes("504")
    );
  }

  /**
   * Logs and categorizes contention events for SRE Observability.
   */
  public recordContention(error: any, hotspotKey?: string): void {
    if (!error) return;
    const msg = String(error.message || error.code || error).toLowerCase();
    const code = error.code || "";

    this.diagnostics.lastContentionTimestamp = new Date().toISOString();

    if (code === "aborted" || msg.includes("aborted") || msg.includes("contention")) {
      this.diagnostics.abortedCount++;
    } else if (code === "failed-precondition" || msg.includes("failed_precondition") || msg.includes("failed-precondition")) {
      this.diagnostics.failedPreconditionCount++;
    } else if (code === "resource-exhausted" || msg.includes("resource exhausted") || msg.includes("429") || msg.includes("quota")) {
      this.diagnostics.resourceExhaustedCount++;
    } else if (code === "unavailable" || msg.includes("unavailable") || msg.includes("503")) {
      this.diagnostics.unavailableCount++;
    } else if (code === "deadline-exceeded" || msg.includes("deadline exceeded") || msg.includes("504")) {
      this.diagnostics.deadlineExceededCount++;
    } else {
      this.diagnostics.deferralCount++;
    }

    if (hotspotKey) {
      this.diagnostics.contentionHotspots[hotspotKey] = (this.diagnostics.contentionHotspots[hotspotKey] || 0) + 1;
    }

    try {
      MetricRegistry.recordMetric({
        category: "firestore",
        name: "firestore_contention_events",
        value: 1,
        unit: "count"
      });
    } catch {}
  }

  /**
   * Computes backoff delay with cryptographic/randomized jitter.
   * Eliminates the "thundering herd" effect where hundreds of workers retry simultaneously.
   */
  public calculateBackoffDelay(
    attempt: number,
    baseDelayMs: number = 250,
    maxDelayMs: number = 10000,
    strategy: JitterStrategy = "FULL",
    previousDelayMs?: number
  ): number {
    const exponentialCap = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));

    switch (strategy) {
      case "FULL": {
        // Full Jitter: Sleep between 0 and exponentialCap
        return Math.floor(Math.random() * exponentialCap);
      }
      case "EQUAL": {
        // Equal Jitter: Sleep half deterministic + half randomized
        const half = Math.floor(exponentialCap / 2);
        return half + Math.floor(Math.random() * half);
      }
      case "DECORRELATED": {
        // Decorrelated Jitter: Sleep between baseDelay and prevDelay * 3
        const prev = previousDelayMs || baseDelayMs;
        const delay = Math.floor(baseDelayMs + Math.random() * (prev * 3 - baseDelayMs));
        return Math.min(maxDelayMs, Math.max(baseDelayMs, delay));
      }
      default:
        return Math.floor(Math.random() * exponentialCap);
    }
  }

  /**
   * Executes an asynchronous task with full exponential backoff + jitter.
   * Seamlessly resolves transient Firestore contention (ABORTED / FAILED_PRECONDITION).
   */
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {},
    hotspotContext?: string
  ): Promise<T> {
    const maxRetries = options.maxRetries ?? 5;
    const baseDelayMs = options.baseDelayMs ?? 250;
    const maxDelayMs = options.maxDelayMs ?? 10000;
    const strategy = options.jitterStrategy ?? "FULL";

    let attempt = 0;
    let prevDelay = baseDelayMs;

    while (attempt <= maxRetries) {
      try {
        return await operation();
      } catch (error: any) {
        attempt++;
        this.recordContention(error, hotspotContext);
        this.diagnostics.totalRetriesExecuted++;

        const isRetryable = options.shouldRetry ? options.shouldRetry(error) : this.isContentionError(error);

        if (!isRetryable || attempt > maxRetries) {
          console.error(
            `[DurableQueueService] Operation failed after ${attempt} attempt(s). Unrecoverable or max retries exceeded. Context: ${hotspotContext || "generic"}. Error:`,
            error
          );
          throw error;
        }

        const delay = this.calculateBackoffDelay(attempt - 1, baseDelayMs, maxDelayMs, strategy, prevDelay);
        prevDelay = delay;

        if (options.onRetry) {
          options.onRetry(attempt, delay, error);
        } else {
          console.warn(
            `[DurableQueueService] Contention detected in '${hotspotContext || "operation"}'. Retry ${attempt}/${maxRetries} scheduled in ${delay}ms (Jitter: ${strategy}).`
          );
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error(`[DurableQueueService] Retries exhausted for ${hotspotContext || "operation"}`);
  }

  /**
   * Generates a deterministic, collision-resistant event ID.
   * Ensures that background jobs and retried mutations do NOT create duplicate ledger postings or audit entries.
   */
  public generateDeterministicEventId(
    businessId: string,
    domain: string,
    aggregateId: string,
    action: string,
    payload: any = {}
  ): string {
    // 1. Create canonical sorted payload representation
    const canonicalPayload = this.canonicalizeObject(payload);
    const rawString = `${businessId}:${domain}:${aggregateId}:${action}:${canonicalPayload}`;

    // 2. Compute 64-bit deterministic hash digest
    const hash = this.fnv1a64(rawString);
    return `evt_det_${domain.toLowerCase()}_${hash}`;
  }

  /**
   * Deterministic Job ID generator for JobEngine and background tasks.
   */
  public generateDeterministicJobId(
    businessId: string,
    jobType: string,
    uniquePayloadKey: string
  ): string {
    const rawString = `${businessId}:${jobType}:${uniquePayloadKey}`;
    const hash = this.fnv1a64(rawString);
    return `job_det_${hash}`;
  }

  /**
   * Fast, non-cryptographic 64-bit FNV-1a deterministic hash function.
   */
  private fnv1a64(str: string): string {
    let h1 = 0x811c9dc5;
    let h2 = 0xcbf29ce4;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      h1 ^= char;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= char;
      h2 = Math.imul(h2, 0x100000001b3);
    }

    const hex1 = (h1 >>> 0).toString(16).padStart(8, "0");
    const hex2 = (h2 >>> 0).toString(16).padStart(8, "0");
    return `${hex1}${hex2}`;
  }

  /**
   * Deterministically orders object keys for reliable hashing.
   */
  private canonicalizeObject(obj: any): string {
    if (obj === null || typeof obj !== "object") {
      return String(obj);
    }
    if (Array.isArray(obj)) {
      return "[" + obj.map((item) => this.canonicalizeObject(item)).join(",") + "]";
    }
    const keys = Object.keys(obj).sort();
    const parts = keys.map((key) => `"${key}":${this.canonicalizeObject(obj[key])}`);
    return "{" + parts.join(",") + "}";
  }

  /**
   * Returns current contention diagnostic metrics for Observability & SRE Dashboards.
   */
  public getDiagnostics(): ContentionDiagnostics {
    return {
      ...this.diagnostics,
      contentionHotspots: { ...this.diagnostics.contentionHotspots }
    };
  }

  /**
   * Resets diagnostic counters.
   */
  public resetDiagnostics(): void {
    this.diagnostics = {
      abortedCount: 0,
      failedPreconditionCount: 0,
      resourceExhaustedCount: 0,
      unavailableCount: 0,
      deadlineExceededCount: 0,
      totalRetriesExecuted: 0,
      deferralCount: 0,
      lastContentionTimestamp: null,
      contentionHotspots: {}
    };
  }

  /**
   * Checks if an event is idempotent before execution and marks it processed afterwards.
   */
  public async executeIdempotently<T>(
    businessId: string,
    consumerId: string,
    eventId: string,
    work: () => Promise<T>
  ): Promise<{ executed: boolean; result?: T }> {
    const isProcessed = await IdempotencyGuardian.isEventProcessed(businessId, consumerId, eventId);
    if (isProcessed) {
      console.info(`[DurableQueueService] Idempotency Guardian: Event ${eventId} already processed by ${consumerId}. Skipping.`);
      return { executed: false };
    }

    const result = await this.executeWithRetry(
      work,
      {
        maxRetries: 4,
        baseDelayMs: 300,
        jitterStrategy: "FULL"
      },
      `${consumerId}:${eventId}`
    );

    await IdempotencyGuardian.markEventProcessed(businessId, consumerId, eventId);
    return { executed: true, result };
  }
}

export const durableQueueService = DurableQueueService.getInstance();
