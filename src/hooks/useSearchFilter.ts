import { useState, useCallback } from "react";

export interface SearchFilterState<T extends Record<string, any>> {
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  filters: T;
  setFilters: React.Dispatch<React.SetStateAction<T>>;
  updateFilter: <K extends keyof T>(key: K, value: T[K]) => void;
  resetFilters: () => void;
}

export function useSearchFilter<T extends Record<string, any>>(
  initialFilters: T,
  initialSearch = ""
): SearchFilterState<T> {
  const [searchTerm, setSearchTerm] = useState<string>(initialSearch);
  const [filters, setFilters] = useState<T>(initialFilters);

  const updateFilter = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setSearchTerm(initialSearch);
    setFilters(initialFilters);
  }, [initialFilters, initialSearch]);

  return {
    searchTerm,
    setSearchTerm,
    filters,
    setFilters,
    updateFilter,
    resetFilters
  };
}
