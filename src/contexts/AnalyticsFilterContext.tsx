import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from "react";
import { toDateOnly } from "../utils/dateNormalization";
import { useExecutiveFilters } from "../domains/analytics/context/ExecutiveFilterContext";

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface AnalyticsFilters {
  dateRange: DateRange;
  branchId: string;
  departmentId: string;
  employeeId: string;
}

export interface AnalyticsFilterContextType {
  filters: AnalyticsFilters;
  setFilters: React.Dispatch<React.SetStateAction<AnalyticsFilters>>;
  updateFilter: <K extends keyof AnalyticsFilters>(key: K, value: AnalyticsFilters[K]) => void;
  updateDateRange: (startDate: string, endDate: string) => void;
  resetFilters: () => void;
}

const getTrailingStartDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return toDateOnly(d);
};

const defaultFilters: AnalyticsFilters = {
  dateRange: {
    startDate: getTrailingStartDate(),
    endDate: toDateOnly(new Date()),
  },
  branchId: "ALL",
  departmentId: "ALL",
  employeeId: "ALL",
};

export const AnalyticsFilterContext = createContext<AnalyticsFilterContextType | null>(null);

export const AnalyticsFilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const exec = useExecutiveFilters();

  const [filters, setFiltersInternal] = useState<AnalyticsFilters>(() => ({
    dateRange: {
      startDate: exec.filters.startDate || getTrailingStartDate(),
      endDate: exec.filters.endDate || toDateOnly(new Date()),
    },
    branchId: exec.filters.branchId || "ALL",
    departmentId: exec.filters.departmentId || "ALL",
    employeeId: exec.filters.employeeId || "ALL",
  }));

  // Sync from ExecutiveFilterContext to AnalyticsFilterContext
  useEffect(() => {
    setFiltersInternal((prev) => {
      if (
        prev.dateRange.startDate === exec.filters.startDate &&
        prev.dateRange.endDate === exec.filters.endDate &&
        prev.branchId === exec.filters.branchId &&
        prev.departmentId === exec.filters.departmentId &&
        prev.employeeId === exec.filters.employeeId
      ) {
        return prev;
      }
      return {
        dateRange: {
          startDate: exec.filters.startDate,
          endDate: exec.filters.endDate,
        },
        branchId: exec.filters.branchId,
        departmentId: exec.filters.departmentId,
        employeeId: exec.filters.employeeId,
      };
    });
  }, [exec.filters.startDate, exec.filters.endDate, exec.filters.branchId, exec.filters.departmentId, exec.filters.employeeId]);

  const updateFilter = useCallback(<K extends keyof AnalyticsFilters>(key: K, value: AnalyticsFilters[K]) => {
    setFiltersInternal((prev) => {
      if (JSON.stringify(prev[key]) === JSON.stringify(value)) return prev;
      return {
        ...prev,
        [key]: value,
      };
    });

    // Propagate to ExecutiveFilters
    if (key === "branchId" || key === "departmentId" || key === "employeeId") {
      exec.updateFilter(key as "branchId" | "departmentId" | "employeeId", value as string);
    }
  }, [exec]);

  const updateDateRange = useCallback((startDate: string, endDate: string) => {
    const normStart = toDateOnly(startDate);
    const normEnd = toDateOnly(endDate);

    setFiltersInternal((prev) => {
      if (prev.dateRange.startDate === normStart && prev.dateRange.endDate === normEnd) return prev;
      return {
        ...prev,
        dateRange: {
          startDate: normStart,
          endDate: normEnd,
        },
      };
    });

    exec.setFilters((prev) => {
      if (prev.startDate === normStart && prev.endDate === normEnd) return prev;
      return {
        ...prev,
        startDate: normStart,
        endDate: normEnd,
      };
    });
  }, [exec]);

  const setFilters = useCallback((updater: React.SetStateAction<AnalyticsFilters>) => {
    setFiltersInternal((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;

      // Propagate to ExecutiveFilters
      exec.setFilters((execPrev) => {
        if (
          execPrev.startDate === next.dateRange.startDate &&
          execPrev.endDate === next.dateRange.endDate &&
          execPrev.branchId === next.branchId &&
          execPrev.departmentId === next.departmentId &&
          execPrev.employeeId === next.employeeId
        ) {
          return execPrev;
        }
        return {
          ...execPrev,
          startDate: next.dateRange.startDate,
          endDate: next.dateRange.endDate,
          branchId: next.branchId,
          departmentId: next.departmentId,
          employeeId: next.employeeId,
        };
      });

      return next;
    });
  }, [exec]);

  const resetFilters = useCallback(() => {
    setFiltersInternal(defaultFilters);
    exec.resetFilters();
  }, [exec]);

  const contextValue = useMemo<AnalyticsFilterContextType>(
    () => ({
      filters,
      setFilters,
      updateFilter,
      updateDateRange,
      resetFilters,
    }),
    [filters, setFilters, updateFilter, updateDateRange, resetFilters]
  );

  return (
    <AnalyticsFilterContext.Provider value={contextValue}>
      {children}
    </AnalyticsFilterContext.Provider>
  );
};

export const useAnalyticsFilters = () => {
  const ctx = useContext(AnalyticsFilterContext);
  if (!ctx) {
    throw new Error("useAnalyticsFilters must be used within an AnalyticsFilterProvider");
  }
  return ctx;
};

// High-fidelity hook selector to consume BOTH filter state and derived analytical snapshots
import { useAnalytics } from "../domains/analytics/context/AnalyticsContext";

export function useAnalyticsData() {
  const { filters, setFilters, updateFilter, updateDateRange, resetFilters } = useAnalyticsFilters();
  const analytics = useAnalytics();

  return {
    filters,
    setFilters,
    updateFilter,
    updateDateRange,
    resetFilters,
    snapshot: analytics.snapshot,
    loading: analytics.loading || analytics.isLoading,
    refresh: analytics.refresh,
    status: analytics.status,
    employees: analytics.employees,
    transactions: analytics.transactions,
    attendanceLogs: analytics.attendanceLogs,
    payrollRecords: analytics.payrollRecords,
  };
}
