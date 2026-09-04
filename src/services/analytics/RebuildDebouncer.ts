// src/services/analytics/RebuildDebouncer.ts
import { SnapshotRebuildService } from "../SnapshotRebuildService";

export class RebuildDebouncer {
  private static debounceTimers = new Map<string, NodeJS.Timeout>();
  private static pendingQueues = new Map<string, Map<string, number>>();

  /**
   * Queues a snapshot rebuild for a business with a 300ms debounce window.
   */
  public static queueRebuild(businessId: string, mutationType: string): void {
    if (!businessId) return;

    console.log(`[RebuildDebouncer] Queuing rebuild for business ${businessId} on mutation: ${mutationType}`);

    // Update pending mutation counters
    if (!this.pendingQueues.has(businessId)) {
      this.pendingQueues.set(businessId, new Map<string, number>());
    }
    const businessMap = this.pendingQueues.get(businessId)!;
    businessMap.set(mutationType, (businessMap.get(mutationType) || 0) + 1);

    // Debounce the flush execution
    if (this.debounceTimers.has(businessId)) {
      clearTimeout(this.debounceTimers.get(businessId)!);
    }

    const timer = setTimeout(() => {
      this.flushRebuilds(businessId).catch((err) => {
        console.error(`[RebuildDebouncer] Failed flushing rebuilds for ${businessId}:`, err);
      });
    }, 300);

    this.debounceTimers.set(businessId, timer);
  }

  /**
   * Forces an immediate rebuild of all queued rebuilds for the given business.
   */
  public static async flushRebuilds(businessId: string): Promise<void> {
    if (!businessId) return;

    // Clear debounce timer if present
    if (this.debounceTimers.has(businessId)) {
      clearTimeout(this.debounceTimers.get(businessId)!);
      this.debounceTimers.delete(businessId);
    }

    const mutations = this.getPendingRebuilds(businessId);
    if (mutations.length === 0) {
      return;
    }

    console.log(`[RebuildDebouncer] Flushing rebuilds for business ${businessId}. Batched mutations:`, mutations);
    
    // Clear pending queue before proceeding to avoid race conditions
    this.pendingQueues.delete(businessId);

    // Call the central SnapshotRebuildService to rebuild
    await SnapshotRebuildService.rebuildActivityTable(businessId);
  }

  /**
   * Returns a list of pending rebuilds for the given business.
   */
  public static getPendingRebuilds(businessId: string): { mutationType: string; count: number }[] {
    const businessMap = this.pendingQueues.get(businessId);
    if (!businessMap) return [];

    const results: { mutationType: string; count: number }[] = [];
    businessMap.forEach((count, mutationType) => {
      results.push({ mutationType, count });
    });
    return results;
  }
}
