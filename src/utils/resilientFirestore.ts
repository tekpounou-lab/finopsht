import { 
  getDoc as firestoreGetDoc, 
  getDocFromCache, 
  getDocs as firestoreGetDocs, 
  getDocsFromCache, 
  DocumentReference, 
  Query, 
  DocumentSnapshot, 
  QuerySnapshot 
} from "firebase/firestore";
import { auth } from "../lib/firebase";

export class FirestoreNetworkError extends Error {
  public readonly isNetworkError = true;
  public readonly originalError: any;
  public readonly pathOrQuery?: string;

  constructor(message: string, originalError?: any, pathOrQuery?: string) {
    super(message);
    this.name = "FirestoreNetworkError";
    this.originalError = originalError;
    this.pathOrQuery = pathOrQuery;
  }
}

export function isNetworkError(err: any): boolean {
  if (!err) return false;
  if (err instanceof FirestoreNetworkError || err.isNetworkError) return true;
  const msg = (err.message || String(err)).toLowerCase();
  const code = (err.code || "").toLowerCase();
  return (
    code.includes("unavailable") ||
    code.includes("deadline-exceeded") ||
    code.includes("failed-precondition") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("quic") ||
    msg.includes("failed to fetch") ||
    msg.includes("err_name_not_resolved") ||
    msg.includes("err_quic_protocol_error") ||
    msg.includes("offline") ||
    msg.includes("transport")
  );
}

export function isPermissionError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  const code = (err.code || "").toLowerCase();
  return (
    code.includes("permission-denied") ||
    code.includes("unauthenticated") ||
    msg.includes("insufficient permissions") ||
    msg.includes("missing or insufficient permissions")
  );
}

/**
 * Calculates exponential backoff delay with full jitter (decorrelated jitter algorithm).
 */
export function calculateExponentialBackoffWithJitter(
  attempt: number,
  baseDelayMs: number = 300,
  maxDelayMs: number = 4000
): number {
  const expDelay = baseDelayMs * Math.pow(2, attempt);
  const jitteredDelay = baseDelayMs + Math.random() * (expDelay - baseDelayMs);
  return Math.min(maxDelayMs, Math.max(baseDelayMs, Math.floor(jitteredDelay)));
}

/**
 * Executes a promise with an explicit timeout to prevent hanging transport operations.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs = 5000, label = "Operation"): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new FirestoreNetworkError(`[NetworkTimeout] ${label} timed out after ${timeoutMs}ms`, null, label));
    }, timeoutMs);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// In-memory Query/Doc cache with differentiated TTL tiers and document versioning (_v)
export type CacheTier = "CRITICAL" | "OPERATIONAL" | "USER_PROFILE" | "DEFAULT";

export const CACHE_TIER_TTL_MS: Record<CacheTier, number> = {
  CRITICAL: 10 * 1000,          // 10s for financial volatility, rates, tax & locks
  OPERATIONAL: 2 * 60 * 1000,    // 2 min for org branches, departments, cost centers
  USER_PROFILE: 60 * 60 * 1000,  // 1 hour for static user profile & preferences
  DEFAULT: 20 * 1000,           // 20s standard fallback
};

export function resolveCacheTTL(pathOrKey: string, tier?: CacheTier, explicitTtlMs?: number): number {
  if (typeof explicitTtlMs === "number" && explicitTtlMs >= 0) {
    return explicitTtlMs;
  }
  if (tier && CACHE_TIER_TTL_MS[tier]) {
    return CACHE_TIER_TTL_MS[tier];
  }
  const lower = pathOrKey.toLowerCase();
  if (
    lower.includes("exchange_rates") ||
    lower.includes("currency_rates") ||
    lower.includes("tax_config") ||
    lower.includes("business_tax_configuration") ||
    lower.includes("payroll_cycles") ||
    lower.includes("bank_accounts") ||
    lower.includes("period_locks")
  ) {
    return CACHE_TIER_TTL_MS.CRITICAL;
  }
  if (
    lower.includes("branches") ||
    lower.includes("departments") ||
    lower.includes("cost_centers") ||
    lower.includes("business_units") ||
    lower.includes("roles")
  ) {
    return CACHE_TIER_TTL_MS.OPERATIONAL;
  }
  if (
    lower.includes("users/") ||
    lower.includes("profiles/") ||
    lower.includes("user_profiles") ||
    lower.includes("user_settings")
  ) {
    return CACHE_TIER_TTL_MS.USER_PROFILE;
  }
  return CACHE_TIER_TTL_MS.DEFAULT;
}

interface MemoryCacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
  version?: number | string;
}

const docMemoryCache = new Map<string, MemoryCacheEntry<DocumentSnapshot>>();
const queryMemoryCache = new Map<string, MemoryCacheEntry<QuerySnapshot>>();

// In-flight deduplication maps to coalesce simultaneous identical requests
const inFlightDocPromises = new Map<string, Promise<DocumentSnapshot>>();
const inFlightQueryPromises = new Map<string, Promise<QuerySnapshot>>();

const isDebugEnabled = typeof window !== "undefined" && 
  Boolean(import.meta.env?.DEV) && 
  import.meta.env?.VITE_DEBUG_FIRESTORE === "true";

export interface ResilientFetchOptions {
  forceRefresh?: boolean;
  maxRetries?: number;
  initialDelayMs?: number;
  timeoutMs?: number;
  fallbackToCache?: boolean;
  throwOnNetworkFailure?: boolean;
  cacheTier?: CacheTier;
  ttlMs?: number;
  expectedVersion?: number | string;
}

/**
 * Extracts document version (_v or version) if present in snapshot data.
 */
