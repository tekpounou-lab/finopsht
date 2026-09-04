import { useState, useMemo, useCallback } from "react";
import { PayrollCycle, PayrollRecord, Role, Employee } from "../../../types";

export interface UsePayrollRunsProps {
  payrollCycles: PayrollCycle[];
  payrollRecords: PayrollRecord[];
  current_business_id: string;
  onLockCycle?: (cycleId: string, lockedBy: string) => void;
  onAddCycle?: (cycle: PayrollCycle) => void;
  onUpdateCycle?: (cycleId: string, updates: Partial<PayrollCycle>) => void;
}

export function usePayrollRuns({
  payrollCycles,
  payrollRecords,
  current_business_id,
  onLockCycle,
  onAddCycle,
  onUpdateCycle,
}: UsePayrollRunsProps) {
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const tenantCycles = useMemo(() => {
    return (payrollCycles || [])
      .filter((c) => c.business_id === current_business_id)
      .sort((a, b) => new Date(b.startDate || 0).getTime() - new Date(a.startDate || 0).getTime());
  }, [payrollCycles, current_business_id]);

  const activeCycle = useMemo(() => {
    if (selectedCycleId) {
      return tenantCycles.find((c) => c.id === selectedCycleId) || tenantCycles[0] || null;
    }
    return tenantCycles[0] || null;
  }, [tenantCycles, selectedCycleId]);

  const filteredCycles = useMemo(() => {
    return tenantCycles.filter((c) => {
      const matchStatus = filterStatus === "ALL" || c.status === filterStatus;
      const matchSearch =
        !searchQuery ||
        c.cycleName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.label?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [tenantCycles, filterStatus, searchQuery]);

  const activeCycleRecords = useMemo(() => {
    if (!activeCycle) return [];
    return (payrollRecords || []).filter(
      (r) => r.cycleId === activeCycle.id || r.payroll_cycle_id === activeCycle.id
    );
  }, [payrollRecords, activeCycle]);

  const isCycleLocked = useMemo(() => {
    return activeCycle?.status === "LOCKED" || activeCycle?.status === "PAID";
  }, [activeCycle]);

  const handleLockCycle = useCallback(
    (cycleId: string, lockedBy: string) => {
      if (onLockCycle) {
        onLockCycle(cycleId, lockedBy);
      } else if (onUpdateCycle) {
        onUpdateCycle(cycleId, {
          status: "LOCKED",
          validatedBy: lockedBy,
          validatedAt: new Date().toISOString(),
        });
      }
    },
    [onLockCycle, onUpdateCycle]
  );

  return {
    tenantCycles,
    activeCycle,
    selectedCycleId,
    setSelectedCycleId,
    filterStatus,
    setFilterStatus,
    searchQuery,
    setSearchQuery,
    filteredCycles,
    activeCycleRecords,
    isCycleLocked,
    handleLockCycle,
  };
}
