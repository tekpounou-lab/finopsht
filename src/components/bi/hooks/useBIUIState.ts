import { useState } from "react";
import { Branch, Role } from "../../../types";

export type RankMetricType = "hours" | "commissions" | "attendance" | "productivity";
export type ReportType = "payroll" | "attendance" | "profitability" | "employee" | "audit";
export type BITabType = "executive" | "workforce" | "payroll" | "cost_center" | "ai_reports" | "predictive";
export type RadarMetricType = "ALL" | "PRODUCTIVITY" | "ATTENDANCE";

interface UseBIUIStateParams {
  currentBranch?: Branch | null;
  currentRole?: Role;
}

export function useBIUIState(params?: UseBIUIStateParams) {
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    params?.currentRole === "MANAGER" && params?.currentBranch ? params.currentBranch.id : "ALL"
  );
  const [selectedDeptId, setSelectedDeptId] = useState<string>("ALL");
  const [selectedTxType, setSelectedTxType] = useState<string>("ALL");
  const [selectedAttendanceStatus, setSelectedAttendanceStatus] = useState<string>("ALL");
  const [selectedPaymentModel, setSelectedPaymentModel] = useState<string>("ALL");
  const [rankBy, setRankBy] = useState<RankMetricType>("productivity");
  const [employeeRankMetric, setEmployeeRankMetric] = useState<RankMetricType>("productivity");

  // Date filters
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  // AI Query & Report UI State
  const [aiQuery, setAiQuery] = useState<string>("");
  const [aiReport, setAiReport] = useState<any | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  // BI Tabs & Modals State
  const [reportType, setReportType] = useState<ReportType>("profitability");
  const [activeBiTab, setActiveBiTab] = useState<BITabType>("executive");
  const [isSimplifiedMode, setIsSimplifiedMode] = useState<boolean>(true);
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
  };
}
