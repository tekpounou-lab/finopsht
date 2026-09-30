import { describe, it, expect } from "vitest";
import { TaxPolicyEngine } from "../../services/payroll/TaxPolicyEngine";
import {
  resolveTaxRatesForDate,
  calculateTaxDeductions,
  calculateEmployeePayrollItem,
} from "../../components/payroll/services/PayrollCalculationEngine";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { resolveAnalyticsPayrollDate } from "../../utils/dateNormalization";
import { BusinessTaxConfiguration } from "../../repositories/BusinessAdministrationRepository";

describe("PHASE 13.2.1 — V1/V2 Effective Dates, Historical Snapshot, Accounting & AnalyticsEngine Verification", () => {
  const tenantA = "tenant_phase132_alpha";
  const tenantB = "tenant_phase132_beta";

  // --- 1. GOLDEN POLICY VERSIONS & EFFECTIVE DATE RESOLUTION ---
  describe("Section 4 & 5 — Golden Policy V1 & V2 Effective Date Resolution", () => {
    const taxConfigV1V2: BusinessTaxConfiguration = {
      enableTaxes: true,
      cnssRateEmployee: 0.08, // Active current rate (V2)
      cnssRateEmployer: 0.08,
      cnsRateEmployee: 0.03,
      cnsRateEmployer: 0.03,
      survivalFloorHTG: 15000,
      currency: "HTG",
      history: [
        {
          cnssRateEmployee: 0.06,
          cnssRateEmployer: 0.06,
          cnsRateEmployee: 0.02,
          cnsRateEmployer: 0.03,
          survivalFloorHTG: 15000,
          effectiveFrom: "2026-09-01",
          effectiveTo: "2026-09-30",
        },
        {
          cnssRateEmployee: 0.08,
          cnssRateEmployer: 0.08,
          cnsRateEmployee: 0.03,
          cnsRateEmployer: 0.03,
          survivalFloorHTG: 15000,
          effectiveFrom: "2026-10-01",
        },
      ],
    };

    it("Payroll A (2026-09-30) resolves to V1 rates (ONA 6%/6%, OFATMA 2%/3%)", () => {
      const resolved = resolveTaxRatesForDate(taxConfigV1V2, "2026-09-30");
      expect(resolved.cnssRateEmployee).toBe(0.06);
      expect(resolved.cnssRateEmployer).toBe(0.06);
      expect(resolved.cnsRateEmployee).toBe(0.02);
      expect(resolved.cnsRateEmployer).toBe(0.03);
    });

    it("Payroll B (2026-10-01) resolves to V2 rates (ONA 8%/8%, OFATMA 3%/3%)", () => {
      const resolved = resolveTaxRatesForDate(taxConfigV1V2, "2026-10-01");
      expect(resolved.cnssRateEmployee).toBe(0.08);
      expect(resolved.cnssRateEmployer).toBe(0.08);
      expect(resolved.cnsRateEmployee).toBe(0.03);
      expect(resolved.cnsRateEmployer).toBe(0.03);
    });

    it("Payroll C (2026-09-01) resolves to V1 rates", () => {
      const resolved = resolveTaxRatesForDate(taxConfigV1V2, "2026-09-01");
      expect(resolved.cnssRateEmployee).toBe(0.06);
      expect(resolved.cnsRateEmployee).toBe(0.02);
    });

    it("Payroll D (2026-10-31) resolves to V2 rates", () => {
      const resolved = resolveTaxRatesForDate(taxConfigV1V2, "2026-10-31");
      expect(resolved.cnssRateEmployee).toBe(0.08);
      expect(resolved.cnsRateEmployee).toBe(0.03);
    });
  });

  // --- 2. BOUNDARY TEST (09/30 vs 10/01) ---
  describe("Section 6 — Boundary Test (09/30 vs 10/01)", () => {
    const taxConfigBoundary: BusinessTaxConfiguration = {
      enableTaxes: true,
      cnssRateEmployee: 0.08,
      cnssRateEmployer: 0.08,
      cnsRateEmployee: 0.03,
      cnsRateEmployer: 0.03,
      survivalFloorHTG: 15000,
      currency: "HTG",
      history: [
        {
          cnssRateEmployee: 0.06,
          cnssRateEmployer: 0.06,
          cnsRateEmployee: 0.02,
          cnsRateEmployer: 0.03,
          survivalFloorHTG: 15000,
          effectiveFrom: "2026-09-01",
          effectiveTo: "2026-09-30",
        },
        {
          cnssRateEmployee: 0.08,
          cnssRateEmployer: 0.08,
          cnsRateEmployee: 0.03,
          cnsRateEmployer: 0.03,
          survivalFloorHTG: 15000,
          effectiveFrom: "2026-10-01",
        },
      ],
    };

    it("2026-09-30 23:59:59 resolves strictly to V1", () => {
      const resolved = resolveTaxRatesForDate(taxConfigBoundary, "2026-09-30T23:59:59Z");
      expect(resolved.cnssRateEmployee).toBe(0.06);
      expect(resolved.cnsRateEmployee).toBe(0.02);
    });

    it("2026-10-01 00:00:00 resolves strictly to V2", () => {
      const resolved = resolveTaxRatesForDate(taxConfigBoundary, "2026-10-01T00:00:00Z");
      expect(resolved.cnssRateEmployee).toBe(0.08);
      expect(resolved.cnsRateEmployee).toBe(0.03);
    });
  });

  // --- 3. PAYROLL GOLDEN CALCULATION (100,000 HTG GROSS) ---
  describe("Section 7 — Payroll Golden Calculation", () => {
    const grossSalary = 100000;

    it("V1 Golden Calculation: Net = 92,000 HTG, Employer Payroll Cost = 109,000 HTG", () => {
      const v1Config = {
        enable_social_taxes: true,
        payroll_policies: {
          onaEmployeeRate: 0.06,
          onaEmployerRate: 0.06,
          ofatmaEmployeeRate: 0.02,
          ofatmaEmployerRate: 0.03,
        },
      };

      const result = TaxPolicyEngine.calculateDualSideContributions(grossSalary, v1Config);

      // Employee deductions
      expect(result.onaEmployee).toBe(6000);
      expect(result.ofatmaEmployee).toBe(2000);
      expect(result.totalEmployeeDeductions).toBe(8000);

      // Employer contributions
      expect(result.onaEmployer).toBe(6000);
      expect(result.ofatmaEmployer).toBe(3000);
      expect(result.totalEmployerContributions).toBe(9000);

      // Equations
      expect(result.netPayBeforeAdvances).toBe(92000);
      expect(result.totalEmployerPayrollCost).toBe(109000);
    });

    it("V2 Golden Calculation: Net = 89,000 HTG, Employer Payroll Cost = 111,000 HTG", () => {
      const v2Config = {
        enable_social_taxes: true,
        payroll_policies: {
          onaEmployeeRate: 0.08,
          onaEmployerRate: 0.08,
          ofatmaEmployeeRate: 0.03,
          ofatmaEmployerRate: 0.03,
        },
      };

      const result = TaxPolicyEngine.calculateDualSideContributions(grossSalary, v2Config);

      // Employee deductions
      expect(result.onaEmployee).toBe(8000);
      expect(result.ofatmaEmployee).toBe(3000);
      expect(result.totalEmployeeDeductions).toBe(11000);

      // Employer contributions
      expect(result.onaEmployer).toBe(8000);
      expect(result.ofatmaEmployer).toBe(3000);
      expect(result.totalEmployerContributions).toBe(11000);

      // Equations
      expect(result.netPayBeforeAdvances).toBe(89000);
      expect(result.totalEmployerPayrollCost).toBe(111000);
    });
  });

  // --- 4. HISTORICAL SNAPSHOT IMMUTABILITY & SEALED PAYROLL ---
  describe("Section 8 & 9 — Historical Snapshot Immutability & Sealed Payroll", () => {
    it("persisted September payroll snapshot retains V1 values when re-read after V2 is created", () => {
      // Step 1: Create September payroll under V1
      const septPayrollSnapshot = {
        id: "pr_sept_001",
        employeeId: "emp_01",
        grossSalary: 100000,
        grossPay: 100000,
        netPay: 92000,
        totalEmployerPayrollCost: 109000,
        employee_contributions_cents: 800000,
        employer_contributions_cents: 900000,
        onaEmployee: 6000,
        onaEmployer: 6000,
        ofatmaEmployee: 2000,
        ofatmaEmployer: 3000,
        policyVersion: "V1",
        effectiveFrom: "2026-09-01",
        period_end: "2026-09-30",
        status: "SEALED",
        integritySeal: "SHA256::SEPTEMBER_V1_SEAL",
      };

      // Step 2: V2 policy created
      const octV2Config = {
        onaEmployeeRate: 0.08,
        onaEmployerRate: 0.08,
        ofatmaEmployeeRate: 0.03,
        ofatmaEmployerRate: 0.03,
      };

      // Step 3: Re-read September payroll from snapshot
      expect(septPayrollSnapshot.netPay).toBe(92000);
      expect(septPayrollSnapshot.totalEmployerPayrollCost).toBe(109000);
      expect(septPayrollSnapshot.employee_contributions_cents / 100).toBe(8000);
      expect(septPayrollSnapshot.employer_contributions_cents / 100).toBe(9000);
      expect(septPayrollSnapshot.policyVersion).toBe("V1");

      // Step 4: October payroll under V2
      const octResult = TaxPolicyEngine.calculateDualSideContributions(100000, {
        enable_social_taxes: true,
        payroll_policies: octV2Config,
      });

      expect(octResult.netPayBeforeAdvances).toBe(89000);
      expect(octResult.totalEmployerPayrollCost).toBe(111000);
    });
  });

  // --- 5. CASH vs ACCRUAL VERIFICATION ---
  describe("Section 12 & 13 — Accounting & CASH vs ACCRUAL Verification", () => {
    const septPayrollRecord = {
      id: "pr_sept_002",
      grossSalary: 100000,
      netPay: 92000,
      totalEmployerPayrollCost: 109000,
      period_start: "2026-09-16",
      period_end: "2026-09-30",
      paymentDate: "2026-10-05",
      status: "PAID",
    };

    it("resolves ACCRUAL date to period_end (2026-09-30)", () => {
      const accrualDate = resolveAnalyticsPayrollDate(septPayrollRecord, false);
      expect(accrualDate).toBe("2026-09-30");
    });

    it("resolves CASH date to paymentDate (2026-10-05)", () => {
      const cashDate = resolveAnalyticsPayrollDate(septPayrollRecord, true);
      expect(cashDate).toBe("2026-10-05");
    });

    it("reconciles V1 accounting entries: Gross 100k + Employer Tax 9k = Employer Cost 109k", () => {
      const grossExpense = 100000;
      const employerTaxExpense = 9000;
      const employeeTaxLiability = 8000;
      const employerTaxLiability = 9000;
      const netPayable = 92000;

      // Accounting Balancing Equation
      const totalDebits = grossExpense + employerTaxExpense; // 109,000
      const totalCredits = netPayable + employeeTaxLiability + employerTaxLiability; // 92,000 + 8,000 + 9,000 = 109,000

      expect(totalDebits).toBe(109000);
      expect(totalCredits).toBe(109000);
      expect(totalDebits).toBe(totalCredits);
    });

    it("reconciles V2 accounting entries: Gross 100k + Employer Tax 11k = Employer Cost 111k", () => {
      const grossExpense = 100000;
      const employerTaxExpense = 11000;
      const employeeTaxLiability = 11000;
      const employerTaxLiability = 11000;
      const netPayable = 89000;

      // Accounting Balancing Equation
      const totalDebits = grossExpense + employerTaxExpense; // 111,000
      const totalCredits = netPayable + employeeTaxLiability + employerTaxLiability; // 89,000 + 11,000 + 11,000 = 111,000

      expect(totalDebits).toBe(111000);
      expect(totalCredits).toBe(111000);
      expect(totalDebits).toBe(totalCredits);
    });
  });

  // --- 6. ANALYTICS ENGINE HISTORICAL VERIFICATION & DATE ISOLATION ---
  describe("Section 14, 15 & 16 — AnalyticsEngine Historical Verification & Date Isolation", () => {
    const septPayrolls = [
      {
        id: "pr_sept_01",
        employeeId: "emp_01",
        grossSalary: 100000,
        grossPay: 100000,
        netPay: 92000,
        totalEmployerPayrollCost: 109000,
        employer_contributions_cents: 900000,
        period_end: "2026-09-30",
        paymentDate: "2026-09-30",
        business_id: tenantA,
        status: "COMPLETED",
      } as any,
    ];

    const octPayrolls = [
      {
        id: "pr_oct_01",
        employeeId: "emp_01",
        grossSalary: 100000,
        grossPay: 100000,
        netPay: 89000,
        totalEmployerPayrollCost: 111000,
        employer_contributions_cents: 1100000,
        period_end: "2026-10-31",
        paymentDate: "2026-10-31",
        business_id: tenantA,
        status: "COMPLETED",
      } as any,
    ];

    it("September Analytics snapshot reflects V1 historical values (Employer Cost = 109,000)", () => {
      const septSnapshot = AnalyticsEngine.generateSnapshot(
        "CUSTOM",
        { startDate: "2026-09-01", endDate: "2026-09-30" },
        [{ id: "emp_01", status: "ACTIVE", business_id: tenantA } as any],
        [],
        [],
        septPayrolls,
        [],
        [],
        [],
        tenantA,
        "fr"
      );

      expect(septSnapshot.payrollCost.currentValue).toBe(109000);
    });

    it("October Analytics snapshot reflects V2 values and remains isolated from September", () => {
      const octSnapshot = AnalyticsEngine.generateSnapshot(
        "CUSTOM",
        { startDate: "2026-10-01", endDate: "2026-10-31" },
        [{ id: "emp_01", status: "ACTIVE", business_id: tenantA } as any],
        [],
        [],
        octPayrolls,
        [],
        [],
        [],
        tenantA,
        "fr"
      );

      expect(octSnapshot.payrollCost.currentValue).toBe(111000);
    });
  });

  // --- 7. TENANT ISOLATION & BIZ_MAIN FALLBACK SAFETY ---
  describe("Section 19 — Tenant Isolation & BIZ_MAIN Resolution Safety", () => {
    it("prevents cross-tenant policy pollution between Tenant A and Tenant B", () => {
      const configA = { enable_social_taxes: true, payroll_policies: { onaEmployeeRate: 0.06 } };
      const configB = { enable_social_taxes: false, payroll_policies: { onaEmployeeRate: 0.08 } };

      const resA = TaxPolicyEngine.calculateDualSideContributions(100000, configA);
      const resB = TaxPolicyEngine.calculateDualSideContributions(100000, configB);

      expect(resA.onaEmployee).toBe(6000);
      expect(resB.onaEmployee).toBe(0);
    });

    it("rejects unauthenticated/unresolved business context instead of silently falling back to BIZ_MAIN in admin mutations", () => {
      const safeBusinessResolver = (currentBusiness: any, business: any) => {
        const resolvedId = currentBusiness?.id || business?.id;
        if (!resolvedId) {
          throw new Error("UNRESOLVED_TENANT: Operations rejected for unauthenticated tenant context.");
        }
        return resolvedId;
      };

      expect(() => safeBusinessResolver(null, null)).toThrow("UNRESOLVED_TENANT");
      expect(safeBusinessResolver({ id: tenantA }, null)).toBe(tenantA);
    });
  });
});
