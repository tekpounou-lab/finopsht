/**
 * FINOPS ERP — Cross-Source Cash Reconciliation Engine
 * Phase 3 SSOT Engine Implementation
 *
 * Responsible for cross-source deduplication, source authority enforcement
 * (Operational > General Ledger), data quality filtering, and tenant boundary verification.
 */

import type { NormalizedCashMovement } from '../types/NormalizedCashMovement';
import { validateNormalizedCashMovement } from '../validation/normalizedCashMovement.schema';
import type {
  ReconciliationResult,
  ReconciliationOptions,
  SuppressedMovementRecord,
} from './reconciliation.types';

export class CrossSourceCashReconciliationEngine {
  /**
   * Reconciles a collection of NormalizedCashMovements from operational adapters and ledger sources.
   *
   * @param movements Raw list of normalized cash movements from all adapters
   * @param options Reconciliation configuration options (tenant scoping, currency filter)
   */
  public static reconcile(
    movements: NormalizedCashMovement[],
    options: ReconciliationOptions
  ): ReconciliationResult {
    const { businessId, currency } = options;

    let totalInputCount = movements.length;
    let invalidCount = 0;
    let incompleteCount = 0;
    let ignoredCount = 0;

    // 1. Tenant & Currency pre-filter + Zod Validation
    const validMovements: NormalizedCashMovement[] = [];

    for (const m of movements) {
      // Tenant Isolation check
      if (!m.businessId || m.businessId !== businessId) {
        invalidCount++;
        continue;
      }

      // Currency filter (if specified)
      if (currency && m.currency !== currency) {
        ignoredCount++;
        continue;
      }

      // Schema validation
      const validation = validateNormalizedCashMovement(m);
      if (!validation.isValid) {
        invalidCount++;
        continue;
      }

      validMovements.push(m);
    }

    // 2. Deterministic ID Deduplication (Map by m.id)
    const uniqueByIdMap = new Map<string, NormalizedCashMovement>();
    for (const m of validMovements) {
      if (!uniqueByIdMap.has(m.id)) {
        uniqueByIdMap.set(m.id, m);
      }
    }
    const deduplicatedList = Array.from(uniqueByIdMap.values());

    // 3. Build Operational Indexes for Source Authority
    // Operational source modules take precedence over GL entries
    const operationalCycleIds = new Set<string>();
    const operationalInvoiceIds = new Set<string>();

    for (const m of deduplicatedList) {
      if (m.sourceModule === 'PAYROLL') {
        if (m.sourceId) operationalCycleIds.add(m.sourceId);
        if (m.metadata?.cycleId) operationalCycleIds.add(String(m.metadata.cycleId));
        if (m.metadata?.linkedCycleId) operationalCycleIds.add(String(m.metadata.linkedCycleId));
      } else if (m.sourceModule === 'INVOICE') {
        if (m.sourceId) operationalInvoiceIds.add(m.sourceId);
        if (m.metadata?.invoiceId) operationalInvoiceIds.add(String(m.metadata.invoiceId));
      }
    }

    // 4. Cross-Source Deduplication (Ledger vs Operational)
    const activeMovements: NormalizedCashMovement[] = [];
    const suppressedMovements: SuppressedMovementRecord[] = [];

    for (const m of deduplicatedList) {
      if (m.sourceModule === 'LEDGER') {
        const linkedCycle = m.metadata?.linkedCycleId || m.metadata?.payrollCycleId;
        const linkedInvoice = m.metadata?.linkedInvoiceId || m.metadata?.crmInvoiceId;

        // Check Payroll GL duplication
        if (linkedCycle && operationalCycleIds.has(String(linkedCycle))) {
          suppressedMovements.push({
            movement: m,
            reason: 'Suppressed GL duplicate of operational Payroll cycle',
            matchedSourceId: String(linkedCycle),
          });
          continue;
        }

        // Check Invoice GL duplication
        if (linkedInvoice && operationalInvoiceIds.has(String(linkedInvoice))) {
          suppressedMovements.push({
            movement: m,
            reason: 'Suppressed GL duplicate of operational Invoice payment',
            matchedSourceId: String(linkedInvoice),
          });
          continue;
        }
      }

      activeMovements.push(m);
    }

    // Sort chronologically by movementDate, then by id
    activeMovements.sort((a, b) => {
      const dateCmp = a.movementDate.localeCompare(b.movementDate);
      if (dateCmp !== 0) return dateCmp;
      return a.id.localeCompare(b.id);
    });

    return {
      activeMovements,
      suppressedMovements,
      auditSummary: {
        totalInputMovements: totalInputCount,
        activeCount: activeMovements.length,
        suppressedCount: suppressedMovements.length,
        invalidCount,
        incompleteCount,
        ignoredCount,
      },
    };
  }
}
