import { doc, getDoc, setDoc, updateDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { EventBus } from "../modules/runtime/EventBus";
import { STATUTORY_TAX_RATES, SURVIVAL_FLOOR_HTG, BASE_CURRENCY } from "../constants/finance";
import { StaticDataCacheService } from "../services/cache/StaticDataCacheService";
import { isQuotaExceededError, resilientGetDoc } from "../utils/resilientFirestore";
import { idbCache } from "../services/cache/idb";

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
  enableTaxes?: boolean;
  cnssRateEmployee: number; // e.g. 0.06 (6%)
  cnssRateEmployer: number; // e.g. 0.06 (6%)
  cnsRateEmployee: number;  // e.g. 0.02 (2%)
  cnsRateEmployer: number;  // e.g. 0.03 (3%)
  survivalFloorHTG: number; // e.g. 15000 HTG
  currency: string;         // e.g. "HTG"
  history?: TaxConfigRecord[]; // Historical rate overrides
}

export interface PayrollPoliciesConfig {
  frequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  currency: string;
  enableTaxes: boolean;
  onaEmployeeRate: number;
  onaEmployerRate: number;
  ofatmaEmployeeRate: number;
  ofatmaEmployerRate: number;
  enableSurvivalFloor: boolean;
  survivalFloor: number;
  overtimeRate150: number;
  overtimeRate200: number;
  defaultCommissionRate: number;
  requireAttendanceForPayroll: boolean;
  latePenaltyCents?: number;
  absencePenaltyCents?: number;
  tardinessPenaltyMultiplier?: number;
  standardQuinzaineHours?: number;
}

