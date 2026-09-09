import {
  PICFilters,
  RawPerformanceDataSet,
  SimplifiedMetrics,
  ExpertMetrics,
  DepartmentMetricBreakdown,
  BranchMetricBreakdown,
  TrendDataPoint,
  EmployeePerformanceRanking,
  CrossTableMatrixCell,
} from "../types";
import { AnalyticsEngine } from "../../analytics/services/AnalyticsEngine";
import { toDateOnly } from "../../../utils/dateNormalization";

/**
 * Normalizes filter string for case-insensitive matching
 */
const normalize = (str?: string) => (str || "").toLowerCase().trim();

/**
 * Robust date string normalizer (YYYY-MM-DD)
 */
export const normalizeDateStr = (rawDate: any): string => toDateOnly(rawDate);

/**
 * Filter raw dataset by business filters (Period, Branch, Department, MetricType, Search)
 */
export function selectFilteredDataSet(
  raw: RawPerformanceDataSet,
  filters: PICFilters
) {
  const { branchId, departmentId, startDate, endDate, searchQuery, metricType } = filters;
  const normalizedQuery = normalize(searchQuery);

  console.info(`[PIC] [Selectors] Filtering dataset with:`, {
    branchId,
    departmentId,
    startDate,
    endDate,
    metricType,
    searchQuery: normalizedQuery || "[NONE]",
  });

  // 1. Filter Employees
  const filteredEmployees = (raw.employees || []).filter((emp) => {
    // Branch Filter
    if (branchId && branchId !== "ALL") {
      const empBranch = emp.branchId || emp.branch_id;
      if (empBranch !== branchId) return false;
    }
    // Department Filter
    if (departmentId && departmentId !== "ALL") {
      const empDept = emp.departmentId || emp.department_id;
      if (empDept !== departmentId) return false;
    }
    // Search Filter
    if (normalizedQuery) {
      const name = normalize(emp.name || `${emp.firstName || ""} ${emp.lastName || ""}`);
      const email = normalize(emp.email);
      const role = normalize(emp.role || emp.position);
      if (!name.includes(normalizedQuery) && !email.includes(normalizedQuery) && !role.includes(normalizedQuery)) {
        return false;
      }
    }
    return true;
  });

  const employeeIdSet = new Set(filteredEmployees.map((e) => e.id));

  // 2. Filter Ledger Transactions
  const filteredTransactions = (raw.transactions || []).filter((tx) => {
    if (tx.status === "REVERSED" || tx.status === "VOID" || tx.status === "CANCELLED") return false;

    // Branch Filter
    if (branchId && branchId !== "ALL") {
      const txBranch = tx.branchId || tx.branch_id;
      if (txBranch && txBranch !== branchId) return false;
    }
    // Department Filter
    if (departmentId && departmentId !== "ALL") {
      const txDept = tx.departmentId || tx.department_id;
      if (txDept && txDept !== departmentId) return false;
    }
    // Date Range Filter
    const rawTxDate = tx.date || tx.transaction_date || tx.transactionDate || tx.created_at || tx.createdAt || tx.timestamp;
    if (rawTxDate) {
      const txDate = normalizeDateStr(rawTxDate);
      if (startDate && txDate < startDate) return false;
      if (endDate && txDate > endDate) return false;
    }
    // Metric Type Filter
    if (metricType === "revenue" && tx.type !== "INCOME") return false;
    if (metricType === "payroll" && tx.type !== "PAYROLL" && tx.category !== "PAYROLL") return false;

    // Search Query Filter
    if (normalizedQuery) {
      const desc = normalize(tx.description || tx.memo);
      const ref = normalize(tx.reference || tx.id);
      if (!desc.includes(normalizedQuery) && !ref.includes(normalizedQuery)) {
        return false;
      }
    }

    return true;
  });

  // 3. Filter Payroll Records
  const filteredPayrollRecords = (raw.payrollRecords || []).filter((p) => {
    // Branch Filter
    if (branchId && branchId !== "ALL") {
      const pBranch = p.branchId || p.branch_id;
      if (pBranch && pBranch !== branchId) return false;
    }
    // Department Filter
    if (departmentId && departmentId !== "ALL") {
      const pDept = p.departmentId || p.department_id;
      if (pDept && pDept !== departmentId) return false;
    }
    // Date Filter (cycle or payment date)
    const rawPDate = p.paymentDate || p.periodEndDate || p.createdAt || p.created_at || p.date;
    const pDate = normalizeDateStr(rawPDate);
    if (pDate) {
      if (startDate && pDate < startDate) return false;
      if (endDate && pDate > endDate) return false;
    }
    // Employee Match Filter
    const pEmpId = p.employeeId || p.employee_id;
    if (filteredEmployees.length > 0 && pEmpId && !employeeIdSet.has(pEmpId)) {
      if ((branchId && branchId !== "ALL") || (departmentId && departmentId !== "ALL") || normalizedQuery) {
        return false;
      }
    }
    return true;
  });

  // 4. Filter Attendance Records
  const filteredAttendance = (raw.attendanceRecords || []).filter((att) => {
    // Branch Filter
    if (branchId && branchId !== "ALL") {
      const attBranch = att.branchId || att.branch_id;
      if (attBranch && attBranch !== branchId) return false;
    }
    // Date Filter
    const rawAttDate = att.date || att.timestamp || att.created_at || att.createdAt;
    const attDate = normalizeDateStr(rawAttDate);
    if (attDate) {
      if (startDate && attDate < startDate) return false;
      if (endDate && attDate > endDate) return false;
    }
    // Employee match
    const attEmpId = att.employeeId || att.employee_id;
    if (attEmpId && ((branchId && branchId !== "ALL") || (departmentId && departmentId !== "ALL") || normalizedQuery)) {
      if (!employeeIdSet.has(attEmpId)) return false;
    }
    return true;
  });

  console.info(`[PIC] [Selectors] Filtered results summary:`, {
    matchedEmployees: filteredEmployees.length,
    matchedTransactions: filteredTransactions.length,
    matchedPayrolls: filteredPayrollRecords.length,
    matchedAttendance: filteredAttendance.length,
  });

  return {
    employees: filteredEmployees,
    transactions: filteredTransactions,
    payrollRecords: filteredPayrollRecords,
    attendanceRecords: filteredAttendance,
    branches: raw.branches || [],
    departments: raw.departments || [],
    snapshots: raw.snapshots || [],
  };
}

