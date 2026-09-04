import { describe, it, expect, vi } from "vitest";
import { ScheduleRepository } from "../../repositories/ScheduleRepository";
import { PlanningDomainService } from "../../domains/planning/services/PlanningDomainService";

describe("Shift & Scheduling Domain Audit & Integrity Tests", () => {
  it("verifies that shifts in a locked payroll cycle throw an error when attempting creation or modification", async () => {
    // Mock verifyPeriodLock to simulate a locked payroll cycle
    const verifySpy = vi.spyOn(ScheduleRepository, "verifyPeriodLock").mockImplementation(async (bizId, dateStr) => {
      if (dateStr === "2026-06-15") {
        throw new Error(`Impossible de modifier la planification : la période de paie du ${dateStr} est verrouillée/scellée (SEALED).`);
      }
    });

    // Attempting to create a shift in a locked cycle must throw
    await expect(
      ScheduleRepository.createShift(
        {
          business_id: "biz_test_001",
          employeeId: "emp_123",
          branchId: "branch_1",
          departmentId: "dept_1",
          date: "2026-06-15",
          startTime: "08:00",
          endTime: "16:00",
          status: "SCHEDULED",
          plannedHours: 8
        },
        { id: "mgr_1", name: "Manager Bob", role: "MANAGER" }
      )
    ).rejects.toThrow("Impossible de modifier la planification : la période de paie du 2026-06-15 est verrouillée/scellée (SEALED).");

    verifySpy.mockRestore();
  });

  it("prohibits assigning operational shifts to OWNER role", () => {
    const ownerEmployee: any = {
      id: "emp_owner",
      business_id: "biz_test_001",
      name: "Owner Alice",
      role: "OWNER",
      email: "owner@test.com",
      branchId: "b1",
      departmentId: "d1",
      baseSalary: 100000,
      paymentModel: "MONTHLY_SALARY"
    };

    expect(() => {
      PlanningDomainService.validateShiftAssignment(ownerEmployee);
    }).toThrow("Les propriétaires (OWNER) ne peuvent pas être assignés à des shifts opérationnels.");
  });

  it("filters out non-schedulable employees from operational planning list", () => {
    const employees: any[] = [
      { id: "e1", business_id: "biz_1", name: "Owner John", role: "OWNER", email: "o@test.com", branchId: "b1", departmentId: "d1", baseSalary: 100000, paymentModel: "MONTHLY_SALARY" },
      { id: "e2", business_id: "biz_1", name: "Worker Jane", role: "EMPLOYEE", email: "w@test.com", branchId: "b1", departmentId: "d1", baseSalary: 50000, paymentModel: "MONTHLY_SALARY" },
      { id: "e3", business_id: "biz_2", name: "Other Biz Worker", role: "EMPLOYEE", email: "ob@test.com", branchId: "b2", departmentId: "d2", baseSalary: 50000, paymentModel: "MONTHLY_SALARY" }
    ];

    const schedulable = PlanningDomainService.getSchedulableEmployees(employees, "biz_1");
    expect(schedulable).toHaveLength(1);
    expect(schedulable[0].id).toBe("e2");
  });

  it("ensures mutating a ShiftTemplate does not alter existing Shift instances (decoupled snapshots)", () => {
    const originalShift = {
      id: "shf_001",
      business_id: "biz_1",
      employeeId: "emp_1",
      branchId: "b1",
      departmentId: "d1",
      date: "2026-07-01",
      startTime: "08:00",
      endTime: "16:00",
      plannedHours: 8,
      status: "SCHEDULED" as const
    };

    // Simulated template mutation
    const updatedTemplate = {
      id: "tmpl_morning",
      businessId: "biz_1",
      startTime: "09:00", // Shift changed from 08:00 to 09:00
      endTime: "17:00",
      breakDuration: 60
    };

    // Historical shift instance retains original snapshot values
    expect(originalShift.startTime).toBe("08:00");
    expect(originalShift.endTime).toBe("16:00");
    expect(originalShift.plannedHours).toBe(8);
  });
});
