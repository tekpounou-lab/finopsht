/**
 * FINOPS ERP — Cash Basis Accounting Foundation (SSOT)
 * Canonical NormalizedCashMovement Contract & Types
 */

export type CashMovementDirection = 'INFLOW' | 'OUTFLOW' | 'TRANSFER';

export type CashMovementType =
  | 'PAYROLL'
  | 'COMMISSION'
  | 'ADVANCE'
  | 'CUSTOMER_PAYMENT'
  | 'INVOICE_COLLECTION'
  | 'SALE'
  | 'EXPENSE'
  | 'SUPPLIER_PAYMENT'
  | 'RENT'
  | 'BANK'
  | 'CASH'
  | 'MOBILE_MONEY'
  | 'TRANSFER'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'REFUND'
  | 'OTHER';

export type CashMovementSourceModule =
  | 'PAYROLL'
  | 'INVOICE'
  | 'LEDGER'
  | 'CASH_SETTLEMENT';

export type CashMovementStatus =
  | 'PAID'
  | 'SETTLED'
  | 'POSTED'
  | 'VOIDED'
  | 'REVERSED';

export type RecognizedPaymentMethod =
  | 'CASH'
  | 'BANK'
  | 'BANK_TRANSFER'
  | 'CHECK'
  | 'MOBILE_MONEY'
  | 'MONCASH'
  | 'NATCASH'
  | 'CARD'
  | 'WIRE'
  | 'OTHER';

export interface NormalizedCashMovement {
  /** Deterministic unique identifier of the normalized cash movement */
  id: string;
  /** Mandatory tenant isolation scope */
  businessId: string;

  /** Source provenance tracking */
  sourceModule: CashMovementSourceModule;
  sourceId: string;
  /** Optional payment event ID if the source provides multi-payment or discrete settlement events */
  paymentEventId?: string;

  /** Effective date of cash impact (YYYY-MM-DD) */
  movementDate: string;

  /** Cash flow direction from the perspective of consolidated treasury */
  direction: CashMovementDirection;
  /** Granular business classification */
  movementType: CashMovementType;

  /** Financial amounts */
  amount: number;
  amountCents: number;
  currency: string;

  /** Treasury account identifiers */
  cashAccountId?: string;
  sourceCashAccountId?: string;
  destinationCashAccountId?: string;

  /** Organizational attribution */
  departmentId?: string;
  employeeId?: string;
  branchId?: string;

  /** Execution details */
  paymentMethod?: RecognizedPaymentMethod;
  status: CashMovementStatus;
  description?: string;
  reference?: string;

  /** Reference to original movement ID if this movement is a reversal / void */
  reversalOf?: string;

  /** Extensible linkage and provenance metadata */
  metadata?: Record<string, any>;

  /** Audit timestamp */
  createdAt?: string;
}

/**
 * Parameters for deterministic cash movement ID generation.
 * Guarantees idempotence without random UUIDs or Date.now().
 */
export interface GenerateCashMovementIdParams {
  businessId: string;
  sourceModule: CashMovementSourceModule;
  sourceId: string;
  paymentEventId?: string;
  movementDate: string;
  direction?: CashMovementDirection;
}

/**
 * Generates a purely deterministic identifier for a cash movement.
 * Same input parameters will always produce the exact same ID.
 */
export function generateCashMovementId(params: GenerateCashMovementIdParams): string {
  const sanitizedBiz = params.businessId.trim();
  const sanitizedMod = params.sourceModule.trim();
  const sanitizedSourceId = params.sourceId.trim();
  const sanitizedDate = params.movementDate.trim();
  const eventPart = params.paymentEventId && params.paymentEventId.trim().length > 0
    ? `_evt_${params.paymentEventId.trim()}`
    : '';
  const dirPart = params.direction ? `_${params.direction}` : '';

  return `cm_${sanitizedBiz}_${sanitizedMod}_${sanitizedSourceId}${eventPart}_${sanitizedDate}${dirPart}`;
}

/**
 * Evaluates whether a movement represents an effective settled cash movement
 * (i.e. not cancelled, voided, or reversed).
 */
export function isEffectiveCashMovement(movement: NormalizedCashMovement): boolean {
  return movement.status !== 'VOIDED' && movement.status !== 'REVERSED';
}

/**
 * Checks if a movement is an internal transfer between treasury accounts.
 */
export function isInternalTransfer(movement: NormalizedCashMovement): boolean {
  return movement.direction === 'TRANSFER' || movement.movementType === 'TRANSFER';
}

/**
 * Computes consolidated net cash flow impact of a movement.
 * - INFLOW: +amount
 * - OUTFLOW: -amount
 * - TRANSFER: 0 (Internal transfer has net 0 impact on consolidated treasury)
 * - VOIDED / REVERSED: 0
 */
export function getCashFlowImpact(movement: NormalizedCashMovement): number {
  if (!isEffectiveCashMovement(movement)) {
    return 0;
  }
  if (isInternalTransfer(movement)) {
    return 0;
  }
  if (movement.direction === 'INFLOW') {
    return movement.amount;
  }
  if (movement.direction === 'OUTFLOW') {
    return -movement.amount;
  }
  return 0;
}
