/**
 * FINOPS ERP — Cross-Source Cash Reconciliation Types
 * Phase 3 Architecture SSOT
 */

import type { NormalizedCashMovement } from '../types/NormalizedCashMovement';

export interface SuppressedMovementRecord {
  movement: NormalizedCashMovement;
  reason: string;
  matchedSourceId: string;
}

export interface ReconciliationAuditSummary {
  totalInputMovements: number;
  activeCount: number;
  suppressedCount: number;
  invalidCount: number;
  incompleteCount: number;
  ignoredCount: number;
}

export interface ReconciliationResult {
  /** Reconciled, deduplicated, and validated movements ready for cash engine calculation */
  activeMovements: NormalizedCashMovement[];

  /** Movements suppressed due to cross-source duplication */
  suppressedMovements: SuppressedMovementRecord[];

  /** Audit metrics */
  auditSummary: ReconciliationAuditSummary;
}

export interface ReconciliationOptions {
  /** Mandatory tenant isolation */
  businessId: string;
  /** Filter by currency if specified */
  currency?: string;
}
