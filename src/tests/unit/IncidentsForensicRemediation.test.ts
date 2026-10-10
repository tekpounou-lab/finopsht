import { describe, it, expect, vi, beforeEach } from "vitest";
import { BulkEmployeeImportService, generateDeterministicImportId } from "../../services/workforce/BulkEmployeeImportService";
import { FinancialRatioEngine } from "../../services/cfo/FinancialRatioEngine";
import { EmployeeRepository } from "../../repositories/EmployeeRepository";
import { Branch, Department, Employee, Role } from "../../types";

describe("INCIDENT A — BI API & FinancialRatioEngine Fallback", () => {
  const mockBusiness = {
    id: "biz_test_001",
    name: "Entreprise Test Haïti",
    currency: "HTG",
    type: "COMMERCIAL",
    status: "ACTIVE"
  };

  it("produces deterministic heuristic calculations preserving currency and tenant scope", () => {
    const payload = {
      business: mockBusiness,
      snapshot: {
        period: "2026-10",
        revenue: { currentValue: 500000 },
        expenses: { currentValue: 320000 },
        profit: { currentValue: 180000 },
        attendanceRate: { currentValue: 92 },
        absenceRate: { currentValue: 4 }
      },
      employees: [],
      ledger: [],
      attendance: [],
      payroll: []
    };

    const report = FinancialRatioEngine.calculate(payload, "Service momentanément indisponible");

    expect(report).toBeDefined();
    expect(report.summary).toContain("Entreprise Test Haïti");
    expect(report.summary).toContain("HTG");
    expect(report.metrics.cash_flow).toBeDefined();
    expect(report.metrics.financial_health_score).toBeGreaterThan(0);
    expect(report.predictions.budget_overrun_risk).toBeDefined();
    expect(report.chartsData.length).toBeGreaterThanOrEqual(2);
  });

  it("handles empty or missing snapshot gracefully with explicit NO_DATA semantic state", () => {
    const payload = {
      business: mockBusiness,
      employees: [],
      ledger: [],
      attendance: [],
      payroll: []
    };

    const report = FinancialRatioEngine.calculate(payload);

    expect(report).toBeDefined();
    expect(report.metrics.revenue_state).toBe("NO_DATA");
    expect(report.metrics.expense_state).toBe("NO_DATA");
  });
});

