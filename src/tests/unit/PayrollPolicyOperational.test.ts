import { describe, it, expect, beforeEach, vi } from "vitest";
import { PayrollPolicyRepository } from "../../repositories/PayrollPolicyRepository";
import { PayrollPolicyResolver } from "../../services/payroll/PayrollPolicyResolver";
import { ConfigurationResolver } from "../../services/config/ConfigurationResolver";
import {
  calculateEmployeePayrollItem,
  calculateOvertimePay,
} from "../../components/payroll/services/PayrollCalculationEngine";
import { TaxPolicyEngine } from "../../services/payroll/TaxPolicyEngine";
import { PayrollPolicySchema } from "../../types/payrollPolicy";

describe("Phase P1-4: Payroll & HR Policy Engine Operationalization Suite", () => {
  let mockDocs: Map<string, any>;

  beforeEach(() => {
    mockDocs = new Map();
    vi.clearAllMocks();
  });

  describe("1. Zod Schema Validation & Boundary Rules", () => {
    it("validates a valid payroll policy payload", () => {
      const payload = {
        businessId: "biz_test_01",
        effectiveFrom: "2026-10-01",
        frequency: "BIWEEKLY",
        currency: "HTG",
        standardHoursPerCycle: 96,
        overtime: { normalRate: 1.5, holidayRate: 2.0 },
        socialContributions: {
          enabled: true,
          cnssOna: { employeeRate: 0.06, employerRate: 0.06 },
          ofatmaCns: { employeeRate: 0.02, employerRate: 0.03 },
        },
        commissions: { defaultSalesRate: 0.05 },
        survivalFloor: { enabled: true, minimumNetHTG: 15000 },
        attendance: { excludeWithoutRecords: true },
        resolution: { mode: "STRICT" },
      };

      const result = PayrollPolicySchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("rejects invalid rates in STRICT mode", () => {
      const payload = {
        businessId: "biz_test_01",
        effectiveFrom: "2026-10-01",
        frequency: "BIWEEKLY",
        socialContributions: {
          enabled: true,
          cnssOna: { employeeRate: 0.85, employerRate: 0.06 }, // Exceeds 50% max
          ofatmaCns: { employeeRate: 0.02, employerRate: 0.03 },
        },
      };

      const result = PayrollPolicySchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe("2. SSOT Resolution Hierarchy (PayrollPolicyResolver)", () => {
    it("Tier 1: Employee specific override takes highest precedence", async () => {
      const res = await PayrollPolicyResolver.resolveParameter("commission_rate", {
        businessId: "biz_100",
        effectiveDate: "2026-10-15",
        employeeContext: {
          id: "emp_top_sales",
          customValue: 0.12, // 12% override
          payRegime: "COMMISSION",
        },
      });

      expect(res.status).toBe("RESOLVED");
      expect(res.value).toBe(0.12);
      expect(res.source).toBe("EMPLOYEE_OVERRIDE");
    });

    it("Tier 1: Employee under FIXED pay regime resolves commission to 0", async () => {
      const res = await PayrollPolicyResolver.resolveParameter("commission_rate", {
        businessId: "biz_100",
        effectiveDate: "2026-10-15",
        employeeContext: {
          id: "emp_fixed_salaried",
          customValue: 0.15,
          payRegime: "FIXED",
        },
      });

      expect(res.status).toBe("RESOLVED");
      expect(res.value).toBe(0);
      expect(res.source).toBe("EMPLOYEE_OVERRIDE");
    });

    it("Tier 3: Falls back to Global Statutory default if no tenant policy exists", async () => {
      const res = await PayrollPolicyResolver.resolveParameter("survival_floor_htg", {
        businessId: "biz_non_existent_999",
        effectiveDate: "2026-10-15",
      });

      expect(res.status).toBe("RESOLVED");
      expect(res.value).toBe(15000);
      expect(res.source).toBe("GLOBAL_POLICY");
    });

    it("Preserves explicit 0 rate without falling back to default", async () => {
      const res = await PayrollPolicyResolver.resolveParameter("commission_rate", {
        businessId: "biz_100",
        effectiveDate: "2026-10-15",
        employeeContext: {
          id: "emp_zero_comm",
          customValue: 0,
          payRegime: "COMMISSION",
        },
      });

      expect(res.status).toBe("RESOLVED");
      expect(res.value).toBe(0);
      expect(res.source).toBe("EMPLOYEE_OVERRIDE");
    });
  });

  describe("3. Simulator vs Engine Resolver Consistency", () => {
    it("ConfigurationResolver produces identical value and source as PayrollPolicyResolver", async () => {
      const simRes = await ConfigurationResolver.resolve("standard_hours", {
        businessId: "biz_sim_01",
        effectiveDate: "2026-10-20",
      });

      const engineRes = await PayrollPolicyResolver.resolveParameter("standard_hours", {
        businessId: "biz_sim_01",
        effectiveDate: "2026-10-20",
      });

      expect(simRes.value).toBe(engineRes.value);
    });
  });

  describe("4. Operational Execution in Payroll Engine", () => {
    it("Social Taxes Toggle OFF zeroes employee and employer deductions", () => {
      const grossPay = 100000;
      const configWithTaxesOff = { enable_social_taxes: false };

      const isTaxEnabled = TaxPolicyEngine.isSocialTaxEnabled(configWithTaxesOff);
      expect(isTaxEnabled).toBe(false);

      const dualRes = TaxPolicyEngine.calculateDualSideContributions(grossPay, configWithTaxesOff);
      expect(dualRes.onaEmployee).toBe(0);
      expect(dualRes.onaEmployer).toBe(0);
      expect(dualRes.ofatmaEmployee).toBe(0);
      expect(dualRes.ofatmaEmployer).toBe(0);
      expect(dualRes.totalEmployeeDeductions).toBe(0);
    });

    it("Social Taxes Toggle ON applies configured ONA & OFATMA rates", () => {
      const grossPay = 100000;
      const configWithTaxesOn = {
        enable_social_taxes: true,
        cnssRateEmployee: 0.06,
        cnssRateEmployer: 0.06,
        cnsRateEmployee: 0.02,
        cnsRateEmployer: 0.03,
      };

      const dualRes = TaxPolicyEngine.calculateDualSideContributions(grossPay, configWithTaxesOn);
      expect(dualRes.onaEmployee).toBe(6000);  // 6% of 100,000
      expect(dualRes.onaEmployer).toBe(6000);  // 6% of 100,000
      expect(dualRes.ofatmaEmployee).toBe(2000); // 2% of 100,000
      expect(dualRes.ofatmaEmployer).toBe(3000); // 3% of 100,000
      expect(dualRes.totalEmployeeDeductions).toBe(8000); // 6,000 + 2,000
    });

    it("Survival Floor ON raises net pay to minimum floor when deductions reduce net below floor", () => {
      const item = {
        baseSalaryHTG: 16000,
        overtimeHours150: 0,
        overtimeHours200: 0,
        hourlyRateHTG: 100,
        bonusesHTG: 0,
        commissionsHTG: 0,
        advancesHTG: 5000,
      };

      const taxConfig = {
        enable_social_taxes: true,
        cnssRateEmployee: 0.06,
        cnsRateEmployee: 0.02,
        survivalFloorHTG: 15000,
      };

      const result = calculateEmployeePayrollItem(
        item,
        "biz_test",
        "emp_01",
        "2026-10",
        taxConfig as any
      );

      // Gross = 16000. Deductions = 8% (1280) + 5000 advance = 6280.
      // Net without floor = 9720 (< 15000).
      // Since gross (16000) >= floor (15000), survival floor applies and net is raised to 15000.
      expect(result.survivalFloorApplied).toBe(true);
      expect(result.finalPayout).toBe(15000);
    });

    it("Custom overtime rates normal & holiday are respected in calculation", () => {
      const hourlyRate = 200;
      const normalHs = 10;  // 10 hrs
      const holidayHs = 5;  // 5 hrs

      // Custom policy rates: Normal HS = 1.8x, Holiday HS = 2.5x
      const pay = calculateOvertimePay(
        hourlyRate,
        normalHs,
        holidayHs,
        1.8,
        2.5
      );

      // (200 * 1.8 * 10) = 3600
      // (200 * 2.5 * 5)  = 2500
      // Total = 6100
      expect(pay).toBe(6100);
    });
  });

  describe("5. Toggle Operationalization & Persistence Integrity", () => {
    it("TaxPolicyEngine correctly recognizes disabled social taxes, survival floor, and attendance requirement on canonical policy", () => {
      const disabledPolicy = {
        businessId: "biz_disabled_test",
        effectiveFrom: "2026-10-01",
        socialContributions: {
          enabled: false,
          cnssOna: { employeeRate: 0.06, employerRate: 0.06 },
          ofatmaCns: { employeeRate: 0.02, employerRate: 0.03 },
        },
        survivalFloor: {
          enabled: false,
          minimumNetHTG: 15000,
        },
        attendance: {
          excludeWithoutRecords: false,
        },
      };

      expect(TaxPolicyEngine.isSocialTaxEnabled(disabledPolicy)).toBe(false);
      expect(TaxPolicyEngine.isSurvivalFloorEnabled(disabledPolicy)).toBe(false);
      expect(TaxPolicyEngine.isAttendanceRequiredForPayroll(disabledPolicy)).toBe(false);

      const rates = TaxPolicyEngine.getTaxRates(disabledPolicy);
      expect(rates.enabled).toBe(false);
      expect(rates.onaEmployee).toBe(0);
      expect(rates.ofatmaEmployee).toBe(0);
    });

    it("PayrollPolicyRepository falls back to tenant localStorage when query returns empty", async () => {
      const tenantId = "biz_local_storage_test";
      const samplePolicy = {
        id: `pol_${tenantId}_v1`,
        policyId: `pol_${tenantId}_v1`,
        businessId: tenantId,
        effectiveFrom: "2026-10-01",
        frequency: "BIWEEKLY",
        socialContributions: { enabled: false, cnssOna: { employeeRate: 0.06, employerRate: 0.06 }, ofatmaCns: { employeeRate: 0.02, employerRate: 0.03 } },
        survivalFloor: { enabled: false, minimumNetHTG: 15000 },
        attendance: { excludeWithoutRecords: false },
      };

      const origWindow = (globalThis as any).window;
      const storage: Record<string, string> = {
        [`finops_payroll_policy_${tenantId}`]: JSON.stringify(samplePolicy),
      };
      const mockStorage = {
        getItem: vi.fn((key: string) => storage[key] || null),
        setItem: vi.fn((key: string, val: string) => { storage[key] = val; }),
        removeItem: vi.fn((key: string) => { delete storage[key]; }),
        clear: vi.fn(() => {}),
      };
      (globalThis as any).window = { localStorage: mockStorage };

      try {
        const resolved = await PayrollPolicyRepository.getEffectivePolicy(tenantId, "2026-10-15", true);
        expect(resolved).not.toBeNull();
        expect(resolved?.socialContributions.enabled).toBe(false);
        expect(resolved?.survivalFloor.enabled).toBe(false);
        expect(resolved?.attendance.excludeWithoutRecords).toBe(false);
      } finally {
        if (origWindow === undefined) {
          delete (globalThis as any).window;
        } else {
          (globalThis as any).window = origWindow;
        }
      }
    });
  });
});
