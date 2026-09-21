import { describe, it, expect } from "vitest";
import { CommissionEngine } from "../../services/CommissionEngine";
import { Employee } from "../../types";

describe("CommissionEngine Unit Tests — SSOT & Commission Calculation Validation", () => {
  it("Phase 8 Case 1: Sales = 100,000, Employee Rate = 45% => Commission = 45,000 HTG", () => {
    const employee: Partial<Employee> = {
      id: "emp_rodson",
      name: "Rodson Charles",
      commission_rate: 0.45, // 45%
      paymentModel: "COMMISSION"
    };

    const salesByDept = {
      d1: { departmentId: "d1", salesAmount: 100000, transactionCount: 1 }
    };

    const rate = CommissionEngine.resolveCommissionRate(employee);
    expect(rate).toBe(0.45);

    const result = CommissionEngine.calculateEmployeeCommissionsFromSales(
      employee as Employee,
      salesByDept
    );

    expect(result.totalCommission).toBe(45000); // 100,000 × 0.45 = 45,000
  });

  it("Phase 8 Case 2: Sales = 100,000, Employee Rate = 40% => Commission = 40,000 HTG", () => {
    const employee: Partial<Employee> = {
      id: "emp_steevenson",
      name: "Steevenson Mizaine",
      commission_rate: 0.40, // 40%
      paymentModel: "HYBRID"
    };

    const salesByDept = {
      d1: { departmentId: "d1", salesAmount: 100000, transactionCount: 1 }
    };

    const rate = CommissionEngine.resolveCommissionRate(employee);
    expect(rate).toBe(0.40);

    const result = CommissionEngine.calculateEmployeeCommissionsFromSales(
      employee as Employee,
      salesByDept
    );

    expect(result.totalCommission).toBe(40000); // 100,000 × 0.40 = 40,000
  });

  it("Phase 8 Case 3: Sales = 100,000, Employee Rate = 5% => Commission = 5,000 HTG", () => {
    const employee: Partial<Employee> = {
      id: "emp_vercira",
      name: "Vercira Lorveda",
      commission_rate: 0.05, // 5%
      paymentModel: "COMMISSION"
    };

    const salesByDept = {
      d1: { departmentId: "d1", salesAmount: 100000, transactionCount: 1 }
    };

    const rate = CommissionEngine.resolveCommissionRate(employee);
    expect(rate).toBe(0.05);

    const result = CommissionEngine.calculateEmployeeCommissionsFromSales(
      employee as Employee,
      salesByDept
    );

    expect(result.totalCommission).toBe(5000); // 100,000 × 0.05 = 5,000
  });

  it("Phase 8 Case 4: Sales = 0, Employee Rate = 45% => Commission = 0 HTG", () => {
    const employee: Partial<Employee> = {
      id: "emp_rodson",
      name: "Rodson Charles",
      commission_rate: 0.45,
      paymentModel: "COMMISSION"
    };

    const salesByDept = {
      d1: { departmentId: "d1", salesAmount: 0, transactionCount: 0 }
    };

    const rate = CommissionEngine.resolveCommissionRate(employee);
    expect(rate).toBe(0.45);

    const result = CommissionEngine.calculateEmployeeCommissionsFromSales(
      employee as Employee,
      salesByDept
    );

    expect(result.totalCommission).toBe(0);
  });

  it("Phase 9 SSOT Verification: Employee collection is preferred over contract fallback defaults", () => {
    const employee: Partial<Employee> = {
      id: "emp_rodson",
      name: "Rodson Charles",
      commission_rate: 0.45, // Employee SSOT 45%
    };

    const contractWithStaleRate = {
      commissionRate: 8 // Old default 8% in contract template
    };

    // Must resolve to 0.45 (employee rate), ignoring 8% contract rate
    const resolvedRate = CommissionEngine.resolveCommissionRate(employee, contractWithStaleRate);
    expect(resolvedRate).toBe(0.45);
  });

  it("Phase 9 Real-world validation example: Rodson Charles with 63,227.40 HTG sales @ 45%", () => {
    const employee: Partial<Employee> = {
      id: "emp_rodson",
      name: "Rodson Charles",
      commission_rate: 0.45
    };

    const salesByDept = {
      dept_sales: { departmentId: "dept_sales", salesAmount: 63227.40, transactionCount: 5 }
    };

    const result = CommissionEngine.calculateEmployeeCommissionsFromSales(
      employee as Employee,
      salesByDept
    );

    // 63,227.40 × 0.45 = 28,452.33 HTG
    expect(result.totalCommission).toBe(28452.33);
  });

  it("Phase 9C.5.4: Required Commission Test Matrix (Tests 1 to 5)", () => {
    // Test 1: Employee = 7% (0.07)
    const emp1 = { id: "e1", commission_rate: 0.07 };
    expect(CommissionEngine.resolveCommissionRate(emp1)).toBe(0.07);

    // Test 2: Employee = explicit 0% (0)
    const emp2 = { id: "e2", commission_rate: 0 };
    expect(CommissionEngine.resolveCommissionRate(emp2)).toBe(0);

    // Test 3: Employee = missing, Tenant = 5% (0.05)
    const emp3 = { id: "e3" };
    expect(CommissionEngine.resolveCommissionRate(emp3, null, undefined, 0.05)).toBe(0.05);

    // Test 4: Employee = missing, Tenant = missing, Global = missing
    const emp4 = { id: "e4" };
    expect(CommissionEngine.resolveCommissionRate(emp4, null, undefined, undefined)).toBeNull();

    // Test 5: Verify display formatting distinctions
    expect(CommissionEngine.formatCommissionRateDisplay(0.07)).toBe("7%");
    expect(CommissionEngine.formatCommissionRateDisplay(0)).toBe("0%");
    expect(CommissionEngine.formatCommissionRateDisplay(null)).toBe("Non configuré (NO_DATA)");
    expect(CommissionEngine.formatCommissionRateDisplay(undefined)).toBe("Non configuré (NO_DATA)");
  });
});
