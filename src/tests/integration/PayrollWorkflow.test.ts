import { describe, it, expect } from "vitest";
import {
  calculateEmployeePayrollItem,
  generateAuditSeal
} from "../../components/payroll/services/PayrollCalculationEngine";
import { applyDoubleEntryRules, validateDoubleEntry } from "../../services/AccountingEngine";
import { LedgerTransaction } from "../../types";

describe("Payroll & Accounting Integration Workflow", () => {
  it("executes an end-to-end payroll calculation, generates double-entry journal entries, and validates SHA-256 seal", () => {
    // 1. Employee Payroll Line Item Calculation
    const emp1 = {
      baseSalaryHTG: 80000,
      overtimeHours150: 10,
      overtimeHours200: 0,
      hourlyRateHTG: 400,
      bonusesHTG: 5000,
      commissionsHTG: 0,
      advancesHTG: 0
    };

    const calculation = calculateEmployeePayrollItem(emp1, "biz_001", "emp_101", "2026-07");

    // Overtime = 400 * 1.5 * 10 = 6,000
    // Gross = 80,000 + 6,000 + 5,000 = 91,000
    expect(calculation.grossPay).toBe(91000);

    // Tax = ONA (6%) + OFATMA (2%) = 8% of 91,000 = 7,280
    expect(calculation.taxDeductions.totalDeductions).toBe(7280);
    expect(calculation.netPay).toBe(83720);

    // 2. Generate Audit Seal
    const auditSeal = generateAuditSeal("biz_001", 1, calculation.grossPay, calculation.netPay);
    expect(auditSeal).toContain("SHA256::");

    // 3. Post Double-Entry Journal for Payroll Disbursement
    const rawPayrollJournal = {
      id: "tx_payroll_jul26",
      business_id: "biz_001",
      type: "PAYROLL",
      amount_cents: calculation.grossPay * 100, // HTG Cents
      description: "Payroll Disbursement July 2026",
      createdAt: new Date().toISOString()
    } as unknown as LedgerTransaction;

    const resolvedJournal = applyDoubleEntryRules(rawPayrollJournal);

    expect(validateDoubleEntry(resolvedJournal)).toBe(true);
    expect(resolvedJournal.debit_account).toBe("5000_PAYROLL_EXPENSE");
    expect(resolvedJournal.credit_account).toBe("1010_BANK");
    expect(resolvedJournal.isLocked).toBe(true);
  });
});
