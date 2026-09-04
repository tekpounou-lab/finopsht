// src/repositories/CurrencyRateRepository.ts

import { db } from "@/lib/firebase";
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit, 
  serverTimestamp 
} from "firebase/firestore";
import { AuditService } from "@/services/audit/AuditService";
import { EventBus } from "@/modules/runtime/EventBus";
import { StaticDataCacheService } from "@/services/cache/StaticDataCacheService";

export interface ExchangeRate {
  id: string;                    // e.g., "USD_HTG_2026-08-10"
  businessId: string;            // Tenant ID ("SYSTEM" for global default rate)
  fromCurrency: "HTG" | "USD";   // Source currency
  toCurrency: "HTG" | "USD";     // Target currency
  rate: number;                  // Ex: 135 (USD to HTG)
  effectiveDate: string;         // YYYY-MM-DD
  source: "BRH" | "ADMIN_OVERRIDE";
  actorId: string;
  justification?: string;
  createdAt: any;
  updatedAt: any;
}

/**
 * CurrencyRateRepository handles querying historical and active exchange rates.
 * Implements local in-memory caching to support rapid conversions during heavy loops.
 */
export class CurrencyRateRepository {
  private static readonly COLLECTION_NAME = "exchange_rates";
  private static readonly DEFAULT_RATE = 135.0; // Standard USD -> HTG
  
  // Local cache to prevent redundant database lookups (Key: "businessId:fromCurrency:toCurrency:date", value: { rate, expiresAt })
  private static cache = new Map<string, { rate: number; expiresAt: number }>();
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 Minutes TTL

  /**
   * Generates a unique cache key
   */
  private static getCacheKey(businessId: string, from: string, to: string, date: string): string {
    return `${businessId}:${from}:${to}:${date}`;
  }

