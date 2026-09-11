/**
 * FINOPS ERP — Tax Policy & Compliance SSOT Engine
 * 
 * Centralized authority for tax policies, statutory deductions (ONA / OFATMA),
 * survival floor guarantees, and attendance eligibility requirements.
 * Ensures consistent behavior across Payroll Runs, BI Analytics, Reports & PDF generation.
 */

import { STATUTORY_TAX_RATES, SURVIVAL_FLOOR_HTG } from "../../constants/finance";

export interface TaxRates {
  onaEmployee: number;
  onaEmployer: number;
  ofatmaEmployee: number;
  ofatmaEmployer: number;
  enabled: boolean;
}

export interface SocialTaxResult {
  isTaxesEnabled: boolean;
  onaEmployee: number;
  onaEmployer: number;
  ofatmaEmployee: number;
  ofatmaEmployer: number;
  totalEmployeeTaxes: number;
  totalEmployerTaxes: number;
}

export interface ResolvedTaxPolicy {
  isSocialTaxEnabled: boolean;
  isSurvivalFloorEnabled: boolean;
  survivalFloorAmount: number;
  isAttendanceRequired: boolean;
  taxRates: TaxRates;
}

export class TaxPolicyEngine {
  /**
   * Determine whether social taxes (ONA / OFATMA) are active for a given configuration source.
   * Priority is given to explicit user toggles (enable_social_taxes, enableTaxes).
   */
  static isSocialTaxEnabled(source?: any): boolean {
    if (typeof source === "boolean") {
      return source;
    }
    if (!source || typeof source !== "object") {
      return true; // Default statutory compliance if unconfigured
    }

    // 1. Direct flags on root object
    if (source.enable_social_taxes !== undefined) {
      return Boolean(source.enable_social_taxes);
    }
    if (source.enableSocialTaxes !== undefined) {
      return Boolean(source.enableSocialTaxes);
    }
    if (source.enableTaxes !== undefined) {
      return Boolean(source.enableTaxes);
    }
    if (source.isTaxesEnabled !== undefined) {
      return Boolean(source.isTaxesEnabled);
    }

    // 2. Settings.payroll or source.payroll
    const payroll = source.payroll || source.settings?.payroll;
    if (payroll) {
      if (payroll.enable_social_taxes !== undefined) {
        return Boolean(payroll.enable_social_taxes);
      }
      if (payroll.enableSocialTaxes !== undefined) {
        return Boolean(payroll.enableSocialTaxes);
      }
      if (payroll.enableTaxes !== undefined) {
        return Boolean(payroll.enableTaxes);
      }
      if (payroll.taxes?.enabled !== undefined) {
        return Boolean(payroll.taxes.enabled);
      }
      if (payroll.isTaxesEnabled !== undefined) {
        return Boolean(payroll.isTaxesEnabled);
      }
    }

    // 3. Settings.payroll_policies or source.payroll_policies / payrollPolicies
    const policies = source.payroll_policies || source.payrollPolicies || source.settings?.payroll_policies;
    if (policies) {
      if (policies.enable_social_taxes !== undefined) {
        return Boolean(policies.enable_social_taxes);
      }
      if (policies.enableTaxes !== undefined) {
        return Boolean(policies.enableTaxes);
      }
      if (policies.isTaxesEnabled !== undefined) {
        return Boolean(policies.isTaxesEnabled);
      }
    }

    // 4. Tax Configuration
    const taxConfig = source.tax_config || source.taxConfig || source.settings?.tax_config;
    if (taxConfig) {
      if (taxConfig.enableTaxes !== undefined) {
        return Boolean(taxConfig.enableTaxes);
      }
      if (taxConfig.enabled !== undefined) {
        return Boolean(taxConfig.enabled);
      }
      if (taxConfig.enable_social_taxes !== undefined) {
        return Boolean(taxConfig.enable_social_taxes);
      }
    }

    // 5. Raw taxes property
    if (source.taxes?.enabled !== undefined) {
      return Boolean(source.taxes.enabled);
    }

    // 6. Generic settings object fallback
    if (source.settings) {
      return this.isSocialTaxEnabled(source.settings);
    }

    return true;
  }

