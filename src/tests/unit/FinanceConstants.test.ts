import { describe, it, expect } from "vitest";
import {
  TaxAuthority,
  resolveTaxAuthority,
  STATUTORY_TAX_RATES,
  SURVIVAL_FLOOR_HTG,
  CHART_OF_ACCOUNTS,
  BASE_CURRENCY,
  htgToCents,
  centsToHtg,
  AmountHtgSchema,
  AmountCentsSchema,
  PercentageRateSchema,
  Percentage100Schema,
  TaxRateConfigSchema,
  validateDoubleEntryEquilibrium,
  PayrollLineInputSchema,
  FINANCIAL_GLOSSARY_DICTIONARY,
} from "../../constants/finance";

describe("Finance Constants & Semantic Validators (SSOT)", () => {
  describe("Tax Authority & Alias Normalization", () => {
    it("correctly resolves canonical tax authorities from aliases", () => {
      expect(resolveTaxAuthority("ONA")).toBe(TaxAuthority.ONA);
      expect(resolveTaxAuthority("cnss")).toBe(TaxAuthority.ONA);
      expect(resolveTaxAuthority("assurance-vieillesse")).toBe(TaxAuthority.ONA);
      expect(resolveTaxAuthority("OFATMA")).toBe(TaxAuthority.OFATMA);
      expect(resolveTaxAuthority("cns")).toBe(TaxAuthority.OFATMA);
      expect(resolveTaxAuthority("accidents-travail")).toBe(TaxAuthority.OFATMA);
    });

    it("has authoritative statutory tax rates defined", () => {
      expect(STATUTORY_TAX_RATES.ONA.EMPLOYEE_RATE).toBe(0.06);
      expect(STATUTORY_TAX_RATES.ONA.EMPLOYER_RATE).toBe(0.06);
      expect(STATUTORY_TAX_RATES.ONA.TOTAL_RATE).toBe(0.12);

      expect(STATUTORY_TAX_RATES.OFATMA.EMPLOYEE_RATE).toBe(0.02);
      expect(STATUTORY_TAX_RATES.OFATMA.EMPLOYER_RATE_DEFAULT).toBe(0.03);
      expect(STATUTORY_TAX_RATES.OFATMA.TOTAL_RATE_DEFAULT).toBe(0.05);

      expect(SURVIVAL_FLOOR_HTG).toBe(15000);
      expect(BASE_CURRENCY).toBe("HTG");
    });
  });

  describe("Chart of Accounts", () => {
    it("provides standard chart of accounts codes", () => {
      expect(CHART_OF_ACCOUNTS.ASSETS.BANK).toBe("1010_BANK");
      expect(CHART_OF_ACCOUNTS.LIABILITIES.ONA_PAYABLE).toBe("2100_ONA_TAXES_PAYABLE");
      expect(CHART_OF_ACCOUNTS.LIABILITIES.OFATMA_PAYABLE).toBe("2110_OFATMA_TAXES_PAYABLE");
      expect(CHART_OF_ACCOUNTS.EXPENSES.PAYROLL).toBe("5000_PAYROLL_EXPENSE");
      expect(CHART_OF_ACCOUNTS.REVENUE.OPERATING).toBe("4000_OPERATING_REVENUE");
    });
  });

  describe("Monetary Conversion Utilities", () => {
    it("converts between HTG currency units and integer cents with precision", () => {
      expect(htgToCents(150.5)).toBe(15050);
      expect(centsToHtg(15050)).toBe(150.5);
      expect(htgToCents(0)).toBe(0);
      expect(centsToHtg(0)).toBe(0);
    });
  });

  describe("Zod Semantic Validators", () => {
    it("validates financial amounts (AmountHtgSchema)", () => {
      expect(AmountHtgSchema.safeParse(50000).success).toBe(true);
      expect(AmountHtgSchema.safeParse(0).success).toBe(true);
      expect(AmountHtgSchema.safeParse(-10).success).toBe(false);
      expect(AmountHtgSchema.safeParse(Infinity).success).toBe(false);
      expect(AmountHtgSchema.safeParse("50000").success).toBe(false);
    });

    it("validates cents amounts (AmountCentsSchema)", () => {
      expect(AmountCentsSchema.safeParse(10000).success).toBe(true);
      expect(AmountCentsSchema.safeParse(100.5).success).toBe(false);
      expect(AmountCentsSchema.safeParse(-5).success).toBe(false);
    });

    it("validates percentage rates (PercentageRateSchema)", () => {
      expect(PercentageRateSchema.safeParse(0.06).success).toBe(true);
      expect(PercentageRateSchema.safeParse(0.02).success).toBe(true);
      expect(PercentageRateSchema.safeParse(1.0).success).toBe(true);
      expect(PercentageRateSchema.safeParse(1.05).success).toBe(false); // Greater than 1.0
      expect(PercentageRateSchema.safeParse(-0.01).success).toBe(false);
    });

    it("validates 0-100 percentage values (Percentage100Schema)", () => {
      expect(Percentage100Schema.safeParse(6).success).toBe(true);
      expect(Percentage100Schema.safeParse(100).success).toBe(true);
      expect(Percentage100Schema.safeParse(105).success).toBe(false);
      expect(Percentage100Schema.safeParse(-1).success).toBe(false);
    });

    it("validates full tax rate configuration schemas", () => {
      const validConfig = {
        onaEmployeeRate: 0.06,
        onaEmployerRate: 0.06,
        ofatmaEmployeeRate: 0.02,
        ofatmaEmployerRate: 0.03,
        survivalFloorHTG: 15000,
      };
      const parsed = TaxRateConfigSchema.safeParse(validConfig);
      expect(parsed.success).toBe(true);

      const invalidConfig = {
        onaEmployeeRate: 1.5, // Invalid rate > 1
        onaEmployerRate: 0.06,
        ofatmaEmployeeRate: -0.02, // Negative
        ofatmaEmployerRate: 0.03,
        survivalFloorHTG: -500, // Negative floor
      };
      const invalidParsed = TaxRateConfigSchema.safeParse(invalidConfig);
      expect(invalidParsed.success).toBe(false);
    });

    it("validates payroll line input structure", () => {
      const line = {
        baseSalaryHTG: 45000,
        overtimeHours150: 10,
        overtimeHours200: 5,
        hourlyRateHTG: 250,
        bonusesHTG: 2000,
        commissionsHTG: 1500,
        advancesHTG: 0,
      };
      const res = PayrollLineInputSchema.safeParse(line);
      expect(res.success).toBe(true);
    });
  });

  describe("Double-Entry Equilibrium Verification", () => {
    it("returns balanced state when total debits equal total credits", () => {
      const legs = [
        { debit_cents: 100000, credit_cents: 0 },
        { debit_cents: 0, credit_cents: 100000 },
      ];
      const result = validateDoubleEntryEquilibrium(legs);
      expect(result.isBalanced).toBe(true);
      expect(result.difference).toBe(0);
      expect(result.totalDebits).toBe(100000);
      expect(result.totalCredits).toBe(100000);
    });

    it("detects unbalanced double-entry transactions", () => {
      const legs = [
        { debit_cents: 100000, credit_cents: 0 },
        { debit_cents: 0, credit_cents: 80000 },
      ];
      const result = validateDoubleEntryEquilibrium(legs);
      expect(result.isBalanced).toBe(false);
      expect(result.difference).toBe(20000);
    });
  });

  describe("Financial Glossary Dictionary", () => {
    it("contains authoritative multilingual entries for ONA, OFATMA, and survival floor", () => {
      expect(FINANCIAL_GLOSSARY_DICTIONARY.ONA).toBeDefined();
      expect(FINANCIAL_GLOSSARY_DICTIONARY.ONA.acronym).toContain("CNSS");
      expect(FINANCIAL_GLOSSARY_DICTIONARY.OFATMA).toBeDefined();
      expect(FINANCIAL_GLOSSARY_DICTIONARY.OFATMA.acronym).toContain("CNS");
      expect(FINANCIAL_GLOSSARY_DICTIONARY.SURVIVAL_FLOOR).toBeDefined();
      expect(FINANCIAL_GLOSSARY_DICTIONARY.DOUBLE_ENTRY).toBeDefined();
    });
  });
});
