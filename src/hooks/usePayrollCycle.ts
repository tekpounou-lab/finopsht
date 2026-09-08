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
    }
  );

  const payrollCycles = useMemo(() => {
    return [...rawCycles]
      .filter((c) => !(c as any).deleted && (c as any).deleted !== "true")
      .sort((a, b) => new Date(b.startDate || b.endDate || 0).getTime() - new Date(a.startDate || a.endDate || 0).getTime());
  }, [rawCycles]);

  return {
    payrollCycles,
    setPayrollCycles: setData,
    loading,
    refresh
  };
}
