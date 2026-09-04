import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmployeeSalesSummaryService } from "../../services/workforce/EmployeeSalesSummaryService";
import { Employee, LedgerTransaction, PayrollCycle, EmployeeContract } from "../../types";

// Mock Firebase
vi.mock("../../lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "test-admin" } }
}));

vi.mock("firebase/firestore", () => {
  const store: Record<string, any> = {};
  return {
    doc: vi.fn((_db, ...parts) => parts.join("/")),
    getDoc: vi.fn(async (path: string) => {
      return {
        exists: () => !!store[path],
        data: () => store[path]
      };
    }),
    setDoc: vi.fn(async (path: string, data: any) => {
      store[path] = data;
    }),
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    getDocs: vi.fn(async () => ({ docs: [] })),
    // Mock to expose store for testing
    __getStore: () => store,
    __clearStore: () => {
      for (const key in store) delete store[key];
    }
  };
});

describe("End-to-End Commission Flow", () => {
  const businessId = "biz_test_123";
  const cycle: PayrollCycle = {
    id: "cycle_aug_2026",
    business_id: businessId,
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    status: "DRAFT",
    cycleName: "August 2026",
  };

  const employee: Employee = {
    id: "emp_1",
    business_id: businessId,
    branchId: "branch_1",
    departmentId: "dept_1",
    name: "John Doe",
    email: "john@example.com",
    role: "EMPLOYEE",
    status: "ACTIVE",
    baseSalary: 1000,
    paymentModel: "HYBRID"
  };

  const contract: EmployeeContract = {
    id: "contract_1",
    business_id: businessId,
    employeeId: "emp_1",
    status: "active",
    salaryBaseHtg: 1000,
    commissionRate: 0.10, // 10%
    contractType: "cdi",
    payRegime: "hybrid",
    fileUrl: "",
    generatedAt: "2026-01-01T00:00:00Z"
  };

  const transactions: LedgerTransaction[] = [
    {
      id: "tx_1",
      business_id: businessId,
      date: "2026-08-10T10:00:00Z",
      amount: 5000,
      category: "REVENUE",
      status: "POSTED",
      description: "Sale 1",
      employee_email: "john@example.com",
      commission_claimed: false
    } as any,
    {
      id: "tx_2",
      business_id: businessId,
      date: "2026-08-15T10:00:00Z",
      amount: 2000,
      category: "REVENUE",
      status: "POSTED",
      description: "Sale 2",
      employee_email: "john@example.com",
      commission_claimed: false
    } as any
  ];

  beforeEach(async () => {
    const firestoreMock: any = await import("firebase/firestore");
    firestoreMock.__clearStore();
  });

  it("should calculate correct commissions from transactions", async () => {
    const summary = await EmployeeSalesSummaryService.generateOrFetchSummary({
      businessId,
      cycle,
      employee,
      transactions,
      contract
    });

    expect(summary.gross_sales).toBe(7000);
    expect(summary.transaction_count).toBe(2);
    expect(summary.commission_rate).toBe(0.10);
    expect(summary.calculated_commission).toBe(700);
    expect(summary.is_frozen).toBe(false);
  });

  it("should respect frozen state if cycle is sealed", async () => {
    const firestoreMock: any = await import("firebase/firestore");
    const store = firestoreMock.__getStore();
    
    // Seed a frozen summary
    store[`employee_sales_summary/ess_${businessId}_${cycle.id}_${employee.id}`] = {
      is_frozen: true,
      calculated_commission: 150, // Hardcoded old value
      gross_sales: 1500
    };

    const summary = await EmployeeSalesSummaryService.generateOrFetchSummary({
      businessId,
      cycle,
      employee,
      transactions, // Despite having 7000 in txs, should return 150
      contract
    });

    expect(summary.calculated_commission).toBe(150);
    expect(summary.gross_sales).toBe(1500);
    expect(summary.is_frozen).toBe(true);
  });
});
