import { useState, useEffect } from "react";
import { AccrualBasisSnapshot } from "../types/accrual-basis";
import { AccrualBasisEngine } from "../domains/analytics/services/AccrualBasisEngine";
import { useBusinessContext } from "../contexts/BusinessContext";

export function useAccrualBasisSnapshot(filters: Record<string, any>) {
  const { currentBusiness, ledgerTransactions, payrollRecords, employees } = useBusinessContext();
  const [snapshot, setSnapshot] = useState<AccrualBasisSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (!currentBusiness?.id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const snap = await AccrualBasisEngine.generateSnapshot(
          currentBusiness.id,
          filters,
          ledgerTransactions,
          payrollRecords,
          employees
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
  }, [currentBusiness?.id, filterKey, ledgerTransactions, payrollRecords, employees]);

  return { snapshot, loading };
}
