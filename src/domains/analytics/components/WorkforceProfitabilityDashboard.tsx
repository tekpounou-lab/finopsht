import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { useAnalytics } from "../context/AnalyticsContext";
import { useExecutiveFilters } from "../context/ExecutiveFilterContext";
import { useBusinessContext } from "../../../contexts/BusinessContext";
import {
  Users,
  Building,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Award,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Search,
  Filter,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Layers,
  Clock,
  Briefcase,
  ChevronRight,
  X,
  Zap,
  ShieldCheck,
  ArrowUpRight,
  Target,
  Scale,
  RefreshCw,
  FileText,
  UserCheck,
  UserX,
  HelpCircle,
  Eye,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
} from "lucide-react";
import {
  ComposedChart,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { SafeChartContainer } from "../../../components/ui/SafeChartContainer";
import {
  EmployeeProfitabilityRecord,
  DepartmentProfitabilityRecord,
  WorkforceAdvisorRecommendation,
  WorkforceAdvisorInsight,
} from "../types/workforceProfitability";

export interface WorkforceProfitabilityDashboardProps {
  initialTab?: "employee" | "department";
}

export const WorkforceProfitabilityDashboard: React.FC<WorkforceProfitabilityDashboardProps> = ({
  initialTab = "employee",
}) => {
  const { snapshot } = useAnalytics();
  const { business, branches, departments } = useBusinessContext();
  const { filters, setFilters } = useExecutiveFilters();

  // Active Main Sub-Tab
  const [activeTab, setActiveTab] = useState<"employee" | "department">(initialTab);

  // Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>("ALL");
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>("ALL");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Excel Table Multi-Column Sort & Filter States
  type SortField =
    | "employeeName"
    | "healthScore"
    | "performanceScore"
    | "totalEmploymentCost"
    | "employeeRevenue"
    | "employeeGrossMargin"
    | "roi"
    | "attendanceRate"
    | "revenuePerHour";

  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortAscending, setSortAscending] = useState<boolean>(true);

  const [healthFilter, setHealthFilter] = useState<string>("ALL"); // ALL, EXCELLENT, GOOD, RISK
  const [roiFilter, setRoiFilter] = useState<string>("ALL"); // ALL, POSITIVE, NEGATIVE
  const [performanceFilter, setPerformanceFilter] = useState<string>("ALL"); // ALL, HIGH, AVERAGE, LOW

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortAscending) {
        setSortAscending(false);
      } else {
        setSortField(null);
        setSortAscending(true);
      }
    } else {
      setSortField(field);
      setSortAscending(true);
    }
  };

  const resetExcelFilters = () => {
    setSearchTerm("");
    setSelectedDeptFilter("ALL");
    setSelectedBranchFilter("ALL");
    setSelectedRoleFilter("ALL");
    setHealthFilter("ALL");
    setRoiFilter("ALL");
    setPerformanceFilter("ALL");
    setSortField(null);
    setSortAscending(true);
  };

  const hasActiveExcelFilters = useMemo(() => {
    return (
      searchTerm !== "" ||
      selectedDeptFilter !== "ALL" ||
      selectedBranchFilter !== "ALL" ||
      selectedRoleFilter !== "ALL" ||
      healthFilter !== "ALL" ||
      roiFilter !== "ALL" ||
      performanceFilter !== "ALL" ||
      sortField !== null
    );
  }, [
    searchTerm,
    selectedDeptFilter,
    selectedBranchFilter,
    selectedRoleFilter,
    healthFilter,
    roiFilter,
    performanceFilter,
    sortField,
  ]);

  // Department Excel Table Sort & Filter States
  type DeptSortField =
    | "departmentName"
    | "totalEmployees"
    | "departmentProfitabilityScore"
    | "totalPayrollCost"
    | "revenueGenerated"
    | "departmentProfit"
    | "averageAttendance"
    | "averageRevenuePerEmployee";

  const [deptSortField, setDeptSortField] = useState<DeptSortField | null>(null);
  const [deptSortAscending, setDeptSortAscending] = useState<boolean>(true);

  const [deptSearchTerm, setDeptSearchTerm] = useState<string>("");
  const [deptProfitabilityFilter, setDeptProfitabilityFilter] = useState<string>("ALL"); // ALL, PROFITABLE, DEFICIT
  const [deptScoreFilter, setDeptScoreFilter] = useState<string>("ALL"); // ALL, HIGH, MEDIUM, LOW

  const handleDeptSort = (field: DeptSortField) => {
    if (deptSortField === field) {
      if (deptSortAscending) {
        setDeptSortAscending(false);
      } else {
        setDeptSortField(null);
        setDeptSortAscending(true);
      }
    } else {
      setDeptSortField(field);
      setDeptSortAscending(true);
    }
  };

  const resetDeptExcelFilters = () => {
    setDeptSearchTerm("");
    setDeptProfitabilityFilter("ALL");
    setDeptScoreFilter("ALL");
    setDeptSortField(null);
    setDeptSortAscending(true);
  };

  const hasActiveDeptExcelFilters = useMemo(() => {
    return (
      deptSearchTerm !== "" ||
      deptProfitabilityFilter !== "ALL" ||
      deptScoreFilter !== "ALL" ||
      deptSortField !== null
    );
  }, [deptSearchTerm, deptProfitabilityFilter, deptScoreFilter, deptSortField]);

  // Modal Selection States
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfitabilityRecord | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentProfitabilityRecord | null>(null);

  // Active Tab inside Employee Modal
  const [empModalTab, setEmpModalTab] = useState<"profile" | "attendance" | "payroll" | "performance" | "ai">("profile");
  // Active Tab inside Department Modal
  const [deptModalTab, setDeptModalTab] = useState<"overview" | "employees" | "payroll" | "revenue" | "ai">("overview");

  // Currency helpers
  const activeCurrency = filters.currency || "HTG";
  const currencySymbol = activeCurrency === "USD" ? "$" : "HTG";
  const formatMoney = (amountHtg: number) => {
    const val = activeCurrency === "USD" ? amountHtg / 135 : amountHtg;
    return `${currencySymbol} ${Math.round(val).toLocaleString()}`;
  };

  const wfData = snapshot?.workforceProfitability;

  // Filtered & Sorted Employee List
  const filteredEmployees = useMemo(() => {
    if (!wfData?.employees) return [];

    let list = wfData.employees.filter((emp) => {
      if (selectedDeptFilter !== "ALL" && emp.departmentId !== selectedDeptFilter) return false;
      if (selectedBranchFilter !== "ALL" && emp.branchId !== selectedBranchFilter) return false;
      if (selectedRoleFilter !== "ALL" && emp.role !== selectedRoleFilter) return false;

      if (healthFilter === "EXCELLENT" && emp.healthScore.score < 80) return false;
      if (healthFilter === "GOOD" && (emp.healthScore.score < 60 || emp.healthScore.score >= 80)) return false;
      if (healthFilter === "RISK" && emp.healthScore.score >= 60) return false;

      if (roiFilter === "POSITIVE" && emp.profitability.roi < 0) return false;
      if (roiFilter === "NEGATIVE" && emp.profitability.roi >= 0) return false;

      if (performanceFilter === "HIGH" && emp.efficiency.performanceScore < 80) return false;
      if (performanceFilter === "AVERAGE" && (emp.efficiency.performanceScore < 50 || emp.efficiency.performanceScore >= 80)) return false;
      if (performanceFilter === "LOW" && emp.efficiency.performanceScore >= 50) return false;

      if (
        searchTerm &&
        !emp.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !emp.role.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !emp.departmentName.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        return false;
      }
      return true;
    });

    if (sortField) {
      list = [...list].sort((a, b) => {
        let valA = 0;
        let valB = 0;

        switch (sortField) {
          case "employeeName":
            return sortAscending
              ? a.employeeName.localeCompare(b.employeeName)
              : b.employeeName.localeCompare(a.employeeName);
          case "healthScore":
            valA = a.healthScore.score;
            valB = b.healthScore.score;
            break;
          case "performanceScore":
            valA = a.efficiency.performanceScore;
            valB = b.efficiency.performanceScore;
            break;
          case "totalEmploymentCost":
            valA = a.financial.totalEmploymentCost;
            valB = b.financial.totalEmploymentCost;
            break;
          case "employeeRevenue":
            valA = a.profitability.employeeRevenue;
            valB = b.profitability.employeeRevenue;
            break;
          case "employeeGrossMargin":
            valA = a.profitability.employeeGrossMargin;
            valB = b.profitability.employeeGrossMargin;
            break;
          case "roi":
            valA = a.profitability.roi;
            valB = b.profitability.roi;
            break;
          case "attendanceRate":
            valA = a.attendance.attendanceRate;
            valB = b.attendance.attendanceRate;
            break;
          case "revenuePerHour":
            valA = a.efficiency.revenuePerHour;
            valB = b.efficiency.revenuePerHour;
            break;
        }

        return sortAscending ? valA - valB : valB - valA;
      });
    }

    return list;
  }, [
    wfData?.employees,
    selectedDeptFilter,
    selectedBranchFilter,
    selectedRoleFilter,
    healthFilter,
    roiFilter,
    performanceFilter,
    searchTerm,
    sortField,
    sortAscending,
  ]);

  // Filtered & Sorted Department List
  const filteredDepartments = useMemo(() => {
    if (!wfData?.departments) return [];

    let list = wfData.departments.filter((dept) => {
      if (selectedDeptFilter !== "ALL" && dept.departmentId !== selectedDeptFilter) return false;

      if (deptProfitabilityFilter === "PROFITABLE" && dept.departmentProfit <= 0) return false;
      if (deptProfitabilityFilter === "DEFICIT" && dept.departmentProfit > 0) return false;

      if (deptScoreFilter === "HIGH" && dept.departmentProfitabilityScore < 80) return false;
      if (deptScoreFilter === "MEDIUM" && (dept.departmentProfitabilityScore < 50 || dept.departmentProfitabilityScore >= 80)) return false;
      if (deptScoreFilter === "LOW" && dept.departmentProfitabilityScore >= 50) return false;

      const activeSearch = deptSearchTerm || searchTerm;
      if (
        activeSearch &&
        !dept.departmentName.toLowerCase().includes(activeSearch.toLowerCase())
      ) {
        return false;
      }
      return true;
    });

    if (deptSortField) {
      list = [...list].sort((a, b) => {
        let valA = 0;
        let valB = 0;

        switch (deptSortField) {
          case "departmentName":
            return deptSortAscending
              ? a.departmentName.localeCompare(b.departmentName)
              : b.departmentName.localeCompare(a.departmentName);
          case "totalEmployees":
            valA = a.totalEmployees;
            valB = b.totalEmployees;
            break;
          case "departmentProfitabilityScore":
            valA = a.departmentProfitabilityScore;
            valB = b.departmentProfitabilityScore;
            break;
          case "totalPayrollCost":
            valA = a.totalPayrollCost;
            valB = b.totalPayrollCost;
            break;
          case "revenueGenerated":
            valA = a.revenueGenerated;
            valB = b.revenueGenerated;
            break;
          case "departmentProfit":
            valA = a.departmentProfit;
            valB = b.departmentProfit;
            break;
          case "averageAttendance":
            valA = a.averageAttendance;
            valB = b.averageAttendance;
            break;
          case "averageRevenuePerEmployee":
            valA = a.averageRevenuePerEmployee;
            valB = b.averageRevenuePerEmployee;
            break;
        }

        return deptSortAscending ? valA - valB : valB - valA;
      });
    }

    return list;
  }, [
    wfData?.departments,
    selectedDeptFilter,
    searchTerm,
    deptSearchTerm,
    deptProfitabilityFilter,
    deptScoreFilter,
    deptSortField,
    deptSortAscending,
  ]);

  const execSummary = wfData?.executiveSummary;
  const rankings = wfData?.rankings;

  if (!wfData) {
    return (
      <div className="p-8 text-center bg-slate-900/60 rounded-xl border border-slate-800 text-slate-400 font-mono text-sm">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-400" />
        Calcul des métriques de rentabilité de la masse salariale...
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-100 font-sans">
      {/* SECTION HEADER & TAB NAVIGATOR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 shadow-xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Zap className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold tracking-tight text-white font-mono">
              Workforce Profitability Intelligence
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Évaluation de la valeur nette créée vs coût global d'emploi par collaborateur et département.
          </p>
        </div>

        {/* SUB-TABS SWITCHER */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 self-start md:self-auto">
          <button
            onClick={() => setActiveTab("employee")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs font-bold transition-all ${
              activeTab === "employee"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
            }`}
          >
            <Users className="w-4 h-4" />
            1. Employee Performance
          </button>
          <button
            onClick={() => setActiveTab("department")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs font-bold transition-all ${
              activeTab === "department"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
            }`}
          >
            <Building className="w-4 h-4" />
            2. Department Performance
          </button>
        </div>
      </div>

      {/* AI EXECUTIVE SUMMARY BANNER */}
      {execSummary && (
        <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 blur-3xl pointer-events-none rounded-full" />
          
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 border-b border-slate-800/80 pb-6 mb-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-mono text-xs text-cyan-400 uppercase tracking-widest font-semibold">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                AI Executive Insights & Intelligence Analysis
              </div>
              <h3 className="text-lg font-bold text-white">{execSummary.headline}</h3>
              <p className="text-xs text-slate-400">
                Calculé à partir des données réelles du Grand Livre, de la Paie, des Pointages et des Transactions.
              </p>
            </div>

            {/* Health Score Badge & Confidence */}
            <div className="flex items-center gap-4 bg-slate-950/80 px-4 py-3 rounded-xl border border-slate-800 shrink-0">
              <div className="text-center border-r border-slate-800 pr-4">
                <span className="text-[10px] font-mono uppercase text-slate-400">Health Score</span>
                <div className="text-2xl font-black font-mono text-cyan-400">
                  {execSummary.currentWorkforceHealthScore}/100
                </div>
              </div>
              <div>
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono border ${
                  execSummary.currentWorkforceHealthScore >= 90
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : execSummary.currentWorkforceHealthScore >= 75
                    ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                }`}>
                  {execSummary.currentWorkforceHealthLabel}
                </span>
                <div className="text-[10px] text-slate-400 font-mono mt-1">
                  Confiance: <span className="text-white font-bold">{execSummary.confidenceScore}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Core Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Masse Salariale & Coût Global</span>
              <div className="text-lg font-bold font-mono text-rose-400 mt-1">
                {formatMoney(execSummary.totalWorkforceCost)}
              </div>
              <span className="text-[10px] text-slate-400">Coût direct + CNSS/OFATMA</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Revenu Généré</span>
              <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
                {formatMoney(execSummary.totalWorkforceRevenue)}
              </div>
              <span className="text-[10px] text-slate-400">Ventes & valeur imputée</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Valeur Nette Créée</span>
              <div className="text-lg font-bold font-mono text-cyan-400 mt-1">
                {formatMoney(execSummary.totalNetValueCreated)}
              </div>
              <span className="text-[10px] text-slate-400">Marge brute du personnel</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[10px] font-mono text-slate-400 uppercase">ROI Capital Humain</span>
              <div className="text-lg font-bold font-mono text-purple-400 mt-1">
                +{execSummary.overallRoi}%
              </div>
              <span className="text-[10px] text-slate-400">Rendement sur coût salarial</span>
            </div>
          </div>

          {/* AI Workforce Insights & Actionable Recommendations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Insights */}
            <div className="space-y-2">
              <span className="text-xs font-mono uppercase text-slate-400 font-semibold flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                Constats Analytiques (Données Réelles)
              </span>
              <div className="space-y-2">
                {execSummary.insights.map((ins) => (
                  <div
                    key={ins.id}
                    className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs flex items-start gap-3"
                  >
                    <span className="mt-0.5">
                      {ins.severity === "SUCCESS" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      )}
                    </span>
                    <div className="space-y-0.5">
                      <p className="text-slate-200 font-medium">{ins.message}</p>
                      <p className="text-[10px] font-mono text-slate-400">{ins.metricProof}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendations */}
            <div className="space-y-2">
              <span className="text-xs font-mono uppercase text-slate-400 font-semibold flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-cyan-400" />
                Recommandations Stratégiques Actionnables
              </span>
              <div className="space-y-2">
                {execSummary.recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-cyan-300 font-mono">{rec.title}</span>
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                        {rec.impact} IMPACT
                      </span>
                    </div>
                    <p className="text-slate-300 text-[11px]">{rec.description}</p>
                    <p className="text-[10px] font-mono text-slate-400">Preuve: {rec.metricsReference}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FILTER BAR */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Rechercher par nom ou rôle..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Department Filter */}
          <select
            value={selectedDeptFilter}
            onChange={(e) => setSelectedDeptFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Tous les Départements</option>
            {departments.filter((d) => !business || d.business_id === business.id).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          {/* Branch Filter */}
          <select
            value={selectedBranchFilter}
            onChange={(e) => setSelectedBranchFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Toutes les Succursales</option>
            {branches.filter((b) => !business || b.business_id === business.id).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div className="text-slate-400 text-[11px]">
          Affichage de <span className="text-white font-bold">{activeTab === "employee" ? filteredEmployees.length : filteredDepartments.length}</span> enregistrements
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      {activeTab === "employee" ? (
        <React.Fragment>
          {/* VISUALIZATIONS SECTION */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Employee Profitability Matrix (Scatter Plot) */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-white font-mono flex items-center gap-2">
                    <Target className="w-4 h-4 text-cyan-400" />
                    Matrice de Rentabilité des Employés (Cost vs Revenue)
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Axe X: Coût d'emploi global | Axe Y: Revenu généré
                  </p>
                </div>
              </div>

              <div className="h-64 w-full">
                <SafeChartContainer height="100%" minHeight={256}>
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      type="number"
                      dataKey="cost"
                      name="Coût Emploi"
                      unit={` ${currencySymbol}`}
                      stroke="#64748b"
                      fontSize={10}
                    />
                    <YAxis
                      type="number"
                      dataKey="revenue"
                      name="Revenu Généré"
                      unit={` ${currencySymbol}`}
                      stroke="#64748b"
                      fontSize={10}
                    />
                    <ZAxis type="number" dataKey="healthScore" range={[60, 400]} name="Score Santé" />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      content={({ payload }) => {
                        if (!payload || !payload.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs space-y-1 font-mono">
                            <p className="font-bold text-cyan-300">{data.name}</p>
                            <p className="text-slate-300">Rôle: {data.role}</p>
                            <p className="text-rose-400">Coût: {formatMoney(data.cost)}</p>
                            <p className="text-emerald-400">Revenu: {formatMoney(data.revenue)}</p>
                            <p className="text-purple-400">ROI: +{data.roi}%</p>
                          </div>
                        );
                      }}
                    />
                    <Scatter
                      data={filteredEmployees.map((e) => ({
                        name: e.employeeName,
                        role: e.role,
                        cost: e.financial.totalEmploymentCost,
                        revenue: e.profitability.employeeRevenue,
                        healthScore: e.healthScore.score,
                        roi: e.profitability.roi,
                      }))}
                      fill="#06b6d4"
                    >
                      {filteredEmployees.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            entry.profitability.roi >= 100
                              ? "#10b981"
                              : entry.profitability.roi >= 0
                              ? "#06b6d4"
                              : "#f43f5e"
                          }
                        />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </SafeChartContainer>
              </div>
            </div>

            {/* Payroll Cost vs Revenue Generated Bar Chart */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-white font-mono flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-cyan-400" />
                    Coût Salarial vs Revenu (Top 8 Employés)
                  </h4>
                  <p className="text-[11px] text-slate-400">Comparison directe coût total vs valeur générée</p>
                </div>
              </div>

              <div className="h-64 w-full">
                <SafeChartContainer height="100%" minHeight={256}>
                  <BarChart
                    data={filteredEmployees.slice(0, 8).map((e) => ({
                      name: e.employeeName.split(" ")[0],
                      cost: e.financial.totalEmploymentCost,
                      revenue: e.profitability.employeeRevenue,
                    }))}
                    margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} />
                    <YAxis stroke="#64748b" fontSize={10} />
                    <Tooltip
                      formatter={(val: number) => formatMoney(val)}
                      contentStyle={{ backgroundColor: "#020617", borderColor: "#1e293b", fontSize: "11px" }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="cost" name="Coût Total Emploi" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="revenue" name="Revenu Généré" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </SafeChartContainer>
              </div>
            </div>
          </div>

          {/* RANKINGS LEADERBOARD GRID */}
          {rankings && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Top Performers */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                <span className="text-xs font-mono font-bold uppercase text-emerald-400 flex items-center gap-1.5">
                  <Award className="w-4 h-4" />
                  Top Employees (Performance)
                </span>
                <div className="space-y-2">
                  {rankings.topPerformingEmployees.slice(0, 3).map((e, idx) => (
                    <div key={e.employeeId} className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-mono font-bold flex items-center justify-center">
                          #{idx + 1}
                        </span>
                        <div>
                          <p className="font-bold text-white">{e.employeeName}</p>
                          <p className="text-[10px] text-slate-400">{e.role}</p>
                        </div>
                      </div>
                      <span className="font-mono text-emerald-400 font-bold">{e.efficiency.performanceScore}/100</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Most Profitable */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                <span className="text-xs font-mono font-bold uppercase text-purple-400 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4" />
                  Most Profitable (ROI)
                </span>
                <div className="space-y-2">
                  {rankings.mostProfitableEmployees.slice(0, 3).map((e, idx) => (
                    <div key={e.employeeId} className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-purple-500/10 text-purple-400 text-[10px] font-mono font-bold flex items-center justify-center">
                          #{idx + 1}
                        </span>
                        <div>
                          <p className="font-bold text-white">{e.employeeName}</p>
                          <p className="text-[10px] text-slate-400">{formatMoney(e.profitability.employeeGrossMargin)}</p>
                        </div>
                      </div>
                      <span className="font-mono text-purple-400 font-bold">+{e.profitability.roi}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Highest Risk */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                <span className="text-xs font-mono font-bold uppercase text-rose-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Needs Attention / Risk
                </span>
                <div className="space-y-2">
                  {rankings.highestRiskEmployees.slice(0, 3).map((e, idx) => (
                    <div key={e.employeeId} className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-rose-500/10 text-rose-400 text-[10px] font-mono font-bold flex items-center justify-center">
                          #{idx + 1}
                        </span>
                        <div>
                          <p className="font-bold text-white">{e.employeeName}</p>
                          <p className="text-[10px] text-slate-400">Retards: {e.attendance.lateArrivals}</p>
                        </div>
                      </div>
                      <span className="font-mono text-rose-400 font-bold">{e.healthScore.score}/100</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* DETAILED EMPLOYEE PERFORMANCE TABLE WITH EXCEL-STYLE FILTERING */}
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-xl">
            {/* EXCEL TABLE CONTROL BAR */}
            <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h4 className="font-bold text-sm font-mono text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  Performance & Profitability Scorecards ({filteredEmployees.length})
                </h4>
                {hasActiveExcelFilters && (
                  <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                    <Filter className="w-3 h-3 text-cyan-400" />
                    Filtres Excel Actifs
                  </span>
                )}
              </div>

              {/* Excel Column Filters Toolbar */}
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-48">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filtrer employé / rôle..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 pl-8 pr-3 py-1.5 rounded-lg text-xs font-mono text-slate-200 outline-none focus:border-cyan-500/50"
                  />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Health Filter Dropdown */}
                <select
                  value={healthFilter}
                  onChange={(e) => setHealthFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-slate-300 text-xs font-mono py-1.5 px-2.5 rounded-lg outline-none focus:border-cyan-500/50 cursor-pointer"
                >
                  <option value="ALL">Health: Tous</option>
                  <option value="EXCELLENT">Health: Excellent (80+)</option>
                  <option value="GOOD">Health: Bon (60-79)</option>
                  <option value="RISK">Health: À Risque (&lt;60)</option>
                </select>

                {/* ROI Filter Dropdown */}
                <select
                  value={roiFilter}
                  onChange={(e) => setRoiFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-slate-300 text-xs font-mono py-1.5 px-2.5 rounded-lg outline-none focus:border-cyan-500/50 cursor-pointer"
                >
                  <option value="ALL">ROI: Tous</option>
                  <option value="POSITIVE">ROI: Positif (+)</option>
                  <option value="NEGATIVE">ROI: Négatif (-)</option>
                </select>

                {/* Performance Filter Dropdown */}
                <select
                  value={performanceFilter}
                  onChange={(e) => setPerformanceFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-slate-300 text-xs font-mono py-1.5 px-2.5 rounded-lg outline-none focus:border-cyan-500/50 cursor-pointer"
                >
                  <option value="ALL">Perf: Tous</option>
                  <option value="HIGH">Perf: Top (80+)</option>
                  <option value="AVERAGE">Perf: Moyen (50-79)</option>
                  <option value="LOW">Perf: Faible (&lt;50)</option>
                </select>

                {hasActiveExcelFilters && (
                  <button
                    onClick={resetExcelFilters}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Effacer tous les filtres Excel"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 font-mono text-[10px] uppercase text-slate-400 border-b border-slate-800 select-none">
                  <tr>
                    <th onClick={() => handleSort("employeeName")} className="py-3 px-4 cursor-pointer hover:bg-slate-900 transition-colors">
                      <div className="flex items-center justify-between gap-1">
                        <span>Employé & Rôle</span>
                        {sortField === "employeeName" ? (
                          sortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort("healthScore")} className="py-3 px-4 cursor-pointer hover:bg-slate-900 transition-colors">
                      <div className="flex items-center justify-between gap-1">
                        <span>Health Score</span>
                        {sortField === "healthScore" ? (
                          sortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort("performanceScore")} className="py-3 px-4 cursor-pointer hover:bg-slate-900 transition-colors">
                      <div className="flex items-center justify-between gap-1">
                        <span>Performance</span>
                        {sortField === "performanceScore" ? (
                          sortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort("totalEmploymentCost")} className="py-3 px-4 cursor-pointer hover:bg-slate-900 transition-colors">
                      <div className="flex items-center justify-between gap-1">
                        <span>Coût Emploi</span>
                        {sortField === "totalEmploymentCost" ? (
                          sortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort("employeeRevenue")} className="py-3 px-4 cursor-pointer hover:bg-slate-900 transition-colors">
                      <div className="flex items-center justify-between gap-1">
                        <span>Revenu Généré</span>
                        {sortField === "employeeRevenue" ? (
                          sortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort("employeeGrossMargin")} className="py-3 px-4 cursor-pointer hover:bg-slate-900 transition-colors">
                      <div className="flex items-center justify-between gap-1">
                        <span>Marge Brute</span>
                        {sortField === "employeeGrossMargin" ? (
                          sortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort("roi")} className="py-3 px-4 cursor-pointer hover:bg-slate-900 transition-colors">
                      <div className="flex items-center justify-between gap-1">
                        <span>ROI %</span>
                        {sortField === "roi" ? (
                          sortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort("attendanceRate")} className="py-3 px-4 cursor-pointer hover:bg-slate-900 transition-colors">
                      <div className="flex items-center justify-between gap-1">
                        <span>Présence</span>
                        {sortField === "attendanceRate" ? (
                          sortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort("revenuePerHour")} className="py-3 px-4 cursor-pointer hover:bg-slate-900 transition-colors">
                      <div className="flex items-center justify-between gap-1">
                        <span>Rev/Heure</span>
                        {sortField === "revenuePerHour" ? (
                          sortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400 font-mono text-xs">
                        Aucun employé ne correspond aux filtres sélectionnés.
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((emp) => (
                    <tr key={emp.employeeId} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-cyan-500/10 border border-cyan-500/30 font-bold font-mono text-cyan-300 flex items-center justify-center text-xs shrink-0">
                            {emp.employeeName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-white">{emp.employeeName}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{emp.role} • {emp.departmentName}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded font-mono text-[10px] font-bold border ${emp.healthScore.badgeColor}`}>
                          {emp.healthScore.score}/100
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded font-mono text-[10px] font-bold border bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
                          {emp.efficiency.performanceScore}/100
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-rose-400">
                        {formatMoney(emp.financial.totalEmploymentCost)}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                        {formatMoney(emp.profitability.employeeRevenue)}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-cyan-300">
                        {formatMoney(emp.profitability.employeeGrossMargin)}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold">
                        <span className={emp.profitability.roi >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          +{emp.profitability.roi}%
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px]">
                        <div className="flex flex-col gap-0.5">
                          <span className={emp.attendance.attendanceRate >= 95 ? "text-emerald-400 font-bold" : emp.attendance.attendanceRate >= 80 ? "text-amber-400 font-bold" : "text-rose-400 font-bold"}>
                            {emp.attendance.attendanceRate}%
                          </span>
                          <span className="text-[9px] text-slate-500 whitespace-nowrap">
                            {emp.attendance.lateArrivals} R / {emp.attendance.unauthorizedAbsences} A
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono text-purple-300">
                        {formatMoney(emp.efficiency.revenuePerHour)}/h
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedEmployee(emp);
                            setEmpModalTab("profile");
                          }}
                          className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono text-[10px] transition-colors cursor-pointer"
                        >
                          Inspecter Profile
                        </button>
                      </td>
                    </tr>
                  ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </React.Fragment>
      ) : (
        /* DEPARTMENT PERFORMANCE TAB */
        <React.Fragment>
          {/* DEPARTMENT VISUALIZATIONS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Department Profitability Heatmap & Bar Chart */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-white font-mono flex items-center gap-2">
                    <Building className="w-4 h-4 text-cyan-400" />
                    Profitabilité par Département (Coût vs Bénéfice)
                  </h4>
                  <p className="text-[11px] text-slate-400">Comparaison de la masse salariale vs bénéfice net créé</p>
                </div>
              </div>

              <div className="h-64 w-full">
                <SafeChartContainer height="100%" minHeight={256}>
                  <BarChart
                    data={filteredDepartments.map((d) => ({
                      name: d.departmentName,
                      payroll: d.totalPayrollCost,
                      profit: d.departmentProfit,
                    }))}
                    margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} />
                    <YAxis stroke="#64748b" fontSize={10} />
                    <Tooltip formatter={(val: number) => formatMoney(val)} contentStyle={{ backgroundColor: "#020617", borderColor: "#1e293b", fontSize: "11px" }} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="payroll" name="Masse Salariale Dept" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" name="Bénéfice Dept" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </SafeChartContainer>
              </div>
            </div>

            {/* Department Profit Contribution Donut */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-white font-mono flex items-center gap-2">
                    <PieChartIcon className="w-4 h-4 text-cyan-400" />
                    Distribution du Revenu par Département
                  </h4>
                  <p className="text-[11px] text-slate-400">Part relative dans les revenus totaux de l'entreprise</p>
                </div>
              </div>

              <div className="h-64 w-full">
                <SafeChartContainer height="100%" minHeight={256}>
                  <PieChart>
                    <Pie
                      data={filteredDepartments.map((d) => ({
                        name: d.departmentName,
                        value: d.revenueGenerated,
                      }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {filteredDepartments.map((entry, index) => {
                        const colors = ["#06b6d4", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899"];
                        return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                      })}
                    </Pie>
                    <Tooltip formatter={(val: number) => formatMoney(val)} contentStyle={{ backgroundColor: "#020617", borderColor: "#1e293b", fontSize: "11px" }} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                  </PieChart>
                </SafeChartContainer>
              </div>
            </div>
          </div>

          {/* DETAILED DEPARTMENT CARDS TABLE WITH EXCEL-STYLE FILTERING */}
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-xl">
            {/* EXCEL TABLE CONTROL BAR */}
            <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h4 className="font-bold text-sm font-mono text-white flex items-center gap-2">
                  <Building className="w-4 h-4 text-cyan-400" />
                  Analyse Structurelle des Départements ({filteredDepartments.length})
                </h4>
                {hasActiveDeptExcelFilters && (
                  <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                    <Filter className="w-3 h-3 text-cyan-400" />
                    Filtres Excel Actifs
                  </span>
                )}
              </div>

              {/* Excel Column Filters Toolbar */}
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-48">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filtrer département..."
                    value={deptSearchTerm}
                    onChange={(e) => setDeptSearchTerm(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 pl-8 pr-3 py-1.5 rounded-lg text-xs font-mono text-slate-200 outline-none focus:border-cyan-500/50"
                  />
                  {deptSearchTerm && (
                    <button onClick={() => setDeptSearchTerm("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Profitability Filter Dropdown */}
                <select
                  value={deptProfitabilityFilter}
                  onChange={(e) => setDeptProfitabilityFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-slate-300 text-xs font-mono py-1.5 px-2.5 rounded-lg outline-none focus:border-cyan-500/50 cursor-pointer"
                >
                  <option value="ALL">Profitabilité: Tous</option>
                  <option value="PROFITABLE">Profitabilité: Bénéficiaire (+)</option>
                  <option value="DEFICIT">Profitabilité: Déficitaire (-)</option>
                </select>

                {/* Score Filter Dropdown */}
                <select
                  value={deptScoreFilter}
                  onChange={(e) => setDeptScoreFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-slate-300 text-xs font-mono py-1.5 px-2.5 rounded-lg outline-none focus:border-cyan-500/50 cursor-pointer"
                >
                  <option value="ALL">Score: Tous</option>
                  <option value="HIGH">Score: Élevé (80+)</option>
                  <option value="MEDIUM">Score: Moyen (50-79)</option>
                  <option value="LOW">Score: Faible (&lt;50)</option>
                </select>

                {hasActiveDeptExcelFilters && (
                  <button
                    onClick={resetDeptExcelFilters}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Effacer tous les filtres Excel"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 font-mono text-[10px] uppercase text-slate-400 border-b border-slate-800 select-none">
                  <tr>
                    <th onClick={() => handleDeptSort("departmentName")} className="py-3 px-4 cursor-pointer hover:bg-slate-900 transition-colors">
                      <div className="flex items-center justify-between gap-1">
                        <span>Département</span>
                        {deptSortField === "departmentName" ? (
                          deptSortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleDeptSort("totalEmployees")} className="py-3 px-4 cursor-pointer hover:bg-slate-900 transition-colors">
                      <div className="flex items-center justify-between gap-1">
                        <span>Effectif</span>
                        {deptSortField === "totalEmployees" ? (
                          deptSortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleDeptSort("departmentProfitabilityScore")} className="py-3 px-4 cursor-pointer hover:bg-slate-900 transition-colors">
                      <div className="flex items-center justify-between gap-1">
                        <span>Score Dept</span>
                        {deptSortField === "departmentProfitabilityScore" ? (
                          deptSortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleDeptSort("totalPayrollCost")} className="py-3 px-4 cursor-pointer hover:bg-slate-900 transition-colors">
                      <div className="flex items-center justify-between gap-1">
                        <span>Coût Paie Dept</span>
                        {deptSortField === "totalPayrollCost" ? (
                          deptSortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleDeptSort("revenueGenerated")} className="py-3 px-4 cursor-pointer hover:bg-slate-900 transition-colors">
                      <div className="flex items-center justify-between gap-1">
                        <span>Revenu Généré</span>
                        {deptSortField === "revenueGenerated" ? (
                          deptSortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleDeptSort("departmentProfit")} className="py-3 px-4 cursor-pointer hover:bg-slate-900 transition-colors">
                      <div className="flex items-center justify-between gap-1">
                        <span>Bénéfice Net</span>
                        {deptSortField === "departmentProfit" ? (
                          deptSortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleDeptSort("averageAttendance")} className="py-3 px-4 cursor-pointer hover:bg-slate-900 transition-colors">
                      <div className="flex items-center justify-between gap-1">
                        <span>Présence Moy.</span>
                        {deptSortField === "averageAttendance" ? (
                          deptSortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleDeptSort("averageRevenuePerEmployee")} className="py-3 px-4 cursor-pointer hover:bg-slate-900 transition-colors">
                      <div className="flex items-center justify-between gap-1">
                        <span>Rev/Employé</span>
                        {deptSortField === "averageRevenuePerEmployee" ? (
                          deptSortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {filteredDepartments.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400 font-mono text-xs">
                        Aucun département ne correspond aux filtres sélectionnés.
                      </td>
                    </tr>
                  ) : (
                  filteredDepartments.map((dept) => (
                    <tr key={dept.departmentId} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-bold text-white">
                        {dept.departmentName}
                      </td>

                      <td className="py-3 px-4 font-mono">
                        {dept.totalEmployees} employés
                      </td>

                      <td className="py-3 px-4 font-mono">
                        <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-bold">
                          {dept.departmentProfitabilityScore}/100
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono text-rose-400 font-bold">
                        {formatMoney(dept.totalPayrollCost)}
                      </td>

                      <td className="py-3 px-4 font-mono text-emerald-400 font-bold">
                        {formatMoney(dept.revenueGenerated)}
                      </td>

                      <td className="py-3 px-4 font-mono text-cyan-300 font-bold">
                        {formatMoney(dept.departmentProfit)}
                      </td>

                      <td className="py-3 px-4 font-mono">
                        {dept.averageAttendance}%
                      </td>

                      <td className="py-3 px-4 font-mono text-purple-300">
                        {formatMoney(dept.averageRevenuePerEmployee)}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedDepartment(dept);
                            setDeptModalTab("overview");
                          }}
                          className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono text-[10px] transition-colors cursor-pointer"
                        >
                          Inspecter Dept
                        </button>
                      </td>
                    </tr>
                  ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </React.Fragment>
      )}

      {/* EMPLOYEE DRILLDOWN MODAL */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {selectedEmployee && (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col font-sans"
                >
                  {/* Modal Header */}
                  <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/30 font-bold text-cyan-300 font-mono flex items-center justify-center text-base">
                        {selectedEmployee.employeeName.charAt(0)}
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">{selectedEmployee.employeeName}</h3>
                        <p className="text-xs text-slate-400 font-mono">
                          {selectedEmployee.role} • {selectedEmployee.departmentName}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full font-mono text-xs font-bold border ${selectedEmployee.healthScore.badgeColor}`}>
                        Health: {selectedEmployee.healthScore.score}/100
                      </span>
                      <button
                        onClick={() => setSelectedEmployee(null)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Modal Navigation Tabs */}
                  <div className="flex border-b border-slate-800 bg-slate-950 px-5 font-mono text-xs gap-4">
                    {[
                      { id: "profile", label: "Profitability & Financial" },
                      { id: "attendance", label: "Attendance & Hours" },
                      { id: "performance", label: "Operational & KPIs" },
                      { id: "ai", label: "AI Advisor Analysis" },
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setEmpModalTab(t.id as any)}
                        className={`py-3 border-b-2 font-bold transition-colors cursor-pointer ${
                          empModalTab === t.id
                            ? "border-cyan-400 text-cyan-300"
                            : "border-transparent text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Modal Body */}
                  <div className="p-6 overflow-y-auto space-y-6">
                    {empModalTab === "profile" && (
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                            <span className="text-[10px] font-mono text-slate-400 uppercase">Salaire Mensuel</span>
                            <p className="text-sm font-bold font-mono text-white mt-1">
                              {formatMoney(selectedEmployee.financial.monthlySalary)}
                            </p>
                          </div>
                          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                            <span className="text-[10px] font-mono text-slate-400 uppercase">Charges Patronales (8%)</span>
                            <p className="text-sm font-bold font-mono text-rose-400 mt-1">
                              {formatMoney(selectedEmployee.financial.employerContributions)}
                            </p>
                          </div>
                          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                            <span className="text-[10px] font-mono text-slate-400 uppercase">Coût Emploi Total</span>
                            <p className="text-sm font-bold font-mono text-purple-400 mt-1">
                              {formatMoney(selectedEmployee.financial.totalEmploymentCost)}
                            </p>
                          </div>
                          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                            <span className="text-[10px] font-mono text-slate-400 uppercase">Revenu Généré</span>
                            <p className="text-sm font-bold font-mono text-emerald-400 mt-1">
                              {formatMoney(selectedEmployee.profitability.employeeRevenue)}
                            </p>
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                          <h4 className="text-xs font-mono font-bold text-cyan-300 uppercase">
                            Bilan de Valeur Créée
                          </h4>
                          <div className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60">
                            <span className="text-slate-400">Marge Brute / Valeur Nette:</span>
                            <span className="font-mono font-bold text-emerald-400">
                              {formatMoney(selectedEmployee.profitability.employeeGrossMargin)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60">
                            <span className="text-slate-400">Rendement sur Coût (ROI):</span>
                            <span className="font-mono font-bold text-purple-400">
                              +{selectedEmployee.profitability.roi}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs py-1">
                            <span className="text-slate-400">Coût Moyen par Jour / Heure:</span>
                            <span className="font-mono text-slate-200">
                              {formatMoney(selectedEmployee.financial.avgCostPerDay)}/j • {formatMoney(selectedEmployee.financial.avgCostPerHour)}/h
                            </span>
                          </div>
                        </div>

                        {/* Cross-Department Revenue Attribution */}
                        {selectedEmployee.crossDepartmentAttribution && (
                          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3 font-mono text-xs">
                            <div className="flex items-center justify-between">
                              <h4 className="font-bold text-cyan-300 uppercase flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                                Distribution Opérationnelle Inter-Départementale
                              </h4>
                              <span className="text-[10px] text-slate-400">
                                Dept Attitrée (RH): <strong className="text-white">{selectedEmployee.departmentName}</strong>
                              </span>
                            </div>

                            <div className="space-y-2">
                              {Object.entries(selectedEmployee.crossDepartmentAttribution).map(([deptId, data]) => (
                                <div key={deptId} className="space-y-1">
                                  <div className="flex items-center justify-between text-[11px]">
                                    <span className="text-slate-300 font-medium">{data.departmentName}</span>
                                    <span className="text-emerald-400 font-bold">
                                      {formatMoney(data.revenue)} ({data.percentage}%)
                                    </span>
                                  </div>
                                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full"
                                      style={{ width: `${Math.min(100, Math.max(2, data.percentage))}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {empModalTab === "attendance" && (
                      <div className="space-y-4 font-mono text-xs">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                            <span className="text-[10px] text-slate-400">Taux de Présence</span>
                            <p className="text-base font-bold text-emerald-400">{selectedEmployee.attendance.attendanceRate}%</p>
                          </div>
                          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                            <span className="text-[10px] text-slate-400">Retards Constatés</span>
                            <p className="text-base font-bold text-amber-400">{selectedEmployee.attendance.lateArrivals}</p>
                          </div>
                          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                            <span className="text-[10px] text-slate-400">Heures Réelles Effectuées</span>
                            <p className="text-base font-bold text-cyan-400">{selectedEmployee.attendance.workedHours}h</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {empModalTab === "performance" && (
                      <div className="space-y-4 font-mono text-xs">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                            <span className="text-[10px] text-slate-400">Score de Performance</span>
                            <p className="text-base font-bold text-emerald-400">{selectedEmployee.efficiency.performanceScore}/100</p>
                          </div>
                          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                            <span className="text-[10px] text-slate-400">Score de Productivité</span>
                            <p className="text-base font-bold text-cyan-400">{selectedEmployee.efficiency.productivityScore}/100</p>
                          </div>
                          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                            <span className="text-[10px] text-slate-400">Revenu par $ Salarial</span>
                            <p className="text-base font-bold text-emerald-400">{selectedEmployee.efficiency.revenuePerPayrollDollar}x</p>
                          </div>
                          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                            <span className="text-[10px] text-slate-400">Transactions Traitées</span>
                            <p className="text-base font-bold text-purple-400">{selectedEmployee.operational.transactionsProcessed}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {empModalTab === "ai" && (
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-3">
                        <div className="flex items-center gap-2 text-cyan-400 font-mono font-bold">
                          <Sparkles className="w-4 h-4" />
                          Analyse de Valeur IA
                        </div>
                        <p className="text-slate-300">
                          {selectedEmployee.employeeName} génère un chiffre d'affaires estimé à{" "}
                          <span className="font-mono text-emerald-400 font-bold">{formatMoney(selectedEmployee.profitability.employeeRevenue)}</span> pour un coût salarial global de{" "}
                          <span className="font-mono text-rose-400 font-bold">{formatMoney(selectedEmployee.financial.totalEmploymentCost)}</span>, dégageant une contribution nette de{" "}
                          <span className="font-mono text-cyan-300 font-bold">{formatMoney(selectedEmployee.profitability.employeeGrossMargin)}</span> (ROI: {selectedEmployee.profitability.roi}%).
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* DEPARTMENT DRILLDOWN MODAL */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {selectedDepartment && (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col font-sans"
                >
                  {/* Modal Header */}
                  <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 flex items-center justify-center font-bold">
                        <Building className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">{selectedDepartment.departmentName}</h3>
                        <p className="text-xs text-slate-400 font-mono">
                          Effectif: {selectedDepartment.totalEmployees} employés
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 rounded-full font-mono text-xs font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                        Score Dept: {selectedDepartment.departmentProfitabilityScore}/100
                      </span>
                      <button
                        onClick={() => setSelectedDepartment(null)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Modal Body */}
                  <div className="p-6 overflow-y-auto space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                        <span className="text-[10px] font-mono text-slate-400 uppercase">Masse Salariale</span>
                        <p className="text-sm font-bold font-mono text-rose-400 mt-1">
                          {formatMoney(selectedDepartment.totalPayrollCost)}
                        </p>
                      </div>
                      <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                        <span className="text-[10px] font-mono text-slate-400 uppercase">Revenu Généré</span>
                        <p className="text-sm font-bold font-mono text-emerald-400 mt-1">
                          {formatMoney(selectedDepartment.revenueGenerated)}
                        </p>
                      </div>
                      <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                        <span className="text-[10px] font-mono text-slate-400 uppercase">Bénéfice Net</span>
                        <p className="text-sm font-bold font-mono text-cyan-400 mt-1">
                          {formatMoney(selectedDepartment.departmentProfit)}
                        </p>
                      </div>
                      <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                        <span className="text-[10px] font-mono text-slate-400 uppercase">Salaire Moyen</span>
                        <p className="text-sm font-bold font-mono text-purple-400 mt-1">
                          {formatMoney(selectedDepartment.averageSalary)}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                      <h4 className="font-mono font-bold text-cyan-300">Liste du Personnel du Département</h4>
                      <div className="space-y-2">
                        {selectedDepartment.employeeBreakdown.map((emp) => (
                          <div key={emp.id} className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800/60 font-mono">
                            <span className="font-bold text-white">{emp.name}</span>
                            <div className="space-x-4 text-[11px]">
                              <span className="text-rose-400">Coût: {formatMoney(emp.cost)}</span>
                              <span className="text-emerald-400">Revenu: {formatMoney(emp.revenue)}</span>
                              <span className="text-cyan-300 font-bold">Marge: {formatMoney(emp.profit)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};
