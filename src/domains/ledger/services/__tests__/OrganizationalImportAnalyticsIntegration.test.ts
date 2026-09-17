import { describe, it, expect } from "vitest";
import {
  OrganizationalDimensionResolver,
  RawImportRow
} from "../OrganizationalDimensionResolver";
import { AnalyticsEngine } from "../../../analytics/services/AnalyticsEngine";
import { Employee, Department, Branch, LedgerTransaction } from "../../../../types";

describe("Organizational Import & AnalyticsEngine Integration", () => {
  const businessId = "biz_tech_corp";

  const branches: Branch[] = [
    {
      id: "branch_delmas",
      code: "DELMAS",
      name: "Delmas Central",
      business_id: businessId,
      status: "ACTIVE"
    } as any,
    {
      id: "branch_petionville",
      code: "PV",
      name: "Pétion-Ville",
      business_id: businessId,
      status: "ACTIVE"
    } as any
  ];

  const departments: Department[] = [
    {
      id: "dept_it",
      code: "IT",
      name: "Information Technology",
      business_id: businessId,
      branch_id: "branch_delmas"
    } as any,
    {
      id: "dept_mktg",
      code: "MKTG",
      name: "Marketing",
      business_id: businessId,
      branch_id: "branch_petionville"
    } as any
  ];

  const employees: Employee[] = [
    {
      id: "emp_1",
      name: "Jean Dupont",
      email: "jean@tech.com",
      business_id: businessId,
      departmentId: "dept_it",
      branchId: "branch_delmas",
      status: "ACTIVE",
      role: "EMPLOYEE"
    } as any,
    {
      id: "emp_2",
      name: "Marie Claire",
      email: "marie@tech.com",
      business_id: businessId,
      departmentId: "dept_mktg",
      branchId: "branch_petionville",
      status: "ACTIVE",
      role: "EMPLOYEE"
    } as any
  ];

  it("Attributes imported resolved transactions directly to branch, department and employee analytics", () => {
    const rawRows: RawImportRow[] = [
      {
        date: "2026-05-10",
        type: "INCOME",
        category: "SALES",
        description: "IT Software License Sale",
        amount: 10000,
        currency: "HTG",
        employee_email: "jean@tech.com"
      },
      {
        date: "2026-05-12",
        type: "INCOME",
        category: "CONSULTING",
        description: "Marketing Consulting",
        amount: 8000,
        currency: "HTG",
        employee_id: "emp_2"
      }
    ];

    const resolved = rawRows.map((r, idx) =>
      OrganizationalDimensionResolver.resolveRow(
        r,
        businessId,
        employees,
        departments,
        branches,
        idx
      )
    );

    const importedTransactions: LedgerTransaction[] = resolved.map((res, i) => ({
      id: `tx_imported_${i}`,
      business_id: businessId,
      date: res.financialData.date,
      type: res.financialData.type as any,
      category: res.financialData.category,
      description: res.financialData.description,
      amount: res.financialData.amount,
      amount_cents: res.financialData.amount_cents,
      currency: res.financialData.currency,
      debit_account: res.financialData.debit_account,
      credit_account: res.financialData.credit_account,
      branchId: res.branchId,
      branch_id: res.branchId,
      departmentId: res.departmentId,
      department_id: res.departmentId,
      employeeId: res.employeeId,
      employee_id: res.employeeId,
      cost_center_id: res.cost_center_id,
      created_at: new Date().toISOString(),
      status: "POSTED"
    } as any));

    // Run AnalyticsEngine generateSnapshot for the period
    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: "2026-05-01", endDate: "2026-05-31" },
      employees,
      transactions: importedTransactions,
      attendanceLogs: [],
      payrollRecords: [],
      branches,
      departments,
      businessId,
      referenceDate: new Date("2026-05-15")
    });

    expect(snapshot.revenue.currentValue).toBe(18000);
    expect(snapshot.branchPerformance).toHaveLength(2);

    const delmasPerf = snapshot.branchPerformance.find((b) => b.branchId === "branch_delmas");
    expect(delmasPerf).toBeDefined();
    expect(delmasPerf?.revenue).toBe(10000);

    const pvPerf = snapshot.branchPerformance.find((b) => b.branchId === "branch_petionville");
    expect(pvPerf).toBeDefined();
    expect(pvPerf?.revenue).toBe(8000);

    const itDeptPerf = snapshot.departmentPerformance.find((d) => d.departmentId === "dept_it");
    expect(itDeptPerf).toBeDefined();
    expect(itDeptPerf?.revenue).toBe(10000);

    const mktgDeptPerf = snapshot.departmentPerformance.find((d) => d.departmentId === "dept_mktg");
    expect(mktgDeptPerf).toBeDefined();
    expect(mktgDeptPerf?.revenue).toBe(8000);

    const jeanScore = snapshot.employeeScorecards.find((e) => e.employeeId === "emp_1");
    expect(jeanScore).toBeDefined();
    expect(jeanScore?.salesVolume).toBe(10000);
    expect(jeanScore?.branchId).toBe("branch_delmas");
    expect(jeanScore?.departmentId).toBe("dept_it");
  });
});