  /**
   * Determine whether the statutory survival floor (plancher de survie) is active.
   */
  static isSurvivalFloorEnabled(source?: any): boolean {
    if (typeof source === "boolean") {
      return source;
    }
    if (!source || typeof source !== "object") {
      return true;
    }

    if (source.enable_survival_floor !== undefined) {
      return Boolean(source.enable_survival_floor);
    }
    if (source.enableSurvivalFloor !== undefined) {
      return Boolean(source.enableSurvivalFloor);
    }

    const payroll = source.payroll || source.settings?.payroll;
    if (payroll) {
      if (payroll.enable_survival_floor !== undefined) {
        return Boolean(payroll.enable_survival_floor);
      }
      if (payroll.enableSurvivalFloor !== undefined) {
        return Boolean(payroll.enableSurvivalFloor);
      }
    }

    const policies = source.payroll_policies || source.payrollPolicies || source.settings?.payroll_policies;
    if (policies) {
      if (policies.enable_survival_floor !== undefined) {
        return Boolean(policies.enable_survival_floor);
      }
      if (policies.enableSurvivalFloor !== undefined) {
        return Boolean(policies.enableSurvivalFloor);
      }
    }

    return true;
  }

  /**
   * Get configured or statutory survival floor threshold in HTG.
   */
  static getSurvivalFloorAmount(source?: any): number {
    const rawVal =
      source?.survival_floor_htg ??
      source?.survivalFloor ??
      source?.survivalFloorHTG ??
      source?.payroll?.survival_floor_htg ??
      source?.payroll?.survivalFloor ??
      source?.payroll_policies?.survivalFloor ??
      source?.settings?.payroll?.survival_floor_htg;

    const num = Number(rawVal);
    return !isNaN(num) && num > 0 ? num : SURVIVAL_FLOOR_HTG;
  }

  /**
   * Determine whether attendance records are strictly required to include an employee in payroll runs.
   */
  static isAttendanceRequiredForPayroll(source?: any): boolean {
    if (typeof source === "boolean") {
      return source;
    }
    if (!source || typeof source !== "object") {
      return true;
    }

    if (source.require_attendance_for_payroll !== undefined) {
      return Boolean(source.require_attendance_for_payroll);
    }
    if (source.requireAttendanceForPayroll !== undefined) {
      return Boolean(source.requireAttendanceForPayroll);
    }

    const payroll = source.payroll || source.settings?.payroll;
    if (payroll) {
      if (payroll.require_attendance_for_payroll !== undefined) {
        return Boolean(payroll.require_attendance_for_payroll);
      }
      if (payroll.requireAttendanceForPayroll !== undefined) {
        return Boolean(payroll.requireAttendanceForPayroll);
      }
    }

    const policies = source.payroll_policies || source.payrollPolicies || source.settings?.payroll_policies;
    if (policies) {
      if (policies.require_attendance_for_payroll !== undefined) {
        return Boolean(policies.require_attendance_for_payroll);
      }
      if (policies.requireAttendanceForPayroll !== undefined) {
        return Boolean(policies.requireAttendanceForPayroll);
      }
    }

    return true;
  }

