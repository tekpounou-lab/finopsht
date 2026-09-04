// src/services/performance/CacheInvalidationService.ts

import { EventBus } from "@/modules/runtime/EventBus";
import { FeatureResolver } from "@/services/FeatureResolver";
import { CurrencyRateRepository } from "@/repositories/CurrencyRateRepository";
import { clearResilientCache, invalidateResilientDoc } from "@/utils/resilientFirestore";
import { DashboardQueryService } from "@/services/query/DashboardQueryService";
import { EmployeeQueryService } from "@/services/query/EmployeeQueryService";
import { PermissionService } from "@/services/PermissionService";
import { AnalyticsRepository } from "@/domains/analytics/repositories/AnalyticsRepository";
import { WorkflowRepository } from "@/modules/workflow/WorkflowRepository";
import { ApprovalRepository } from "@/modules/workflow/approval/ApprovalRepository";
import { realtimeManager } from "@/services/firestore/realtimeManager";
import { OptimizedResolver } from "@/services/identity/OptimizedResolver";
import { BusinessResolver } from "@/services/business/BusinessResolver";

const BROADCAST_CHANNEL_NAME = "finops_cache_invalidation";

const channel = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel(BROADCAST_CHANNEL_NAME)
  : null;

export interface CacheRefreshPayload {
  businessId?: string;
  refresh: boolean;
  sweepVersion: number;
}

/**
 * CacheInvalidationService provides unified and centralized cache control.
 * Coordinates invalidations across Feature Resolver, Currency Rates, Resilient Firestore,
 * and Query performance caches, with cross-tab replication via BroadcastChannel.
 */
export class CacheInvalidationService {
  private static isSubscribed = false;
  private static sweepCount = 0;
  private static refreshListeners = new Set<(payload: CacheRefreshPayload) => void>();

  /**
   * Current sweep version counter, monotonically increasing on every cache sweep.
   */
  public static getSweepVersion(): number {
    return this.sweepCount;
  }

  /**
   * Subscribes a listener (such as React hooks) to be notified whenever a cache sweep & refresh occurs.
   */
  public static subscribeToRefresh(callback: (payload: CacheRefreshPayload) => void): () => void {
    this.refreshListeners.add(callback);
    return () => {
      this.refreshListeners.delete(callback);
    };
  }

  /**
   * Initializes the cache invalidation service.
   * Subscribes to cache-busting EventBus events and configures the BroadcastChannel.
   */
  public static initialize(): void {
    if (this.isSubscribed) return;
    this.isSubscribed = true;

    // 1. Subscribe to local EventBus for cache-busting events
    EventBus.subscribe("*", (event) => {
      const eventType = event.type;
      
      // We listen to all feature, exchange rate, tax, and ledger reversal/update events
      const isCacheBustingEvent = [
        "FeatureUpdated",
        "FEATURE_CACHE_INVALIDATED",
        "ExchangeRateUpdated",
        "TaxConfigurationUpdated",
        "TaxConfigUpdated",
        "BUSINESS_SETTINGS_UPDATED",
        "BusinessSettingsUpdated",
        "LEDGER_TRANSACTION_REVERSED",
        "LEDGER_TRANSACTION_RECORDED",
        "LEDGER_BATCH_TRANSACTIONS_RECORDED"
      ].includes(eventType);

      if (isCacheBustingEvent) {
        const businessId = event.businessId || (event.payload && event.payload.businessId);
        
        // Prevent recursive broadcasting loop if event was originally received from BroadcastChannel
        const isRemote = event.payload?.remote || 
                        event.correlationId?.startsWith("bc_") || 
                        event.correlationId?.startsWith("rate_set_");

        console.debug(`[CacheInvalidationService] Intercepted event "${eventType}" for business "${businessId || "all"}" (broadcast: ${!isRemote})`);
        
        this.sweep(businessId, !isRemote, true); // Only broadcast if it is locally originated!
      }
    });

    // 2. Set up BroadcastChannel to handle incoming cache invalidation triggers from other tabs
    if (channel) {
      channel.onmessage = (event) => {
        try {
          if (event.data && event.data.type === "CENTRAL_CACHE_INVALIDATED") {
            const { businessId, refresh = true } = event.data;
            console.debug(`[CacheInvalidationService] Received BroadcastChannel sweep command for business "${businessId || "all"}" (refresh: ${refresh})`);
            this.sweepLocal(businessId, refresh);
            
            // Publish a local event to let active UI context layers know that cache was invalidated remotely
            try {
              EventBus.publish(EventBus.createEvent({
                correlationId: `bc_sweep_${businessId || 'all'}_${Date.now()}`,
                businessId: businessId || undefined,
                module: "CacheInvalidationService",
                aggregate: "SystemCache",
                type: "CACHE_SWEEP_COMPLETE",
                payload: { businessId, remote: true, refresh, sweepVersion: this.sweepCount }
              }));
            } catch (err) {
              console.warn("[CacheInvalidationService] Failed to publish local EventBus sync notification:", err);
            }
          } else if (event.data && event.data.type === "DOC_CACHE_INVALIDATED") {
            const { path, version } = event.data;
            console.debug(`[CacheInvalidationService] Received BroadcastChannel invalidate doc "${path}" (v: ${version ?? 'any'})`);
            invalidateResilientDoc(path, version);
          }
        } catch (err) {
          console.error("[CacheInvalidationService] Error processing BroadcastChannel message:", err);
        }
      };
    }
  }

