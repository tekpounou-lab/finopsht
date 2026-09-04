import React, { useState } from "react";
import { useI18n } from "../i18n";
import { useBusinessContext } from "../contexts/BusinessContext";
import {
  Employee,
  LedgerTransaction,
  AttendanceRecord,
  PayrollRecord,
  Business,
  Branch,
  Department,
  ForensicLog,
  ERPEvent,
  Role,
} from "../types";
import { AlertTriangle } from "lucide-react";
import { setDoc } from "firebase/firestore";
import { getDbDoc } from "../lib/firebase";
import { getLocalIP, generateSignature } from "../data";

import { AnalyticsHealth, ExecutiveIntelligenceCenter } from "../domains/analytics";
import { PredictiveIntelligenceCenter } from "../domains/analytics/components/PredictiveIntelligenceCenter";
import { WorkforceIntelligenceFramework } from "../domains/analytics/components/WorkforceIntelligenceFramework";

import { useBIUIState } from "./bi/hooks/useBIUIState";
import { useBIDataAggregation } from "./bi/hooks/useBIDataAggregation";
import { useBIExport } from "./bi/hooks/useBIExport";
import { useBIAiAdvisor } from "./bi/hooks/useBIAiAdvisor";
import { biTranslations } from "./bi/translations";

import { BIFiltersHeader } from "./bi/components/BIFiltersHeader";
import { BISimplifiedView } from "./bi/components/BISimplifiedView";
import { BIExecutiveKpis } from "./bi/components/BIExecutiveKpis";
import { BIBranchDepartmentSection } from "./bi/components/BIBranchDepartmentSection";
import { BIPayrollTab } from "./bi/components/BIPayrollTab";
import { BICostCenterTab } from "./bi/components/BICostCenterTab";
import { BIAiReportsTab } from "./bi/components/BIAiReportsTab";
import { BIDepartmentExpensesModal } from "./bi/components/BIDepartmentExpensesModal";
import { BIOwnerTelemetryPanel } from "./bi/components/BIOwnerTelemetryPanel";
import { BIDashboardEmbedView } from "./bi/components/BIDashboardEmbedView";
import { EnrichedDepartmentMetric } from "./bi/types";

export interface BusinessIntelligenceProps {
  currentRole: Role;
  currentBusiness?: Business;
  currentBranch: Branch | null;
  branches: Branch[];
  departments: Department[];
  employees: Employee[];
  ledgerTransactions: LedgerTransaction[];
  payrollRecords: PayrollRecord[];
  attendanceRecords: AttendanceRecord[];
  forensicLogs: ForensicLog[];
  onAddForensicLog: (log: ForensicLog) => void;
  onAddEvent: (ev: ERPEvent) => void;
  isDashboardEmbed?: boolean;
  isLoading?: boolean;
}

