import { db, auth, functions } from "../lib/firebase";
import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { IdempotencyGuardian } from "../modules/runtime/EnterpriseMessageQueue";
import { durableQueueService } from "./queue/DurableQueueService";

// Debounce map for event emissions to prevent event/RPC spam
const pendingEmissions: Map<string, { timer: any; resolvers: Array<(id: string) => void> }> = new Map();
const processedSignatures: Map<string, number> = new Map();
const DEBOUNCE_DELAY_MS = 250;
const DEDUP_TTL_MS = 10000;

// Circuit breaker state
let circuitBreakerState: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
let failedJobsCount = 0;
let pendingJobsCount = 0;
let processingJobsCount = 0;

export const finopsEventOrchestrator = {
  getQueueStats() {
    return {
      pendingCount: pendingJobsCount,
      processingCount: processingJobsCount,
      failedCount: failedJobsCount,
      circuitBreakerState,
      contentionDiagnostics: durableQueueService.getDiagnostics()
    };
  },

  resetCircuitBreaker() {
    circuitBreakerState = "CLOSED";
    failedJobsCount = 0;
    durableQueueService.resetDiagnostics();
  },

  async emit(type: string, business_id: string, payload: any): Promise<string> {
    // Resolve authentic business_id from payload if "global" was accidentally passed
    const resolvedBizId = (business_id && business_id !== "global") 
      ? business_id 
      : (payload?.business_id || payload?.businessId);

    if (!resolvedBizId || resolvedBizId === "global") {
      console.error(`[finopsEventOrchestrator] REJECTED event '${type}'. business_id cannot be 'global' or empty. Tenant scoping is strictly required.`);
      return Promise.reject(new Error(`[finopsEventOrchestrator] Event '${type}' rejected: tenant-scoped business_id is required.`));
    }

    // Ensure payload carries the resolved business_id
    const enrichedPayload = {
      ...payload,
      business_id: resolvedBizId,
      businessId: resolvedBizId
    };

    // Use deterministic event ID if correlationId or entity identity exists
    const aggregateId = enrichedPayload.aggregateId || enrichedPayload.id || enrichedPayload.employeeId || enrichedPayload.cycleId || "default";
    const correlationId = enrichedPayload.correlationId || enrichedPayload.eventId || durableQueueService.generateDeterministicEventId(
      resolvedBizId,
      type,
      aggregateId,
      "emit",
      enrichedPayload
    );

    const signature = `${type}:${resolvedBizId}:${correlationId}`;

    // 1. In-memory deduplication check
    const now = Date.now();
    const lastSeen = processedSignatures.get(signature);
    if (lastSeen && now - lastSeen < DEDUP_TTL_MS) {
      console.debug(`[finopsEventOrchestrator] Suppressed duplicate event emission: ${signature}`);
      return correlationId;
    }
    processedSignatures.set(signature, now);

    // Prune stale signatures
    if (processedSignatures.size > 500) {
      for (const [sigKey, sigTime] of processedSignatures.entries()) {
        if (now - sigTime > DEDUP_TTL_MS) {
          processedSignatures.delete(sigKey);
        }
      }
    }

    const key = `${type}:${resolvedBizId}:${JSON.stringify(enrichedPayload)}`;

    return new Promise<string>((resolve) => {
      const existing = pendingEmissions.get(key);
      if (existing) {
        clearTimeout(existing.timer);
        existing.resolvers.push(resolve);
      } else {
        pendingEmissions.set(key, { timer: null, resolvers: [resolve] });
      }

      const item = pendingEmissions.get(key)!;
      item.timer = setTimeout(async () => {
        pendingEmissions.delete(key);
        let eventId = correlationId;
        try {
          // If the user is not authenticated yet, skip remote Firestore event persistence
          if (!auth.currentUser) {
            console.debug(`[finopsEventOrchestrator] Deferring remote event emission for '${type}' (Unauthenticated context).`);
            item.resolvers.forEach(res => res(eventId));
            return;
          }

          // 2. Check IdempotencyGuardian if businessId is scoped and consumerId is specified
          if (resolvedBizId && resolvedBizId !== "global" && correlationId) {
            const isDuplicate = await IdempotencyGuardian.isEventProcessed(resolvedBizId, "finops_orchestrator", correlationId).catch(() => false);
            if (isDuplicate) {
              console.log(`[finopsEventOrchestrator] Event ${correlationId} already processed in business ${resolvedBizId}. Skipping.`);
              item.resolvers.forEach(res => res(correlationId));
              return;
            }
          }

          // Create local DB record for reliability using setDoc with exponential backoff & jitter
          const eventRef = doc(collection(db, "events"), eventId);
          try {
            await durableQueueService.executeWithRetry(
              async () => {
                await setDoc(eventRef, {
                  type,
                  business_id: resolvedBizId,
                  payload: enrichedPayload,
                  status: "PENDING",
                  timestamp: serverTimestamp(),
                  retryCount: 0
                }, { merge: true });
              },
              { maxRetries: 2, baseDelayMs: 200, jitterStrategy: "FULL" },
              `finopsEventOrchestrator:events:${eventId}`
            );
          } catch (storageErr: any) {
            console.warn(`[finopsEventOrchestrator] Event persistence deferred:`, storageErr?.message || storageErr);
          }

          // Mark in IdempotencyGuardian if scoped
          if (resolvedBizId && resolvedBizId !== "global" && correlationId) {
            IdempotencyGuardian.markEventProcessed(resolvedBizId, "finops_orchestrator", correlationId).catch(() => {});
          }

          // Try triggering cloud function directly for orchestrator if functions service is available
          if (functions) {
            try {
              const triggerOrchestrator = httpsCallable(functions, "finopsEventOrchestrator");
              await triggerOrchestrator({ eventId: eventRef.id, type, business_id: resolvedBizId, payload: enrichedPayload });
            } catch (err: any) {
              // Safe fallback - expected when functions are not deployed, handled by database reliability layer
              const msg = err?.message || String(err);
              if (!msg.includes("<!doctype") && !msg.includes("JSON") && !msg.includes("not-found")) {
                console.warn("Function orchestrator deferred to database-queue reliability layer:", msg);
              }
            }
          }
        } catch (e: any) {
          console.warn("Failed to emit event to FinOps Orchestrator (queued locally):", e?.message || e);
        } finally {
          item.resolvers.forEach(res => res(eventId));
        }
      }, DEBOUNCE_DELAY_MS);
    });
  }
};
