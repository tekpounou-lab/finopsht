/**
 * FINOPS ERP — Cash Basis Engine Types
 * Phase 3 SSOT Engine Interfaces
 */

import type { NormalizedCashMovement } from '../types/NormalizedCashMovement';
import type { ReconciliationAuditSummary, SuppressedMovementRecord } from '../reconciliation/reconciliation.types';

export interface CashEngineQueryOptions {
  /** Mandatory tenant isolation */
  businessId: string;
  /** Period start date (ISO YYYY-MM-DD) */
  startDate: string;
  /** Period end date (ISO YYYY-MM-DD) */
  endDate: string;
  /** Target reporting currency (defaults to 'HTG') */
  currency?: string;
  /** Optional filter by specific treasury account */
  cashAccountId?: string;
  /** Configured initial opening balance at openingBalanceDate or baseline zero */
  openingBalance?: number;
  /** Date of initial configured opening balance (ISO YYYY-MM-DD) */
  openingBalanceDate?: string;
}

export interface CashFlowCategorySummary {
  movementType: string;
  direction: 'INFLOW' | 'OUTFLOW' | 'TRANSFER';
  totalAmount: number;
  totalCents: number;
  count: number;
}

export interface CashBasisStatementResult {
  businessId: string;
  startDate: string;
  endDate: string;
  currency: string;
  cashAccountId?: string;

  /** Beginning cash balance at start of period */
  beginningCash: number;
  beginningCashCents: number;

  /** Total inflows during period */
  totalInflow: number;
  totalInflowCents: number;

  /** Total outflows during period */
  totalOutflow: number;
  totalOutflowCents: number;

  /** Net cash flow during period (inflow - outflow) */
  netCashFlow: number;
  netCashFlowCents: number;

  /** Ending cash balance at end of period (beginningCash + netCashFlow) */
  endingCash: number;
  endingCashCents: number;

  /** Movements occurring strictly within [startDate, endDate] */
  periodMovements: NormalizedCashMovement[];

  /** Breakdown by movement category/type */
  categoryBreakdown: CashFlowCategorySummary[];

  /** Audit metrics & suppressed duplicate tracking */
  reconciliationAudit: ReconciliationAuditSummary;
  suppressedMovements: SuppressedMovementRecord[];
}
