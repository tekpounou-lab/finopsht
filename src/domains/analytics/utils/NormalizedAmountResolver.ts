import { DailyExchangeRateGrid } from "../../../repositories/CurrencyRateRepository";

export type NormalizationContext = Record<string, DailyExchangeRateGrid>;

export type FxRateProvenance =
  | "BASE"
  | "EXPLICIT_TX_RATE"
  | "DAILY_GRID_EXACT"
  | "DAILY_GRID_PRIOR"
  | "DEFAULT_FALLBACK";

export interface NormalizedAmountResolution {
  amountHTG: number;
  appliedRate: number;
  rateSource: FxRateProvenance;
  rateDateUsed?: string;
  usedFallback: boolean;
}

export class NormalizedAmountResolver {
  public static readonly DEFAULT_USD_HTG_RATE = 134.25;

  private static readonly CURRENCY_TYPOLOGY_MAP: Record<string, keyof DailyExchangeRateGrid["rates"]> = {
    CAD: "CANADA",
    EUR: "EURO",
    DOP: "PESO",
  };

  private static extractRateFromGrid(
    grid: DailyExchangeRateGrid | undefined,
    targetTypology: string
  ): number | undefined {
    if (!grid || !grid.rates || typeof grid.rates !== "object") return undefined;
    const rates = grid.rates as any;
    if (Array.isArray(rates)) {
      const item = rates.find(
        (r) => r && (r.rate_item_type === targetTypology || r.currency === targetTypology)
      );
      const val = Number(item?.rate || item?.buy_rate || item?.sell_rate || 0);
      return Number.isFinite(val) && val > 0 ? val : undefined;
    }
    const direct = Number(rates[targetTypology] || 0);
    return Number.isFinite(direct) && direct > 0 ? direct : undefined;
  }

  /**
   * Resolves a monetary amount to HTG along with full FX rate provenance.
   * Priority order:
   * 1. HTG / base currency -> rate 1 (BASE)
   * 2. Transaction-level explicitRate (> 0) -> EXPLICIT_TX_RATE
   * 3. Exact date entry in NormalizationContext -> DAILY_GRID_EXACT
   * 4. Nearest prior date entry (<= cleanDate) in NormalizationContext -> DAILY_GRID_PRIOR
   * 5. Safe static fallback (DEFAULT_USD_HTG_RATE) -> DEFAULT_FALLBACK (usedFallback: true)
   */
  public static resolveWithProvenance(
    amount: number,
    currency: string | undefined,
    date: string | undefined,
    context?: NormalizationContext,
    typology: keyof DailyExchangeRateGrid["rates"] = "BRH",
    explicitRate?: number
  ): NormalizedAmountResolution {
    if (!amount || isNaN(amount) || !isFinite(amount)) {
      return {
        amountHTG: 0,
        appliedRate: 1,
        rateSource: "BASE",
        usedFallback: false,
      };
    }

    const sign = amount < 0 ? -1 : 1;
    const absAmount = Math.abs(amount);
    const upperCurrency = (currency || "HTG").trim().toUpperCase();

    if (upperCurrency === "HTG") {
      return {
        amountHTG: Number((sign * absAmount).toFixed(2)),
        appliedRate: 1,
        rateSource: "BASE",
        usedFallback: false,
      };
    }

    // 1. Explicit transaction-level rate has highest authority for historical accounting fidelity
    if (typeof explicitRate === "number" && Number.isFinite(explicitRate) && explicitRate > 0) {
      return {
        amountHTG: Number((sign * absAmount * explicitRate).toFixed(2)),
        appliedRate: explicitRate,
        rateSource: "EXPLICIT_TX_RATE",
        rateDateUsed: date ? String(date).split("T")[0].trim() : undefined,
        usedFallback: false,
      };
    }

    const targetTypology =
      upperCurrency === "USD"
        ? String(typology)
        : String(this.CURRENCY_TYPOLOGY_MAP[upperCurrency] || typology);

    const safeContext = context && typeof context === "object" ? context : {};
    const cleanDate = date ? String(date).split("T")[0].trim() : "";

    // 2. Exact date lookup in historical BRH grid
    if (cleanDate && safeContext[cleanDate]) {
      const exactRate = this.extractRateFromGrid(safeContext[cleanDate], targetTypology);
      if (exactRate !== undefined) {
        return {
          amountHTG: Number((sign * absAmount * exactRate).toFixed(2)),
          appliedRate: exactRate,
          rateSource: "DAILY_GRID_EXACT",
          rateDateUsed: cleanDate,
          usedFallback: false,
        };
      }
    }

    // 3. Nearest prior date lookup (<= cleanDate, or latest available if date omitted)
    const isoDateKeys = Object.keys(safeContext)
      .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
      .sort((a, b) => b.localeCompare(a));

    for (const key of isoDateKeys) {
      if (cleanDate && key > cleanDate) continue;
      const priorRate = this.extractRateFromGrid(safeContext[key], targetTypology);
      if (priorRate !== undefined) {
        return {
          amountHTG: Number((sign * absAmount * priorRate).toFixed(2)),
          appliedRate: priorRate,
          rateSource: "DAILY_GRID_PRIOR",
          rateDateUsed: key,
          usedFallback: false,
        };
      }
    }

    // 4. Default safety fallback (explicitly tagged as fallback)
    const fallbackRate = this.DEFAULT_USD_HTG_RATE;
    return {
      amountHTG: Number((sign * absAmount * fallbackRate).toFixed(2)),
      appliedRate: fallbackRate,
      rateSource: "DEFAULT_FALLBACK",
      usedFallback: true,
    };
  }

  /**
   * Resolves an amount to the base currency (HTG) using historical rate grids or explicit transaction rate.
   * Uses BRH typology as the canonical accounting reference.
   */
  public static resolveToHTG(
    amount: number,
    currency: string | undefined,
    date: string | undefined,
    context?: NormalizationContext,
    typology: keyof DailyExchangeRateGrid["rates"] = "BRH",
    explicitRate?: number
  ): number {
    return this.resolveWithProvenance(
      amount,
      currency,
      date,
      context,
      typology,
      explicitRate
    ).amountHTG;
  }

  /**
   * Converts an HTG base amount to the requested display currency using a validated FX rate.
   */
  public static convertFromHTG(
    amountHTG: number,
    targetCurrency: string | undefined,
    rate: number = this.DEFAULT_USD_HTG_RATE
  ): number {
    if (!amountHTG || isNaN(amountHTG) || !isFinite(amountHTG)) return 0;
    const upper = (targetCurrency || "HTG").trim().toUpperCase();
    if (upper === "HTG") return Number(amountHTG.toFixed(2));
    const effectiveRate = Number.isFinite(rate) && rate > 0 ? rate : this.DEFAULT_USD_HTG_RATE;
    return Number((amountHTG / effectiveRate).toFixed(2));
  }
}
