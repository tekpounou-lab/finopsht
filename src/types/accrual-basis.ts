export interface DepartmentPerformance {
  departmentId: string;
  departmentName?: string;
  revenue: number;
  expenses: number;
  payroll: number;
  netIncome: number;
  margin: number;
}

export interface EmployeeScorecard {
  employeeId: string;
  employeeName?: string;
  grossSalary: number;
  employerContributions: number;
  commissions: number;
  totalCost: number;
  productivityScore?: number;
}

export interface AccrualBasisSnapshot {
  period: { startDate: string; endDate: string };
  revenueRecognized: number;
  expensesAccrued: number;
  payrollAccrued: {
    grossSalary: number;
    employerContributions: number;
    commissions: number;
    bonuses: number;
    total: number;
    paid: number;
    payable: number; // Engagé mais non payé
  };
  netIncome: number;
  grossMargin: number;
  operatingMargin: number;
  ebitda: number;
  workingCapital: {
    accountsReceivable: number;
    accountsPayable: number;
    cash: number;
    total: number;
  };
  byDepartment: Array<DepartmentPerformance>;
  byEmployee: Array<EmployeeScorecard>;
  reconciliation: {
    cashRevenue: number;
    accrualRevenue: number;
    varianceRevenue: number;
    cashPayroll: number;
    accrualPayroll: number;
    variancePayroll: number;
    cashExpenses: number;
    accrualExpenses: number;
    varianceExpenses: number;
  };
}
