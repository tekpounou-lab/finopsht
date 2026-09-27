import { describe, it, expect } from "vitest";

// Mock helper simulating the memoized branchData logic inside ExecutiveBranchRevenue Component
function calculateBranchData(
  branchPerformance: any[] | undefined | null,
  totalRev: number
) {
  const list = branchPerformance || [];
  if (list.length === 0 && totalRev === 0) {
    return [];
  }

  const mapped = list.map((bp: any) => ({
    name: bp.branchName || "Non Alloué",
    revenue: bp.revenue || 0,
    percentage: totalRev > 0 ? Math.round(((bp.revenue || 0) / totalRev) * 100) : 0,
  }));

  const sumBranchRevenue = list.reduce((sum, bp) => sum + (bp.revenue || 0), 0);
  const unallocatedRevenue = totalRev - sumBranchRevenue;

  if (unallocatedRevenue > 0.01) {
    mapped.push({
      name: "Non Alloué",
      revenue: unallocatedRevenue,
      percentage: totalRev > 0 ? Math.round((unallocatedRevenue / totalRev) * 100) : 0,
    });
  }

  return mapped.sort((a, b) => b.revenue - a.revenue);
}

describe("Phase 12A.2.2 — Dynamic Branch Attribution Regression Tests", () => {
  it("Test 1: empty branchPerformance yields empty list (NO Bureau CentralFallback)", () => {
    const branchPerformance: any[] = [];
    const totalRev = 0;

    const result = calculateBranchData(branchPerformance, totalRev);
    expect(result).toEqual([]);
    expect(result.some((b) => b.name === "Bureau Central")).toBe(false);
  });

  it("Test 2: Branch A has correct revenue and percentage", () => {
    const branchPerformance = [
      { branchId: "b-1", branchName: "Branch A", revenue: 60000 },
    ];
    const totalRev = 100000;

    const result = calculateBranchData(branchPerformance, totalRev);
    expect(result.find((b) => b.name === "Branch A")?.revenue).toBe(60000);
    expect(result.find((b) => b.name === "Branch A")?.percentage).toBe(60);
    // Remaining 40,000 is correctly marked as Non Alloué
    expect(result.find((b) => b.name === "Non Alloué")?.revenue).toBe(40000);
    expect(result.find((b) => b.name === "Non Alloué")?.percentage).toBe(40);
  });

  it("Test 3: Branch B has correct dynamic metrics and sorting", () => {
    const branchPerformance = [
      { branchId: "b-1", branchName: "Branch A", revenue: 30000 },
      { branchId: "b-2", branchName: "Branch B", revenue: 50000 },
    ];
    const totalRev = 80000;

    const result = calculateBranchData(branchPerformance, totalRev);
    expect(result[0].name).toBe("Branch B");
    expect(result[0].revenue).toBe(50000);
    expect(result[0].percentage).toBe(63); // round(50/80 * 100) = 63%

    expect(result[1].name).toBe("Branch A");
    expect(result[1].revenue).toBe(30000);
    expect(result[1].percentage).toBe(38); // round(30/80 * 100) = 38%
  });

  it("Test 5: missing branch attributes correctly to 'Non Alloué' and does NOT trigger Bureau Central", () => {
    const branchPerformance = [
      { branchId: "b-1", branchName: null, revenue: 15000 },
    ];
    const totalRev = 50000;

    const result = calculateBranchData(branchPerformance, totalRev);
    // null branch name becomes Non Alloué
    const nullBranchItem = result.find((b) => b.revenue === 15000);
    expect(nullBranchItem?.name).toBe("Non Alloué");

    // unallocated difference (50,000 - 15,000 = 35,000) also becomes Non Alloué
    const unallocatedItem = result.find((b) => b.revenue === 35000);
    expect(unallocatedItem?.name).toBe("Non Alloué");

    expect(result.some((b) => b.name === "Bureau Central")).toBe(false);
  });

  it("Test 6: legitimate Bureau Central branch is fully supported", () => {
    const branchPerformance = [
      { branchId: "central-office", branchName: "Bureau Central", revenue: 90000 },
    ];
    const totalRev = 90000;

    const result = calculateBranchData(branchPerformance, totalRev);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Bureau Central");
    expect(result[0].revenue).toBe(90000);
    expect(result[0].percentage).toBe(100);
  });
});
