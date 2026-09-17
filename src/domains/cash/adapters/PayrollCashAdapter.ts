/**
 * FINOPS ERP — Cash Basis Accounting Foundation (SSOT)
 * PayrollCashAdapter
 *
 * Transforms actual payroll disbursement events into canonical NormalizedCashMovement.
 * STRICT SCOPE DISCIPLINE:
 * - Represents actual disbursed cash (OUTFLOW) only.
 * - Accrual payroll expense (gross salary / provisions) is NEVER treated as cash paid.
 * - Never silently falls back to period endDate if paidAt / disbursedAt is missing.
 * - Preserves native currency (HTG/USD) without fictitious FX.
 * - Enforces deterministic deduplication and tenant isolation.
 */

import type { PayrollRecord, PayrollCycle } from "../../../types";
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

export interface PayrollAdaptOptions {
  cycle?: PayrollCycle | null;
  /** Explicit disbursement payment method if known at cycle settlement */
  disbursementPaymentMethod?: RecognizedPaymentMethod;
  /** Explicit bank/cash account ID if known at cycle settlement */
  disbursementAccountId?: string;
}

export class PayrollCashAdapter {
  /**
   * Adapts a single PayrollRecord into a NormalizedCashMovement.
   */
  public static adaptRecord(
    record: PayrollRecord,
    options: PayrollAdaptOptions = {}
  ): CashAdapterResult {
    const sourceId = record.id || (record as any)._id || "";
    const businessId = record.business_id || options.cycle?.business_id || "";

    // 1. Mandatory Tenant Isolation Check
    if (!businessId || businessId.trim().length === 0) {
      return {
        status: "INVALID",
        sourceModule: "PAYROLL",
        sourceId,
        rejectionReason: "Missing mandatory business_id for tenant isolation",
        errors: ["business_id is required"],
      };
    }

    if (!sourceId || sourceId.trim().length === 0) {
      return {
        status: "INVALID",
        sourceModule: "PAYROLL",
        sourceId: "UNKNOWN",
        rejectionReason: "Missing mandatory payroll record ID",
        errors: ["record.id is required"],
      };
    }

    // 2. Status & Settlement Verification
    // A payroll record is considered paid only if its status is PAID or SEALED,
    // or if the parent cycle is PAID / SEALED with a disbursement execution.
    const isRecordPaid = record.status === "PAID" || record.status === "SEALED";
    const isCyclePaid = options.cycle?.status === "PAID" || options.cycle?.status === "SEALED" || !!options.cycle?.disbursedAt;

    if (!isRecordPaid && !isCyclePaid) {
      return {
        status: "IGNORED",
        sourceModule: "PAYROLL",
        sourceId,
        rejectionReason: `Payroll record not disbursed (record.status: "${record.status}", cycle.status: "${options.cycle?.status || 'NONE'}"). Accrual payroll does not impact Cash Basis.`,
      };
    }

    // 3. Date Determination (Strict: No Silent Fallback to period endDate)
    // Priority:
    // a) record.paidAt
    // b) cycle.disbursedAt
    // c) cycle.effectiveAccountingDate (only if cycle is actually PAID/SEALED)
    const recPaidDate = extractDateOnly((record as any).paidAt);
    const cycleDisbursedDate = extractDateOnly(options.cycle?.disbursedAt);
    const cycleEffectiveDate = (isCyclePaid && options.cycle?.effectiveAccountingDate)
      ? extractDateOnly(options.cycle.effectiveAccountingDate)
      : undefined;

    const settlementDate = recPaidDate || cycleDisbursedDate || cycleEffectiveDate;

    if (!settlementDate) {
      return {
        status: "INCOMPLETE",
        sourceModule: "PAYROLL",
        sourceId,
        rejectionReason: "Missing actual disbursement date (paidAt / disbursedAt). Accrual cycle endDate cannot be silently substituted for Cash Basis.",
      };
    }

    // 4. Amount Determination (Net Paid to Employee)
    const netSalaryCents = typeof record.net_salary_cents === "number"
      ? record.net_salary_cents
      : undefined;
    const netPaid = typeof record.netPaid === "number"
      ? record.netPaid
      : (typeof (record as any).net_salary === "number" ? (record as any).net_salary : undefined);

    let amount: number;
    let amountCents: number;

    if (netSalaryCents !== undefined && !isNaN(netSalaryCents)) {
      amountCents = Math.round(netSalaryCents);
      amount = amountCents / 100;
    } else if (netPaid !== undefined && !isNaN(netPaid)) {
      amount = netPaid;
      amountCents = Math.round(netPaid * 100);
    } else {
      return {
        status: "INVALID",
        sourceModule: "PAYROLL",
        sourceId,
        rejectionReason: "Missing or invalid net payout amount (neither netPaid nor net_salary_cents available)",
        errors: ["netPaid or net_salary_cents must be a valid number"],
      };
    }

    // Validate numeric integrity
    if (isNaN(amount) || !isFinite(amount) || isNaN(amountCents) || !isFinite(amountCents)) {
      return {
        status: "INVALID",
        sourceModule: "PAYROLL",
        sourceId,
        rejectionReason: "Corrupted financial amount (NaN or Infinity)",
        errors: ["amount must be finite"],
      };
    }

    if (amountCents < 0 || amount < 0) {
      return {
        status: "INVALID",
        sourceModule: "PAYROLL",
        sourceId,
        rejectionReason: "Negative net salary payout is financially invalid for disbursement",
        errors: ["amount cannot be negative"],
      };
    }

    if (amountCents === 0) {
      return {
        status: "IGNORED",
        sourceModule: "PAYROLL",
        sourceId,
        rejectionReason: "Net salary payout is zero; no cash outflow occurred",
      };
    }

    // 5. Currency Determination (Native currency preserved)
    const currency = (record as any).currency || (options.cycle as any)?.currency || "HTG";

    // 6. Treasury Account Determination
    // Do NOT invent accounts. If an explicit disbursement account was provided, classify it.
    let cashAccountId: string | undefined = undefined;
    let paymentMethod: RecognizedPaymentMethod | undefined = options.disbursementPaymentMethod;

    if (options.disbursementAccountId) {
      const classification = TreasuryClassification.classify({
        accountCode: options.disbursementAccountId,
        paymentMethod,
        businessId,
      });
      if (classification.isTreasury) {
        cashAccountId = options.disbursementAccountId;
      }
    }

    // 7. Status & Reversal handling
    const isReversed = options.cycle?.isReversed || (record as any).isReversed || record.status === "CORRECTED";
    const movementStatus = isReversed ? "REVERSED" : "PAID";
    const reversalOf = options.cycle?.reversalOfCycleId
      ? generateCashMovementId({
          businessId,
          sourceModule: "PAYROLL",
          sourceId: `${sourceId}_orig`,
          movementDate: settlementDate,
          direction: "OUTFLOW",
        })
      : undefined;

    // 8. Deterministic ID Generation
    const id = generateCashMovementId({
      businessId,
      sourceModule: "PAYROLL",
      sourceId,
      movementDate: settlementDate,
      direction: "OUTFLOW",
    });

    const candidateMovement: NormalizedCashMovement = {
      id,
      businessId,
      sourceModule: "PAYROLL",
      sourceId,
      movementDate: settlementDate,
      direction: "OUTFLOW",
      movementType: "PAYROLL",
      amount,
      amountCents,
      currency,
      cashAccountId,
      paymentMethod,
      departmentId: record.department_id || (record as any).departmentId,
      employeeId: record.employeeId || record.employee_id,
      branchId: record.branch_id || (record as any).branchId,
      status: movementStatus,
      description: `Paiement Salaire Net - ${record.employeeName || record.employeeId}`,
      reference: options.cycle?.cycleName || options.cycle?.label || record.cycleId,
      reversalOf,
      metadata: {
        cycleId: record.cycleId || options.cycle?.id,
        grossSalary: record.grossSalary,
      },
      createdAt: (record as any).created_at || (record as any).updated_at || new Date().toISOString(),
    };

    // 9. Zod Validation Gate
    const validation = validateNormalizedCashMovement(candidateMovement);
    if (!validation.isValid) {
      return {
        status: "INVALID",
        sourceModule: "PAYROLL",
        sourceId,
        rejectionReason: `Canonical schema validation failed: ${validation.errors.join("; ")}`,
        errors: validation.errors,
      };
    }

    return {
      status: "VALID",
      sourceModule: "PAYROLL",
      sourceId,
      movement: validation.data,
      metadata: {
        cycleId: record.cycleId || options.cycle?.id,
        grossSalary: record.grossSalary,
      },
    };
  }

  /**
   * Adapts a complete batch of PayrollRecords for a cycle.
   */
  public static adaptCycle(
    cycle: PayrollCycle,
    records: PayrollRecord[],
    options: Omit<PayrollAdaptOptions, "cycle"> = {}
  ): BatchAdaptResult {
    const movements: NormalizedCashMovement[] = [];
    const results: CashAdapterResult[] = [];
    const summary = {
      totalInput: records.length,
      validCount: 0,
      invalidCount: 0,
      incompleteCount: 0,
      ambiguousCount: 0,
      ignoredCount: 0,
    };

    for (const record of records) {
      const res = this.adaptRecord(record, { ...options, cycle });
      results.push(res);

      switch (res.status) {
        case "VALID":
          if (res.movement) movements.push(res.movement);
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
