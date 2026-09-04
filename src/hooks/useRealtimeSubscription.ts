import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  QueryConstraint, 
  WhereFilterOp, 
  OrderByDirection, 
  Query, 
  DocumentData, 
  QuerySnapshot 
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { db, auth, isRetriableFirestoreError } from "../lib/firebase";
import { realtimeManager, tenantQuery } from "../services/firestore/realtimeManager";
import { CacheInvalidationService, CacheRefreshPayload } from "../services/performance/CacheInvalidationService";
import { InputSanitizer } from "../services/security/InputSanitizer";
import { LogSanitizer } from "../services/security/LogSanitizer";
import { logger } from "../services/observability/Logger";

export interface QueryFilter {
  field: string;
  operator: WhereFilterOp;
  value: any;
}

export interface UseRealtimeSubscriptionOptions {
  orderByField?: string;
  orderDirection?: OrderByDirection;
  limitCount?: number;
  enabled?: boolean;
  businessId?: string;
  deps?: any[];
  keyPrefix?: string;
}

export interface UseRealtimeSubscriptionResult<T> {
  data: T[];
  setData: React.Dispatch<React.SetStateAction<T[]>>;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
  removedIds: string[];
}

/**
 * Type guard to check if an item is a custom QueryFilter descriptor
 */
function isQueryFilter(item: any): item is QueryFilter {
  return (
    item &&
    typeof item === "object" &&
    typeof item.field === "string" &&
    typeof item.operator === "string" &&
    "value" in item
  );
}

/**
 * Validates and sanitizes whether a QueryFilter has valid parameters
 */
function isFilterValid(filter: QueryFilter | QueryConstraint): boolean {
  if (!filter) return false;
  if (!isQueryFilter(filter)) {
    return true; // Direct QueryConstraint
  }
  const sanitized = InputSanitizer.sanitizeQueryFilter(filter);
  return sanitized !== null;
}

/**
 * Global SRE-grade Real-Time Firestore Subscription Hook.
 * Features:
 * 1. Native `docChanges` handling, explicitly detecting and purging `type: 'removed'` documents.
 * 2. Cross-tab & multi-listener deduplication via `realtimeManager`.
 * 3. Automatic re-fetch and cache-busting when `CacheInvalidationService.sweepLocal()` is triggered.
 * 4. Multi-tenant security isolation & query parameter sanitization.
 * 5. PII-masked logging.
 */
