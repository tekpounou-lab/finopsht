/**
 * FINOPS ERP — useCashBasisBI Hook
 * Phase 4 & Phase 5 Hook Architecture
 *
 * Exposes the canonical CashBasisViewModel and pipeline execution.
 */

import { useMemo } from 'react';
import { useBusinessContext } from '../../../contexts/BusinessContext';
import { CashBasisEngine } from '../engine/CashBasisEngine';
import { buildCashBasisViewModel } from '../viewmodel/cashViewModel.builder';
import type { CashBasisViewModel } from '../viewmodel/cashViewModel.types';

export function useCashBasisBI(filters?: {
  startDate?: string;
  endDate?: string;
  currency?: string;
  cashAccountId?: string;
}): { viewModel: CashBasisViewModel | null; isLoading: boolean } {
  const { currentBusiness, ledgerTransactions, invoices, payrollRecords } = useBusinessContext() as any;

  const viewModel = useMemo(() => {
    const businessId = currentBusiness?.id || 'default_business';
    const startDate = filters?.startDate || '2026-08-01';
    const endDate = filters?.endDate || '2026-08-31';
    const currency = filters?.currency || 'HTG';

    const statement = CashBasisEngine.executePipeline(
      {
        invoices: invoices || [],
        payrollRecords: payrollRecords || [],
        ledgerTransactions: ledgerTransactions || [],
      },
      {
        businessId,
        startDate,
        endDate,
        currency,
        cashAccountId: filters?.cashAccountId,
      }
    );

    return buildCashBasisViewModel(statement);
  }, [currentBusiness, ledgerTransactions, invoices, payrollRecords, filters]);

  return { viewModel, isLoading: false };
}
