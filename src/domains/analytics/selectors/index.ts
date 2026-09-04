import {
  AnalyticsSnapshot,
  BranchPerformance,
  DepartmentPerformance,
  TrendPoint,
  ShortTermForecast,
} from "../types";
import { AnalyticsComparisonEngine, ComparisonDetails } from "../services/AnalyticsComparisonEngine";

/**
 * Pure Selectors for Sprint BI Core.
 * These selectors consume an AnalyticsSnapshot only, keeping calculations deterministic.
 */

export const getRevenue = (snapshot: AnalyticsSnapshot): ComparisonDetails => {
  return AnalyticsComparisonEngine.wrap(snapshot.revenue);
};

export const getExpenses = (snapshot: AnalyticsSnapshot): ComparisonDetails => {
  return AnalyticsComparisonEngine.wrap(snapshot.expenses);
};

export const getPayroll = (snapshot: AnalyticsSnapshot): ComparisonDetails => {
  return AnalyticsComparisonEngine.wrap(snapshot.payrollCost);
};

export const getAttendance = (snapshot: AnalyticsSnapshot): ComparisonDetails => {
  return AnalyticsComparisonEngine.wrap(snapshot.attendanceRate);
};

export const getDepartments = (snapshot: AnalyticsSnapshot): DepartmentPerformance[] => {
  return snapshot.departmentPerformance || [];
};

export const getBranches = (snapshot: AnalyticsSnapshot): BranchPerformance[] => {
  return snapshot.branchPerformance || [];
};

export const getProfit = (snapshot: AnalyticsSnapshot): ComparisonDetails => {
  return AnalyticsComparisonEngine.wrap(snapshot.profit);
};

export const getCashFlow = (snapshot: AnalyticsSnapshot): ComparisonDetails => {
  return AnalyticsComparisonEngine.wrap(snapshot.cashOnHand);
};

export const getForecast = (snapshot: AnalyticsSnapshot): ShortTermForecast => {
  return snapshot.forecast;
};

export const getAbsenteeism = (snapshot: AnalyticsSnapshot): ComparisonDetails => {
  return AnalyticsComparisonEngine.wrap(snapshot.absenceRate);
};

export const getNetMargin = (snapshot: AnalyticsSnapshot): number => {
  const currentRevenue = snapshot.revenue.currentValue;
  const currentProfit = snapshot.profit.currentValue;
  if (currentRevenue <= 0) return 0;
  return (currentProfit / currentRevenue) * 100;
};

export const getTopDepartments = (
  snapshot: AnalyticsSnapshot,
  limitCount = 3
): DepartmentPerformance[] => {
  return [...(snapshot.departmentPerformance || [])]
    .sort((a, b) => b.attendanceRate - a.attendanceRate)
    .slice(0, limitCount);
};

export const getTopBranches = (
  snapshot: AnalyticsSnapshot,
  limitCount = 3
): BranchPerformance[] => {
  return [...(snapshot.branchPerformance || [])]
    .sort((a, b) => b.efficiencyScore - a.efficiencyScore)
    .slice(0, limitCount);
};

export const getPayrollTrend = (snapshot: AnalyticsSnapshot): TrendPoint[] => {
  return snapshot.historicalTrends || [];
};

export const getAttendanceTrend = (snapshot: AnalyticsSnapshot): TrendPoint[] => {
  return snapshot.historicalTrends || [];
};
