import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { useAnalytics } from "../context/AnalyticsContext";
import { useExecutiveFilters } from "../context/ExecutiveFilterContext";
import { useBusinessContext } from "../../../contexts/BusinessContext";
import { useI18n } from "../../../i18n";
import {
  Users,
  Award,
  DollarSign,
  TrendingUp,
  Settings,
  Scale,
  Sparkles,
  ClipboardList,
  ChevronRight,
  Info,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Briefcase,
  Zap,
  Percent,
  PlusCircle,
  CheckCircle2,
  Sliders,
  Play,
  Gauge,
  HelpCircle,
  Trash2,
  RefreshCw,
  Search,
  Check,
  Building,
  Target,
  Filter,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ComposedChart,
  Line,
  Cell,
  AreaChart,
  Area
} from "recharts";
import { SafeChartContainer } from "../../../components/ui/SafeChartContainer";

import {
  CompensationModelConfig,
  PayrollPolicyConfig,
  RoleProfile,
  RoleKpi
} from "../../../types";
import { WorkforceRepository } from "../../../repositories/WorkforceRepository";
import { WorkforceProfitabilityDashboard } from "./WorkforceProfitabilityDashboard";
import { toast } from "sonner";

export const WorkforceIntelligenceFramework: React.FC = () => {
  const { snapshot, transactions, employees, contracts, attendanceLogs } = useAnalytics();
  const { 
    business, 
    branches, 
    departments,
    compensationModels,
    payrollPolicies,
    roleProfiles
  } = useBusinessContext();
  const { filters } = useExecutiveFilters();
  const { language } = useI18n();

  const isFr = language === "fr";
  const isHt = language === "ht";

  // Navigation Tab within the Workforce Intelligence Framework
  const [activeSubTab, setActiveSubTab] = useState<
    "employee_perf" | "department_perf" | "analytics" | "compensation" | "policies" | "kpis" | "scoring" | "advisor"
  >("employee_perf");

  // Selection state for drilldown views
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Local UI state for optimistic updates (still needed for some local interactions)
  const [compensationOverrides, setCompensationOverrides] = useState<Record<string, CompensationModelConfig>>({});

  // 1. COMPENSATION MODELS OVERRIDES - Mapped from BusinessContext
  const effectiveCompensationOverrides = useMemo(() => {
    const records: Record<string, CompensationModelConfig> = { ...compensationOverrides };
    
    // First, map synchronized models from Firestore
    compensationModels.forEach(model => {
      records[model.employeeId] = model;
    });

    // Then, ensure all employees have a baseline
    employees.forEach((emp) => {
      if (!records[emp.id]) {
        let type: "FIXED" | "HOURLY" | "COMMISSION" | "PERCENTAGE" | "HYBRID" = "FIXED";
        if (emp.paymentModel === "COMMISSION") type = "COMMISSION";
        else if (emp.paymentModel === "HYBRID") type = "HYBRID";

        records[emp.id] = {
          employeeId: emp.id,
          business_id: business?.id || "",
          type,
          baseSalaryHtg: emp.salaryBaseHtg || emp.baseSalary || 30000,
          hourlyRateHtg: 250,
          commissionRate: emp.commissionRate || 10,
          revenuePercentage: 5
        };
      }
    });
    return records;
  }, [compensationModels, employees, business?.id, compensationOverrides]);

  // Handle saving a compensation model change to Firestore
  const handleSaveCompensationModel = async (config: CompensationModelConfig) => {
    const activeBizId = business?.id;
    if (!activeBizId) {
      toast.error("Business ID non disponible");
      return;
    }
    try {
      await WorkforceRepository.saveCompensationModel({
        ...config,
        business_id: activeBizId
      });
      toast.success(isFr ? "Modèle de rémunération mis à jour" : "Modèl peman an mete ajou");
    } catch (err) {
      console.error("Failed to save compensation model:", err);
      toast.error("Error saving model");
    }
  };

  // 2. PAYROLL POLICIES - UI Editing State
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [policyForm, setPolicyForm] = useState<Partial<PayrollPolicyConfig>>({});

  const effectivePayrollPolicies = useMemo(() => {
    if (payrollPolicies.length > 0) return payrollPolicies;
    
    // Default system policies if none found in DB
    return [
      {
        id: "policy-all",
        business_id: business?.id || "",
        scope: "COMPANY",
        scopeId: "ALL",
        expectedHours: 80,
        latenessToleranceMinutes: 10,
        overtimeMultiplier: 1.5,
        lateDeductionHtg: 500,
        absenceDeductionHtg: 2000
      }
    ] as PayrollPolicyConfig[];
  }, [payrollPolicies, business?.id]);

  const handleSavePolicy = async (policy: PayrollPolicyConfig) => {
    const activeBizId = business?.id;
    if (!activeBizId) {
      toast.error("Business ID non disponible");
      return;
    }
    try {
      await WorkforceRepository.savePayrollPolicy({
        ...policy,
        business_id: activeBizId
      });
      toast.success(isFr ? "Politique de paie enregistrée" : "Politik paie a anrejistre");
      setEditingPolicyId(null);
      setPolicyForm({});
    } catch (err) {
      toast.error("Error saving policy");
    }
  };

  const handleDeletePolicy = async (id: string) => {
    try {
      await WorkforceRepository.deletePayrollPolicy(id);
      toast.success("Policy deleted");
    } catch (err) {
      toast.error("Error deleting policy");
    }
  };

  // 3. ROLE PROFILES - Using data from BusinessContext with default Catalog
  const effectiveRoleProfiles = useMemo(() => {
    if (roleProfiles.length > 0) return roleProfiles;
    
    // Default catalog if none in DB
    return [
      {
        id: "BARBER",
        business_id: business?.id || "",
        title: isFr ? "Barbier Professionnel" : "Barbye Pwofesyonèl",
        kpis: [
          { id: "csat", name: isFr ? "Satisfaction Client (CSAT)" : "Satisfaksyon Kliyan", weight: 30, target: ">= 4.8 / 5.0", description: isFr ? "Note moyenne attribuée lors des avis de caisse." : "Nòt kliyan yo bay sou sèvis la.", currentValue: 92 },
          { id: "hygiene", name: isFr ? "Hygiène & Stérilisation" : "Ijyèn ak Pwòpte", weight: 10, target: "100%", description: isFr ? "Note d'audit sur l'entretien des tondeuses et peignes." : "Netwayaj ak dezenfeksyon zouti travay yo.", currentValue: 100 }
        ]
      }
    ] as RoleProfile[];
  }, [roleProfiles, business?.id, isFr]);

  const handleSaveRoleProfile = async (profile: RoleProfile) => {
    const activeBizId = business?.id;
    if (!activeBizId) {
      toast.error("Business ID non disponible");
      return;
    }
    try {
      await WorkforceRepository.saveRoleProfile({
        ...profile,
        business_id: activeBizId
      });
      toast.success("Role profile saved");
    } catch (err) {
      toast.error("Error saving profile");
    }
  };

  // 4. PERFORMANCE SCORING ENGINE WEIGHTS
  const [scoringWeights, setScoringWeights] = useState({
    attendance: 30, // Attendance compliance (consistency score)
    financialContribution: 40, // Commissions generated relative to average
    roleKpiScore: 30 // KPIs catalog score average
  });

  // Timeframe selector for ranking
  const [rankingTimeframe, setRankingTimeframe] = useState<"fortnight" | "month" | "quarter" | "year">("month");

  // Excel Table Filter & Sort States for Leaderboard
  type LeaderboardSortCol = "rank" | "displayName" | "role" | "simulatedHours" | "payrollTotal" | "globalScore";
  const [activityFilter, setActivityFilter] = useState<"ACTIVE_ONLY" | "ALL" | "INACTIVE_ONLY">("ACTIVE_ONLY");
  const [scoreFilter, setScoreFilter] = useState<"ALL" | "EXCELLENT" | "GOOD" | "RISK">("ALL");
  const [leaderboardDeptFilter, setLeaderboardDeptFilter] = useState<string>("ALL");
  const [sortColumn, setSortColumn] = useState<LeaderboardSortCol>("globalScore");
  const [sortAscending, setSortAscending] = useState<boolean>(false);

  // Score Global Explanation Modal state
  const [showScoreExplanationModal, setShowScoreExplanationModal] = useState<boolean>(false);

  // AI Assistant Interaction state
  const [aiCustomQuestion, setAiCustomQuestion] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiAdvisorResponse, setAiAdvisorResponse] = useState<string | null>(null);

  // Currency utility helper
  const activeCurrency = filters.currency || "HTG";
  const convertAmount = (amountHtg: number) => {
    return activeCurrency === "USD" ? amountHtg / 135 : amountHtg;
  };
  const currencySymbol = activeCurrency === "USD" ? "$" : "HTG";

  // Dynamic system evaluation logic with timeframe scaling
  const computedEmployeesData = useMemo(() => {
    const wfData = snapshot?.workforceProfitability;
    if (!wfData) return [];

    let timeframeMultiplier = 1.0;
    if (rankingTimeframe === "fortnight") timeframeMultiplier = 0.5;
    else if (rankingTimeframe === "quarter") timeframeMultiplier = 3.0;
    else if (rankingTimeframe === "year") timeframeMultiplier = 12.0;

    return wfData.employees.map(emp => {
      const scaledWorkedHours = Math.round(emp.attendance.workedHours * timeframeMultiplier);
      const scaledMonthlySalary = Math.round(emp.financial.monthlySalary * timeframeMultiplier);
      const scaledTotalCost = Math.round(emp.financial.totalEmploymentCost * timeframeMultiplier);
      const scaledBenefits = Math.round(emp.financial.benefitsCost * timeframeMultiplier);
      const scaledRevenue = Math.round(emp.profitability.employeeRevenue * timeframeMultiplier);
      
      const hasWorked = scaledWorkedHours > 0;
      // Inactive / unworked employees receive score 0 or flagged
      const globalScore = hasWorked ? emp.healthScore.score : 0;

      return {
        id: emp.employeeId,
        displayName: emp.employeeName,
        role: emp.role,
        branch: emp.branchName,
        department: emp.departmentName,
        commissionsHtg: scaledBenefits,
        attendanceScore: emp.healthScore.attendanceScore,
        financialScore: emp.healthScore.profitabilityScore,
        kpiAvgScore: emp.healthScore.productivityScore,
        globalScore: globalScore,
        rawScore: emp.healthScore.score,
        simulatedHours: scaledWorkedHours,
        hasWorked: hasWorked,
        latenessCount: emp.attendance.lateArrivals,
        absencesCount: emp.attendance.leaveDays + emp.attendance.unauthorizedAbsences,
        compensationModel: { 
          employeeId: emp.employeeId, 
          business_id: wfData.businessId, 
          type: "HYBRID", 
          baseSalaryHtg: scaledMonthlySalary, 
          hourlyRateHtg: emp.financial.avgCostPerHour, 
          commissionRate: 10, 
          revenuePercentage: 5 
        },
        applicablePolicy: { 
          expectedHours: Math.round(emp.attendance.expectedHours * timeframeMultiplier), 
          lateDeductionHtg: 0, 
          absenceDeductionHtg: 0 
        },
        simulatedPayrollHtg: { 
          base: scaledMonthlySalary, 
          overtime: 0, 
          commission: scaledBenefits, 
          deductions: 0, 
          net: scaledTotalCost 
        },
        trendData: emp.productivityTrend.map(t => ({ name: t.date, score: t.score, billing: scaledRevenue }))
      };
    });
  }, [snapshot, rankingTimeframe]);

  const handleLeaderboardSort = (col: LeaderboardSortCol) => {
    if (sortColumn === col) {
      setSortAscending(!sortAscending);
    } else {
      setSortColumn(col);
      setSortAscending(col === "displayName" || col === "role");
    }
  };

  const resetLeaderboardFilters = () => {
    setSearchTerm("");
    setActivityFilter("ACTIVE_ONLY");
    setScoreFilter("ALL");
    setLeaderboardDeptFilter("ALL");
    setSortColumn("globalScore");
    setSortAscending(false);
  };

  const hasActiveLeaderboardFilters = useMemo(() => {
    return (
      searchTerm !== "" ||
      activityFilter !== "ACTIVE_ONLY" ||
      scoreFilter !== "ALL" ||
      leaderboardDeptFilter !== "ALL" ||
      sortColumn !== "globalScore"
    );
  }, [searchTerm, activityFilter, scoreFilter, leaderboardDeptFilter, sortColumn]);

  // Filtered and Sorted Leaderboard list
  const filteredAndSortedLeaderboard = useMemo(() => {
    let list = [...computedEmployeesData];

    // Filter by Activity (worked vs unworked)
    if (activityFilter === "ACTIVE_ONLY") {
      list = list.filter((e) => e.hasWorked);
    } else if (activityFilter === "INACTIVE_ONLY") {
      list = list.filter((e) => !e.hasWorked);
    }

    // Filter by Score Status
    if (scoreFilter === "EXCELLENT") {
      list = list.filter((e) => e.globalScore >= 85);
    } else if (scoreFilter === "GOOD") {
      list = list.filter((e) => e.globalScore >= 70 && e.globalScore < 85);
    } else if (scoreFilter === "RISK") {
      list = list.filter((e) => e.globalScore < 70 && e.hasWorked);
    }

    // Filter by Department
    if (leaderboardDeptFilter !== "ALL") {
      list = list.filter((e) => e.department === leaderboardDeptFilter);
    }

    // Filter by Search Term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (e) =>
          e.displayName.toLowerCase().includes(term) ||
          e.role.toLowerCase().includes(term) ||
          e.department.toLowerCase().includes(term)
      );
    }

    // Sorting
    list.sort((a, b) => {
      let valA = 0;
      let valB = 0;

      switch (sortColumn) {
        case "displayName":
          return sortAscending
            ? a.displayName.localeCompare(b.displayName)
            : b.displayName.localeCompare(a.displayName);
        case "role":
          return sortAscending
            ? a.role.localeCompare(b.role)
            : b.role.localeCompare(a.role);
        case "simulatedHours":
          valA = a.simulatedHours;
          valB = b.simulatedHours;
          break;
        case "payrollTotal":
          valA = a.simulatedPayrollHtg.net;
          valB = b.simulatedPayrollHtg.net;
          break;
        case "globalScore":
        default:
          valA = a.globalScore;
          valB = b.globalScore;
          break;
      }

      return sortAscending ? valA - valB : valB - valA;
    });

    return list;
  }, [
    computedEmployeesData,
    activityFilter,
    scoreFilter,
    leaderboardDeptFilter,
    searchTerm,
    sortColumn,
    sortAscending,
  ]);

  // Selected employee drilldown object
  const activeEmployeeDrilldown = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return computedEmployeesData.find((e) => e.id === selectedEmployeeId) || null;
  }, [computedEmployeesData, selectedEmployeeId]);

  // 7. WORKFORCE ANALYTICS RATIOS
  const workforceAnalyticsMetrics = useMemo(() => {
    const wfData = snapshot?.workforceProfitability;
    if (!wfData || !wfData.executiveSummary) return { avgScore: 0, payrollRatio: 0, hrRoi: "0.0", totalLates: 0, totalAbsences: 0, simulatedRevenueHtg: 0, totalSimulatedPayrollHtg: 0 };
    const exec = wfData.executiveSummary;
    const totalLates = wfData.employees.reduce((acc, e) => acc + e.attendance.lateArrivals, 0);
    const totalAbsences = wfData.employees.reduce((acc, e) => acc + e.attendance.leaveDays + e.attendance.unauthorizedAbsences, 0);
    const payrollRatio = exec.totalWorkforceRevenue > 0 ? Math.round((exec.totalWorkforceCost / exec.totalWorkforceRevenue) * 100) : 0;
    const hrRoi = exec.totalWorkforceCost > 0 ? (exec.totalWorkforceRevenue / exec.totalWorkforceCost).toFixed(2) : "0.0";
    return {
      avgScore: exec.currentWorkforceHealthScore,
      payrollRatio,
      hrRoi,
      totalLates,
      totalAbsences,
      simulatedRevenueHtg: exec.totalWorkforceRevenue,
      totalSimulatedPayrollHtg: exec.totalWorkforceCost
    };
  }, [snapshot, computedEmployeesData]);

  // 8. AI WORKFORCE ADVISOR AUTO GENERATIONS
  const automaticManagementInsights = useMemo(() => {
    const wfData = snapshot?.workforceProfitability;
    if (!wfData || !wfData.executiveSummary) return [];
    const list = [];
    const isFr = language === "fr";
    wfData.executiveSummary.insights.forEach(ins => {
      list.push({
        title: isFr ? "Insight" : "Insight",
        badge: ins.category,
        type: ins.severity === "SUCCESS" ? "PROMOTION" : (ins.severity === "WARNING" ? "POLICY_VIOLATION" : "OPTIMIZATION"),
        text: ins.message
      });
    });
    wfData.executiveSummary.recommendations.forEach(rec => {
      list.push({
        title: rec.title,
        badge: "Recommandation",
        type: rec.type,
        text: rec.description
      });
    });
    return list;
  }, [snapshot, language]);
  // Simulator for Custom AI queries
  const handleAskAiAdvisor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiCustomQuestion.trim()) return;
    setIsAiLoading(true);
    setAiAdvisorResponse(null);
    setTimeout(() => {
      setAiAdvisorResponse("L'IA Advisor est temporairement desactivé pour audit de conformité avec la Single Source of Truth (SSOT).");
      setIsAiLoading(false);
    }, 500);
  };

  // Helper for dynamic score coloring
  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-cyan-400 bg-cyan-950/40 border border-cyan-800/55";
    if (score >= 70) return "text-emerald-400 bg-emerald-950/30 border border-emerald-900/40";
    if (score >= 55) return "text-amber-400 bg-amber-950/30 border border-amber-900/40";
    return "text-rose-400 bg-rose-950/35 border border-rose-900/40";
  };

  // Alias for backward compatibility if referenced elsewhere
  const sortedAndRankedEmployees = filteredAndSortedLeaderboard;
  const filteredSearchList = filteredAndSortedLeaderboard;

  return (
    <div className="border border-slate-800 bg-slate-950/30 rounded-xl p-5" id="workforce-intelligence-framework-v3">
      {/* FRAMEWORK TOP BANNER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-100 flex items-center gap-1.5 font-mono">
              Workforce Intelligence Framework <span className="text-[9.5px] bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 px-1.5 py-0.5 rounded font-extrabold uppercase tracking-wider">Enterprise Performance V3</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5 font-light">
              {isFr
                ? "Gestion dynamique de la performance, modèles de rémunération flexibles, règles de paie et catalogue de KPIs métiers."
                : "Planifikasyon salè, modèl komisyon, kontra, penalite ak konsèy entèlijan pou devlopman anplwaye yo."
              }
            </p>
          </div>
        </div>

        {/* Real-time sync indicator */}
        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          <span>Extensible Core Active</span>
        </div>
      </div>

      {/* HORIZONTAL COMPONENT INTERACTIVE MENUS */}
      <div className="flex border-b border-slate-800/80 mb-5 overflow-x-auto no-scrollbar gap-1.5 font-sans text-[11px] font-bold p-1 bg-slate-950 rounded-lg">
        {[
          { id: "employee_perf", label: isFr ? "👥 1. Employee Performance" : "Employee Perf", icon: Users },
          { id: "department_perf", label: isFr ? "🏢 2. Department Performance" : "Dept Perf", icon: Building },
          { id: "analytics", label: isFr ? "📊 Ratios & Global Dashboard" : "Dashboard", icon: TrendingUp },
          { id: "scoring", label: isFr ? "⚖️ Moteur de Pointage" : "Pointage", icon: Scale },
          { id: "compensation", label: isFr ? "💳 Modèles Rémunération" : "Rémunération", icon: DollarSign },
          { id: "policies", label: isFr ? "📜 Politiques Paie" : "Politik Paie", icon: ClipboardList },
          { id: "kpis", label: isFr ? "🎯 Catalogue KPIs" : "KPIs Katalog", icon: Target },
          { id: "advisor", label: isFr ? "🤖 IA Advisor" : "IA Advisor", icon: Sparkles }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveSubTab(tab.id as any);
                setSelectedEmployeeId(null); // clear drilldown
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? "bg-cyan-600/20 text-cyan-300 border border-cyan-500/30"
                  : "text-slate-400 hover:text-slate-200 border border-transparent"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? "text-cyan-400" : ""}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ACTIVE SCREEN WORKFLOWS */}
      <div className="min-h-[25rem]">

        {/* SUB-TAB: EMPLOYEE PERFORMANCE */}
        {activeSubTab === "employee_perf" && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
            <WorkforceProfitabilityDashboard initialTab="employee" />
          </motion.div>
        )}

        {/* SUB-TAB: DEPARTMENT PERFORMANCE */}
        {activeSubTab === "department_perf" && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
            <WorkforceProfitabilityDashboard initialTab="department" />
          </motion.div>
        )}

        {/* SUB-TAB 1: WORKFORCE ANALYTICS RATIOS & LEADERBOARD */}
        {activeSubTab === "analytics" && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            
            {/* Upper Ratios Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850">
                <span className="text-[9px] uppercase tracking-wider text-slate-500 font-mono block">Score Global Moyen Équipe</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-black text-slate-200 font-mono">{workforceAnalyticsMetrics.avgScore}</span>
                  <span className="text-xs text-cyan-400 font-mono">/ 100</span>
                </div>
                <p className="text-[9px] text-slate-500 mt-1">{isFr ? "Performance globale consolidée" : "Nivo nòt jeneral"}</p>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850">
                <span className="text-[9px] uppercase tracking-wider text-slate-500 font-mono block">Ratio ROI de Masse Salariale</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-black text-cyan-400 font-mono">{workforceAnalyticsMetrics.hrRoi}x</span>
                </div>
                <p className="text-[9px] text-slate-500 mt-1">{isFr ? "Chiffre d'affaires / Masse Salariale" : "Rapò Lajan Salè vs Antre"}</p>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850">
                <span className="text-[9px] uppercase tracking-wider text-slate-500 font-mono block">Part de Paie sur Facturation</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-black text-emerald-400 font-mono">{workforceAnalyticsMetrics.payrollRatio}%</span>
                </div>
                <p className="text-[9px] text-slate-500 mt-1">{isFr ? "Pourcentage idéal ciblé < 35%" : "Objectif pi piti pase 35%"}</p>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850">
                <span className="text-[9px] uppercase tracking-wider text-slate-500 font-mono block">Pertes Assiduité</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-black text-rose-400 font-mono">
                    {workforceAnalyticsMetrics.totalLates} / {workforceAnalyticsMetrics.totalAbsences}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">R / A</span>
                </div>
                <p className="text-[9px] text-slate-500 mt-1">{isFr ? "Retards & Absences comptabilisés" : "Reta ak Absans pou mwa sa"}</p>
              </div>
            </div>

            {/* Split layout: Leaderboard & Dynamic Employee Profile Drilldown */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Leaderboard left box */}
              <div className="lg:col-span-7 bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-900">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                        {isFr ? "Classement Automatique des Collaborateurs" : "Klasman Otomatik Anplwaye yo"}
                      </h3>
                      <button
                        onClick={() => setShowScoreExplanationModal(true)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono cursor-pointer transition-colors"
                        title="Voir la formule et la logique du Score Global"
                      >
                        <Info className="w-3 h-3 text-cyan-400" />
                        <span>Logique Score</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 font-light mt-0.5">
                      {isFr ? "Poids calculés selon le moteur actif (Période & Activité)" : "Klase dapre ponderasyon kounye a"}
                    </p>
                  </div>

                  {/* Timeframe controls */}
                  <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800">
                    {[
                      { id: "fortnight", label: isFr ? "Quinzaine" : "Kenz jou" },
                      { id: "month", label: isFr ? "Mois" : "Mwa" },
                      { id: "quarter", label: isFr ? "Trimestre" : "Trimès" },
                      { id: "year", label: isFr ? "Année" : "Ane" }
                    ].map((tf) => (
                      <button
                        key={tf.id}
                        onClick={() => setRankingTimeframe(tf.id as any)}
                        className={`px-2 py-0.5 rounded text-[9.5px] font-bold cursor-pointer transition ${
                          rankingTimeframe === tf.id ? "bg-cyan-600 text-slate-950" : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {tf.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* EXCEL CONTROL TOOLBAR */}
                <div className="flex flex-wrap items-center gap-2 bg-slate-900/60 p-2 rounded-lg border border-slate-850">
                  <div className="relative flex-1 min-w-[140px]">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      placeholder={isFr ? "Rechercher collaborateur..." : "Chache yon anplwaye..."}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-slate-950 text-xs border border-slate-800 pl-8 pr-3 py-1 rounded outline-none text-slate-200 focus:border-cyan-500/50 font-mono"
                    />
                    {searchTerm && (
                      <button onClick={() => setSearchTerm("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Activity Filter */}
                  <select
                    value={activityFilter}
                    onChange={(e) => setActivityFilter(e.target.value as any)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-[11px] font-mono py-1 px-2 rounded outline-none focus:border-cyan-500/50 cursor-pointer"
                  >
                    <option value="ACTIVE_ONLY">Actifs (&gt;0h)</option>
                    <option value="ALL">Tous les agents</option>
                    <option value="INACTIVE_ONLY">Non travaillés (0h)</option>
                  </select>

                  {/* Score Filter */}
                  <select
                    value={scoreFilter}
                    onChange={(e) => setScoreFilter(e.target.value as any)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-[11px] font-mono py-1 px-2 rounded outline-none focus:border-cyan-500/50 cursor-pointer"
                  >
                    <option value="ALL">Score: Tous</option>
                    <option value="EXCELLENT">Score: Top (85+)</option>
                    <option value="GOOD">Score: Bon (70-84)</option>
                    <option value="RISK">Score: Risque (&lt;70)</option>
                  </select>

                  {hasActiveLeaderboardFilters && (
                    <button
                      onClick={resetLeaderboardFilters}
                      className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-mono flex items-center gap-1 cursor-pointer transition-colors"
                      title="Réinitialiser filtres Excel"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset
                    </button>
                  )}
                </div>

                {/* EXCEL TABLE */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-sans">
                    <thead>
                      <tr className="bg-slate-900/60 text-[9.5px] uppercase font-bold text-slate-400 border-b border-slate-850 select-none">
                        <th className="py-2 px-3 text-center w-10">#</th>
                        <th onClick={() => handleLeaderboardSort("displayName")} className="py-2 px-2 cursor-pointer hover:bg-slate-900 transition-colors">
                          <div className="flex items-center gap-1">
                            <span>Collaborateur</span>
                            {sortColumn === "displayName" ? (
                              sortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                            )}
                          </div>
                        </th>
                        <th onClick={() => handleLeaderboardSort("role")} className="py-2 px-2 cursor-pointer hover:bg-slate-900 transition-colors">
                          <div className="flex items-center gap-1">
                            <span>Job Métier</span>
                            {sortColumn === "role" ? (
                              sortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                            )}
                          </div>
                        </th>
                        <th onClick={() => handleLeaderboardSort("simulatedHours")} className="py-2 px-2 text-center cursor-pointer hover:bg-slate-900 transition-colors">
                          <div className="flex items-center justify-center gap-1">
                            <span>Heures</span>
                            {sortColumn === "simulatedHours" ? (
                              sortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                            )}
                          </div>
                        </th>
                        <th onClick={() => handleLeaderboardSort("payrollTotal")} className="py-2 px-2 text-right cursor-pointer hover:bg-slate-900 transition-colors">
                          <div className="flex items-center justify-end gap-1">
                            <span>Payroll Total</span>
                            {sortColumn === "payrollTotal" ? (
                              sortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                            )}
                          </div>
                        </th>
                        <th onClick={() => handleLeaderboardSort("globalScore")} className="py-2 px-3 text-right cursor-pointer hover:bg-slate-900 transition-colors">
                          <div className="flex items-center justify-end gap-1">
                            <span>Score Global</span>
                            {sortColumn === "globalScore" ? (
                              sortAscending ? <ArrowUp className="w-3 h-3 text-cyan-400" /> : <ArrowDown className="w-3 h-3 text-cyan-400" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                            )}
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900">
                      {filteredAndSortedLeaderboard.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500 font-mono text-xs">
                            Aucun collaborateur ne correspond aux critères de filtrage Excel sélectionnés.
                          </td>
                        </tr>
                      ) : (
                        filteredAndSortedLeaderboard.map((emp, index) => {
                          const isSelected = selectedEmployeeId === emp.id;
                          return (
                            <tr
                              key={emp.id}
                              onClick={() => setSelectedEmployeeId(emp.id)}
                              className={`cursor-pointer transition-colors ${
                                isSelected ? "bg-cyan-950/30 text-cyan-200" : "hover:bg-slate-900/50 text-slate-300"
                              }`}
                            >
                              <td className="py-2.5 px-3 text-center font-mono font-bold">
                                {index === 0 && <span className="text-amber-500">🏆 1</span>}
                                {index === 1 && <span className="text-slate-400">🥈 2</span>}
                                {index === 2 && <span className="text-amber-700">🥉 3</span>}
                                {index > 2 && index + 1}
                              </td>
                              <td className="py-2.5 px-2 font-semibold text-slate-200">
                                <div className="flex items-center gap-1.5">
                                  <span>{emp.displayName}</span>
                                  {!emp.hasWorked && (
                                    <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded font-mono font-normal">
                                      Inactif 0h
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-2 text-slate-500 text-[10.5px]">
                                {emp.role}
                              </td>
                              <td className="py-2.5 px-2 text-center font-mono font-medium">
                                <span className={emp.simulatedHours === 0 ? "text-slate-600" : "text-slate-200"}>
                                  {emp.simulatedHours}h
                                </span>
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono font-bold text-emerald-400">
                                {convertAmount(emp.simulatedPayrollHtg.net).toLocaleString()} {currencySymbol}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {emp.hasWorked ? (
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-extrabold ${getScoreColor(emp.globalScore)}`}>
                                    {emp.globalScore} / 100
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-mono text-slate-500 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded">
                                    N/A (0h)
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Dynamic Employee Profiling Drilldown panel right box */}
              <div className="lg:col-span-5 flex flex-col">
                <AnimatePresence mode="wait">
                  {activeEmployeeDrilldown ? (
                    <motion.div
                      key={activeEmployeeDrilldown.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="bg-slate-950 p-4.5 rounded-xl border border-cyan-900/30 space-y-4 flex-1 flex flex-col justify-between"
                    >
                      {/* Profiling Header */}
                      <div>
                        <div className="flex justify-between items-start border-b border-slate-900 pb-3">
                          <div>
                            <span className="text-[9px] uppercase tracking-wider text-slate-500 font-mono">Performance Profile</span>
                            <h4 className="text-sm font-black text-slate-200 mt-0.5">{activeEmployeeDrilldown.displayName}</h4>
                            <p className="text-[10px] text-slate-400 mt-0.5 font-light">
                              {activeEmployeeDrilldown.branch} <ChevronRight className="w-2.5 h-2.5 inline text-slate-600" /> {activeEmployeeDrilldown.department}
                            </p>
                          </div>
                          <button
                            onClick={() => setSelectedEmployeeId(null)}
                            className="text-slate-500 hover:text-slate-300 text-xs font-mono border border-slate-850 px-1.5 py-0.2 rounded"
                          >
                            Close
                          </button>
                        </div>

                        {/* Trend charts */}
                        <div className="mt-3">
                          <span className="text-[9.5px] uppercase font-bold tracking-wider text-slate-400 block font-mono mb-2">Historique de Score Trimestriel</span>
                          <div className="h-28 w-full bg-slate-900/40 p-1.5 rounded border border-slate-900">
                            <SafeChartContainer height="100%" minHeight={112}>
                              <AreaChart data={activeEmployeeDrilldown.trendData} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                                <defs>
                                  <linearGradient id="scoreColor" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2}/>
                                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: "8px", fontFamily: "monospace" }} />
                                <YAxis domain={[0, 100]} stroke="#64748b" style={{ fontSize: "8px", fontFamily: "monospace" }} />
                                <Tooltip contentStyle={{ backgroundColor: "#020617", borderColor: "#1e293b", fontSize: "10px" }} />
                                <Area type="monotone" dataKey="score" stroke="#06b6d4" fillOpacity={1} fill="url(#scoreColor)" />
                              </AreaChart>
                            </SafeChartContainer>
                          </div>
                        </div>

                        {/* Segment breakdown */}
                        <div className="mt-4 grid grid-cols-3 gap-2">
                          <div className="bg-slate-900/60 p-2 rounded text-center">
                            <span className="text-[8px] text-slate-500 uppercase block font-mono">Assiduité</span>
                            <span className="text-xs font-black text-cyan-400 font-mono">{activeEmployeeDrilldown.attendanceScore}%</span>
                          </div>
                          <div className="bg-slate-900/60 p-2 rounded text-center">
                            <span className="text-[8px] text-slate-500 uppercase block font-mono">Recettes/Com.</span>
                            <span className="text-xs font-black text-emerald-400 font-mono">{activeEmployeeDrilldown.financialScore}%</span>
                          </div>
                          <div className="bg-slate-900/60 p-2 rounded text-center">
                            <span className="text-[8px] text-slate-500 uppercase block font-mono">Métier KPIs</span>
                            <span className="text-xs font-black text-purple-400 font-mono">{activeEmployeeDrilldown.kpiAvgScore}%</span>
                          </div>
                        </div>

                        {/* Behavior anomalies list */}
                        <div className="mt-4 space-y-1.5">
                          <span className="text-[9.5px] uppercase font-bold tracking-wider text-slate-400 block font-mono">Alertes de Conformité</span>
                          {activeEmployeeDrilldown.latenessCount > 0 ? (
                            <div className="p-2 bg-rose-950/20 border border-rose-900/40 text-rose-300 text-[10px] rounded flex items-start gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              <p>
                                {isFr 
                                  ? `${activeEmployeeDrilldown.latenessCount} retards enregistrés. Pénalités de ${convertAmount(activeEmployeeDrilldown.simulatedPayrollHtg.deductions).toLocaleString()} ${currencySymbol} imputées.`
                                  : `${activeEmployeeDrilldown.latenessCount} reta pou mwa sa a.`
                                }
                              </p>
                            </div>
                          ) : (
                            <div className="p-2 bg-emerald-950/20 border border-emerald-900/40 text-emerald-300 text-[10px] rounded flex items-center gap-1.5">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                              <span>{isFr ? "Aucune alerte d'assiduité" : "Pa gen pwoblèm lè."}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Simulated Payroll breakdown footer */}
                      <div className="pt-3 border-t border-slate-900 mt-auto bg-slate-900/40 p-3 rounded-lg border border-slate-850">
                        <span className="text-[8.5px] uppercase font-bold tracking-wider text-slate-400 block font-mono mb-2">Simulation Paie en Direct</span>
                        <div className="grid grid-cols-2 gap-y-1.5 text-[10.5px] text-slate-350">
                          <div>{isFr ? "Base calculée :" : "Baz salè :"}</div>
                          <div className="text-right font-mono font-medium">{convertAmount(activeEmployeeDrilldown.simulatedPayrollHtg.base).toLocaleString()} {currencySymbol}</div>
                          
                          {activeEmployeeDrilldown.simulatedPayrollHtg.overtime > 0 && (
                            <>
                              <div>{isFr ? "Heures Supp. (OT) :" : "Èdtan Anplis :"}</div>
                              <div className="text-right font-mono text-emerald-400">+{convertAmount(activeEmployeeDrilldown.simulatedPayrollHtg.overtime).toLocaleString()} {currencySymbol}</div>
                            </>
                          )}

                          {activeEmployeeDrilldown.simulatedPayrollHtg.commission > 0 && (
                            <>
                              <div>{isFr ? "Commissions :" : "Komisyon :"}</div>
                              <div className="text-right font-mono text-emerald-400">+{convertAmount(activeEmployeeDrilldown.simulatedPayrollHtg.commission).toLocaleString()} {currencySymbol}</div>
                            </>
                          )}

                          {activeEmployeeDrilldown.simulatedPayrollHtg.deductions > 0 && (
                            <>
                              <div>Deductions (L/A) :</div>
                              <div className="text-right font-mono text-rose-400">-{convertAmount(activeEmployeeDrilldown.simulatedPayrollHtg.deductions).toLocaleString()} {currencySymbol}</div>
                            </>
                          )}

                          <div className="border-t border-slate-800 pt-1.5 font-bold text-slate-100">{isFr ? "Rémunération Nette :" : "Sòm Net :"}</div>
                          <div className="border-t border-slate-800 pt-1.5 text-right font-mono font-black text-cyan-400 text-xs">
                            {convertAmount(activeEmployeeDrilldown.simulatedPayrollHtg.net).toLocaleString()} {currencySymbol}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="bg-slate-950 p-6 rounded-xl border border-dashed border-slate-850 text-center flex flex-col items-center justify-center flex-1 py-16 text-slate-500">
                      <Users className="w-10 h-10 text-slate-600 mb-2.5 animate-pulse" />
                      <p className="text-xs font-bold text-slate-400">{isFr ? "Sélectionnez un Profil d'Agent" : "Chwazi yon Profile"}</p>
                      <p className="text-[10px] text-slate-500 mt-1 max-w-[200px]">
                        {isFr ? "Cliquez sur une ligne du tableau pour auditer l'historique de performance et simuler sa paie." : "Klike sou non yon anplwaye pou wè detay li yo."}
                      </p>
                    </div>
                  )}
                </AnimatePresence>
              </div>

            </div>
          </motion.div>
        )}

        {/* SUB-TAB 2: DYNAMIC COMPENSATION MODELS OVERRIDES */}
        {activeSubTab === "compensation" && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="bg-slate-950 p-5 rounded-xl border border-slate-850 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                    {isFr ? "Configuration des Modèles de Rémunération" : "Jere Modèl Komisyon ak Salè"}
                  </h3>
                  <p className="text-[10.5px] text-slate-500 leading-normal">
                    {isFr 
                      ? "Modifiez le contrat de rémunération de chaque agent de manière autonome. Le simulateur adaptera la paie de la quinzaine instantanément."
                      : "Chanje fason anplwaye yo touche kòb (Salè fiks, Lè travay, Komisyon). Chanjman yo ap parèt jeneralman nan kalkilatè a."
                    }
                  </p>
                </div>
              </div>

              {/* Grid of employees compensation modules cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {computedEmployeesData.map((emp) => (
                  <div key={emp.id} className="p-3.5 bg-slate-900/50 border border-slate-850 rounded-xl space-y-3 hover:border-slate-700 transition">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-200">{emp.displayName}</h4>
                        <span className="text-[9.5px] text-slate-500 block">{emp.role}</span>
                      </div>
                      
                      {/* Dropdown to assign models */}
                      <select
                        value={emp.compensationModel.type}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          setCompensationOverrides(prev => ({
                            ...prev,
                            [emp.id]: {
                              ...prev[emp.id],
                              type: val
                            }
                          }));
                        }}
                        className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[9.5px] text-cyan-400 font-bold outline-none"
                      >
                        <option value="FIXED">{isFr ? "Fixe" : "Fiks"}</option>
                        <option value="HOURLY">{isFr ? "Horaire" : "Lè travay"}</option>
                        <option value="COMMISSION">Commission</option>
                        <option value="PERCENTAGE">Pourcentage CA</option>
                        <option value="HYBRID">Hybride</option>
                      </select>
                    </div>

                    {/* Inputs based on active compensation types */}
                    <div className="bg-slate-950 p-2.5 rounded border border-slate-900 text-[10.5px] space-y-2">
                      {emp.compensationModel.type === "FIXED" && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">{isFr ? "Salaire Fixe Mensuel" : "Salè Fiks"} :</span>
                          <input
                            type="number"
                            value={emp.compensationModel.baseSalaryHtg}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setCompensationOverrides(prev => ({
                                ...prev,
                                [emp.id]: { ...prev[emp.id], baseSalaryHtg: val }
                              }));
                            }}
                            className="w-20 px-1.5 py-0.5 text-right bg-slate-900 text-slate-200 border border-slate-800 rounded font-mono"
                          />
                        </div>
                      )}

                      {emp.compensationModel.type === "HOURLY" && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">{isFr ? "Taux Horaire (HTG/h)" : "Lajan pa Lè"} :</span>
                          <input
                            type="number"
                            value={emp.compensationModel.hourlyRateHtg}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setCompensationOverrides(prev => ({
                                ...prev,
                                [emp.id]: { ...prev[emp.id], hourlyRateHtg: val }
                              }));
                            }}
                            className="w-20 px-1.5 py-0.5 text-right bg-slate-900 text-slate-200 border border-slate-800 rounded font-mono"
                          />
                        </div>
                      )}

                      {(emp.compensationModel.type === "COMMISSION" || emp.compensationModel.type === "HYBRID") && (
                        <div className="space-y-2">
                          {emp.compensationModel.type === "HYBRID" && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">{isFr ? "Base Fixe Résiduelle" : "Baz Salè Fiks"} :</span>
                              <input
                                type="number"
                                value={emp.compensationModel.baseSalaryHtg}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setCompensationOverrides(prev => ({
                                    ...prev,
                                    [emp.id]: { ...prev[emp.id], baseSalaryHtg: val }
                                  }));
                                }}
                                className="w-20 px-1.5 py-0.5 text-right bg-slate-900 text-slate-200 border border-slate-800 rounded font-mono"
                              />
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">{isFr ? "Taux Commission (%)" : "Taux Komisyon (%)"} :</span>
                            <input
                              type="number"
                              value={emp.compensationModel.commissionRate}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                  setCompensationOverrides(prev => ({
                                    ...prev,
                                    [emp.id]: { ...prev[emp.id], commissionRate: val }
                                  }));
                                  handleSaveCompensationModel({ ...emp.compensationModel, commissionRate: val } as unknown as CompensationModelConfig);
                              }}
                              className="w-14 px-1.5 py-0.5 text-right bg-slate-900 text-slate-200 border border-slate-800 rounded font-mono"
                            />
                          </div>
                        </div>
                      )}

                      {emp.compensationModel.type === "PERCENTAGE" && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">{isFr ? "Part du CA direct (%)" : "Pousantaj CA (%)"} :</span>
                          <input
                            type="number"
                            value={emp.compensationModel.revenuePercentage}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setCompensationOverrides(prev => ({
                                ...prev,
                                [emp.id]: { ...prev[emp.id], revenuePercentage: val }
                              }));
                              handleSaveCompensationModel({ ...emp.compensationModel, revenuePercentage: val } as unknown as CompensationModelConfig);
                            }}
                            className="w-14 px-1.5 py-0.5 text-right bg-slate-900 text-slate-200 border border-slate-800 rounded font-mono"
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                      <span>Simulated pay:</span>
                      <strong className="text-cyan-400">{convertAmount(emp.simulatedPayrollHtg.net).toLocaleString()} {currencySymbol}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* SUB-TAB 3: PAYROLL POLICIES CONFIGURATOR */}
        {activeSubTab === "policies" && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Policies list on left */}
              <div className="lg:col-span-8 bg-slate-950 p-5 rounded-xl border border-slate-850 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                      {isFr ? "Règles & Politiques Financières de la Paie" : "Règ ak Règleman sou Salè"}
                    </h3>
                    <p className="text-[10.5px] text-slate-500 leading-relaxed mt-0.5">
                      {isFr 
                        ? "Configurez les heures théoriques de travail attendues, le temps de retard autorisé de tolérance, le taux d'heures supplémentaires, et les déductions forfaitaires."
                        : "Planifye de fason kòrèk lè travay, penalite pou reta oswa moun ki pa vini ditou."
                      }
                    </p>
                  </div>
                </div>

                <div className="space-y-3.5">
                  {effectivePayrollPolicies.map((p) => (
                    <div key={p.id} className="p-3.5 bg-slate-900/50 border border-slate-850 rounded-xl flex flex-col md:flex-row justify-between gap-4 items-start md:items-center hover:border-slate-800 transition">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-200">
                            {p.scope === "COMPANY" ? (isFr ? "Toute l'entreprise" : "Tout konpayi an") : `${p.scope} : ${p.scopeId}`}
                          </span>
                          <span className="text-[9px] bg-cyan-950 border border-cyan-800/40 text-cyan-400 px-1.5 py-0.2 rounded uppercase tracking-wider font-extrabold font-mono">
                            {p.scope}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-[10.5px] text-slate-400 font-mono">
                          <span>Hours Expected: <strong>{p.expectedHours}h</strong></span>
                          <span>Grace Period: <strong>{p.latenessToleranceMinutes} mins</strong></span>
                          <span>OT Multiplier: <strong>{p.overtimeMultiplier}x</strong></span>
                          <span>Penalty (Late/Abs): <strong className="text-rose-400">-{p.lateDeductionHtg}/-{p.absenceDeductionHtg}</strong></span>
                        </div>
                      </div>

                      {/* Edit control */}
                      <button
                        onClick={() => {
                          setEditingPolicyId(p.id);
                          setPolicyForm(p);
                        }}
                        className="px-3 py-1 text-[10.5px] font-bold text-slate-950 bg-cyan-600 hover:bg-cyan-500 rounded cursor-pointer self-end md:self-auto transition"
                      >
                        ✏ Edit
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active policy editor on right */}
              <div className="lg:col-span-4 bg-slate-950 p-5 rounded-xl border border-slate-850 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono border-b border-slate-900 pb-2 flex items-center gap-1.5">
                  <Settings className="w-3.5 h-3.5 text-cyan-400" />
                  {isFr ? "Éditeur de Politique Actif" : "Bwat Chanjman Règleman"}
                </h3>

                {editingPolicyId ? (
                  <div className="space-y-4 text-xs">
                    <div className="space-y-1">
                      <span className="text-slate-500 block">Scope ID Target :</span>
                      <span className="font-extrabold text-slate-300 text-sm font-mono block">{policyForm.scopeId}</span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-slate-400 block">{isFr ? "Heures Attendues (Quinzaine)" : "Lè Travay Planifye"} :</label>
                      <input
                        type="number"
                        value={policyForm.expectedHours || 0}
                        onChange={(e) => setPolicyForm(prev => ({ ...prev, expectedHours: parseInt(e.target.value) || 0 }))}
                        className="w-full bg-slate-900 text-slate-200 border border-slate-850 px-2 py-1.5 rounded outline-none font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-slate-400 block">{isFr ? "Période de Grâce (Minutes)" : "Minit Tolérans Reta"} :</label>
                      <input
                        type="number"
                        value={policyForm.latenessToleranceMinutes || 0}
                        onChange={(e) => setPolicyForm(prev => ({ ...prev, latenessToleranceMinutes: parseInt(e.target.value) || 0 }))}
                        className="w-full bg-slate-900 text-slate-200 border border-slate-850 px-2 py-1.5 rounded outline-none font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-slate-400 block">{isFr ? "Multiplicateur Heures Supp. (x)" : "Koefisyan Lè Siplemantè"} :</label>
                      <input
                        type="number"
                        step="0.1"
                        value={policyForm.overtimeMultiplier || 1.0}
                        onChange={(e) => setPolicyForm(prev => ({ ...prev, overtimeMultiplier: parseFloat(e.target.value) || 1.0 }))}
                        className="w-full bg-slate-900 text-slate-200 border border-slate-850 px-2 py-1.5 rounded outline-none font-mono"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-slate-400 block">{isFr ? "Pénalité Reta (HTG)" : "Penalite Reta"} :</label>
                        <input
                          type="number"
                          value={policyForm.lateDeductionHtg || 0}
                          onChange={(e) => setPolicyForm(prev => ({ ...prev, lateDeductionHtg: parseFloat(e.target.value) || 0 }))}
                          className="w-full bg-slate-900 text-slate-200 border border-slate-850 px-2 py-1.5 rounded outline-none font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-400 block">{isFr ? "Pénalité Abs. (HTG)" : "Penalite Absans"} :</label>
                        <input
                          type="number"
                          value={policyForm.absenceDeductionHtg || 0}
                          onChange={(e) => setPolicyForm(prev => ({ ...prev, absenceDeductionHtg: parseFloat(e.target.value) || 0 }))}
                          className="w-full bg-slate-900 text-slate-200 border border-slate-850 px-2 py-1.5 rounded outline-none font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => handleSavePolicy(policyForm as PayrollPolicyConfig)}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black rounded text-center cursor-pointer transition"
                      >
                        ✔ Save Changes
                      </button>
                      <button
                        onClick={() => setEditingPolicyId(null)}
                        className="px-3 py-2 border border-slate-800 text-slate-400 hover:text-slate-200 rounded cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-500">
                    <Info className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    <p className="text-xs font-bold text-slate-400">{isFr ? "Aucune sélection" : "Pa gen chanjman k ap fèt"}</p>
                    <p className="text-[10px] text-slate-500 mt-1 max-w-[180px] mx-auto">
                      {isFr ? "Double-cliquez sur l'icône Edit de la règle correspondante pour modifier sa configuration." : "Klike sou bouton 'Edit' sou bò gòch la."}
                    </p>
                  </div>
                )}
              </div>

            </div>
          </motion.div>
        )}

        {/* SUB-TAB 4: ROLE KPI CATALOG (Scalable Core) */}
        {activeSubTab === "kpis" && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="bg-slate-950 p-5 rounded-xl border border-slate-850 space-y-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                  {isFr ? "Catalogue de KPIs Métiers Standardisés" : "Katalòg KPIs Metye pou Chak Tip Travay"}
                </h3>
                <p className="text-[10.5px] text-slate-500 leading-normal">
                  {isFr 
                    ? "Définissez un catalogue étendu d'évaluation par profession. Si l'entreprise évolue vers d'autres secteurs (restaurant, clinique, bureau), ajoutez de nouveaux KPIs indépendamment de la structure du cœur de paie."
                    : "Si n ap chanje domèn biznis demen (klinik medikal, boutik, restoran), nou sèlman bezwen ajoute nouvo KPIs san touche sistèm kalkil la."
                  }
                </p>
              </div>

              {/* Grid of Roles catalog details */}
              <div className="space-y-5">
                {effectiveRoleProfiles.map((role) => (
                  <div key={role.id} className="p-4 bg-slate-900/40 border border-slate-850 rounded-xl space-y-3.5">
                    
                    {/* Header */}
                    <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                        <h4 className="text-xs font-extrabold text-slate-200 font-mono uppercase tracking-wide">
                          {role.title} ({role.id})
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">
                        {isFr ? "Total : 100 points de pondération" : "100 pwen nan total"}
                      </span>
                    </div>

                    {/* KPI Cards wrapper */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {role.kpis.map((kpi) => (
                        <div key={kpi.id} className="p-3 bg-slate-950 rounded-lg border border-slate-900 flex flex-col justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs items-start">
                              <span className="font-extrabold text-slate-200">{kpi.name}</span>
                              <span className="text-[10px] text-cyan-400 font-mono font-black">{kpi.weight}%</span>
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono block">Cible: {kpi.target}</span>
                            <p className="text-[10px] text-slate-400 font-light mt-1.5 leading-normal">{kpi.description}</p>
                          </div>

                          {/* Editable Rating Simulator Slider */}
                          <div className="pt-2 border-t border-slate-900/60 flex items-center gap-2 mt-2">
                            <span className="text-[9px] text-slate-500 font-mono uppercase">Rating:</span>
                            <input
                              type="range"
                              min="30"
                              max="100"
                              value={kpi.currentValue || 80}
                              onChange={(e) => handleSaveRoleProfile({
                                ...role,
                                kpis: role.kpis.map(k => k.id === kpi.id ? { ...k, currentValue: parseInt(e.target.value) } : k)
                              })}
                              className="flex-1 h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-cyan-500"
                            />
                            <span className="text-[10.5px] text-slate-200 font-mono font-bold">{(kpi.currentValue || 80)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>

                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* SUB-TAB 5: SCORING ENGINE WEIGHTS OVERRIDES */}
        {activeSubTab === "scoring" && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="bg-slate-950 p-5 rounded-xl border border-slate-850 space-y-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                  {isFr ? "Ajustement du Moteur de Pointage de Performance" : "Sistèm Ponderasyon Nòt Travay la"}
                </h3>
                <p className="text-[10.5px] text-slate-500 leading-normal">
                  {isFr 
                    ? "Réglez l'importance relative de chaque dimension de performance. Le moteur recalculera instantanément les scores globaux et adaptera le classement."
                    : "Sote oswa bese enpòtans chak kritè (Rive nan lè, Komisyon, KPIs Katalog). Tout nòt yo ap kalkile otomatikman nan menm dezyèm lan."
                  }
                </p>
              </div>

              {/* Adjusters panel */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-6 border-b border-slate-900">
                
                {/* Weight 1: Attendance */}
                <div className="p-4 bg-slate-900/40 border border-slate-850 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 font-mono">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      {isFr ? "Assiduité & Régularité" : "Pointage nan Lè"}
                    </span>
                    <span className="text-sm font-black text-cyan-400 font-mono">{scoringWeights.attendance}%</span>
                  </div>
                  
                  <input
                    type="range"
                    min="10"
                    max="60"
                    step="5"
                    value={scoringWeights.attendance}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      // Adjust others slightly to sum close to 100
                      setScoringWeights({
                        attendance: val,
                        financialContribution: Math.round((100 - val) * 0.55),
                        roleKpiScore: Math.round((100 - val) * 0.45)
                      });
                    }}
                    className="w-full h-1.5 bg-slate-950 rounded appearance-none cursor-pointer accent-cyan-500"
                  />
                  <p className="text-[10px] text-slate-500 font-light leading-normal">
                    {isFr ? "Poids calculé sur le taux d'assiduité du registre de pointage." : "Pwen yo baze sou si anplwaye a vini nan lè."}
                  </p>
                </div>

                {/* Weight 2: Financial Contribution */}
                <div className="p-4 bg-slate-900/40 border border-slate-850 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 font-mono">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                      {isFr ? "Recettes & Commissions" : "Komisyon ak Lajan Antre"}
                    </span>
                    <span className="text-sm font-black text-emerald-400 font-mono">{scoringWeights.financialContribution}%</span>
                  </div>
                  
                  <input
                    type="range"
                    min="10"
                    max="60"
                    step="5"
                    value={scoringWeights.financialContribution}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setScoringWeights({
                        financialContribution: val,
                        attendance: Math.round((100 - val) * 0.5),
                        roleKpiScore: Math.round((100 - val) * 0.5)
                      });
                    }}
                    className="w-full h-1.5 bg-slate-950 rounded appearance-none cursor-pointer accent-cyan-500"
                  />
                  <p className="text-[10px] text-slate-500 font-light leading-normal">
                    {isFr ? "Poids accordé au volume de commissions de services encaissées." : "Mezire lajan reyèl anplwaye a fè antre nan kès la."}
                  </p>
                </div>

                {/* Weight 3: Role KPIs */}
                <div className="p-4 bg-slate-900/40 border border-slate-850 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 font-mono">
                      <Target className="w-3.5 h-3.5 text-purple-400" />
                      {isFr ? "KPIs Spécifiques Métiers" : "KPIs Metye yo"}
                    </span>
                    <span className="text-sm font-black text-purple-400 font-mono">{scoringWeights.roleKpiScore}%</span>
                  </div>
                  
                  <input
                    type="range"
                    min="10"
                    max="60"
                    step="5"
                    value={scoringWeights.roleKpiScore}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setScoringWeights({
                        roleKpiScore: val,
                        attendance: Math.round((100 - val) * 0.5),
                        financialContribution: Math.round((100 - val) * 0.5)
                      });
                    }}
                    className="w-full h-1.5 bg-slate-950 rounded appearance-none cursor-pointer accent-cyan-500"
                  />
                  <p className="text-[10px] text-slate-500 font-light leading-normal">
                    {isFr ? "Moyenne pondérée des indicateurs du catalogue de KPIs spécifiques." : "Nòt baze sou lòt ti travay ak kalite li dwe bay."}
                  </p>
                </div>

              </div>

              {/* Live recalculated scoring impact simulator */}
              <div className="space-y-3">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block font-mono">Impact direct sur les Scores en Temps Réel</span>
                <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3">
                  {computedEmployeesData.map((e) => (
                    <div key={e.id} className="p-3 bg-slate-900/50 border border-slate-850 rounded-lg flex flex-col justify-between gap-1">
                      <div>
                        <span className="font-extrabold text-[11.5px] text-slate-200 block truncate">{e.displayName}</span>
                        <span className="text-[9px] text-slate-500 font-mono">{e.role}</span>
                      </div>
                      <div className="flex justify-between items-center border-t border-slate-950 pt-2 mt-1">
                        <span className="text-[9px] text-slate-500">Recalculated:</span>
                        <span className={`px-1 rounded font-mono font-black text-[10.5px] ${getScoreColor(e.globalScore)}`}>
                          {e.globalScore}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </motion.div>
        )}

        {/* SUB-TAB 6: AI WORKFORCE ADVISOR CO-PILOT */}
        {activeSubTab === "advisor" && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Column: Management Insights */}
              <div className="lg:col-span-7 bg-slate-950 p-5 rounded-xl border border-slate-850 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono border-b border-slate-900 pb-2.5 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                  {isFr ? "Analyses et Conseils d'Optimisation IA" : "Analiz ak Konsèy IA pou Manadjè"}
                </h3>

                <div className="space-y-3 max-h-[25rem] overflow-y-auto pr-1 no-scrollbar">
                  {automaticManagementInsights.map((insight, index) => (
                    <div 
                      key={index} 
                      className={`p-3.5 rounded-xl border text-xs space-y-2 flex flex-col justify-between ${
                        insight.type === "POLICY_VIOLATION" || insight.type === "REVENUE_ALERT"
                          ? "bg-rose-950/20 border-rose-900/40 text-rose-300"
                          : insight.type === "PROMOTION"
                          ? "bg-cyan-950/20 border-cyan-900/45 text-cyan-300"
                          : "bg-slate-900 border-slate-850 text-slate-300"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-extrabold text-xs flex items-center gap-1.5">
                          {insight.type === "POLICY_VIOLATION" && <AlertTriangle className="w-3.5 h-3.5" />}
                          {insight.type === "PROMOTION" && <Award className="w-3.5 h-3.5" />}
                          {insight.type === "OPTIMIZATION" && <CheckCircle2 className="w-3.5 h-3.5" />}
                          {insight.title}
                        </span>
                        <span className="text-[9.5px] bg-slate-950/80 px-1.5 py-0.2 rounded font-mono font-bold">
                          {insight.badge}
                        </span>
                      </div>
                      
                      <p className="text-[11px] text-slate-400 font-light leading-relaxed font-sans">{insight.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Interactive AI Query Assistant Console */}
              <div className="lg:col-span-5 bg-slate-950 p-5 rounded-xl border border-slate-850 flex flex-col justify-between gap-4">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg">
                      <Sparkles className="w-4 h-4 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-200 font-mono">
                        {isFr ? "Console AI Workforce Advisor" : "Mèt konsèy entèlijan RH"}
                      </h3>
                      <p className="text-[10px] text-slate-500 font-light">
                        {isFr ? "Posez des questions en direct sur l'équipe." : "Poze kesyon sou jan anplwaye yo ap travay."}
                      </p>
                    </div>
                  </div>

                  {/* Smart pre-filled suggestions clickable */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] text-slate-500 uppercase font-mono tracking-wider block">Suggestions de Questions :</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { text: isFr ? "Qui est le meilleur ?" : "Pi bon anplwaye", q: "Qui est le meilleur ?" },
                        { text: isFr ? "Pénalités de retard" : "Penalite reta", q: "Quelle est notre politique sur les pénalités de retard ?" },
                        { text: isFr ? "Marge & Commissions" : "Komisyon travay", q: "Quelles commissions sont les plus rentables ?" },
                        { text: isFr ? "KPIs des barbiers" : "KPIs Barbye", q: "Détaille-moi le catalogue de KPIs pour le métier de Barbier" }
                      ].map((s, i) => (
                        <button
                          key={i}
                          onClick={() => setAiCustomQuestion(s.q)}
                          className="bg-slate-900 border border-slate-850 px-2 py-1 rounded text-[10px] text-slate-400 hover:text-cyan-400 hover:border-cyan-900/50 cursor-pointer rounded-md transition"
                        >
                          {s.text}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Answer card window */}
                  <div className="bg-slate-900/60 rounded-lg border border-slate-850 p-3 min-h-[9.5rem] flex flex-col justify-between">
                    {aiAdvisorResponse ? (
                      <div className="text-xs text-slate-300 leading-relaxed font-sans space-y-2">
                        <span className="text-[9px] text-cyan-400 uppercase font-mono font-bold tracking-wider">Advisor Output :</span>
                        <p>{aiAdvisorResponse}</p>
                      </div>
                    ) : isAiLoading ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
                        <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
                        <span className="text-[10px] font-mono">IA Modeling in progress...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-10 text-center text-slate-600 text-[11px] font-light">
                        <HelpCircle className="w-7 h-7 text-slate-700 mb-1.5" />
                        <span>{isFr ? "Entrez votre question ci-dessous" : "Mwen la pou m reponn kesyon ou yo"}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Input console */}
                <form onSubmit={handleAskAiAdvisor} className="flex gap-2">
                  <input
                    type="text"
                    value={aiCustomQuestion}
                    onChange={(e) => setAiCustomQuestion(e.target.value)}
                    placeholder={isFr ? "Posez une question sur les RH..." : "Kesyon sou salè oswa anplwaye..."}
                    className="flex-1 bg-slate-900 text-xs border border-slate-850 rounded px-3 py-2 outline-none text-slate-200 focus:border-cyan-500/50"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded text-xs cursor-pointer flex items-center gap-1.5 transition"
                  >
                    <Play className="w-3 h-3 fill-slate-950" />
                    <span>Run</span>
                  </button>
                </form>
              </div>

            </div>
          </motion.div>
        )}

      </div>

      {/* EXPLANATION MODAL FOR SCORE GLOBAL */}
      {showScoreExplanationModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden text-slate-100 font-sans">
            <div className="p-5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm font-mono text-white">
                    Formule & Logique du Score Global (100 pts)
                  </h3>
                  <p className="text-xs text-slate-400 font-light mt-0.5">
                    Transparence sur le moteur d'évaluation, le filtrage des agents non travaillés et la synchronisation Firestore
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowScoreExplanationModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs text-slate-300 leading-relaxed max-h-[75vh] overflow-y-auto">
              <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-800/40 space-y-2">
                <span className="font-bold text-cyan-300 font-mono uppercase text-[10px] tracking-wider block">
                  1. Composition Pondérée du Score Global
                </span>
                <p className="text-slate-200">
                  Le Score Global est un indice synthétique sur 100 points qui reflète la contribution opérationnelle et financière réelle de chaque collaborateur :
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 text-center">
                    <span className="text-xs font-black text-cyan-400 font-mono block">40% Assiduité</span>
                    <span className="text-[10px] text-slate-400 block mt-1">Heures réelles / requises + pénalités de retards et absences.</span>
                  </div>
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 text-center">
                    <span className="text-xs font-black text-emerald-400 font-mono block">35% ROI Salarial</span>
                    <span className="text-[10px] text-slate-400 block mt-1">Ratio du CA facturé par rapport au coût de paie total de l'agent.</span>
                  </div>
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 text-center">
                    <span className="text-xs font-black text-purple-400 font-mono block">25% KPIs Métiers</span>
                    <span className="text-[10px] text-slate-400 block mt-1">Taux d'exécution des tâches opérationnelles du profil de poste.</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <span className="font-bold text-amber-300 font-mono uppercase text-[10px] tracking-wider block flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  2. Gestion des Collaborateurs Non Travaillés (0 heure)
                </span>
                <p>
                  Auparavant, inclure des agents n'ayant effectué aucune heure (0h) sur la période distordait la fiabilité du classement et faussait les pro-ratas statistiques.
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
                  <li><strong className="text-slate-200">Statut Inactif (0h) :</strong> Les agents avec 0h travaillées reçoivent le statut <span className="text-amber-400 font-mono">Inactif 0h</span> et ne polluent pas le top ranking.</li>
                  <li><strong className="text-slate-200">Filtre Excel Actifs Uniquement :</strong> Vous pouvez filtrer le tableau en un clic pour masquer les inactifs et isoler la performance brute de l'équipe opérationnelle.</li>
                </ul>
              </div>

              <div className="space-y-2">
                <span className="font-bold text-emerald-300 font-mono uppercase text-[10px] tracking-wider block">
                  3. Synchronisation Dynamique Firestore & Ratios selon les Périodes
                </span>
                <p>
                  Chaque changement de période (<strong className="text-slate-200">Quinzaine, Mois, Trimestre, Année</strong>) applique un facteur d'échelle dynamique (<span className="text-emerald-400 font-mono">0.5x, 1.0x, 3.0x, 12.0x</span>) sur la masse salariale (<strong className="text-slate-200">Payroll Total</strong>) et les heures requises.
                </p>
                <p className="text-slate-400">
                  Toutes les transactions, contrats et feuilles de présence sont synchronisés directement en temps réel avec la base de données Firestore (SSOT).
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex justify-end">
              <button
                onClick={() => setShowScoreExplanationModal(false)}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs font-mono transition cursor-pointer"
              >
                Compris & Fermer
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