/**
 * Calculates simplified overview metrics (Mode simplifié) using AnalyticsEngine SSOT
 */
export function selectSimplifiedMetrics(
  raw: RawPerformanceDataSet,
  filters: PICFilters
): SimplifiedMetrics {
  const filtered = selectFilteredDataSet(raw, filters);
  const { employees, transactions, payrollRecords, attendanceRecords, branches, departments } = filtered;

  const businessId =
    employees[0]?.business_id ||
    transactions[0]?.business_id ||
    payrollRecords[0]?.business_id ||
    branches[0]?.business_id ||
    departments[0]?.business_id ||
    "";

  // Generate SSOT snapshot via AnalyticsEngine
  const snap = AnalyticsEngine.generateSnapshot(
    "CUSTOM",
    { startDate: filters.startDate, endDate: filters.endDate },
    employees,
    transactions,
    attendanceRecords,
    payrollRecords,
    branches,
    departments,
    [],
    businessId,
    "fr"
  );

  const totalRevenue = Math.round(snap.revenue.currentValue);
  const totalExpenses = Math.round(snap.expenses.currentValue);
  const netProfit = Math.round(snap.profit.currentValue);
  const profitMargin = Math.round(snap.profitMargin);
  const totalPayroll = Math.round(snap.payrollCost.currentValue);
  const activeHeadcount = snap.activeStaff.currentValue || employees.filter((e) => e.status === "ACTIVE" || !e.status).length;
  const attendanceRate = snap.attendanceRate.currentValue;
  const averageHoursWorked = snap.avgHoursWorked.currentValue;

  const inactiveCount = employees.filter((e) => e.status === "TERMINATED" || e.status === "INACTIVE").length;
  const turnoverRate = employees.length > 0 ? Math.round((inactiveCount / employees.length) * 100) : 0;

  let totalCommissions = 0;
  let overtimeHoursTotal = 0;
  payrollRecords.forEach((p: any) => {
    totalCommissions += p.commissionAmount || p.commissionsHTG || (p.commission_cents ? p.commission_cents / 100 : 0) || 0;
    overtimeHoursTotal += (p.overtimeHours150 || 0) + (p.overtimeHours200 || 0);
  });

  const totalRecordsCount = employees.length + transactions.length + payrollRecords.length + attendanceRecords.length;
  const isDataAvailable = totalRecordsCount > 0;

  const metrics: SimplifiedMetrics = {
    totalPayroll,
    activeHeadcount,
    turnoverRate,
    attendanceRate,
    totalRevenue,
    totalExpenses,
    netProfit,
    profitMargin,
    averageHoursWorked,
    overtimeHoursTotal,
    totalCommissions: Math.round(totalCommissions),
    isDataAvailable,
    totalRecordsCount,
  };

  console.info(`[PIC] [Selectors] selectSimplifiedMetrics output (SSOT):`, metrics);
  return metrics;
}

/**
 * Calculates comprehensive expert metrics & multi-dimensional tables (Mode expert) using AnalyticsEngine SSOT
 */
