import { BusinessFact } from '../types';
import { resolveDepartmentName } from '../../../utils/nameResolvers';

export interface DepartmentSummary {
  departmentId: string;
  name: string;
  revenue: number;
  expenses: number;
  payroll: number;
  netMargin: number; // profit margin as percentage of revenue
  profit: number;
}

export class DepartmentEngine {
  calculateDepartmentMetrics(facts: BusinessFact[], departmentsList: any[] = []) {
    const departmentIds = Array.from(new Set(facts.map(f => f.departmentId).filter(Boolean))) as string[];
    const departments: Record<string, DepartmentSummary> = {};

    departmentIds.forEach(deptId => {
      const deptFacts = facts.filter(f => f.departmentId === deptId);

      const revenue = deptFacts
        .filter(f => f.type === 'transaction' && (f.category === 'INCOME' || f.metadata.type === 'INCOME'))
        .reduce((sum, f) => sum + f.amount, 0);

      const expenses = deptFacts
        .filter(f => f.type === 'transaction' && (f.category === 'EXPENSE' || f.metadata.type === 'EXPENSE'))
        .reduce((sum, f) => sum + f.amount, 0);

      const payroll = deptFacts
        .filter(f => f.type === 'payroll' || f.category === 'PAYROLL')
        .reduce((sum, f) => sum + f.amount, 0);

      const profit = revenue - expenses - payroll;
      const netMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

      const deptFactsName = deptFacts[0]?.metadata?.departmentName;
      const deptName = resolveDepartmentName(deptId, deptFactsName, departmentsList);

      departments[deptId] = {
        departmentId: deptId,
        name: deptName,
        revenue,
        expenses,
        payroll,
        netMargin,
        profit
      };
    });

    const ranking = Object.values(departments).sort((a, b) => b.profit - a.profit);

    return {
      count: departmentIds.length,
      departments: ranking,
      highestProfitable: ranking[0] || null
    };
  }
}
