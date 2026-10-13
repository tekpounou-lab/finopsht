/**
 * FINOPS ERP — Cash Basis Accounting Foundation (SSOT)
 * CashSettlementAdapter
 *
 * Normalizes operational cash settlement events into canonical NormalizedCashMovement.
 * STRICT DISCIPLINE:
 * - Operates as an operational cash event source (does NOT treat cash_settlements as sole SSOT).
 * - Preserves native currency (HTG/USD) without fictitious FX conversions.
 * - Enforces mandatory businessId tenant boundary (supports both businessId and business_id).
 * - Enforces zero-preservation for valid zero-value transactions.
 * - Extracts linkage metadata (linkedInvoiceId, linkedPayrollCycleId, linkedBillId)
 *   for deterministic cross-source reconciliation.
 * - Guarantees full Zod schema validation and deterministic ID generation.
 */

import type { CashSettlement } from "../../../types/cash-basis";
import type {
  NormalizedCashMovement,
  CashMovementDirection,
  CashMovementType,
  RecognizedPaymentMethod,
} from "../types/NormalizedCashMovement";
import { generateCashMovementId } from "../types/NormalizedCashMovement";
import { validateNormalizedCashMovement } from "../validation/normalizedCashMovement.schema";
import type { CashAdapterResult, BatchAdaptResult } from "./adapter.types";

/** Valid ISO Date format (YYYY-MM-DD) */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export interface CashSettlementAdapterOptions {
  /** Optional override / verification of tenant boundary */
  businessId?: string;
}

function mapSettlementCategoryToMovementType(category?: string, direction?: CashMovementDirection): CashMovementType {
  const upper = (category || "").toUpperCase().trim();
  switch (upper) {
    case "SALES_COLLECTION":
    case "SALE":
    case "CUSTOMER_PAYMENT":
      return "INVOICE_COLLECTION";
    case "PAYROLL_PAYMENT":
    case "PAYROLL":
      return "PAYROLL";
    case "SUPPLIER_PAYMENT":
    case "VENDOR_PAYMENT":
      return "SUPPLIER_PAYMENT";
    case "ADVANCE_PAYMENT":
    case "ADVANCE":
      return "ADVANCE";
    case "RENT":
      return "RENT";
    case "TRANSFER":
      return "TRANSFER";
    case "EXPENSE":
      return "EXPENSE";
    case "REFUND":
      return "REFUND";
    default:
      return direction === "INFLOW" ? "SALE" : "EXPENSE";
  }
}

function mapSettlementMethod(rawMethod?: string, rawRef?: string): RecognizedPaymentMethod {
  const upperMethod = (rawMethod || "").toUpperCase().trim();
  const upperRef = (rawRef || "").toUpperCase().trim();

  if (upperMethod === "MONCASH" || upperRef.includes("MONCASH")) return "MONCASH";
  if (upperMethod === "NATCASH" || upperRef.includes("NATCASH")) return "NATCASH";

  switch (upperMethod) {
    case "CASH":
      return "CASH";
    case "BANK":
    case "BANK_TRANSFER":
      return "BANK_TRANSFER";
    case "CHECK":
    case "CHEQUE":
      return "CHECK";
    case "MOBILE_MONEY":
      return "MOBILE_MONEY";
    case "CARD":
      return "CARD";
    case "WIRE":
      return "WIRE";
    default:
      return "OTHER";
  }
}

