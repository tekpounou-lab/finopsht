import { useState, useEffect, useMemo, useCallback } from "react";
import { PerformanceRepository } from "../repositories/PerformanceRepository";
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
} from "../domains/performance/selectors";
import { useBusinessContext } from "../contexts/BusinessContext";

/**
 * Calculates start and end dates from a standard period preset
 */
export function calculateDateRangeForPeriod(period: PICPeriod): { startDate: string; endDate: string } {
  const today = new Date();
  const endIso = today.toISOString().split("T")[0];
  const start = new Date(today);

  switch (period) {
    case "7d":
      start.setDate(today.getDate() - 7);
      return { startDate: start.toISOString().split("T")[0], endDate: endIso };
    case "30d":
      start.setDate(today.getDate() - 30);
      return { startDate: start.toISOString().split("T")[0], endDate: endIso };
    case "this_month":
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      return { startDate: startOfMonth.toISOString().split("T")[0], endDate: endIso };
    case "last_month":
      const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      return {
        startDate: firstOfLastMonth.toISOString().split("T")[0],
        endDate: lastOfLastMonth.toISOString().split("T")[0],
      };
    case "quarter":
      start.setDate(today.getDate() - 90);
      return { startDate: start.toISOString().split("T")[0], endDate: endIso };
    case "year":
      start.setDate(today.getDate() - 365);
      return { startDate: start.toISOString().split("T")[0], endDate: endIso };
    case "custom":
    default:
      start.setDate(today.getDate() - 30);
      return { startDate: start.toISOString().split("T")[0], endDate: endIso };
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

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState<number>(0);

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

  // Primary Data Fetching Effect with full filter propagation
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      if (!businessId) {
        setIsLoading(false);
        return;
      }

      console.info(`[PIC] [usePerformanceData] Triggering data fetch for business ${businessId} with filters:`, filters);
      setIsLoading(true);
      setError(null);

      try {
        const fetchedData = await PerformanceRepository.getPerformanceData(businessId, filters);
        
        if (isMounted) {
          // Merge with live context if any dataset is empty in firestore during demo/mock mode
          const merged: RawPerformanceDataSet = {
            employees: fetchedData.employees.length > 0 ? fetchedData.employees : (ctxEmployees || []),
            transactions: fetchedData.transactions.length > 0 ? fetchedData.transactions : (ctxTxs || []),
            payrollRecords: fetchedData.payrollRecords.length > 0 ? fetchedData.payrollRecords : (ctxPayrolls || []),
            attendanceRecords: fetchedData.attendanceRecords.length > 0 ? fetchedData.attendanceRecords : (ctxAtt || []),
            branches: fetchedData.branches.length > 0 ? fetchedData.branches : (ctxBranches || []),
            departments: fetchedData.departments.length > 0 ? fetchedData.departments : (ctxDepartments || []),
            snapshots: fetchedData.snapshots,
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
  }, [
    businessId,
    filters.period,
    filters.startDate,
    filters.endDate,
    filters.branchId,
    filters.departmentId,
    filters.metricType,
    refreshIndex,
    ctxEmployees,
    ctxTxs,
    ctxPayrolls,
    ctxAtt,
    ctxBranches,
    ctxDepartments,
  ]);

  // Pure memoized metrics selection with active filter propagation
  const simplifiedMetrics: SimplifiedMetrics = useMemo(() => {
    return selectSimplifiedMetrics(rawDataSet, filters);
  }, [rawDataSet, filters]);

  const expertMetrics: ExpertMetrics = useMemo(() => {
    return selectExpertMetrics(rawDataSet, filters);
  }, [rawDataSet, filters]);

  return {
    filters,
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
    branches: rawDataSet.branches.length > 0 ? rawDataSet.branches : (ctxBranches || []),
    departments: rawDataSet.departments.length > 0 ? rawDataSet.departments : (ctxDepartments || []),
  };
}
