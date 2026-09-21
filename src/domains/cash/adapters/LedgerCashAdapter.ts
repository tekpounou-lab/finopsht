/**
 * FINOPS ERP — Cash Basis Accounting Foundation (SSOT)
 * LedgerCashAdapter
 *
 * Transforms General Ledger transactions into canonical NormalizedCashMovement.
 * STRICT SCOPE DISCIPLINE:
 * - Detects real Treasury legs using the centralized TreasuryClassification.
 * - Filters out non-treasury accrual transactions (Expense <-> Payable, AR <-> Revenue).
 * - Identifies and tags internal transfers (Cash <-> Bank, Safe <-> Till).
 * - Handles reversible and voided transactions preserving audit traces.
 * - Distinguishes between single consolidated transfer movement and granular split legs.
 * - Extracts linkage metadata (payrollCycleId, invoiceId) for cross-module deduplication.
 */

import type { LedgerTransaction } from "../../../types";
import type {
  NormalizedCashMovement,
  CashMovementDirection,
  CashMovementType,
  RecognizedPaymentMethod,
} from "../types/NormalizedCashMovement";
import { generateCashMovementId } from "../types/NormalizedCashMovement";
import { validateNormalizedCashMovement } from "../validation/normalizedCashMovement.schema";
import { TreasuryClassification } from "../classification/TreasuryClassification";
import type { CashAdapterResult, BatchAdaptResult } from "./adapter.types";
import { resolveAnalyticsTxDate } from "../../../utils/dateNormalization";
import { DEFAULT_PAYMENT_METHODS } from "../../../repositories/PaymentMethodRepository";
import type { PaymentMethod } from "../../../repositories/PaymentMethodRepository";

/** Valid ISO Date format (YYYY-MM-DD) */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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

function mapPaymentMethod(raw?: string, paymentMethods?: PaymentMethod[]): RecognizedPaymentMethod | undefined {
  if (!raw) return undefined;
  const upper = raw.trim().toUpperCase();
  const methods = paymentMethods || (DEFAULT_PAYMENT_METHODS as PaymentMethod[]);
  const found = methods.find(m => m.code === upper || m.id === raw);
  if (!found || found.status !== "ACTIVE") {
    return undefined; // Must return undefined for unrecognized, inactive, or non-cash payment methods
  }
  if (found.accountingEffect === "NON_CASH") {
    return undefined; // Explicitly non-cash
  }
  // Map back to a RecognizedPaymentMethod if possible
  const category = found.category;
  switch (category) {
    case "CASH":
      return "CASH";
    case "BANK":
    case "BANK_TRANSFER":
      return "BANK_TRANSFER";
    case "CHECK":
      return "CHECK";
    case "MOBILE_MONEY":
      if (found.code === "MONCASH") return "MONCASH";
      if (found.code === "NATCASH") return "NATCASH";
      return "MOBILE_MONEY";
    case "CARD":
      return "CARD";
    case "WIRE":
      return "WIRE";
    default:
      return "OTHER";
  }
}

function mapLedgerTypeToMovementType(
  type?: LedgerTransaction["type"],
  direction?: CashMovementDirection
): CashMovementType {
  switch (type) {
    case "PAYROLL":
      return "PAYROLL";
    case "INCOME":
      return "SALE";
    case "EXPENSE":
      return "EXPENSE";
    case "ADVANCE":
      return "ADVANCE";
    case "TRANSFER":
      return "TRANSFER";
    case "REFUND":
      return "REFUND";
    default:
      return direction === "INFLOW" ? "SALE" : "EXPENSE";
  }
}

export interface LedgerAdaptOptions {
  /**
   * If true, an internal transfer (Treasury <-> Treasury) is split into two discrete movements:
   * 1. OUTFLOW leg from the credit account
   * 2. INFLOW leg to the debit account
   * Each leg receives a unique deterministic ID with direction suffix.
   * If false, a single consolidated movement with direction = 'TRANSFER' is emitted.
   */
  splitTransfers?: boolean;
  /** Injected active payment methods for dynamic resolution and rules classification */
  paymentMethods?: PaymentMethod[];
}

