import { useMemo } from 'react';
import { LedgerTransaction } from '../types';
import { useRealtimeSubscription } from './useRealtimeSubscription';
import { useFilters } from './useFilters';
import { LedgerQueryOptions } from '../repositories/LedgerRepository';
import { LedgerFilterParams } from '../components/ledger/types';
import { filterLedgerTransactions, extractTxDateString } from '../services/cfo/LedgerFilterEngine';

export interface UseLedgerTransactionsOptions extends LedgerQueryOptions {
  useStoreFilters?: boolean;
  namespace?: string;
}

/**
 * Hook to retrieve and subscribe to General Ledger transactions in real-time.
 * Automatically synchronizes with the centralized filter store (namespace 'gl' by default)
 * when `useStoreFilters` is enabled.
 */
export function useLedgerTransactions(
  business_id: string | undefined,
  options?: UseLedgerTransactionsOptions
) {
  const namespace = options?.namespace || 'gl';
  const { filters: storeFilters } = useFilters<LedgerFilterParams>(namespace);

  const { data } = useRealtimeSubscription<LedgerTransaction>(
    'ledger_transactions',
    business_id ? [{ field: 'business_id', operator: '==', value: business_id }] : [],
    {
      enabled: Boolean(business_id),
      businessId: business_id,
      limitCount: options?.limitTo || 3000
    }
  );

  return useMemo(() => {
    if (!data || data.length === 0) return [];

    const sortedData = [...data].sort((a, b) => {
      const dateA = extractTxDateString(a.date || (a as any).transaction_date || (a as any).transactionDate || (a as any).createdAt || (a as any).created_at);
      const dateB = extractTxDateString(b.date || (b as any).transaction_date || (b as any).transactionDate || (b as any).createdAt || (b as any).created_at);
      return dateB.localeCompare(dateA);
    });

    // If options explicitly provide filters or useStoreFilters is requested
    const effectiveFilters = options?.useStoreFilters ? storeFilters : options;

    console.debug("[Ledger Query] Filters:", { businessId: business_id, effectiveFilters, useStoreFilters: options?.useStoreFilters });
    console.debug("[Ledger Query] Retrieved", sortedData.length, "documents from Firestore. First doc:", sortedData[0]);

    if (!effectiveFilters) {
      return sortedData;
    }

    return filterLedgerTransactions(sortedData, effectiveFilters as LedgerFilterParams, {
      businessId: business_id
    });
  }, [data, options, storeFilters, business_id]);
}

export default useLedgerTransactions;
