import { useState, useEffect } from "react";
import { CashBasisSnapshot } from "../types/cash-basis";
import { CashBasisEngine } from "../domains/analytics/services/CashBasisEngine";
import { useBusinessContext } from "../contexts/BusinessContext";
import { useAnalyticsFilters } from "../contexts/AnalyticsFilterContext";

export function useCashBasisSnapshot(overrideFilters?: Record<string, any>) {
  const { currentBusiness, ledgerTransactions, payrollRecords, employees } = useBusinessContext();
  const { filters: globalFilters } = useAnalyticsFilters();
  const [snapshot, setSnapshot] = useState<CashBasisSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const resolvedFilters = {
    startDate: overrideFilters?.startDate || globalFilters.dateRange.startDate,
    endDate: overrideFilters?.endDate || globalFilters.dateRange.endDate,
    branchId: overrideFilters?.branchId || globalFilters.branchId,
    departmentId: overrideFilters?.departmentId || globalFilters.departmentId,
    employeeId: overrideFilters?.employeeId || globalFilters.employeeId,
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
        const snap = await CashBasisEngine.generateSnapshot(
          currentBusiness.id,
          resolvedFilters,
          ledgerTransactions,
          payrollRecords,
          employees
        );
        if (isMounted) setSnapshot(snap);
      } catch (err) {
        console.error("Error loading cash basis snapshot", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [currentBusiness?.id, filterKey, ledgerTransactions, payrollRecords, employees]);

  return { snapshot, loading };
}
