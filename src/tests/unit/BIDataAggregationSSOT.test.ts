import { describe, it, expect } from "vitest";
import { AnalyticsEngine, resolveEmployeeContractualHours } from "../../domains/analytics/services/AnalyticsEngine";
import { selectSimplifiedMetrics, selectExpertMetrics } from "../../domains/performance/selectors";
import { Employee, LedgerTransaction, PayrollRecord, AttendanceRecord, Branch, Department } from "../../types";

describe("BI-P1.4.4 — Attendance Semantic Remediation & Negative Test Suite", () => {
  const mockEmployees: Employee[] = [
    {
      id: "emp-1",
      name: "Jean Baptiste",
      email: "jean@example.com",
      status: "ACTIVE",
      role: "SENIOR_TELLER",
      branchId: "branch-1",
      departmentId: "dept-1",
      baseSalary: 25000,
      paymentModel: "FIXED",
      contractType: "cdi",
      payRegime: "fixe",
      contractualHoursPerWeek: 40,
      workingDaysPerWeek: 5,
    } as any,
    {
      id: "emp-2",
      name: "Marie Celestin",
      email: "marie@example.com",
      status: "ACTIVE",
      role: "JUNIOR_TELLER",
      branchId: "branch-1",
      departmentId: "dept-1",
      baseSalary: 20000,
      paymentModel: "FIXED",
      contractType: "cdi",
      payRegime: "fixe",
      contractualHoursPerWeek: 40,
      workingDaysPerWeek: 5,
    } as any,
  ];

  const mockBranches: Branch[] = [
    { id: "branch-1", name: "Main Branch", business_id: "biz-1" },
  ];

  const mockDepartments: Department[] = [
    { id: "dept-1", name: "Operations", business_id: "biz-1" },
  ];

  const mockAttendance: AttendanceRecord[] = [
    {
      id: "att-1",
      employeeId: "emp-1",
      employeeName: "Jean Baptiste",
      business_id: "biz-1",
      branchId: "branch-1",
      departmentId: "dept-1",
      date: "2026-03-01",
      checkIn: "08:00:00",
      checkOut: "16:00:00",
      status: "NORMAL",
      realHours: 8,
      plannedHours: 8,
      variance: 0,
    },
    {
      id: "att-2",
      employeeId: "emp-1",
      employeeName: "Jean Baptiste",
      business_id: "biz-1",
      branchId: "branch-1",
      departmentId: "dept-1",
      date: "2026-03-02",
      checkIn: "08:00:00",
      checkOut: "16:00:00",
      status: "NORMAL",
      realHours: 8,
      plannedHours: 8,
      variance: 0,
    },
    {
      id: "att-3",
      employeeId: "emp-2",
      employeeName: "Marie Celestin",
      business_id: "biz-1",
      branchId: "branch-1",
      departmentId: "dept-1",
      date: "2026-03-01",
      checkIn: "08:00:00",
      checkOut: "16:00:00",
      status: "NORMAL",
      realHours: 8,
      plannedHours: 8,
      variance: 0,
    },
    {
      id: "att-4",
      employeeId: "emp-2",
      employeeName: "Marie Celestin",
      business_id: "biz-1",
      branchId: "branch-1",
      departmentId: "dept-1",
      date: "2026-03-02",
      checkIn: "08:00:00",
      checkOut: "16:00:00",
      status: "ABSENT",
      realHours: 0,
      plannedHours: 8,
      variance: -8,
    },
  ];

  const mockTransactions: LedgerTransaction[] = [
    {
      id: "tx-inc-1",
      business_id: "biz-1",
      date: "2026-03-02",
      type: "INCOME",
      amount: 100000,
      amount_cents: 10000000,
      currency: "HTG",
      status: "POSTED",
      branchId: "branch-1",
      departmentId: "dept-1",
      category: "OPERATING",
      description: "Service Fee",
      isImmutable: true,
      signerId: "sys",
      source: "MANUAL",
    },
    {
      id: "tx-exp-1",
      business_id: "biz-1",
      date: "2026-03-03",
      type: "EXPENSE",
      amount: 25000,
      amount_cents: 2500000,
      currency: "HTG",
      status: "POSTED",
      branchId: "branch-1",
      departmentId: "dept-1",
      category: "OFFICE_SUPPLIES",
      description: "Supplies",
      isImmutable: true,
      signerId: "sys",
      source: "MANUAL",
    },
  ];

  const mockPayrolls: PayrollRecord[] = [
    {
      id: "pay-1",
      employeeId: "emp-1",
      business_id: "biz-1",
      period_start: "2026-03-01",
      period_end: "2026-03-15",
      grossSalary: 25000,
      netPay: 20000,
      status: "PAID",
      workedHours: 80,
    } as any,
  ];

  it("computes both attendanceRate (utilization) and attendanceFrequency (expected working days ratio) in generateSnapshot", () => {
    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: "2026-03-01", endDate: "2026-03-15" },
      employees: mockEmployees,
      transactions: mockTransactions,
      attendanceLogs: mockAttendance,
      payrollRecords: mockPayrolls,
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz-1",
      language: "fr",
    });

    expect(snapshot.attendanceRate).toBeDefined();
    expect(snapshot.attendanceFrequency).toBeDefined();

    expect(typeof snapshot.attendanceRate.currentValue).toBe("number");
    expect(typeof snapshot.attendanceFrequency!.currentValue).toBe("number");

    // 2 employees, 5 working days/week (Mon-Fri) in March 1-15: 10 working days each = 20 total expected working days.
    // 3 distinct present days across both employees: 3 / 20 * 100 = 15.0%
    expect(snapshot.attendanceFrequency!.currentValue).toBe(15);

    // Worked hours: emp-1 (16h) + emp-2 (8h) = 24h. Expected: 10 days * 8h * 2 emps = 160h.
    // 24 / 160 * 100 = 15.0%
    expect(snapshot.attendanceRate.currentValue).toBe(15);
  });

  it("populates attendanceFrequency on branchPerformance and departmentPerformance", () => {
    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: "2026-03-01", endDate: "2026-03-15" },
      employees: mockEmployees,
      transactions: mockTransactions,
      attendanceLogs: mockAttendance,
      payrollRecords: mockPayrolls,
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz-1",
      language: "fr",
    });

    expect(snapshot.branchPerformance).toHaveLength(1);
    expect(snapshot.branchPerformance[0].attendanceRate).toBeDefined();
    expect(snapshot.branchPerformance[0].attendanceFrequency).toBe(15);

    expect(snapshot.departmentPerformance).toHaveLength(1);
    expect(snapshot.departmentPerformance[0].attendanceRate).toBeDefined();
    expect(snapshot.departmentPerformance[0].attendanceFrequency).toBe(15);
  });

  // ============================================================================
  // SECTION 3: P0 — ATTENDANCE FREQUENCY DENOMINATOR TESTS
  // ============================================================================

  it("produces approximately 18.2% attendance frequency for 22 expected days with 4 present days", () => {
    const singleEmp: Employee = {
      id: "emp-single-22",
      name: "Jean Single",
      email: "single@example.com",
      status: "ACTIVE",
      role: "SENIOR_TELLER",
      branchId: "branch-1",
      departmentId: "dept-1",
      baseSalary: 25000,
      paymentModel: "FIXED",
      contractualHoursPerWeek: 40,
      workingDaysPerWeek: 5, // Mon-Fri -> exactly 22 working days in March 2026
    } as any;

    const fourDaysAttendance: AttendanceRecord[] = [
      { id: "a-1", employeeId: "emp-single-22", employeeName: "Jean Single", business_id: "biz-1", branchId: "branch-1", date: "2026-03-02", checkIn: "08:00", checkOut: "16:00", status: "NORMAL", realHours: 8, plannedHours: 8, variance: 0 },
      { id: "a-2", employeeId: "emp-single-22", employeeName: "Jean Single", business_id: "biz-1", branchId: "branch-1", date: "2026-03-03", checkIn: "08:00", checkOut: "16:00", status: "NORMAL", realHours: 8, plannedHours: 8, variance: 0 },
      { id: "a-3", employeeId: "emp-single-22", employeeName: "Jean Single", business_id: "biz-1", branchId: "branch-1", date: "2026-03-04", checkIn: "08:00", checkOut: "16:00", status: "NORMAL", realHours: 8, plannedHours: 8, variance: 0 },
      { id: "a-4", employeeId: "emp-single-22", employeeName: "Jean Single", business_id: "biz-1", branchId: "branch-1", date: "2026-03-05", checkIn: "08:00", checkOut: "16:00", status: "NORMAL", realHours: 8, plannedHours: 8, variance: 0 },
    ];

    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: "2026-03-01", endDate: "2026-03-31" },
      employees: [singleEmp],
      transactions: [],
      attendanceLogs: fourDaysAttendance,
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz-1",
      language: "fr",
    });

    // 4 present days / 22 expected working days = 18.1818...% -> 18.2%
    expect(snapshot.attendanceFrequency!.currentValue).toBe(18.2);
  });

  it("does not reduce expected-working-days denominator when attendance records are missing", () => {
    const emp: Employee = {
      id: "emp-missing-records",
      name: "Missing Records",
      email: "missing@example.com",
      status: "ACTIVE",
      role: "SENIOR_TELLER",
      branchId: "branch-1",
      departmentId: "dept-1",
      baseSalary: 25000,
      paymentModel: "FIXED",
      contractualHoursPerWeek: 40,
      workingDaysPerWeek: 5, // 22 expected working days in March 2026
    } as any;

    // Only 2 attendance records exist in the entire database for the month
    const twoRecordsAttendance: AttendanceRecord[] = [
      { id: "a-1", employeeId: "emp-missing-records", employeeName: "Missing Records", business_id: "biz-1", branchId: "branch-1", date: "2026-03-02", checkIn: "08:00", checkOut: "16:00", status: "NORMAL", realHours: 8, plannedHours: 8, variance: 0 },
      { id: "a-2", employeeId: "emp-missing-records", employeeName: "Missing Records", business_id: "biz-1", branchId: "branch-1", date: "2026-03-03", checkIn: "08:00", checkOut: "16:00", status: "NORMAL", realHours: 8, plannedHours: 8, variance: 0 },
    ];

    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: "2026-03-01", endDate: "2026-03-31" },
      employees: [emp],
      transactions: [],
      attendanceLogs: twoRecordsAttendance,
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz-1",
      language: "fr",
    });

    // Denominator remains 22 days (NOT 2 records!). 2 / 22 * 100 = 9.09% -> 9.1%
    expect(snapshot.attendanceFrequency!.currentValue).toBe(9.1);
  });

  it("correctly aggregates denominator across multiple employees", () => {
    const empA: Employee = {
      id: "emp-multi-a",
      name: "Emp A",
      email: "a@example.com",
      status: "ACTIVE",
      role: "SENIOR_TELLER",
      branchId: "branch-1",
      departmentId: "dept-1",
      baseSalary: 25000,
      paymentModel: "FIXED",
      contractualHoursPerWeek: 40,
      workingDaysPerWeek: 5, // 22 days
    } as any;

    const empB: Employee = {
      id: "emp-multi-b",
      name: "Emp B",
      email: "b@example.com",
      status: "ACTIVE",
      role: "JUNIOR_TELLER",
      branchId: "branch-1",
      departmentId: "dept-1",
      baseSalary: 20000,
      paymentModel: "FIXED",
      contractualHoursPerWeek: 40,
      workingDaysPerWeek: 5, // 22 days
    } as any;

    // Emp A has 4 present days, Emp B has 7 present days = 11 present days
    const attendanceLogs: AttendanceRecord[] = [
      ...["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05"].map((d, i) => ({
        id: `att-a-${i}`, employeeId: "emp-multi-a", employeeName: "Emp A", business_id: "biz-1", branchId: "branch-1", date: d, checkIn: "08:00", checkOut: "16:00", status: "NORMAL" as const, realHours: 8, plannedHours: 8, variance: 0
      })),
      ...["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-09", "2026-03-10"].map((d, i) => ({
        id: `att-b-${i}`, employeeId: "emp-multi-b", employeeName: "Emp B", business_id: "biz-1", branchId: "branch-1", date: d, checkIn: "08:00", checkOut: "16:00", status: "NORMAL" as const, realHours: 8, plannedHours: 8, variance: 0
      })),
    ];

    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: "2026-03-01", endDate: "2026-03-31" },
      employees: [empA, empB],
      transactions: [],
      attendanceLogs,
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz-1",
      language: "fr",
    });

    // Aggregated denominator: 22 + 22 = 44 days.
    // Days present: 4 + 7 = 11.
    // 11 / 44 * 100 = 25.0%
    expect(snapshot.attendanceFrequency!.currentValue).toBe(25);
  });

  it("excludes explicitly configured holidays from expected working days", () => {
    const emp: Employee = {
      id: "emp-holiday-test",
      name: "Holiday Test",
      email: "holiday@example.com",
      status: "ACTIVE",
      role: "SENIOR_TELLER",
      branchId: "branch-1",
      departmentId: "dept-1",
      baseSalary: 25000,
      paymentModel: "FIXED",
      contractualHoursPerWeek: 40,
      workingDaysPerWeek: 5, // March 2026 base Mon-Fri = 22 days
    } as any;

    const fourDaysAttendance: AttendanceRecord[] = [
      { id: "a-1", employeeId: "emp-holiday-test", employeeName: "Holiday Test", business_id: "biz-1", branchId: "branch-1", date: "2026-03-02", checkIn: "08:00", checkOut: "16:00", status: "NORMAL", realHours: 8, plannedHours: 8, variance: 0 },
      { id: "a-2", employeeId: "emp-holiday-test", employeeName: "Holiday Test", business_id: "biz-1", branchId: "branch-1", date: "2026-03-03", checkIn: "08:00", checkOut: "16:00", status: "NORMAL", realHours: 8, plannedHours: 8, variance: 0 },
      { id: "a-3", employeeId: "emp-holiday-test", employeeName: "Holiday Test", business_id: "biz-1", branchId: "branch-1", date: "2026-03-04", checkIn: "08:00", checkOut: "16:00", status: "NORMAL", realHours: 8, plannedHours: 8, variance: 0 },
      { id: "a-4", employeeId: "emp-holiday-test", employeeName: "Holiday Test", business_id: "biz-1", branchId: "branch-1", date: "2026-03-05", checkIn: "08:00", checkOut: "16:00", status: "NORMAL", realHours: 8, plannedHours: 8, variance: 0 },
    ];

    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: "2026-03-01", endDate: "2026-03-31" },
      employees: [emp],
      transactions: [],
      attendanceLogs: fourDaysAttendance,
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessSettings: {
        holidays: ["2026-03-06", "2026-03-13"], // 2 configured business holidays on weekdays
      },
      businessId: "biz-1",
      language: "fr",
    });

    // 22 weekdays - 2 holidays = 20 expected working days.
    // 4 present days / 20 expected working days = 20.0%
    expect(snapshot.attendanceFrequency!.currentValue).toBe(20);
  });

  it("handles empty or invalid reporting periods safely without error", () => {
    // 1. Inverted / invalid reporting period (startDate > endDate)
    const invalidPeriodSnapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: "2026-03-20", endDate: "2026-03-01" },
      employees: mockEmployees,
      transactions: [],
      attendanceLogs: [],
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz-1",
      language: "fr",
    });

    expect(invalidPeriodSnapshot.attendanceFrequency!.currentValue).toBeNull();
    expect(invalidPeriodSnapshot.attendanceFrequency!.state).toBe("NO_DATA");
    expect(invalidPeriodSnapshot.attendanceRate.currentValue).toBeNull();
    expect(invalidPeriodSnapshot.attendanceRate.state).toBe("NO_DATA");

    // 2. Empty employee cohort with empty custom range
    const emptySnapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: "", endDate: "" },
      employees: [],
      transactions: [],
      attendanceLogs: [],
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz-1",
      language: "fr",
    });

    expect(emptySnapshot.attendanceFrequency!.currentValue).toBeNull();
    expect(emptySnapshot.attendanceFrequency!.state).toBe("NO_DATA");
    expect(emptySnapshot.attendanceRate.currentValue).toBeNull();
    expect(emptySnapshot.attendanceRate.state).toBe("NO_DATA");
  });

  // ============================================================================
  // SECTION 5: P0 — NEGATIVE TESTS FOR FABRICATED 8-HOUR FALLBACKS
  // ============================================================================

  it("Test A: handles incomplete employee with worked hours without applying 8-hour fallback", () => {
    const incompleteEmpWithWorkedHours: Employee = {
      id: "emp-inc-worked",
      name: "Alex Incomplete Worked",
      email: "inc-worked@example.com",
      status: "ACTIVE",
      role: "JUNIOR_TELLER",
      branchId: "branch-1",
      departmentId: "dept-1",
      baseSalary: 20000,
      paymentModel: "FIXED",
      // No contractualHoursPerWeek or dailyHours
    } as any;

    const workedLogs: AttendanceRecord[] = [
      {
        id: "att-inc-1",
        employeeId: "emp-inc-worked",
        employeeName: "Alex Incomplete Worked",
        business_id: "biz-1",
        branchId: "branch-1",
        departmentId: "dept-1",
        date: "2026-03-02",
        checkIn: "08:00:00",
        checkOut: "16:00:00",
        status: "NORMAL",
        realHours: 8,
        plannedHours: 0, // No sealed contractual hours
        variance: 8,
      },
      {
        id: "att-inc-2",
        employeeId: "emp-inc-worked",
        employeeName: "Alex Incomplete Worked",
        business_id: "biz-1",
        branchId: "branch-1",
        departmentId: "dept-1",
        date: "2026-03-03",
        checkIn: "08:00:00",
        checkOut: "16:00:00",
        status: "NORMAL",
        realHours: 8,
        plannedHours: 0,
        variance: 8,
      },
    ];

    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: "2026-03-01", endDate: "2026-03-15" },
      employees: [incompleteEmpWithWorkedHours],
      transactions: [],
      attendanceLogs: workedLogs,
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz-1",
      language: "fr",
    });

    // Incomplete employee must be flagged
    expect(snapshot.incompleteConfigCount).toBe(1);

    // Contractual utilization & frequency must be non-computable (null / NO_DATA), NEVER 0% or 16.7%
    expect(snapshot.attendanceRate.currentValue).toBeNull();
    expect(snapshot.attendanceRate.state).toBe("NO_DATA");

    // Attendance frequency must not contaminate or fabricate a denominator
    expect(snapshot.attendanceFrequency!.currentValue).toBeNull();
    expect(snapshot.attendanceFrequency!.state).toBe("NO_DATA");

    // Actual operational worked hours remain tracked in employee scorecard and average hours
    expect(snapshot.employeeScorecards[0].totalHours).toBe(16);
    expect(snapshot.employeeScorecards[0].attendanceConsistencyScore).toBeNull(); // Non-computable contractual score
  });

  it("Test B: handles all employees incomplete without Math.max(1, ...) fallback denominator", () => {
    const incEmps: Employee[] = [
      { id: "inc-1", name: "Inc One", email: "inc1@example.com", status: "ACTIVE", role: "JUNIOR_TELLER", branchId: "branch-1", departmentId: "dept-1", baseSalary: 20000, paymentModel: "FIXED" } as any,
      { id: "inc-2", name: "Inc Two", email: "inc2@example.com", status: "ACTIVE", role: "JUNIOR_TELLER", branchId: "branch-1", departmentId: "dept-1", baseSalary: 20000, paymentModel: "FIXED" } as any,
      { id: "inc-3", name: "Inc Three", email: "inc3@example.com", status: "ACTIVE", role: "JUNIOR_TELLER", branchId: "branch-1", departmentId: "dept-1", baseSalary: 20000, paymentModel: "FIXED" } as any,
    ];

    const logs: AttendanceRecord[] = [
      { id: "l-1", employeeId: "inc-1", employeeName: "Inc One", business_id: "biz-1", branchId: "branch-1", date: "2026-03-02", checkIn: "08:00", checkOut: "16:00", status: "NORMAL", realHours: 8, plannedHours: 0, variance: 8 },
      { id: "l-2", employeeId: "inc-2", employeeName: "Inc Two", business_id: "biz-1", branchId: "branch-1", date: "2026-03-02", checkIn: "08:00", checkOut: "16:00", status: "NORMAL", realHours: 8, plannedHours: 0, variance: 8 },
    ];

    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: "2026-03-01", endDate: "2026-03-15" },
      employees: incEmps,
      transactions: [],
      attendanceLogs: logs,
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz-1",
      language: "fr",
    });

    expect(snapshot.incompleteConfigCount).toBe(3);
    expect(snapshot.attendanceRate.currentValue).toBeNull();
    expect(snapshot.attendanceRate.state).toBe("NO_DATA");
    expect(snapshot.attendanceFrequency!.currentValue).toBeNull();
    expect(snapshot.attendanceFrequency!.state).toBe("NO_DATA");
  });

  it("Test C: ensures only eligible employees contribute to expected hours denominator in mixed groups", () => {
    const eligibleEmp: Employee = {
      id: "emp-eligible",
      name: "Eligible Worker",
      email: "eligible@example.com",
      status: "ACTIVE",
      role: "SENIOR_TELLER",
      branchId: "branch-1",
      departmentId: "dept-1",
      baseSalary: 25000,
      paymentModel: "FIXED",
      contractualHoursPerWeek: 40,
      workingDaysPerWeek: 5, // 10 working days in March 1-15 -> 80h expected
    } as any;

    const incompleteEmp: Employee = {
      id: "emp-incomplete-mixed",
      name: "Incomplete Worker",
      email: "inc-mixed@example.com",
      status: "ACTIVE",
      role: "JUNIOR_TELLER",
      branchId: "branch-1",
      departmentId: "dept-1",
      baseSalary: 20000,
      paymentModel: "FIXED",
      // No contractual hours
    } as any;

    const logs: AttendanceRecord[] = [
      // Eligible employee worked 40h out of 80h expected (50% utilization)
      { id: "el-1", employeeId: "emp-eligible", employeeName: "Eligible Worker", business_id: "biz-1", branchId: "branch-1", date: "2026-03-02", checkIn: "08:00", checkOut: "16:00", status: "NORMAL", realHours: 40, plannedHours: 8, variance: 32 },
      // Incomplete employee worked 30h
      { id: "inc-1", employeeId: "emp-incomplete-mixed", employeeName: "Incomplete Worker", business_id: "biz-1", branchId: "branch-1", date: "2026-03-02", checkIn: "08:00", checkOut: "16:00", status: "NORMAL", realHours: 30, plannedHours: 0, variance: 30 },
    ];

    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: "2026-03-01", endDate: "2026-03-15" },
      employees: [eligibleEmp, incompleteEmp],
      transactions: [],
      attendanceLogs: logs,
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz-1",
      language: "fr",
    });

    // Incomplete employee is counted once
    expect(snapshot.incompleteConfigCount).toBe(1);

    // Contractual utilization must ONLY consider eligible employee: 40h / 80h = 50.0%
    // Incomplete employee's 30h must NOT be added to numerator or denominator
    expect(snapshot.attendanceRate.currentValue).toBe(50);
  });

  it("Test D: preserves authoritative sealed historical AttendanceRecord.plannedHours", () => {
    const empWithDifferentContract: Employee = {
      id: "emp-sealed-test",
      name: "Sealed PlannedHours Test",
      email: "sealed@example.com",
      status: "ACTIVE",
      role: "SENIOR_TELLER",
      branchId: "branch-1",
      departmentId: "dept-1",
      baseSalary: 25000,
      paymentModel: "FIXED",
      contractualHoursPerWeek: 40, // 8h per day
      workingDaysPerWeek: 5,
    } as any;

    // Attendance record has sealed plannedHours = 6 (special agreed shift)
    const sealedLog: AttendanceRecord = {
      id: "att-sealed-1",
      employeeId: "emp-sealed-test",
      employeeName: "Sealed PlannedHours Test",
      business_id: "biz-1",
      branchId: "branch-1",
      date: "2026-03-02",
      checkIn: "08:00",
      checkOut: "14:00",
      status: "NORMAL",
      realHours: 6,
      plannedHours: 6, // Sealed historical value
      variance: 0,
    };

    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: "2026-03-01", endDate: "2026-03-15" },
      employees: [empWithDifferentContract],
      transactions: [],
      attendanceLogs: [sealedLog],
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz-1",
      language: "fr",
    });

    expect(snapshot.employeeScorecards[0].totalHours).toBe(6);
  });

  it("Test E: catches regression when an incomplete employee has positive worked hours", () => {
    const incompleteEmp: Employee = {
      id: "emp-blind-spot",
      name: "Blind Spot Worker",
      email: "blind@example.com",
      status: "ACTIVE",
      role: "JUNIOR_TELLER",
      branchId: "branch-1",
      departmentId: "dept-1",
      baseSalary: 20000,
      paymentModel: "FIXED",
      // Incomplete contractual profile
    } as any;

    const positiveWorkedLogs: AttendanceRecord[] = [
      {
        id: "att-blind-1",
        employeeId: "emp-blind-spot",
        employeeName: "Blind Spot Worker",
        business_id: "biz-1",
        branchId: "branch-1",
        date: "2026-03-02",
        checkIn: "08:00",
        checkOut: "16:00",
        status: "NORMAL",
        realHours: 24, // 24 hours logged
        plannedHours: 0,
        variance: 24,
      },
    ];

    const snapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: "2026-03-01", endDate: "2026-03-15" },
      employees: [incompleteEmp],
      transactions: [],
      attendanceLogs: positiveWorkedLogs,
      payrollRecords: [],
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz-1",
      language: "fr",
    });

    expect(snapshot.incompleteConfigCount).toBe(1);
    // MUST NOT produce 25.0% (24h / 96h quinzaine fallback) OR 0% when non-computable!
    expect(snapshot.attendanceRate.currentValue).toBeNull();
    expect(snapshot.attendanceRate.state).toBe("NO_DATA");
  });

  // ============================================================================
  // SECTION 6: CONTRACTUAL HOURS RESOLUTION CASCADE & PIC PARITY
  // ============================================================================

  it("resolves contractual daily hours via dailyHours -> weeklyHours/workingDaysPerWeek -> INCOMPLETE_CONFIG cascade", () => {
    const directDailyEmp = { id: "c-1", dailyHours: 7, weeklyHours: 40, workingDaysPerWeek: 5 } as any;
    const weeklyDerivedEmp = { id: "c-2", weeklyHours: 35, workingDaysPerWeek: 5 } as any;
    const incompleteEmp = { id: "c-3" } as any;

    const r1 = resolveEmployeeContractualHours(directDailyEmp);
    expect(r1.dailyHours).toBe(7);
    expect(r1.resolutionSource).toBe("CONTRACT_DAILY");
    expect(r1.isIncompleteConfig).toBe(false);

    const r2 = resolveEmployeeContractualHours(weeklyDerivedEmp);
    expect(r2.dailyHours).toBe(7);
    expect(r2.resolutionSource).toBe("CONTRACT_WEEKLY");
    expect(r2.isIncompleteConfig).toBe(false);

    const r3 = resolveEmployeeContractualHours(incompleteEmp);
    expect(r3.dailyHours).toBeNull();
    expect(r3.resolutionSource).toBe("INCOMPLETE_CONFIG");
    expect(r3.isIncompleteConfig).toBe(true);
  });

  it("maintains strict SSOT parity between AnalyticsEngine and PIC selectors for both computable and NO_DATA states", () => {
    const filters = {
      period: "custom" as const,
      startDate: "2026-03-01",
      endDate: "2026-03-15",
      branchId: "ALL",
      departmentId: "ALL",
      metricType: "all" as const,
      searchQuery: "",
      accountingBasis: "ACCRUAL" as const,
    };

    const computableSnapshot = AnalyticsEngine.generateSnapshot({
      period: "CUSTOM",
      customRange: { startDate: "2026-03-01", endDate: "2026-03-15" },
      employees: mockEmployees,
      transactions: mockTransactions,
      attendanceLogs: mockAttendance,
      payrollRecords: mockPayrolls,
      branches: mockBranches,
      departments: mockDepartments,
      businessId: "biz-1",
      language: "fr",
    });

    const rawComputable = {
      employees: mockEmployees,
      transactions: mockTransactions,
      payrollRecords: mockPayrolls,
      attendanceRecords: mockAttendance,
      snapshots: [],
      branches: mockBranches,
      departments: mockDepartments,
    };

    const picSimple = selectSimplifiedMetrics(rawComputable, filters);
    const picExpert = selectExpertMetrics(rawComputable, filters);

    expect(picSimple.attendanceRate).toBe(computableSnapshot.attendanceRate.currentValue);
    expect(picExpert.branches[0].attendanceRate).toBe(computableSnapshot.branchPerformance[0].attendanceRate);
    expect(picExpert.departments[0].attendanceRate).toBe(computableSnapshot.departmentPerformance[0].attendanceRate);

    // Non-computable population (missing contractual schedule) must propagate null across all PIC selectors (never 95% or 0%)
    const incompleteEmps = mockEmployees.map(({ contractualHoursPerWeek, workingDaysPerWeek, ...rest }: any) => rest);
    const rawIncomplete = {
      ...rawComputable,
      employees: incompleteEmps,
    };

    const picSimpleNoData = selectSimplifiedMetrics(rawIncomplete, filters);
    const picExpertNoData = selectExpertMetrics(rawIncomplete, filters);

    expect(picSimpleNoData.attendanceRate).toBeNull();
    expect(picExpertNoData.branches[0].attendanceRate).toBeNull();
    expect(picExpertNoData.departments[0].attendanceRate).toBeNull();
    expect(picExpertNoData.employeeRankings[0].attendanceScore).toBeNull();
    expect(picExpertNoData.crossTableMatrix[0].attendanceRate).toBeNull();
  });
});
