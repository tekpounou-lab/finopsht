import { useState, useCallback } from "react";
import { PayrollCycle, PayrollRecord, Employee, Role, LedgerTransaction, ERPEvent, ForensicLog } from "../../../types";
import { resolveTaxRatesForDate } from "../services/PayrollCalculationEngine";
import { generateSignature, getLocalIP } from "../../../data";

export interface UsePayrollCalculationProps {
  current_business_id: string;
  employees: Employee[];
  currentUser?: { name: string; id: string };
  onAddRecords?: (records: PayrollRecord[]) => void;
  onAddTransaction?: (tx: LedgerTransaction) => void;
  onAddEvent?: (ev: ERPEvent) => void;
  onAddForensicLog?: (log: ForensicLog) => void;
}

export function usePayrollCalculation({
  current_business_id,
  employees,
  currentUser,
  onAddRecords,
  onAddTransaction,
  onAddEvent,
  onAddForensicLog,
}: UsePayrollCalculationProps) {
  const [isCalculating, setIsCalculating] = useState(false);
  const [dryRunRecords, setDryRunRecords] = useState<PayrollRecord[]>([]);
  const [calculationSummary, setCalculationSummary] = useState<{
    totalGross: number;
    totalNet: number;
    totalTax: number;
    employeeCount: number;
  } | null>(null);

  const runPayrollDryRun = useCallback(
    async (cycle: PayrollCycle) => {
      setIsCalculating(true);
      try {
        const activeEmployees = employees.filter(
          (e) =>
            e.business_id === current_business_id &&
            (e.status === "ACTIVE" || !e.status) &&
            !(cycle.excludedEmployeeIds || []).includes(e.id)
        );

        const rates = resolveTaxRatesForDate(null, cycle.startDate || new Date().toISOString());

        let totalGross = 0;
        let totalNet = 0;
        let totalTax = 0;

        const calculatedRecords: PayrollRecord[] = activeEmployees.map((emp) => {
          const baseSalary = emp.salaryBaseHtg || 30000;
          const quinzaineBase = Math.round(baseSalary / 2);

          // ONA: 6%, OFATMA: 2%, IRI: tiered
          const onaTax = Math.round(quinzaineBase * 0.06);
          const ofatmaTax = Math.round(quinzaineBase * 0.02);
          const totalEmpTax = onaTax + ofatmaTax;
          const netSalary = quinzaineBase - totalEmpTax;

          totalGross += quinzaineBase;
          totalNet += netSalary;
          totalTax += totalEmpTax;

          return {
            id: `pr_${cycle.id}_${emp.id}`,
            cycleId: cycle.id,
            payroll_cycle_id: cycle.id,
            business_id: current_business_id,
            employeeId: emp.id,
            employee_id: emp.id,
            employeeName: emp.name || emp.displayName || "Employé",
            branch_id: emp.branchId || emp.branch_id,
            department_id: emp.departmentId || emp.department_id,
            base_salary_cents: quinzaineBase * 100,
            gross_salary_cents: quinzaineBase * 100,
            net_salary_cents: netSalary * 100,
            grossSalary: quinzaineBase,
            cnssDeduction: onaTax,
            cnsDeduction: ofatmaTax,
            commissions: 0,
            advancesTreated: 0,
            netPaid: netSalary,
            status: "CALCULATED" as any,
            hashSignature: generateSignature(emp.id),
          } as unknown as PayrollRecord;
        });

        setDryRunRecords(calculatedRecords);
        setCalculationSummary({
          totalGross,
          totalNet,
          totalTax,
          employeeCount: calculatedRecords.length,
        });

        return calculatedRecords;
      } finally {
        setIsCalculating(false);
      }
    },
    [employees, current_business_id]
  );

  const commitPayrollCycle = useCallback(
    async (cycle: PayrollCycle, records: PayrollRecord[]) => {
      if (onAddRecords) {
        onAddRecords(records);
      }

      if (onAddEvent) {
        const ev: ERPEvent = {
          id: "ev_" + Math.random().toString(36).substring(2, 9),
          business_id: current_business_id,
          timestamp: new Date().toISOString(),
          type: "PAYROLL_RUN_COMMITTED",
          payload: {
            cycleId: cycle.id,
            cycleName: cycle.cycleName,
            recordsCount: records.length,
          },
          checksum: generateSignature(cycle.id),
        };
        onAddEvent(ev);
      }
    },
    [current_business_id, onAddRecords, onAddEvent]
  );

  return {
    isCalculating,
    dryRunRecords,
    calculationSummary,
    runPayrollDryRun,
    commitPayrollCycle,
    setDryRunRecords,
  };
}
