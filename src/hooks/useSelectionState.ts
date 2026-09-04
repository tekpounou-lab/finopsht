import { useState, useCallback } from "react";

export interface SelectionState<T = string> {
  selectedIds: Set<T>;
  toggleSelect: (id: T) => void;
  selectAll: (ids: T[]) => void;
  clearSelection: () => void;
  isSelected: (id: T) => boolean;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<T>>>;
}

export function useSelectionState<T = string>(initialSelection: T[] = []): SelectionState<T> {
  const [selectedIds, setSelectedIds] = useState<Set<T>>(new Set(initialSelection));

  const toggleSelect = useCallback((id: T) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: T[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback((id: T) => selectedIds.has(id), [selectedIds]);

  return {
    selectedIds,
    toggleSelect,
    selectAll,
    clearSelection,
    isSelected,
    setSelectedIds
  };
}
