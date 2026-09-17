/**
 * FINOPS ERP — Canonical Cash Basis View Model Builder
 * Phase 4 SSOT View Model Builder
 *
 * Pure transformer function converting CashBasisStatementResult
 * into a structured CashBasisViewModel consumed by all 6 BI tabs.
 */

import type { CashBasisStatementResult } from '../engine/engine.types';
import type {
  CashBasisViewModel,
  TrendPoint,
  CashCategoryBreakdown,
  DepartmentCashBreakdown,
  CashExecutiveSummary,
  CashWorkforceSummary,
  CashPayrollSummary,
  CashDepartmentSummary,
  CashReportsSummary,
  CashPredictiveSummary,
} from './cashViewModel.types';

export interface ExtraOperationalContext {
  employeeCount?: number;
  totalHoursExpected?: number;
  totalHoursProvided?: number;
  departmentNames?: Record<string, string>;
}

export function buildCashBasisViewModel(
  statement: CashBasisStatementResult,
  context?: ExtraOperationalContext
): CashBasisViewModel {
  const {
    businessId,
    startDate,
    endDate,
    currency,
    beginningCash,
    totalInflow,
    totalOutflow,
    netCashFlow,
    endingCash,
    periodMovements,
    categoryBreakdown,
    reconciliationAudit,
    suppressedMovements,
  } = statement;

  // 1. Build Category Breakdowns
  const totalOutflowCents = periodMovements
    .filter((m) => m.direction === 'OUTFLOW')
    .reduce((acc, m) => acc + m.amountCents, 0);

  const totalInflowCents = periodMovements
    .filter((m) => m.direction === 'INFLOW')
    .reduce((acc, m) => acc + m.amountCents, 0);

  const topOutflowCategories: CashCategoryBreakdown[] = categoryBreakdown
    .filter((c) => c.direction === 'OUTFLOW')
    .map((c) => ({
      category: c.movementType,
      direction: 'OUTFLOW' as const,
      amount: c.totalAmount,
      amountCents: c.totalCents,
      count: c.count,
      percentage: totalOutflowCents > 0 ? (c.totalCents / totalOutflowCents) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const topInflowCategories: CashCategoryBreakdown[] = categoryBreakdown
    .filter((c) => c.direction === 'INFLOW')
    .map((c) => ({
      category: c.movementType,
      direction: 'INFLOW' as const,
      amount: c.totalAmount,
      amountCents: c.totalCents,
      count: c.count,
      percentage: totalInflowCents > 0 ? (c.totalCents / totalInflowCents) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);


  // 2. Build Daily / Weekly Trend Points
  const trendMap = new Map<string, { cashIn: number; cashOut: number }>();
  for (const m of periodMovements) {
    const d = m.movementDate;
    const existing = trendMap.get(d) || { cashIn: 0, cashOut: 0 };
    if (m.direction === 'INFLOW') existing.cashIn += m.amount;
    else if (m.direction === 'OUTFLOW') existing.cashOut += m.amount;
    trendMap.set(d, existing);
  }

  const sortedDates = Array.from(trendMap.keys()).sort();
  let runningCash = beginningCash;
  const trends: TrendPoint[] = sortedDates.map((date) => {
    const pt = trendMap.get(date)!;
    const net = pt.cashIn - pt.cashOut;
    runningCash += net;
    return {
      date,
      cashIn: pt.cashIn,
      cashOut: pt.cashOut,
      netCashFlow: net,
      endingCash: runningCash,
    };
  });

  // 3. Payroll Breakdown Calculation
  let salariesPaid = 0;
  let commissionsPaid = 0;
  let advancesPaid = 0;
  let otherPersonnelPayments = 0;
  let payoutEventsCount = 0;

  for (const m of periodMovements) {
    if (m.sourceModule === 'PAYROLL' || m.movementType === 'PAYROLL') {
      payoutEventsCount++;
      salariesPaid += m.amount;
    }
  }

  const totalPersonnelCashOut = salariesPaid + commissionsPaid + advancesPaid + otherPersonnelPayments;

  // 4. Workforce Metrics
  const empCount = context?.employeeCount || (payoutEventsCount > 0 ? payoutEventsCount : 1);
  const hrsExpected = context?.totalHoursExpected || 160 * empCount;
  const hrsProvided = context?.totalHoursProvided || hrsExpected;
  const attendanceRate = hrsExpected > 0 ? Math.min(100, Math.round((hrsProvided / hrsExpected) * 100)) : 100;
  const avgCostPerEmp = empCount > 0 ? totalPersonnelCashOut / empCount : 0;
  const avgCostPerHour = hrsProvided > 0 ? totalPersonnelCashOut / hrsProvided : 0;

  // 5. Department Breakdown
  const deptMap = new Map<string, { cashIn: number; cashOut: number; payroll: number }>();
  for (const m of periodMovements) {
    const deptId = m.departmentId || 'UNALLOCATED';
    const curr = deptMap.get(deptId) || { cashIn: 0, cashOut: 0, payroll: 0 };
    if (m.direction === 'INFLOW') curr.cashIn += m.amount;
    else if (m.direction === 'OUTFLOW') {
      curr.cashOut += m.amount;
      if (m.sourceModule === 'PAYROLL' || m.movementType === 'PAYROLL') {
        curr.payroll += m.amount;
      }
    }
    deptMap.set(deptId, curr);
  }

  const departments: DepartmentCashBreakdown[] = Array.from(deptMap.entries())
    .filter(([id]) => id !== 'UNALLOCATED')
    .map(([id, data]) => ({
      departmentId: id,
      departmentName: context?.departmentNames?.[id] || id,
      cashIn: data.cashIn,
      cashOut: data.cashOut,
      netContribution: data.cashIn - data.cashOut,
      payrollCostPaid: data.payroll,
      percentageOfTotalOutflow: totalOutflow > 0 ? (data.cashOut / totalOutflow) * 100 : 0,
    }))
    .sort((a, b) => b.cashOut - a.cashOut);

  const unallocatedData = deptMap.get('UNALLOCATED') || { cashIn: 0, cashOut: 0, payroll: 0 };

  const highestSpendingDept = departments.length > 0 ? departments[0] : undefined;
  const highestContributingDept = [...departments].sort((a, b) => b.netContribution - a.netContribution)[0];

  // 6. Reports Summary
  const positiveSignals: string[] = [];
  const vigilanceSignals: string[] = [];

  if (netCashFlow >= 0) {
    positiveSignals.push(`Flux de trésorerie net positif (+${netCashFlow.toLocaleString()} ${currency}) sur la période.`);
  } else {
    vigilanceSignals.push(`Flux de trésorerie net négatif (${netCashFlow.toLocaleString()} ${currency}) — réduction des liquidités.`);
  }

  if (endingCash > 0) {
    positiveSignals.push(`Solde disponible sain (${endingCash.toLocaleString()} ${currency}) en fin de période.`);
  } else {
    vigilanceSignals.push(`Solde disponible sous le seuil critique (${endingCash.toLocaleString()} ${currency}).`);
  }

  const summaryParagraph = netCashFlow >= 0
    ? `Sur la période du ${startDate} au ${endDate}, votre entreprise a encaissé ${totalInflow.toLocaleString()} ${currency} et décaissé ${totalOutflow.toLocaleString()} ${currency}, dégageant une augmentation nette de trésorerie de +${netCashFlow.toLocaleString()} ${currency}.`
    : `Sur la période du ${startDate} au ${endDate}, les sorties de trésorerie (${totalOutflow.toLocaleString()} ${currency}) ont dépassé les rentrées (${totalInflow.toLocaleString()} ${currency}), réduisant vos liquidités de ${Math.abs(netCashFlow).toLocaleString()} ${currency}.`;

  // 7. Predictive 30-day projection
  const dailyAvgNet = sortedDates.length > 0 ? netCashFlow / sortedDates.length : 0;
  const dailyAvgIn = sortedDates.length > 0 ? totalInflow / sortedDates.length : 0;
  const dailyAvgOut = sortedDates.length > 0 ? totalOutflow / sortedDates.length : 0;

  const projIn = dailyAvgIn * 30;
  const projOut = dailyAvgOut * 30;
  const projNet = projIn - projOut;
  const projEnding = endingCash + projNet;

  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
  if (projEnding < 0) riskLevel = 'CRITICAL';
  else if (projEnding < totalOutflow * 0.5) riskLevel = 'HIGH';
  else if (projNet < 0) riskLevel = 'MEDIUM';

  const executive: CashExecutiveSummary = {
    period: { startDate, endDate },
    currency,
    beginningCash,
    totalCashIn: totalInflow,
    totalCashOut: totalOutflow,
    netCashFlow,
    endingCash,
    topOutflowCategories,
    topInflowCategories,
    trends,
  };

  const workforce: CashWorkforceSummary = {
    employeeCount: empCount,
    totalHoursExpected: hrsExpected,
    totalHoursProvided: hrsProvided,
    attendanceRate,
    totalPersonnelCashPaid: totalPersonnelCashOut,
    averageCashCostPerEmployee: avgCostPerEmp,
    averageCashCostPerHour: avgCostPerHour,
    departmentBreakdown: departments,
  };

  const payroll: CashPayrollSummary = {
    salariesPaid,
    commissionsPaid,
    advancesPaid,
    otherPersonnelPayments,
    totalPersonnelCashOut,
    payoutEventsCount,
    trends,
  };

  const departmentSummary: CashDepartmentSummary = {
    departments,
    unallocatedCashIn: unallocatedData.cashIn,
    unallocatedCashOut: unallocatedData.cashOut,
    highestSpendingDepartment: highestSpendingDept,
    highestContributingDepartment: highestContributingDept,
  };

  const reports: CashReportsSummary = {
    summaryParagraph,
    positiveSignals,
    vigilanceSignals,
    keyOutflowDrivers: topOutflowCategories.slice(0, 5).map((c) => ({ label: c.category, amount: c.amount })),
    dataFreshnessTimestamp: new Date().toISOString(),
  };

  const predictive: CashPredictiveSummary = {
    historicalDaysAnalyzed: sortedDates.length,
    projectedThirtyDayCashIn: Math.round(projIn),
    projectedThirtyDayCashOut: Math.round(projOut),
    projectedThirtyDayNetFlow: Math.round(projNet),
    projectedThirtyDayEndingCash: Math.round(projEnding),
    liquidityRiskLevel: riskLevel,
    projectedNextPayrollCashOut: totalPersonnelCashOut,
    projectedTrends: [],
  };

  return {
    businessId,
    period: { startDate, endDate },
    currency,
    executive,
    workforce,
    payroll,
    departments: departmentSummary,
    reports,
    predictive,
    treasury: {
      accounts: [],
    },
    auditSummary: reconciliationAudit,
    suppressedMovements,
    rawMovements: periodMovements,
  };
}
