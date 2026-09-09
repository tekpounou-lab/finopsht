import React, { createContext, useContext, useState, useMemo, useCallback } from "react";
import { Employee, LedgerTransaction, AttendanceRecord, PayrollRecord } from "../../../types";
import { toDateOnly, normalizeDateFilter, isDateInRange } from "../../../utils/dateNormalization";

export interface ExecutiveFilters {
  startDate: string;
  endDate: string;
  branchId: string; // "ALL" or ID
  departmentId: string; // "ALL" or ID
  employeeId: string; // "ALL" or ID
  contractType: string; // "ALL" or specific type
  transactionType: string; // "ALL" or specific type
  status: string; // "ALL" or specific status
  currency: string; // "HTG" or "USD"
  businessUnit: string; // "ALL" or specific Unit
}

export interface ExecutiveFilterContextState {
  filters: ExecutiveFilters;
  setFilters: (updater: React.SetStateAction<ExecutiveFilters>) => void;
  resetFilters: () => void;
  updateFilter: <K extends keyof ExecutiveFilters>(key: K, value: ExecutiveFilters[K]) => void;
  
  // High-fidelity centralized filter utility executors to eliminate duplicate rendering logic
  filterEmployees: (employees: Employee[]) => Employee[];
  filterTransactions: (transactions: LedgerTransaction[]) => LedgerTransaction[];
  filterAttendance: (records: AttendanceRecord[]) => AttendanceRecord[];
  filterPayrolls: (records: PayrollRecord[]) => PayrollRecord[];

  filterVersion: number;
  isFiltering: boolean;
  setIsFiltering: React.Dispatch<React.SetStateAction<boolean>>;
  pendingFilter: ExecutiveFilters | null;
  applyPendingFilter: () => void;
}

const defaultFilters: ExecutiveFilters = {
  startDate: toDateOnly(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  endDate: toDateOnly(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)),
  branchId: "ALL",
  departmentId: "ALL",
  employeeId: "ALL",
  contractType: "ALL",
  transactionType: "ALL",
  status: "ALL",
  currency: "HTG",
  businessUnit: "ALL",
};

const ExecutiveFilterContext = createContext<ExecutiveFilterContextState | null>(null);

