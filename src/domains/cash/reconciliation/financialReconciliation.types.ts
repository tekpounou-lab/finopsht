/**
 * FINOPS ERP — Financial Reconciliation Types
 * Phase 5 Architecture SSOT
 *
 * Defines the dual-basis reconciliation contract between:
 * Mode Simple (Cash Basis / Trésorerie) & Mode Expert (Accrual Basis / Engagement).
 */

export type ReconciliationCategory =
  | 'UNPAID_REVENUE'
  | 'UNPAID_EXPENSE'
  | 'UNPAID_PAYROLL'
  | 'PARTIAL_PAYMENT'
  | 'TIMING_DIFFERENCE'
  | 'ACCRUED_COST'
  | 'CASH_SETTLEMENT'
  | 'OPENING_BALANCE_DIFFERENCE'
  | 'TRANSFER'
  | 'REVERSAL'
  | 'UNCLASSIFIED';

export type ReconciliationQuality =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'INCOMPLETE'
  | 'UNRECONCILED';

export interface ReconciliationItem {
  id: string;
  category: ReconciliationCategory;
  sourceModule: 'INVOICE' | 'PAYROLL' | 'LEDGER';
  sourceId: string;
  label: string;
  cashAmount: number;
  accrualAmount: number;
  variance: number; // accrualAmount - cashAmount
  currency: string;
  economicDate?: string;
  settlementDate?: string;
  status: 'PENDING_SETTLEMENT' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'TIMING_LAG';
}

export interface FinancialBasisMetrics {
  revenue: number;
  personnelCost: number;
  operatingExpenses: number;
  netResult: number;
}

export interface FinancialVariance {
  revenue: number; // accrual.revenue - cash.revenue
  personnelCost: number; // accrual.personnelCost - cash.personnelCost
  operatingExpenses: number; // accrual.operatingExpenses - cash.operatingExpenses
  netResult: number; // accrual.netResult - cash.netResult
}

export interface ReconciliationExplanation {
  category: ReconciliationCategory;
  title: string;
  description: string;
  impactAmount: number;
  direction: 'ACCRUAL_HIGHER' | 'CASH_HIGHER' | 'BALANCED';
  itemCount: number;
}

export interface FinancialReconciliation {
  businessId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  currency: string;

  /** Cash Basis metrics (Mode Simple) */
  cash: FinancialBasisMetrics;

  /** Accrual Basis metrics (Mode Expert) */
  accrual: FinancialBasisMetrics;

  /** Explicit variance: Accrual - Cash */
  variance: FinancialVariance;

  /** Itemized list of specific driver differences */
  items: ReconciliationItem[];

  /** Natural language / structured explanations */
  explanations: ReconciliationExplanation[];

  /** Audit quality rating */
  quality: ReconciliationQuality;

  /** Timestamp of generation */
  generatedAt: string;
}
