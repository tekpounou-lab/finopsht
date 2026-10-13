import { useState, useEffect } from "react";
import { CashBasisSnapshot } from "../types/cash-basis";
import { CashBasisEngine as CanonicalCashEngine } from "../domains/cash/engine/CashBasisEngine";
import { useBusinessContext } from "../contexts/BusinessContext";
import { useAnalyticsFilters } from "../contexts/AnalyticsFilterContext";

/**
 * @deprecated Legacy hook for CashBasisSnapshot.
 * Harmonized to delegate calculations directly to the Canonical CashBasisEngine (src/domains/cash/engine/CashBasisEngine.ts).
 * Prefer useCashBasisBI() from 'src/hooks/useCashBasisBI' or 'src/domains/cash/hooks/useCashBasisBI' for canonical CashBasisViewModel.
 */
export function useCashBasisSnapshot(overrideFilters?: Record<string, any>) {
  const { currentBusiness, ledgerTransactions, payrollRecords, payrollCycles, employees, invoices } = useBusinessContext() as any;
  const { filters: globalFilters } = useAnalyticsFilters();
  const [snapshot, setSnapshot] = useState<CashBasisSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const resolvedFilters = {
    startDate: overrideFilters?.startDate || globalFilters.dateRange.startDate,
    endDate: overrideFilters?.endDate || globalFilters.dateRange.endDate,
    branchId: overrideFilters?.branchId || globalFilters.branchId,
    departmentId: overrideFilters?.departmentId || globalFilters.departmentId,
    employeeId: overrideFilters?.employeeId || globalFilters.employeeId,
    currency: overrideFilters?.currency || (globalFilters as any).currency || "HTG",
    cashAccountId: overrideFilters?.cashAccountId,
  };

  const filterKey = JSON.stringify(resolvedFilters);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      const businessId = currentBusiness?.id;
      if (!businessId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const startDate = resolvedFilters.startDate || "2026-09-01";
        const endDate = resolvedFilters.endDate || "2026-09-30";
        const currency = resolvedFilters.currency || "HTG";

        // Filter raw records by branch/dept if specified
        const branchId = resolvedFilters.branchId;
        const departmentId = resolvedFilters.departmentId;

        const filteredLedger = (ledgerTransactions || []).filter((tx: any) => {
          if (branchId && branchId !== "ALL" && tx.branchId && tx.branchId !== branchId) return false;
          if (departmentId && departmentId !== "ALL" && tx.departmentId && tx.departmentId !== departmentId) return false;
          return true;
        });

        const filteredPayroll = (payrollRecords || []).filter((p: any) => {
          if (branchId && branchId !== "ALL" && p.branchId && p.branchId !== branchId) return false;
          if (departmentId && departmentId !== "ALL" && p.departmentId && p.departmentId !== departmentId) return false;
          return true;
        });

        // Run canonical Cash Basis pipeline
        const statement = CanonicalCashEngine.executePipeline(
          {
            invoices: invoices || [],
            payrollRecords: filteredPayroll,
            payrollCycles: payrollCycles || [],
            ledgerTransactions: filteredLedger,
          },
          {
            businessId,
            startDate,
            endDate,
            currency,
            cashAccountId: resolvedFilters.cashAccountId,
          }
        );

        let payrollPaid = 0;
        let supplierPayments = 0;
        let rentPaid = 0;
        let otherExpenses = 0;
        let outgoingTransfers = 0;

        for (const m of statement.periodMovements) {
          if (m.direction === "OUTFLOW") {
            if (m.sourceModule === "PAYROLL" || m.movementType === "PAYROLL") {
              payrollPaid += m.amount;
            } else if (m.movementType === "RENT") {
              rentPaid += m.amount;
            } else if (m.movementType === "SUPPLIER_PAYMENT") {
              supplierPayments += m.amount;
            } else {
              otherExpenses += m.amount;
            }
          } else if (m.direction === "TRANSFER") {
            outgoingTransfers += m.amount;
          }
        }

        const cashInTotal = statement.totalInflow;
        const cashOutTotal = statement.totalOutflow;
        const netCashFlow = statement.netCashFlow;
        const beginningCash = statement.beginningCash;
        const endingCash = statement.endingCash;

        const deptMap = new Map<string, { cashIn: number; cashOut: number }>();
        const empMap = new Map<string, { salaryPaid: number; commissionPaid: number; advancePaid: number }>();

        for (const m of statement.periodMovements) {
          if (m.departmentId) {
            const cur = deptMap.get(m.departmentId) || { cashIn: 0, cashOut: 0 };
            if (m.direction === "INFLOW") cur.cashIn += m.amount;
            else if (m.direction === "OUTFLOW") cur.cashOut += m.amount;
            deptMap.set(m.departmentId, cur);
          }
          if (m.employeeId) {
            const cur = empMap.get(m.employeeId) || { salaryPaid: 0, commissionPaid: 0, advancePaid: 0 };
            if (m.movementType === "PAYROLL") cur.salaryPaid += m.amount;
            else if (m.movementType === "COMMISSION") cur.commissionPaid += m.amount;
            else if (m.movementType === "ADVANCE") cur.advancePaid += m.amount;
            empMap.set(m.employeeId, cur);
          }
        }

        const byDepartment = Array.from(deptMap.entries()).map(([deptId, val]) => ({
          departmentId: deptId,
          departmentName: deptId,
          cashIn: val.cashIn,
          cashOut: val.cashOut,
          net: val.cashIn - val.cashOut,
        }));

        const byEmployee = Array.from(empMap.entries()).map(([empId, val]) => {
          const emp = (employees || []).find((e: any) => e.id === empId);
          return {
            employeeId: empId,
            employeeName: emp ? emp.name || emp.id : empId,
            salaryPaid: val.salaryPaid,
            commissionPaid: val.commissionPaid,
            advancePaid: val.advancePaid,
            total: val.salaryPaid + val.commissionPaid + val.advancePaid,
          };
        });

        const snap: CashBasisSnapshot = {
          period: { startDate, endDate },
          cashIn: {
            total: cashInTotal,
            salesCollections: cashInTotal,
            otherIncome: 0,
            advancesReceived: 0,
            incomingTransfers: 0,
          },
          cashOut: {
            total: cashOutTotal,
            payrollPaid,
            commissionsPaid: 0,
            advancesPaid: 0,
            supplierPayments,
            rentPaid,
            otherExpenses,
            outgoingTransfers,
          },
          netCashFlow,
          beginningCash,
          endingCash,
          byDepartment,
          byEmployee,
          cashPerformance: {
            revenueGrowth: 0,
            expenseGrowth: 0,
            cashMargin: cashInTotal > 0 ? (netCashFlow / cashInTotal) * 100 : 0,
            bestPeriod: startDate,
            worstPeriod: endDate,
          },
        };

        if (isMounted) setSnapshot(snap);
      } catch (err) {
        console.error("Error loading cash basis snapshot via Canonical CashBasisEngine:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [
    currentBusiness?.id,
    filterKey,
    ledgerTransactions,
    payrollRecords,
    payrollCycles,
    employees,
    invoices,
  ]);

  return { snapshot, loading };
}
