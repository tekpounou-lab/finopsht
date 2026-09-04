import { useState, useEffect, useCallback, useRef } from "react";
import { PaginatedResult } from "../repositories/PaginatedRepository";

export interface UsePaginatedDataOptions<F = any> {
  pageSize?: number;
  initialFilters?: F;
  autoLoad?: boolean;
  resetOnFiltersChange?: boolean;
}

export interface UsePaginatedDataReturn<T, F = any> {
  items: T[];
  loading: boolean;
  loadingMore: boolean;
  error: Error | null;
  hasMore: boolean;
  totalFetched: number;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
  filters: F | undefined;
  setFilters: React.Dispatch<React.SetStateAction<F | undefined>>;
  lastDoc: any;
}

export function usePaginatedData<T, F = any>(
  fetcher: (params: { pageSize: number; lastDoc?: any; filters?: F }) => Promise<PaginatedResult<T>>,
  options: UsePaginatedDataOptions<F> = {}
): UsePaginatedDataReturn<T, F> {
  const {
    pageSize = 25,
    initialFilters,
    autoLoad = true,
    resetOnFiltersChange = true
  } = options;

  const [items, setItems] = useState<T[]>([]);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(autoLoad);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [filters, setFilters] = useState<F | undefined>(initialFilters);

  // Keep ref to fetcher to avoid unnecessary re-triggers
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const isInitialMount = useRef(true);

  const loadInitial = useCallback(
    async (currentFilters?: F) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetcherRef.current({
          pageSize,
          lastDoc: null,
          filters: currentFilters
        });

        setItems(result.items);
        setLastDoc(result.lastDoc);
        setHasMore(result.hasMore);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setItems([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [pageSize]
  );

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore || !lastDoc) return;

    setLoadingMore(true);
    setError(null);
    try {
      const result = await fetcherRef.current({
        pageSize,
        lastDoc,
        filters
      });

      setItems((prev) => [...prev, ...result.items]);
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, hasMore, lastDoc, pageSize, filters]);

  const refresh = useCallback(async () => {
    await loadInitial(filters);
  }, [loadInitial, filters]);

  const reset = useCallback(() => {
    setItems([]);
    setLastDoc(null);
    setHasMore(true);
    setLoading(false);
    setLoadingMore(false);
    setError(null);
  }, []);

  // Effect for initial load or filter change
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (autoLoad) {
        loadInitial(filters);
      }
      return;
    }

    if (resetOnFiltersChange) {
      loadInitial(filters);
    }
  }, [filters, autoLoad, resetOnFiltersChange, loadInitial]);

  return {
    items,
    loading,
    loadingMore,
    error,
    hasMore,
    totalFetched: items.length,
    loadMore,
    refresh,
    reset,
    filters,
    setFilters,
    lastDoc
  };
}
