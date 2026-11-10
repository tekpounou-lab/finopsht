import React, { createContext, useContext, useState, useMemo, useCallback } from "react";
import { Employee, LedgerTransaction, AttendanceRecord, PayrollRecord } from "../../../types";
import { toDateOnly, normalizeDateFilter, isDateInRange, isValidIsoDateStr } from "../../../utils/dateNormalization";

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
  accountingBasis: "CASH" | "ACCRUAL";
  presentationMode: "SIMPLIFIED" | "EXPERT";
  /** @deprecated Use accountingBasis instead */
  accountingMode?: "CASH" | "ACCRUAL";
}

export interface ExecutiveFilterContextState {
  filters: ExecutiveFilters;
  setFilters: (updater: React.SetStateAction<ExecutiveFilters>) => void;
  resetFilters: () => void;
  clearPersistedFilters?: () => void;
  updateFilter: <K extends keyof ExecutiveFilters>(key: K, value: ExecutiveFilters[K]) => void;
  setAccountingBasis: (basis: "CASH" | "ACCRUAL") => void;
  setPresentationMode: (mode: "SIMPLIFIED" | "EXPERT") => void;
  
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

const STORAGE_KEY_V3 = "finops_executive_filters_v3";
const STORAGE_KEY_V2 = "finops_executive_filters_v2";
const PERSISTED_FILTER_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours max session lifetime

const getTrailingStartDate = (refDate: Date = new Date()) => {
  const d = new Date(refDate);
  d.setDate(d.getDate() - 30);
  return toDateOnly(d);
};

export const createDefaultExecutiveFilters = (refDate: Date = new Date()): ExecutiveFilters => ({
  startDate: getTrailingStartDate(refDate),
  endDate: toDateOnly(refDate),
  branchId: "ALL",
  departmentId: "ALL",
  employeeId: "ALL",
  contractType: "ALL",
  transactionType: "ALL",
  status: "ALL",
  currency: "HTG",
  businessUnit: "ALL",
  accountingBasis: "CASH",
  presentationMode: "SIMPLIFIED",
  accountingMode: "CASH",
});

const sanitizeRestoredDateBounds = (
  rawStart: unknown,
  rawEnd: unknown,
  fallbackStart: string,
  fallbackEnd: string
): { startDate: string; endDate: string } => {
  const s = typeof rawStart === "string" ? rawStart.trim() : undefined;
  const e = typeof rawEnd === "string" ? rawEnd.trim() : undefined;

  if (s === undefined || e === undefined) {
    return { startDate: fallbackStart, endDate: fallbackEnd };
  }

  // Empty strings represent an explicit unbounded "All Dates" selection
  const sValid = s === "" || isValidIsoDateStr(s);
  const eValid = e === "" || isValidIsoDateStr(e);
  if (!sValid || !eValid) {
    return { startDate: fallbackStart, endDate: fallbackEnd };
  }

  if (s && e && s > e) {
    return { startDate: fallbackStart, endDate: fallbackEnd };
  }

  return { startDate: s, endDate: e };
};

export const loadPersistedExecutiveFilters = (refDate: Date = new Date()): ExecutiveFilters => {
  const defaults = createDefaultExecutiveFilters(refDate);
  const todayStr = toDateOnly(refDate);

  try {
    // Purge legacy unvalidated v2 storage key so stale historical dates cannot silently migrate
    if (localStorage.getItem(STORAGE_KEY_V2) !== null) {
      localStorage.removeItem(STORAGE_KEY_V2);
    }

    const rawV3 = localStorage.getItem(STORAGE_KEY_V3);
    if (!rawV3) {
      return defaults;
    }

    const parsed = JSON.parse(rawV3);
    if (!parsed || typeof parsed !== "object") {
      localStorage.removeItem(STORAGE_KEY_V3);
      return defaults;
    }

    const persistedAt = typeof parsed._persistedAt === "number" ? parsed._persistedAt : 0;
    const persistedDate = typeof parsed._persistedDate === "string" ? parsed._persistedDate : "";
    const isStaleSession =
      !persistedAt ||
      (refDate.getTime() - persistedAt) > PERSISTED_FILTER_TTL_MS ||
      (persistedDate !== "" && persistedDate !== todayStr);

    const basis: "CASH" | "ACCRUAL" =
      parsed.accountingBasis === "ACCRUAL" || parsed.accountingMode === "ACCRUAL"
        ? "ACCRUAL"
        : "CASH";
    const presentationMode: "SIMPLIFIED" | "EXPERT" =
      parsed.presentationMode === "EXPERT" ? "EXPERT" : "SIMPLIFIED";

    if (isStaleSession) {
      // Never restore historical date bounds from a prior day/session; reset temporal window to current defaults
      const refreshed: ExecutiveFilters = {
        ...defaults,
        accountingBasis: basis,
        presentationMode,
        accountingMode: basis,
      };
      localStorage.setItem(
        STORAGE_KEY_V3,
        JSON.stringify({
          ...refreshed,
          _persistedAt: refDate.getTime(),
          _persistedDate: todayStr,
        })
      );
      return refreshed;
    }

    const validDates = sanitizeRestoredDateBounds(
      parsed.startDate,
      parsed.endDate,
      defaults.startDate,
      defaults.endDate
    );

    return {
      ...defaults,
      startDate: validDates.startDate,
      endDate: validDates.endDate,
      branchId: typeof parsed.branchId === "string" && parsed.branchId ? parsed.branchId : "ALL",
      departmentId: typeof parsed.departmentId === "string" && parsed.departmentId ? parsed.departmentId : "ALL",
      employeeId: typeof parsed.employeeId === "string" && parsed.employeeId ? parsed.employeeId : "ALL",
      contractType: typeof parsed.contractType === "string" && parsed.contractType ? parsed.contractType : "ALL",
      transactionType: typeof parsed.transactionType === "string" && parsed.transactionType ? parsed.transactionType : "ALL",
      status: typeof parsed.status === "string" && parsed.status ? parsed.status : "ALL",
      currency: typeof parsed.currency === "string" && parsed.currency ? parsed.currency : "HTG",
      businessUnit: typeof parsed.businessUnit === "string" && parsed.businessUnit ? parsed.businessUnit : "ALL",
      accountingBasis: basis,
      presentationMode,
      accountingMode: basis,
    };
  } catch (err) {
    console.warn("[ExecutiveFilterContext] Failed to load persisted filters:", err);
    try {
      localStorage.removeItem(STORAGE_KEY_V3);
    } catch {
      // Ignore storage access errors
    }
  }
  return defaults;
};

const ExecutiveFilterContext = createContext<ExecutiveFilterContextState | null>(null);

export const ExecutiveFilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [filters, setFilters] = useState<ExecutiveFilters>(() => loadPersistedExecutiveFilters());
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
    try {
      localStorage.setItem(
        STORAGE_KEY_V3,
        JSON.stringify({
          ...filters,
          _persistedAt: Date.now(),
          _persistedDate: toDateOnly(new Date()),
        })
      );
    } catch (err) {
      console.warn("[ExecutiveFilterContext] Failed to persist filters to localStorage:", err);
    }
  }, [filters, filterVersion, isFiltering, pendingFilter]);

  const resetFilters = useCallback(() => {
    const freshDefaults = createDefaultExecutiveFilters();
    console.debug("[ExecutiveFilterContext] resetFilters triggered, target freshDefaults:", freshDefaults);
    try {
      localStorage.removeItem(STORAGE_KEY_V2);
      localStorage.setItem(
        STORAGE_KEY_V3,
        JSON.stringify({
          ...freshDefaults,
          _persistedAt: Date.now(),
          _persistedDate: toDateOnly(new Date()),
        })
      );
    } catch {
      // Ignore storage access errors
    }
    if (isFiltering) {
      setPendingFilter(freshDefaults);
    } else {
      setFilters(freshDefaults);
      setFilterVersion((v) => v + 1);
    }
  }, [isFiltering]);

  const clearPersistedFilters = useCallback(() => {
    const freshDefaults = createDefaultExecutiveFilters();
    try {
      localStorage.removeItem(STORAGE_KEY_V3);
      localStorage.removeItem(STORAGE_KEY_V2);
    } catch {
      // Ignore storage access errors
    }
    setFilters(freshDefaults);
    setPendingFilter(null);
    setFilterVersion((v) => v + 1);
  }, []);

  const updateFilter = useCallback(<K extends keyof ExecutiveFilters>(key: K, value: ExecutiveFilters[K]) => {
    console.debug(`[ExecutiveFilterContext] updateFilter called for key '${key}':`, value);
    setFilters((prev) => {
      if (prev[key] === value) return prev;
      const updated = { ...prev, [key]: value };
      console.debug("[ExecutiveFilterContext] Direct filter update applied:", updated);
      setFilterVersion((v) => v + 1);
      return updated;
    });
    setPendingFilter(null);
  }, []);

  const setAccountingBasis = useCallback((basis: "CASH" | "ACCRUAL") => {
    updateFilter("accountingBasis", basis);
    updateFilter("accountingMode", basis);
  }, [updateFilter]);

  const setPresentationMode = useCallback((mode: "SIMPLIFIED" | "EXPERT") => {
    updateFilter("presentationMode", mode);
  }, [updateFilter]);

  const setFiltersWithVersion = useCallback((updater: React.SetStateAction<ExecutiveFilters>) => {
    setFilters((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next === prev) return prev;
      console.debug("[ExecutiveFilterContext] setFilters (active) updated:", next);
      setFilterVersion((v) => v + 1);
      return next;
    });
    setPendingFilter(null);
  }, []);

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
        if (filters.branchId !== "ALL" && (!eBranch || eBranch !== filters.branchId)) return false;
        if (filters.departmentId !== "ALL" && (!eDept || eDept !== filters.departmentId)) return false;
        if (filters.employeeId !== "ALL" && (!e.id || e.id !== filters.employeeId)) return false;
        return true;
      });
    };
  }, [filters.branchId, filters.departmentId, filters.employeeId]);

  const filterTransactions = useMemo(() => {
    return (transactions: LedgerTransaction[]): LedgerTransaction[] => {
      const normBounds = normalizeDateFilter(filters.startDate, filters.endDate);
      return (transactions || []).filter((tx) => {
        const txBranch = tx.branchId || (tx as any).branch_id || (tx as any).cost_center_id;
        const txDept = tx.departmentId || (tx as any).department_id || (tx as any).department;
        if (filters.branchId !== "ALL" && (!txBranch || txBranch !== filters.branchId)) return false;
        if (filters.departmentId !== "ALL" && (!txDept || txDept !== filters.departmentId)) return false;
        if (filters.transactionType !== "ALL" && tx.type !== filters.transactionType) return false;
        if (filters.status !== "ALL" && tx.status !== filters.status) return false;
        if (filters.currency && filters.currency !== "ALL" && (tx.currency || "HTG") !== filters.currency) return false;
        
        // Date range filtering using SSOT date normalization
        const rawDate =
          tx.date ||
          (tx as any).transaction_date ||
          (tx as any).transactionDate ||
          (tx as any).effectiveAccountingDate ||
          (tx as any).effective_date ||
          (tx as any).date_str ||
          (tx as any).dateStr ||
          (tx as any).created_at ||
          (tx as any).createdAt ||
          (tx as any).timestamp;
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
        if (filters.branchId !== "ALL" && (!rBranch || rBranch !== filters.branchId)) return false;
        if (filters.departmentId !== "ALL" && (!rDept || rDept !== filters.departmentId)) return false;
        if (filters.employeeId !== "ALL" && (!rEmp || rEmp !== filters.employeeId)) return false;
        
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
        if (filters.branchId !== "ALL" && (!rBranchId || rBranchId !== filters.branchId)) return false;
        if (filters.departmentId !== "ALL" && (!rDeptId || rDeptId !== filters.departmentId)) return false;
        if (filters.employeeId !== "ALL" && (!rEmpId || rEmpId !== filters.employeeId)) return false;
        if (filters.status !== "ALL" && rec.status !== filters.status) return false;
        
        // Date range filtering - check work period overlap with filter bounds
        const pStartRaw = rec.period_start || (rec as any).startDate || (rec as any).periodStart || (rec as any).generated_at || (rec as any).paymentDate || (rec as any).created_at || (rec as any).createdAt;
        const pEndRaw = rec.period_end || (rec as any).endDate || (rec as any).periodEnd || (rec as any).effectiveAccountingDate || pStartRaw;
        if (normBounds.startDate || normBounds.endDate) {
          if (!pStartRaw && !pEndRaw) return false;
          const recStart = toDateOnly(pStartRaw || pEndRaw);
          const recEnd = toDateOnly(pEndRaw || pStartRaw);
          if (!recStart || !recEnd) return false;
          if (normBounds.startDate && recEnd < normBounds.startDate) return false;
          if (normBounds.endDate && recStart > normBounds.endDate) return false;
        }
        return true;
      });
    };
  }, [filters.branchId, filters.departmentId, filters.employeeId, filters.status, filters.startDate, filters.endDate]);

  const contextValue = useMemo(() => ({
    filters,
    setFilters: setFiltersWithVersion,
    resetFilters,
    clearPersistedFilters,
    updateFilter,
    setAccountingBasis,
    setPresentationMode,
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
    clearPersistedFilters,
    updateFilter,
    setAccountingBasis,
    setPresentationMode,
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

