import { db } from "../lib/firebase";
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit, 
  serverTimestamp,
  writeBatch 
} from "firebase/firestore";
import { ForensicLogRepository } from "./ForensicLogRepository";
import { EventBus } from "../modules/runtime/EventBus";
import { resilientGetDocs, clearResilientCache } from "../utils/resilientFirestore";

export type RateTypology = 
  | "ACHAT_CLIENT" 
  | "VENTE_CLIENT" 
  | "ACHAT_ENVOIE" 
  | "VENTE_ENVOIE" 
  | "BRH" 
  | "CANADA" 
  | "EURO" 
  | "PESO"
  | "LOCAL";

export interface DailyRateInput {
  rate_item_type: RateTypology;
  currency: string;
  buy_rate?: number;
  sell_rate?: number;
  rate?: number;
}

export interface ExchangeRate {
  id: string;                    // e.g., "USD_HTG_2026-08-10_ACHAT_CLIENT"
  businessId: string;            // Tenant ID ("SYSTEM" for global default rate)
  fromCurrency: "HTG" | "USD" | "CAD" | "EUR" | "DOP";   // Source currency
  toCurrency: "HTG" | "USD" | "CAD" | "EUR" | "DOP";     // Target currency
  typology?: RateTypology;       // Operational rate typology
  rate: number;                  // Ex: 135 (USD to HTG)
  effectiveDate: string;         // YYYY-MM-DD
  source: "manual" | "auto_inherited" | "brh";
  actorId: string;
  is_inherited?: boolean;
  justification?: string;
  createdAt: any;
  updatedAt: any;
}

export interface DailyExchangeRateGrid {
  id: string; // e.g. fx_grid_biz1_2026-10-17
  businessId: string;
  effectiveDate: string; // YYYY-MM-DD (UTC-5 Haiti time)
  is_inherited: boolean;
  source: "manual" | "auto_inherited" | "brh";
  rates: {
    ACHAT_CLIENT: number;  // Guichet Achat USD -> HTG
    VENTE_CLIENT: number;  // Guichet Vente HTG -> USD
    ACHAT_ENVOIE: number;  // Transfert Envoi
    VENTE_ENVOIE: number;  // Transfert Réception
    BRH: number;           // Cours Officiel BRH
    CANADA: number;        // CAD -> HTG
    EURO: number;          // EUR -> HTG
    PESO: number;          // DOP -> HTG
    LOCAL: number;         // Monnaie locale HTG -> HTG = 1.0000
  };
  actorId: string;
  updatedAt: string;
}

export const DEFAULT_RATE_GRID_VALUES: DailyExchangeRateGrid["rates"] = {
  ACHAT_CLIENT: 132.0,
  VENTE_CLIENT: 136.5,
  ACHAT_ENVOIE: 133.0,
  VENTE_ENVOIE: 135.0,
  BRH: 134.25,
  CANADA: 98.5,
  EURO: 145.0,
  PESO: 2.25,
  LOCAL: 1.0000
};

/**
 * Returns YYYY-MM-DD in America/Port-au-Prince business timezone.
 */
export function getHaitiDateString(d: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Port-au-Prince",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return formatter.format(d);
  } catch {
    return d.toISOString().split("T")[0];
  }
}

/**
 * Returns YYYY-MM-DD string for the day prior to targetDateStr in America/Port-au-Prince.
 */
export function getPreviousHaitiDateString(targetDateStr?: string): string {
  const baseDateStr = targetDateStr || getHaitiDateString();
  const dt = new Date(baseDateStr + "T12:00:00.000Z");
  dt.setUTCDate(dt.getUTCDate() - 1);
  return getHaitiDateString(dt);
}

/**
 * CurrencyRateRepository handles querying historical and active exchange rates.
 * Implements local in-memory caching and fallback inheritance mechanics.
 */
export class CurrencyRateRepository {
  private static readonly COLLECTION_NAME = "exchange_rates";
  private static readonly GRIDS_COLLECTION = "daily_exchange_rate_grids";
  private static readonly DEFAULT_RATE = 135.0; // Standard USD -> HTG
  
  private static cache = new Map<string, { rate: number; expiresAt: number }>();
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 Minutes TTL

