import { useState, useEffect, useMemo, useCallback } from "react";
import { PerformanceRepository } from "../repositories/PerformanceRepository";
import { CurrencyRateRepository } from "../repositories/CurrencyRateRepository";
import {
  PICFilters,
  PICPeriod,
  PICMetricType,
  RawPerformanceDataSet,
  SimplifiedMetrics,
  ExpertMetrics,
} from "../domains/performance/types";
import {
  selectSimplifiedMetrics,
  selectExpertMetrics,
  selectCashBasisExpertMetrics,
} from "../domains/performance/selectors";
import { useBusinessContext } from "../contexts/BusinessContext";
import { useExecutiveFilters } from "../domains/analytics/context/ExecutiveFilterContext";

/**
 * Calculates start and end dates from a standard period preset
 */
export function calculateDateRangeForPeriod(period: PICPeriod): { startDate: string; endDate: string } {
  const today = new Date();
  const endIso = today.toISOString().split("T")[0];
  const start = new Date(today);

  switch (period) {
    case "all":
      return { startDate: "", endDate: "" };
    case "7d":
      start.setDate(today.getDate() - 7);
      return { startDate: start.toISOString().split("T")[0], endDate: endIso };
    case "30d":
      start.setDate(today.getDate() - 30);
      return { startDate: start.toISOString().split("T")[0], endDate: endIso };
    case "this_month": {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { startDate: startOfMonth.toISOString().split("T")[0], endDate: endOfMonth.toISOString().split("T")[0] };
    }
    case "last_month": {
      const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      return {
        startDate: firstOfLastMonth.toISOString().split("T")[0],
        endDate: lastOfLastMonth.toISOString().split("T")[0],
      };
    }
    case "quarter":
      start.setDate(today.getDate() - 90);
      return { startDate: start.toISOString().split("T")[0], endDate: endIso };
    case "year":
      start.setDate(today.getDate() - 365);
      return { startDate: start.toISOString().split("T")[0], endDate: endIso };
    case "custom":
    default:
      return { startDate: "", endDate: "" };
  }
}

