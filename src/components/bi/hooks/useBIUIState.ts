import { useState } from "react";
import { Branch, Role } from "../../../types";
import { useExecutiveFilters } from "../../../domains/analytics/context/ExecutiveFilterContext";

export type RankMetricType = "hours" | "commissions" | "attendance" | "productivity";
export type ReportType = "payroll" | "attendance" | "profitability" | "employee" | "audit";
export type BITabType = "executive" | "workforce" | "payroll" | "cost_center" | "ai_reports" | "predictive";
export type RadarMetricType = "ALL" | "PRODUCTIVITY" | "ATTENDANCE";

interface UseBIUIStateParams {
  currentBranch?: Branch | null;
  currentRole?: Role;
}

export function useBIUIState(params?: UseBIUIStateParams) {
  const { filters, updateFilter } = useExecutiveFilters();

  // Delegation of filter parameters to the shared global ExecutiveFilterContext
  const selectedBranchId = filters.branchId;
  const setSelectedBranchId = (id: string) => updateFilter("branchId", id);

  const selectedDeptId = filters.departmentId;
  const setSelectedDeptId = (id: string) => updateFilter("departmentId", id);

  const selectedTxType = filters.transactionType;
  const setSelectedTxType = (type: string) => updateFilter("transactionType", type);

  const startDate = filters.startDate;
  const setStartDate = (date: string) => updateFilter("startDate", date);

  const endDate = filters.endDate;
  const setEndDate = (date: string) => updateFilter("endDate", date);

  const isSimplifiedMode = filters.accountingMode === "CASH";
  const setIsSimplifiedMode = (val: boolean) => updateFilter("accountingMode", val ? "CASH" : "ACCRUAL");

  const selectedEmployeeId = filters.employeeId;
  const setSelectedEmployeeId = (id: string) => updateFilter("employeeId", id);

  // Keep other visualization/local tab preferences inside local states
  const [selectedAttendanceStatus, setSelectedAttendanceStatus] = useState<string>("ALL");
  const [selectedPaymentModel, setSelectedPaymentModel] = useState<string>("ALL");
  const [rankBy, setRankBy] = useState<RankMetricType>("productivity");
  const [employeeRankMetric, setEmployeeRankMetric] = useState<RankMetricType>("productivity");

  // AI Query & Report UI State
  const [aiQuery, setAiQuery] = useState<string>("");
  const [aiReport, setAiReport] = useState<any | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  // BI Tabs & Modals State
  const [reportType, setReportType] = useState<ReportType>("profitability");
  const [activeBiTab, setActiveBiTab] = useState<BITabType>("executive");
  const [selectedDeptForExpenseModal, setSelectedDeptForExpenseModal] = useState<any | null>(null);
  const [radarActiveMetric, setRadarActiveMetric] = useState<RadarMetricType>("ALL");

  return {
    selectedBranchId,
    setSelectedBranchId,
    selectedDeptId,
    setSelectedDeptId,
    selectedTxType,
    setSelectedTxType,
    selectedAttendanceStatus,
    setSelectedAttendanceStatus,
    selectedPaymentModel,
    setSelectedPaymentModel,
    rankBy,
    setRankBy,
    employeeRankMetric,
    setEmployeeRankMetric,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    aiQuery,
    setAiQuery,
    aiReport,
    setAiReport,
    aiLoading,
    setAiLoading,
    reportType,
    setReportType,
    activeBiTab,
    setActiveBiTab,
    isSimplifiedMode,
    setIsSimplifiedMode,
    selectedDeptForExpenseModal,
    setSelectedDeptForExpenseModal,
    radarActiveMetric,
    setRadarActiveMetric,
    selectedEmployeeId,
    setSelectedEmployeeId,
  };
}
