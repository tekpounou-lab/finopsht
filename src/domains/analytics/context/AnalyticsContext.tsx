import React, { createContext, useContext, useEffect, useState, useMemo, useDeferredValue } from "react";
import { db } from "../../../lib/firebase";
import { collection, orderBy, limit } from "firebase/firestore";
import { useAuth } from "../../../hooks/useAuth";
import { useBusinessContext } from "../../../contexts/BusinessContext";
import { useI18n } from "../../../i18n";
import { tenantQuery, realtimeManager } from "../../../services/firestore/realtimeManager";
import { useAnalyticsSubscriptions } from "../../../hooks/useAnalyticsSubscriptions";
import { AnalyticsInitializer } from "../../../services/analytics/AnalyticsInitializer";
import {
  Employee,
  LedgerTransaction,
  AttendanceRecord,
  PayrollRecord,
  EmployeeContract,
  EmployeeDepartmentActivity,
} from "../../../types";
import { AnalyticsPeriod, AnalyticsSnapshot } from "../types";
import { AnalyticsEngine } from "../services/AnalyticsEngine";
import { AnalyticsRepository } from "../repositories/AnalyticsRepository";
import { AnalyticsEngine as SemanticAnalyticsEngine } from "../../../modules/analytics/core/AnalyticsEngine";
import { RuntimeEngine } from "../../../modules/runtime/RuntimeEngine";
import { useExecutiveFilters } from "./ExecutiveFilterContext";

export interface AnalyticsContextState {
  period: AnalyticsPeriod;
  setPeriod: (period: AnalyticsPeriod) => void;
  customRange: { startDate: string; endDate: string } | undefined;
  setCustomRange: (range: { startDate: string; endDate: string } | undefined) => void;
  snapshot: AnalyticsSnapshot | null;
  isLoading: boolean;
  
  // Under the hood actual collections
  employees: Employee[];
  transactions: LedgerTransaction[];
  attendanceLogs: AttendanceRecord[];
  payrollRecords: PayrollRecord[];
  contracts: EmployeeContract[];

  // Part 3 required fields for Enterprise Architecture compatibility
  loading: boolean;
  refresh: () => void;
  selectedPeriod: AnalyticsPeriod;
  setSelectedPeriod: (period: AnalyticsPeriod) => void;
  comparisonPeriod: AnalyticsPeriod;
  lastUpdated: string | null;
  status: "idle" | "loading" | "syncing" | "error";

  // Semantic V1.5 Analytics Engine fields
  semanticEngine: SemanticAnalyticsEngine;
  runSemanticAnalytics: (selectedMonth: number | string, selectedYear: number) => any;
  explainKPI: (kpiId: string, dimension: any, selectedMonth: number | string, selectedYear: number) => any;
}

const AnalyticsContext = createContext<AnalyticsContextState | null>(null);