  /**
   * Invalidates a specific document cache entry locally and broadcasts to other tabs.
   * If a version is provided, invalidation occurs only if cached version <= new version.
   */
  public static invalidateDocument(path: string, version?: number | string, broadcast = true): void {
    invalidateResilientDoc(path, version);
    if (broadcast && channel) {
      try {
        channel.postMessage({
          type: "DOC_CACHE_INVALIDATED",
          path,
          version
        });
      } catch (err) {
        console.warn("[CacheInvalidationService] Failed to broadcast DOC_CACHE_INVALIDATED:", err);
      }
    }
  }

  /**
   * Performs a comprehensive cache invalidation across all domain layers on the local tab,
   * and optionally broadcasts the instruction to all other open browser tabs.
   */
  public static sweep(businessId?: string, broadcast = true, refresh = true): void {
    // 1. Perform local sweep
    this.sweepLocal(businessId, refresh);

    // 2. Broadcast to other tabs
    if (broadcast && channel) {
      try {
        channel.postMessage({
          type: "CENTRAL_CACHE_INVALIDATED",
          businessId,
          refresh
        });
        console.debug(`[CacheInvalidationService] Broadcasted CENTRAL_CACHE_INVALIDATED for "${businessId || "all"}" to other tabs`);
      } catch (err) {
        console.warn("[CacheInvalidationService] Failed to broadcast cache invalidation message:", err);
      }
    }
  }

  /**
   * Sweeps all local domain caches on the current tab.
   * When refresh is true (default), increments sweepVersion and notifies all subscribing hooks/components to re-fetch.
   */
  public static sweepLocal(businessId?: string, refresh = true): void {
    this.sweepCount++;
    const currentVersion = this.sweepCount;
    console.debug(`[CacheInvalidationService] Sweeping local caches for "${businessId || "all"}" (version: ${currentVersion}, refresh: ${refresh})`);

    // 1. Invalidate Feature Flags cache
    try {
      FeatureResolver.clearCacheLocal(businessId);
    } catch (err) {
      console.warn("[CacheInvalidationService] Error invalidating FeatureResolver cache:", err);
    }

    // 2. Invalidate Currency Rate Repository cache
    try {
      CurrencyRateRepository.clearCache(businessId);
    } catch (err) {
      console.warn("[CacheInvalidationService] Error invalidating CurrencyRateRepository cache:", err);
    }

    // 3. Invalidate Resilient Firestore memory cache (for tax configs, settings docs, etc.)
    try {
      clearResilientCache(businessId);
    } catch (err) {
      console.warn("[CacheInvalidationService] Error invalidating ResilientFirestore cache:", err);
    }

    // 4. Invalidate Dashboard Query metrics cache
    try {
      DashboardQueryService.invalidateCache(businessId);
    } catch (err) {
      console.warn("[CacheInvalidationService] Error invalidating DashboardQueryService cache:", err);
    }

    // 5. Invalidate Employee Query cache
    try {
      EmployeeQueryService.invalidateCache(businessId);
    } catch (err) {
      console.warn("[CacheInvalidationService] Error invalidating EmployeeQueryService cache:", err);
    }

    // 6. Invalidate Permission Service capability cache
    try {
      PermissionService.invalidateCache();
    } catch (err) {
      console.warn("[CacheInvalidationService] Error invalidating PermissionService cache:", err);
    }

    // 7. Invalidate Analytics Repository query cache
    try {
      AnalyticsRepository.invalidateCache();
    } catch (err) {
      console.warn("[CacheInvalidationService] Error invalidating AnalyticsRepository cache:", err);
    }

    // 8. Invalidate Workflow and Approval Repositories cache
    try {
      WorkflowRepository.invalidateCache();
      ApprovalRepository.invalidateCache();
    } catch (err) {
      console.warn("[CacheInvalidationService] Error invalidating Workflow caches:", err);
    }

    // 9. Clear cached lastSnapshot in realtimeManager so next reads get fresh Firestore state
    try {
      realtimeManager.clearSnapshotCache(businessId);
    } catch (err) {
      console.warn("[CacheInvalidationService] Error invalidating RealtimeManager snapshot cache:", err);
    }

    // 10. Invalidate Tenant and Business Resolver sessionStorage & memory caches
    if (businessId) {
      try {
        OptimizedResolver.invalidateTenantCache(businessId);
        BusinessResolver.invalidateCache(businessId);
      } catch (err) {
        console.warn("[CacheInvalidationService] Error invalidating Resolver caches:", err);
      }
    }

    // 11. Notify active hooks and modules to refresh their state
    if (refresh) {
      const payload: CacheRefreshPayload = {
        businessId,
        refresh: true,
        sweepVersion: currentVersion
      };

      this.refreshListeners.forEach((listener) => {
        try {
          listener(payload);
        } catch (e) {
          console.error("[CacheInvalidationService] Error in refresh listener:", e);
        }
      });

      try {
        EventBus.publish(EventBus.createEvent({
          correlationId: `sweep_refresh_${businessId || 'all'}_${currentVersion}`,
          businessId: businessId || undefined,
          module: "CacheInvalidationService",
          aggregate: "SystemCache",
          type: "CACHE_SWEEP_COMPLETE",
          payload
        }));
      } catch (e) {
        // Safe fallback if EventBus not ready in tests
      }
    }
  }
}