export function useRealtimeSubscription<T = any>(
  collectionPath: string,
  filters?: (QueryFilter | QueryConstraint)[],
  optionsOrDeps?: UseRealtimeSubscriptionOptions | any[]
): UseRealtimeSubscriptionResult<T> {
  // Normalize options and dependencies
  const options: UseRealtimeSubscriptionOptions = useMemo(() => {
    if (!optionsOrDeps) return {};
    if (Array.isArray(optionsOrDeps)) {
      return { deps: optionsOrDeps };
    }
    return optionsOrDeps;
  }, [optionsOrDeps]);

  const {
    orderByField,
    orderDirection = "asc",
    limitCount,
    enabled = true,
    businessId: explicitBusinessId,
    deps = [],
    keyPrefix
  } = options;

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [refreshIndex, setRefreshIndex] = useState<number>(0);
  const [authUser, setAuthUser] = useState<User | null>(() => auth.currentUser);

  // Sync auth state reactively to attach listeners immediately when user logs in
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
    });
    return () => unsubAuth();
  }, []);

  const refresh = useCallback(() => {
    logger.debug(`[useRealtimeSubscription] Manual refresh triggered for "${LogSanitizer.sanitizeString(collectionPath)}"`);
    setRefreshIndex((prev) => prev + 1);
  }, [collectionPath]);

  // Extract businessId from explicit option or filters
  const resolvedBusinessId = useMemo(() => {
    if (explicitBusinessId) {
      try {
        return InputSanitizer.sanitizeBusinessId(explicitBusinessId);
      } catch {
        return undefined;
      }
    }
    if (filters) {
      for (const f of filters) {
        if (isQueryFilter(f) && (f.field === "business_id" || f.field === "businessId") && f.operator === "==" && f.value) {
          try {
            return InputSanitizer.sanitizeBusinessId(String(f.value));
          } catch {
            return undefined;
          }
        }
      }
    }
    return undefined;
  }, [explicitBusinessId, filters]);

  // Listen to central CacheInvalidationService refresh events
  useEffect(() => {
    const unsubCache = CacheInvalidationService.subscribeToRefresh((payload: CacheRefreshPayload) => {
      if (!payload.businessId || !resolvedBusinessId || payload.businessId === resolvedBusinessId) {
        logger.debug(`[useRealtimeSubscription] Cache invalidation refresh signal received for "${LogSanitizer.sanitizeString(collectionPath)}" (sweepVersion: ${payload.sweepVersion})`);
        setRefreshIndex((prev) => prev + 1);
      }
    });

    return () => {
      unsubCache();
    };
  }, [collectionPath, resolvedBusinessId]);

  useEffect(() => {
    // Strictly guard against executing queries before auth is established
    if (!enabled || !authUser) {
      setData([]);
      setRemovedIds([]);
      setLoading(false);
      return;
    }

    let sanitizedPath: string;
    try {
      sanitizedPath = InputSanitizer.sanitizeCollectionPath(collectionPath);
    } catch (err: any) {
      logger.error(`[useRealtimeSubscription] Invalid collection path: "${LogSanitizer.sanitizeString(collectionPath)}"`, err);
      setData([]);
      setRemovedIds([]);
      setLoading(false);
      setError(err);
      return;
    }

    // Immediately clear previous data to ensure zero cross-tenant leak during query transition
    setData([]);
    setRemovedIds([]);

    // Build constraints with sanitization
    const constraints: QueryConstraint[] = [];
    let hasExplicitBusinessIdFilter = false;

    if (filters && filters.length > 0) {
      for (const f of filters) {
        if (isQueryFilter(f)) {
          const sanitizedFilter = InputSanitizer.sanitizeQueryFilter(f);
          if (sanitizedFilter) {
            if (sanitizedFilter.field === "business_id" || sanitizedFilter.field === "businessId") {
              hasExplicitBusinessIdFilter = true;
            }
            constraints.push(where(sanitizedFilter.field, sanitizedFilter.operator, sanitizedFilter.value));
          }
        } else if (f) {
          constraints.push(f);
        }
      }
    }

    if (orderByField) {
      constraints.push(orderBy(orderByField, orderDirection));
    }

    if (limitCount && limitCount > 0) {
      constraints.push(limit(limitCount));
    }

    // Secure multi-tenant query construction
    const colRef = collection(db, sanitizedPath);
    let finalQuery: Query<DocumentData>;

    if (resolvedBusinessId && !hasExplicitBusinessIdFilter) {
      finalQuery = tenantQuery(colRef, resolvedBusinessId, ...constraints);
    } else {
      finalQuery = query(colRef, ...constraints);
    }

    // Deterministic subscription cache key with sanitization (independent of refreshIndex to allow stream sharing)
    const filterKey = (filters || [])
      .filter(isFilterValid)
      .map((f) => (isQueryFilter(f) ? `${f.field}_${f.operator}_${typeof f.value === "object" ? JSON.stringify(f.value) : f.value}` : "constraint"))
      .join(";");
    const subKey = `${keyPrefix ? keyPrefix + ":" : ""}${sanitizedPath}:${resolvedBusinessId || "global"}:${filterKey}:${orderByField || ""}:${orderDirection || ""}:${limitCount || ""}`;

    logger.debug(`[useRealtimeSubscription] Subscribing to "${LogSanitizer.sanitizeString(subKey)}"`);
    setLoading(true);
    setError(null);

    const unsubscribe = realtimeManager.subscribe(
      subKey,
      finalQuery,
      (snapshot: QuerySnapshot<DocumentData>, docChanges?: any[]) => {
        try {
          const changes = docChanges || (typeof snapshot.docChanges === "function" ? snapshot.docChanges() : []);
          const removedFromChanges = new Set<string>();

          // Process docChanges to detect removals
          if (changes && changes.length > 0) {
            changes.forEach((change: any) => {
              if (change.type === "removed" && change.doc) {
                removedFromChanges.add(change.doc.id);
              }
            });

            if (removedFromChanges.size > 0) {
              setRemovedIds(Array.from(removedFromChanges));
            }
          }

          // Transform docs into data array
          const items: T[] = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data()
          } as unknown as T));

          setData(items);
          setLoading(false);
        } catch (err: any) {
          logger.error(`[useRealtimeSubscription] Processing error for "${LogSanitizer.sanitizeString(subKey)}":`, err);
          setError(err);
          setLoading(false);
        }
      },
      (err: any) => {
        if (!isRetriableFirestoreError(err)) {
          logger.warn(`[useRealtimeSubscription] Stream error on "${LogSanitizer.sanitizeString(subKey)}":`, err);
          setError(err);
          setLoading(false);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [
    collectionPath,
    resolvedBusinessId,
    orderByField,
    orderDirection,
    limitCount,
    enabled,
    refreshIndex,
    authUser,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ...deps
  ]);

  return { data, setData, loading, error, refresh, removedIds };
}
