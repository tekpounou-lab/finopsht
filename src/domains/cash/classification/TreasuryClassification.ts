/**
 * FINOPS ERP — Cash Basis Accounting Foundation (SSOT)
 * Centralized Treasury Account & Movement Classification Engine
 *
 * Implements the validated Hybrid Classification Strategy (Option E):
 * 1. Chart of Accounts SSOT codes & Class 10 Asset prefixes
 * 2. Explicit Treasury payment methods (CASH, BANK, MONCASH, NATCASH, etc.)
 * 3. Textual token heuristics (SAFE, TILL, CAISSE, COFFRE)
 * 4. Deterministic rejection of non-treasury accounts (Receivables, Payables, Expenses, Revenue)
 */

import { CHART_OF_ACCOUNTS } from "../../../constants/finance";
import type { RecognizedPaymentMethod } from "../types/NormalizedCashMovement";

export type TreasuryAccountType = 'CASH' | 'BANK' | 'MOBILE_MONEY' | 'OTHER_TREASURY';

export type TreasuryConfidence =
  | 'EXPLICIT_SSOT_CODE'
  | 'CODE_PREFIX_10'
  | 'NAME_TOKEN'
  | 'PAYMENT_METHOD'
  | 'COMBINED'
  | 'NONE';

export interface TreasuryClassificationResult {
  isTreasury: boolean;
  accountType?: TreasuryAccountType;
  confidence: TreasuryConfidence;
  reason: string;
}

export interface TreasuryClassificationInput {
  accountCode?: string;
  accountName?: string;
  paymentMethod?: RecognizedPaymentMethod | string;
  businessId?: string;
}

/** Known non-treasury account code prefixes */
const NON_TREASURY_PREFIXES = [
  '12', // Accounts Receivable (Clients & créances)
  '13', // Employee Advances (Avances & prêts)
  '2',  // Liabilities (Passif / Fournisseurs / Dettes)
  '3',  // Equity (Capitaux propres)
  '4',  // Operating Revenue (Produits d'exploitation)
  '5',  // Expenses (Charges d'exploitation)
  '6',  // Financial / Operating charges
  '7',  // Non-operating Revenue
  '8',  // Exceptional charges
  '9',  // Special accounts
];

/**
 * Normalizes string inputs for deterministic matching.
 */
function normalizeStr(val?: string): string {
  return val ? val.trim().toUpperCase() : '';
}

/**
 * Determines whether an account code or name represents physical cash (caisse/till/safe).
 */
function isCashToken(token: string): boolean {
  return (
    token.includes('CASH') ||
    token.includes('CAISSE') ||
    token.includes('TILL') ||
    token.includes('SAFE') ||
    token.includes('COFFRE') ||
    token.includes('PETTY')
  );
}

/**
 * Determines whether an account code or name represents bank accounts.
 */
function isBankToken(token: string): boolean {
  return (
    token.includes('BANK') ||
    token.includes('BANQUE') ||
    token.includes('WIRE') ||
    token.includes('VIREMENT') ||
    token.includes('CHECK') ||
    token.includes('CHEQUE')
  );
}

/**
 * Determines whether an account code or name represents mobile money.
 */
function isMobileMoneyToken(token: string): boolean {
  return (
    token.includes('MONCASH') ||
    token.includes('NATCASH') ||
    token.includes('MOBILE_MONEY') ||
    token.includes('MOBILE MONEY')
  );
}

/**
 * Authoritative Treasury Classification service.
 * Used by all Cash Adapters to deterministically verify if an account
 * or transaction qualifies as real treasury.
 */
