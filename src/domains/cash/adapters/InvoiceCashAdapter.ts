/**
 * FINOPS ERP — Cash Basis Accounting Foundation (SSOT)
 * InvoiceCashAdapter
 *
 * Transforms actual customer payment events into canonical NormalizedCashMovement.
 * STRICT SCOPE DISCIPLINE:
 * - Represents actual received cash (INFLOW) only.
 * - Invoice issuance (accrual sales / receivables) is NEVER treated as cash in.
 * - Respects partial and multiple payments when present in the repository.
 * - Never silently falls back to issueDate or dueDate if paidAt / paymentDate is missing.
 * - Preserves native currency (HTG/USD) without fictitious FX.
 * - Tracks ledger transaction linkage to prevent double counting.
 */

import type { Invoice, InvoicePayment } from "../../../types/crm";
import type {
  NormalizedCashMovement,
  RecognizedPaymentMethod,
} from "../types/NormalizedCashMovement";
import { generateCashMovementId } from "../types/NormalizedCashMovement";
import { validateNormalizedCashMovement } from "../validation/normalizedCashMovement.schema";
import { TreasuryClassification } from "../classification/TreasuryClassification";
import type { CashAdapterResult, BatchAdaptResult } from "./adapter.types";

/** Valid ISO Date format (YYYY-MM-DD) */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Extracts a clean YYYY-MM-DD date string from an ISO timestamp or date string.
 */
function extractDateOnly(dateVal?: string): string | undefined {
  if (!dateVal) return undefined;
  const trimmed = dateVal.trim();
  if (ISO_DATE_REGEX.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.includes("T")) {
    const part = trimmed.split("T")[0];
    if (ISO_DATE_REGEX.test(part)) {
      return part;
    }
  }
  return undefined;
}

/**
 * Maps CRM Invoice payment method string to canonical RecognizedPaymentMethod.
 */
function mapPaymentMethod(raw?: string): RecognizedPaymentMethod | undefined {
  if (!raw) return undefined;
  const upper = raw.trim().toUpperCase();
  switch (upper) {
    case "CASH":
      return "CASH";
    case "BANK":
    case "BANK_TRANSFER":
      return "BANK_TRANSFER";
    case "CHECK":
      return "CHECK";
    case "MONCASH":
      return "MONCASH";
    case "NATCASH":
      return "NATCASH";
    case "CARD":
      return "CARD";
    case "WIRE":
      return "WIRE";
    case "MOBILE_MONEY":
      return "MOBILE_MONEY";
    case "OTHER":
      return "OTHER";
    default:
      return "OTHER";
  }
}

export interface InvoiceAdaptOptions {
  /** Explicit destination treasury account ID if known at settlement */
  destinationAccountId?: string;
}

