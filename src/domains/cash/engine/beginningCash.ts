/**
 * FINOPS ERP — Beginning Cash Calculator
 * Phase 3 SSOT Engine Implementation
 */

import type { NormalizedCashMovement } from '../types/NormalizedCashMovement';
import { getCashFlowImpact, isEffectiveCashMovement } from '../types/NormalizedCashMovement';

export interface BeginningCashOptions {
  startDate: string; // ISO YYYY-MM-DD
  openingBalance?: number;
  openingBalanceDate?: string; // ISO YYYY-MM-DD
  cashAccountId?: string;
}

export interface BeginningCashResult {
  beginningCash: number;
  beginningCashCents: number;
  priorMovementsCount: number;
}

/**
 * Calculates opening cash balance at period startDate by summing initial opening balance
 * plus all net settled cash flow impacts occurring strictly prior to startDate.
 */
export function calculateBeginningCash(
  activeMovements: NormalizedCashMovement[],
  options: BeginningCashOptions
): BeginningCashResult {
  const { startDate, openingBalance = 0, openingBalanceDate, cashAccountId } = options;

  let netImpactCents = Math.round(openingBalance * 100);
  let priorCount = 0;

  for (const m of activeMovements) {
    if (!isEffectiveCashMovement(m)) {
      continue;
    }

    // Must be strictly prior to startDate
    if (m.movementDate >= startDate) {
      continue;
    }

    // Must be on or after openingBalanceDate if provided
    if (openingBalanceDate && m.movementDate < openingBalanceDate) {
      continue;
    }

    // Account filtering if specified
    if (cashAccountId) {
      if (m.direction === 'TRANSFER' || m.movementType === 'TRANSFER') {
        if (m.sourceCashAccountId === cashAccountId) {
          netImpactCents -= m.amountCents;
          priorCount++;
        } else if (m.destinationCashAccountId === cashAccountId) {
          netImpactCents += m.amountCents;
          priorCount++;
        }
      } else if (m.cashAccountId === cashAccountId) {
        const impact = getCashFlowImpact(m);
        netImpactCents += Math.round(impact * 100);
        priorCount++;
      }
    } else {
      // Consolidated business-wide calculation
      const impact = getCashFlowImpact(m);
      netImpactCents += Math.round(impact * 100);
      priorCount++;
    }
  }

  return {
    beginningCash: netImpactCents / 100,
    beginningCashCents: netImpactCents,
    priorMovementsCount: priorCount,
  };
}
