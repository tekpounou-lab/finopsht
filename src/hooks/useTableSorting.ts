import { useState, useCallback } from "react";

export type SortDirection = "asc" | "desc";

export interface TableSortingState<K extends string = string> {
  sortKey: K;
  sortDirection: SortDirection;
  toggleSort: (key: K) => void;
  setSortKey: React.Dispatch<React.SetStateAction<K>>;
  setSortDirection: React.Dispatch<React.SetStateAction<SortDirection>>;
}

export function useTableSorting<K extends string = string>(
  defaultKey: K,
  defaultDirection: SortDirection = "asc"
): TableSortingState<K> {
  const [sortKey, setSortKey] = useState<K>(defaultKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultDirection);

  const toggleSort = useCallback((key: K) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }, [sortKey]);

  return {
    sortKey,
    sortDirection,
    toggleSort,
    setSortKey,
    setSortDirection
  };
}
