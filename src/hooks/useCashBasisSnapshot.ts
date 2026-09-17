import { useState, useEffect } from "react";
import { CashBasisSnapshot } from "../types/cash-basis";
import { CashBasisEngine } from "../domains/analytics/services/CashBasisEngine";
import { useBusinessContext } from "../contexts/BusinessContext";

export function useCashBasisSnapshot(filters: Record<string, any>) {
  const { currentBusiness, ledgerTransactions, payrollRecords, employees } = useBusinessContext();
  const [snapshot, setSnapshot] = useState<CashBasisSnapshot | null>(null);
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
        const snap = await CashBasisEngine.generateSnapshot(
          currentBusiness.id,
          filters,
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
