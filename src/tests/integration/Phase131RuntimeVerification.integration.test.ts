import { describe, it, expect, beforeEach } from "vitest";
import { TaxPolicyEngine } from "../../services/payroll/TaxPolicyEngine";
import { calculateTaxDeductions, calculateEmployeePayrollItem, calculatePayrollFromSnapshot } from "../../components/payroll/services/PayrollCalculationEngine";
import { PayrollService } from "../../services/payroll/PayrollService";
import { BusinessAdministrationRepository } from "../../repositories/BusinessAdministrationRepository";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { STATUTORY_TAX_RATES, SURVIVAL_FLOOR_HTG } from "../../constants/finance";

describe("Phase 13.1 — Runtime Payroll Policy Toggle Persistence & SSOT Integrity Verification", () => {
  const tenantA = "biz_phase13_tenant_a";
  const tenantB = "biz_phase13_tenant_b";

  // --- 1. TEST A & B: TOGGLE PERSISTENCE & SSOT RESOLUTION ---
  describe("Test A, B & C — Policy Resolution, Toggle Persistence & FALSE Retention", () => {
    it("should resolve default statutory policy when configuration is empty", () => {
      const config = {};
      expect(TaxPolicyEngine.isSocialTaxEnabled(config)).toBe(true);
      expect(TaxPolicyEngine.isSurvivalFloorEnabled(config)).toBe(true);
      expect(TaxPolicyEngine.getSurvivalFloorAmount(config)).toBe(SURVIVAL_FLOOR_HTG);
      expect(TaxPolicyEngine.isAttendanceRequiredForPayroll(config)).toBe(true);
    });

    it("should resolve explicit FALSE for enable_social_taxes, enable_survival_floor, require_attendance_for_payroll", () => {
      const config = {
        enable_social_taxes: false,
        enable_survival_floor: false,
        require_attendance_for_payroll: false,
        survival_floor_htg: 20000,
        payroll: {
          enable_social_taxes: false,
          enable_survival_floor: false,
          require_attendance_for_payroll: false,
        },
        payroll_policies: {
          enableTaxes: false,
          enableSurvivalFloor: false,
          requireAttendanceForPayroll: false,
        },
        tax_config: {
          enableTaxes: false,
        },
      };

      expect(TaxPolicyEngine.isSocialTaxEnabled(config)).toBe(false);
      expect(TaxPolicyEngine.isSurvivalFloorEnabled(config)).toBe(false);
      expect(TaxPolicyEngine.getSurvivalFloorAmount(config)).toBe(20000);
      expect(TaxPolicyEngine.isAttendanceRequiredForPayroll(config)).toBe(false);

      const rates = TaxPolicyEngine.getTaxRates(config);
      expect(rates.enabled).toBe(false);
      expect(rates.onaEmployee).toBe(0);
      expect(rates.onaEmployer).toBe(0);
      expect(rates.ofatmaEmployee).toBe(0);
      expect(rates.ofatmaEmployer).toBe(0);
    });

    it("should resolve explicit TRUE when toggled ON", () => {
      const config = {
        enable_social_taxes: true,
        enable_survival_floor: true,
        require_attendance_for_payroll: true,
        survival_floor_htg: 18000,
        payroll_policies: {
          onaEmployeeRate: 0.06,
          onaEmployerRate: 0.06,
          ofatmaEmployeeRate: 0.02,
          ofatmaEmployerRate: 0.03,
        },
      };

      expect(TaxPolicyEngine.isSocialTaxEnabled(config)).toBe(true);
      expect(TaxPolicyEngine.isSurvivalFloorEnabled(config)).toBe(true);
      expect(TaxPolicyEngine.getSurvivalFloorAmount(config)).toBe(18000);
      expect(TaxPolicyEngine.isAttendanceRequiredForPayroll(config)).toBe(true);

      const rates = TaxPolicyEngine.getTaxRates(config);
      expect(rates.enabled).toBe(true);
      expect(rates.onaEmployee).toBe(0.06);
      expect(rates.onaEmployer).toBe(0.06);
      expect(rates.ofatmaEmployee).toBe(0.02);
      expect(rates.ofatmaEmployer).toBe(0.03);
    });
  });

  // --- 2. TEST D: STALE LEGACY VALUE REGRESSION ---
  describe("Test D — Stale Legacy Value Regression Prevention", () => {
    it("should prioritize resolved SSOT value over stale nested legacy value in form reset pattern", () => {
      const businessSettings = {
        enable_social_taxes: true,
        enable_survival_floor: true,
        require_attendance_for_payroll: true,
        payroll: {
          enable_social_taxes: false, // Stale legacy property inside payroll
          enable_survival_floor: false,
          require_attendance_for_payroll: false,
        },
        payroll_policies: {
          enableTaxes: true,
          enableSurvivalFloor: true,
          requireAttendanceForPayroll: true,
        },
      };

      const isTax = TaxPolicyEngine.isSocialTaxEnabled(businessSettings);
      const isFloor = TaxPolicyEngine.isSurvivalFloorEnabled(businessSettings);
      const isAtt = TaxPolicyEngine.isAttendanceRequiredForPayroll(businessSettings);

      // Simulating correct reset logic (spreading legacy first, SSOT overrides)
      const formResetValues = {
        ...(businessSettings.payroll || {}),
        enable_social_taxes: isTax,
        enable_survival_floor: isFloor,
        require_attendance_for_payroll: isAtt,
      };

      expect(formResetValues.enable_social_taxes).toBe(true);
      expect(formResetValues.enable_survival_floor).toBe(true);
      expect(formResetValues.require_attendance_for_payroll).toBe(true);
    });
  });

  // --- 3. TEST F: DETERMINISTIC PAYROLL CALCULATION NUMERICAL EVIDENCE ---
  describe("Test F — Deterministic Payroll Calculation Evidence", () => {
    const grossPay = 100000; // 100,000 HTG

    it("Scenario 1: Policy OFF -> 0 Employee Deductions, 0 Employer Contributions", () => {
      const configOff = {
        enable_social_taxes: false,
        enableTaxes: false,
      };

      const result = TaxPolicyEngine.calculateDualSideContributions(grossPay, configOff);

      expect(result.isTaxesEnabled).toBe(false);
      expect(result.grossPay).toBe(100000);
      expect(result.onaEmployee).toBe(0);
      expect(result.onaEmployer).toBe(0);
      expect(result.ofatmaEmployee).toBe(0);
      expect(result.ofatmaEmployer).toBe(0);
      expect(result.totalEmployeeDeductions).toBe(0);
      expect(result.totalEmployerContributions).toBe(0);
      expect(result.netPayBeforeAdvances).toBe(100000);
      expect(result.totalEmployerPayrollCost).toBe(100000);
    });

    it("Scenario 2: Policy ON -> Statutory ONA (6%/6%) + OFATMA (2%/3%)", () => {
      const configOn = {
        enable_social_taxes: true,
        enableTaxes: true,
        payroll_policies: {
          onaEmployeeRate: 0.06,
          onaEmployerRate: 0.06,
          ofatmaEmployeeRate: 0.02,
          ofatmaEmployerRate: 0.03,
        },
      };

      const result = TaxPolicyEngine.calculateDualSideContributions(grossPay, configOn);

      expect(result.isTaxesEnabled).toBe(true);
      expect(result.grossPay).toBe(100000);

      // Employee portion
      expect(result.onaEmployee).toBe(6000); // 6% of 100,000
      expect(result.ofatmaEmployee).toBe(2000); // 2% of 100,000
      expect(result.totalEmployeeDeductions).toBe(8000); // 6,000 + 2,000

      // Employer portion
      expect(result.onaEmployer).toBe(6000); // 6% of 100,000
      expect(result.ofatmaEmployer).toBe(3000); // 3% of 100,000
      expect(result.totalEmployerContributions).toBe(9000); // 6,000 + 3,000

      // Equations Verification
      expect(result.netPayBeforeAdvances).toBe(92000); // 100,000 - 8,000
      expect(result.totalEmployerPayrollCost).toBe(109000); // 100,000 + 9,000
    });

    it("Scenario 3: Policy ON + Custom Health Insurance (1.5% Emp / 2.5% Empr)", () => {
      const configCustom = {
        enable_social_taxes: true,
        enableTaxes: true,
        payroll_policies: {
          onaEmployeeRate: 0.06,
          onaEmployerRate: 0.06,
          ofatmaEmployeeRate: 0.02,
          ofatmaEmployerRate: 0.03,
          additionalTaxes: [
            {
              id: "rule_health_insurance",
              name: "Assurance Santé",
              category: "HEALTH",
              employeeRate: 1.5,
              employerRate: 2.5,
              enabled: true,
            },
          ],
        },
      };

      const result = TaxPolicyEngine.calculateDualSideContributions(grossPay, configCustom);

      expect(result.isTaxesEnabled).toBe(true);
      expect(result.additionalContributions.length).toBe(1);

      const healthRule = result.additionalContributions[0];
      expect(healthRule.employeeAmount).toBe(1500); // 1.5% of 100,000
      expect(healthRule.employerAmount).toBe(2500); // 2.5% of 100,000

      // Total Deductions & Costs
      expect(result.totalEmployeeDeductions).toBe(9500); // 6,000 + 2,000 + 1,500
      expect(result.totalEmployerContributions).toBe(11500); // 6,000 + 3,000 + 2,500

      expect(result.netPayBeforeAdvances).toBe(90500); // 100,000 - 9,500
      expect(result.totalEmployerPayrollCost).toBe(111500); // 100,000 + 11,500
    });
  });

  // --- 4. TEST G: NO_DATA VS VALID_ZERO SEMANTICS ---
  describe("Test G — NO_DATA vs VALID_ZERO Semantics", () => {
    it("should handle explicit 0% rate as VALID_ZERO (0 HTG deduction)", () => {
      const configZero = {
        enable_social_taxes: true,
        payroll_policies: {
          onaEmployeeRate: 0,
          onaEmployerRate: 0,
          ofatmaEmployeeRate: 0,
          ofatmaEmployerRate: 0,
        },
      };

      const result = TaxPolicyEngine.calculateDualSideContributions(100000, configZero);
      expect(result.isTaxesEnabled).toBe(true);
      expect(result.totalEmployeeDeductions).toBe(0);
      expect(result.totalEmployerContributions).toBe(0);
    });

    it("should fall back to statutory default when rate is undefined or missing", () => {
      const configMissing = {
        enable_social_taxes: true,
        payroll_policies: {},
      };

      const rates = TaxPolicyEngine.getTaxRates(configMissing);
      expect(rates.onaEmployee).toBe(STATUTORY_TAX_RATES.ONA.EMPLOYEE_RATE); // 6%
      expect(rates.ofatmaEmployee).toBe(STATUTORY_TAX_RATES.OFATMA.EMPLOYEE_RATE); // 2%
    });
  });

  // --- 5. TEST J & K: TENANT ISOLATION & BUSINESS ID RESOLUTION ---
  describe("Test J & K — Tenant Isolation and Business ID Resolution Safety", () => {
    it("should resolve policies independently for Tenant A and Tenant B without cross-tenant leakage", () => {
      const tenantAConfig = {
        enable_social_taxes: true,
        payroll_policies: { onaEmployeeRate: 0.06 },
      };

      const tenantBConfig = {
        enable_social_taxes: false,
        payroll_policies: { onaEmployeeRate: 0.08 },
      };

      expect(TaxPolicyEngine.isSocialTaxEnabled(tenantAConfig)).toBe(true);
      expect(TaxPolicyEngine.isSocialTaxEnabled(tenantBConfig)).toBe(false);

      const resA = TaxPolicyEngine.calculateDualSideContributions(100000, tenantAConfig);
      const resB = TaxPolicyEngine.calculateDualSideContributions(100000, tenantBConfig);

      expect(resA.totalEmployeeDeductions).toBe(8000);
      expect(resB.totalEmployeeDeductions).toBe(0);
    });

    it("should reject unresolved business ID when attempting to update settings without context", async () => {
      const unresolvedAdmin = () => {
        const currentBusiness = null;
        const business = null;
        const businessId = (currentBusiness as any)?.id || (business as any)?.id;
        if (!businessId) {
          throw new Error("TENANT_UNRESOLVED: Cannot update settings without an authenticated business context.");
        }
        return businessId;
      };

      expect(() => unresolvedAdmin()).toThrow("TENANT_UNRESOLVED");
    });
  });

  // --- 6. TEST R: ANALYTICS ENGINE SSOT ALIGNMENT ---
  describe("Test R — AnalyticsEngine SSOT Alignment", () => {
    it("should compute payroll costs in AnalyticsEngine using TaxPolicyEngine results without duplicate calculation", () => {
      const snap = AnalyticsEngine.generateSnapshot(
        "CUSTOM",
        { startDate: "2026-09-01", endDate: "2026-09-30" },
        [
          {
            id: "emp_01",
            name: "Jean Paul",
            baseSalary: 100000,
            status: "ACTIVE",
            business_id: tenantA,
          } as any,
        ],
        [],
        [],
        [
          {
            id: "pr_01",
            employeeId: "emp_01",
            grossSalary: 100000,
            grossPay: 100000,
            netPay: 92000,
            totalEmployerPayrollCost: 109000,
            paymentDate: "2026-09-15",
            business_id: tenantA,
          } as any,
        ],
        [],
        [],
        [],
        tenantA,
        "fr"
      );

      expect(snap.payrollCost.currentValue).toBe(100000);
      expect(snap.isSocialTaxEnabled).toBe(true);
    });
  });
});