function extractDocVersion(snap: DocumentSnapshot): number | string | undefined {
  try {
    if (!snap.exists()) return undefined;
    const data = snap.data() as any;
    if (!data) return undefined;
    return data._v !== undefined ? data._v : data.version;
  } catch {
    return undefined;
  }
}

/**
 * Invalidate a cached document explicitly or conditionally if incoming version is strictly newer.
 */
export function invalidateResilientDoc(path: string, newVersion?: number | string): boolean {
  if (!docMemoryCache.has(path)) return false;
  if (newVersion !== undefined) {
    const cached = docMemoryCache.get(path);
    if (cached && cached.version !== undefined && cached.version >= newVersion) {
      return false; // Cached version is already equal or newer
    }
  }
  docMemoryCache.delete(path);
  return true;
}

/**
 * Invalidate a cached query explicitly by key.
 */
export function invalidateResilientQuery(cacheKey: string): boolean {
  return queryMemoryCache.delete(cacheKey);
}

/**
 * Resiliently fetch a single document with exponential backoff retry.
 * 1. Checks memory cache.
 * 2. Deduplicates concurrent in-flight requests for the exact same document.
 * 3. Attempts direct fetch with 3 retries (5s timeout each) and exponential backoff.
 * 4. Falls back to local persistent cache if network fails.
 * 5. Throws FirestoreNetworkError on network failure if document is not in cache.
 */
