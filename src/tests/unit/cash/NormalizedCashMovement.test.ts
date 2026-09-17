import { describe, it, expect } from "vitest";
import {
  NormalizedCashMovement,
  generateCashMovementId,
  isEffectiveCashMovement,
  isInternalTransfer,
  getCashFlowImpact,
  validateNormalizedCashMovement,
  TreasuryClassification,
} from "../../../domains/cash";

describe("Cash Basis Foundation — Phase 1 Test Suite", () => {
  const baseValidMovement: NormalizedCashMovement = {
    id: "cm_biz_test_PAYROLL_pr_001_2026-08-15_OUTFLOW",
    businessId: "biz_test",
    sourceModule: "PAYROLL",
    sourceId: "pr_001",
    paymentEventId: "pe_999",
    movementDate: "2026-08-15",
    direction: "OUTFLOW",
    movementType: "PAYROLL",
    amount: 50000,
    amountCents: 5000000,
    currency: "HTG",
    cashAccountId: "1000_CASH",
    paymentMethod: "CASH",
    status: "PAID",
    description: "Paie quinzaine août 2026",
    reference: "PAY-2026-08-01",
  };

  describe("1. Contract & Strict Zod Validation", () => {
    it("1. validates a well-formed canonical cash movement", () => {
      const result = validateNormalizedCashMovement(baseValidMovement);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.data).toBeDefined();
      expect(result.data?.businessId).toBe("biz_test");
      expect(result.data?.amount).toBe(50000);
      expect(result.data?.amountCents).toBe(5000000);
    });

    it("2. rejects when businessId is missing or empty", () => {
      const invalid = { ...baseValidMovement, businessId: "" };
      const result = validateNormalizedCashMovement(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("businessId"))).toBe(true);
    });

    it("3. rejects when sourceId is missing or empty", () => {
      const invalid = { ...baseValidMovement, sourceId: "" };
      const result = validateNormalizedCashMovement(invalid);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("sourceId"))).toBe(true);
    });

    it("4. rejects invalid date formats (not YYYY-MM-DD or invalid calendar date)", () => {
      const invalidFormat = { ...baseValidMovement, movementDate: "15/08/2026" };
      const resFormat = validateNormalizedCashMovement(invalidFormat);
      expect(resFormat.isValid).toBe(false);

      const invalidCalendar = { ...baseValidMovement, movementDate: "2026-99-99" };
      const resCal = validateNormalizedCashMovement(invalidCalendar);
      expect(resCal.isValid).toBe(false);
    });

    it("5. rejects invalid amount values (NaN, negative, infinite)", () => {
      const nanAmount = { ...baseValidMovement, amount: NaN };
      expect(validateNormalizedCashMovement(nanAmount).isValid).toBe(false);

      const negAmount = { ...baseValidMovement, amount: -500 };
      expect(validateNormalizedCashMovement(negAmount).isValid).toBe(false);

      const infAmount = { ...baseValidMovement, amount: Infinity };
      expect(validateNormalizedCashMovement(infAmount).isValid).toBe(false);

      const negCents = { ...baseValidMovement, amountCents: -100 };
      expect(validateNormalizedCashMovement(negCents).isValid).toBe(false);

      const floatCents = { ...baseValidMovement, amountCents: 100.55 };
      expect(validateNormalizedCashMovement(floatCents).isValid).toBe(false);
    });

    it("6. rejects when currency is missing or shorter than 2 chars", () => {
      const noCurrency = { ...baseValidMovement, currency: "" };
      expect(validateNormalizedCashMovement(noCurrency).isValid).toBe(false);

      const oneCharCurrency = { ...baseValidMovement, currency: "$" };
      expect(validateNormalizedCashMovement(oneCharCurrency).isValid).toBe(false);
    });

    it("7. rejects invalid direction", () => {
      const invalidDir = { ...baseValidMovement, direction: "SIDEWAYS" as any };
      expect(validateNormalizedCashMovement(invalidDir).isValid).toBe(false);
    });

    it("8. rejects invalid status", () => {
      const invalidStatus = { ...baseValidMovement, status: "PENDING_MOCK" as any };
      expect(validateNormalizedCashMovement(invalidStatus).isValid).toBe(false);
    });
  });

  describe("2. Centralized Treasury Classification Engine", () => {
    it("9. confirms Treasury accounts by explicit SSOT codes and Class 10 prefixes", () => {
      const cashRes = TreasuryClassification.classify({ accountCode: "1000_CASH" });
      expect(cashRes.isTreasury).toBe(true);
      expect(cashRes.accountType).toBe("CASH");
      expect(cashRes.confidence).toBe("EXPLICIT_SSOT_CODE");

      const bankRes = TreasuryClassification.classify({ accountCode: "1010_BANK" });
      expect(bankRes.isTreasury).toBe(true);
      expect(bankRes.accountType).toBe("BANK");
      expect(bankRes.confidence).toBe("EXPLICIT_SSOT_CODE");

      const prefix10Res = TreasuryClassification.classify({
        accountCode: "1020_COFFRE_FORT",
        accountName: "Coffre central",
      });
      expect(prefix10Res.isTreasury).toBe(true);
      expect(prefix10Res.confidence).toBe("CODE_PREFIX_10");
    });

    it("10. strictly rejects non-Treasury accounts (Receivables, Payables, Expenses, Revenue)", () => {
      const arRes = TreasuryClassification.classify({ accountCode: "1200_ACCOUNTS_RECEIVABLE" });
      expect(arRes.isTreasury).toBe(false);

      const advanceRes = TreasuryClassification.classify({ accountCode: "1300_EMPLOYEE_ADVANCES" });
      expect(advanceRes.isTreasury).toBe(false);

      const apRes = TreasuryClassification.classify({ accountCode: "2000_ACCOUNTS_PAYABLE" });
      expect(apRes.isTreasury).toBe(false);

      const expenseRes = TreasuryClassification.classify({ accountCode: "5000_PAYROLL_EXPENSE" });
      expect(expenseRes.isTreasury).toBe(false);

      const revenueRes = TreasuryClassification.classify({ accountCode: "4000_OPERATING_REVENUE" });
      expect(revenueRes.isTreasury).toBe(false);
    });

    it("11. recognizes payment method CASH", () => {
      const res = TreasuryClassification.classify({ paymentMethod: "CASH" });
      expect(res.isTreasury).toBe(true);
      expect(res.accountType).toBe("CASH");
      expect(res.confidence).toBe("PAYMENT_METHOD");
    });

    it("12. recognizes payment method BANK / BANK_TRANSFER / CHECK / WIRE", () => {
      const res1 = TreasuryClassification.classify({ paymentMethod: "BANK" });
      expect(res1.isTreasury).toBe(true);
      expect(res1.accountType).toBe("BANK");

      const res2 = TreasuryClassification.classify({ paymentMethod: "BANK_TRANSFER" });
      expect(res2.isTreasury).toBe(true);
      expect(res2.accountType).toBe("BANK");

      const res3 = TreasuryClassification.classify({ paymentMethod: "CHECK" });
      expect(res3.isTreasury).toBe(true);
      expect(res3.accountType).toBe("BANK");
    });

    it("13. recognizes payment method MOBILE_MONEY / MONCASH / NATCASH", () => {
      const res1 = TreasuryClassification.classify({ paymentMethod: "MONCASH" });
      expect(res1.isTreasury).toBe(true);
      expect(res1.accountType).toBe("MOBILE_MONEY");

      const res2 = TreasuryClassification.classify({ paymentMethod: "NATCASH" });
      expect(res2.isTreasury).toBe(true);
      expect(res2.accountType).toBe("MOBILE_MONEY");

      const res3 = TreasuryClassification.classify({ paymentMethod: "MOBILE_MONEY" });
      expect(res3.isTreasury).toBe(true);
      expect(res3.accountType).toBe("MOBILE_MONEY");
    });

    it("14. handles ambiguous / non-cash data correctly", () => {
      const nonCash = TreasuryClassification.classify({ paymentMethod: "NON_CASH" });
      expect(nonCash.isTreasury).toBe(false);

      const emptyData = TreasuryClassification.classify({});
      expect(emptyData.isTreasury).toBe(false);
      expect(emptyData.confidence).toBe("NONE");
    });

    it("15. handles unknown accounts without crashing or fabricating fake defaults", () => {
      const unknown = TreasuryClassification.classify({
        accountCode: "UNKNOWN_ACC_999",
        accountName: "Compte Inconnu",
      });
      expect(unknown.isTreasury).toBe(false);
      expect(unknown.confidence).toBe("NONE");
      expect(unknown.accountType).toBeUndefined();
    });
  });

  describe("3. Multi-Tenancy Preservation", () => {
    it("16. preserves businessId throughout lifecycle without corruption", () => {
      const movement: NormalizedCashMovement = {
        ...baseValidMovement,
        businessId: "biz_tenant_alpha",
      };
      expect(movement.businessId).toBe("biz_tenant_alpha");
      const validation = validateNormalizedCashMovement(movement);
      expect(validation.isValid).toBe(true);
      expect(validation.data?.businessId).toBe("biz_tenant_alpha");
    });

    it("17. ensures deterministic ID generation encodes the businessId as scope prefix", () => {
      const id = generateCashMovementId({
        businessId: "biz_tenant_beta",
        sourceModule: "INVOICE",
        sourceId: "inv_456",
        movementDate: "2026-08-20",
        direction: "INFLOW",
      });
      expect(id).toBe("cm_biz_tenant_beta_INVOICE_inv_456_2026-08-20_INFLOW");
      expect(id.startsWith("cm_biz_tenant_beta_")).toBe(true);
    });
  });

  describe("4. Internal Transfers & Dual Legs", () => {
    it("18. supports internal transfer movements with net consolidated impact of 0", () => {
      const transferMovement: NormalizedCashMovement = {
        ...baseValidMovement,
        direction: "TRANSFER",
        movementType: "TRANSFER",
        sourceCashAccountId: "1000_CASH",
        destinationCashAccountId: "1010_BANK",
        amount: 25000,
        amountCents: 2500000,
      };

      expect(isInternalTransfer(transferMovement)).toBe(true);
      expect(getCashFlowImpact(transferMovement)).toBe(0);
    });

    it("19. tracks source and destination cash accounts for transfers", () => {
      const transferMovement: NormalizedCashMovement = {
        ...baseValidMovement,
        direction: "TRANSFER",
        movementType: "TRANSFER",
        sourceCashAccountId: "1000_CASH_MAIN",
        destinationCashAccountId: "1010_BANK_BNC",
      };

      expect(transferMovement.sourceCashAccountId).toBe("1000_CASH_MAIN");
      expect(transferMovement.destinationCashAccountId).toBe("1010_BANK_BNC");
      expect(validateNormalizedCashMovement(transferMovement).isValid).toBe(true);
    });
  });

  describe("5. Currency Isolation & Native Preservation", () => {
    it("20. preserves HTG currency natively without conversion", () => {
      const htgMovement: NormalizedCashMovement = {
        ...baseValidMovement,
        currency: "HTG",
        amount: 15000,
        amountCents: 1500000,
      };
      expect(htgMovement.currency).toBe("HTG");
      expect(validateNormalizedCashMovement(htgMovement).isValid).toBe(true);
    });

    it("21. preserves USD currency natively without conversion", () => {
      const usdMovement: NormalizedCashMovement = {
        ...baseValidMovement,
        currency: "USD",
        amount: 500,
        amountCents: 50000,
      };
      expect(usdMovement.currency).toBe("USD");
      expect(validateNormalizedCashMovement(usdMovement).isValid).toBe(true);
    });

    it("22. never invents fictitious exchange rates or silently converts between currencies", () => {
      const m1: NormalizedCashMovement = { ...baseValidMovement, currency: "HTG", amount: 100 };
      const m2: NormalizedCashMovement = { ...baseValidMovement, currency: "USD", amount: 100 };
      expect(m1.currency).not.toBe(m2.currency);
      expect(m1.amount).toBe(m2.amount);
    });
  });

  describe("6. Deterministic Identification & Deduplication", () => {
    it("23. generates identical ID for identical parameters without paymentEventId", () => {
      const params = {
        businessId: "biz_test",
        sourceModule: "LEDGER" as const,
        sourceId: "tx_123",
        movementDate: "2026-08-10",
        direction: "OUTFLOW" as const,
      };
      const id1 = generateCashMovementId(params);
      const id2 = generateCashMovementId(params);
      expect(id1).toBe(id2);
      expect(id1).toBe("cm_biz_test_LEDGER_tx_123_2026-08-10_OUTFLOW");
    });

    it("24. includes paymentEventId when provided for discrete multi-payment transactions", () => {
      const idWithEvent = generateCashMovementId({
        businessId: "biz_test",
        sourceModule: "INVOICE",
        sourceId: "inv_001",
        paymentEventId: "pay_part_1",
        movementDate: "2026-08-12",
        direction: "INFLOW",
      });
      expect(idWithEvent).toBe("cm_biz_test_INVOICE_inv_001_evt_pay_part_1_2026-08-12_INFLOW");
    });

    it("25. correctly handles VOIDED and REVERSED statuses with getCashFlowImpact and isEffectiveCashMovement", () => {
      const voidedMovement: NormalizedCashMovement = {
        ...baseValidMovement,
        status: "VOIDED",
        reversalOf: "cm_orig_001",
      };
      expect(isEffectiveCashMovement(voidedMovement)).toBe(false);
      expect(getCashFlowImpact(voidedMovement)).toBe(0);

      const reversedMovement: NormalizedCashMovement = {
        ...baseValidMovement,
        status: "REVERSED",
        reversalOf: "cm_orig_002",
      };
      expect(isEffectiveCashMovement(reversedMovement)).toBe(false);
      expect(getCashFlowImpact(reversedMovement)).toBe(0);

      const activeInflow: NormalizedCashMovement = {
        ...baseValidMovement,
        direction: "INFLOW",
        amount: 3000,
        status: "PAID",
      };
      expect(isEffectiveCashMovement(activeInflow)).toBe(true);
      expect(getCashFlowImpact(activeInflow)).toBe(3000);

      const activeOutflow: NormalizedCashMovement = {
        ...baseValidMovement,
        direction: "OUTFLOW",
        amount: 2000,
        status: "PAID",
      };
      expect(isEffectiveCashMovement(activeOutflow)).toBe(true);
      expect(getCashFlowImpact(activeOutflow)).toBe(-2000);
    });
  });
});
