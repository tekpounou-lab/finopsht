import { useState, useEffect, useMemo, useCallback } from "react";
import { Employee, LedgerTransaction, PayrollRecord, AttendanceRecord, Branch, Department, Business, ForensicLog } from "../../../types";
import { useBusinessContext } from "../../../contexts/BusinessContext";
import { CurrencyRateRepository } from "../../../repositories/CurrencyRateRepository";
import { useAnalytics } from "../../../domains/analytics/context/AnalyticsContext";
import { RankMetricType } from "./useBIUIState";
import { EnrichedDepartmentMetric, EnrichedBranchMetric, EmployeeScorecard, PayrollAggregates } from "../types";
import { filterOperationalEmployees } from "../../../services/workforce/EmployeeEligibilityService";
import { useDeepCompareMemo } from "../../../hooks/useDeepCompareMemo";

interface UseBIDataAggregationParams {
  currentBusiness?: Business;
  employees: Employee[];
  ledgerTransactions: LedgerTransaction[];
  payrollRecords: PayrollRecord[];
  attendanceRecords: AttendanceRecord[];
  branches: Branch[];
  departments: Department[];
  forensicLogs?: ForensicLog[];
  selectedBranchId: string;
  selectedDeptId: string;
  selectedTxType?: string;
  selectedAttendanceStatus?: string;
  selectedPaymentModel?: string;
  startDate: string;
  endDate: string;
  rankBy?: RankMetricType;
  employeeRankMetric?: RankMetricType;
  language: "fr" | "ht" | "en";
}

