import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { ConfigurationRecord, ResolutionResult } from "../../types/config";
import { resilientGetDoc, resilientGetDocs } from "../../utils/resilientFirestore";
import { z } from "zod";

export class ConfigurationResolver {
  /**
   * Resolves a configuration parameter key for a given business and effective date.
   * Adheres to precedence hierarchy:
   * 1. Employee-specific DATA (Passed manually if resolving employee context)
   * 2. Tenant CONFIGURATION (from business_settings/{businessId} or /businesses/{businessId}/configuration)
   * 3. Global POLICY/CONFIGURATION (from system_config/{key} or system tax rates)
   * 4. NO_DATA (if nothing is configured)
   */
  static async resolve(
    key: string,
    params: {
      businessId?: string;
      effectiveDate?: string; // YYYY-MM-DD
      employeeContext?: {
        id: string;
        customValue?: any; // e.g. employee-specific commission_rate
      };
    }
  ): Promise<ResolutionResult> {
    const effectiveDateStr = params.effectiveDate || new Date().toISOString().split("T")[0];

    // 1. Employee-specific DATA (highest priority)
    if (params.employeeContext && params.employeeContext.customValue !== undefined && params.employeeContext.customValue !== null) {
      const val = Number(params.employeeContext.customValue);
      if (!isNaN(val)) {
        return {
          status: "RESOLVED",
          value: val,
          source: "EMPLOYEE_DATA"
        };
      }
    }

    // 2. Tenant CONFIGURATION
    if (params.businessId) {
      const bizId = params.businessId;

      try {
        // Query /businesses/{businessId}/configuration collection for specific key
        const configCollectionRef = collection(db, "businesses", bizId, "configuration");
        const q = query(
          configCollectionRef,
          where("key", "==", key),
          where("status", "==", "ACTIVE")
        );
        const querySnap = await resilientGetDocs(q);

        if (querySnap && !querySnap.empty) {
          const docs = querySnap.docs.map(d => d.data() as ConfigurationRecord);
          // Filter by effective date
          const matchedRecord = docs.find(r => {
            const from = r.effective_from;
            const to = r.effective_to;
            return effectiveDateStr >= from && (!to || effectiveDateStr <= to);
          });

          if (matchedRecord) {
            // Validation check (Section 8)
            const isValid = this.validateValue(key, matchedRecord.value, matchedRecord.value_type);
            if (isValid) {
              return {
                status: "RESOLVED",
                value: matchedRecord.value,
                source: "TENANT_CONFIGURATION",
                version: matchedRecord.version,
                effectiveFrom: matchedRecord.effective_from,
                effectiveTo: matchedRecord.effective_to,
                configurationId: matchedRecord.id
              };
            } else {
              return {
                status: "INVALID",
                value: null,
                source: "TENANT_CONFIGURATION",
                configurationId: matchedRecord.id
              };
            }
          }
        }
      } catch (err) {
        console.warn(`[ConfigurationResolver] Error loading tenant configuration for ${key}:`, err);
      }

      // Fallback: Read from legacy business_settings/{businessId} or /businesses/{businessId}/settings/payroll_policies
      try {
        const bizSnap = await resilientGetDoc(doc(db, "business_settings", bizId), {
          fallbackToCache: true,
          throwOnNetworkFailure: false
        });

        if (bizSnap && bizSnap.exists()) {
          const data = bizSnap.data();
          let legacyVal: any = undefined;

          if (key === "commission_rate") {
            legacyVal = data?.defaultCommissionRate ?? data?.payroll_policies?.defaultCommissionRate ?? data?.payroll?.default_commission_rate;
          } else if (key === "standard_hours") {
            legacyVal = data?.standardQuinzaineHours ?? data?.standardHours ?? data?.payroll_policies?.standardQuinzaineHours;
          }

          if (legacyVal !== undefined && legacyVal !== null) {
            return {
              status: "RESOLVED",
              value: Number(legacyVal),
              source: "TENANT_CONFIGURATION",
              version: 1
            };
          }
        }
      } catch (err) {
        console.warn(`[ConfigurationResolver] Error loading legacy settings for ${key}:`, err);
      }
    }

    // 3. Global POLICY/CONFIGURATION
    try {
      const globalDocRef = doc(db, "system_config", `global_${key}`);
      const globalSnap = await resilientGetDoc(globalDocRef);
      if (globalSnap && globalSnap.exists()) {
        const r = globalSnap.data() as ConfigurationRecord;
        if (r.status === "ACTIVE") {
          const from = r.effective_from;
          const to = r.effective_to;
          const isEffective = effectiveDateStr >= from && (!to || effectiveDateStr <= to);

          if (isEffective) {
            const isValid = this.validateValue(key, r.value, r.value_type);
            if (isValid) {
              return {
                status: "RESOLVED",
                value: r.value,
                source: "GLOBAL_POLICY",
                version: r.version,
                effectiveFrom: r.effective_from,
                effectiveTo: r.effective_to,
                configurationId: r.id
              };
            } else {
              return {
                status: "INVALID",
                value: null,
                source: "GLOBAL_POLICY",
                configurationId: r.id
              };
            }
          } else {
            return {
              status: "NOT_EFFECTIVE",
              value: null,
              source: "GLOBAL_POLICY",
              configurationId: r.id
            };
          }
        } else {
          return {
            status: "INACTIVE",
            value: null,
            source: "GLOBAL_POLICY",
            configurationId: r.id
          };
        }
      }
    } catch (err) {
      console.warn(`[ConfigurationResolver] Error loading global policy for ${key}:`, err);
    }

    // 4. Fallback to System Default (non-hardcoded baseline if technically necessary, otherwise NO_DATA)
    if (key === "standard_hours") {
      return {
        status: "RESOLVED",
        value: 96,
        source: "SYSTEM_DEFAULT"
      };
    }

    return {
      status: "NO_DATA",
      value: null,
      source: "NONE"
    };
  }

  /**
   * Performs Zod validation on configuration values based on parameter types (Section 8).
   */
  private static validateValue(key: string, value: any, type: string): boolean {
    if (value === null || value === undefined) return false;

    try {
      if (type === "PERCENTAGE" || key.endsWith("_rate")) {
        const parsed = Number(value);
        return !isNaN(parsed) && parsed >= 0 && parsed <= 1;
      }
      if (key === "standard_hours" || key.endsWith("_hours")) {
        const parsed = Number(value);
        return !isNaN(parsed) && parsed >= 0 && parsed <= 744; // Max hours in a month is 744
      }
      if (key.endsWith("_cents") || key.endsWith("_htg") || key.endsWith("_amount") || key === "salary_base") {
        const parsed = Number(value);
        return !isNaN(parsed) && parsed >= 0;
      }
      return true;
    } catch {
      return false;
    }
  }
}
