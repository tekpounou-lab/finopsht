import { BusinessFact } from '../types';

export interface BranchSummary {
  branchId: string;
  name: string;
  revenue: number;
  expenses: number;
  payroll: number;
  profit: number;
  attendanceRate: number;
}

export class BranchEngine {
  calculateBranchMetrics(facts: BusinessFact[]) {
    const branchIds = Array.from(new Set(facts.map(f => f.branchId).filter(Boolean))) as string[];
    const branches: Record<string, BranchSummary> = {};

    branchIds.forEach(branchId => {
      const branchFacts = facts.filter(f => f.branchId === branchId);

      const revenue = branchFacts
        .filter(f => f.type === 'transaction' && (f.category === 'INCOME' || f.metadata.type === 'INCOME'))
        .reduce((sum, f) => sum + f.amount, 0);

      const expenses = branchFacts
        .filter(f => f.type === 'transaction' && (f.category === 'EXPENSE' || f.metadata.type === 'EXPENSE'))
        .reduce((sum, f) => sum + f.amount, 0);

      const payroll = branchFacts
        .filter(f => f.type === 'payroll' || f.category === 'PAYROLL')
        .reduce((sum, f) => sum + f.amount, 0);

      const profit = revenue - expenses - payroll;

      const attFacts = branchFacts.filter(f => f.type === 'attendance');
      let attendanceRate = 100;
      if (attFacts.length > 0) {
        const present = attFacts.filter(f => f.metadata.status === 'PRESENT' || f.metadata.status === 'present' || f.metadata.isPresent === true).length;
        attendanceRate = (present / attFacts.length) * 100;
      }

      const branchName = branchFacts[0]?.metadata?.branchName || `Succursale ${branchId.substring(0, 5)}`;

      branches[branchId] = {
        branchId,
        name: branchName,
        revenue,
        expenses,
        payroll,
        profit,
        attendanceRate
      };
    });

    const ranking = Object.values(branches).sort((a, b) => b.profit - a.profit);

    return {
      count: branchIds.length,
      branches: ranking,
      highestPerforming: ranking[0] || null
    };
  }
}
