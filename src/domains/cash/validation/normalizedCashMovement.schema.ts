/**
 * FINOPS ERP — Cash Basis Accounting Foundation (SSOT)
 * Zod Validation Schema for NormalizedCashMovement
 */

import { z } from "zod";
import type { NormalizedCashMovement } from "../types/NormalizedCashMovement";

/**
 * Valid ISO Date format (YYYY-MM-DD) with calendar sanity check.
 */
const DateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const CashMovementDirectionSchema = z.enum(['INFLOW', 'OUTFLOW', 'TRANSFER']);

export const CashMovementTypeSchema = z.enum([
  'PAYROLL',
  'COMMISSION',
  'ADVANCE',
  'CUSTOMER_PAYMENT',
  'INVOICE_COLLECTION',
  'SALE',
  'EXPENSE',
  'SUPPLIER_PAYMENT',
  'RENT',
  'BANK',
  'CASH',
  'MOBILE_MONEY',
  'TRANSFER',
  'DEPOSIT',
  'WITHDRAWAL',
  'REFUND',
  'OTHER'
]);

export const CashMovementSourceModuleSchema = z.enum([
  'PAYROLL',
  'INVOICE',
  'LEDGER',
  'CASH_SETTLEMENT'
]);

export const CashMovementStatusSchema = z.enum([
  'PAID',
  'SETTLED',
  'POSTED',
  'VOIDED',
  'REVERSED'
]);

export const RecognizedPaymentMethodSchema = z.enum([
  'CASH',
  'BANK',
  'BANK_TRANSFER',
  'CHECK',
  'MOBILE_MONEY',
  'MONCASH',
  'NATCASH',
  'CARD',
  'WIRE',
  'OTHER'
]);

export const NormalizedCashMovementSchema = z.object({
  id: z.string().trim().min(1, "Movement ID is required"),
  businessId: z.string().trim().min(1, "businessId is mandatory for tenant isolation"),

  sourceModule: CashMovementSourceModuleSchema,
  sourceId: z.string().trim().min(1, "sourceId is required for audit traceability"),
  paymentEventId: z.string().trim().min(1).optional(),

  movementDate: z.string()
    .trim()
    .regex(DateRegex, "movementDate must match YYYY-MM-DD format")
    .refine((val) => {
      const parsed = new Date(val);
      return !isNaN(parsed.getTime());
    }, "movementDate must be a valid calendar date"),

  direction: CashMovementDirectionSchema,
  movementType: CashMovementTypeSchema,

  amount: z.number({
    error: "amount must be a valid number",
  })
    .finite("amount must be a finite number")
    .min(0, "amount cannot be negative"),

  amountCents: z.number({
    error: "amountCents must be an integer",
  })
    .int("amountCents must be an integer")
    .min(0, "amountCents cannot be negative"),

  currency: z.string().trim().min(2, "currency code must be at least 2 characters (e.g. HTG, USD)"),

  cashAccountId: z.string().trim().min(1).optional(),
  sourceCashAccountId: z.string().trim().min(1).optional(),
  destinationCashAccountId: z.string().trim().min(1).optional(),

  departmentId: z.string().trim().min(1).optional(),
  employeeId: z.string().trim().min(1).optional(),
  branchId: z.string().trim().min(1).optional(),

  paymentMethod: RecognizedPaymentMethodSchema.optional(),
  status: CashMovementStatusSchema,
  description: z.string().optional(),
  reference: z.string().optional(),
  reversalOf: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  createdAt: z.string().optional(),
});

export interface CashMovementValidationResult {
  isValid: boolean;
  errors: string[];
  data?: NormalizedCashMovement;
}

/**
 * Strict validation utility for NormalizedCashMovement.
 * Rejects NaN, negatives, invalid dates, missing tenant IDs, and corrupted data.
 * Does NOT mask data corruption by converting invalid inputs to 0.
 */
export function validateNormalizedCashMovement(data: unknown): CashMovementValidationResult {
  const result = NormalizedCashMovementSchema.safeParse(data);
  if (!result.success) {
    const errorMessages = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`
    );
    return {
      isValid: false,
      errors: errorMessages,
    };
  }

  return {
    isValid: true,
    errors: [],
    data: result.data as NormalizedCashMovement,
  };
}
