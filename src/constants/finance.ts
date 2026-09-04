/**
 * FINOPS ERP — Central Financial, Fiscal & Accounting Constants (SSOT)
 * 
 * Single Source of Truth for all statutory tax definitions (ONA/OFATMA),
 * Chart of Accounts (COA), currency parameters, double-entry rules,
 * and Zod semantic validators for amounts, percentages, and ledger balance.
 */

import { z } from "zod";

// ============================================================================
// 1. STATUTORY TAX & SOCIAL SECURITY DEFINITIONS (ONA / OFATMA)
// ============================================================================

/**
 * Official Haitian Tax & Social Security Authorities:
 * - ONA (Office National d'Assurance-Vieillesse): Pension & retirement fund.
 *   Colloquially/internally mapped to generic ERP code "CNSS".
 * - OFATMA (Office d'Assurance Accidents du Travail, Maladie et Maternité):
 *   Workplace accident, sickness, and maternity insurance.
 *   Colloquially/internally mapped to generic ERP code "CNS".
 */
export enum TaxAuthority {
  ONA = "ONA",
  OFATMA = "OFATMA",
}

/**
 * Normalization map resolving legacy/alias terms (CNSS -> ONA, CNS -> OFATMA)
 */
export const TAX_AUTHORITY_ALIASES: Record<string, TaxAuthority> = {
  ONA: TaxAuthority.ONA,
  CNSS: TaxAuthority.ONA,
  "ASSURANCE-VIEILLESSE": TaxAuthority.ONA,
  OFATMA: TaxAuthority.OFATMA,
  CNS: TaxAuthority.OFATMA,
  "ACCIDENTS-TRAVAIL": TaxAuthority.OFATMA,
};

/**
 * Resolves any tax authority alias to its canonical statutory name ("ONA" or "OFATMA").
 */
export function resolveTaxAuthority(alias: string): TaxAuthority {
  const normalized = alias.trim().toUpperCase();
  return TAX_AUTHORITY_ALIASES[normalized] || TaxAuthority.ONA;
}

/**
 * Statutory contribution rates under Haitian labor and tax law.
 */
export const STATUTORY_TAX_RATES = {
  /**
   * ONA — Office National d'Assurance-Vieillesse (Décret du 28 août 1967)
   * Mandatory retirement pension scheme: 6% employee, 6% employer.
   */
  ONA: {
    AUTHORITY: TaxAuthority.ONA,
    LABEL_FR: "ONA (Office National d'Assurance-Vieillesse)",
    LABEL_HT: "ONA (Ofis Nasyonal Asirans Vyeyès)",
    LABEL_EN: "ONA (National Old-Age Insurance Office)",
    LEGACY_ALIAS: "CNSS",
    ACCOUNT_CODE: "2100_ONA_TAXES_PAYABLE",
    EMPLOYEE_RATE: 0.06, // 6%
    EMPLOYER_RATE: 0.06, // 6%
    TOTAL_RATE: 0.12,    // 12%
    LEGAL_BASIS: "Décret du 28 août 1967 régissant l'Office National d'Assurance-Vieillesse",
  },

  /**
   * OFATMA — Office d'Assurance Accidents du Travail, Maladie et Maternité
   * Mandatory health, workplace injury, and maternity scheme:
   * 2% employee withholding; 3% standard employer contribution (or 2% commercial / 6% high-risk).
   */
  OFATMA: {
    AUTHORITY: TaxAuthority.OFATMA,
    LABEL_FR: "OFATMA (Office d'Assurance Accidents du Travail, Maladie et Maternité)",
    LABEL_HT: "OFATMA (Ofis Asirans Aksidan Travay, Maladi ak Matènite)",
    LABEL_EN: "OFATMA (Workplace Accident, Sickness & Maternity Insurance)",
    LEGACY_ALIAS: "CNS",
    ACCOUNT_CODE: "2110_OFATMA_TAXES_PAYABLE",
    EMPLOYEE_RATE: 0.02,          // 2%
    EMPLOYER_RATE_DEFAULT: 0.03,  // 3% (Standard commercial/industrial baseline)
    EMPLOYER_RATE_COMMERCE: 0.02, // 2% (Low risk commerce)
    EMPLOYER_RATE_INDUSTRY: 0.03, // 3% (Standard industry)
    EMPLOYER_RATE_HIGH_RISK: 0.06,// 6% (High risk)
    TOTAL_RATE_DEFAULT: 0.05,     // 5% (2% employee + 3% employer)
    LEGAL_BASIS: "Loi organique régissant l'OFATMA et le Code du Travail Haïtien",
  },
} as const;