export async function resilientGetDoc(
  docRef: DocumentReference, 
  options: ResilientFetchOptions | boolean = false
): Promise<DocumentSnapshot> {
  const opts: ResilientFetchOptions = typeof options === "boolean" 
    ? { forceRefresh: options, maxRetries: 2, timeoutMs: 3500, initialDelayMs: 200, fallbackToCache: true, throwOnNetworkFailure: true }
    : { maxRetries: 2, timeoutMs: 3500, initialDelayMs: 200, fallbackToCache: true, throwOnNetworkFailure: true, ...options };

  const path = docRef.path;
  const ttlMs = resolveCacheTTL(path, opts.cacheTier, opts.ttlMs);
  
  if (!opts.forceRefresh) {
    const cached = docMemoryCache.get(path);
    if (cached && Date.now() - cached.timestamp < cached.ttlMs) {
      // Check version requirement if specified
      if (opts.expectedVersion === undefined || (cached.version !== undefined && cached.version >= opts.expectedVersion)) {
        return cached.data;
      }
    }
  }

  // Deduplicate concurrent in-flight requests
  if (!opts.forceRefresh && inFlightDocPromises.has(path)) {
    return inFlightDocPromises.get(path)!;
  }

  const executeFetch = async (): Promise<DocumentSnapshot> => {
    let lastError: any = null;
    const maxRetries = opts.maxRetries ?? 3;
    const timeoutMs = opts.timeoutMs ?? 5000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (isDebugEnabled) {
          console.debug(`[resilientGetDoc] Fetching ${path} (attempt ${attempt}/${maxRetries})`);
        }
        const snap = await withTimeout(firestoreGetDoc(docRef), timeoutMs, `getDoc(${path})`);
        const docVer = extractDocVersion(snap);
        docMemoryCache.set(path, { data: snap, timestamp: Date.now(), ttlMs, version: docVer });
        return snap;
      } catch (err: any) {
        lastError = err;
        const isPerm = isPermissionError(err);
        if (isPerm) {
          if (auth.currentUser && isDebugEnabled) {
            console.warn(`[resilientGetDoc] Permission denied for ${path}:`, err?.message || err);
          }
          break; // Deterministic error; do not loop 3 times
        }

        if (isDebugEnabled) {
          console.debug(`[resilientGetDoc] Attempt ${attempt}/${maxRetries} failed for ${path}:`, err?.message || err);
        }

        if (attempt < maxRetries) {
          const delay = calculateExponentialBackoffWithJitter(
            attempt - 1,
            opts.initialDelayMs || 300,
            4000
          );
          await sleep(delay);
        }
      }
    }

    // If network failed after retries, try reading from local offline cache
    if (opts.fallbackToCache !== false) {
      try {
        const cacheSnap = await getDocFromCache(docRef);
        if (isDebugEnabled) {
          console.debug(`[resilientGetDoc] Retrieved ${path} from offline cache fallback.`);
        }
        const docVer = extractDocVersion(cacheSnap);
        docMemoryCache.set(path, { data: cacheSnap, timestamp: Date.now(), ttlMs, version: docVer });
        return cacheSnap;
      } catch (cacheErr) {
        if (isDebugEnabled) {
          console.debug(`[resilientGetDoc] Cache fallback also failed for ${path}:`, cacheErr);
        }
      }
    }

    // Network failed and document is not in cache: DO NOT fake exists: false!
    if (opts.throwOnNetworkFailure !== false) {
      throw new FirestoreNetworkError(
        `Unable to fetch document ${path} due to network error.`,
        lastError,
        path
      );
    }

    // If caller specifically opted out of throwing (legacy fallback)
    return {
      exists: () => false,
      id: docRef.id,
      ref: docRef,
      data: () => undefined,
      get: () => undefined,
      metadata: { hasPendingWrites: false, fromCache: true }
    } as unknown as DocumentSnapshot;
  };

  const promise = executeFetch().finally(() => {
    inFlightDocPromises.delete(path);
  });

  if (!opts.forceRefresh) {
    inFlightDocPromises.set(path, promise);
  }

  return promise;
}

/**
 * Resiliently fetch a collection or query with exponential backoff retry and in-flight deduplication.
 */
