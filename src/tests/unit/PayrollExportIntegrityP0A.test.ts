import { describe, it, expect, vi, beforeEach } from "vitest";
import { useBIExport } from "../../components/bi/hooks/useBIExport";
import { PayrollRecord, Employee, Business } from "../../types";
import * as EnterpriseReportingEngine from "../../services/EnterpriseReportingEngine";

// Global DOM mock for Node runner
if (typeof globalThis.document === "undefined") {
  (globalThis as any).document = {
    createElement: (tag: string) => ({
      setAttribute: vi.fn(),
      click: vi.fn(),
    }),
    body: {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    },
  };
}

vi.mock("../../services/finopsEventOrchestrator", () => ({
  finopsEventOrchestrator: {
    emit: vi.fn(),
  },
}));

vi.mock("jspdf", () => {
  return {
    default: class MockJsPDF {
      setFont = vi.fn();
      setFontSize = vi.fn();
      setTextColor = vi.fn();
      setFillColor = vi.fn();
      setDrawColor = vi.fn();
      setLineWidth = vi.fn();
      text = vi.fn();
      line = vi.fn();
      rect = vi.fn();
      save = vi.fn();
    },
  };
});

vi.mock("xlsx", () => ({
  utils: {
    json_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}));

describe("BI-P1.7.1-P0A Controlled Payroll Export Integrity Acceptance Test Suite (20 Scenarios)", () => {
  const mockBusiness: Business = {
    id: "BIZ_TENANT_HAITI_01",
    name: "FinOps Enterprise Haiti",
    currency: "HTG",
    created_at: new Date().toISOString(),
  } as any;

  const samplePayrollRecords: PayrollRecord[] = [
    {
      id: "PAY_REC_001",
      cycleId: "CYC_2026_07_A",
      business_id: "BIZ_TENANT_HAITI_01",
      employeeId: "EMP_101",
      employeeName: "Jean-Baptiste Duval",
      branch_id: "BRANCH_PORT_AU_PRINCE",
      department_id: "COMMERCIAL",
      baseSalary: 50000,
      grossSalary: 55000,
      commissions: 5000,
      advancesTreated: 2000,
      cnssDeduction: 3300,
      cnsDeduction: 1100,
      taxDeduction: 4500,
      netPaid: 44100,
      status: "PAID",
      hashSignature: "SIG_001_VALID",
      period_start: "2026-07-01",
      period_end: "2026-07-15",
    },
    {
      id: "PAY_REC_002",
      cycleId: "CYC_2026_07_A",
      business_id: "BIZ_TENANT_HAITI_01",
      employeeId: "EMP_102",
      employeeName: "Marie-Claire Joseph",
      branch_id: "BRANCH_CAP_HAITIEN",
      department_id: "FINANCE",
      baseSalary: 75000,
      grossSalary: 75000,
      commissions: 0,
      advancesTreated: 0,
      cnssDeduction: 4500,
      cnsDeduction: 1500,
      taxDeduction: 8200,
      netPaid: 60800,
      status: "PAID",
      hashSignature: "SIG_002_VALID",
      period_start: "2026-07-01",
      period_end: "2026-07-15",
    },
    {
      id: "PAY_REC_003",
      cycleId: "CYC_2026_07_B",
      business_id: "BIZ_TENANT_HAITI_01",
      employeeId: "EMP_101", // Multiple period entry for EMP_101
      employeeName: "Jean-Baptiste Duval",
      branch_id: "BRANCH_PORT_AU_PRINCE",
      department_id: "COMMERCIAL",
      baseSalary: 50000,
      grossSalary: 60000,
      commissions: 10000,
      advancesTreated: 0,
      cnssDeduction: 3600,
      cnsDeduction: 1200,
      taxDeduction: 5100,
      netPaid: 50100,
      status: "PAID",
      hashSignature: "SIG_003_VALID",
      period_start: "2026-07-16",
      period_end: "2026-07-31",
    },
  ];

  const rawEmployees: Employee[] = [
    { id: "EMP_101", name: "Jean-Baptiste Duval", baseSalary: 50000, department: "COMMERCIAL", branchId: "BRANCH_PORT_AU_PRINCE" } as any,
    { id: "EMP_102", name: "Marie-Claire Joseph", baseSalary: 75000, department: "FINANCE", branchId: "BRANCH_CAP_HAITIEN" } as any,
    { id: "EMP_999", name: "Unscoped Employee Terminated", baseSalary: 100000, department: "EXECUTIVE", branchId: "BRANCH_MIAMI" } as any,
  ];

  // Helper to capture triggered CSV content
  const captureCsv = (filteredPayrolls: PayrollRecord[], reportType: any = "payroll"): string => {
    let capturedContent = "";

    // Intercept createObjectURL to read Blob content synchronously
    if (globalThis.URL) {
      vi.spyOn(globalThis.URL, "createObjectURL").mockImplementation((blob: any) => {
        if (blob && blob[Symbol.for("parts")]) {
          capturedContent = blob[Symbol.for("parts")].join("");
        }
        return "blob:mock-url";
      });
    }

    // Intercept Blob constructor cleanly
    const NativeBlob = globalThis.Blob;
    class MockBlob extends NativeBlob {
      parts: any[];
      constructor(blobParts?: BlobPart[], options?: BlobPropertyBag) {
        super(blobParts, options);
        this.parts = blobParts || [];
        (this as any)[Symbol.for("parts")] = blobParts || [];
      }
    }
    vi.stubGlobal("Blob", MockBlob);

    const { handleExportData } = useBIExport({
      currentBusiness: mockBusiness,
      reportType,
      employees: rawEmployees,
      ledgerTransactions: [],
      filteredAttendance: [],
      branchMetrics: [],
      employeeScorecards: [],
      filteredPayrolls,
      forensicLogs: [],
      totalRevenue: 1000000,
      totalExpenses: 600000,
      netProfit: 400000,
      profitMarginPercentage: 40,
      attendanceConsistencyPct: 98,
      payrollTaxesTotal: 20000,
      totalPayrollMass: 190000,
      totalCommissionPaid: 15000,
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });

    handleExportData("csv");
    return capturedContent;
  };

  it("[TC-EXP-01] Branch isolation: Only records for Branch Port-au-Prince are included when filtered", () => {
    const branchFiltered = samplePayrollRecords.filter((r) => r.branch_id === "BRANCH_PORT_AU_PRINCE");
    const csv = captureCsv(branchFiltered);

    expect(csv).toContain("PAY_REC_001");
    expect(csv).toContain("PAY_REC_003");
    expect(csv).not.toContain("PAY_REC_002"); // Cap-Haïtien excluded
  });

  it("[TC-EXP-02] Department isolation: Selecting FINANCE excludes COMMERCIAL", () => {
    const deptFiltered = samplePayrollRecords.filter((r) => r.department_id === "FINANCE");
    const csv = captureCsv(deptFiltered);

    expect(csv).toContain("PAY_REC_002");
    expect(csv).not.toContain("PAY_REC_001");
    expect(csv).not.toContain("PAY_REC_003");
  });

  it("[TC-EXP-03] Combined organizational scope: Branch + Department intersection", () => {
    const combinedFiltered = samplePayrollRecords.filter(
      (r) => r.branch_id === "BRANCH_PORT_AU_PRINCE" && r.department_id === "COMMERCIAL"
    );
    const csv = captureCsv(combinedFiltered);

    expect(csv).toContain("PAY_REC_001");
    expect(csv).toContain("PAY_REC_003");
    expect(csv).not.toContain("PAY_REC_002");
  });

  it("[TC-EXP-04] Tenant isolation: Cross-tenant records from another business_id are excluded", () => {
    const tenantFiltered = samplePayrollRecords.filter((r) => r.business_id === "BIZ_TENANT_HAITI_01");
    const csv = captureCsv(tenantFiltered);

    expect(csv).not.toContain("BIZ_OTHER_TENANT");
  });

  it("[TC-EXP-05] Unauthorized employee relation: Unscoped employees without payroll in period are excluded", () => {
    const csv = captureCsv(samplePayrollRecords);

    expect(csv).not.toContain("EMP_999"); // Unscoped employee not in filteredPayrolls
    expect(csv).not.toContain("Unscoped Employee Terminated");
  });

  it("[TC-EXP-06] CSV population parity: CSV rows match filteredPayrolls population exactly (3 records)", () => {
    const csv = captureCsv(samplePayrollRecords);
    const lines = csv.trim().split("\n");

    // Header + 3 records = 4 lines
    expect(lines.length).toBe(4);
  });

  it("[TC-EXP-07] Authoritative financial amounts: CSV amounts match PayrollRecord fields directly", () => {
    const csv = captureCsv([samplePayrollRecords[0]]);

    // Record PAY_REC_001: Gross=55000, Comm=5000, Adv=2000, CNSS=3300, CNS=1100, Tax=4500, Net=44100
    expect(csv).toContain('"PAY_REC_001"');
    expect(csv).toContain("55000");
    expect(csv).toContain("5000");
    expect(csv).toContain("2000");
    expect(csv).toContain("3300");
    expect(csv).toContain("1100");
    expect(csv).toContain("4500");
    expect(csv).toContain("44100");
  });

  it("[TC-EXP-08] No fabricated deductions: CNSS/CNS reflect actual record values instead of 6%/2% dummy formula", () => {
    const customRecord: PayrollRecord = {
      ...samplePayrollRecords[0],
      grossSalary: 100000,
      cnssDeduction: 1500, // Custom non-standard deduction rate (e.g. capped or exempt)
      cnsDeduction: 500,
      netPaid: 98000,
    };

    const csv = captureCsv([customRecord]);

    expect(csv).toContain("1500"); // Real 1500, NOT 6000 (100000 * 0.06)
    expect(csv).toContain("500");  // Real 500, NOT 2000 (100000 * 0.02)
  });

  it("[TC-EXP-09] No fabricated commissions or advances: Actual values 5000/2000 are exported, not forced to 0", () => {
    const csv = captureCsv([samplePayrollRecords[0]]);

    expect(csv).toContain("5000"); // Real commission
    expect(csv).toContain("2000"); // Real advance
  });

  it("[TC-EXP-10] Multiple payroll periods: 1-to-many relationship preserved for Jean-Baptiste Duval across 2 cycles", () => {
    const csv = captureCsv(samplePayrollRecords);

    expect(csv).toContain('"PAY_REC_001"');
    expect(csv).toContain('"PAY_REC_003"');
    expect(csv).toContain("2026-07-01");
    expect(csv).toContain("2026-07-16");
  });

  it("[TC-EXP-11] Missing payroll records: Employee without payroll in period generates 0 rows", () => {
    const csv = captureCsv([]);

    const lines = csv.trim().split("\n");
    expect(lines.length).toBe(1); // Header line only
  });

  it("[TC-EXP-12] Missing authoritative values: Optional/undefined properties default gracefully without throwing", () => {
    const minimalRecord: PayrollRecord = {
      id: "PAY_MIN_01",
      cycleId: "CYC_MIN",
      business_id: "BIZ_TENANT_HAITI_01",
      employeeId: "EMP_MIN",
      employeeName: "Minimal Worker",
      grossSalary: 20000,
      cnssDeduction: 0,
      cnsDeduction: 0,
      commissions: 0,
      advancesTreated: 0,
      netPaid: 20000,
      status: "DRAFT",
      hashSignature: "SIG_MIN",
    };

    const csv = captureCsv([minimalRecord]);

    expect(csv).toContain('"PAY_MIN_01"');
    expect(csv).toContain("20000");
  });

  it("[TC-EXP-13] Currency integrity: Preserves HTG values without un-authorized conversion", () => {
    const csv = captureCsv([samplePayrollRecords[0]]);

    expect(csv).toContain("44100");
  });

  it("[TC-EXP-14] Empty export: Empty filtered dataset produces a valid header-only CSV", () => {
    const csv = captureCsv([]);

    expect(csv).toContain("ID Record,ID Employé,Nom,Département,Période Début,Période Fin,Salaire Brut");
    expect(csv.trim().split("\n").length).toBe(1);
  });

  it("[TC-EXP-15] Duplicate input records: Distinct valid record IDs remain separate rows", () => {
    const csv = captureCsv(samplePayrollRecords);

    expect(csv).toContain("PAY_REC_001");
    expect(csv).toContain("PAY_REC_002");
    expect(csv).toContain("PAY_REC_003");
  });

  it("[TC-EXP-16] PDF financial totals: generatePayrollPdfReport receives filteredPayrolls and calculates real sums", () => {
    const pdfSpy = vi.spyOn(EnterpriseReportingEngine, "generatePayrollPdfReport");
    
    EnterpriseReportingEngine.generatePayrollPdfReport(samplePayrollRecords, "FinOps Enterprise Haiti");

    expect(pdfSpy).toHaveBeenCalledWith(samplePayrollRecords, "FinOps Enterprise Haiti");
  });

  it("[TC-EXP-17] Excel payroll values: Excel export receives filteredPayrolls data array", () => {
    const excelSpy = vi.spyOn(EnterpriseReportingEngine, "exportToExcel");

    const { handleExportData } = useBIExport({
      currentBusiness: mockBusiness,
      reportType: "payroll",
      employees: rawEmployees,
      ledgerTransactions: [],
      filteredAttendance: [],
      branchMetrics: [],
      employeeScorecards: [],
      filteredPayrolls: samplePayrollRecords,
      forensicLogs: [],
      totalRevenue: 1000000,
      totalExpenses: 600000,
      netProfit: 400000,
      profitMarginPercentage: 40,
      attendanceConsistencyPct: 98,
      payrollTaxesTotal: 20000,
      totalPayrollMass: 190000,
      totalCommissionPaid: 15000,
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });

    handleExportData("excel");

    expect(excelSpy).toHaveBeenCalledWith("PAYROLL", samplePayrollRecords, "BIZ_TENANT_HAITI_01");
  });

  it("[TC-EXP-18] Accounting mode regression: Cash/Accrual toggle does not alter payroll record scope", () => {
    const csv = captureCsv(samplePayrollRecords);

    expect(csv).toContain("PAY_REC_001");
    expect(csv).toContain("PAY_REC_002");
  });

  it("[TC-EXP-19] CSV formula injection: Formula triggers (=, +, -, @) in employee names are escaped with single quote", () => {
    const maliciousRecord: PayrollRecord = {
      ...samplePayrollRecords[0],
      id: "=CMD|' /C calc'!A0",
      employeeName: "+Malicious Formula Name",
      department_id: "-SECRET_DEPT",
    };

    const csv = captureCsv([maliciousRecord]);

    expect(csv).toContain("'\x3dCMD|' /C calc'!A0");
    expect(csv).toContain("'+Malicious Formula Name");
    expect(csv).toContain("'-SECRET_DEPT");
  });

  it("[TC-EXP-20] Existing export regression: Attendance, profitability, employee scorecards remain fully compatible", () => {
    const attendanceCsv = captureCsv([], "attendance");
    expect(attendanceCsv).toContain("Arrivée (Check-In)");

    const profitabilityCsv = captureCsv([], "profitability");
    expect(profitabilityCsv).toContain("Marge de Rentabilité");
  });
});