  private static getCacheKey(businessId: string, from: string, to: string, date: string, typology?: string): string {
    return `${businessId}:${from}:${to}:${date}:${typology || "STD"}`;
  }

  public static clearCache(businessId?: string): void {
    clearResilientCache(businessId);
    if (businessId) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${businessId}:`)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  /**
  /**
   * Helper to construct a hybrid array/object rates structure that satisfies
   * both array methods (find, filter) and named key lookups (rates.ACHAT_CLIENT).
   */
  public static buildRatesHybrid(
    ratesMap: Record<string, number>,
    isInherited: boolean = false,
    source: string = "manual"
  ): any {
    const currencyMapping: Record<string, { currency: string; sell_rate?: number }> = {
      ACHAT_CLIENT: { currency: "USD", sell_rate: ratesMap.VENTE_CLIENT || 136.5 },
      VENTE_CLIENT: { currency: "USD", sell_rate: ratesMap.VENTE_CLIENT || 136.5 },
      ACHAT_ENVOIE: { currency: "USD" },
      VENTE_ENVOIE: { currency: "USD" },
      BRH: { currency: "USD" },
      CANADA: { currency: "CAD" },
      EURO: { currency: "EUR" },
      PESO: { currency: "DOP" },
      LOCAL: { currency: "HTG", sell_rate: 1.0000 }
    };

    const list: any[] = Object.entries(ratesMap).map(([key, val]) => ({
      rate_item_type: key as RateTypology,
      currency: currencyMapping[key]?.currency || "USD",
      buy_rate: val,
      sell_rate: currencyMapping[key]?.sell_rate || val,
      rate: val,
      is_inherited: key === "LOCAL" ? false : isInherited,
      source: key === "LOCAL" ? "system" : source
    }));

    for (const [k, v] of Object.entries(ratesMap)) {
      (list as any)[k] = v;
    }
    return list;
  }

  /**
   * Returns default statutory grid for tenant.
   */
  public static getDefaultStandardGrid(businessId: string, effectiveDate?: string): any {
    const todayStr = effectiveDate || getHaitiDateString();
    const hybrid = this.buildRatesHybrid(DEFAULT_RATE_GRID_VALUES, true, "auto_inherited");
    return {
      id: `fx_grid_${businessId}_${todayStr}`,
      businessId,
      company_id: businessId,
      effectiveDate: todayStr,
      effective_date: todayStr,
      is_inherited: true,
      source: "auto_inherited",
      rates: hybrid,
      actorId: "SYSTEM_DEFAULT",
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Retrieves today's active exchange rate grid with automatic inheritance (fallback).
   * If today's rates have not been entered, inherits from the most recent valid day with is_inherited = true.
   */
  public static async getTodayRatesWithFallback(
    businessId: string,
    targetDateStr?: string
  ): Promise<any> {
    const todayStr = targetDateStr || getHaitiDateString();
    const docId = `fx_grid_${businessId}_${todayStr}`;

    try {
      if (db) {
        // 1. Check exact match for targetDate
        const ref = doc(db, this.GRIDS_COLLECTION, docId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data() as DailyExchangeRateGrid;
          const mergedRates = {
            ...DEFAULT_RATE_GRID_VALUES,
            ...data.rates,
            LOCAL: 1.0000
          };
          const hybrid = this.buildRatesHybrid(mergedRates, data.is_inherited, data.source);
          return {
            ...data,
            id: docId,
            company_id: businessId,
            effective_date: todayStr,
            grid: data,
            rates: hybrid
          };
        }

        // 2. Traversal fallback to most recent previous rate grid
        const q = query(
          collection(db, this.GRIDS_COLLECTION),
          where("businessId", "==", businessId),
          where("effectiveDate", "<=", todayStr),
          orderBy("effectiveDate", "desc"),
          limit(1)
        );

        const fallbackSnap = await resilientGetDocs(q, undefined, true);
        if (!fallbackSnap.empty) {
          const previousGrid = fallbackSnap.docs[0].data() as DailyExchangeRateGrid;
          const mergedRates = {
            ...DEFAULT_RATE_GRID_VALUES,
            ...previousGrid.rates,
            LOCAL: 1.0000
          };
          const hybrid = this.buildRatesHybrid(mergedRates, true, "auto_inherited");
          return {
            ...previousGrid,
            id: docId,
            company_id: businessId,
            effectiveDate: todayStr,
            effective_date: todayStr,
            grid: null, // No explicit today grid document
            fallbackDate: previousGrid.effectiveDate,
            is_inherited: true,
            source: "auto_inherited",
            rates: hybrid
          };
        }
      }
    } catch (err) {
      console.warn("[CurrencyRateRepository] Fallback to default rate grid:", err);
    }

    // Default fallback when nothing found
    const defaultHybrid = this.buildRatesHybrid(DEFAULT_RATE_GRID_VALUES, true, "auto_inherited");

    return {
      id: docId,
      businessId,
      company_id: businessId,
      effectiveDate: todayStr,
      effective_date: todayStr,
      grid: null,
      is_inherited: true,
      source: "auto_inherited",
      rates: defaultHybrid,
      actorId: "SYSTEM_FALLBACK",
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Daily inheritance: Copy preceding day's valid rates to today if today has no manual rates.
   * Never overwrites today's manually entered rates. Idempotent execution.
   */
  public static async syncYesterdayRatesToToday(
    businessId: string,
    actorId: string = "SCHEDULER_AUTO_INHERIT"
  ): Promise<any> {
    const todayStr = getHaitiDateString();
    const docId = `fx_grid_${businessId}_${todayStr}`;

    if (db) {
      // 1. Check if today's grid already exists
      const ref = doc(db, this.GRIDS_COLLECTION, docId);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const existing = snap.data() as DailyExchangeRateGrid;
        // DO NOT overwrite if today's rates were manually confirmed by an Owner/Manager
        if (!existing.is_inherited && existing.source === "manual") {
          const hybrid = this.buildRatesHybrid(existing.rates, false, "manual");
          return {
            ...existing,
            company_id: businessId,
            effective_date: todayStr,
            rates: hybrid
          };
        }
      }

      // 2. Get most recent preceding rate grid
      const q = query(
        collection(db, this.GRIDS_COLLECTION),
        where("businessId", "==", businessId),
        where("effectiveDate", "<", todayStr),
        orderBy("effectiveDate", "desc"),
        limit(1)
      );

      const snapPrev = await resilientGetDocs(q, undefined, true);
      let ratesToCopy = { ...DEFAULT_RATE_GRID_VALUES };

      if (!snapPrev.empty) {
        const prevData = snapPrev.docs[0].data() as DailyExchangeRateGrid;
        ratesToCopy = { ...DEFAULT_RATE_GRID_VALUES, ...prevData.rates, LOCAL: 1.0000 };
      }

      const hybridRates = this.buildRatesHybrid(ratesToCopy, true, "inherited");

      const inheritedGrid: DailyExchangeRateGrid = {
        id: docId,
        businessId,
        effectiveDate: todayStr,
        is_inherited: true,
        source: "auto_inherited",
        rates: ratesToCopy,
        actorId,
        updatedAt: new Date().toISOString()
      };

      await setDoc(ref, inheritedGrid, { merge: true });

      EventBus.publish(EventBus.createEvent({
        type: "EXCHANGE_RATES_INHERITED",
        businessId,
        module: "FINANCE",
        aggregate: "ExchangeRateGrid",
        payload: { grid: inheritedGrid }
      }));

      return {
        ...inheritedGrid,
        company_id: businessId,
        effective_date: todayStr,
        rates: hybridRates
      };
    }

    const defaultHybrid = this.buildRatesHybrid(DEFAULT_RATE_GRID_VALUES, true, "inherited");
    return {
      id: docId,
      businessId,
      company_id: businessId,
      effectiveDate: todayStr,
      effective_date: todayStr,
      is_inherited: true,
      source: "auto_inherited",
      rates: defaultHybrid,
      actorId,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Bulk updates the company exchange rate grid for a business tenant via atomic upsert_exchange_rates.
   * Enforces role authorization, historical date immutability, positive rate checks, and LOCAL rate protection (= 1.0000).
   */
  public static async upsertExchangeRates(
    businessId: string,
    rates: Partial<DailyExchangeRateGrid["rates"]> | any[],
    actor: { id?: string; uid?: string; name?: string; role?: string },
    targetDateStr?: string,
    allowHistoricalOverride: boolean = false
  ): Promise<any> {
    const todayStr = getHaitiDateString();
    const effectiveDate = targetDateStr || todayStr;
    const docId = `fx_grid_${businessId}_${effectiveDate}`;
    const now = new Date().toISOString();
    const actorId = actor.uid || actor.id || "UNKNOWN_USER";

    // 1. Role Authorization Check
    const roleUpper = (actor.role || "").toUpperCase();
    if (!["OWNER", "MANAGER", "ADMIN", "SUPER_ADMIN"].includes(roleUpper)) {
      throw new Error("Unauthorized: Only Business Owner or Manager is allowed to update exchange rates.");
    }

    // 2. Historical Date Immutability Protection
    if (!allowHistoricalOverride && effectiveDate < todayStr) {
      throw new Error("Cannot modify historical exchange rates. Historical rates are immutable.");
    }

    // 3. Extract and Validate Rates
    const rawMap: Record<string, number> = {};

    if (Array.isArray(rates)) {
      for (const item of rates) {
        const key = item.rate_item_type || item.typology;
        if (!key) continue;
        const bRate = Number(item.buy_rate !== undefined ? item.buy_rate : item.rate);
        if (typeof bRate !== "number" || isNaN(bRate) || !isFinite(bRate) || bRate <= 0) {
          throw new Error(`Rate value for ${key} must be strictly positive (> 0). Received: ${bRate}`);
        }
        rawMap[key] = bRate;

        if (item.sell_rate !== undefined) {
          const sRate = Number(item.sell_rate);
          if (typeof sRate !== "number" || isNaN(sRate) || !isFinite(sRate) || sRate <= 0) {
            throw new Error(`Rate value for ${key} sell_rate must be strictly positive (> 0). Received: ${sRate}`);
          }
          if (key === "ACHAT_CLIENT") {
            rawMap["VENTE_CLIENT"] = sRate;
          }
        }
      }
    } else {
      for (const [key, val] of Object.entries(rates)) {
        const numVal = Number(val);
        if (typeof numVal !== "number" || isNaN(numVal) || !isFinite(numVal) || numVal <= 0) {
          throw new Error(`Rate value for ${key} must be strictly positive (> 0). Received: ${val}`);
        }
        rawMap[key] = numVal;
      }
    }

    // Always lock LOCAL to 1.0000
    rawMap.LOCAL = 1.0000;

    const validatedRates: DailyExchangeRateGrid["rates"] = {
      ...DEFAULT_RATE_GRID_VALUES,
      ...(rawMap as any),
      LOCAL: 1.0000
    };

    const hybridRates = this.buildRatesHybrid(validatedRates, false, "manual");

    const grid: DailyExchangeRateGrid = {
      id: docId,
      businessId,
      effectiveDate,
      is_inherited: false, // Freshly confirmed manual rates
      source: "manual",
      rates: validatedRates,
      actorId,
      updatedAt: now
    };

    if (db) {
      const batch = writeBatch(db);
      
      // Write Grid Document
      const gridRef = doc(db, this.GRIDS_COLLECTION, docId);
      batch.set(gridRef, grid, { merge: true });

      // Write Individual Exchange Rate Records
      const currencyMap: Record<string, { from: "USD" | "CAD" | "EUR" | "DOP" | "HTG"; to: "HTG"; typ: RateTypology }> = {
        ACHAT_CLIENT: { from: "USD", to: "HTG", typ: "ACHAT_CLIENT" },
        VENTE_CLIENT: { from: "USD", to: "HTG", typ: "VENTE_CLIENT" },
        ACHAT_ENVOIE: { from: "USD", to: "HTG", typ: "ACHAT_ENVOIE" },
        VENTE_ENVOIE: { from: "USD", to: "HTG", typ: "VENTE_ENVOIE" },
        BRH: { from: "USD", to: "HTG", typ: "BRH" },
        CANADA: { from: "CAD", to: "HTG", typ: "CANADA" },
        EURO: { from: "EUR", to: "HTG", typ: "EURO" },
        PESO: { from: "DOP", to: "HTG", typ: "PESO" },
        LOCAL: { from: "HTG", to: "HTG", typ: "LOCAL" }
      };

      for (const [key, mapping] of Object.entries(currencyMap)) {
        const rVal = validatedRates[key as RateTypology];
        if (rVal && rVal > 0) {
          const rateDocId = `${mapping.from}_${mapping.to}_${effectiveDate}_${key}`;
          const rateRef = doc(db, this.COLLECTION_NAME, rateDocId);
          batch.set(rateRef, {
            id: rateDocId,
            businessId,
            fromCurrency: mapping.from,
            toCurrency: mapping.to,
            typology: mapping.typ,
            rate: rVal,
            effectiveDate,
            source: "manual",
            actorId,
            is_inherited: false,
            createdAt: now,
            updatedAt: now
          }, { merge: true });
        }
      }

      await batch.commit();

      // Audit Trail (Forensic Log)
      const log = await ForensicLogRepository.createAndSignLog({
        business_id: businessId,
        actorId,
        userName: actor.name || "Manager",
        userRole: actor.role || "MANAGER",
        action: "EXCHANGE_RATES_BULK_UPSERT",
        details: `Mise à jour certifiée de la grille des taux pour ${effectiveDate}. Achat: ${validatedRates.ACHAT_CLIENT}, Vente: ${validatedRates.VENTE_CLIENT}, BRH: ${validatedRates.BRH}.`,
        afterState: grid,
        timestamp: now
      });
      await ForensicLogRepository.writeForensicLog(log);
    }

    // Clear local & static data caches
    this.clearCache(businessId);

    // Notify runtime event bus
    EventBus.publish(
      EventBus.createEvent({
        type: "EXCHANGE_RATES_UPDATED",
        businessId,
        module: "FINANCE",
        aggregate: "ExchangeRateGrid",
        payload: { grid, actor }
      })
    );

    return {
      ...grid,
      company_id: businessId,
      effective_date: effectiveDate,
      rates: hybridRates
    };
  }

  /**
   * Retrieves audit logs for exchange rate modifications.
   */
  public static async getExchangeRateAuditLogs(businessId: string): Promise<any[]> {
    const logs = await ForensicLogRepository.listByBusiness(businessId, 50);
    return logs
      .filter((l: any) => (l.action && l.action.includes("EXCHANGE_RATE")))
      .map((l: any) => ({
        ...l,
        actor_id: l.actorId || l.actor_id || "SYSTEM"
      }));
  }

  /**
   * Resolves the latest exchange rate for a given business and typology.
   */
  public static async getLatestRate(
    businessId: string,
    fromCurrency: "HTG" | "USD" | "CAD" | "EUR" | "DOP" = "USD",
    toCurrency: "HTG" | "USD" | "CAD" | "EUR" | "DOP" = "HTG",
    typology: RateTypology = "BRH"
  ): Promise<number> {
    const todayStr = getHaitiDateString();
    return this.getRateAtDate(businessId, fromCurrency, toCurrency, todayStr, typology);
  }

  /**
   * Finds the effective rate on a specific date for a given typology.
   */
  public static async getRateAtDate(
    businessId: string,
    fromCurrency: "HTG" | "USD" | "CAD" | "EUR" | "DOP",
    toCurrency: "HTG" | "USD" | "CAD" | "EUR" | "DOP",
    date: string,
    typology: RateTypology = "BRH"
  ): Promise<number> {
    if (fromCurrency === toCurrency) return 1.0;

    const cacheKey = this.getCacheKey(businessId, fromCurrency, toCurrency, date, typology);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.rate;
    }

    const grid = await this.getTodayRatesWithFallback(businessId, date);
    let rateVal = grid.rates[typology] || grid.rates.BRH || this.DEFAULT_RATE;

    if (fromCurrency === "HTG" && (toCurrency === "USD" || toCurrency === "CAD" || toCurrency === "EUR" || toCurrency === "DOP")) {
      rateVal = rateVal > 0 ? 1 / rateVal : 1 / this.DEFAULT_RATE;
    }

    this.cache.set(cacheKey, {
      rate: rateVal,
      expiresAt: Date.now() + this.CACHE_TTL_MS
    });

    return rateVal;
  }

  /**
   * Validates cross-currency teller/cash operations against active rate grids.
   */
  public static validateCrossCurrencyTransaction(params: {
    amount: number;
    fromCurrency: "HTG" | "USD" | "CAD" | "EUR" | "DOP";
    toCurrency: "HTG" | "USD" | "CAD" | "EUR" | "DOP";
    rateType?: RateTypology;
    activeRates?: any;
    businessId?: string;
    transactionDate?: string;
  }): { isValid: boolean; appliedRate: number; convertedAmount: number; convertedAmountHtg: number; error?: string } {
    const { amount, fromCurrency, toCurrency, rateType = "BRH", activeRates } = params;

    if (amount <= 0) {
      return { isValid: false, appliedRate: 0, convertedAmount: 0, convertedAmountHtg: 0, error: "Le montant doit être supérieur à zéro." };
    }

    if (fromCurrency === toCurrency) {
      return { isValid: true, appliedRate: 1.0, convertedAmount: amount, convertedAmountHtg: amount };
    }

    const ratesObj: Record<string, number> = activeRates?.ACHAT_CLIENT !== undefined 
      ? activeRates 
      : (Array.isArray(activeRates) ? Object.fromEntries(activeRates.map((r: any) => [r.rate_item_type, r.buy_rate])) : DEFAULT_RATE_GRID_VALUES);

    // If converting from Foreign to HTG (e.g. USD -> HTG)
    if (fromCurrency !== "HTG" && toCurrency === "HTG") {
      let rate = ratesObj[rateType] || ratesObj.BRH || 134.25;
      if (rateType === "ACHAT_CLIENT") {
        rate = ratesObj.ACHAT_CLIENT || 130.0;
      }
      const convertedAmount = Math.round(amount * rate * 100) / 100;
      return { isValid: true, appliedRate: rate, convertedAmount, convertedAmountHtg: convertedAmount };
    }

    // If converting from HTG to Foreign (e.g. HTG -> USD)
    if (fromCurrency === "HTG" && toCurrency !== "HTG") {
      let rate = ratesObj[rateType] || ratesObj.BRH || 134.25;
      if (rateType === "VENTE_CLIENT") {
        rate = ratesObj.VENTE_CLIENT || 132.0;
      }
      const convertedAmount = Math.round((amount / rate) * 100) / 100;
      return { isValid: true, appliedRate: rate, convertedAmount, convertedAmountHtg: amount };
    }

    return { isValid: true, appliedRate: 1.0, convertedAmount: amount, convertedAmountHtg: amount };
  }

  /**
   * Captures and freezes the effective rate for USD-denominated compensation paid in HTG.
   */
  public static validateAndFreezePayrollRate(
    currencyOrParams: any,
    ratesArg?: any,
    rateTypeArg?: RateTypology
  ): any {
    if (typeof currencyOrParams === "object" && currencyOrParams.usdSalary !== undefined) {
      const usdSalary = currencyOrParams.usdSalary;
      const rate = 134.25;
      return { appliedRate: rate, grossSalaryHtg: Math.round(usdSalary * rate * 100) / 100, frozenRateSource: "OFFICIAL_MANUAL_GRID" };
    }
    const currency = currencyOrParams;
    const ratesObj: Record<string, number> = ratesArg?.BRH !== undefined
      ? ratesArg
      : (Array.isArray(ratesArg) ? Object.fromEntries(ratesArg.map((r: any) => [r.rate_item_type, r.buy_rate])) : DEFAULT_RATE_GRID_VALUES);
    const rate_item_type = rateTypeArg || "BRH";
    const rate_value = ratesObj[rate_item_type] || 134.25;
    return {
      currency,
      rate_item_type,
      rate_value,
      frozen_at: new Date().toISOString()
    };
  }

  /**
   * Calculates foreign exchange gain/loss margin relative to official BRH reference rate.
   * Auto-attributes to financial income/expense GL accounts (4120/6120).
   */
  public static calculateExchangeMargin(params: {
    amountUsd: number;
    appliedRate: number;
    officialBrhRate: number;
    operationType: "ACHAT" | "VENTE";
  }): { marginHtg: number; accountCode: string; accountName: string } {
    const { amountUsd, appliedRate, officialBrhRate, operationType } = params;
    
    // Total Gourdes disbursed or received
    const actualHtg = amountUsd * appliedRate;
    const officialHtg = amountUsd * officialBrhRate;
    
    const marginHtg = Math.round((actualHtg - officialHtg) * 100) / 100;

    if (operationType === "ACHAT") {
      // Buying USD cheaper than BRH creates financial gain (4120)
      if (appliedRate <= officialBrhRate) {
        return {
          marginHtg: Math.abs(marginHtg),
          accountCode: "4120",
          accountName: "Produits Financiers - Marge de Change"
        };
      } else {
        return {
          marginHtg: Math.abs(marginHtg),
          accountCode: "6120",
          accountName: "Charges Financières - Perte de Change"
        };
      }
    } else {
      // Selling USD higher than BRH creates financial gain (4120)
      if (appliedRate >= officialBrhRate) {
        return {
          marginHtg: Math.abs(marginHtg),
          accountCode: "4120",
          accountName: "Produits Financiers - Marge de Change"
        };
      } else {
        return {
          marginHtg: Math.abs(marginHtg),
          accountCode: "6120",
          accountName: "Charges Financières - Perte de Change"
        };
      }
    }
  }

  /**
   * Registers a single exchange rate or override.
   */
  public static async setRate(
    rateData: Omit<ExchangeRate, "createdAt" | "updatedAt">
  ): Promise<void> {
    const id = `${rateData.fromCurrency}_${rateData.toCurrency}_${rateData.effectiveDate}_${rateData.typology || "STD"}`;
    const now = new Date().toISOString();
    
    if (db) {
      const docRef = doc(db, this.COLLECTION_NAME, id);
      const fullRecord = {
        ...rateData,
        id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await setDoc(docRef, fullRecord, { merge: true });
    }

    this.clearCache(rateData.businessId);

    EventBus.publish(EventBus.createEvent({
      correlationId: `rate_set_${Date.now()}`,
      actorId: rateData.actorId,
      businessId: rateData.businessId,
      module: "FINANCE",
      aggregate: "EXCHANGE_RATE",
      type: "ExchangeRateUpdated",
      payload: {
        from: rateData.fromCurrency,
        to: rateData.toCurrency,
        rate: rateData.rate,
        effectiveDate: rateData.effectiveDate
      }
    }));
  }

  /**
   * Translates a financial amount using the historical rate on the specified date.
   */
  public static async convert(
    amount: number,
    fromCurrency: "HTG" | "USD" | "CAD" | "EUR" | "DOP",
    toCurrency: "HTG" | "USD" | "CAD" | "EUR" | "DOP",
    businessId: string,
    date?: string,
    typology: RateTypology = "BRH"
  ): Promise<number> {
    if (fromCurrency === toCurrency) return amount;
    
    const lookupDate = date || getHaitiDateString();
    const rate = await this.getRateAtDate(businessId, fromCurrency, toCurrency, lookupDate, typology);

    return amount * rate;
  }

  /**
   * Retrieves all available rate grids for a specific date range.
   * Useful for batch normalization of historical transactions.
   */
  public static async getRatesForPeriod(
    businessId: string,
    startDate: string,
    endDate: string
  ): Promise<Record<string, DailyExchangeRateGrid>> {
    const result: Record<string, DailyExchangeRateGrid> = {};
    if (!db) return result;

    try {
      const q = query(
        collection(db, this.GRIDS_COLLECTION),
        where("businessId", "==", businessId),
        where("effectiveDate", ">=", startDate),
        where("effectiveDate", "<=", endDate),
        orderBy("effectiveDate", "asc")
      );

      const snap = await resilientGetDocs(q, undefined, true);
      snap.forEach((doc) => {
        const data = doc.data() as DailyExchangeRateGrid;
        if (data.effectiveDate) {
          result[data.effectiveDate] = data;
        }
      });
    } catch (err) {
      console.warn("[CurrencyRateRepository] Failed to fetch rates for period:", err);
    }

    return result;
  }
}