export const BusinessAdministrationRepository = {
  async getPayrollPolicies(businessId: string): Promise<PayrollPoliciesConfig> {
    const defaultPolicies: PayrollPoliciesConfig = {
      frequency: "BIWEEKLY",
      currency: BASE_CURRENCY,
      enableTaxes: true,
      onaEmployeeRate: STATUTORY_TAX_RATES.ONA.EMPLOYEE_RATE,
      onaEmployerRate: STATUTORY_TAX_RATES.ONA.EMPLOYER_RATE,
      ofatmaEmployeeRate: STATUTORY_TAX_RATES.OFATMA.EMPLOYEE_RATE,
      ofatmaEmployerRate: STATUTORY_TAX_RATES.OFATMA.EMPLOYER_RATE_DEFAULT,
      enableSurvivalFloor: true,
      survivalFloor: SURVIVAL_FLOOR_HTG,
      overtimeRate150: 1.5,
      overtimeRate200: 2.0,
      defaultCommissionRate: 0.05,
      requireAttendanceForPayroll: true,
    };

    if (!businessId) return defaultPolicies;

    return await StaticDataCacheService.getOrFetch(
      `payroll_policies:${businessId}`,
      async () => {
        try {
          // 1. Direct doc in businesses/{businessId}/settings/payroll_policies
          const snap = await resilientGetDoc(doc(db, "businesses", businessId, "settings", "payroll_policies"), {
            fallbackToCache: true,
            throwOnNetworkFailure: false
          });
          if (snap && snap.exists()) {
            const data = snap.data();
            const enableTaxes = data.enableTaxes !== undefined
              ? Boolean(data.enableTaxes)
              : data.enable_social_taxes !== undefined
              ? Boolean(data.enable_social_taxes)
              : defaultPolicies.enableTaxes;
            return {
              ...defaultPolicies,
              ...data,
              enableTaxes,
            } as PayrollPoliciesConfig;
          }

          // 2. Fallback to tax configuration
          const taxConfig = await BusinessAdministrationRepository.getTaxConfiguration(businessId);
          const enableTaxes = (taxConfig as any).enableTaxes !== undefined
            ? Boolean((taxConfig as any).enableTaxes)
            : (taxConfig as any).enabled !== undefined
            ? Boolean((taxConfig as any).enabled)
            : defaultPolicies.enableTaxes;
          return {
            ...defaultPolicies,
            enableTaxes,
            currency: taxConfig.currency || BASE_CURRENCY,
            onaEmployeeRate: taxConfig.cnssRateEmployee ?? defaultPolicies.onaEmployeeRate,
            onaEmployerRate: taxConfig.cnssRateEmployer ?? defaultPolicies.onaEmployerRate,
            ofatmaEmployeeRate: taxConfig.cnsRateEmployee ?? defaultPolicies.ofatmaEmployeeRate,
            ofatmaEmployerRate: taxConfig.cnsRateEmployer ?? defaultPolicies.ofatmaEmployerRate,
            survivalFloor: taxConfig.survivalFloorHTG ?? defaultPolicies.survivalFloor,
          };
        } catch (error) {
          console.warn("[BusinessAdministrationRepository] Using default payroll policies:", error);
          return defaultPolicies;
        }
      },
      { category: "TAX_CONFIG", businessId }
    );
  },

  async updatePayrollPolicies(
    businessId: string,
    policies: Partial<PayrollPoliciesConfig>,
    actorId: string
  ): Promise<void> {
    const path = `businesses/${businessId}/settings/payroll_policies`;
    try {
      await setDoc(
        doc(db, "businesses", businessId, "settings", "payroll_policies"),
        { ...policies, updatedAt: serverTimestamp() },
        { merge: true }
      );

      // Keep tax_config in sync
      const taxUpdates: Partial<BusinessTaxConfiguration> = {};
      if (typeof policies.enableTaxes === "boolean") taxUpdates.enableTaxes = policies.enableTaxes;
      if (typeof policies.onaEmployeeRate === "number") taxUpdates.cnssRateEmployee = policies.onaEmployeeRate;
      if (typeof policies.onaEmployerRate === "number") taxUpdates.cnssRateEmployer = policies.onaEmployerRate;
      if (typeof policies.ofatmaEmployeeRate === "number") taxUpdates.cnsRateEmployee = policies.ofatmaEmployeeRate;
      if (typeof policies.ofatmaEmployerRate === "number") taxUpdates.cnsRateEmployer = policies.ofatmaEmployerRate;
      if (typeof policies.survivalFloor === "number") taxUpdates.survivalFloorHTG = policies.survivalFloor;
      if (policies.currency) taxUpdates.currency = policies.currency;

      if (Object.keys(taxUpdates).length > 0) {
        await setDoc(
          doc(db, "businesses", businessId, "settings", "tax_config"),
          { ...taxUpdates, updatedAt: serverTimestamp() },
          { merge: true }
        );
      }

      await StaticDataCacheService.invalidateKey(`payroll_policies:${businessId}`);
      await StaticDataCacheService.invalidateKey(`tax_config:${businessId}`);

      try {
        await addDoc(collection(db, "forensic_logs"), {
          id: "f_pol_" + Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          userId: actorId || "system",
          userRole: "ADMIN",
          business_id: businessId,
          action: "PAYROLL_POLICIES_UPDATED",
          beforeState: "{}",
          afterState: JSON.stringify(policies),
          signature: "seal_pol_" + Math.random().toString(36).substring(2, 9)
        });
      } catch (logErr) {
        console.warn("[BusinessAdministrationRepository] Failed to log forensic entry:", logErr);
      }

      EventBus.publish(EventBus.createEvent({
        correlationId: `update_payroll_policies_${businessId}`,
        actorId,
        businessId,
        module: "PAYROLL",
        aggregate: "BUSINESS_SETTINGS",
        type: "PayrollPoliciesUpdated",
        payload: { businessId, updates: policies }
      }));
    } catch (error) {
      if (isQuotaExceededError(error)) {
        console.warn("[BusinessAdministrationRepository] Firestore quota limit exceeded during updatePayrollPolicies. Storing in local cache.");
        try {
          await idbCache.set(`payroll_policies:${businessId}`, { ...policies }, 24 * 3600 * 1000, "GENERAL", businessId);
          EventBus.publish(EventBus.createEvent({
            correlationId: `update_payroll_policies_${businessId}`,
            actorId,
            businessId,
            module: "PAYROLL",
            aggregate: "BUSINESS_SETTINGS",
            type: "PayrollPoliciesUpdated",
            payload: { businessId, updates: policies }
          }));
        } catch (cErr) {
          console.warn("[BusinessAdministrationRepository] Local IDB cache fallback issue:", cErr);
        }
      }
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

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
          const snap = await resilientGetDoc(doc(db, "businesses", businessId, "settings", "tax_config"), {
            fallbackToCache: true,
            throwOnNetworkFailure: false
          });
          if (snap && snap.exists()) {
            const taxData = snap.data();
            const enableTaxes = taxData.enableTaxes !== undefined ? Boolean(taxData.enableTaxes) : defaultConfig.enableTaxes;
            return {
              ...defaultConfig,
              ...taxData,
              enableTaxes,
              cnssRateEmployee: enableTaxes === false ? 0 : (taxData.cnssRateEmployee ?? defaultConfig.cnssRateEmployee),
              cnssRateEmployer: enableTaxes === false ? 0 : (taxData.cnssRateEmployer ?? defaultConfig.cnssRateEmployer),
              cnsRateEmployee: enableTaxes === false ? 0 : (taxData.cnsRateEmployee ?? defaultConfig.cnsRateEmployee),
              cnsRateEmployer: enableTaxes === false ? 0 : (taxData.cnsRateEmployer ?? defaultConfig.cnsRateEmployer),
            } as BusinessTaxConfiguration;
          }

          // Fallback check: business root document settings.payroll
          const bizSnap = await resilientGetDoc(doc(db, "businesses", businessId), {
            fallbackToCache: true,
            throwOnNetworkFailure: false
          });
          if (bizSnap && bizSnap.exists()) {
            const bizData = bizSnap.data();
            const payrollSettings = bizData?.settings?.payroll;
            if (payrollSettings) {
              const taxes = payrollSettings.taxes;
              const taxesEnabled = payrollSettings.enable_social_taxes !== undefined
                ? Boolean(payrollSettings.enable_social_taxes)
                : payrollSettings.enableTaxes !== undefined
                ? Boolean(payrollSettings.enableTaxes)
                : taxes?.enabled !== undefined
                ? Boolean(taxes.enabled)
                : true;

              if (!taxesEnabled) {
                return {
                  ...defaultConfig,
                  enableTaxes: false,
                  cnssRateEmployee: 0,
                  cnssRateEmployer: 0,
                  cnsRateEmployee: 0,
                  cnsRateEmployer: 0,
                };
              }

              if (taxes && taxes.enabled !== false) {
                const cnssEmp = typeof taxes.employeeRate === "number" ? (taxes.employeeRate > 1 ? taxes.employeeRate / 100 : taxes.employeeRate) : defaultConfig.cnssRateEmployee;
                const cnssEmpr = typeof taxes.employerRate === "number" ? (taxes.employerRate > 1 ? taxes.employerRate / 100 : taxes.employerRate) : defaultConfig.cnssRateEmployer;
                
                let cnsEmp = defaultConfig.cnsRateEmployee;
                let cnsEmpr = defaultConfig.cnsRateEmployer;
                if (Array.isArray(taxes.additionalTaxes)) {
                  const ofatmaRule = taxes.additionalTaxes.find((t: any) => t.id === "tax_cns" || t.id === "tax_ofatma" || (t.name && t.name.toLowerCase().includes("ofatma")));
                  if (ofatmaRule && ofatmaRule.enabled) {
                    cnsEmp = typeof ofatmaRule.employeeRate === "number" ? (ofatmaRule.employeeRate > 1 ? ofatmaRule.employeeRate / 100 : ofatmaRule.employeeRate) : cnsEmp;
                    cnsEmpr = typeof ofatmaRule.employerRate === "number" ? (ofatmaRule.employerRate > 1 ? ofatmaRule.employerRate / 100 : ofatmaRule.employerRate) : cnsEmpr;
                  }
                }

                return {
                  ...defaultConfig,
                  cnssRateEmployee: cnssEmp,
                  cnssRateEmployer: cnssEmpr,
                  cnsRateEmployee: cnsEmp,
                  cnsRateEmployer: cnsEmpr,
                };
              }
            }
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

      try {
        await addDoc(collection(db, "forensic_logs"), {
          id: "f_tax_" + Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          userId: actorId || "system",
          userRole: "ADMIN",
          business_id: businessId,
          action: "TAX_CONFIGURATION_UPDATED",
          beforeState: "{}",
          afterState: JSON.stringify(config),
          signature: "seal_tax_" + Math.random().toString(36).substring(2, 9)
        });
      } catch (logErr) {
        console.warn("[BusinessAdministrationRepository] Non-fatal: Failed to write forensic log:", logErr);
      }

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
