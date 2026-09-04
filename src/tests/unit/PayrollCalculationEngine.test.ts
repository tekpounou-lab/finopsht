import { describe, it, expect } from "vitest";
import {
  calculateTaxDeductions,
  calculateOvertimePay,
  calculateEmployeePayrollItem,
  generateAuditSeal,
  resolveTaxRatesForDate
} from "../../components/payroll/services/PayrollCalculationEngine";
import { BusinessTaxConfiguration } from "../../repositories/BusinessAdministrationRepository";

describe("PayrollCalculationEngine Unit Tests", () => {
  it("calculates ONA (6%) and OFATMA (2% employee / 3% employer) tax deductions correctly", () => {
    const grossPay = 100000; // 100,000 HTG
    const deductions = calculateTaxDeductions(grossPay);

    expect(deductions.employeeCNSS).toBe(6000); // 6% ONA
    expect(deductions.employerCNSS).toBe(6000); // 6% ONA Employer
    expect(deductions.employeeCNS).toBe(2000);  // 2% OFATMA
    expect(deductions.employerCNS).toBe(3000);  // 3% OFATMA Employer
    expect(deductions.totalDeductions).toBe(8000); // 6000 + 2000
  });

  it("calculates overtime pay for 1.5x and 2.0x hourly rates", () => {
    const hourlyRate = 500; // 500 HTG/hr
    const overtimePay = calculateOvertimePay(hourlyRate, 10, 5); // 10h @ 1.5x, 5h @ 2.0x

    // 500 * 1.5 * 10 = 7,500
    // 500 * 2.0 * 5  = 5,000
    // Total = 12,500
    expect(overtimePay).toBe(12500);
  });

  it("adds commission to gross pay before calculating taxes", () => {
    const lineItem = {
      baseSalaryHTG: 50000,
      overtimeHours150: 0,
      overtimeHours200: 0,
      hourlyRateHTG: 200,
      bonusesHTG: 0,
      commissionsHTG: 25000, // Commission should be added to Gross
      advancesHTG: 0
    };
    
    const result = calculateEmployeePayrollItem(
      lineItem,
      "biz_tenant_1",
      "emp_001",
      "2026-07"
    );
    
    // Gross = 50000 (Base) + 25000 (Commission) = 75000
    // Deductions = 6% + 2% = 8% = 6000
    // Net Pay = 75000 - 6000 = 69000
    expect(result.grossPay).toBe(75000);
    expect(result.taxDeductions.totalDeductions).toBe(6000);
    expect(result.finalPayout).toBe(69000);
  });

  it("applies the Survival Floor Protection when net pay drops below 15,000 HTG", () => {
    const lineItem = {
      baseSalaryHTG: 16000,
      overtimeHours150: 0,
      overtimeHours200: 0,
      hourlyRateHTG: 100,
      bonusesHTG: 0,
      commissionsHTG: 0,
      advancesHTG: 2000 // Advance drops net pay below 15k floor
    };

    const result = calculateEmployeePayrollItem(
      lineItem,
      "biz_tenant_1",
      "emp_001",
      "2026-07"
    );

    // Gross = 16000
    // Deductions = 6% + 2% = 8% = 1280
    // Raw Net = 16000 - 1280 - 2000 = 12720 (< 15,000)
    // Survival Floor applied -> Net set to 15,000
    expect(result.survivalFloorApplied).toBe(true);
    expect(result.finalPayout).toBe(15000);
    expect(result.integritySeal).toContain("SHA256::");
  });

  it("generates a deterministic SHA-256 audit seal", () => {
    const seal = generateAuditSeal("biz_001", 50, 5000000, 4200000);
    expect(seal).toContain("SHA256::");
    expect(seal.length).toBeGreaterThan(15);
  });

  describe("Dynamic and Historical Tax Rate Resolving", () => {
    const mockTaxConfig: BusinessTaxConfiguration = {
      cnssRateEmployee: 0.05,
      cnssRateEmployer: 0.05,
      cnsRateEmployee: 0.015,
      cnsRateEmployer: 0.025,
      survivalFloorHTG: 12000,
      currency: "HTG",
      history: [
        {
          cnssRateEmployee: 0.04,
          cnssRateEmployer: 0.04,
          cnsRateEmployee: 0.01,
          cnsRateEmployer: 0.02,
          survivalFloorHTG: 10000,
          effectiveFrom: "2025-01-01",
          effectiveTo: "2025-12-31"
        },
        {
          cnssRateEmployee: 0.045,
          cnssRateEmployer: 0.045,
          cnsRateEmployee: 0.012,
          cnsRateEmployer: 0.022,
          survivalFloorHTG: 11000,
          effectiveFrom: "2026-01-01",
          effectiveTo: "2026-06-30"
        }
      ]
    };

    it("resolves the current active config rates when no date or out-of-range date is provided", () => {
      const rates = resolveTaxRatesForDate(mockTaxConfig, "2026-08-01");
      expect(rates.cnssRateEmployee).toBe(0.05);
      expect(rates.survivalFloorHTG).toBe(12000);
    });

    it("resolves historical rates matching effective periods accurately", () => {
      // Date in 2025 matching the first history entry
      const rates2025 = resolveTaxRatesForDate(mockTaxConfig, "2025-06-15");
      expect(rates2025.cnssRateEmployee).toBe(0.04);
      expect(rates2025.survivalFloorHTG).toBe(10000);

      // Date in 2026 first half matching second history entry
      const rates2026H1 = resolveTaxRatesForDate(mockTaxConfig, "2026-03-01");
      expect(rates2026H1.cnssRateEmployee).toBe(0.045);
      expect(rates2026H1.survivalFloorHTG).toBe(11000);
    });

    it("calculates deductions using dynamic active configuration when passed", () => {
      const grossPay = 100000;
      const deductions = calculateTaxDeductions(grossPay, resolveTaxRatesForDate(mockTaxConfig, "2026-08-01"));
      
      expect(deductions.employeeCNSS).toBe(5000); // 5% CNSS
      expect(deductions.employeeCNS).toBe(1500);  // 1.5% CNS
    });

    it("calculates deductions using dynamic historical config when target period is past", () => {
      const lineItem = {
        baseSalaryHTG: 15000,
        overtimeHours150: 0,
        overtimeHours200: 0,
        hourlyRateHTG: 100,
        bonusesHTG: 0,
        commissionsHTG: 0,
        advancesHTG: 4500
      };

      // Calculate with 2025 history where floor was 10,000 HTG
      const result2025 = calculateEmployeePayrollItem(
        lineItem,
        "biz_001",
        "emp_001",
        "2025-08-01",
        mockTaxConfig
      );

      // Gross = 15000
      // 2025 Rates: CNSS (4%) + CNS (1%) = 5% = 750 HTG deductions
      // Net before advance = 15000 - 750 = 14250 HTG
      // Proposed deduction: 4500 HTG. Remaining Net = 14250 - 4500 = 9750 HTG
      // 2025 Floor is 10,000 HTG. 9750 < 10000 -> Raised to survival floor (10,000 HTG)
      expect(result2025.survivalFloorApplied).toBe(true);
      expect(result2025.finalPayout).toBe(10000);
    });
  });
});
