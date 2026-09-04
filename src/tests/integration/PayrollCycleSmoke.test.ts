// src/tests/integration/PayrollCycleSmoke.test.ts
import { describe, it, expect, vi } from "vitest";
import { calculateEmployeePayrollItem, generateAuditSeal } from "@/components/payroll/services/PayrollCalculationEngine";
import { applyDoubleEntryRules, validateDoubleEntry } from "@/services/AccountingEngine";
import { LedgerTransaction } from "@/types";

describe("Enterprise End-to-End Payroll Cycle Smoke Test", () => {
  it("orchestrates tenant setup, employee contract tracking, attendance clocks, payroll taxes, ledger entries, and cryptographic audit seals", () => {
    // 1. Setup Tenant and Active Business Context
    const businessId = "biz_enterprise_haiti_99";
    const actorId = "usr_system_audit_sre";
    
    // 2. Provision Employee and Contract Details
    const employeeId = "emp_claudel_007";
    const employeeContract = {
      id: "contract_claudel_99",
      business_id: businessId,
      employee_id: employeeId,
      base_salary_cents: 120000 * 100, // 120,000 HTG / month
      salary_interval: "MONTHLY",
      payment_currency: "HTG" as const,
      status: "active" as const,
      created_at: new Date().toISOString()
    };

    expect(employeeContract.base_salary_cents).toBe(12000000);
    expect(employeeContract.payment_currency).toBe("HTG");

    // 3. Log Standard Attendance Clock Entries
    // Assume 15 days of standard quinzaine, with 10 hours of overtime logged
    const overtimeHours = 10;
    const hourlyRate = (120000 / 2) / 80; // Standard 80h quinzaine = 750 HTG/hour
    
    const timecardData = {
      baseSalaryHTG: 120000 / 2, // Quinzaine base = 60,000 HTG
      overtimeHours150: overtimeHours,
      overtimeHours200: 0,
      hourlyRateHTG: hourlyRate,
      bonusesHTG: 4500, // custom performance bonus
      commissionsHTG: 0,
      advancesHTG: 0
    };

    // 4. Execute Payroll Calculations
    // Overtime pay: 10 hours * 1.5 * 750 = 11,250 HTG
    // Gross: 60,000 + 11,250 + 4,500 = 75,750 HTG
    const calculation = calculateEmployeePayrollItem(timecardData, businessId, employeeId, "2026-08-Q1");

    expect(calculation.grossPay).toBe(75750);
    
    // Social Withholdings:
    // ONA = 6% of 75,750 = 4,545 HTG
    // OFATMA = 2% of 75,750 = 1,515 HTG
    // Total Deductions = ONA + OFATMA = 6,060 HTG
    expect(calculation.taxDeductions.employeeCNSS).toBe(4545);
    expect(calculation.taxDeductions.employeeCNS).toBe(1515);
    expect(calculation.taxDeductions.totalDeductions).toBe(6060);

    // Net Payout: Gross - Deductions = 75,750 - 6,060 = 69,690 HTG
    expect(calculation.netPay).toBe(69690);

    // Verify compliance with the statutory Survival Floor
    const survivalFloorDaily = 750; // Standard daily floor rate in HTG
    const minQuinzainePayout = survivalFloorDaily * 15; // 11,250 HTG
    expect(calculation.netPay).toBeGreaterThan(minQuinzainePayout);

    // 5. Generate Cryptographic Audit Seal for the payroll ledger row
    const auditSeal = generateAuditSeal(businessId, 1, calculation.grossPay, calculation.netPay);
    expect(auditSeal).toContain("SHA256::");

    // 6. Post Double-Entry Journal to General Ledger
    const payrollJournal = {
      id: `tx_smoke_payroll_${Date.now()}`,
      business_id: businessId,
      type: "PAYROLL",
      amount_cents: calculation.grossPay * 100, // Represented in HTG Cents
      description: `Disbursement and Taxes - Claudel (Cycle: 2026-08-Q1, Seal: ${auditSeal.slice(8, 20)})`,
      createdAt: new Date().toISOString()
    } as unknown as LedgerTransaction;

    const resolvedJournal = applyDoubleEntryRules(payrollJournal);

    // Double-entry balancing and accounting rules assertions
    expect(validateDoubleEntry(resolvedJournal)).toBe(true);
    expect(resolvedJournal.debit_account).toBe("5000_PAYROLL_EXPENSE");
    expect(resolvedJournal.credit_account).toBe("1010_BANK");
    expect(resolvedJournal.isLocked).toBe(true);
  });
});
