import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { GenericFilterGroup, FilterNamespace, DEFAULT_NAMESPACE_FILTERS } from '../types/filters';

export interface FilterContextType {
  filters: Record<string, GenericFilterGroup>;
  getFilters: <T extends GenericFilterGroup = GenericFilterGroup>(namespace: string) => T;
  setFilter: (namespace: string, key: string, value: any) => void;
  setFilterGroup: <T extends GenericFilterGroup = GenericFilterGroup>(
    namespace: string,
    updater: Partial<T> | ((prev: T) => T)
  ) => void;
  setDateRange: (namespace: string, startDate: string, endDate: string) => void;
  setPeriod: (namespace: string, period: string) => void;
  resetFilters: (namespace: string) => void;
  syncWithGlobal: (namespace: string) => void;
  isFilterActive: (namespace: string) => boolean;
  registerDefaultFilters: (namespace: string, defaults: GenericFilterGroup) => void;
}

export const FilterContext = createContext<FilterContextType | null>(null);

interface FilterProviderProps {
  children: React.ReactNode;
  initialFilters?: Record<string, GenericFilterGroup>;
}

export const FilterProvider: React.FC<FilterProviderProps> = ({
  children,
  initialFilters = {}
}) => {
  const [store, setStore] = useState<Record<string, GenericFilterGroup>>(() => ({
    ...DEFAULT_NAMESPACE_FILTERS,
    ...initialFilters
  }));

  const [registeredDefaults, setRegisteredDefaults] = useState<Record<string, GenericFilterGroup>>(
    DEFAULT_NAMESPACE_FILTERS
  );

  const registerDefaultFilters = useCallback((namespace: string, defaults: GenericFilterGroup) => {
    setRegisteredDefaults((prev) => ({
      ...prev,
      [namespace]: { ...(prev[namespace] || {}), ...defaults }
    }));
    setStore((prev) => ({
      ...prev,
      [namespace]: prev[namespace] || defaults
    }));
  }, []);

  const getFilters = useCallback(
    <T extends GenericFilterGroup = GenericFilterGroup>(namespace: string): T => {
      const current = store[namespace];
      if (current) return current as T;
      const defaultVal = registeredDefaults[namespace] || { period: 'ALL' };
      return defaultVal as T;
    },
    [store, registeredDefaults]
  );

  const setFilter = useCallback((namespace: string, key: string, value: any) => {
    setStore((prev) => {
      const current = prev[namespace] || registeredDefaults[namespace] || {};
      return {
        ...prev,
        [namespace]: {
          ...current,
          [key]: value
        }
      };
    });
  }, [registeredDefaults]);

  const setFilterGroup = useCallback(
    <T extends GenericFilterGroup = GenericFilterGroup>(
      namespace: string,
      updater: Partial<T> | ((prev: T) => T)
    ) => {
      setStore((prev) => {
        const current = (prev[namespace] || registeredDefaults[namespace] || {}) as T;
        const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
        return {
          ...prev,
          [namespace]: next
        };
      });
    },
    [registeredDefaults]
  );

  const setDateRange = useCallback((namespace: string, startDate: string, endDate: string) => {
    setStore((prev) => {
      const current = prev[namespace] || registeredDefaults[namespace] || {};
      if (current.startDate === startDate && current.endDate === endDate && current.period === 'CUSTOM') return prev;
      return {
        ...prev,
        [namespace]: {
          ...current,
          startDate,
          endDate,
          period: 'CUSTOM'
        }
      };
    });
  }, [registeredDefaults]);

  const setPeriod = useCallback((namespace: string, period: string) => {
    setStore((prev) => {
      const current = prev[namespace] || registeredDefaults[namespace] || {};
      if (current.period === period && period !== 'CUSTOM') return prev;
      return {
        ...prev,
        [namespace]: {
          ...current,
          period,
          ...(period !== 'CUSTOM' ? { startDate: '', endDate: '' } : {})
        }
      };
    });
  }, [registeredDefaults]);

  const resetFilters = useCallback(
    (namespace: string) => {
      setStore((prev) => ({
        ...prev,
        [namespace]: { ...(registeredDefaults[namespace] || { period: 'ALL' }) }
      }));
    },
    [registeredDefaults]
  );

  const syncWithGlobal = useCallback((namespace: string) => {
    setStore((prev) => {
      const globalFilters = prev['global'] || registeredDefaults['global'] || {};
      const current = prev[namespace] || registeredDefaults[namespace] || {};
      return {
        ...prev,
        [namespace]: {
          ...current,
          ...globalFilters
        }
      };
    });
  }, [registeredDefaults]);

  const isFilterActive = useCallback(
    (namespace: string): boolean => {
      const current = store[namespace];
      const defaults = registeredDefaults[namespace];
      if (!current || !defaults) return false;

      return Object.keys(current).some((key) => {
        const val = current[key];
        const def = defaults[key];
        if (Array.isArray(val) && Array.isArray(def)) {
          return JSON.stringify(val) !== JSON.stringify(def);
        }
        return val !== def && val !== '' && val !== 'ALL';
      });
    },
    [store, registeredDefaults]
  );

  const contextValue = useMemo<FilterContextType>(
    () => ({
      filters: store,
      getFilters,
      setFilter,
      setFilterGroup,
      setDateRange,
      setPeriod,
      resetFilters,
      syncWithGlobal,
      isFilterActive,
      registerDefaultFilters
    }),
    [
      store,
      getFilters,
      setFilter,
      setFilterGroup,
      setDateRange,
      setPeriod,
      resetFilters,
      syncWithGlobal,
      isFilterActive,
      registerDefaultFilters
    ]
  );

  return <FilterContext.Provider value={contextValue}>{children}</FilterContext.Provider>;
};

const FALLBACK_CONTEXT: FilterContextType = {
  filters: DEFAULT_NAMESPACE_FILTERS,
  getFilters: <T extends GenericFilterGroup = GenericFilterGroup>(namespace: string): T => {
    return (DEFAULT_NAMESPACE_FILTERS[namespace as FilterNamespace] || { period: 'ALL' }) as T;
  },
  setFilter: () => {},
  setFilterGroup: () => {},
  setDateRange: () => {},
  setPeriod: () => {},
  resetFilters: () => {},
  syncWithGlobal: () => {},
  isFilterActive: () => false,
  registerDefaultFilters: () => {}
};

export function useFilterContext(): FilterContextType {
  const ctx = useContext(FilterContext);
  return ctx || FALLBACK_CONTEXT;
}
