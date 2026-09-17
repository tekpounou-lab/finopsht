import { describe, it, expect } from "vitest";
import {
  OrganizationalDimensionResolver,
  RawImportRow,
  ResolvedImportRow
} from "../../domains/ledger/services/OrganizationalDimensionResolver";
import { ParsedQuickBooksRow, AssociateResolution } from "../../domains/ledger/types/quickbooks";
import { AnalyticsEngine } from "../../domains/analytics/services/AnalyticsEngine";
import { Branch, Department, Employee, LedgerTransaction } from "../../types";

describe("QuickBooks / POS Anti-Fallback Organizational Resolution (TC-QB-01 to TC-QB-10)", () => {
  const tenantA = "tenant_enterprise_a";
  const tenantB = "tenant_enterprise_b";

  const branches: Branch[] = [
    {
      id: "branch_pv",
      code: "PV01",
      name: "Succursale Pétion-Ville",
      business_id: tenantA,
      status: "ACTIVE"
    } as any,
    {
      id: "branch_delmas",
      code: "DEL01",
      name: "Succursale Delmas",
      business_id: tenantA,
      status: "ACTIVE"
    } as any,
    {
      id: "branch_tenant_b",
      code: "TB01",
      name: "Tenant B Branch",
      business_id: tenantB,
      status: "ACTIVE"
    } as any
  ];

  const departments: Department[] = [
    {
      id: "dept_bar",
      code: "BAR",
      name: "Département Bar",
      business_id: tenantA,
      branch_id: "branch_pv"
    } as any,
    {
      id: "dept_kitchen",
      code: "KITCHEN",
      name: "Département Cuisine",
      business_id: tenantA,
      branch_id: "branch_delmas"
    } as any,
    {
      id: "dept_nobranch",
      code: "HQ_MGMT",
      name: "HQ Management",
      business_id: tenantA,
      branch_id: undefined
    } as any,
    {
      id: "dept_tenant_b",
      code: "BAR_B",
      name: "Bar Tenant B",
      business_id: tenantB,
      branch_id: "branch_tenant_b"
    } as any
  ];

  const employees: Employee[] = [
    {
      id: "emp_jean",
      name: "Jean Dupont",
      email: "jean.dupont@test.com",
      business_id: tenantA,
      departmentId: "dept_bar",
      branchId: "branch_pv",
      status: "ACTIVE",
      role: "EMPLOYEE"
    } as any,
    {
      id: "emp_marie",
      name: "Marie Claire",
      email: "marie.claire@test.com",
      business_id: tenantA,
      departmentId: "dept_nobranch",
      branchId: undefined,
      status: "ACTIVE",
      role: "EMPLOYEE"
    } as any,
    {
      id: "emp_nodept",
      name: "Paul Robert",
      email: "paul.robert@test.com",
      business_id: tenantA,
      departmentId: undefined,
      branchId: undefined,
      status: "ACTIVE",
      role: "EMPLOYEE"
    } as any,
    {
      id: "emp_tenant_b",
      name: "Jean Dupont", // Homonym in another tenant
      email: "jean.tenantb@test.com",
      business_id: tenantB,
      departmentId: "dept_tenant_b",
      branchId: "branch_tenant_b",
      status: "ACTIVE",
      role: "EMPLOYEE"
    } as any
  ];

  // Helper function replicating the QuickBooks -> RawImportRow conversion logic
  function mapQuickBooksToRawRows(
    rows: ParsedQuickBooksRow[],
    resolutionMap: Map<string, AssociateResolution>,
    accountingDate: string = "2026-08-15"
  ): RawImportRow[] {
    return rows.map((row, i) => {
      const res = resolutionMap.get(row.associate);
      return {
        date: accountingDate,
        type: "INCOME",
        category: row.itemName,
        description: `Vente ${row.itemName}`,
        amount: Number(row.extPrice.toFixed(2)),
        currency: "HTG",
        employeeId: res?.matchedEmployeeId || undefined,
        employee_email: res?.matchedEmail || undefined,
        associate: row.associate,
        department: row.department || undefined,
        rowIndex: i
      };
    });
  }

  it("TC-QB-01: Correctly resolves Associate -> Employee -> Department -> Branch without 'Bureau Central' fallback", () => {
    const qbRows: ParsedQuickBooksRow[] = [
      {
        department: "BAR",
        itemName: "Prestige Beer",
        associate: "Jean Dupont",
        qtySold: 5,
        extPrice: 1500,
        itemNumber: "BEER01",
        itemDescription: "Bière Prestige 33cl"
      }
    ];

    const resolutionMap = new Map<string, AssociateResolution>([
      [
        "Jean Dupont",
        {
          rawName: "Jean Dupont",
          status: "EXACT",
          matchedEmployeeId: "emp_jean",
          matchedEmail: "jean.dupont@test.com",
          candidates: []
        }
      ]
    ]);

    const rawRows = mapQuickBooksToRawRows(qbRows, resolutionMap);
    const resolved = OrganizationalDimensionResolver.resolveBatch(
      rawRows,
      tenantA,
      employees,
      departments,
      branches,
      "2026-08-15"
    );

    expect(resolved).toHaveLength(1);
    const r = resolved[0];
    expect(r.isFinanciallyValid).toBe(true);
    expect(r.employeeId).toBe("emp_jean");
    expect(r.employeeName).toBe("Jean Dupont");
    expect(r.departmentId).toBe("dept_bar");
    expect(r.departmentName).toBe("Département Bar");
    expect(r.branchId).toBe("branch_pv");
    expect(r.branchName).toBe("Succursale Pétion-Ville");
    expect(r.branchCode).toBe("PV01");

    // CRITICAL: Must NEVER be 'Bureau Central'
    expect(r.branchName).not.toBe("Bureau Central");
    expect(r.branchCode).not.toBe("Bureau Central");
  });

  it("TC-QB-02: Unknown / Unresolved Associate leaves employee and branch as undefined (no fallback)", () => {
    const qbRows: ParsedQuickBooksRow[] = [
      {
        department: "UNKNOWN_DEPT",
        itemName: "Mystery Service",
        associate: "Inconnu Vendeur",
        qtySold: 1,
        extPrice: 5000,
        itemNumber: "SERV01",
        itemDescription: "Service non assigné"
      }
    ];

    const resolutionMap = new Map<string, AssociateResolution>([
      [
        "Inconnu Vendeur",
        {
          rawName: "Inconnu Vendeur",
          status: "UNRESOLVED",
          matchedEmployeeId: null,
          matchedEmail: null,
          candidates: []
        }
      ]
    ]);

    const rawRows = mapQuickBooksToRawRows(qbRows, resolutionMap);
    const resolved = OrganizationalDimensionResolver.resolveBatch(
      rawRows,
      tenantA,
      employees,
      departments,
      branches,
      "2026-08-15"
    );

    expect(resolved).toHaveLength(1);
    const r = resolved[0];
    // Financial validity must remain true
    expect(r.isFinanciallyValid).toBe(true);
    expect(r.financialData.amount).toBe(5000);
    // Organizational dimensions must remain undefined
    expect(r.employeeId).toBeUndefined();
    expect(r.departmentId).toBeUndefined();
    expect(r.branchId).toBeUndefined();
    expect(r.branchCode).toBeUndefined();
    expect(r.branchName).toBeUndefined();
  });

  it("TC-QB-03: Department without Branch leaves branchId as undefined", () => {
    const qbRows: ParsedQuickBooksRow[] = [
      {
        department: "HQ_MGMT",
        itemName: "Consulting Fee",
        associate: "Marie Claire",
        qtySold: 1,
        extPrice: 25000,
        itemNumber: "CONS01",
        itemDescription: "Frais de consultation"
      }
    ];

    const resolutionMap = new Map<string, AssociateResolution>([
      [
        "Marie Claire",
        {
          rawName: "Marie Claire",
          status: "EXACT",
          matchedEmployeeId: "emp_marie",
          matchedEmail: "marie.claire@test.com",
          candidates: []
        }
      ]
    ]);

    const rawRows = mapQuickBooksToRawRows(qbRows, resolutionMap);
    const resolved = OrganizationalDimensionResolver.resolveBatch(
      rawRows,
      tenantA,
      employees,
      departments,
      branches,
      "2026-08-15"
    );

    expect(resolved).toHaveLength(1);
    const r = resolved[0];
    expect(r.isFinanciallyValid).toBe(true);
    expect(r.employeeId).toBe("emp_marie");
    expect(r.departmentId).toBe("dept_nobranch");
    expect(r.branchId).toBeUndefined();
    expect(r.branchCode).toBeUndefined();
  });

  it("TC-QB-04: Associate with no department leaves departmentId and branchId as undefined", () => {
    const qbRows: ParsedQuickBooksRow[] = [
      {
        department: "",
        itemName: "Adhoc Task",
        associate: "Paul Robert",
        qtySold: 1,
        extPrice: 3000,
        itemNumber: "TASK01",
        itemDescription: "Tâche ponctuelle"
      }
    ];

    const resolutionMap = new Map<string, AssociateResolution>([
      [
        "Paul Robert",
        {
          rawName: "Paul Robert",
          status: "EXACT",
          matchedEmployeeId: "emp_nodept",
          matchedEmail: "paul.robert@test.com",
          candidates: []
        }
      ]
    ]);

    const rawRows = mapQuickBooksToRawRows(qbRows, resolutionMap);
    const resolved = OrganizationalDimensionResolver.resolveBatch(
      rawRows,
      tenantA,
      employees,
      departments,
      branches,
      "2026-08-15"
    );

    expect(resolved).toHaveLength(1);
    const r = resolved[0];
    expect(r.isFinanciallyValid).toBe(true);
    expect(r.employeeId).toBe("emp_nodept");
    expect(r.departmentId).toBeUndefined();
    expect(r.branchId).toBeUndefined();
  });

  it("TC-QB-05: Known Department in Master Data resolves Branch via department hierarchy even without Associate", () => {
    const qbRows: ParsedQuickBooksRow[] = [
      {
        department: "KITCHEN",
        itemName: "Griot Plate",
        associate: "",
        qtySold: 2,
        extPrice: 1400,
        itemNumber: "GRI01",
        itemDescription: "Assiette Griot"
      }
    ];

    const resolutionMap = new Map<string, AssociateResolution>();

    const rawRows = mapQuickBooksToRawRows(qbRows, resolutionMap);
    const resolved = OrganizationalDimensionResolver.resolveBatch(
      rawRows,
      tenantA,
      employees,
      departments,
      branches,
      "2026-08-15"
    );

    expect(resolved).toHaveLength(1);
    const r = resolved[0];
    expect(r.isFinanciallyValid).toBe(true);
    expect(r.employeeId).toBeUndefined();
    expect(r.departmentId).toBe("dept_kitchen");
    expect(r.branchId).toBe("branch_delmas");
    expect(r.branchName).toBe("Succursale Delmas");
  });

  it("TC-QB-06: Unknown Department and Unknown Associate maintains financial validity with all dimensions undefined", () => {
    const qbRows: ParsedQuickBooksRow[] = [
      {
        department: "RANDOM_SECTION",
        itemName: "Miscellaneous Item",
        associate: "Unregistered Associate",
        qtySold: 1,
        extPrice: 999.99,
        itemNumber: "MISC99",
        itemDescription: "Article divers"
      }
    ];

    const resolutionMap = new Map<string, AssociateResolution>();

    const rawRows = mapQuickBooksToRawRows(qbRows, resolutionMap);
    const resolved = OrganizationalDimensionResolver.resolveBatch(
      rawRows,
      tenantA,
      employees,
      departments,
      branches,
      "2026-08-15"
    );

    expect(resolved).toHaveLength(1);
    const r = resolved[0];
    expect(r.isFinanciallyValid).toBe(true);
    expect(r.financialData.amount).toBe(999.99);
    expect(r.financialData.amount_cents).toBe(99999);
    expect(r.employeeId).toBeUndefined();
    expect(r.departmentId).toBeUndefined();
    expect(r.branchId).toBeUndefined();
  });

  it("TC-QB-07: Financial Data Integrity - amount, amount_cents, currency, date, category preserved", () => {
    const qbRows: ParsedQuickBooksRow[] = [
      {
        department: "BAR",
        itemName: "Cocktail Special",
        associate: "Jean Dupont",
        qtySold: 3,
        extPrice: 4500.5,
        itemNumber: "CKT01",
        itemDescription: "Cocktail maison"
      }
    ];

    const resolutionMap = new Map<string, AssociateResolution>([
      [
        "Jean Dupont",
        {
          rawName: "Jean Dupont",
          status: "EXACT",
          matchedEmployeeId: "emp_jean",
          matchedEmail: "jean.dupont@test.com",
          candidates: []
        }
      ]
    ]);

    const rawRows = mapQuickBooksToRawRows(qbRows, resolutionMap, "2026-08-20");
    const resolved = OrganizationalDimensionResolver.resolveBatch(
      rawRows,
      tenantA,
      employees,
      departments,
      branches,
      "2026-08-20"
    );

    expect(resolved).toHaveLength(1);
    const r = resolved[0];
    expect(r.financialData.date).toBe("2026-08-20");
    expect(r.financialData.type).toBe("INCOME");
    expect(r.financialData.category).toBe("Cocktail Special");
    expect(r.financialData.amount).toBe(4500.5);
    expect(r.financialData.amount_cents).toBe(450050);
    expect(r.financialData.currency).toBe("HTG");
  });

  it("TC-QB-08: Cross-Tenant Isolation - Entities from another tenant are NEVER resolved", () => {
    const qbRows: ParsedQuickBooksRow[] = [
      {
        department: "BAR_B", // Belongs to Tenant B
        itemName: "Tenant B Sale",
        associate: "Jean Dupont", // Same name exists in Tenant B
        qtySold: 1,
        extPrice: 8000,
        itemNumber: "TB001",
        itemDescription: "Vente"
      }
    ];

    // Attempting resolution under Tenant A
    const rawRows: RawImportRow[] = [
      {
        date: "2026-08-15",
        type: "INCOME",
        category: "Tenant B Sale",
        amount: 8000,
        currency: "HTG",
        employee_email: "jean.tenantb@test.com", // Belongs to tenant B!
        department: "BAR_B" // Belongs to tenant B!
      }
    ];

    const resolved = OrganizationalDimensionResolver.resolveBatch(
      rawRows,
      tenantA, // Tenant A context
      employees,
      departments,
      branches,
      "2026-08-15"
    );

    expect(resolved).toHaveLength(1);
    const r = resolved[0];
    // Cross-tenant employee and department MUST NOT be resolved under Tenant A
    expect(r.employeeId).toBeUndefined();
    expect(r.departmentId).toBeUndefined();
    expect(r.branchId).toBeUndefined();
  });

  it("TC-QB-09: No Master Data Mutation - Resolver is a pure function without side-effects", () => {
    const initialBranchesCount = branches.length;
    const initialDepartmentsCount = departments.length;
    const initialEmployeesCount = employees.length;

    const qbRows: ParsedQuickBooksRow[] = [
      {
        department: "BRAND_NEW_DEPT",
        itemName: "New Product",
        associate: "Unseen Person",
        qtySold: 10,
        extPrice: 50000,
        itemNumber: "NEW01",
        itemDescription: "Nouveau produit"
      }
    ];

    const rawRows = mapQuickBooksToRawRows(qbRows, new Map());
    OrganizationalDimensionResolver.resolveBatch(
      rawRows,
      tenantA,
      employees,
      departments,
      branches,
      "2026-08-15"
    );

    // Arrays must not be mutated
    expect(branches.length).toBe(initialBranchesCount);
    expect(departments.length).toBe(initialDepartmentsCount);
    expect(employees.length).toBe(initialEmployeesCount);
  });

  it("TC-QB-10: Downstream Analytics Integration - Resolved transactions aggregate into AnalyticsEngine without ghost branches", () => {
    const qbRows: ParsedQuickBooksRow[] = [
      {
        department: "BAR",
        itemName: "Prestige Beer",
        associate: "Jean Dupont",
        qtySold: 10,
        extPrice: 3000,
        itemNumber: "BEER01",
        itemDescription: "Bière Prestige"
      },
      {
        department: "UNKNOWN_DEPT",
        itemName: "Mystery Item",
        associate: "Unknown Person",
        qtySold: 1,
        extPrice: 2000,
        itemNumber: "MYS01",
        itemDescription: "Item inconnu"
      }
    ];

    const resolutionMap = new Map<string, AssociateResolution>([
      [
        "Jean Dupont",
        {
          rawName: "Jean Dupont",
          status: "EXACT",
          matchedEmployeeId: "emp_jean",
          matchedEmail: "jean.dupont@test.com",
          candidates: []
        }
      ]
    ]);

    const rawRows = mapQuickBooksToRawRows(qbRows, resolutionMap, "2026-08-15");
    const resolved = OrganizationalDimensionResolver.resolveBatch(
      rawRows,
      tenantA,
      employees,
      departments,
      branches,
      "2026-08-15"
    );

    // Build ledger transactions from resolved rows
    const transactions: LedgerTransaction[] = resolved.map((r, idx) => ({
      id: `tx_qb_${idx}`,
      type: r.financialData.type,
      category: r.financialData.category,
      description: r.financialData.description,
      amount: r.financialData.amount,
      amount_cents: r.financialData.amount_cents,
      currency: r.financialData.currency,
      date: r.financialData.date,
      branchId: r.branchId,
      branch_id: r.branchId,
      branch_name: r.branchName,
      departmentId: r.departmentId,
      department_id: r.departmentId,
      employeeId: r.employeeId,
      employee_id: r.employeeId,
      business_id: tenantA,
      status: "POSTED",
      source: "CSV_IMPORT"
    } as any));

    // Run AnalyticsEngine generateSnapshot
    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: "2026-08-01", endDate: "2026-08-31" },
      employees: employees.filter(e => e.business_id === tenantA),
      transactions,
      attendanceLogs: [],
      payrollRecords: [],
      branches: branches.filter(b => b.business_id === tenantA),
      departments: departments.filter(d => d.business_id === tenantA),
      businessId: tenantA,
      referenceDate: new Date("2026-08-15")
    });

    const pvBranch = snapshot.branchPerformance.find(b => b.branchId === "branch_pv");
    expect(pvBranch).toBeDefined();
    expect(pvBranch?.revenue).toBe(3000);

    // Check that there is NO "Bureau Central" in branch performance
    const bureauCentral = snapshot.branchPerformance.find(
      b => b.branchName === "Bureau Central" || b.branchId === "bureau_central"
    );
    expect(bureauCentral).toBeUndefined();

    // Total business revenue includes both (3000 + 2000 = 5000)
    expect(snapshot.revenue.currentValue).toBe(5000);
  });
});