export const AnalyticsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { filters } = useExecutiveFilters();
  const { dbUser } = useAuth();
  const {
    business,
    branches,
    departments,
    employees: contextEmployees,
    ledgerTransactions: contextTxs,
    attendanceRecords: contextAtt,
    payrollRecords: contextPay,
    employeeContracts: contextContracts,
    businessSettings,
    state,
  } = useBusinessContext();
  const { language } = useI18n();

  // 0. Register with Runtime
  useEffect(() => {
    RuntimeEngine.registerModule({
      name: "ANALYTICS",
      version: "1.5.0",
      onInitialize: async () => console.log("[AnalyticsModule] Initializing...")
    });
  }, []);

  const businessId = business?.id || dbUser?.business_id;

  // Selected Period & Date bounds
  const [period, setPeriod] = useState<AnalyticsPeriod>("MONTH");
  const [customRange, setCustomRange] = useState<{ startDate: string; endDate: string } | undefined>(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    return {
      startDate: firstDay,
      endDate: lastDay,
    };
  });

  // Refresh trigger state
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [errorOccurred, setErrorOccurred] = useState<boolean>(false);

  // Analytics Runtime Stabilization states
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [initializationGuard, setInitializationGuard] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [initPromise, setInitPromise] = useState<Promise<any> | null>(null);
  const MAX_RETRIES = 3;

  useEffect(() => {
    if (!businessId) return;
    const runInit = async () => {
      setInitializationGuard(true);
      try {
        const resultPromise = AnalyticsInitializer.initializeAnalytics(businessId);
        setInitPromise(resultPromise);
        const result = await resultPromise;
        if (result.success) {
          setIsInitialized(true);
        } else {
          console.error("[AnalyticsContext] Initialization failed:", result.error);
          setErrorOccurred(true);
        }
      } catch (err) {
        console.error("[AnalyticsContext] Unhandled error during initialization:", err);
        setErrorOccurred(true);
      } finally {
        setInitializationGuard(false);
      }
    };
    runInit();
  }, [businessId, refreshTrigger]);

  // Use the single unified subscription hook
  const {
    employees,
    transactions,
    attendance: attendanceLogs,
    payrollRecords,
    contracts,
    departmentActivities: activities,
    isLoading: isSubscribedLoading,
    error: subscriptionError,
  } = useAnalyticsSubscriptions((businessId && isInitialized) ? businessId : "");

  const [isCalculating, setIsCalculating] = useState<boolean>(false);

  // DEFERRED VALUES: React 18 stabilization mechanism to prevent UI freezing on rapid Firestore updates
  const deferredEmployees = useDeferredValue(employees);
  const deferredTransactions = useDeferredValue(transactions);
  const deferredAttendance = useDeferredValue(attendanceLogs);
  const deferredPayrolls = useDeferredValue(payrollRecords);
  const deferredContracts = useDeferredValue(contracts);
  const deferredActivities = useDeferredValue(activities);

  // Fallback to BusinessContext values if subscription arrays are empty
  const effectiveEmployees = useMemo(
    () => (deferredEmployees.length > 0 ? deferredEmployees : contextEmployees || []),
    [deferredEmployees, contextEmployees]
  );
  const effectiveTransactions = useMemo(
    () => (deferredTransactions.length > 0 ? deferredTransactions : contextTxs || []),
    [deferredTransactions, contextTxs]
  );
  const effectiveAttendance = useMemo(
    () => (deferredAttendance.length > 0 ? deferredAttendance : contextAtt || []),
    [deferredAttendance, contextAtt]
  );
  const effectivePayrolls = useMemo(
    () => (deferredPayrolls.length > 0 ? deferredPayrolls : contextPay || []),
    [deferredPayrolls, contextPay]
  );
  const effectiveContracts = useMemo(
    () => (deferredContracts.length > 0 ? deferredContracts : contextContracts || []),
    [deferredContracts, contextContracts]
  );
  const effectiveActivities = useMemo(
    () => deferredActivities,
    [deferredActivities]
  );

  // Filtered collections reflecting ExecutiveFilters for SSOT alignment
  const filteredEmployees = useMemo(() => {
    return effectiveEmployees.filter((e) => {
      const eBranch = e.branchId || (e as any).branch_id;
      const eDept = e.departmentId || (e as any).department_id;
      if (filters.branchId !== "ALL" && eBranch !== filters.branchId) return false;
      if (filters.departmentId !== "ALL" && eDept !== filters.departmentId) return false;
      if (filters.employeeId !== "ALL" && e.id !== filters.employeeId) return false;
      return true;
    });
  }, [effectiveEmployees, filters.branchId, filters.departmentId, filters.employeeId]);

  // Employee department and branch lookup maps for Personnel SSOT resolution
  const empDeptMap = useMemo(() => {
    const map = new Map<string, string>();
    effectiveEmployees.forEach((e) => {
      const dept = e.departmentId || (e as any).department_id;
      if (dept) map.set(e.id, dept);
    });
    return map;
  }, [effectiveEmployees]);

  const empBranchMap = useMemo(() => {
    const map = new Map<string, string>();
    effectiveEmployees.forEach((e) => {
      const br = e.branchId || (e as any).branch_id;
      if (br) map.set(e.id, br);
    });
    return map;
  }, [effectiveEmployees]);

  const activeCustomRange = useMemo(() => {
    if (filters.startDate && filters.endDate) {
      return { startDate: filters.startDate, endDate: filters.endDate };
    }
    return customRange;
  }, [filters.startDate, filters.endDate, customRange]);

  const filteredTransactions = useMemo(() => {
    return effectiveTransactions.filter((tx) => {
      const empId = tx.employeeId || (tx as any).employee_id;
      const txBranch = tx.branchId || (tx as any).branch_id || (empId ? empBranchMap.get(empId) : undefined);
      const txDept = tx.departmentId || (tx as any).department_id || (empId ? empDeptMap.get(empId) : undefined);

      if (filters.branchId !== "ALL" && txBranch !== filters.branchId) return false;
      if (filters.departmentId !== "ALL" && txDept !== filters.departmentId) return false;
      if (filters.transactionType !== "ALL" && tx.type !== filters.transactionType) return false;
      if (filters.status !== "ALL" && tx.status !== filters.status) return false;
      if (filters.currency && filters.currency !== "ALL" && tx.currency !== filters.currency) return false;

      // Filter by active date range if set
      if (activeCustomRange?.startDate && activeCustomRange?.endDate && tx.date) {
        const txDateStr = tx.date.split("T")[0];
        if (txDateStr < activeCustomRange.startDate || txDateStr > activeCustomRange.endDate) {
          return false;
        }
      }

      return true;
    });
  }, [effectiveTransactions, filters.branchId, filters.departmentId, filters.transactionType, filters.status, filters.currency, empDeptMap, empBranchMap, activeCustomRange]);

  const filteredAttendance = useMemo(() => {
    return effectiveAttendance.filter((rec) => {
      const rBranch = rec.branchId || (rec as any).branch_id;
      const rDept = rec.departmentId || (rec as any).department_id;
      const rEmp = rec.employeeId || (rec as any).employee_id;
      if (filters.branchId !== "ALL" && rBranch !== filters.branchId) return false;
      if (filters.departmentId !== "ALL" && rDept !== filters.departmentId) return false;
      if (filters.employeeId !== "ALL" && rEmp !== filters.employeeId) return false;

      // Filter by active date range if set
      const recDate = rec.date || (rec as any).timestamp?.split("T")?.[0];
      if (activeCustomRange?.startDate && activeCustomRange?.endDate && recDate) {
        const recDateStr = recDate.split("T")[0];
        if (recDateStr < activeCustomRange.startDate || recDateStr > activeCustomRange.endDate) {
          return false;
        }
      }

      return true;
    });
  }, [effectiveAttendance, filters.branchId, filters.departmentId, filters.employeeId, activeCustomRange]);

  const filteredPayrolls = useMemo(() => {
    return effectivePayrolls.filter((rec) => {
      const rBranchId = rec.branch_id || (rec as any).branchId;
      const rDeptId = rec.department_id || (rec as any).departmentId;
      const rEmpId = rec.employeeId || rec.employee_id;
      if (filters.branchId !== "ALL" && rBranchId !== filters.branchId) return false;
      if (filters.departmentId !== "ALL" && rDeptId !== filters.departmentId) return false;
      if (filters.employeeId !== "ALL" && rEmpId !== filters.employeeId) return false;
      if (filters.status !== "ALL" && rec.status !== filters.status) return false;

      // Filter by active date range if set
      const pStart = rec.period_start || (rec as any).generated_at?.split("T")?.[0];
      const pEnd = rec.period_end || (rec as any).generated_at?.split("T")?.[0];
      if (activeCustomRange?.startDate && activeCustomRange?.endDate && (pStart || pEnd)) {
        const startStr = (pStart || pEnd || "").split("T")[0];
        const endStr = (pEnd || pStart || "").split("T")[0];
        if (endStr < activeCustomRange.startDate || startStr > activeCustomRange.endDate) {
          return false;
        }
      }

      return true;
    });
  }, [effectivePayrolls, filters.branchId, filters.departmentId, filters.employeeId, filters.status, activeCustomRange]);

  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);

  // Unified snapshot calculation (Asynchronous to prevent freezing the UI thread)
  useEffect(() => {
    if (!businessId) {
      setSnapshot(null);
      setIsCalculating(false);
      return;
    }

    setIsCalculating(true);

    const timer = setTimeout(() => {
      try {
        const snap = AnalyticsEngine.generateSnapshot(
          "CUSTOM",
          activeCustomRange,
          filteredEmployees,
          filteredTransactions,
          filteredAttendance,
          filteredPayrolls,
          branches,
          departments,
          effectiveContracts,
          businessId,
          (language as "fr" | "ht" | "en") || "fr",
          effectiveActivities,
          businessSettings
        );
        setSnapshot(snap);
      } catch (err) {
        console.error("[ANALYTICS_CONTEXT] Failed to calculate asynchronous snapshot:", err);
      } finally {
        setIsCalculating(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [
    activeCustomRange,
    filteredEmployees,
    filteredTransactions,
    filteredAttendance,
    filteredPayrolls,
    branches,
    departments,
    effectiveContracts,
    businessId,
    language,
    effectiveActivities,
    businessSettings,
  ]);

  useEffect(() => {
    const handleRebuilt = () => {
      AnalyticsRepository.invalidateCache();
      setRefreshTrigger((prev) => prev + 1);
    };
    if (typeof window !== "undefined") {
      window.addEventListener("finops:snapshots_rebuilt", handleRebuilt);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("finops:snapshots_rebuilt", handleRebuilt);
      }
    };
  }, []);

  const refresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const status = useMemo(() => {
    if (errorOccurred) return "error";
    if (isSubscribedLoading) return "loading";
    if (isCalculating) return "syncing";
    return "syncing";
  }, [errorOccurred, isSubscribedLoading, isCalculating]);

  const comparisonPeriod = useMemo<AnalyticsPeriod>(() => {
    // For now, mapping same period or previous representation for comparison
    return period;
  }, [period]);

  const lastUpdated = useMemo<string | null>(() => {
    return snapshot ? snapshot.generatedAt : null;
  }, [snapshot]);

  const semanticEngine = useMemo(() => new SemanticAnalyticsEngine(), []);

  const runSemanticAnalytics = (selectedMonth: number | string, selectedYear: number) => {
    if (!businessId || state !== 'READY') return null;
    return semanticEngine.runAnalytics(
      businessId,
      selectedMonth,
      selectedYear,
      effectiveTransactions,
      effectivePayrolls,
      effectiveAttendance,
      effectiveEmployees,
      departments
    );
  };

  const explainKPI = (kpiId: string, dimension: any, selectedMonth: number | string, selectedYear: number) => {
    if (!businessId) return null;
    return semanticEngine.explainKPI(
      businessId,
      selectedMonth,
      selectedYear,
      kpiId,
      dimension,
      effectiveTransactions,
      effectivePayrolls,
      effectiveAttendance,
      effectiveEmployees,
      departments,
      branches
    );
  };

  return (
    <AnalyticsContext.Provider
      value={{
        period,
        setPeriod,
        customRange,
        setCustomRange,
        snapshot,
        isLoading: isSubscribedLoading || isCalculating,
        employees: filteredEmployees,
        transactions: filteredTransactions,
        attendanceLogs: filteredAttendance,
        payrollRecords: filteredPayrolls,
        contracts: effectiveContracts,
        // Part 3 compliant aliases & values
        loading: isSubscribedLoading || isCalculating,
        refresh,
        selectedPeriod: period,
        setSelectedPeriod: setPeriod,
        comparisonPeriod,
        lastUpdated,
        status,
        // Semantic V1.5 engine fields
        semanticEngine,
        runSemanticAnalytics,
        explainKPI,
      }}
    >
      {children}
    </AnalyticsContext.Provider>
  );
};

export const useAnalytics = () => {
  const ctx = useContext(AnalyticsContext);
  if (!ctx) {
    throw new Error("useAnalytics must be inside an AnalyticsProvider");
  }
  return ctx;
};
