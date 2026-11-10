import { CurrencyCode } from "../../../types/cashManagement";
import { FinopsException } from "../../../modules/runtime/FinopsException";

export interface AccountMappingResolution {
  accountCode: string;
  accountName: string;
  currency: CurrencyCode;
  category: "TILL" | "SAFE" | "TRANSIT" | "CLEARING" | "FX_GAIN" | "FX_LOSS";
}

/**
 * FINOPS ERP — Chart of Accounts Mapping for Cash Management & Treasury
 * 
 * Maps physical tills and safes to authoritative General Ledger accounts:
 * - 1010: Caisse HTG Guichet (Liquidités Opérationnelles HTG)
 * - 1020: Caisse USD Guichet (Liquidités Opérationnelles USD)
 * - 1015: Coffre-Fort HTG (Réserve Succursale HTG)
 * - 1025: Coffre-Fort USD (Réserve Devises USD)
 * - 1910: Transit Virement Interne de Fonds (STT, TTS, STS)
 * - 2910: Compte d'Attente Écarts de Caisse (Shortage / Overage)
 * - 4120: Gains de Change FX
 * - 6120: Pertes de Change FX
 */
export class CashAccountMapping {
  public static readonly ACCOUNTS = {
    TILL_HTG: { code: "1010", name: "Caisse HTG Guichet", currency: "HTG" as CurrencyCode },
    TILL_USD: { code: "1020", name: "Caisse USD Guichet", currency: "USD" as CurrencyCode },
    SAFE_HTG: { code: "1015", name: "Coffre-Fort Principal HTG", currency: "HTG" as CurrencyCode },
    SAFE_USD: { code: "1025", name: "Coffre-Fort Principal USD", currency: "USD" as CurrencyCode },
    BANK_HTG: { code: "1110", name: "Banque HTG Principale", currency: "HTG" as CurrencyCode },
    BANK_USD: { code: "1120", name: "Banque USD Commerciale", currency: "USD" as CurrencyCode },
    TRANSIT_INTERNAL: { code: "1910", name: "Transit Virement Interne de Fonds" },
    FX_CLEARING: { code: "1920", name: "Compte de Liaison Change FX" },
    CASH_VARIANCE_CLEARING: { code: "2910", name: "Compte d'Attente Écarts de Caisse" },
    FX_GAIN: { code: "4120", name: "Gains de Change FX" },
    FX_LOSS: { code: "6120", name: "Pertes de Change FX" },
    CUSTOMER_DEPOSITS: { code: "1200", name: "Comptes de Dépôt / Créances Clients" },
    SALES_REVENUE_HTG: { code: "4010", name: "Ventes de Marchandises HTG" },
    SALES_REVENUE_USD: { code: "4020", name: "Ventes de Marchandises USD" },
    SERVICES_REVENUE: { code: "4100", name: "Produits des Prestations de Services" },
    TRANSFER_PAYOUT_CLEARING: { code: "2400", name: "Compte d'Attente Transferts à Payer" }
  };

  /**
   * Resolves the authoritative default accounting account for a physical till.
   */
  public static resolveTillAccount(currency: CurrencyCode): AccountMappingResolution {
    if (currency === "HTG") {
      return {
        accountCode: this.ACCOUNTS.TILL_HTG.code,
        accountName: this.ACCOUNTS.TILL_HTG.name,
        currency: "HTG",
        category: "TILL"
      };
    }
    return {
      accountCode: this.ACCOUNTS.TILL_USD.code,
      accountName: this.ACCOUNTS.TILL_USD.name,
      currency: "USD",
      category: "TILL"
    };
  }

  /**
   * Resolves the authoritative default accounting account for a branch safe.
   */
  public static resolveSafeAccount(currency: CurrencyCode): AccountMappingResolution {
    if (currency === "HTG") {
      return {
        accountCode: this.ACCOUNTS.SAFE_HTG.code,
        accountName: this.ACCOUNTS.SAFE_HTG.name,
        currency: "HTG",
        category: "SAFE"
      };
    }
    return {
      accountCode: this.ACCOUNTS.SAFE_USD.code,
      accountName: this.ACCOUNTS.SAFE_USD.name,
      currency: "USD",
      category: "SAFE"
    };
  }

  /**
   * Validates accounting mapping integrity before saving a till or safe.
   * Prevents:
   * 1. Currency mismatch (e.g. USD physical drawer mapped to HTG account).
   * 2. Safes mapped to customer receivables (12xx) or revenue (4xxx).
   */
  public static validateCashLocationMapping(
    type: "TILL" | "SAFE",
    currency: CurrencyCode,
    accountCode: string
  ): void {
    if (!accountCode || accountCode.trim() === "") {
      throw new FinopsException(
        "MISSING_ACCOUNT_MAPPING",
        `Un compte comptable valide est obligatoire pour toute ${type === "TILL" ? "caisse" : "coffre"}.`
      );
    }

    const cleanCode = accountCode.trim();

    // 1. Safe cannot be mapped to receivables (12xx) or revenue (4xxx)
    if (type === "SAFE") {
      if (cleanCode.startsWith("12") || cleanCode.startsWith("4") || cleanCode.startsWith("5")) {
        throw new FinopsException(
          "INVALID_SAFE_ACCOUNT",
          `Violation comptable : Un coffre-fort ne peut pas être affecté à un compte de créance client (12xx) ou de produit (4xxx). Code fourni : [${cleanCode}].`
        );
      }
    }

    // 2. Currency awareness check
    if (currency === "USD") {
      if (cleanCode === "1010" || cleanCode === "1015" || cleanCode === "1110" || cleanCode === "4010") {
        throw new FinopsException(
          "CURRENCY_ACCOUNT_MISMATCH",
          `Incohérence de devise : Une caisse physique USD ne peut pas être imputée sur un compte HTG [${cleanCode}]. Utilisez [1020] ou un sous-compte USD.`
        );
      }
    } else if (currency === "HTG") {
      if (cleanCode === "1020" || cleanCode === "1025" || cleanCode === "1120" || cleanCode === "4020") {
        throw new FinopsException(
          "CURRENCY_ACCOUNT_MISMATCH",
          `Incohérence de devise : Une caisse physique HTG ne peut pas être imputée sur un compte USD [${cleanCode}]. Utilisez [1010] ou un sous-compte HTG.`
        );
      }
    }
  }
}
