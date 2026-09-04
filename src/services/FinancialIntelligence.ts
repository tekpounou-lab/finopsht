import { LedgerTransaction, PayrollRecord, Branch } from "../types";

export interface IntelligenceMetrics {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  burnRate: number; // Avg expense per day
  payrollCostRatio: number; // Payroll expense / Total Expenses
  financialStressScore: number; // 0-100 indicating financial risk
  cashflow: number;
}

export interface BranchProfitability {
  branchId: string;
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
}

export const generateFinancialMetrics = (
  transactions: LedgerTransaction[],
  payrollRecords: PayrollRecord[],
  business_id: string
): IntelligenceMetrics => {
  const businessTx = transactions.filter(t => t.business_id === business_id && t.status !== "REVERSED");
  
  let totalRevenue = 0;
  let totalExpenses = 0;
  
  // Need to analyze by dates for burn rate
  let oldestDate = new Date().getTime();
  let newestDate = 0;

  businessTx.forEach(tx => {
    const time = new Date(tx.date).getTime();
    if (time < oldestDate) oldestDate = time;
    if (time > newestDate) newestDate = time;

    if (tx.type === "INCOME") {
      totalRevenue += tx.amount;
    } else if (tx.type === "EXPENSE" || tx.type === "PAYROLL") { // PAYROLL is an expense
      totalExpenses += tx.amount;
    }
  });

  const netProfit = totalRevenue - totalExpenses;
  
  const daysDiff = Math.max(1, (newestDate - oldestDate) / (1000 * 60 * 60 * 24));
  const burnRate = totalExpenses / daysDiff;

  const totalPayroll = payrollRecords
    .filter(pr => pr.business_id === business_id)
    .reduce((sum, pr) => sum + pr.grossSalary + pr.cnssDeduction + pr.cnsDeduction, 0);

  const fallbackPayrollCost = businessTx.filter(t => t.type === "PAYROLL").reduce((sum, t) => sum + t.amount, 0);
  
  const actualPayrollCost = totalPayroll > 0 ? totalPayroll : fallbackPayrollCost;
  const payrollCostRatio = totalExpenses > 0 ? (actualPayrollCost / totalExpenses) * 100 : 0;

  const financialStressScore = totalRevenue > 0 ? Math.min(100, Math.max(0, (totalExpenses / totalRevenue) * 100)) : 100;

  return {
    totalRevenue,
    totalExpenses,
    netProfit,
    burnRate,
    payrollCostRatio,
    financialStressScore,
    cashflow: netProfit // Simplified definition
  };
};

export const evaluateBranchProfitability = (transactions: LedgerTransaction[], branches: Branch[], business_id: string): BranchProfitability[] => {
  const profitMap = branches.filter(b => b.business_id === business_id).map(branch => {
    const branchTxs = transactions.filter(t => t.business_id === business_id && t.branchId === branch.id && t.status !== "REVERSED");
    
    let rev = 0;
    let exp = 0;

    branchTxs.forEach(tx => {
      if (tx.type === "INCOME") rev += tx.amount;
      if (tx.type === "EXPENSE" || tx.type === "PAYROLL") exp += tx.amount;
    });

    const profit = rev - exp;
    const margin = rev > 0 ? (profit / rev) * 100 : 0;

    return {
      branchId: branch.id,
      revenue: rev,
      expenses: exp,
      profit,
      margin
    };
  });
  
  return profitMap;
};

export const detectAnomalies = (transactions: LedgerTransaction[], business_id: string) => {
  const anomalies: { txId: string; description: string; severity: "LOW" | "HIGH" }[] = [];
  const businessTx = transactions.filter(t => t.business_id === business_id && t.status !== "REVERSED");
  
  // Basic anomaly: Spikes in expenses
  const averageExpense = businessTx.filter(t => t.type === "EXPENSE").reduce((sum, t, idx, arr) => sum + (t.amount / arr.length), 0);
  businessTx.forEach(tx => {
    if (tx.type === "EXPENSE" && tx.amount > averageExpense * 3) {
      anomalies.push({
        txId: tx.id,
        description: `Unusually high expense detected: ${tx.amount} HTG (Expected avg ~${Math.round(averageExpense)})`,
        severity: "HIGH"
      });
    }
  });

  return anomalies;
};

export const generateShortTermForecast = (metrics: IntelligenceMetrics) => {
  return {
    forecast7DaysDays: metrics.cashflow - (metrics.burnRate * 7),
    forecast15Days: metrics.cashflow - (metrics.burnRate * 15),
    forecast30Days: metrics.cashflow - (metrics.burnRate * 30),
  };
};
