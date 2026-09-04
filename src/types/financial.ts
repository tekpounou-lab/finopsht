/**
 * FINOPS ERP — Financial Reporting Types (SSOT)
 *
 * Consolidated financial statement and snapshot type definitions.
 * Re-exports canonical financial models from accounting.ts to prevent duplication.
 */

export type {
  AccountCategory,
  BalanceSheetSection,
  BalanceSheet,
  IncomeStatement,
  TrialBalanceItem,
  TrialBalance,
  FinancialRatios,
  FinancialSnapshot
} from "./accounting";

/**
 * Account balance structure used in financial statement sections.
 */
export interface Account {
  code: string;
  name: string;
  balanceCents: number;
}

/**
 * Period classification options for financial statement queries.
 */
export type FinancialPeriodType = 'DAILY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM';

/**
 * Filter parameter options for financial statement generation.
 */
export interface FinancialStatementFilter {
  businessId: string;
  startDate: string;
  endDate: string;
  currency?: "HTG" | "USD";
  branchId?: string;
  departmentId?: string;
}