export class LedgerCashAdapter {
  /**
   * Adapts a single LedgerTransaction into canonical NormalizedCashMovement(s).
   */
  public static adaptTransaction(
    tx: LedgerTransaction,
    options: LedgerAdaptOptions = {}
  ): CashAdapterResult {
    const sourceId = tx.id || "";
    const businessId = tx.business_id || tx.businessId || "";

    // 1. Mandatory Tenant Isolation Check
    if (!businessId || businessId.trim().length === 0) {
      return {
        status: "INVALID",
        sourceModule: "LEDGER",
        sourceId,
        rejectionReason: "Missing mandatory business_id for tenant isolation",
        errors: ["business_id is required"],
      };
    }

    if (!sourceId || sourceId.trim().length === 0) {
      return {
        status: "INVALID",
        sourceModule: "LEDGER",
        sourceId: "UNKNOWN",
        rejectionReason: "Missing mandatory transaction id",
        errors: ["tx.id is required"],
      };
    }

    // 2. Status Check
    const statusUpper = (tx.status || "").toUpperCase();
    if (
      statusUpper === "PENDING" ||
      statusUpper === "VOID" ||
      statusUpper === "VOIDED" ||
      statusUpper === "CANCELLED" ||
      (statusUpper === "REVERSED" && tx.type !== "REVERSAL") ||
      ((tx as any).is_reversed && tx.type !== "REVERSAL")
    ) {
      return {
        status: "IGNORED",
        sourceModule: "LEDGER",
        sourceId,
        rejectionReason: `Ledger transaction status "${statusUpper || "REVERSED"}" is not recognized in Cash Basis`,
      };
    }

    // 3. Date Determination
    const rawTxDate = resolveAnalyticsTxDate(tx, true) || tx.date;
    const movementDate = extractDateOnly(rawTxDate);
    if (!movementDate) {
      return {
        status: "INVALID",
        sourceModule: "LEDGER",
        sourceId,
        rejectionReason: `Missing or invalid transaction date: "${tx.date}"`,
        errors: ["date must match YYYY-MM-DD format"],
      };
    }

    // 4. Amount Determination
    let amountCents: number;
    let amount: number;

    if (typeof tx.amount_cents === "number" && !isNaN(tx.amount_cents)) {
      amountCents = Math.round(tx.amount_cents);
      amount = amountCents / 100;
    } else if (typeof tx.amountCents === "number" && !isNaN(tx.amountCents)) {
      amountCents = Math.round(tx.amountCents);
      amount = amountCents / 100;
    } else if (typeof tx.amount === "number" && !isNaN(tx.amount)) {
      amount = tx.amount;
      amountCents = Math.round(tx.amount * 100);
    } else {
      return {
        status: "INVALID",
        sourceModule: "LEDGER",
        sourceId,
        rejectionReason: "Missing or invalid amount on ledger transaction",
        errors: ["amount or amount_cents must be a valid number"],
      };
    }

    if (isNaN(amount) || !isFinite(amount) || isNaN(amountCents) || !isFinite(amountCents)) {
      return {
        status: "INVALID",
        sourceModule: "LEDGER",
        sourceId,
        rejectionReason: "Corrupted amount on ledger transaction (NaN or Infinity)",
        errors: ["amount must be finite"],
      };
    }

    if (amountCents <= 0 || amount <= 0) {
      return {
        status: "INVALID",
        sourceModule: "LEDGER",
        sourceId,
        rejectionReason: "Transaction amount must be strictly greater than zero",
        errors: ["amount must be positive"],
      };
    }

    // 5. Currency Determination
    const currency = tx.currency || "HTG";

    // 6. Treasury Classification of Debit & Credit accounts
    const debitAccount = tx.debit_account || tx.debitAccount;
    const creditAccount = tx.credit_account || tx.creditAccount;

    const debitClassification = TreasuryClassification.classify({
      accountCode: debitAccount,
      businessId,
    });

    const creditClassification = TreasuryClassification.classify({
      accountCode: creditAccount,
      businessId,
    });

    let isDebitTreasury = debitClassification.isTreasury;
    let isCreditTreasury = creditClassification.isTreasury;

    const txTypeUpper = (tx.type || "").toUpperCase();
    const catUpper = (tx.category || (tx as any).category_name || (tx as any).categoryName || "").toUpperCase();
    const pMethod = mapPaymentMethod(tx.paymentMethod || tx.payment_method, options.paymentMethods);

    const isIncomeType =
      ["INCOME", "REVENUE", "SALES", "VENTE", "VENTES", "CREDIT"].includes(txTypeUpper) ||
      catUpper.includes("INCOME") ||
      catUpper.includes("REVENUE") ||
      catUpper.includes("VENTE") ||
      catUpper.includes("RECETTE") ||
      catUpper.includes("SALES");

    const rawPMethodUpper = (tx.paymentMethod || tx.payment_method || "").toUpperCase().trim();

    const activeMethods = options.paymentMethods || (DEFAULT_PAYMENT_METHODS as PaymentMethod[]);
    const matchedMethod = activeMethods.find(m => m.code === rawPMethodUpper || m.id === (tx.paymentMethod || tx.payment_method));
    const isExplicitCashPaymentMethod = matchedMethod ? (matchedMethod.accountingEffect === "TREASURY" && matchedMethod.status === "ACTIVE") : false;

    // If neither account was explicitly classified as class 10 treasury, ONLY default to treasury if an explicit, supported cash payment method is provided
    if (!isDebitTreasury && !isCreditTreasury && isExplicitCashPaymentMethod) {
      if (isIncomeType) {
        isDebitTreasury = true;
      } else if (
        txTypeUpper === "EXPENSE" ||
        txTypeUpper === "PAYROLL" ||
        txTypeUpper === "ADVANCE" ||
        catUpper.includes("OPEX") ||
        catUpper.includes("EXPENSE") ||
        catUpper.includes("PAYROLL")
      ) {
        isCreditTreasury = true;
      }
    }

    // Cross-module deduplication links
    const linkedCycleId = tx.metadata?.payrollCycleId || tx.metadata?.cycleId;
    const linkedInvoiceId = tx.metadata?.crmInvoiceId || tx.metadata?.invoiceId;
    const isPayrollEngine = tx.source === "PAYROLL_ENGINE" || !!linkedCycleId;
    const isInvoicePayment = tx.category === "SALES_PAYMENT" || !!linkedInvoiceId;

    const metadata = {
      debitAccount,
      creditAccount,
      isDebitTreasury,
      isCreditTreasury,
      linkedCycleId,
      linkedInvoiceId,
      isPayrollEngine,
      isInvoicePayment,
      source: tx.source,
      category: tx.category,
    };

    const isReversed = tx.status === "REVERSED" || tx.type === "REVERSAL";
    const movementStatus = isReversed ? "REVERSED" : "POSTED";
    const reversalOf = tx.referenceTransactionId;

    // Case 1: Non-Treasury <-> Non-Treasury (Zero Cash Impact)
    if (!isDebitTreasury && !isCreditTreasury) {
      return {
        status: "IGNORED",
        sourceModule: "LEDGER",
        sourceId,
        rejectionReason: `Neither debit account (${debitAccount || 'none'}) nor credit account (${creditAccount || 'none'}) qualifies as Treasury. Accrual-only entry.`,
        metadata,
      };
    }

    // Case 2: Internal Transfer (Treasury <-> Treasury)
    if (isDebitTreasury && isCreditTreasury) {
      if (options.splitTransfers) {
        // Produce two granular legs for distinct account balance tracking
        const outflowId = generateCashMovementId({
          businessId,
          sourceModule: "LEDGER",
          sourceId,
          movementDate,
          direction: "OUTFLOW",
        });

        const inflowId = generateCashMovementId({
          businessId,
          sourceModule: "LEDGER",
          sourceId,
          movementDate,
          direction: "INFLOW",
        });

        const outflowLeg: NormalizedCashMovement = {
          id: outflowId,
          businessId,
          sourceModule: "LEDGER",
          sourceId,
          movementDate,
          direction: "OUTFLOW",
          movementType: "TRANSFER",
          amount,
          amountCents,
          currency,
          cashAccountId: creditAccount,
          destinationCashAccountId: debitAccount,
          paymentMethod: pMethod,
          departmentId: tx.department_id || tx.departmentId,
          branchId: tx.branch_id || tx.branchId,
          employeeId: tx.employee_id || tx.employeeId,
          status: movementStatus,
          description: tx.description || `Transfert Sortant vers ${debitAccount}`,
          reference: tx.id,
          reversalOf,
          createdAt: (tx as any).createdAt || (tx as any).created_at,
        };

        const inflowLeg: NormalizedCashMovement = {
          id: inflowId,
          businessId,
          sourceModule: "LEDGER",
          sourceId,
          movementDate,
          direction: "INFLOW",
          movementType: "TRANSFER",
          amount,
          amountCents,
          currency,
          cashAccountId: debitAccount,
          sourceCashAccountId: creditAccount,
          paymentMethod: pMethod,
          departmentId: tx.department_id || tx.departmentId,
          branchId: tx.branch_id || tx.branchId,
          employeeId: tx.employee_id || tx.employeeId,
          status: movementStatus,
          description: tx.description || `Transfert Entrant depuis ${creditAccount}`,
          reference: tx.id,
          reversalOf,
          createdAt: (tx as any).createdAt || (tx as any).created_at,
        };

        const valOut = validateNormalizedCashMovement(outflowLeg);
        const valIn = validateNormalizedCashMovement(inflowLeg);

        if (!valOut.isValid || !valIn.isValid) {
          const errors = [...(valOut.errors || []), ...(valIn.errors || [])];
          return {
            status: "INVALID",
            sourceModule: "LEDGER",
            sourceId,
            rejectionReason: `Split transfer validation failed: ${errors.join("; ")}`,
            errors,
            metadata,
          };
        }

        return {
          status: "VALID",
          sourceModule: "LEDGER",
          sourceId,
          movements: [valOut.data!, valIn.data!],
          metadata,
        };
      }

      // Single consolidated transfer movement
      const id = generateCashMovementId({
        businessId,
        sourceModule: "LEDGER",
        sourceId,
        movementDate,
        direction: "TRANSFER",
      });

      const transferMovement: NormalizedCashMovement = {
        id,
        businessId,
        sourceModule: "LEDGER",
        sourceId,
        movementDate,
        direction: "TRANSFER",
        movementType: "TRANSFER",
        amount,
        amountCents,
        currency,
        sourceCashAccountId: creditAccount,
        destinationCashAccountId: debitAccount,
        paymentMethod: pMethod,
        departmentId: tx.department_id || tx.departmentId,
        branchId: tx.branch_id || tx.branchId,
        employeeId: tx.employee_id || tx.employeeId,
        status: movementStatus,
        description: tx.description || `Virement Interne ${creditAccount} -> ${debitAccount}`,
        reference: tx.id,
        reversalOf,
        createdAt: (tx as any).createdAt || (tx as any).created_at,
      };

      const val = validateNormalizedCashMovement(transferMovement);
      if (!val.isValid) {
        return {
          status: "INVALID",
          sourceModule: "LEDGER",
          sourceId,
          rejectionReason: `Transfer movement schema validation failed: ${val.errors.join("; ")}`,
          errors: val.errors,
          metadata,
        };
      }

      return {
        status: "VALID",
        sourceModule: "LEDGER",
        sourceId,
        movement: val.data,
        metadata,
      };
    }

    // Case 3: Debit is Treasury, Credit is NOT Treasury (Cash Inflow)
    if (isDebitTreasury && !isCreditTreasury) {
      const id = generateCashMovementId({
        businessId,
        sourceModule: "LEDGER",
        sourceId,
        movementDate,
        direction: "INFLOW",
      });

      const movementType = mapLedgerTypeToMovementType(tx.type, "INFLOW");

      const candidate: NormalizedCashMovement = {
        id,
        businessId,
        sourceModule: "LEDGER",
        sourceId,
        movementDate,
        direction: "INFLOW",
        movementType,
        amount,
        amountCents,
        currency,
        cashAccountId: debitAccount,
        paymentMethod: pMethod,
        departmentId: tx.department_id || tx.departmentId,
        branchId: tx.branch_id || tx.branchId,
        employeeId: tx.employee_id || tx.employeeId,
        status: movementStatus,
        description: tx.description || `Encaissement sur compte ${debitAccount}`,
        reference: tx.id,
        reversalOf,
        metadata,
        createdAt: (tx as any).createdAt || (tx as any).created_at,
      };

      const val = validateNormalizedCashMovement(candidate);
      if (!val.isValid) {
        return {
          status: "INVALID",
          sourceModule: "LEDGER",
          sourceId,
          rejectionReason: `Inflow schema validation failed: ${val.errors.join("; ")}`,
          errors: val.errors,
          metadata,
        };
      }

      return {
        status: "VALID",
        sourceModule: "LEDGER",
        sourceId,
        movement: val.data,
        metadata,
      };
    }

    // Case 4: Credit is Treasury, Debit is NOT Treasury (Cash Outflow)
    if (isCreditTreasury && !isDebitTreasury) {
      const id = generateCashMovementId({
        businessId,
        sourceModule: "LEDGER",
        sourceId,
        movementDate,
        direction: "OUTFLOW",
      });

      const movementType = mapLedgerTypeToMovementType(tx.type, "OUTFLOW");

      const candidate: NormalizedCashMovement = {
        id,
        businessId,
        sourceModule: "LEDGER",
        sourceId,
        movementDate,
        direction: "OUTFLOW",
        movementType,
        amount,
        amountCents,
        currency,
        cashAccountId: creditAccount,
        paymentMethod: pMethod,
        departmentId: tx.department_id || tx.departmentId,
        branchId: tx.branch_id || tx.branchId,
        employeeId: tx.employee_id || tx.employeeId,
        status: movementStatus,
        description: tx.description || `Décaissement sur compte ${creditAccount}`,
        reference: tx.id,
        reversalOf,
        metadata,
        createdAt: (tx as any).createdAt || (tx as any).created_at,
      };

      const val = validateNormalizedCashMovement(candidate);
      if (!val.isValid) {
        return {
          status: "INVALID",
          sourceModule: "LEDGER",
          sourceId,
          rejectionReason: `Outflow schema validation failed: ${val.errors.join("; ")}`,
          errors: val.errors,
          metadata,
        };
      }

      return {
        status: "VALID",
        sourceModule: "LEDGER",
        sourceId,
        movement: val.data,
        metadata,
      };
    }

    // Unreachable fallback
    return {
      status: "AMBIGUOUS",
      sourceModule: "LEDGER",
      sourceId,
      rejectionReason: "Ambiguous treasury classification state",
      metadata,
    };
  }

  /**
   * Adapts a list of LedgerTransactions in batch.
   */
  public static adaptTransactions(
    transactions: LedgerTransaction[],
    options: LedgerAdaptOptions = {}
  ): BatchAdaptResult {
    const movements: NormalizedCashMovement[] = [];
    const results: CashAdapterResult[] = [];
    const summary = {
      totalInput: transactions.length,
      validCount: 0,
      invalidCount: 0,
      incompleteCount: 0,
      ambiguousCount: 0,
      ignoredCount: 0,
    };

    for (const tx of transactions) {
      const res = this.adaptTransaction(tx, options);
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
