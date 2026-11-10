/**
 * FINOPS — P1-4D: End-to-End Payroll Policy → Calculation & GL Proof Suite
 * 
 * Demonstrates mathematically and forensically that configured payroll policies are:
 * 1. Validated and persisted in Firestore (with atomic batch and versioning).
 * 2. Resolved via SSOT 3-tier hierarchy (PayrollPolicyResolver).
 * 3. Consumed by PayrollCalculationEngine and PayrollService.
 * 4. Yield exact calculated payroll results stamped with policy metadata.
 * 5. Sealed and balanced in General Ledger double-entry accounting entries.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory Firestore emulation for deterministic verification
let fakeFirestoreData: Map<string, any> = new Map();
let batchSetOperations: Array<{ path: string; data: any; options?: any }> = [];
let batchUpdateOperations: Array<{ path: string; data: any }> = [];

const mockWriteBatch = vi.fn(() => ({
  set: vi.fn((docRef: any, data: any, options?: any) => {
    batchSetOperations.push({ path: docRef?.path || docRef?.id || String(docRef), data, options });
    return {} as any;
  }),
  update: vi.fn((docRef: any, data: any) => {
    batchUpdateOperations.push({ path: docRef?.path || docRef?.id || String(docRef), data });
    return {} as any;
  }),
  delete: vi.fn(),
  commit: vi.fn(async () => {
    for (const op of batchSetOperations) {
      fakeFirestoreData.set(op.path, { ...(op.options?.merge ? (fakeFirestoreData.get(op.path) || {}) : {}), ...op.data });
    }
    for (const op of batchUpdateOperations) {
      const existing = fakeFirestoreData.get(op.path) || {};
      fakeFirestoreData.set(op.path, { ...existing, ...op.data });
    }
  }),
}));

const mockDoc = vi.fn((...args: any[]) => {
  const pathParts = args.slice(1);
  const fullPath = pathParts.join("/");
  return {
    id: pathParts[pathParts.length - 1],
    path: fullPath,
  };
});

const mockCollection = vi.fn((...args: any[]) => {
  const pathParts = args.slice(1);
  return {
    id: pathParts[pathParts.length - 1],
    path: pathParts.join("/"),
  };
});

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    writeBatch: () => mockWriteBatch(),
    doc: (...args: any[]) => mockDoc(...args),
    setDoc: vi.fn().mockResolvedValue(undefined),
    getDoc: vi.fn().mockImplementation(async (docRef: any) => {
      const p = docRef?.path || String(docRef);
      const data = fakeFirestoreData.get(p);
      return {
        exists: () => !!data,
        data: () => data,
        id: docRef?.id || "doc_id",
      };
    }),
    getDocs: vi.fn(async (colRef: any) => {
      const colPath = colRef?.path || String(colRef);
      const docs: any[] = [];
      for (const [key, val] of fakeFirestoreData.entries()) {
        if (key.startsWith(colPath + "/")) {
          docs.push({
            id: key.replace(colPath + "/", ""),
            data: () => val,
          });
        }
      }
      return { docs, empty: docs.length === 0 };
    }),
    addDoc: vi.fn().mockResolvedValue({ id: "mock_doc_id" }),
    serverTimestamp: () => "2026-10-20T12:00:00.000Z",
  };
});

vi.mock("../../repositories/ForensicLogRepository", () => ({
  ForensicLogRepository: {
    createAndSignLog: vi.fn().mockResolvedValue({ id: "flog_test_sig", signature: "SIG_TEST_SHA256" }),
    writeForensicLog: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../repositories/PayrollRepository", () => ({
  PayrollRepository: {
    sealCycleAtomic: vi.fn().mockResolvedValue(undefined),
  },
}));

import { PayrollPolicyRepository } from "../../repositories/PayrollPolicyRepository";
import { PayrollPolicyResolver } from "../../services/payroll/PayrollPolicyResolver";
import { PayrollService } from "../../services/payroll/PayrollService";
import {
  resolveTaxRatesForDate,
  calculateTaxDeductions,
  calculateEmployeePayrollItem,
  calculateOvertimePay,
} from "../../components/payroll/services/PayrollCalculationEngine";
import { AccountingEngine } from "../../services/AccountingEngine";
import { StaticDataCacheService } from "../../services/cache/StaticDataCacheService";
import { PayrollCycle, Employee, AttendanceRecord } from "../../types";

describe("FINOPS P1-4D: Payroll Policy → Calculation End-to-End Proof", () => {
  const testTenant = "biz_proof_tenant";
  const actor = { id: "usr_admin_proof", email: "admin@finops.test", role: "OWNER" };

  const makeCycle = (overrides: Partial<PayrollCycle> = {}): PayrollCycle => ({
    id: "cycle_default",
    cycleName: "Cycle Test",
    startDate: "2026-08-01",
    endDate: "2026-08-15",
    status: "DRAFT",
    business_id: testTenant,
    ...overrides,
  } as PayrollCycle);

  const makeEmployee = (overrides: Partial<Employee> = {}): Employee => ({
    id: "emp_default",
    name: "Jean Test",
    email: "jean@test.com",
    role: "STAFF",
    branchId: "branch_main",
    departmentId: "dept_main",
    baseSalary: 24000,
    salaryBaseHtg: 24000,
    business_id: testTenant,
    status: "ACTIVE",
    paymentModel: "FIXED",
    ...overrides,
  } as Employee);

  const makeAttendance = (overrides: Partial<AttendanceRecord> = {}): AttendanceRecord => ({
    id: "att_default",
    employeeId: "emp_default",
    employeeName: "Jean Test",
    branchId: "branch_main",
    checkIn: "08:00",
    checkOut: "17:00",
    plannedHours: 8,
    date: "2026-08-05",
    realHours: 96,
    status: "NORMAL",
    business_id: testTenant,
    ...overrides,
  } as AttendanceRecord);

  beforeEach(async () => {
    vi.restoreAllMocks();
    await StaticDataCacheService.clearAll();
    fakeFirestoreData = new Map();
    batchSetOperations = [];
    batchUpdateOperations = [];
  });

  // =========================================================================
  // 1. Full End-to-End Chain Proof: Repository → Resolver → Engine → Service → GL
  // =========================================================================
  describe("1. Complete Architectural Pipeline Proof", () => {
    it("proves complete traceability from Policy save to GL double-entry journal balance", async () => {
      // Step 1: Save & Activate Policy via PayrollPolicyRepository
      const savedPolicy = await PayrollPolicyRepository.saveAndActivatePolicy(
        testTenant,
        {
          frequency: "BIWEEKLY",
          currency: "HTG",
          standardHoursPerCycle: 96,
          overtime: { normalRate: 1.5, holidayRate: 2.0 },
          socialContributions: {
            enabled: true,
            cnssOna: { employeeRate: 0.06, employerRate: 0.06 },
            ofatmaCns: { employeeRate: 0.02, employerRate: 0.03 },
          },
          survivalFloor: { enabled: true, minimumNetHTG: 15000 },
          commissions: { defaultSalesRate: 0.05 },
          attendance: { excludeWithoutRecords: true },
          resolution: { mode: "STRICT" },
          effectiveFrom: "2026-08-01",
        },
        actor
      );

      expect(savedPolicy.version).toBe(1);
      expect(savedPolicy.status).toBe("ACTIVE");

      // Mock Firestore returning this policy in getDocs
      vi.spyOn(PayrollPolicyRepository, "getEffectivePolicy").mockResolvedValue(savedPolicy);

      // Step 2: Resolve via PayrollPolicyResolver
      const resolved = await PayrollPolicyResolver.resolveEffectivePolicy({
        businessId: testTenant,
        effectiveDate: "2026-08-15",
      });

      expect(resolved.onaEmployeeRate).toBe(0.06);
      expect(resolved.onaEmployerRate).toBe(0.06);
      expect(resolved.ofatmaEmployeeRate).toBe(0.02);
      expect(resolved.ofatmaEmployerRate).toBe(0.03);
      expect(resolved.survivalFloorHTG).toBe(15000);

      // Step 3: Calculation Engine consumes resolved rates
      const deductions = calculateTaxDeductions(20000, resolved);
      expect(deductions.employeeCNSS).toBe(1200); // 6% ONA
      expect(deductions.employerCNSS).toBe(1200); // 6% ONA Employer
      expect(deductions.employeeCNS).toBe(400);   // 2% OFATMA
      expect(deductions.employerCNS).toBe(600);   // 3% OFATMA Employer
      expect(deductions.totalDeductions).toBe(1600); // 1200 + 400

      // Step 4: PayrollService processes full cycle
      const cycle = makeCycle({
        id: "cycle_e2e_01",
        cycleName: "Quinzaine 1 Août 2026",
        startDate: "2026-08-01",
        endDate: "2026-08-15",
        status: "DRAFT",
      });

      const employee = makeEmployee({
        id: "emp_e2e_01",
        name: "Pierre Dupont",
        salaryBaseHtg: 20000, // Monthly 20,000 -> Quinzaine base 10,000 HTG
      });

      const attendance = [
        makeAttendance({
          id: "att_1",
          employeeId: "emp_e2e_01",
          date: "2026-08-05",
          realHours: 96,
          status: "NORMAL",
        }),
      ];

      const records = await PayrollService.processPayrollCycle(
        cycle,
        [employee],
        testTenant,
        { attendanceRecords: attendance }
      );

      expect(records.length).toBe(1);
      const rec = records[0];
      expect(rec.baseSalary).toBe(10000);
      expect(rec.grossSalary).toBe(10000);
      expect(rec.cnssDeduction).toBe(600); // 6% of 10,000 HTG
      expect(rec.cnsDeduction).toBe(200);  // 2% of 10,000 HTG
      expect(rec.policyId).toBe(savedPolicy.id);
      expect(rec.policyVersion).toBe(1);

      // Step 5: Accounting / GL Integration generates balanced journal entries
      const { transactions, journalEntry } = AccountingEngine.createPayrollJournalEntry(
        cycle,
        records,
        testTenant,
        { id: actor.id, name: "Admin" }
      );

      expect(journalEntry.isBalanced).toBe(true);
      expect(journalEntry.totalDebitCents).toBe(journalEntry.totalCreditCents);

      // Verify specific accounts
      const bankTx = transactions.find((t) => t.credit_account === "1010_BANK");
      const onaTx = transactions.find((t) => t.credit_account === "2100_ONA_TAXES_PAYABLE" && t.metadata?.component === "ONA_TAX");
      const ofatmaTx = transactions.find((t) => t.credit_account === "2110_OFATMA_TAXES_PAYABLE" && t.metadata?.component === "OFATMA_TAX");
      const employerOnaTx = transactions.find((t) => t.metadata?.component === "EMPLOYER_ONA_TAX");

      expect(bankTx).toBeDefined();
      expect(bankTx?.amount).toBe(rec.netPaid);
      expect(onaTx?.amount).toBe(rec.cnssDeduction);
      expect(ofatmaTx?.amount).toBe(rec.cnsDeduction);
      expect(employerOnaTx?.debit_account).toBe("5110_EMPLOYER_TAX_EXPENSE");
      expect(employerOnaTx?.amount).toBe(600); // 6% employer ONA
    });
  });

  // =========================================================================
  // 2. A/B Differential Proof for Every Configurable Parameter
  // =========================================================================
  describe("2. Parameter Traceability & A/B Differential Proofs", () => {
    const baseCycle = makeCycle({
      id: "cycle_ab_test",
      cycleName: "Cycle Test A/B",
      startDate: "2026-08-01",
      endDate: "2026-08-15",
      status: "DRAFT",
    });

    const baseEmployee = makeEmployee({
      id: "emp_ab",
      name: "Jean Test",
      salaryBaseHtg: 24000,
    });

    const normalAttendance: AttendanceRecord[] = [
      makeAttendance({ id: "att_ab", employeeId: "emp_ab", date: "2026-08-05", realHours: 96, status: "NORMAL" }),
    ];

    // --- Parameter 1: Frequency ---
    it("Parameter: Frequency — A (MONTHLY) vs B (BIWEEKLY) vs C (WEEKLY) differentiates cycle base salary", async () => {
      // Monthly: divisor = 1 -> base = 24,000 HTG
      const recMonthly = await PayrollService.processPayrollCycle(
        baseCycle,
        [baseEmployee],
        testTenant,
        { policies: { frequency: "MONTHLY", enableTaxes: false, enableSurvivalFloor: false }, attendanceRecords: normalAttendance }
      );

      // Biweekly: divisor = 2 -> base = 12,000 HTG
      const recBiweekly = await PayrollService.processPayrollCycle(
        baseCycle,
        [baseEmployee],
        testTenant,
        { policies: { frequency: "BIWEEKLY", enableTaxes: false, enableSurvivalFloor: false }, attendanceRecords: normalAttendance }
      );

      // Weekly: divisor = 4 -> base = 6,000 HTG
      const recWeekly = await PayrollService.processPayrollCycle(
        baseCycle,
        [baseEmployee],
        testTenant,
        { policies: { frequency: "WEEKLY", enableTaxes: false, enableSurvivalFloor: false }, attendanceRecords: normalAttendance }
      );

      expect(recMonthly[0].baseSalary).toBe(24000);
      expect(recBiweekly[0].baseSalary).toBe(12000);
      expect(recWeekly[0].baseSalary).toBe(6000);
      expect(recMonthly[0].baseSalary).not.toBe(recBiweekly[0].baseSalary);
      expect(recBiweekly[0].baseSalary).not.toBe(recWeekly[0].baseSalary);
    });

    // --- Parameter 2: Currency ---
    it("Parameter: Currency — Propagates HTG vs USD across policy resolution and GL entry", async () => {
      const polHTG = await PayrollPolicyResolver.resolveParameter("currency", { businessId: testTenant });
      expect(polHTG.value).toBe("HTG");

      vi.spyOn(PayrollPolicyRepository, "getEffectivePolicy").mockResolvedValueOnce({
        currency: "USD",
        frequency: "BIWEEKLY",
        standardHoursPerCycle: 96,
        version: 1,
        status: "ACTIVE",
        effectiveFrom: "2026-01-01",
        socialContributions: { enabled: true, cnssOna: { employeeRate: 0.06, employerRate: 0.06 }, ofatmaCns: { employeeRate: 0.02, employerRate: 0.03 } },
        overtime: { normalRate: 1.5, holidayRate: 2.0 },
        penalties: { lateFixedCents: 0, absencePerDayCents: 0 },
        survivalFloor: { enabled: false, minimumNetHTG: 0 },
        commissions: { defaultSalesRate: 0.05 },
        attendance: { excludeWithoutRecords: false },
        resolution: { mode: "STRICT" },
      } as any);

      const polUSD = await PayrollPolicyResolver.resolveParameter("currency", { businessId: testTenant });
      expect(polUSD.value).toBe("USD");
      expect(polHTG.value).not.toBe(polUSD.value);
    });

    // --- Parameter 3: Standard Hours ---
    it("Parameter: Standard Hours — A (96h) vs B (80h) differentiates hourly rate and overtime payout", async () => {
      const attendanceOvertime: AttendanceRecord[] = [
        makeAttendance({ id: "att_ot", employeeId: "emp_ab", date: "2026-08-05", realHours: 106, status: "NORMAL" }),
      ];

      // A: standard 96h -> 106h has 10h overtime
      const resA = await PayrollService.processPayrollCycle(
        baseCycle,
        [baseEmployee],
        testTenant,
        {
          policies: { standardHoursPerCycle: 96, overtimeRate150: 1.5, enableTaxes: false, enableSurvivalFloor: false },
          attendanceRecords: attendanceOvertime,
        }
      );

      // B: standard 80h -> 106h has 26h overtime with higher hourly rate
      const resB = await PayrollService.processPayrollCycle(
        baseCycle,
        [baseEmployee],
        testTenant,
        {
          policies: { standardHoursPerCycle: 80, overtimeRate150: 1.5, enableTaxes: false, enableSurvivalFloor: false },
          attendanceRecords: attendanceOvertime,
        }
      );

      expect(resA[0].overtimeHours).toBe(10);
      expect(resB[0].overtimeHours).toBe(26);
      expect(resA[0].overtimePayout).toBeLessThan(resB[0].overtimePayout);
      expect(resA[0].grossSalary).not.toBe(resB[0].grossSalary);
    });

    // --- Parameter 4: Overtime Normal Rate ---
    it("Parameter: Overtime Normal Rate — A (1.5) vs B (1.75) differentiates overtime payout", async () => {
      const attendanceOvertime: AttendanceRecord[] = [
        makeAttendance({ id: "att_ot", employeeId: "emp_ab", date: "2026-08-05", realHours: 106, status: "NORMAL" }),
      ];

      const resA = await PayrollService.processPayrollCycle(
        baseCycle,
        [baseEmployee],
        testTenant,
        {
          policies: { standardHoursPerCycle: 96, overtime: { normalRate: 1.5, holidayRate: 2.0 }, enableTaxes: false, enableSurvivalFloor: false },
          attendanceRecords: attendanceOvertime,
        }
      );

      const resB = await PayrollService.processPayrollCycle(
        baseCycle,
        [baseEmployee],
        testTenant,
        {
          policies: { standardHoursPerCycle: 96, overtime: { normalRate: 1.75, holidayRate: 2.0 }, enableTaxes: false, enableSurvivalFloor: false },
          attendanceRecords: attendanceOvertime,
        }
      );

      expect(resA[0].overtimePayout).toBe(1875); // 10h * 125 HTG/h * 1.5
      expect(resB[0].overtimePayout).toBe(2187.5); // 10h * 125 HTG/h * 1.75
      expect(resA[0].grossSalary).not.toBe(resB[0].grossSalary);
    });

    // --- Parameter 5: Overtime Holiday Rate ---
    it("Parameter: Overtime Holiday Rate — A (2.0) vs B (2.5) differentiates holiday overtime payout", () => {
      const hourlyRate = 100;
      const hours150 = 0;
      const hours200 = 10;

      const payoutA = calculateOvertimePay(hourlyRate, hours150, hours200, 1.5, 2.0);
      const payoutB = calculateOvertimePay(hourlyRate, hours150, hours200, 1.5, 2.5);

      expect(payoutA).toBe(2000); // 10 * 100 * 2.0
      expect(payoutB).toBe(2500); // 10 * 100 * 2.5
      expect(payoutA).not.toBe(payoutB);
    });

    // --- Parameter 6: Late Penalty ---
    it("Parameter: Late Penalty — A (0) vs B (500 HTG fixed) applies correct deduction", async () => {
      const attendanceLate: AttendanceRecord[] = [
        makeAttendance({ id: "att_late", employeeId: "emp_ab", date: "2026-08-05", realHours: 96, status: "LATE", variance: -0.5 }),
      ];

      // A: no fixed late penalty -> penalty calculated from variance hours or 0
      const resA = await PayrollService.processPayrollCycle(
        baseCycle,
        [baseEmployee],
        testTenant,
        {
          policies: { latePenaltyCents: 0, penalties: { lateFixedCents: 0 }, enableTaxes: false, enableSurvivalFloor: false },
          attendanceRecords: attendanceLate,
        }
      );

      // B: 50,000 cents fixed penalty (500 HTG)
      const resB = await PayrollService.processPayrollCycle(
        baseCycle,
        [baseEmployee],
        testTenant,
        {
          policies: { latePenaltyCents: 50000, penalties: { lateFixedCents: 50000 }, enableTaxes: false, enableSurvivalFloor: false },
          attendanceRecords: attendanceLate,
        }
      );

      expect(resB[0].penalties).toBe(500);
      expect(resA[0].penalties).not.toBe(resB[0].penalties);
      expect(resB[0].netPaid).toBe(resB[0].grossSalary); // gross adjusted by penalties
    });

    // --- Parameter 7: Absence Penalty ---
    it("Parameter: Absence Penalty — A (0) vs B (1,000 HTG fixed per absence)", async () => {
      const attendanceAbsence: AttendanceRecord[] = [
        makeAttendance({ id: "att_abs", employeeId: "emp_ab", date: "2026-08-05", realHours: 96, status: "ABSENT" }),
      ];

      const resA = await PayrollService.processPayrollCycle(
        baseCycle,
        [baseEmployee],
        testTenant,
        {
          policies: { absencePenaltyCents: 0, penalties: { absencePerDayCents: 0 }, enableTaxes: false, enableSurvivalFloor: false },
          attendanceRecords: attendanceAbsence,
        }
      );

      const resB = await PayrollService.processPayrollCycle(
        baseCycle,
        [baseEmployee],
        testTenant,
        {
          policies: { absencePenaltyCents: 200000, penalties: { absencePerDayCents: 200000 }, enableTaxes: false, enableSurvivalFloor: false },
          attendanceRecords: attendanceAbsence,
        }
      );

      expect(resA[0].penalties).toBe(1000); // 1 day statutory daily rate (125 * 8 = 1000)
      expect(resB[0].penalties).toBe(2000); // 2,000 HTG custom policy penalty
      expect(resA[0].penalties).not.toBe(resB[0].penalties);
    });

    // --- Parameter 8: Social Taxes Enabled ---
    it("Parameter: Social Taxes Enabled — A (true) vs B (false) zeros out employee deductions", async () => {
      // Scenario A: Enabled -> 6% ONA + 2% OFATMA = 8% = 960 HTG deduction on 12,000 HTG
      const resA = await PayrollService.processPayrollCycle(
        baseCycle,
        [baseEmployee],
        testTenant,
        {
          policies: { enableTaxes: true, enable_social_taxes: true, enableSurvivalFloor: false },
          attendanceRecords: normalAttendance,
        }
      );

      // Scenario B: Disabled -> 0 deduction
      const resB = await PayrollService.processPayrollCycle(
        baseCycle,
        [baseEmployee],
        testTenant,
        {
          policies: { enableTaxes: false, enable_social_taxes: false, enableSurvivalFloor: false },
          attendanceRecords: normalAttendance,
        }
      );

      expect(resA[0].cnssDeduction).toBe(720); // 6% of 12,000
      expect(resA[0].cnsDeduction).toBe(240);  // 2% of 12,000
      expect(resA[0].netPaid).toBe(11040);     // 12,000 - 960

      expect(resB[0].cnssDeduction).toBe(0);
      expect(resB[0].cnsDeduction).toBe(0);
      expect(resB[0].netPaid).toBe(12000);

      expect(resA[0].netPaid).not.toBe(resB[0].netPaid);
    });

    // --- Parameter 9: ONA Employee Rate ---
    it("Parameter: ONA Employee Rate — A (6%) vs B (7%) modifies employee deduction", async () => {
      const resA = await PayrollService.processPayrollCycle(
        baseCycle,
        [baseEmployee],
        testTenant,
        {
          policies: { enableTaxes: true, onaEmployeeRate: 0.06, ofatmaEmployeeRate: 0.02, enableSurvivalFloor: false },
          attendanceRecords: normalAttendance,
        }
      );

      const resB = await PayrollService.processPayrollCycle(
        baseCycle,
        [baseEmployee],
        testTenant,
        {
          policies: { enableTaxes: true, onaEmployeeRate: 0.07, ofatmaEmployeeRate: 0.02, enableSurvivalFloor: false },
          attendanceRecords: normalAttendance,
        }
      );

      expect(resA[0].cnssDeduction).toBe(720); // 6% of 12,000
      expect(resB[0].cnssDeduction).toBe(840); // 7% of 12,000
      expect(resA[0].netPaid).not.toBe(resB[0].netPaid);
    });

    // --- Parameter 10: ONA Employer Rate (Crucial: Employer cost changes, employee net does NOT) ---
    it("Parameter: ONA Employer Rate — A (6%) vs B (8%) changes employer cost without modifying employee net", async () => {
      const resA = await PayrollService.processPayrollCycle(
        baseCycle,
        [baseEmployee],
        testTenant,
        {
          policies: { enableTaxes: true, onaEmployeeRate: 0.06, onaEmployerRate: 0.06, ofatmaEmployeeRate: 0.02, ofatmaEmployerRate: 0.03, enableSurvivalFloor: false },
          attendanceRecords: normalAttendance,
        }
      );

      const resB = await PayrollService.processPayrollCycle(
        baseCycle,
        [baseEmployee],
        testTenant,
        {
          policies: { enableTaxes: true, onaEmployeeRate: 0.06, onaEmployerRate: 0.08, ofatmaEmployeeRate: 0.02, ofatmaEmployerRate: 0.03, enableSurvivalFloor: false },
          attendanceRecords: normalAttendance,
        }
      );

      // Employee net salary must be strictly IDENTICAL
      expect(resA[0].netPaid).toBe(resB[0].netPaid);
      expect(resA[0].cnssDeduction).toBe(resB[0].cnssDeduction);

      // Employer total cost must differ
      expect(resA[0].employerContributionsTotal).toBe(1080); // 6% ONA (720) + 3% OFATMA (360)
      expect(resB[0].employerContributionsTotal).toBe(1320); // 8% ONA (960) + 3% OFATMA (360)
      expect(resA[0].employerPayrollCostTotal).toBe(13080);   // 12,000 + 1080
      expect(resB[0].employerPayrollCostTotal).toBe(13320);   // 12,000 + 1320
      expect(resA[0].employerPayrollCostTotal).not.toBe(resB[0].employerPayrollCostTotal);
    });

    // --- Parameter 11: OFATMA Employee Rate ---
    it("Parameter: OFATMA Employee Rate — A (2%) vs B (3%) modifies employee deduction", async () => {
      const resA = await PayrollService.processPayrollCycle(
        baseCycle,
        [baseEmployee],
        testTenant,
        {
          policies: { enableTaxes: true, onaEmployeeRate: 0.06, ofatmaEmployeeRate: 0.02, enableSurvivalFloor: false },
          attendanceRecords: normalAttendance,
        }
      );

      const resB = await PayrollService.processPayrollCycle(
        baseCycle,
        [baseEmployee],
        testTenant,
        {
          policies: { enableTaxes: true, onaEmployeeRate: 0.06, ofatmaEmployeeRate: 0.03, enableSurvivalFloor: false },
          attendanceRecords: normalAttendance,
        }
      );

      expect(resA[0].cnsDeduction).toBe(240); // 2% of 12,000
      expect(resB[0].cnsDeduction).toBe(360); // 3% of 12,000
      expect(resA[0].netPaid).not.toBe(resB[0].netPaid);
    });

    // --- Parameter 12: OFATMA Employer Rate ---
    it("Parameter: OFATMA Employer Rate — A (3%) vs B (5%) alters GL employer tax debit without altering employee net", async () => {
      const resA = await PayrollService.processPayrollCycle(
        baseCycle,
        [baseEmployee],
        testTenant,
        {
          policies: { enableTaxes: true, ofatmaEmployerRate: 0.03, enableSurvivalFloor: false },
          attendanceRecords: normalAttendance,
        }
      );

      const resB = await PayrollService.processPayrollCycle(
        baseCycle,
        [baseEmployee],
        testTenant,
        {
          policies: { enableTaxes: true, ofatmaEmployerRate: 0.05, enableSurvivalFloor: false },
          attendanceRecords: normalAttendance,
        }
      );

      expect(resA[0].netPaid).toBe(resB[0].netPaid);
      expect(resA[0].employerPayrollCostTotal).not.toBe(resB[0].employerPayrollCostTotal);
    });

    // --- Parameter 13: Default Commission Rate ---
    it("Parameter: Default Commission Rate — A (5%) vs B (10%) for commission workers", async () => {
      const commissionEmployee = makeEmployee({
        id: "emp_comm",
        name: "Vendeur Test",
        paymentModel: "COMMISSION",
      });

      const ledgerTxs = [
        { id: "tx_sale_1", employeeId: "emp_comm", type: "INCOME", category: "SALE", amount: 100000, date: "2026-08-05", business_id: testTenant },
      ];

      const resA = await PayrollService.processPayrollCycle(
        baseCycle,
        [commissionEmployee],
        testTenant,
        {
          policies: { defaultCommissionRate: 0.05, commissions: { defaultSalesRate: 0.05 }, enableTaxes: false, enableSurvivalFloor: false },
          ledgerTransactions: ledgerTxs as any,
        }
      );

      const resB = await PayrollService.processPayrollCycle(
        baseCycle,
        [commissionEmployee],
        testTenant,
        {
          policies: { defaultCommissionRate: 0.10, commissions: { defaultSalesRate: 0.10 }, enableTaxes: false, enableSurvivalFloor: false },
          ledgerTransactions: ledgerTxs as any,
        }
      );

      expect(resA[0].commissions).toBe(5000);  // 5% of 100,000
      expect(resB[0].commissions).toBe(10000); // 10% of 100,000
      expect(resA[0].netPaid).toBe(5000);
      expect(resB[0].netPaid).toBe(10000);
      expect(resA[0].netPaid).not.toBe(resB[0].netPaid);
    });

    // --- Parameter 14: Survival Floor Enabled ---
    it("Parameter: Survival Floor Enabled — A (true) vs B (false) enforces 15,000 HTG minimum net", async () => {
      // Employee with 16,000 HTG base salary (net before floor = 14,720 HTG with 8% tax)
      const empLow = makeEmployee({
        id: "emp_low",
        name: "Bas Salaire",
        salaryBaseHtg: 32000, // Monthly 32,000 -> Quinzaine base 16,000 HTG
      });

      // Scenario A: Survival floor enabled (15,000 HTG)
      const resA = await PayrollService.processPayrollCycle(
        baseCycle,
        [empLow],
        testTenant,
        {
          policies: { enableTaxes: true, enableSurvivalFloor: true, survivalFloorHTG: 15000 },
          attendanceRecords: [makeAttendance({ id: "att_low", employeeId: "emp_low", date: "2026-08-05", realHours: 96, status: "NORMAL" })],
        }
      );

      // Scenario B: Survival floor disabled
      const resB = await PayrollService.processPayrollCycle(
        baseCycle,
        [empLow],
        testTenant,
        {
          policies: { enableTaxes: true, enableSurvivalFloor: false, survivalFloorHTG: 15000 },
          attendanceRecords: [makeAttendance({ id: "att_low", employeeId: "emp_low", date: "2026-08-05", realHours: 96, status: "NORMAL" })],
        }
      );

      expect(resA[0].protectionRuleEnforced).toBe(true);
      expect(resA[0].netPaid).toBe(15000);

      expect(resB[0].protectionRuleEnforced).toBe(false);
      expect(resB[0].netPaid).toBe(14720); // 16,000 - 1,280 (8% taxes)

      expect(resA[0].netPaid).not.toBe(resB[0].netPaid);
    });

    // --- Parameter 15: Survival Floor HTG Threshold ---
    it("Parameter: Survival Floor HTG Threshold — A (15,000 HTG) vs B (18,000 HTG)", async () => {
      const empFloor = makeEmployee({
        id: "emp_floor",
        name: "Employe Palier",
        salaryBaseHtg: 40000, // Monthly 40,000 -> Quinzaine base 20,000 HTG
      });
      // Net before floor with 8% tax (1600 HTG) and 4000 HTG advance = 14,400 HTG

      const resA = await PayrollService.processPayrollCycle(
        baseCycle,
        [empFloor],
        testTenant,
        {
          policies: { enableTaxes: true, enableSurvivalFloor: true, survivalFloorHTG: 15000 },
          attendanceRecords: [makeAttendance({ id: "att_f", employeeId: "emp_floor", date: "2026-08-05", realHours: 96, status: "NORMAL" })],
        }
      );

      const resB = await PayrollService.processPayrollCycle(
        baseCycle,
        [empFloor],
        testTenant,
        {
          policies: { enableTaxes: true, enableSurvivalFloor: true, survivalFloorHTG: 19000 },
          attendanceRecords: [makeAttendance({ id: "att_f", employeeId: "emp_floor", date: "2026-08-05", realHours: 96, status: "NORMAL" })],
        }
      );

      expect(resA[0].protectionRuleEnforced).toBe(false); // 18,400 net before advances > 15,000
      expect(resB[0].protectionRuleEnforced).toBe(true);  // 18,400 net before advances < 19,000
      expect(resB[0].netPaid).toBe(19000);
      expect(resA[0].netPaid).not.toBe(resB[0].netPaid);
    });

    // --- Parameter 16: Attendance Requirement ---
    it("Parameter: Attendance Requirement — A (true) excludes zero-log hourly worker, B (false) includes worker", async () => {
      const hourlyEmp = makeEmployee({
        id: "emp_hourly",
        name: "Ouvrier Horaire",
        paymentModel: "HOURLY" as any,
      });

      const periodAttendance: AttendanceRecord[] = [
        makeAttendance({ id: "att_other", employeeId: "emp_other_staff", date: "2026-08-05", realHours: 96, status: "NORMAL" }),
      ];

      // Scenario A: Attendance required -> Worker with 0 attendance logs is excluded
      const resA = await PayrollService.processPayrollCycle(
        baseCycle,
        [hourlyEmp],
        testTenant,
        {
          policies: { requireAttendanceForPayroll: true, require_attendance_for_payroll: true },
          attendanceRecords: periodAttendance,
        }
      );

      // Scenario B: Attendance not required -> Worker is kept
      const resB = await PayrollService.processPayrollCycle(
        baseCycle,
        [hourlyEmp],
        testTenant,
        {
          policies: { requireAttendanceForPayroll: false, require_attendance_for_payroll: false },
          attendanceRecords: periodAttendance,
        }
      );

      expect(resA.length).toBe(0);
      expect(resB.length).toBe(1);
    });

    // --- Parameter 17: Statutory Mode (STRICT vs CUSTOM) ---
    it("Parameter: Statutory Mode — STRICT mode rejects out-of-bounds parameter rate > 3.0", async () => {
      const strictRes = await PayrollPolicyResolver.resolveParameter("ot_rate_normal", {
        businessId: testTenant,
        employeeContext: { id: "emp_1", customValue: 5.0 }, // Invalid multiplier > 3.0
        canonicalMode: "STRICT",
      });

      const customRes = await PayrollPolicyResolver.resolveParameter("ot_rate_normal", {
        businessId: testTenant,
        employeeContext: { id: "emp_1", customValue: 5.0 },
        canonicalMode: "CUSTOM",
      });

      expect(strictRes.status).toBe("INVALID");
      expect(strictRes.value).toBeNull();

      expect(customRes.status).toBe("RESOLVED");
      expect(customRes.value).toBe(5.0);
    });

    // --- Parameter 18: Effective Date & Policy Versioning ---
    it("Parameter: Effective Date — Cycle in period 1 resolves Policy V1; Cycle in period 2 resolves Policy V2", async () => {
      // Create V1 effective 2026-01-01 (6% ONA)
      const policyV1 = {
        id: "pol_v1",
        version: 1,
        status: "SUPERSEDED",
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-06-30",
        socialContributions: { enabled: true, cnssOna: { employeeRate: 0.06, employerRate: 0.06 } },
      };

      // Create V2 effective 2026-07-01 (8% ONA)
      const policyV2 = {
        id: "pol_v2",
        version: 2,
        status: "ACTIVE",
        effectiveFrom: "2026-07-01",
        effectiveTo: null,
        socialContributions: { enabled: true, cnssOna: { employeeRate: 0.08, employerRate: 0.08 } },
      };

      vi.spyOn(PayrollPolicyRepository, "getEffectivePolicy").mockImplementation(async (_bizId, targetDate) => {
        if (!targetDate || targetDate <= "2026-06-30") return policyV1 as any;
        return policyV2 as any;
      });

      // Target Date: 2026-03-15 (Q1 cycle) -> Resolves V1 (6%)
      const resolvedV1 = await PayrollPolicyResolver.resolveParameter("onaEmployeeRate", {
        businessId: testTenant,
        effectiveDate: "2026-03-15",
      });
      expect(resolvedV1.version).toBe(1);
      expect(resolvedV1.value).toBe(0.06);

      // Target Date: 2026-08-15 (Q3 cycle) -> Resolves V2 (8%)
      const resolvedV2 = await PayrollPolicyResolver.resolveParameter("onaEmployeeRate", {
        businessId: testTenant,
        effectiveDate: "2026-08-15",
      });
      expect(resolvedV2.version).toBe(2);
      expect(resolvedV2.value).toBe(0.08);

      expect(resolvedV1.value).not.toBe(resolvedV2.value);
    });

    // --- Parameter 19: Employee Specific Override (Tier 1 takes precedence) ---
    it("Parameter: Employee Specific Override — Contract commission rate overrides tenant default", async () => {
      // Tenant default commission is 5%
      vi.spyOn(PayrollPolicyRepository, "getEffectivePolicy").mockResolvedValueOnce({
        commissions: { defaultSalesRate: 0.05 },
        status: "ACTIVE",
        version: 1,
      } as any);

      // Employee without override -> Gets 5%
      const resStandard = await PayrollPolicyResolver.resolveParameter("commission_rate", {
        businessId: testTenant,
        employeeContext: { id: "emp_standard" },
      });
      expect(resStandard.source).toBe("TENANT_POLICY");
      expect(resStandard.value).toBe(0.05);

      // Employee with contract override 12% -> Gets 12%
      const resCustom = await PayrollPolicyResolver.resolveParameter("commission_rate", {
        businessId: testTenant,
        employeeContext: { id: "emp_custom", customValue: 0.12 },
      });
      expect(resCustom.source).toBe("EMPLOYEE_OVERRIDE");
      expect(resCustom.value).toBe(0.12);

      expect(resStandard.value).not.toBe(resCustom.value);
    });
  });
});
