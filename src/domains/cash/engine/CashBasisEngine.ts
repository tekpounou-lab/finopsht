/**
 * FINOPS ERP — Cash Basis Engine Main Implementation
 * Phase 3 SSOT Engine
 *
 * Orchestrates adapter ingestion, cross-source reconciliation,
 * opening cash calculation, period aggregation, and BI statement generation.
 */

import type { PayrollRecord, PayrollCycle, LedgerTransaction } from '../../../types';
import type { Invoice } from '../../../types/crm';
import type { NormalizedCashMovement } from '../types/NormalizedCashMovement';
import { getCashFlowImpact, isEffectiveCashMovement } from '../types/NormalizedCashMovement';
import { PayrollCashAdapter } from '../adapters/PayrollCashAdapter';
import { InvoiceCashAdapter } from '../adapters/InvoiceCashAdapter';
import { LedgerCashAdapter } from '../adapters/LedgerCashAdapter';
import { CrossSourceCashReconciliationEngine } from '../reconciliation/CrossSourceCashReconciliationEngine';
import { calculateBeginningCash } from './beginningCash';
import type {
  CashEngineQueryOptions,
  CashBasisStatementResult,
  CashFlowCategorySummary,
} from './engine.types';

export interface RawOperationalSources {
  payrollRecords?: PayrollRecord[];
  payrollCycles?: PayrollCycle[];
  invoices?: Invoice[];
  ledgerTransactions?: LedgerTransaction[];
}

export class CashBasisEngine {
  /**
   * Generates a complete Cash Basis Statement from pre-adapted or candidate NormalizedCashMovements.
   */
  public static generateStatement(
    candidateMovements: NormalizedCashMovement[],
    options: CashEngineQueryOptions
  ): CashBasisStatementResult {
    const {
      businessId,
      startDate,
      endDate,
      currency = 'HTG',
      cashAccountId,
      openingBalance = 0,
      openingBalanceDate,
    } = options;

    // 1. Reconcile and deduplicate inputs across modules
    const reconciliation = CrossSourceCashReconciliationEngine.reconcile(candidateMovements, {
      businessId,
      currency,
    });

    const activeMovements = reconciliation.activeMovements;

    // 2. Compute Beginning Cash at period startDate
    const beginningResult = calculateBeginningCash(activeMovements, {
      startDate,
      openingBalance,
      openingBalanceDate,
      cashAccountId,
    });

    // 3. Filter period movements strictly within [startDate, endDate]
    const periodMovements: NormalizedCashMovement[] = [];
    let totalInflowCents = 0;
    let totalOutflowCents = 0;

    const categoryMap = new Map<string, {
      movementType: string;
      direction: 'INFLOW' | 'OUTFLOW' | 'TRANSFER';
      totalCents: number;
      count: number;
    }>();

    for (const m of activeMovements) {
      if (!isEffectiveCashMovement(m)) {
        continue;
      }

      // Period boundary filter
      if (m.movementDate < startDate || m.movementDate > endDate) {
        continue;
      }

      // Optional Account filter
      if (cashAccountId) {
        const isTargetAccount =
          m.cashAccountId === cashAccountId ||
          m.sourceCashAccountId === cashAccountId ||
          m.destinationCashAccountId === cashAccountId;
        if (!isTargetAccount) {
          continue;
        }
      }

      periodMovements.push(m);

      // Accumulate totals
      if (m.direction === 'INFLOW') {
        totalInflowCents += m.amountCents;
      } else if (m.direction === 'OUTFLOW') {
        totalOutflowCents += m.amountCents;
      }

      // Category breakdown
      const catKey = `${m.direction}_${m.movementType}`;
      const existing = categoryMap.get(catKey) || {
        movementType: m.movementType,
        direction: m.direction,
        totalCents: 0,
        count: 0,
      };
      existing.totalCents += m.amountCents;
      existing.count += 1;
      categoryMap.set(catKey, existing);
    }

    const netCashFlowCents = totalInflowCents - totalOutflowCents;
    const endingCashCents = beginningResult.beginningCashCents + netCashFlowCents;

    const categoryBreakdown: CashFlowCategorySummary[] = Array.from(categoryMap.values()).map(
      (c) => ({
        movementType: c.movementType,
        direction: c.direction,
        totalAmount: c.totalCents / 100,
        totalCents: c.totalCents,
        count: c.count,
      })
    );

    return {
      businessId,
      startDate,
      endDate,
      currency,
      cashAccountId,

      beginningCash: beginningResult.beginningCashCents / 100,
      beginningCashCents: beginningResult.beginningCashCents,

      totalInflow: totalInflowCents / 100,
      totalInflowCents,

      totalOutflow: totalOutflowCents / 100,
      totalOutflowCents,

      netCashFlow: netCashFlowCents / 100,
      netCashFlowCents,

      endingCash: endingCashCents / 100,
      endingCashCents,

      periodMovements,
      categoryBreakdown,

      reconciliationAudit: reconciliation.auditSummary,
      suppressedMovements: reconciliation.suppressedMovements,
    };
  }

  /**
   * Executes the full Cash Basis end-to-end pipeline:
   * 1. Adapts raw domain records using Payroll, Invoice, and Ledger adapters.
   * 2. Reconciles cross-source duplicate entries.
   * 3. Aggregates period Cash Basis Statement metrics.
   */
  public static executePipeline(
    sources: RawOperationalSources,
    options: CashEngineQueryOptions
  ): CashBasisStatementResult {
    const candidateMovements: NormalizedCashMovement[] = [];

    // 1. Adapt Payroll records/cycles
    if (sources.payrollRecords && sources.payrollRecords.length > 0) {
      const cycleMap = new Map<string, PayrollCycle>();
      if (sources.payrollCycles) {
        for (const c of sources.payrollCycles) {
          cycleMap.set(c.id, c);
        }
      }

      for (const rec of sources.payrollRecords) {
        const cycle = rec.cycleId ? cycleMap.get(rec.cycleId) : undefined;
        const res = PayrollCashAdapter.adaptRecord(rec, { cycle });
        if (res.status === 'VALID' && res.movement) {
          candidateMovements.push(res.movement);
        }
      }
    }

    // 2. Adapt CRM Invoices
    if (sources.invoices && sources.invoices.length > 0) {
      for (const inv of sources.invoices) {
        const res = InvoiceCashAdapter.adaptInvoice(inv);
        if (res.status === 'VALID') {
          if (res.movements && res.movements.length > 0) {
            candidateMovements.push(...res.movements);
          } else if (res.movement) {
            candidateMovements.push(res.movement);
          }
        }
      }
    }

    // 3. Adapt General Ledger Transactions
    if (sources.ledgerTransactions && sources.ledgerTransactions.length > 0) {
      for (const tx of sources.ledgerTransactions) {
        const res = LedgerCashAdapter.adaptTransaction(tx, { splitTransfers: false });
        if (res.status === 'VALID') {
          if (res.movements && res.movements.length > 0) {
            candidateMovements.push(...res.movements);
          } else if (res.movement) {
            candidateMovements.push(res.movement);
          }
        }
      }
    }

    // 4. Generate Statement
    return CashBasisEngine.generateStatement(candidateMovements, options);
  }
}