/**
 * Mandatory Survival Floor (Seuil de Survie) in Haitian Gourdes (HTG).
 * Guarantees that net payout cannot be reduced below 15,000 HTG by deductions/advances
 * if gross salary is at or above this threshold.
 */
export const SURVIVAL_FLOOR_HTG = 15000;

// ============================================================================
// 2. CHART OF ACCOUNTS (COA) STANDARD
// ============================================================================

export enum AccountClassification {
  ASSET = "ASSET",
  LIABILITY = "LIABILITY",
  EQUITY = "EQUITY",
  REVENUE = "REVENUE",
  EXPENSE = "EXPENSE",
}

export enum NormalBalance {
  DEBIT = "DEBIT",
  CREDIT = "CREDIT",
}

export const CHART_OF_ACCOUNTS = {
  ASSETS: {
    CASH: "1000_CASH",
    BANK: "1010_BANK",
    RECEIVABLES: "1200_ACCOUNTS_RECEIVABLE",
    ADVANCES: "1300_EMPLOYEE_ADVANCES",
  },
  LIABILITIES: {
    PAYABLES: "2000_ACCOUNTS_PAYABLE",
    PAYROLL_CLEARING: "2100_PAYROLL_CLEARING",
    ONA_PAYABLE: "2100_ONA_TAXES_PAYABLE",
    OFATMA_PAYABLE: "2110_OFATMA_TAXES_PAYABLE",
    TAXES_PAYABLE: "2200_TAXES_PAYABLE",
  },
  EQUITY: {
    SHARE_CAPITAL: "3000_SHARE_CAPITAL",
    RETAINED_EARNINGS: "3000_RETAINED_EARNINGS",
  },
  REVENUE: {
    OPERATING: "4000_OPERATING_REVENUE",
    SALES: "4100_SALES",
  },
  EXPENSES: {
    PAYROLL: "5000_PAYROLL_EXPENSE",
    COMMISSIONS: "5050_COMMISSIONS_EXPENSE",
    PAYROLL_TOTAL_MASS: "5100_PAYROLL_EXPENSE",
    RENT: "5100_RENT_EXPENSE",
    UTILITIES: "5200_UTILITIES",
    ADMINISTRATIVE: "5200_ADMINISTRATIVE_EXPENSE",
    GENERAL: "5900_GENERAL_EXPENSES",
  },
} as const;

// ============================================================================
// 3. CURRENCY & MONETARY PRECISION CONSTANTS
// ============================================================================

export enum CurrencyCode {
  HTG = "HTG",
  USD = "USD",
  EUR = "EUR",
  CAD = "CAD",
}

export const BASE_CURRENCY = CurrencyCode.HTG;
export const DEFAULT_USD_TO_HTG_EXCHANGE_RATE = 135.0;
export const CENTS_PER_UNIT = 100;

export function htgToCents(amountHtg: number): number {
  return Math.round(amountHtg * CENTS_PER_UNIT);
}

export function centsToHtg(amountCents: number): number {
  return amountCents / CENTS_PER_UNIT;
}

// ============================================================================
// 4. TRANSACTION TYPES, PAY REGIMES & OVERTIME MULTIPLIERS
// ============================================================================

export enum LedgerTransactionType {
  INCOME = "INCOME",
  EXPENSE = "EXPENSE",
  PAYROLL = "PAYROLL",
  ADVANCE = "ADVANCE",
  TRANSFER = "TRANSFER",
  REFUND = "REFUND",
  CORRECTION = "CORRECTION",
  ADJUSTMENT = "ADJUSTMENT",
  REVERSAL = "REVERSAL",
  BONUS = "BONUS",
  PENALTY = "PENALTY",
  COMPENSATION = "COMPENSATION",
}

