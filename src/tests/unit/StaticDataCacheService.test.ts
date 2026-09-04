import { describe, it, expect, beforeEach, vi } from "vitest";
import { StaticDataCacheService, CACHE_TTL_POLICIES } from "../../services/cache/StaticDataCacheService";
import { idbCache } from "../../services/cache/idb";
import { EventBus } from "../../modules/runtime/EventBus";

describe("StaticDataCacheService Unit Tests", () => {
  beforeEach(async () => {
    await StaticDataCacheService.clearAll();
    vi.clearAllMocks();
  });

  it("should retrieve data from fetcher when cache is cold and store it in cache", async () => {
    const fetcher = vi.fn().mockResolvedValue({ USD: 132.5, HTG: 1.0 });

    const result1 = await StaticDataCacheService.getOrFetch(
      "test_rates_key",
      fetcher,
      {
        category: "EXCHANGE_RATES",
        businessId: "biz_123"
      }
    );

    expect(result1).toEqual({ USD: 132.5, HTG: 1.0 });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Second call should hit the cache without calling fetcher again
    const result2 = await StaticDataCacheService.getOrFetch(
      "test_rates_key",
      fetcher,
      {
        category: "EXCHANGE_RATES",
        businessId: "biz_123"
      }
    );

    expect(result2).toEqual({ USD: 132.5, HTG: 1.0 });
    expect(fetcher).toHaveBeenCalledTimes(1); // Still 1
  });

  it("should bypass cache when forceRefresh is true", async () => {
    let callCount = 0;
    const fetcher = vi.fn().mockImplementation(async () => {
      callCount++;
      return { version: callCount };
    });

    const res1 = await StaticDataCacheService.getOrFetch(
      "force_refresh_key",
      fetcher,
      { category: "GENERAL" }
    );
    expect(res1).toEqual({ version: 1 });

    const res2 = await StaticDataCacheService.getOrFetch(
      "force_refresh_key",
      fetcher,
      { category: "GENERAL", forceRefresh: true }
    );
    expect(res2).toEqual({ version: 2 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("should invalidate key and clear category correctly", async () => {
    const fetcherRates = vi.fn().mockResolvedValue({ rate: 135.0 });
    const fetcherTax = vi.fn().mockResolvedValue({ ona: 0.06 });

    await StaticDataCacheService.getOrFetch("rate_key", fetcherRates, { category: "EXCHANGE_RATES" });
    await StaticDataCacheService.getOrFetch("tax_key", fetcherTax, { category: "TAX_CONFIG" });

    // Invalidate single key
    await StaticDataCacheService.invalidateKey("rate_key");
    const cachedRate = await idbCache.get("rate_key");
    expect(cachedRate).toBeNull();

    // Tax key is still present
    const cachedTax = await idbCache.get("tax_key");
    expect(cachedTax).toEqual({ ona: 0.06 });

    // Invalidate entire TAX_CONFIG category
    await StaticDataCacheService.invalidateCategory("TAX_CONFIG");
    const cachedTaxAfter = await idbCache.get("tax_key");
    expect(cachedTaxAfter).toBeNull();
  });

  it("should react to EventBus events for cache invalidation", async () => {
    const fetcherTax = vi.fn().mockResolvedValue({ cnssRateEmployee: 0.06 });
    await StaticDataCacheService.getOrFetch(
      "tax_config:biz_event_test",
      fetcherTax,
      { category: "TAX_CONFIG", businessId: "biz_event_test" }
    );

    // Verify it is cached
    const cachedBefore = await idbCache.get("tax_config:biz_event_test");
    expect(cachedBefore).toEqual({ cnssRateEmployee: 0.06 });

    // Publish TaxConfigurationUpdated event
    EventBus.publish(EventBus.createEvent({
      correlationId: "test_corr_1",
      actorId: "actor_admin",
      businessId: "biz_event_test",
      module: "PAYROLL",
      aggregate: "BUSINESS_SETTINGS",
      type: "TaxConfigurationUpdated",
      payload: { businessId: "biz_event_test", updates: { cnssRateEmployee: 0.07 } }
    }));

    // Allow event loop to process async handler
    await new Promise((resolve) => setTimeout(resolve, 50));

    const cachedAfter = await idbCache.get("tax_config:biz_event_test");
    expect(cachedAfter).toBeNull();
  });
});
