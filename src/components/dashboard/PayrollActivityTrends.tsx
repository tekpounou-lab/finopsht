import React, { useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Area,
} from "recharts";
import { SafeChartContainer } from "../ui/SafeChartContainer";
import { PayrollRecord, AttendanceRecord } from "../../types";
import { 
  TrendingUp, 
  Users, 
  Calendar, 
  Coins, 
  ArrowUpRight, 
  SlidersHorizontal, 
  BarChart3, 
  HelpCircle, 
  ArrowUpDown 
} from "lucide-react";
import { useAnalytics } from "../../domains/analytics/context/AnalyticsContext";

interface PayrollActivityTrendsProps {
  payrollRecords: PayrollRecord[];
  attendanceRecords: AttendanceRecord[];
  language: "fr" | "ht" | "en";
}

// Full multilingual translation set for the analyst controls
const analystLabels = {
  fr: {
    title: "Indicateurs de Performance Paie & Activité",
    desc: "Axe X & Y entièrement configurables avec filtres analytiques professionnels.",
    dimension: "Dimension d'Analyse (Axe X)",
    time: "Chronologique (Mois)",
    branch: "Succursales (Régional)",
    department: "Départements (Secteurs)",
    leftMetric: "Métrique Gauche (Axe Y1)",
    rightMetric: "Métrique Droite (Axe Y2)",
    sorting: "Tri des Segments",
    sortOriginal: "Ordre par défaut",
    sortVal1Desc: "Gauche maximum",
    sortVal1Asc: "Gauche minimum",
    sortVal2Desc: "Droite maximum",
    minStaff: "Effectif Minimum",
    minStaffAll: "Tous les segments",
    scaleType: "Ajustement Échelle",
    scaleAuto: "Auto-zoom (Variance)",
    scaleZero: "Standard (Depuis 0)",
    gross: "Salaire Brut Consolidé (HTG)",
    net: "Salaire Net Payé (HTG)",
    staff: "Collaborateurs Actifs",
    scans: "Pointeuses / Scans QR",
    hours: "Heures Prestées (Moyenne)",
    revenue: "Chiffre d'Affaires (HTG)",
    expenses: "Charges & Dépenses (HTG)",
    profit: "Bénéfice Net (HTG)",
    attendanceRate: "Taux de Présence (%)",
    efficiencyScore: "Score d'Efficacité",
    averageHours: "Moyenne d'Heures Travaillées",
    employeeCount: "Nombre d'Employés",
    analystConsole: "Console d'Analyse BI",
    customFilters: "Filtres d'Analyste",
  },
  ht: {
    title: "Endikatè Pèfòmans Peman & Aktivite",
    desc: "Aks X & Y konfigirab ak filtè pwofesyonèl pou analiz done.",
    dimension: "Dimansyon Analiz (Aks X)",
    time: "Kwonolojik (Chak mwa)",
    branch: "Sikisal (Swivi Rejyon)",
    department: "Depatman (Analiz)",
    leftMetric: "Metrik Agoch (Aks Y1)",
    rightMetric: "Metrik Adwat (Aks Y2)",
    sorting: "Triye Segman yo",
    sortOriginal: "Lòd pa defo",
    sortVal1Desc: "Valè agoch max",
    sortVal1Asc: "Valè agoch min",
    sortVal2Desc: "Valè adwat max",
    minStaff: "Anplwaye Minimòm",
    minStaffAll: "Tout segman yo",
    scaleType: "Ajisteman Eskèl",
    scaleAuto: "Otomatik (Zoom)",
    scaleZero: "Estanda (Depi 0)",
    gross: "Salè Brit Konsolide (HTG)",
    net: "Salè Nèt Peye (HTG)",
    staff: "Anplwaye ki Prezan",
    scans: "QR eskane yo",
    hours: "Mwayèn Lè Travay",
    revenue: "Chif d'Afè (HTG)",
    expenses: "Depans / Chaj (HTG)",
    profit: "Benefis Nèt Operasyon (HTG)",
    attendanceRate: "Pousantaj Prezans (%)",
    efficiencyScore: "Nòt Efikasite",
    averageHours: "Mwayèn Lè Travay",
    employeeCount: "Kantite Anplwaye",
    analystConsole: "Konsòl Analiz BI",
    customFilters: "Filtè Analis yo",
  },
  en: {
    title: "Payroll & Activity Performance Indicators",
    desc: "Fully configurable X & Y axes with professional analytical filters.",
    dimension: "Analysis Dimension (X-Axis)",
    time: "Chronological (Monthly)",
    branch: "Branches (Regional View)",
    department: "Departments (Sectors)",
    leftMetric: "Left Axis Metric (Y1)",
    rightMetric: "Right Axis Metric (Y2)",
    sorting: "Segment Sorting",
    sortOriginal: "Default Order",
    sortVal1Desc: "Left Max Value First",
    sortVal1Asc: "Left Min Value First",
    sortVal2Desc: "Right Max Value First",
    minStaff: "Minimum Workforce",
    minStaffAll: "All Segments",
    scaleType: "Y-Axis Scale Tuning",
    scaleAuto: "Auto-zoom (Variance)",
    scaleZero: "Baseline 0 (Standard)",
    gross: "Consolidated Gross (HTG)",
    net: "Net Wages Paid (HTG)",
    staff: "Active Workforce",
    scans: "Clock-ins / QR Scans",
    hours: "Avg Logged Hours",
    revenue: "Branch Revenue (HTG)",
    expenses: "Branch Expenses (HTG)",
    profit: "Net Operating Income (HTG)",
    attendanceRate: "Attendance Rate (%)",
    efficiencyScore: "Efficiency Score",
    averageHours: "Avg Hours Worked",
    employeeCount: "Total Employee Count",
    analystConsole: "BI Analyst Console",
    customFilters: "Analytical Filters",
  },
};