export class CashSettlementAdapter {
  /**
   * Adapts a single CashSettlement into a canonical NormalizedCashMovement.
   */
  public static adaptSettlement(
    settlement: CashSettlement,
    options: CashSettlementAdapterOptions = {}
  ): CashAdapterResult<NormalizedCashMovement> {
    const sourceId = settlement.id ? String(settlement.id).trim() : "";
    if (!sourceId) {
      return {
        status: "INVALID",
        sourceModule: "CASH_SETTLEMENT",
        sourceId: "UNKNOWN",
        rejectionReason: "CashSettlement is missing required id",
        errors: ["id is required"],
      };
    }

    // 1. Tenant Scoping
    const businessId = (settlement as any).businessId || settlement.business_id || options.businessId;
    if (!businessId || typeof businessId !== "string" || businessId.trim().length === 0) {
      return {
        status: "INVALID",
        sourceModule: "CASH_SETTLEMENT",
        sourceId,
        rejectionReason: "CashSettlement is missing mandatory businessId (or business_id)",
        errors: ["businessId is mandatory for tenant isolation"],
      };
    }

    if (options.businessId && businessId.trim() !== options.businessId.trim()) {
      return {
        status: "INVALID",
        sourceModule: "CASH_SETTLEMENT",
        sourceId,
        rejectionReason: `Tenant isolation mismatch: settlement tenant '${businessId}' != expected '${options.businessId}'`,
        errors: ["Tenant boundary violation"],
      };
    }

    // 2. Date Validation
    const dateVal = settlement.date ? String(settlement.date).trim() : "";
    if (!dateVal || !ISO_DATE_REGEX.test(dateVal)) {
      return {
        status: "INVALID",
        sourceModule: "CASH_SETTLEMENT",
        sourceId,
        rejectionReason: `Invalid or missing date '${dateVal}'. Must be YYYY-MM-DD.`,
        errors: ["date must match YYYY-MM-DD format"],
      };
    }

    // 3. Currency Validation (Strict: never infer missing currency)
    const rawCurrency = settlement.currency ? String(settlement.currency).trim().toUpperCase() : "";
    if (!rawCurrency || (rawCurrency !== "HTG" && rawCurrency !== "USD" && rawCurrency.length < 2)) {
      return {
        status: "INVALID",
        sourceModule: "CASH_SETTLEMENT",
        sourceId,
        rejectionReason: "Missing or invalid currency. Currency must be explicitly specified (e.g. HTG, USD) and cannot be inferred.",
        errors: ["currency is mandatory and cannot be inferred"],
      };
    }

    // 4. Amount Validation
    const rawAmountCents = (settlement as any).amountCents !== undefined 
      ? (settlement as any).amountCents 
      : settlement.amount_cents;

    if (rawAmountCents === undefined || rawAmountCents === null || typeof rawAmountCents !== "number" || isNaN(rawAmountCents)) {
      return {
        status: "INVALID",
        sourceModule: "CASH_SETTLEMENT",
        sourceId,
        rejectionReason: "Missing or non-numeric amount_cents",
        errors: ["amount_cents must be a valid integer"],
      };
    }

    if (rawAmountCents < 0) {
      return {
        status: "INVALID",
        sourceModule: "CASH_SETTLEMENT",
        sourceId,
        rejectionReason: "amount_cents cannot be negative",
        errors: ["amount_cents must be >= 0"],
      };
    }

    const amountCents = Math.round(rawAmountCents);
    const amount = amountCents / 100;

    // 5. Direction & Movement Type Determination
    let direction: CashMovementDirection = "INFLOW";
    if (settlement.category === "TRANSFER") {
      direction = "TRANSFER";
    } else if (settlement.type === "CASH_OUT") {
      direction = "OUTFLOW";
    } else if (settlement.type === "CASH_IN") {
      direction = "INFLOW";
    } else {
      return {
        status: "INVALID",
        sourceModule: "CASH_SETTLEMENT",
        sourceId,
        rejectionReason: `Unrecognized settlement type '${settlement.type}'. Expected CASH_IN or CASH_OUT.`,
        errors: ["Invalid settlement type"],
      };
    }

    const movementType = mapSettlementCategoryToMovementType(settlement.category, direction);
    const paymentMethod = mapSettlementMethod(settlement.method, settlement.reference);

    // 6. Deterministic Movement ID
    const movementId = generateCashMovementId({
      businessId: businessId.trim(),
      sourceModule: "CASH_SETTLEMENT",
      sourceId,
      movementDate: dateVal,
      direction,
    });

    // 7. Metadata extraction for cross-source reconciliation
    const linkedInvoiceId = settlement.linked_invoice_id || (settlement as any).linkedInvoiceId;
    const linkedPayrollCycleId = settlement.linked_payroll_cycle_id || (settlement as any).linkedPayrollCycleId;
    const linkedBillId = settlement.linked_bill_id || (settlement as any).linkedBillId;
    const linkedAdvanceId = settlement.linked_advance_id || (settlement as any).linkedAdvanceId;

    const metadata: Record<string, any> = {
      ...(settlement.metadata || {}),
      rawSettlementId: sourceId,
      rawType: settlement.type,
      rawCategory: settlement.category,
      rawMethod: settlement.method,
      reference: settlement.reference,
      linkedInvoiceId: linkedInvoiceId ? String(linkedInvoiceId).trim() : undefined,
      linkedPayrollCycleId: linkedPayrollCycleId ? String(linkedPayrollCycleId).trim() : undefined,
      linkedBillId: linkedBillId ? String(linkedBillId).trim() : undefined,
      linkedAdvanceId: linkedAdvanceId ? String(linkedAdvanceId).trim() : undefined,
      createdBy: settlement.created_by || (settlement as any).createdBy,
    };

    const candidate: NormalizedCashMovement = {
      id: movementId,
      businessId: businessId.trim(),
      sourceModule: "CASH_SETTLEMENT",
      sourceId,
      movementDate: dateVal,
      direction,
      movementType,
      amount,
      amountCents,
      currency: rawCurrency,
      paymentMethod,
      status: "SETTLED",
      description: settlement.reference 
        ? `Règlement ${settlement.category || settlement.type}: ${settlement.reference}` 
        : `Règlement ${settlement.category || settlement.type}`,
      reference: settlement.reference,
      departmentId: settlement.department_id || (settlement as any).departmentId,
      employeeId: settlement.employee_id || (settlement as any).employeeId,
      metadata,
      createdAt: settlement.created_at || (settlement as any).createdAt || new Date().toISOString(),
    };

    // 8. Strict Zod Schema Validation
    const validation = validateNormalizedCashMovement(candidate);
    if (!validation.isValid) {
      return {
        status: "INVALID",
        sourceModule: "CASH_SETTLEMENT",
        sourceId,
        rejectionReason: `Zod validation failed: ${validation.errors.join("; ")}`,
        errors: validation.errors,
      };
    }

    return {
      status: "VALID",
      sourceModule: "CASH_SETTLEMENT",
      sourceId,
      movement: validation.data!,
    };
  }

  /**
   * Adapts a collection of CashSettlements in batch with summary statistics.
   */
  public static adaptBatch(
    settlements: CashSettlement[],
    options: CashSettlementAdapterOptions = {}
  ): BatchAdaptResult<NormalizedCashMovement> {
    const movements: NormalizedCashMovement[] = [];
    const results: CashAdapterResult<NormalizedCashMovement>[] = [];

    const summary = {
      totalInput: settlements.length,
      validCount: 0,
      invalidCount: 0,
      incompleteCount: 0,
      ambiguousCount: 0,
      ignoredCount: 0,
    };

    for (const item of settlements) {
      const res = this.adaptSettlement(item, options);
      results.push(res);

      switch (res.status) {
        case "VALID":
          summary.validCount++;
          if (res.movement) movements.push(res.movement);
          break;
        case "INVALID":
          summary.invalidCount++;
          break;
        case "INCOMPLETE":
          summary.incompleteCount++;
          break;
        case "AMBIGUOUS":
          summary.ambiguousCount++;
          break;
        case "IGNORED":
          summary.ignoredCount++;
          break;
      }
    }

    return {
      movements,
      results,
      summary,
    };
  }
}
