import { PayrollPolicyRepository } from "../../repositories/PayrollPolicyRepository";
import { PayrollPolicy, PolicyResolutionResult } from "../../types/payrollPolicy";
import { STATUTORY_TAX_RATES, SURVIVAL_FLOOR_HTG } from "../../constants/finance";

export interface ResolveParameterParams {
  businessId?: string;
  effectiveDate?: string; // YYYY-MM-DD
  employeeContext?: {
    id?: string;
    customValue?: any;
    overrides?: Record<string, any>;
    payRegime?: "FIXED" | "COMMISSION" | "HYBRID" | string;
  };
  canonicalMode?: "STRICT" | "CUSTOM";
}

export interface EffectiveResolvedPolicy {
  policyId?: string;
  version?: number;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  frequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  currency: "HTG" | "USD";
  standardHoursPerCycle: number;
  standardQuinzaineHours: number;
  attendanceToleranceHours: number;
  workingDaysBasis: number;
  overtimeRate150: number;
  overtimeRate200: number;
  latePenaltyCents: number;
  absencePenaltyCents: number;
  enableTaxes: boolean;
  enableSocialTaxes: boolean;
  onaEmployeeRate: number;
  onaEmployerRate: number;
  ofatmaEmployeeRate: number;
  ofatmaEmployerRate: number;
  defaultCommissionRate: number;
  enableSurvivalFloor: boolean;
  enable_survival_floor: boolean;
  survivalFloorHTG: number;
  requireAttendanceForPayroll: boolean;
  require_attendance_for_payroll: boolean;
  resolutionMode: "STRICT" | "CUSTOM";
  resolvedParameters: Record<string, PolicyResolutionResult<any>>;
}

export class PayrollPolicyResolver {
  /**
   * Resolves all policy parameters for a tenant and effective date in a single deterministic pass.
   * Maps 3-tier resolution directly into an engine-consumable policy object.
   */
  public static async resolveEffectivePolicy(
    params: ResolveParameterParams
  ): Promise<EffectiveResolvedPolicy> {
    const keys = [
      "frequency",
      "currency",
      "standard_hours",
      "ot_rate_normal",
      "ot_rate_holiday",
      "late_penalty_cents",
      "absence_penalty_cents",
      "enable_social_taxes",
      "cnss_ona_employee_rate",
      "cnss_ona_employer_rate",
      "ofatma_cns_employee_rate",
      "ofatma_cns_employer_rate",
      "commission_rate",
      "enable_survival_floor",
      "survival_floor_htg",
      "require_attendance_for_payroll",
    ];

    const results: Record<string, PolicyResolutionResult<any>> = {};
    for (const key of keys) {
      results[key] = await this.resolveParameter(key, params);
    }

    const tenantPol = params.businessId
      ? await PayrollPolicyRepository.getEffectivePolicy(params.businessId, params.effectiveDate)
      : null;

    const stdHours = Number(results["standard_hours"]?.value) || 96;
    const enableTaxes = Boolean(results["enable_social_taxes"]?.value);
    const enableFloor = Boolean(results["enable_survival_floor"]?.value);
    const floorHtg = Number(results["survival_floor_htg"]?.value);
    const requireAtt = Boolean(results["require_attendance_for_payroll"]?.value);

    return {
      policyId: tenantPol?.id,
      version: tenantPol?.version,
      effectiveFrom: tenantPol?.effectiveFrom,
      effectiveTo: tenantPol?.effectiveTo,
      frequency: (results["frequency"]?.value || "BIWEEKLY") as any,
      currency: (results["currency"]?.value || "HTG") as any,
      standardHoursPerCycle: stdHours,
      standardQuinzaineHours: stdHours,
      attendanceToleranceHours: tenantPol?.attendanceToleranceHours ?? (stdHours - 2),
      workingDaysBasis: tenantPol?.workingDaysBasis ?? 22,
      overtimeRate150: Number(results["ot_rate_normal"]?.value) || 1.5,
      overtimeRate200: Number(results["ot_rate_holiday"]?.value) || 2.0,
      latePenaltyCents: Number(results["late_penalty_cents"]?.value) || 0,
      absencePenaltyCents: Number(results["absence_penalty_cents"]?.value) || 0,
      enableTaxes,
      enableSocialTaxes: enableTaxes,
      onaEmployeeRate: Number(results["cnss_ona_employee_rate"]?.value) ?? 0.06,
      onaEmployerRate: Number(results["cnss_ona_employer_rate"]?.value) ?? 0.06,
      ofatmaEmployeeRate: Number(results["ofatma_cns_employee_rate"]?.value) ?? 0.02,
      ofatmaEmployerRate: Number(results["ofatma_cns_employer_rate"]?.value) ?? 0.03,
      defaultCommissionRate: Number(results["commission_rate"]?.value) ?? 0.05,
      enableSurvivalFloor: enableFloor,
      enable_survival_floor: enableFloor,
      survivalFloorHTG: isNaN(floorHtg) ? SURVIVAL_FLOOR_HTG : floorHtg,
      requireAttendanceForPayroll: requireAtt,
      require_attendance_for_payroll: requireAtt,
      resolutionMode: tenantPol?.resolution?.mode || params.canonicalMode || "STRICT",
      resolvedParameters: results,
    };
  }

