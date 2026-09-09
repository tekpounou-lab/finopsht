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

  // Local state overlays to ensure instantaneous zero-delay UI feedback
  const [locallyDeletedCycleIds, setLocallyDeletedCycleIds] = useState<string[]>([]);
  const [localAddedCycles, setLocalAddedCycles] = useState<PayrollCycle[]>([]);
  const [localCycleUpdates, setLocalCycleUpdates] = useState<Record<string, Partial<PayrollCycle>>>({});
  const [locallyDeletedRecordIds, setLocallyDeletedRecordIds] = useState<string[]>([]);
  const [localAddedRecords, setLocalAddedRecords] = useState<PayrollRecord[]>([]);

  const deleteCycleLocal = useCallback((cycleId: string) => {
    console.debug(`[usePayrollRuns] Removing cycle locally: ${cycleId}`);
    setLocallyDeletedCycleIds((prev) => (prev.includes(cycleId) ? prev : [...prev, cycleId]));
    setLocalAddedCycles((prev) => prev.filter((c) => c.id !== cycleId));
  }, []);

  const updateCycleLocal = useCallback((cycleId: string, updates: Partial<PayrollCycle>) => {
    console.debug(`[usePayrollRuns] Updating cycle locally: ${cycleId}`, updates);
    setLocalCycleUpdates((prev) => ({
      ...prev,
      [cycleId]: { ...(prev[cycleId] || {}), ...updates },
    }));
  }, []);

  const addCycleLocal = useCallback((cycle: PayrollCycle) => {
    console.debug(`[usePayrollRuns] Adding cycle locally: ${cycle.id}`);
    setLocalAddedCycles((prev) => {
      const exists = prev.some((c) => c.id === cycle.id);
      if (exists) return prev.map((c) => (c.id === cycle.id ? { ...c, ...cycle } : c));
      return [cycle, ...prev];
    });
    setSelectedCycleId(cycle.id);
  }, []);

  const deleteRecordLocal = useCallback((recordId: string) => {
    console.debug(`[usePayrollRuns] Removing record locally: ${recordId}`);
    setLocallyDeletedRecordIds((prev) => (prev.includes(recordId) ? prev : [...prev, recordId]));
    setLocalAddedRecords((prev) => prev.filter((r) => r.id !== recordId));
  }, []);

  const addRecordsLocal = useCallback((records: PayrollRecord[]) => {
    console.debug(`[usePayrollRuns] Adding ${records.length} records locally`);
    setLocalAddedRecords((prev) => {
      const newIds = new Set(records.map((r) => r.id));
      const filteredPrev = prev.filter((r) => !newIds.has(r.id));
      return [...records, ...filteredPrev];
    });
  }, []);

  const deleteRecordsForExcludedEmployees = useCallback((cycleId: string, excludedEmpIds: string[]) => {
    console.debug(`[usePayrollRuns] Purging records for ${excludedEmpIds.length} excluded employees in cycle ${cycleId}`);
    setLocallyDeletedRecordIds((prev) => {
      const newDeleted = [...prev];
      (payrollRecords || []).forEach((r) => {
        if ((r.cycleId === cycleId || r.payroll_cycle_id === cycleId) && excludedEmpIds.includes(r.employeeId)) {
          if (!newDeleted.includes(r.id)) newDeleted.push(r.id);
        }
      });
      return newDeleted;
    });
    setLocalAddedRecords((prev) =>
      prev.filter((r) => !((r.cycleId === cycleId || r.payroll_cycle_id === cycleId) && excludedEmpIds.includes(r.employeeId)))
    );
  }, [payrollRecords]);

  const tenantCycles = useMemo(() => {
    console.debug("[Payroll] usePayrollRuns: cycles received:", (payrollCycles || []).length);
    let localDeleted: string[] = [];
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localDeleted = JSON.parse(localStorage.getItem(`deleted_cycles_${current_business_id}`) || "[]");
      }
    } catch (e) {
      console.warn("[usePayrollRuns] Failed reading deleted_cycles from localStorage:", e);
    }

    // Merge base cycles with locally added cycles
    const existingIds = new Set((payrollCycles || []).map((c) => c.id));
    const mergedList = [
      ...localAddedCycles.filter((c) => !existingIds.has(c.id)),
      ...(payrollCycles || []),
    ];

    const list = mergedList
      .filter(
        (c) =>
          (c.business_id === current_business_id || (c as any).businessId === current_business_id || !c.business_id) &&
          !(c as any).deleted &&
          (c as any).deleted !== "true" &&
          !localDeleted.includes(c.id) &&
          !locallyDeletedCycleIds.includes(c.id)
      )
      .map((c) => {
        if (localCycleUpdates[c.id]) {
          return { ...c, ...localCycleUpdates[c.id] };
        }
        return c;
      })
      .sort((a, b) => new Date(b.startDate || 0).getTime() - new Date(a.startDate || 0).getTime());

    console.debug("[Payroll] usePayrollRuns: tenantCycles available:", list.length);
    if (list.length > 0) return list;

    // Only generate fallback default cycle if no cycle was ever created for this tenant
    if ((!payrollCycles || payrollCycles.length === 0) && localDeleted.length === 0 && locallyDeletedCycleIds.length === 0) {
      const now = new Date();
      const month = (now.getMonth() + 1).toString().padStart(2, "0");
      const year = now.getFullYear();
      const defaultCycle: PayrollCycle = {
        id: `cyc_auto_${year}_${month}`,
        business_id: current_business_id,
        cycleName: `Paie ${month}/${year} - Quinzaine 1`,
        startDate: `${year}-${month}-01`,
        endDate: `${year}-${month}-15`,
        status: "DRAFT",
      };
      return [defaultCycle];
    }

    return [];
  }, [payrollCycles, current_business_id, localAddedCycles, locallyDeletedCycleIds, localCycleUpdates]);

  const activeCycle = useMemo(() => {
    if (selectedCycleId) {
      const found = tenantCycles.find((c) => c.id === selectedCycleId);
      if (found) return found;
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

    // Merge base records and local additions
    const addedIds = new Set(localAddedRecords.map((r) => r.id));
    const combinedRecords = [
      ...localAddedRecords,
      ...(payrollRecords || []).filter((r) => !addedIds.has(r.id)),
    ];

    return combinedRecords.filter((r) => {
      const isCycleMatch = r.cycleId === activeCycle.id || r.payroll_cycle_id === activeCycle.id || (r as any).cycle_id === activeCycle.id;
      if (!isCycleMatch) return false;
      if ((r as any).deleted || (r as any).deleted === "true") return false;
      if (r.isExcluded) return false;
      if (locallyDeletedRecordIds.includes(r.id)) return false;

      // Filter out excluded employees dynamically from the active cycle
      if (activeCycle.excludedEmployeeIds && activeCycle.excludedEmployeeIds.includes(r.employeeId)) {
        return false;
      }
      if (
        activeCycle.employeeIds &&
        activeCycle.employeeIds.length > 0 &&
        !activeCycle.employeeIds.includes(r.employeeId)
      ) {
        return false;
      }

      return true;
    });
  }, [payrollRecords, activeCycle, localAddedRecords, locallyDeletedRecordIds]);

  const isCycleLocked = useMemo(() => {
    return activeCycle?.status === "LOCKED" || activeCycle?.status === "PAID" || activeCycle?.status === "SEALED";
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
    deleteCycleLocal,
    updateCycleLocal,
    addCycleLocal,
    deleteRecordLocal,
    addRecordsLocal,
    deleteRecordsForExcludedEmployees,
  };
}
