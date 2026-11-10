/**
 * FINOPS ERP — Phase P1-4F: Adversarial Payroll Audit & Validation Suite
 * 
 * Conducts rigorous adversarial testing across policy resolution, eligibility,
 * boundary calculation attacks, concurrency/idempotency, double-entry GL integrity,
 * Haitian statutory compliance, and multi-tenant security isolation.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PayrollService } from "../../services/payroll/PayrollService";
import {
  calculateEmployeePayrollItem,
  calculateTaxDeductions,
  calculateOvertimePay,
  resolveTaxRatesForDate,
} from "../../components/payroll/services/PayrollCalculationEngine";
import { AccountingEngine, createPayrollJournalEntry, createPayrollSettlementEntry } from "../../services/AccountingEngine";
import { TaxPolicyEngine } from "../../services/payroll/TaxPolicyEngine";
import { PayrollPolicyResolver } from "../../services/payroll/PayrollPolicyResolver";
import { PayrollPolicyRepository } from "../../repositories/PayrollPolicyRepository";
import { StaticDataCacheService } from "../../services/cache/StaticDataCacheService";
import { PayrollCycle, Employee, AttendanceRecord, PayrollRecord } from "../../types";

// In-memory Firestore emulation for isolated testing
let fakeFirestoreData: Map<string, any> = new Map();
let batchSetOperations: Array<{ path: string; data: any; options?: any }> = [];

const mockWriteBatch = vi.fn(() => ({
  set: vi.fn((docRef: any, data: any, options?: any) => {
    batchSetOperations.push({ path: docRef?.path || docRef?.id || String(docRef), data, options });
    return {} as any;
  }),
  update: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn(async () => {
    for (const op of batchSetOperations) {
      fakeFirestoreData.set(op.path, { ...(op.options?.merge ? (fakeFirestoreData.get(op.path) || {}) : {}), ...op.data });
    }
  }),
}));

const mockDoc = vi.fn((...args: any[]) => {
  const pathParts = args.slice(1);
  return { id: pathParts[pathParts.length - 1], path: pathParts.join("/") };
});

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    writeBatch: () => mockWriteBatch(),
    doc: (...args: any[]) => mockDoc(...args),
    getDoc: vi.fn().mockImplementation(async (docRef: any) => {
      const p = docRef?.path || String(docRef);
      const data = fakeFirestoreData.get(p);
      return { exists: () => !!data, data: () => data, id: docRef?.id || "doc_id" };
    }),
    getDocs: vi.fn(async (colRef: any) => {
      const colPath = colRef?.path || String(colRef);
      const docs: any[] = [];
      for (const [key, val] of fakeFirestoreData.entries()) {
        if (key.startsWith(colPath + "/")) {
          docs.push({ id: key.replace(colPath + "/", ""), data: () => val });
        }
      }
      return { docs, empty: docs.length === 0 };
    }),
    setDoc: vi.fn().mockResolvedValue(undefined),
    addDoc: vi.fn().mockResolvedValue({ id: "mock_doc_id" }),
    serverTimestamp: () => "2026-10-20T12:00:00.000Z",
  };
});

vi.mock("../../repositories/ForensicLogRepository", () => ({
  ForensicLogRepository: {
    createAndSignLog: vi.fn().mockResolvedValue({ id: "flog_sig", signature: "SIG_ADV_SHA256" }),
    writeForensicLog: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../repositories/PayrollRepository", () => ({
  PayrollRepository: {
    sealCycleAtomic: vi.fn().mockResolvedValue(undefined),
    savePayrollRunDraft: vi.fn().mockResolvedValue(undefined),
    saveCycle: vi.fn().mockResolvedValue(undefined),
    createCycle: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("FINOPS P1-4F: Adversarial Payroll Audit & Validation Suite", () => {
  const tenant = "biz_adversarial_p14f";

  const makeCycle = (overrides?: Partial<PayrollCycle>): PayrollCycle => ({
    id: "cycle_p14f_test",
    cycleName: "Quinzaine Adversarial P1-4F",
    startDate: "2026-08-01",
    endDate: "2026-08-15",
    effectiveAccountingDate: "2026-08-15",
    status: "DRAFT",
    business_id: tenant,
    total_gross_cents: 0,
    total_net_cents: 0,
    total_deductions_cents: 0,
    currency: "HTG",
    ...overrides,
  });

  const makeEmployee = (overrides?: any): Employee => ({
    id: "emp_p14f",
    business_id: tenant,
    businessId: tenant,
    branch_id: "MAIN",
    branchId: "MAIN",
    department_id: "operations",
    departmentId: "operations",
    name: "Adversarial Worker",
    email: "worker@adversarial.test",
    role: "SENIOR_TELLER",
    status: "ACTIVE",
    paymentModel: "FIXED",
    salaryBaseHtg: 24000,
    baseSalary: 24000,
    workedHours: 80,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  } as any);

  beforeEach(() => {
    fakeFirestoreData.clear();
    batchSetOperations = [];
    vi.clearAllMocks();
  });

  // =========================================================================
  // AUDIT B: POLICY RESOLUTION & ADVERSARIAL INPUTS
  // =========================================================================
  describe("Audit B: Policy Resolution & Adversarial Parameter Inputs", () => {
    it("B1: Employee override with invalid NaN string falls back to policy/statutory default", async () => {
      const res = await PayrollPolicyResolver.resolveParameter("ot_rate_normal", {
        businessId: tenant,
        employeeContext: { id: "emp_1", customValue: "INVALID_NUMBER_STRING" },
        canonicalMode: "STRICT",
      });

      expect(res.status).toBe("RESOLVED");
      expect(res.value).toBe(1.5); // Statutory default for ot_rate_normal
      expect(res.source).toBe("GLOBAL_POLICY");
    });

    it("B2: Employee override exceeding statutory upper limit in STRICT mode returns INVALID", async () => {
      const res = await PayrollPolicyResolver.resolveParameter("ot_rate_normal", {
        businessId: tenant,
        employeeContext: { id: "emp_1", customValue: 99.0 }, // Out-of-bounds multiplier > 3.0
        canonicalMode: "STRICT",
      });

      expect(res.status).toBe("INVALID");
      expect(res.value).toBeNull();
      expect(res.source).toBe("EMPLOYEE_OVERRIDE");
    });

    it("B3: Employee override of 0% commission rate is respected as explicit VALID_ZERO override", async () => {
      const res = await PayrollPolicyResolver.resolveParameter("commission_rate", {
        businessId: tenant,
        employeeContext: { id: "emp_1", overrides: { commission_rate: 0 } },
      });

      expect(res.status).toBe("RESOLVED");
      expect(res.value).toBe(0);
      expect(res.source).toBe("EMPLOYEE_OVERRIDE");
    });

    it("B4: Absent tenant policy falls back deterministically to statutory baseline without throwing", async () => {
      const policy = await PayrollPolicyResolver.resolveEffectivePolicy({
        businessId: "biz_non_existent_tenant",
        effectiveDate: "2026-08-01",
      });

      expect(policy.onaEmployeeRate).toBe(0.06);
      expect(policy.onaEmployerRate).toBe(0.06);
      expect(policy.ofatmaEmployeeRate).toBe(0.02);
      expect(policy.ofatmaEmployerRate).toBe(0.03);
      expect(policy.survivalFloorHTG).toBe(15000);
      expect(policy.currency).toBe("HTG");
    });

    it("B5: Engine and TaxPolicyEngine use identical tax rates for identical policy input", () => {
      const rawPolicy = {
        onaEmployeeRate: 0.06,
        onaEmployerRate: 0.06,
        ofatmaEmployeeRate: 0.02,
        ofatmaEmployerRate: 0.03,
        enableTaxes: true,
      };

      const taxEngineRates = TaxPolicyEngine.getTaxRates(rawPolicy);
      const calcEngineRates = resolveTaxRatesForDate(rawPolicy as any, "2026-08-01");

      expect(taxEngineRates.onaEmployee).toBe(calcEngineRates.cnssRateEmployee);
      expect(taxEngineRates.onaEmployer).toBe(calcEngineRates.cnssRateEmployer);
      expect(taxEngineRates.ofatmaEmployee).toBe(calcEngineRates.cnsRateEmployee);
      expect(taxEngineRates.ofatmaEmployer).toBe(calcEngineRates.cnsRateEmployer);
    });
  });

  // =========================================================================
  // AUDIT C: ATTENDANCE, REMUNERATION & ELIGIBILITY MATRIX
  // =========================================================================
  describe("Audit C: Attendance, Remuneration & Eligibility Matrix", () => {
    it("C1: Inactive, Terminated, or Suspended employees are strictly excluded from payroll runs", async () => {
      const activeEmp = makeEmployee({ id: "emp_active", status: "ACTIVE" });
      const inactiveEmp = makeEmployee({ id: "emp_inactive", status: "TERMINATED" });
      const termEmp = makeEmployee({ id: "emp_term", status: "TERMINATED" });
      const suspEmp = makeEmployee({ id: "emp_susp", status: "SUSPENDED" });

      const records = await PayrollService.processPayrollCycle(
        makeCycle(),
        [activeEmp, inactiveEmp, termEmp, suspEmp],
        tenant,
        { policies: { enableTaxes: false } }
      );

      expect(records.length).toBe(1);
      expect(records[0].employeeId).toBe("emp_active");
    });

    it("C2: Salaried worker with 0 worked hours/pointages is automatically excluded per attendance rule", async () => {
      const salariedEmp = makeEmployee({ id: "emp_fixed", paymentModel: "FIXED", salaryBaseHtg: 24000, workedHours: 0 });
      
      const records = await PayrollService.processPayrollCycle(
        makeCycle(),
        [salariedEmp],
        tenant,
        {
          policies: { enableTaxes: false, enableSurvivalFloor: false },
          attendanceRecords: [{ id: "att_1", employeeId: "emp_fixed", date: "2026-08-05", realHours: 0, status: "ABSENT" } as any],
        }
      );

      expect(records.length).toBe(0); // Automatically excluded (0 worked days / pointages)
    });

    it("C3: Hourly worker with unrecorded attendance is excluded when requireAttendanceForPayroll is true", async () => {
      const hourlyEmp = makeEmployee({ id: "emp_hourly", paymentModel: "HOURLY" as any, workedHours: 0 });
      
      const records = await PayrollService.processPayrollCycle(
        makeCycle(),
        [hourlyEmp],
        tenant,
        {
          policies: { requireAttendanceForPayroll: true, enableTaxes: false },
          attendanceRecords: [{ id: "att_other", employeeId: "emp_other", date: "2026-08-05", realHours: 96 } as any],
        }
      );

      expect(records.length).toBe(0); // Hourly worker without attendance is excluded
    });

    it("C4: Commission worker with zero sales receives 0 gross salary without error", async () => {
      const commEmp = makeEmployee({ id: "emp_comm", paymentModel: "COMMISSION" });

      const records = await PayrollService.processPayrollCycle(
        makeCycle(),
        [commEmp],
        tenant,
        {
          policies: { defaultCommissionRate: 0.05, enableTaxes: false, enableSurvivalFloor: false },
          ledgerTransactions: [], // No sales
        }
      );

      expect(records.length).toBe(1);
      expect(records[0].grossSalary).toBe(0);
      expect(records[0].netPaid).toBe(0);
    });
  });

  // =========================================================================
  // AUDIT D: PAYROLL CALCULATION ATTACKS & BOUNDARY CONDITIONS
  // =========================================================================
  describe("Audit D: Payroll Calculation Attacks & Boundary Conditions", () => {
    it("D1: Negative salary base is safely bounded or handled without producing negative deductions", () => {
      const result = calculateEmployeePayrollItem(
        {
          baseSalaryHTG: -5000,
          overtimeHours150: 0,
          overtimeHours200: 0,
          hourlyRateHTG: 0,
          bonusesHTG: 0,
          commissionsHTG: 0,
          advancesHTG: 0,
        },
        tenant,
        "emp_1",
        "2026-08-01",
        { enableTaxes: true, onaEmployeeRate: 0.06, ofatmaEmployeeRate: 0.02 } as any
      );

      expect(result.grossPay).toBeGreaterThanOrEqual(0);
      expect(result.taxDeductions.totalDeductions).toBeGreaterThanOrEqual(0);
    });

    it("D2: Extremely large base salary (1 Billion HTG) processes without integer overflow or NaN", () => {
      const hugeSalary = 1_000_000_000;
      const result = calculateEmployeePayrollItem(
        {
          baseSalaryHTG: hugeSalary,
          overtimeHours150: 0,
          overtimeHours200: 0,
          hourlyRateHTG: 0,
          bonusesHTG: 0,
          commissionsHTG: 0,
          advancesHTG: 0,
        },
        tenant,
        "emp_1",
        "2026-08-01",
        { enableTaxes: true, onaEmployeeRate: 0.06, ofatmaEmployeeRate: 0.02 } as any
      );

      expect(Number.isNaN(result.grossPay)).toBe(false);
      expect(Number.isFinite(result.grossPay)).toBe(true);
      expect(result.grossPay).toBe(1_000_000_000);
      expect(result.taxDeductions.employeeCNSS).toBe(60_000_000); // 6% ONA
    });

    it("D3: Negative overtime hours are ignored and do not reduce gross salary", () => {
      const overtimePay = calculateOvertimePay(100, -10, 0);
      expect(overtimePay).toBe(0);
    });

    it("D4: Combined commissions, overtime, and base salary sum accurately into gross salary", () => {
      const result = calculateEmployeePayrollItem(
        {
          baseSalaryHTG: 12000,
          overtimeHours150: 10,
          overtimeHours200: 0,
          hourlyRateHTG: 125,
          bonusesHTG: 0,
          commissionsHTG: 5000,
          advancesHTG: 0,
        },
        tenant,
        "emp_1",
        "2026-08-01",
        { enableTaxes: false, enableSurvivalFloor: false } as any
      );

      // Base: 12,000 + Overtime: 1,875 + Commission: 5,000 = 18,875 HTG
      expect(result.baseSalary).toBe(12000);
      expect(result.overtimePayout).toBe(1875);
      expect(result.commissions).toBe(5000);
      expect(result.grossPay).toBe(18875);
    });

    it("D5: Survival floor subsidy is correctly added when net pay is below 15,000 HTG minimum", () => {
      const result = calculateEmployeePayrollItem(
        {
          baseSalaryHTG: 10000,
          overtimeHours150: 0,
          overtimeHours200: 0,
          hourlyRateHTG: 0,
          bonusesHTG: 0,
          commissionsHTG: 0,
          advancesHTG: 0,
        },
        tenant,
        "emp_1",
        "2026-08-01",
        { enableTaxes: true, enableSurvivalFloor: true, survivalFloorHTG: 15000, onaEmployeeRate: 0.06, ofatmaEmployeeRate: 0.02 } as any
      );

      expect(result.survivalFloorApplied).toBe(true);
      expect(result.netPay).toBe(15000);
    });

    it("D6: Survival floor subsidy is NOT added when net pay already exceeds 15,000 HTG minimum", () => {
      const result = calculateEmployeePayrollItem(
        {
          baseSalaryHTG: 20000,
          overtimeHours150: 0,
          overtimeHours200: 0,
          hourlyRateHTG: 0,
          bonusesHTG: 0,
          commissionsHTG: 0,
          advancesHTG: 0,
        },
        tenant,
        "emp_1",
        "2026-08-01",
        { enableTaxes: true, enableSurvivalFloor: true, survivalFloorHTG: 15000, onaEmployeeRate: 0.06, ofatmaEmployeeRate: 0.02 } as any
      );

      expect(result.survivalFloorApplied).toBe(false);
      expect(result.netPay).toBe(18400); // 20,000 gross - 1,600 taxes = 18,400 net > 15,000
    });
  });

  // =========================================================================
  // AUDIT E: CONCURRENCY, IDEMPOTENCY & REPLAY SAFETY
  // =========================================================================
  describe("Audit E: Concurrency, Idempotency & Replay Safety", () => {
    it("E1: Re-running payroll calculation on the same cycle is idempotent and replaces prior records", async () => {
      const cycle = makeCycle();
      const emp = makeEmployee();

      const run1 = await PayrollService.processPayrollCycle(cycle, [emp], tenant, { policies: { enableTaxes: false } });
      const run2 = await PayrollService.processPayrollCycle(cycle, [emp], tenant, { policies: { enableTaxes: false } });

      expect(run1.length).toBe(1);
      expect(run2.length).toBe(1);
      expect(run1[0].netPaid).toBe(run2[0].netPaid);
      expect(run1[0].grossSalary).toBe(run2[0].grossSalary);
    });

    it("E2: Sealing a payroll cycle returns empty array (immutability protection) refusing recalculation", async () => {
      const sealedCycle = makeCycle({ status: "SEALED", sealedAt: "2026-08-15T18:00:00Z" });
      const emp = makeEmployee();

      const res = await PayrollService.processPayrollCycle(sealedCycle, [emp], tenant, {});
      expect(res).toEqual([]); // Sealed cycle is immutable and returns empty list
    });
  });

  // =========================================================================
  // AUDIT F: GENERAL LEDGER & DOUBLE-ENTRY BALANCE
  // =========================================================================
  describe("Audit F: General Ledger & Double-Entry Balance", () => {
    it("F1: Stage 1 (Accrual) debits Expense (5100_PAYROLL_EXPENSE) and credits Liabilities without debiting Bank", () => {
      const cycle = makeCycle();
      const record: PayrollRecord = {
        id: "rec_f1",
        cycleId: cycle.id,
        business_id: tenant,
        employeeId: "emp_1",
        employeeName: "Jean Ledger",
        grossSalary: 20000,
        netPaid: 18400,
        cnssDeduction: 1200,
        cnsDeduction: 400,
        totalEmployerCost: 21800,
        advancesTreated: 0,
        bonusesTreated: 0,
      } as any;

      const { transactions, journalEntry } = AccountingEngine.createPayrollJournalEntry(cycle, [record], tenant, undefined, { isAccrualOnly: true });

      expect(journalEntry.isBalanced).toBe(true);

      const debits = transactions.reduce((sum, tx) => sum + (tx.debit || 0), 0);
      const credits = transactions.reduce((sum, tx) => sum + (tx.credit || 0), 0);
      expect(debits).toBe(credits);

      // Verify no Bank account (1010_BANK) is credited during accrual
      const bankTx = transactions.find((tx) => tx.credit_account === "1010_BANK" || tx.debit_account === "1010_BANK");
      expect(bankTx).toBeUndefined();

      // Verify Payroll Expense (5100_PAYROLL_EXPENSE) is debited
      const expTx = transactions.find((tx) => tx.debit_account === "5100_PAYROLL_EXPENSE");
      expect(expTx?.debit).toBe(18400);
    });

    it("F2: Stage 2 (Disbursement) debits Payroll Clearing (2100_PAYROLL_CLEARING) and credits Bank Account (1010_BANK)", () => {
      const cycle = makeCycle({ status: "VALIDATED" });

      const { transactions, journalEntry } = AccountingEngine.createPayrollSettlementEntry(
        cycle,
        18400, // 18,400 HTG total net disbursed
        tenant,
        "1010_BANK",
        "2100_PAYROLL_CLEARING"
      );

      expect(journalEntry.isBalanced).toBe(true);

      const clearingTx = transactions.find((tx) => tx.debit_account === "2100_PAYROLL_CLEARING");
      expect(clearingTx?.debit).toBe(18400);

      const bankTx = transactions.find((tx) => tx.credit_account === "1010_BANK");
      expect(bankTx?.credit).toBe(18400);
    });

    it("F3: Survival Floor subsidy creates a balanced subsidy expense entry", () => {
      const cycle = makeCycle();
      const record: PayrollRecord = {
        id: "rec_floor",
        cycleId: cycle.id,
        business_id: tenant,
        employeeId: "emp_floor",
        employeeName: "Floor Worker",
        grossSalary: 5000,
        cnssDeduction: 300,
        cnsDeduction: 100,
        netPaid: 15000, // 15,000 HTG protected net
        survivalFloorSubsidy: 10400,
        survivalFloorApplied: true,
      } as any;

      const { transactions, journalEntry } = AccountingEngine.createPayrollJournalEntry(cycle, [record], tenant, undefined, { isAccrualOnly: true });

      expect(journalEntry.isBalanced).toBe(true);
    });
  });

  // =========================================================================
  // AUDIT G: HAITIAN STATUTORY COMPLIANCE & LEGAL LIMITS
  // =========================================================================
  describe("Audit G: Haitian Statutory Compliance & Legal Limits", () => {
    it("G1: ONA rates default strictly to 6% Employee and 6% Employer", () => {
      const defaults = resolveTaxRatesForDate(null, "2026-08-01");
      expect(defaults.cnssRateEmployee).toBe(0.06);
      expect(defaults.cnssRateEmployer).toBe(0.06);
    });

    it("G2: OFATMA rates default strictly to 2% Employee and 3% Employer", () => {
      const defaults = resolveTaxRatesForDate(null, "2026-08-01");
      expect(defaults.cnsRateEmployee).toBe(0.02);
      expect(defaults.cnsRateEmployer).toBe(0.03);
    });

    it("G3: Survival floor default threshold is strictly set to 15,000 HTG", () => {
      const defaults = resolveTaxRatesForDate(null, "2026-08-01");
      expect(defaults.survivalFloorHTG).toBe(15000);
    });
  });

  // =========================================================================
  // AUDIT H: SECURITY & MULTI-TENANT ISOLATION
  // =========================================================================
  describe("Audit H: Security & Multi-Tenant Isolation", () => {
    it("H1: Employee from Tenant Alpha is strictly excluded when processing Tenant Beta payroll cycle", async () => {
      const alphaEmp = makeEmployee({ id: "emp_alpha", business_id: "tenant_alpha", businessId: "tenant_alpha" });
      const betaEmp = makeEmployee({ id: "emp_beta", business_id: "tenant_beta", businessId: "tenant_beta" });

      const records = await PayrollService.processPayrollCycle(
        makeCycle({ business_id: "tenant_beta" }),
        [alphaEmp, betaEmp],
        "tenant_beta",
        { policies: { enableTaxes: false } }
      );

      expect(records.length).toBe(1);
      expect(records[0].employeeId).toBe("emp_beta");
      expect(records[0].business_id).toBe("tenant_beta");
    });

    it("H2: Contradictory tenant IDs on employee record (business_id != businessId) trigger security exclusion", async () => {
      const badEmp = makeEmployee({
        id: "emp_corrupted",
        business_id: "tenant_alpha",
        businessId: "tenant_beta", // Contradictory tenant IDs!
      });

      const records = await PayrollService.processPayrollCycle(
        makeCycle({ business_id: "tenant_alpha" }),
        [badEmp],
        "tenant_alpha",
        { policies: { enableTaxes: false } }
      );

      expect(records.length).toBe(0); // Excluded due to tenant contamination
    });
  });
});
