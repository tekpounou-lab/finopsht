
import { EventBus } from "./EventBus";
import { AdminRepository } from "../admin/AdminRepository";
import { durableQueueService } from "../../services/queue/DurableQueueService";

export interface Job {
  id: string;
  type: string;
  payload: any;
  priority: "LOW" | "NORMAL" | "HIGH";
  scheduledFor?: number;
  attempts: number;
  deterministicKey?: string;
  businessId?: string;
}

class EnterpriseJobEngine {
  private static instance: EnterpriseJobEngine;
  private queue: Job[] = [];
  private isProcessing: boolean = false;
  private interval: any;

  private constructor() {}

  public static getInstance(): EnterpriseJobEngine {
    if (!EnterpriseJobEngine.instance) {
      EnterpriseJobEngine.instance = new EnterpriseJobEngine();
    }
    return EnterpriseJobEngine.instance;
  }

  public enqueue(
    type: string, 
    payload: any, 
    priority: "LOW" | "NORMAL" | "HIGH" = "NORMAL", 
    delayMs: number = 0,
    deterministicKey?: string,
    businessId: string = "biz_default"
  ): string {
    const jobId = deterministicKey 
      ? durableQueueService.generateDeterministicJobId(businessId, type, deterministicKey)
      : `job_${Math.random().toString(36).substring(2, 11)}`;

    // If deterministic, check if already in queue to prevent redundant duplication
    if (deterministicKey) {
      const existing = this.queue.find(j => j.id === jobId);
      if (existing) {
        console.info(`[JobEngine] Job ${jobId} (${type}) already queued. Deduplicated.`);
        return jobId;
      }
    }

    const job: Job = {
      id: jobId,
      type,
      payload,
      priority,
      scheduledFor: delayMs > 0 ? Date.now() + delayMs : undefined,
      attempts: 0,
      deterministicKey,
      businessId
    };

    this.queue.push(job);
    this.sortQueue();
    
    console.log(`[JobEngine] Enqueued ${type} (ID: ${job.id})`);
    
    EventBus.publish(EventBus.createEvent({
      correlationId: job.id,
      module: "JOB_ENGINE",
      aggregate: "JOB",
      type: "JobEnqueued",
      payload: { jobId: job.id, type }
    }));

    return job.id;
  }

  public start(): void {
    if (this.interval) return;
    
    this.interval = setInterval(() => this.process(), 1000);
    console.log("[JobEngine] Service Started.");

    // Health Reporting
    setInterval(async () => {
      await AdminRepository.reportHealth({
        name: "JOB_ENGINE",
        status: "GREEN",
        lastUpdate: new Date().toISOString(),
        metrics: { queueSize: this.queue.length, isProcessing: this.isProcessing }
      });
    }, 60000);
  }

  private async process(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;

    const now = Date.now();
    const readyJobs = this.queue.filter(j => !j.scheduledFor || j.scheduledFor <= now);
    
    if (readyJobs.length === 0) return;

    this.isProcessing = true;
    const job = readyJobs[0];
    this.queue = this.queue.filter(j => j.id !== job.id);

    try {
      console.log(`[JobEngine] Processing ${job.type} (${job.id})...`);
      
      EventBus.publish(EventBus.createEvent({
        correlationId: job.id,
        module: "JOB_ENGINE",
        aggregate: "JOB",
        type: "JobStarted",
        payload: { jobId: job.id, type: job.type }
      }));

      // Execute job execution with idempotency & retry protection
      await this.handleJob(job);

      EventBus.publish(EventBus.createEvent({
        correlationId: job.id,
        module: "JOB_ENGINE",
        aggregate: "JOB",
        type: "JobCompleted",
        payload: { jobId: job.id, type: job.type }
      }));
    } catch (err: any) {
      job.attempts++;
      durableQueueService.recordContention(err, `JobEngine:${job.type}`);
      
      if (job.attempts < 4) {
        // Compute exponential backoff with Full Jitter
        const jitterDelay = durableQueueService.calculateBackoffDelay(
          job.attempts - 1,
          500,
          15000,
          "FULL"
        );
        console.warn(`[JobEngine] Job ${job.id} (${job.type}) failed on attempt ${job.attempts}. Retrying in ${jitterDelay}ms (Contention Resilience)... Error:`, err);
        job.scheduledFor = Date.now() + jitterDelay;
        this.queue.push(job);
        this.sortQueue();
      } else {
        console.error(`[JobEngine] Job ${job.id} failed after ${job.attempts} attempts: ${err.message}`);
        EventBus.publish(EventBus.createEvent({
          correlationId: job.id,
          module: "JOB_ENGINE",
          aggregate: "JOB",
          type: "JobFailed",
          payload: { jobId: job.id, type: job.type, error: err.message }
        }));
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async handleJob(job: Job): Promise<void> {
    switch (job.type) {
      case "LOG_TELEMETRY":
        console.log("[JobEngine] Telemetry logged:", job.payload);
        break;
      default:
        await new Promise(r => setTimeout(r, 100));
    }
  }

  private sortQueue(): void {
    const priorityMap = { HIGH: 3, NORMAL: 2, LOW: 1 };
    this.queue.sort((a, b) => priorityMap[b.priority] - priorityMap[a.priority]);
  }

  public shutdown(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    console.log("[JobEngine] Service Stopped.");
  }

  public getSnapshot(): { queue: Job[], isProcessing: boolean } {
    return {
      queue: [...this.queue],
      isProcessing: this.isProcessing
    };
  }
}

export const JobEngine = EnterpriseJobEngine.getInstance();

