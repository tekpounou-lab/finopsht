import { useMemo } from 'react';
import { LedgerTransaction } from '../types';
import { useRealtimeSubscription } from './useRealtimeSubscription';
import { useFilters } from './useFilters';
import { LedgerQueryOptions } from '../repositories/LedgerRepository';
import { LedgerFilterParams } from '../components/ledger/types';

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

    let result = [...data].sort((a, b) => {
      const dateA = a.date || (a as any).transaction_date || (a as any).createdAt || '';
      const dateB = b.date || (b as any).transaction_date || (b as any).createdAt || '';
      return String(dateB).localeCompare(String(dateA));
    });

    // If options explicitly provide filters or useStoreFilters is requested
    const effectiveFilters = options?.useStoreFilters ? storeFilters : options;

    if (!effectiveFilters) {
      return result;
    }

    const {
      startDate,
      endDate,
      period,
      branchId,
      departmentId,
      employeeId,
      type,
      category,
      status,
      search
    } = effectiveFilters as any;

    if (startDate && endDate) {
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime();
      result = result.filter((tx) => {
        const dateStr = tx.date || (tx as any).transaction_date || (tx as any).createdAt;
        const date = new Date(dateStr).getTime();
        return !isNaN(date) && date >= start && date <= end;
      });
    } else if (period && period !== 'ALL') {
      result = result.filter((tx) => {
        const dateStr = tx.date || (tx as any).transaction_date || (tx as any).createdAt || '';
        return dateStr.startsWith(period);
      });
    }

    if (type && type.length > 0 && !type.includes('ALL')) {
      const allowed = Array.isArray(type) ? type : [type];
      result = result.filter((tx) => allowed.includes(tx.type));
    }

    if (branchId && branchId.length > 0 && !branchId.includes('ALL')) {
      const allowed = Array.isArray(branchId) ? branchId : [branchId];
      result = result.filter((tx) => allowed.includes(tx.branch_id || ''));
    }

    if (departmentId && departmentId.length > 0 && !departmentId.includes('ALL')) {
      const allowed = Array.isArray(departmentId) ? departmentId : [departmentId];
      result = result.filter((tx) => allowed.includes(tx.department_id || ''));
    }

    if (employeeId && employeeId.length > 0 && !employeeId.includes('ALL')) {
      const allowed = Array.isArray(employeeId) ? employeeId : [employeeId];
      result = result.filter((tx) => allowed.includes(tx.employee_id || (tx as any).employeeId || ''));
    }

    if (category && category !== 'ALL') {
      result = result.filter((tx) => tx.category === category);
    }

    if (status && status.length > 0 && !status.includes('ALL')) {
      const allowed = Array.isArray(status) ? status : [status];
      result = result.filter((tx) => allowed.includes((tx as any).status || 'POSTED'));
    }

    if (search && search.trim()) {
      const queryTerm = search.toLowerCase().trim();
      result = result.filter((tx) =>
        (tx.description || '').toLowerCase().includes(queryTerm) ||
        (tx.id || '').toLowerCase().includes(queryTerm) ||
        String(tx.amount || '').includes(queryTerm)
      );
    }

    return result;
  }, [data, options, storeFilters]);
}

export default useLedgerTransactions;
