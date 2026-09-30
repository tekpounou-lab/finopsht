import { describe, it, expect } from "vitest";
import { TaxPolicyEngine } from "../../services/payroll/TaxPolicyEngine";
import { calculateTaxDeductions, calculateEmployeePayrollItem } from "../../components/payroll/services/PayrollCalculationEngine";

describe("PHASE 13 — Dual-Side Payroll Contributions & Insurance SSOT", () => {
  it("Golden Regression Scenario: Employee vs Employer Dual-Side Separation", () => {
    const grossHtg = 100000;
    const policyConfig = {
      enable_social_taxes: true,
      enableTaxes: true,
      // Statutory rates zeroed out to isolate custom insurance rule
      onaEmployeeRate: 0,
      onaEmployerRate: 0,
      ofatmaEmployeeRate: 0,
      ofatmaEmployerRate: 0,
      additionalTaxes: [
        {
          id: "rule_health_insurance",
          name: "Health Insurance",
          category: "INSURANCE",
          employeeRate: 1.5,
          employerRate: 2.5,
          enabled: true,
          calculationBase: "GROSS_PAY"
        }
      ]
    };

    const result = TaxPolicyEngine.calculateDualSideContributions(grossHtg, policyConfig);

    // 1. Employee contribution = 1,500 HTG
    expect(result.totalEmployeeDeductions).toBe(1500);

    // 2. Employer contribution = 2,500 HTG
    expect(result.totalEmployerContributions).toBe(2500);

    // 3. Employee contribution != Employer contribution
    expect(result.totalEmployeeDeductions).not.toBe(result.totalEmployerContributions);

    // 4. Net before other deductions = 98,500 HTG (Gross - Employee portion)
    expect(result.netPayBeforeAdvances).toBe(98500);

    // 5. Total Employer Payroll Cost = 102,500 HTG (Gross + Employer portion)
    expect(result.totalEmployerPayrollCost).toBe(102500);

    // 6. Invariant: Employer contribution DOES NOT reduce net pay
    expect(grossHtg - result.totalEmployerContributions).not.toBe(result.netPayBeforeAdvances);
  });

  it("Multiple Contributions: Health Insurance + Retirement", () => {
    const grossHtg = 100000;
    const policyConfig = {
      enable_social_taxes: true,
      onaEmployeeRate: 0,
      onaEmployerRate: 0,
      ofatmaEmployeeRate: 0,
      ofatmaEmployerRate: 0,
      additionalTaxes: [
        {
          id: "rule_health_insurance",
          name: "Health Insurance",
          category: "INSURANCE",
          employeeRate: 1.5,
          employerRate: 2.5,
          enabled: true
        },
        {
          id: "rule_retirement",
          name: "Retirement",
          category: "RETIREMENT",
          employeeRate: 2.0,
          employerRate: 3.0,
          enabled: true
        }
      ]
    };

    const result = TaxPolicyEngine.calculateDualSideContributions(grossHtg, policyConfig);

    // Employee Total = 1.5% + 2.0% = 3.5% of 100,000 = 3,500 HTG
    expect(result.totalEmployeeDeductions).toBe(3500);

    // Employer Total = 2.5% + 3.0% = 5.5% of 100,000 = 5,500 HTG
    expect(result.totalEmployerContributions).toBe(5500);

    // Net Pay = 96,500 HTG
    expect(result.netPayBeforeAdvances).toBe(96500);

    // Employer Payroll Cost = 105,500 HTG
    expect(result.totalEmployerPayrollCost).toBe(105500);
  });

  it("Policy Change Regression & Historical Cycle Immutability", () => {
    const grossHtg = 100000;

    // Cycle A under Policy V1
    const policyV1 = {
      enable_social_taxes: true,
      onaEmployeeRate: 0,
      onaEmployerRate: 0,
      ofatmaEmployeeRate: 0,
      ofatmaEmployerRate: 0,
      additionalTaxes: [
        { id: "health", name: "Health", category: "INSURANCE", employeeRate: 1.5, employerRate: 2.5, enabled: true }
      ]
    };

    const itemA = calculateEmployeePayrollItem(
      {
        baseSalaryHTG: grossHtg,
        overtimeHours150: 0,
        overtimeHours200: 0,
        hourlyRateHTG: 100,
        bonusesHTG: 0,
        commissionsHTG: 0,
        advancesHTG: 0
      },
      "BIZ_TEST",
      "EMP_001",
      "2026-09-01",
      policyV1 as any
    );

    expect(itemA.taxDeductions.employeeContributionsTotal).toBe(1500);
    expect(itemA.taxDeductions.employerContributionsTotal).toBe(2500);
    expect(itemA.netPay).toBe(98500);
    expect(itemA.taxDeductions.totalEmployerCost).toBe(102500);

    // Policy changed to Policy V2
    const policyV2 = {
      enable_social_taxes: true,
      onaEmployeeRate: 0,
      onaEmployerRate: 0,
      ofatmaEmployeeRate: 0,
      ofatmaEmployerRate: 0,
      additionalTaxes: [
        { id: "health", name: "Health", category: "INSURANCE", employeeRate: 2.0, employerRate: 3.0, enabled: true }
      ]
    };

    const itemB = calculateEmployeePayrollItem(
      {
        baseSalaryHTG: grossHtg,
        overtimeHours150: 0,
        overtimeHours200: 0,
        hourlyRateHTG: 100,
        bonusesHTG: 0,
        commissionsHTG: 0,
        advancesHTG: 0
      },
      "BIZ_TEST",
      "EMP_001",
      "2026-10-01",
      policyV2 as any
    );

    expect(itemB.taxDeductions.employeeContributionsTotal).toBe(2000);
    expect(itemB.taxDeductions.employerContributionsTotal).toBe(3000);
    expect(itemB.netPay).toBe(98000);
    expect(itemB.taxDeductions.totalEmployerCost).toBe(103000);

    // Re-verify Cycle A item remains unchanged (immutable)
    expect(itemA.netPay).toBe(98500);
    expect(itemA.taxDeductions.totalEmployerCost).toBe(102500);
  });

  it("Taxes ON / OFF Regression Semantics", () => {
    const grossHtg = 100000;
    const policyON = {
      enable_social_taxes: true,
      additionalTaxes: [
        { id: "health", name: "Health", category: "INSURANCE", employeeRate: 1.5, employerRate: 2.5, enabled: true }
      ]
    };

    const resON = TaxPolicyEngine.calculateDualSideContributions(grossHtg, policyON);
    expect(resON.totalEmployeeDeductions).toBeGreaterThan(0);
    expect(resON.totalEmployerContributions).toBeGreaterThan(0);

    // Switch OFF
    const policyOFF = {
      ...policyON,
      enable_social_taxes: false
    };

    const resOFF = TaxPolicyEngine.calculateDualSideContributions(grossHtg, policyOFF);
    expect(resOFF.totalEmployeeDeductions).toBe(0);
    expect(resOFF.totalEmployerContributions).toBe(0);
    expect(resOFF.netPayBeforeAdvances).toBe(grossHtg);
    expect(resOFF.totalEmployerPayrollCost).toBe(grossHtg);

    // Verify stored configuration was preserved and not destroyed
    expect(policyOFF.additionalTaxes.length).toBe(1);
    expect(policyOFF.additionalTaxes[0].employeeRate).toBe(1.5);
  });

  it("Missing Policy Value Semantics (No Fake Default Fallbacks)", () => {
    const grossHtg = 100000;
    const policyWithMissingRate = {
      enable_social_taxes: true,
      onaEmployeeRate: 0,
      onaEmployerRate: 0,
      ofatmaEmployeeRate: 0,
      ofatmaEmployerRate: 0,
      additionalTaxes: [
        {
          id: "rule_custom",
          name: "Custom Rule",
          category: "OTHER",
          // employeeRate and employerRate intentionally undefined
          enabled: true
        }
      ]
    };

    const result = TaxPolicyEngine.calculateDualSideContributions(grossHtg, policyWithMissingRate);

    // Must yield 0, MUST NOT invent 5%, 10%, or 17%
    expect(result.totalEmployeeDeductions).toBe(0);
    expect(result.totalEmployerContributions).toBe(0);
    expect(result.netPayBeforeAdvances).toBe(grossHtg);
    expect(result.totalEmployerPayrollCost).toBe(grossHtg);
  });
});