describe("INCIDENT B — finopsEventOrchestrator CORS & Origin Governance", () => {
  // Simulate the Cloud Functions onRequest CORS verification logic
  const ALLOWED_ORIGINS: (string | RegExp)[] = [
    "https://finopsht.vercel.app",
    /https:\/\/.*\.vercel\.app$/,
    "https://finops-tek-pou-nou.ai.studio",
    "http://localhost:3000",
    "http://localhost:5173",
    /https:\/\/.*\.ai\.studio$/,
    /https:\/\/.*\.run\.app$/,
  ];

  function isOriginAllowed(origin: string | undefined): boolean {
    if (!origin) return true;
    return ALLOWED_ORIGINS.some((allowed) => {
      if (typeof allowed === "string") return origin === allowed;
      return allowed.test(origin);
    });
  }

  function handleMockRequest(req: { method: string; headers: Record<string, string>; body?: any }) {
    const origin = req.headers.origin;
    const responseHeaders: Record<string, string> = {};
    let statusCode = 200;
    let responseBody: any = null;

    if (origin && isOriginAllowed(origin)) {
      responseHeaders["Access-Control-Allow-Origin"] = origin;
    }

    responseHeaders["Access-Control-Allow-Credentials"] = "true";
    responseHeaders["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE, PATCH";
    responseHeaders["Access-Control-Allow-Headers"] = "Authorization, Content-Type, Accept, X-Requested-With, Origin, x-client-version, x-firebase-gmpid";
    responseHeaders["Access-Control-Max-Age"] = "3600";

    if (req.method === "OPTIONS") {
      statusCode = 204;
      return { statusCode, headers: responseHeaders, body: "" };
    }

    if (req.method !== "POST") {
      statusCode = 405;
      return {
        statusCode,
        headers: responseHeaders,
        body: { error: { message: "Method Not Allowed. Use POST for event orchestration.", status: "METHOD_NOT_ALLOWED" } }
      };
    }

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: { result: { success: true, status: "PROCESSED" } }
    };
  }

  it("strictly allows preflight OPTIONS from https://finopsht.vercel.app with 204 status", () => {
    const res = handleMockRequest({
      method: "OPTIONS",
      headers: {
        origin: "https://finopsht.vercel.app",
        "access-control-request-method": "POST",
        "access-control-request-headers": "Content-Type, Authorization"
      }
    });

    expect(res.statusCode).toBe(204);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("https://finopsht.vercel.app");
    expect(res.headers["Access-Control-Allow-Credentials"]).toBe("true");
    expect(res.headers["Access-Control-Allow-Methods"]).toContain("POST");
    expect(res.headers["Access-Control-Allow-Headers"]).toContain("Authorization");
  });

  it("strictly allows POST execution from https://finopsht.vercel.app with matching CORS origin", () => {
    const res = handleMockRequest({
      method: "POST",
      headers: {
        origin: "https://finopsht.vercel.app",
        "content-type": "application/json"
      },
      body: { type: "TEST_EVENT", business_id: "biz_test_001" }
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("https://finopsht.vercel.app");
    expect((res.body as any).result.success).toBe(true);
  });

  it("strictly DENIES Access-Control-Allow-Origin for unauthorized origin", () => {
    const res = handleMockRequest({
      method: "OPTIONS",
      headers: {
        origin: "https://malicious-phishing-domain.com",
        "access-control-request-method": "POST"
      }
    });

    expect(res.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("maintains CORS headers on 405 Method Not Allowed responses so client receives HTTP status", () => {
    const res = handleMockRequest({
      method: "GET",
      headers: {
        origin: "https://finopsht.vercel.app"
      }
    });

    expect(res.statusCode).toBe(405);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("https://finopsht.vercel.app");
    expect((res.body as any).error.status).toBe("METHOD_NOT_ALLOWED");
  });
});

describe("INCIDENT C — BulkEmployeeImportService & Observability", () => {
  const businessId = "biz_import_test";
  const existingBranches: Branch[] = [
    {
      id: "br_001",
      business_id: businessId,
      name: "Siège Social",
      code: "HQ",
      status: "ACTIVE",
      is_active: true,
      address: "Port-au-Prince",
      location: "Centre-Ville",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  const existingDepts: Department[] = [
    {
      id: "dept_001",
      business_id: businessId,
      branch_id: "br_001",
      name: "Comptabilité",
      normalized_name: "comptabilite",
      code: "COMPTA",
      status: "ACTIVE",
      is_active: true,
      budget: 150000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  it("generates collision-resistant deterministic IDs for imported entities", () => {
    const id1 = generateDeterministicImportId("emp", businessId, "jean.baptiste@finops.ht");
    const id2 = generateDeterministicImportId("emp", businessId, "jean.baptiste@finops.ht");
    const idDifferentTenant = generateDeterministicImportId("emp", "biz_other", "jean.baptiste@finops.ht");

    expect(id1).toBe(id2);
    expect(id1).not.toBe(idDifferentTenant);
    expect(id1.startsWith("emp_")).toBe(true);
  });

  it("resolves valid employee rows and detects duplicates in file", () => {
    const rows = [
      {
        nom: "Jean Baptiste",
        email: "jean.baptiste@finops.ht",
        poste: "Comptable",
        succursale: "Siège Social",
        departement: "Comptabilité",
        salaire: 45000
      },
      {
        nom: "Duplicate Person",
        email: "jean.baptiste@finops.ht", // Duplicate!
        poste: "Assistant",
        succursale: "Siège Social",
        departement: "Comptabilité",
        salaire: 30000
      }
    ];

    const plan = BulkEmployeeImportService.resolveImportPlan(
      businessId,
      rows,
      existingBranches,
      existingDepts,
      []
    );

    expect(plan.summary.totalRows).toBe(2);
    expect(plan.summary.validRows).toBe(1);
    expect(plan.validationErrors.length).toBeGreaterThan(0);
    expect(plan.validationErrors[0]).toContain("Email en doublon dans le fichier");
  });

  it("detects conflict against active existing staff upfront", () => {
    const activeStaff: Employee[] = [
      {
        id: "emp_existing_1",
        business_id: businessId,
        branchId: "br_001",
        departmentId: "dept_001",
        name: "Marie Curie",
        email: "marie.curie@finops.ht",
        normalizedEmail: "marie.curie@finops.ht",
        role: "EMPLOYEE",
        status: "ACTIVE",
        isActive: true,
        baseSalary: 60000,
        salaryBaseHtg: 60000,
        paymentModel: "FIXED",
        contractType: "cdi",
        payRegime: "fixe",
        onboardingComplete: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    const rows = [
      {
        nom: "Marie Curie",
        email: "marie.curie@finops.ht", // Already active
        poste: "Scientifique",
        succursale: "Siège Social",
        departement: "Comptabilité",
        salaire: 65000
      }
    ];

    const plan = BulkEmployeeImportService.resolveImportPlan(
      businessId,
      rows,
      existingBranches,
      existingDepts,
      activeStaff
    );

    expect(plan.summary.validRows).toBe(0);
    expect(plan.validationErrors.length).toBe(1);
    expect(plan.validationErrors[0]).toContain("Collaborateur existant et actif");
  });

  it("auto-creates missing branches and departments with system defaults", () => {
    const rows = [
      {
        nom: "Pierre Richard",
        email: "pierre.richard@finops.ht",
        poste: "Chef d'agence",
        succursale: "Agence Cap-Haïtien", // New Branch
        departement: "Opérations Nord",   // New Dept
        salaire: 55000
      }
    ];

    const plan = BulkEmployeeImportService.resolveImportPlan(
      businessId,
      rows,
      existingBranches,
      existingDepts,
      []
    );

    expect(plan.summary.validRows).toBe(1);
    expect(plan.branchesToCreate).toHaveLength(1);
    expect(plan.branchesToCreate[0].name).toBe("Agence Cap-Haïtien");
    expect(plan.departmentsToCreate).toHaveLength(1);
    expect(plan.departmentsToCreate[0].name).toBe("Opérations Nord");
    expect(plan.departmentsToCreate[0].budget).toBe(50000);
  });

  it("returns structured error telemetry when atomic import fails without throwing unhandled exceptions", async () => {
    const rows = [
      {
        nom: "Test Failure",
        email: "test.failure@finops.ht",
        poste: "Agent",
        succursale: "Siège Social",
        departement: "Comptabilité",
        salaire: 30000
      }
    ];

    const plan = BulkEmployeeImportService.resolveImportPlan(
      businessId,
      rows,
      existingBranches,
      existingDepts,
      []
    );

    // Mock EmployeeRepository.createBulkImportBatch to throw a simulated Firestore permission error
    const spy = vi.spyOn(EmployeeRepository, "createBulkImportBatch").mockRejectedValueOnce(
      new Error("Missing or insufficient permissions.")
    );

    const result = await BulkEmployeeImportService.executeImportPlan(plan);

    expect(result.success).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("ERR_FIRESTORE_PERMISSION_DENIED");
    expect(result.errorCategory).toBe("PERMISSION");
    expect(result.correlationId).toBeDefined();
    expect(result.failedStep).toBe("METADATA_OR_VALIDATION");
    expect(result.error).toContain("Permissions insuffisantes");

    spy.mockRestore();
  });
});