export default function BusinessIntelligence({
  currentRole,
  currentBusiness: propBusiness,
  currentBranch,
  branches = [],
  departments = [],
  employees = [],
  ledgerTransactions = [],
  payrollRecords = [],
  attendanceRecords = [],
  forensicLogs = [],
  onAddForensicLog,
  onAddEvent: _onAddEvent,
  isDashboardEmbed = false,
  isLoading = false,
}: BusinessIntelligenceProps) {
  const { language } = useI18n();
  const { business: ctxBusiness } = useBusinessContext();
  const currentBusiness = propBusiness || ctxBusiness;

  const tbi = biTranslations[language as keyof typeof biTranslations] || biTranslations.fr;
  const isAuthorized = currentRole === "OWNER" || currentRole === "MANAGER" || (currentRole as string) === "SUPER_ADMIN" || (currentRole as string) === "ADMIN";

  // State management from custom hook
  const uiState = useBIUIState({
    currentBranch,
    currentRole,
  });

  const [selectedDeptForExpenseModal, setSelectedDeptForExpenseModal] = useState<EnrichedDepartmentMetric | null>(null);

  // Data Aggregation & Business Analytics Engine
  const dataAgg = useBIDataAggregation({
    currentBusiness,
    branches,
    departments,
    employees,
    ledgerTransactions,
    payrollRecords,
    attendanceRecords,
    forensicLogs,
    selectedBranchId: uiState.selectedBranchId,
    selectedDeptId: uiState.selectedDeptId,
    selectedTxType: uiState.selectedTxType,
    selectedAttendanceStatus: uiState.selectedAttendanceStatus,
    selectedPaymentModel: uiState.selectedPaymentModel,
    startDate: uiState.startDate,
    endDate: uiState.endDate,
    rankBy: uiState.rankBy,
    language: language as "fr" | "ht" | "en",
  });

  // AI CFO Advisor
  const aiAdvisor = useBIAiAdvisor({
    currentBusiness,
    currentBranch,
    selectedBranchId: uiState.selectedBranchId,
    selectedDeptId: uiState.selectedDeptId,
    branches,
    filteredEmployees: dataAgg.filteredEmployees,
    filteredTx: dataAgg.filteredTx,
    filteredAttendance: dataAgg.filteredAttendance,
    payrollRecords,
    snapshot: dataAgg.snapshot,
    currentRole,
    onAddForensicLog,
    isAuthorized,
  });

  // Export handlers
  const { handleExportData } = useBIExport({
    currentBusiness,
    reportType: uiState.reportType,
    employees,
    ledgerTransactions,
    filteredAttendance: dataAgg.filteredAttendance,
    branchMetrics: dataAgg.branchMetrics,
    employeeScorecards: dataAgg.employeeScorecards,
    forensicLogs,
    totalRevenue: dataAgg.totalRevenue,
    totalExpenses: dataAgg.totalExpenses,
    netProfit: dataAgg.netProfit,
    profitMarginPercentage: dataAgg.profitMarginPercentage,
    attendanceConsistencyPct: dataAgg.attendanceConsistencyPct,
    payrollTaxesTotal: dataAgg.payrollTaxesTotal,
    totalPayrollMass: dataAgg.totalPayrollMass,
    totalCommissionPaid: dataAgg.totalCommissionPaid,
    startDate: uiState.startDate,
    endDate: uiState.endDate,
  });

  const handleSaveSnapshot = async () => {
    if (!currentBusiness) return;
    try {
      const snapId = "snap_" + Math.random().toString(36).substring(2, 9);
      const payload = {
        id: snapId,
        business_id: currentBusiness.id,
        snapshotDate: new Date().toISOString().split("T")[0],
        employeeCount: dataAgg.activeEmployeesCount,
        attendanceRate: dataAgg.attendanceAggregates.attendanceRate,
        payrollCost: dataAgg.payrollAggregates.totalEmploymentCost,
        turnoverRate: 0,
        cashFlow: dataAgg.totalRevenue - dataAgg.totalExpenses,
        netProfit: dataAgg.netProfit,
        timestamp: new Date().toISOString(),
      };
      await setDoc(getDbDoc("analytics_snapshots", snapId), payload);

      const forecastLog: ForensicLog = {
        id: "log_" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        userId: currentRole === "OWNER" ? "e1" : "e2",
        userName: currentRole === "OWNER" ? "Manoel Lhérisson" : "Fabienne Jean-Gilles",
        userRole: currentRole,
        business_id: currentBusiness.id,
        action: "SAVE_ANALYTICS_SNAPSHOT",
        beforeState: "{}",
        afterState: JSON.stringify(payload),
        ipAddress: getLocalIP(),
        userAgent: navigator.userAgent,
        signature: generateSignature({ action: "SAVE_ANALYTICS_SNAPSHOT", timestamp: new Date().toISOString() }),
      };
      onAddForensicLog(forecastLog);
    } catch (e: any) {
      console.error(e);
    }
  };

  // Dashboard Embedded View
  if (isDashboardEmbed) {
    return (
      <BIDashboardEmbedView
        isLoading={isLoading}
        dashboardChartData={dataAgg.dashboardChartData}
        language={language}
      />
    );
  }

  // Block unauthorized view
  if (!isAuthorized) {
    return (
      <div className="bg-slate-950 border border-slate-900 rounded-2xl p-10 flex flex-col items-center justify-center text-center gap-4 max-w-2xl mx-auto my-12" id="unauthorized-bi-pane">
        <AlertTriangle className="w-16 h-16 text-rose-500 animate-pulse" />
        <h3 className="text-xl font-bold text-slate-100">{tbi.accessDenied}</h3>
        <p className="text-sm text-slate-400 max-w-md leading-relaxed">{tbi.accessDeniedDesc}</p>
      </div>
    );
  }

  // Simplified View
  if (uiState.isSimplifiedMode) {
    return (
      <BISimplifiedView
        language={language}
        isSimplifiedMode={uiState.isSimplifiedMode}
        setIsSimplifiedMode={uiState.setIsSimplifiedMode}
        currentRole={currentRole}
        currentBusiness={currentBusiness}
        branches={branches}
        departments={departments}
        selectedBranchId={uiState.selectedBranchId}
        setSelectedBranchId={uiState.setSelectedBranchId}
        selectedDeptId={uiState.selectedDeptId}
        setSelectedDeptId={uiState.setSelectedDeptId}
        startDate={uiState.startDate}
        setStartDate={uiState.setStartDate}
        endDate={uiState.endDate}
        setEndDate={uiState.setEndDate}
        allBranchesLabel={tbi.allBranches}
        allDepartmentsLabel={tbi.allDepartments}
        totalRevenue={dataAgg.totalRevenue}
        totalExpenses={dataAgg.totalExpenses}
        netProfit={dataAgg.netProfit}
        profitMarginPercentage={dataAgg.profitMarginPercentage}
        attendanceAggregates={dataAgg.attendanceAggregates}
        aiQuery={aiAdvisor.aiQuery}
        setAiQuery={aiAdvisor.setAiQuery}
        aiReport={aiAdvisor.aiReport}
        aiLoading={aiAdvisor.aiLoading}
        handleGenerateAiReport={aiAdvisor.handleGenerateAiReport}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6" id="performance-intelligence-module">
      {/* Header and structural filters */}
      <BIFiltersHeader
        title={tbi.title}
        subtitle={tbi.subtitle}
        language={language}
        isSimplifiedMode={uiState.isSimplifiedMode}
        setIsSimplifiedMode={uiState.setIsSimplifiedMode}
        currentRole={currentRole}
        currentBusiness={currentBusiness}
        branches={branches}
        departments={departments}
        selectedBranchId={uiState.selectedBranchId}
        setSelectedBranchId={uiState.setSelectedBranchId}
        selectedDeptId={uiState.selectedDeptId}
        setSelectedDeptId={uiState.setSelectedDeptId}
        selectedTxType={uiState.selectedTxType}
        setSelectedTxType={uiState.setSelectedTxType}
        startDate={uiState.startDate}
        setStartDate={uiState.setStartDate}
        endDate={uiState.endDate}
        setEndDate={uiState.setEndDate}
        allBranchesLabel={tbi.allBranches}
        allDepartmentsLabel={tbi.allDepartments}
        transactionTypeLabel={tbi.transactionType}
      />

      {/* Observability Panel powered by Sprint BI Core v4 */}
      {currentRole === "SUPER_ADMIN" && <AnalyticsHealth />}

      {/* BI TABS */}
      <div className="flex border-b border-slate-800 overflow-x-auto no-scrollbar gap-6 font-mono text-xs font-bold px-2">
        {[
          { id: "executive", label: "1. Executive" },
          { id: "workforce", label: "2. Workforce & Attendance" },
          { id: "payroll", label: "3. Payroll Analytics" },
          { id: "cost_center", label: "4. Cost Centers & Profitability" },
          { id: "ai_reports", label: "5. Reports & AI CFO" },
          { id: "predictive", label: "6. Predictive Intelligence (V3)" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => uiState.setActiveBiTab(tab.id as any)}
            className={`py-3 uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              uiState.activeBiTab === tab.id
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: EXECUTIVE */}
      {uiState.activeBiTab === "executive" && (
        <React.Fragment>
          <div className="mb-8 mt-2">
            <ExecutiveIntelligenceCenter />
          </div>

          <BIExecutiveKpis
            tbi={tbi}
            isLoading={isLoading}
            totalRevenue={dataAgg.totalRevenue}
            totalExpenses={dataAgg.totalExpenses}
            netProfit={dataAgg.netProfit}
            profitMarginPercentage={dataAgg.profitMarginPercentage}
            payrollAggregates={dataAgg.payrollAggregates}
            isSocialTaxEnabled={dataAgg.isSocialTaxEnabled}
            activeEmployeesCount={dataAgg.activeEmployeesCount}
            selectedBranchId={uiState.selectedBranchId}
            attendanceAggregates={dataAgg.attendanceAggregates}
            totalAdvancesPending={dataAgg.totalAdvancesPending}
            biSnapshot={dataAgg.biSnapshot}
            handleSaveSnapshot={handleSaveSnapshot}
          />

          <BIBranchDepartmentSection
            tbi={tbi}
            branchMetrics={dataAgg.branchMetrics}
            chartBranchData={dataAgg.chartBranchData}
            enrichedDepartmentMetrics={dataAgg.enrichedDepartmentMetrics}
            selectedCurrency={dataAgg.selectedCurrency}
            selectedDeptId={uiState.selectedDeptId}
            radarActiveMetric={uiState.radarActiveMetric}
            setRadarActiveMetric={uiState.setRadarActiveMetric}
            formatCurrencyValue={dataAgg.formatCurrencyValue}
            formatValueDirectly={dataAgg.formatValueDirectly}
            setSelectedDeptForExpenseModal={(dept) => setSelectedDeptForExpenseModal(dept)}
          />
        </React.Fragment>
      )}

      {/* TAB 2: WORKFORCE */}
      {uiState.activeBiTab === "workforce" && (
        <React.Fragment>
          <WorkforceIntelligenceFramework />
        </React.Fragment>
      )}

      {/* TAB 3: PAYROLL */}
      {uiState.activeBiTab === "payroll" && (
        <React.Fragment>
          <BIPayrollTab
            payrollAggregates={dataAgg.payrollAggregates}
            isSocialTaxEnabled={dataAgg.isSocialTaxEnabled}
          />
        </React.Fragment>
      )}

      {/* TAB 4: COST CENTERS */}
      {uiState.activeBiTab === "cost_center" && (
        <React.Fragment>
          <BICostCenterTab
            tbi={tbi}
            cashflowTimeline={dataAgg.cashflowTimeline}
            expenseCategoryChartData={dataAgg.expenseCategoryChartData}
            totalExpenses={dataAgg.totalExpenses}
          />
        </React.Fragment>
      )}

      {/* TAB 5: AI REPORTS */}
      {uiState.activeBiTab === "ai_reports" && (
        <React.Fragment>
          <BIAiReportsTab
            tbi={tbi}
            aiQuery={aiAdvisor.aiQuery}
            setAiQuery={aiAdvisor.setAiQuery}
            aiLoading={aiAdvisor.aiLoading}
            aiReport={aiAdvisor.aiReport}
            profitMarginPercentage={dataAgg.profitMarginPercentage}
            financialStressScore={dataAgg.financialStressScore}
            reportType={uiState.reportType}
            setReportType={uiState.setReportType}
            handleGenerateAiReport={aiAdvisor.handleGenerateAiReport}
            handleExportData={handleExportData}
          />
        </React.Fragment>
      )}

      {/* TAB 6: PREDICTIVE */}
      {uiState.activeBiTab === "predictive" && (
        <React.Fragment>
          <div className="mb-8 mt-2">
            <PredictiveIntelligenceCenter />
          </div>
        </React.Fragment>
      )}

      {/* Department Expenses Detail Modal */}
      <BIDepartmentExpensesModal
        selectedDept={selectedDeptForExpenseModal}
        onClose={() => setSelectedDeptForExpenseModal(null)}
        employees={employees}
        ledgerTransactions={ledgerTransactions}
        currentBusiness={currentBusiness}
        selectedBranchId={uiState.selectedBranchId}
        startDate={uiState.startDate}
        endDate={uiState.endDate}
      />

      {/* Owner-Only Telemetry Panel */}
      <BIOwnerTelemetryPanel
        currentRole={currentRole}
        selectedBranchId={uiState.selectedBranchId}
        selectedDeptId={uiState.selectedDeptId}
        startDate={uiState.startDate}
        endDate={uiState.endDate}
      />
    </div>
  );
}

export { BusinessIntelligence };
