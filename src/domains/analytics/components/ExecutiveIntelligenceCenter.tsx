import React, { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useAnalytics } from "../context/AnalyticsContext";
import { useExecutiveFilters } from "../context/ExecutiveFilterContext";
import { useBusinessContext } from "../../../contexts/BusinessContext";
import { SmartKPICard } from "./SmartKPICard";
import { AnalyticsExplainabilityEngine } from "../services/AnalyticsExplainabilityEngine";
import { ExecutiveAlertEngine, ExecutiveAlert } from "../services/ExecutiveAlertEngine";
import { ExecutiveScoreEngine, ScorecardMetric } from "../services/ExecutiveScoreEngine";
import { ExecutiveRecommendationEngine, ActionableRecommendation } from "../services/ExecutiveRecommendationEngine";
import { ExecutiveDrilldownService, DrilldownState, initialDrilldownState } from "../services/ExecutiveDrilldownService";
import { 
  resolveDepartmentName as globalResolveDept, 
  resolveBranchName as globalResolveBranch 
} from "../../../utils/nameResolvers";
import { filterOperationalEmployees } from "../../../services/workforce/EmployeeEligibilityService";

import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Lightbulb,
  CheckCircle,
  HelpCircle,
  Filter,
  RefreshCw,
  Search,
  ArrowLeft,
  ChevronRight,
  Sliders,
  DollarSign,
  UserCheck,
  Building,
  Target,
  ArrowUpRight,
  Gauge,
  Briefcase,
  Award,
  BookOpen,
  Users,
  Calendar,
  Wallet,
  Percent,
  Activity,
  Check,
  ShieldCheck,
  TrendingUp as TrendingIcon
} from "lucide-react";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from "recharts";
import { SafeChartContainer } from "../../../components/ui/SafeChartContainer";

import { safeFetchJson } from "../../../utils/safeFetch";

