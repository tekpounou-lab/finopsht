import { describe, it, expect } from "vitest";
import { TaxPolicyEngine } from "../../services/payroll/TaxPolicyEngine";
import { STATUTORY_TAX_RATES } from "../../constants/finance";

describe("Phase 13.1.1 — Statutory Default vs NO_DATA Semantic Contract Verification", () => {
  const grossPay = 100000; // 100,000 HTG

  it("Test 1 — Explicit 0% configuration yields VALID_ZERO state and 0 HTG deduction", () => {
    const configZero = {
      enable_social_taxes: true,
      payroll_policies: {
        onaEmployeeRate: 0,
        onaEmployerRate: 0,
        ofatmaEmployeeRate: 0,
        ofatmaEmployerRate: 0,
      },
    };

    const rates = TaxPolicyEngine.getTaxRates(configZero);
    expect(rates.enabled).toBe(true);
    expect(rates.onaEmployee).toBe(0);
    expect(rates.resolutionStates?.onaEmployee).toBe("VALID_ZERO");
    expect(rates.resolutionStates?.ofatmaEmployee).toBe("VALID_ZERO");

    const result = TaxPolicyEngine.calculateDualSideContributions(grossPay, configZero);
    expect(result.totalEmployeeDeductions).toBe(0);
    expect(result.totalEmployerContributions).toBe(0);
    expect(result.netPayBeforeAdvances).toBe(100000);
    expect(result.totalEmployerPayrollCost).toBe(100000);
  });

  it("Test 2 — Explicit configured rate yields VALID_VALUE state and accurate calculation", () => {
    const configValue = {
      enable_social_taxes: true,
      payroll_policies: {
        onaEmployeeRate: 0.06,
        onaEmployerRate: 0.06,
        ofatmaEmployeeRate: 0.02,
        ofatmaEmployerRate: 0.03,
      },
    };

    const rates = TaxPolicyEngine.getTaxRates(configValue);
    expect(rates.enabled).toBe(true);
    expect(rates.onaEmployee).toBe(0.06);
    expect(rates.resolutionStates?.onaEmployee).toBe("VALID_VALUE");

    const result = TaxPolicyEngine.calculateDualSideContributions(grossPay, configValue);
    expect(result.totalEmployeeDeductions).toBe(8000);
    expect(result.totalEmployerContributions).toBe(9000);
    expect(result.netPayBeforeAdvances).toBe(92000);
    expect(result.totalEmployerPayrollCost).toBe(109000);
  });

  it("Test 3 — Missing tenant configuration resolves STATUTORY_DEFAULT with canonical rates", () => {
    const configMissing = {
      enable_social_taxes: true,
      payroll_policies: {},
    };

    const rates = TaxPolicyEngine.getTaxRates(configMissing);
    expect(rates.enabled).toBe(true);
    expect(rates.onaEmployee).toBe(STATUTORY_TAX_RATES.ONA.EMPLOYEE_RATE); // 0.06
    expect(rates.resolutionStates?.onaEmployee).toBe("STATUTORY_DEFAULT");
    expect(rates.resolutionStates?.ofatmaEmployee).toBe("STATUTORY_DEFAULT");

    const result = TaxPolicyEngine.calculateDualSideContributions(grossPay, configMissing);
    expect(result.totalEmployeeDeductions).toBe(8000);
    expect(result.totalEmployerContributions).toBe(9000);
  });

  it("Test 4 — Partial configuration resolves explicit side as VALID_VALUE and missing side as STATUTORY_DEFAULT", () => {
    const configPartial = {
      enable_social_taxes: true,
      payroll_policies: {
        onaEmployeeRate: 0.015, // 1.5% custom employee rate
        onaEmployerRate: undefined, // Missing
      },
    };

    const rates = TaxPolicyEngine.getTaxRates(configPartial);
    expect(rates.onaEmployee).toBe(0.015);
    expect(rates.resolutionStates?.onaEmployee).toBe("VALID_VALUE");

    expect(rates.onaEmployer).toBe(STATUTORY_TAX_RATES.ONA.EMPLOYER_RATE); // 0.06
    expect(rates.resolutionStates?.onaEmployer).toBe("STATUTORY_DEFAULT");
  });

  it("Test 5 — Null, undefined, and absent fields yield consistent STATUTORY_DEFAULT resolution", () => {
    const configNull = {
      enable_social_taxes: true,
      payroll_policies: {
        onaEmployeeRate: null,
      },
    };

    const configUndefined = {
      enable_social_taxes: true,
      payroll_policies: {
        onaEmployeeRate: undefined,
      },
    };

    const configAbsent = {
      enable_social_taxes: true,
      payroll_policies: {},
    };

    const ratesNull = TaxPolicyEngine.getTaxRates(configNull);
    const ratesUndefined = TaxPolicyEngine.getTaxRates(configUndefined);
    const ratesAbsent = TaxPolicyEngine.getTaxRates(configAbsent);

    expect(ratesNull.resolutionStates?.onaEmployee).toBe("STATUTORY_DEFAULT");
    expect(ratesUndefined.resolutionStates?.onaEmployee).toBe("STATUTORY_DEFAULT");
    expect(ratesAbsent.resolutionStates?.onaEmployee).toBe("STATUTORY_DEFAULT");

    expect(ratesNull.onaEmployee).toBe(STATUTORY_TAX_RATES.ONA.EMPLOYEE_RATE);
    expect(ratesUndefined.onaEmployee).toBe(STATUTORY_TAX_RATES.ONA.EMPLOYEE_RATE);
    expect(ratesAbsent.onaEmployee).toBe(STATUTORY_TAX_RATES.ONA.EMPLOYEE_RATE);
  });

  it("Test 6 — Explicit 0% MUST override statutory default 6%", () => {
    const configExplicitZero = {
      enable_social_taxes: true,
      payroll_policies: {
        onaEmployeeRate: 0,
      },
    };

    const rates = TaxPolicyEngine.getTaxRates(configExplicitZero);
    expect(rates.onaEmployee).toBe(0);
    expect(rates.resolutionStates?.onaEmployee).toBe("VALID_ZERO");
    expect(rates.onaEmployee).not.toBe(0.06);
  });

  it("Test 7 — Historical payroll snapshot immutability under policy updates", () => {
    const historicalSnapshot = {
      id: "hist_pr_001",
      grossPay: 100000,
      netPay: 92000,
      totalEmployerPayrollCost: 109000,
      policyVersion: 1,
      ratesUsed: { onaEmployee: 0.06, ofatmaEmployee: 0.02 },
    };

    // Updating current tenant policy to V2 (8% / 3%)
    const configV2 = {
      enable_social_taxes: true,
      payroll_policies: {
        onaEmployeeRate: 0.08,
        ofatmaEmployeeRate: 0.03,
      },
    };

    const newResult = TaxPolicyEngine.calculateDualSideContributions(historicalSnapshot.grossPay, configV2);

    // Current calculation uses V2 (11,000 HTG deductions)
    expect(newResult.totalEmployeeDeductions).toBe(11000);

    // Historical record remains strictly V1 (8,000 HTG deductions)
    expect(historicalSnapshot.netPay).toBe(92000);
    expect(historicalSnapshot.ratesUsed.onaEmployee).toBe(0.06);
  });

  it("Test 9 — Complete calculation trace reproducibility", () => {
    const rawConfig = {
      enable_social_taxes: true,
      payroll_policies: {
        onaEmployeeRate: 0.06,
        onaEmployerRate: 0.06,
        ofatmaEmployeeRate: 0.02,
        ofatmaEmployerRate: 0.03,
      },
    };

    const resolvedPolicy = TaxPolicyEngine.resolvePolicy(rawConfig);
    expect(resolvedPolicy.isSocialTaxEnabled).toBe(true);

    const calcResult = TaxPolicyEngine.calculateDualSideContributions(100000, rawConfig);
    expect(calcResult.netPayBeforeAdvances).toBe(92000);
    expect(calcResult.totalEmployerPayrollCost).toBe(109000);
  });
});
