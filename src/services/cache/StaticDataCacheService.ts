import { idbCache, CacheEntry } from "./idb";
import { EventBus } from "../../modules/runtime/EventBus";

export const CACHE_TTL_POLICIES = {
  CHART_OF_ACCOUNTS: 24 * 60 * 60 * 1000, // 24 Hours
  EXCHANGE_RATES: 60 * 60 * 1000,         // 1 Hour
  TAX_CONFIG: 24 * 60 * 60 * 1000,        // 24 Hours
  ORGANIZATION_META: 24 * 60 * 60 * 1000, // 24 Hours
  GENERAL: 30 * 60 * 1000                 // 30 Minutes
} as const;

export interface CacheFetchOptions<T> {
  ttlMs?: number;
  category: CacheEntry["category"];
  businessId?: string;
  forceRefresh?: boolean;
}

export class StaticDataCacheService {
  private static isSubscribedToEvents = false;

  /**
   * Initializes real-time cache invalidation listeners on the Enterprise EventBus.
   */
  public static initEventListeners(): void {
    if (this.isSubscribedToEvents) return;
    this.isSubscribedToEvents = true;

    EventBus.subscribe("ExchangeRateUpdated", async (event) => {
      const { businessId, from, to } = event.payload || {};
      console.debug("[StaticDataCacheService] Invalidation triggered by ExchangeRateUpdated:", event.payload);
      if (businessId) {
        await this.invalidateCategory("EXCHANGE_RATES");
      }
    });

    EventBus.subscribe("TaxConfigurationUpdated", async (event) => {
      const { businessId } = event.payload || {};
      console.debug("[StaticDataCacheService] Invalidation triggered by TaxConfigurationUpdated:", event.payload);
      if (businessId) {
        await idbCache.delete(`tax_config:${businessId}`);
      } else {
        await this.invalidateCategory("TAX_CONFIG");
      }
    });

    EventBus.subscribe("BusinessUpdated", async (event) => {
      const { businessId } = event.payload || {};
      if (businessId) {
        await idbCache.delete(`org_meta:${businessId}`);
      }
    });
  }

  /**
   * Universal cache-aside accessor with TTL and category tagging.
   */
  public static async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheFetchOptions<T>
  ): Promise<T> {
    const { ttlMs, category, businessId, forceRefresh } = options;
    const effectiveTtl = ttlMs ?? CACHE_TTL_POLICIES[category] ?? CACHE_TTL_POLICIES.GENERAL;

    if (!forceRefresh) {
      const cached = await idbCache.get<T>(key);
      if (cached !== null && cached !== undefined) {
        return cached;
      }
    }

    const freshData = await fetcher();
    if (freshData !== null && freshData !== undefined) {
      await idbCache.set<T>(key, freshData, effectiveTtl, category, businessId);
    }

    return freshData;
  }

  /**
   * Invalidate a single cache key.
   */
  public static async invalidateKey(key: string): Promise<void> {
    await idbCache.delete(key);
  }

  /**
   * Invalidate all data for a specific business tenant.
   */
  public static async invalidateBusiness(businessId: string): Promise<void> {
    await idbCache.clearByBusiness(businessId);
  }

  /**
   * Invalidate all entries for an entire data category.
   */
  public static async invalidateCategory(category: CacheEntry["category"]): Promise<void> {
    await idbCache.clearByCategory(category);
  }

  /**
   * Clears the entire IndexedDB static data cache.
   */
  public static async clearAll(): Promise<void> {
    await idbCache.clearAll();
  }

  /**
   * Garbage collector for expired records.
   */
  public static async pruneExpired(): Promise<number> {
    return await idbCache.sweepExpired();
  }
}

// Auto-initialize event listeners
StaticDataCacheService.initEventListeners();
