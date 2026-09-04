import { BusinessFact } from '../types';
import { KPIRegistry } from '../KPIs/registry';

export class CostCenterEngine {
  calculateCostCenterMetrics(facts: BusinessFact[]) {
    const revenue = KPIRegistry.revenue.formula(facts);
    const expenses = KPIRegistry.expenses.formula(facts);
    const payroll = KPIRegistry.payrollCost.formula(facts);
    const cash = KPIRegistry.cashBalance.formula(facts);
    const profit = revenue - expenses - payroll;

    // Budget Target comparison (simple mock-target variance for analysis)
    const targetRevenue = KPIRegistry.revenue.target || 5000000;
    const targetExpenses = KPIRegistry.expenses.target || 2000000;
    const targetPayroll = KPIRegistry.payrollCost.target || 1500000;

    const revenueVariance = revenue - targetRevenue;
    const expenseVariance = targetExpenses - expenses; // positive is good (spent less)
    const payrollVariance = targetPayroll - payroll; // positive is good (spent less)

    // Compute Enterprise Intelligence Scores (0 - 100)
    
    // Profitability Score: margin as percentage
    const profitabilityScore = revenue > 0 
      ? Math.max(0, Math.min(100, (profit / revenue) * 100 + 50)) 
      : 0;

    // Cash Flow Score: cash relative to monthly expenses
    const monthlyBurn = (expenses + payroll) / 3 || 1;
    const cashFlowScore = monthlyBurn > 0 
      ? Math.max(0, Math.min(100, (cash / monthlyBurn) * 15)) 
      : 100;

    // Compliance Score: based on attendance accuracy and records completeness
    const attFacts = facts.filter(f => f.type === 'attendance');
    const attendanceRate = attFacts.length > 0 
      ? (attFacts.filter(f => f.metadata.status === 'PRESENT' || f.metadata.status === 'present' || f.metadata.isPresent === true).length / attFacts.length) * 100 
      : 100;
    const complianceScore = Math.round(attendanceRate);

    // Risk Score: high expenses + low cash raises risk
    const baseRisk = (expenses + payroll) > revenue ? 40 : 10;
    const cashRisk = cash < 500000 ? 30 : 0;
    const riskScore = Math.max(0, Math.min(100, baseRisk + cashRisk));

    // Executive Score: overall combined index of organization health
    const executiveScore = Math.round(
      (profitabilityScore * 0.35) + 
      (cashFlowScore * 0.35) + 
      (complianceScore * 0.15) + 
      ((100 - riskScore) * 0.15)
    );

    return {
      revenueVariance,
      expenseVariance,
      payrollVariance,
      scores: {
        profitabilityScore: Math.round(profitabilityScore),
        cashFlowScore: Math.round(cashFlowScore),
        complianceScore,
        riskScore,
        executiveScore
      }
    };
  }
}