export class TreasuryClassification {
  /**
   * Classifies an account and/or payment method to determine treasury status.
   */
  public static classify(input: TreasuryClassificationInput): TreasuryClassificationResult {
    const code = normalizeStr(input.accountCode);
    const name = normalizeStr(input.accountName);
    const method = normalizeStr(input.paymentMethod);

    // 1. Explicit SSOT Chart of Accounts matches
    if (code === CHART_OF_ACCOUNTS.ASSETS.CASH) {
      return {
        isTreasury: true,
        accountType: 'CASH',
        confidence: 'EXPLICIT_SSOT_CODE',
        reason: `Matched SSOT Chart of Accounts Cash code (${code})`,
      };
    }

    if (code === CHART_OF_ACCOUNTS.ASSETS.BANK) {
      return {
        isTreasury: true,
        accountType: 'BANK',
        confidence: 'EXPLICIT_SSOT_CODE',
        reason: `Matched SSOT Chart of Accounts Bank code (${code})`,
      };
    }

    // 2. Strict rejection of known non-treasury prefixes
    // If account explicitly starts with 12 (Receivables), 13 (Advances), 2 (Liabilities), etc.
    const hasNonTreasuryPrefix = NON_TREASURY_PREFIXES.some((prefix) => code.startsWith(prefix));
    if (hasNonTreasuryPrefix) {
      return {
        isTreasury: false,
        confidence: 'CODE_PREFIX_10',
        reason: `Account code (${code}) belongs to non-treasury class (${code.substring(0, 2)})`,
      };
    }

    // 3. Class 10 Asset prefix convention (e.g. 1000, 1010, 1020, 1099)
    if (code.startsWith('10')) {
      let derivedType: TreasuryAccountType = 'OTHER_TREASURY';
      if (isMobileMoneyToken(code) || isMobileMoneyToken(name)) {
        derivedType = 'MOBILE_MONEY';
      } else if (isCashToken(code) || isCashToken(name)) {
        derivedType = 'CASH';
      } else if (isBankToken(code) || isBankToken(name)) {
        derivedType = 'BANK';
      } else {
        derivedType = 'CASH';
      }

      return {
        isTreasury: true,
        accountType: derivedType,
        confidence: 'CODE_PREFIX_10',
        reason: `Account code (${code}) starts with Class 10 Treasury asset prefix`,
      };
    }

    // 4. Explicit Payment Method check
    if (method) {
      if (method === 'CASH') {
        return {
          isTreasury: true,
          accountType: 'CASH',
          confidence: 'PAYMENT_METHOD',
          reason: `Verified via explicit payment method CASH`,
        };
      }

      if (['BANK', 'BANK_TRANSFER', 'CHECK', 'WIRE', 'CARD'].includes(method)) {
        return {
          isTreasury: true,
          accountType: 'BANK',
          confidence: 'PAYMENT_METHOD',
          reason: `Verified via explicit bank payment method ${method}`,
        };
      }

      if (['MOBILE_MONEY', 'MONCASH', 'NATCASH'].includes(method)) {
        return {
          isTreasury: true,
          accountType: 'MOBILE_MONEY',
          confidence: 'PAYMENT_METHOD',
          reason: `Verified via explicit mobile money method ${method}`,
        };
      }

      if (method === 'NON_CASH') {
        return {
          isTreasury: false,
          confidence: 'PAYMENT_METHOD',
          reason: `Explicitly marked as NON_CASH`,
        };
      }
    }

    // 5. Name / token fallback
    if (name) {
      if (isMobileMoneyToken(name)) {
        return {
          isTreasury: true,
          accountType: 'MOBILE_MONEY',
          confidence: 'NAME_TOKEN',
          reason: `Account name contains mobile money keyword`,
        };
      }
      if (isCashToken(name)) {
        return {
          isTreasury: true,
          accountType: 'CASH',
          confidence: 'NAME_TOKEN',
          reason: `Account name contains cash/safe keyword`,
        };
      }
      if (isBankToken(name)) {
        return {
          isTreasury: true,
          accountType: 'BANK',
          confidence: 'NAME_TOKEN',
          reason: `Account name contains bank keyword`,
        };
      }
    }

    // 6. Unknown / Non-treasury
    return {
      isTreasury: false,
      confidence: 'NONE',
      reason: `No treasury indicators matched for code "${code || 'N/A'}" and method "${method || 'N/A'}"`,
    };
  }

  /**
   * Convenience boolean helper.
   */
  public static isTreasuryAccount(input: TreasuryClassificationInput): boolean {
    return this.classify(input).isTreasury;
  }
}
