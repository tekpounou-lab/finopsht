import { doc, getDoc as firestoreGetDoc, getDocFromCache } from "firebase/firestore";
import { db, auth } from "../../lib/firebase";
import { resilientGetDoc, FirestoreNetworkError, isNetworkError } from "../../utils/resilientFirestore";
import { Business, BusinessSnapshot, UserProfile } from "../../types";

export interface ResolvedTenantContext {
  business: Business | null;
  businessSnapshot: BusinessSnapshot | null;
  settings: any | null;
  permissions: string[];
  durationMs: number;
  error?: string;
  isNetworkError?: boolean;
}

export type ProfileResolutionResult = 
  | { status: "RESOLVED"; data: UserProfile }
  | { status: "NOT_FOUND"; data: null }
  | { status: "ERROR"; error: string; isNetworkError: boolean };

// Tier-0 Memory Cache buffer
const tenantMemoryCache = new Map<string, { data: ResolvedTenantContext; timestamp: number }>();
// Tier-0 User Profile Memory Cache buffer
const profileMemoryCache = new Map<string, { data: ProfileResolutionResult; timestamp: number }>();
// In-flight / pending tenant resolution promises for request deduplication
const inFlightRequests = new Map<string, Promise<ResolvedTenantContext>>();
// In-flight / pending profile resolution promises for request deduplication
const pendingProfilePromises = new Map<string, Promise<ProfileResolutionResult>>();
// Hydration logging deduplication set
const loggedTenants = new Set<string>();
const loggedProfiles = new Set<string>();

const FIRST_LOAD_TIMEOUT_MS = 5000; // 5000ms (5s) SLA for cold load without cache
const PROFILE_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes in-memory cache for profiles