export class InvoiceCashAdapter {
  /**
   * Adapts an Invoice (and its payment events) into canonical NormalizedCashMovements.
   * Can produce multiple movements if the invoice has discrete partial payments.
   */
  public static adaptInvoice(
    invoice: Invoice,
    options: InvoiceAdaptOptions = {}
  ): CashAdapterResult {
    const sourceId = invoice.id || "";
    const businessId = invoice.businessId || (invoice as any).business_id || "";

    // 1. Mandatory Tenant Isolation Check
    if (!businessId || businessId.trim().length === 0) {
      return {
        status: "INVALID",
        sourceModule: "INVOICE",
        sourceId,
        rejectionReason: "Missing mandatory businessId for tenant isolation",
        errors: ["businessId is required"],
      };
    }

    if (!sourceId || sourceId.trim().length === 0) {
      return {
        status: "INVALID",
        sourceModule: "INVOICE",
        sourceId: "UNKNOWN",
        rejectionReason: "Missing mandatory invoice ID",
        errors: ["invoice.id is required"],
      };
    }

    // 2. Cancellation Check
    if (invoice.status === "CANCELLED") {
      return {
        status: "IGNORED",
        sourceModule: "INVOICE",
        sourceId,
        rejectionReason: "Invoice is CANCELLED; no cash collection recognized",
      };
    }

    // 3. Evaluate Payment Events
    // Case A: Granular payments array exists and contains records
    if (invoice.payments && Array.isArray(invoice.payments) && invoice.payments.length > 0) {
      const movements: NormalizedCashMovement[] = [];
      const errors: string[] = [];

      for (let i = 0; i < invoice.payments.length; i++) {
        const p: InvoicePayment = invoice.payments[i];
        const paymentEventId = p.id || `pmt_${i + 1}`;
        const paymentDate = extractDateOnly(p.paymentDate);

        if (!paymentDate) {
          errors.push(`Payment [${paymentEventId}] lacks valid paymentDate (cannot substitute issue/due date)`);
          continue;
        }

        const amount = Number(p.amount);
        if (isNaN(amount) || !isFinite(amount) || amount <= 0) {
          errors.push(`Payment [${paymentEventId}] has invalid amount: ${p.amount}`);
          continue;
        }

        const amountCents = Math.round(amount * 100);
        const pMethod = mapPaymentMethod(p.paymentMethod || invoice.paymentMethod);
        const currency = invoice.currency || "HTG";

        // Check explicit account if provided
        let cashAccountId: string | undefined = undefined;
        if (options.destinationAccountId) {
          const classification = TreasuryClassification.classify({
            accountCode: options.destinationAccountId,
            paymentMethod: pMethod,
            businessId,
          });
          if (classification.isTreasury) {
            cashAccountId = options.destinationAccountId;
          }
        }

        const id = generateCashMovementId({
          businessId,
          sourceModule: "INVOICE",
          sourceId,
          paymentEventId,
          movementDate: paymentDate,
          direction: "INFLOW",
        });

        const explicitFxRate =
          typeof (invoice as any).exchange_rate === "number" && Number.isFinite((invoice as any).exchange_rate) && (invoice as any).exchange_rate > 0
            ? (invoice as any).exchange_rate
            : undefined;
        const invoiceBranchId = (invoice as any).branchId || (invoice as any).branch_id;

        const movement: NormalizedCashMovement = {
          id,
          businessId,
          sourceModule: "INVOICE",
          sourceId,
          paymentEventId,
          movementDate: paymentDate,
          direction: "INFLOW",
          movementType: "INVOICE_COLLECTION",
          amount,
          amountCents,
          currency,
          cashAccountId,
          ...(invoiceBranchId ? { branchId: String(invoiceBranchId) } : {}),
          paymentMethod: pMethod,
          status: "SETTLED",
          description: `Encaissement Facture ${invoice.invoiceNumber || invoice.id} (${invoice.clientName || 'Client'})`,
          reference: p.reference || p.transactionId || invoice.invoiceNumber,
          metadata: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            paymentTransactionId: p.transactionId,
            ...(explicitFxRate ? { exchange_rate: explicitFxRate } : {}),
          },
          createdAt: p.createdAt || invoice.updatedAt || invoice.createdAt,
        };

        const val = validateNormalizedCashMovement(movement);
        if (val.isValid && val.data) {
          movements.push(val.data);
        } else {
          errors.push(...val.errors);
        }
      }

      if (errors.length > 0 && movements.length === 0) {
        return {
          status: "INVALID",
          sourceModule: "INVOICE",
          sourceId,
          rejectionReason: `Payment events failed validation: ${errors.join("; ")}`,
          errors,
        };
      }

      return {
        status: "VALID",
        sourceModule: "INVOICE",
        sourceId,
        movements,
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          totalPayments: movements.length,
          linkedLedgerTransactionIds: invoice.payments
            .map((p) => p.transactionId)
            .filter((t): t is string => !!t),
        },
      };
    }

    // Case B: Single Payment Settlement (invoice marked PAID, PARTIALLY_PAID, PARTIAL, or isPaid === true)
    const statusUpper = (invoice.status || "").toUpperCase();
    const isPaid = invoice.isPaid || statusUpper === "PAID";
    const isPartial = statusUpper === "PARTIALLY_PAID" || statusUpper === "PARTIAL";
    const rawPaidAmount =
      typeof invoice.amountPaid === "number" && invoice.amountPaid > 0
        ? invoice.amountPaid
        : typeof (invoice as any).amount_paid === "number" && (invoice as any).amount_paid > 0
        ? (invoice as any).amount_paid
        : typeof (invoice as any).paidAmount === "number" && (invoice as any).paidAmount > 0
        ? (invoice as any).paidAmount
        : typeof (invoice as any).paid_amount === "number" && (invoice as any).paid_amount > 0
        ? (invoice as any).paid_amount
        : isPaid
        ? Number(invoice.totalAmount ?? (invoice as any).total_amount ?? 0)
        : 0;
    const amountPaid = rawPaidAmount;

    if ((!isPaid && !isPartial && amountPaid <= 0) || (isPartial && amountPaid <= 0)) {
      return {
        status: "IGNORED",
        sourceModule: "INVOICE",
        sourceId,
        rejectionReason: `Invoice ${invoice.invoiceNumber || invoice.id} is unpaid (status: "${invoice.status}"). Accrual receivable is not cash.`,
      };
    }

    // Settlement date check: NEVER substitute issueDate or dueDate
    const settlementDate =
      extractDateOnly(invoice.paidAt) ||
      extractDateOnly((invoice as any).paid_at) ||
      extractDateOnly((invoice as any).paymentDate) ||
      extractDateOnly((invoice as any).payment_date);
    if (!settlementDate) {
      return {
        status: "INCOMPLETE",
        sourceModule: "INVOICE",
        sourceId,
        rejectionReason: `Invoice ${invoice.invoiceNumber || invoice.id} is marked paid but lacks a valid paidAt timestamp. Issue/Due date cannot be silently substituted for Cash Basis.`,
      };
    }

    if (isNaN(amountPaid) || !isFinite(amountPaid) || amountPaid <= 0) {
      return {
        status: "INVALID",
        sourceModule: "INVOICE",
        sourceId,
        rejectionReason: `Invalid payment amount on paid invoice: ${amountPaid}`,
        errors: ["amountPaid must be a positive finite number"],
      };
    }

    const amountCents = Math.round(amountPaid * 100);
    const pMethod = mapPaymentMethod(invoice.paymentMethod);
    const currency = invoice.currency || "HTG";

    let cashAccountId: string | undefined = undefined;
    if (options.destinationAccountId) {
      const classification = TreasuryClassification.classify({
        accountCode: options.destinationAccountId,
        paymentMethod: pMethod,
        businessId,
      });
      if (classification.isTreasury) {
        cashAccountId = options.destinationAccountId;
      }
    }

    const id = generateCashMovementId({
      businessId,
      sourceModule: "INVOICE",
      sourceId,
      movementDate: settlementDate,
      direction: "INFLOW",
    });

    const explicitFxRate =
      typeof (invoice as any).exchange_rate === "number" && Number.isFinite((invoice as any).exchange_rate) && (invoice as any).exchange_rate > 0
        ? (invoice as any).exchange_rate
        : undefined;
    const invoiceBranchId = (invoice as any).branchId || (invoice as any).branch_id;

    const candidate: NormalizedCashMovement = {
      id,
      businessId,
      sourceModule: "INVOICE",
      sourceId,
      movementDate: settlementDate,
      direction: "INFLOW",
      movementType: "INVOICE_COLLECTION",
      amount: amountPaid,
      amountCents,
      currency,
      cashAccountId,
      ...(invoiceBranchId ? { branchId: String(invoiceBranchId) } : {}),
      paymentMethod: pMethod,
      status: "SETTLED",
      description: `Encaissement Facture ${invoice.invoiceNumber || invoice.id} (${invoice.clientName || 'Client'})`,
      reference: invoice.paymentTransactionId || invoice.invoiceNumber,
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        paymentTransactionId: invoice.paymentTransactionId,
        ...(explicitFxRate ? { exchange_rate: explicitFxRate } : {}),
      },
      createdAt: invoice.paidAt || (invoice as any).paymentDate || invoice.updatedAt || invoice.createdAt,
    };

    const val = validateNormalizedCashMovement(candidate);
    if (!val.isValid) {
      return {
        status: "INVALID",
        sourceModule: "INVOICE",
        sourceId,
        rejectionReason: `Canonical schema validation failed: ${val.errors.join("; ")}`,
        errors: val.errors,
      };
    }

    return {
      status: "VALID",
      sourceModule: "INVOICE",
      sourceId,
      movement: val.data,
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        linkedLedgerTransactionId: invoice.paymentTransactionId,
        ...(explicitFxRate ? { exchange_rate: explicitFxRate } : {}),
      },
    };
  }

  /**
   * Adapts a list of Invoices in batch.
   */
  public static adaptInvoices(
    invoices: Invoice[],
    options: InvoiceAdaptOptions = {}
  ): BatchAdaptResult {
    const movements: NormalizedCashMovement[] = [];
    const results: CashAdapterResult[] = [];
    const summary = {
      totalInput: invoices.length,
      validCount: 0,
      invalidCount: 0,
      incompleteCount: 0,
      ambiguousCount: 0,
      ignoredCount: 0,
    };

    for (const inv of invoices) {
      const res = this.adaptInvoice(inv, options);
      results.push(res);

      switch (res.status) {
        case "VALID":
          if (res.movements && res.movements.length > 0) {
            movements.push(...res.movements);
          } else if (res.movement) {
            movements.push(res.movement);
          }
          summary.validCount++;
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