export enum PayProfileRegime {
  FIXED = "FIXED",
  COMMISSION = "COMMISSION",
  HYBRID = "HYBRID",
}

export const OVERTIME_MULTIPLIERS = {
  STANDARD_150: 1.5, // 150% (regular overtime)
  PREMIUM_200: 2.0,  // 200% (Sundays, holidays, night shifts)
} as const;

// ============================================================================
// 5. ZOD SEMANTIC VALIDATORS
// ============================================================================

/**
 * Validates financial amounts in currency units (e.g. HTG or USD).
 * Ensures finite, non-negative numbers within safe bounds (up to 10 billion).
 */
export const AmountHtgSchema = z
  .number({
    error: "Financial amount must be a valid number",
  })
  .finite("Financial amount must be a finite number")
  .min(0, "Financial amount cannot be negative")
  .max(10_000_000_000, "Financial amount exceeds maximum safe threshold (10 Billion HTG)");

/**
 * Validates financial amounts stored in integer cents (e.g. 100 HTG = 10,000 cents).
 */
export const AmountCentsSchema = z
  .number({
    error: "Amount in cents must be an integer",
  })
  .int("Amount in cents must be an integer")
  .min(0, "Amount in cents cannot be negative")
  .max(1_000_000_000_000, "Amount in cents exceeds maximum safe threshold");

/**
 * Validates decimal rates / ratios (0.0 to 1.0, e.g. 0.06 for 6%).
 */
export const PercentageRateSchema = z
  .number({
    error: "Percentage rate must be a valid numeric value",
  })
  .finite("Percentage rate must be finite")
  .min(0, "Percentage rate cannot be negative")
  .max(1, "Percentage rate as ratio cannot exceed 1.0 (e.g. use 0.06 for 6%)");

/**
 * Validates percentage values represented on a 0–100 scale (e.g. 6 for 6%).
 */
export const Percentage100Schema = z
  .number({
    error: "Percentage must be a valid numeric value",
  })
  .finite("Percentage must be finite")
  .min(0, "Percentage cannot be negative")
  .max(100, "Percentage cannot exceed 100%");

/**
 * Schema validating statutory tax rates configuration.
 */
export const TaxRateConfigSchema = z.object({
  onaEmployeeRate: PercentageRateSchema.default(STATUTORY_TAX_RATES.ONA.EMPLOYEE_RATE),
  onaEmployerRate: PercentageRateSchema.default(STATUTORY_TAX_RATES.ONA.EMPLOYER_RATE),
  ofatmaEmployeeRate: PercentageRateSchema.default(STATUTORY_TAX_RATES.OFATMA.EMPLOYEE_RATE),
  ofatmaEmployerRate: PercentageRateSchema.default(STATUTORY_TAX_RATES.OFATMA.EMPLOYER_RATE_DEFAULT),
  survivalFloorHTG: AmountHtgSchema.default(SURVIVAL_FLOOR_HTG),
  effectiveFrom: z.string().min(10, "Effective date is required (YYYY-MM-DD)").optional(),
  effectiveTo: z.string().optional(),
});

export type TaxRateConfig = z.infer<typeof TaxRateConfigSchema>;

/**
 * Validates a double-entry ledger journal leg.
 */
export const JournalLegSchema = z.object({
  account: z.string().min(3, "Account code must be at least 3 characters"),
  debit_cents: AmountCentsSchema.default(0),
  credit_cents: AmountCentsSchema.default(0),
});

/**
 * Validates that total debits equal total credits (Double-Entry Equilibrium Rule).
 */
export function validateDoubleEntryEquilibrium(legs: Array<{ debit_cents?: number; credit_cents?: number }>): {
  isBalanced: boolean;
  totalDebits: number;
  totalCredits: number;
  difference: number;
} {
  const totalDebits = legs.reduce((sum, leg) => sum + (leg.debit_cents || 0), 0);
  const totalCredits = legs.reduce((sum, leg) => sum + (leg.credit_cents || 0), 0);
  const difference = totalDebits - totalCredits;

  return {
    isBalanced: difference === 0,
    totalDebits,
    totalCredits,
    difference,
  };
}

/**
 * Validates input for payroll line calculation.
 */
