import { describe, it, expect } from "vitest";
import { PayrollService } from "../../services/payroll/PayrollService";
import { PayrollCycle, PayrollRecord } from "../../types";

describe("Payroll Engine Calculation Rules & Rodson Charles Test Case", () => {
  const dummyCycle: PayrollCycle = {
    id: "cycle_2026_q1",
    cycleName: "Quinzaine du 01/08/2026 au 15/08/2026",
    startDate: "2026-08-01",
    endDate: "2026-08-15",
    status: "DRAFT",
    total_gross_cents: 0,
    total_net_cents: 0,
    total_deductions_cents: 0,
    business_id: "biz_test",
  };

  it("Case 1: Rodson Charles (COMMISSION, 114.32h, sales 72,450.15 HTG, Net 34,845.52 HTG)", async () => {
    const rodsonEmployee = {
      id: "emp_rodson",
      name: "Rodson Charles",
      paymentModel: "COMMISSION" as const,
      commission_rate: 0.45,
      hourlyRate: 81.6212,
      workedHours: 114.32,
      sales: 72450.15,
      taxExempt: true,
      business_id: "biz_test",
    };

    let calculatedRecords: PayrollRecord[] = [];

    const result = await PayrollService.processPayrollCycle(
      dummyCycle,
      [rodsonEmployee as any],
      "biz_test",
      {
        attendanceRecords: [],
        ledgerTransactions: [],
        salaryAdvances: [],
        payrollBonuses: [],
        payrollDeductions: [],
        policies: {
          standardQuinzaineHours: 96,
          overtimeRate150: 1.5,
          enableSurvivalFloor: false,
          isTaxesEnabled: false,
        },
        onAddRecords: (records) => {
          calculatedRecords = records;
        },
        onUpdateCycle: () => {},
      }
    );

    expect(result).toBeDefined();
    expect(calculatedRecords).toHaveLength(1);

    const record = calculatedRecords[0];
    expect(record.employeeName).toBe("Rodson Charles");
    expect(record.pay_profile).toBe("COMMISSION");
    expect(record.baseSalary).toBe(0); // Commission only has 0 base
    expect(record.salesHtg).toBe(72450.15);
    expect(record.commissions).toBe(32602.57); // 72,450.15 * 0.45 = 32,602.57 HTG
    expect(record.workedHours).toBe(114.32);
    expect(record.overtimeHours).toBe(18.32); // 114.32 - 96 = 18.32h
    expect(record.overtimePayout).toBe(2242.95); // 18.32 * 81.6212 * 1.5 = 2,242.95 HTG
    expect(record.grossSalary).toBe(34845.52); // 32,602.57 + 2,242.95
    expect(record.netPaid).toBe(34845.52); // Exactly 34,845.52 HTG!
  });

  it("Case 2: Fixed salary 10,000 HTG monthly -> 5,000 HTG quinzaine with normal 96h attendance", async () => {
    const fixedEmployee = {
      id: "emp_fixed",
      name: "Jean Dupont",
      paymentModel: "FIXED" as const,
      salaryBaseHtg: 10000, // Monthly base
      taxExempt: true,
      business_id: "biz_test",
    };

    let calculatedRecords: PayrollRecord[] = [];

    await PayrollService.processPayrollCycle(
      dummyCycle,
      [fixedEmployee as any],
      "biz_test",
      {
        attendanceRecords: [], // Defaults to standard 96h
        ledgerTransactions: [],
        salaryAdvances: [],
        payrollBonuses: [],
        payrollDeductions: [],
        policies: {
          standardQuinzaineHours: 96,
          enableSurvivalFloor: false,
          isTaxesEnabled: false,
        },
        onAddRecords: (records) => {
          calculatedRecords = records;
        },
        onUpdateCycle: () => {},
      }
    );

    const record = calculatedRecords[0];
    expect(record.baseSalary).toBe(5000); // 10,000 / 2 = 5,000 HTG
    expect(record.workedHours).toBe(96);
    expect(record.overtimeHours).toBe(0);
    expect(record.overtimePayout).toBe(0);
    expect(record.penalties).toBe(0);
    expect(record.grossSalary).toBe(5000);
    expect(record.netPaid).toBe(5000);
  });

  it("Case 3: Attendance absence rule (< 94h, e.g. 90h worked)", async () => {
    const fixedEmployee = {
      id: "emp_absent",
      name: "Paul Boulos",
      paymentModel: "FIXED" as const,
      salaryBaseHtg: 20000, // Quinzaine base = 10,000 HTG -> hourlyRate = 10,000 / 96 = 104.1667 HTG/h
      hourlyRate: 104.1667,
      workedHours: 90, // < 94h -> 6 absent hours
      taxExempt: true,
      business_id: "biz_test",
    };

    let calculatedRecords: PayrollRecord[] = [];

    await PayrollService.processPayrollCycle(
      dummyCycle,
      [fixedEmployee as any],
      "biz_test",
      {
        attendanceRecords: [],
        ledgerTransactions: [],
        salaryAdvances: [],
        payrollBonuses: [],
        payrollDeductions: [],
        policies: {
          standardQuinzaineHours: 96,
          enableSurvivalFloor: false,
          isTaxesEnabled: false,
        },
        onAddRecords: (records) => {
          calculatedRecords = records;
        },
        onUpdateCycle: () => {},
      }
    );

    const record = calculatedRecords[0];
    expect(record.baseSalary).toBe(10000);
    expect(record.workedHours).toBe(90);
    // Absent hours = 96 - 90 = 6h. Penalty = 6 * 104.1667 = 625 HTG
    expect(record.penalties).toBe(625);
    expect(record.grossSalary).toBe(10000 - 625); // 9,375 HTG
    expect(record.netPaid).toBe(9375);
  });

  it("Case 4: Attendance overtime rule (> 96h, e.g. 100h worked)", async () => {
    const fixedEmployee = {
      id: "emp_overtime",
      name: "Sarah Joseph",
      paymentModel: "FIXED" as const,
      salaryBaseHtg: 20000, // Quinzaine base = 10,000 HTG
      hourlyRate: 104.1667,
      workedHours: 100, // > 96h -> 4 OT hours
      taxExempt: true,
      business_id: "biz_test",
    };

    let calculatedRecords: PayrollRecord[] = [];

    await PayrollService.processPayrollCycle(
      dummyCycle,
      [fixedEmployee as any],
      "biz_test",
      {
        attendanceRecords: [],
        ledgerTransactions: [],
        salaryAdvances: [],
        payrollBonuses: [],
        payrollDeductions: [],
        policies: {
          standardQuinzaineHours: 96,
          overtimeRate150: 1.5,
          enableSurvivalFloor: false,
          isTaxesEnabled: false,
        },
        onAddRecords: (records) => {
          calculatedRecords = records;
        },
        onUpdateCycle: () => {},
      }
    );

    const record = calculatedRecords[0];
    expect(record.baseSalary).toBe(10000);
    expect(record.workedHours).toBe(100);
    expect(record.overtimeHours).toBe(4);
    // 4 hours * 104.1667 * 1.5 = 625 HTG
    expect(record.overtimePayout).toBe(625);
    expect(record.grossSalary).toBe(10625);
    expect(record.netPaid).toBe(10625);
  });

  it("Case 5: Presence tolerance zone (94h <= hours <= 96h, e.g. 95h worked)", async () => {
    const fixedEmployee = {
      id: "emp_tolerance",
      name: "Michel Augustin",
      paymentModel: "FIXED" as const,
      salaryBaseHtg: 20000,
      workedHours: 95, // Tolerated within 2 hours
      taxExempt: true,
      business_id: "biz_test",
    };

    let calculatedRecords: PayrollRecord[] = [];

    await PayrollService.processPayrollCycle(
      dummyCycle,
      [fixedEmployee as any],
      "biz_test",
      {
        attendanceRecords: [],
        ledgerTransactions: [],
        salaryAdvances: [],
        payrollBonuses: [],
        payrollDeductions: [],
        policies: {
          standardQuinzaineHours: 96,
          enableSurvivalFloor: false,
          isTaxesEnabled: false,
        },
        onAddRecords: (records) => {
          calculatedRecords = records;
        },
        onUpdateCycle: () => {},
      }
    );

    const record = calculatedRecords[0];
    expect(record.baseSalary).toBe(10000);
    expect(record.penalties).toBe(0);
    expect(record.overtimePayout).toBe(0);
    expect(record.grossSalary).toBe(10000);
    expect(record.netPaid).toBe(10000);
  });

  it("Case 6: Dynamic statutory taxes (ONA 6% and OFATMA 2%)", async () => {
    const fixedEmployee = {
      id: "emp_taxed",
      name: "Claire Thomas",
      paymentModel: "FIXED" as const,
      salaryBaseHtg: 40000, // Quinzaine base = 20,000 HTG
      taxExempt: false,
      business_id: "biz_test",
    };

    let calculatedRecords: PayrollRecord[] = [];

    await PayrollService.processPayrollCycle(
      dummyCycle,
      [fixedEmployee as any],
      "biz_test",
      {
        attendanceRecords: [],
        ledgerTransactions: [],
        salaryAdvances: [],
        payrollBonuses: [],
        payrollDeductions: [],
        policies: {
          standardQuinzaineHours: 96,
          isTaxesEnabled: true,
          enableTaxes: true,
          onaEmployeeRate: 0.06,
          ofatmaEmployeeRate: 0.02,
          enableSurvivalFloor: false,
        },
        onAddRecords: (records) => {
          calculatedRecords = records;
        },
        onUpdateCycle: () => {},
      }
    );

    const record = calculatedRecords[0];
    expect(record.grossSalary).toBe(20000);
    expect(record.cnssDeduction).toBe(1200); // 20,000 * 0.06 = 1,200 HTG (ONA)
    expect(record.cnsDeduction).toBe(400); // 20,000 * 0.02 = 400 HTG (OFATMA)
    expect(record.netPaid).toBe(18400); // 20,000 - 1,600 = 18,400 HTG
  });

  it("Case 7: Salary advance recovery from net pay", async () => {
    const fixedEmployee = {
      id: "emp_adv",
      name: "Marc Antoine",
      paymentModel: "FIXED" as const,
      salaryBaseHtg: 20000, // Quinzaine base = 10,000 HTG
      taxExempt: true,
      business_id: "biz_test",
    };

    let calculatedRecords: PayrollRecord[] = [];

    await PayrollService.processPayrollCycle(
      dummyCycle,
      [fixedEmployee as any],
      "biz_test",
      {
        attendanceRecords: [],
        ledgerTransactions: [],
        salaryAdvances: [
          {
            id: "adv_1",
            employeeId: "emp_adv",
            business_id: "biz_test",
            status: "APPROVED",
            amountCents: 500000, // 5,000 HTG
            installmentAmountCents: 200000, // 2,000 HTG installment
            remainingCents: 500000, // 5,000 HTG remaining
          } as any,
        ],
        payrollBonuses: [],
        payrollDeductions: [],
        policies: {
          standardQuinzaineHours: 96,
          isTaxesEnabled: false,
          enableSurvivalFloor: false,
        },
        onAddRecords: (records) => {
          calculatedRecords = records;
        },
        onUpdateCycle: () => {},
      }
    );

    const record = calculatedRecords[0];
    expect(record.grossSalary).toBe(10000);
    expect(record.advances).toBe(2000); // 2,000 HTG installment deducted
    expect(record.advancesTreated).toBe(2000);
    expect(record.netPaid).toBe(8000); // 10,000 - 2,000 = 8,000 HTG
  });

  it("Case 8: Taxes strictly 0 when enableTaxes === false in policies or taxConfig", async () => {
    const taxedEmployee = {
      id: "emp_tax_off",
      name: "Marie Dupont",
      paymentModel: "FIXED" as const,
      salaryBaseHtg: 20000, // 10,000 HTG quinzaine
      taxExempt: false, // Not exempt, but global policy has enableTaxes = false
      business_id: "biz_test",
    };

    let calculatedRecords: PayrollRecord[] = [];

    await PayrollService.processPayrollCycle(
      dummyCycle,
      [taxedEmployee as any],
      "biz_test",
      {
        attendanceRecords: [],
        ledgerTransactions: [],
        salaryAdvances: [],
        payrollBonuses: [],
        payrollDeductions: [],
        policies: {
          standardQuinzaineHours: 96,
          enableTaxes: false,
          isTaxesEnabled: false,
          enable_social_taxes: false,
          enableSurvivalFloor: false,
        },
        taxConfig: {
          business_id: "biz_test",
          enableTaxes: false,
          enabled: false,
          cnssRateEmployee: 0.06,
          cnssRateEmployer: 0.06,
          cnsRateEmployee: 0.02,
          cnsRateEmployer: 0.03,
          history: [],
        } as any,
        onAddRecords: (records) => {
          calculatedRecords = records;
        },
        onUpdateCycle: () => {},
      }
    );

    const record = calculatedRecords[0];
    expect(record.grossSalary).toBe(10000);
    expect(record.cnssDeduction).toBe(0);
    expect(record.cnsDeduction).toBe(0);
    expect(record.enableTaxes).toBe(false);
    expect(record.netPaid).toBe(10000); // No taxes deducted!
  });

  it("Case 9: Penalties calculated from tardiness and absence and populated on record", async () => {
    const empWithPenalties = {
      id: "emp_penalties",
      name: "Jean Penalite",
      paymentModel: "FIXED" as const,
      salaryBaseHtg: 20000, // 10,000 HTG quinzaine -> hourlyRate = 104.1667 HTG
      hourlyRate: 104.1667,
      workedHours: 96,
      taxExempt: true,
      business_id: "biz_test",
    };

    let calculatedRecords: PayrollRecord[] = [];

    await PayrollService.processPayrollCycle(
      dummyCycle,
      [empWithPenalties as any],
      "biz_test",
      {
        attendanceRecords: [
          {
            id: "att_1",
            employeeId: "emp_penalties",
            business_id: "biz_test",
            date: "2026-08-05",
            status: "LATE",
            realHours: 96,
            variance: -1, // 1 hour late
          } as any,
        ],
        ledgerTransactions: [],
        salaryAdvances: [],
        payrollBonuses: [],
        payrollDeductions: [],
        policies: {
          standardQuinzaineHours: 96,
          latePenaltyCents: 50000, // 500 HTG fixed late penalty
          enableSurvivalFloor: false,
          isTaxesEnabled: false,
        },
        onAddRecords: (records) => {
          calculatedRecords = records;
        },
        onUpdateCycle: () => {},
      }
    );

    const record = calculatedRecords[0];
    expect(record.penalty).toBe(500);
    expect(record.penalties).toBe(500);
    expect(record.absencePenalties).toBe(500);
    expect(record.grossSalary).toBe(9500); // 10,000 - 500
    expect(record.netPaid).toBe(9500);
  });
});
