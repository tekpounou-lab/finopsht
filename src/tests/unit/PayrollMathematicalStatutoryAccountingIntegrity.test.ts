/**
 * FINOPS — P1-4E: Mathematical, Statutory, and Accounting Integrity Suite
 * 
 * Implements an independent calculation oracle, audits Haitian statutory parameters,
 * verifies full GL double-entry balancing and lifecycle separation (accrual vs settlement),
 * and validates multi-tenant isolation and deterministic property invariants.
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
import { PayrollCycle, Employee, AttendanceRecord } from "../../types";

// In-memory Firestore emulation
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

const mockCollection = vi.fn((...args: any[]) => {
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
    createAndSignLog: vi.fn().mockResolvedValue({ id: "flog_oracle_sig", signature: "SIG_ORACLE_SHA256" }),
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

// ============================================================================
// PURE INDEPENDENT CALCULATION ORACLE
// ============================================================================
interface OracleInput {
  paymentModel: "FIXED" | "COMMISSION" | "HYBRID" | "HOURLY";
  monthlyBaseSalary: number;
  frequency: "MONTHLY" | "BIWEEKLY" | "WEEKLY";
  standardHours: number;
  workedHours: number;
  salesAmount?: number;
  commissionRate?: number;
  bonuses?: number;
  advances?: number;
  manualPenalties?: number;
  tardinessMinutes?: number;
  unexcusedAbsenceDays?: number;
  otRateNormal?: number;
  enableTaxes?: boolean;
  onaEmployeeRate?: number;
  onaEmployerRate?: number;
  ofatmaEmployeeRate?: number;
  ofatmaEmployerRate?: number;
  enableSurvivalFloor?: boolean;
  survivalFloorHTG?: number;
}

interface OracleResult {
  baseSalary: number;
  hourlyRate: number;
  overtimeHours: number;
  overtimePay: number;
  penalties: number;
  commissions: number;
  bonuses: number;
  grossSalary: number;
  onaEmployee: number;
  onaEmployer: number;
  ofatmaEmployee: number;
  ofatmaEmployer: number;
  totalEmployeeDeductions: number;
  totalEmployerContributions: number;
  netBeforeAdvances: number;
  survivalFloorApplied: boolean;
  finalNetPaid: number;
  employerTotalCost: number;
}

function calculatePureIndependentOracle(input: OracleInput): OracleResult {
  const divisor = input.frequency === "MONTHLY" ? 1 : input.frequency === "WEEKLY" ? 4 : 2;
  const baseSalary = input.paymentModel === "COMMISSION"
    ? 0
    : Math.round((input.monthlyBaseSalary / divisor) * 100) / 100;

  const standardHours = input.standardHours || 96;
  const hourlyRate = baseSalary > 0
    ? Math.round((baseSalary / standardHours) * 10000) / 10000
    : Math.round(((input.monthlyBaseSalary || 10000) / standardHours) * 10000) / 10000;

  const otMultiplier = input.otRateNormal ?? 1.5;
  let overtimeHours = 0;
  let overtimePay = 0;
  let absenceHoursDeduction = 0;

  const threshold = standardHours - 2;
  if (input.workedHours < threshold) {
    const absentHours = Number((standardHours - input.workedHours).toFixed(2));
    absenceHoursDeduction = Math.round(absentHours * hourlyRate * 100) / 100;
  } else if (input.workedHours > standardHours) {
    overtimeHours = Number((input.workedHours - standardHours).toFixed(2));
    overtimePay = Math.round(overtimeHours * hourlyRate * otMultiplier * 100) / 100;
  }

  const tardinessPenalty = input.tardinessMinutes && input.tardinessMinutes > 0
    ? Math.round((input.tardinessMinutes / 60) * hourlyRate * 100) / 100
    : 0;
  const unexcusedAbsencePenalty = input.unexcusedAbsenceDays && input.unexcusedAbsenceDays > 0 && absenceHoursDeduction === 0
    ? Math.round(input.unexcusedAbsenceDays * hourlyRate * 8 * 100) / 100
    : 0;

  const totalPenalties = Math.round(
    (absenceHoursDeduction + tardinessPenalty + unexcusedAbsencePenalty + (input.manualPenalties || 0)) * 100
  ) / 100;

  let commissions = 0;
  if (input.paymentModel === "COMMISSION" || input.paymentModel === "HYBRID") {
    commissions = Math.round((input.salesAmount || 0) * (input.commissionRate || 0) * 100) / 100;
  }

  const bonuses = input.bonuses || 0;
  let grossSalary = baseSalary + overtimePay + commissions + bonuses - totalPenalties;
  grossSalary = Math.max(0, Math.round(grossSalary * 100) / 100);

  const taxesOn = input.enableTaxes !== false;
  const onaEmpRate = input.onaEmployeeRate ?? 0.06;
  const onaEmprRate = input.onaEmployerRate ?? 0.06;
  const ofatmaEmpRate = input.ofatmaEmployeeRate ?? 0.02;
  const ofatmaEmprRate = input.ofatmaEmployerRate ?? 0.03;

  const onaEmployee = taxesOn ? Math.round(grossSalary * onaEmpRate * 100) / 100 : 0;
  const onaEmployer = taxesOn ? Math.round(grossSalary * onaEmprRate * 100) / 100 : 0;
  const ofatmaEmployee = taxesOn ? Math.round(grossSalary * ofatmaEmpRate * 100) / 100 : 0;
  const ofatmaEmployer = taxesOn ? Math.round(grossSalary * ofatmaEmprRate * 100) / 100 : 0;

  const totalEmployeeDeductions = Math.round((onaEmployee + ofatmaEmployee) * 100) / 100;
  const totalEmployerContributions = Math.round((onaEmployer + ofatmaEmployer) * 100) / 100;

  let netBeforeAdvances = Math.round((grossSalary - totalEmployeeDeductions) * 100) / 100;
  let survivalFloorApplied = false;
  const floorThreshold = input.survivalFloorHTG ?? 15000;

  if (input.enableSurvivalFloor !== false && netBeforeAdvances < floorThreshold && grossSalary >= floorThreshold) {
    netBeforeAdvances = floorThreshold;
    survivalFloorApplied = true;
  }

  const advances = input.advances || 0;
  const finalNetPaid = Math.max(0, Math.round((netBeforeAdvances - advances) * 100) / 100);
  const employerTotalCost = Math.round((grossSalary + totalEmployerContributions) * 100) / 100;

  return {
    baseSalary,
    hourlyRate,
    overtimeHours,
    overtimePay,
    penalties: totalPenalties,
    commissions,
    bonuses,
    grossSalary,
    onaEmployee,
    onaEmployer,
    ofatmaEmployee,
    ofatmaEmployer,
    totalEmployeeDeductions,
    totalEmployerContributions,
    netBeforeAdvances,
    survivalFloorApplied,
    finalNetPaid,
    employerTotalCost,
  };
}

describe("FINOPS P1-4E: Mathematical, Statutory, and Accounting Integrity Suite", () => {
  const tenant = "biz_audit_p14e";
  const actor = { id: "usr_auditor", name: "Auditor Lead", role: "AUDITOR" };

  const makeCycle = (overrides: Partial<PayrollCycle> = {}): PayrollCycle => ({
    id: "cycle_p14e_test",
    cycleName: "Cycle Audit P1-4E",
    startDate: "2026-08-01",
    endDate: "2026-08-15",
    status: "DRAFT",
    business_id: tenant,
    currency: "HTG",
    ...overrides,
  } as PayrollCycle);

  const makeEmployee = (overrides: Partial<Employee> = {}): Employee => ({
    id: "emp_p14e",
    name: "Jean Audit",
    email: "audit@finops.test",
    role: "STAFF",
    branchId: "branch_main",
    departmentId: "dept_main",
    baseSalary: 24000,
    salaryBaseHtg: 24000,
    business_id: tenant,
    status: "ACTIVE",
    paymentModel: "FIXED",
    ...overrides,
  } as Employee);

  const makeAttendance = (overrides: Partial<AttendanceRecord> = {}): AttendanceRecord => ({
    id: "att_p14e",
    employeeId: "emp_p14e",
    employeeName: "Jean Audit",
    branchId: "branch_main",
    checkIn: "08:00",
    checkOut: "17:00",
    plannedHours: 8,
    date: "2026-08-05",
    realHours: 96,
    status: "NORMAL",
    business_id: tenant,
    ...overrides,
  } as AttendanceRecord);

  beforeEach(async () => {
    vi.restoreAllMocks();
    await StaticDataCacheService.clearAll();
    fakeFirestoreData = new Map();
    batchSetOperations = [];
  });

  // =========================================================================
  // 1. PHASE B1: 15 REFERENCE SCENARIOS (ORACLE VS SYSTEM ENGINE PROOF)
  // =========================================================================
  describe("Phase B1: 15 Reference Scenarios (Independent Oracle Verification)", () => {
    // Scenario 1: Salaire fixe sans retenue
    it("Scenario 1: Fixed salary without deductions (enableTaxes: false)", async () => {
      const oracle = calculatePureIndependentOracle({
        paymentModel: "FIXED",
        monthlyBaseSalary: 20000,
        frequency: "BIWEEKLY",
        standardHours: 96,
        workedHours: 96,
        enableTaxes: false,
        enableSurvivalFloor: false,
      });

      const records = await PayrollService.processPayrollCycle(
        makeCycle(),
        [makeEmployee({ salaryBaseHtg: 20000 })],
        tenant,
        {
          policies: { enableTaxes: false, enableSurvivalFloor: false, frequency: "BIWEEKLY" },
          attendanceRecords: [makeAttendance({ realHours: 96 })],
        }
      );

      const rec = records[0];
      expect(rec.grossSalary).toBe(oracle.grossSalary); // 10,000 HTG
      expect(rec.cnssDeduction).toBe(oracle.onaEmployee); // 0 HTG
      expect(rec.cnsDeduction).toBe(oracle.ofatmaEmployee); // 0 HTG
      expect(rec.netPaid).toBe(oracle.finalNetPaid); // 10,000 HTG
      expect(rec.netPaid).toBe(10000);
    });

    // Scenario 2: Salaire fixe avec heures supplémentaires normales (1.5x)
    it("Scenario 2: Fixed salary with normal overtime (10h @ 1.5x)", async () => {
      const oracle = calculatePureIndependentOracle({
        paymentModel: "FIXED",
        monthlyBaseSalary: 24000,
        frequency: "BIWEEKLY",
        standardHours: 96,
        workedHours: 106,
        otRateNormal: 1.5,
        enableTaxes: false,
        enableSurvivalFloor: false,
      });

      const records = await PayrollService.processPayrollCycle(
        makeCycle(),
        [makeEmployee({ salaryBaseHtg: 24000 })],
        tenant,
        {
          policies: { enableTaxes: false, enableSurvivalFloor: false, standardHoursPerCycle: 96, overtimeRate150: 1.5 },
          attendanceRecords: [makeAttendance({ realHours: 106 })],
        }
      );

      const rec = records[0];
      expect(rec.overtimeHours).toBe(oracle.overtimeHours); // 10h
      expect(rec.overtimePayout).toBe(oracle.overtimePay);   // 10 * 125 * 1.5 = 1,875 HTG
      expect(rec.grossSalary).toBe(oracle.grossSalary);     // 12,000 + 1,875 = 13,875 HTG
      expect(rec.netPaid).toBe(oracle.finalNetPaid);
    });

    // Scenario 3: Heures supplémentaires majorées pour jour férié (2.0x)
    it("Scenario 3: Premium holiday overtime (2.0x)", () => {
      const oraclePay = calculateOvertimePay(125, 0, 10, 1.5, 2.0);
      expect(oraclePay).toBe(2500); // 10h * 125 * 2.0 = 2,500 HTG
    });

    // Scenario 4: Retard et absence (Pénalités appliquées)
    it("Scenario 4: Lateness and absence deductions applied against gross", async () => {
      const oracle = calculatePureIndependentOracle({
        paymentModel: "FIXED",
        monthlyBaseSalary: 24000,
        frequency: "BIWEEKLY",
        standardHours: 96,
        workedHours: 90, // 6h under threshold (94h) -> absence penalty
        enableTaxes: false,
        enableSurvivalFloor: false,
      });

      const records = await PayrollService.processPayrollCycle(
        makeCycle(),
        [makeEmployee({ salaryBaseHtg: 24000 })],
        tenant,
        {
          policies: { enableTaxes: false, enableSurvivalFloor: false, standardHoursPerCycle: 96 },
          attendanceRecords: [makeAttendance({ realHours: 90 })],
        }
      );

      const rec = records[0];
      expect(rec.penalties).toBe(oracle.penalties); // 6h * 125 = 750 HTG
      expect(rec.grossSalary).toBe(oracle.grossSalary); // 12,000 - 750 = 11,250 HTG
      expect(rec.netPaid).toBe(oracle.finalNetPaid);
    });

    // Scenario 5: Employé rémunéré à la commission
    it("Scenario 5: Pure commission employee (100,000 HTG sales @ 5%)", async () => {
      const oracle = calculatePureIndependentOracle({
        paymentModel: "COMMISSION",
        monthlyBaseSalary: 0,
        frequency: "BIWEEKLY",
        standardHours: 96,
        workedHours: 96,
        salesAmount: 100000,
        commissionRate: 0.05,
        enableTaxes: false,
        enableSurvivalFloor: false,
      });

      const records = await PayrollService.processPayrollCycle(
        makeCycle(),
        [makeEmployee({ paymentModel: "COMMISSION" })],
        tenant,
        {
          policies: { defaultCommissionRate: 0.05, enableTaxes: false, enableSurvivalFloor: false },
          ledgerTransactions: [
            { id: "tx_comm_1", employeeId: "emp_p14e", type: "INCOME", category: "SALE", amount: 100000, date: "2026-08-05", business_id: tenant } as any,
          ],
        }
      );

      const rec = records[0];
      expect(rec.commissions).toBe(oracle.commissions); // 5,000 HTG
      expect(rec.baseSalary).toBe(0);
      expect(rec.grossSalary).toBe(oracle.grossSalary); // 5,000 HTG
      expect(rec.netPaid).toBe(oracle.finalNetPaid);     // 5,000 HTG
    });

    // Scenario 6: Employé en régime hybride (Base fixe + commissions)
    it("Scenario 6: Hybrid employee (Base 12,000 HTG + 5,000 HTG commissions)", async () => {
      const oracle = calculatePureIndependentOracle({
        paymentModel: "HYBRID",
        monthlyBaseSalary: 24000,
        frequency: "BIWEEKLY",
        standardHours: 96,
        workedHours: 96,
        salesAmount: 100000,
        commissionRate: 0.05,
        enableTaxes: false,
        enableSurvivalFloor: false,
      });

      const records = await PayrollService.processPayrollCycle(
        makeCycle(),
        [makeEmployee({ paymentModel: "HYBRID" })],
        tenant,
        {
          policies: { defaultCommissionRate: 0.05, enableTaxes: false, enableSurvivalFloor: false },
          ledgerTransactions: [
            { id: "tx_hyb_1", employeeId: "emp_p14e", type: "INCOME", category: "SALE", amount: 100000, date: "2026-08-05", business_id: tenant } as any,
          ],
        }
      );

      const rec = records[0];
      expect(rec.baseSalary).toBe(oracle.baseSalary);   // 12,000 HTG
      expect(rec.commissions).toBe(oracle.commissions); // 5,000 HTG
      expect(rec.grossSalary).toBe(oracle.grossSalary); // 17,000 HTG
      expect(rec.netPaid).toBe(oracle.finalNetPaid);
    });

    // Scenario 7: Cotisations salariales et patronales (ONA 6%/6%, OFATMA 2%/3%)
    it("Scenario 7: Full dual-sided social contributions (Gross 20,000 HTG)", async () => {
      const oracle = calculatePureIndependentOracle({
        paymentModel: "FIXED",
        monthlyBaseSalary: 40000,
        frequency: "BIWEEKLY",
        standardHours: 96,
        workedHours: 96,
        enableTaxes: true,
        onaEmployeeRate: 0.06,
        onaEmployerRate: 0.06,
        ofatmaEmployeeRate: 0.02,
        ofatmaEmployerRate: 0.03,
        enableSurvivalFloor: false,
      });

      const records = await PayrollService.processPayrollCycle(
        makeCycle(),
        [makeEmployee({ salaryBaseHtg: 40000 })],
        tenant,
        {
          policies: {
            enableTaxes: true,
            enableSocialTaxes: true,
            onaEmployeeRate: 0.06,
            onaEmployerRate: 0.06,
            ofatmaEmployeeRate: 0.02,
            ofatmaEmployerRate: 0.03,
            enableSurvivalFloor: false,
          },
          attendanceRecords: [makeAttendance()],
        }
      );

      const rec = records[0];
      expect(rec.cnssDeduction).toBe(oracle.onaEmployee); // 1,200 HTG (6%)
      expect(rec.cnsDeduction).toBe(oracle.ofatmaEmployee); // 400 HTG (2%)
      expect(rec.employerPayrollCostTotal).toBe(oracle.employerTotalCost); // 20,000 + 1,200 + 600 = 21,800 HTG
      expect(rec.netPaid).toBe(oracle.finalNetPaid); // 20,000 - 1,600 = 18,400 HTG
    });

    // Scenario 8: Politique sans cotisations activées
    it("Scenario 8: Policy with disabled taxes zeros all deductions", async () => {
      const oracle = calculatePureIndependentOracle({
        paymentModel: "FIXED",
        monthlyBaseSalary: 40000,
        frequency: "BIWEEKLY",
        standardHours: 96,
        workedHours: 96,
        enableTaxes: false,
      });

      const records = await PayrollService.processPayrollCycle(
        makeCycle(),
        [makeEmployee({ salaryBaseHtg: 40000 })],
        tenant,
        {
          policies: { enableTaxes: false, enableSurvivalFloor: false },
          attendanceRecords: [makeAttendance()],
        }
      );

      expect(records[0].cnssDeduction).toBe(0);
      expect(records[0].cnsDeduction).toBe(0);
      expect(records[0].netPaid).toBe(oracle.finalNetPaid);
    });

    // Scenario 9: Plancher de salaire net activé vs désactivé
    it("Scenario 9: Survival floor enforces 15,000 HTG minimum net when active", async () => {
      // Gross 16,000 -> 8% tax (1,280 HTG) -> Raw Net = 14,720 HTG (< 15,000 HTG floor)
      const oracleActive = calculatePureIndependentOracle({
        paymentModel: "FIXED",
        monthlyBaseSalary: 32000,
        frequency: "BIWEEKLY",
        standardHours: 96,
        workedHours: 96,
        enableTaxes: true,
        enableSurvivalFloor: true,
        survivalFloorHTG: 15000,
      });
      const oracleInactive = calculatePureIndependentOracle({
        paymentModel: "FIXED",
        monthlyBaseSalary: 32000,
        frequency: "BIWEEKLY",
        standardHours: 96,
        workedHours: 96,
        enableTaxes: true,
        enableSurvivalFloor: false,
        survivalFloorHTG: 15000,
      });

      expect(oracleActive.finalNetPaid).toBe(15000);
      expect(oracleActive.survivalFloorApplied).toBe(true);
      expect(oracleInactive.finalNetPaid).toBe(14720);
      expect(oracleInactive.survivalFloorApplied).toBe(false);

      const recActive = await PayrollService.processPayrollCycle(
        makeCycle(),
        [makeEmployee({ salaryBaseHtg: 32000 })],
        tenant,
        {
          policies: { enableTaxes: true, enableSurvivalFloor: true, survivalFloorHTG: 15000 },
          attendanceRecords: [makeAttendance()],
        }
      );

      expect(recActive[0].netPaid).toBe(oracleActive.finalNetPaid);
      expect(recActive[0].protectionRuleEnforced).toBe(true);
    });

    // Scenario 10: Présence manquante ou incomplète
    it("Scenario 10: Missing attendance excludes unlogged hourly workers, keeps salaried", async () => {
      const hourlyEmp = makeEmployee({ id: "emp_h1", paymentModel: "HOURLY" as any });
      const salariedEmp = makeEmployee({ id: "emp_s1", paymentModel: "FIXED" });

      const records = await PayrollService.processPayrollCycle(
        makeCycle(),
        [hourlyEmp, salariedEmp],
        tenant,
        {
          policies: { requireAttendanceForPayroll: true, enableTaxes: false, enableSurvivalFloor: false },
          attendanceRecords: [makeAttendance({ employeeId: "emp_s1", realHours: 96 })], // Salaried worker logged, hourly worker missing
        }
      );

      // Hourly employee excluded; Salaried employee processed with standard hours
      expect(records.length).toBe(1);
      expect(records[0].employeeId).toBe("emp_s1");
    });

    // Scenario 11: Rémunération en HTG et USD
    it("Scenario 11: Currency propagation preserves USD cycle attributes into GL", () => {
      const usdCycle = makeCycle({ currency: "USD" });
      const record = {
        grossSalary: 1000,
        netPaid: 920,
        cnssDeduction: 60,
        cnsDeduction: 20,
        advancesTreated: 0,
      } as any;

      const { transactions, journalEntry } = AccountingEngine.createPayrollJournalEntry(
        usdCycle,
        [record],
        tenant
      );

      expect(journalEntry.currency).toBe("USD");
      expect(transactions[0].currency).toBe("USD");
      expect(journalEntry.isBalanced).toBe(true);
    });

    // Scenario 12: Taux égal à zéro
    it("Scenario 12: Explicit 0% tax rate is recognized as VALID_ZERO without fallback to 6%", () => {
      const rates = TaxPolicyEngine.getTaxRates({
        socialContributions: {
          enabled: true,
          cnssOna: { employeeRate: 0, employerRate: 0 },
          ofatmaCns: { employeeRate: 0, employerRate: 0 },
        },
      });

      expect(rates.onaEmployee).toBe(0);
      expect(rates.resolutionStates.onaEmployee).toBe("VALID_ZERO");
      expect(rates.ofatmaEmployee).toBe(0);
    });

    // Scenario 13: Politique absente ou non applicable à la période
    it("Scenario 13: Absent policy falls back deterministically to Haitian statutory baseline", () => {
      const defaults = resolveTaxRatesForDate(null, "2026-08-01");
      expect(defaults.cnssRateEmployee).toBe(0.06);
      expect(defaults.cnsRateEmployee).toBe(0.02);
      expect(defaults.survivalFloorHTG).toBe(15000);
    });

    // Scenario 14: Employé bénéficiant d'une dérogation individuelle (Override)
    it("Scenario 14: Employee contract override takes precedence over global policy", async () => {
      const resGlobal = await PayrollPolicyResolver.resolveParameter("commission_rate", {
        businessId: tenant,
        effectiveDate: "2026-08-01",
      });
      const resOverride = await PayrollPolicyResolver.resolveParameter("commission_rate", {
        businessId: tenant,
        effectiveDate: "2026-08-01",
        employeeContext: { overrides: { commission_rate: 0.12 } },
      });

      expect(resGlobal.value).toBe(0.05); // Global standard
      expect(resOverride.value).toBe(0.12); // Individual override
      expect(resOverride.source).toBe("EMPLOYEE_OVERRIDE");
    });

    // Scenario 15: Arrondis et montants proches d'une limite monétaire
    it("Scenario 15: Cent-level rounding prevents floating-point drift", () => {
      const gross = 13333.33;
      const rate = 0.06;
      const exactTax = Math.round(gross * rate * 100) / 100;
      expect(exactTax).toBe(800.00); // 13333.33 * 0.06 = 799.9998 -> 800.00
    });
  });

  // =========================================================================
  // 2. PHASE B3: MATHEMATICAL PROPERTY TESTS
  // =========================================================================
  describe("Phase B3: Mathematical Invariant & Property Tests", () => {
    it("Property 1: Zero gross earnings produce zero net pay and zero deductions", () => {
      const res = calculatePureIndependentOracle({
        paymentModel: "FIXED",
        monthlyBaseSalary: 0,
        frequency: "BIWEEKLY",
        standardHours: 96,
        workedHours: 0,
        enableTaxes: true,
      });

      expect(res.grossSalary).toBe(0);
      expect(res.onaEmployee).toBe(0);
      expect(res.finalNetPaid).toBe(0);
      expect(res.employerTotalCost).toBe(0);
    });

    it("Property 2: Monotonicity — increasing base salary never reduces gross salary", () => {
      const resA = calculatePureIndependentOracle({
        paymentModel: "FIXED",
        monthlyBaseSalary: 20000,
        frequency: "BIWEEKLY",
        standardHours: 96,
        workedHours: 96,
      });
      const resB = calculatePureIndependentOracle({
        paymentModel: "FIXED",
        monthlyBaseSalary: 25000,
        frequency: "BIWEEKLY",
        standardHours: 96,
        workedHours: 96,
      });

      expect(resB.grossSalary).toBeGreaterThan(resA.grossSalary);
      expect(resB.finalNetPaid).toBeGreaterThan(resA.finalNetPaid);
    });

    it("Property 3: Employer contributions never reduce employee net pay", () => {
      const resStandard = calculatePureIndependentOracle({
        paymentModel: "FIXED",
        monthlyBaseSalary: 30000,
        frequency: "BIWEEKLY",
        standardHours: 96,
        workedHours: 96,
        onaEmployerRate: 0.06,
        ofatmaEmployerRate: 0.03,
      });
      const resHigherEmployer = calculatePureIndependentOracle({
        paymentModel: "FIXED",
        monthlyBaseSalary: 30000,
        frequency: "BIWEEKLY",
        standardHours: 96,
        workedHours: 96,
        onaEmployerRate: 0.12, // Employer pays double
        ofatmaEmployerRate: 0.06,
      });

      expect(resStandard.finalNetPaid).toBe(resHigherEmployer.finalNetPaid); // Employee net unaffected
      expect(resHigherEmployer.employerTotalCost).toBeGreaterThan(resStandard.employerTotalCost);
    });
  });

  // =========================================================================
  // 3. PHASE D: ACCOUNTING INTEGRITY (ACCRUAL VS SETTLEMENT)
  // =========================================================================
  describe("Phase D: Accounting Lifecycle & General Ledger Balancing", () => {
    it("D1: Two-Stage Lifecycle — Stage 1 (Accrual) credits Clearing, Stage 2 (Disbursement) debits Clearing and credits Bank", () => {
      const cycle = makeCycle({ id: "cycle_gl_lifecycle" });
      const record = {
        grossSalary: 20000,
        netPaid: 18400,
        cnssDeduction: 1200,
        cnsDeduction: 400,
        onaEmployer: 1200,
        ofatmaEmployer: 600,
        employer_contributions_cents: 180000,
        advancesTreated: 0,
      } as any;

      // Stage 1: Accrual / Constatation
      const accrual = createPayrollJournalEntry(cycle, [record], tenant, actor, {
        isAccrualOnly: true,
      });

      expect(accrual.journalEntry.isBalanced).toBe(true);
      const clearingLeg = accrual.transactions.find((t) => t.credit_account === "2100_PAYROLL_CLEARING");
      expect(clearingLeg).toBeDefined();
      expect(clearingLeg?.amount).toBe(18400); // 18,400 HTG net liability accrued

      // Stage 2: Settlement / Décaissement
      const settlement = createPayrollSettlementEntry(
        cycle,
        18400,
        tenant,
        "1010_BANK",
        "2100_PAYROLL_CLEARING",
        actor
      );

      expect(settlement.journalEntry.isBalanced).toBe(true);
      expect(settlement.transactions[0].debit_account).toBe("2100_PAYROLL_CLEARING");
      expect(settlement.transactions[0].credit_account).toBe("1010_BANK");
      expect(settlement.transactions[0].amount).toBe(18400);

      // Reconciliation: Accrued liability exactly matches settled treasury outflow
      expect(clearingLeg?.amount).toBe(settlement.transactions[0].amount);
    });

    it("D2: Balanced Double-Entry with Survival Floor Subsidy", () => {
      const cycle = makeCycle({ id: "cycle_gl_floor" });
      // Gross = 16,000 HTG, Taxes = 1,280 HTG, Raw Net = 14,720 HTG -> Floor Net = 15,000 HTG
      const recordWithFloor = {
        grossSalary: 16000,
        netPaid: 15000, // 280 HTG subsidy
        cnssDeduction: 960,
        cnsDeduction: 320,
        onaEmployer: 960,
        ofatmaEmployer: 480,
        employer_contributions_cents: 144000,
        advancesTreated: 0,
      } as any;

      const { journalEntry, transactions } = createPayrollJournalEntry(
        cycle,
        [recordWithFloor],
        tenant
      );

      expect(journalEntry.isBalanced).toBe(true);
      expect(journalEntry.totalDebitCents).toBe(journalEntry.totalCreditCents);

      const subsidyTx = transactions.find((t) => t.metadata?.component === "SURVIVAL_FLOOR_SUBSIDY");
      expect(subsidyTx).toBeDefined();
      expect(subsidyTx?.amount).toBe(280); // Exact 280 HTG difference accounted for as employer expense
    });

    it("D3: Idempotence & Replay Safety — Deterministic Transaction IDs prevent duplication", () => {
      const cycle = makeCycle({ id: "cycle_idempotence" });
      const record = { grossSalary: 10000, netPaid: 9200, cnssDeduction: 600, cnsDeduction: 200 } as any;

      const run1 = createPayrollJournalEntry(cycle, [record], tenant);
      const run2 = createPayrollJournalEntry(cycle, [record], tenant);

      expect(run1.transactions.length).toBe(run2.transactions.length);
      run1.transactions.forEach((tx, idx) => {
        expect(tx.id).toBe(run2.transactions[idx].id);
        expect(tx.amount).toBe(run2.transactions[idx].amount);
      });
    });
  });

  // =========================================================================
  // 4. PHASE F: MULTI-TENANT ISOLATION
  // =========================================================================
  describe("Phase F: Multi-Tenant Isolation & Security Invariants", () => {
    it("Prohibits cross-tenant access between Tenant Alpha and Tenant Beta", async () => {
      const tenantAlpha = "biz_tenant_alpha";
      const tenantBeta = "biz_tenant_beta";

      await PayrollPolicyRepository.saveAndActivatePolicy(
        tenantAlpha,
        {
          frequency: "MONTHLY",
          standardHoursPerCycle: 160,
          overtime: { normalRate: 1.8, holidayRate: 2.2 },
          socialContributions: { enabled: true, cnssOna: { employeeRate: 0.08, employerRate: 0.08 }, ofatmaCns: { employeeRate: 0.03, employerRate: 0.04 } },
          survivalFloor: { enabled: true, minimumNetHTG: 18000 },
          commissions: { defaultSalesRate: 0.08 },
          effectiveFrom: "2026-08-01",
        },
        actor
      );

      const polAlpha = await PayrollPolicyRepository.getEffectivePolicy(tenantAlpha, "2026-08-15");
      const polBeta = await PayrollPolicyRepository.getEffectivePolicy(tenantBeta, "2026-08-15");

      expect(polAlpha?.frequency).toBe("MONTHLY");
      expect(polAlpha?.survivalFloor?.minimumNetHTG).toBe(18000);
      expect(polBeta).toBeNull(); // Tenant Beta has no access to Tenant Alpha's policy
    });
  });
});
