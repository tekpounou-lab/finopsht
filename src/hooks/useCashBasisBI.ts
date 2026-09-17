/**
 * FINOPS ERP — useCashBasisBI Hook
 * Phase 4 SSOT React Hook for Mode Simple BI
 *
 * Consumes raw context data, passes through CashBasisEngine pipeline,
 * and generates the canonical CashBasisViewModel consumed by all 6 BI tabs.
 */

import { useMemo, useState, useEffect } from 'react';
import { useBusinessContext } from '../contexts/BusinessContext';
import { CashBasisEngine } from '../domains/cash/engine/CashBasisEngine';
import { buildCashBasisViewModel } from '../domains/cash/viewmodel/cashViewModel.builder';
import type { CashBasisViewModel } from '../domains/cash/viewmodel/cashViewModel.types';

export interface UseCashBasisBIFilters {
  startDate: string;
  endDate: string;
  currency?: string;
  branchId?: string;
  departmentId?: string;
  cashAccountId?: string;
}

export interface UseCashBasisBIResult {
  viewModel: CashBasisViewModel | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCashBasisBI(filters: UseCashBasisBIFilters): UseCashBasisBIResult {
  const {
    business,
    ledgerTransactions = [],
    payrollRecords = [],
    payrollCycles = [],
    employees = [],
    departments = [],
    invoices = [],
  } = useBusinessContext() as any;

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const businessId = business?.id || 'default_biz';
  const currency = filters.currency || 'HTG';
  const startDate = filters.startDate || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const endDate = filters.endDate || new Date().toISOString().split('T')[0];

  const viewModel = useMemo(() => {
    try {
      setIsLoading(true);
      setError(null);

      // Filter raw records by branch/dept if specified
      const filteredLedger = ledgerTransactions.filter((tx: any) => {
        if (filters.branchId && filters.branchId !== 'ALL' && tx.branchId && tx.branchId !== filters.branchId) return false;
        if (filters.departmentId && filters.departmentId !== 'ALL' && tx.departmentId && tx.departmentId !== filters.departmentId) return false;
        return true;
      });

      const filteredPayroll = payrollRecords.filter((p: any) => {
        if (filters.branchId && filters.branchId !== 'ALL' && p.branchId && p.branchId !== filters.branchId) return false;
        if (filters.departmentId && filters.departmentId !== 'ALL' && p.departmentId && p.departmentId !== filters.departmentId) return false;
        return true;
      });

      // Execute canonical Cash Engine Pipeline
      const statement = CashBasisEngine.executePipeline(
        {
          invoices: invoices || [],
          payrollRecords: filteredPayroll,
          payrollCycles: payrollCycles || [],
          ledgerTransactions: filteredLedger,
        },
        {
          businessId,
          startDate,
          endDate,
          currency,
          cashAccountId: filters.cashAccountId,
        }
      );

      // Build department name map
      const deptNames: Record<string, string> = {};
      departments.forEach((d: any) => {
        if (d.id && d.name) deptNames[d.id] = d.name;
      });

      // Build canonical CashBasisViewModel
      const vm = buildCashBasisViewModel(statement, {
        employeeCount: employees.length,
        departmentNames: deptNames,
      });

      setIsLoading(false);
      return vm;
    } catch (err: any) {
      console.error('[useCashBasisBI] Error building Cash ViewModel:', err);
      setError(err?.message || 'Erreur lors du calcul du modèle de trésorerie Mode Simple');
      setIsLoading(false);
      return null;
    }
  }, [
    businessId,
    startDate,
    endDate,
    currency,
    filters.branchId,
    filters.departmentId,
    filters.cashAccountId,
    ledgerTransactions,
    payrollRecords,
    payrollCycles,
    employees,
    departments,
    invoices,
    refreshKey,
  ]);

  return {
    viewModel,
    isLoading,
    error,
    refetch: () => setRefreshKey((k) => k + 1),
  };
}
