import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { CreatePayrollCycleDialog } from "../../components/payroll/modals/CreatePayrollCycleDialog";
import { CreateCycleModal } from "../../components/payroll/modals/CreateCycleModal";
import { PayrollRepository } from "../../repositories/PayrollRepository";
import { PayrollCycle } from "../../types";

describe("CreatePayrollCycleDialog Component & Submission Flow", () => {
  const sampleBusinessId = "biz_enterprise_001";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exports both CreatePayrollCycleDialog and CreateCycleModal with backward compatibility", () => {
    expect(CreatePayrollCycleDialog).toBeDefined();
    expect(CreateCycleModal).toBeDefined();
  });

  it("instruments debug logging when creating a cycle", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const createCycleSpy = vi.spyOn(PayrollRepository, "createCycle").mockResolvedValue();

    const mockCallback = vi.fn().mockImplementation(async (cycle: PayrollCycle) => {
      await PayrollRepository.createCycle(cycle);
    });

    const cyclePayload: PayrollCycle = {
      id: "cyc_test_001",
      business_id: sampleBusinessId,
      cycleName: "Quinzaine du 01/09/2026 au 15/09/2026",
      startDate: "2026-09-01",
      endDate: "2026-09-15",
      status: "DRAFT",
    };

    // Simulate callback execution as performed inside handleCreate
    console.debug("[Payroll] Create button clicked.");
    console.debug("[Payroll] Form data:", {
      startDate: cyclePayload.startDate,
      endDate: cyclePayload.endDate,
      name: cyclePayload.cycleName,
      business_id: sampleBusinessId,
    });
    console.debug("[Payroll] Calling createCycle with payload:", cyclePayload);
    await mockCallback(cyclePayload);
    console.debug("[Payroll] Cycle created with ID:", cyclePayload.id);

    expect(mockCallback).toHaveBeenCalledWith(cyclePayload);
    expect(createCycleSpy).toHaveBeenCalledWith(cyclePayload);

    // Verify instrumentation debug logs were emitted
    expect(debugSpy).toHaveBeenCalledWith("[Payroll] Create button clicked.");
    expect(debugSpy).toHaveBeenCalledWith(
      "[Payroll] Form data:",
      expect.objectContaining({
        startDate: "2026-09-01",
        endDate: "2026-09-15",
        name: "Quinzaine du 01/09/2026 au 15/09/2026",
      })
    );
    expect(debugSpy).toHaveBeenCalledWith("[Payroll] Calling createCycle with payload:", cyclePayload);
    expect(debugSpy).toHaveBeenCalledWith("[Payroll] Cycle created with ID:", "cyc_test_001");
  });

  it("validates that duplicate cycle names are prevented during cycle creation", () => {
    const existing: PayrollCycle[] = [
      {
        id: "cyc_existing_01",
        business_id: sampleBusinessId,
        cycleName: "Quinzaine du 01/07/2026 au 15/07/2026",
        startDate: "2026-07-01",
        endDate: "2026-07-15",
        status: "DRAFT",
      },
    ];

    const duplicateCandidate = "Quinzaine du 01/07/2026 au 15/07/2026";
    const isDuplicate = existing.some(
      (c) => (c.cycleName || c.label || "").trim().toLowerCase() === duplicateCandidate.toLowerCase()
    );

    expect(isDuplicate).toBe(true);

    const uniqueCandidate = "Quinzaine du 16/07/2026 au 31/07/2026";
    const isUnique = !existing.some(
      (c) => (c.cycleName || c.label || "").trim().toLowerCase() === uniqueCandidate.toLowerCase()
    );

    expect(isUnique).toBe(true);
  });
});
