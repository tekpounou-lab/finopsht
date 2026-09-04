import {
  BusinessRepository,
  BranchRepository,
  DepartmentRepository,
  RoleRepository,
  BusinessSettingsRepository,
} from "../../repositories";
import { Business, Branch, Department, Role, BusinessSettings } from "../../types/organization";
import { auth } from "../../lib/firebase";

export interface ResolverSnapshot {
  business: Business | null;
  branches: Branch[];
  departments: Department[];
  roles: Role[];
  settings: BusinessSettings | null;
}

const memoryCache = new Map<string, { data: ResolverSnapshot; timestamp: number }>();
const inFlightRequests = new Map<string, Promise<ResolverSnapshot>>();
const loggedBusinessHydrations = new Set<string>();

const SOFT_CACHE_TTL_MS = 2 * 60 * 1000;   // 2 minutes
const HARD_CACHE_TTL_MS = 30 * 60 * 1000;  // 30 minutes
const RESOLVER_TIMEOUT_MS = 450;           // 450ms timeout guarantee

export const BusinessResolver = {
  resolve: async (businessId: string): Promise<ResolverSnapshot> => {
    if (!businessId || businessId === "none" || !auth.currentUser) {
      return {
        business: null,
        branches: [],
        departments: [],
        roles: [],
        settings: null,
      };
    }

    const cacheKey = `finops_biz_resolver_${businessId}`;

    // 1. Tier-0: Fast in-memory cache
    const memCached = memoryCache.get(cacheKey);
    if (memCached) {
      const age = Date.now() - memCached.timestamp;
      if (age < HARD_CACHE_TTL_MS) {
        if (age > SOFT_CACHE_TTL_MS) {
          BusinessResolver.revalidateInBackground(businessId);
        }
        return memCached.data;
      }
    }

    // 2. Tier-1: SessionStorage cache
    let fallbackData: ResolverSnapshot | null = null;
    try {
      const raw = sessionStorage.getItem(cacheKey) || localStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw);
        const age = Date.now() - (cached.timestamp || 0);
        if (cached.data?.business) {
          fallbackData = cached.data as ResolverSnapshot;
          if (age < HARD_CACHE_TTL_MS) {
            if (!loggedBusinessHydrations.has(businessId)) {
              loggedBusinessHydrations.add(businessId);
              console.log(`[BusinessResolver] HYDRATED_FROM_SESSION_STORAGE for: ${businessId}`);
            }
            memoryCache.set(cacheKey, { data: cached.data, timestamp: cached.timestamp });
            
            if (age > SOFT_CACHE_TTL_MS) {
              BusinessResolver.revalidateInBackground(businessId);
            }
            return cached.data as ResolverSnapshot;
          }
        }
      }
    } catch (e) {}

    // 3. In-flight request deduplication
    const existing = inFlightRequests.get(businessId);
    if (existing) {
      return existing;
    }

    const fetchPromise = (async () => {
      try {
        const networkPromise = BusinessResolver.executeFetch(businessId);

        if (fallbackData) {
          let timerId: any;
          const timeoutPromise = new Promise<ResolverSnapshot>((res) => {
            timerId = setTimeout(() => {
              console.warn(`[BusinessResolver] Timeout fallback returning cached snapshot within ${RESOLVER_TIMEOUT_MS}ms.`);
              res(fallbackData!);
            }, RESOLVER_TIMEOUT_MS);
          });
          return await Promise.race([
            networkPromise.then((res) => {
              clearTimeout(timerId);
              return res;
            }),
            timeoutPromise
          ]);
        }

        return await networkPromise;
      } finally {
        inFlightRequests.delete(businessId);
      }
    })();

    inFlightRequests.set(businessId, fetchPromise);
    return fetchPromise;
  },

  executeFetch: async (businessId: string): Promise<ResolverSnapshot> => {
    const cacheKey = `finops_biz_resolver_${businessId}`;
    console.log(`[BusinessResolver] Resolving snapshot for: ${businessId}`);
    
    const fetchBusiness = async () => {
      try {
        const res = await BusinessRepository.getById(businessId);
        if (res) return res;
        throw new Error("Business not found");
      } catch (err: any) {
        console.warn("[BusinessResolver] BusinessRepository.getById failed:", err);
        return null;
      }
    };

    const fetchBranches = async () => {
      try {
        const res = await BranchRepository.listByBusiness(businessId);
        return res || [];
      } catch (err: any) {
        console.warn("[BusinessResolver] BranchRepository.listByBusiness failed:", err);
        return [];
      }
    };

    const fetchDepartments = async () => {
      try {
        const res = await DepartmentRepository.listByBusiness(businessId);
        return res || [];
      } catch (err: any) {
        console.warn("[BusinessResolver] DepartmentRepository.listByBusiness failed:", err);
        return [];
      }
    };

    const fetchRoles = async () => {
      try {
        const res = await RoleRepository.listByBusiness(businessId);
        return res || [];
      } catch (err: any) {
        console.warn("[BusinessResolver] RoleRepository.listByBusiness failed:", err);
        return [];
      }
    };

    const fetchSettings = async () => {
      try {
        const res = await BusinessSettingsRepository.getByBusiness(businessId);
        return res || null;
      } catch (err: any) {
        console.warn("[BusinessResolver] BusinessSettingsRepository.getByBusiness failed:", err);
        return null;
      }
    };

    // Perform all fetches in parallel for maximum speed
    const [business, branches, departments, roles, settings] = await Promise.all([
      fetchBusiness(),
      fetchBranches(),
      fetchDepartments(),
      fetchRoles(),
      fetchSettings(),
    ]);

    const result: ResolverSnapshot = {
      business,
      branches,
      departments,
      roles,
      settings,
    };

    try {
      const payload = JSON.stringify({ data: result, timestamp: Date.now() });
      sessionStorage.setItem(cacheKey, payload);
      localStorage.setItem(cacheKey, payload);
      memoryCache.set(cacheKey, { data: result, timestamp: Date.now() });
    } catch (e) {}

    return result;
  },

  revalidateInBackground: (businessId: string): void => {
    const bgKey = `${businessId}:bg`;
    if (inFlightRequests.has(bgKey)) return;

    const promise = (async () => {
      try {
        await BusinessResolver.executeFetch(businessId);
      } catch (e) {
        console.warn("[BusinessResolver] SWR background revalidation error:", e);
      } finally {
        inFlightRequests.delete(bgKey);
      }
    })();

    inFlightRequests.set(bgKey, promise as any);
  },

  invalidateCache: (businessId: string) => {
    try {
      const cacheKey = `finops_biz_resolver_${businessId}`;
      memoryCache.delete(cacheKey);
      sessionStorage.removeItem(cacheKey);
      localStorage.removeItem(cacheKey);
      console.log(`[BusinessResolver] Cache invalidated for: ${businessId}`);
    } catch (e) {}
  },

  clearAllCache: (): void => {
    memoryCache.clear();
    inFlightRequests.clear();
    loggedBusinessHydrations.clear();
    try {
      if (typeof window !== "undefined") {
        const sessionKeysToClear: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && (k.startsWith("finops_biz_resolver_") || k.startsWith("finops_"))) {
            sessionKeysToClear.push(k);
          }
        }
        sessionKeysToClear.forEach((k) => sessionStorage.removeItem(k));

        const localKeysToClear: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith("finops_biz_resolver_") || k.startsWith("finops_"))) {
            localKeysToClear.push(k);
          }
        }
        localKeysToClear.forEach((k) => localStorage.removeItem(k));
      }
    } catch (e) {}
  }
};
