import { describe, it, expect } from "vitest";
import { TaxPolicyEngine } from "../../services/payroll/TaxPolicyEngine";

describe("TaxPolicyEngine SSOT", () => {
  it("should default to enabled if source is empty or undefined", () => {
    expect(TaxPolicyEngine.isSocialTaxEnabled()).toBe(true);
    expect(TaxPolicyEngine.isSocialTaxEnabled({})).toBe(true);
  });

  it("should respect enable_social_taxes on root and nested payroll settings", () => {
    expect(TaxPolicyEngine.isSocialTaxEnabled({ enable_social_taxes: false })).toBe(false);
    expect(TaxPolicyEngine.isSocialTaxEnabled({ enable_social_taxes: true })).toBe(true);

    expect(TaxPolicyEngine.isSocialTaxEnabled({ payroll: { enable_social_taxes: false } })).toBe(false);
    expect(TaxPolicyEngine.isSocialTaxEnabled({ payroll: { enable_social_taxes: true } })).toBe(true);

    expect(TaxPolicyEngine.isSocialTaxEnabled({ settings: { payroll: { enable_social_taxes: false } } })).toBe(false);
    expect(TaxPolicyEngine.isSocialTaxEnabled({ settings: { payroll: { enable_social_taxes: true } } })).toBe(true);
  });

  it("should respect enableTaxes on payroll_policies", () => {
    expect(TaxPolicyEngine.isSocialTaxEnabled({ payroll_policies: { enableTaxes: false } })).toBe(false);
    expect(TaxPolicyEngine.isSocialTaxEnabled({ payroll_policies: { enableTaxes: true } })).toBe(true);

    expect(TaxPolicyEngine.isSocialTaxEnabled({ payrollPolicies: { enableTaxes: false } })).toBe(false);
  });

  it("should respect tax_config.enableTaxes or taxes.enabled", () => {
    expect(TaxPolicyEngine.isSocialTaxEnabled({ tax_config: { enableTaxes: false } })).toBe(false);
    expect(TaxPolicyEngine.isSocialTaxEnabled({ taxes: { enabled: false } })).toBe(false);
    expect(TaxPolicyEngine.isSocialTaxEnabled({ payroll: { taxes: { enabled: false } } })).toBe(false);
  });

  it("should return 0 rates and 0 tax calculation when disabled", () => {
    const disabledConfig = { payroll: { enable_social_taxes: false } };
    const rates = TaxPolicyEngine.getTaxRates(disabledConfig);
    expect(rates.enabled).toBe(false);
    expect(rates.onaEmployee).toBe(0);
    expect(rates.onaEmployer).toBe(0);
    expect(rates.ofatmaEmployee).toBe(0);
    expect(rates.ofatmaEmployer).toBe(0);

    const calc = TaxPolicyEngine.calculateSocialTaxes(50000, disabledConfig);
    expect(calc.isTaxesEnabled).toBe(false);
    expect(calc.onaEmployee).toBe(0);
    expect(calc.ofatmaEmployee).toBe(0);
    expect(calc.totalEmployeeTaxes).toBe(0);
    expect(calc.totalEmployerTaxes).toBe(0);
  });

  it("should calculate correct statutory taxes when enabled", () => {
    const enabledConfig = { payroll: { enable_social_taxes: true } };
    const rates = TaxPolicyEngine.getTaxRates(enabledConfig);
    expect(rates.enabled).toBe(true);
    expect(rates.onaEmployee).toBe(0.06);
    expect(rates.ofatmaEmployee).toBe(0.02);

    const calc = TaxPolicyEngine.calculateSocialTaxes(50000, enabledConfig);
    expect(calc.isTaxesEnabled).toBe(true);
    expect(calc.onaEmployee).toBe(3000); // 6% of 50,000
    expect(calc.ofatmaEmployee).toBe(1000); // 2% of 50,000
    expect(calc.totalEmployeeTaxes).toBe(4000);
  });

  it("should resolve survival floor settings correctly", () => {
    expect(TaxPolicyEngine.isSurvivalFloorEnabled()).toBe(true);
    expect(TaxPolicyEngine.isSurvivalFloorEnabled({ enable_survival_floor: false })).toBe(false);
    expect(TaxPolicyEngine.isSurvivalFloorEnabled({ payroll: { enable_survival_floor: false } })).toBe(false);

    expect(TaxPolicyEngine.getSurvivalFloorAmount()).toBe(15000);
    expect(TaxPolicyEngine.getSurvivalFloorAmount({ survival_floor_htg: 20000 })).toBe(20000);
    expect(TaxPolicyEngine.getSurvivalFloorAmount({ payroll: { survival_floor_htg: 25000 } })).toBe(25000);
  });

  it("should resolve attendance requirement correctly", () => {
    expect(TaxPolicyEngine.isAttendanceRequiredForPayroll()).toBe(true);
    expect(TaxPolicyEngine.isAttendanceRequiredForPayroll({ require_attendance_for_payroll: false })).toBe(false);
    expect(TaxPolicyEngine.isAttendanceRequiredForPayroll({ payroll: { require_attendance_for_payroll: false } })).toBe(false);
  });
});