export function useBIDataAggregation({
  currentBusiness,
  employees,
  ledgerTransactions,
  payrollRecords,
  attendanceRecords,
  branches: _branches,
  departments: _departments,
  selectedBranchId,
  selectedDeptId,
  selectedTxType = "ALL",
  selectedAttendanceStatus = "ALL",
  selectedPaymentModel = "ALL",
  startDate,
  endDate,
  rankBy,
  employeeRankMetric,
  language,
}: UseBIDataAggregationParams) {
  const { snapshot } = useAnalytics();
  const { selectedCurrency, businessSettings } = useBusinessContext();
  const [usdToHtgRate, setUsdToHtgRate] = useState<number>(135.0);

  const isSocialTaxEnabled = useMemo(() => {
    if (businessSettings?.payroll?.taxes?.enabled !== undefined) {
      return Boolean(businessSettings.payroll.taxes.enabled);
    }
    if (businessSettings?.payroll?.enable_social_taxes !== undefined) {
      return Boolean(businessSettings.payroll.enable_social_taxes);
    }
    return false;
  }, [businessSettings]);

  useEffect(() => {
    let active = true;
    const fetchRate = async () => {
      if (!currentBusiness?.id) return;
      try {
        const rate = await CurrencyRateRepository.getLatestRate(currentBusiness.id, "USD", "HTG");
        if (active && rate) {
          setUsdToHtgRate(rate);
        }
      } catch (err) {
        console.warn("Failed to fetch latest exchange rate:", err);
      }
    };
    fetchRate();
    return () => {
      active = false;
    };
  }, [currentBusiness?.id]);

  // Operational Employees Filtering
  const operationalEmployees = useMemo(() => {
    return filterOperationalEmployees(employees || [], currentBusiness?.id);
  }, [employees, currentBusiness?.id]);

  const filteredEmployees = useMemo(() => {
    return operationalEmployees.filter((emp) => {
      if (selectedBranchId !== "ALL" && emp.branchId !== selectedBranchId) return false;
      if (selectedDeptId !== "ALL" && emp.departmentId !== selectedDeptId) return false;
      if (selectedPaymentModel !== "ALL" && emp.paymentModel !== selectedPaymentModel) return false;
      return true;
    });
  }, [operationalEmployees, selectedBranchId, selectedDeptId, selectedPaymentModel]);

  const filteredTx = useMemo(() => {
    if (!currentBusiness?.id) return [];
    return ledgerTransactions.filter((tx) => {
      if (tx.business_id !== currentBusiness.id) return false;
      if (tx.status === "REVERSED") return false;
      if (selectedBranchId !== "ALL" && tx.branchId !== selectedBranchId && (tx as any).branch_id !== selectedBranchId) return false;
      if (selectedDeptId !== "ALL" && tx.departmentId !== selectedDeptId && (tx as any).department_id !== selectedDeptId) return false;
      if (selectedTxType !== "ALL" && tx.type !== selectedTxType) return false;
      if (tx.date) {
        const d = tx.date.split("T")[0];
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
      }
      return true;
    });
  }, [ledgerTransactions, currentBusiness?.id, selectedBranchId, selectedDeptId, selectedTxType, startDate, endDate]);

  const filteredAttendance = useMemo(() => {
    if (!currentBusiness?.id) return [];
    return attendanceRecords.filter((rec) => {
      if (rec.business_id !== currentBusiness.id) return false;
      if (selectedBranchId !== "ALL" && rec.branchId !== selectedBranchId) return false;
      if (selectedAttendanceStatus !== "ALL" && rec.status !== selectedAttendanceStatus) return false;
      if (rec.date) {
        if (startDate && rec.date < startDate) return false;
        if (endDate && rec.date > endDate) return false;
      }
      return true;
    });
  }, [attendanceRecords, currentBusiness?.id, selectedBranchId, selectedAttendanceStatus, startDate, endDate]);

  const formatCurrencyValue = (valInHtg: number) => {
    if (selectedCurrency === "USD") {
      const converted = valInHtg / usdToHtgRate;
      return `${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    }
    return `${Math.round(valInHtg).toLocaleString()} HTG`;
  };

  const formatValueDirectly = (val: number) => {
    if (selectedCurrency === "USD") {
      return `${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    }
    return `${Math.round(val).toLocaleString()} HTG`;
  };

  // Centralized Snapshot Data with dynamic filter evaluation
  const biSnapshot = snapshot;
  const isFiltered = useDeepCompareMemo(() => Boolean(
    (selectedBranchId && selectedBranchId !== "ALL") ||
    (selectedDeptId && selectedDeptId !== "ALL") ||
    startDate ||
    endDate ||
    (selectedTxType && selectedTxType !== "ALL") ||
    (selectedPaymentModel && selectedPaymentModel !== "ALL") ||
    (selectedAttendanceStatus && selectedAttendanceStatus !== "ALL")
  ), [selectedBranchId, selectedDeptId, startDate, endDate, selectedTxType, selectedPaymentModel, selectedAttendanceStatus]);

  console.debug(`[PIC] [useBIDataAggregation] Aggregating dataset (isFiltered: ${isFiltered}):`, {
    selectedBranchId,
    selectedDeptId,
    startDate,
    endDate,
    filteredEmployeesCount: filteredEmployees.length,
    filteredTxCount: filteredTx.length,
    filteredAttendanceCount: filteredAttendance.length,
  });

  const totalRevenue = useMemo(() => {
    if (isFiltered || !biSnapshot) {
      return filteredTx.filter((t) => t.type === "INCOME").reduce((s, t) => s + t.amount, 0);
    }
    return biSnapshot?.revenue?.currentValue || 0;
  }, [isFiltered, biSnapshot?.revenue?.currentValue, filteredTx]);

  const totalExpenses = useMemo(() => {
    if (isFiltered || !biSnapshot) {
      return filteredTx.filter((t) => t.type === "EXPENSE" || t.type === "PAYROLL").reduce((s, t) => s + t.amount, 0);
    }
    return biSnapshot?.expenses?.currentValue || 0;
  }, [isFiltered, biSnapshot?.expenses?.currentValue, filteredTx]);

  const netProfit = totalRevenue - totalExpenses;
  const profitMarginPercentage = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;
  const financialStressScore = totalRevenue > 0 ? Math.min(100, Math.max(0, (totalExpenses / totalRevenue) * 100)) : 100;
  const totalAdvancesPending = biSnapshot?.advanceExposure?.currentValue || 0;
  const activeEmployeesCount = isFiltered ? filteredEmployees.length : (biSnapshot?.activeStaff?.currentValue || filteredEmployees.length || 0);

  const attendanceAggregates = useMemo(() => {
    if (isFiltered && filteredAttendance.length > 0) {
      const present = filteredAttendance.filter((a) => a.status !== "ABSENT").length;
      const late = filteredAttendance.filter((a) => a.status === "LATE").length;
      const absent = filteredAttendance.filter((a) => a.status === "ABSENT").length;
      const tot = filteredAttendance.length;
      const totalH = filteredAttendance.reduce((acc, a) => acc + (a.realHours ?? a.plannedHours ?? 8), 0);
      return {
        attendanceRate: Math.round((present / tot) * 100),
        latenessRate: Math.round((late / tot) * 100),
        absenceRate: Math.round((absent / tot) * 100),
        avgHours: Math.round((totalH / tot) * 10) / 10,
        overrides: 0,
      };
    }
    if (!biSnapshot) return { attendanceRate: 95, latenessRate: 3, absenceRate: 2, avgHours: 8, overrides: 0 };
    return {
      attendanceRate: biSnapshot.attendanceRate.currentValue,
      latenessRate: biSnapshot.latenessRate.currentValue,
      absenceRate: biSnapshot.absenceRate.currentValue,
      avgHours: biSnapshot.avgHoursWorked.currentValue,
      overrides: 0,
    };
  }, [isFiltered, filteredAttendance, biSnapshot]);

  // Payroll Aggregates
  const payrollAggregates: PayrollAggregates = useMemo(() => {
    if (!biSnapshot) return { payrollPaid: 0, commissionsPaid: 0, cnssContributions: 0, cnsContributions: 0, employerChargesSocials: 0, totalEmploymentCost: 0 };
    
    const records = payrollRecords || [];
    const totalCnss = isSocialTaxEnabled
      ? records.reduce((sum, p) => sum + (((p.cnss_employee_cents || 0) + (p.cnss_employer_cents || 0)) / 100 || (p.cnssDeduction || 0)), 0)
      : 0;
    const totalCns = isSocialTaxEnabled
      ? records.reduce((sum, p) => sum + (((p.cns_employee_cents || 0) + (p.ofatma_employer_cents || 0)) / 100 || (p.cnsDeduction || 0)), 0)
      : 0;
    const employerCharges = isSocialTaxEnabled
      ? records.reduce((sum, p) => sum + (((p.cnss_employer_cents || 0) + (p.ofatma_employer_cents || 0)) / 100), 0)
      : 0;

    return {
      payrollPaid: biSnapshot.payrollCost.currentValue,
      commissionsPaid: biSnapshot.commissionsPaid.currentValue,
      cnssContributions: Math.round(totalCnss + totalCns),
      cnsContributions: Math.round(totalCns),
      employerChargesSocials: Math.round(employerCharges),
      totalEmploymentCost: biSnapshot.payrollCost.currentValue,
    };
  }, [biSnapshot, payrollRecords, isSocialTaxEnabled]);

  // Branch Performance Details
  const branchMetrics: EnrichedBranchMetric[] = (biSnapshot?.branchPerformance || []).map((b) => ({
    branchId: b.branchId,
    branchName: b.branchName,
    employeeCount: b.employeeCount,
    revenue: b.revenue,
    expenses: b.expenses,
    profit: b.profit,
    margin: b.margin,
    attendanceRate: b.attendanceRate,
    efficiencyScore: b.efficiencyScore,
  }));

  const chartBranchData = useMemo(() => {
    return branchMetrics.map((bm) => {
      if (selectedCurrency === "USD") {
        return {
          ...bm,
          revenue: bm.revenue / usdToHtgRate,
          expenses: bm.expenses / usdToHtgRate,
          netProfit: bm.profit / usdToHtgRate,
        };
      }
      return {
        ...bm,
        netProfit: bm.profit,
      };
    });
  }, [branchMetrics, selectedCurrency, usdToHtgRate]);

  // Employee Scorecards with filter propagation
  const employeeScorecards: EmployeeScorecard[] = (biSnapshot?.employeeScorecards || [])
    .filter((sc: any) => {
      if (selectedBranchId !== "ALL" && sc.branchId !== selectedBranchId) return false;
      if (selectedDeptId !== "ALL" && sc.departmentId !== selectedDeptId) return false;
      return true;
    })
    .map((sc: any, idx: number) => ({
      employeeId: sc.employeeId,
      employeeName: sc.employeeName,
      branchId: sc.branchId,
      departmentId: sc.departmentId,
      totalHours: sc.totalHours,
      plannedHours: sc.plannedHours || sc.totalHours || 0,
      hoursVariance: sc.hoursVariance || 0,
      baseSalary: sc.baseSalary || 0,
      commissions: sc.commissions || 0,
      attendanceConsistencyScore: sc.attendanceConsistencyScore || 0,
      latenessScore: sc.latenessScore || 0,
      productivityIndex: sc.productivityIndex || 0,
      hourlyEfficiencyRatio: sc.hourlyEfficiencyRatio || 0,
      rank: idx + 1,
    }));

  // Department Performance details
  const departmentMetrics = biSnapshot?.departmentPerformance || [];

  const enrichedDepartmentMetrics: EnrichedDepartmentMetric[] = useMemo(() => {
    if (!currentBusiness?.id) return [];
    return departmentMetrics.map((dm: any) => {
      const deptEmployees = employees.filter(
        (e) => e.departmentId === dm.departmentId || (e as any).department_id === dm.departmentId
      );
      const deptEmpIds = new Set(deptEmployees.map((e) => e.id));

      const deptTxs = ledgerTransactions.filter((t) => {
        if (t.business_id !== currentBusiness.id) return false;
        if (selectedBranchId !== "ALL" && t.branchId !== selectedBranchId && (t as any).branch_id !== selectedBranchId) return false;
        if (t.date) {
          const txDate = t.date.split("T")[0];
          if (startDate && txDate < startDate) return false;
          if (endDate && txDate > endDate) return false;
        }
        return (
          t.departmentId === dm.departmentId ||
          (t as any).department_id === dm.departmentId ||
          (t.employeeId && deptEmpIds.has(t.employeeId)) ||
          ((t as any).employee_id && deptEmpIds.has((t as any).employee_id))
        );
      });

      const revenue = deptTxs.filter((t) => t.type === "INCOME").reduce((s, t) => s + t.amount, 0);
      const expenses = deptTxs.filter((t) => t.type === "EXPENSE" || t.type === "PAYROLL").reduce((s, t) => s + t.amount, 0);
      const margin = revenue > 0 ? ((revenue - expenses) / revenue) * 100 : 0;
      const avgHours = dm.avgHours || 8;
      const productivityScore = dm.productivityScore || 85;

      return {
        departmentId: dm.departmentId,
        departmentName: dm.departmentName,
        name: dm.departmentName,
        employeeCount: dm.employeeCount,
        totalStaff: dm.employeeCount,
        averageHours: avgHours,
        avgHours: avgHours,
        attendanceRate: dm.attendanceRate || 90,
        productivityScore: productivityScore,
        revenue,
        expenses,
        margin,
        formattedRevenue: formatCurrencyValue(revenue),
        formattedExpenses: formatCurrencyValue(expenses),
      };
    });
  }, [departmentMetrics, employees, ledgerTransactions, currentBusiness?.id, selectedBranchId, startDate, endDate, formatCurrencyValue]);

  // Ranked Employees
  const effectiveRankMetric = rankBy || employeeRankMetric || "productivity";
  const rankedEmployees = useMemo(() => {
    return [...employeeScorecards].sort((a, b) => {
      if (effectiveRankMetric === "hours") return b.totalHours - a.totalHours;
      if (effectiveRankMetric === "commissions") return b.commissions - a.commissions;
      if (effectiveRankMetric === "attendance") return b.attendanceConsistencyScore - a.attendanceConsistencyScore;
      return b.productivityIndex - a.productivityIndex;
    });
  }, [employeeScorecards, effectiveRankMetric]);

  // Cashflow Timeline
  const cashflowTimeline = useMemo(() => {
    const hist = (biSnapshot as any)?.historicalCashflow;
    if (!hist || !Array.isArray(hist)) return [];
    return hist.map((t: any) => ({
      date: t.date,
      Revenus: t.revenue,
      Dépenses: t.expenses,
      Net: t.net,
    }));
  }, [biSnapshot]);

  // Expense Categories
  const expenseCategoryChartData = useMemo(() => {
    return biSnapshot?.expenseBreakdown && biSnapshot.expenseBreakdown.length > 0
      ? biSnapshot.expenseBreakdown
      : [{ name: "Aucune Dépense", value: 1 }];
  }, [biSnapshot]);

  // Dashboard Chart Data
  const dashboardChartData = useMemo(() => {
    if (!currentBusiness?.id) return [];
    const txs = ledgerTransactions.filter(
      (tx) => tx.business_id === currentBusiness.id && tx.status !== "REVERSED"
    );

    const sortedTxs = [...txs].sort((a, b) => a.date.localeCompare(b.date));
    const dateMap: Record<string, { date: string; revenue: number; expenses: number; net: number }> = {};

    sortedTxs.forEach((tx) => {
      const dateStr = tx.date;
      let formattedDate = dateStr;
      try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          formattedDate = d.toLocaleDateString(language === "fr" ? "fr-FR" : "en-US", {
            day: "numeric",
            month: "short",
          });
        }
      } catch (e) {}

      if (!dateMap[dateStr]) {
        dateMap[dateStr] = {
          date: formattedDate,
          revenue: 0,
          expenses: 0,
          net: 0,
        };
      }

      if (tx.type === "INCOME") {
        dateMap[dateStr].revenue += tx.amount;
      } else if (tx.type === "PAYROLL") {
        dateMap[dateStr].expenses += tx.amount;
      } else if (tx.type === "EXPENSE") {
        if (!tx.metadata?.payrollCycleId) {
          dateMap[dateStr].expenses += tx.amount;
        }
      }
    });

    const list = Object.keys(dateMap)
      .sort()
      .map((key) => {
        const item = dateMap[key];
        item.net = item.revenue - item.expenses;
        return item;
      });

    return list.slice(-10);
  }, [ledgerTransactions, currentBusiness?.id, language]);

  return {
    biSnapshot,
    snapshot: biSnapshot,
    usdToHtgRate,
    isSocialTaxEnabled,
    selectedCurrency,
    formatCurrencyValue,
    formatValueDirectly,
    totalRevenue,
    totalExpenses,
    netProfit,
    profitMarginPercentage,
    financialStressScore,
    totalAdvancesPending,
    activeEmployeesCount,
    attendanceAggregates,
    attendanceConsistencyPct: attendanceAggregates.attendanceRate,
    payrollAggregates,
    payrollTaxesTotal: payrollAggregates.cnssContributions,
    totalPayrollMass: payrollAggregates.totalEmploymentCost,
    totalCommissionPaid: payrollAggregates.commissionsPaid,
    totalAdvancesIssued: totalAdvancesPending,
    avgHoursClocked: attendanceAggregates.avgHours,
    unplannedAbsenteeismRate: attendanceAggregates.absenceRate,
    burnRatePercentage: totalRevenue > 0 ? Math.round((totalExpenses / totalRevenue) * 100) : 0,
    cnsTaxesAmount: payrollAggregates.cnsContributions,
    cnssTaxesAmount: payrollAggregates.cnssContributions,
    branchMetrics,
    chartBranchData,
    employeeScorecards,
    departmentMetrics,
    enrichedDepartmentMetrics,
    rankedEmployees,
    cashflowTimeline,
    expenseCategoryChartData,
    dashboardChartData,
    filteredEmployees,
    filteredTx,
    filteredAttendance,
  };
}
