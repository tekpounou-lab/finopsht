import { openDB, IDBPDatabase } from "idb";

export interface CacheEntry<T = any> {
  key: string;
  businessId?: string;
  category: "CHART_OF_ACCOUNTS" | "EXCHANGE_RATES" | "TAX_CONFIG" | "ORGANIZATION_META" | "GENERAL";
  data: T;
  timestamp: number;
  ttlMs: number;
  expiresAt: number;
}

const DB_NAME = "finops_erp_static_cache";
const DB_VERSION = 1;
const STORE_NAME = "cache_entries";

let dbPromise: Promise<IDBPDatabase> | null = null;

function isIndexedDBAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

async function getDB(): Promise<IDBPDatabase | null> {
  if (!isIndexedDBAvailable()) {
    return null;
  }

  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
          store.createIndex("by_businessId", "businessId", { unique: false });
          store.createIndex("by_category", "category", { unique: false });
          store.createIndex("by_expiresAt", "expiresAt", { unique: false });
        }
      }
    });
  }

  return dbPromise;
}

// In-memory fallback if IndexedDB is not available or disabled (e.g., SSR or private mode quirks)
const memoryFallback = new Map<string, CacheEntry>();

export const idbCache = {
  /**
   * Retrieves an item from the cache.
   * Returns null if missing or expired.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const db = await getDB();
      let entry: CacheEntry<T> | undefined;

      if (db) {
        entry = await db.get(STORE_NAME, key);
      } else {
        entry = memoryFallback.get(key) as CacheEntry<T> | undefined;
      }

      if (!entry) return null;

      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        await this.delete(key);
        return null;
      }

      return entry.data;
    } catch (err) {
      console.warn(`[idbCache] Error reading key "${key}":`, err);
      return null;
    }
  },

  /**
   * Stores an item with a specified TTL and category.
   */
  async set<T>(
    key: string,
    data: T,
    ttlMs: number,
    category: CacheEntry["category"] = "GENERAL",
    businessId?: string
  ): Promise<void> {
    const now = Date.now();
    const entry: CacheEntry<T> = {
      key,
      businessId,
      category,
      data,
      timestamp: now,
      ttlMs,
      expiresAt: now + ttlMs
    };

    try {
      const db = await getDB();
      if (db) {
        await db.put(STORE_NAME, entry);
      } else {
        memoryFallback.set(key, entry);
      }
    } catch (err) {
      console.warn(`[idbCache] Error writing key "${key}":`, err);
      memoryFallback.set(key, entry);
    }
  },

  /**
   * Deletes a specific key.
   */
  async delete(key: string): Promise<void> {
    try {
      const db = await getDB();
      if (db) {
        await db.delete(STORE_NAME, key);
      }
      memoryFallback.delete(key);
    } catch (err) {
      console.warn(`[idbCache] Error deleting key "${key}":`, err);
      memoryFallback.delete(key);
    }
  },

  /**
   * Invalidates all cache entries for a specific business tenant.
   */
  async clearByBusiness(businessId: string): Promise<void> {
    try {
      const db = await getDB();
      if (db) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const index = tx.store.index("by_businessId");
        let cursor = await index.openCursor(IDBKeyRange.only(businessId));
        while (cursor) {
          await cursor.delete();
          cursor = await cursor.continue();
        }
        await tx.done;
      }

      for (const [k, v] of memoryFallback.entries()) {
        if (v.businessId === businessId) {
          memoryFallback.delete(k);
        }
      }
    } catch (err) {
      console.warn(`[idbCache] Error clearing cache for business "${businessId}":`, err);
    }
  },

  /**
   * Invalidates all cache entries for a specific category.
   */
  async clearByCategory(category: CacheEntry["category"]): Promise<void> {
    try {
      const db = await getDB();
      if (db) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const index = tx.store.index("by_category");
        let cursor = await index.openCursor(IDBKeyRange.only(category));
        while (cursor) {
          await cursor.delete();
          cursor = await cursor.continue();
        }
        await tx.done;
      }

      for (const [k, v] of memoryFallback.entries()) {
        if (v.category === category) {
          memoryFallback.delete(k);
        }
      }
    } catch (err) {
      console.warn(`[idbCache] Error clearing cache for category "${category}":`, err);
    }
  },

  /**
   * Sweeps and deletes all expired entries.
   */
  async sweepExpired(): Promise<number> {
    let deletedCount = 0;
    const now = Date.now();
    try {
      const db = await getDB();
      if (db) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const index = tx.store.index("by_expiresAt");
        let cursor = await index.openCursor(IDBKeyRange.upperBound(now));
        while (cursor) {
          await cursor.delete();
          deletedCount++;
          cursor = await cursor.continue();
        }
        await tx.done;
      }

      for (const [k, v] of memoryFallback.entries()) {
        if (v.expiresAt <= now) {
          memoryFallback.delete(k);
          deletedCount++;
        }
      }
    } catch (err) {
      console.warn("[idbCache] Error sweeping expired entries:", err);
    }
    return deletedCount;
  },

  /**
   * Clears all cache entries completely.
   */
  async clearAll(): Promise<void> {
    try {
      const db = await getDB();
      if (db) {
        await db.clear(STORE_NAME);
      }
      memoryFallback.clear();
    } catch (err) {
      console.warn("[idbCache] Error clearing entire cache:", err);
      memoryFallback.clear();
    }
  }
};
