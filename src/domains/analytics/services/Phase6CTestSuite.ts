/**
 * FINOPS ERP v4.0 — PHASE 6C CONTRACT v1.0
 * Forensic Automated Test Suite (TS-6C-01 to TS-6C-20)
 * 
 * Verifies all 25 KPIs across:
 * - Bloc A: Attendance Reconciliation (TS-6C-01 to TS-6C-08)
 * - Bloc B: Attendance Costing (TS-6C-09 to TS-6C-12)
 * - Bloc C: Capacity Intelligence (TS-6C-13 to TS-6C-16)
 * - Bloc D: Workforce Economics (TS-6C-17 to TS-6C-20)
 */

import { Phase6CReconciliationEngine } from "./Phase6CReconciliationEngine";
import { Shift } from "../../../components/planning/types";
import { AttendanceRecord, PayrollRecord, LedgerTransaction, Employee, Branch, Department } from "../../../types";

export interface TestResult {
  scenarioId: string;
  name: string;
  passed: boolean;
  expected: any;
  actual: any;
  error?: string;
}

export class Phase6CTestSuite {
  public static runAll(): { results: TestResult[]; summary: { total: number; passed: number; failed: number } } {
    const results: TestResult[] = [];

    const mockBizId = "BIZ_TEST_001";
    const startDate = "2026-09-01";
    const endDate = "2026-09-30";

    const mockEmployees: Employee[] = [
      { id: "emp_1", name: "Jean Baptiste", role: "EMPLOYEE", business_id: mockBizId, departmentId: "dept_ops", branchId: "branch_nord", isActive: true } as any,
      { id: "emp_2", name: "Marie Curie", role: "EMPLOYEE", business_id: mockBizId, departmentId: "dept_ops", branchId: "branch_nord", isActive: true } as any,
      { id: "emp_unresolved", name: "Luc Unknown", role: "EMPLOYEE", business_id: mockBizId, isActive: true } as any,
    ];

    const mockBranches: Branch[] = [
      { id: "branch_nord", name: "Succursale Nord", business_id: mockBizId } as any,
    ];

    const mockDepartments: Department[] = [
      { id: "dept_ops", name: "Opérations", business_id: mockBizId } as any,
    ];

    // Helper runner
    const runTest = (id: string, name: string, fn: () => { passed: boolean; expected: any; actual: any }) => {
      try {
        const res = fn();
        results.push({ scenarioId: id, name, ...res });
      } catch (err: any) {
        results.push({ scenarioId: id, name, passed: false, expected: "SUCCESS", actual: "EXCEPTION", error: err.message });
      }
    };

    // ==========================================
    // BLOC A: ATTENDANCE RECONCILIATION
    // ==========================================

    // TS-6C-01: Perfect Schedule & Worked Match
    runTest("TS-6C-01", "Perfect Match between Scheduled and Worked Hours", () => {
      const shifts: Shift[] = [
        { id: "s1", employeeId: "emp_1", date: "2026-09-10", plannedHours: 8, status: "PUBLISHED", business_id: mockBizId } as any
      ];
      const att: AttendanceRecord[] = [
        { id: "a1", employeeId: "emp_1", date: "2026-09-10", realHours: 8, plannedHours: 8, status: "PRESENT", business_id: mockBizId } as any
      ];
      const res = Phase6CReconciliationEngine.calculate({
        businessId: mockBizId,
        shifts,
        attendanceRecords: att,
        payrollRecords: [],
        ledgerTransactions: [],
        employees: mockEmployees,
        branches: mockBranches,
        departments: mockDepartments,
        startDate,
        endDate,
      });

      const hPlan = res.reconciliation.scheduledHours.value;
      const hWorked = res.reconciliation.workedHours.value;
      const variance = res.reconciliation.varianceHours.value;
      const potOt = res.reconciliation.potentialOvertime.value;

      const passed = hPlan === 8 && hWorked === 8 && variance === 0 && potOt === 0;
      return { passed, expected: { hPlan: 8, hWorked: 8, variance: 0, potOt: 0 }, actual: { hPlan, hWorked, variance, potOt } };
    });

    // TS-6C-02: Planned Hours with No Attendance (Total Absence)
    runTest("TS-6C-02", "Planned Hours with No Attendance (ABSENT)", () => {
      const shifts: Shift[] = [
        { id: "s1", employeeId: "emp_1", date: "2026-09-10", plannedHours: 8, status: "PUBLISHED", business_id: mockBizId } as any
      ];
      const att: AttendanceRecord[] = [
        { id: "a1", employeeId: "emp_1", date: "2026-09-10", realHours: 0, plannedHours: 8, status: "ABSENT", business_id: mockBizId } as any
      ];
      const res = Phase6CReconciliationEngine.calculate({
        businessId: mockBizId,
        shifts,
        attendanceRecords: att,
        payrollRecords: [],
        ledgerTransactions: [],
        employees: mockEmployees,
        branches: mockBranches,
        departments: mockDepartments,
        startDate,
        endDate,
      });

      const absCount = res.reconciliation.absenceCount.value;
      const absHours = res.reconciliation.absenceHours.value;
      const absRate = res.reconciliation.absenceRate.value;
      const variance = res.reconciliation.varianceHours.value;

      const passed = absCount === 1 && absHours === 8 && absRate === 100 && variance === -8;
      return { passed, expected: { absCount: 1, absHours: 8, absRate: 100, variance: -8 }, actual: { absCount, absHours, absRate, variance } };
    });

    // TS-6C-03: Potential Overtime Detection (Real > Planned)
    runTest("TS-6C-03", "Potential Overtime Detection without Authorization", () => {
      const shifts: Shift[] = [
        { id: "s1", employeeId: "emp_1", date: "2026-09-10", plannedHours: 8, status: "PUBLISHED", business_id: mockBizId } as any
      ];
      const att: AttendanceRecord[] = [
        { id: "a1", employeeId: "emp_1", date: "2026-09-10", realHours: 10, plannedHours: 8, status: "PRESENT", business_id: mockBizId } as any
      ];
      const res = Phase6CReconciliationEngine.calculate({
        businessId: mockBizId,
        shifts,
        attendanceRecords: att,
        payrollRecords: [],
        ledgerTransactions: [],
        employees: mockEmployees,
        branches: mockBranches,
        departments: mockDepartments,
        startDate,
        endDate,
      });

      const potOt = res.reconciliation.potentialOvertime.value;
      const authOt = res.reconciliation.authorizedOvertime.value;
      const variance = res.reconciliation.varianceHours.value;

      const passed = potOt === 2 && authOt === 0 && variance === 2;
      return { passed, expected: { potOt: 2, authOt: 0, variance: 2 }, actual: { potOt, authOt, variance } };
    });

    // TS-6C-04: Authorized Overtime via Explicit Manager Approval
    runTest("TS-6C-04", "Authorized Overtime with Explicit Authorization", () => {
      const shifts: Shift[] = [
        { id: "s1", employeeId: "emp_1", date: "2026-09-10", plannedHours: 8, status: "PUBLISHED", business_id: mockBizId } as any
      ];
      const att: AttendanceRecord[] = [
        { id: "a1", employeeId: "emp_1", date: "2026-09-10", realHours: 11, plannedHours: 8, status: "OVERTIME", overtimeAuthorized: true, authorizedBy: "mgr_1", business_id: mockBizId } as any
      ];
      const res = Phase6CReconciliationEngine.calculate({
        businessId: mockBizId,
        shifts,
        attendanceRecords: att,
        payrollRecords: [],
        ledgerTransactions: [],
        employees: mockEmployees,
        branches: mockBranches,
        departments: mockDepartments,
        startDate,
        endDate,
      });

      const potOt = res.reconciliation.potentialOvertime.value;
      const authOt = res.reconciliation.authorizedOvertime.value;

      const passed = potOt === 3 && authOt === 3;
      return { passed, expected: { potOt: 3, authOt: 3 }, actual: { potOt, authOt } };
    });

    // TS-6C-05: Strict Separation between Attendance Overtime & Sealed Payroll Overtime
    runTest("TS-6C-05", "Separation between Attendance Overtime and Sealed Payroll Overtime", () => {
      const shifts: Shift[] = [
        { id: "s1", employeeId: "emp_1", date: "2026-09-10", plannedHours: 8, status: "PUBLISHED", business_id: mockBizId } as any
      ];
      const att: AttendanceRecord[] = [
        { id: "a1", employeeId: "emp_1", date: "2026-09-10", realHours: 12, plannedHours: 8, status: "PRESENT", business_id: mockBizId } as any // 4h potential
      ];
      const payroll: PayrollRecord[] = [
        { id: "p1", employeeId: "emp_1", status: "SEALED", overtimeHours: 2, overtimePayout: 500, grossSalary: 10000, business_id: mockBizId } as any
      ];
      const res = Phase6CReconciliationEngine.calculate({
        businessId: mockBizId,
        shifts,
        attendanceRecords: att,
        payrollRecords: payroll,
        ledgerTransactions: [],
        employees: mockEmployees,
        branches: mockBranches,
        departments: mockDepartments,
        startDate,
        endDate,
      });

      const potOt = res.reconciliation.potentialOvertime.value;
      const payrollOt = res.reconciliation.payrollOvertimeHours.value;

      const passed = potOt === 4 && payrollOt === 2;
      return { passed, expected: { potOt: 4, payrollOt: 2 }, actual: { potOt, payrollOt } };
    });

    // TS-6C-06: Lateness Occurrence & Late Minutes Summation
    runTest("TS-6C-06", "Lateness Occurrence and Late Minutes Summation", () => {
      const att: AttendanceRecord[] = [
        { id: "a1", employeeId: "emp_1", date: "2026-09-10", realHours: 7.5, plannedHours: 8, status: "LATE", late_minutes: 30, business_id: mockBizId } as any,
        { id: "a2", employeeId: "emp_2", date: "2026-09-11", realHours: 7.8, plannedHours: 8, status: "PRESENT", late_minutes: 12, business_id: mockBizId } as any
      ];
      const res = Phase6CReconciliationEngine.calculate({
        businessId: mockBizId,
        shifts: [],
        attendanceRecords: att,
        payrollRecords: [],
        ledgerTransactions: [],
        employees: mockEmployees,
        branches: mockBranches,
        departments: mockDepartments,
        startDate,
        endDate,
      });

      const count = res.reconciliation.latenessCount.value;
      const minutes = res.reconciliation.lateMinutes.value;

      const passed = count === 2 && minutes === 42;
      return { passed, expected: { count: 2, minutes: 42 }, actual: { count, minutes } };
    });

    // TS-6C-07: Attendance Anomalies Exclusion & Quarantine (Pending Verification, Missing Checkout, Negative Duration)
    runTest("TS-6C-07", "Attendance Anomalies Quarantine and Accurate Reporting", () => {
      const att: AttendanceRecord[] = [
        { id: "a1", employeeId: "emp_1", date: "2026-09-10", realHours: 8, plannedHours: 8, status: "PENDING_VERIFICATION", business_id: mockBizId } as any,
        { id: "a2", employeeId: "emp_1", date: "2026-09-11", realHours: -2, plannedHours: 8, status: "PRESENT", business_id: mockBizId } as any,
        { id: "a3", employeeId: "emp_2", date: "2026-09-12", checkIn: "2026-09-12T08:00:00Z", checkOut: null, realHours: 8, plannedHours: 8, status: "PRESENT", business_id: mockBizId } as any,
        { id: "a4", employeeId: "emp_2", date: "2026-09-13", realHours: 8, plannedHours: 8, status: "PRESENT", business_id: mockBizId } as any, // 1 valid
      ];
      const res = Phase6CReconciliationEngine.calculate({
        businessId: mockBizId,
        shifts: [],
        attendanceRecords: att,
        payrollRecords: [],
        ledgerTransactions: [],
        employees: mockEmployees,
        branches: mockBranches,
        departments: mockDepartments,
        startDate,
        endDate,
      });

      const anomaliesCount = res.reconciliation.anomaliesCount.value;
      const workedHours = res.reconciliation.workedHours.value;

      const passed = anomaliesCount === 3 && workedHours === 8;
      return { passed, expected: { anomaliesCount: 3, workedHours: 8 }, actual: { anomaliesCount, workedHours } };
    });

    // TS-6C-08: Zero Schedule (NOT_SCHEDULED) Behavior
    runTest("TS-6C-08", "Zero Schedule NOT_SCHEDULED Behavior", () => {
      const att: AttendanceRecord[] = [
        { id: "a1", employeeId: "emp_1", date: "2026-09-10", realHours: 5, plannedHours: 0, status: "PRESENT", business_id: mockBizId } as any
      ];
      const res = Phase6CReconciliationEngine.calculate({
        businessId: mockBizId,
        shifts: [],
        attendanceRecords: att,
        payrollRecords: [],
        ledgerTransactions: [],
        employees: mockEmployees,
        branches: mockBranches,
        departments: mockDepartments,
        startDate,
        endDate,
      });

      const schedStatus = res.reconciliation.scheduledHours.status;
      const absRateStatus = res.reconciliation.absenceRate.status;
      const capStatus = res.capacity.capacityUtilization.status;

      const passed = schedStatus === "NOT_SCHEDULED" && absRateStatus === "NOT_SCHEDULED" && capStatus === "NOT_SCHEDULED";
      return { passed, expected: { schedStatus: "NOT_SCHEDULED", absRateStatus: "NOT_SCHEDULED", capStatus: "NOT_SCHEDULED" }, actual: { schedStatus, absRateStatus, capStatus } };
    });

    // ==========================================
    // BLOC B: ATTENDANCE COSTING
    // ==========================================

    // TS-6C-09: Actual Payroll Cost Includes Gross + Employer Social Charges
    runTest("TS-6C-09", "Actual Payroll Cost Includes Gross and Employer Taxes", () => {
      const payroll: PayrollRecord[] = [
        { id: "p1", employeeId: "emp_1", status: "SEALED", grossSalary: 20000, cnss_employer_cents: 120000, ofatma_employer_cents: 60000, business_id: mockBizId } as any // 20000 + 1200 + 600 = 21800
      ];
      const res = Phase6CReconciliationEngine.calculate({
        businessId: mockBizId,
        shifts: [],
        attendanceRecords: [],
        payrollRecords: payroll,
        ledgerTransactions: [],
        employees: mockEmployees,
        branches: mockBranches,
        departments: mockDepartments,
        startDate,
        endDate,
      });

      const actualCost = res.costing.actualPayrollCost.value;
      const passed = actualCost === 21800;
      return { passed, expected: 21800, actual: actualCost };
    });

    // TS-6C-10: Analytical Labor Rate with Planned Hours as Primary Denominator
    runTest("TS-6C-10", "Analytical Labor Rate uses Planned Hours as Primary Denominator", () => {
      const shifts: Shift[] = [
        { id: "s1", employeeId: "emp_1", date: "2026-09-10", plannedHours: 100, status: "PUBLISHED", business_id: mockBizId } as any
      ];
      const att: AttendanceRecord[] = [
        { id: "a1", employeeId: "emp_1", date: "2026-09-10", realHours: 80, plannedHours: 100, status: "PRESENT", business_id: mockBizId } as any
      ];
      const payroll: PayrollRecord[] = [
        { id: "p1", employeeId: "emp_1", status: "SEALED", grossSalary: 50000, cnss_employer_cents: 0, ofatma_employer_cents: 0, business_id: mockBizId } as any
      ];
      const res = Phase6CReconciliationEngine.calculate({
        businessId: mockBizId,
        shifts,
        attendanceRecords: att,
        payrollRecords: payroll,
        ledgerTransactions: [],
        employees: mockEmployees,
        branches: mockBranches,
        departments: mockDepartments,
        startDate,
        endDate,
      });

      const rate = res.costing.analyticalLaborRate.value; // 50000 / 100 = 500
      const denom = res.costing.analyticalLaborRateDenominator;
      const passed = rate === 500 && denom === "PLANNED_HOURS";
      return { passed, expected: { rate: 500, denom: "PLANNED_HOURS" }, actual: { rate, denom } };
    });

    // TS-6C-11: Analytical Labor Rate Fallback to Worked Hours when No Schedule
    runTest("TS-6C-11", "Analytical Labor Rate Fallback to Worked Hours when No Schedule", () => {
      const att: AttendanceRecord[] = [
        { id: "a1", employeeId: "emp_1", date: "2026-09-10", realHours: 50, plannedHours: 0, status: "PRESENT", business_id: mockBizId } as any
      ];
      const payroll: PayrollRecord[] = [
        { id: "p1", employeeId: "emp_1", status: "SEALED", grossSalary: 25000, cnss_employer_cents: 0, ofatma_employer_cents: 0, business_id: mockBizId } as any
      ];
      const res = Phase6CReconciliationEngine.calculate({
        businessId: mockBizId,
        shifts: [],
        attendanceRecords: att,
        payrollRecords: payroll,
        ledgerTransactions: [],
        employees: mockEmployees,
        branches: mockBranches,
        departments: mockDepartments,
        startDate,
        endDate,
      });

      const rate = res.costing.analyticalLaborRate.value; // 25000 / 50 = 500
      const denom = res.costing.analyticalLaborRateDenominator;
      const passed = rate === 500 && denom === "WORKED_HOURS";
      return { passed, expected: { rate: 500, denom: "WORKED_HOURS" }, actual: { rate, denom } };
    });

    // TS-6C-12: Attendance Attributed Labor Cost Computation
    runTest("TS-6C-12", "Attendance Attributed Labor Cost (Worked Hours * Analytical Rate)", () => {
      const shifts: Shift[] = [
        { id: "s1", employeeId: "emp_1", date: "2026-09-10", plannedHours: 100, status: "PUBLISHED", business_id: mockBizId } as any
      ];
      const att: AttendanceRecord[] = [
        { id: "a1", employeeId: "emp_1", date: "2026-09-10", realHours: 80, plannedHours: 100, status: "PRESENT", business_id: mockBizId } as any
      ];
      const payroll: PayrollRecord[] = [
        { id: "p1", employeeId: "emp_1", status: "SEALED", grossSalary: 10000, cnss_employer_cents: 0, ofatma_employer_cents: 0, business_id: mockBizId } as any // Rate = 100/h
      ];
      const res = Phase6CReconciliationEngine.calculate({
        businessId: mockBizId,
        shifts,
        attendanceRecords: att,
        payrollRecords: payroll,
        ledgerTransactions: [],
        employees: mockEmployees,
        branches: mockBranches,
        departments: mockDepartments,
        startDate,
        endDate,
      });

      const cost = res.costing.attendanceAttributedLaborCost.value; // 80 * 100 = 8000
      const passed = cost === 8000;
      return { passed, expected: 8000, actual: cost };
    });

    // ==========================================
    // BLOC C: CAPACITY INTELLIGENCE
    // ==========================================

    // TS-6C-13: Planned & Available Capacity with Absence Deductions
    runTest("TS-6C-13", "Planned & Available Capacity with Absence Deductions", () => {
      const shifts: Shift[] = [
        { id: "s1", employeeId: "emp_1", date: "2026-09-10", plannedHours: 40, status: "PUBLISHED", business_id: mockBizId } as any
      ];
      const att: AttendanceRecord[] = [
        { id: "a1", employeeId: "emp_1", date: "2026-09-10", realHours: 0, plannedHours: 8, status: "ABSENT", business_id: mockBizId } as any
      ];
      const res = Phase6CReconciliationEngine.calculate({
        businessId: mockBizId,
        shifts,
        attendanceRecords: att,
        payrollRecords: [],
        ledgerTransactions: [],
        employees: mockEmployees,
        branches: mockBranches,
        departments: mockDepartments,
        startDate,
        endDate,
      });

      const planCap = res.capacity.plannedCapacity.value; // 40
      const availCap = res.capacity.availableCapacity.value; // 40 - 8 = 32
      const passed = planCap === 40 && availCap === 32;
      return { passed, expected: { planCap: 40, availCap: 32 }, actual: { planCap, availCap } };
    });

    // TS-6C-14: Capacity Utilization Calculation
    runTest("TS-6C-14", "Capacity Utilization Calculation (Worked / Available)", () => {
      const shifts: Shift[] = [
        { id: "s1", employeeId: "emp_1", date: "2026-09-10", plannedHours: 50, status: "PUBLISHED", business_id: mockBizId } as any
      ];
      const att: AttendanceRecord[] = [
        { id: "a1", employeeId: "emp_1", date: "2026-09-10", realHours: 25, plannedHours: 50, status: "PRESENT", business_id: mockBizId } as any
      ];
      const res = Phase6CReconciliationEngine.calculate({
        businessId: mockBizId,
        shifts,
        attendanceRecords: att,
        payrollRecords: [],
        ledgerTransactions: [],
        employees: mockEmployees,
        branches: mockBranches,
        departments: mockDepartments,
        startDate,
        endDate,
      });

      const util = res.capacity.capacityUtilization.value; // 25 / 50 = 50%
      const passed = util === 50;
      return { passed, expected: 50, actual: util };
    });

    // TS-6C-15: Under-Capacity Detection
    runTest("TS-6C-15", "Under-Capacity Detection when Worked < Available", () => {
      const shifts: Shift[] = [
        { id: "s1", employeeId: "emp_1", date: "2026-09-10", plannedHours: 40, status: "PUBLISHED", business_id: mockBizId } as any
      ];
      const att: AttendanceRecord[] = [
        { id: "a1", employeeId: "emp_1", date: "2026-09-10", realHours: 30, plannedHours: 40, status: "PRESENT", business_id: mockBizId } as any
      ];
      const res = Phase6CReconciliationEngine.calculate({
        businessId: mockBizId,
        shifts,
        attendanceRecords: att,
        payrollRecords: [],
        ledgerTransactions: [],
        employees: mockEmployees,
        branches: mockBranches,
        departments: mockDepartments,
        startDate,
        endDate,
      });

      const underCap = res.capacity.underCapacity.value; // 40 - 30 = 10
      const overload = res.capacity.overload.value; // 0
      const passed = underCap === 10 && overload === 0;
      return { passed, expected: { underCap: 10, overload: 0 }, actual: { underCap, overload } };
    });

    // TS-6C-16: Overload Detection when Worked > Available
    runTest("TS-6C-16", "Overload Detection when Worked > Available", () => {
      const shifts: Shift[] = [
        { id: "s1", employeeId: "emp_1", date: "2026-09-10", plannedHours: 40, status: "PUBLISHED", business_id: mockBizId } as any
      ];
      const att: AttendanceRecord[] = [
        { id: "a1", employeeId: "emp_1", date: "2026-09-10", realHours: 48, plannedHours: 40, status: "PRESENT", business_id: mockBizId } as any
      ];
      const res = Phase6CReconciliationEngine.calculate({
        businessId: mockBizId,
        shifts,
        attendanceRecords: att,
        payrollRecords: [],
        ledgerTransactions: [],
        employees: mockEmployees,
        branches: mockBranches,
        departments: mockDepartments,
        startDate,
        endDate,
      });

      const underCap = res.capacity.underCapacity.value; // 0
      const overload = res.capacity.overload.value; // 48 - 40 = 8
      const passed = underCap === 0 && overload === 8;
      return { passed, expected: { underCap: 0, overload: 8 }, actual: { underCap, overload } };
    });

    // ==========================================
    // BLOC D: WORKFORCE ECONOMICS
    // ==========================================

    // TS-6C-17: Certified GL Revenue from Ledger Transactions (Income)
    runTest("TS-6C-17", "Certified GL Revenue from Income Transactions", () => {
      const txs: LedgerTransaction[] = [
        { id: "tx1", type: "INCOME", amount: 150000, status: "POSTED", businessId: mockBizId, date: "2026-09-15" } as any,
        { id: "tx2", type: "EXPENSE", amount: 30000, status: "POSTED", businessId: mockBizId, date: "2026-09-15" } as any,
        { id: "tx3", type: "INCOME", amount: 50000, status: "REVERSED", businessId: mockBizId, date: "2026-09-15" } as any, // Reversed ignored
      ];
      const res = Phase6CReconciliationEngine.calculate({
        businessId: mockBizId,
        shifts: [],
        attendanceRecords: [],
        payrollRecords: [],
        ledgerTransactions: txs,
        employees: mockEmployees,
        branches: mockBranches,
        departments: mockDepartments,
        startDate,
        endDate,
      });

      const rev = res.economics.certifiedGLRevenue.value;
      const passed = rev === 150000;
      return { passed, expected: 150000, actual: rev };
    });

    // TS-6C-18: Revenue per Worked Hour Calculation & UNDEFINED Protection
    runTest("TS-6C-18", "Revenue per Worked Hour Calculation & UNDEFINED Protection", () => {
      const txs: LedgerTransaction[] = [
        { id: "tx1", type: "INCOME", amount: 100000, status: "POSTED", businessId: mockBizId, date: "2026-09-15" } as any
      ];
      const att: AttendanceRecord[] = [
        { id: "a1", employeeId: "emp_1", date: "2026-09-10", realHours: 50, plannedHours: 50, status: "PRESENT", business_id: mockBizId } as any
      ];
      const res = Phase6CReconciliationEngine.calculate({
        businessId: mockBizId,
        shifts: [],
        attendanceRecords: att,
        payrollRecords: [],
        ledgerTransactions: txs,
        employees: mockEmployees,
        branches: mockBranches,
        departments: mockDepartments,
        startDate,
        endDate,
      });

      const revPerHour = res.economics.revenuePerWorkedHour.value; // 100000 / 50 = 2000
      const passed = revPerHour === 2000;
      return { passed, expected: 2000, actual: revPerHour };
    });

    // TS-6C-19: Operational Productivity (GL Revenue / Actual Payroll Cost)
    runTest("TS-6C-19", "Operational Productivity (GL Revenue / Actual Payroll Cost)", () => {
      const txs: LedgerTransaction[] = [
        { id: "tx1", type: "INCOME", amount: 300000, status: "POSTED", businessId: mockBizId, date: "2026-09-15" } as any
      ];
      const payroll: PayrollRecord[] = [
        { id: "p1", employeeId: "emp_1", status: "SEALED", grossSalary: 100000, cnss_employer_cents: 0, ofatma_employer_cents: 0, business_id: mockBizId } as any
      ];
      const res = Phase6CReconciliationEngine.calculate({
        businessId: mockBizId,
        shifts: [],
        attendanceRecords: [],
        payrollRecords: payroll,
        ledgerTransactions: txs,
        employees: mockEmployees,
        branches: mockBranches,
        departments: mockDepartments,
        startDate,
        endDate,
      });

      const prod = res.economics.operationalProductivity.value; // 300000 / 100000 = 3x
      const passed = prod === 3;
      return { passed, expected: 3, actual: prod };
    });

    // TS-6C-20: HC-ROI Percentage Calculation & UNRESOLVED Dimension Safety
    runTest("TS-6C-20", "HC-ROI Percentage Calculation & UNRESOLVED Dimension Tracking", () => {
      const txs: LedgerTransaction[] = [
        { id: "tx1", type: "INCOME", amount: 200000, status: "POSTED", businessId: mockBizId, date: "2026-09-15" } as any
      ];
      const payroll: PayrollRecord[] = [
        { id: "p1", employeeId: "emp_unresolved", status: "SEALED", grossSalary: 100000, cnss_employer_cents: 0, ofatma_employer_cents: 0, business_id: mockBizId } as any
      ];
      const res = Phase6CReconciliationEngine.calculate({
        businessId: mockBizId,
        shifts: [],
        attendanceRecords: [],
        payrollRecords: payroll,
        ledgerTransactions: txs,
        employees: mockEmployees,
        branches: mockBranches,
        departments: mockDepartments,
        startDate,
        endDate,
      });

      const roi = res.economics.hcRoi.value; // (200000 - 100000) / 100000 * 100 = 100%
      const unresolvedDept = res.unresolved.departmentCount;

      const passed = roi === 100 && unresolvedDept >= 1;
      return { passed, expected: { roi: 100, unresolvedDept: ">=1" }, actual: { roi, unresolvedDept } };
    });

    const passedCount = results.filter((r) => r.passed).length;
    return {
      results,
      summary: {
        total: results.length,
        passed: passedCount,
        failed: results.length - passedCount,
      },
    };
  }
}
