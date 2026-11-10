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
  TillDiscrepancyAlert,
} from "../types";
import { AnalyticsEngine } from "../../analytics/services/AnalyticsEngine";
import {
  toDateOnly,
  matchesDateFilter,
  resolveAnalyticsTxDate,
  resolveAnalyticsAttendanceDate,
  resolveAnalyticsPayrollDate,
} from "../../../utils/dateNormalization";
import { CashBasisEngine } from "../../cash/engine/CashBasisEngine";

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
  const filterBusinessId = (filters as any).businessId || (filters as any).business_id;
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
    if (filterBusinessId && emp.business_id && emp.business_id !== filterBusinessId) return false;
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
    if (filterBusinessId) {
      const txBiz = tx.business_id || (tx as any).businessId;
      if (txBiz && txBiz !== filterBusinessId) return false;
    }
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
    const isCashBasis = (filters as any).accountingMode === "CASH";
    const txDate = resolveAnalyticsTxDate(tx, isCashBasis);
    if (!matchesDateFilter(txDate, startDate, endDate)) {
      return false;
    }
    // Metric Type Filter
    const typeUpper = (tx.type || "").toUpperCase();
    const catUpper = (tx.category || (tx as any).category_name || "").toUpperCase();
    const isIncomeTx =
      ["INCOME", "REVENUE", "SALES", "VENTE", "VENTES", "CREDIT"].includes(typeUpper) ||
      catUpper.includes("INCOME") ||
      catUpper.includes("REVENUE") ||
      catUpper.includes("VENTE") ||
      catUpper.includes("RECETTE") ||
      catUpper.includes("SALES");

    if (metricType === "revenue" && !isIncomeTx) return false;
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
    if (filterBusinessId) {
      const pBiz = p.business_id || (p as any).businessId;
      if (pBiz && pBiz !== filterBusinessId) return false;
    }
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
    // Date Filter (cycle, period overlap, or payment date)
    const isCashBasis = (filters as any).accountingMode === "CASH";
    if (isCashBasis) {
      const pDate = resolveAnalyticsPayrollDate(p, true);
      if (!matchesDateFilter(pDate, startDate, endDate)) {
        return false;
      }
    } else if (startDate || endDate) {
      const pStart = normalizeDateStr(p.period_start || p.periodStart || p.startDate);
      const pEnd = normalizeDateStr(p.period_end || p.periodEnd || p.periodEndDate || p.endDate);
      const paymentDate = normalizeDateStr(p.paymentDate || p.effectiveAccountingDate);

      if (paymentDate && matchesDateFilter(paymentDate, startDate, endDate)) {
        // Explicit payment date in period
      } else if (pStart && pEnd) {
        // Range overlap: !(recEnd < startDate || recStart > endDate)
        if (startDate && pEnd < startDate) return false;
        if (endDate && pStart > endDate) return false;
      } else {
        const rawPDate = paymentDate || pEnd || pStart || p.createdAt || p.created_at || p.date;
        const pDate = normalizeDateStr(rawPDate);
        if (!matchesDateFilter(pDate, startDate, endDate)) return false;
      }
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
    const attDate = resolveAnalyticsAttendanceDate(att);
    if (!matchesDateFilter(attDate, startDate, endDate)) {
      return false;
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
  filters: PICFilters,
  normalizationContext?: any
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
  const snap = AnalyticsEngine.generateSnapshot({
    period: "CUSTOM",
    customRange: { startDate: filters.startDate, endDate: filters.endDate },
    employees,
    transactions,
    attendanceLogs: attendanceRecords,
    payrollRecords,
    branches,
    departments,
    businessId,
    language: "fr",
    accountingMode: filters.accountingBasis || (filters as any).accountingMode || "CASH",
    normalizationContext,
  });

  const totalRevenue = Math.round(snap.revenue.currentValue);
  const totalExpenses = Math.round(snap.expenses.currentValue);
  const netProfit = Math.round(snap.profit.currentValue);
  const profitMargin = Math.round(snap.profitMargin);
  const totalPayroll = Math.round(snap.payrollCost.currentValue);
  const activeHeadcount = snap.activeStaff.currentValue ?? (employees.filter((e) => e.status === "ACTIVE" || !e.status).length);
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

  const activityRecordsCount = transactions.length + payrollRecords.length + attendanceRecords.length;
  const totalRecordsCount = employees.length + activityRecordsCount;
  const isDataAvailable = activityRecordsCount > 0;

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
    incompleteConfigCount: (snap as any).incompleteConfigCount || 0,
  };

  console.info(`[PIC] [Selectors] selectSimplifiedMetrics output (SSOT):`, metrics);
  return metrics;
}

/**
 * Calculates comprehensive expert metrics & multi-dimensional tables (Mode expert) using AnalyticsEngine SSOT
 */