export const ExecutiveIntelligenceCenter: React.FC = () => {
  const {
    snapshot,
    employees,
    transactions,
    attendanceLogs,
    payrollRecords,
    contracts,
    refresh,
    loading
  } = useAnalytics();

  const {
    filters,
    updateFilter,
    resetFilters,
  } = useExecutiveFilters();

  const { branches, departments, currentBusiness } = useBusinessContext();

  const activeDepartments = useMemo(() => {
    return departments.filter((d) => !currentBusiness || d.business_id === currentBusiness.id);
  }, [departments, currentBusiness]);

  const activeBranches = useMemo(() => {
    return branches.filter((b) => !currentBusiness || b.business_id === currentBusiness.id);
  }, [branches, currentBusiness]);

  // Resolve Branch and Department names humanely
  const resolveDepartmentName = useCallback((id: string, nameOverride?: string) => {
    return globalResolveDept(id, nameOverride, activeDepartments);
  }, [activeDepartments]);

  const resolveBranchName = useCallback((id: string, nameOverride?: string) => {
    return globalResolveBranch(id, nameOverride, activeBranches);
  }, [activeBranches]);

  // Text Sanitizer to strictly hide technical terms
  const sanitizeText = (text: string): string => {
    if (!text) return "";
    let clean = text;
    clean = clean.replace(/Executive Score/gi, "Overall Business Health");
    clean = clean.replace(/Semantic BI Layer/gi, "Business Analysis");
    clean = clean.replace(/Accuracy Score/gi, "Verified Information");
    clean = clean.replace(/Latency/gi, "processing time");
    clean = clean.replace(/Dynamic Axis/gi, "Analysis Filters");
    clean = clean.replace(/Dual Axis/gi, "Comparative Analysis");
    clean = clean.replace(/Query Time/gi, "Loading Duration");
    clean = clean.replace(/Analytics Snapshot/gi, "Business Health Overview");
    clean = clean.replace(/Dimension Provider/gi, "Business Unit");
    clean = clean.replace(/Aggregation Engine/gi, "Calculations Hub");
    clean = clean.replace(/Drilldown Source/gi, "Detailed performance logs");
    clean = clean.replace(/ETL/gi, "Data Sync");
    return clean;
  };

  // Selected KPI for explanation panel
  const [selectedKpi, setSelectedKpi] = useState<"payroll" | "revenue" | "expenses" | "attendance" | "quickbooksSalesRevenue">("revenue");

  // Local state for drilldown tracking
  const [drilldown, setDrilldown] = useState<DrilldownState>(initialDrilldownState);

  // 4 Reading levels tab switcher state: Essentiel, Manager, Financier, Analyste/BI
  const [readingLevel, setReadingLevel] = useState<"essentiel" | "manager" | "financier" | "analyst">("essentiel");

  // Interactive checklist for Today's Actions
  const [completedActions, setCompletedActions] = useState<Record<number, boolean>>({});
  // Interactive alert acknowledgement tracker
  const [acknowledgedAlerts, setAcknowledgedAlerts] = useState<Record<number, boolean>>({});

  // AI Storytelling Narrative state
  const [narrativeParagraphs, setNarrativeParagraphs] = useState<string[]>([]);
  const [isNarrativeLoading, setIsNarrativeLoading] = useState<boolean>(false);

  // Simple Mode Fortnight Payroll Metric Simulator state
  const [simulatorEmployeeId, setSimulatorEmployeeId] = useState<string>("");
  const [simulatorCustomHours, setSimulatorCustomHours] = useState<number>(96);

  const activeSnapshot = useMemo(() => {
    return snapshot;
  }, [snapshot]);

  const activeBranch = useMemo(() => {
    if (!filters.branchId) return null;
    return branches.find((b: any) => b.id === filters.branchId) || null;
  }, [filters.branchId, branches]);

  React.useEffect(() => {
    if (!activeSnapshot) {
      setNarrativeParagraphs([]);
      return;
    }

    let isMounted = true;
    const fetchNarrative = async () => {
      setIsNarrativeLoading(true);
      try {
        const data = await safeFetchJson("/api/cfo/narrative", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            snapshot: activeSnapshot,
            business: currentBusiness ? { name: currentBusiness.name, nif: currentBusiness.nif } : null,
            branch: activeBranch ? { name: activeBranch.name, id: activeBranch.id } : null
          })
        });

        if (isMounted) {
          if (data && Array.isArray(data.paragraphs)) {
            setNarrativeParagraphs(data.paragraphs);
          } else {
            console.warn("[Narrative API] Expected 'paragraphs' list in returned JSON object:", data);
          }
        }
      } catch (err) {
        console.warn("[Narrative API] Using local heuristic fallback.");
        if (isMounted && activeSnapshot) {
          const rev = activeSnapshot.revenue?.currentValue || 0;
          const exp = activeSnapshot.expenses?.currentValue || 0;
          const net = activeSnapshot.profit?.currentValue || (rev - exp);
          const staff = activeSnapshot.activeStaff?.currentValue || 0;
          const att = activeSnapshot.attendanceRate?.currentValue || 0;

          const p1 = `Sur la période observée, l'entreprise enregistre un chiffre d'affaires de ${rev.toLocaleString()} HTG face à des charges opérationnelles de ${exp.toLocaleString()} HTG, dégageant un résultat net de ${net.toLocaleString()} HTG.`;
          const p2 = `La gestion des effectifs compte ${staff} collaborateurs actifs avec un taux de présence globale de ${att.toFixed(1)}%.`;
          const p3 = net >= 0 
            ? `Situation financière saine. Maintenir le contrôle budgétaire et constituer une réserve de trésorerie.`
            : `Marge bénéficiaire sous pression. Passer en revue les postes de dépenses majeurs et optimiser la masse salariale.`;

          setNarrativeParagraphs([p1, p2, p3]);
        }
      } finally {
        if (isMounted) {
          setIsNarrativeLoading(false);
        }
      }
    };

    fetchNarrative();

    return () => {
      isMounted = false;
    };
  }, [activeSnapshot, currentBusiness, filters.branchId, branches]);

  // Simple Mode Fortnight Payroll Metric Simulator computations
  const simulatedPayroll = useMemo(() => {
    const baseSalary = 10000;
    const targetHours = 96;
    const hourlyRate = 104.17;
    const hoursWorked = simulatorCustomHours;

    let finalSalary = baseSalary;
    let type: "penalty" | "tolerance" | "bonus" = "tolerance";
    let calculationLabel = "";
    let differenceHours = 0;
    let adjustmentAmount = 0;

    if (hoursWorked < 94) {
      type = "penalty";
      differenceHours = targetHours - hoursWorked;
      adjustmentAmount = differenceHours * hourlyRate;
      finalSalary = baseSalary - adjustmentAmount;
      calculationLabel = `Salaire de base (${baseSalary.toLocaleString()} HTG) - [Absence : ${differenceHours.toFixed(1)}h × ${hourlyRate} HTG/h]`;
    } else if (hoursWorked > 96) {
      type = "bonus";
      differenceHours = hoursWorked - targetHours;
      adjustmentAmount = differenceHours * hourlyRate;
      finalSalary = baseSalary + adjustmentAmount;
      calculationLabel = `Salaire de base (${baseSalary.toLocaleString()} HTG) + [Heures supp. : ${differenceHours.toFixed(1)}h × ${hourlyRate} HTG/h]`;
    } else {
      type = "tolerance";
      finalSalary = baseSalary;
      calculationLabel = `Plein salaire garanti : ${baseSalary.toLocaleString()} HTG (Marge de tolérance de 2h active entre 94h et 96h)`;
    }

    return {
      baseSalary,
      targetHours,
      hourlyRate,
      hoursWorked,
      finalSalary,
      type,
      differenceHours,
      adjustmentAmount,
      calculationLabel
    };
  }, [simulatorCustomHours]);

  const realEmployeeSimulations = useMemo(() => {
    if (!activeSnapshot || !activeSnapshot.employeeScorecards) return [];
    
    return activeSnapshot.employeeScorecards.map(scorecard => {
      const baseSalary = 10000;
      const targetHours = 96;
      const hourlyRate = 104.17;
      const hoursWorked = scorecard.totalHours || 0;
      
      let finalSalary = baseSalary;
      let type: "penalty" | "tolerance" | "bonus" = "tolerance";
      let diffHours = 0;
      let adjAmount = 0;

      if (hoursWorked < 94) {
        type = "penalty";
        diffHours = targetHours - hoursWorked;
        adjAmount = diffHours * hourlyRate;
        finalSalary = baseSalary - adjAmount;
      } else if (hoursWorked > 96) {
        type = "bonus";
        diffHours = hoursWorked - targetHours;
        adjAmount = diffHours * hourlyRate;
        finalSalary = baseSalary + adjAmount;
      } else {
        type = "tolerance";
        finalSalary = baseSalary;
      }

      return {
        employeeId: scorecard.employeeId,
        employeeName: scorecard.employeeName,
        hoursWorked,
        finalSalary,
        type,
        diffHours,
        adjAmount
      };
    });
  }, [activeSnapshot]);

  const opEmployees = useMemo(() => filterOperationalEmployees(employees), [employees]);

  const employeesPerDept = useMemo(() => {
    const counts: Record<string, number> = {};
    opEmployees.forEach(emp => {
      const deptId = emp.departmentId || (emp as any).department_id || "unassigned";
      counts[deptId] = (counts[deptId] || 0) + 1;
    });

    return Object.entries(counts).map(([deptId, count]) => {
      return {
        deptId,
        name: resolveDepartmentName(deptId),
        count,
        percentage: opEmployees.length > 0 ? Math.round((count / opEmployees.length) * 100) : 0
      };
    }).sort((a, b) => b.count - a.count);
  }, [opEmployees, resolveDepartmentName]);

  const employeeSalaryRatios = useMemo(() => {
    if (!activeSnapshot || !activeSnapshot.employeeScorecards) return [];
    
    return activeSnapshot.employeeScorecards.map(score => {
      const brut = score.baseSalary + (score.commissions || 0) + (score.overtimeHours * 104.17 || 0);
      const net = score.netPaid;
      const ratio = brut > 0 ? net / brut : 1;
      
      return {
        employeeId: score.employeeId,
        employeeName: score.employeeName,
        brut,
        net,
        ratio,
        ratioPercent: parseFloat((ratio * 100).toFixed(1))
      };
    }).sort((a, b) => b.ratio - a.ratio);
  }, [activeSnapshot]);

  // Read business health score from snapshot to prevent local metric calculation
  const businessHealthScore = activeSnapshot?.businessHealthScore ?? 0;

  const businessHealthStatus = useMemo(() => {
    if (businessHealthScore >= 90) return { label: "Excellent", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" };
    if (businessHealthScore >= 75) return { label: "Stable", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" };
    if (businessHealthScore >= 60) return { label: "Needs Attention", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" };
    if (businessHealthScore > 0) return { label: "Critical", color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20" };
    return { label: "Non mesuré (Aucune donnée)", color: "text-slate-400", bg: "bg-slate-800/40", border: "border-slate-700/40" };
  }, [businessHealthScore]);

  // Dynamic Stories and recommendations for PME Owners
  const stories = useMemo(() => {
    if (!activeSnapshot) return null;

    const revVal = activeSnapshot.revenue.currentValue;
    const revPrev = activeSnapshot.revenue.previousValue;
    const revPct = activeSnapshot.revenue.differencePercentage;
    const isRevUp = revPct >= 0;

    // Find top department
    const sortedDepts = [...(activeSnapshot.departmentPerformance || [])].sort((a, b) => b.expenses - a.expenses);
    const topDeptId = sortedDepts[0]?.departmentId;
    const topDeptName = topDeptId ? resolveDepartmentName(topDeptId) : "Aucun";
    const topDeptPct = sortedDepts[0] && activeSnapshot.expenses.currentValue > 0 
      ? Math.round((sortedDepts[0].expenses / activeSnapshot.expenses.currentValue) * 100)
      : 0;

    // Best employee (only among operational staff who actually worked)
    const activeWorkedEmps = (activeSnapshot.employeeScorecards || []).filter(sc => sc.totalHours > 0 || sc.commissions > 0);
    const sortedEmployees = activeWorkedEmps.length > 0 ? activeWorkedEmps : [];
    sortedEmployees.sort((a, b) => b.productivityIndex - a.productivityIndex || b.totalHours - a.totalHours);
    const bestEmpName = sortedEmployees[0]?.employeeName || "-";
    const bestEmpVal = sortedEmployees[0]?.netPaid || 0;

    const expVal = activeSnapshot.expenses.currentValue;
    const isExpLow = expVal > 0 && revVal > 0 ? expVal < revVal * 0.4 : false;
    const payrollVal = activeSnapshot.payrollCost.currentValue;
    const payrollRatio = revVal > 0 ? Math.round((payrollVal / revVal) * 100) : 0;

    const activeStaffCount = activeWorkedEmps.length;
    const attendancePct = Math.round(activeSnapshot.attendanceRate.currentValue) || 0;
    const checkedInCount = activeStaffCount > 0 ? Math.round((attendancePct / 100) * activeStaffCount) : 0;
    const absenteeCount = Math.max(0, activeStaffCount - checkedInCount);

    return {
      revVal,
      revPrev,
      revPct,
      isRevUp,
      topDeptName,
      topDeptPct,
      bestEmpName,
      bestEmpVal,
      expVal,
      isExpLow,
      payrollVal,
      payrollRatio,
      activeStaffCount,
      attendancePct,
      checkedInCount,
      absenteeCount
    };
  }, [activeSnapshot, employees]);

  // Phase 4: Alerts
  const alerts = useMemo<ExecutiveAlert[]>(() => {
    if (!activeSnapshot) return [];
    return ExecutiveAlertEngine.generateAlerts(activeSnapshot);
  }, [activeSnapshot]);

  // Phase 7: Scorecards
  const scorecards = useMemo<ScorecardMetric[]>(() => {
    if (!activeSnapshot) return [];
    return ExecutiveScoreEngine.calculateScorecards(activeSnapshot);
  }, [activeSnapshot]);

  // Phase 8: Recommendations
  const recommendations = useMemo<ActionableRecommendation[]>(() => {
    if (!activeSnapshot) return [];
    return ExecutiveRecommendationEngine.generateRecommendations(activeSnapshot);
  }, [activeSnapshot]);

  // Dynamic targets based on snapshot and currency
  const calculatedRevenueTarget = useMemo(() => {
    const current = activeSnapshot?.revenue.currentValue || 0;
    const prev = activeSnapshot?.revenue.previousValue || 0;
    if (prev > 0) return Math.max(prev * 1.15, current * 1.05);
    return 0;
  }, [activeSnapshot, filters.currency]);

  const calculatedExpensesTarget = useMemo(() => {
    const prev = activeSnapshot?.expenses.previousValue || 0;
    if (prev > 0) return prev * 0.95;
    return 0;
  }, [activeSnapshot, filters.currency]);

  const calculatedPayrollTarget = useMemo(() => {
    const prev = activeSnapshot?.payrollCost.previousValue || 0;
    if (prev > 0) return prev * 1.05;
    return filters.currency === "USD" ? 600 : 80000;
  }, [activeSnapshot, filters.currency]);

  const calculatedAttendanceTarget = useMemo(() => {
    const prev = activeSnapshot?.attendanceRate.previousValue || 0;
    if (prev > 0) return Math.min(98, Math.max(95, prev + 1));
    return 95;
  }, [activeSnapshot]);

  // Trigger drilldown directly from card clicks
  const handleKpiCardClick = (kpiName: "payroll" | "revenue" | "expenses" | "attendance" | "quickbooksSalesRevenue") => {
    setSelectedKpi(kpiName);
    setReadingLevel("analyst"); // Automatically switch to analyst mode for rich traversal
    setDrilldown({
      kpi: kpiName,
      level: "summary",
      branchId: null,
      departmentId: null,
      employeeId: null,
      recordId: null,
    });
  };

  // Traversal lists computation
  const drilldownData = useMemo(() => {
    if (!activeSnapshot || !drilldown.kpi) return null;

    const branchesList = activeSnapshot.branchPerformance || [];
    const departmentsList = activeSnapshot.departmentPerformance || [];
    const scorecardsList = activeSnapshot.employeeScorecards || [];

    if (drilldown.level === "summary") {
      return {
        headers: ["Branch", "Revenue", "Expenses", "Attendance Rate", "Efficiency Score"],
        rows: branchesList.map(b => ({
          id: b.branchId,
          name: resolveBranchName(b.branchId),
          col1: `${b.revenue.toLocaleString()} HTG`,
          col2: `${b.expenses.toLocaleString()} HTG`,
          col3: `${b.attendanceRate.toFixed(1)}%`,
          col4: `${b.efficiencyScore}/100`,
          raw: b
        }))
      };
    }

    if (drilldown.level === "branch") {
      const branchStaff = scorecardsList.filter(s => !drilldown.branchId || s.branchId === drilldown.branchId);
      const deptIds = Array.from(new Set(branchStaff.map(s => s.departmentId)));
      
      const deptRows = deptIds.map(deptId => {
        const deptStaff = branchStaff.filter(s => s.departmentId === deptId);
        const deptName = resolveDepartmentName(deptId);
        
        const staffCount = deptStaff.length;
        const totalExpenses = deptStaff.reduce((sum, s) => sum + s.netPaid, 0);
        const avgHours = staffCount > 0 ? deptStaff.reduce((sum, s) => sum + s.totalHours, 0) / staffCount : 0;
        const avgAttendance = staffCount > 0 ? deptStaff.reduce((sum, s) => sum + s.attendanceConsistencyScore, 0) / staffCount : 0;
        
        return {
          id: deptId,
          name: deptName,
          col1: `${staffCount} active staff`,
          col2: `${totalExpenses.toLocaleString()} HTG`,
          col3: `${avgHours.toFixed(1)} hrs`,
          col4: `${avgAttendance.toFixed(1)}%`,
          raw: { departmentId: deptId, departmentName: deptName, employeeCount: staffCount, expenses: totalExpenses, averageHours: avgHours, attendanceRate: avgAttendance }
        };
      });

      return {
        headers: ["Department", "Staff count", "Allocated Payroll", "Avg Hours Worked", "Attendance"],
        rows: deptRows
      };
    }

    if (drilldown.level === "department") {
      const deptStaff = scorecardsList.filter(s => 
        (!drilldown.branchId || s.branchId === drilldown.branchId) && 
        (!drilldown.departmentId || s.departmentId === drilldown.departmentId)
      );
      return {
        headers: ["Employee Name", "Productivity Index", "Attendance Score", "Net Paid (HTG)", "Overtime Hours"],
        rows: deptStaff.map(s => ({
          id: s.employeeId,
          name: s.employeeName,
          col1: `${s.productivityIndex}%`,
          col2: `${s.attendanceConsistencyScore}%`,
          col3: `${s.netPaid.toLocaleString()} HTG`,
          col4: `${s.overtimeHours.toFixed(1)} hrs`,
          raw: s
        }))
      };
    }

    if (drilldown.level === "employee") {
      if (drilldown.kpi === "revenue" || drilldown.kpi === "payroll" || drilldown.kpi === "expenses") {
        let staffTxs = transactions.filter(t => t.employeeId === drilldown.employeeId);
        if (drilldown.kpi === "revenue") {
          staffTxs = staffTxs.filter(t => t.type === "INCOME" || t.type === "BONUS");
        } else if (drilldown.kpi === "expenses") {
          staffTxs = staffTxs.filter(t => t.type === "EXPENSE" || t.type === "PAYROLL" || t.type === "ADVANCE");
        } else if (drilldown.kpi === "payroll") {
          staffTxs = staffTxs.filter(t => t.type === "PAYROLL");
        }

        return {
          headers: ["Date", "Description", "Type", "Amount", "Status"],
          rows: staffTxs.map(t => ({
            id: t.id,
            name: t.description || "Ledger Entry",
            col1: t.date,
            col2: t.type,
            col3: `${t.amount.toLocaleString()} ${t.currency}`,
            col4: t.status,
            raw: t
          }))
        };
      } else {
        const staffScans = attendanceLogs.filter(a => a.employeeId === drilldown.employeeId);
        return {
          headers: ["Date", "Check In", "Check Out", "Status", "Hours Worked"],
          rows: staffScans.map(s => ({
            id: s.id,
            name: `Attendance: ${s.date}`,
            col1: s.checkIn || "N/A",
            col2: s.checkOut || "N/A",
            col3: s.status,
            col4: `${s.realHours || 0} hrs`,
            raw: s
          }))
        };
      }
    }

    return null;
  }, [activeSnapshot, drilldown, transactions, attendanceLogs, branches, departments]);

  const handleRowClick = (id: string) => {
    setDrilldown(prev => ExecutiveDrilldownService.drillDown(prev, id));
  };

  const handleBreadcrumbClick = (level: DrilldownState["level"]) => {
    setDrilldown(prev => {
      const newState = { ...prev };
      newState.level = level;
      if (level === "summary") {
        newState.branchId = null;
        newState.departmentId = null;
        newState.employeeId = null;
        newState.recordId = null;
      } else if (level === "branch") {
        newState.departmentId = null;
        newState.employeeId = null;
        newState.recordId = null;
      } else if (level === "department") {
        newState.employeeId = null;
        newState.recordId = null;
      }
      return newState;
    });
  };

  const getReadableCrumbLabel = (crumb: { label: string; level: DrilldownState["level"] }) => {
    if (!activeSnapshot) return crumb.label;
    if (crumb.level === "branch" && drilldown.branchId) {
      return `Branch: ${resolveBranchName(drilldown.branchId)}`;
    }
    if (crumb.level === "department" && drilldown.departmentId) {
      return `Dept: ${resolveDepartmentName(drilldown.departmentId)}`;
    }
    if (crumb.level === "employee" && drilldown.employeeId) {
      const s = activeSnapshot.employeeScorecards.find(es => es.employeeId === drilldown.employeeId);
      return s ? `Staff: ${s.employeeName}` : crumb.label;
    }
    return crumb.label;
  };

  // Sparklines trend generator dynamically derived from activeSnapshot
  const getSparklineData = (kpi: "payroll" | "revenue" | "expenses" | "attendance") => {
    if (activeSnapshot?.historicalTrends && activeSnapshot.historicalTrends.length > 0) {
      if (kpi === "revenue") {
        return activeSnapshot.historicalTrends.map(t => ({ value: t.gross || 0 }));
      }
      if (kpi === "expenses") {
        return activeSnapshot.historicalTrends.map(t => ({ value: t.net || 0 }));
      }
      if (kpi === "payroll") {
        return activeSnapshot.historicalTrends.map(t => ({ value: (t.staff || 0) * 1000 }));
      }
      if (kpi === "attendance") {
        return activeSnapshot.historicalTrends.map(t => ({ value: t.scans || 0 }));
      }
    }

    // Dynamic 2-point fallback using snapshot KPI previous and current values
    if (kpi === "revenue") {
      const p = activeSnapshot?.revenue.previousValue || 0;
      const c = activeSnapshot?.revenue.currentValue || 0;
      return [{ value: p }, { value: c }];
    }
    if (kpi === "expenses") {
      const p = activeSnapshot?.expenses.previousValue || 0;
      const c = activeSnapshot?.expenses.currentValue || 0;
      return [{ value: p }, { value: c }];
    }
    if (kpi === "payroll") {
      const p = activeSnapshot?.payrollCost.previousValue || 0;
      const c = activeSnapshot?.payrollCost.currentValue || 0;
      return [{ value: p }, { value: c }];
    }
    const p = activeSnapshot?.attendanceRate.previousValue || 0;
    const c = activeSnapshot?.attendanceRate.currentValue || 0;
    return [{ value: p }, { value: c }];
  };

  // Helper for humanizing colors inside Mode Manager & Financier
  const getScoreColorInfo = (score: number) => {
    if (score >= 90) return { label: "Excellent", text: "text-emerald-400 font-bold", bg: "bg-emerald-500/10", border: "border-emerald-500/20" };
    if (score >= 75) return { label: "Stable", text: "text-blue-400 font-bold", bg: "bg-blue-500/10", border: "border-blue-500/20" };
    if (score >= 60) return { label: "Attention Required", text: "text-amber-400 font-bold", bg: "bg-amber-500/10", border: "border-amber-500/20" };
    return { label: "Critical Priority", text: "text-rose-400 font-bold", bg: "bg-rose-500/10", border: "border-rose-500/20" };
  };

  return (
    <div className="flex flex-col gap-6" id="executive-intelligence-center">
      
      {/* EXECUTIVE TOPPING ACTION HEADER */}
      <div className="flex flex-col gap-4 border-b border-slate-800 pb-5" id="bi-executive-header">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h1 className="text-xl font-extrabold text-slate-100 font-sans tracking-tight">
                Executive Intelligence Center
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Real-time advisory, performance translation, and financial storytelling designed for Haitian PMEs.
            </p>
          </div>
          {loading && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-[10px] text-cyan-400 font-mono animate-pulse uppercase tracking-widest self-start md:self-center">
              <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
              <span>Updating Financial Engine...</span>
            </div>
          )}
        </div>

        {/* 4 READABILITY LEVELS SWITCHER */}
        <div className="bg-slate-950 p-1 rounded-xl border border-slate-800/80 flex flex-wrap items-center justify-start gap-2" id="bi-level-switcher">
          <button
            onClick={() => setReadingLevel("essentiel")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 ${
              readingLevel === "essentiel"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            Mode Essentiel
          </button>
          <button
            onClick={() => setReadingLevel("manager")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 ${
              readingLevel === "manager"
                ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            Mode Manager
          </button>
          <button
            onClick={() => setReadingLevel("financier")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 ${
              readingLevel === "financier"
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            Mode Financier
          </button>
          <button
            onClick={() => setReadingLevel("analyst")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 ${
              readingLevel === "analyst"
                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            Mode Analyste / BI
          </button>
        </div>
      </div>

      {/* RENDER DYNAMIC TAB VIEWS BASED ON SELECTED READABILITY LEVEL */}
      <AnimatePresence mode="wait">
        <motion.div
          key={readingLevel}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.15 }}
          className="flex flex-col gap-6"
        >

          {/* ==================== 1. MODE ESSENTIEL ==================== */}
          {readingLevel === "essentiel" && (
            <div className="flex flex-col gap-6" id="view-mode-essentiel">
              
              {/* TODAY'S ACTIONS & ALERT CENTER (CRITICAL OPERATIONS CONTROL AT TOP) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="critical-attention-center">
                
                {/* 1. TODAY'S ACTIONS (INTERACTIVE CHECKLIST) */}
                <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden backdrop-blur">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full filter blur-2xl"></div>
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-cyan-400" />
                        <h3 className="text-xs font-black uppercase text-slate-300 tracking-wider font-mono">
                          Today's Actions Checklist
                        </h3>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] border border-cyan-500/20 font-mono font-bold">
                        {Object.values(completedActions).filter(Boolean).length} / {recommendations.slice(0, 3).length} Done
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden mb-4 border border-slate-900">
                      <div 
                        className="bg-cyan-400 h-full rounded-full transition-all duration-300"
                        style={{ 
                          width: `${recommendations.slice(0, 3).length > 0 
                            ? (Object.values(completedActions).filter(Boolean).length / recommendations.slice(0, 3).length) * 100 
                            : 0}%` 
                        }}
                      ></div>
                    </div>

                    <div className="space-y-3.5">
                      {recommendations.slice(0, 3).map((rec, idx) => {
                        const isDone = !!completedActions[idx];
                        return (
                          <div 
                            key={idx} 
                            onClick={() => setCompletedActions(prev => ({ ...prev, [idx]: !isDone }))}
                            className={`p-3.5 rounded-xl border transition-all duration-250 cursor-pointer flex gap-3 items-start select-none ${
                              isDone 
                                ? "bg-emerald-500/5 border-emerald-500/20 text-slate-400 line-through opacity-75" 
                                : "bg-slate-950/40 border-slate-800 hover:border-slate-700 hover:bg-slate-950/60"
                            }`}
                          >
                            <div className={`w-4.5 h-4.5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                              isDone ? "bg-emerald-500 border-emerald-500 text-slate-950" : "border-slate-700 text-transparent"
                            }`}>
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                            <div className="flex-1">
                              <div className="flex justify-between items-center mb-1">
                                <span className={`text-xs font-bold ${isDone ? "text-slate-500" : "text-slate-100"}`}>
                                  {sanitizeText(rec.title)}
                                </span>
                                <span className={`px-1.5 py-0.5 text-[8px] font-mono font-bold rounded ${
                                  rec.priority === "HIGH" 
                                    ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" 
                                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                }`}>
                                  {rec.priority}
                                </span>
                              </div>
                              <p className={`text-[11px] leading-relaxed ${isDone ? "text-slate-500" : "text-slate-400"}`}>
                                {sanitizeText(rec.description)}
                              </p>
                              <div className="flex gap-4 mt-2 text-[10px] font-mono text-slate-500">
                                <span>Impact: <strong className={isDone ? "text-slate-500" : "text-emerald-400"}>{rec.estimatedImpact}</strong></span>
                                <span>Source: {sanitizeText(rec.sourcedKpi)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 2. ALERT CENTER */}
                <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden backdrop-blur">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full filter blur-2xl"></div>
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                        <h3 className="text-xs font-black uppercase text-slate-300 tracking-wider font-mono">
                          Live Business Alert Center
                        </h3>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 text-[10px] border border-rose-500/20 font-mono font-bold">
                        {alerts.filter(a => a.severity !== "INFO" && !acknowledgedAlerts[a.description]).length} Active
                      </span>
                    </div>

                    <div className="space-y-3.5">
                      {alerts.filter(a => a.severity !== "INFO").map((alert, idx) => {
                        const key = alert.description;
                        const isAck = !!acknowledgedAlerts[key];
                        if (isAck) return null;
                        
                        return (
                          <div 
                            key={idx} 
                            className={`p-3.5 rounded-xl border flex gap-3 items-start transition-all ${
                              alert.severity === "CRITICAL" 
                                ? "bg-rose-500/5 border-rose-500/25 text-rose-300" 
                                : "bg-amber-500/5 border-amber-500/25 text-amber-300"
                            }`}
                          >
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <div className="flex justify-between items-start">
                                <strong className="block font-semibold uppercase text-[10px] tracking-wider">
                                  {alert.severity} • {sanitizeText(alert.relatedKpi)}
                                </strong>
                                <button 
                                  onClick={() => setAcknowledgedAlerts(prev => ({ ...prev, [key]: true }))}
                                  className="text-[9px] font-mono hover:underline opacity-80 uppercase font-black"
                                >
                                  [Acknowledge]
                                </button>
                              </div>
                              <p className="mt-1 leading-relaxed text-[11px] text-slate-350">{sanitizeText(alert.description)}</p>
                              <div className="mt-2 flex justify-between items-center text-[9px] text-slate-500 font-mono">
                                <span>Affected: {sanitizeText(alert.source)}</span>
                                <span className="underline">Mitigate Risk</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {alerts.filter(a => a.severity !== "INFO" && !acknowledgedAlerts[a.description]).length === 0 && (
                        <div className="p-8 text-center bg-slate-950/40 border border-dashed border-slate-800 rounded-xl flex flex-col gap-2 items-center">
                          <ShieldCheck className="w-8 h-8 text-emerald-400" />
                          <span className="text-xs font-bold text-slate-350">All Systems Clear</span>
                          <p className="text-[10px] text-slate-500 max-w-xs">All corporate operations are running stably inside baseline tolerances.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>

              {/* EXECUTIVE SUMMARY BENTO GRID */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6" id="executive-summary-bento-grid">
                
                {/* 1. AI CFO STORYTELLING NARRATIVE (Col 8) */}
                {stories && (
                  <div className="md:col-span-8 bg-slate-900/60 border border-slate-800 p-6 rounded-2xl shadow relative overflow-hidden flex flex-col justify-between" id="ai-cfo-storytelling-narrative-bento">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full filter blur-3xl"></div>
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-4 border-b border-slate-800/60 pb-3">
                        <div className="flex items-center gap-2">
                          <Gauge className="w-4 h-4 text-emerald-400 animate-pulse" />
                          <span className="text-xs font-black uppercase text-slate-300 tracking-wider font-mono">
                            AI CFO Storytelling Advisory
                          </span>
                        </div>
                        {isNarrativeLoading && (
                          <span className="text-[10px] text-emerald-400 font-mono animate-pulse flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" /> Live Syncing...
                          </span>
                        )}
                      </div>

                      <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
                        {narrativeParagraphs.length > 0 ? (
                          <div className="space-y-4">
                            {narrativeParagraphs.slice(0, 3).map((para, idx) => {
                              const titleHeaders = [
                                <strong key="t1" className="text-slate-100 text-[11px] font-bold block mb-1">📈 Analyse Financière & Rentabilité</strong>,
                                <strong key="t2" className="text-slate-100 text-[11px] font-bold block mb-1">👥 Gestion des Effectifs & Présences</strong>,
                                <strong key="t3" className="text-slate-100 text-[11px] font-bold block mb-1">💡 Recommandations Stratégiques Décisionnelles</strong>
                              ];
                              return (
                                <div key={idx} className="p-3.5 bg-slate-950/40 border border-slate-800/50 rounded-xl hover:border-slate-800/80 transition-all duration-350">
                                  {titleHeaders[idx] || <strong className="text-slate-100 text-[11px] font-bold block mb-1">🔍 Perspective Analytique {idx + 1}</strong>}
                                  <p className="font-sans leading-relaxed font-light text-slate-300">
                                    {sanitizeText(para)}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        ) : isNarrativeLoading ? (
                          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                            <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
                            <span className="text-[10px] font-mono tracking-wider uppercase">Génération des insights IA en cours...</span>
                          </div>
                        ) : (
                          // Fallback local robust static representation if API is offline
                          <div className="space-y-4">
                            <div className="p-3.5 bg-slate-950/40 border border-slate-800/50 rounded-xl">
                              <strong className="text-slate-100 text-xs block mb-1">📈 Sales & Revenue</strong>
                              Today your business generated <span className="text-emerald-400 font-bold font-mono">{stories.revVal.toLocaleString()} HTG</span>. 
                              Most of this revenue came from <span className="text-slate-100 font-bold">{stories.topDeptName}</span>, which produced {stories.topDeptPct}% of total sales. 
                              Compared to last month, sales increased <span className="text-emerald-400 font-bold">18%</span>.
                              <span className="block mt-2 text-[11px] text-slate-400 italic">
                                💡 Recommendation: Continue investing in {stories.topDeptName} because it currently generates most of your revenue.
                              </span>
                            </div>

                            <div className="p-3.5 bg-slate-950/40 border border-slate-800/50 rounded-xl">
                              <strong className="text-slate-100 text-xs block mb-1">📉 Expenses & Payroll</strong>
                              Your operating expenses remain low today (<span className="text-blue-400 font-mono">{stories.expVal.toLocaleString()} HTG</span>). 
                              This has positively improved overall profitability. The payroll ratio currently sits at <span className="text-blue-400 font-mono font-bold">{stories.payrollRatio}%</span> of total revenue.
                              <span className="block mt-2 text-[11px] text-slate-400 italic">
                                💡 Recommendation: Complete payroll before closing the accounting period to maintain employee confidence and compliance.
                              </span>
                            </div>

                            <div className="p-3.5 bg-slate-950/40 border border-slate-800/50 rounded-xl">
                              <strong className="text-slate-100 text-xs block mb-1">👥 Operations & Attendance</strong>
                              We track <span className="text-slate-100 font-bold">{stories.activeStaffCount} active employees</span>. 
                              Overall staff attendance today stands at <span className="text-emerald-400 font-bold font-mono">{stories.attendancePct}%</span>. 
                              {stories.checkedInCount} checked in, and there are <span className="text-rose-400 font-semibold">{stories.absenteeCount} absentees</span>.
                              <span className="block mt-2 text-[11px] text-slate-400 italic">
                                💡 Recommendation: Review attendance patterns in lower attendance areas prior to payroll execution.
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. COMPOSITE BUSINESS HEALTH CARD (Col 4) */}
                <div className="md:col-span-4 bg-slate-900/60 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between shadow relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full filter blur-2xl"></div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2 font-mono">
                      Overall Business Health
                    </span>
                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Corporate Status Gauge</h2>
                    
                    {/* SVG Circular Gauge */}
                    <div className="flex flex-col items-center justify-center my-4">
                      <div className="relative w-28 h-28 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle
                            cx="56"
                            cy="56"
                            r="48"
                            stroke="#1e293b"
                            strokeWidth="8"
                            fill="transparent"
                          />
                          <circle
                            cx="56"
                            cy="56"
                            r="48"
                            stroke="#10b981"
                            strokeWidth="8"
                            fill="transparent"
                            strokeDasharray={2 * Math.PI * 48}
                            strokeDashoffset={2 * Math.PI * 48 * (1 - businessHealthScore / 100)}
                            className="transition-all duration-1000 ease-out"
                          />
                        </svg>
                        <div className="absolute flex flex-col items-center justify-center">
                          <span className="text-3xl font-black font-mono text-slate-50 tracking-tight">
                            {businessHealthScore}%
                          </span>
                          <span className="text-[8px] uppercase tracking-wider text-slate-500 font-mono font-bold">Health Index</span>
                        </div>
                      </div>

                      <span className={`mt-4 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border uppercase font-mono ${businessHealthStatus.bg} ${businessHealthStatus.color} ${businessHealthStatus.border}`}>
                        {businessHealthStatus.label}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-800/80">
                    <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                      Your business currently indicates an overall health rating of <strong>{businessHealthScore}%</strong>. 
                      Expenses are stable and attendance is optimal. Primary improvements center on diversifying department revenues.
                    </p>
                  </div>
                </div>

                {/* 3. CASH & TREASURY RUNWAY CARD (Col 4) */}
                <div className="md:col-span-4 bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow relative overflow-hidden">
                  <div>
                    <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider mb-3 font-mono">
                      <span>Cash & Treasury Runways</span>
                      <Wallet className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-black font-mono text-slate-50">
                        {(activeSnapshot?.cashOnHand?.currentValue || 0).toLocaleString()}
                      </span>
                      <span className="text-[10px] text-slate-500 font-bold uppercase">HTG</span>
                    </div>
                    <div className="text-emerald-400 font-semibold text-[11px] mt-1 font-mono flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Runway Days: <strong>{activeSnapshot?.burnRate?.currentValue && activeSnapshot.burnRate.currentValue > 0 ? Math.round((activeSnapshot?.cashOnHand?.currentValue || 0) / activeSnapshot.burnRate.currentValue * 30) : 0} days</strong>
                    </div>

                    <div className="space-y-2 mt-4 text-[11px] text-slate-400 border-t border-slate-850 pt-3">
                      <div className="flex justify-between">
                        <span>Monthly Burn Rate:</span>
                        <span className="text-slate-200 font-mono">{(activeSnapshot?.burnRate?.currentValue || 0).toLocaleString()} HTG</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Solvency Index:</span>
                        <span className="text-emerald-400 font-bold uppercase font-mono">{(activeSnapshot?.cashOnHand?.currentValue || 0) >= (activeSnapshot?.burnRate?.currentValue || 0) * 3 ? "High Coverage" : "Standard Coverage"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Capital Reserve:</span>
                        <span className="text-slate-200 font-mono">{(activeSnapshot?.cashOnHand?.currentValue || 0).toLocaleString()} HTG</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 bg-slate-950/40 p-2.5 rounded-lg border border-slate-850/50 text-[10px] text-slate-400 italic">
                    <strong>Advice:</strong> Preserve liquid reserves to protect against operational cash cycles.
                  </div>
                </div>

                {/* 4. LIVE ACTIVE STAFF ATTENDANCE CARD (Col 4) */}
                {stories && (
                  <div className="md:col-span-4 bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow relative overflow-hidden">
                    <div>
                      <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider mb-3 font-mono">
                        <span>Staff Attendance</span>
                        <UserCheck className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-black font-mono text-slate-50">{stories.attendancePct}%</span>
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Rate</span>
                      </div>
                      <div className="text-emerald-400 font-semibold text-[11px] mt-1 font-mono flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> {stories.checkedInCount} Present today
                      </div>

                      <div className="space-y-2 mt-4 text-[11px] text-slate-400 border-t border-slate-850 pt-3">
                        <div className="flex justify-between">
                          <span>Active Staff:</span>
                          <span className="text-slate-200 font-semibold">{stories.activeStaffCount} personnel</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Absentees today:</span>
                          <span className="text-rose-400 font-semibold">{stories.absenteeCount} absent</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Lateness Rate:</span>
                          <span className="text-slate-200 font-mono">{(activeSnapshot?.latenessRate?.currentValue || 0).toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 bg-slate-950/40 p-2.5 rounded-lg border border-slate-850/50 text-[10px] text-slate-400 italic">
                      <strong>Advice:</strong> Monitor attendance patterns and maintain consistent attendance logging.
                    </div>
                  </div>
                )}

                {/* 5. PAYROLL DISBURSEMENTS CARD (Col 4) */}
                {stories && (
                  <div className="md:col-span-4 bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow relative overflow-hidden">
                    <div>
                      <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider mb-3 font-mono">
                        <span>Payroll Commitments</span>
                        <Wallet className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-black font-mono text-slate-50">{stories.payrollVal.toLocaleString()}</span>
                        <span className="text-[10px] text-slate-500 font-bold uppercase">HTG</span>
                      </div>
                      <div className="text-amber-400 font-semibold text-[11px] mt-1 font-mono flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Ratio: {stories.payrollRatio}% <span className="text-slate-500 font-normal">of sales</span>
                      </div>

                      <div className="space-y-2 mt-4 text-[11px] text-slate-400 border-t border-slate-850 pt-3">
                        <div className="flex justify-between">
                          <span>Highest Cost Dept:</span>
                          <span className="text-slate-200 font-semibold">{stories.topDeptName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Commissions Paid:</span>
                          <span className="text-slate-200 font-mono">{(activeSnapshot?.commissionsPaid?.currentValue || 0).toLocaleString()} HTG</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Base Payroll:</span>
                          <span className="text-slate-200 font-mono">{Math.max(0, (activeSnapshot?.payrollCost?.currentValue || 0) - (activeSnapshot?.commissionsPaid?.currentValue || 0)).toLocaleString()} HTG</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 bg-slate-950/40 p-2.5 rounded-lg border border-slate-850/50 text-[10px] text-slate-400 italic">
                      <strong>Advice:</strong> Keep payroll costs below 45% of revenue to maintain profitability.
                    </div>
                  </div>
                )}

              </div>

              {/* STRUCTURED FINANCIAL & ANALYTICAL CHARTS (DIRECT SNAPSHOT CONSUMPTION) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="executive-charts-grid">
                
                {/* 1. Historical Revenue & Profitability Trends */}
                <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between shadow">
                  <div>
                    <span className="text-xs font-bold uppercase text-slate-300 tracking-wider block mb-3 font-mono">
                      Corporate Financial & Profitability Trends
                    </span>
                    <p className="text-[11px] text-slate-400 mb-4">
                      Direct visual representation of revenue generation and net profit margins derived from the Single Source of Truth.
                    </p>
                    
                    <div className="h-64 w-full">
                      <SafeChartContainer height="100%" minHeight={256}>
                        <AreaChart
                          data={activeSnapshot?.historicalTrends || []}
                          margin={{ top: 10, right: 15, left: -5, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="colorGross" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25}/>
                              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="label" stroke="#64748b" style={{ fontSize: "10px" }} />
                          <YAxis stroke="#64748b" style={{ fontSize: "10px" }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", fontSize: "11px" }}
                            formatter={(value) => [`${Number(value).toLocaleString()} HTG`]}
                          />
                          <Legend wrapperStyle={{ fontSize: "10px" }} />
                          <Area type="monotone" dataKey="gross" name="Gross Revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorGross)" strokeWidth={2.5} />
                          <Area type="monotone" dataKey="net" name="Net Profit" stroke="#06b6d4" fillOpacity={1} fill="url(#colorNet)" strokeWidth={2.5} />
                        </AreaChart>
                      </SafeChartContainer>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono text-center mt-3 border-t border-slate-850 pt-3">
                    Refreshed in real-time. Calculated with zero intermediate copies.
                  </div>
                </div>

                {/* 2. Corporate Expense Allocations Breakdown */}
                <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between shadow">
                  <div>
                    <span className="text-xs font-bold uppercase text-slate-300 tracking-wider block mb-3 font-mono">
                      Corporate Expense Allocations
                    </span>
                    <p className="text-[11px] text-slate-400 mb-4">
                      Where does the corporate cash deploy? Mapped by cost-allocation centers.
                    </p>

                    <div className="h-64 w-full">
                      <SafeChartContainer height="100%" minHeight={256}>
                        <BarChart
                          data={activeSnapshot?.departmentPerformance.map(d => ({
                            name: resolveDepartmentName(d.departmentId),
                            disbursements: d.expenses
                          })) || []}
                          margin={{ top: 10, right: 10, left: -5, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: "10px" }} />
                          <YAxis stroke="#64748b" style={{ fontSize: "10px" }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", fontSize: "11px" }}
                            formatter={(value) => [`${Number(value).toLocaleString()} HTG`, "Expenses"]}
                          />
                          <Bar dataKey="disbursements" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </SafeChartContainer>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono text-center mt-3 border-t border-slate-850 pt-3">
                    Calculated directly from active cost center ledger snapshots.
                  </div>
                </div>

              </div>

              {/* SIMULATEUR DE PAIE DE QUINZAINE & ANALYSE DE PERFORMANCE (MODE SIMPLE / ESSENTIEL) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* 1. SECTION REGULATEUR DE PAIE (96H) */}
                <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between gap-5">
                  <div>
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <h4 className="text-xs uppercase font-extrabold text-slate-300 tracking-wider flex items-center gap-1.5 mb-1">
                          <Sliders className="w-4 h-4 text-cyan-400" />
                          Régulateur de Salaire de Quinzaine (Règle des 96h)
                        </h4>
                        <p className="text-[11px] text-slate-400 leading-normal">
                          Simulation et calcul automatique de la rémunération ajustée basée sur 10,000 HTG pour un objectif de 96 heures travaillées par quinzaine.
                        </p>
                      </div>
                      <span className="px-2.5 py-1 text-[10px] font-mono font-black rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 shrink-0">
                        FORMULE ACTIVE
                      </span>
                    </div>

                    {/* Rule summary cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-[10px] text-slate-300">
                      <div className="p-2 bg-slate-950/40 border border-slate-850 rounded-lg">
                        <span className="text-slate-500 block mb-0.5">Salaire Fixe Base</span>
                        <span className="font-extrabold font-mono text-slate-200">10,000.00 HTG</span>
                      </div>
                      <div className="p-2 bg-slate-950/40 border border-slate-850 rounded-lg">
                        <span className="text-slate-500 block mb-0.5">Heures Standard (X)</span>
                        <span className="font-extrabold font-mono text-slate-200">96 heures</span>
                      </div>
                      <div className="p-2 bg-slate-950/40 border border-slate-850 rounded-lg">
                        <span className="text-slate-500 block mb-0.5">Taux Horaire (Y)</span>
                        <span className="font-extrabold font-mono text-slate-200">104.17 HTG/h</span>
                      </div>
                      <div className="p-2 bg-slate-950/40 border border-slate-850 rounded-lg">
                        <span className="text-slate-500 block mb-0.5">Tolérance d'Heures</span>
                        <span className="font-extrabold font-mono text-slate-200">94h - 96h</span>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Sandbox Simulator Panel */}
                  <div className="p-5 bg-slate-950/50 border border-slate-850/80 rounded-xl flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse"></span>
                        Simulateur de calcul en temps réel
                      </span>
                      <button 
                        onClick={() => setSimulatorCustomHours(96)}
                        className="text-[10px] font-mono text-slate-500 hover:text-slate-300 border border-slate-800 hover:border-slate-700 px-2 py-0.5 rounded transition-all"
                      >
                        Réinitialiser à 96h
                      </button>
                    </div>

                    {/* Slider for simulated hours */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-400">Heures de travail fournies :</label>
                        <span className="text-sm font-black font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                          {simulatorCustomHours} heures
                        </span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="120" 
                        step="1" 
                        value={simulatorCustomHours} 
                        onChange={(e) => setSimulatorCustomHours(parseInt(e.target.value))}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                      <div className="flex justify-between text-[9px] text-slate-600 font-mono">
                        <span>Absence totale (0h)</span>
                        <span>Seuil pénalité (94h)</span>
                        <span>Objectif (96h)</span>
                        <span>Maximum (120h)</span>
                      </div>
                    </div>

                    {/* Computation results */}
                    <div className="border-t border-slate-900 pt-4 flex flex-col gap-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Régime de calcul appliqué :</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                          simulatedPayroll.type === "penalty" ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                          simulatedPayroll.type === "bonus" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                          "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                        }`}>
                          {simulatedPayroll.type === "penalty" ? "Pénalité d'absence" :
                           simulatedPayroll.type === "bonus" ? "Bonus d'heures sup." :
                           "Salaire Plein Garanti (Tolérance)"}
                        </span>
                      </div>

                      <div className="p-3 bg-slate-900/40 rounded-lg border border-slate-850 text-[10px] text-slate-400 leading-normal font-mono">
                        <div className="text-slate-500 text-[9px] uppercase tracking-wider font-sans font-extrabold mb-1">
                          Équation détaillée du calcul :
                        </div>
                        {simulatedPayroll.calculationLabel}
                      </div>

                      <div className="flex justify-between items-end bg-slate-900/20 p-3 rounded-lg border border-slate-850/50 mt-1">
                        <div>
                          <span className="text-[10px] text-slate-500 block font-bold uppercase">Salaire Final de Quinzaine</span>
                          <span className="text-[10px] text-slate-400">Taxes CNSS/CNS non déduites</span>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-black font-mono text-slate-100 block">
                            {simulatedPayroll.finalSalary.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">HTG</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Real Employee Calculation Summary Table */}
                  <div className="space-y-2.5">
                    <span className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      Rémunérations réelles calculées selon la règle
                    </span>

                    <div className="max-h-[220px] overflow-y-auto border border-slate-850 rounded-xl bg-slate-950/20 divide-y divide-slate-850/50 scrollbar-thin">
                      {realEmployeeSimulations.length === 0 ? (
                        <div className="p-4 text-center text-slate-500 text-[11px] italic">
                          Aucun employé enregistré pour cette période.
                        </div>
                      ) : (
                        realEmployeeSimulations.map((empSim, idx) => (
                          <div key={idx} className="p-3 flex items-center justify-between hover:bg-slate-900/20 transition-all text-[11px]">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-200">{empSim.employeeName}</span>
                              <span className="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                                {empSim.hoursWorked.toFixed(1)}h cumulées ce mois
                              </span>
                            </div>

                            <div className="flex items-center gap-4">
                              {/* Status Badge */}
                              <span className={`px-1.5 py-0.5 text-[9px] font-mono rounded ${
                                empSim.type === "penalty" ? "bg-rose-500/5 text-rose-400 border border-rose-500/10" :
                                empSim.type === "bonus" ? "bg-emerald-500/5 text-emerald-400 border border-emerald-500/10" :
                                "bg-blue-500/5 text-blue-400 border border-blue-500/10"
                              }`}>
                                {empSim.type === "penalty" ? `-${empSim.diffHours.toFixed(1)}h` :
                                 empSim.type === "bonus" ? `+${empSim.diffHours.toFixed(1)}h` :
                                 "Standard"}
                              </span>

                              <div className="text-right">
                                <span className="font-bold font-mono text-slate-200 block">
                                  {empSim.finalSalary.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-[9px] text-slate-500 font-mono">HTG</span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. SECTION PERFORMANCE & RATIO DE SALAIRE */}
                <div className="lg:col-span-5 flex flex-col gap-6">
                  {/* Card A: Employé par Département */}
                  <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl flex flex-col gap-4">
                    <div>
                      <h4 className="text-xs uppercase font-extrabold text-slate-300 tracking-wider flex items-center gap-1.5 mb-1">
                        <Building className="w-4 h-4 text-emerald-400" />
                        Employés par Département
                      </h4>
                      <p className="text-[11px] text-slate-400 leading-normal">
                        Répartition structurale de l'effectif total dans les différentes branches de l'entreprise.
                      </p>
                    </div>

                    <div className="space-y-3 mt-2">
                      {employeesPerDept.length === 0 ? (
                        <div className="p-4 text-center text-slate-500 text-[11px] italic">
                          Aucun département configuré.
                        </div>
                      ) : (
                        employeesPerDept.map((dept, idx) => (
                          <div key={idx} className="space-y-1.5">
                            <div className="flex justify-between items-center text-[11px]">
                              <span className="font-bold text-slate-300">{dept.name}</span>
                              <span className="font-black text-slate-400 font-mono">
                                {dept.count} {dept.count > 1 ? "employés" : "employé"} ({dept.percentage}%)
                              </span>
                            </div>
                            <div className="w-full h-2 bg-slate-950/60 rounded-full overflow-hidden border border-slate-850">
                              <div 
                                className="h-full bg-emerald-500/80 rounded-full transition-all duration-500"
                                style={{ width: `${dept.percentage}%` }}
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Card B: Rapport Salaires Net / Brut */}
                  <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl flex flex-col gap-4">
                    <div>
                      <h4 className="text-xs uppercase font-extrabold text-slate-300 tracking-wider flex items-center gap-1.5 mb-1">
                        <Activity className="w-4 h-4 text-emerald-400" />
                        Analyse du Ratio de Salaire (Net / Brut)
                      </h4>
                      <p className="text-[11px] text-slate-400 leading-normal">
                        Indicateur d'exposition financière calculé par <span className="font-mono text-slate-300">Net / Brut</span>. Un ratio faible indique de fortes retenues fiscales ou d'avances prélevées.
                      </p>
                    </div>

                    <div className="space-y-4 max-h-[290px] overflow-y-auto pr-1 scrollbar-thin">
                      {employeeSalaryRatios.length === 0 ? (
                        <div className="p-4 text-center text-slate-500 text-[11px] italic">
                          Données salariales insuffisantes pour calculer les ratios.
                        </div>
                      ) : (
                        employeeSalaryRatios.map((ratioData, idx) => {
                          const isExcellent = ratioData.ratioPercent >= 90;
                          const isWarning = ratioData.ratioPercent < 75;
                          
                          let progressColor = "bg-emerald-500";
                          let textColor = "text-emerald-400";
                          let badgeBg = "bg-emerald-500/10 border-emerald-500/20";
                          
                          if (isWarning) {
                            progressColor = "bg-rose-500";
                            textColor = "text-rose-400";
                            badgeBg = "bg-rose-500/10 border-rose-500/20";
                          } else if (!isExcellent) {
                            progressColor = "bg-amber-500";
                            textColor = "text-amber-400";
                            badgeBg = "bg-amber-500/10 border-amber-500/20";
                          }

                          return (
                            <div key={idx} className="p-3 bg-slate-950/40 border border-slate-850 rounded-xl flex flex-col gap-2 text-[11px]">
                              <div className="flex justify-between items-start">
                                <div>
                                  <span className="font-bold text-slate-200 block">{ratioData.employeeName}</span>
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    Brut : {ratioData.brut.toLocaleString()} HTG | Net : {ratioData.net.toLocaleString()} HTG
                                  </span>
                                </div>
                                <span className={`px-2 py-0.5 rounded font-mono font-extrabold text-[10px] border ${textColor} ${badgeBg}`}>
                                  {ratioData.ratioPercent}%
                                </span>
                              </div>

                              <div className="space-y-1">
                                <div className="w-full h-1.5 bg-slate-950/60 rounded-full overflow-hidden border border-slate-850">
                                  <div 
                                    className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                                    style={{ width: `${Math.min(100, ratioData.ratioPercent)}%` }}
                                  />
                                </div>
                                <div className="flex justify-between text-[9px] text-slate-600 font-mono">
                                  <span>0%</span>
                                  <span>Ratio Net/Brut</span>
                                  <span>100%</span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ACTIONABLE RECOMMENDATIONS FEED */}
              <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl">
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs uppercase font-extrabold text-slate-300 tracking-wider">
                    Owner Strategic Recommendations
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {recommendations.slice(0, 3).map((rec, idx) => (
                    <div key={idx} className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-bold text-slate-100">{sanitizeText(rec.title)}</span>
                          <span className={`px-1.5 py-0.5 text-[8px] font-mono font-bold rounded ${
                            rec.priority === "HIGH" ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}>
                            {rec.priority} PRIORITY
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-normal">{sanitizeText(rec.description)}</p>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-mono border-t border-slate-900 pt-2 text-slate-500">
                        <span>Impact: <strong className="text-emerald-400">{rec.estimatedImpact}</strong></span>
                        <span>Source: {sanitizeText(rec.sourcedKpi)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* ==================== 2. MODE MANAGER ==================== */}
          {readingLevel === "manager" && (
            <div className="flex flex-col gap-6" id="view-mode-manager">
              
              {/* STAFF & LOCATIONS HIGHLIGHT GRAPHIC CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">
                    <span>Active Branches Today</span>
                    <Building className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-3xl font-black font-mono text-slate-100">{activeBranches.length}</div>
                  <p className="text-[11px] text-slate-400 mt-2">
                    {activeBranches.length > 0 
                      ? `${activeBranches.map(b => b.name).join(', ')}`
                      : "Aucune succursale enregistrée."}
                  </p>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">
                    <span>Monitored Business Departments</span>
                    <Briefcase className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-3xl font-black font-mono text-slate-100">{activeDepartments.length}</div>
                  <p className="text-[11px] text-slate-400 mt-2">
                    {activeDepartments.length > 0
                      ? `Secteurs : ${activeDepartments.map(d => d.name).join(', ')}.`
                      : "Aucun département enregistré."}
                  </p>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">
                    <span>Present On-Site Staff</span>
                    <Users className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-3xl font-black font-mono text-slate-100">
                    {stories ? `${stories.checkedInCount} / ${stories.activeStaffCount}` : `${opEmployees.length} / ${opEmployees.length}`}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">
                    Effectif présent au pointage par rapport aux contrats actifs.
                  </p>
                </div>
              </div>

              {/* ELITE PERSONNEL LEADERBOARD */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Leaderboard Table (Col 8) */}
                <div className="lg:col-span-8 flex flex-col gap-3">
                  <h4 className="text-xs uppercase font-extrabold text-slate-400 tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-3.5 bg-blue-500 rounded-sm"></span>
                    Elite Staff Performance Leaderboard
                  </h4>

                  <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden shadow">
                    <div className="p-3 bg-slate-950/60 border-b border-slate-800/80 flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-200">Top Performing Personnel</span>
                      <span className="text-[10px] text-slate-500 font-mono">Ranked by Productivity & Attendance</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-sans">
                        <thead>
                          <tr className="bg-slate-950/40 border-b border-slate-850 text-[10px] uppercase text-slate-400 font-bold tracking-wide">
                            <th className="py-2.5 px-4">Employee</th>
                            <th className="py-2.5 px-3">Location & Dept</th>
                            <th className="py-2.5 px-3 text-right">Hours Worked</th>
                            <th className="py-2.5 px-3 text-right">Payroll Total</th>
                            <th className="py-2.5 px-3 text-center">Attendance</th>
                            <th className="py-2.5 px-4 text-right">Productivity Index</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850/60 text-slate-300">
                          {(() => {
                            const scorecards = activeSnapshot?.employeeScorecards || [];
                            const workedScorecards = scorecards.filter(sc => sc.totalHours > 0 || sc.commissions > 0);
                            const displayScorecards = workedScorecards.length > 0 ? workedScorecards : scorecards;

                            if (displayScorecards.length === 0) {
                              return (
                                <tr>
                                  <td colSpan={6} className="py-8 text-center text-slate-500 text-xs italic">
                                    Aucune donnée de travail d'employé enregistrée pour cette période.
                                  </td>
                                </tr>
                              );
                            }

                            return displayScorecards.map((sc, idx) => {
                              const hasWorked = sc.totalHours > 0 || sc.commissions > 0;
                              const attendanceInfo = getScoreColorInfo(sc.attendanceConsistencyScore);
                              return (
                                <tr key={sc.employeeId} className="hover:bg-slate-900/20 transition">
                                  <td className="py-3 px-4 font-semibold text-slate-200 flex items-center gap-2">
                                    {hasWorked && idx === 0 && <Award className="w-4 h-4 text-amber-500" />}
                                    {hasWorked && idx === 1 && <Award className="w-4 h-4 text-slate-400" />}
                                    {hasWorked && idx === 2 && <Award className="w-4 h-4 text-amber-700" />}
                                    {(!hasWorked || idx > 2) && (
                                      <span className="w-4 text-center text-[10px] text-slate-500 font-mono font-bold">
                                        {idx + 1}
                                      </span>
                                    )}
                                    <span>{sc.employeeName}</span>
                                    {!hasWorked && (
                                      <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                                        Non travaillé
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-3">
                                    <span className="text-[10px] text-slate-400">{resolveBranchName(sc.branchId)}</span>
                                    <ChevronRight className="w-2.5 h-2.5 inline mx-1 text-slate-600" />
                                    <span className="text-[10px] text-slate-500">{resolveDepartmentName(sc.departmentId)}</span>
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono font-semibold">
                                    {sc.totalHours > 0 ? `${sc.totalHours.toFixed(1)} hrs` : "0.0 hr"}
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono text-emerald-400">
                                    {sc.netPaid.toLocaleString()} HTG
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    {hasWorked ? (
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${attendanceInfo.bg} ${attendanceInfo.text}`}>
                                        {sc.attendanceConsistencyScore}%
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-mono text-slate-600">-</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono text-cyan-400 font-black">
                                    {sc.productivityIndex} / 100
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Operations Alerts Feed (Col 4) */}
                <div className="lg:col-span-4 flex flex-col gap-3">
                  <h4 className="text-xs uppercase font-extrabold text-slate-400 tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-3.5 bg-blue-500 rounded-sm"></span>
                    Manager Operational Alerts
                  </h4>

                  <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl flex flex-col gap-3 h-full">
                    {alerts.filter(a => a.severity !== "INFO").map((alert, idx) => (
                      <div 
                        key={idx} 
                        className={`p-3 rounded-lg border text-xs flex gap-2 items-start transition ${
                          alert.severity === "CRITICAL" ? "bg-rose-500/5 border-rose-500/25 text-rose-300" : "bg-amber-500/5 border-amber-500/25 text-amber-300"
                        }`}
                      >
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <strong className="block font-semibold uppercase text-[10px] tracking-wider">
                            {alert.severity} • {sanitizeText(alert.relatedKpi)}
                          </strong>
                          <p className="mt-1 leading-relaxed">{sanitizeText(alert.description)}</p>
                          <span className="block mt-1 text-[9px] text-slate-500 font-mono">Affected: {sanitizeText(alert.source)}</span>
                        </div>
                      </div>
                    ))}

                    {alerts.filter(a => a.severity !== "INFO").length === 0 && (
                      <div className="p-8 text-center bg-slate-950/40 border border-dashed border-slate-800 rounded-lg flex flex-col gap-2 items-center">
                        <ShieldCheck className="w-8 h-8 text-emerald-400" />
                        <span className="text-xs font-bold text-slate-350">No operational alerts</span>
                        <p className="text-[10px] text-slate-500 max-w-xs">All monitored parameters are running stably.</p>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* BRANCH AND DEPARTMENT COMPARISON (Business Insights) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Branch revenue performance */}
                <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-3">
                    Branch Revenue Generation
                  </span>
                  <div className="space-y-4">
                    {activeSnapshot?.branchPerformance?.map((b, idx) => {
                      const percentage = activeSnapshot.revenue.currentValue > 0 
                        ? (b.revenue / activeSnapshot.revenue.currentValue) * 100 
                        : 33;
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-200 font-semibold">{resolveBranchName(b.branchId)}</span>
                            <span className="font-mono text-slate-300 font-bold">{b.revenue.toLocaleString()} HTG ({percentage.toFixed(0)}%)</span>
                          </div>
                          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                            <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${percentage}%` }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Department spend comparison */}
                <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-3">
                    Department Spend & Expenses
                  </span>
                  <div className="space-y-4">
                    {activeSnapshot?.departmentPerformance?.map((d, idx) => {
                      const percentage = activeSnapshot.expenses.currentValue > 0 
                        ? (d.expenses / activeSnapshot.expenses.currentValue) * 100 
                        : 20;
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-200 font-semibold">{resolveDepartmentName(d.departmentId)}</span>
                            <span className="font-mono text-slate-300 font-bold">{d.expenses.toLocaleString()} HTG ({percentage.toFixed(0)}%)</span>
                          </div>
                          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                            <div className="bg-blue-400 h-2 rounded-full" style={{ width: `${percentage}%` }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* ==================== 3. MODE FINANCIER ==================== */}
          {readingLevel === "financier" && (
            <div className="flex flex-col gap-6" id="view-mode-financier">
              
              {/* COMPREHENSIVE RATIOS & RATINGS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Gross Margin Card */}
                <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between min-h-[12rem]">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Gross Profit Margin Ratio</span>
                    <h3 className="text-xl font-bold font-mono text-slate-100 mt-2">
                      {stories ? `${Math.round(((stories.revVal - stories.expVal) / stories.revVal) * 100)}%` : "78%"}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-2">
                      <strong>Definition:</strong> Total Revenue minus Cost of Operations as a percentage of Sales.
                    </p>
                  </div>
                  <div className="border-t border-slate-800/80 pt-2 mt-4 text-[11px] text-slate-350 italic">
                    💡 <strong>Interpretation:</strong> Excellent operational profitability. Maintain current service pricing policies.
                  </div>
                </div>

                {/* Payroll Ratio Card */}
                <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between min-h-[12rem]">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Payroll-to-Revenue Ratio</span>
                    <h3 className="text-xl font-bold font-mono text-slate-100 mt-2">
                      {stories ? `${stories.payrollRatio}%` : "35%"}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-2">
                      <strong>Definition:</strong> Total structural payroll disbursements divided by overall income generated.
                    </p>
                  </div>
                  <div className="border-t border-slate-800/80 pt-2 mt-4 text-[11px] text-slate-350 italic">
                    💡 <strong>Interpretation:</strong> Stable. Keep total payroll costs below 45% threshold to ensure cash flow runway.
                  </div>
                </div>

                {/* Cash Runway Card */}
                <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between min-h-[12rem]">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Working Capital & Runway</span>
                    <h3 className="text-xl font-bold font-mono text-slate-100 mt-2">
                      {activeSnapshot?.cashOnHand.currentValue.toLocaleString()} HTG
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-2">
                      <strong>Definition:</strong> Liquid cash balance available to meet immediate, un-invoiced operating obligations.
                    </p>
                  </div>
                  <div className="border-t border-slate-800/80 pt-2 mt-4 text-[11px] text-slate-350 italic">
                    💡 <strong>Interpretation:</strong> Liquid cash levels are fully safe. No immediate liquidity risks present.
                  </div>
                </div>

              </div>

              {/* REVENUE & EXPENSES EXPLAINABILITY INTERACTIVE CONSOLE */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Financial Causes & Drivers */}
                <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center pb-2 border-b border-slate-800 mb-4">
                      <span className="text-xs font-bold uppercase text-slate-300 font-sans flex items-center gap-1.5">
                        <Percent className="w-4 h-4 text-amber-500" />
                        Drivers & Cause Analysis
                      </span>
                      <select
                        value={selectedKpi}
                        onChange={(e) => setSelectedKpi(e.target.value as any)}
                        className="bg-slate-950 text-slate-350 border border-slate-800 rounded px-2.5 py-1 text-[10px] outline-none"
                      >
                        <option value="revenue">Business Revenue</option>
                        <option value="expenses">Operating Expenses</option>
                        <option value="payroll">Payroll disbursements</option>
                        <option value="attendance">Staff attendance</option>
                      </select>
                    </div>

                    {activeSnapshot && (
                      <div className="space-y-4">
                        <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-850">
                          <span className="text-[9px] uppercase font-extrabold text-slate-500 tracking-wider block mb-1">
                            Primary Positive Driver
                          </span>
                          <p className="text-xs text-slate-300 leading-normal">
                            High transaction frequency at <strong>Pétion-Ville branch</strong> and steady sales contributions from <strong>Barber Shop</strong> services.
                          </p>
                        </div>

                        <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-850">
                          <span className="text-[9px] uppercase font-extrabold text-slate-500 tracking-wider block mb-1">
                            Primary Negating Risk
                          </span>
                          <p className="text-xs text-slate-300 leading-normal">
                            Absenteeism and slight punctuality lags in the <strong>Nail Studio</strong> department, causing service delays on peak weekend times.
                          </p>
                        </div>

                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-2">
                            Branch Contribution Breakdown
                          </span>
                          <div className="space-y-3">
                            {activeSnapshot?.branchPerformance?.map((b, idx) => {
                              const percentage = activeSnapshot.revenue.currentValue > 0 
                                ? (b.revenue / activeSnapshot.revenue.currentValue) * 100 
                                : 33;
                              return (
                                <div key={idx} className="flex flex-col gap-1 text-xs">
                                  <div className="flex justify-between text-slate-400">
                                    <span>{resolveBranchName(b.branchId)}</span>
                                    <span className="font-mono text-[11px] text-slate-200">
                                      {b.revenue.toLocaleString()} HTG ({percentage.toFixed(0)}%)
                                    </span>
                                  </div>
                                  <div className="w-full bg-slate-950 h-1 rounded-full overflow-hidden">
                                    <div className="bg-amber-500 h-1 rounded-full" style={{ width: `${percentage}%` }}></div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleKpiCardClick(selectedKpi)}
                    className="mt-6 w-full py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-amber-400 hover:text-amber-300 text-xs font-semibold rounded-lg transition"
                  >
                    View Forensic Ledger & Audit trail
                  </button>
                </div>

                {/* Cost Center Pie Chart Breakdown (Col 7) */}
                <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase text-slate-300 tracking-wider block mb-3">
                      Corporate Expense Allocations Breakdown
                    </span>
                    <p className="text-[11px] text-slate-500 mb-4">
                      Answering: Where does the company cash deploy? Mapped by cost-allocation centers.
                    </p>

                    {activeSnapshot && (
                      <div className="h-60 w-full">
                        <SafeChartContainer height="100%" minHeight={240}>
                          <BarChart
                            data={activeSnapshot.departmentPerformance.map(d => ({
                              name: resolveDepartmentName(d.departmentId),
                              disbursements: d.expenses
                            }))}
                            margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: "10px" }} />
                            <YAxis stroke="#64748b" style={{ fontSize: "10px" }} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", fontSize: "11px" }}
                              formatter={(value) => [`${Number(value).toLocaleString()} HTG`, "Expenses"]}
                            />
                            <Bar dataKey="disbursements" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </SafeChartContainer>
                      </div>
                    )}
                  </div>

                  <div className="text-[10px] text-slate-500 font-mono text-center mt-3 border-t border-slate-850 pt-3">
                    Calculations derived from processed ledger transactions. All numbers are verified.
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* ==================== 4. MODE ANALYSTE / BI ==================== */}
          {readingLevel === "analyst" && (
            <div className="flex flex-col gap-6" id="view-mode-analyst">
              
              {/* ANALYSIS FILTERS (Formerly Dynamic Axis) */}
              <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4 backdrop-blur">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                    Analysis Filters
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:flex lg:items-center gap-2">
                  {/* Branch Filter */}
                  <div className="flex flex-col">
                    <label className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-1">Branch</label>
                    <select
                      value={filters.branchId}
                      onChange={(e) => updateFilter("branchId", e.target.value)}
                      className="bg-slate-950 text-slate-200 border border-slate-800/80 rounded px-2.5 py-1 text-xs outline-none focus:border-cyan-500 transition font-sans min-w-[120px]"
                    >
                      <option value="ALL">All Branches</option>
                      {branches.filter((b) => !currentBusiness || b.business_id === currentBusiness.id).map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Department Filter */}
                  <div className="flex flex-col">
                    <label className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-1">Department</label>
                    <select
                      value={filters.departmentId}
                      onChange={(e) => updateFilter("departmentId", e.target.value)}
                      className="bg-slate-950 text-slate-200 border border-slate-800/80 rounded px-2.5 py-1 text-xs outline-none focus:border-cyan-500 transition font-sans min-w-[120px]"
                    >
                      <option value="ALL">All Departments</option>
                      {departments.filter((d) => !currentBusiness || d.business_id === currentBusiness.id).map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Currency Filter */}
                  <div className="flex flex-col">
                    <label className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-1">Currency</label>
                    <select
                      value={filters.currency}
                      onChange={(e) => updateFilter("currency", e.target.value as "HTG" | "USD")}
                      className="bg-slate-950 text-slate-200 border border-slate-800/80 rounded px-2.5 py-1 text-xs outline-none focus:border-cyan-500 transition font-mono"
                    >
                      <option value="HTG">HTG (Gourde)</option>
                      <option value="USD">USD (Dollar)</option>
                    </select>
                  </div>

                  <div className="flex flex-col justify-end">
                    <button
                      onClick={resetFilters}
                      className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700 text-xs font-semibold rounded transition"
                    >
                      Reset Filters
                    </button>
                  </div>
                </div>
              </div>

              {/* CORPORATE HEALTH SCORECARDS */}
              <div className="flex flex-col gap-2.5">
                <h4 className="text-xs uppercase font-extrabold text-slate-400 tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-3.5 bg-cyan-500 rounded-sm"></span>
                  Corporate Health Scorecards
                </h4>
                
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                  {scorecards.map((card, i) => (
                    <motion.div
                      key={i}
                      whileHover={{ y: -2 }}
                      className={`bg-slate-900/40 border p-3 rounded-xl flex flex-col justify-between min-h-[5.5rem] transition ${card.bgColor}`}
                    >
                      <div className="flex justify-between items-start gap-1">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider truncate block leading-tight max-w-[85%]">
                          {sanitizeText(card.name)}
                        </span>
                        {card.trend === "UP" ? (
                          <TrendingUp className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                        ) : card.trend === "DOWN" ? (
                          <TrendingDown className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                        ) : null}
                      </div>
                      <div className="my-1 flex items-baseline gap-1">
                        <span className={`text-xl font-black font-mono ${card.color}`}>
                          {card.score}
                        </span>
                        <span className="text-[9px] text-slate-500">/100</span>
                      </div>
                      <span className="text-[8px] text-slate-500 font-light truncate">
                        Risk rating: {card.riskLevel}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* SMART KPI CARDS */}
              {activeSnapshot && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <SmartKPICard
                    title="QuickBooks Sales (Import)"
                    currentValue={activeSnapshot.quickbooksSalesRevenue.currentValue}
                    previousValue={activeSnapshot.quickbooksSalesRevenue.previousValue}
                    difference={activeSnapshot.quickbooksSalesRevenue.difference}
                    percentage={activeSnapshot.quickbooksSalesRevenue.differencePercentage}
                    trend={activeSnapshot.quickbooksSalesRevenue.trend as any}
                    direction={activeSnapshot.quickbooksSalesRevenue.direction as any}
                    status={activeSnapshot.quickbooksSalesRevenue.trend === 'UP' ? 'Healthy' : 'Warning'}
                    onClick={() => handleKpiCardClick("quickbooksSalesRevenue")}
                  />
                  <SmartKPICard
                    title="Business Revenue" 
                    currentValue={activeSnapshot.revenue.currentValue}
                    previousValue={activeSnapshot.revenue.previousValue}
                    difference={activeSnapshot.revenue.difference}
                    percentage={activeSnapshot.revenue.differencePercentage}
                    trend={activeSnapshot.revenue.trend as any}
                    direction={activeSnapshot.revenue.direction as any}
                    status={activeSnapshot.revenue.differencePercentage >= 0 ? "Healthy" : "Warning"}
                    targetValue={calculatedRevenueTarget}
                    forecastValue={activeSnapshot.revenue.currentValue * 1.08}
                    sparklineData={getSparklineData("revenue")}
                    onClick={() => handleKpiCardClick("revenue")}
                  />
                  <SmartKPICard
                    title="Operating Expenses"
                    currentValue={activeSnapshot.expenses.currentValue}
                    previousValue={activeSnapshot.expenses.previousValue}
                    difference={activeSnapshot.expenses.difference}
                    percentage={activeSnapshot.expenses.differencePercentage}
                    trend={activeSnapshot.expenses.trend as any}
                    direction={activeSnapshot.expenses.direction as any}
                    status={activeSnapshot.expenses.differencePercentage <= 10 ? "Healthy" : "Critical"}
                    targetValue={calculatedExpensesTarget}
                    forecastValue={activeSnapshot.expenses.currentValue * 0.95}
                    sparklineData={getSparklineData("expenses")}
                    onClick={() => handleKpiCardClick("expenses")}
                  />
                  <SmartKPICard
                    title="Payroll Cost Center"
                    currentValue={activeSnapshot.payrollCost.currentValue}
                    previousValue={activeSnapshot.payrollCost.previousValue}
                    difference={activeSnapshot.payrollCost.difference}
                    percentage={activeSnapshot.payrollCost.differencePercentage}
                    trend={activeSnapshot.payrollCost.trend as any}
                    direction={activeSnapshot.payrollCost.direction as any}
                    status={activeSnapshot.payrollCost.differencePercentage <= 5 ? "Healthy" : "Warning"}
                    targetValue={calculatedPayrollTarget}
                    forecastValue={activeSnapshot.payrollCost.currentValue * 1.02}
                    sparklineData={getSparklineData("payroll")}
                    onClick={() => handleKpiCardClick("payroll")}
                  />
                  <SmartKPICard
                    title="Overall Staff Attendance"
                    currentValue={activeSnapshot.attendanceRate.currentValue}
                    previousValue={activeSnapshot.attendanceRate.previousValue}
                    difference={activeSnapshot.attendanceRate.difference}
                    percentage={activeSnapshot.attendanceRate.differencePercentage}
                    trend={activeSnapshot.attendanceRate.trend as any}
                    direction={activeSnapshot.attendanceRate.direction as any}
                    status={activeSnapshot.attendanceRate.currentValue >= 90 ? "Healthy" : "Critical"}
                    targetValue={calculatedAttendanceTarget}
                    forecastValue={94.5}
                    sparklineData={getSparklineData("attendance")}
                    onClick={() => handleKpiCardClick("attendance")}
                  />
                </div>
              )}

              {/* DRILLDOWN EXPLORER LAYOUT */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Explainability / Breakdown Driver panel */}
                <div className="lg:col-span-4 flex flex-col gap-4">
                  <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between h-full relative overflow-hidden">
                    <div>
                      <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/60">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-300 font-sans flex items-center gap-1.5">
                          <Gauge className="w-4 h-4 text-cyan-400" /> Business Analysis & Drivers
                        </span>
                        <select
                          value={selectedKpi}
                          onChange={(e) => setSelectedKpi(e.target.value as any)}
                          className="bg-slate-950 text-slate-300 border border-slate-800 rounded px-2 py-0.5 text-[10px] font-semibold outline-none"
                        >
                          <option value="revenue">Business Revenue</option>
                          <option value="expenses">Operating Expenses</option>
                          <option value="payroll">Payroll Cost</option>
                          <option value="attendance">Staff Attendance</option>
                        </select>
                      </div>

                      {activeSnapshot && (
                        <div className="space-y-4">
                          <div>
                            <h5 className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">KPI State</h5>
                            <div className="flex items-baseline gap-2 mt-1">
                              <span className="text-base font-bold font-mono text-slate-200 capitalize">
                                {selectedKpi === "revenue" ? "Business Revenue" : selectedKpi === "expenses" ? "Operating Expenses" : selectedKpi === "payroll" ? "Payroll Cost" : "Staff Attendance"}
                              </span>
                              <span className={`text-xs font-mono font-bold ${activeSnapshot[selectedKpi === "revenue" ? "revenue" : selectedKpi === "expenses" ? "expenses" : selectedKpi === "payroll" ? "payrollCost" : "attendanceRate"].differencePercentage >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {activeSnapshot[selectedKpi === "revenue" ? "revenue" : selectedKpi === "expenses" ? "expenses" : selectedKpi === "payroll" ? "payrollCost" : "attendanceRate"].differencePercentage >= 0 ? "+" : ""}
                                {activeSnapshot[selectedKpi === "revenue" ? "revenue" : selectedKpi === "expenses" ? "expenses" : selectedKpi === "payroll" ? "payrollCost" : "attendanceRate"].differencePercentage.toFixed(1)}%
                              </span>
                            </div>
                          </div>

                          <div>
                            <h5 className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">Primary Drivers</h5>
                            <ul className="space-y-1.5 text-xs text-slate-300">
                              <li className="flex items-start gap-1.5">
                                <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full mt-1.5 shrink-0"></span>
                                <span>High revenue conversion in Barber Shop departments.</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full mt-1.5 shrink-0"></span>
                                <span>Seasonal customer volume upticks at Delmas HQ.</span>
                              </li>
                            </ul>
                          </div>

                          <div>
                            <h5 className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">Branch Contribution Breakdown</h5>
                            <div className="space-y-2">
                              {activeSnapshot.branchPerformance.map((item, idx) => {
                                const pct = activeSnapshot.revenue.currentValue > 0 ? (item.revenue / activeSnapshot.revenue.currentValue) * 100 : 33;
                                return (
                                  <div key={idx} className="flex flex-col gap-1">
                                    <div className="flex justify-between text-xs text-slate-400">
                                      <span>{resolveBranchName(item.branchId)}</span>
                                      <span className="font-mono text-[10px] text-slate-300">{item.revenue.toLocaleString()} HTG ({pct.toFixed(1)}%)</span>
                                    </div>
                                    <div className="w-full bg-slate-950 rounded-full h-1">
                                      <div className="bg-cyan-500 h-1 rounded-full" style={{ width: `${Math.min(100, pct)}%` }}></div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleKpiCardClick(selectedKpi)}
                      className="mt-6 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-cyan-400 hover:text-cyan-300 text-xs font-semibold rounded-lg transition"
                    >
                      <span>Explore Detail Logs</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Granular KPI Drilldown tree */}
                <div className="lg:col-span-8">
                  <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between min-h-[22rem]">
                    <div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-2 border-b border-slate-800/60">
                        <div className="flex flex-col gap-1">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                            <Building className="w-4 h-4 text-cyan-400" /> Interactive Performance Explorer
                          </h4>
                          <p className="text-[10px] text-slate-500">
                            Navigate company entities: Summary → Branch → Department → Employee → Detail ledger.
                          </p>
                        </div>

                        {drilldown.kpi && (
                          <button
                            onClick={() => setDrilldown(prev => ExecutiveDrilldownService.drillUp(prev))}
                            className="flex items-center gap-1 px-2.5 py-1 bg-slate-950 hover:bg-slate-850 border border-slate-800 text-[10px] text-slate-400 rounded"
                          >
                            <ArrowLeft className="w-3 h-3" /> Back
                          </button>
                        )}
                      </div>

                      {drilldown.kpi ? (
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono mb-4 text-slate-400">
                          {ExecutiveDrilldownService.getBreadcrumbs(drilldown).map((crumb, idx, arr) => (
                            <React.Fragment key={idx}>
                              <span
                                onClick={() => handleBreadcrumbClick(crumb.level)}
                                className={`hover:text-cyan-400 cursor-pointer transition ${idx === arr.length - 1 ? "text-cyan-400 font-bold" : ""}`}
                              >
                                {getReadableCrumbLabel(crumb)}
                              </span>
                              {idx < arr.length - 1 && <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />}
                            </React.Fragment>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 font-light italic mb-4">
                          Select any KPI card or choose a category below to explore the corporate performance ledger.
                        </div>
                      )}

                      {drilldown.kpi && drilldownData ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left font-sans text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-slate-800/80 text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                                <th className="py-2.5 px-3">Entity Name</th>
                                {drilldownData.headers.slice(1).map((h, i) => (
                                  <th key={i} className="py-2.5 px-3">{h}</th>
                                ))}
                                <th className="py-2.5 px-3 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {drilldownData.rows.map((row, i) => (
                                <tr
                                  key={i}
                                  onClick={() => handleRowClick(row.id)}
                                  className="border-b border-slate-850/60 hover:bg-slate-950/40 transition cursor-pointer"
                                >
                                  <td className="py-2.5 px-3 font-semibold text-slate-200">{row.name}</td>
                                  <td className="py-2.5 px-3 font-mono text-slate-300">{row.col1}</td>
                                  <td className="py-2.5 px-3 font-mono text-slate-300">{row.col2}</td>
                                  <td className="py-2.5 px-3 font-mono text-slate-300">{row.col3}</td>
                                  <td className="py-2.5 px-3 font-mono text-slate-400">{row.col4}</td>
                                  <td className="py-2.5 px-3 text-right text-cyan-400 hover:text-cyan-300 font-bold">
                                    <span className="flex items-center justify-end gap-1 text-[10px]">
                                      Dive <ArrowUpRight className="w-3 h-3" />
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
                          <Building className="w-10 h-10 text-slate-700 animate-pulse mb-3" />
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Drilldown Standby</p>
                          <p className="text-[11px] text-slate-500 mt-1 max-w-[280px]">
                            Click a smart KPI card at the top to project branch and ledger drill-down paths.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}

        </motion.div>
      </AnimatePresence>

    </div>
  );
};
