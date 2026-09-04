import { useEffect, useMemo, useCallback } from 'react';
import { useFilterContext } from '../contexts/FilterContext';
import { GenericFilterGroup } from '../types/filters';

export function useFilters<T extends GenericFilterGroup = GenericFilterGroup>(
  namespace: string,
  defaultValues?: Partial<T>
) {
  const {
    filters: allFilters,
    getFilters,
    setFilter: setContextFilter,
    setFilterGroup: setContextFilterGroup,
    setDateRange: setContextDateRange,
    setPeriod: setContextPeriod,
    resetFilters: resetContextFilters,
    syncWithGlobal: syncContextWithGlobal,
    isFilterActive: checkFilterActive,
    registerDefaultFilters
  } = useFilterContext();

  // Register namespace defaults on mount if provided
  useEffect(() => {
    if (defaultValues) {
      registerDefaultFilters(namespace, defaultValues as GenericFilterGroup);
    }
  }, [namespace, defaultValues, registerDefaultFilters]);

  const currentFilters = useMemo<T>(() => {
    return getFilters<T>(namespace);
  }, [allFilters, namespace, getFilters]);

  const setFilter = useCallback(
    (key: keyof T | string, value: any) => {
      setContextFilter(namespace, String(key), value);
    },
    [namespace, setContextFilter]
  );

  const setFilterGroup = useCallback(
    (updater: Partial<T> | ((prev: T) => T)) => {
      setContextFilterGroup<T>(namespace, updater);
    },
    [namespace, setContextFilterGroup]
  );

  const setDateRange = useCallback(
    (start: string, end: string) => {
      setContextDateRange(namespace, start, end);
    },
    [namespace, setContextDateRange]
  );

  const setPeriod = useCallback(
    (period: string) => {
      setContextPeriod(namespace, period);
    },
    [namespace, setContextPeriod]
  );

  const resetFilters = useCallback(() => {
    resetContextFilters(namespace);
  }, [namespace, resetContextFilters]);

  const syncWithGlobalCalendar = useCallback(() => {
    syncContextWithGlobal(namespace);
  }, [namespace, syncContextWithGlobal]);

  const isFiltered = useMemo(() => {
    return checkFilterActive(namespace);
  }, [namespace, allFilters, checkFilterActive]);

  return {
    filters: currentFilters,
    setFilter,
    setFilterGroup,
    setDateRange,
    setPeriod,
    resetFilters,
    syncWithGlobalCalendar,
    isFiltered
  };
}

export default useFilters;
