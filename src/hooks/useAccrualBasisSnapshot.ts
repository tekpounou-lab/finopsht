import { useState, useEffect } from "react";
import { AccrualBasisSnapshot } from "../types/accrual-basis";
import { AccrualBasisEngine } from "../domains/analytics/services/AccrualBasisEngine";
import { useBusinessContext } from "../contexts/BusinessContext";
import { useAnalyticsFilters } from "../contexts/AnalyticsFilterContext";
import { useExecutiveFilters } from "../domains/analytics/context/ExecutiveFilterContext";
import { CurrencyRateRepository } from "../repositories/CurrencyRateRepository";
import type { NormalizationContext } from "../domains/analytics/utils/NormalizedAmountResolver";

export function useAccrualBasisSnapshot(overrideFilters?: Record<string, any>) {
  const { currentBusiness, ledgerTransactions, payrollRecords, employees, businessSettings, payrollCycles, invoices } = useBusinessContext() as any;
  const { filters: globalFilters } = useAnalyticsFilters();
  const { filters: execFilters } = useExecutiveFilters();
  const [snapshot, setSnapshot] = useState<AccrualBasisSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const resolvedFilters = {
    startDate: overrideFilters?.startDate !== undefined ? overrideFilters.startDate : globalFilters.dateRange.startDate,
    endDate: overrideFilters?.endDate !== undefined ? overrideFilters.endDate : globalFilters.dateRange.endDate,
    branchId: (overrideFilters?.branchId && overrideFilters.branchId !== "ALL") ? overrideFilters.branchId : (globalFilters.branchId || "ALL"),
    departmentId: (overrideFilters?.departmentId && overrideFilters.departmentId !== "ALL") ? overrideFilters.departmentId : (globalFilters.departmentId || "ALL"),
    employeeId: (overrideFilters?.employeeId && overrideFilters.employeeId !== "ALL") ? overrideFilters.employeeId : (globalFilters.employeeId || "ALL"),
    transactionType: overrideFilters?.transactionType || execFilters.transactionType || "ALL",
  };

  const filterKey = JSON.stringify(resolvedFilters);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (!currentBusiness?.id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        let normalizationContext: NormalizationContext = {};
        try {
          const normStart = resolvedFilters.startDate || "2020-01-01";
          const normEnd = resolvedFilters.endDate || new Date().toISOString().split("T")[0];
          normalizationContext = await CurrencyRateRepository.getRatesForPeriod(currentBusiness.id, normStart, normEnd);
        } catch (fxErr) {
          console.warn("[useAccrualBasisSnapshot] Failed to fetch rate grids:", fxErr);
        }

        const snap = await AccrualBasisEngine.generateSnapshot(
          currentBusiness.id,
          resolvedFilters,
          ledgerTransactions,
          payrollRecords,
          employees,
          {
            businessSettings: { ...businessSettings, ...currentBusiness?.settings },
            payrollCycles: payrollCycles || [],
            normalizationContext,
            invoices: invoices || [],
          }
        );
        if (isMounted) setSnapshot(snap);
      } catch (err) {
        console.error("Error loading accrual basis snapshot", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [currentBusiness?.id, currentBusiness?.settings, businessSettings, filterKey, ledgerTransactions, payrollRecords, payrollCycles, employees, invoices]);

  return { snapshot, loading };
}
