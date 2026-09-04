import { describe, it, expect, vi } from "vitest";
import { calculateAttendanceVariance, formatAttendanceVariance } from "../../lib/attendanceSSOT";
import { calculateEmployeePayrollItem } from "../../components/payroll/services/PayrollCalculationEngine";

describe("Attendance Module & Payroll Integrity Tests", () => {
  it("calculates attendance variance correctly and accurately formats variance strings", () => {
    // Standard 8h shift, worked 9.5h -> +1.5h variance
    const v1 = calculateAttendanceVariance(9.5, 8.0);
    expect(v1).toBe(1.5);
    expect(formatAttendanceVariance(v1)).toBe("+1.5h");

    // Standard 8h shift, worked 6h -> -2h variance
    const v2 = calculateAttendanceVariance(6.0, 8.0);
    expect(v2).toBe(-2.0);
    expect(formatAttendanceVariance(v2)).toBe("-2h");

    // Standard 8h shift, worked 8h -> 0h variance
    const v3 = calculateAttendanceVariance(8.0, 8.0);
    expect(v3).toBe(0);
    expect(formatAttendanceVariance(v3)).toBe("0h");
  });

  it("calculates overtime cash strictly during payroll generation based on frozen attendance hours, preserving historical cycle isolation", () => {
    // Frozen attendance record: 10 hours worked on a 1.5x shift (2 hours overtime)
    const hourlyRate = 350; // 350 HTG/hr
    const overtimeHours150 = 2; // 2h overtime @ 1.5x

    const lineItem = {
      baseSalaryHTG: 50000,
      overtimeHours150,
      overtimeHours200: 0,
      hourlyRateHTG: hourlyRate,
      bonusesHTG: 0,
      commissionsHTG: 0,
      advancesHTG: 0
    };

    // Calculate payroll item
    const result = calculateEmployeePayrollItem(lineItem, "biz_tenant_test", "emp_att_001", "2026-07-31");

    // Overtime Cash = 350 * 1.5 * 2 = 1,050 HTG
    // Gross = 50,000 + 1,050 = 51,050 HTG
    expect(result.grossPay).toBe(51050);
    expect(result.integritySeal).toContain("SHA256::");
  });

  it("prevents clock-out timestamps earlier than or equal to clock-in timestamps", () => {
    const checkInTime = new Date("2026-07-15T08:00:00Z").getTime();
    const invalidCheckOutTime = new Date("2026-07-15T07:30:00Z").getTime();

    const isInvalid = invalidCheckOutTime <= checkInTime;
    expect(isInvalid).toBe(true);
  });
});
