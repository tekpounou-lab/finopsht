import { useMemo } from "react";
import { PayrollCycle } from "../types";
import { useRealtimeSubscription } from "./useRealtimeSubscription";

export function usePayrollCycle(businessId?: string) {
  const { data: rawCycles, setData, loading, refresh } = useRealtimeSubscription<PayrollCycle>(
    "payroll_cycles",
    businessId ? [{ field: "business_id", operator: "==", value: businessId }] : [],
    { 
      enabled: Boolean(businessId), 
      businessId,
      orderByField: "endDate",
      orderDirection: "desc"
    }
  );

  const payrollCycles = useMemo(() => {
    return [...rawCycles].sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
  }, [rawCycles]);

  return {
    payrollCycles,
    setPayrollCycles: setData,
    loading,
    refresh
  };
}