export const PayrollLineInputSchema = z.object({
  baseSalaryHTG: AmountHtgSchema,
  overtimeHours150: z.number().min(0, "Overtime hours cannot be negative").max(300, "Unrealistic overtime hours"),
  overtimeHours200: z.number().min(0, "Overtime hours cannot be negative").max(300, "Unrealistic overtime hours"),
  hourlyRateHTG: AmountHtgSchema,
  bonusesHTG: AmountHtgSchema.default(0),
  commissionsHTG: AmountHtgSchema.default(0),
  advancesHTG: AmountHtgSchema.default(0),
});

export type PayrollLineInput = z.infer<typeof PayrollLineInputSchema>;

// ============================================================================
// 6. CENTRAL FINANCIAL GLOSSARY DICTIONARY
// ============================================================================

export interface GlossaryEntry {
  term: string;
  acronym: string;
  category: "TAX" | "ACCOUNTING" | "PAYROLL" | "GOVERNANCE";
  definition_fr: string;
  definition_ht: string;
  definition_en: string;
  legal_reference?: string;
  coa_mapping?: string;
}

export const FINANCIAL_GLOSSARY_DICTIONARY: Record<string, GlossaryEntry> = {
  ONA: {
    term: "Office National d'Assurance-Vieillesse",
    acronym: "ONA (alias CNSS)",
    category: "TAX",
    definition_fr: "Organisme public haïtien gérant le régime obligatoire d'assurance vieillesse et de pension de retraite (6% employé, 6% employeur).",
    definition_ht: "Enstitisyon leta ayisyen ki jere pansyon retrèt ak asirans vyeyès obligatwa (6% anplwaye, 6% anplwayè).",
    definition_en: "Haitian national social security entity managing mandatory old-age retirement pension (6% employee, 6% employer).",
    legal_reference: STATUTORY_TAX_RATES.ONA.LEGAL_BASIS,
    coa_mapping: STATUTORY_TAX_RATES.ONA.ACCOUNT_CODE,
  },
  OFATMA: {
    term: "Office d'Assurance Accidents du Travail, Maladie et Maternité",
    acronym: "OFATMA (alias CNS)",
    category: "TAX",
    definition_fr: "Organisme public assurant la couverture des accidents du travail, maladies professionnelles et maternité (2% employé, 3% employeur).",
    definition_ht: "Enstitisyon leta ki asire anplwaye kont aksidan travay, maladi ak matènite (2% anplwaye, 3% anplwayè).",
    definition_en: "Public authority providing insurance for occupational accidents, illnesses, and maternity (2% employee, 3% employer).",
    legal_reference: STATUTORY_TAX_RATES.OFATMA.LEGAL_BASIS,
    coa_mapping: STATUTORY_TAX_RATES.OFATMA.ACCOUNT_CODE,
  },
  SURVIVAL_FLOOR: {
    term: "Seuil de Survie / Plafond de Protection Salariale",
    acronym: "SURVIVAL_FLOOR",
    category: "PAYROLL",
    definition_fr: "Garantie légale empêchant le salaire net décaissé de chuter en dessous de 15 000 HTG suite aux déductions ou remboursements d'avances.",
    definition_ht: "Garanti legal ki anpeche salè nèt anplwaye a desann anba 15,000 HTG akoz dediksyon oswa ranbousman avans.",
    definition_en: "Statutory survival floor ensuring employee net take-home pay is not reduced below 15,000 HTG by deductions or advance recoupments.",
    legal_reference: "FINOPS ERP Compliance Standard v3.0 & Code du Travail",
  },
  DOUBLE_ENTRY: {
    term: "Partie Double (Comptabilité Générale)",
    acronym: "DOUBLE_ENTRY",
    category: "ACCOUNTING",
    definition_fr: "Principe fondamental où chaque écriture comptable requiert un équilibre strict entre le total des débits et le total des crédits.",
    definition_ht: "Prensip kontab kote chak tranzaksyon dwe genyen ekilib total ant debi ak kredi.",
    definition_en: "Fundamental accounting principle requiring every journal transaction to have equal total debits and credits.",
    legal_reference: "Norme Comptable Générale & SYSCOHADA Standard",
  },
};
