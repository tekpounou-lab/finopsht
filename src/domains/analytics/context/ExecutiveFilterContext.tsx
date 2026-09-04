import React, { createContext, useContext, useState, useMemo } from "react";
import { Employee, LedgerTransaction, AttendanceRecord, PayrollRecord } from "../../../types";

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
  startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
  endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0],
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

  const resetFilters = () => {
    if (isFiltering) {
      setPendingFilter(defaultFilters);
    } else {
      setFilters(defaultFilters);
      setFilterVersion((v) => v + 1);
    }
  };

  const updateFilter = <K extends keyof ExecutiveFilters>(key: K, value: ExecutiveFilters[K]) => {
    if (isFiltering) {
      setPendingFilter((prev) => {
        const base = prev || filters;
        return { ...base, [key]: value };
      });
    } else {
      setFilters((prev) => {
        const next = { ...prev, [key]: value };
        setFilterVersion((v) => v + 1);
        return next;
      });
    }
  };

  const setFiltersWithVersion = (updater: React.SetStateAction<ExecutiveFilters>) => {
    if (isFiltering) {
      setPendingFilter((prev) => {
        const base = prev || filters;
        return typeof updater === 'function' ? updater(base) : updater;
      });
    } else {
      setFilters((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        setFilterVersion((v) => v + 1);
        return next;
      });
    }
  };

  const applyPendingFilter = () => {
    if (pendingFilter) {
      setFilters(pendingFilter);
      setFilterVersion((v) => v + 1);
      setPendingFilter(null);
    }
  };

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
      return (transactions || []).filter((tx) => {
        const txBranch = tx.branchId || (tx as any).branch_id;
        const txDept = tx.departmentId || (tx as any).department_id;
        if (filters.branchId !== "ALL" && txBranch !== filters.branchId) return false;
        if (filters.departmentId !== "ALL" && txDept !== filters.departmentId) return false;
        if (filters.transactionType !== "ALL" && tx.type !== filters.transactionType) return false;
        if (filters.status !== "ALL" && tx.status !== filters.status) return false;
        if (filters.currency && filters.currency !== "ALL" && tx.currency !== filters.currency) return false;
        
        // Date range filtering
        if (tx.date) {
          const txDate = tx.date.split("T")[0];
          if (filters.startDate && txDate < filters.startDate) return false;
          if (filters.endDate && txDate > filters.endDate) return false;
        }
        return true;
      });
    };
  }, [filters.branchId, filters.departmentId, filters.transactionType, filters.status, filters.currency, filters.startDate, filters.endDate]);

  const filterAttendance = useMemo(() => {
    return (records: AttendanceRecord[]): AttendanceRecord[] => {
      return (records || []).filter((rec) => {
        const rBranch = rec.branchId || (rec as any).branch_id;
        const rDept = rec.departmentId || (rec as any).department_id;
        const rEmp = rec.employeeId || (rec as any).employee_id;
        if (filters.branchId !== "ALL" && rBranch !== filters.branchId) return false;
        if (filters.departmentId !== "ALL" && rDept !== filters.departmentId) return false;
        if (filters.employeeId !== "ALL" && rEmp !== filters.employeeId) return false;
        
        // Date range filtering
        if (rec.date) {
          const recDate = rec.date.split("T")[0];
          if (filters.startDate && recDate < filters.startDate) return false;
          if (filters.endDate && recDate > filters.endDate) return false;
        }
        return true;
      });
    };
  }, [filters.branchId, filters.departmentId, filters.employeeId, filters.startDate, filters.endDate]);

  const filterPayrolls = useMemo(() => {
    return (records: PayrollRecord[]): PayrollRecord[] => {
      return (records || []).filter((rec) => {
        const rBranchId = rec.branch_id || (rec as any).branchId;
        const rDeptId = rec.department_id || (rec as any).departmentId;
        const rEmpId = rec.employeeId || rec.employee_id;
        if (filters.branchId !== "ALL" && rBranchId !== filters.branchId) return false;
        if (filters.departmentId !== "ALL" && rDeptId !== filters.departmentId) return false;
        if (filters.employeeId !== "ALL" && rEmpId !== filters.employeeId) return false;
        if (filters.status !== "ALL" && rec.status !== filters.status) return false;
        
        // Date range filtering
        const rawDate = rec.generated_at || rec.updated_at || (rec as any).paymentDate || (rec as any).created_at || (rec as any).period_end || (rec as any).period_start;
        if (rawDate) {
          const recDate = String(rawDate).split("T")[0];
          if (filters.startDate && recDate < filters.startDate) return false;
          if (filters.endDate && recDate > filters.endDate) return false;
        }
        return true;
      });
    };
  }, [filters.branchId, filters.departmentId, filters.employeeId, filters.status, filters.startDate, filters.endDate]);

  return (
    <ExecutiveFilterContext.Provider
      value={{
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
      }}
    >
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