  /**
   * Resolve tax rates for employee and employer.
   * Zeroes out all rates if social taxes are disabled.
   */
  static getTaxRates(source?: any): TaxRates {
    const enabled = this.isSocialTaxEnabled(source);
    if (!enabled) {
      return {
        enabled: false,
        onaEmployee: 0,
        onaEmployer: 0,
        ofatmaEmployee: 0,
        ofatmaEmployer: 0,
      };
    }

    const parseRate = (val: any, fallback: number): number => {
      const n = Number(val);
      if (isNaN(n) || n < 0) return fallback;
      return n > 1 ? n / 100 : n;
    };

    const policies = source?.payroll_policies || source?.payrollPolicies || source?.settings?.payroll_policies || source?.payroll || source;

    const onaEmp = parseRate(
      policies?.onaEmployeeRate ?? policies?.tax_cnss_employee ?? policies?.cnssRateEmployee,
      STATUTORY_TAX_RATES.ONA.EMPLOYEE_RATE
    );
    const onaEmpr = parseRate(
      policies?.onaEmployerRate ?? policies?.tax_cnss_employer ?? policies?.cnssRateEmployer,
      STATUTORY_TAX_RATES.ONA.EMPLOYER_RATE
    );
    const ofatmaEmp = parseRate(
      policies?.ofatmaEmployeeRate ?? policies?.tax_cns_employee ?? policies?.cnsRateEmployee,
      STATUTORY_TAX_RATES.OFATMA.EMPLOYEE_RATE
    );
    const ofatmaEmpr = parseRate(
      policies?.ofatmaEmployerRate ?? policies?.tax_cns_employer ?? policies?.cnsRateEmployer,
      STATUTORY_TAX_RATES.OFATMA.EMPLOYER_RATE_DEFAULT
    );

    return {
      enabled: true,
      onaEmployee: onaEmp,
      onaEmployer: onaEmpr,
      ofatmaEmployee: ofatmaEmp,
      ofatmaEmployer: ofatmaEmpr,
    };
  }

  /**
   * Pure mathematical calculation of ONA and OFATMA social taxes for a gross salary.
   * If taxes are disabled, returns all zeros.
   */
  static calculateSocialTaxes(grossHtg: number, source?: any): SocialTaxResult {
    const rates = this.getTaxRates(source);
    if (!rates.enabled || grossHtg <= 0) {
      return {
        isTaxesEnabled: false,
        onaEmployee: 0,
        onaEmployer: 0,
        ofatmaEmployee: 0,
        ofatmaEmployer: 0,
        totalEmployeeTaxes: 0,
        totalEmployerTaxes: 0,
      };
    }

    const onaEmployee = Math.round(grossHtg * rates.onaEmployee * 100) / 100;
    const onaEmployer = Math.round(grossHtg * rates.onaEmployer * 100) / 100;
    const ofatmaEmployee = Math.round(grossHtg * rates.ofatmaEmployee * 100) / 100;
    const ofatmaEmployer = Math.round(grossHtg * rates.ofatmaEmployer * 100) / 100;

    return {
      isTaxesEnabled: true,
      onaEmployee,
      onaEmployer,
      ofatmaEmployee,
      ofatmaEmployer,
      totalEmployeeTaxes: Math.round((onaEmployee + ofatmaEmployee) * 100) / 100,
      totalEmployerTaxes: Math.round((onaEmployer + ofatmaEmployer) * 100) / 100,
    };
  }

  /**
   * Helper to get rates formatted as employeeOnaRate, etc.
   */
  static resolveRates(source?: any): {
    employeeOnaRate: number;
    employerOnaRate: number;
    employeeOfatmaRate: number;
    employerOfatmaRate: number;
  } {
    const rates = this.getTaxRates(source);
    return {
      employeeOnaRate: rates.onaEmployee,
      employerOnaRate: rates.onaEmployer,
      employeeOfatmaRate: rates.ofatmaEmployee,
      employerOfatmaRate: rates.ofatmaEmployer,
    };
  }

  /**
   * Helper to resolve the full operational policy object.
   */
  static resolvePolicy(source?: any): ResolvedTaxPolicy {
    return {
      isSocialTaxEnabled: this.isSocialTaxEnabled(source),
      isSurvivalFloorEnabled: this.isSurvivalFloorEnabled(source),
      survivalFloorAmount: this.getSurvivalFloorAmount(source),
      isAttendanceRequired: this.isAttendanceRequiredForPayroll(source),
      taxRates: this.getTaxRates(source),
    };
  }
}
