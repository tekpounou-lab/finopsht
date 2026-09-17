/**
 * FINOPS ERP — Canonical Cash Basis View Model Types
 * Phase 4 SSOT View Model
 *
 * Ensures all BI components consume a unified, deterministic,
 * and non-recalculated Cash Basis financial view model.
 */

import type { NormalizedCashMovement } from '../types/NormalizedCashMovement';
import type { ReconciliationAuditSummary, SuppressedMovementRecord } from '../reconciliation/reconciliation.types';

export interface TrendPoint {
  date: string; // YYYY-MM-DD or period label
  cashIn: number;
  cashOut: number;
  netCashFlow: number;
  endingCash: number;
}

export interface CashCategoryBreakdown {
  category: string;
  direction: 'INFLOW' | 'OUTFLOW' | 'TRANSFER';
  amount: number;
  amountCents: number;
  count: number;
  percentage: number;
}

export interface DepartmentCashBreakdown {
  departmentId: string;
  departmentName: string;
  cashIn: number;
  cashOut: number;
  netContribution: number;
  payrollCostPaid: number;
  percentageOfTotalOutflow: number;
}

export interface TreasuryAccountBalance {
  accountId: string;
  accountName: string;
  accountCode: string;
  currency: string;
  currentBalance: number;
  cashIn: number;
  cashOut: number;
  netFlow: number;
}

export interface CashExecutiveSummary {
  period: {
    startDate: string;
    endDate: string;
  };
  currency: string;
  beginningCash: number;
  totalCashIn: number;
  totalCashOut: number;
  netCashFlow: number;
  endingCash: number;
  topOutflowCategories: CashCategoryBreakdown[];
  topInflowCategories: CashCategoryBreakdown[];
  trends: TrendPoint[];
}

export interface CashWorkforceSummary {
  employeeCount: number;
  totalHoursExpected: number;
  totalHoursProvided: number;
  attendanceRate: number; // 0..100
  totalPersonnelCashPaid: number;
  averageCashCostPerEmployee: number;
  averageCashCostPerHour: number;
  departmentBreakdown: DepartmentCashBreakdown[];
}

export interface CashPayrollSummary {
  salariesPaid: number;
  commissionsPaid: number;
  advancesPaid: number;
  otherPersonnelPayments: number;
  totalPersonnelCashOut: number;
  payoutEventsCount: number;
  trends: TrendPoint[];
}

export interface CashDepartmentSummary {
  departments: DepartmentCashBreakdown[];
  unallocatedCashIn: number;
  unallocatedCashOut: number;
  highestSpendingDepartment?: DepartmentCashBreakdown;
  highestContributingDepartment?: DepartmentCashBreakdown;
}

export interface CashReportsSummary {
  summaryParagraph: string;
  positiveSignals: string[];
  vigilanceSignals: string[];
  keyOutflowDrivers: { label: string; amount: number }[];
  dataFreshnessTimestamp: string;
}

export interface CashPredictiveSummary {
  historicalDaysAnalyzed: number;
  projectedThirtyDayCashIn: number;
  projectedThirtyDayCashOut: number;
  projectedThirtyDayNetFlow: number;
  projectedThirtyDayEndingCash: number;
  liquidityRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  projectedNextPayrollCashOut: number;
  projectedTrends: TrendPoint[];
}

export interface CashBasisViewModel {
  businessId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  currency: string;

  executive: CashExecutiveSummary;
  workforce: CashWorkforceSummary;
  payroll: CashPayrollSummary;
  departments: CashDepartmentSummary;
  reports: CashReportsSummary;
  predictive: CashPredictiveSummary;

  treasury: {
    accounts: TreasuryAccountBalance[];
  };

  /** Audit provenance */
  auditSummary: ReconciliationAuditSummary;
  suppressedMovements: SuppressedMovementRecord[];
  rawMovements: NormalizedCashMovement[];
}
