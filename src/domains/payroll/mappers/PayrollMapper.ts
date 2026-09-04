export interface PayrollCycleSummaryDTO {
  cycleId: string;
  cycleName: string;
  cycleType: string;
  status: string;
  periodLabel: string;
  totalEmployeesCount: number;
  totalGrossPay: number;
  totalNetPay: number;
  totalTaxes: number;
  formattedPostingDate: string;
}

export class PayrollMapper {
  /**
   * Maps a raw payroll cycle and its calculated records into a high-level Cycle Summary DTO.
   */
  public static toCycleSummaryDTO(
    cycle: any,
    computedRecords: any[] = []
  ): PayrollCycleSummaryDTO {
    let totalGrossPay = 0;
    let totalNetPay = 0;
    let totalTaxes = 0;

    computedRecords.forEach((rec) => {
      totalGrossPay += rec.grossSalary || rec.grossPay || 0;
      totalNetPay += rec.netPayable || rec.netPay || 0;
      totalTaxes += (rec.taxONA || 0) + (rec.taxOFATMA || 0) + (rec.taxIRI || 0);
    });

    return {
      cycleId: cycle.id || "",
      cycleName: cycle.cycleName || cycle.name || "Cycle sans nom",
      cycleType: cycle.cycleType || "REGULAR_FIRST_HALF",
      status: cycle.status || "DRAFT",
      periodLabel: `${cycle.startDate || cycle.start_date || ""} - ${cycle.endDate || cycle.end_date || ""}`,
      totalEmployeesCount: computedRecords.length,
      totalGrossPay: Math.round(totalGrossPay * 100) / 100,
      totalNetPay: Math.round(totalNetPay * 100) / 100,
      totalTaxes: Math.round(totalTaxes * 100) / 100,
      formattedPostingDate: cycle.effectiveAccountingDate || cycle.created_at || new Date().toISOString()
    };
  }

  /**
   * Serializes computed employee payroll record for snapshot storage or export.
   */
  public static toSnapshotRecordDTO(record: any): Record<string, any> {
    return {
      employeeId: record.id || record.employeeId,
      employeeName: `${record.firstName || ""} ${record.lastName || ""}`.trim(),
      nationalId: record.nationalId || record.nif || "",
      baseSalary: record.baseSalary || 0,
      workedHours: record.workedHours || 0,
      overtimeHours: record.overtimeHours || 0,
      grossSalary: record.grossSalary || 0,
      taxONA: record.taxONA || 0,
      taxOFATMA: record.taxOFATMA || 0,
      taxIRI: record.taxIRI || 0,
      advancesDeducted: record.advanceDeduction || record.advancesDeducted || 0,
      bonusesAdded: record.totalBonuses || 0,
      otherDeductions: record.totalDeductions || 0,
      netPayable: record.netPayable || 0,
      currency: record.currency || "HTG",
      timestamp: new Date().toISOString()
    };
  }
}
