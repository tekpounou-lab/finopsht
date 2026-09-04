import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { EventBus } from "../modules/runtime/EventBus";
import { STATUTORY_TAX_RATES, SURVIVAL_FLOOR_HTG, BASE_CURRENCY } from "../constants/finance";
import { StaticDataCacheService } from "../services/cache/StaticDataCacheService";

export interface TaxConfigRecord {
  cnssRateEmployee: number; // e.g. 0.06 (6%)
  cnssRateEmployer: number; // e.g. 0.06 (6%)
  cnsRateEmployee: number;  // e.g. 0.02 (2%)
  cnsRateEmployer: number;  // e.g. 0.03 (3%)
  survivalFloorHTG: number; // e.g. 15000 HTG
  effectiveFrom: string;    // e.g. "2026-01-01"
  effectiveTo?: string;     // e.g. "2026-06-30" or undefined if active
}

export interface BusinessTaxConfiguration {
  cnssRateEmployee: number; // e.g. 0.06 (6%)
  cnssRateEmployer: number; // e.g. 0.06 (6%)
  cnsRateEmployee: number;  // e.g. 0.02 (2%)
  cnsRateEmployer: number;  // e.g. 0.03 (3%)
  survivalFloorHTG: number; // e.g. 15000 HTG
  currency: string;         // e.g. "HTG"
  history?: TaxConfigRecord[]; // Historical rate overrides
}

export const BusinessAdministrationRepository = {
  async getTaxConfiguration(businessId: string): Promise<BusinessTaxConfiguration> {
    const defaultConfig: BusinessTaxConfiguration = {
      cnssRateEmployee: STATUTORY_TAX_RATES.ONA.EMPLOYEE_RATE,
      cnssRateEmployer: STATUTORY_TAX_RATES.ONA.EMPLOYER_RATE,
      cnsRateEmployee: STATUTORY_TAX_RATES.OFATMA.EMPLOYEE_RATE,
      cnsRateEmployer: STATUTORY_TAX_RATES.OFATMA.EMPLOYER_RATE_DEFAULT,
      survivalFloorHTG: SURVIVAL_FLOOR_HTG,
      currency: BASE_CURRENCY,
      history: []
    };

    if (!businessId) return defaultConfig;

    return await StaticDataCacheService.getOrFetch(
      `tax_config:${businessId}`,
      async () => {
        try {
          const snap = await getDoc(doc(db, "businesses", businessId, "settings", "tax_config"));
          if (snap.exists()) {
            return { ...defaultConfig, ...snap.data() } as BusinessTaxConfiguration;
          }
        } catch (error) {
          console.warn("[BusinessAdministrationRepository] Using default tax configuration:", error);
        }
        return defaultConfig;
      },
      {
        category: "TAX_CONFIG",
        businessId
      }
    );
  },

  async updateTaxConfiguration(
    businessId: string,
    config: Partial<BusinessTaxConfiguration>,
    actorId: string
  ): Promise<void> {
    const path = `businesses/${businessId}/settings/tax_config`;
    try {
      await setDoc(
        doc(db, "businesses", businessId, "settings", "tax_config"),
        { ...config, updatedAt: serverTimestamp() },
        { merge: true }
      );

      await StaticDataCacheService.invalidateKey(`tax_config:${businessId}`);

      EventBus.publish(EventBus.createEvent({
        correlationId: `update_tax_config_${businessId}`,
        actorId,
        businessId,
        module: "PAYROLL",
        aggregate: "BUSINESS_SETTINGS",
        type: "TaxConfigurationUpdated",
        payload: { businessId, updates: config }
      }));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
};