  /**
   * Central SSOT resolver for all payroll & tax policy parameters.
   * Enforces 3-tier resolution hierarchy:
   * Tier 1: Employee Specific Override
   * Tier 2: Tenant Effective Payroll Policy
   * Tier 3: Global Statutory / System Baseline
   */
  public static async resolveParameter<T = any>(
    key: string,
    params: ResolveParameterParams
  ): Promise<PolicyResolutionResult<T>> {
    const effectiveDateStr = params.effectiveDate || new Date().toISOString().split("T")[0];
    const mode = params.canonicalMode || "STRICT";

    // ----------------------------------------------------
    // TIER 1: EMPLOYEE SPECIFIC OVERRIDE
    // ----------------------------------------------------
    if (params.employeeContext) {
      const emp = params.employeeContext;

      // FIXED pay regime override for commission rate
      if (
        (key === "commission_rate" || key === "defaultCommissionRate") &&
        emp.payRegime &&
        String(emp.payRegime).toUpperCase() === "FIXED"
      ) {
        return {
          status: "RESOLVED",
          value: 0 as unknown as T,
          source: "EMPLOYEE_OVERRIDE",
        };
      }

      // Explicit employee override value check
      const overrideVal = emp.customValue !== undefined && emp.customValue !== null && emp.customValue !== ""
        ? emp.customValue
        : emp.overrides?.[key];

      if (overrideVal !== undefined && overrideVal !== null && overrideVal !== "") {
        const val = Number(overrideVal);
        if (!isNaN(val)) {
          if (mode === "STRICT" && !this.validateParameterValue(key, val)) {
            return {
              status: "INVALID",
              value: null as unknown as T,
              source: "EMPLOYEE_OVERRIDE",
            };
          }
          return {
            status: "RESOLVED",
            value: val as unknown as T,
            source: "EMPLOYEE_OVERRIDE",
          };
        }
      }
    }

    // ----------------------------------------------------
    // TIER 2: TENANT EFFECTIVE PAYROLL POLICY
    // ----------------------------------------------------
    let tenantPolicy: PayrollPolicy | null = null;
    if (params.businessId) {
      tenantPolicy = await PayrollPolicyRepository.getEffectivePolicy(
        params.businessId,
        effectiveDateStr
      );

      if (tenantPolicy) {
        const tenantVal = this.extractPolicyValue(key, tenantPolicy);
        if (tenantVal !== undefined && tenantVal !== null) {
          if (mode === "STRICT" && !this.validateParameterValue(key, tenantVal)) {
            return {
              status: "INVALID",
              value: null as unknown as T,
              source: "TENANT_POLICY",
              version: tenantPolicy.version,
              effectiveFrom: tenantPolicy.effectiveFrom,
              effectiveTo: tenantPolicy.effectiveTo,
              policyId: tenantPolicy.id,
            };
          }
          return {
            status: "RESOLVED",
            value: tenantVal as unknown as T,
            source: "TENANT_POLICY",
            version: tenantPolicy.version,
            effectiveFrom: tenantPolicy.effectiveFrom,
            effectiveTo: tenantPolicy.effectiveTo,
            policyId: tenantPolicy.id,
          };
        }
      }
    }

    // ----------------------------------------------------
    // TIER 3: GLOBAL STATUTORY / SYSTEM BASELINE
    // ----------------------------------------------------
    const globalDefault = this.getGlobalStatutoryDefault(key);
    if (globalDefault !== undefined) {
      return {
        status: "RESOLVED",
        value: globalDefault as unknown as T,
        source: "GLOBAL_POLICY",
      };
    }

    return {
      status: "NO_DATA",
      value: null as unknown as T,
      source: "SYSTEM_DEFAULT",
    };
  }

