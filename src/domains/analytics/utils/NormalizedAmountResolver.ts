import { DailyExchangeRateGrid } from "../../../repositories/CurrencyRateRepository";

export type NormalizationContext = Record<string, DailyExchangeRateGrid>;

export class NormalizedAmountResolver {
  private static readonly DEFAULT_USD_HTG_RATE = 134.25;

  /**
   * Resolves an amount to the base currency (HTG) using historical rate grids.
   * Uses BRH typology as the canonical accounting reference.
   */
  public static resolveToHTG(
    amount: number,
    currency: string | undefined,
    date: string | undefined,
    context: NormalizationContext,
    typology: keyof DailyExchangeRateGrid["rates"] = "BRH"
  ): number {
    if (!amount || isNaN(amount)) return 0;
    const sign = amount < 0 ? -1 : 1;
    const absAmount = Math.abs(amount);
    
    // 1. If currency is HTG or undefined, assume it is already in base currency
    const upperCurrency = (currency || "HTG").toUpperCase();
    if (upperCurrency === "HTG") {
      return Number((sign * absAmount).toFixed(2));
    }

    // 2. Resolve historical rate for the date
    let rate = this.DEFAULT_USD_HTG_RATE;
    if (date) {
      const cleanDate = date.split("T")[0];
      const grid = context[cleanDate];
      
      if (grid && grid.rates) {
        // Handle hybrid rates (could be array or object depending on source)
        const rates = grid.rates as any;
        if (rates[typology]) {
          rate = rates[typology];
        } else if (Array.isArray(rates)) {
          const item = rates.find(r => r.rate_item_type === typology);
          if (item) rate = item.rate || item.buy_rate || rate;
        }
      }
    }

    // 3. Apply conversion
    // Currently we support USD, CAD, EUR, DOP normalization to HTG
    // If currency is not USD, we should ideally check the specific rate in the grid
    // For simplicity and matching existing patterns, we handle USD explicitly
    if (upperCurrency === "USD") {
      return Number((sign * absAmount * rate).toFixed(2));
    }

    // Fallback for other currencies if rates exist in grid
    // CANADA (CAD), EURO (EUR), PESO (DOP)
    if (date) {
      const cleanDate = date.split("T")[0];
      const grid = context[cleanDate];
      if (grid && grid.rates) {
        const rates = grid.rates as any;
        const mapping: Record<string, keyof DailyExchangeRateGrid["rates"]> = {
          CAD: "CANADA",
          EUR: "EURO",
          DOP: "PESO"
        };
        const targetTypology = mapping[upperCurrency];
        if (targetTypology && rates[targetTypology]) {
          return Number((sign * absAmount * rates[targetTypology]).toFixed(2));
        }
      }
    }

    // Absolute fallback: if we don't know the currency and it's not HTG, 
    // we use the USD rate as a best-effort proxy (matching historical legacy behavior)
    return Number((sign * absAmount * rate).toFixed(2));
  }
}
