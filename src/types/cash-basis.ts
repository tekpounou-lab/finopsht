export interface CashSettlement {
  id: string;
  business_id: string;
  date: string; // YYYY-MM-DD
  type: "CASH_IN" | "CASH_OUT";
  amount_cents: number;
  currency: "HTG" | "USD";
  method: "BANK_TRANSFER" | "CASH" | "CHECK" | "MOBILE_MONEY";
  reference: string;
  linked_invoice_id?: string;
  linked_bill_id?: string;
  linked_payroll_cycle_id?: string;
  linked_advance_id?: string;
  category: "SALES_COLLECTION" | "SUPPLIER_PAYMENT" | "PAYROLL_PAYMENT" | "ADVANCE_PAYMENT" | "RENT" | "TRANSFER" | "OTHER";
  employee_id?: string;
  department_id?: string;
  created_at: string;
  created_by: string;
  metadata?: Record<string, any>;
}

export interface CashBasisSnapshot {
  period: { startDate: string; endDate: string };
  cashIn: {
    total: number;
    salesCollections: number;
    otherIncome: number;
    advancesReceived: number;
    incomingTransfers: number;
  };
  cashOut: {
    total: number;
    payrollPaid: number;
    commissionsPaid: number;
    advancesPaid: number;
    supplierPayments: number;
    rentPaid: number;
    otherExpenses: number;
    outgoingTransfers: number;
  };
  netCashFlow: number;
  beginningCash: number;
  endingCash: number;
  byDepartment: Array<{ departmentId: string; departmentName?: string; cashIn: number; cashOut: number; net: number }>;
  byEmployee: Array<{ employeeId: string; employeeName?: string; salaryPaid: number; commissionPaid: number; advancePaid: number; total: number }>;
  cashPerformance: {
    revenueGrowth: number;
    expenseGrowth: number;
    cashMargin: number;
    bestPeriod: string;
    worstPeriod: string;
  };
}
