/**
 * FINOPS ERP — Payroll Accounting Date & Posting Policy Utility
 * 
 * Deterministic accounting posting rules:
 * - First Pay Period (Q1 / REGULAR_FIRST_HALF): Day 1 -> Day 15 => Posting Date = 15th of the payroll month
 * - Second Pay Period (Q2 / REGULAR_SECOND_HALF): Day 16 -> End of Month => Posting Date = Last calendar day of the payroll month (dynamic leap year handling)
 * - Bonus Payroll (BONUS): Follows Q1 (15th) or Q2 (Last Day) based on target period.
 */

export type PayrollType = "REGULAR_FIRST_HALF" | "REGULAR_SECOND_HALF" | "BONUS";

export interface PayrollPostingDateInput {
  label?: "Q1" | "Q2" | string;
  cycleType?: PayrollType | string;
  startDate?: string;
  start_date?: string;
  endDate?: string;
  end_date?: string;
  month?: number;
  year?: number;
  effectiveAccountingDate?: string;
}

/**
 * Calculates the deterministic accounting posting date for a payroll cycle.
 * Never hardcodes month lengths; handles leap years dynamically via JavaScript Date engine.
 */
export function calculatePayrollPostingDate(input: PayrollPostingDateInput): string {
  if (input.effectiveAccountingDate && /^\d{4}-\d{2}-\d{2}$/.test(input.effectiveAccountingDate)) {
    return input.effectiveAccountingDate;
  }

  let year: number;
  let month: number; // 1-12

  const startStr = input.startDate || input.start_date;
  if (startStr && startStr.length >= 7) {
    const parts = startStr.split("-");
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
  } else if (input.year && input.month) {
    year = input.year;
    month = input.month;
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }

  // Determine whether First Half (Q1) or Second Half (Q2)
  const isFirstHalf = 
    input.label === "Q1" || 
    input.cycleType === "REGULAR_FIRST_HALF" ||
    (startStr ? parseInt(startStr.split("-")[2] || "1", 10) <= 15 : true);

  if (isFirstHalf) {
    // 15th day of the payroll month
    return `${year}-${String(month).padStart(2, "0")}-15`;
  } else {
    // Last calendar day of the payroll month
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }
}

/**
 * Utility to format ISO execution timestamp for audit logs alongside effective accounting date
 */
export function formatPayrollAuditDates(input: PayrollPostingDateInput, executionTimestamp?: string) {
  const executionDate = executionTimestamp || new Date().toISOString();
  const effectiveAccountingDate = calculatePayrollPostingDate(input);
  return {
    executionDate,
    effectiveAccountingDate,
  };
}
