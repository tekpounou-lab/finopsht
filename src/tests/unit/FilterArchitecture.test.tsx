import { describe, it, expect } from "vitest";
import { DEFAULT_NAMESPACE_FILTERS, GenericFilterGroup } from "../../types/filters";
import { PRESET_PERIODS } from "../../components/ui/DateRangePicker";
import { LedgerRepository } from "../../repositories/LedgerRepository";
import { LedgerTransaction } from "../../types";

describe("Centralized Filter Architecture (SSOT with Namespaces)", () => {
  it("initializes default filters for standard namespaces accurately", () => {
    expect(DEFAULT_NAMESPACE_FILTERS.gl.period).toBe("ALL");
    expect(DEFAULT_NAMESPACE_FILTERS.gl.type).toEqual(["ALL"]);
    expect(DEFAULT_NAMESPACE_FILTERS.attendance.period).toBe("TODAY");
    expect(DEFAULT_NAMESPACE_FILTERS.payroll.period).toBe("THIS_MONTH");
    expect(DEFAULT_NAMESPACE_FILTERS.planning.period).toBe("THIS_WEEK");
  });

  it("isolates filter updates across different namespaces", () => {
    const store: Record<string, GenericFilterGroup> = JSON.parse(
      JSON.stringify(DEFAULT_NAMESPACE_FILTERS)
    );

    // Update 'gl' namespace
    store.gl = {
      ...store.gl,
      period: "2026-03",
      type: ["INCOME"],
      search: "March Sales"
    };

    // Verify 'gl' updated
    expect(store.gl.period).toBe("2026-03");
    expect(store.gl.type).toEqual(["INCOME"]);
    expect(store.gl.search).toBe("March Sales");

    // Verify 'crm' and 'payroll' remain untouched
    expect(store.crm.period).toBe("ALL");
    expect(store.payroll.period).toBe("THIS_MONTH");
    expect(store.attendance.period).toBe("TODAY");
  });

  it("synchronizes namespace with global filters on demand", () => {
    const store: Record<string, GenericFilterGroup> = JSON.parse(
      JSON.stringify(DEFAULT_NAMESPACE_FILTERS)
    );

    // Global sets a specific period and branch
    store.global = {
      ...store.global,
      period: "2026-08",
      branchId: ["branch_cap_haitien"]
    };

    expect(store.gl.period).toBe("ALL");

    // Sync 'gl' with 'global'
    store.gl = {
      ...store.gl,
      ...store.global
    };

    expect(store.gl.period).toBe("2026-08");
    expect(store.gl.branchId).toEqual(["branch_cap_haitien"]);
  });

  it("computes presets correctly in DateRangePicker", () => {
    const todayPreset = PRESET_PERIODS.find((p) => p.id === "TODAY");
    expect(todayPreset).toBeDefined();
    const todayRes = todayPreset!.compute();
    expect(todayRes.period).toBe("TODAY");
    expect(todayRes.start).toBeTruthy();
    expect(todayRes.end).toBe(todayRes.start);

    const allPreset = PRESET_PERIODS.find((p) => p.id === "ALL");
    expect(allPreset).toBeDefined();
    const allRes = allPreset!.compute();
    expect(allRes.period).toBe("ALL");
    expect(allRes.start).toBe("");
    expect(allRes.end).toBe("");

    const thisMonthPreset = PRESET_PERIODS.find((p) => p.id === "THIS_MONTH");
    expect(thisMonthPreset).toBeDefined();
    const monthRes = thisMonthPreset!.compute();
    expect(monthRes.period).toMatch(/^\d{4}-\d{2}$/);
    expect(monthRes.start).toMatch(/^\d{4}-\d{2}-01$/);
  });
});