export function selectExpertMetrics(
  raw: RawPerformanceDataSet,
  filters: PICFilters,
  normalizationContext?: any
): ExpertMetrics {
  const kpis = selectSimplifiedMetrics(raw, filters, normalizationContext);
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
  const snap = AnalyticsEngine.generateSnapshot({
    period: "CUSTOM",
    customRange: { startDate: filters.startDate, endDate: filters.endDate },
    employees,
    transactions,
    attendanceLogs: attendanceRecords,
    payrollRecords,
    branches: allBranches,
    departments: allDepts,
    contracts: [],
    businessId,
    language: "fr",
    accountingMode: filters.accountingBasis || (filters as any).accountingMode || "CASH",
    normalizationContext,
  });

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
      attendanceRate: d.attendanceRate ?? null,
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
      attendanceRate: b.attendanceRate ?? null,
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
      attendanceRate: t.attendanceRate ?? null,
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
      attendanceScore: s.attendanceConsistencyScore !== undefined ? s.attendanceConsistencyScore : (s.attendanceScore ?? null),
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
        const computableMatrixScorecards = empScorecards.filter(
          (s: any) => typeof s.attendanceConsistencyScore === "number" && !isNaN(s.attendanceConsistencyScore)
        );
        const matrixAtt = computableMatrixScorecards.length > 0
          ? Math.round(
              computableMatrixScorecards.reduce((sum: number, s: any) => sum + s.attendanceConsistencyScore, 0) /
                computableMatrixScorecards.length
            )
          : null;
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

  // 6. Till Closure Operational Risk Discrepancy Alerts (Zero P&L/EBITDA Impact)
  const operationalAuditAlerts: TillDiscrepancyAlert[] = [];
  (transactions || []).forEach((tx: any) => {
    const catUpper = (tx.category || tx.category_name || "").toString().toUpperCase();
    const typeUpper = (tx.type || "").toString().toUpperCase();
    const descUpper = (tx.description || tx.memo || "").toString().toUpperCase();
    if (
      catUpper.includes("TILL_DISCREPANCY") ||
      catUpper.includes("CASH_SHORTAGE") ||
      catUpper.includes("FLOAT_VARIANCE") ||
      typeUpper.includes("TILL_DISCREPANCY") ||
      descUpper.includes("ÉCART DE CAISSE") ||
      descUpper.includes("ECART DE CAISSE")
    ) {
      operationalAuditAlerts.push({
        id: tx.id,
        tillId: tx.till_id || tx.tillId || "till_gen",
        tillName: tx.till_name || tx.tillName || "Caisse",
        branchId: tx.branch_id || tx.branchId,
        branchName: tx.branch_name || tx.branchName,
        tellerName: tx.created_by_name || tx.teller_name || "Caissier",
        discrepancyAmount: tx.amount || (tx.amount_cents ? tx.amount_cents / 100 : 0),
        currency: tx.currency || "HTG",
        closedAt: tx.created_at || tx.createdAt || tx.date,
        sessionId: tx.till_session_id || tx.tillSessionId || tx.id,
        notes: tx.memo || tx.description
      });
    }
  });

  return {
    kpis,
    departments,
    branches,
    trends,
    employeeRankings,
    crossTableMatrix,
    isDataAvailable: kpis.isDataAvailable,
    operationalAuditAlerts,
  };
}

/**
 * Calculates expert metrics in Cash-Basis (Constaté / Trésorerie / Décaissement)
 */
