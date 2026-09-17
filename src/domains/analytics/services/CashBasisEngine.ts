import { CashBasisSnapshot } from "../../../types/cash-basis";
import { CashBasisEngine as CanonicalCashEngine } from "../../cash/engine/CashBasisEngine";
import { LedgerTransaction, PayrollRecord, Employee } from "../../../types";

export class CashBasisEngine {
  static async generateSnapshot(
    businessId: string,
    filters: Record<string, any>,
    ledgerTransactions: LedgerTransaction[] = [],
    payrollRecords: PayrollRecord[] = [],
    employees: Employee[] = []
  ): Promise<CashBasisSnapshot> {
    const startDate = filters.startDate || "2026-09-01";
    const endDate = filters.endDate || "2026-09-30";
    const currency = filters.currency || "HTG";

    // Run canonical pipeline
    const statement = CanonicalCashEngine.executePipeline(
      {
        invoices: [],
        payrollRecords,
        ledgerTransactions,
      },
      {
        businessId,
        startDate,
        endDate,
        currency,
        cashAccountId: filters.cashAccountId,
      }
    );

    let payrollPaid = 0;
    let supplierPayments = 0;
    let rentPaid = 0;
    let otherExpenses = 0;
    let outgoingTransfers = 0;

    for (const m of statement.periodMovements) {
      if (m.direction === 'OUTFLOW') {
        if (m.sourceModule === 'PAYROLL' || m.movementType === 'PAYROLL') {
          payrollPaid += m.amount;
        } else if (m.movementType === 'RENT') {
          rentPaid += m.amount;
        } else {
          otherExpenses += m.amount;
        }
      } else if (m.direction === 'TRANSFER') {
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
        if (m.direction === 'INFLOW') cur.cashIn += m.amount;
        else if (m.direction === 'OUTFLOW') cur.cashOut += m.amount;
        deptMap.set(m.departmentId, cur);
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
      const emp = employees.find((e) => e.id === empId);
      return {
        employeeId: empId,
        employeeName: emp ? emp.name || emp.id : empId,
        salaryPaid: val.salaryPaid,
        commissionPaid: val.commissionPaid,
        advancePaid: val.advancePaid,
        total: val.salaryPaid + val.commissionPaid + val.advancePaid,
      };
    });

    return {
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
  }
}