export default function PayrollActivityTrends({
  payrollRecords,
  attendanceRecords,
  language,
}: PayrollActivityTrendsProps) {
  const { snapshot } = useAnalytics();

  // Selected language labels fallback
  const langKey = language === "fr" || language === "ht" || language === "en" ? language : "fr";
  const l = analystLabels[langKey];

  // Data analyst state machine variables
  const [dimension, setDimension] = useState<"time" | "branch" | "department">("time");
  const [leftMetric, setLeftMetric] = useState<string>("net");
  const [rightMetric, setRightMetric] = useState<string>("hours");
  const [minStaffFilter, setMinStaffFilter] = useState<number>(0);
  const [sortBy, setSortBy] = useState<"original" | "leftDesc" | "leftAsc" | "rightDesc">("original");
  const [scaleMode, setScaleMode] = useState<"auto" | "zero">("auto");

  // Dynamic axis switcher mapping handler
  const handleDimensionChange = (newDimension: "time" | "branch" | "department") => {
    setDimension(newDimension);
    if (newDimension === "time") {
      setLeftMetric("net");
      setRightMetric("hours");
    } else if (newDimension === "branch") {
      setLeftMetric("profit");
      setRightMetric("attendanceRate");
    } else if (newDimension === "department") {
      setLeftMetric("expenses");
      setRightMetric("attendanceRate");
    }
  };

  // Helpers to safely extract month (0-11) and year from database objects
  const getPayrollMonthAndYear = (p: PayrollRecord) => {
    const dateStr = p.generated_at || p.updated_at;
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return { month: d.getMonth(), year: d.getFullYear() };
      }
    }
    if (p.cycleId === "c1" || p.cycleId === "c2" || p.cycleId === "c3") {
      return { month: 4, year: 2026 }; // May 2026
    }
    return null;
  };

  const getAttendanceMonthAndYear = (r: AttendanceRecord) => {
    if (r.date) {
      const parts = r.date.split("-");
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // 0-indexed month
        return { month, year };
      }
    }
    return null;
  };

  const isSourceEmpty = useMemo(() => {
    return (!payrollRecords || payrollRecords.length === 0) && (!attendanceRecords || attendanceRecords.length === 0);
  }, [payrollRecords, attendanceRecords]);

  // Chronological Month trends mapper
  const trendData = useMemo(() => {
    if (isSourceEmpty) {
      const defaultMonthsEmpty = [
        { key: "Jan", label: { fr: "Janvier", ht: "Janvye", en: "January" } },
        { key: "Feb", label: { fr: "Février", ht: "Fevriye", en: "February" } },
        { key: "Mar", label: { fr: "Mars", ht: "Mas", en: "March" } },
        { key: "Apr", label: { fr: "Avril", ht: "Avril", en: "April" } },
        { key: "May", label: { fr: "Mai", ht: "Me", en: "May" } },
        { key: "Jun", label: { fr: "Juin", ht: "Jen", en: "June" } },
        { key: "Jul", label: { fr: "Juillet", ht: "Jiyè", en: "July" } },
      ];
      return defaultMonthsEmpty.map((m) => ({
        key: m.key,
        label: m.label[langKey] || m.label.fr,
        gross: 0,
        net: 0,
        staff: 0,
        scans: 0,
        hours: 0,
      }));
    }

    if (snapshot && snapshot.historicalTrends && snapshot.historicalTrends.length > 0) {
      return snapshot.historicalTrends.map((t) => ({
        key: t.key,
        label: t.label,
        gross: t.gross,
        net: t.net,
        staff: t.staff,
        scans: t.scans,
        hours: t.hours,
      }));
    }

    const defaultMonths = [
      { key: "Jan", label: { fr: "Janvier", ht: "Janvye", en: "January" }, monthIdx: 0, year: 2026, gross: 120000, net: 110400, staff: 4, scans: 88, hours: 8.1 },
      { key: "Feb", label: { fr: "Février", ht: "Fevriye", en: "February" }, monthIdx: 1, year: 2026, gross: 125000, net: 115000, staff: 4, scans: 92, hours: 8.0 },
      { key: "Mar", label: { fr: "Mars", ht: "Mas", en: "March" }, monthIdx: 2, year: 2026, gross: 140000, net: 128800, staff: 5, scans: 112, hours: 8.2 },
      { key: "Apr", label: { fr: "Avril", ht: "Avril", en: "April" }, monthIdx: 3, year: 2026, gross: 140000, net: 128800, staff: 5, scans: 120, hours: 7.9 },
      { key: "May", label: { fr: "Mai", ht: "Me", en: "May" }, monthIdx: 4, year: 2026, gross: 180000, net: 165600, staff: 6, scans: 144, hours: 8.1 },
      { key: "Jun", label: { fr: "Juin", ht: "Jen", en: "June" }, monthIdx: 5, year: 2026, gross: 185000, net: 170200, staff: 6, scans: 156, hours: 8.3 },
      { key: "Jul", label: { fr: "Juillet", ht: "Jiyè", en: "July" }, monthIdx: 6, year: 2026, gross: 190000, net: 174800, staff: 7, scans: 162, hours: 8.4 },
    ];

    try {
      return defaultMonths.map((m) => {
        const matchingPayrolls = (payrollRecords || []).filter((p) => {
          const info = getPayrollMonthAndYear(p);
          return info && info.month === m.monthIdx && info.year === m.year;
        });

        const matchingAttendance = (attendanceRecords || []).filter((r) => {
          const info = getAttendanceMonthAndYear(r);
          return info && info.month === m.monthIdx && info.year === m.year;
        });

        let gross = 0;
        let net = 0;
        let staff = 0;
        let scans = 0;
        let hours = 0;

        if (matchingPayrolls.length > 0) {
          let sumGross = 0;
          let sumNet = 0;
          matchingPayrolls.forEach((p) => {
            sumGross += p.grossSalary || 0;
            sumNet += p.netPaid || 0;
          });
          gross = sumGross;
          net = sumNet;

          const uniquePayStaff = new Set(matchingPayrolls.map((p) => p.employeeId)).size;
          if (uniquePayStaff > 0) {
            staff = uniquePayStaff;
          }
        }

        if (matchingAttendance.length > 0) {
          scans = matchingAttendance.length;
          
          const uniqueAttStaff = new Set(matchingAttendance.map((r) => r.employeeId)).size;
          if (uniqueAttStaff > 0) {
            staff = Math.max(staff, uniqueAttStaff);
          }

          const sumHours = matchingAttendance.reduce((acc, r) => acc + (r.realHours || 0), 0);
          const avgHours = sumHours / matchingAttendance.length;
          if (avgHours > 0) {
            hours = parseFloat(avgHours.toFixed(1));
          }
        }

        return {
          key: m.key,
          label: m.label[langKey] || m.label.fr,
          gross,
          net,
          staff,
          scans,
          hours,
        };
      });
    } catch (e) {
      console.error("Error processing real-time chart data:", e);
      return defaultMonths.map(m => ({
        key: m.key,
        label: m.label[langKey] || m.label.fr,
        gross: 0,
        net: 0,
        staff: 0,
        scans: 0,
        hours: 0
      }));
    }
  }, [payrollRecords, attendanceRecords, langKey, snapshot, isSourceEmpty]);

  // Branch Performance mapper
  const branchesData = useMemo(() => {
    if (snapshot && snapshot.branchPerformance && snapshot.branchPerformance.length > 0) {
      return snapshot.branchPerformance.map((bp: any) => ({
        key: bp.branchId,
        name: bp.branchName,
        revenue: bp.revenue || 0,
        expenses: bp.expenses || 0,
        profit: bp.profit || 0,
        attendanceRate: bp.attendanceRate || 0,
        employeeCount: bp.employeeCount || 0,
        efficiencyScore: bp.efficiencyScore || 0,
      }));
    }
    return [
      { key: "b1", name: "Pétion-Ville", revenue: 1550000, expenses: 980000, profit: 570000, attendanceRate: 94.2, employeeCount: 8, efficiencyScore: 89 },
      { key: "b2", name: "Delmas", revenue: 1250000, expenses: 840000, profit: 410000, attendanceRate: 88.5, employeeCount: 6, efficiencyScore: 81 },
      { key: "b3", name: "Cap-Haïtien", revenue: 1120000, expenses: 730000, profit: 390000, attendanceRate: 91.0, employeeCount: 5, efficiencyScore: 84 },
      { key: "b4", name: "Carrefour", revenue: 920000, expenses: 680000, profit: 240000, attendanceRate: 84.8, employeeCount: 4, efficiencyScore: 73 }
    ];
  }, [snapshot]);

  // Department Performance mapper
  const departmentsData = useMemo(() => {
    if (snapshot && snapshot.departmentPerformance && snapshot.departmentPerformance.length > 0) {
      return snapshot.departmentPerformance.map((dp: any) => ({
        key: dp.departmentId,
        name: dp.departmentName,
        expenses: dp.expenses || 0,
        employeeCount: dp.employeeCount || 0,
        attendanceRate: dp.attendanceRate || 0,
        averageHours: dp.averageHours || 0,
      }));
    }
    return [
      { key: "d1", name: "Administration", expenses: 320000, employeeCount: 3, attendanceRate: 96.0, averageHours: 8.2 },
      { key: "d2", name: "Opérations / Logistique", expenses: 480000, employeeCount: 7, attendanceRate: 89.5, averageHours: 8.0 },
      { key: "d3", name: "Ventes / Marketing", expenses: 290000, employeeCount: 5, attendanceRate: 87.2, averageHours: 7.9 },
      { key: "d4", name: "Support Technique", expenses: 195000, employeeCount: 4, attendanceRate: 92.1, averageHours: 8.1 }
    ];
  }, [snapshot]);

  // Analyst config selectors
  const leftMetricOptions = useMemo(() => {
    if (dimension === "time") {
      return [
        { value: "net", label: l.net },
        { value: "gross", label: l.gross },
        { value: "scans", label: l.scans },
      ];
    } else if (dimension === "branch") {
      return [
        { value: "profit", label: l.profit },
        { value: "revenue", label: l.revenue },
        { value: "expenses", label: l.expenses },
      ];
    } else {
      return [
        { value: "expenses", label: l.expenses },
      ];
    }
  }, [dimension, l]);

  const rightMetricOptions = useMemo(() => {
    if (dimension === "time") {
      return [
        { value: "hours", label: l.hours },
        { value: "staff", label: l.staff },
        { value: "scans", label: l.scans },
      ];
    } else if (dimension === "branch") {
      return [
        { value: "attendanceRate", label: l.attendanceRate },
        { value: "employeeCount", label: l.employeeCount },
        { value: "efficiencyScore", label: l.efficiencyScore },
      ];
    } else {
      return [
        { value: "attendanceRate", label: l.attendanceRate },
        { value: "averageHours", label: l.averageHours },
        { value: "employeeCount", label: l.employeeCount },
      ];
    }
  }, [dimension, l]);

  // Filter & Sort Pipeline
  const processedDataset = useMemo(() => {
    let list: any[] = [];
    if (dimension === "time") {
      list = [...trendData];
    } else if (dimension === "branch") {
      list = [...branchesData];
    } else if (dimension === "department") {
      list = [...departmentsData];
    }

    // Apply Workforce threshold filter
    if (minStaffFilter > 0) {
      list = list.filter((item) => {
        const count = item.staff !== undefined ? item.staff : item.employeeCount;
        return (count || 0) >= minStaffFilter;
      });
    }

    // Apply sorting logic
    if (sortBy === "leftDesc") {
      list.sort((a, b) => (b[leftMetric] || 0) - (a[leftMetric] || 0));
    } else if (sortBy === "leftAsc") {
      list.sort((a, b) => (a[leftMetric] || 0) - (b[leftMetric] || 0));
    } else if (sortBy === "rightDesc") {
      list.sort((a, b) => (b[rightMetric] || 0) - (a[rightMetric] || 0));
    }

    return list;
  }, [dimension, trendData, branchesData, departmentsData, minStaffFilter, sortBy, leftMetric, rightMetric]);

  // KPI summary cards calculations
  const metricsSummary = useMemo(() => {
    if (isSourceEmpty) {
      return {
        totalNetBill: 0,
        avgActivity: 0,
        avgWorkforce: 0,
      };
    }

    if (snapshot) {
      return {
        totalNetBill: snapshot.payrollCost.currentValue,
        avgActivity: snapshot.attendanceRate.currentValue * 10,
        avgWorkforce: snapshot.activeStaff.currentValue,
      };
    }

    const totalNetBill = trendData.reduce((acc, m) => acc + m.net, 0);
    const avgActivity = trendData.reduce((acc, m) => acc + m.scans, 0);
    const avgWorkforce = trendData[trendData.length - 1]?.staff || 0;
    return {
      totalNetBill,
      avgActivity,
      avgWorkforce,
    };
  }, [trendData, snapshot, isSourceEmpty]);

  // Axis labels lookup for chart rendering
  const getMetricLabel = (key: string) => {
    const labelMapping: Record<string, string> = {
      gross: l.gross,
      net: l.net,
      staff: l.staff,
      scans: l.scans,
      hours: l.hours,
      revenue: l.revenue,
      expenses: l.expenses,
      profit: l.profit,
      attendanceRate: l.attendanceRate,
      efficiencyScore: l.efficiencyScore,
      averageHours: l.averageHours,
      employeeCount: l.employeeCount,
    };
    return labelMapping[key] || key;
  };

  // Recharts dynamic label formatters
  const formatYAxisLeft = (value: number): string => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return String(value);
  };

  const formatYAxisRight = (value: number): string => {
    if (["attendanceRate", "efficiencyScore"].includes(rightMetric)) {
      return `${value}%`;
    }
    return String(value);
  };

  // BI analyst tooltip constructor
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg shadow-xl font-sans text-[11px] text-slate-200">
          <p className="font-extrabold text-slate-100 border-b border-slate-800 pb-1 mb-1.5 uppercase font-mono tracking-wider">{label}</p>
          <div className="flex flex-col gap-1.5">
            {payload.map((entry: any, index: number) => {
              const isCurrency = ["gross", "net", "revenue", "expenses", "profit"].includes(entry.dataKey);
              const isPercent = ["attendanceRate", "efficiencyScore"].includes(entry.dataKey);
              const val = entry.value;
              let formattedVal = val;
              if (isCurrency) {
                formattedVal = `${val.toLocaleString()} HTG`;
              } else if (isPercent) {
                formattedVal = `${val.toFixed(1)}%`;
              } else if (entry.dataKey === "hours" || entry.dataKey === "averageHours") {
                formattedVal = `${val} hrs`;
              } else if (entry.dataKey === "staff" || entry.dataKey === "employeeCount") {
                formattedVal = `${val} staff`;
              }
              return (
                <div key={index} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.stroke || entry.fill }} />
                    {getMetricLabel(entry.dataKey)}:
                  </span>
                  <span className="font-mono font-bold text-slate-100">{formattedVal}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-5 w-full" id="payroll-activity-trends-widget">
      
      {/* Widget Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-950/40 border border-cyan-800/40">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
            </div>
            <h4 className="text-sm font-black tracking-tight text-slate-100 uppercase flex items-center gap-1">
              <span>{l.title}</span>
              <span className="text-[9px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-1.5 py-0.5 rounded font-mono uppercase tracking-wider">Dynamic AXIS</span>
            </h4>
          </div>
          <p className="text-[11px] text-slate-400 font-light mt-1">
            {l.desc}
          </p>
        </div>

        {/* X-Axis Dimension Selector Pills */}
        <div className="flex bg-slate-950/80 p-0.5 rounded-lg border border-slate-800 self-start sm:self-center" id="x-axis-dimension-selector">
          <button
            type="button"
            onClick={() => handleDimensionChange("time")}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition duration-200 flex items-center gap-1.5 ${
              dimension === "time"
                ? "bg-cyan-500 text-slate-950 shadow-md"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{l.time}</span>
          </button>
          <button
            type="button"
            onClick={() => handleDimensionChange("branch")}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition duration-200 flex items-center gap-1.5 ${
              dimension === "branch"
                ? "bg-cyan-500 text-slate-950 shadow-md"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>{l.branch}</span>
          </button>
          <button
            type="button"
            onClick={() => handleDimensionChange("department")}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition duration-200 flex items-center gap-1.5 ${
              dimension === "department"
                ? "bg-cyan-500 text-slate-950 shadow-md"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{l.department}</span>
          </button>
        </div>
      </div>

      {/* Advanced Analyst Custom Filters Panel */}
      <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3 text-xs" id="analyst-filters-control-bar">
        
        {/* Y1 Metric Selector */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold flex items-center gap-1">
            <BarChart3 className="w-3 h-3 text-cyan-400" />
            {l.leftMetric}
          </label>
          <select
            value={leftMetric}
            onChange={(e) => setLeftMetric(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none w-full font-medium"
          >
            {leftMetricOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Y2 Metric Selector */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-amber-400" />
            {l.rightMetric}
          </label>
          <select
            value={rightMetric}
            onChange={(e) => setRightMetric(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none w-full font-medium"
          >
            {rightMetricOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Sort Options */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold flex items-center gap-1">
            <ArrowUpDown className="w-3 h-3 text-sky-400" />
            {l.sorting}
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none w-full font-medium"
          >
            <option value="original">{l.sortOriginal}</option>
            <option value="leftDesc">{l.sortVal1Desc}</option>
            <option value="leftAsc">{l.sortVal1Asc}</option>
            <option value="rightDesc">{l.sortVal2Desc}</option>
          </select>
        </div>

        {/* Minimum Staff Segment Threshold */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold flex items-center gap-1">
            <Users className="w-3 h-3 text-indigo-400" />
            {l.minStaff}
          </label>
          <select
            value={minStaffFilter}
            onChange={(e) => setMinStaffFilter(parseInt(e.target.value, 10))}
            className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none w-full font-medium"
          >
            <option value="0">{l.minStaffAll}</option>
            <option value="3">&gt;= 3 {language === "ht" ? "Moun" : "Employés"}</option>
            <option value="5">&gt;= 5 {language === "ht" ? "Moun" : "Employés"}</option>
            <option value="7">&gt;= 7 {language === "ht" ? "Moun" : "Employés"}</option>
          </select>
        </div>

        {/* Y Axis Scale Adjustments */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold flex items-center gap-1">
            <SlidersHorizontal className="w-3 h-3 text-purple-400" />
            {l.scaleType}
          </label>
          <div className="flex items-center gap-1 h-[32px]">
            <button
              type="button"
              onClick={() => setScaleMode("auto")}
              className={`flex-1 h-full rounded-lg text-[10px] font-extrabold tracking-tight transition uppercase border ${
                scaleMode === "auto"
                  ? "bg-purple-950/30 text-purple-400 border-purple-800"
                  : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
              title={l.scaleAuto}
            >
              Zoom
            </button>
            <button
              type="button"
              onClick={() => setScaleMode("zero")}
              className={`flex-1 h-full rounded-lg text-[10px] font-extrabold tracking-tight transition uppercase border ${
                scaleMode === "zero"
                  ? "bg-purple-950/30 text-purple-400 border-purple-800"
                  : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
              title={l.scaleZero}
            >
              Zero
            </button>
          </div>
        </div>

        {/* Analyst Reset/Help Info node */}
        <div className="flex flex-col gap-1 justify-end">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-2 flex items-center gap-2 text-[10px] text-slate-400 font-light h-[34px]">
            <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>Dual-Y scale enables overlaying financial values with staff rates.</span>
          </div>
        </div>

      </div>

      {/* Main Graphical Canvas Stage */}
      <div className="w-full h-[320px] relative" id="recharts-composed-container">
        {processedDataset.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur-[1px] rounded-xl border border-slate-800/40 p-6 text-center z-10">
            <Calendar className="w-10 h-10 text-cyan-400/80 mb-2.5 animate-pulse" />
            <p className="text-xs font-bold uppercase tracking-wider text-slate-200">
              {language === "ht" ? "Pa gen done ki disponib" : language === "en" ? "No Segment matches filters" : "Aucun segment ne correspond aux filtres"}
            </p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-[340px] leading-relaxed font-light">
              {language === "ht" 
                ? "Eseye chanje filtè yo oswa retire limit anplwaye yo pou wè graf la." 
                : language === "en" 
                ? "Try relaxing the minimum workforce threshold or changing segment sorting variables to visualize data." 
                : "Essayez de baisser le seuil d'effectif minimum ou de changer de dimension pour visualiser les données."}
            </p>
          </div>
        )}
        {/* Chart Viewport */}
        <SafeChartContainer height="100%" minHeight={280}>
          <ComposedChart data={processedDataset} margin={{ top: 15, right: 15, left: 15, bottom: 5 }}>
            <defs>
              <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
            <XAxis
              dataKey={dimension === "time" ? "label" : "name"}
              stroke="#64748b"
              fontSize={10}
              fontFamily="JetBrains Mono, monospace"
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              stroke="#64748b"
              fontSize={10}
              fontFamily="JetBrains Mono, monospace"
              tickLine={false}
              axisLine={false}
              tickFormatter={formatYAxisLeft}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#64748b"
              fontSize={10}
              fontFamily="JetBrains Mono, monospace"
              tickLine={false}
              axisLine={false}
              tickFormatter={formatYAxisRight}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: "10px", marginTop: "10px", fontFamily: "Inter" }}
              iconSize={8}
            />

            {/* Left metric: Rendered as a beautiful volume area chart */}
            <Area
              yAxisId="left"
              name={getMetricLabel(leftMetric)}
              type="monotone"
              dataKey={leftMetric}
              fill="url(#colorNet)"
              stroke="#06b6d4"
              strokeWidth={2}
            />

            {/* Right metric: Rendered as a distinct overlay line chart */}
            <Line
              yAxisId="right"
              name={getMetricLabel(rightMetric)}
              type="monotone"
              dataKey={rightMetric}
              stroke="#f59e0b"
              strokeWidth={2.5}
              dot={{ r: 4, strokeWidth: 1 }}
              activeDot={{ r: 6 }}
            />
          </ComposedChart>
        </SafeChartContainer>
      </div>

      {/* Mini-Analytical Insights Cards */}
      <div className="grid grid-cols-3 gap-3 border-t border-slate-800/50 pt-4" id="trends-mini-analytics-grid">
        <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
          <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest flex items-center gap-1">
            <Coins className="w-3 h-3 text-cyan-400" /> WAGE VOL (6M)
          </span>
          <div className="font-mono text-xs font-black text-slate-200 mt-1 flex items-center gap-1 justify-between">
            <span>{metricsSummary.totalNetBill.toLocaleString()} HTG</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
          </div>
        </div>

        <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
          <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest flex items-center gap-1">
            <Users className="w-3 h-3 text-cyan-400" /> FINAL WORKFORCE
          </span>
          <div className="font-mono text-xs font-black text-slate-200 mt-1 flex items-center gap-1 justify-between">
            <span>{metricsSummary.avgWorkforce} Staff Members</span>
            <span className="text-[8px] bg-cyan-950 text-cyan-400 px-1 rounded font-normal">STABLE</span>
          </div>
        </div>

        <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
          <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest flex items-center gap-1">
            <Calendar className="w-3 h-3 text-emerald-400" /> SYSTEM SCANS
          </span>
          <div className="font-mono text-xs font-black text-emerald-400 mt-1 flex items-center gap-1 justify-between">
            <span>{metricsSummary.avgActivity} Checkins</span>
            <span className="text-[8px] bg-emerald-950 text-emerald-400 px-1 rounded font-normal">ACTIVE</span>
          </div>
        </div>
      </div>
    </div>
  );
}
