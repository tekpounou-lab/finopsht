import { useCallback } from "react";
import { LedgerTransaction } from "../types";
import { LedgerRepository, LedgerQueryOptions } from "../repositories/LedgerRepository";
import { usePaginatedData, UsePaginatedDataOptions } from "./usePaginatedData";

export interface UsePaginatedLedgerOptions extends UsePaginatedDataOptions<LedgerQueryOptions> {
  businessId?: string;
}

export function usePaginatedLedger(options: UsePaginatedLedgerOptions) {
  const { businessId, pageSize = 50, initialFilters, autoLoad = true } = options;

  const fetcher = useCallback(
    async ({ pageSize: size, lastDoc, filters }: { pageSize: number; lastDoc?: any; filters?: LedgerQueryOptions }) => {
      if (!businessId) {
        return { items: [], lastDoc: null, hasMore: false, totalFetched: 0 };
      }
      return await LedgerRepository.listByBusinessPaginated(businessId, {
        ...filters,
        pageSize: size,
        lastDoc
      });
    },
    [businessId]
  );

  return usePaginatedData<LedgerTransaction, LedgerQueryOptions>(fetcher, {
    pageSize,
    initialFilters,
    autoLoad: autoLoad && Boolean(businessId)
  });
}