  /**
   * Helper to extract key from PayrollPolicy document.
   */
  private static extractPolicyValue(key: string, policy: PayrollPolicy): any {
    switch (key) {
      case "commission_rate":
      case "defaultCommissionRate":
      case "default_commission_rate":
        return policy.commissions?.defaultSalesRate;

      case "standard_hours":
      case "standardHoursPerCycle":
      case "standardQuinzaineHours":
        return policy.standardHoursPerCycle;

      case "survival_floor_htg":
      case "survivalFloor":
      case "survivalFloorHTG":
        return policy.survivalFloor?.enabled ? policy.survivalFloor.minimumNetHTG : 0;

      case "enable_survival_floor":
      case "enableSurvivalFloor":
        return policy.survivalFloor?.enabled;

      case "ot_rate_normal":
      case "overtimeRate150":
        return policy.overtime?.normalRate;

      case "ot_rate_holiday":
      case "overtimeRate200":
        return policy.overtime?.holidayRate;

      case "enable_social_taxes":
      case "enableSocialTaxes":
      case "enableTaxes":
        return policy.socialContributions?.enabled;

      case "cnss_ona_employee_rate":
      case "tax_cnss_employee":
      case "onaEmployeeRate":
        return policy.socialContributions?.cnssOna?.employeeRate;

      case "cnss_ona_employer_rate":
      case "tax_cnss_employer":
      case "onaEmployerRate":
        return policy.socialContributions?.cnssOna?.employerRate;

      case "ofatma_cns_employee_rate":
      case "tax_cns_employee":
      case "ofatmaEmployeeRate":
        return policy.socialContributions?.ofatmaCns?.employeeRate;

      case "ofatma_cns_employer_rate":
      case "tax_cns_employer":
      case "ofatmaEmployerRate":
        return policy.socialContributions?.ofatmaCns?.employerRate;

      case "require_attendance_for_payroll":
      case "requireAttendanceForPayroll":
      case "excludeWithoutRecords":
        return policy.attendance?.excludeWithoutRecords;

      case "late_penalty_cents":
      case "latePenaltyCents":
        return policy.penalties?.lateFixedCents;

      case "absence_penalty_cents":
      case "absencePenaltyCents":
        return policy.penalties?.absencePerDayCents;

      case "frequency":
        return policy.frequency;

      case "currency":
        return policy.currency;

      default:
        return (policy as any)[key];
    }
  }

  /**
   * Statutory global defaults fallback.
   */
  private static getGlobalStatutoryDefault(key: string): any {
    switch (key) {
      case "commission_rate":
      case "defaultCommissionRate":
      case "default_commission_rate":
        return 0.05;

      case "standard_hours":
      case "standardHoursPerCycle":
      case "standardQuinzaineHours":
        return 96;

      case "survival_floor_htg":
      case "survivalFloor":
      case "survivalFloorHTG":
        return SURVIVAL_FLOOR_HTG;

      case "enable_survival_floor":
      case "enableSurvivalFloor":
        return true;

      case "ot_rate_normal":
      case "overtimeRate150":
        return 1.5;

      case "ot_rate_holiday":
      case "overtimeRate200":
        return 2.0;

      case "enable_social_taxes":
      case "enableSocialTaxes":
      case "enableTaxes":
        return true;

      case "cnss_ona_employee_rate":
      case "tax_cnss_employee":
      case "onaEmployeeRate":
        return STATUTORY_TAX_RATES.ONA.EMPLOYEE_RATE;

      case "cnss_ona_employer_rate":
      case "tax_cnss_employer":
      case "onaEmployerRate":
        return STATUTORY_TAX_RATES.ONA.EMPLOYER_RATE;

      case "ofatma_cns_employee_rate":
      case "tax_cns_employee":
      case "ofatmaEmployeeRate":
        return STATUTORY_TAX_RATES.OFATMA.EMPLOYEE_RATE;

      case "ofatma_cns_employer_rate":
      case "tax_cns_employer":
      case "ofatmaEmployerRate":
        return STATUTORY_TAX_RATES.OFATMA.EMPLOYER_RATE_DEFAULT;

      case "require_attendance_for_payroll":
      case "requireAttendanceForPayroll":
      case "excludeWithoutRecords":
        return true;

      case "late_penalty_cents":
      case "latePenaltyCents":
      case "absence_penalty_cents":
      case "absencePenaltyCents":
        return 0;

      case "frequency":
        return "BIWEEKLY";

      case "currency":
        return "HTG";

      default:
        return undefined;
    }
  }

  /**
   * Validates parameter values in STRICT mode.
   */
  private static validateParameterValue(key: string, val: any): boolean {
    if (val === null || val === undefined) return false;
    const num = Number(val);

    if (key.includes("rate") || key.includes("Rate")) {
      return !isNaN(num) && num >= 0 && num <= 3.0;
    }
    if (key.includes("hours") || key.includes("Hours")) {
      return !isNaN(num) && num >= 0 && num <= 744;
    }
    if (key.includes("cents") || key.includes("Cents") || key.includes("htg") || key.includes("HTG")) {
      return !isNaN(num) && num >= 0;
    }
    return true;
  }
}
