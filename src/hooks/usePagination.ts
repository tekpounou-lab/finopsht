import { useState, useMemo, useCallback } from "react";

export interface PaginationState {
  page: number;
  pageSize: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  nextPage: () => void;
  prevPage: () => void;
  goToPage: (p: number) => void;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  setPageSize: React.Dispatch<React.SetStateAction<number>>;
}

export function usePagination(totalItems: number, initialPage = 1, initialPageSize = 10): PaginationState {
  const [page, setPage] = useState<number>(initialPage);
  const [pageSize, setPageSize] = useState<number>(initialPageSize);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalItems / pageSize)), [totalItems, pageSize]);

  const nextPage = useCallback(() => {
    setPage((p) => Math.min(totalPages, p + 1));
  }, [totalPages]);

  const prevPage = useCallback(() => {
    setPage((p) => Math.max(1, p - 1));
  }, []);

  const goToPage = useCallback((p: number) => {
    setPage(Math.max(1, Math.min(totalPages, p)));
  }, [totalPages]);

  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(totalItems, startIndex + pageSize);

  return {
    page,
    pageSize,
    totalPages,
    startIndex,
    endIndex,
    nextPage,
    prevPage,
    goToPage,
    setPage,
    setPageSize
  };
}
