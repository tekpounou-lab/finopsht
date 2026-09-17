/**
 * FINOPS ERP — Cash Basis Accounting Foundation (SSOT)
 * Standard Adapter Result Types & Contracts
 */

import type {
  NormalizedCashMovement,
  CashMovementSourceModule,
} from "../types/NormalizedCashMovement";

export type AdapterResultStatus =
  | 'VALID'       // Successfully normalized and verified by Zod
  | 'INVALID'     // Present data is corrupted (e.g. NaN, negative, malformed date)
  | 'INCOMPLETE'  // Insufficient data to determine actual cash impact (e.g. missing settlement date)
  | 'AMBIGUOUS'   // Conflicting or unreconciled information
  | 'IGNORED';    // Legitimate non-cash document (e.g. unpaid draft, non-treasury accrual)

export interface CashAdapterResult<T = NormalizedCashMovement> {
  status: AdapterResultStatus;
  sourceModule: CashMovementSourceModule;
  sourceId: string;
  movement?: T;
  movements?: T[];
  rejectionReason?: string;
  errors?: string[];
  metadata?: Record<string, any>;
}

export interface BatchAdaptResult<T = NormalizedCashMovement> {
  movements: T[];
  results: CashAdapterResult<T>[];
  summary: {
    totalInput: number;
    validCount: number;
    invalidCount: number;
    incompleteCount: number;
    ambiguousCount: number;
    ignoredCount: number;
  };
}
