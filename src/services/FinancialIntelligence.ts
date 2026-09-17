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

/**
 * SPECIALIZED OPERATIONAL RISK & BURN-RATE ANALYTICAL UTILITY
 * 
 * Classification: SPECIALIZED (Operational Analytics & Burn Rate Heuristics)
 * Semantic Contract: This module provides operational risk scoring, burn-rate metrics,
 * and payroll ratio analysis. It is NOT a canonical General Ledger (GL) financial engine.
 * When canonical AnalyticsSnapshot is provided, macro revenue/expense totals are consumed
 * directly from the snapshot SSOT.
 */
export const generateFinancialMetrics = (
  transactions: LedgerTransaction[],
  payrollRecords: PayrollRecord[],
  business_id: string,
  snapshot?: any
): IntelligenceMetrics => {
  const businessTx = transactions.filter(t => t.business_id === business_id && t.status !== "REVERSED");
  
  let totalRevenue = 0;
  let totalExpenses = 0;
  let netProfit = 0;

  if (snapshot) {
    if (snapshot.incomeStatement) {
      const revCents = Number(snapshot.incomeStatement.revenue?.totalRevenueCents ?? snapshot.incomeStatement.totalRevenueCents ?? 0);
      const expCents = Number(snapshot.incomeStatement.expenses?.totalExpensesCents ?? snapshot.incomeStatement.totalExpensesCents ?? 0);
      const netCents = Number(snapshot.incomeStatement.netIncomeCents ?? (revCents - expCents));
      totalRevenue = revCents / 100;
      totalExpenses = expCents / 100;
      netProfit = netCents / 100;
    } else if (snapshot.metrics) {
      totalRevenue = Number(snapshot.metrics.revenue?.totalHTG ?? snapshot.metrics.revenue?.currentValue ?? 0);
      totalExpenses = Number(snapshot.metrics.expenses?.totalHTG ?? snapshot.metrics.expenses?.currentValue ?? 0);
      netProfit = Number(snapshot.metrics.profit?.netHTG ?? snapshot.metrics.profit?.netProfit ?? (totalRevenue - totalExpenses));
    } else {
      totalRevenue = Number(snapshot.revenue?.currentValue ?? (typeof snapshot.revenue === "number" ? snapshot.revenue : snapshot.totalRevenue ?? 0));
      totalExpenses = Number(snapshot.expenses?.currentValue ?? (typeof snapshot.expenses === "number" ? snapshot.expenses : snapshot.totalExpenses ?? 0));
      netProfit = Number(snapshot.profit?.currentValue ?? snapshot.netProfit ?? (typeof snapshot.profit === "number" ? snapshot.profit : snapshot.netIncome ?? (totalRevenue - totalExpenses)));
    }
  }
  
  // Operational date analysis for burn rate
  let oldestDate = new Date().getTime();
  let newestDate = 0;

  businessTx.forEach(tx => {
    const time = new Date(tx.date).getTime();
    if (time < oldestDate) oldestDate = time;
    if (time > newestDate) newestDate = time;

    if (!snapshot) {
      // Secondary fallback for operational burn rate when snapshot is unavailable
      if (tx.type === "INCOME") {
        totalRevenue += tx.amount;
      } else if (tx.type === "EXPENSE" || tx.type === "PAYROLL") {
        totalExpenses += tx.amount;
      }
    }
  });

  if (!snapshot) {
    netProfit = totalRevenue - totalExpenses;
  }
  
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
