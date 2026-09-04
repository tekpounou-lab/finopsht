import { useCallback } from "react";
import { Invoice, InvoiceStatus } from "../types/crm";
import { InvoiceRepository } from "../repositories/crm/InvoiceRepository";
import { usePaginatedData, UsePaginatedDataOptions } from "./usePaginatedData";

export interface InvoiceFilters {
  status?: InvoiceStatus;
}

export interface UsePaginatedInvoicesOptions extends UsePaginatedDataOptions<InvoiceFilters> {
  businessId?: string;
}

export function usePaginatedInvoices(options: UsePaginatedInvoicesOptions) {
  const { businessId, pageSize = 25, initialFilters, autoLoad = true } = options;

  const fetcher = useCallback(
    async ({ pageSize: size, lastDoc, filters }: { pageSize: number; lastDoc?: any; filters?: InvoiceFilters }) => {
      if (!businessId) {
        return { items: [], lastDoc: null, hasMore: false, totalFetched: 0 };
      }

      return await InvoiceRepository.listInvoicesByBusinessPaginated(businessId, {
        pageSize: size,
        lastDoc,
        status: filters?.status
      });
    },
    [businessId]
  );

  return usePaginatedData<Invoice, InvoiceFilters>(fetcher, {
    pageSize,
    initialFilters,
    autoLoad: autoLoad && Boolean(businessId)
  });
}
