import { ResolutionResult } from "../../types/config";
import { PayrollPolicyResolver } from "../payroll/PayrollPolicyResolver";

export class ConfigurationResolver {
  /**
   * Resolves a configuration parameter key for a given business and effective date.
   * Delegates to PayrollPolicyResolver SSOT hierarchy:
   * 1. Employee-specific Override
   * 2. Tenant Payroll Policy
   * 3. Global Statutory Policy
   */
  static async resolve(
    key: string,
    params: {
      businessId?: string;
      effectiveDate?: string; // YYYY-MM-DD
      employeeContext?: {
        id: string;
        customValue?: any;
      };
      canonicalMode?: "STRICT" | "CUSTOM";
    }
  ): Promise<ResolutionResult> {
    const res = await PayrollPolicyResolver.resolveParameter(key, {
      businessId: params.businessId,
      effectiveDate: params.effectiveDate,
      employeeContext: params.employeeContext,
      canonicalMode: params.canonicalMode || "STRICT",
    });

    let mappedSource: "EMPLOYEE_DATA" | "TENANT_CONFIGURATION" | "GLOBAL_POLICY" | "SYSTEM_DEFAULT" | "NONE" = "NONE";
    if (res.source === "EMPLOYEE_OVERRIDE") mappedSource = "EMPLOYEE_DATA";
    else if (res.source === "TENANT_POLICY") mappedSource = "TENANT_CONFIGURATION";
    else if (res.source === "GLOBAL_POLICY") mappedSource = "GLOBAL_POLICY";
    else if (res.source === "SYSTEM_DEFAULT") mappedSource = "SYSTEM_DEFAULT";

    return {
      status: res.status as any,
      value: res.value,
      source: mappedSource,
      version: typeof res.version === "number" ? res.version : 1,
      effectiveFrom: res.effectiveFrom,
      effectiveTo: res.effectiveTo || undefined,
      configurationId: res.policyId,
    };
  }
}
