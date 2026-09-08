import { useState, useCallback } from "react";
import { PayrollCycle, PayrollRecord, Employee, Role, LedgerTransaction, ERPEvent, ForensicLog, AttendanceRecord, SalaryAdvance, PayrollBonus, PayrollDeduction } from "../../../types";
import { generateSignature } from "../../../data";
import { EventBus } from "../../../modules/runtime/EventBus";
import { PayrollService } from "../../../services/payroll/PayrollService";

export interface UsePayrollCalculationProps {
  current_business_id: string;
  employees: Employee[];
  attendanceRecords?: AttendanceRecord[];
  salaryAdvances?: SalaryAdvance[];
  payrollBonuses?: PayrollBonus[];
  payrollDeductions?: PayrollDeduction[];
  ledgerTransactions?: LedgerTransaction[];
  currentUser?: { name: string; id: string };
  onAddCycle?: (cycle: PayrollCycle) => void;
  onAddRecords?: (records: PayrollRecord[]) => void;
  onUpdateCycle?: (cycleId: string, updates: Partial<PayrollCycle>) => void;
  onAddTransaction?: (tx: LedgerTransaction) => void;
  onAddEvent?: (ev: ERPEvent) => void;
  onAddForensicLog?: (log: ForensicLog) => void;
}

export function usePayrollCalculation({
  current_business_id,
  employees,
  attendanceRecords,
  salaryAdvances,
  payrollBonuses,
  payrollDeductions,
  ledgerTransactions,
  currentUser,
  onAddCycle,
  onAddRecords,
  onUpdateCycle,
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
      if (cycle.status === "SEALED") {
        console.warn(`[Payroll] Cycle ${cycle.id} is SEALED and immutable. Calculation skipped.`);
        return [];
      }

      setIsCalculating(true);
      try {
        const calculatedRecords = await PayrollService.processPayrollCycle(
          cycle,
          employees,
          current_business_id,
          {
            currentUser,
            attendanceRecords,
            salaryAdvances,
            payrollBonuses,
            payrollDeductions,
            ledgerTransactions,
            onAddRecords,
            onUpdateCycle,
            onAddEvent,
            onAddForensicLog,
          }
        );

        let totalGross = 0;
        let totalNet = 0;
        let totalTax = 0;

        calculatedRecords.forEach((r) => {
          totalGross += r.grossSalary || (r.gross_salary_cents ? r.gross_salary_cents / 100 : 0);
          totalNet += r.netPaid || (r.net_salary_cents ? r.net_salary_cents / 100 : 0);
          totalTax += (r.cnssDeduction || 0) + (r.cnsDeduction || 0);
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
    [
      employees,
      current_business_id,
      currentUser,
      attendanceRecords,
      salaryAdvances,
      payrollBonuses,
      payrollDeductions,
      ledgerTransactions,
      onAddRecords,
      onUpdateCycle,
      onAddEvent,
      onAddForensicLog,
    ]
  );

  const commitPayrollCycle = useCallback(
    async (cycle: PayrollCycle, records: PayrollRecord[], options?: { updateStatus?: string }) => {
      if (onAddRecords && records.length > 0) {
        onAddRecords(records);
      }

      const targetStatus = options?.updateStatus || "CALCULATED";
      if (onUpdateCycle) {
        onUpdateCycle(cycle.id, {
          status: targetStatus as any,
          calculatedAt: new Date().toISOString(),
          business_id: current_business_id,
        });
      }

      EventBus.publish(
        EventBus.createEvent({
          type: "PAYROLL_RUN_COMMITTED",
          businessId: current_business_id,
          module: "PAYROLL",
          aggregate: "PayrollCycle",
          payload: {
            cycleId: cycle.id,
            cycleName: cycle.cycleName || cycle.label,
            recordsCount: records.length,
            business_id: current_business_id,
          },
        })
      );

      if (onAddEvent) {
        const ev: ERPEvent = {
          id: "ev_" + Math.random().toString(36).substring(2, 9),
          business_id: current_business_id,
          timestamp: new Date().toISOString(),
          type: "PAYROLL_RUN_COMMITTED",
          payload: {
            cycleId: cycle.id,
            cycleName: cycle.cycleName || cycle.label,
            recordsCount: records.length,
          },
          checksum: generateSignature(cycle.id),
        };
        onAddEvent(ev);
      }
    },
    [current_business_id, onAddRecords, onUpdateCycle, onAddEvent]
  );

  const sealPayrollCycle = useCallback(
    async (cycle: PayrollCycle, records: PayrollRecord[]) => {
      setIsCalculating(true);
      try {
        await PayrollService.sealPayrollCycle(cycle, records, current_business_id, {
          currentUser,
          ledgerTransactions,
          onAddRecords,
          onUpdateCycle,
          onAddTransaction,
          onAddEvent,
          onAddForensicLog,
        });
      } finally {
        setIsCalculating(false);
      }
    },
    [current_business_id, currentUser, ledgerTransactions, onAddRecords, onUpdateCycle, onAddTransaction, onAddEvent, onAddForensicLog]
  );

  const reversePayrollCycle = useCallback(
    async (cycle: PayrollCycle, records: PayrollRecord[], reason?: string) => {
      setIsCalculating(true);
      try {
        const result = await PayrollService.reversePayrollCycle(cycle, records, current_business_id, {
          currentUser,
          ledgerTransactions,
          onAddCycle,
          onAddRecords,
          onUpdateCycle,
          onAddTransaction,
          onAddEvent,
          onAddForensicLog,
          reason,
        });
        return result;
      } finally {
        setIsCalculating(false);
      }
    },
    [current_business_id, currentUser, ledgerTransactions, onAddCycle, onAddRecords, onUpdateCycle, onAddTransaction, onAddEvent, onAddForensicLog]
  );

  return {
    isCalculating,
    dryRunRecords,
    calculationSummary,
    runPayrollDryRun,
    commitPayrollCycle,
    sealPayrollCycle,
    reversePayrollCycle,
    setDryRunRecords,
  };
}