export function usePerformanceData(businessIdProp?: string) {
  const { business, branches: ctxBranches, departments: ctxDepartments, employees: ctxEmployees, ledgerTransactions: ctxTxs, payrollRecords: ctxPayrolls, attendanceRecords: ctxAtt } = useBusinessContext();
  const businessId = businessIdProp || business?.id;

  // Default date range (30 days)
  const defaultDates = useMemo(() => calculateDateRangeForPeriod("30d"), []);

  // Unified Filter State
  const [filters, setFilters] = useState<PICFilters>({
    period: "30d",
    startDate: defaultDates.startDate,
    endDate: defaultDates.endDate,
    branchId: "ALL",
    departmentId: "ALL",
    metricType: "all",
    searchQuery: "",
  });

  const [normalizationContext, setNormalizationContext] = useState<any>({});

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState<number>(0);

  const { filters: execFilters, setFilters: setExecutiveFilters } = useExecutiveFilters();

  // Harmonize ExecutiveFilterContext whenever PIC filters update
  useEffect(() => {
    setExecutiveFilters((prev) => {
      if (
        prev.branchId === filters.branchId &&
        prev.departmentId === filters.departmentId &&
        prev.startDate === filters.startDate &&
        prev.endDate === filters.endDate
      ) {
        return prev;
      }
      return {
        ...prev,
        branchId: filters.branchId,
        departmentId: filters.departmentId,
        startDate: filters.startDate,
        endDate: filters.endDate,
      };
    });
  }, [
    filters.branchId,
    filters.departmentId,
    filters.startDate,
    filters.endDate,
    setExecutiveFilters,
  ]);

  // Fetch normalization grids for the active period (including unbounded "all" date selections)
  useEffect(() => {
    let active = true;
    setNormalizationContext({});
    const fetchGrids = async () => {
      if (!businessId) return;
      try {
        let normStartDate = "2020-01-01";
        if (filters.startDate) {
          const s = new Date(filters.startDate);
          if (!isNaN(s.getTime())) {
            s.setMonth(s.getMonth() - 1);
            normStartDate = s.toISOString().split("T")[0];
          }
        }
        const normEndDate = filters.endDate || new Date().toISOString().split("T")[0];

        const grids = await CurrencyRateRepository.getRatesForPeriod(businessId, normStartDate, normEndDate);
        if (active) {
          setNormalizationContext(grids);
        }
      } catch (err) {
        console.warn("[usePerformanceData] Failed to fetch historical rate grids:", err);
      }
    };
    fetchGrids();
    return () => {
      active = false;
    };
  }, [businessId, filters.startDate, filters.endDate]);

  const [rawDataSet, setRawDataSet] = useState<RawPerformanceDataSet>({
    employees: [],
    transactions: [],
    payrollRecords: [],
    attendanceRecords: [],
    branches: [],
    departments: [],
    snapshots: [],
  });

  // Filter setters
  const setPeriod = useCallback((period: PICPeriod) => {
    console.info(`[PIC] [usePerformanceData] Updating period preset: ${period}`);
    if (period !== "custom") {
      const dates = calculateDateRangeForPeriod(period);
      setFilters((prev) => ({
        ...prev,
        period,
        startDate: dates.startDate,
        endDate: dates.endDate,
      }));
    } else {
      setFilters((prev) => ({ ...prev, period }));
    }
  }, []);

  const setDateRange = useCallback((startDate: string, endDate: string) => {
    console.info(`[PIC] [usePerformanceData] Updating custom date range: ${startDate} -> ${endDate}`);
    setFilters((prev) => ({
      ...prev,
      period: "custom",
      startDate,
      endDate,
    }));
  }, []);

  const setBranchId = useCallback((branchId: string) => {
    console.info(`[PIC] [usePerformanceData] Updating branchId filter: ${branchId}`);
    setFilters((prev) => ({ ...prev, branchId }));
  }, []);

  const setDepartmentId = useCallback((departmentId: string) => {
    console.info(`[PIC] [usePerformanceData] Updating departmentId filter: ${departmentId}`);
    setFilters((prev) => ({ ...prev, departmentId }));
  }, []);

  const setMetricType = useCallback((metricType: PICMetricType) => {
    console.info(`[PIC] [usePerformanceData] Updating metricType filter: ${metricType}`);
    setFilters((prev) => ({ ...prev, metricType }));
  }, []);

  const setSearchQuery = useCallback((searchQuery: string) => {
    setFilters((prev) => ({ ...prev, searchQuery }));
  }, []);

  const resetFilters = useCallback(() => {
    console.info(`[PIC] [usePerformanceData] Resetting all filters to defaults`);
    const initialDates = calculateDateRangeForPeriod("30d");
    setFilters({
      period: "30d",
      startDate: initialDates.startDate,
      endDate: initialDates.endDate,
      branchId: "ALL",
      departmentId: "ALL",
      metricType: "all",
      searchQuery: "",
    });
  }, []);

  const refresh = useCallback(() => {
    setRefreshIndex((prev) => prev + 1);
  }, []);

  // Helper to merge arrays deduplicating by id
  const mergeById = useCallback(<T extends { id?: string }>(fetched: T[] = [], context: T[] = []): T[] => {
    const map = new Map<string, T>();
    (context || []).forEach((item) => {
      if (item?.id) map.set(item.id, item);
    });
    (fetched || []).forEach((item) => {
      if (item?.id) {
        const existing = map.get(item.id);
        map.set(item.id, existing ? { ...existing, ...item } : item);
      }
    });
    return Array.from(map.values());
  }, []);

  // Primary Data Fetching Effect: executes ONLY on tenant switch or explicit manual refresh.
  // In-memory filter changes do NOT re-query Firestore, as selectors handle filtering purely in memory.
  useEffect(() => {
    let isMounted = true;

    // Strict Tenant Isolation: instantly clear dataset on tenant switch to prevent any cross-tenant data bleed
    setRawDataSet({
      employees: [],
      transactions: [],
      payrollRecords: [],
      attendanceRecords: [],
      branches: [],
      departments: [],
      snapshots: [],
    });

    async function loadData() {
      if (!businessId) {
        setIsLoading(false);
        return;
      }

      console.info(`[PIC] [usePerformanceData] Executing Firestore read for business ${businessId}`);
      setIsLoading(true);
      setError(null);

      try {
        const fetchedData = await PerformanceRepository.getPerformanceData(businessId);
        
        if (isMounted) {
          const merged: RawPerformanceDataSet = {
            employees: mergeById(fetchedData.employees, ctxEmployees),
            transactions: mergeById(fetchedData.transactions, ctxTxs),
            payrollRecords: mergeById(fetchedData.payrollRecords, ctxPayrolls),
            attendanceRecords: mergeById(fetchedData.attendanceRecords, ctxAtt),
            branches: mergeById(fetchedData.branches, ctxBranches),
            departments: mergeById(fetchedData.departments, ctxDepartments),
            snapshots: fetchedData.snapshots || [],
          };

          setRawDataSet(merged);
          console.info(`[PIC] [usePerformanceData] Data fetch successful. Total records stored:`, {
            employees: merged.employees.length,
            transactions: merged.transactions.length,
            payrollRecords: merged.payrollRecords.length,
            attendanceRecords: merged.attendanceRecords.length,
          });
        }
      } catch (err: any) {
        console.error(`[PIC] [usePerformanceData] Failed to load performance data:`, err);
        if (isMounted) {
          // Graceful fallback to context data
          setRawDataSet({
            employees: ctxEmployees || [],
            transactions: ctxTxs || [],
            payrollRecords: ctxPayrolls || [],
            attendanceRecords: ctxAtt || [],
            branches: ctxBranches || [],
            departments: ctxDepartments || [],
            snapshots: [],
          });
          setError(err.message || "Erreur de chargement des données de performance");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [businessId, refreshIndex]);

  // Synchronize live updates from BusinessContext into rawDataSet WITHOUT re-querying Firestore
  useEffect(() => {
    if (!businessId || (business?.id && business.id !== businessId)) return;
    setRawDataSet((prev) => {
      // If the dataset is empty, wait for primary loadData to complete
      if (prev.employees.length === 0 && prev.transactions.length === 0 && (ctxEmployees.length === 0 && ctxTxs.length === 0)) {
        return prev;
      }
      return {
        ...prev,
        employees: mergeById(prev.employees, ctxEmployees),
        transactions: mergeById(prev.transactions, ctxTxs),
        payrollRecords: mergeById(prev.payrollRecords, ctxPayrolls),
        attendanceRecords: mergeById(prev.attendanceRecords, ctxAtt),
        branches: mergeById(prev.branches, ctxBranches),
        departments: mergeById(prev.departments, ctxDepartments),
      };
    });
  }, [
    businessId,
    business?.id,
    ctxEmployees,
    ctxTxs,
    ctxPayrolls,
    ctxAtt,
    ctxBranches,
    ctxDepartments,
    mergeById,
  ]);

  const effectiveFilters: PICFilters = useMemo(
    () => ({
      ...filters,
      accountingBasis:
        execFilters?.accountingBasis ||
        (execFilters as any)?.accountingMode ||
        filters.accountingBasis ||
        "CASH",
    }),
    [filters, execFilters?.accountingBasis, (execFilters as any)?.accountingMode]
  );

  // Pure memoized metrics selection with active filter propagation
  const simplifiedMetrics: SimplifiedMetrics = useMemo(() => {
    return selectSimplifiedMetrics(rawDataSet, effectiveFilters, normalizationContext);
  }, [rawDataSet, effectiveFilters, normalizationContext]);

  const expertMetrics: ExpertMetrics = useMemo(() => {
    return selectExpertMetrics(rawDataSet, effectiveFilters, normalizationContext);
  }, [rawDataSet, effectiveFilters, normalizationContext]);

  const cashBasisMetrics: ExpertMetrics = useMemo(() => {
    return selectCashBasisExpertMetrics(rawDataSet, effectiveFilters, normalizationContext);
  }, [rawDataSet, effectiveFilters, normalizationContext]);

  const branches = useMemo(() => {
    const list = [...(rawDataSet.branches.length > 0 ? rawDataSet.branches : (ctxBranches || []))];
    const existingIds = new Set(list.map((b) => b.id));

    const checkAndAdd = (id?: string, name?: string) => {
      if (id && id !== "ALL" && !existingIds.has(id)) {
        existingIds.add(id);
        list.push({ id, name: name || id, business_id: businessId || "" } as any);
      }
    };

    (rawDataSet.employees || []).forEach((e: any) => checkAndAdd(e.branchId || e.branch_id, e.branchName || e.branch_name));
    (rawDataSet.payrollRecords || []).forEach((p: any) => checkAndAdd(p.branchId || p.branch_id, p.branchName || p.branch_name));
    (rawDataSet.transactions || []).forEach((t: any) => checkAndAdd(t.branchId || t.branch_id, t.branchName || t.branch_name));

    return list;
  }, [rawDataSet, ctxBranches, businessId]);

  const departments = useMemo(() => {
    const list = [...(rawDataSet.departments.length > 0 ? rawDataSet.departments : (ctxDepartments || []))];
    const existingIds = new Set(list.map((d) => d.id));

    const checkAndAdd = (id?: string, name?: string) => {
      if (id && id !== "ALL" && !existingIds.has(id)) {
        existingIds.add(id);
        list.push({ id, name: name || id, business_id: businessId || "" } as any);
      }
    };

    (rawDataSet.employees || []).forEach((e: any) => checkAndAdd(e.departmentId || e.department_id, e.departmentName || e.department_name));
    (rawDataSet.payrollRecords || []).forEach((p: any) => checkAndAdd(p.departmentId || p.department_id, p.departmentName || p.department_name));
    (rawDataSet.transactions || []).forEach((t: any) => checkAndAdd(t.departmentId || t.department_id, t.departmentName || t.department_name));

    return list;
  }, [rawDataSet, ctxDepartments, businessId]);

  return {
    filters: effectiveFilters,
    setPeriod,
    setDateRange,
    setBranchId,
    setDepartmentId,
    setMetricType,
    setSearchQuery,
    resetFilters,
    refresh,
    isLoading,
    error,
    rawDataSet,
    simplifiedMetrics,
    expertMetrics,
    cashBasisMetrics,
    branches,
    departments,
  };
}
