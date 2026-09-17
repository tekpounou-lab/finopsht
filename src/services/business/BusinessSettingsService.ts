import { doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { resilientGetDoc } from "../../utils/resilientFirestore";
import { StaticDataCacheService } from "../cache/StaticDataCacheService";

export class BusinessSettingsService {
  static readonly DEFAULT_STANDARD_QUINZAINE_HOURS = 96;

  /**
   * Retrieves the standard hours for a quinzaine (default: 96h).
   * Reads from business_settings or businesses/{businessId}/settings/payroll_policies.
   */
  static async getStandardHours(businessId?: string): Promise<number> {
    if (!businessId) return 96;

    return await StaticDataCacheService.getOrFetch(
      `standard_hours:${businessId}`,
      async () => {
        try {
          // 1. Try business_settings/{businessId}
          const bizSnap = await resilientGetDoc(doc(db, "business_settings", businessId), {
            fallbackToCache: true,
            throwOnNetworkFailure: false,
          });
          if (bizSnap && bizSnap.exists()) {
            const data = bizSnap.data();
            const hours =
              data?.standardQuinzaineHours ||
              data?.standardHours ||
              data?.payroll_policies?.standardQuinzaineHours ||
              data?.payrollPolicies?.standardQuinzaineHours;
            if (typeof hours === "number" && hours > 0) return hours;
          }

          // 2. Try businesses/{businessId}/settings/payroll_policies
          const policiesSnap = await resilientGetDoc(
            doc(db, "businesses", businessId, "settings", "payroll_policies"),
            { fallbackToCache: true, throwOnNetworkFailure: false }
          );
          if (policiesSnap && policiesSnap.exists()) {
            const pData = policiesSnap.data();
            const hours = pData?.standardQuinzaineHours || pData?.standardHours;
            if (typeof hours === "number" && hours > 0) return hours;
          }

          return 96;
        } catch {
          return 96;
        }
      },
      { ttlMs: 60000, category: "ORGANIZATION_META", businessId }
    );
  }
}