export const ExecutiveFilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [filters, setFilters] = useState<ExecutiveFilters>(defaultFilters);
  const [filterVersion, setFilterVersion] = useState(1);
  const [isFiltering, setIsFiltering] = useState(false);
  const [pendingFilter, setPendingFilter] = useState<ExecutiveFilters | null>(null);

  React.useEffect(() => {
    console.debug("[ExecutiveFilterContext] Filters propagated to application:", {
      filters,
      filterVersion,
      isFiltering,
      hasPending: !!pendingFilter
    });
  }, [filters, filterVersion, isFiltering, pendingFilter]);

  const resetFilters = useCallback(() => {
    console.debug("[ExecutiveFilterContext] resetFilters triggered, target defaultFilters:", defaultFilters);
    if (isFiltering) {
      setPendingFilter(defaultFilters);
    } else {
      setFilters(defaultFilters);
      setFilterVersion((v) => v + 1);
    }
  }, [isFiltering]);

  const updateFilter = useCallback(<K extends keyof ExecutiveFilters>(key: K, value: ExecutiveFilters[K]) => {
    console.debug(`[ExecutiveFilterContext] updateFilter called for key '${key}':`, value);
    if (isFiltering) {
      setPendingFilter((prev) => {
        const base = prev || filters;
        if (base[key] === value) return prev;
        const updated = { ...base, [key]: value };
        console.debug("[ExecutiveFilterContext] Queued pending filter update:", updated);
        return updated;
      });
    } else {
      setFilters((prev) => {
        if (prev[key] === value) return prev;
        const updated = { ...prev, [key]: value };
        console.debug("[ExecutiveFilterContext] Direct filter update applied:", updated);
        setFilterVersion((v) => v + 1);
        return updated;
      });
    }
  }, [isFiltering, filters]);

  const setFiltersWithVersion = useCallback((updater: React.SetStateAction<ExecutiveFilters>) => {
    if (isFiltering) {
      setPendingFilter((prev) => {
        const base = prev || filters;
        const next = typeof updater === 'function' ? updater(base) : updater;
        console.debug("[ExecutiveFilterContext] setFilters (pending) updated:", next);
        return next;
      });
    } else {
      setFilters((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        if (next === prev) return prev;
        console.debug("[ExecutiveFilterContext] setFilters (active) updated:", next);
        setFilterVersion((v) => v + 1);
        return next;
      });
    }
  }, [isFiltering, filters]);

  const applyPendingFilter = useCallback(() => {
    if (pendingFilter) {
      setFilters(pendingFilter);
      setFilterVersion((v) => v + 1);
      setPendingFilter(null);
    }
  }, [pendingFilter]);

  // Pure memoized central filters
  const filterEmployees = useMemo(() => {
    return (employees: Employee[]): Employee[] => {
      return (employees || []).filter((e) => {
        const eBranch = e.branchId || (e as any).branch_id;
        const eDept = e.departmentId || (e as any).department_id;
        if (filters.branchId !== "ALL" && eBranch !== filters.branchId) return false;
        if (filters.departmentId !== "ALL" && eDept !== filters.departmentId) return false;
        if (filters.employeeId !== "ALL" && e.id !== filters.employeeId) return false;
        return true;
      });
    };
  }, [filters.branchId, filters.departmentId, filters.employeeId]);

  const filterTransactions = useMemo(() => {
    return (transactions: LedgerTransaction[]): LedgerTransaction[] => {
      const normBounds = normalizeDateFilter(filters.startDate, filters.endDate);
      return (transactions || []).filter((tx) => {
        const txBranch = tx.branchId || (tx as any).branch_id;
        const txDept = tx.departmentId || (tx as any).department_id;
        if (filters.branchId !== "ALL" && txBranch !== filters.branchId) return false;
        if (filters.departmentId !== "ALL" && txDept !== filters.departmentId) return false;
        if (filters.transactionType !== "ALL" && tx.type !== filters.transactionType) return false;
        if (filters.status !== "ALL" && tx.status !== filters.status) return false;
        if (filters.currency && filters.currency !== "ALL" && tx.currency !== filters.currency) return false;
        
        // Date range filtering using SSOT date normalization
        const rawDate = tx.date || (tx as any).transaction_date || (tx as any).transactionDate || (tx as any).createdAt;
        const txDate = toDateOnly(rawDate);
        if (normBounds.startDate && (!txDate || txDate < normBounds.startDate)) return false;
        if (normBounds.endDate && (!txDate || txDate > normBounds.endDate)) return false;
        return true;
      });
    };
  }, [filters.branchId, filters.departmentId, filters.transactionType, filters.status, filters.currency, filters.startDate, filters.endDate]);

  const filterAttendance = useMemo(() => {
    return (records: AttendanceRecord[]): AttendanceRecord[] => {
      const normBounds = normalizeDateFilter(filters.startDate, filters.endDate);
      return (records || []).filter((rec) => {
        const rBranch = rec.branchId || (rec as any).branch_id;
        const rDept = rec.departmentId || (rec as any).department_id;
        const rEmp = rec.employeeId || (rec as any).employee_id;
        if (filters.branchId !== "ALL" && rBranch !== filters.branchId) return false;
        if (filters.departmentId !== "ALL" && rDept !== filters.departmentId) return false;
        if (filters.employeeId !== "ALL" && rEmp !== filters.employeeId) return false;
        
        // Date range filtering using SSOT date normalization
        const rawDate = rec.date || (rec as any).created_at || (rec as any).createdAt;
        const recDate = toDateOnly(rawDate);
        if (normBounds.startDate && (!recDate || recDate < normBounds.startDate)) return false;
        if (normBounds.endDate && (!recDate || recDate > normBounds.endDate)) return false;
        return true;
      });
    };
  }, [filters.branchId, filters.departmentId, filters.employeeId, filters.startDate, filters.endDate]);

  const filterPayrolls = useMemo(() => {
    return (records: PayrollRecord[]): PayrollRecord[] => {
      const normBounds = normalizeDateFilter(filters.startDate, filters.endDate);
      return (records || []).filter((rec) => {
        const rBranchId = rec.branch_id || (rec as any).branchId;
        const rDeptId = rec.department_id || (rec as any).departmentId;
        const rEmpId = rec.employeeId || rec.employee_id;
        if (filters.branchId !== "ALL" && rBranchId !== filters.branchId) return false;
        if (filters.departmentId !== "ALL" && rDeptId !== filters.departmentId) return false;
        if (filters.employeeId !== "ALL" && rEmpId !== filters.employeeId) return false;
        if (filters.status !== "ALL" && rec.status !== filters.status) return false;
        
        // Date range filtering - check work period overlap with filter bounds
        const pStartRaw = rec.period_start || (rec as any).startDate || (rec as any).periodStart || (rec as any).generated_at || (rec as any).paymentDate || (rec as any).created_at || (rec as any).createdAt;
        const pEndRaw = rec.period_end || (rec as any).endDate || (rec as any).periodEnd || (rec as any).effectiveAccountingDate || pStartRaw;
        if (normBounds.startDate && normBounds.endDate) {
          if (!pStartRaw && !pEndRaw) return false;
          const recStart = toDateOnly(pStartRaw || pEndRaw);
          const recEnd = toDateOnly(pEndRaw || pStartRaw);
          if (!recStart || !recEnd || recEnd < normBounds.startDate || recStart > normBounds.endDate) return false;
        }
        return true;
      });
    };
  }, [filters.branchId, filters.departmentId, filters.employeeId, filters.status, filters.startDate, filters.endDate]);

  const contextValue = useMemo(() => ({
    filters,
    setFilters: setFiltersWithVersion,
    resetFilters,
    updateFilter,
    filterEmployees,
    filterTransactions,
    filterAttendance,
    filterPayrolls,
    filterVersion,
    isFiltering,
    setIsFiltering,
    pendingFilter,
    applyPendingFilter,
  }), [
    filters,
    setFiltersWithVersion,
    resetFilters,
    updateFilter,
    filterEmployees,
    filterTransactions,
    filterAttendance,
    filterPayrolls,
    filterVersion,
    isFiltering,
    pendingFilter,
    applyPendingFilter,
  ]);

  return (
    <ExecutiveFilterContext.Provider value={contextValue}>
      {children}
    </ExecutiveFilterContext.Provider>
  );
};

export const useExecutiveFilters = () => {
  const ctx = useContext(ExecutiveFilterContext);
  if (!ctx) {
    throw new Error("useExecutiveFilters must be used within an ExecutiveFilterProvider");
  }
  return ctx;
};

export function useFilteredData<T>(
  rawData: T[],
  filterFn: (data: T[]) => T[]
): { data: T[]; isStale: boolean; version: number } {
  const { filterVersion, isFiltering } = useExecutiveFilters();
  const [filtered, setFiltered] = useState<T[]>([]);
  const [lastVersion, setLastVersion] = useState(0);

  React.useEffect(() => {
    if (!isFiltering) {
      setFiltered(filterFn(rawData));
      setLastVersion(filterVersion);
    }
  }, [rawData, filterVersion, isFiltering, filterFn]);

  return {
    data: filtered,
    isStale: isFiltering || lastVersion !== filterVersion,
    version: lastVersion,
  };
}

