import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { CashManagementRepository } from "../../../repositories/CashManagementRepository";
import { EmployeeRepository } from "../../../repositories/EmployeeRepository";
import { Employee } from "../../../types";

vi.mock("../../../lib/firebase", () => ({
  db: { type: "firestore-mock" },
  auth: {
    currentUser: {
      getIdToken: vi.fn(async () => "mock-valid-id-token")
    }
  }
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({ id: "mock_doc_ref" })),
  collection: vi.fn(() => ({ id: "mock_col_ref" })),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  setDoc: vi.fn(async () => {}),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  deleteDoc: vi.fn(async () => {}),
  orderBy: vi.fn(() => ({}))
}));

vi.mock("../../../repositories/EmployeeRepository", () => ({
  EmployeeRepository: {
    listAll: vi.fn()
  }
}));

describe("P1-2 Production Mock Data Elimination & Empty-State Integrity Suite", () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const emps: Employee[] = Array.isArray(body.initialEmployees) ? body.initialEmployees : [];
        const createdTills = emps.flatMap((emp) => [
          {
            id: `till_${body.businessId}_${emp.id}_htg`,
            business_id: body.businessId,
            branch_id: body.branchId || "MAIN_BRANCH",
            name: `TILL-HTG-001 - ${emp.name}`,
            assigned_teller_id: emp.id,
            assigned_teller_name: emp.name,
            currency: "HTG",
            balance_cents: 0,
            status: "CLOSED",
            created_at: "",
            updated_at: ""
          },
          {
            id: `till_${body.businessId}_${emp.id}_usd`,
            business_id: body.businessId,
            branch_id: body.branchId || "MAIN_BRANCH",
            name: `TILL-USD-001 - ${emp.name}`,
            assigned_teller_id: emp.id,
            assigned_teller_name: emp.name,
            currency: "USD",
            balance_cents: 0,
            status: "CLOSED",
            created_at: "",
            updated_at: ""
          }
        ]);
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              success: true,
              businessId: body.businessId,
              tillsCreated: createdTills.length,
              safesCreated: 2,
              existingTillsCount: 0,
              totalTills: createdTills.length,
              tills: createdTills,
              safes: []
            })
        } as any;
      })
    );
  });

  it("Test 1 — Real business with 0 employees returns [] and NEVER falls back to sampleEmployees", async () => {
    vi.mocked(EmployeeRepository.listAll).mockResolvedValue([]);

    const result = await CashManagementRepository.autoProvisionTillsForBusiness("biz_real_empty_001");

    expect(EmployeeRepository.listAll).toHaveBeenCalledWith("biz_real_empty_001");
    // Verify zero tills created for employees because business has no employees (and no fallback to sampleEmployees)
    expect(result.tillsCreated).toBe(0);
    expect(result.tills).toEqual([]);
  });

  it("Test 2 — Real business with real employees returns real employee list and creates tills for real employees", async () => {
    const realEmp: Employee = {
      id: "emp_real_1001",
      business_id: "biz_real_active_001",
      branchId: "br_1",
      departmentId: "dept_1",
      name: "Jean-Baptiste Real",
      email: "jean.real@finops.com",
      role: "SENIOR_TELLER",
      operational_profile: "teller",
      baseSalary: 50000,
      paymentModel: "FIXED",
      status: "ACTIVE"
    };

    vi.mocked(EmployeeRepository.listAll).mockResolvedValue([realEmp]);

    const result = await CashManagementRepository.autoProvisionTillsForBusiness("biz_real_active_001", "br_1", [realEmp]);

    // Should create 2 tills (HTG and USD) for the real employee
    expect(result.tillsCreated).toBe(2);
    expect(result.tills.length).toBe(2);
    expect(result.tills[0].assigned_teller_id).toBe("emp_real_1001");
  });

  it("Test 3 — Firestore error fetching employees throws/exposes error and NEVER returns sampleEmployees", async () => {
    vi.mocked(EmployeeRepository.listAll).mockRejectedValue(new Error("Firestore connection timeout"));

    await expect(
      CashManagementRepository.autoProvisionTillsForBusiness("biz_error_001")
    ).rejects.toThrow("Firestore connection timeout");
  });

  it("Test 4 — Tenant Isolation: Tenant A employees are never returned for Tenant B", async () => {
    const tenantAEmp: Employee = {
      id: "emp_tenant_a_1",
      business_id: "biz_tenant_a",
      branchId: "br_1",
      departmentId: "dept_1",
      name: "Alice Tenant A",
      email: "alice@tenanta.com",
      role: "EMPLOYEE",
      baseSalary: 40000,
      paymentModel: "FIXED",
      status: "ACTIVE"
    };

    vi.mocked(EmployeeRepository.listAll).mockImplementation(async (bizId: string) => {
      if (bizId === "biz_tenant_a") return [tenantAEmp];
      return [];
    });

    // Query Tenant B
    const resultTenantB = await CashManagementRepository.autoProvisionTillsForBusiness("biz_tenant_b");
    expect(resultTenantB.tillsCreated).toBe(0);
    expect(resultTenantB.tills).toEqual([]);
  });

  it("Test 5 — Codebase Audit: Confirms 0 production path files import or reference sampleEmployees", () => {
    const srcDir = path.resolve(process.cwd(), "src");
    
    // Recursive search in src/ excluding test folders and data.ts
    function searchFiles(dir: string, fileList: string[] = []): string[] {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          if (!filePath.includes("/tests") && !filePath.includes("/__tests__")) {
            searchFiles(filePath, fileList);
          }
        } else if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
          fileList.push(filePath);
        }
      }
      return fileList;
    }

    const allSrcFiles = searchFiles(srcDir);
    const productionFiles = allSrcFiles.filter((fp) => {
      return !fp.endsWith("src/data.ts") && !fp.includes(".test.") && !fp.includes("/tests/");
    });

    const offendingFiles: string[] = [];
    productionFiles.forEach((fp) => {
      const content = fs.readFileSync(fp, "utf8");
      if (content.includes("sampleEmployees")) {
        offendingFiles.push(fp);
      }
    });

    expect(offendingFiles, "No production path files should import or reference sampleEmployees").toEqual([]);
  });
});
