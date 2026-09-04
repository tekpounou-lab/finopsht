import { useCallback } from "react";
import { ForensicLog } from "../types";
import { ForensicLogRepository } from "../repositories/ForensicLogRepository";
import { usePaginatedData, UsePaginatedDataOptions } from "./usePaginatedData";

export interface ForensicLogFilters {
  action?: string;
  severity?: string;
  tenantIdFilter?: string;
}

export interface UsePaginatedForensicLogsOptions extends UsePaginatedDataOptions<ForensicLogFilters> {
  businessId?: string;
  isGlobal?: boolean;
}

export function usePaginatedForensicLogs(options: UsePaginatedForensicLogsOptions = {}) {
  const { businessId, isGlobal = false, pageSize = 50, initialFilters, autoLoad = true } = options;

  const fetcher = useCallback(
    async ({ pageSize: size, lastDoc, filters }: { pageSize: number; lastDoc?: any; filters?: ForensicLogFilters }) => {
      if (isGlobal) {
        return await ForensicLogRepository.listGlobalLogsPaginated({
          pageSize: size,
          lastDoc,
          tenantIdFilter: filters?.tenantIdFilter
        });
      }

      if (!businessId) {
        return { items: [], lastDoc: null, hasMore: false, totalFetched: 0 };
      }

      return await ForensicLogRepository.listByBusinessPaginated(businessId, {
        pageSize: size,
        lastDoc,
        action: filters?.action,
        severity: filters?.severity
      });
    },
    [businessId, isGlobal]
  );

  return usePaginatedData<ForensicLog, ForensicLogFilters>(fetcher, {
    pageSize,
    initialFilters,
    autoLoad: autoLoad && (isGlobal || Boolean(businessId))
  });
}
