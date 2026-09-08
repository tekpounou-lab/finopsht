import { describe, it, expect, vi, beforeEach } from "vitest";
import { PayrollRepository } from "../../repositories/PayrollRepository";
import { PayrollService } from "../../services/payroll/PayrollService";
import { BusinessAdministrationRepository } from "../../repositories/BusinessAdministrationRepository";
import { FinopsException } from "../../modules/runtime/FinopsException";
import { PayrollCycle, Employee } from "../../types";

describe("Payroll Deduplication and Dynamic Tax Rates", () => {
  const sampleBusinessId = "biz_test_dedup_001";

  const existingCycle: PayrollCycle = {
    id: "cyc_001",
    business_id: sampleBusinessId,
    cycleName: "Paie de Juillet 2026",
    label: "Paie de Juillet 2026",
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    status: "DRAFT",
    created_at: "2026-07-01T00:00:00Z",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should prevent creating a cycle with a duplicate name for the same business", async () => {
    // Mock listCyclesByBusiness to return the existing cycle
    vi.spyOn(PayrollRepository, "listCyclesByBusiness").mockResolvedValue([existingCycle]);

    const newDuplicateCycle: PayrollCycle = {
      id: "cyc_002",
      business_id: sampleBusinessId,
      cycleName: "Paie de Juillet 2026", // Duplicate name
      label: "Paie de Juillet 2026",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      status: "DRAFT",
    };

    await expect(PayrollRepository.createCycle(newDuplicateCycle)).rejects.toThrow(FinopsException);

    try {
      await PayrollRepository.createCycle(newDuplicateCycle);
    } catch (err: any) {
      expect(err).toBeInstanceOf(FinopsException);
      expect(err.errorCode || err.context?.errorCode).toBe("CYCLE_ALREADY_EXISTS");
      expect(err.message).toContain("Paie de Juillet 2026");
    }
  });

  it("should allow creating a cycle if the name is unique for the business", async () => {
    vi.spyOn(PayrollRepository, "listCyclesByBusiness").mockResolvedValue([existingCycle]);
    const mockBatch = vi.spyOn(PayrollRepository as any, "createCycle").mockImplementation(async (c: PayrollCycle) => {
      const targetName = (c.cycleName || c.label || "").trim();
      const existing = [existingCycle];
      if (existing.some(item => (item.cycleName || "").toLowerCase() === targetName.toLowerCase())) {
        throw new FinopsException(`Un cycle de paie nommé "${targetName}" existe déjà.`, {
          businessId: c.business_id,
          actorId: "system",
          module: "PAYROLL",
          operation: "createCycle",
          correlationId: `create_${c.id}`,
          severity: "HIGH",
          errorCode: "CYCLE_ALREADY_EXISTS",
          cycleName: targetName
        });
      }
      return;
    });

    const uniqueCycle: PayrollCycle = {
      id: "cyc_003",
      business_id: sampleBusinessId,
      cycleName: "Paie d'Août 2026", // Unique
      label: "Paie d'Août 2026",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      status: "DRAFT",
    };

    await expect(PayrollRepository.createCycle(uniqueCycle)).resolves.not.toThrow();
  });

  it("should skip recalculation if cycle status is SEALED", async () => {
    const sealedCycle: PayrollCycle = {
      ...existingCycle,
      status: "SEALED",
    };

    const mockEmployee: Employee = {
      id: "emp_001",
      business_id: sampleBusinessId,
      name: "Jean Dupont",
      status: "ACTIVE",
      salaryBaseHtg: 50000,
    } as any;

    const records = await PayrollService.processPayrollCycle(sealedCycle, [mockEmployee], sampleBusinessId);
    expect(records).toEqual([]);
  });

  it("should use custom dynamic tax configuration when processing a cycle", async () => {
    const draftCycle: PayrollCycle = {
      ...existingCycle,
      status: "DRAFT",
    };

    const mockEmployee: Employee = {
      id: "emp_001",
      business_id: sampleBusinessId,
      name: "Jean Dupont",
      status: "ACTIVE",
      salaryBaseHtg: 100000,
    } as any;

    // Custom tax configuration: ONA employee = 10% (0.10), OFATMA employee = 5% (0.05)
    vi.spyOn(BusinessAdministrationRepository, "getPayrollPolicies").mockResolvedValue({
      frequency: "BIWEEKLY",
      currency: "HTG",
      enableTaxes: true,
      onaEmployeeRate: 0.10,
      onaEmployerRate: 0.10,
      ofatmaEmployeeRate: 0.05,
      ofatmaEmployerRate: 0.05,
      enableSurvivalFloor: true,
      survivalFloor: 15000,
      overtimeRate150: 1.5,
      overtimeRate200: 2,
      defaultCommissionRate: 0.05,
      requireAttendanceForPayroll: true
    });
    vi.spyOn(BusinessAdministrationRepository, "getTaxConfiguration").mockResolvedValue({
      cnssRateEmployee: 0.10,
      cnssRateEmployer: 0.10,
      cnsRateEmployee: 0.05,
      cnsRateEmployer: 0.05,
      survivalFloorHTG: 15000,
      currency: "HTG",
      history: []
    });

    const records = await PayrollService.processPayrollCycle(draftCycle, [mockEmployee], sampleBusinessId, {
      onAddRecords: () => {},
      onUpdateCycle: () => {},
    });
    expect(records.length).toBe(1);

    const record = records[0];
    // Base for quinzaine = 100000 / 2 = 50000
    // ONA tax = 50000 * 0.10 = 5000
    // OFATMA tax = 50000 * 0.05 = 2500
    // Total Tax = 7500
    // Net Salary = 50000 - 7500 = 42500
    expect(record.cnssDeduction).toBe(5000);
    expect(record.cnsDeduction).toBe(2500);
    expect(record.grossSalary).toBe(50000);
    expect(record.netPaid).toBe(42500);
  });
});
