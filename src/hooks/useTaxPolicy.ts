import { useMemo } from "react";
import { useBusinessContext } from "../contexts/BusinessContext";
import { TaxPolicyEngine, ResolvedTaxPolicy, TaxRates, SocialTaxResult } from "../services/payroll/TaxPolicyEngine";

export interface UseTaxPolicyResult extends ResolvedTaxPolicy {
  calculateSocialTaxes: (grossHtg: number) => SocialTaxResult;
}

export function useTaxPolicy(overrideSource?: any): UseTaxPolicyResult {
  const { businessSettings, currentBusiness } = useBusinessContext();

  return useMemo(() => {
    // If overrideSource is provided, merge with businessSettings
    const source = overrideSource 
      ? { ...businessSettings, ...currentBusiness?.settings, ...overrideSource }
      : { ...businessSettings, ...currentBusiness?.settings };

    const policy = TaxPolicyEngine.resolvePolicy(source);

    return {
      ...policy,
      calculateSocialTaxes: (grossHtg: number) => TaxPolicyEngine.calculateSocialTaxes(grossHtg, source),
    };
  }, [businessSettings, currentBusiness, overrideSource]);
}