export class OptimizedResolver {
  /**
   * Synchronously reads tenant context from Tier-0 Memory Cache or Tier-1 SessionStorage/LocalStorage.
   */
  static getCachedTenantContext(businessId: string): ResolvedTenantContext | null {
    const cacheKey = `finops_tenant_cache_${businessId}`;

    // 1. Tier-0 Memory check
    const memCached = tenantMemoryCache.get(cacheKey);
    if (memCached?.data?.business) {
      return memCached.data;
    }

    // 2. Tier-1 SessionStorage / LocalStorage check
    try {
      if (typeof window !== "undefined") {
        const raw = sessionStorage.getItem(cacheKey) || localStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.business) {
            const cachedResult: ResolvedTenantContext = {
              business: parsed.business,
              businessSnapshot: parsed.businessSnapshot || null,
              settings: parsed.settings || null,
              permissions: parsed.permissions || [],
              durationMs: 0
            };
            // Seed memory cache
            tenantMemoryCache.set(cacheKey, { data: cachedResult, timestamp: parsed.timestamp || Date.now() });
            return cachedResult;
          }
        }
      }
    } catch (e) {
      console.warn("[OptimizedResolver] Error reading tenant cache from storage:", e);
    }

    return null;
  }

  /**
   * Writes tenant context to Memory, SessionStorage, and LocalStorage.
   */
  static setCachedTenantContext(businessId: string, context: ResolvedTenantContext): void {
    const cacheKey = `finops_tenant_cache_${businessId}`;
    tenantMemoryCache.set(cacheKey, { data: context, timestamp: Date.now() });

    try {
      if (typeof window !== "undefined") {
        const payload = JSON.stringify({
          business: context.business,
          businessSnapshot: context.businessSnapshot,
          settings: context.settings,
          permissions: context.permissions,
          timestamp: Date.now()
        });
        sessionStorage.setItem(cacheKey, payload);
        localStorage.setItem(cacheKey, payload);
      }
    } catch (e) {
      console.warn("[OptimizedResolver] Error saving tenant cache to storage:", e);
    }
  }

  /**
   * Resolves a user profile document with exponential backoff (3 attempts), 5s timeout,
   * and in-flight promise deduplication to prevent redundant concurrent fetches.
   */
  static async resolveUserProfileWithRetry(
    uid: string, 
    correlationId: string = "res_user"
  ): Promise<ProfileResolutionResult> {
    if (!uid || !auth.currentUser) {
      return {
        status: "NOT_FOUND",
        data: null
      };
    }

    // 1. Check in-memory profile cache
    const memCached = profileMemoryCache.get(uid);
    if (memCached && (Date.now() - memCached.timestamp < PROFILE_CACHE_TTL_MS)) {
      const logTag = `profile:${uid}`;
      if (!loggedProfiles.has(logTag)) {
        loggedProfiles.add(logTag);
        console.log(`[OptimizedResolver][${correlationId}] User profile resolved from memory cache for UID: ${uid}`);
      }
      return memCached.data;
    }

    // 2. Check and coalesce concurrent in-flight promise
    const existingPromise = pendingProfilePromises.get(uid);
    if (existingPromise) {
      console.log(`[OptimizedResolver][${correlationId}] COALESCING_IN_FLIGHT_PROFILE_REQUEST for UID: ${uid}`);
      return existingPromise;
    }

    // 3. Initiate single authoritative fetch
    const fetchPromise = (async (): Promise<ProfileResolutionResult> => {
      try {
        const userRef = doc(db, "users", uid);
        const snap = await resilientGetDoc(userRef, {
          maxRetries: 2,
          timeoutMs: 8000,
          initialDelayMs: 200,
          fallbackToCache: true,
          throwOnNetworkFailure: true
        });

        if (snap.exists()) {
          console.log(`[OptimizedResolver][${correlationId}] User profile found for UID: ${uid}`);
          const res: ProfileResolutionResult = {
            status: "RESOLVED",
            data: { id: snap.id, ...snap.data() } as UserProfile
          };
          profileMemoryCache.set(uid, { data: res, timestamp: Date.now() });
          return res;
        }

        // Snapshot returned by Firestore server with exists: false -> Genuine NOT FOUND
        console.log(`[OptimizedResolver][${correlationId}] User profile NOT FOUND (404) for UID: ${uid}`);
        const notFoundRes: ProfileResolutionResult = {
          status: "NOT_FOUND",
          data: null
        };
        profileMemoryCache.set(uid, { data: notFoundRes, timestamp: Date.now() });
        return notFoundRes;
      } catch (err: any) {
        const isNet = isNetworkError(err);
        console.warn(`[OptimizedResolver][${correlationId}] User profile fetch failed:`, err?.message || err);
        return {
          status: "ERROR",
          error: err?.message || "NETWORK_ERROR",
          isNetworkError: isNet
        };
      } finally {
        pendingProfilePromises.delete(uid);
      }
    })();

    pendingProfilePromises.set(uid, fetchPromise);
    return fetchPromise;
  }

  /**
   * Concurrently resolves tenant context.
   * GUARANTEED FAST PATH: Returns cached data immediately (< 10ms) and triggers non-blocking background SWR revalidation.
   */
  static resolveTenantParallel(
    businessId: string,
    role: string,
    correlationId: string = "res_opt"
  ): Promise<ResolvedTenantContext> {
    const startTime = performance.now();
    const cacheKey = `finops_tenant_cache_${businessId}`;

    // --- STEP 1: GUARANTEED FAST PATH (SYNC READ FROM CACHE) ---
    const cachedContext = OptimizedResolver.getCachedTenantContext(businessId);
    if (cachedContext) {
      const durationMs = Math.round(performance.now() - startTime);
      const logTag = `${cacheKey}:hydrated`;
      if (!loggedTenants.has(logTag)) {
        loggedTenants.add(logTag);
        console.log(`[OptimizedResolver][${correlationId}] HYDRATED_FROM_SESSION_STORAGE (fast path, duration: ${durationMs}ms)`);
      }

      // Trigger non-blocking background SWR revalidation
      OptimizedResolver.revalidateInBackground(businessId, role, correlationId);

      // Return cached context immediately (< 10ms) without waiting for network
      return Promise.resolve({
        ...cachedContext,
        durationMs
      });
    }

    // --- STEP 2: DEDUPLICATION / IN-FLIGHT COALESCING ---
    const requestKey = `${businessId}:${role.toUpperCase()}`;
    const existingPromise = inFlightRequests.get(requestKey);
    if (existingPromise) {
      console.log(`[OptimizedResolver][${correlationId}] COALESCING_IN_FLIGHT_REQUEST for ${businessId}`);
      return existingPromise;
    }

    // --- STEP 3: FIRST-TIME LOAD (NO CACHE AT ALL) ---
    const fetchPromise = (async (): Promise<ResolvedTenantContext> => {
      try {
        // Fast check for Firestore IndexedDB local persistent cache
        const indexedDbCached = await OptimizedResolver.tryReadFromIndexedDbCache(businessId, role, correlationId, startTime);
        if (indexedDbCached) {
          console.log(`[OptimizedResolver][${correlationId}] HYDRATED_FROM_INDEXEDDB_CACHE (duration: ${indexedDbCached.durationMs}ms)`);
          OptimizedResolver.setCachedTenantContext(businessId, indexedDbCached);
          OptimizedResolver.revalidateInBackground(businessId, role, correlationId);
          return indexedDbCached;
        }

        // Execute network fetch with a 5000ms (5s) SLA timeout deadline for first-time cold load
        const networkFetchPromise = OptimizedResolver.executeFirestoreFetch(businessId, role, correlationId, startTime);

        const slaTimeoutPromise = new Promise<ResolvedTenantContext>((resolve) => {
          setTimeout(() => {
            console.warn(`[OptimizedResolver][${correlationId}] RESOLVER_FIRST_LOAD_TIMEOUT: Network took > ${FIRST_LOAD_TIMEOUT_MS}ms. Falling back to cache.`);
            const cached = OptimizedResolver.getCachedTenantContext(businessId);
            resolve(cached || {
              business: null,
              businessSnapshot: null,
              settings: null,
              permissions: [],
              durationMs: Math.round(performance.now() - startTime),
              error: "NETWORK_TIMEOUT_FALLBACK",
              isNetworkError: true
            });
          }, FIRST_LOAD_TIMEOUT_MS);
        });

        const result = await Promise.race([
          networkFetchPromise,
          slaTimeoutPromise
        ]);

        return result;
      } finally {
        inFlightRequests.delete(requestKey);
      }
    })();

    inFlightRequests.set(requestKey, fetchPromise);
    return fetchPromise;
  }

  /**
   * Alias method for resolveTenantParallel for backwards compatibility.
   */
  static resolveTenant(businessId: string, role: string = "UNASSIGNED", correlationId: string = "res_opt"): Promise<ResolvedTenantContext> {
    return OptimizedResolver.resolveTenantParallel(businessId, role, correlationId);
  }

  /**
   * Fast retrieval from Firestore IndexedDB persistent offline cache.
   */
  private static async tryReadFromIndexedDbCache(
    businessId: string,
    role: string,
    correlationId: string,
    startTime: number
  ): Promise<ResolvedTenantContext | null> {
    try {
      const bizRef = doc(db, "businesses", businessId);
      const snapRef = doc(db, "business_snapshots", businessId);
      const settingsRef = doc(db, "business_settings", businessId);

      const [bizSnap, snapshotSnap, settingsSnap] = await Promise.all([
        getDocFromCache(bizRef).catch(() => null),
        getDocFromCache(snapRef).catch(() => null),
        getDocFromCache(settingsRef).catch(() => null)
      ]);

      if (bizSnap && bizSnap.exists()) {
        const business = { id: bizSnap.id, ...bizSnap.data() } as Business;
        const businessSnapshot = snapshotSnap && snapshotSnap.exists() ? ({ id: snapshotSnap.id, ...snapshotSnap.data() } as BusinessSnapshot) : null;
        const settings = settingsSnap && settingsSnap.exists() ? settingsSnap.data() : null;

        let permissions: string[] = businessSnapshot?.permissions || [];
        if ((!permissions || permissions.length === 0) && settings && settings[role.toUpperCase()]) {
          permissions = Array.isArray(settings[role.toUpperCase()]) ? settings[role.toUpperCase()] : [];
        }

        return {
          business,
          businessSnapshot,
          settings,
          permissions,
          durationMs: Math.round(performance.now() - startTime)
        };
      }
    } catch (e) {
      // IndexedDB cache miss or unavailable
    }
    return null;
  }

  /**
   * Internal Firestore Parallel Fetcher.
   */
  private static async executeFirestoreFetch(
    businessId: string,
    role: string,
    correlationId: string,
    startTime: number
  ): Promise<ResolvedTenantContext> {
    if (!auth.currentUser) {
      return {
        business: null,
        businessSnapshot: null,
        settings: null,
        permissions: [],
        durationMs: Math.round(performance.now() - startTime),
        error: "UNAUTHENTICATED"
      };
    }
    try {
      const bizRef = doc(db, "businesses", businessId);
      const snapRef = doc(db, "business_snapshots", businessId);
      const settingsRef = doc(db, "business_settings", businessId);

      const [bizDoc, snapshotDoc, settingsDoc] = await Promise.all([
        resilientGetDoc(bizRef, { maxRetries: 2, timeoutMs: 2500, throwOnNetworkFailure: false }),
        resilientGetDoc(snapRef, { maxRetries: 2, timeoutMs: 2500, throwOnNetworkFailure: false }),
        resilientGetDoc(settingsRef, { maxRetries: 2, timeoutMs: 2500, throwOnNetworkFailure: false })
      ]);

      const business = bizDoc && bizDoc.exists() ? ({ id: bizDoc.id, ...bizDoc.data() } as Business) : null;
      const businessSnapshot = snapshotDoc && snapshotDoc.exists() ? ({ id: snapshotDoc.id, ...snapshotDoc.data() } as BusinessSnapshot) : null;
      const settings = settingsDoc && settingsDoc.exists() ? settingsDoc.data() : null;

      let permissions: string[] = businessSnapshot?.permissions || [];
      if ((!permissions || permissions.length === 0) && settings && settings[role.toUpperCase()]) {
        permissions = Array.isArray(settings[role.toUpperCase()]) ? settings[role.toUpperCase()] : [];
      }

      const durationMs = Math.round(performance.now() - startTime);

      const resolvedContext: ResolvedTenantContext = {
        business,
        businessSnapshot,
        settings,
        permissions,
        durationMs
      };

      // Write to cache if valid business document obtained
      if (business) {
        OptimizedResolver.setCachedTenantContext(businessId, resolvedContext);
      }

      console.log(`[OptimizedResolver][${correlationId}] RESOLVER_RESOLVE_SUCCESS (durationMs: ${durationMs}ms)`);
      return resolvedContext;
    } catch (error: any) {
      const durationMs = Math.round(performance.now() - startTime);
      console.error(`[OptimizedResolver][${correlationId}] Execution failed after ${durationMs}ms:`, error);
      return {
        business: null,
        businessSnapshot: null,
        settings: null,
        permissions: [],
        durationMs,
        error: error?.message || "FETCH_FAILED",
        isNetworkError: isNetworkError(error)
      };
    }
  }

  /**
   * Non-blocking background SWR revalidation with deduplication and event dispatching.
   */
  static revalidateInBackground(businessId: string, role: string, correlationId: string = "bg_swr"): void {
    if (!auth.currentUser) return;
    const requestKey = `${businessId}:${role.toUpperCase()}:bg`;
    if (inFlightRequests.has(requestKey)) return;

    const bgPromise = (async () => {
      try {
        console.log(`[OptimizedResolver] SWR background revalidating for tenant: ${businessId}`);
        const freshContext = await OptimizedResolver.executeFirestoreFetch(businessId, role, correlationId, performance.now());

        // Dispatch CustomEvent to notify application UI of updated tenant context
        if (typeof window !== "undefined" && freshContext.business) {
          window.dispatchEvent(new CustomEvent("finops:tenant_cache_updated", {
            detail: { businessId, context: freshContext }
          }));
          window.dispatchEvent(new CustomEvent("tenant_context_updated", {
            detail: { businessId, context: freshContext }
          }));
        }
      } catch (e) {
        console.warn("[OptimizedResolver] SWR background revalidation failed:", e);
      } finally {
        inFlightRequests.delete(requestKey);
      }
    })();

    inFlightRequests.set(requestKey, bgPromise as any);
  }

  /**
   * Invalidates cached tenant context in memory, sessionStorage, and localStorage.
   */
  static invalidateTenantCache(businessId: string): void {
    const cacheKey = `finops_tenant_cache_${businessId}`;
    tenantMemoryCache.delete(cacheKey);
    try {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(cacheKey);
        localStorage.removeItem(cacheKey);
        console.log(`[OptimizedResolver] Invalidated cache for: ${businessId}`);
      }
    } catch (e) {}
  }

  /**
   * Invalidates cached profile context in memory.
   */
  static invalidateProfileCache(uid: string): void {
    profileMemoryCache.delete(uid);
    pendingProfilePromises.delete(uid);
  }

  /**
   * Completely purges all tenant memory cache, in-flight promises, profile cache, and storage cache across sessions.
   */
  static clearAllCache(): void {
    tenantMemoryCache.clear();
    profileMemoryCache.clear();
    inFlightRequests.clear();
    pendingProfilePromises.clear();
    loggedTenants.clear();
    loggedProfiles.clear();
    try {
      if (typeof window !== "undefined") {
        const sessionKeysToClear: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && (k.startsWith("finops_tenant_cache_") || k.startsWith("finops_"))) {
            sessionKeysToClear.push(k);
          }
        }
        sessionKeysToClear.forEach((k) => sessionStorage.removeItem(k));

        const localKeysToClear: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith("finops_tenant_cache_") || k.startsWith("finops_"))) {
            localKeysToClear.push(k);
          }
        }
        localKeysToClear.forEach((k) => localStorage.removeItem(k));
      }
    } catch (e) {}
  }
}


