import { useState, useEffect } from "react";
import { CashBasisSnapshot } from "../types/cash-basis";
import { CashBasisEngine as CanonicalCashEngine } from "../domains/cash/engine/CashBasisEngine";
import { useBusinessContext } from "../contexts/BusinessContext";
import { useAnalyticsFilters } from "../contexts/AnalyticsFilterContext";
import { useExecutiveFilters } from "../domains/analytics/context/ExecutiveFilterContext";
import { resolveAnalyticsTxDate, resolveAnalyticsPayrollDate } from "../utils/dateNormalization";

/**
 * @deprecated Legacy hook for CashBasisSnapshot.
 * Harmonized to delegate calculations directly to the Canonical CashBasisEngine (src/domains/cash/engine/CashBasisEngine.ts).
 * Prefer useCashBasisBI() from 'src/hooks/useCashBasisBI' or 'src/domains/cash/hooks/useCashBasisBI' for canonical CashBasisViewModel.
 */
export function useCashBasisSnapshot(overrideFilters?: Record<string, any>) {
  const { currentBusiness, ledgerTransactions, payrollRecords, payrollCycles, employees, invoices } = useBusinessContext() as any;
  const { filters: globalFilters } = useAnalyticsFilters();
  const { filters: execFilters } = useExecutiveFilters();
  const [snapshot, setSnapshot] = useState<CashBasisSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const resolvedFilters = {
    startDate: overrideFilters?.startDate !== undefined ? overrideFilters.startDate : globalFilters.dateRange.startDate,
    endDate: overrideFilters?.endDate !== undefined ? overrideFilters.endDate : globalFilters.dateRange.endDate,
    branchId: (overrideFilters?.branchId && overrideFilters.branchId !== "ALL") ? overrideFilters.branchId : (globalFilters.branchId || "ALL"),
    departmentId: (overrideFilters?.departmentId && overrideFilters.departmentId !== "ALL") ? overrideFilters.departmentId : (globalFilters.departmentId || "ALL"),
    employeeId: (overrideFilters?.employeeId && overrideFilters.employeeId !== "ALL") ? overrideFilters.employeeId : (globalFilters.employeeId || "ALL"),
    transactionType: overrideFilters?.transactionType || execFilters.transactionType || "ALL",
    currency: overrideFilters?.currency || execFilters.currency || "HTG",
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
        const currency = resolvedFilters.currency || "HTG";
        const branchId = resolvedFilters.branchId;
        const departmentId = resolvedFilters.departmentId;
        const employeeId = resolvedFilters.employeeId;
        const transactionType = resolvedFilters.transactionType;

        const empBranchMap = new Map<string, string>();
        const empDeptMap = new Map<string, string>();
        (employees || []).forEach((e: any) => {
          if (!e?.id) return;
          const b = e.branchId || e.branch_id;
          const d = e.departmentId || e.department_id;
          if (b) empBranchMap.set(e.id, b);
          if (d) empDeptMap.set(e.id, d);
        });

        const filteredLedger = (ledgerTransactions || []).filter((tx: any) => {
          const txBizId = tx.business_id || tx.businessId;
          if (txBizId && txBizId !== businessId) return false;
          const txEmpId = tx.employeeId || tx.employee_id;
          const txBranch = tx.branchId || tx.branch_id || tx.cost_center_id || (txEmpId ? empBranchMap.get(txEmpId) : undefined);
          const txDept = tx.departmentId || tx.department_id || tx.department || (txEmpId ? empDeptMap.get(txEmpId) : undefined);

          if (branchId && branchId !== "ALL" && (!txBranch || txBranch !== branchId)) return false;
          if (departmentId && departmentId !== "ALL" && (!txDept || txDept !== departmentId)) return false;
          if (employeeId && employeeId !== "ALL" && (!txEmpId || txEmpId !== employeeId)) return false;
          if (transactionType && transactionType !== "ALL" && tx.type !== transactionType && tx.category !== transactionType) return false;
          return true;
        });

        const filteredPayroll = (payrollRecords || []).filter((p: any) => {
          const pBizId = p.business_id || p.businessId;
          if (pBizId && pBizId !== businessId) return false;
          const pEmpId = p.employeeId || p.employee_id;
          const pBranch = p.branchId || p.branch_id || (pEmpId ? empBranchMap.get(pEmpId) : undefined);
          const pDept = p.departmentId || p.department_id || (pEmpId ? empDeptMap.get(pEmpId) : undefined);

          if (branchId && branchId !== "ALL" && (!pBranch || pBranch !== branchId)) return false;
          if (departmentId && departmentId !== "ALL" && (!pDept || pDept !== departmentId)) return false;
          if (employeeId && employeeId !== "ALL" && (!pEmpId || pEmpId !== employeeId)) return false;
          if (transactionType && transactionType !== "ALL" && transactionType !== "PAYROLL") return false;
          return true;
        });

        const filteredInvoices = (invoices || []).filter((inv: any) => {
          const iBizId = inv.business_id || inv.businessId;
          if (iBizId && iBizId !== businessId) return false;
          const iEmpId = inv.employeeId || inv.employee_id;
          const iBranch = inv.branchId || inv.branch_id || inv.cost_center_id || (iEmpId ? empBranchMap.get(iEmpId) : undefined);
          const iDept = inv.departmentId || inv.department_id || (iEmpId ? empDeptMap.get(iEmpId) : undefined);

          if (branchId && branchId !== "ALL" && (!iBranch || iBranch !== branchId)) return false;
          if (departmentId && departmentId !== "ALL" && (!iDept || iDept !== departmentId)) return false;
          if (employeeId && employeeId !== "ALL" && (!iEmpId || iEmpId !== employeeId)) return false;
          if (transactionType && transactionType !== "ALL" && transactionType !== "INCOME") return false;
          return true;
        });

        // DEF-TF-01: Never hardcode a historical month fallback when dates are empty ("All Dates").
        let startDate = resolvedFilters.startDate || "";
        let endDate = resolvedFilters.endDate || "";
        if (!startDate || !endDate) {
          let minD = "";
          let maxD = "";
          for (const tx of filteredLedger) {
            const d = resolveAnalyticsTxDate(tx, true);
            if (d) {
              if (!minD || d < minD) minD = d;
              if (!maxD || d > maxD) maxD = d;
            }
          }
          for (const pr of filteredPayroll) {
            const d = resolveAnalyticsPayrollDate(pr, true);
            if (d) {
              if (!minD || d < minD) minD = d;
              if (!maxD || d > maxD) maxD = d;
            }
          }
          if (!startDate) startDate = minD || "1900-01-01";
          if (!endDate) endDate = maxD || "2099-12-31";
        }

        // Run canonical Cash Basis pipeline
        const statement = CanonicalCashEngine.executePipeline(
          {
            invoices: filteredInvoices,
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
            if (m.sourceModule === "PAYROLL" || m.movementType === "PAYROLL" || m.movementType === "COMMISSION") {
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