export function selectCashBasisExpertMetrics(
  raw: RawPerformanceDataSet,
  filters: PICFilters,
  normalizationContext?: any
): ExpertMetrics {
  const { startDate, endDate } = filters;
  const filtered = selectFilteredDataSet(raw, filters);
  
  // Filter payroll records strictly by payment date / cash disbursement date in range
  const cashBasisPayrolls = filtered.payrollRecords.filter((p: any) => {
    const rawPayDate = p.paymentDate || p.effectiveAccountingDate || p.createdAt || p.created_at || p.date || p.period_end || p.periodEnd;
    const payDate = normalizeDateStr(rawPayDate);
    if (!startDate || !endDate) return true;
    if (!payDate) return true;
    return payDate >= startDate && payDate <= endDate;
  });

  const cashBasisRaw: RawPerformanceDataSet = {
    ...filtered,
    payrollRecords: cashBasisPayrolls,
  };

  const { employees, transactions, payrollRecords, attendanceRecords, departments: allDepts, branches: allBranches } = cashBasisRaw;

  const businessId =
    employees[0]?.business_id ||
    transactions[0]?.business_id ||
    payrollRecords[0]?.business_id ||
    allBranches[0]?.business_id ||
    allDepts[0]?.business_id ||
    "default_biz";

  // Execute canonical Cash Basis Engine Pipeline
  const cashStatement = CashBasisEngine.executePipeline(
    {
      invoices: (raw as any).invoices || [],
      payrollRecords: cashBasisPayrolls,
      ledgerTransactions: transactions,
    },
    {
      businessId,
      startDate: startDate || '2000-01-01',
      endDate: endDate || '2099-12-31',
      currency: 'HTG',
    }
  );

  const totalRevenue = Math.round(cashStatement.totalInflow);
  const totalExpenses = Math.round(cashStatement.totalOutflow);
  const netCashFlow = Math.round(cashStatement.netCashFlow);
  const cashFlowMargin = totalRevenue > 0 ? Math.round((netCashFlow / totalRevenue) * 100) : 0;

  const snap = AnalyticsEngine.generateSnapshot({
    period: "CUSTOM",
    customRange: { startDate: filters.startDate, endDate: filters.endDate },
    employees,
    transactions,
    attendanceLogs: attendanceRecords,
    payrollRecords,
    branches: allBranches,
    departments: allDepts,
    contracts: [],
    businessId,
    language: "fr",
    accountingMode: "CASH",
    normalizationContext,
  });

  const netProfit = Math.round(snap.profit.currentValue);
  const profitMargin = Math.round(snap.profitMargin);

  const totalPayroll = Math.round(
    cashStatement.periodMovements
      .filter((m) => m.sourceModule === 'PAYROLL' || m.movementType === 'PAYROLL')
      .reduce((acc, m) => acc + m.amount, 0)
  );

  const activeHeadcount = snap.activeStaff.currentValue ?? (employees.filter((e) => e.status === "ACTIVE" || !e.status).length);
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

  const activityRecordsCount = transactions.length + payrollRecords.length + attendanceRecords.length;
  const totalRecordsCount = employees.length + activityRecordsCount;
  const isDataAvailable = activityRecordsCount > 0;

  const cashBasisKpis: SimplifiedMetrics = {
    totalPayroll,
    activeHeadcount,
    turnoverRate,
    attendanceRate,
    totalRevenue,
    totalExpenses,
    netProfit,
    profitMargin,
    netCashFlow,
    cashFlowMargin,
    averageHoursWorked,
    overtimeHoursTotal,
    totalCommissions: Math.round(totalCommissions),
    isDataAvailable,
    totalRecordsCount,
  };

  const departments: DepartmentMetricBreakdown[] = (snap.departmentPerformance || []).map((d: any) => {
    const rev = d.revenue || 0;
    const exp = d.expenses || (d.payrollCost || 0) + (d.nonPayrollExpenses || 0);
    const margin = rev > 0 ? Math.round(((rev - exp) / rev) * 100) : 0;
    return {
      departmentId: d.departmentId || d.id || "gen",
      departmentName: d.departmentName || d.name || "Département",
      headcount: d.employeeCount || 0,
      payroll: Math.round(d.payrollCost ?? d.payroll ?? d.expenses ?? 0),
      attendanceRate: d.attendanceRate ?? null,
      revenue: Math.round(rev),
      expenses: Math.round(exp),
      netMargin: d.margin !== undefined ? Math.round(d.margin) : margin,
      commissions: Math.round(d.commissions || 0),
    };
  });

  const branches: BranchMetricBreakdown[] = (snap.branchPerformance || []).map((b: any) => {
    return {
      branchId: b.branchId || b.id || "gen",
      branchName: b.branchName || b.name || "Succursale",
      headcount: b.employeeCount || 0,
      payroll: Math.round(b.payrollCost ?? b.payroll ?? b.expenses ?? 0),
      attendanceRate: b.attendanceRate ?? null,
      revenue: Math.round(b.revenue || 0),
      efficiencyScore: b.efficiencyScore || 80,
    };
  });

  const trends: TrendDataPoint[] = (snap.historicalTrends || []).map((t: any) => {
    return {
      date: t.label || t.key || "",
      label: t.label || t.key || "",
      payroll: Math.round(t.payroll || 0),
      revenue: Math.round(t.gross || 0),
      headcount: t.headcount || 0,
      attendanceRate: t.attendanceRate ?? null,
      expenses: Math.round(t.expenses || 0),
    };
  });

  const employeeRankings: EmployeePerformanceRanking[] = (snap.employeeScorecards || []).map((s: any, idx: number) => {
    return {
      employeeId: s.employeeId || `emp_${idx}`,
      employeeName: s.employeeName || "Collaborateur",
      departmentId: s.departmentId || "",
      departmentName: s.departmentName || "Non assigné",
      branchId: s.branchId || "",
      branchName: s.branchName || "Siège",
      totalHours: s.totalHours ?? s.hoursWorked ?? 0,
      attendanceScore: s.attendanceConsistencyScore !== undefined ? s.attendanceConsistencyScore : (s.attendanceScore ?? null),
      salesVolume: Math.round(s.salesVolume || 0),
      commission: Math.round(s.commissions ?? s.commissionEarned ?? 0),
      productivityIndex: s.productivityIndex || 85,
      rank: s.rank || idx + 1,
    };
  });

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
        const computableMatrixScorecards = empScorecards.filter(
          (s: any) => typeof s.attendanceConsistencyScore === "number" && !isNaN(s.attendanceConsistencyScore)
        );
        const matrixAtt = computableMatrixScorecards.length > 0
          ? Math.round(
              computableMatrixScorecards.reduce((sum: number, s: any) => sum + s.attendanceConsistencyScore, 0) /
                computableMatrixScorecards.length
            )
          : null;
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
    kpis: cashBasisKpis,
    departments,
    branches,
    trends,
    employeeRankings,
    crossTableMatrix,
    isDataAvailable,
  };
}