  /**
   * Clears the exchange rates cache.
   * If a businessId is provided, clears only entries for that business.
   */
  public static clearCache(businessId?: string): void {
    if (businessId) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${businessId}:`)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  /**
   * Resolves the latest exchange rate for a given business.
   * If not overridden for the business, falls back to the authoritative "SYSTEM" rate.
   */
  public static async getLatestRate(
    businessId: string,
    fromCurrency: "HTG" | "USD" = "USD",
    toCurrency: "HTG" | "USD" = "HTG"
  ): Promise<number> {
    const todayStr = new Date().toISOString().split("T")[0];
    return this.getRateAtDate(businessId, fromCurrency, toCurrency, todayStr);
  }

  /**
   * Finds the effective rate on a specific date.
   * Traverses backward to locate the nearest active rate if no exact match exists.
   */
  public static async getRateAtDate(
    businessId: string,
    fromCurrency: "HTG" | "USD",
    toCurrency: "HTG" | "USD",
    date: string // YYYY-MM-DD format
  ): Promise<number> {
    // 1. Identical conversion is always 1.0
    if (fromCurrency === toCurrency) return 1.0;

    const cacheKey = this.getCacheKey(businessId, fromCurrency, toCurrency, date);
    const cached = this.cache.get(cacheKey);
    
    if (cached && cached.expiresAt > Date.now()) {
      return cached.rate;
    }

    return await StaticDataCacheService.getOrFetch(
      `exchange_rate:${cacheKey}`,
      async () => {
        let rate = this.DEFAULT_RATE;
        try {
          // 2. Query tenant-specific rates up to the specified effective date
          const tenantRate = await this.queryFirestoreRate(businessId, fromCurrency, toCurrency, date);
          
          if (tenantRate !== null) {
            rate = tenantRate;
          } else {
            // 3. Fall back to authoritative global "SYSTEM" rates
            const systemRate = await this.queryFirestoreRate("SYSTEM", fromCurrency, toCurrency, date);
            if (systemRate !== null) {
              rate = systemRate;
            }
          }
        } catch (error) {
          console.error(`[CurrencyRateRepository] Error resolving rate at ${date}:`, error);
        }

        // Cache the resolved rate in in-memory layer
        this.cache.set(cacheKey, {
          rate,
          expiresAt: Date.now() + this.CACHE_TTL_MS
        });

        return rate;
      },
      {
        category: "EXCHANGE_RATES",
        businessId
      }
    );
  }

  /**
   * Helper to fetch the latest rate effective on or before a given date from Firestore.
   */
  private static async queryFirestoreRate(
    businessId: string,
    from: string,
    to: string,
    dateLimit: string
  ): Promise<number | null> {
    const q = query(
      collection(db, this.COLLECTION_NAME),
      where("businessId", "==", businessId),
      where("fromCurrency", "==", from),
      where("toCurrency", "==", to),
      where("effectiveDate", "<=", dateLimit),
      orderBy("effectiveDate", "desc"),
      limit(1)
    );

    const snap = await getDocs(q);
    if (!snap.empty) {
      const data = snap.docs[0].data();
      return data.rate as number;
    }
    return null;
  }

  /**
   * Registers a new exchange rate or override.
   * Records a forensic audit log of the operation.
   */
  public static async setRate(
    rateData: Omit<ExchangeRate, "createdAt" | "updatedAt">
  ): Promise<void> {
    const id = `${rateData.fromCurrency}_${rateData.toCurrency}_${rateData.effectiveDate}`;
    const docRef = doc(db, this.COLLECTION_NAME, id);

    const fullRecord = {
      ...rateData,
      id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(docRef, fullRecord, { merge: true });

    // Invalidate local cache for this specific partition and date
    const cacheKey = this.getCacheKey(rateData.businessId, rateData.fromCurrency, rateData.toCurrency, rateData.effectiveDate);
    this.cache.delete(cacheKey);
    await StaticDataCacheService.invalidateKey(`exchange_rate:${cacheKey}`);

    // Forensic audit trails recording
    await AuditService.writeLog({
      timestamp: new Date().toISOString(),
      userId: rateData.actorId,
      business_id: rateData.businessId,
      action: "EXCHANGE_RATE_SET",
      module: "FINANCE",
      operation: "setRate",
      severity: "MEDIUM",
      message: `Set exchange rate ${rateData.fromCurrency} -> ${rateData.toCurrency} to ${rateData.rate} (Source: ${rateData.source}). Justification: ${rateData.justification || "N/A"}`
    });

    // Notify listeners via EventBus
    EventBus.publish(EventBus.createEvent({
      correlationId: `rate_set_${Date.now()}`,
      actorId: rateData.actorId,
      businessId: rateData.businessId,
      module: "FINANCE",
      aggregate: "EXCHANGE_RATE",
      type: "ExchangeRateUpdated",
      payload: {
        from: rateData.fromCurrency,
        to: rateData.toCurrency,
        rate: rateData.rate,
        effectiveDate: rateData.effectiveDate
      }
    }));
  }

  /**
   * Translates a financial amount using the historical rate on the specified date.
   */
  public static async convert(
    amount: number,
    fromCurrency: "HTG" | "USD",
    toCurrency: "HTG" | "USD",
    businessId: string,
    date?: string
  ): Promise<number> {
    if (fromCurrency === toCurrency) return amount;
    
    const lookupDate = date || new Date().toISOString().split("T")[0];
    const rate = await this.getRateAtDate(businessId, fromCurrency, toCurrency, lookupDate);

    // If converting from a weaker currency to a stronger one (e.g. HTG -> USD) where the rate stored is USD -> HTG
    if (fromCurrency === "HTG" && toCurrency === "USD") {
      const inverseRate = await this.getRateAtDate(businessId, "USD", "HTG", lookupDate);
      return inverseRate > 0 ? amount / inverseRate : amount / this.DEFAULT_RATE;
    }

    return amount * rate;
  }
}