export function selectExpertMetrics(
  raw: RawPerformanceDataSet,
  filters: PICFilters
): ExpertMetrics {
  const kpis = selectSimplifiedMetrics(raw, filters);
  const filtered = selectFilteredDataSet(raw, filters);
  const { employees, transactions, payrollRecords, attendanceRecords, departments: allDepts, branches: allBranches } = filtered;

  const businessId =
    employees[0]?.business_id ||
    transactions[0]?.business_id ||
    payrollRecords[0]?.business_id ||
    allBranches[0]?.business_id ||
    allDepts[0]?.business_id ||
    "";

  // Generate SSOT snapshot via AnalyticsEngine
  const snap = AnalyticsEngine.generateSnapshot(
    "CUSTOM",
    { startDate: filters.startDate, endDate: filters.endDate },
    employees,
    transactions,
    attendanceRecords,
    payrollRecords,
    allBranches,
    allDepts,
    [],
    businessId,
    "fr"
  );

  // 1. Department Breakdown
  const departments: DepartmentMetricBreakdown[] = (snap.departmentPerformance || []).map((d: any) => {
    const rev = d.revenue || 0;
    const exp = d.expenses || (d.payrollCost || 0) + (d.nonPayrollExpenses || 0);
    const margin = rev > 0 ? Math.round(((rev - exp) / rev) * 100) : 0;
    return {
      departmentId: d.departmentId || d.id || "gen",
      departmentName: d.departmentName || d.name || "Département",
      headcount: d.employeeCount || 0,
      payroll: Math.round(d.payrollCost ?? d.payroll ?? d.expenses ?? 0),
      attendanceRate: d.attendanceRate || 95,
      revenue: Math.round(rev),
      expenses: Math.round(exp),
      netMargin: d.margin !== undefined ? Math.round(d.margin) : margin,
      commissions: Math.round(d.commissions || 0),
    };
  });

  // 2. Branch Breakdown
  const branches: BranchMetricBreakdown[] = (snap.branchPerformance || []).map((b: any) => {
    return {
      branchId: b.branchId || b.id || "gen",
      branchName: b.branchName || b.name || "Succursale",
      headcount: b.employeeCount || 0,
      payroll: Math.round(b.payrollCost ?? b.payroll ?? b.expenses ?? 0),
      attendanceRate: b.attendanceRate || 95,
      revenue: Math.round(b.revenue || 0),
      efficiencyScore: b.efficiencyScore || 80,
    };
  });

  // 3. Historical Trends
  const trends: TrendDataPoint[] = (snap.historicalTrends || []).map((t: any) => {
    return {
      date: t.label || t.key || "",
      label: t.label || t.key || "",
      payroll: Math.round(t.payroll || 0),
      revenue: Math.round(t.gross || 0),
      headcount: t.headcount || 0,
      attendanceRate: t.attendanceRate || 95,
      expenses: Math.round(t.expenses || 0),
    };
  });

  // 4. Employee Rankings
  const employeeRankings: EmployeePerformanceRanking[] = (snap.employeeScorecards || []).map((s: any, idx: number) => {
    return {
      employeeId: s.employeeId || `emp_${idx}`,
      employeeName: s.employeeName || "Collaborateur",
      departmentId: s.departmentId || "",
      departmentName: s.departmentName || "Non assigné",
      branchId: s.branchId || "",
      branchName: s.branchName || "Siège",
      totalHours: s.totalHours ?? s.hoursWorked ?? 0,
      attendanceScore: s.attendanceConsistencyScore ?? s.attendanceScore ?? 95,
      salesVolume: Math.round(s.salesVolume || 0),
      commission: Math.round(s.commissions ?? s.commissionEarned ?? 0),
      productivityIndex: s.productivityIndex || 85,
      rank: s.rank || idx + 1,
    };
  });

  // 5. Cross Table Matrix (Dept x Branch)
  const crossTableMatrix: CrossTableMatrixCell[] = [];
  allDepts.forEach((dept) => {
    allBranches.forEach((branch) => {
      const deptEmp = employees.filter(
        (e) =>
          (e.departmentId === dept.id || e.department_id === dept.id) &&
          (e.branchId === branch.id || e.branch_id === branch.id)
      );
      if (deptEmp.length > 0) {
        const empScorecards = (snap.employeeScorecards || []).filter((s: any) =>
          deptEmp.some((e) => e.id === s.employeeId)
        );
        const matrixRev = empScorecards.reduce((sum: number, s: any) => sum + (s.salesVolume || 0), 0);
        const matrixPayroll = empScorecards.reduce((sum: number, s: any) => sum + (s.payrollCost || s.baseSalary || 0), 0);
        const matrixAtt = empScorecards.length > 0
          ? Math.round(empScorecards.reduce((sum: number, s: any) => sum + (s.attendanceConsistencyScore || 0), 0) / empScorecards.length)
          : 95;
        crossTableMatrix.push({
          departmentId: dept.id,
          departmentName: dept.name || dept.id,
          branchId: branch.id,
          branchName: branch.name || branch.id,
          headcount: deptEmp.length,
          payroll: Math.round(matrixPayroll),
          revenue: Math.round(matrixRev),
          attendanceRate: matrixAtt,
        });
      }
    });
  });

  return {
    kpis,
    departments,
    branches,
    trends,
    employeeRankings,
    crossTableMatrix,
    isDataAvailable: kpis.isDataAvailable,
  };
}