export async function resilientGetDocs(
  q: Query, 
  cacheKey?: string, 
  options: ResilientFetchOptions | boolean = false
): Promise<QuerySnapshot> {
  const opts: ResilientFetchOptions = typeof options === "boolean"
    ? { forceRefresh: options, maxRetries: 2, timeoutMs: 3500, initialDelayMs: 200, fallbackToCache: true, throwOnNetworkFailure: false }
    : { maxRetries: 2, timeoutMs: 3500, initialDelayMs: 200, fallbackToCache: true, throwOnNetworkFailure: false, ...options };

  let key = cacheKey;
  if (!key) {
    try {
      const qAny = q as any;
      if (typeof qAny?._query?.canonicalId === "function") {
        key = qAny._query.canonicalId();
      } else if (typeof qAny?._query?.path?.canonicalString === "function") {
        key = qAny._query.path.canonicalString();
      } else if (qAny?._query?.path?.segments) {
        key = qAny._query.path.segments.join("/");
      } else if (qAny?.path) {
        key = String(qAny.path);
      }
    } catch {
      key = undefined;
    }
  }
  
  const ttlMs = resolveCacheTTL(key || "", opts.cacheTier, opts.ttlMs);
  
  if (!opts.forceRefresh && key) {
    const cached = queryMemoryCache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttlMs) {
      return cached.data;
    }
    if (inFlightQueryPromises.has(key)) {
      return inFlightQueryPromises.get(key)!;
    }
  }

  const executeFetch = async (): Promise<QuerySnapshot> => {
    let lastError: any = null;
    const maxRetries = opts.maxRetries ?? 3;
    const timeoutMs = opts.timeoutMs ?? 5000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (isDebugEnabled) {
          console.debug(`[resilientGetDocs] Fetching query ${key || ""} (attempt ${attempt}/${maxRetries})`);
        }
        const snap = await withTimeout(firestoreGetDocs(q), timeoutMs, "getDocs");
        if (key) {
          queryMemoryCache.set(key, { data: snap, timestamp: Date.now(), ttlMs });
        }
        return snap;
      } catch (err: any) {
        lastError = err;
        const isPerm = isPermissionError(err);
        if (isPerm) {
          if (auth.currentUser && isDebugEnabled) {
            console.warn(`[resilientGetDocs] Permission denied for query ${key || ""}:`, err?.message || err);
          }
          break; // Deterministic error; do not loop 3 times
        }

        if (isDebugEnabled) {
          console.debug(`[resilientGetDocs] Attempt ${attempt}/${maxRetries} failed:`, err?.message || err);
        }

        if (attempt < maxRetries) {
          const delay = calculateExponentialBackoffWithJitter(
            attempt - 1,
            opts.initialDelayMs || 300,
            4000
          );
          await sleep(delay);
        }
      }
    }

    // Try cache fallback
    if (opts.fallbackToCache !== false) {
      try {
        const cacheSnap = await getDocsFromCache(q);
        if (isDebugEnabled) {
          console.debug(`[resilientGetDocs] Retrieved query results from offline cache.`);
        }
        if (key) {
          queryMemoryCache.set(key, { data: cacheSnap, timestamp: Date.now(), ttlMs });
        }
        return cacheSnap;
      } catch (cacheErr) {
        if (isDebugEnabled) {
          console.debug(`[resilientGetDocs] Cache query fallback failed:`, cacheErr);
        }
      }
    }

    if (opts.throwOnNetworkFailure) {
      throw new FirestoreNetworkError(
        "Unable to fetch query results due to network error.",
        lastError,
        key
      );
    }

    return {
      docs: [],
      empty: true,
      size: 0,
      forEach: () => {},
      docChanges: () => [],
      metadata: { hasPendingWrites: false, fromCache: true }
    } as unknown as QuerySnapshot;
  };

  const promise = executeFetch().finally(() => {
    if (key) inFlightQueryPromises.delete(key);
  });

  if (!opts.forceRefresh && key) {
    inFlightQueryPromises.set(key, promise);
  }

  return promise;
}

/**
 * Standardized in-memory cache invalidation for resilient getDoc / getDocs queries.
 */
export function clearResilientCache(businessId?: string): void {
  if (businessId) {
    for (const key of docMemoryCache.keys()) {
      if (key.includes(businessId)) {
        docMemoryCache.delete(key);
      }
    }
    for (const key of queryMemoryCache.keys()) {
      if (key.includes(businessId)) {
        queryMemoryCache.delete(key);
      }
    }
  } else {
    docMemoryCache.clear();
    queryMemoryCache.clear();
  }
}
